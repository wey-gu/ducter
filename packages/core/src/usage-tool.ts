// D591: the partner's answer to "这周谁用掉了我的额度？ / what used my allowance this week?", from
// the same count `ducter usage` and Settings › Overview read (D588's `usageReport`, from the Log).
// Read-only. Code gives the facts (shares, the task that used most of each agent, each agent's limit
// as last read); the model words the answer.
import { harnessName, tokensShort, usageShare, type AccountUsage, type UsageReport } from "@ducter/protocol";
import type { CoreMcpHub } from "./mcp.ts";
import { dateIn, offsetMin } from "./calendar.ts";

const pad = (n: number) => String(n).padStart(2, "0");

/** A moment in the person's zone, as the partner reads it: "2026-11-27 15:00". */
function at(iso: string, zone: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const off = offsetMin(ms, zone);
  const d = new Date(ms + off * 60_000);
  return `${dateIn(ms, zone)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** The report as the partner reads it: shares and names first, the counts after. */
export function usageFacts(r: UsageReport, limits: (harness: string) => AccountUsage | undefined, zone: string): Record<string, unknown> {
  if (!r.turns) return { ok: true, from: r.days[0]?.day, nothing: true, note: "nothing was used in these days: say so plainly" };
  const sum = (s: { input: number; output: number; cached: number }) => ({ input: tokensShort(s.input), ...(s.cached ? { of_it_cached: tokensShort(s.cached) } : {}), output: tokensShort(s.output) });
  return {
    ok: true,
    from: r.days[0]?.day,
    days: r.days.length,
    agents: r.harnesses.slice(0, 4).map((h) => {
      const u = limits(h.harness);
      const models = r.agents.filter((a) => a.harness === h.harness && a.model).slice(0, 3);
      return {
        agent: harnessName(h.harness),
        share: usageShare(h.share),
        ...(models.length > 1 ? { models: models.map((m) => `${m.model} ${usageShare(m.share)}`) } : models[0]?.model ? { model: models[0].model } : {}),
        ...(h.top ? { used_most_by: h.top.title, its_share_of_this_agent: usageShare(h.top.share) } : {}),
        ...(u?.windows.length ? { limit: u.windows.slice(0, 3).map((w) => ({ window: w.label, used: usageShare(w.used), ...(w.resetsAt ? { resets: at(w.resetsAt, zone) } : {}) })), ...(u.limited ? { used_up_now: true } : {}) } : {}),
      };
    }),
    tasks: r.tasks.slice(0, 5).map((t) => ({ title: t.title, share: usageShare(t.share), agent: harnessName(t.harness), started_by: t.by === "you" ? "the user" : "you, or what you look after" })),
    ...(r.taskCount > r.tasks.length ? { more_tasks: r.taskCount - r.tasks.length } : {}),
    ...(r.talk.turns ? { your_replies_to_the_user: { share: usageShare(r.talk.share), turns: r.talk.turns } } : {}),
    ...(r.looks.turns ? { ducter_own_checks: { share: usageShare(r.looks.share), turns: r.looks.turns } } : {}),
    in_all: { ...sum(r.total), turns: r.turns, tasks: r.taskCount },
    not_counted: "money: nothing is priced",
  };
}

export function registerUsageTool(mcp: CoreMcpHub, o: { report: (days: number, tzOffsetMin: number) => UsageReport; limits: (harness: string) => AccountUsage | undefined; zone: () => string; now: () => number }) {
  mcp.register(
    "partner",
    "usage",
    "What used the user's AI allowance (their agents' plan limits, or a paid key) over the last days, counted from Ducter's own records: each agent's share and the task that used most of it, the tasks that used most, your own replies to the user and Ducter's own checks, and each agent's limit as last read. Answer from it in a line or two with shares and task names; token counts only if asked.",
    { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 31, description: "Days back, today included; 7 for this week" } } },
    async (a: { days?: unknown }) => {
      const days = typeof a.days === "number" && Number.isFinite(a.days) ? Math.min(31, Math.max(1, Math.floor(a.days))) : 7;
      const zone = o.zone();
      return usageFacts(o.report(days, offsetMin(o.now(), zone)), o.limits, zone);
    },
  );
}
