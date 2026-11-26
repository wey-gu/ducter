// D588: `ducter usage [--days 7] [--json]`: what the tasks used over the last days, counted from the
// home's Log (read-only): in all, by AI agent and model, who started the work, the tasks that used
// most, and day by day in the person's own days. Says what it doesn't count yet.
import { harnessName, tokensShort, USAGE_DAYS_MAX, type ServerFrame, type TokenSum, type UsageReport } from "@ducter/protocol";
import { connect, type Conn } from "./client.ts";
import type { T } from "./i18n.ts";
import type { Target } from "./home.ts";
import { notReached } from "./talk.ts";

interface Opts {
  t: T;
  target: Target;
  json: boolean;
  days?: number;
  conn?: Conn;
  print?: (line: string) => void;
  /** Minutes east of UTC; the computer's own by default. */
  tz?: number;
}

export async function cmdUsage(o: Opts): Promise<number> {
  const print = o.print ?? ((l: string) => console.log(l));
  if (o.days !== undefined && (o.days < 1 || o.days > USAGE_DAYS_MAX)) {
    print(o.t("usage.usage"));
    return 2;
  }
  const c = o.conn ?? (await connect(o.target));
  if (!c) {
    print(await notReached(o.t, o.target));
    return 1;
  }
  try {
    const tz = o.tz ?? -new Date().getTimezoneOffset();
    c.send({ t: "usage_days", ...(o.days ? { days: o.days } : {}), tz, top: o.json ? 50 : 5 });
    const f = await c.next((x: ServerFrame): x is Extract<ServerFrame, { t: "usage_days_result" }> => x.t === "usage_days_result", 60_000);
    if (!f?.report) {
      print(o.json ? JSON.stringify({ ok: false, error: f?.error ?? "timeout" }) : o.t("usage.failed", { reason: f?.error ?? "no answer in a minute" }));
      return 1;
    }
    if (o.json) print(JSON.stringify({ ok: true, report: f.report }));
    else for (const l of usageLines(o.t, f.report)) print(l);
    return 0;
  } finally {
    if (!o.conn) c.close();
  }
}

/** One sum as words: its input (with the cached part when there is one) and its output. */
function sum(t: T, s: TokenSum): string {
  return s.cached ? t("usage.sum.cached", { input: tokensShort(s.input), cached: tokensShort(s.cached), output: tokensShort(s.output) }) : t("usage.sum", { input: tokensShort(s.input), output: tokensShort(s.output) });
}

const who = (harness: string, model?: string) => (model ? `${harnessName(harness)} (${model})` : harnessName(harness));

/** The report as lines: the head, in all, by agent, who started it, the tasks that used most, day by day, what isn't counted. */
export function usageLines(t: T, r: UsageReport): string[] {
  const n = r.days.length;
  const out = [t("usage.head", { n, from: r.days[0]?.day ?? r.since.slice(0, 10) })];
  if (!r.turns) return [...out, `  ${t("usage.none")}`, "", t("usage.notCounted")];
  out.push(`  ${t("usage.total", { sum: sum(t, r.total), turns: r.turns, tasks: r.taskCount })}`);
  out.push("", t("usage.agents"));
  for (const a of r.agents) out.push(`  ${t("usage.agent", { who: who(a.harness, a.model), sum: sum(t, a.tokens), turns: a.turns, tasks: a.tasks })}`);
  out.push("", t("usage.by"));
  if (r.by.you.input || r.by.you.output) out.push(`  ${t("usage.by.you", { sum: sum(t, r.by.you) })}`);
  if (r.by.partner.input || r.by.partner.output) out.push(`  ${t("usage.by.partner", { sum: sum(t, r.by.partner) })}`);
  // D591: what no task used: the partner's own replies and Ducter's own checks.
  if (r.talk.turns || r.looks.turns) {
    out.push("", t("usage.own"));
    if (r.talk.turns) out.push(`  ${t("usage.talk", { sum: sum(t, r.talk.tokens), turns: r.talk.turns })}`);
    if (r.looks.turns) out.push(`  ${t("usage.looks", { sum: sum(t, r.looks.tokens), turns: r.looks.turns })}`);
  }
  out.push("", t("usage.tasks", { n: r.tasks.length }));
  for (const k of r.tasks) out.push(`  ${t("usage.task", { title: k.title, who: who(k.harness, k.model), sum: sum(t, k.tokens), turns: k.turns })}`);
  out.push("", t("usage.daily"));
  for (const d of r.days) out.push(`  ${d.turns ? t("usage.day", { day: d.day, sum: sum(t, d.tokens), turns: d.turns }) : t("usage.day.none", { day: d.day })}`);
  out.push("", t("usage.notCounted"));
  return out;
}
