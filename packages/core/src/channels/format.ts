// D276: the partner's words in a chat app. The partner writes a little Markdown (bold, code, links,
// lists); each chat app gets it in its own native form, never as raw markers:
//  - Telegram: plain text plus message entities (offsets in UTF-16 code units, which JS strings
//    are), so nothing needs MarkdownV2's escaping and nothing the partner says can break a parse;
//  - Slack: mrkdwn, with &, < and > escaped in the words so nothing becomes a mention or a link.
// Long words are split at a paragraph, else a line, else a space, never inside a surrogate pair.

export type SpanKind = "bold" | "italic" | "code" | "pre" | "link";
export interface Span {
  kind: SpanKind;
  start: number;
  end: number;
  url?: string;
}
export interface Parsed {
  text: string;
  spans: Span[];
}

const SAFE_URL = /^(https?:\/\/|mailto:|tg:\/\/)/i;

/** A small Markdown subset to plain text and spans. Unclosed markers stay as they are. */
export function parseMarkdown(src: string): Parsed {
  let out = "";
  const spans: Span[] = [];
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  let fence: { start: number; body: string[] } | undefined;
  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li]!;
    const last = li === lines.length - 1;
    if (/^\s*```/.test(raw)) {
      if (!fence) {
        fence = { start: out.length, body: [] };
        continue;
      }
      const body = fence.body.join("\n");
      out += body;
      if (body) spans.push({ kind: "pre", start: fence.start, end: fence.start + body.length });
      fence = undefined;
      if (!last) out += "\n";
      continue;
    }
    if (fence) {
      fence.body.push(raw);
      continue;
    }
    let line = raw;
    let bold = false;
    const h = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
    if (h) (line = h[1]!), (bold = true);
    const li2 = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (li2) line = `${li2[1]}• ${li2[2]}`;
    const start = out.length;
    out += inline(line, start, spans);
    if (bold && out.length > start) spans.push({ kind: "bold", start, end: out.length });
    if (!last) out += "\n";
  }
  if (fence) {
    // An unclosed fence: its lines as they were.
    out += "```" + (fence.body.length ? "\n" + fence.body.join("\n") : "");
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  return { text: out, spans };
}

/** One line's inline marks; spans get offsets in the whole output (base). */
function inline(s: string, base: number, spans: Span[]): string {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === "\\" && i + 1 < s.length && /[\\`*_[\]()~]/.test(s[i + 1]!)) {
      out += s[i + 1];
      i += 2;
      continue;
    }
    if (c === "`") {
      const j = s.indexOf("`", i + 1);
      if (j > i + 1) {
        const body = s.slice(i + 1, j);
        spans.push({ kind: "code", start: base + out.length, end: base + out.length + body.length });
        out += body;
        i = j + 1;
        continue;
      }
    }
    if ((c === "*" && s[i + 1] === "*") || (c === "_" && s[i + 1] === "_")) {
      const mark = c + c;
      const j = s.indexOf(mark, i + 2);
      if (j > i + 2 && !/\s/.test(s[i + 2]!) && !/\s/.test(s[j - 1]!)) {
        const at = base + out.length;
        const body = inline(s.slice(i + 2, j), at, spans);
        spans.push({ kind: "bold", start: at, end: at + body.length });
        out += body;
        i = j + 2;
        continue;
      }
    }
    if ((c === "*" || c === "_") && s[i + 1] !== c) {
      // *italic* only at word edges (snake_case and 2 * 3 stay as they are); Chinese has no spaces,
      // so only Latin letters and digits count as inside a word.
      const prev = i ? s[i - 1]! : " ";
      const j = s.indexOf(c, i + 1);
      if (j > i + 1 && !/[A-Za-z0-9_]/.test(prev) && !/\s/.test(s[i + 1]!) && !/\s/.test(s[j - 1]!) && !/[A-Za-z0-9_]/.test(s[j + 1] ?? " ")) {
        const at = base + out.length;
        const body = inline(s.slice(i + 1, j), at, spans);
        spans.push({ kind: "italic", start: at, end: at + body.length });
        out += body;
        i = j + 1;
        continue;
      }
    }
    if (c === "[") {
      const m = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(s.slice(i));
      if (m && SAFE_URL.test(m[2]!)) {
        const at = base + out.length;
        const body = inline(m[1]!, at, spans);
        spans.push({ kind: "link", start: at, end: at + body.length, url: m[2]! });
        out += body;
        i += m[0].length;
        continue;
      }
    }
    out += c;
    i++;
  }
  return out;
}

// ---------- splitting ----------

/** Where to cut text into parts of at most max UTF-16 units: [start, end) pairs covering it. */
export function cutPoints(text: string, max: number): [number, number][] {
  const parts: [number, number][] = [];
  let at = 0;
  while (text.length - at > max) {
    const window = text.slice(at, at + max);
    let cut = window.lastIndexOf("\n\n");
    if (cut < max * 0.5) cut = window.lastIndexOf("\n");
    if (cut < max * 0.5) cut = window.lastIndexOf(" ");
    if (cut < max * 0.5) {
      // CJK and long tokens: after a sentence end if there is one, else hard.
      const end = Math.max(window.lastIndexOf("。"), window.lastIndexOf("！"), window.lastIndexOf("？"));
      cut = end >= max * 0.5 ? end + 1 : max;
    }
    // Never between the halves of a surrogate pair.
    const code = text.charCodeAt(at + cut - 1);
    if (code >= 0xd800 && code <= 0xdbff) cut--;
    parts.push([at, at + cut]);
    at += cut;
    while (at < text.length && (text[at] === "\n" || text[at] === " ")) at++;
  }
  if (at < text.length || !parts.length) parts.push([at, text.length]);
  return parts;
}

/** Parsed words split into parts of at most max, each with its own spans. */
export function splitParsed(p: Parsed, max: number): Parsed[] {
  return cutPoints(p.text, max).map(([s, e]) => ({
    text: p.text.slice(s, e),
    spans: p.spans
      .filter((x) => x.end > s && x.start < e)
      .map((x) => ({ ...x, start: Math.max(x.start, s) - s, end: Math.min(x.end, e) - s }))
      .filter((x) => x.end > x.start),
  }));
}

// ---------- Telegram ----------

export interface TgEntity {
  type: "bold" | "italic" | "code" | "pre" | "text_link";
  offset: number;
  length: number;
  url?: string;
}

export function toTelegram(p: Parsed): { text: string; entities: TgEntity[] } {
  const entities = p.spans.map((s): TgEntity => {
    const type = s.kind === "link" ? "text_link" : s.kind;
    return { type, offset: s.start, length: s.end - s.start, ...(s.url ? { url: s.url } : {}) };
  });
  return { text: p.text, entities };
}

// ---------- Slack ----------

/** &, < and > as Slack wants them in mrkdwn: the only three it needs escaped. */
export const slackEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function toSlack(p: Parsed): string {
  // Opening and closing marks at each offset; spans are well nested (parseMarkdown makes them so).
  const opens = new Map<number, Span[]>();
  const closes = new Map<number, Span[]>();
  for (const s of p.spans) {
    opens.set(s.start, [...(opens.get(s.start) ?? []), s]);
    closes.set(s.end, [s, ...(closes.get(s.end) ?? [])]);
  }
  const open = (s: Span) => (s.kind === "bold" ? "*" : s.kind === "italic" ? "_" : s.kind === "code" ? "`" : s.kind === "pre" ? "```\n" : `<${s.url!.replace(/[|>]/g, encodeURIComponent)}|`);
  const close = (s: Span) => (s.kind === "bold" ? "*" : s.kind === "italic" ? "_" : s.kind === "code" ? "`" : s.kind === "pre" ? "\n```" : ">");
  let out = "";
  for (let i = 0; i <= p.text.length; i++) {
    for (const s of closes.get(i) ?? []) out += close(s);
    if (i === p.text.length) break;
    for (const s of opens.get(i) ?? []) out += open(s);
    out += slackEscape(p.text[i]!);
  }
  return out;
}
