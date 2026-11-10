// The calling connection's provider (D189 (1), D193): a small adapter between Ducter's call flow
// (phone.ts) and one provider's MCP tools. Tuwa is the first and only one in v1; a self-built
// Twilio + real-time-model path would be a second CallProvider behind the same card.
//
// Tuwa's tool names and input schemas are as its server listed them to a signed-in Ducter on
// 2026-11-11 (research/53 §8): every call tool takes `taskId`; tuwa_call_reply takes a decision
// (accept / decline / text); the daily cap is dailyLimitCents. Arguments are still built from each
// tool's own inputSchema (the first candidate name the schema lists), so a renamed field degrades
// to the documented name instead of breaking. The ANSWERS were not seen (no call was placed), so
// they are read by several likely field names; design/phone.md §9 lists what to check.
import type { LinkResult, LinkTool } from "./connections.ts";

/** How the adapter reaches the provider: one tool call, and a tool's schema (from tools/list). */
export interface ProviderIo {
  call(tool: string, args: Record<string, unknown>): Promise<LinkResult>;
  schema(tool: string): unknown;
}

export interface DraftInput {
  to: string;
  voice?: "ducter" | "owner";
  at?: string; // ISO with offset: when Tuwa dials (Ducter's rails chose it)
  name: string;
  goal: string;
  say: string[];
  keep?: string;
  alternatives?: string;
  mustNot: string[]; // the owner's and Ducter's, together
  context: { text: string; source: string }[];
  language?: string;
}

export type ProviderFail = { ok: false; reason: "payment" | "balance" | "cap" | "provider"; error: string; payUrl?: string };
export type DraftOut = { ok: true; id: string; ready: true } | { ok: true; id: string; ready: false; questions: string[] } | ProviderFail;
export type ApprovalOut = { ok: true; confirmationId: string; summary: string; minutes?: number; costUsd?: number } | ProviderFail;
export type StatusOut = {
  phase: "waiting" | "calling" | "talking" | "finished" | "unknown";
  question?: { text: string; token: string; choices: string[]; yesNo: boolean };
  durationSec?: number;
};
export interface ResultOut {
  state: "done" | "uncertain" | "no_answer" | "failed";
  outcome?: string;
  summary?: string;
  agreed?: string[];
  transcript?: { who: "them" | "agent"; text: string }[];
  durationSec?: number;
  costUsd?: number;
}

export interface CallProvider {
  name: string;
  /** The tools that are this provider's call flow: only phone.ts may run them (never connection_call). */
  reserved: Set<string>;
  matches(tools: LinkTool[]): boolean;
  draft(io: ProviderIo, d: DraftInput): Promise<DraftOut>;
  answer(io: ProviderIo, id: string, answers: string): Promise<DraftOut>;
  requestApproval(io: ProviderIo, id: string): Promise<ApprovalOut>;
  confirm(io: ProviderIo, confirmationId: string, approve: boolean, words: string): Promise<{ ok: true; id?: string } | ProviderFail>;
  status(io: ProviderIo, id: string): Promise<StatusOut>;
  /** yesNo: the question takes accept / decline ("yes" / "no" from the owner), else their words. */
  reply(io: ProviderIo, id: string, token: string, text: string, yesNo?: boolean): Promise<boolean>;
  result(io: ProviderIo, id: string): Promise<ResultOut>;
  cancel(io: ProviderIo, id: string): Promise<boolean>;
  /** At connect (D193): lower the provider's own daily cap, name the phone agent, voice sampling and Friends sync off. Best effort. */
  setup(io: ProviderIo, o: { capUsd: number; agentName: string }): Promise<{ cap: boolean; name: boolean; sampling: boolean; shared: boolean }>;
  /** The owner changes the cap on the phone card: lowering applies at once; raising needs the provider's confirmation (the tap is the yes). */
  setCap(io: ProviderIo, usd: number): Promise<{ ok: true; confirmationId?: string } | ProviderFail>;
  voice(io: ProviderIo): Promise<{ enrolled: boolean; on: boolean } | undefined>;
  voiceChange(io: ProviderIo, action: "record" | "on" | "off" | "delete"): Promise<{ ok: true; url?: string; confirmationId?: string; summary?: string } | { ok: false; reason: "no_voice" | "provider"; url?: string; error?: string }>;
}

// ---------- reading answers whose exact shape we haven't seen ----------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
/** The object to read from: the answer itself, or its `data` / `result` envelope. */
const body = (r: LinkResult): Obj => {
  const d = r.data;
  if (isObj(d)) {
    const inner = isObj(d.data) ? d.data : isObj(d.result) ? d.result : undefined;
    return inner ? { ...inner, ...d } : d;
  }
  return typeof d === "string" ? { text: d } : {};
};
/** The first field with one of these names, at the top or one level down. */
function pick(o: Obj, names: string[]): unknown {
  for (const n of names) if (o[n] !== undefined && o[n] !== null && o[n] !== "") return o[n];
  for (const v of Object.values(o)) if (isObj(v)) for (const n of names) if (v[n] !== undefined && v[n] !== null && v[n] !== "") return v[n];
  return undefined;
}
const pickStr = (o: Obj, names: string[]) => {
  const v = pick(o, names);
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined;
};
const pickNum = (o: Obj, names: string[]) => {
  const v = pick(o, names);
  const n = typeof v === "string" ? Number(v.replace(/[^0-9.]/g, "")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : isObj(x) ? String(x.text ?? x.question ?? x.label ?? x.value ?? "") : "")).filter(Boolean) : typeof v === "string" && v ? [v] : [];
/** The state word of an answer: `status`, `state`, `result`, `outcome`. */
const word = (o: Obj) => (pickStr(o, ["status", "state", "phase", "result"]) ?? "").toLowerCase();

/** The provider said no: a payment gate, its own cap, or an error, in plain words. */
function failOf(r: LinkResult): ProviderFail | undefined {
  const o = body(r);
  const w = `${word(o)} ${pickStr(o, ["error", "code"]) ?? ""}`.toLowerCase();
  const url = pickStr(o, ["setupUrl", "checkoutUrl", "paymentUrl", "url"]);
  if (/payment_method_required/.test(w)) return { ok: false, reason: "payment", error: "a card needs saving first", ...(url ? { payUrl: url } : {}) };
  if (/prepaid_balance_low|balance/.test(w)) return { ok: false, reason: "balance", error: "no prepaid minutes left and no card saved", ...(url ? { payUrl: url } : {}) };
  if (/spend|limit|cap/.test(w) && /exceed|reach|over|limit_reached|cap/.test(w)) return { ok: false, reason: "cap", error: "the provider's daily limit is reached" };
  const errored = r.isError || o.ok === false || /^error|failed|invalid|unsupported/.test(word(o));
  if (errored) return { ok: false, reason: "provider", error: (pickStr(o, ["message", "error_description", "error", "text"]) ?? "the provider refused").slice(0, 300) };
  return undefined;
}

/**
 * Arguments for a tool: each field goes under the first of its candidate names the tool's schema
 * lists; when the schema lists no properties (or none of the names), under the first name.
 */
export function argsFor(schema: unknown, fields: Record<string, { names: string[]; value: unknown }>): Record<string, unknown> {
  const props = isObj(schema) && isObj(schema.properties) ? Object.keys(schema.properties) : [];
  const out: Record<string, unknown> = {};
  for (const f of Object.values(fields)) {
    if (f.value === undefined || (Array.isArray(f.value) && !f.value.length) || f.value === "") continue;
    const name = f.names.find((n) => props.includes(n)) ?? (props.length ? undefined : f.names[0]);
    if (name) out[name] = f.value;
    else out[f.names[0]!] = f.value; // the schema doesn't name it: the documented name
  }
  return out;
}
/** Only the fields the schema really lists (for writes Ducter makes on its own, never guessed). */
function argsIfListed(schema: unknown, fields: Record<string, { names: string[]; value: unknown }>): Record<string, unknown> | undefined {
  const props = isObj(schema) && isObj(schema.properties) ? Object.keys(schema.properties) : [];
  const out: Record<string, unknown> = {};
  for (const f of Object.values(fields)) {
    const name = f.names.find((n) => props.includes(n));
    if (name) out[name] = f.value;
  }
  return Object.keys(out).length ? out : undefined;
}

const ID = ["taskId", "callId", "call_id", "draftId", "draft_id", "id"];

function draftOut(r: LinkResult, prevId?: string): DraftOut {
  const f = failOf(r);
  if (f) return f;
  const o = body(r);
  const id = pickStr(o, ID) ?? prevId;
  if (!id) return { ok: false, reason: "provider", error: "the provider gave no call id" };
  if (/needs_input|needs-input|question/.test(word(o)) || Array.isArray(o.questions)) {
    const qs = strs(pick(o, ["questions"]));
    if (qs.length || /needs_input/.test(word(o))) return { ok: true, id, ready: false, questions: qs.length ? qs : [pickStr(o, ["message", "text"]) ?? "The provider needs one more detail."] };
  }
  return { ok: true, id, ready: true };
}

// ---------- Tuwa ----------

const T = {
  draft: "tuwa_call_draft",
  answer: "tuwa_call_answer",
  approval: "tuwa_call_request_approval",
  revise: "tuwa_call_revise",
  confirm: "tuwa_confirm",
  status: "tuwa_call_status",
  reply: "tuwa_call_reply",
  result: "tuwa_call_result",
  cancel: "tuwa_call_cancel",
  settings: "tuwa_settings",
  change: "tuwa_settings_request_change",
  limit: "tuwa_spending_limit",
};

export const tuwa: CallProvider = {
  name: "Tuwa",
  // The call flow and the settings that need the person's yes: only through phone.ts and its cards.
  reserved: new Set([T.draft, T.answer, T.approval, T.revise, T.confirm, T.reply, T.cancel, T.change, T.limit, T.settings, "tuwa_voice_set", "tuwa_topup", "tuwa_own_phone_set", "tuwa_answering_set", "tuwa_invite", "tuwa_memory", "tuwa_contacts", "tuwa_shared_ai", "tuwa_connected_agents", "tuwa_account"]),
  matches: (tools) => tools.some((t) => t.name === T.draft) && tools.some((t) => t.name === T.confirm),

  async draft(io, d) {
    const r = await io.call(
      T.draft,
      argsFor(io.schema(T.draft), {
        to: { names: ["to", "phone", "number"], value: d.to },
        name: { names: ["recipientName", "recipient", "name"], value: d.name },
        goal: { names: ["goal"], value: d.goal },
        say: { names: ["shareable"], value: d.say },
        keep: { names: ["privateGuidance"], value: d.keep },
        alt: { names: ["alternatives"], value: d.alternatives ? [d.alternatives] : undefined },
        mustNot: { names: ["mustNot"], value: d.mustNot.slice(0, 12) },
        context: { names: ["context"], value: d.context.map((c) => ({ fact: c.text.slice(0, 300), source: c.source })) },
        voice: { names: ["voice"], value: d.voice === "owner" ? "personal" : "built_in" },
        // v1 calls only from a Tuwa number (D189 (11)): never the owner's phone or a desktop app.
        dialer: { names: ["dialer"], value: "tuwa" },
        mode: { names: ["mode"], value: "agent" },
        at: { names: ["scheduledAt"], value: d.at },
      }),
    );
    return draftOut(r);
  },

  async answer(io, id, answers) {
    const r = await io.call(T.answer, argsFor(io.schema(T.answer), { id: { names: ID, value: id }, a: { names: ["answers", "answer", "text"], value: [{ answer: answers.slice(0, 500), confirmedByPerson: true }] } }));
    return draftOut(r, id);
  },

  async requestApproval(io, id) {
    const r = await io.call(T.approval, argsFor(io.schema(T.approval), { id: { names: ID, value: id } }));
    const f = failOf(r);
    if (f) return f;
    const o = body(r);
    const confirmationId = pickStr(o, ["confirmationId", "confirmation_id", "confirmation"]);
    if (!confirmationId) return { ok: false, reason: "provider", error: "the provider gave no confirmation to ask about" };
    const summary = pickStr(o, ["summary", "text", "message"]) ?? "";
    const minutes = pickNum(o, ["estimatedMinutes", "estimateMinutes", "minutes"]);
    const costUsd = pickNum(o, ["estimatedCostUsd", "estimatedCost", "estimateUsd", "costUsd"]);
    return { ok: true, confirmationId, summary, ...(minutes ? { minutes } : {}), ...(costUsd ? { costUsd } : {}) };
  },

  async confirm(io, confirmationId, approve, words) {
    const r = await io.call(
      T.confirm,
      argsFor(io.schema(T.confirm), {
        c: { names: ["confirmationId", "confirmation_id"], value: confirmationId },
        d: { names: ["decision", "approve"], value: approve ? "approve" : "decline" },
        w: { names: ["personReply", "reply", "words"], value: words },
      }),
    );
    const f = failOf(r);
    if (f) return f;
    const id = pickStr(body(r), ID);
    return { ok: true, ...(id ? { id } : {}) };
  },

  async status(io, id) {
    const r = await io.call(T.status, argsFor(io.schema(T.status), { id: { names: ID, value: id } }));
    if (r.isError) return { phase: "unknown" };
    const o = body(r);
    const w = word(o);
    const q = pick(o, ["pendingQuestion", "pending_question"]);
    const durationSec = pickNum(o, ["durationSec", "durationSeconds", "duration"]);
    const finished = o.finished === true || (isObj(o.call) && (o.call as Obj).finished === true);
    // Tuwa's statuses: draft, awaiting_confirmation, scheduled, executing, succeeded, partial,
    // failed, canceled, uncertain. "executing" is ringing or talking; a running clock says talking.
    const phase: StatusOut["phase"] =
      finished || /succeed|partial|fail|cancel|uncertain|finish|ended|complete|done|no_answer|busy/.test(w)
        ? "finished"
        : /schedul|awaiting|draft|pending_approval/.test(w)
          ? "waiting"
          : /execut|progress|ring|dial|queue|plac|connect|start|initiat|talk|live|in_call/.test(w)
            ? (durationSec ?? 0) > 0 || /talk|in_call|connected|answered/.test(w)
              ? "talking"
              : "calling"
            : "unknown";
    const out: StatusOut = { phase: q ? "talking" : phase, ...(durationSec !== undefined ? { durationSec } : {}) };
    if (q) {
      const qo = isObj(q) ? q : { question: q };
      const text = pickStr(qo, ["question", "text", "message"]) ?? "";
      const token = pickStr(qo, ["token", "replyToken"]) ?? pickStr(o, ["token", "replyToken"]) ?? "";
      const yesNo = /yes|bool|confirm|accept|binary/i.test(String(qo.kind ?? qo.type ?? qo.answerType ?? qo.expects ?? ""));
      if (text && token) out.question = { text, token, yesNo, choices: yesNo ? [] : strs(pick(qo, ["options", "choices", "suggestions", "answers"])).slice(0, 4) };
    }
    return out;
  },

  async reply(io, id, token, text, yesNo) {
    const yes = yesNo && /^(yes|y|ok|okay|sure|accept|好|可以|行|是|对|同意)$/i.test(text.trim());
    const no = yesNo && /^(no|n|decline|不|不行|不可以|不要|不用|否)$/i.test(text.trim());
    const decision = yes ? "accept" : no ? "decline" : "text";
    const r = await io.call(
      T.reply,
      argsFor(io.schema(T.reply), { id: { names: ID, value: id }, t: { names: ["token"], value: token }, d: { names: ["decision"], value: decision }, a: { names: ["text", "reply", "answer"], value: decision === "text" ? text.slice(0, 500) : undefined } }),
    );
    return !failOf(r);
  },

  async result(io, id) {
    const r = await io.call(T.result, argsFor(io.schema(T.result), { id: { names: ID, value: id } }));
    const o = body(r);
    const w = `${word(o)} ${pickStr(o, ["outcome"]) ?? ""}`.toLowerCase();
    const state: ResultOut["state"] = r.isError ? "uncertain" : /uncertain|unclear|unknown/.test(w) ? "uncertain" : /no_answer|no-answer|busy|voicemail|unanswered|not_answered/.test(w) ? "no_answer" : /fail|error|declin|cancel/.test(w) ? "failed" : "done";
    const lines = pick(o, ["transcript", "turns"]);
    const transcript = Array.isArray(lines)
      ? lines
          .map((x) => (isObj(x) ? { who: /agent|ai|assistant|tuwa|ducter/i.test(String(x.speaker ?? x.role ?? x.who ?? "")) ? ("agent" as const) : ("them" as const), text: String(x.text ?? x.content ?? "") } : undefined))
          .filter((x): x is { who: "them" | "agent"; text: string } => !!x && !!x.text)
          .slice(0, 200)
      : undefined;
    // outcomeSummary is what the other side said or agreed ("a table for 2 at 19:30"); `outcome`
    // may be a status word. The voice agent's summary and the open loops go in the opened call.
    const outcome = pickStr(o, ["outcomeSummary", "resultText", "headline"]) ?? pickStr(o, ["outcome"]);
    const loops = strs(pick(o, ["openLoops", "open_loops"]));
    const said = pickStr(o, ["agentSummary", "summary", "text", "message"]);
    const summary = [said, loops.length ? `Still open: ${loops.join("; ")}` : ""].filter(Boolean).join("\n") || undefined;
    const agreed = strs(pick(o, ["agreed", "agreements", "facts"])).slice(0, 8);
    const durationSec = pickNum(o, ["durationSec", "durationSeconds", "duration"]);
    const costUsd = pickNum(o, ["costUsd", "cost", "charged", "chargedUsd"]);
    return {
      state,
      ...(outcome && outcome.length > 12 ? { outcome } : said ? { outcome: said.split(/(?<=[.。!！?？])\s*/)[0] } : outcome ? { outcome } : {}),
      ...(summary ? { summary } : {}),
      ...(agreed.length ? { agreed } : {}),
      ...(transcript?.length ? { transcript } : {}),
      ...(durationSec !== undefined ? { durationSec } : {}),
      ...(costUsd !== undefined ? { costUsd } : {}),
    };
  },

  async cancel(io, id) {
    const r = await io.call(T.cancel, argsFor(io.schema(T.cancel), { id: { names: ID, value: id } }));
    return !failOf(r);
  },

  async setup(io, o) {
    const ran = async (tool: string, args: Record<string, unknown> | undefined) => !!args && !failOf(await io.call(tool, args).catch(() => ({ isError: true, data: "" })));
    // Lowering applies at once; only fields the schema lists are sent.
    const cap = await ran(T.limit, argsIfListed(io.schema(T.limit), { v: { names: ["dailyLimitCents"], value: Math.round(o.capUsd * 100) } }));
    // The phone agent is the partner, by name; voice sampling stays paused (D189 (10)).
    const sets = argsIfListed(io.schema(T.settings), { n: { names: ["agentName"], value: o.agentName }, v: { names: ["voiceSampling"], value: "paused" } });
    const both = await ran(T.settings, sets);
    // Tuwa Friends: Ducter never syncs the owner's life there (D189 (10)).
    const shared = await ran("tuwa_shared_ai", argsIfListed(io.schema("tuwa_shared_ai"), { s: { names: ["sync"], value: { on: false } } }));
    return { cap, name: both, sampling: both, shared };
  },

  async setCap(io, usd) {
    const r = await io.call(T.limit, { dailyLimitCents: Math.round(usd * 100) });
    const f = failOf(r);
    if (f) return f;
    const confirmationId = pickStr(body(r), ["confirmationId", "confirmation_id"]);
    return { ok: true, ...(confirmationId ? { confirmationId } : {}) };
  },

  async voice(io) {
    const r = await io.call(T.settings, {}).catch(() => undefined);
    if (!r || r.isError) return undefined;
    const o = body(r);
    const vo = pick(o, ["voice"]);
    const v = (isObj(vo) ? vo.personal : undefined) ?? pick(o, ["personalVoice", "personal_voice", "ownVoice", "voiceClone"]);
    const use = pick(o, ["usePersonalVoice", "use_personal_voice", "personalVoiceOn"]);
    if (v === undefined && use === undefined) return undefined;
    const enrolled = isObj(v) ? v.enrolled !== false && v.ready !== false && v.status !== "none" : v === true || (typeof v === "string" && !/none|no|absent|missing/i.test(v));
    return { enrolled, on: enrolled && (use === true || (isObj(v) && v.active === true) || (isObj(v) && v.on === true)) };
  },

  async voiceChange(io, action) {
    const change = action === "record" ? "record_personal_voice" : action === "on" ? "use_personal_voice" : action === "off" ? "stop_personal_voice" : "delete_voice_data";
    const r = await io.call(T.change, argsFor(io.schema(T.change), { c: { names: ["change", "setting", "kind", "type"], value: change } }));
    const o = body(r);
    const url = pickStr(o, ["recordingUrl", "url"]);
    if (/no_personal_voice/.test(`${word(o)} ${pickStr(o, ["error", "code"]) ?? ""}`)) return { ok: false, reason: "no_voice" };
    const f = failOf(r);
    if (f) return { ok: false, reason: "provider", error: f.error };
    const confirmationId = pickStr(o, ["confirmationId", "confirmation_id"]);
    return { ok: true, ...(url ? { url } : {}), ...(confirmationId ? { confirmationId, summary: pickStr(o, ["summary"]) ?? "" } : {}) };
  },
};

export const PROVIDERS: CallProvider[] = [tuwa];
export const providerOf = (tools: LinkTool[]) => PROVIDERS.find((p) => p.matches(tools));
