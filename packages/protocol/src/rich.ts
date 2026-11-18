// D303: rich answers. The partner may put a small structured block in a reply, only when it truly
// helps: a table (a comparison), a chart (numbers over time, real numbers only), a checklist (a
// list to tick) or choices (a pick-one question; a tap sends that answer). It writes a fenced
// ```ducter-ui block holding one JSON object; the home validates it (parseRich) and stores
//   text: the message with each block replaced by its plain-text form, which always reads fine in
//         a chat app, a push, a copy, the partner's own history and an older client;
//   ui:   the validated blocks, each with the plain text it stands in for.
// A client that knows blocks splits the text at each block's plain text (splitRich) and draws the
// block there instead; one that doesn't shows the plain text. The drawing model (richModel: the
// table's numeric columns, the chart's scale and labels) is computed the same here and in the Go
// port (apps/desktop/internal/protocol/rich.go); fixtures/rich.json holds the cases both pass.
import { words, type LangTag } from "./lang.ts";

export type RichBlock =
  | { type: "table"; title?: string; columns: string[]; rows: string[][] }
  | { type: "chart"; kind: "bar" | "line"; title?: string; unit?: string; summary: string; points: { label: string; value: number }[] }
  | { type: "checklist"; title?: string; items: string[]; tell?: boolean }
  | { type: "choices"; options: string[] }
  // D347: the 加一台做事的电脑 / Add a computer for tasks card: one button that opens the guided sheet.
  | { type: "lend" };

/** A block as stored on an ai_msg: the block and the plain text that stands in for it in `text`. */
export type RichUi = RichBlock & { plain: string };

export const RICH_FENCE = "ducter-ui";

/** Size limits: a block is a glance, never a document. Over them, the block is not shown. */
export const RICH_LIMITS = {
  json: 4000, // characters of one block's JSON
  blocks: 3, // per message
  title: 60,
  table: { columns: [2, 6], rows: [1, 12], cell: 80, head: 40 },
  chart: { points: [2, 14], label: 16, unit: 8, summary: 200 },
  checklist: { items: [1, 12], item: 120 },
  choices: { options: [2, 5], option: 40 },
} as const;

// The punctuation a plain form is written with, by language (D292: a table, never a branch).
// `after` is what follows a part that already ends in its own punctuation ("…your app." then the
// next cell), so the separator never doubles it.
const PLAIN: { en: Punct } & Record<string, Punct> = {
  en: { colon: ": ", comma: ", ", after: " " },
  zh: { colon: "：", comma: "，", after: "" },
  ja: { colon: "：", comma: "、", after: "" },
};
interface Punct {
  colon: string;
  comma: string;
  after: string;
}
/** A part ending in a stop, a comma, a colon or a closing quote of its own, in any script. */
const ENDS_PUNCT = /[.!?;:,…。！？；：，、．｡]["'”’»」』）)]*$/u;
/** `part` then `sep`, unless the part already ends in its own punctuation: then only `after`. */
const joinPlain = (parts: string[], sep: string, after: string) =>
  parts.map((x, i) => (i === parts.length - 1 ? x : x + (ENDS_PUNCT.test(x) ? after : sep))).join("");

const len = (s: string) => [...s].length;
const str = (v: unknown, max: number, what: string, need = true): string => {
  if (v === undefined && !need) return "";
  if (typeof v !== "string") throw new Error(`${what} must be text`);
  const s = v.replace(/\s+/g, " ").trim();
  if (need && !s) throw new Error(`${what} is empty`);
  if (len(s) > max) throw new Error(`${what} is longer than ${max} characters`);
  return s;
};
const count = (n: number, [lo, hi]: readonly [number, number], what: string) => {
  if (n < lo || n > hi) throw new Error(`${what}: ${lo}–${hi}, got ${n}`);
};

/** A block from its JSON, checked against the schema and the limits; throws with why not. */
export function validateRich(raw: unknown): RichBlock {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("a block is one JSON object");
  const o = raw as Record<string, unknown>;
  const title = str(o.title, RICH_LIMITS.title, "title", false);
  const t = title ? { title } : {};
  switch (o.type) {
    case "table": {
      const L = RICH_LIMITS.table;
      if (!Array.isArray(o.columns)) throw new Error("table.columns must be a list");
      count(o.columns.length, L.columns, "table columns");
      const columns = o.columns.map((c, i) => str(c, L.head, `column ${i + 1}`, i > 0)); // the row labels' head may be blank
      if (!Array.isArray(o.rows)) throw new Error("table.rows must be a list");
      count(o.rows.length, L.rows, "table rows");
      const rows = o.rows.map((r, i) => {
        if (!Array.isArray(r) || r.length !== columns.length) throw new Error(`row ${i + 1} must have ${columns.length} cells`);
        return r.map((c, j) => (typeof c === "number" && Number.isFinite(c) ? fmtNum(c) : str(c, L.cell, `row ${i + 1} cell ${j + 1}`, j === 0)));
      });
      return { type: "table", ...t, columns, rows };
    }
    case "chart": {
      const L = RICH_LIMITS.chart;
      if (o.kind !== "bar" && o.kind !== "line") throw new Error('chart.kind is "bar" or "line"');
      if (!Array.isArray(o.points)) throw new Error("chart.points must be a list");
      count(o.points.length, L.points, "chart points");
      const points = o.points.map((p, i) => {
        const q = (p ?? {}) as Record<string, unknown>;
        if (typeof q.value !== "number" || !Number.isFinite(q.value)) throw new Error(`point ${i + 1} needs a real number value`);
        return { label: str(q.label, L.label, `point ${i + 1} label`), value: q.value };
      });
      const unit = str(o.unit, L.unit, "unit", false);
      const summary = str(o.summary, L.summary, "chart.summary (what the chart shows, in a sentence)");
      return { type: "chart", kind: o.kind, ...t, ...(unit ? { unit } : {}), summary, points };
    }
    case "checklist": {
      const L = RICH_LIMITS.checklist;
      if (!Array.isArray(o.items)) throw new Error("checklist.items must be a list");
      count(o.items.length, L.items, "checklist items");
      const items = o.items.map((x, i) => str(x, L.item, `item ${i + 1}`));
      return { type: "checklist", ...t, items, ...(o.tell === true ? { tell: true } : {}) };
    }
    case "choices": {
      const L = RICH_LIMITS.choices;
      if (!Array.isArray(o.options)) throw new Error("choices.options must be a list");
      count(o.options.length, L.options, "choices");
      const options = o.options.map((x, i) => str(x, L.option, `choice ${i + 1}`));
      if (new Set(options).size !== options.length) throw new Error("two choices are the same");
      return { type: "choices", options };
    }
    case "lend":
      return { type: "lend" };
  }
  throw new Error('type is "table", "chart", "checklist", "choices" or "lend"');
}

/** The block as plain text: what a chat app, a push, a copy and an older client show. */
export function plainOf(b: RichBlock, lang: LangTag | undefined): string {
  const p = words(PLAIN, lang);
  const head = "title" in b && b.title ? [b.title] : [];
  switch (b.type) {
    case "table": {
      const rows = b.rows.map((r) => {
        const rest = r.slice(1).map((c, j) => (c ? `${b.columns[j + 1]} ${c}` : "")).filter(Boolean);
        return `- ${rest.length ? joinPlain([r[0]!, joinPlain(rest, p.comma, p.after)], p.colon, p.after) : r[0]}`;
      });
      return [...head, ...rows].join("\n");
    }
    case "chart":
      return [...head, b.summary, joinPlain(b.points.map((x) => `${x.label} ${withUnit(fmtNum(x.value), b.unit)}`), p.comma, p.after)].join("\n");
    case "checklist":
      return [...head, ...b.items.map((x) => `- ${x}`)].join("\n");
    case "choices":
      return b.options.map((x) => `- ${x}`).join("\n");
    case "lend":
      return words(LEND_PLAIN, lang);
  }
}

/** D347: where the lend card's button leads, for a chat app, a push and an older client. */
const LEND_PLAIN: { en: string } & Record<string, string> = {
  en: "To add a computer for tasks: Your devices › Add a device.",
  zh: "加一台做事的电脑：你的设备 › 加一台设备。",
};

const FENCE = /^[ \t]*```[ \t]*ducter-ui[ \t]*\r?\n([\s\S]*?)(?:\r?\n[ \t]*```[ \t]*(?=\r?\n|$)|$)/gm;

/** What a block that couldn't be shown leaves: why, for the partner's own history. */
export interface RichDropped {
  error: string;
}

/**
 * The home's side: each ```ducter-ui block in a reply, validated, replaced in the text by its plain
 * form. A block that fails is left out (and said in `dropped`); if nothing else is left, its JSON
 * stays as an ordinary code block, so a message never vanishes.
 */
export function parseRich(src: string, lang: LangTag | undefined): { text: string; ui: RichUi[]; dropped: RichDropped[] } {
  const ui: RichUi[] = [];
  const dropped: RichDropped[] = [];
  let choices = 0;
  src = src.replace(/[\u0000\u0001]/g, "");
  let text = src.replace(FENCE, (_m, body: string) => {
    const json = body.trim();
    try {
      if (len(json) > RICH_LIMITS.json) throw new Error(`a block is at most ${RICH_LIMITS.json} characters`);
      if (ui.length >= RICH_LIMITS.blocks) throw new Error(`at most ${RICH_LIMITS.blocks} blocks in a message`);
      let raw: unknown;
      try {
        raw = JSON.parse(json);
      } catch {
        throw new Error("not valid JSON");
      }
      const b = validateRich(raw);
      if (b.type === "choices" && choices++) throw new Error("one choices block per message");
      const plain = plainOf(b, lang);
      ui.push({ ...b, plain });
      return `\u0000${plain}\u0000`;
    } catch (e) {
      dropped.push({ error: (e as Error).message });
      return "\u0001";
    }
  });
  // Each block stands as its own paragraph.
  text = text
    .replace(/[ \t]*\u0000([\s\S]*?)\u0000[ \t]*/g, "\n\n$1\n\n")
    .replace(/[ \t]*\u0001[ \t]*/g, "\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text && dropped.length) text = "```\n" + [...src.matchAll(FENCE)].map((m) => m[1]!.trim()).join("\n\n") + "\n```";
  return { text, ui, dropped };
}

/** What a client draws: the words and the blocks, in order. A block whose plain text is missing goes last. */
export type RichPart = { words: string } | { block: RichUi; index: number };

export function splitRich(text: string, ui: readonly RichUi[] | undefined): RichPart[] {
  const parts: RichPart[] = [];
  const blocks = (ui ?? []).map((b, index) => ({ b, index })).filter(({ b }) => knownBlock(b));
  if (!blocks.length) return text.trim() ? [{ words: text }] : [];
  let at = 0;
  const after: RichPart[] = [];
  for (const { b, index } of blocks) {
    const i = b.plain ? text.indexOf(b.plain, at) : -1;
    if (i < 0) {
      after.push({ block: b, index });
      continue;
    }
    const w = text.slice(at, i).trim();
    if (w) parts.push({ words: w });
    parts.push({ block: b, index });
    at = i + b.plain.length;
  }
  const rest = text.slice(at).trim();
  if (rest) parts.push({ words: rest });
  return [...parts, ...after];
}

/** A block this client can draw (a newer home may send kinds it doesn't know: their plain text shows). */
export function knownBlock(b: { type?: unknown }): b is RichUi {
  try {
    validateRich(b);
    return true;
  } catch {
    return false;
  }
}

/** The words of a message without its blocks (what the partner said around them). */
export function wordsOnly(text: string, ui: readonly RichUi[] | undefined): string {
  return splitRich(text, ui)
    .filter((p): p is { words: string } => "words" in p)
    .map((p) => p.words)
    .join("\n\n");
}

// ---------- the drawing model, the same on every client ----------

/** A number as the blocks show it: at most two decimals, trailing zeros dropped, thousands grouped. */
export function fmtNum(v: number): string {
  const r = Math.round(v * 100) / 100;
  const neg = r < 0;
  const [int, dec] = Math.abs(r).toFixed(2).split(".") as [string, string];
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const d = dec.replace(/0+$/, "");
  return `${neg && r !== 0 ? "-" : ""}${grouped}${d ? `.${d}` : ""}`;
}

/** A value with its unit: "%" and "°" hug the number; any other unit gets a space ("18.5 分钟", "9 USD"). */
export function withUnit(v: string, unit: string | undefined): string {
  if (!unit) return v;
  return /^[%°]/.test(unit) ? `${v}${unit}` : `${v} ${unit}`;
}

const NUMERIC = /^[-+−]?[$¥€£]?\s?\d[\d,]*(\.\d+)?\s?(%|[A-Za-z]{1,4}|[一-鿿]{1,2})?$/;

export interface ChartModel {
  lo: number;
  hi: number;
  ticks: { value: number; label: string }[];
  points: { label: string; value: number; text: string; frac: number }[];
  /** Values over each bar or point: only when there are few enough to read. */
  values: boolean;
}

export type RichModel =
  | { type: "table"; title: string; columns: string[]; rows: string[][]; numeric: boolean[] }
  | ({ type: "chart"; kind: "bar" | "line"; title: string; unit: string; summary: string } & ChartModel)
  | { type: "checklist"; title: string; items: string[]; tell: boolean }
  | { type: "choices"; options: string[] }
  | { type: "lend" };

const round9 = (x: number) => Math.round(x * 1e9) / 1e9;

/** At most this many steps between the chart's lines: a glance, not graph paper. */
export const CHART_STEPS = 5;

/**
 * The chart's scale: from zero (or below, for negatives) to a round top. The step is the smallest
 * 1, 2 or 5 times a power of ten that needs at most CHART_STEPS steps.
 */
export function chartScale(values: number[]): { lo: number; hi: number; step: number } {
  const min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  if (min === max) max = 1;
  let p = Math.pow(10, Math.floor(Math.log10((max - min) / CHART_STEPS)));
  for (;;) {
    for (const m of [1, 2, 5]) {
      const step = round9(m * p);
      const lo = round9(Math.floor(round9(min / step)) * step);
      const hi = round9(Math.ceil(round9(max / step)) * step);
      if (round9((hi - lo) / step) <= CHART_STEPS) return { lo, hi, step };
    }
    p *= 10;
  }
}

export function richModel(b: RichBlock): RichModel {
  switch (b.type) {
    case "table":
      return {
        type: "table",
        title: b.title ?? "",
        columns: b.columns,
        rows: b.rows,
        numeric: b.columns.map((_, j) => j > 0 && b.rows.some((r) => r[j]) && b.rows.every((r) => !r[j] || NUMERIC.test(r[j]!.trim()))),
      };
    case "chart": {
      const { lo, hi, step } = chartScale(b.points.map((p) => p.value));
      const ticks: ChartModel["ticks"] = [];
      for (let i = 0; ; i++) {
        const v = round9(lo + i * step);
        if (v > hi + step / 1e6) break;
        ticks.push({ value: v, label: fmtNum(v) });
      }
      return {
        type: "chart",
        kind: b.kind,
        title: b.title ?? "",
        unit: b.unit ?? "",
        summary: b.summary,
        lo,
        hi,
        ticks,
        points: b.points.map((p) => ({ label: p.label, value: p.value, text: withUnit(fmtNum(p.value), b.unit), frac: round9((p.value - lo) / (hi - lo)) })),
        values: b.points.length <= 8,
      };
    }
    case "checklist":
      return { type: "checklist", title: b.title ?? "", items: b.items, tell: b.tell === true };
    case "choices":
      return { type: "choices", options: b.options };
    case "lend":
      return { type: "lend" };
  }
}

/** What the partner reads of a message it sent with blocks (render.ts): which were shown. */
export function richShownWords(ui: readonly RichUi[] | undefined, dropped?: number): string {
  const kinds = (ui ?? []).map((b) => (b.type === "chart" ? `a ${b.kind} chart` : b.type === "choices" ? "choices the user can tap" : b.type === "lend" ? "the Add a computer for tasks card" : `a ${b.type}`));
  const shown = kinds.length ? ` [shown in the app as ${kinds.join(" and ")}, in place of its plain text above]` : "";
  const lost = dropped ? ` [${dropped === 1 ? "a ducter-ui block you wrote was" : `${dropped} ducter-ui blocks you wrote were`} not valid and not shown]` : "";
  return shown + lost;
}
