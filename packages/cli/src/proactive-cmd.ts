// D388: `ducter proactive replay [--days N] [--no-web]`: the home replays the last N days of the
// person's accounts through a dry proactive engine (core/src/proactive/replay.ts) and answers with
// only what it would have said, its sources, what it held back and why. Nothing is sent, no task
// opens, nothing lands in the conversation. A home command: it runs on the Ducter the CLI follows.
// D464: `ducter proactive week [--weeks N] [--json]`: what Ducter offered by itself each week, read
// from the home's Log, and what came of it (opened, Go, 有用, replied, faded, 这类不用告诉我), by
// source and by kind, against the one-in-twenty line (D453); interruptions apart; the weights now.
import { AHA_LINE, FIND_FROMS, FIND_KINDS, type FindKind, type OfferCounts, type ReplayReport, type ServerFrame, type WeekReport, type WeekRow } from "@ducter/protocol";
import { words, type LangTag } from "@ducter/protocol";
import { KIND_WORDS } from "@ducter/core/src/proactive/words.ts";
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
  weeks?: number;
  noWeb?: boolean;
  /** The CLI's language (kind names, dates). */
  lang?: string;
  /** Test seam. */
  conn?: Conn;
  print?: (line: string) => void;
}

/** A replay reads and triages several days of mail on the agent: minutes. */
const REPLAY_MS = 20 * 60_000;

export async function cmdProactive(o: Opts): Promise<number> {
  const print = o.print ?? ((l: string) => console.log(l));
  if (o.rest[0] === "week") return cmdWeek(o, print);
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

/** Counting reads the Log only: seconds. */
const WEEK_MS = 60_000;

async function cmdWeek(o: Opts, print: (l: string) => void): Promise<number> {
  if (o.weeks !== undefined && (o.weeks < 1 || o.weeks > 12)) {
    print(o.t("proactive.usage"));
    return 2;
  }
  const c = o.conn ?? (await connect(o.target));
  if (!c) {
    print(await notReached(o.t, o.target));
    return 1;
  }
  try {
    c.send({ t: "proactive_week", ...(o.weeks ? { weeks: o.weeks } : {}) });
    const f = await c.next((x: ServerFrame): x is Extract<ServerFrame, { t: "proactive_week_result" }> => x.t === "proactive_week_result", WEEK_MS);
    if (!f?.report) {
      print(o.json ? JSON.stringify({ ok: false, error: f?.error ?? "timeout" }) : o.t("proactive.week.failed", { reason: f?.error ?? "no answer in a minute" }));
      return 1;
    }
    if (o.json) print(JSON.stringify({ ok: true, report: f.report }));
    else for (const l of weekLines(o.t, f.report, o.lang ?? "en")) print(l);
    return 0;
  } finally {
    if (!o.conn) c.close();
  }
}

/** "11 月 16 日" / "Nov 16": the month's name and the order from the table. */
function dayWords(t: T, day: string): string {
  const [, m, d] = day.split("-").map(Number) as [number, number, number];
  return t("proactive.week.date", { month: t("proactive.week.months").split("|")[m - 1]!, d });
}
const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : "–");
/** Terminal columns: a CJK character (or a full-width mark) takes two. */
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;
const cols = (s: string) => [...s].reduce((n, ch) => n + (WIDE.test(ch) ? 2 : 1), 0);
const padEnd = (s: string, w: number) => s + " ".repeat(Math.max(0, w - cols(s)));
const padStart = (s: string, w: number) => " ".repeat(Math.max(0, w - cols(s))) + s;
const COUNT_KEYS: (keyof OfferCounts)[] = ["shown", "opened", "go", "useful", "replied", "held", "muted", "faded", "waiting"];

/** One table: a row per name, a column per count. */
function table(t: T, rows: [string, OfferCounts][]): string[] {
  const heads = t("proactive.week.cols").split("|");
  const nameW = Math.max(...rows.map(([n]) => cols(n))) + 2;
  const colW = heads.map((h) => Math.max(cols(h), 3) + 2);
  const out = [`    ${padEnd("", nameW)}${heads.map((h, i) => padStart(h, colW[i]!)).join("")}`];
  for (const [name, c] of rows) out.push(`    ${padEnd(name, nameW)}${COUNT_KEYS.map((k, i) => padStart(String(c[k]), colW[i]!)).join("")}`);
  return out;
}

type Key = Parameters<T>[0];

/** The report as lines, in the CLI's language: per week the offers against the line, interruptions apart, by source and kind, what was taken up; then the weights. */
export function weekLines(t: T, r: WeekReport, lang: LangTag): string[] {
  const kindName = (k: FindKind) => (KIND_WORDS[k] ? words(KIND_WORDS[k], lang) : k);
  const out = [t("proactive.week.head", { zone: r.zone, mode: t(`proactive.week.mode.${r.mode}` as Key) })];
  for (const w of r.weeks) out.push("", ...weekBlock(t, w, kindName));
  out.push("", t("proactive.week.weights"));
  const sep = t("proactive.week.sep");
  const kinds = FIND_KINDS.filter((k) => r.weights.kind[k] !== undefined && r.weights.kind[k] !== 1).map((k) => `${kindName(k)} ×${r.weights.kind[k]}`);
  if (kinds.length) out.push(t("proactive.week.wKinds", { list: kinds.join(sep) }));
  if (r.weights.senders.length) out.push(t("proactive.week.wSenders", { list: r.weights.senders.map((s) => `${s.sender} ×${s.w}`).join(sep) }));
  if (!kinds.length && !r.weights.senders.length) out.push(t("proactive.week.wNone"));
  return out;
}

function weekBlock(t: T, w: WeekRow, kindName: (k: FindKind) => string): string[] {
  const out = [t(w.current ? "proactive.week.current" : "proactive.week.range", { from: dayWords(t, w.from), to: dayWords(t, w.to) })];
  const o = w.offers;
  if (!o.shown) out.push(`  ${t("proactive.week.none")}`);
  else {
    const verdict = t(o.taken / o.shown >= AHA_LINE ? "proactive.week.above" : "proactive.week.below");
    out.push(`  ${t("proactive.week.offers", { shown: o.shown, taken: o.taken, rate: pct(o.taken, o.shown), verdict })}`);
    out.push(`  ${t("proactive.week.answered", { n: o.answered, rate: pct(o.answered, o.shown) })}`);
  }
  const i = w.interruptions;
  out.push(`  ${i.shown ? t("proactive.week.interrupts", { n: i.shown, taken: i.taken }) : t("proactive.week.noInterrupts")}`);
  if (o.shown) {
    const src = FIND_FROMS.filter((s) => w.bySource[s]?.shown).map((s): [string, OfferCounts] => [t(`proactive.week.src.${s}` as Key), w.bySource[s]!]);
    out.push("", `  ${t("proactive.week.bySource")}`, ...table(t, src));
    const kinds = FIND_KINDS.filter((k) => w.byKind[k]?.shown)
      .sort((a, b) => w.byKind[b]!.shown - w.byKind[a]!.shown)
      .map((k): [string, OfferCounts] => [kindName(k), w.byKind[k]!]);
    out.push("", `  ${t("proactive.week.byKind")}`, ...table(t, kinds));
  }
  if (w.takenUp.length) {
    out.push("", `  ${t("proactive.week.taken")}`);
    const byW = Math.max(...w.takenUp.map((x) => cols(t(`proactive.week.by.${x.by}` as Key)))) + 2;
    const kindW = Math.max(...w.takenUp.map((x) => cols(kindName(x.kind)))) + 2;
    for (const x of w.takenUp) {
      const clipped = x.text.length > 80 ? `${x.text.slice(0, 79)}…` : x.text;
      const said = t(x.offer ? "proactive.week.quote" : "proactive.week.quoteNow", { words: clipped });
      out.push(`    ${padEnd(t(`proactive.week.by.${x.by}` as Key), byW)}${padEnd(kindName(x.kind), kindW)}${said}`);
    }
  }
  return out;
}
