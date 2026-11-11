// D218: the voice on an own-number call. Tuwa brought its own phone agent; a call from the
// owner's phone needs Ducter to speak and listen itself, in real time. One speech-to-speech model
// over a WebSocket does all of it (hearing, thinking, speaking, barge-in, tool calls), which keeps
// a turn well under a second; an ASR → LLM → TTS chain adds a hop per stage (research/63 §3).
//
// Two engines speak the same event protocol: OpenAI's Realtime API (gpt-realtime-2.1, the GA
// shape) for most of the world, and Alibaba's Qwen-Omni-Realtime (DashScope, the older beta
// shape) where OpenAI isn't offered, mainland China first. The client reads both shapes' event
// names. Only fakes have run it (test/own-phone.test.ts); research/63 §6 lists what a real key must
// confirm.
//
// The model has three tools: ask_owner (a question only the owner can answer: the call's question
// card), press_keys (a phone menu: keypad digits on the phone) and end_call (the outcome in its
// own words, then Ducter hangs up). Nothing is recorded: the text transcript is the record.
import { b64ToPcm, pcmToB64, type AudioBridge } from "./audio.ts";

export type Engine = "openai" | "qwen";

export interface EngineInfo {
  engine: Engine;
  model: string;
  /** Where the WebSocket goes (a test passes its fake server). */
  url: string;
  inRate: number;
  outRate: number;
  /** The card's estimate, USD per talking minute (research/63 §3: tokens per minute × list price). */
  perMinUsd: number;
  /** List prices, USD per 1M tokens, when known (cost from the usage the engine reports). */
  price?: { audioIn: number; audioCached: number; audioOut: number; textIn: number; textOut: number };
  voice: string;
}

export function engineInfo(engine: Engine, model?: string, url?: string): EngineInfo {
  if (engine === "qwen") {
    const m = model ?? "qwen3-omni-flash-realtime";
    return { engine, model: m, url: url ?? `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=${m}`, inRate: 16000, outRate: 24000, perMinUsd: 0.05, voice: "Cherry" };
  }
  const m = model ?? "gpt-realtime-2.1";
  const mini = /mini/.test(m);
  return {
    engine,
    model: m,
    url: url ?? `wss://api.openai.com/v1/realtime?model=${m}`,
    inRate: 24000,
    outRate: 24000,
    perMinUsd: mini ? 0.06 : 0.2,
    price: mini ? { audioIn: 10, audioCached: 0.3, audioOut: 20, textIn: 0.6, textOut: 2.4 } : { audioIn: 32, audioCached: 0.4, audioOut: 64, textIn: 4, textOut: 24 },
    voice: "marin",
  };
}

export interface CallBrief {
  partner: string;
  forName: string;
  to: string;
  name: string;
  goal: string;
  say: string[];
  keep?: string;
  alternatives?: string;
  mustNot: string[];
  context: { text: string; source: string }[];
  language?: string;
  maxMinutes: number;
}

/** The instructions the voice model gets for one call: the plan the owner approved, and Ducter's rules. */
export function instructionsFor(b: CallBrief): string {
  const lang = b.language ? `Speak ${b.language}.` : "Speak the language the person on the line speaks; start in the language of the number's country unless the goal says otherwise.";
  return [
    `You are ${b.partner}, ${b.forName}'s AI assistant, on a phone call to ${b.name} (${b.to}) from ${b.forName}'s own phone number.`,
    `The one thing this call is for: ${b.goal}`,
    b.say.length ? `You may tell them: ${b.say.join("; ")}.` : "Share nothing about the person beyond what the goal needs.",
    b.keep ? `Use this to decide, but never say it: ${b.keep}.` : "",
    b.alternatives ? `Acceptable alternatives: ${b.alternatives}.` : "",
    ...b.context.map((c) => c.text),
    "Rules you never break:",
    ...b.mustNot.map((m) => `- ${m}`),
    "- Speak like a polite, brief person on the phone: short sentences, one question at a time, and let them finish.",
    "- If they ask something only the person can answer, say you'll check, then call ask_owner with the question (and likely answers). While you wait, say a short 'one moment' if the pause gets long. Never invent the answer.",
    "- An automated menu (press 1 for…): call press_keys with the digits that reach a human or the right department. Never press digits that pay, agree to a charge or share anything.",
    "- Voicemail, an answering machine, call screening or 'not available': do not leave a message; call end_call with state automated and what it said.",
    `- When it's done, or after ${b.maxMinutes} minutes, say goodbye politely and call end_call with the outcome, exactly what was agreed, in plain words.`,
    lang,
  ]
    .filter(Boolean)
    .join("\n");
}

const TOOLS = [
  {
    type: "function",
    name: "ask_owner",
    description: "Ask the person you're calling for a question only they can answer. Returns their answer.",
    parameters: { type: "object", properties: { question: { type: "string" }, choices: { type: "array", items: { type: "string" } }, yes_no: { type: "boolean" } }, required: ["question"] },
  },
  {
    type: "function",
    name: "press_keys",
    description: "Press keypad digits on the phone (an automated menu).",
    parameters: { type: "object", properties: { digits: { type: "string", description: "0-9, * and #" } }, required: ["digits"] },
  },
  {
    type: "function",
    name: "end_call",
    description: "End the call after saying goodbye. state: done (got an answer), uncertain (couldn't confirm), automated (a machine answered), no_answer.",
    parameters: {
      type: "object",
      properties: { state: { type: "string", enum: ["done", "uncertain", "automated", "no_answer"] }, outcome: { type: "string" }, agreed: { type: "array", items: { type: "string" } } },
      required: ["state", "outcome"],
    },
  },
];

export interface LoopEvents {
  ask(q: { id: string; text: string; choices: string[]; yesNo: boolean }): void;
  press(digits: string): Promise<boolean>;
  end(r: { state: "done" | "uncertain" | "automated" | "no_answer"; outcome: string; agreed: string[] }): void;
  /** The engine refused or dropped the session (a bad key, no credit): the call can't go on. */
  fail(why: string): void;
}

type Ws = { send(s: string): void; close(): void; readyState: number; onopen: unknown; onmessage: unknown; onclose: unknown; onerror: unknown };

/** One call's voice: a WebSocket session to the engine, wired to the audio bridge. */
export class VoiceLoop {
  readonly transcript: { who: "them" | "agent"; text: string }[] = [];
  private ws?: Ws;
  private live = false;
  private speaking?: string; // the assistant item whose audio is playing
  private usage = { audioIn: 0, audioCached: 0, audioOut: 0, textIn: 0, textOut: 0 };
  private textWaiter?: (s: string) => void;
  private answered = new Set<string>();
  private opened = false;
  private ended = false;

  constructor(
    private info: EngineInfo,
    private key: string,
    private audio: AudioBridge,
    private instructions: string,
    private on: LoopEvents,
    private makeWs: (url: string, headers: Record<string, string>) => Ws = (url, headers) => new WebSocket(url, { headers } as unknown as string[]) as unknown as Ws,
  ) {}

  private send(e: Record<string, unknown>) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(e));
  }

  /** Opens the session (at dial time, so it is warm when they pick up). */
  connect(timeoutMs = 10_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = this.makeWs(this.info.url, { Authorization: `Bearer ${this.key}` });
      this.ws = ws;
      const t = setTimeout(() => reject(new Error("the voice engine didn't answer")), timeoutMs);
      let ready = false;
      ws.onopen = () => this.send(this.sessionUpdate());
      ws.onerror = () => {
        if (!ready) clearTimeout(t), reject(new Error("couldn't reach the voice engine"));
      };
      ws.onclose = () => {
        if (!ready) clearTimeout(t), reject(new Error("the voice engine closed the connection"));
        else if (this.live && !this.ended) this.on.fail("the voice engine closed the connection mid-call");
      };
      ws.onmessage = (m: { data: unknown }) => {
        let e: Record<string, any>;
        try {
          e = JSON.parse(String(m.data));
        } catch {
          return;
        }
        if (e.type === "session.updated" && !ready) {
          ready = true;
          clearTimeout(t);
          resolve();
        } else if (e.type === "error" && !ready) {
          clearTimeout(t);
          reject(new Error(String(e.error?.message ?? "the voice engine refused the session")));
        } else this.event(e);
      };
    });
  }

  private sessionUpdate() {
    const i = this.info;
    if (i.engine === "qwen")
      return {
        type: "session.update",
        session: { modalities: ["text", "audio"], voice: i.voice, instructions: this.instructions, input_audio_format: "pcm16", output_audio_format: "pcm24", turn_detection: { type: "server_vad", threshold: 0.5, silence_duration_ms: 600 }, input_audio_transcription: { model: "gummy-realtime-v1" }, tools: TOOLS },
      };
    return {
      type: "session.update",
      session: {
        type: "realtime",
        model: i.model,
        instructions: this.instructions,
        output_modalities: ["audio"],
        audio: {
          input: { format: { type: "audio/pcm", rate: i.inRate }, turn_detection: { type: "semantic_vad", interrupt_response: true, create_response: true }, transcription: { model: "gpt-4o-mini-transcribe" }, noise_reduction: { type: "near_field" } },
          output: { format: { type: "audio/pcm", rate: i.outRate }, voice: i.voice },
        },
        tools: TOOLS,
        tool_choice: "auto",
      },
    };
  }

  /** They picked up: the line's audio flows to the engine, and Ducter opens the call. */
  async begin(openAfterMs = 1200) {
    if (this.live) return;
    this.live = true;
    await this.audio.start((pcm) => this.send({ type: "input_audio_buffer.append", audio: pcmToB64(pcm) }));
    // Most people say hello first; the engine answers that turn itself. If they don't, open anyway.
    setTimeout(() => {
      if (!this.opened && !this.ended) this.send({ type: "response.create" });
    }, openAfterMs);
  }

  private event(e: Record<string, any>) {
    switch (e.type) {
      case "response.created":
        this.opened = true;
        return;
      case "response.output_audio.delta":
      case "response.audio.delta":
        this.speaking = e.item_id ?? this.speaking;
        this.audio.play(b64ToPcm(String(e.delta ?? "")));
        return;
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done":
        if (e.transcript) this.transcript.push({ who: "agent", text: String(e.transcript) });
        return;
      case "conversation.item.input_audio_transcription.completed":
        this.opened = true;
        if (e.transcript && String(e.transcript).trim()) this.transcript.push({ who: "them", text: String(e.transcript).trim() });
        return;
      case "input_audio_buffer.speech_started":
        // Barge-in: stop talking at once, and tell the engine how much of its turn was heard.
        this.opened = true;
        if (this.speaking) {
          const ms = this.audio.playedMs();
          this.audio.clear();
          this.send({ type: "conversation.item.truncate", item_id: this.speaking, content_index: 0, audio_end_ms: ms });
          this.speaking = undefined;
        }
        return;
      case "response.output_text.done":
      case "response.text.done":
        this.textWaiter?.(String(e.text ?? ""));
        return;
      case "response.function_call_arguments.done":
        return void this.tool(String(e.call_id ?? ""), String(e.name ?? ""), String(e.arguments ?? "{}"));
      case "response.output_item.done":
        if (e.item?.type === "function_call") return void this.tool(String(e.item.call_id ?? ""), String(e.item.name ?? ""), String(e.item.arguments ?? "{}"));
        return;
      case "response.done": {
        const u = e.response?.usage;
        if (u) {
          const inD = u.input_token_details ?? {};
          const outD = u.output_token_details ?? {};
          this.usage.audioCached += Number(inD.cached_tokens_details?.audio_tokens ?? 0);
          this.usage.audioIn += Math.max(0, Number(inD.audio_tokens ?? 0) - Number(inD.cached_tokens_details?.audio_tokens ?? 0));
          this.usage.textIn += Number(inD.text_tokens ?? 0);
          this.usage.audioOut += Number(outD.audio_tokens ?? 0);
          this.usage.textOut += Number(outD.text_tokens ?? 0);
        }
        return;
      }
      case "error":
        if (/insufficient_quota|invalid_api_key|billing|unauthorized/i.test(JSON.stringify(e.error ?? {}))) this.on.fail(String(e.error?.message ?? "the voice engine refused the key"));
        return;
    }
  }

  private seen = new Set<string>();
  private async tool(callId: string, name: string, args: string) {
    if (!callId || this.seen.has(callId)) return;
    this.seen.add(callId);
    let a: Record<string, any> = {};
    try {
      a = JSON.parse(args || "{}");
    } catch {}
    if (name === "ask_owner") {
      const choices = Array.isArray(a.choices) ? a.choices.map(String).slice(0, 4) : [];
      return this.on.ask({ id: callId, text: String(a.question ?? ""), choices, yesNo: a.yes_no === true });
    }
    if (name === "press_keys") {
      const d = String(a.digits ?? "").replace(/[^0-9*#]/g, "");
      const ok = d ? await this.on.press(d).catch(() => false) : false;
      return this.output(callId, ok ? `pressed ${d}` : "could not press those keys");
    }
    if (name === "end_call") {
      this.ended = true;
      const state = ["done", "uncertain", "automated", "no_answer"].includes(a.state) ? a.state : "uncertain";
      return this.on.end({ state, outcome: String(a.outcome ?? ""), agreed: Array.isArray(a.agreed) ? a.agreed.map(String) : [] });
    }
    this.output(callId, "unknown tool");
  }

  private output(callId: string, output: string) {
    this.send({ type: "conversation.item.create", item: { type: "function_call_output", call_id: callId, output } });
    this.send({ type: "response.create" });
  }

  /** The owner's answer to ask_owner (or the fixed call-back line after 90 s). */
  answer(id: string, text: string): boolean {
    if (this.answered.has(id)) return false;
    this.answered.add(id);
    this.output(id, text);
    return true;
  }

  /** After the line drops without end_call: one short text turn for the outcome. */
  async summarize(timeoutMs = 8000): Promise<{ state: "done" | "uncertain" | "automated" | "no_answer"; outcome: string; agreed: string[] } | undefined> {
    if (!this.ws || this.ws.readyState !== 1) return undefined;
    const text = new Promise<string>((r) => {
      this.textWaiter = r;
      setTimeout(() => r(""), timeoutMs);
    });
    const ask = 'The call has ended. Reply with JSON only: {"state":"done|uncertain|automated|no_answer","outcome":"one line, what really happened","agreed":["..."]}. Say uncertain unless an answer was clearly given.';
    this.send(this.info.engine === "qwen" ? { type: "response.create", response: { modalities: ["text"], instructions: ask } } : { type: "response.create", response: { output_modalities: ["text"], instructions: ask } });
    const s = await text;
    const m = /\{[\s\S]*\}/.exec(s);
    if (!m) return undefined;
    try {
      const j = JSON.parse(m[0]);
      return { state: ["done", "uncertain", "automated", "no_answer"].includes(j.state) ? j.state : "uncertain", outcome: String(j.outcome ?? ""), agreed: Array.isArray(j.agreed) ? j.agreed.map(String) : [] };
    } catch {
      return undefined;
    }
  }

  /** What the engine charged, from the usage it reported; undefined when it reported none. */
  costUsd(): number | undefined {
    const p = this.info.price;
    const u = this.usage;
    if (!p || u.audioIn + u.audioOut + u.textIn + u.textOut + u.audioCached === 0) return undefined;
    return (u.audioIn * p.audioIn + u.audioCached * p.audioCached + u.audioOut * p.audioOut + u.textIn * p.textIn + u.textOut * p.textOut) / 1e6;
  }

  async close() {
    this.ended = true;
    this.live = false;
    await this.audio.stop().catch(() => undefined);
    try {
      this.ws?.close();
    } catch {}
  }
}
