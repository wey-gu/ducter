// Phone calls (D189, D193; design/phone.md): what the clients and the partner see of a call Ducter
// places for the owner through a calling connection (Tuwa first). Pure types and small helpers,
// no I/O: core/src/phone.ts holds the calls, the rails and the provider.

/**
 * Where a call is, as the owner sees it (one word each, glossary `design/product-model.md`):
 *   needs_go  · the Go card is up (打给 X？ / Call X?)
 *   held      · the owner said Not now (or replied instead): nothing was dialed
 *   waiting   · Go given, waiting for an allowed hour (quiet hours, or the callee's 9:00–20:00)
 *   calling   · dialed, ringing (在打给 X… / Calling X…)
 *   talking   · on the line (通话中 / On the call)
 *   question  · the other side asked something only the owner can answer (对方在问 / They're asking)
 *   done      · ended; Tuwa reports an outcome
 *   uncertain · ended; Tuwa could not confirm the outcome (没能确认 / Couldn't confirm)
 *   automated · ended; it got through, but only a machine answered (voicemail, call screening,
 *               "not available"): no one talked (转到了自动语音 / Got an automated message)
 *   no_answer · nobody picked up, or busy (free)
 *   failed    · it did not go through (a provider refusal, a payment gate, the cap, a line that failed)
 *   cancelled · the owner hung up or withdrew it
 */
export type CallState = "needs_go" | "held" | "waiting" | "calling" | "talking" | "question" | "done" | "uncertain" | "automated" | "no_answer" | "failed" | "cancelled";

export const CALL_LIVE: readonly CallState[] = ["waiting", "calling", "talking", "question"];
export const CALL_ENDED: readonly CallState[] = ["done", "uncertain", "automated", "no_answer", "failed", "cancelled", "held"];
export const callLive = (s: CallState) => CALL_LIVE.includes(s);
export const callEnded = (s: CallState) => CALL_ENDED.includes(s);

/** What the Go card shows, all of it (D189 (4)): nothing is said on the call that isn't here. */
export interface CallPlan {
  to: string; // E.164, "+81312345678"
  name: string; // who, "Sushi Saito"
  goal: string; // one sentence, in the owner's language
  say: string[]; // 可以说 / May say: the booking name, a callback number
  keep?: string; // 不说 / Won't say: the bottom line the agent uses but never says (a budget)
  mustNot: string[]; // the owner's own "don't"s (Ducter's fixed rails are added on top, never shown as theirs)
  voice: "ducter" | "owner"; // 用 Ducter 的声音 / 用你的声音
  /** provider: a calling connection's line places it (从 Tuwa 的号码 / From a Tuwa number); self: the owner calls it themselves from a call sheet (D215). */
  from: "provider" | "self";
  provider: string; // "Tuwa"
  minutes: number; // the estimate
  costUsd: number; // the estimate, rounded to cents
  perMinUsd: number;
  calleeZone: string; // IANA zone the 9:00–20:00 rule was checked in
  at?: string; // ISO: when it will dial, when that is not now (after quiet hours, or in the callee's morning)
  /** D208: why it isn't now, when `at` is set: the callee's hours (their clock now and when it dials) or the owner's quiet hours. */
  wait?: CallWait;
  /** D208: the owner may say 现在就打 / Call now: only the courtesy hours pushed it, and the owner asked for it while here. */
  canNow?: boolean;
  /** D208: the owner's own number (they said so, or it is their saved phone): the callee's hours don't apply. */
  own?: boolean;
  summary?: string; // the provider's own approval summary, shown as is
  note?: string; // one line the owner should know (a US mobile)
  /** D215: a call sheet (通话单) the owner calls themselves: from = self, no provider, nothing to pay. */
  sheet?: CallSheet;
}

/**
 * D215: what the owner needs to make the call themselves when no line Ducter has reaches the
 * number's country (Tuwa's coverage, research/53 §8): the first thing to say, the questions to
 * ask, what not to say or share, what to note down. The words to speak are in the call's
 * language, the user's own where possible. A later provider that reaches the number (the owner's
 * own phone) takes the Go card instead; the sheet is only for numbers nothing can call.
 */
export interface CallSheet {
  why: "uncovered"; // no calling provider Ducter has (or could connect) calls that country
  open: string; // 先说 / Open with
  ask: string[]; // 要问 / Ask
  dont: string[]; // 别说 / Don't share: the owner's don'ts and what stays private
  note: string[]; // 记下 / Note down
}

/**
 * D208: why a call waits. callee: outside 9:00–20:00 where they are (`their` is their clock now,
 * `then` when it dials, both "HH:MM" in `zone`); late: also outside 8:00–21:00 there, which even
 * the owner's Call now doesn't cross; quiet: the owner's own quiet hours (a call they didn't just ask for).
 */
export interface CallWait {
  why: "callee" | "late" | "quiet";
  zone: string;
  their: string;
  then: string;
}

/** A question from the line (Tuwa's pendingQuestion): the top card, pushed even in quiet hours. */
export interface CallQuestion {
  text: string;
  choices: string[]; // the likely answers as buttons; a free reply is always there
  yesNo?: boolean; // a yes / no question: 可以 / 不行 (Yes / No) buttons answer it
  askedAt: string;
  decisionId: string;
}

/** One snapshot of a call; the latest event per callId wins (Log kind `phone_call`). */
export interface CallBody {
  callId: string;
  connectionId: string;
  state: CallState;
  plan: CallPlan;
  taskId?: string; // the task that asked for it (it may read the result)
  decisionId?: string; // the Go card
  question?: CallQuestion;
  approvedWords?: string; // the owner's own words passed to the provider with Go
  placedAt?: string;
  talkingSince?: string;
  endedAt?: string;
  outcome?: string; // the provider's outcome line, as reported
  summary?: string; // the provider's summary, as reported
  agreed?: string[]; // what was agreed, when the provider lists it
  transcript?: { who: "them" | "agent"; text: string }[];
  durationSec?: number;
  costUsd?: number;
  error?: string; // failed: why, in the provider's own words when it gave them (English; the clients map `reason`)
  reason?: CallFailReason;
  /** D208: a known cause the owner can fix, said with the outcome (screening: Google Voice's call screening answered). */
  hint?: "screening";
  /** D208: the owner said 现在就打 / Call now over the callee's courtesy hours. */
  callNow?: boolean;
  payUrl?: string; // failed on a payment gate: the provider's own page (Ducter never pays)
  by?: "owner" | "ducter"; // cancelled: who hung up (ducter = the 17-minute stop or the 90 s fallback)
}

/**
 * Why a call failed. provider: the provider refused it (with its words); call_failed: it was dialed
 * but the line failed, for a reason the provider gave or didn't; lost: Ducter couldn't tell whether a
 * confirmation that errored placed the call (check the provider's app; never dialed twice).
 */
export type CallFailReason = "payment" | "balance" | "cap" | "provider" | "call_failed" | "lost" | "unreachable" | "signed_out" | "too_long";

/** On hand's row and the opened call: the snapshot plus when it last changed. */
export type CallView = CallBody & { updatedAt: string };

/** The calling side of a connection, for Settings › Accounts (the phone card). */
export interface PhoneView {
  provider: string; // "Tuwa"
  capUsd: number; // Ducter's daily cap (D189 (8): $10)
  spentTodayUsd: number;
  calls: number; // calls today
  /** The owner's own voice on the provider: undefined = not known yet (not asked). */
  voice?: { enrolled: boolean; on: boolean };
  doNotCall: number; // how many numbers are on the do-not-call list
  /** What Ducter set on the provider at connect: its daily cap, voice sampling paused, Friends sync off. */
  rails?: { cap: boolean; sampling: boolean; shared: boolean };
}

/** The device sign-in in progress (RFC 8628): what Settings shows while the owner approves on their phone. */
export interface SignInView {
  url: string; // the MCP address being connected
  name: string; // "Tuwa"
  state: "waiting" | "done" | "denied" | "expired" | "failed";
  userCode?: string;
  verifyUrl?: string; // where to enter the code
  verifyUrlComplete?: string; // the same page with the code filled in (the QR / the button)
  expiresAt?: string;
  id?: string; // done: the connection id
  reconnect?: boolean; // signing in again to a connection that was signed out
  qr?: string[]; // the link with the code, as QR rows ("1" dark), for a phone to scan from a Mac
}

/** Tuwa's MCP address: the calling connection Accounts' offer and the home's 打电话 add (D193, D199). */
export const TUWA_MCP = "https://api.tuwa.ai/mcp";

/** The E.164 form of a number the partner or owner wrote, or undefined (no letters, 8–15 digits). */
export function e164(raw: string): string | undefined {
  const s = raw.trim().replace(/[\s().\- ]/g, "");
  const m = /^(?:\+|00)([1-9]\d{6,14})$/.exec(s);
  return m ? `+${m[1]}` : undefined;
}

/** A number for display: +81 3-1234-5678 style grouping is per country; this keeps it simple and honest. */
export function prettyNumber(n: string): string {
  const d = n.replace(/^\+/, "");
  // Country codes are prefix-free: a known three-digit one first, then two, then 1 and 7.
  const cc =
    ["852", "853", "855", "856", "880", "886", "971", "972", "966", "977", "234", "254", "212"].find((c) => d.startsWith(c)) ??
    ["20", "27", "30", "31", "32", "33", "34", "36", "39", "40", "41", "43", "44", "45", "46", "47", "48", "49", "51", "52", "53", "54", "55", "56", "57", "58", "60", "61", "62", "63", "64", "65", "66", "81", "82", "84", "86", "90", "91", "92", "93", "94", "95", "98"].find((c) => d.startsWith(c)) ??
    (d.startsWith("1") ? "1" : d.startsWith("7") ? "7" : d.slice(0, 2));
  const rest = d.slice(cc.length);
  const groups = rest.length > 8 ? [rest.slice(0, rest.length - 8), rest.slice(-8, -4), rest.slice(-4)] : [rest.slice(0, rest.length - 4), rest.slice(-4)];
  return `+${cc} ${groups.filter(Boolean).join(" ")}`;
}

// ---------- the partner's phone_call tool (packages/partner) and core/src/phone.ts ----------

/** The Go card a draft makes (the partner logs it as a `decision`). */
export interface DecisionCard {
  decisionId: string;
  question: string;
  goLabel: string;
  defaultOption: "go" | "hold";
  reversible: boolean;
  call?: { callId: string; kind: "go" | "question" | "sheet"; plan?: CallPlan; choices?: string[]; yesNo?: boolean };
}

export interface DraftRequest {
  to: string;
  name: string;
  goal: string;
  say?: string[];
  keep?: string;
  alternatives?: string;
  mustNot?: string[];
  voice?: "ducter" | "owner";
  calleeZone?: string; // where the person is now, only when known (they're travelling); else read from the number
  minutes?: number;
  own?: boolean; // D208: the owner said this number is theirs
  present?: boolean; // D208: the owner asked for this call just now, in the conversation (their quiet hours don't hold it)
  forName?: string; // whom the call is for, as they'd be named on the line
  person?: boolean; // a private person, not a business
  language?: string;
  taskId?: string;
  /** D215, a call sheet: the first thing the owner says, the questions, what to note down (in the call's language). */
  open?: string;
  ask?: string[];
  note?: string[];
}

export type DraftResult =
  | { ok: false; error: string; reason?: string }
  | { ok: true; needsInput: true; callId: string; questions: string[] }
  | { ok: true; needsInput: false; callId: string; card: DecisionCard; plan: CallPlan };


/** Whether a phone_call event wakes the partner: a call that ended on its own (not the owner's hang-up or Not now). */
export function callWakes(c: CallBody): boolean {
  if (!callEnded(c.state) || c.state === "held") return false;
  // D215: a call sheet: the owner's 打完了 tap wakes the partner (as an answered card); the outcome is the partner's own record.
  if (c.plan.from === "self") return false;
  if (c.state === "cancelled") return c.by === "ducter";
  return true;
}

/** D208: the fix for a known cause, said with the outcome (the partner says it in the user's language). */
export const SCREENING_HINT =
  "The number uses Google Voice call screening: Google answered, announced the caller to its owner (\"call from …\") and, as nobody pressed 1, told the caller \"not available\". The fix: answer and press 1, or turn off call screening in Google Voice's settings (Calls › Screen calls).";

/** The partner's line when a call ends (render.ts): the outcome exactly as reported. */
export function renderCallEnded(c: CallBody, taskTitle?: string): string {
  const who = `${c.plan.name} (${c.plan.to})`;
  const cost = [c.durationSec !== undefined ? `${Math.max(1, Math.round(c.durationSec / 60))} min` : "", c.costUsd !== undefined ? `$${c.costUsd.toFixed(2)}` : ""].filter(Boolean).join(", ");
  const task = c.taskId ? ` · task ${c.taskId}${taskTitle ? ` "${taskTitle}"` : ""} asked for this call: task_send it the outcome in one line` : "";
  const facts = `${c.outcome ? ` · reported: "${c.outcome}"` : ""}${c.agreed?.length ? ` · agreed: ${c.agreed.join("; ")}` : ""}${cost ? ` · ${cost}` : ""}`;
  const hint = c.hint === "screening" ? ` · ${SCREENING_HINT}` : "";
  const fix = c.hint ? ", then that fix, briefly" : "";
  // D215: a call sheet the user called themselves: no provider, nothing reported but what they said.
  if (c.plan.from === "self")
    return c.outcome
      ? `[call sheet: the user called it themselves] ${who} · they said: "${c.outcome}"${task}. Already recorded; nothing more to say unless they ask.`
      : `[call sheet: the user says they called] ${who}${task}. Ask them in one short line, in their language, how it went; then record it: phone_call do=result, callId ${c.callId}, outcome in their words.`;
  switch (c.state) {
    case "done":
      return `[call ended: done] ${who}${facts}${task}. Tell the user the outcome in one line, exactly as reported, in their language; never add what wasn't reported.`;
    case "uncertain":
      return `[call ended: uncertain] ${who}${facts}${task}. The provider could NOT confirm the outcome: say plainly it couldn't confirm (没能确认), and what it did hear, in one line.`;
    case "automated":
      return `[call ended: it got through, but only an automated message answered; nobody talked] ${who}${facts}${hint}${task}. Say in one line, in their language: the call connected, but a machine answered (what it said, briefly), so nothing was done${fix}. Never say it didn't go through or that the provider refused.`;
    case "no_answer":
      return `[call ended: no answer] ${who}${hint}${task}. Nobody picked up (it cost nothing). Say so in one line${fix}; offer to try again later only if it matters.`;
    case "cancelled":
      return `[call ended: Ducter hung up] ${who}${facts}${task}. It passed 17 minutes. Say so in one line, with what was reported.`;
    default: {
      // D208: a dialed call that failed says the provider's words; only a real refusal is a refusal.
      const why = c.reason === "call_failed" ? `it was dialed but didn't connect; the provider said: ${c.error ?? "no reason"}` : c.reason === "lost" ? `Ducter couldn't tell whether it was placed (${c.error ?? ""}); the user should check the provider's app before asking again` : `${c.reason === "provider" ? "the provider refused it: " : ""}${c.error ?? "no reason given"}`;
      return `[call didn't go through] ${who}: ${why}${c.payUrl ? " (the app shows the provider's payment page as a button)" : ""}${hint}${task}. Say so in one short line, in their language, with only what was reported, and the one thing the user can do${fix}; never take card details.`;
    }
  }
}

