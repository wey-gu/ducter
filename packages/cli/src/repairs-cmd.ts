// D473: `ducter repairs [--weeks N] [--json]`: how Ducter's self-repair did on this home, week by
// week, counted from the home's Log (read-only): failures by class, how many Ducter mended by
// itself, how many the partner found another way for, how many reached the person; each kind of
// repair tried and how often it worked; the loop guard's holds; start failures by cause.
import type { RepairReport, RepairWeek, ServerFrame } from "@ducter/protocol";
import { connect, type Conn } from "./client.ts";
import type { T } from "./i18n.ts";
import type { Target } from "./home.ts";
import { notReached } from "./talk.ts";

interface Opts {
  t: T;
  target: Target;
  json: boolean;
  weeks?: number;
  conn?: Conn;
  print?: (line: string) => void;
}

export async function cmdRepairs(o: Opts): Promise<number> {
  const print = o.print ?? ((l: string) => console.log(l));
  if (o.weeks !== undefined && (o.weeks < 1 || o.weeks > 12)) {
    print(o.t("repairs.usage"));
    return 2;
  }
  const c = o.conn ?? (await connect(o.target));
  if (!c) {
    print(await notReached(o.t, o.target));
    return 1;
  }
  try {
    c.send({ t: "repairs_week", ...(o.weeks ? { weeks: o.weeks } : {}) });
    const f = await c.next((x: ServerFrame): x is Extract<ServerFrame, { t: "repairs_week_result" }> => x.t === "repairs_week_result", 60_000);
    if (!f?.report) {
      print(o.json ? JSON.stringify({ ok: false, error: f?.error ?? "timeout" }) : o.t("repairs.failed", { reason: f?.error ?? "no answer in a minute" }));
      return 1;
    }
    if (o.json) print(JSON.stringify({ ok: true, report: f.report }));
    else for (const l of repairLines(o.t, f.report)) print(l);
    return 0;
  } finally {
    if (!o.conn) c.close();
  }
}

const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : "–");

/** The report as lines: per week the failures and where each ended, then the repairs by kind, then the causes. */
export function repairLines(t: T, r: RepairReport): string[] {
  const out = [t("repairs.head")];
  for (const w of r.weeks) out.push("", ...weekLines(t, w));
  const causes = Object.entries(r.causes).sort((a, b) => b[1] - a[1]);
  if (causes.length) out.push("", t("repairs.causes", { list: causes.map(([k, n]) => `${k} ${n}`).join(", ") }));
  return out;
}

function weekLines(t: T, w: RepairWeek): string[] {
  const all = w.failures.start + w.failures.stall;
  const out = [t("repairs.week", { week: w.week })];
  if (!all) return [...out, `  ${t("repairs.none")}`];
  out.push(`  ${t("repairs.failures", { all, start: w.failures.start, stall: w.failures.stall })}`);
  out.push(`  ${t("repairs.ended", { healed: w.healed, partner: w.partnerFixed, person: w.reachedPerson, rate: pct(w.healed + w.partnerFixed, all) })}`);
  if (w.rethought) out.push(`  ${t("repairs.rethought", { n: w.rethought, held: w.held })}`);
  const hows = Object.entries(w.byHow).filter(([, c]) => c.tried);
  if (hows.length) out.push(`  ${t("repairs.hows", { list: hows.map(([h, c]) => `${h} ${c.worked}/${c.tried}`).join(", ") })}`);
  return out;
}
