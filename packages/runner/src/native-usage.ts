// D288 (research/94): the facts a native frame carries that OAR 0.95.1's events drop: a
// compaction's sizes and the account's limits as a running session says them. Pure: oar.ts taps
// each frame (Session.rawEvents) and hands what it read to the Normalizer before the frame's events.
import type { HarnessEvent } from "@ducter/protocol/src/internal.ts";

/** A compaction's sizes as the native frame gave them. */
export interface NativeCompact {
  before?: number;
  after?: number;
  trigger?: string;
}

/** What Ducter reads from a native frame that OAR's events leave out. */
export interface NativeUsage {
  compact?: NativeCompact;
  limits?: NonNullable<HarnessEvent["limits"]>;
}

type Win = NonNullable<HarnessEvent["limits"]>["windows"][number];

const posInt = (v: unknown): number | undefined => {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
};
const rec = (v: unknown): Record<string, any> | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : undefined);
const HOUR_MS = 3_600_000;
/** Claude Code's rate-limit kinds (its SDK's `rateLimitType`) as usage windows (OAR's labels for get_usage). */
const CLAUDE_LIMITS: Record<string, { label: string; durationMs: number }> = {
  five_hour: { label: "Current session", durationMs: 5 * HOUR_MS },
  seven_day: { label: "Current week (all models)", durationMs: 168 * HOUR_MS },
  seven_day_opus: { label: "Current week (Opus)", durationMs: 168 * HOUR_MS },
  seven_day_sonnet: { label: "Current week (Sonnet)", durationMs: 168 * HOUR_MS },
};

/**
 *  - Claude Code `system/compact_boundary`: `compact_metadata.pre_tokens`, and `post_tokens` when
 *    it says (2.1.325's schema; OAR keeps only `trigger`); a subagent's own boundary is skipped;
 *  - Claude Code `rate_limit_event`: `rate_limit_info.status` "rejected" (no paid overage taking
 *    over) with `resetsAt` (unix s) and `rateLimitType`: that limit refuses requests until then.
 *    Its `utilization` is not read: its scale is not documented;
 *  - Codex `account/rateLimits/updated`: a `rateLimits` bucket shaped as `account/rateLimits/read`
 *    answers it (usedPercent 0..100, windowDurationMins, resetsAt unix s);
 *  - pi `compaction_end`: `result.tokensBefore`.
 */
export function nativeUsage(type: string, native: unknown): NativeUsage | undefined {
  const n = rec(native);
  if (!n) return undefined;
  if ((n.type === "system" && n.subtype === "compact_boundary") || type === "system/compact_boundary") {
    if (n.parent_tool_use_id) return undefined;
    const m = rec(n.compact_metadata);
    const before = posInt(m?.pre_tokens);
    const after = posInt(m?.post_tokens);
    return { compact: { ...(before ? { before } : {}), ...(after ? { after } : {}), ...(typeof m?.trigger === "string" ? { trigger: m.trigger } : {}) } };
  }
  if (n.type === "rate_limit_event" || type === "rate_limit_event") {
    const i = rec(n.rate_limit_info);
    if (!i) return undefined;
    if (i.status !== "rejected" || i.overageStatus === "allowed" || i.overageStatus === "allowed_warning") return { limits: { windows: [], limited: false } };
    const kind = typeof i.rateLimitType === "string" ? i.rateLimitType : undefined;
    const known = kind ? CLAUDE_LIMITS[kind] : undefined;
    const at = posInt(i.resetsAt);
    const windows: Win[] = known ? [{ id: kind, label: known.label, used: 1, ...(at ? { resetsAt: new Date(at * 1000).toISOString() } : {}), durationMs: known.durationMs }] : [];
    return { limits: { windows, limited: true } };
  }
  if (n.type === "compaction_end" || type === "compaction_end") {
    const before = posInt(rec(n.result)?.tokensBefore) ?? posInt(n.tokensBefore);
    return { compact: { ...(before ? { before } : {}), ...(typeof n.reason === "string" ? { trigger: n.reason } : {}) } };
  }
  if (n.method === "account/rateLimits/updated" || type === "account/rateLimits/updated") {
    const p = rec(n.params) ?? n;
    return codexLimits(rec(p.rateLimits));
  }
  return undefined;
}

/** One Codex rate-limit bucket (its primary and secondary windows) as usage windows. */
export function codexLimits(bucket: Record<string, any> | undefined): NativeUsage | undefined {
  if (!bucket) return undefined;
  const id = typeof bucket.limitId === "string" && bucket.limitId ? bucket.limitId : "codex";
  const name = typeof bucket.limitName === "string" && bucket.limitName ? bucket.limitName : id === "codex" ? "Codex" : id;
  const windows: Win[] = [];
  let limited = bucket.rateLimitReachedType != null;
  for (const k of ["primary", "secondary"] as const) {
    const w = rec(bucket[k]);
    const pct = typeof w?.usedPercent === "number" ? w.usedPercent : undefined;
    if (pct === undefined || pct < 0 || pct > 100) continue;
    const mins = posInt(w!.windowDurationMins);
    const at = posInt(w!.resetsAt);
    windows.push({ id: `${id}:${k}`, label: name, used: Math.round(pct * 100) / 10_000, ...(at ? { resetsAt: new Date(at * 1000).toISOString() } : {}), ...(mins ? { durationMs: mins * 60_000 } : {}) });
    if (pct >= 100) limited = true;
  }
  if (!windows.length) return undefined;
  const plan = typeof bucket.planType === "string" && bucket.planType ? bucket.planType : undefined;
  return { limits: { windows, limited, ...(plan ? { plan } : {}) } };
}
