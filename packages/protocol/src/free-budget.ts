// D449 (research/195): a free key's day, known and spent on what the person sees first. One free
// key (OpenRouter's free models, Gemini's free tier) feeds the partner, every task and every extra
// look; its cap is the provider's, and it comes back at the provider's own day boundary, not in an
// hour. Pure: the providers' documented limits, the next reset, and the provider's own words on a
// limit (its 429 body, the X-RateLimit-* headers OpenRouter repeats in it, Google's quota details
// and retry delay), read from what the agent's failed turn said.
import { nextClock } from "./limit-hit.ts";

/** A provider with a free tier Ducter knows the day of. */
export type FreeProvider = "openrouter" | "google";
export const FREE_PROVIDERS: readonly FreeProvider[] = ["openrouter", "google"];

export interface FreeTier {
  /** The provider's name as people know it. */
  name: string;
  /** Requests a day on the free tier as the provider documents it; absent: shown per project only (Google). */
  perDay?: number;
  /** The zone whose midnight starts the provider's day. */
  dayZone: string;
  /** What lifts the cap, in the person's words (zh, en). */
  more: { zh: string; en: string };
}

/**
 * research/189 §1, research/195: OpenRouter's free models, 50 requests a day with under $10 of
 * credit ever bought (1 000 above; DOCUMENTED), the day in UTC (INFERRED; its X-RateLimit-Reset
 * says the instant when present). Gemini's free tier: limits shown per project in AI Studio, the
 * day reset at midnight Pacific (DOCUMENTED).
 */
export const FREE_TIERS: Record<FreeProvider, FreeTier> = {
  openrouter: { name: "OpenRouter", perDay: 50, dayZone: "UTC", more: { zh: "充 $10 就能多很多", en: "$10 of credit lifts it a lot" } },
  google: { name: "Gemini", dayZone: "America/Los_Angeles", more: { zh: "在 Google AI Studio 开通付费就宽很多", en: "turning on billing in Google AI Studio lifts it a lot" } },
};

/** The free provider a pi model id names ("openrouter/…", "google/…"), else undefined. */
export function freeProviderOfModel(model: string | undefined): FreeProvider | undefined {
  const p = (model ?? "").split("/")[0]?.toLowerCase();
  return p === "openrouter" ? "openrouter" : p === "google" || p === "gemini" ? "google" : undefined;
}

/** When the provider's day starts again after `now`, ISO. */
export function freeDayReset(p: FreeProvider, now: number): string {
  return nextClock(0, 0, now, FREE_TIERS[p].dayZone);
}

/** The provider's day `now` falls in (its own calendar date), for counting. */
export function freeDayKey(p: FreeProvider, now: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FREE_TIERS[p].dayZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
}

/** What a provider's limit answer says, read from the agent's words. */
export interface FreeLimitRead {
  provider: FreeProvider;
  /** day: the day's cap is spent (back at the provider's day boundary); minute: a per-minute throttle. */
  scope: "day" | "minute";
  /** When it is back, ISO (the provider's own header or delay when it gave one, else its day boundary). */
  resetsAt: string;
  /** The cap and what is left, when the provider said them. */
  limit?: number;
  left?: number;
  /** Where the reset came from: the provider's own header or delay, or its documented day. */
  source: "header" | "documented";
}

const num = (s: string | undefined) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

/**
 * The provider's own limit, read from a failed turn's words (pi passes the provider's error
 * through). Undefined when the words aren't a known free-tier limit.
 *
 * OpenRouter (research/195): `Rate limit exceeded: free-models-per-day…` (the day's cap) or
 * `free-models-per-min` (20 a minute), with `X-RateLimit-Limit`, `X-RateLimit-Remaining` and
 * `X-RateLimit-Reset` (ms since the epoch) repeated in the body's `metadata.headers`.
 * Google: `RESOURCE_EXHAUSTED` / "exceeded your current quota", a quota id that names PerDay or
 * PerMinute and `…FreeTier`, `limit: N` in the message, and `retryDelay` / "Please retry in Ns".
 */
export function readFreeLimit(text: string | undefined, now: number): FreeLimitRead | undefined {
  const s = text ?? "";
  if (!s.trim()) return undefined;
  const header = (name: string) => num(new RegExp(`"?${name}"?\\s*[:=]\\s*"?(\\d+)"?`, "i").exec(s)?.[1]);
  if (/free-models-per-(day|min)/i.test(s) || (/openrouter/i.test(s) && /x-ratelimit/i.test(s))) {
    const minute = /free-models-per-min/i.test(s);
    const limit = header("X-RateLimit-Limit");
    const left = header("X-RateLimit-Remaining");
    let resetMs = header("X-RateLimit-Reset");
    // Seconds, not ms, on some answers: either way an instant in the future.
    if (resetMs !== undefined && resetMs < 1e12) resetMs *= 1000;
    const fromHeader = resetMs !== undefined && resetMs > now ? new Date(resetMs).toISOString() : undefined;
    const scope = minute ? "minute" : "day";
    const resetsAt = fromHeader ?? (minute ? new Date(now + 60_000).toISOString() : freeDayReset("openrouter", now));
    return { provider: "openrouter", scope, resetsAt, ...(limit !== undefined ? { limit } : {}), ...(left !== undefined ? { left } : {}), source: fromHeader ? "header" : "documented" };
  }
  if (/RESOURCE_EXHAUSTED|exceeded your current quota|generativelanguage\.googleapis\.com\/generate_content_free_tier/i.test(s)) {
    const perDay = /PerDay|per[_ ]day|daily/i.test(s);
    const perMinute = /PerMinute|per[_ ]minute/i.test(s);
    const limit = num(/limit:\s*(\d+)/i.exec(s)?.[1]) ?? num(/"quotaValue"\s*:\s*"?(\d+)/i.exec(s)?.[1]);
    const delay = num(/retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/i.exec(s)?.[1]) ?? num(/retry in (\d+(?:\.\d+)?)\s*s/i.exec(s)?.[1]);
    // The day's cap: named so, or a delay too long to be a minute's.
    if (perDay || (!perMinute && delay !== undefined && delay > 120)) return { provider: "google", scope: "day", resetsAt: freeDayReset("google", now), ...(limit !== undefined ? { limit, left: 0 } : {}), source: "documented" };
    const back = now + Math.ceil((delay ?? 60) * 1000);
    return { provider: "google", scope: "minute", resetsAt: new Date(back).toISOString(), ...(limit !== undefined ? { limit } : {}), source: delay !== undefined ? "header" : "documented" };
  }
  return undefined;
}

/**
 * D449: what Settings › Partner says of a free key's day (only on a free key): about how many
 * requests are left today when the cap is known, when the day comes back, and that the second
 * look is off on it.
 */
export interface FreeBudget {
  provider: FreeProvider;
  /** The day's cap (documented, or as the provider said it); absent when only the provider's page shows it. */
  limit?: number;
  /** About how many are left today (Ducter's count since the provider last said, never below 0). */
  left?: number;
  /** When the provider's day starts again, ISO. */
  resetsAt: string;
  /** The day's cap is spent: everything waits for resetsAt. */
  out?: true;
}

/** Left this many or fewer: the partner's own turns come first (D449's reserve). */
export const FREE_RESERVE = 8;
