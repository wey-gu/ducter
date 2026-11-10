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
 *   no_answer · nobody picked up, or busy (free)
 *   failed    · it did not go through (a provider error, a payment gate, the cap)
 *   cancelled · the owner hung up or withdrew it
 */
export type CallState = "needs_go" | "held" | "waiting" | "calling" | "talking" | "question" | "done" | "uncertain" | "no_answer" | "failed" | "cancelled";

export const CALL_LIVE: readonly CallState[] = ["waiting", "calling", "talking", "question"];
export const CALL_ENDED: readonly CallState[] = ["done", "uncertain", "no_answer", "failed", "cancelled", "held"];
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
  from: "provider"; // 从 Tuwa 号码 / From a Tuwa number (the owner's own number is not in v1)
  provider: string; // "Tuwa"
  minutes: number; // the estimate
  costUsd: number; // the estimate, rounded to cents
  perMinUsd: number;
  calleeZone: string; // IANA zone the 9:00–20:00 rule was checked in
  at?: string; // ISO: when it will dial, when that is not now (after quiet hours, or in the callee's morning)
  summary?: string; // the provider's own approval summary, shown as is
  note?: string; // one line the owner should know (a US mobile; mainland China likely won't connect)
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
  error?: string; // failed: why, in plain words (English; the clients map `reason`)
  reason?: CallFailReason;
  payUrl?: string; // failed on a payment gate: the provider's own page (Ducter never pays)
  by?: "owner" | "ducter"; // cancelled: who hung up (ducter = the 17-minute stop or the 90 s fallback)
}

export type CallFailReason = "payment" | "balance" | "cap" | "provider" | "unreachable" | "signed_out" | "too_long";

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

/** The E.164 form of a number the partner or owner wrote, or undefined (no letters, 8–15 digits). */
export function e164(raw: string): string | undefined {
  const s = raw.trim().replace(/[\s().\- ]/g, "");
  const m = /^(?:\+|00)([1-9]\d{6,14})$/.exec(s);
  return m ? `+${m[1]}` : undefined;
}

/** A number for display: +81 3-1234-5678 style grouping is per country; this keeps it simple and honest. */
export function prettyNumber(n: string): string {
  const d = n.replace(/^\+/, "");
  const cc = d.startsWith("1") ? "1" : ["81", "86", "44", "33", "49", "82", "61", "65", "66", "84", "91", "63", "52", "55", "39", "34", "31"].find((c) => d.startsWith(c)) ?? (["852", "886"].find((c) => d.startsWith(c)) || d.slice(0, 2));
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
  call?: { callId: string; kind: "go" | "question"; plan?: CallPlan; choices?: string[]; yesNo?: boolean };
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
  calleeZone?: string;
  minutes?: number;
  forName?: string; // whom the call is for, as they'd be named on the line
  person?: boolean; // a private person, not a business
  language?: string;
  taskId?: string;
}

export type DraftResult =
  | { ok: false; error: string; reason?: string }
  | { ok: true; needsInput: true; callId: string; questions: string[] }
  | { ok: true; needsInput: false; callId: string; card: DecisionCard; plan: CallPlan };


/** Whether a phone_call event wakes the partner: a call that ended on its own (not the owner's hang-up or Not now). */
export function callWakes(c: CallBody): boolean {
  if (!callEnded(c.state) || c.state === "held") return false;
  if (c.state === "cancelled") return c.by === "ducter";
  return true;
}

/** The partner's line when a call ends (render.ts): the outcome exactly as reported. */
export function renderCallEnded(c: CallBody, taskTitle?: string): string {
  const who = `${c.plan.name} (${c.plan.to})`;
  const cost = [c.durationSec !== undefined ? `${Math.max(1, Math.round(c.durationSec / 60))} min` : "", c.costUsd !== undefined ? `$${c.costUsd.toFixed(2)}` : ""].filter(Boolean).join(", ");
  const task = c.taskId ? ` · task ${c.taskId}${taskTitle ? ` "${taskTitle}"` : ""} asked for this call: task_send it the outcome in one line` : "";
  const facts = `${c.outcome ? ` · reported: "${c.outcome}"` : ""}${c.agreed?.length ? ` · agreed: ${c.agreed.join("; ")}` : ""}${cost ? ` · ${cost}` : ""}`;
  switch (c.state) {
    case "done":
      return `[call ended: done] ${who}${facts}${task}. Tell the user the outcome in one line, exactly as reported, in their language; never add what wasn't reported.`;
    case "uncertain":
      return `[call ended: uncertain] ${who}${facts}${task}. The provider could NOT confirm the outcome: say plainly it couldn't confirm (没能确认), and what it did hear, in one line.`;
    case "no_answer":
      return `[call ended: no answer] ${who}${task}. Nobody picked up (it cost nothing). Say so in one line; offer to try again later only if it matters.`;
    case "cancelled":
      return `[call ended: Ducter hung up] ${who}${facts}${task}. It passed 17 minutes. Say so in one line, with what was reported.`;
    default:
      return `[call didn't go through] ${who}: ${c.error ?? "the provider refused"}${c.payUrl ? " (the app shows the provider's payment page as a button)" : ""}${task}. Say so in one short line and the one thing the user can do; never take card details.`;
  }
}

