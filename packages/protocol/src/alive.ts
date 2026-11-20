/**
 * D425: the waiting line, alive. While the person waits, the clay partner acts out the step it is
 * on in a small loop of its own (the motion), beside one present-tense line in the person's terms
 * (the words). This is the one model both clients draw from (web `apps/web/src/alive.tsx`, Mac
 * `apps/desktop/internal/views/alive.go`, both checked on `fixtures/alive.json`); a row that waits
 * (a task at work, one of several asks under a message) uses the same pieces with its own figure.
 *
 * Rules:
 * - Words name the step from the person's side, with its object only when the person already
 *   knows it (a task's own title, the question they asked, where it looks: your calendar). Never a
 *   tool's name, never what it read or how much (proactive restraint).
 * - Cadence: a line stays at least DWELL_MS; a newer step arriving sooner waits its turn, and only
 *   the newest waits (no backlog). The change is a cross-fade with a small rise, never a jump.
 * - Past SLOW_MS on one step the reassurance joins under it, past LONG_MS it changes; from
 *   SETTLE_MS the loop calms to breathing (a long wait looks patient, not frantic).
 * - With no input from the person for REST_MS, or the window hidden, the figure holds still.
 *   Reduced motion: the step's pose, still; the words still change (a cross-fade, no rise).
 * - The end: the reply lands where the line stood (same top edge); the line goes at once and the
 *   reply's own entrance carries the eye. Nothing waits on an animation.
 */
import type { ActivityStep, PartnerActivity } from "./index.ts";

/** How the figure moves for a step. */
export type AliveMotion =
  | "think" // a slow sway with a blink: turning it over
  | "glance" // looks to one side, then the other: looking back, looking something up
  | "read" // the book pose, a small nod as a page turns: reading how a task is going
  | "lean" // leans in and back: passing your words on, setting something up
  | "look" // looks around, a little lift: out on the web
  | "settle" // past SETTLE_MS: breathing only
  | "still"; // reduced motion, resting, or hidden

/** Which face the figure wears for a motion: the idle face (its eyes blink) or the reading pose. */
export type AliveFace = "idle" | "working";

export const ALIVE = {
  /** A line stays at least this long before the next replaces it. */
  DWELL_MS: 1400,
  /** The reassurance joins under the line on one step. */
  SLOW_MS: 15_000,
  /** The reassurance changes to "carry on; I'll say when it's ready". */
  LONG_MS: 45_000,
  /** The loop calms to breathing on one step. */
  SETTLE_MS: 45_000,
  /** No input from the person for this long: the figure holds still (CPU, attention). */
  REST_MS: 90_000,
  /** An object in the line is clipped to this many columns (a wide character, as in Chinese, is two). */
  ABOUT_COLS: 34,
} as const;

/** Where the partner looks when the step is `looking` (D425): named, never what it found. */
export type AliveSource = "calendar" | "todos" | "accounts";

const MOTION: Record<ActivityStep | "result" | "relay", AliveMotion> = {
  thinking: "think",
  planning: "think",
  recalling: "glance",
  looking: "glance",
  checking_task: "read",
  result: "read",
  relay: "read",
  opening_task: "lean",
  messaging_task: "lean",
  web: "look",
};

/** The motion for a step at `stepMs` into it; `still` wins (reduced motion, resting, hidden). */
export function aliveMotion(step: ActivityStep | "result" | "relay", stepMs: number, still = false): AliveMotion {
  if (still) return "still";
  if (stepMs >= ALIVE.SETTLE_MS) return "settle";
  return MOTION[step] ?? "think";
}

/** The face a motion wears; the step's pose under `still` and `settle` too. */
export function aliveFace(step: ActivityStep | "result" | "relay"): AliveFace {
  return MOTION[step] === "read" ? "working" : "idle";
}

/** Columns a character takes: two for a wide one (CJK, kana, Hangul, full-width forms), else one. */
const cols = (c: string) => (/[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/u.test(c) ? 2 : 1);

/** An object clipped for the line: whitespace folded, end punctuation dropped, cut on a character with "…". */
export function clipAbout(s: string): string {
  const t = s.replace(/\s+/g, " ").trim().replace(/[。.？?！!]+$/u, "");
  let w = 0;
  for (const c of t) w += cols(c);
  if (w <= ALIVE.ABOUT_COLS) return t;
  let out = "";
  w = 0;
  for (const c of t) {
    if (w + cols(c) > ALIVE.ABOUT_COLS - 1) break;
    out += c;
    w += cols(c);
  }
  return out.trimEnd() + "…";
}

/** The line's i18n key and its one argument (the clipped object), for a step as the server sends it. */
export function aliveWords(a: Pick<PartnerActivity, "step"> & { about?: string; source?: AliveSource }): { key: string; arg?: string } {
  const about = a.about?.trim() ? clipAbout(a.about) : undefined;
  switch (a.step) {
    case "checking_task":
    case "messaging_task":
    case "opening_task":
    case "web":
      return about ? { key: `activity.${a.step}.about`, arg: about } : { key: `activity.${a.step}` };
    case "looking":
      return a.source ? { key: `activity.looking.${a.source}` } : { key: "activity.looking" };
    default:
      return { key: `activity.${a.step}` };
  }
}

/** The reassurance under the line at `stepMs` into one step: none, slow, or long. */
export function aliveSub(stepMs: number): "" | "activity.slow" | "activity.long" {
  return stepMs >= ALIVE.LONG_MS ? "activity.long" : stepMs >= ALIVE.SLOW_MS ? "activity.slow" : "";
}

/**
 * Cadence: what the line shows at `now`, given what it shows (since `shownAt`) and the newest line
 * wanted. Returns the line to show and, when the wanted one must wait, in how many ms to look again.
 */
export function aliveCadence(shown: string | undefined, shownAt: number, wanted: string, now: number): { line: string; changed: boolean; waitMs: number } {
  if (shown === undefined || shown === wanted) return { line: wanted, changed: shown !== wanted, waitMs: 0 };
  const left = shownAt + ALIVE.DWELL_MS - now;
  if (left > 0) return { line: shown, changed: false, waitMs: left };
  return { line: wanted, changed: true, waitMs: 0 };
}
