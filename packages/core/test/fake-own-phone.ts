// D218: a fake Android phone (what adb answers) and a fake real-time voice engine (the Realtime
// event protocol over a real WebSocket), for own-phone.test.ts. No phone, sound card or key.
import type { Exec } from "../src/phone-own/adb.ts";

/** Precise call states as Android prints them (telephony.registry). */
const LINE = (fg: number, ring = 0, call = 0) => `    mCallState=${call}\n    mPreciseCallState=Ringing call state: ${ring}, Foreground call state: ${fg}, Background call state: 0, Disconnect cause: -1, Precise disconnect cause: -1\n`;

export interface FakePhone {
  exec: Exec;
  /** Every argv adb was asked to run (the safety test reads it). */
  argv: string[][];
  dialed: string[];
  keys: string[];
  /** The callee picks up / hangs up / doesn't answer. */
  answer(): void;
  hangUpRemote(): void;
  /** The owner is on their own call (Ducter must wait). */
  ownerCall(on: boolean): void;
  ringIn(on: boolean): void;
  state: "idle" | "dialing" | "alerting" | "active" | "ended";
  authorized: boolean;
  headset: boolean;
  autoAnswerAfterReads?: number;
}

export function fakePhone(o: { model?: string; carrier?: string; sim?: string } = {}): FakePhone {
  let reads = 0;
  let owner = false;
  let ringing = false;
  const p: FakePhone = {
    argv: [],
    dialed: [],
    keys: [],
    state: "idle",
    authorized: true,
    headset: true,
    answer: () => void (p.state = "active"),
    hangUpRemote: () => void (p.state = "ended"),
    ownerCall: (on) => void (owner = on),
    ringIn: (on) => void (ringing = on),
    async exec(args) {
      p.argv.push(args);
      if (args[0] === "devices") return { code: 0, out: `List of devices attached\nR5CT30ABCDE            ${p.authorized ? "device" : "unauthorized"} usb:1-1 product:panther model:${o.model ?? "Pixel_7"} device:panther transport_id:2\n\n`, err: "" };
      const sh = args.slice(3);
      if (sh[0] === "getprop") {
        const v: Record<string, string> = { "ro.product.model": (o.model ?? "Pixel_7").replace("_", " "), "ro.build.version.release": "15", "gsm.sim.state": o.sim ?? "READY", "gsm.sim.operator.alpha": o.carrier ?? "China Mobile", "gsm.operator.alpha": o.carrier ?? "China Mobile" };
        return { code: 0, out: `${v[sh[1]!] ?? ""}\n`, err: "" };
      }
      if (sh[0] === "dumpsys" && sh[1] === "telephony.registry") {
        reads++;
        if (p.state === "dialing" && p.autoAnswerAfterReads !== undefined && reads >= p.autoAnswerAfterReads) p.state = "active";
        if (owner) return { code: 0, out: LINE(1, 0, 2), err: "" };
        if (ringing && p.state === "idle") return { code: 0, out: LINE(0, 5, 1), err: "" };
        const fg = { idle: 0, dialing: 3, alerting: 4, active: 1, ended: 7 }[p.state];
        return { code: 0, out: `  some other line\n${LINE(fg, 0, p.state === "idle" || p.state === "ended" ? 0 : 2)}  mCellIdentity=...\n`, err: "" };
      }
      if (sh[0] === "dumpsys" && sh[1] === "audio") {
        return { code: 0, out: `Audio event log:\n  mConnectedDevices:\n    ${p.headset ? "DEVICE_OUT_WIRED_HEADSET\n    DEVICE_IN_WIRED_HEADSET" : "DEVICE_OUT_SPEAKER"}\n- STREAM_VOICE_CALL:\n   Devices: ${p.headset ? "headset(4)" : "earpiece(1)"}\n`, err: "" };
      }
      if (sh[0] === "am" && sh.includes("android.intent.action.CALL")) {
        p.dialed.push(sh[sh.length - 1]!.replace(/^tel:/, ""));
        reads = 0;
        p.state = "dialing";
        return { code: 0, out: "Starting: Intent { act=android.intent.action.CALL dat=tel:xxxxxxxx }\n", err: "" };
      }
      if (sh[0] === "input" && sh[1] === "keyevent") {
        p.keys.push(sh[2]!);
        if (sh[2] === "KEYCODE_ENDCALL" && p.state !== "idle") p.state = "ended";
        return { code: 0, out: "", err: "" };
      }
      return { code: 1, out: "", err: "not allowed in the fake" };
    },
  };
  return p;
}

/**
 * A fake Realtime engine. Script: after the session opens and the call begins, the agent speaks
 * the opening; on the callee's first words it asks the owner a question (ask_owner); when the
 * answer comes back it speaks once more and calls end_call with the outcome.
 */
export function fakeVoice(o: { key?: string; askFirst?: boolean; outcome?: string } = {}) {
  const seen: Record<string, any>[] = [];
  let sock: { send(s: string): void } | undefined;
  const pcm = Buffer.alloc(4800, 1).toString("base64"); // 100 ms of near-silence
  let n = 0;
  const say = (text: string) => {
    const id = `item_${++n}`;
    sock!.send(JSON.stringify({ type: "response.created", response: { id: `r_${n}` } }));
    sock!.send(JSON.stringify({ type: "response.output_audio.delta", item_id: id, delta: pcm }));
    sock!.send(JSON.stringify({ type: "response.output_audio_transcript.done", item_id: id, transcript: text }));
    sock!.send(JSON.stringify({ type: "response.done", response: { usage: { input_token_details: { audio_tokens: 600, text_tokens: 800, cached_tokens_details: { audio_tokens: 0 } }, output_token_details: { audio_tokens: 300, text_tokens: 20 } } } }));
  };
  const server = Bun.serve({
    port: 0,
    fetch(req, srv) {
      const auth = req.headers.get("authorization");
      if (auth !== `Bearer ${o.key ?? "sk-test-0123456789abcdefghij"}`) return new Response("bad key", { status: 401 });
      return srv.upgrade(req) ? undefined : new Response("no", { status: 400 });
    },
    websocket: {
      open(ws) {
        sock = ws;
      },
      message(ws, m) {
        const e = JSON.parse(String(m));
        seen.push(e);
        if (e.type === "session.update") ws.send(JSON.stringify({ type: "session.updated", session: e.session }));
        else if (e.type === "response.create" && e.response?.output_modalities?.[0] === "text") ws.send(JSON.stringify({ type: "response.output_text.done", text: JSON.stringify({ state: "uncertain", outcome: "the line dropped before anything was agreed", agreed: [] }) }));
        else if (e.type === "response.create" && seen.filter((x) => x.type === "response.create").length === 1) {
          say("您好，我是 Ducter，Wey 的 AI 助理，替 TA 打这个电话。");
          if (o.askFirst !== false) {
            ws.send(JSON.stringify({ type: "conversation.item.input_audio_transcription.completed", transcript: "可以，几位？要包间吗？" }));
            ws.send(JSON.stringify({ type: "response.function_call_arguments.done", call_id: "call_ask_1", name: "ask_owner", arguments: JSON.stringify({ question: "要包间吗？", yes_no: true }) }));
          } else ws.send(JSON.stringify({ type: "response.function_call_arguments.done", call_id: "call_end_1", name: "end_call", arguments: JSON.stringify({ state: "done", outcome: o.outcome ?? "booked", agreed: [] }) }));
        } else if (e.type === "conversation.item.create" && e.item?.type === "function_call_output" && e.item.call_id === "call_ask_1") {
          say("要包间，谢谢。");
          ws.send(JSON.stringify({ type: "response.function_call_arguments.done", call_id: "call_end_1", name: "end_call", arguments: JSON.stringify({ state: "done", outcome: o.outcome ?? "订好了：周六 19:00，4 位，包间", agreed: ["周六 19:00", "4 位", "包间"] }) }));
        }
      },
    },
  });
  return { url: `ws://localhost:${server.port}/v1/realtime?model=gpt-realtime-2.1`, seen, stop: () => server.stop(true) };
}
