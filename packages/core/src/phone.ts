// Phone calls (D189, D193; design/phone.md): Ducter places a call for the owner through a calling
// connection (Tuwa first). The partner drafts it (phone_call); every call waits for the owner's Go
// on one card; Ducter itself dials at an allowed hour, polls the call, puts a question from the
// line in front of the owner at once (pushed even in quiet hours), and logs the outcome exactly as
// the provider reports it. The rails (quiet hours, the callee's 9:00–20:00, the daily cap, 15
// minutes, the do-not-call list, no emergency numbers, one callee per card, the AI disclosure) are
// code here, not the partner's good behaviour.
//
// Every change of a call is one `phone_call` snapshot in the Log (the latest per callId wins), so a
// restart picks up where it was: live calls are polled again, a call waiting for its hour waits on.
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, CallBody, CallPlan, CallState, CallView, CallWait, DraftRequest, DraftResult, LogEvent, PhoneView } from "@ducter/protocol";
import { callEnded, e164 } from "@ducter/protocol";
import type { LogStore, PhonePort } from "@ducter/protocol/src/internal.ts";
import { realClock, type Clock } from "./clock.ts";
import type { ConnectionsStore } from "./connections.ts";
import { nanpZones } from "./nanp.ts";
import { providerOf, type CallProvider, type ProviderIo } from "./phone-provider.ts";
import { inQuiet, localMinutes, type Quiet } from "./push.ts";

export const PHONE_FILE = "phone.json";
export const DEFAULT_CAP_USD = 10; // D189 (8): Tuwa's own default is $50/day; Ducter lowers it at connect
export const TALK_LIMIT_MIN = 15; // the agent is asked to wrap up by then
export const HANG_UP_MIN = 17; // Ducter hangs up if it is still on the line
export const QUESTION_WAIT_MS = 90_000; // D189 (5): then the agent says it will call back
export const POLL_MS = 15_000; // Tuwa asks for 15–30 s
export const POLL_LIVE_MS = 5_000; // while someone is on the line (a question waits on the owner)
const CALL_START = 9 * 60; // the callee's local 9:00 … (the courtesy hours: the owner's Call now may pass them, D208)
const CALL_END = 20 * 60; // … to 20:00
const LATE_START = 8 * 60; // never before 8:00 or from 21:00 where they are, even on Call now (D208; the TCPA's hours)
const LATE_END = 21 * 60;
const MAX_LOST_POLLS = 40; // status unreadable this many times in a row: say we lost track

/** The fallback reply when the owner hasn't answered a question from the line (D189 (5)). */
export const CALLBACK_REPLY =
  "The person you are calling for can't answer right now. Tell them politely that we will call back, agree nothing more, and end the call.";

// ---------- the destination: price zone, local hours, numbers never called ----------

/** Tuwa's per-minute price (research/53 §4): $0.30 + the zone surcharge from a Tuwa number. */
export const BASE_PER_MIN = 0.3;
const CC = ["1", "7", "20", "27", "30", "31", "32", "33", "34", "36", "39", "40", "41", "43", "44", "45", "46", "47", "48", "49", "51", "52", "53", "54", "55", "56", "57", "58", "60", "61", "62", "63", "64", "65", "66", "81", "82", "84", "86", "90", "91", "92", "93", "94", "95", "98", "852", "853", "855", "856", "880", "886", "971", "972", "966", "977"];

/**
 * Where Tuwa's own numbers call (its tuwa_call_draft schema, read 2026-11-11, research/53 §8):
 * nowhere else is drafted. Mainland China (+86) is not among them.
 */
export const TUWA_REACHES = ["1", "81", "82", "44", "49", "33", "91", "55", "61", "64", "66", "63", "65", "60", "971", "977", "852", "853", "886"];
/**
 * D215: whether a line Ducter has, or would have once connected, calls this number's country.
 * No connection yet counts as Tuwa (the one Ducter offers). Another provider decides for itself.
 */
export function reaches(provider: string | undefined, n: string): boolean {
  if (provider && provider !== "Tuwa") return true;
  return TUWA_REACHES.includes(countryCode(n) ?? "");
}
export function countryCode(n: string): string | undefined {
  const d = n.replace(/^\+/, "");
  for (const len of [3, 2, 1]) if (CC.includes(d.slice(0, len))) return d.slice(0, len);
  return undefined;
}

/** The surcharge in USD/min by destination; undefined = not in Tuwa's published table. */
export function surcharge(n: string): number | undefined {
  const cc = countryCode(n);
  const nat = n.replace(/^\+/, "").slice(cc?.length ?? 0);
  switch (cc) {
    case "1":
    case "44":
      return 0;
    case "33":
      return /^[67]/.test(nat) ? 0.3 : 0;
    case "49":
      return /^1[5-7]/.test(nat) ? 0.5 : 0;
    case "61":
      return /^4/.test(nat) ? 0.1 : 0;
    case "52":
    case "55":
      return 0.1; // landlines +0, mobiles +0.10: we can't tell them apart reliably, so the higher
    case "81":
      return /^[789]0/.test(nat) ? 0.3 : 0.1;
    case "82":
    case "852":
    case "65":
    case "91":
      return 0.1;
    case "886":
    case "66":
    case "84":
      return 0.3;
    case "63":
      return 0.5;
    default:
      return undefined;
  }
}

const ZONES: Record<string, string[]> = {
  "1": ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"],
  "7": ["Europe/Moscow"],
  "31": ["Europe/Amsterdam"],
  "33": ["Europe/Paris"],
  "34": ["Europe/Madrid"],
  "39": ["Europe/Rome"],
  "44": ["Europe/London"],
  "49": ["Europe/Berlin"],
  "52": ["America/Mexico_City"],
  "55": ["America/Sao_Paulo"],
  "61": ["Australia/Sydney", "Australia/Brisbane", "Australia/Adelaide", "Australia/Perth"],
  "63": ["Asia/Manila"],
  "65": ["Asia/Singapore"],
  "66": ["Asia/Bangkok"],
  "81": ["Asia/Tokyo"],
  "82": ["Asia/Seoul"],
  "84": ["Asia/Ho_Chi_Minh"],
  "86": ["Asia/Shanghai"],
  "91": ["Asia/Kolkata"],
  "852": ["Asia/Hong_Kong"],
  "853": ["Asia/Macau"],
  "886": ["Asia/Taipei"],
  "60": ["Asia/Kuala_Lumpur"],
  "64": ["Pacific/Auckland"],
  "971": ["Asia/Dubai"],
  "977": ["Asia/Kathmandu"],
};
const validZone = (z: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: z });
    return true;
  } catch {
    return false;
  }
};
/**
 * The zones the callee's hours are checked in: the one named (if real: where the person is now),
 * else a +1 number's area code (D208), else every zone of the country.
 */
export function calleeZones(n: string, named?: string): string[] | undefined {
  if (named && validZone(named)) return [named];
  return (countryCode(n) === "1" ? nanpZones(n) : undefined) ?? ZONES[countryCode(n) ?? ""];
}

/** Numbers never called (D189 (8)): emergency and other short service numbers, wherever they hide. */
const EMERGENCY = ["911", "112", "999", "000", "110", "119", "120", "122", "100", "101", "102", "108", "15", "17", "18", "113", "118", "192", "193", "194", "190"];
export function neverCall(n: string): boolean {
  const cc = countryCode(n);
  const nat = n.replace(/^\+/, "").slice(cc?.length ?? 0).replace(/^0+/, "");
  return nat.length < 6 || EMERGENCY.includes(nat);
}

/**
 * D208: how the hours apply to one call. present: the owner asked for it just now, while here (or
 * is tapping Go): their own quiet hours don't hold "now", only a later time Ducter picks. own: the
 * owner's own number: no callee hours at all. courtesy false: the owner said Call now: only the
 * hard 8:00–21:00 holds where they are, not the 9:00–20:00 courtesy.
 */
export interface HoursOpts {
  present?: boolean;
  own?: boolean;
  courtesy?: boolean;
  horizonMs?: number;
}

const inHours = (t: number, zones: string[], start: number, end: number) =>
  zones.every((z) => {
    const m = localMinutes(t, z);
    return m >= start && m < end;
  });

/** The earliest moment ≥ at when a call may start (D193 (5), D208). */
export function nextAllowed(at: number, quiet: Quiet | null, zones: string[], o: HoursOpts = {}): number | undefined {
  const [start, end] = o.courtesy === false ? [LATE_START, LATE_END] : [CALL_START, CALL_END];
  const callee = (t: number) => !!o.own || inHours(t, zones, start, end);
  if (callee(at) && (o.present || !inQuiet(at, quiet))) return at;
  const step = 5 * 60_000;
  for (let t = at - (at % step) + step; t < at + (o.horizonMs ?? 3 * 24 * 3600_000); t += step) if (callee(t) && !inQuiet(t, quiet)) return t;
  return undefined;
}

const hhmm = (t: number, zone: string) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(t)).replace(/^0(?=\d)/, "");

/** D208: why a call can't start now but at `at`: the callee's courtesy hours, the hard late hours, or the owner's quiet hours. */
export function whyWaits(now: number, at: number, quiet: Quiet | null, zones: string[], o: HoursOpts = {}): CallWait {
  const out = zones.find((z) => !inHours(now, [z], CALL_START, CALL_END)) ?? zones[0] ?? "UTC";
  const calleeOk = !!o.own || inHours(now, zones, CALL_START, CALL_END);
  if (calleeOk && !o.present && inQuiet(now, quiet)) return { why: "quiet", zone: out, their: hhmm(now, out), then: hhmm(at, out) };
  return { why: o.own || inHours(now, zones, LATE_START, LATE_END) ? "callee" : "late", zone: out, their: hhmm(now, out), then: hhmm(at, out) };
}

// ---------- the store ----------

interface PhoneFile {
  capUsd?: number;
  doNotCall?: { number: string; at: string; why?: string }[];
  voice?: { enrolled: boolean; on: boolean };
  setUp?: string[]; // connections Ducter already set up (cap, agent name)
  /** What the set-up at connect managed (shown on the phone card). */
  rails?: { cap: boolean; sampling: boolean; shared: boolean };
}

export type { DraftRequest, DraftResult };

export interface Phone extends PhonePort {
  /** The calling connection, when there is one. */
  available(): { connectionId: string; provider: string } | undefined;
  /** Drafts a call (or continues a draft with the owner's answers) and builds its Go card. The caller logs the card. */
  draft(req: DraftRequest, o: { lang: "zh" | "en"; callId?: string; answers?: string }): Promise<DraftResult>;
  /** The owner's answer to a live call's question, said in the conversation (the partner passes it on exactly). */
  answer(text: string, callId?: string): { ok: true } | { ok: false; error: string };
  cancel(callId: string, by: "owner" | "ducter"): Promise<boolean>;
  /** D208: 现在就打 / Call now on a Go card that waits for the callee's courtesy hours. */
  callNow(callId: string): { ok: true } | { ok: false; error: string };
  block(number: string, why?: string): { ok: true; number: string } | { ok: false; error: string };
  get(callId: string): CallBody | undefined;
  /** On hand: live, waiting for Go, and ended today; newest first. */
  calls(): CallView[];
  view(connectionId: string): PhoneView | undefined;
  /** The owner sets Ducter's daily cap on the phone card (it sets the provider's too). */
  setCap(usd: number, words: string): Promise<{ ok: boolean; reason?: "no_phone" | "provider" }>;
  voice(action: "record" | "on" | "off" | "delete" | "refresh", words: string): Promise<{ ok: boolean; url?: string; reason?: "no_phone" | "no_voice" | "provider" | "unreachable"; message?: string }>;
  stop(): void;
}

export interface PhoneDeps {
  dataDir: string;
  log: LogStore;
  connections: ConnectionsStore;
  clock?: Clock;
  quiet: () => Quiet | null;
  zone: () => string;
  partnerName: () => string;
  /** D208: the owner's own numbers (their saved phone in Your details): no callee hours for them. */
  ownNumbers?: () => string[];
  onChange?: () => void;
  /** D199: the calling connection came or went (the home's 打电话 follows it). */
  onCalling?: () => void;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const newCallId = () => `call_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
const newDecisionId = () => `d_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function openPhone(deps: PhoneDeps): Phone {
  const clock = deps.clock ?? realClock;
  const path = join(deps.dataDir, PHONE_FILE);
  let file: PhoneFile = {};
  try {
    if (existsSync(path)) file = JSON.parse(readFileSync(path, "utf8")) as PhoneFile;
  } catch {
    file = {};
  }
  const save = () => {
    try {
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, JSON.stringify(file, null, 2), { mode: 0o600 });
      chmodSync(tmp, 0o600);
      renameSync(tmp, path);
    } catch (err) {
      console.warn(`[phone] could not save ${PHONE_FILE}: ${(err as Error).message}`);
    }
  };
  const cap = () => file.capUsd ?? DEFAULT_CAP_USD;

  // The calls, rebuilt from the Log; the provider's ids ride in `ref` (never shown).
  // held: the draft carries scheduledAt (the provider holds the time); false: Ducter holds it (a
  // card that offers Call now). zones: every zone the callee's hours are checked in (D208).
  type Call = CallBody & { ref?: { draft?: string; confirmation?: string; call?: string; token?: string; summary?: string; scheduled?: boolean; yesNo?: boolean; held?: boolean; zones?: string[] }; updatedAt: string };
  const calls = new Map<string, Call>();
  const byDecision = new Map<string, { callId: string; kind: "go" | "question" | "sheet" }>();
  for (const e of deps.log.read({ stream: "channel", kinds: ["phone_call", "decision"], fromSeq: 0, limit: Number.MAX_SAFE_INTEGER })) {
    if (e.kind === "phone_call") calls.set((e.body as CallBody).callId, { ...(e.body as Call), updatedAt: e.ts });
    else {
      const d = e.body as Bodies["decision"];
      if (d.call) byDecision.set(d.decisionId, { callId: d.call.callId, kind: d.call.kind });
    }
  }
  const answered = new Set(deps.log.read({ stream: "channel", kinds: ["decision_resolved"], fromSeq: 0, limit: Number.MAX_SAFE_INTEGER }).map((e) => (e.body as Bodies["decision_resolved"]).decisionId));

  let stopped = false;
  const put = (c: Call, patch: Partial<Call>): Call => {
    // A provider answer that lands after stop() (a confirm in flight) writes nothing: the Log is closed.
    if (stopped) return { ...c, ...patch };
    const next: Call = { ...c, ...patch, updatedAt: new Date(clock.now()).toISOString() };
    if (patch.state && patch.state !== "question") delete next.question;
    calls.set(c.callId, next);
    const { updatedAt: _u, ...body } = next;
    deps.log.append({ stream: "channel", origin: "system", kind: "phone_call", body: body as CallBody });
    deps.onChange?.();
    return next;
  };

  /** The calling connection: the first connection whose tools are a provider's call flow. */
  let found: { connectionId: string; provider: CallProvider; tools: Map<string, unknown> } | undefined;
  let foundAt = 0;
  async function resolve(): Promise<typeof found> {
    if (found && clock.now() - foundAt < 5 * 60_000 && deps.connections.view().some((c) => c.id === found!.connectionId)) return found;
    const was = found?.connectionId;
    found = undefined;
    const now = await find().catch((e) => {
      if (was) deps.onCalling?.();
      throw e;
    });
    if (now?.connectionId !== was) deps.onCalling?.();
    return now;
  }
  async function find(): Promise<typeof found> {
    for (const c of deps.connections.view()) {
      if (c.source !== "mcp") continue;
      const tools = await deps.connections.toolsOf(c.id).catch(() => undefined);
      const p = tools && providerOf(tools);
      if (p && tools) {
        found = { connectionId: c.id, provider: p, tools: new Map(tools.map((t) => [t.name, t.inputSchema])) };
        foundAt = clock.now();
        break;
      }
    }
    return found;
  }
  const ioOf = (f: NonNullable<typeof found>): ProviderIo => ({
    call: (tool, args) => deps.connections.invoke(f.connectionId, tool, args),
    schema: (tool) => f.tools.get(tool),
  });
  // Connection tools that are the call flow: only this module runs them.
  deps.connections.reserve((id, action) => (found?.connectionId === id && found.provider.reserved.has(action) ? "Calls go through phone_call (one Go card per call, with Ducter's rails); this tool is not run directly." : undefined));

  // At connect (and once per connection): lower the provider's daily cap, name its phone agent.
  const offAdded = deps.connections.onChange(() => void setUp());
  async function setUp() {
    const f = await resolve().catch(() => undefined);
    if (!f || (file.setUp ?? []).includes(f.connectionId)) return;
    file.setUp = [...(file.setUp ?? []), f.connectionId];
    save();
    const done = await f.provider.setup(ioOf(f), { capUsd: cap(), agentName: deps.partnerName() }).catch(() => undefined);
    if (done) (file.rails = { cap: done.cap, sampling: done.sampling, shared: done.shared }), save();
    const v = await f.provider.voice(ioOf(f)).catch(() => undefined);
    if (v) (file.voice = v), save();
    deps.onChange?.();
  }
  void setUp();

  const today = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: deps.zone() }).format(new Date(iso)) === new Intl.DateTimeFormat("en-CA", { timeZone: deps.zone() }).format(new Date(clock.now()));
  /** What today's calls cost (ended: as reported; live or waiting: the estimate). */
  const spentToday = (except?: string) =>
    round2(
      [...calls.values()]
        .filter((c) => c.callId !== except && c.placedAt && today(c.placedAt))
        .reduce((n, c) => n + (c.costUsd ?? (callEnded(c.state) ? 0 : c.plan.costUsd)), 0),
    );

  // ---------- timers: one per call ----------
  const timers = new Map<string, unknown>();
  const later = (callId: string, ms: number, fn: () => Promise<void> | void) => {
    const t = timers.get(callId);
    if (t !== undefined) clock.clearTimeout(t);
    timers.set(
      callId,
      clock.setTimeout(() => {
        timers.delete(callId);
        Promise.resolve()
          .then(fn)
          .catch((err) => console.warn(`[phone] ${callId}: ${(err as Error).message}`));
      }, Math.max(0, ms)),
    );
  };
  const qTimers = new Map<string, unknown>();
  // Drafts the provider is still asking about (in memory: a restart asks the partner to draft again).
  const pending = new Map<string, { draftId: string; req: DraftRequest; plan: CallPlan; x: { held: boolean; zones: string[] } }>();
  const lost = new Map<string, number>();

  /** present: the owner is tapping Go right now (their quiet hours don't hold now); else a timer. */
  async function dial(callId: string, present = false): Promise<void> {
    let c = calls.get(callId);
    if (!c || c.state !== "waiting") return;
    const zones = c.ref?.zones ?? calleeZones(c.plan.to, c.plan.calleeZone) ?? [c.plan.calleeZone];
    const at = nextAllowed(clock.now(), deps.quiet(), zones, { present, own: !!c.plan.own, courtesy: !c.callNow });
    if (at === undefined) return void put(c, { state: "failed", reason: "provider", error: "no allowed hour to call in the next three days" });
    // The provider already holds an allowed time (the draft's scheduledAt): confirm now, it dials then.
    const held = (c.ref?.held ?? !!c.plan.at) && !!c.plan.at && Date.parse(c.plan.at) >= at - 60_000;
    if (!held && at > clock.now() + 30_000) {
      if (c.plan.at !== new Date(at).toISOString()) c = put(c, { plan: { ...c.plan, at: new Date(at).toISOString() } });
      return later(callId, at - clock.now(), () => dial(callId));
    }
    if (spentToday(callId) + c.plan.costUsd > cap()) return void put(c, { state: "failed", reason: "cap", error: `today's calls would pass the $${cap()} daily cap` });
    const f = await resolve();
    if (!f || f.connectionId !== c.connectionId) return void put(c, { state: "failed", reason: "signed_out", error: "the calling connection is gone or signed out" });
    const io = ioOf(f);
    let conf = c.ref?.confirmation;
    let r: Awaited<ReturnType<CallProvider["confirm"]>> | undefined = conf ? await f.provider.confirm(io, conf, true, c.approvedWords ?? "Yes").catch((e) => ({ ok: false as const, reason: "provider" as const, error: String((e as Error).message ?? e) })) : undefined;
    // D208: a confirm that errored may still have placed the call. Read where it is first, by the
    // draft's own id; never confirm it again blindly (a second yes could dial twice).
    let where: Awaited<ReturnType<CallProvider["status"]>>["phase"] | undefined;
    if (r && !r.ok && c.ref?.draft) {
      where = (await f.provider.status(io, c.ref.draft).catch(() => ({ phase: "unknown" as const }))).phase;
      if (where === "calling" || where === "talking" || where === "finished" || (where === "waiting" && held)) r = { ok: true, id: c.ref.draft };
      else if (where === "unknown" && r.reason === "provider")
        return void put(c, { state: "failed", reason: "lost", error: `the confirmation errored (${r.error}) and the call's status can't be read; check ${f.provider.name}'s app before calling again` });
    }
    // An approval that went stale while it waited for its hour: ask the provider again. Only an
    // unchanged summary is confirmed with the owner's same words; anything else needs a new card.
    if (r && !r.ok && c.ref?.draft && r.reason === "provider" && where === "unconfirmed") {
      const again = await f.provider.requestApproval(io, c.ref.draft).catch(() => undefined);
      if (again?.ok && again.summary.trim() === (c.ref.summary ?? "").trim()) {
        conf = again.confirmationId;
        r = await f.provider.confirm(io, conf, true, c.approvedWords ?? "Yes").catch((e) => ({ ok: false as const, reason: "provider" as const, error: String((e as Error).message ?? e) }));
      } else if (again?.ok) return void put(c, { state: "failed", reason: "provider", error: "the call's details changed at the provider since the Go; it needs a new card" });
    }
    if (!r || !r.ok) {
      const fail = r && !r.ok ? r : { reason: "provider" as const, error: "the provider did not take the call" };
      return void put(c, { state: "failed", reason: fail.reason, error: fail.error, ...("payUrl" in fail && fail.payUrl ? { payUrl: fail.payUrl } : {}) });
    }
    if (held && Date.parse(c.plan.at!) > clock.now() + 30_000) {
      c = put(c, { ref: { ...c.ref, confirmation: conf, call: r.id ?? c.ref?.draft, scheduled: true } });
      return later(callId, Math.max(POLL_MS, Date.parse(c.plan.at!) - clock.now()), () => poll(callId));
    }
    c = put(c, { state: "calling", placedAt: new Date(clock.now()).toISOString(), ref: { ...c.ref, confirmation: conf, call: r.id ?? c.ref?.draft } });
    later(callId, POLL_MS, () => poll(callId));
  }

  async function poll(callId: string): Promise<void> {
    let c = calls.get(callId);
    if (!c || !(["calling", "talking", "question"].includes(c.state) || (c.state === "waiting" && c.ref?.scheduled))) return;
    const f = await resolve().catch(() => undefined);
    const id = c.ref?.call ?? c.ref?.draft;
    if (!f || !id) return void put(c, { state: "uncertain", error: "lost the calling connection mid-call; check the provider's app" });
    const io = ioOf(f);
    const s = await f.provider.status(io, id).catch(() => ({ phase: "unknown" as const }));
    if (s.phase === "unknown") {
      const n = (lost.get(callId) ?? 0) + 1;
      lost.set(callId, n);
      if (n >= MAX_LOST_POLLS) return void (await finish(callId, { state: "uncertain", outcome: undefined, error: "Ducter lost track of the call; check the provider's app" }));
      return later(callId, POLL_MS, () => poll(callId));
    }
    lost.delete(callId);
    if (s.phase === "finished") return void (await finish(callId));
    if (s.phase === "waiting" || s.phase === "unconfirmed") return later(callId, c.state === "waiting" ? POLL_MS * 2 : POLL_MS, () => poll(callId));
    if (c.state === "waiting") c = put(c, { state: "calling", placedAt: new Date(clock.now()).toISOString() });
    if (s.phase === "talking" && !c.talkingSince) c = put(c, { state: "talking", talkingSince: new Date(clock.now()).toISOString() });
    else if (s.phase === "talking" && c.state === "calling") c = put(c, { state: "talking" });
    // A question from the line: the top card, at once.
    if (s.question && s.question.token !== c.ref?.token) {
      const decisionId = newDecisionId();
      const question = { text: clip(s.question.text, 300), choices: s.question.choices.map((x) => clip(x, 40)), askedAt: new Date(clock.now()).toISOString(), decisionId };
      c = put(c, { state: "question", question: { ...question, ...(s.question.yesNo ? { yesNo: true } : {}) }, ref: { ...c.ref, token: s.question.token, yesNo: s.question.yesNo } });
      byDecision.set(decisionId, { callId, kind: "question" });
      deps.log.append({
        stream: "channel",
        origin: "system",
        kind: "decision",
        body: { decisionId, question: question.text, goLabel: s.question.yesNo ? "yes" : (question.choices[0] ?? "OK"), defaultOption: "hold", reversible: false, call: { callId, kind: "question", choices: question.choices, ...(s.question.yesNo ? { yesNo: true } : {}) } },
      });
      qTimers.set(decisionId, clock.setTimeout(() => void unanswered(decisionId), QUESTION_WAIT_MS));
    }
    // The 15-minute limit: the agent was asked to wrap up; past 17 on the line (20 from dialing), Ducter hangs up.
    if ((c.talkingSince && clock.now() - Date.parse(c.talkingSince) > HANG_UP_MIN * 60_000) || (c.placedAt && clock.now() - Date.parse(c.placedAt) > (HANG_UP_MIN + 3) * 60_000)) {
      await f.provider.cancel(io, id).catch(() => false);
      return void (await finish(callId, { by: "ducter", reason: "too_long" }));
    }
    later(callId, c.state === "calling" ? POLL_MS : POLL_LIVE_MS, () => poll(callId));
  }

  async function finish(callId: string, extra: Partial<Call> = {}) {
    const c = calls.get(callId);
    if (!c || callEnded(c.state)) return;
    const f = await resolve().catch(() => undefined);
    const id = c.ref?.call ?? c.ref?.draft;
    const res = f && id ? await f.provider.result(ioOf(f), id).catch(() => undefined) : undefined;
    // An open question is closed: the line is gone.
    if (c.question && !answered.has(c.question.decisionId)) closeQuestion(c.question.decisionId);
    const state: CallState = extra.reason === "too_long" ? "cancelled" : extra.state ?? res?.state ?? "uncertain";
    // D208: a dialed call that failed says the provider's own words, or that it gave none; never "refused".
    const failed = state === "failed" && !extra.reason ? { reason: "call_failed" as const, error: res?.detail ?? "the provider gave no reason" } : {};
    put(c, {
      state,
      endedAt: new Date(clock.now()).toISOString(),
      ...failed,
      ...(res?.hint ? { hint: res.hint } : {}),
      ...(res?.outcome ? { outcome: clip(res.outcome, 400) } : {}),
      ...(res?.summary ? { summary: clip(res.summary, 2000) } : {}),
      ...(res?.agreed ? { agreed: res.agreed } : {}),
      ...(res?.transcript ? { transcript: res.transcript } : {}),
      ...(res?.durationSec !== undefined ? { durationSec: res.durationSec } : {}),
      ...(res?.costUsd !== undefined ? { costUsd: round2(res.costUsd) } : {}),
      ...extra,
      ...(extra.reason === "too_long" ? { state: "cancelled" as const, by: "ducter" as const } : {}),
    });
  }

  function closeQuestion(decisionId: string) {
    const t = qTimers.get(decisionId);
    if (t !== undefined) clock.clearTimeout(t), qTimers.delete(decisionId);
    if (answered.has(decisionId)) return;
    deps.log.append({ stream: "channel", origin: "system", kind: "decision_resolved", body: { decisionId, option: "hold", by: "default" } });
  }

  /** About 90 s and no answer: the agent says it will call back (no guess, ever). */
  async function unanswered(decisionId: string) {
    qTimers.delete(decisionId);
    if (answered.has(decisionId)) return;
    const link = byDecision.get(decisionId);
    const c = link && calls.get(link.callId);
    closeQuestion(decisionId);
    if (!c || c.state !== "question") return;
    const f = await resolve().catch(() => undefined);
    if (f && c.ref?.token) await f.provider.reply(ioOf(f), c.ref.call ?? c.ref.draft ?? "", c.ref.token, CALLBACK_REPLY).catch(() => false);
    put(c, { state: "talking" });
  }

  async function onAnswer(r: Bodies["decision_resolved"]) {
    answered.add(r.decisionId);
    const link = byDecision.get(r.decisionId);
    if (!link) return;
    const c = calls.get(link.callId);
    if (!c) return;
    // D215: a call sheet: 打完了 / Done calling says the owner called it themselves (the partner
    // asks how it went and records it); 先不打 / Not now, or a reply, sets it aside. Nothing dials.
    if (link.kind === "sheet") {
      if (c.state !== "needs_go") return;
      return void put(c, r.option === "go" ? { state: "done", endedAt: new Date(clock.now()).toISOString() } : { state: "held" });
    }
    if (link.kind === "go") {
      if (c.state !== "needs_go") return;
      if (r.option === "go") {
        // The owner's own words go to the provider with the approval (Tuwa's personReply).
        const goLabel = r.now ? langOf(/[一-鿿]/.test(c.plan.goal) ? "zh" : "en").now : (deps.log.read({ stream: "channel", kinds: ["decision"], limit: 5000 }).map((e) => e.body as Bodies["decision"]).find((d) => d.decisionId === r.decisionId)?.goLabel) ?? "Call";
        // D208: Call now passes the callee's courtesy hours (never the late ones); the card said so.
        const now = r.now && c.plan.canNow ? { callNow: true } : {};
        put(c, { state: "waiting", ...now, approvedWords: clip(r.text?.trim() ? `${goLabel} — ${r.text.trim()}` : goLabel, 300) });
        return dial(c.callId, r.by === "user");
      }
      // Not now, or a reply (the partner reads it and drafts again): withdraw the draft.
      put(c, { state: "held" });
      const f = await resolve().catch(() => undefined);
      if (f && c.ref?.draft) await f.provider.cancel(ioOf(f), c.ref.draft).catch(() => false);
      return;
    }
    // A question from the line.
    const t = qTimers.get(r.decisionId);
    if (t !== undefined) clock.clearTimeout(t), qTimers.delete(r.decisionId);
    if (r.by === "default" || c.state !== "question" || c.question?.decisionId !== r.decisionId) return;
    const d = deps.log.read({ stream: "channel", kinds: ["decision"], limit: 5000 }).map((e) => e.body as Bodies["decision"]).find((x) => x.decisionId === r.decisionId);
    const text = r.option === "reply" ? (r.text ?? "").trim() : r.option === "go" ? (d?.goLabel ?? "") : "";
    const f = await resolve().catch(() => undefined);
    if (f && c.ref?.token) await f.provider.reply(ioOf(f), c.ref.call ?? c.ref.draft ?? "", c.ref.token, text || CALLBACK_REPLY, !!c.ref.yesNo && !!text).catch(() => false);
    put(c, { state: "talking" });
  }

  const off = deps.log.subscribe((e: LogEvent) => {
    // A snapshot this module didn't write (a seed, a test, another process): take it in once.
    if (e.kind === "phone_call" && !calls.has((e.body as CallBody).callId)) calls.set((e.body as CallBody).callId, { ...(e.body as Call), updatedAt: e.ts });
    if (e.kind === "decision") {
      const d = e.body as Bodies["decision"];
      if (d.call) byDecision.set(d.decisionId, { callId: d.call.callId, kind: d.call.kind });
    } else if (e.kind === "decision_resolved") void onAnswer(e.body as Bodies["decision_resolved"]).catch((err) => console.warn(`[phone] answer: ${(err as Error).message}`));
  });

  // After a restart: live calls are polled again; a call waiting for its hour waits on; an open
  // question gets its 90 s again (the line may well be gone; the poll will say).
  for (const c of calls.values()) {
    if (c.state === "waiting" && c.ref?.scheduled) later(c.callId, 1000, () => poll(c.callId));
    else if (c.state === "waiting") later(c.callId, 1000, () => dial(c.callId));
    else if (["calling", "talking", "question"].includes(c.state)) later(c.callId, 1000, () => poll(c.callId));
    if (c.state === "question" && c.question && !answered.has(c.question.decisionId)) {
      const q = c.question;
      qTimers.set(q.decisionId, clock.setTimeout(() => void unanswered(q.decisionId), QUESTION_WAIT_MS));
    }
  }

  /** Ducter's own rails, said to the provider's agent on every call (never shown as the owner's). */
  function rails(plan: { forName?: string; voice: "ducter" | "owner" }) {
    const partner = deps.partnerName() || "Ducter";
    const who = plan.forName?.trim() || "the person I assist";
    const opening = plan.voice === "owner" ? `Open the call by saying, in the language of the call: this is ${partner}, ${who}'s AI assistant, speaking in ${who}'s voice and calling for ${who}.` : `Open the call by saying, in the language of the call: this is ${partner}, ${who}'s AI assistant, calling for ${who}.`;
    return {
      context: [{ text: opening, source: "Ducter, the AI assistant placing this call (fixed rule)" }],
      mustNot: [
        `Never say or suggest you are ${who} or any human; you are an AI assistant. ${opening}`,
        "Never guess an answer only the person can give. If a question waits on them for more than about 90 seconds, say you will call back and end politely.",
        `Wrap up within ${TALK_LIMIT_MIN} minutes of talking.`,
        "No marketing, no selling, no payment or card details, no other numbers to call.",
        "If they ask not to be called again, agree, apologise and end the call.",
      ],
    };
  }

  function langOf(lang: "zh" | "en") {
    return {
      question: (name: string) => (lang === "zh" ? `打给 ${name}？` : `Call ${name}?`),
      go: lang === "zh" ? "打过去" : "Call",
      // D208: a card that waits for the callee's hours: Go is "then", 现在就打 / Call now is beside it.
      then: lang === "zh" ? "到点再打" : "Call then",
      now: lang === "zh" ? "现在就打" : "Call now",
      us: lang === "zh" ? "这是美国的私人号码时，对方得事先同意接 AI 的电话。" : "If this is a private US mobile, the person must have agreed to AI calls.",
      // D215: a call sheet's card: the question names who; Go is the owner saying they called.
      sheet: (name: string) => (lang === "zh" ? `打给 ${name} 的通话单` : `Call sheet: ${name}`),
      done: lang === "zh" ? "打完了" : "Done calling",
    };
  }

  /**
   * D215: a number no calling provider reaches (a country outside Tuwa's coverage). The card is
   * a call sheet the owner calls themselves: no provider, no cost, no hours (the owner dials when
   * they like). Needs no calling connection. When a provider that reaches the number exists (the
   * owner's own phone, later), draft() takes it before ever getting here.
   */
  function sheet(to: string, req: DraftRequest, o: { lang: "zh" | "en" }): DraftResult {
    if ((file.doNotCall ?? []).some((x) => x.number === to)) return { ok: false, reason: "dnc", error: "That number is on the user's do-not-call list. Say so in one line; no sheet." };
    const name = (req.name ?? "").trim();
    const goal = (req.goal ?? "").trim();
    if (!name || !goal) return { ok: false, reason: "missing", error: "A call sheet needs who (name) and the one thing it is for (goal). Ask the user in one short line." };
    const open = (req.open ?? "").trim();
    if (!open)
      return { ok: false, reason: "sheet", error: "No line Ducter has calls that country, so the card is a call sheet the user calls themselves: phone_call again with open (the first thing they say, in the call's language, in their own words), ask (the questions to ask) and note (what to write down)." };
    const list = (v?: string[]) => (v ?? []).map((s) => clip(String(s).trim(), 200)).filter(Boolean).slice(0, 8);
    const mustNot = list(req.mustNot);
    const keep = req.keep?.trim() ? clip(req.keep.trim(), 300) : undefined;
    const w = langOf(o.lang);
    const plan: CallPlan = {
      to,
      name: clip(name, 80),
      goal: clip(goal, 300),
      say: list(req.say),
      ...(keep ? { keep } : {}),
      mustNot,
      voice: "ducter",
      from: "self",
      provider: "",
      minutes: 0,
      costUsd: 0,
      perMinUsd: 0,
      calleeZone: calleeZones(to, req.calleeZone)?.[0] ?? deps.zone(),
      sheet: { why: "uncovered", open: clip(open, 300), ask: list(req.ask), dont: [...mustNot, ...(keep ? [keep] : [])], note: list(req.note) },
    };
    const callId = newCallId();
    const decisionId = newDecisionId();
    const card: Bodies["decision"] = { decisionId, question: w.sheet(plan.name), goLabel: w.done, defaultOption: "hold", reversible: false, call: { callId, kind: "sheet", plan } };
    byDecision.set(decisionId, { callId, kind: "sheet" });
    // A newer sheet for the same number replaces the one still up.
    for (const x of calls.values()) if (x.state === "needs_go" && x.plan.to === to && x.decisionId && !answered.has(x.decisionId)) deps.log.append({ stream: "channel", origin: "system", kind: "decision_resolved", body: { decisionId: x.decisionId, option: "hold", by: "default" } });
    put({ callId, connectionId: "", state: "needs_go", plan, decisionId, ...(req.taskId ? { taskId: req.taskId } : {}), updatedAt: new Date(clock.now()).toISOString() }, {});
    return { ok: true, needsInput: false, callId, card, plan };
  }

  const api: Phone = {
    available() {
      return found ? { connectionId: found.connectionId, provider: found.provider.name } : undefined;
    },

    async draft(req, o) {
      // D215: a number no line Ducter has (or could connect) reaches: a call sheet the owner calls
      // themselves. Asked before the connection, since connecting one wouldn't help.
      const n = !(o.callId && o.answers) ? e164(req.to ?? "") : undefined;
      if (n && !neverCall(n)) {
        const f0 = await resolve().catch(() => undefined);
        if (!reaches(f0?.provider.name, n)) return sheet(n, req, o);
      }
      const f = await resolve();
      if (!f) return { ok: false, reason: "no_phone", error: "No calling connection yet. Tell the user in one line: they can connect calls (Tuwa) in Settings › Accounts; it takes a minute on their phone." };
      const io = ioOf(f);
      const w = langOf(o.lang);

      // Continuing a draft the provider asked about: the owner's answers, exactly.
      if (o.callId && o.answers) {
        const pend = pending.get(o.callId);
        if (!pend) return { ok: false, error: "No draft waiting for answers with that callId. Draft the call again." };
        const out = await f.provider.answer(io, pend.draftId, o.answers);
        return after(out, pend.req, pend.plan, pend.x);
      }

      // An emergency number is refused as one, before it is read as a number at all.
      const digits = (req.to ?? "").replace(/\D/g, "");
      if (digits.length <= 4 && ["911", "112", "999", "000", "110", "119", "120", "122", "100", "101", "102", "108", "15", "17", "18", "113", "118"].includes(digits.replace(/^1(?=911$)/, ""))) return { ok: false, reason: "emergency", error: "Ducter never calls emergency or short service numbers. Tell the user, in their language, to call it themselves right now." };
      const to = e164(req.to ?? "");
      if (!to) return { ok: false, reason: "number", error: "That is not a full phone number. Ask the user for it with the country code (+81…, +1…); never guess one." };
      if (neverCall(to)) return { ok: false, reason: "emergency", error: "Ducter never calls emergency or short service numbers. Tell the user to call it themselves, now if it is urgent." };
      if (f.provider.name === "Tuwa" && !TUWA_REACHES.includes(countryCode(to) ?? ""))
        return { ok: false, reason: "region", error: `Tuwa's numbers don't call that country (it calls the US, Canada, Japan, Korea, the UK, Germany, France, India, Brazil, Australia, New Zealand, Thailand, the Philippines, Singapore, Malaysia, the UAE, Nepal, Hong Kong, Macau and Taiwan). Tell the user in one line, in their language.` };
      if ((file.doNotCall ?? []).some((x) => x.number === to)) return { ok: false, reason: "dnc", error: "That number is on the user's do-not-call list. Say so in one line; don't call it." };
      const name = (req.name ?? "").trim();
      const goal = (req.goal ?? "").trim();
      if (!name || !goal) return { ok: false, reason: "missing", error: "A call needs who (name) and the one thing it is for (goal). Ask the user in one short line." };
      // D208: the owner's own number (they said so, or it is their saved phone) has no callee hours.
      const own = !!req.own || (deps.ownNumbers?.() ?? []).some((n) => e164(n) === to);
      const present = !!req.present;
      const zones = calleeZones(to, req.calleeZone) ?? (own ? [deps.zone()] : undefined);
      if (!zones) return { ok: false, reason: "zone", error: "Ducter can't tell the callee's local time for that country. Pass calleeZone (an IANA zone such as Europe/Paris) if you know where they are." };
      const voice = req.voice === "owner" ? "owner" : "ducter";
      if (voice === "owner" && !file.voice?.on) return { ok: false, reason: "voice", error: "The user's own voice isn't set up and on (Settings › Accounts › the phone card). Draft it in Ducter's voice, and tell the user in one line, in their language, where to set theirs up." };
      const minutes = Math.min(TALK_LIMIT_MIN, Math.max(1, Math.round(Number(req.minutes) || 4)));
      const sur = surcharge(to);
      const perMinUsd = round2(BASE_PER_MIN + (sur ?? 0.3));
      const costUsd = round2(perMinUsd * minutes);
      const spent = spentToday();
      if (spent + costUsd > cap()) return { ok: false, reason: "cap", error: `Today's calls would pass the $${cap()} daily cap ($${spent} so far, about $${costUsd} for this one). Tell the user in one line; it can wait until tomorrow.` };

      const r = rails({ forName: req.forName, voice });
      const now = clock.now();
      const at = nextAllowed(now, deps.quiet(), zones, { present, own });
      const waits = at !== undefined && at > now + 60_000;
      const wait = waits ? whyWaits(now, at!, deps.quiet(), zones, { present, own }) : undefined;
      // D208: only the courtesy hours pushed a call the owner just asked for: the card offers Call now.
      const canNow = waits && present && !own && wait?.why === "callee" && nextAllowed(now, deps.quiet(), zones, { present, own, courtesy: false }) === now;
      const note = to.startsWith("+1") && req.person && !own ? w.us : undefined;
      const plan: CallPlan = {
        to,
        name: clip(name, 80),
        goal: clip(goal, 300),
        say: (req.say ?? []).map((s) => clip(String(s), 200)).slice(0, 8),
        ...(req.keep?.trim() ? { keep: clip(req.keep.trim(), 300) } : {}),
        mustNot: (req.mustNot ?? []).map((s) => clip(String(s), 200)).slice(0, 8),
        voice,
        from: "provider",
        provider: f.provider.name,
        minutes,
        costUsd,
        perMinUsd,
        calleeZone: zones[0]!,
        ...(waits ? { at: new Date(at!).toISOString(), wait: wait! } : {}),
        ...(canNow ? { canNow: true } : {}),
        ...(own ? { own: true } : {}),
        ...(note ? { note } : {}),
      };
      if (at === undefined) return { ok: false, reason: "hours", error: "No hour in the next three days is outside the user's quiet hours and inside 9:00–20:00 where the callee is. Say so in one line." };
      // A card that offers Call now keeps the time in Ducter (no scheduledAt): Go waits here for the
      // hour, Call now confirms at once. Otherwise the provider holds the time (D193 (5)).
      const held = !!plan.at && !canNow;
      const out = await f.provider.draft(io, {
        to,
        voice,
        ...(held ? { at: plan.at!.replace(/Z$/, "+00:00") } : {}),
        name: plan.name,
        goal: plan.goal,
        say: plan.say,
        ...(plan.keep ? { keep: plan.keep } : {}),
        ...(req.alternatives?.trim() ? { alternatives: clip(req.alternatives.trim(), 300) } : {}),
        mustNot: [...plan.mustNot, ...r.mustNot],
        context: r.context,
        ...(req.language ? { language: req.language } : {}),
      });
      return after(out, req, plan, { held, zones });

      async function after(out: Awaited<ReturnType<CallProvider["draft"]>>, req: DraftRequest, plan: CallPlan, x: { held: boolean; zones: string[] }): Promise<DraftResult> {
        if (!out.ok) return { ok: false, reason: out.reason, error: out.reason === "payment" || out.reason === "balance" ? `${f!.provider.name} needs ${out.error} before a call. Tell the user in one line; the payment page is theirs to open: ${out.payUrl ?? "the provider's app"}. Never take card details.` : `${f!.provider.name} said: ${out.error}` };
        const callId = o.callId ?? newCallId();
        if (!out.ready) {
          pending.set(callId, { draftId: out.id, req, plan, x });
          return { ok: true, needsInput: true, callId, questions: out.questions };
        }
        pending.delete(callId);
        const ap = await f!.provider.requestApproval(io, out.id);
        if (!ap.ok) return { ok: false, reason: ap.reason, error: ap.reason === "payment" || ap.reason === "balance" ? `${f!.provider.name} needs ${ap.error} first. Tell the user in one line; the page is theirs: ${ap.payUrl ?? "the provider's app"}.` : `${f!.provider.name} said: ${ap.error}` };
        const p: CallPlan = {
          ...plan,
          ...(ap.summary ? { summary: clip(ap.summary, 1200) } : {}),
          ...(ap.minutes ? { minutes: ap.minutes } : {}),
          ...(ap.costUsd ? { costUsd: round2(ap.costUsd) } : {}),
        };
        const decisionId = newDecisionId();
        const card: Bodies["decision"] = { decisionId, question: w.question(p.name), goLabel: p.at ? w.then : w.go, defaultOption: "hold", reversible: false, call: { callId, kind: "go", plan: p } };
        byDecision.set(decisionId, { callId, kind: "go" });
        const body: Call = { callId, connectionId: f!.connectionId, state: "needs_go", plan: p, decisionId, ...(req.taskId ? { taskId: req.taskId } : {}), ref: { draft: out.id, confirmation: ap.confirmationId, summary: ap.summary, held: x.held, zones: x.zones }, updatedAt: new Date(clock.now()).toISOString() };
        // Any change voids the earlier card: an older card for the same callee waiting for Go is withdrawn.
        for (const x of calls.values()) if (x.state === "needs_go" && x.plan.to === p.to && x.callId !== callId && x.decisionId && !answered.has(x.decisionId)) deps.log.append({ stream: "channel", origin: "system", kind: "decision_resolved", body: { decisionId: x.decisionId, option: "hold", by: "default" } });
        put(body, {});
        return { ok: true, needsInput: false, callId, card, plan: p };
      }
    },

    answer(text, callId) {
      const c = callId ? calls.get(callId) : [...calls.values()].find((x) => x.state === "question");
      if (!c || c.state !== "question" || !c.question) return { ok: false, error: "No call is waiting on a question right now." };
      const t = text.trim();
      if (!t) return { ok: false, error: "Pass the user's answer, in their words." };
      deps.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: c.question.decisionId, option: "reply", text: clip(t, 500), by: "user" } });
      return { ok: true };
    },

    callNow(callId) {
      const c = calls.get(callId);
      if (!c || c.state !== "needs_go" || !c.decisionId || answered.has(c.decisionId)) return { ok: false, error: "That call isn't waiting for your Go." };
      if (!c.plan.canNow) return { ok: false, error: "That call can't be placed now: it's too late where they are." };
      deps.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: c.decisionId, option: "go", by: "user", now: true } });
      return { ok: true };
    },

    async cancel(callId, by) {
      const c = calls.get(callId);
      if (!c || callEnded(c.state)) return false;
      const t = timers.get(callId);
      if (t !== undefined) clock.clearTimeout(t), timers.delete(callId);
      if (c.state === "needs_go") {
        if (c.decisionId && !answered.has(c.decisionId)) deps.log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: c.decisionId, option: "hold", by: "user" } });
        return true;
      }
      const f = await resolve().catch(() => undefined);
      const id = c.ref?.call ?? c.ref?.draft;
      if (f && id) await f.provider.cancel(ioOf(f), id).catch(() => false);
      if (c.state === "waiting") return void put(c, { state: "cancelled", by, endedAt: new Date(clock.now()).toISOString() }), true;
      await finish(callId, { state: "cancelled", by });
      return true;
    },

    result(callId, outcome, reached = true) {
      const c = calls.get(callId) ?? [...calls.values()].filter((x) => x.plan.from === "self" && !x.outcome && x.state !== "held").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      if (!c || c.plan.from !== "self") return { ok: false, error: "No call sheet with that callId. Only a call the user made themselves is recorded this way." };
      const text = outcome.trim();
      if (!text) return { ok: false, error: "Pass how it went, in the user's words (one line)." };
      const open = c.state === "needs_go" && !!c.decisionId && !answered.has(c.decisionId);
      put(c, { state: reached ? "done" : "no_answer", outcome: clip(text, 400), endedAt: c.endedAt ?? new Date(clock.now()).toISOString() });
      // Said in the conversation before the card was tapped: the sheet is answered too (by the partner, so nothing wakes again).
      if (open) {
        answered.add(c.decisionId!);
        deps.log.append({ stream: "channel", origin: "partner", kind: "decision_resolved", body: { decisionId: c.decisionId!, option: "go", by: "user" } });
      }
      return { ok: true };
    },

    block(number, why) {
      const n = e164(number);
      if (!n) return { ok: false, error: "That is not a full phone number (with the country code)." };
      if (!(file.doNotCall ?? []).some((x) => x.number === n)) file.doNotCall = [...(file.doNotCall ?? []), { number: n, at: new Date(clock.now()).toISOString(), ...(why ? { why: clip(why, 120) } : {}) }];
      save();
      deps.onChange?.();
      return { ok: true, number: n };
    },

    get: (id) => calls.get(id),

    calls() {
      const rank = (c: Call) => (c.state === "question" ? 0 : ["calling", "talking"].includes(c.state) ? 1 : c.state === "needs_go" ? 2 : c.state === "waiting" ? 3 : 4);
      return [...calls.values()]
        .filter((c) => !callEnded(c.state) || today(c.endedAt ?? c.updatedAt))
        .filter((c) => c.state !== "held" || today(c.updatedAt))
        .sort((a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 20)
        .map(({ ref: _r, ...c }) => c);
    },

    view(connectionId) {
      if (found?.connectionId !== connectionId) return undefined;
      const mine = [...calls.values()].filter((c) => c.placedAt && today(c.placedAt));
      return { provider: found.provider.name, capUsd: cap(), spentTodayUsd: spentToday(), calls: mine.length, ...(file.voice ? { voice: file.voice } : {}), doNotCall: (file.doNotCall ?? []).length, ...(file.rails ? { rails: file.rails } : {}) };
    },

    async setCap(usd, words) {
      const v = Math.round(Math.min(1000, Math.max(1, usd)) * 100) / 100;
      const f = await resolve().catch(() => undefined);
      if (!f) return { ok: false, reason: "no_phone" as const };
      const io = ioOf(f);
      const r = await f.provider.setCap(io, v).catch(() => undefined);
      if (!r?.ok) return { ok: false, reason: "provider" as const };
      // Raising needs the provider's yes: the owner's tap on the card is it.
      if (r.confirmationId) {
        const c = await f.provider.confirm(io, r.confirmationId, true, words).catch(() => undefined);
        if (!c?.ok) return { ok: false, reason: "provider" as const };
      }
      file.capUsd = v;
      file.rails = { ...(file.rails ?? { sampling: false, shared: false }), cap: true };
      save();
      deps.onChange?.();
      return { ok: true };
    },

    async voice(action, words) {
      const f = await resolve().catch(() => undefined);
      if (!f) return { ok: false, reason: "no_phone" };
      const io = ioOf(f);
      if (action === "refresh") {
        const v = await f.provider.voice(io).catch(() => undefined);
        if (v) (file.voice = v), save(), deps.onChange?.();
        return { ok: !!v, ...(v ? {} : { reason: "provider" as const }) };
      }
      const r = await f.provider.voiceChange(io, action).catch((e) => ({ ok: false as const, reason: "provider" as const, error: String((e as Error).message ?? e) }));
      if (!r.ok) {
        if (r.reason === "no_voice") (file.voice = { enrolled: false, on: false }), save(), deps.onChange?.();
        return { ok: false, reason: r.reason, ...(r.error ? { message: r.error } : {}) };
      }
      // A change that needs the person's yes: their tap on the phone card is it, with its own words.
      if (r.confirmationId) {
        const c = await f.provider.confirm(io, r.confirmationId, true, words).catch(() => undefined);
        if (!c?.ok) return { ok: false, reason: "provider", message: c && !c.ok ? c.error : undefined };
      }
      if (action === "on") file.voice = { enrolled: true, on: true };
      if (action === "off") file.voice = { enrolled: file.voice?.enrolled ?? true, on: false };
      if (action === "delete") file.voice = { enrolled: false, on: false };
      save();
      deps.onChange?.();
      return { ok: true, ...(r.url ? { url: r.url } : {}) };
    },

    stop() {
      stopped = true;
      off();
      offAdded();
      for (const t of timers.values()) clock.clearTimeout(t);
      for (const t of qTimers.values()) clock.clearTimeout(t);
      timers.clear();
      qTimers.clear();
    },
  };
  void resolve().catch(() => undefined);
  return api;
}

export { callWakes, renderCallEnded } from "@ducter/protocol";
