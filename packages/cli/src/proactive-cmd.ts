// D388: `ducter proactive replay [--days N] [--no-web]`: the home replays the last N days of the
// person's accounts through a dry proactive engine (core/src/proactive/replay.ts) and answers with
// only what it would have said, its sources, what it held back and why. Nothing is sent, no task
// opens, nothing lands in the conversation. A home command: it runs on the Ducter the CLI follows.
// D464: `ducter proactive week [--weeks N] [--json]`: what Ducter offered by itself each week, read
// from the home's Log, and what came of it (opened, Go, 有用, replied, faded, 这类不用告诉我), by
// source and by kind, against the one-in-twenty line (D453); interruptions apart; the weights now.
import { AHA_LINE, FIND_FROMS, FIND_KINDS, type FindKind, type OfferCounts, type ReplayReport, type ServerFrame, type ShadowGate, type ShadowItem, type ShadowReview, type ShadowRun, type WeekReport, type WeekRow } from "@ducter/protocol";
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
  /** D674: review --week (the last full week only) and --label id=yes|no|stop. */
  week?: boolean;
  labels?: string[];
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
  if (o.rest[0] === "cross") return cmdCross(o, print);
  if (o.rest[0] === "review") return cmdReview(o, print);
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

/** D502: one pass on the cheapest model: a minute or two at most. */
const CROSS_MS = 3 * 60_000;

/** D502: `ducter proactive cross`: one shadow pass now (logged like the daily one; nothing is said). */
async function cmdCross(o: Opts, print: (l: string) => void): Promise<number> {
  const c = o.conn ?? (await connect(o.target));
  if (!c) {
    print(await notReached(o.t, o.target));
    return 1;
  }
  try {
    c.send({ t: "proactive_cross" });
    const f = await c.next((x: ServerFrame): x is Extract<ServerFrame, { t: "proactive_cross_result" }> => x.t === "proactive_cross_result", CROSS_MS);
    if (!f?.run) {
      print(o.json ? JSON.stringify({ ok: false, error: f?.error ?? "timeout" }) : o.t("proactive.cross.failed", { reason: f?.error ?? "no answer in 3 minutes" }));
      return 1;
    }
    if (o.json) print(JSON.stringify({ ok: true, run: f.run }));
    else for (const l of crossLines(o.t, f.run)) print(l);
    return 0;
  } finally {
    if (!o.conn) c.close();
  }
}

/** D502: a shadow pass as lines: each finding with its facts and the detectors that also have it, then what code dropped. */
export function crossLines(t: T, r: ShadowRun): string[] {
  if (r.skipped) return [t(`proactive.cross.skipped.${r.skipped}` as Key, { error: r.error ?? "" })];
  const out = [t("proactive.cross.head", { facts: r.facts, n: r.findings.length, repeats: r.repeats })];
  for (const f of r.findings) {
    out.push("", `  ${f.text}`, `      ${t("proactive.cross.why", { why: f.why, next: f.next, c: Math.round(f.confidence * 100) })}`);
    out.push(`      ${t(f.alsoBy.length ? "proactive.cross.also" : "proactive.cross.only", { kinds: f.alsoBy.join(", "), facts: f.facts.join(" ") })}`);
  }
  if (r.dropped.length) out.push("", t("proactive.cross.dropped", { list: r.dropped.map((d) => `${d.why} ${d.n}`).join(", ") }));
  if (r.detectorsOnly.length) out.push(t("proactive.cross.detectorsOnly", { list: r.detectorsOnly.map((d) => d.kind).join(", ") }));
  return out;
}

/** D502: a week's shadow section under its offers; D674: the labels on it. */
function shadowBlock(t: T, s: NonNullable<WeekRow["shadow"]>): string[] {
  const out = ["", `  ${t("proactive.week.shadow", { runs: s.runs, n: s.findings, both: s.both, only: s.shadowOnly, detectors: s.detectorsOnly })}`];
  if (s.labels) out.push(`  ${t("proactive.week.labels", { labelled: s.labels.labelled, items: s.labels.items, yes: s.labels.yes, no: s.labels.no, stopped: s.labels.stopped })}`);
  for (const x of s.list) out.push(`    ${t("proactive.week.quote", { words: x.text.length > 80 ? `${x.text.slice(0, 79)}…` : x.text })} (${Math.round(x.confidence * 100)}%)${x.verdict ? `  ${t(`proactive.review.v.${x.verdict}` as Key)}` : ""}`);
  return out;
}

/** D674: the review answers in seconds (the Log and the ledger only). */
const REVIEW_MS = 60_000;

/**
 * D674: `ducter proactive review [--week] [--label id=yes|no|stop]`: the same list the morning
 * note's review card shows, from the same store; each --label writes one verdict there first.
 */
async function cmdReview(o: Opts, print: (l: string) => void): Promise<number> {
  const asks: { findingId: string; verdict: "yes" | "no" | "stop" }[] = [];
  for (const l of o.labels ?? []) {
    const [id, v] = l.split("=");
    if (!id || (v !== "yes" && v !== "no" && v !== "stop")) {
      print(o.t("proactive.usage"));
      return 2;
    }
    asks.push({ findingId: id, verdict: v });
  }
  const c = o.conn ?? (await connect(o.target));
  if (!c) {
    print(await notReached(o.t, o.target));
    return 1;
  }
  const answer = () => c.next((x: ServerFrame): x is Extract<ServerFrame, { t: "shadow_review_result" }> => x.t === "shadow_review_result", REVIEW_MS);
  try {
    let bad = 0;
    for (const a of asks) {
      c.send({ t: "shadow_label", ...a });
      const f = await answer();
      if (!f?.review) {
        bad++;
        if (!o.json) print(o.t(f?.error === "unknown_item" ? "proactive.review.unknown" : "proactive.review.failed", { id: a.findingId, reason: f?.error ?? "timeout" }));
      } else if (!o.json) print(o.t("proactive.review.kept", { id: a.findingId, verdict: o.t(`proactive.review.v.${a.verdict}` as Key) }));
    }
    c.send({ t: "shadow_review", ...(o.week ? { week: true } : {}) });
    const f = await answer();
    if (!f?.review) {
      print(o.json ? JSON.stringify({ ok: false, error: f?.error ?? "timeout" }) : o.t("proactive.review.failed", { id: "", reason: f?.error ?? "no answer in a minute" }));
      return 1;
    }
    if (o.json) print(JSON.stringify({ ok: !bad, review: f.review }));
    else for (const l of reviewLines(o.t, f.review, o.lang ?? "en")) print(l);
    return bad ? 1 : 0;
  } finally {
    if (!o.conn) c.close();
  }
}

/** D674: the review as lines: each item with its id, words, facts and verdict; then the gate. */
export function reviewLines(t: T, r: ShadowReview, lang: LangTag): string[] {
  const kindName = (k: FindKind) => (KIND_WORDS[k] ? words(KIND_WORDS[k], lang) : k);
  const open = r.items.filter((i) => !i.verdict && !i.stopped).length;
  const out = [t("proactive.review.head", { from: dayWords(t, r.from), to: dayWords(t, r.to), n: r.items.length, open })];
  if (!r.items.length) out.push(`  ${t("proactive.review.none")}`);
  for (const i of r.items) out.push("", ...itemLines(t, i, kindName));
  out.push("", ...gateLines(t, r.gate));
  return out;
}

function itemLines(t: T, i: ShadowItem, kindName: (k: FindKind) => string): string[] {
  const by = i.source === "detector" ? t("proactive.review.by.detector", { kind: kindName(i.alsoBy[0]!) }) : i.alsoBy.length ? t("proactive.review.by.both", { kinds: i.alsoBy.map(kindName).join(t("proactive.week.sep")) }) : t("proactive.review.by.shadow");
  const verdict = i.verdict ? t(`proactive.review.v.${i.verdict}` as Key) : i.stopped ? t("proactive.review.v.stopped") : t("proactive.review.v.open", { id: i.id });
  const out = [`  [${i.id}] ${i.text || kindName(i.alsoBy[0]!)}`];
  if (i.why || i.next) out.push(`      ${t("proactive.review.why", { why: i.why ?? "", next: i.next ?? "" })}`);
  for (const f of i.facts) out.push(`      ${[t(`proactive.review.src.${f.src}` as Key), f.at.slice(0, 10), f.label, f.from].filter(Boolean).join("  ")}`);
  out.push(`      ${by}${i.said ? `  ${t("proactive.review.said")}` : ""}  ${verdict}`);
  return out;
}

/** D674: where the gate stands, and the counts it stands on. */
export function gateLines(t: T, g: ShadowGate): string[] {
  const p = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);
  const out = [t(`proactive.review.gate.${g.why}` as Key, { weeks: g.weeks })];
  if (g.labelled) out.push(`  ${t("proactive.review.gate.counts", { weeks: g.weeks, labelled: g.labelled, mattered: g.mattered, dFound: g.detectors.found, dFlagged: g.detectors.flagged, dP: p(g.detectors.precision), sFound: g.shadow.found, sFlagged: g.shadow.flagged, sP: p(g.shadow.precision), together: g.together.found })}`);
  if (g.retire.length) out.push(`  ${t("proactive.review.gate.retire", { kinds: g.retire.join(", ") })}`);
  return out;
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
  if (r.gate) out.push("", ...gateLines(t, r.gate));
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
  if (w.shadow) out.push(...shadowBlock(t, w.shadow));
  return out;
}
