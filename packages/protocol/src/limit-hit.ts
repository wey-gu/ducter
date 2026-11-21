// D297 (research/101), D435: a turn that failed because the agent's usage limit ran out, and when the
// limit resets. Pure: the runner hands it the failed turn's outcome (OAR's failure class, its
// resetsAt and the agent's own words) and the limits the session said before it; core decides
// what the task does (wait for the reset, or hand it to another agent).
//
// Where the reset comes from, best first:
//   1. event: OAR's `quota` failure with `resetsAt` (Claude Code's latest rate_limit_event that
//      says "rejected" with a reset: OAR's claudeLimitReset);
//   2. limits: a window the session said is used up, with its reset (Claude Code's rate_limit_event
//      as Ducter reads it, Codex's account/rateLimits/updated, which codex sends with the
//      error's own snapshot before the turn fails);
//   3. words: the agent's message (Codex: "…try again at 3:12 PM." / "…at Nov 18th, 2026 3:12 PM.";
//      Claude Code: "…resets 3pm (Asia/Shanghai)", and its older "usage limit reached|<unix s>");
//   4. provider (D449): the provider's own limit answer passed through by the agent (pi on a free
//      key: OpenRouter's free-models-per-day with its X-RateLimit-Reset, Gemini's free-tier quota),
//      read even when OAR didn't class the failure as a limit;
//   5. none: the reset is unknown (DeepSeek Harness, a throttle).
import type { HarnessEvent } from "./internal.ts";
import { readFreeLimit, type FreeProvider } from "./free-budget.ts";

export type LimitFailure = "quota" | "rate_limited";

export interface LimitHit {
  harness: string;
  failure: LimitFailure;
  /** When the limit resets, ISO; absent when unknown or already past. */
  resetsAt?: string;
  source: "event" | "limits" | "words" | "provider" | "none";
  /** D449: the free tier whose cap this is (pi on an OpenRouter or Gemini free key). */
  free?: FreeProvider;
  /** The agent's own words, clipped (shown on hover only, never as the line). */
  said?: string;
}

/** A failed turn's end as the runner logs it (normalize.ts turn_ended raw). */
export interface FailedOutcome {
  outcome?: string;
  failure?: string;
  reason?: string;
  resetsAt?: string;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Whether this failed turn is a usage limit (OAR's `quota`) or a throttle that outlived the agent's own retries (`rate_limited`). */
export function isLimitFailure(o: FailedOutcome | undefined): o is FailedOutcome & { failure: LimitFailure } {
  return !!o && o.outcome === "failed" && (o.failure === "quota" || o.failure === "rate_limited");
}

/** The limit a failed turn hit, or undefined when it wasn't one. `seen`: the limits the session said last. */
export function limitHit(harness: string, o: FailedOutcome | undefined, seen: HarnessEvent["limits"] | undefined, now: number): LimitHit | undefined {
  // D449: the provider's own words on a free tier's cap count as a limit whatever OAR called it.
  const free = o?.outcome === "failed" ? readFreeLimit(o.reason, now) : undefined;
  if (!isLimitFailure(o) && !free) return undefined;
  const said = o!.reason?.trim() ? o!.reason.trim().slice(0, 300) : undefined;
  const failure: LimitFailure = free ? (free.scope === "day" ? "quota" : "rate_limited") : (o as { failure: LimitFailure }).failure;
  const base = { harness, failure, ...(said ? { said } : {}), ...(free ? { free: free.provider } : {}) };
  const future = (iso: string | undefined) => {
    const t = Date.parse(iso ?? "");
    return Number.isFinite(t) && t > now ? new Date(t).toISOString() : undefined;
  };
  const ev = future(o!.resetsAt);
  if (ev) return { ...base, resetsAt: ev, source: "event" };
  const fromProvider = future(free?.resetsAt);
  if (fromProvider) return { ...base, resetsAt: fromProvider, source: "provider" };
  const fromSeen = seenReset(seen, now);
  if (fromSeen) return { ...base, resetsAt: fromSeen, source: "limits" };
  const words = said ? resetFromWords(said, now) : undefined;
  if (words) return { ...base, resetsAt: words, source: "words" };
  return { ...base, source: "none" };
}

/** The reset of a window the session said is used up (the latest, so the task never wakes into the same wall). */
export function seenReset(seen: HarnessEvent["limits"] | undefined, now: number): string | undefined {
  if (!seen?.limited) return undefined;
  let best: number | undefined;
  for (const w of seen.windows) {
    const t = Date.parse(w.resetsAt ?? "");
    if (!Number.isFinite(t) || t <= now || w.used < 0.999) continue;
    if (best === undefined || t > best) best = t;
  }
  return best === undefined ? undefined : new Date(best).toISOString();
}

/**
 * A reset time in the agent's own words, in the home's local time unless the words name a zone.
 * Codex (codex-rs protocol/src/error.rs `retry_suffix`): "try again at 3:12 PM" today, else
 * "try again at Nov 18th, 2026 3:12 PM". Claude Code: "resets 3pm", "resets 3:12am (Asia/Shanghai)",
 * and the older "usage limit reached|1736460000". Undefined when nothing reads as a future time.
 */
export function resetFromWords(text: string, now: number, zone?: string): string | undefined {
  const pipe = /usage limit reached\|(\d{9,11})\b/i.exec(text);
  if (pipe) {
    const t = Number(pipe[1]) * 1000;
    return t > now ? new Date(t).toISOString() : undefined;
  }
  const dated = /try again at ([A-Za-z]{3})[a-z]* (\d{1,2})(?:st|nd|rd|th)?,? (\d{4}),? (\d{1,2}):(\d{2}) ?([AP]M)/i.exec(text);
  if (dated) {
    const mo = MONTHS.indexOf(dated[1]!.toLowerCase());
    if (mo < 0) return undefined;
    const t = zonedTime(Number(dated[3]), mo, Number(dated[2]), hour24(Number(dated[4]), dated[6]!), Number(dated[5]), zone);
    return t > now ? new Date(t).toISOString() : undefined;
  }
  const clock = /try again at (\d{1,2}):(\d{2}) ?([AP]M)/i.exec(text) ?? /resets (?:at )?(\d{1,2})(?::(\d{2}))? ?([ap]m)\b(?: \(([A-Za-z_]+(?:\/[A-Za-z_+-]+)*)\))?/i.exec(text);
  if (clock) {
    const z = clock[4] && validZone(clock[4]) ? clock[4] : zone;
    return nextClock(hour24(Number(clock[1]), clock[3]!), Number(clock[2] ?? 0), now, z);
  }
  return undefined;
}

const hour24 = (h: number, ampm: string) => (h % 12) + (/p/i.test(ampm) ? 12 : 0);

function validZone(z: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: z });
    return true;
  } catch {
    return false;
  }
}

/** The zone's offset from UTC at `t`, in ms (local time = UTC + offset). */
function offsetAt(t: number, zone?: string): number {
  if (!zone) return -new Date(t).getTimezoneOffset() * 60_000;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t));
  const n = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour") % 24, n("minute"), n("second")) - Math.floor(t / 1000) * 1000;
}

/** A wall-clock time in the zone (the home's own when absent) as an instant. */
function zonedTime(y: number, mo: number, d: number, h: number, mi: number, zone?: string): number {
  const guess = Date.UTC(y, mo, d, h, mi);
  const first = guess - offsetAt(guess, zone);
  return guess - offsetAt(first, zone);
}

/** The next time the zone's clock reads h:mi (today, or tomorrow when that is past). */
export function nextClock(h: number, mi: number, now: number, zone?: string): string {
  const local = new Date(now + offsetAt(now, zone));
  let t = zonedTime(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), h, mi, zone);
  if (t <= now) t = zonedTime(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1, h, mi, zone);
  return new Date(t).toISOString();
}

/** What a session said of its limits, merged by window id (a newer word replaces an older one). */
export function mergeLimits(had: HarnessEvent["limits"] | undefined, now: NonNullable<HarnessEvent["limits"]>): NonNullable<HarnessEvent["limits"]> {
  if (!had) return now;
  const windows = [...had.windows];
  for (const w of now.windows) {
    const i = w.id ? windows.findIndex((x) => x.id === w.id) : -1;
    if (i >= 0) windows[i] = { ...windows[i]!, ...w };
    else windows.push(w);
  }
  return { ...had, ...now, windows, ...(now.limited === undefined ? { limited: had.limited } : {}) };
}
