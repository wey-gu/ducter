// D388: `ducter proactive replay [--days N] [--no-web]`: the home replays the last N days of the
// person's accounts through a dry proactive engine (core/src/proactive/replay.ts) and answers with
// only what it would have said, its sources, what it held back and why. Nothing is sent, no task
// opens, nothing lands in the conversation. A home command: it runs on the Ducter the CLI follows.
import type { ReplayReport, ServerFrame } from "@ducter/protocol";
import { connect, type Conn } from "./client.ts";
import type { T } from "./i18n.ts";
import type { Target } from "./home.ts";
import { notReached } from "./talk.ts";

interface Opts {
  t: T;
  target: Target;
  json: boolean;
  rest: string[];
  days?: number;
  noWeb?: boolean;
  /** Test seam. */
  conn?: Conn;
  print?: (line: string) => void;
}

/** A replay reads and triages several days of mail on the agent: minutes. */
const REPLAY_MS = 20 * 60_000;

export async function cmdProactive(o: Opts): Promise<number> {
  const print = o.print ?? ((l: string) => console.log(l));
  if (o.rest[0] !== "replay" || (o.days !== undefined && (o.days < 1 || o.days > 7))) {
    print(o.t("proactive.usage"));
    return 2;
  }
  const days = o.days ?? 3;
  const c = o.conn ?? (await connect(o.target));
  if (!c) {
    print(await notReached(o.t, o.target));
    return 1;
  }
  try {
    if (!o.json) print(o.t("proactive.running", { days, home: o.target.kind === "remote" ? o.target.name : "this computer" }));
    c.send({ t: "proactive_replay", days, web: !o.noWeb });
    const f = await c.next((x: ServerFrame): x is Extract<ServerFrame, { t: "proactive_replay_result" }> => x.t === "proactive_replay_result", REPLAY_MS);
    if (!f?.report) {
      print(o.json ? JSON.stringify({ ok: false, error: f?.error ?? "timeout" }) : o.t("proactive.failed", { reason: f?.error ?? "no answer in 20 minutes" }));
      return 1;
    }
    if (o.json) print(JSON.stringify({ ok: true, report: f.report }));
    else for (const l of replayLines(o.t, f.report)) print(l);
    return 0;
  } finally {
    if (!o.conn) c.close();
  }
}

/** The report as lines: each find with its sources (indented), then what it held back, left open, and how it knew. */
export function replayLines(t: T, r: ReplayReport): string[] {
  const out = [t("proactive.head", { days: r.days, mode: r.mode, zone: r.zone, mail: r.looked.mail, events: r.looked.events, mentions: r.looked.mentions, read: r.read, noted: r.noted })];
  if (r.problem) out.push(t("proactive.problem", { why: r.problem.why }));
  out.push("", t("proactive.said"));
  if (!r.said.length) out.push(`  ${t("proactive.none")}`);
  for (const s of r.said) {
    out.push(`  [${s.rung}] ${s.kind}: ${s.text}`);
    for (const h of s.how) out.push(`      ${[h.src, h.at.slice(0, 10), h.from, h.what, h.says, h.url].filter(Boolean).join("  ")}`);
    if (s.unknown) out.push(`      ${t("proactive.unknown", { what: s.unknown })}`);
    if (s.untouched) out.push(`      ${s.untouched}`);
  }
  if (r.held.length) out.push("", t("proactive.held", { reasons: r.held.map((h) => `${h.reason} ${h.n}`).join(", ") }));
  for (const x of r.open) out.push(t("proactive.open", { name: x.name, fields: x.fields.join("/"), state: x.state }));
  if (r.web) out.push(t("proactive.looks", { n: r.looks }));
  const why = r.noticed.filter((n) => n.why);
  if (why.length) {
    out.push("", t("proactive.how"));
    for (const n of why) out.push(`  ${n.kind}: ${n.text}`, `      ${n.why}`);
  }
  return out;
}
