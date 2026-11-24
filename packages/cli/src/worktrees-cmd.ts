// D514: `ducter worktrees [--plan] [--json]`: every working copy Ducter made for a task, on each
// computer: what will be tidied away and when, what stays and why, and what was tidied so far.
// Changes nothing. `ducter worktrees keep <task>` / `release <task>` (part of its title or its id):
// keep that task's working copy whatever its age, or let the usual rules decide again.
import { fill, type ServerFrame, type TidyPlan, type TidyRow } from "@ducter/protocol";
import { tidySize, tidyWords, tidiedLine } from "@ducter/protocol/src/tidy.ts";
import { connect, type Conn } from "./client.ts";
import type { T, UiLocale } from "./i18n.ts";
import type { Target } from "./home.ts";
import { notReached } from "./talk.ts";

interface Opts {
  t: T;
  target: Target;
  json: boolean;
  lang: UiLocale;
  rest: string[];
  conn?: Conn;
  print?: (line: string) => void;
}

export async function cmdWorktrees(o: Opts): Promise<number> {
  const print = o.print ?? ((l: string) => console.log(l));
  const [verb, ...words] = o.rest;
  if (verb && verb !== "keep" && verb !== "release") {
    print(o.t("worktrees.usage"));
    return 2;
  }
  if (verb && !words.join(" ").trim()) {
    print(o.t("worktrees.usage"));
    return 2;
  }
  const c = o.conn ?? (await connect(o.target));
  if (!c) {
    print(await notReached(o.t, o.target));
    return 1;
  }
  try {
    c.send({ t: "worktrees_plan" });
    const f = await c.next((x: ServerFrame): x is Extract<ServerFrame, { t: "worktrees_plan_result" }> => x.t === "worktrees_plan_result", 120_000);
    if (!f?.plan) {
      print(o.json ? JSON.stringify({ ok: false, error: f?.error ?? "timeout" }) : o.t("worktrees.failed", { reason: f?.error ?? "no answer in two minutes" }));
      return 1;
    }
    if (!verb) {
      if (o.json) print(JSON.stringify({ ok: true, plan: f.plan }));
      else for (const l of planLines(o.t, o.lang, f.plan)) print(l);
      return 0;
    }
    const q = words.join(" ").trim();
    const hits = matchRows(f.plan.rows, q);
    if (hits.length !== 1) {
      print(hits.length ? o.t("worktrees.many", { q, list: hits.slice(0, 5).map((r) => r.title).join("; ") }) : o.t("worktrees.none", { q }));
      return 1;
    }
    const row = hits[0]!;
    c.send({ t: "past_mark", taskId: row.taskId, patch: { keepCopy: verb === "keep" } });
    print(o.json ? JSON.stringify({ ok: true, taskId: row.taskId, keepCopy: verb === "keep" }) : o.t(verb === "keep" ? "worktrees.kept" : "worktrees.released", { title: row.title }));
    return 0;
  } finally {
    if (!o.conn) c.close();
  }
}

/** A task by its id, or by part of its title (case-insensitive). */
export function matchRows(rows: TidyRow[], q: string): TidyRow[] {
  const byId = rows.filter((r) => r.taskId === q);
  if (byId.length) return byId;
  const low = q.toLowerCase();
  return rows.filter((r) => r.title.toLowerCase().includes(low));
}

const day = (iso: string) => iso.slice(5, 10);

/** The plan as lines: per computer its tidied line, then each copy with what happens to it. */
export function planLines(t: T, lang: UiLocale, plan: TidyPlan): string[] {
  const w = tidyWords(lang);
  const out = [t("worktrees.head")];
  const devices = [...new Set([...plan.rows.map((r) => r.device), ...Object.keys(plan.tidied)])];
  if (!devices.length) return [...out, "", t("worktrees.empty")];
  for (const d of devices) {
    const rows = plan.rows.filter((r) => r.device === d);
    const name = rows.find((r) => r.computer)?.computer ?? (d === "local" ? t("worktrees.home") : d);
    out.push("", name);
    const done = tidiedLine(lang, plan.tidied[d]);
    if (done) out.push(`  ${done}`);
    const goes = rows.filter((r) => r.verdict.tidy);
    const later = rows.filter((r) => !r.verdict.tidy && r.verdict.keep === "recent");
    const stays = rows.filter((r) => !r.verdict.tidy && r.verdict.keep !== "recent");
    const line = (r: TidyRow, what: string) => `  ${what}  ${r.title}${r.bytes !== undefined ? `  ${tidySize(r.bytes)}` : ""}\n      ${r.path}`;
    for (const r of goes) out.push(line(r, w.goes));
    for (const r of later) out.push(line(r, r.verdict.tidy ? w.goes : r.verdict.until ? fill(w.goesAt, { when: day(r.verdict.until) }) : w.keep.recent));
    for (const r of stays) out.push(line(r, r.verdict.tidy ? w.goes : w.keep[r.verdict.keep]));
    if (!rows.length && !done) out.push(`  ${t("worktrees.empty")}`);
  }
  return out;
}
