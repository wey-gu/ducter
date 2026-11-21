// D439: 拿去就能发 / Ready to send: the document a task shows is checked page by page before the
// person sees it (design/documents.md). Code reads what code can read for certain:
//
// - A PDF, with Poppler where this computer has it (pdfinfo, pdffonts, pdftotext -bbox, pdftoppm):
//   every word's box against its page (text past an edge or the margin), the fonts (a CJK script
//   with no font that carries it, mojibake, boxes), blank pages (no words and no ink), a last page
//   of a line or two, body text too small, placeholders, the person's language, the page count
//   asked for; and the pages as pictures for the task to look at. Without Poppler: what the file's
//   own dictionaries say (pages, fonts), read here.
// - A deck (.pptx) and a Word file (.docx), from their XML: text longer than its box holds, shapes
//   off the slide, a table wider than the page, blank slides, placeholders, language, count. With
//   LibreOffice on this computer, also as a PDF (and so as pictures).
//
// What it finds goes back to the task once (the task fixes it in the same turn); what is still so
// on the next report rides on it as `doc.left`, said under the result. Nothing found: nothing said.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { inflateRawSync } from "node:zlib";
import type { Bodies, DocAsk, DocCheck, DocFinding, DocFormat, LogEvent, MediaRef } from "@ducter/protocol";
import { DOC_LEFT_MAX, docAsk, docFindingForTask, docFindingWords, docFormat, docStem } from "@ducter/protocol";

// ---------- running a tool, bounded ----------

const TOOL_MS = 20_000;

/** A program on this computer's PATH (or undefined). */
export function tool(name: string): string | undefined {
  try {
    return Bun.which(name) ?? undefined;
  } catch {
    return undefined;
  }
}

async function run(cmd: string[], ms = TOOL_MS): Promise<{ ok: boolean; out: string; bytes?: Uint8Array }> {
  try {
    const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "ignore", stdin: "ignore" });
    const timer = setTimeout(() => p.kill(), ms);
    const buf = new Uint8Array(await new Response(p.stdout).arrayBuffer());
    const code = await p.exited;
    clearTimeout(timer);
    return { ok: code === 0, out: new TextDecoder().decode(buf), bytes: buf };
  } catch {
    return { ok: false, out: "" };
  }
}

// ---------- what a document's pages hold ----------

export interface Word {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: string;
}

export interface PageFacts {
  w: number;
  h: number;
  words: Word[];
  /** How much of the page is not white (0..1), and of its outermost strips, when it was drawn. */
  ink?: Ink;
}

export interface FontFacts {
  name: string;
  embedded: boolean;
}

/** What was read from a PDF. `pages` empty with `count` set: the text couldn't be read here. */
export interface PdfFacts {
  count: number;
  pages: PageFacts[];
  fonts: FontFacts[];
  /** All its text (for placeholders and language), when it could be read. */
  text?: string;
}

const decodeEntities = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

/** pdftotext -bbox's XHTML: each page's size and its words' boxes. */
export function parseBbox(xhtml: string): PageFacts[] {
  const pages: PageFacts[] = [];
  for (const pm of xhtml.matchAll(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g)) {
    const words: Word[] = [];
    for (const wm of pm[3]!.matchAll(/<word xMin="([-\d.]+)" yMin="([-\d.]+)" xMax="([-\d.]+)" yMax="([-\d.]+)">([\s\S]*?)<\/word>/g))
      words.push({ x0: Number(wm[1]), y0: Number(wm[2]), x1: Number(wm[3]), y1: Number(wm[4]), t: decodeEntities(wm[5]!) });
    pages.push({ w: Number(pm[1]), h: Number(pm[2]), words });
  }
  return pages;
}

/** pdffonts' table: each font's name and whether it is embedded. */
export function parsePdffonts(out: string): FontFacts[] {
  const lines = out.split("\n");
  const at = lines.findIndex((l) => /^-{5,}/.test(l));
  if (at < 0) return [];
  return lines
    .slice(at + 1)
    .filter((l) => l.trim())
    .map((l) => {
      const tok = l.trim().split(/\s+/);
      // name … emb sub uni objnum gen
      const emb = tok[tok.length - 5];
      return { name: tok[0] ?? "", embedded: emb === "yes" };
    });
}

/** What a page drawn small shows: how much of it isn't white, and of its outermost strips. */
export interface Ink {
  all: number;
  left: number;
  right: number;
}

const DARK = 235;

/** One binary PGM (P5) at `at`: its ink, and where the next one starts. */
function onePgm(b: Uint8Array, at: number): { ink: Ink; next: number } | undefined {
  const head = new TextDecoder("latin1").decode(b.subarray(at, at + 64));
  const m = head.match(/^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/);
  if (!m) return undefined;
  const w = Number(m[1]);
  const h = Number(m[2]);
  const off = at + m[0].length;
  if (off + w * h > b.length || !w || !h) return undefined;
  // The outermost 1.5% of the page's width on each side (at least one column).
  const strip = Math.max(1, Math.round(w * 0.015));
  let all = 0;
  let left = 0;
  let right = 0;
  for (let y = 0; y < h; y++) {
    const row = off + y * w;
    for (let x = 0; x < w; x++) {
      if (b[row + x]! >= DARK) continue;
      all++;
      if (x < strip) left++;
      else if (x >= w - strip) right++;
    }
  }
  return { ink: { all: all / (w * h), left: left / (strip * h), right: right / (strip * h) }, next: off + w * h };
}

/** Each page's ink from pdftoppm's concatenated PGM output (one per page). */
export function inksOfPgms(b: Uint8Array): Ink[] {
  const out: Ink[] = [];
  let i = 0;
  while (i < b.length - 2) {
    const r = onePgm(b, i);
    if (!r) break;
    out.push(r.ink);
    i = r.next;
  }
  return out;
}

/** Without Poppler: the page count and fonts from the file's own dictionaries (not compressed object streams). */
export function pdfDictFacts(bytes: Uint8Array): PdfFacts | undefined {
  const s = new TextDecoder("latin1").decode(bytes);
  if (!s.startsWith("%PDF")) return undefined;
  const count = (s.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  const fonts = new Map<string, FontFacts>();
  for (const m of s.matchAll(/\/BaseFont\s*\/([^\s/<>[\]()]+)/g)) {
    const name = m[1]!.replace(/#([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
    if (!fonts.has(name)) fonts.set(name, { name, embedded: /^[A-Z]{6}\+/.test(name) });
  }
  return { count, pages: [], fonts: [...fonts.values()] };
}

export interface ReadOptions {
  /** Draw the pages as pictures into this folder (for the task to look at). */
  picturesTo?: string;
  /** Tools (tests): undefined = this computer's PATH. */
  tools?: { pdftotext?: string; pdffonts?: string; pdfinfo?: string; pdftoppm?: string; soffice?: string };
}

const toolsOf = (o?: ReadOptions) =>
  o?.tools ?? { pdftotext: tool("pdftotext"), pdffonts: tool("pdffonts"), pdfinfo: tool("pdfinfo"), pdftoppm: tool("pdftoppm"), soffice: tool("soffice") ?? tool("libreoffice") };

/** Reads a PDF: its words page by page, its fonts, each page's ink; pictures when asked. */
export async function readPdf(path: string, o: ReadOptions = {}): Promise<{ facts?: PdfFacts; pictures: string[] }> {
  const t = toolsOf(o);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(readFileSync(path));
  } catch {
    return { pictures: [] };
  }
  const dict = pdfDictFacts(bytes);
  if (!dict) return { pictures: [] };
  if (!t.pdftotext) return { facts: dict, pictures: [] };
  const [bbox, fonts, gray] = await Promise.all([
    run([t.pdftotext, "-bbox", "-enc", "UTF-8", path, "-"]),
    t.pdffonts ? run([t.pdffonts, path]) : Promise.resolve({ ok: false, out: "" }),
    t.pdftoppm ? run([t.pdftoppm, "-r", "30", "-gray", path]) : Promise.resolve({ ok: false, out: "", bytes: undefined }),
  ]);
  if (!bbox.ok) return { facts: { ...dict, count: dict.count }, pictures: [] };
  const pages = parseBbox(bbox.out);
  if (!pages.length && dict.count) return { facts: dict, pictures: [] };
  const inks = gray.ok && gray.bytes ? inksOfPgms(gray.bytes) : [];
  pages.forEach((p, i) => inks[i] !== undefined && (p.ink = inks[i]));
  const facts: PdfFacts = {
    count: pages.length,
    pages,
    fonts: fonts.ok ? parsePdffonts(fonts.out) : dict.fonts,
    text: pages.map((p) => p.words.map((w) => w.t).join(" ")).join("\n"),
  };
  const pictures: string[] = [];
  if (o.picturesTo && t.pdftoppm) {
    mkdirSync(o.picturesTo, { recursive: true });
    const prefix = join(o.picturesTo, "page");
    const r = await run([t.pdftoppm, "-r", "60", "-png", path, prefix], 60_000);
    if (r.ok)
      for (const f of readdirSync(o.picturesTo).filter((f) => f.startsWith("page") && f.endsWith(".png")).sort())
        pictures.push(join(o.picturesTo, f));
  }
  return { facts, pictures };
}

// ---------- the findings ----------

const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/g;
const LATIN = /[A-Za-z]/g;
/** UTF-8 read as Latin-1/Windows-1252: what CJK text drawn with a font that has none extracts as. */
/** Characters by code point (the scanners of client words read no symbol here). */
const cp = (...xs: number[]) => String.fromCodePoint(...xs);
const MOJIBAKE = new RegExp(`[${cp(0xc3, 0xc2, 0xe2)}-${cp(0xf1)}][${cp(0x80)}-${cp(0xbf)}${cp(0x152, 0x153, 0x160, 0x161, 0x178, 0x17d, 0x17e, 0x192, 0x2c6, 0x2dc, 0x2013, 0x2014)}${cp(0x2018)}-${cp(0x201e)}${cp(0x2020)}-${cp(0x2022)}${cp(0x2026, 0x2030, 0x2039, 0x203a, 0x20ac, 0x2122)}]`, "g");
/** Black and white squares, a ballot box, the replacement character: what a missing glyph extracts as. */
const BULLET = new RegExp(cp(0x2022), "g");
const BOXES = new RegExp(`[${cp(0x25a0, 0x25a1, 0x25af, 0x2610, 0xfffd)}]`, "g");
/** Font names that carry Chinese, Japanese or Korean (subset prefixes aside). */
const CJK_FONT =
  /cjk|han(s|t)?\b|sourcehan|source ?han|noto ?(sans|serif) ?(sc|tc|jp|kr|hk|cjk)|pingfang|hiragino|heiti|songti|stsong|stheiti|stkaiti|stfangsong|stxihei|simsun|simhei|nsimsun|yahei|msyh|jhenghei|kaiti|fangsong|wenquanyi|wqy|droid ?sans ?fallback|arial ?unicode|adobe ?(song|heiti|kaiti|fangsong|ming|myungjo|gothic)|ms ?(gothic|mincho|pgothic)|yu ?(gothic|mincho)|meiryo|malgun|apple ?sd|applegothic|nanum|lxgw|harmonyos|misans|alibaba|oppo ?sans|sarasa|smiley|zcool|\bgb|ming|lantinghei|huawen|fzhei|fz[a-z]|mingliu|pmingliu|dfkai|batang|gulim|dotum|osaka|kozuka|kozgo|kozmin|ipag|ipam|takao|ume|vlgothic|unifont|songti|kaiti|baoli|hannotate|hanzipen|libian|wawati|weibei|xingkai|yuanti|yuppy/i;

export const cjkCount = (s: string) => (s.match(CJK) ?? []).length;
const latinCount = (s: string) => (s.match(LATIN) ?? []).length;

const PLACEHOLDER: RegExp[] = [
  /lorem ipsum[^.\n]{0,20}/i,
  /\bdolor sit amet\b/i,
  // A marker left to fill in ("TODO:", "(TBD)", "[待定]", "XXX"), not the word in a sentence ("the TODO list").
  /\b(?:TODO|TBD|FIXME)\b\s*(?:[:：)\]]|$)|[[(（]\s*(?:TODO|TBD|待定|待补)\s*[\])）]|\bXXX+\b/m,
  /\[(?:your |company |client |insert |placeholder|name|title|date|日期|姓名|公司|名称|填写)[^\]]{0,24}\]/i,
  /\[[^\]\n]{0,30}\b(?:name|title|date|company|address|phone|email|position|role)\][^\]]{0,0}/i,
  /\{\{[^}]{1,30}\}\}/,
  /<(?:insert|placeholder|your)[^>]{0,30}>/i,
  /click to add (?:title|text|subtitle)|click to edit master/i,
  /单击此处(?:添加|编辑)[一-鿿]{0,6}|点击此处(?:添加|输入)[一-鿿]{0,6}/,
  /此处(?:填写|输入|插入)[一-鿿]{0,8}|占位(?:符|文字|内容)|示例文本|待补充|待填写|这里写/,
  /\bplaceholder text\b|\bsample text\b/i,
];

export function placeholdersIn(text: string): string | undefined {
  for (const re of PLACEHOLDER) {
    const m = text.match(re);
    if (m) return m[0].trim();
  }
  return undefined;
}

/** The script the person reads: Han (Chinese), Latin (English); others: undefined, no language check. */
export type Script = "han" | "latin";

/** The script the person reads, from their language tag, else from the ask's own letters. */
export function readsIn(lang: string | undefined, ask: string): Script | undefined {
  const l = (lang ?? "").toLowerCase();
  if (l.startsWith("zh")) return "han";
  if (l.startsWith("en")) return "latin";
  if (l) return undefined;
  const c = cjkCount(ask);
  const a = latinCount(ask.replace(/\b(pdf|ppt|pptx|docx?|deck|word|slides?)\b/gi, ""));
  return c >= 4 && c >= a / 3 ? "han" : a >= 12 && c === 0 ? "latin" : undefined;
}

/** Language and script checks shared by every format (text: all of a document's words). */
function textFindings(text: string, reads: Script | undefined, fonts: FontFacts[] | undefined): DocFinding[] {
  const out: DocFinding[] = [];
  const c = cjkCount(text);
  const a = latinCount(text);
  const moji = (text.match(MOJIBAKE) ?? []).length;
  const boxes = (text.match(BOXES) ?? []).length;
  const cjkFont = fonts?.some((f) => CJK_FONT.test(f.name.replace(/^[A-Z]{6}\+/, "")));
  const latinOnly = !!fonts?.length && fonts.every((f) => /^(helvetica|times|courier|arial|symbol|zapf)/i.test(f.name.replace(/^[A-Z]{6}\+/, "")));
  const junk = moji + boxes + (text.match(BULLET) ?? []).length;
  if (reads === "han" && c < 10 && (junk >= 3 || (latinOnly && /[^\x00-\x7f]/.test(text)))) out.push({ code: "cjk" });
  else if (c >= 4 && fonts && fonts.length && !cjkFont) out.push({ code: "cjk" });
  const ph = placeholdersIn(text);
  if (ph) out.push({ code: "placeholder", text: ph });
  if (!out.some((f) => f.code === "cjk") && c + a >= 60) {
    if (reads === "han" && c < (c + a) * 0.15) out.push({ code: "language" });
    if (reads === "latin" && c > (c + a) * 0.4) out.push({ code: "language" });
  }
  return out;
}

function countFinding(n: number, ask: DocAsk): DocFinding | undefined {
  if (ask.pages && n !== ask.pages) return { code: "count", n, asked: ask.pages };
  if (ask.maxPages && n > ask.maxPages) return { code: "count", n, asked: ask.maxPages, most: true };
  return undefined;
}

/** Lines on a page: words grouped by their baseline. */
function linesOf(p: PageFacts): number {
  const ys = [...new Set(p.words.map((w) => Math.round(w.y1 / 3)))];
  return ys.length;
}

/** The page's findings from its words' boxes (and its ink). */
export function pdfFindings(f: PdfFacts, ask: DocAsk, reads: Script | undefined): DocFinding[] {
  const out: DocFinding[] = [];
  if (!f.count) return [{ code: "unreadable" }];
  const slides = f.pages.length ? f.pages[0]!.w > f.pages[0]!.h : false;
  if (f.pages.length) {
    // The left margin the document keeps: the 5th smallest left edge of a line across its pages.
    const lefts = f.pages.flatMap((p) => p.words.map((w) => w.x0)).sort((a, b) => a - b);
    const margin = lefts.length ? lefts[Math.min(lefts.length - 1, 4)]! : 0;
    const sizes: number[] = [];
    f.pages.forEach((p, i) => {
      const page = i + 1;
      const past = p.words.some((w) => w.x0 < 1 || w.y0 < 0 || w.x1 > p.w - 1 || w.y1 > p.h + 0.5);
      // Past the margin it keeps on the left (mirrored), when it keeps one at all.
      const pastMargin = !slides && margin >= 18 && p.words.some((w) => w.x1 > p.w - margin + Math.max(8, margin * 0.3));
      // Drawn up to the page's right edge while the left edge stays white: cut off there (a page
      // keeps its margins; the words cut off are not in the text at all).
      const cut = !slides && !!p.ink && p.ink.right > 0.01 && p.ink.left < p.ink.right / 4;
      if (past || pastMargin || cut) out.push({ code: "overflow", page });
      if (!p.words.length && (p.ink === undefined || p.ink.all < 0.004)) out.push({ code: "blank", page });
      // A word's size from its width in ems (a CJK character is one em wide, Latin about half).
      for (const w of p.words) {
        const em = emWidth(w.t);
        if ([...w.t].length >= 2 && em >= 1.5) sizes.push((w.x1 - w.x0) / em);
      }
    });
    // Body text: the middle word height (pdftotext's box is about 1.2× the font's size).
    if (sizes.length >= 20) {
      const sorted = sizes.slice().sort((a, b) => a - b);
      const mid = sorted[Math.floor(sorted.length / 2)]!;
      // A slide is read from across a room: a 13.33 in wide one (960 pt) wants 14 pt and up.
      const floor = slides ? 14 * (f.pages[0]!.w / 960) : 7;
      if (mid < floor) out.push({ code: "small", page: 1 });
    }
    const last = f.pages[f.pages.length - 1]!;
    if (f.pages.length >= 2 && last.words.length && !slides) {
      const n = linesOf(last);
      if (n <= 2) out.push({ code: "stub", n });
    }
  }
  const cf = countFinding(f.count, ask);
  if (cf) out.push(cf);
  if (f.text !== undefined) out.push(...textFindings(f.text, reads, f.fonts));
  else if (f.fonts.length && reads === "han" && !f.fonts.some((x) => CJK_FONT.test(x.name))) {
    // No text read here: a Chinese document whose every font is a Latin standard one can't show Chinese.
    if (f.fonts.every((x) => /^(helvetica|times|courier|arial|symbol|zapf)/i.test(x.name.replace(/^[A-Z]{6}\+/, "")))) out.push({ code: "cjk" });
  }
  return out;
}

// ---------- Office files (zip + XML) ----------

/** The entries of a zip (stored or deflated), by name. */
export function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end of the central directory: its signature within the last 64 KiB.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--)
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) return out;
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  for (let k = 0; k < n && p + 46 <= bytes.length; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (local + 30 > bytes.length || dv.getUint32(local, true) !== 0x04034b50) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + csize);
    try {
      if (method === 0) out.set(name, data);
      else if (method === 8) out.set(name, new Uint8Array(inflateRawSync(data)));
    } catch {
      /* a broken entry is left out */
    }
  }
  return out;
}

const xmlText = (s: string) => decodeEntities(s);
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

/** An em's width for one character (sans-serif): CJK and full-width 1, Latin about half. */
export function emWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if ((c >= 0x2e80 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xffef) || (c >= 0x3000 && c <= 0x303f)) w += 1;
    else if (ch === " ") w += 0.28;
    else if (/[A-Z]/.test(ch)) w += 0.64;
    else if (/[mwMW]/.test(ch)) w += 0.8;
    else if (/[il.,;:'!|]/.test(ch)) w += 0.26;
    else if (/[0-9]/.test(ch)) w += 0.56;
    else w += 0.52;
  }
  return w;
}

/** Lines a paragraph takes in a box `width` pt wide at `size` pt (words kept whole; CJK breaks anywhere). */
export function linesFor(text: string, size: number, width: number): { lines: number; tooLong: boolean } {
  if (!text.trim()) return { lines: 1, tooLong: false };
  const em = width / size;
  let lines = 1;
  let at = 0;
  let tooLong = false;
  // Tokens: a Latin word with its trailing space, or one CJK character.
  for (const tok of text.match(/[⺀-鿿가-힯豈-﫿＀-￯　-〿]|[^\s⺀-鿿가-힯豈-﫿＀-￯　-〿]+\s*|\s+/g) ?? []) {
    const w = emWidth(tok);
    if (w > em) tooLong = true;
    if (at + emWidth(tok.trimEnd()) > em && at > 0) {
      lines++;
      at = 0;
    }
    at += w;
  }
  return { lines, tooLong };
}

/** A line's height in ems: CJK fonts set taller lines than Latin ones (PingFang, YaHei about 1.3). */
const lineHeight = (text: string) => (cjkCount(text) ? 1.32 : 1.2);

export interface SlideFacts {
  /** Each text box: its size in pt, and its paragraphs with the font size each is set in. */
  boxes: { x: number; y: number; w: number; h: number; paras: { text: string; size: number }[]; autofit: "none" | "shrink" | "grow"; scale: number }[];
  pictures: { x: number; y: number; w: number; h: number }[];
  text: string;
}

const EMU = 12700; // per pt

/** A deck: its slide size (pt) and every slide's boxes. */
export function readPptx(files: Map<string, Uint8Array>): { w: number; h: number; slides: SlideFacts[] } | undefined {
  const dec = (n: string) => (files.has(n) ? new TextDecoder().decode(files.get(n)!) : undefined);
  const pres = dec("ppt/presentation.xml");
  if (!pres) return undefined;
  const sz = pres.match(/<p:sldSz\b[^>]*>/)?.[0] ?? "";
  const w = Number(attr(sz, "cx") ?? 9144000) / EMU;
  const h = Number(attr(sz, "cy") ?? 6858000) / EMU;
  // Slide order: presentation.xml's list through its relationships, else by number.
  const rels = dec("ppt/_rels/presentation.xml.rels") ?? "";
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], "Id") ?? "", attr(m[0], "Target") ?? ""]));
  let order = [...pres.matchAll(/<p:sldId\b[^>]*>/g)].map((m) => target.get(attr(m[0], "r:id") ?? "") ?? "").filter(Boolean).map((t) => "ppt/" + t.replace(/^\.?\//, "").replace(/^\.\.\//, ""));
  if (!order.length || order.some((n) => !files.has(n)))
    order = [...files.keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  const slides: SlideFacts[] = order.map((n) => {
    const x = dec(n) ?? "";
    const boxes: SlideFacts["boxes"] = [];
    const pictures: SlideFacts["pictures"] = [];
    const texts: string[] = [];
    const xfrm = (s: string) => {
      const off = s.match(/<a:off\b[^>]*>/)?.[0];
      const ext = s.match(/<a:ext\b[^>]*cx=[^>]*>/)?.[0];
      if (!off || !ext) return undefined;
      return { x: Number(attr(off, "x")) / EMU, y: Number(attr(off, "y")) / EMU, w: Number(attr(ext, "cx")) / EMU, h: Number(attr(ext, "cy")) / EMU };
    };
    for (const sm of x.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)) {
      const s = sm[1]!;
      const box = xfrm(s);
      const paras: { text: string; size: number }[] = [];
      const body = s.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/)?.[1] ?? "";
      const def = Number(body.match(/<a:lvl1pPr\b[\s\S]*?<a:defRPr\b[^>]*sz="(\d+)"/)?.[1] ?? 0) / 100;
      for (const pm of body.matchAll(/<a:p>([\s\S]*?)<\/a:p>|<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)) {
        const p = pm[1] ?? pm[2] ?? "";
        const runs = [...p.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => xmlText(m[1]!));
        const size = Number(p.match(/<a:rPr\b[^>]*sz="(\d+)"/)?.[1] ?? p.match(/<a:endParaRPr\b[^>]*sz="(\d+)"/)?.[1] ?? 0) / 100 || def || 18;
        const text = runs.join("");
        paras.push({ text, size });
        if (text) texts.push(text);
      }
      const fit = /<a:normAutofit\b/.test(body) ? "shrink" : /<a:spAutoFit\b/.test(body) ? "grow" : "none";
      const scale = Number(body.match(/<a:normAutofit\b[^>]*fontScale="(\d+)"/)?.[1] ?? 100000) / 100000;
      if (box && paras.some((p) => p.text)) boxes.push({ ...box, paras, autofit: fit, scale });
      else if (box) pictures.push(box);
    }
    for (const pm of x.matchAll(/<p:pic>([\s\S]*?)<\/p:pic>|<p:graphicFrame>([\s\S]*?)<\/p:graphicFrame>/g)) {
      const box = xfrm(pm[1] ?? pm[2] ?? "");
      if (box) pictures.push(box);
      for (const t of (pm[2] ?? "").matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)) texts.push(xmlText(t[1]!));
    }
    return { boxes, pictures, text: texts.join("\n") };
  });
  return { w, h, slides };
}

export function pptxFindings(d: { w: number; h: number; slides: SlideFacts[] }, ask: DocAsk, reads: Script | undefined): DocFinding[] {
  const out: DocFinding[] = [];
  if (!d.slides.length) return [{ code: "unreadable" }];
  const tol = 2;
  d.slides.forEach((s, i) => {
    const page = i + 1;
    if (!s.text.trim() && !s.pictures.length) out.push({ code: "blank", page });
    const all = [...s.boxes, ...s.pictures];
    if (all.some((b) => b.x < -tol || b.y < -tol || b.x + b.w > d.w + tol || b.y + b.h > d.h + tol)) out.push({ code: "off", page });
    for (const b of s.boxes) {
      if (b.autofit === "grow") {
        // The box grows with its text: what matters is whether it then runs past the slide's foot.
        const need = b.paras.reduce((n, p) => n + linesFor(p.text, p.size, b.w - 14.4).lines * p.size * lineHeight(p.text), 7.2);
        if (b.y + need > d.h + tol) {
          out.push({ code: "off", page });
          break;
        }
        continue;
      }
      const scale = b.autofit === "shrink" ? b.scale : 1;
      let need = 7.2; // top and bottom insets (0.05 in each)
      let tooLong = false;
      for (const p of b.paras) {
        const r = linesFor(p.text, p.size * scale, b.w - 14.4); // left and right insets (0.1 in each)
        need += r.lines * p.size * scale * lineHeight(p.text);
        tooLong ||= r.tooLong;
      }
      if (tooLong || need > b.h * 1.05 + 4) {
        out.push({ code: "box", page });
        break;
      }
    }
  });
  const sizes = d.slides.flatMap((s) => s.boxes.flatMap((b) => b.paras.filter((p) => p.text.length > 20).map((p) => p.size * (b.autofit === "shrink" ? b.scale : 1))));
  if (sizes.length >= 3) {
    const mid = sizes.sort((a, b) => a - b)[Math.floor(sizes.length / 2)]!;
    if (mid < 14 * (d.w / 960)) out.push({ code: "small", page: 1 });
  }
  const cf = countFinding(d.slides.length, ask);
  if (cf) out.push(cf);
  out.push(...textFindings(d.slides.map((s) => s.text).join("\n"), reads, undefined));
  return dedupe(out);
}

export interface DocxFacts {
  /** The text area's width in pt (page width less its margins). */
  textWidth: number;
  /** Each table's width in pt (its grid's columns, else its stated width). */
  tables: number[];
  /** Each inline picture's width in pt. */
  pictures: number[];
  text: string;
}

export function readDocx(files: Map<string, Uint8Array>): DocxFacts | undefined {
  const doc = files.has("word/document.xml") ? new TextDecoder().decode(files.get("word/document.xml")!) : undefined;
  if (!doc) return undefined;
  const pg = doc.match(/<w:pgSz\b[^>]*>/)?.[0] ?? "";
  const mar = doc.match(/<w:pgMar\b[^>]*>/)?.[0] ?? "";
  const tw = (v: string | undefined, d: number) => (v ? Number(v) : d) / 20; // twips per pt
  const textWidth = tw(attr(pg, "w:w"), 11906) - tw(attr(mar, "w:left"), 1440) - tw(attr(mar, "w:right"), 1440);
  const tables: number[] = [];
  for (const tm of doc.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)) {
    const t = tm[1]!;
    const grid = [...(t.match(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/)?.[1] ?? "").matchAll(/<w:gridCol\b[^>]*w:w="(\d+)"/g)].reduce((n, m) => n + Number(m[1]), 0);
    const stated = t.match(/<w:tblW\b[^>]*w:w="(\d+)"[^>]*w:type="dxa"/)?.[1];
    tables.push((grid || Number(stated ?? 0)) / 20);
  }
  const pictures = [...doc.matchAll(/<wp:extent\b[^>]*cx="(\d+)"/g)].map((m) => Number(m[1]) / EMU);
  const paras = [...doc.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((m) => [...m[0].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => xmlText(t[1]!)).join(""));
  return { textWidth, tables, pictures, text: paras.filter(Boolean).join("\n") };
}

export function docxFindings(d: DocxFacts, reads: Script | undefined): DocFinding[] {
  const out: DocFinding[] = [];
  if (!d.text.trim() && !d.pictures.length) return [{ code: "blank", page: 1 }];
  if ([...d.tables, ...d.pictures].some((w) => w > d.textWidth + 6)) out.push({ code: "wide" });
  out.push(...textFindings(d.text, reads, undefined));
  return out;
}

function dedupe(fs: DocFinding[]): DocFinding[] {
  const seen = new Set<string>();
  return fs.filter((f) => {
    const k = `${f.code}:${f.page ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------- one document ----------

export interface DocResult {
  format: DocFormat;
  pages?: number;
  findings: DocFinding[];
  /** The pages as pictures (when drawn), for the task to look at. */
  pictures: string[];
}

/**
 * Checks one document at `path`. `pdfOf`: a PDF of the same document shown beside it (its pages
 * and its text are what the person flips through). With LibreOffice and no PDF beside it, an
 * Office file is made into one here to read its pages.
 */
export async function checkDocument(path: string, format: DocFormat, ask: DocAsk, reads: Script | undefined, o: ReadOptions & { pdfOf?: string } = {}): Promise<DocResult> {
  const t = toolsOf(o);
  if (format === "pdf") {
    const { facts, pictures } = await readPdf(path, o);
    if (!facts) return { format, findings: [{ code: "unreadable" }], pictures: [] };
    return { format, pages: facts.count, findings: dedupe(pdfFindings(facts, ask, reads)), pictures };
  }
  let files: Map<string, Uint8Array>;
  try {
    files = unzip(new Uint8Array(readFileSync(path)));
  } catch {
    return { format, findings: [{ code: "unreadable" }], pictures: [] };
  }
  const own = format === "pptx" ? (() => {
    const d = readPptx(files);
    return d ? { pages: d.slides.length, findings: pptxFindings(d, ask, reads) } : undefined;
  })() : (() => {
    const d = readDocx(files);
    return d ? { pages: undefined as number | undefined, findings: docxFindings(d, reads) } : undefined;
  })();
  if (!own) return { format, findings: [{ code: "unreadable" }], pictures: [] };
  // Its pages: the PDF beside it, else one LibreOffice makes here.
  let pdf = o.pdfOf;
  let made: string | undefined;
  if (!pdf && t.soffice) {
    made = mkdtempSync(join(tmpdir(), "ducter-doc-"));
    const r = await run([t.soffice, "--headless", "--norestore", `-env:UserInstallation=file://${join(made, "profile")}`, "--convert-to", "pdf", "--outdir", made, path], 90_000);
    const out = join(made, basename(path).replace(/\.[^.]+$/, ".pdf"));
    if (r.ok && existsSync(out)) pdf = out;
  }
  try {
    if (!pdf) return { format, ...own, findings: dedupe(own.findings), pictures: [] };
    const { facts, pictures } = await readPdf(pdf, o);
    if (!facts) return { format, ...own, findings: dedupe(own.findings), pictures: [] };
    // Page-level findings from the pages; the deck's own count and boxes from its XML.
    const fromPages = pdfFindings(facts, format === "pptx" ? {} as DocAsk : ask, reads).filter((f) => f.code !== "language" && f.code !== "placeholder" && f.code !== "stub" && !(format === "pptx" && f.code === "count"));
    return { format, pages: own.pages ?? facts.count, findings: dedupe([...own.findings, ...fromPages]), pictures };
  } finally {
    if (made) rmSync(made, { recursive: true, force: true });
  }
}

// ---------- pairing an Office file with its PDF ----------

/**
 * D439: an Office file shown with a PDF of the same name opens as its pages: the PDF rides on the
 * Office file's ref as `pages`, and is not shown again on its own.
 */
export function pairPages(media: MediaRef[]): MediaRef[] {
  const pdfs = new Map<string, MediaRef>();
  for (const m of media) if (docFormat(m) === "pdf") pdfs.set(docStem(m.name), m);
  const used = new Set<string>();
  const out = media.map((m) => {
    const f = docFormat(m);
    if (f !== "pptx" && f !== "docx") return m;
    const p = pdfs.get(docStem(m.name));
    if (!p || !docStem(m.name)) return m;
    used.add(p.id);
    return { ...m, pages: { id: p.id, k: p.k, bytes: p.bytes } };
  });
  return out.filter((m) => !(docFormat(m) === "pdf" && used.has(m.id)));
}

// ---------- the check on a done report ----------

export interface DocCheckDeps {
  log: { read(q: { stream?: string; kinds?: string[]; beforeSeq?: number; limit?: number }): LogEvent[]; head(): number };
  /** Where a ref's bytes are on this home. */
  path(id: string): string | undefined;
  /** Where the pages are drawn for the task to look at (a folder of its own per task, on the
   *  computer it works on; undefined where the task can't read this home's files). */
  picturesDir?(taskId: string, open: Bodies["task_open"] | undefined): string | undefined;
  off?(): boolean;
  read?: ReadOptions;
  /**
   * D449: the task thinks on a free key: the pages are still checked (code, no model), but nothing
   * goes back for another round (each round spends the key); what was found rides on the result.
   */
  codeOnly?(taskId: string): boolean;
}

export interface DocCheckOutcome {
  /** Words back to the task instead of reporting (it fixes, then reports again). */
  again?: string;
  /** What rides on the report (only when something is still so). */
  doc?: DocCheck;
  /** The media as shown (an Office file and its PDF paired). */
  media?: MediaRef[];
}

/** At most this many documents of one report are read. */
const DOCS_MAX = 3;

export function createDocCheck(d: DocCheckDeps) {
  /** Tasks whose document went back once already (task:stem). */
  const asked = new Set<string>();
  const openOf = (taskId: string) => {
    const evs = d.log.read({ stream: `task:${taskId}`, kinds: ["task_open"], beforeSeq: d.log.head() + 1, limit: 20 });
    return (evs.find((e) => (e.body as Bodies["task_open"]).brief?.trim()) ?? evs.at(-1))?.body as Bodies["task_open"] | undefined;
  };
  return {
    async check(taskId: string, body: Bodies["report"]): Promise<DocCheckOutcome | undefined> {
      if (!body.media?.length) return undefined;
      const media = pairPages(body.media);
      const paired = media.length !== body.media.length;
      if (body.state !== "done" || d.off?.()) return paired ? { media } : undefined;
      const open = openOf(taskId);
      const words = `${open?.title ?? ""}\n${open?.brief ?? ""}`;
      const ask = docAsk(words);
      const docs = media.filter((m) => docFormat(m)).slice(0, DOCS_MAX);
      if (!ask || !docs.length) return paired ? { media } : undefined;
      const reads = readsIn(open?.language, words);
      const results: { m: MediaRef; r: DocResult }[] = [];
      for (const m of docs) {
        const p = d.path(m.id);
        if (!p) continue;
        const pdfOf = m.pages ? d.path(m.pages.id) : undefined;
        const dir = d.picturesDir?.(taskId, open);
        const pics = dir ? join(dir, `${docStem(m.name).replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 40) || "doc"}-${m.id.slice(0, 8)}`) : undefined;
        const r = await checkDocument(p, docFormat(m)!, ask, reads, { ...d.read, ...(pdfOf ? { pdfOf } : {}), ...(pics ? { picturesTo: pics } : {}) });
        results.push({ m, r });
      }
      const withPages = media.map((m) => {
        const r = results.find((x) => x.m.id === m.id)?.r;
        return m.pages && r?.pages ? { ...m, pages: { ...m.pages, n: r.pages } } : m;
      });
      const found = results.filter((x) => x.r.findings.length);
      const key = `${taskId}`;
      if (found.length && !asked.has(key) && !d.codeOnly?.(taskId)) {
        asked.add(key);
        const parts = found.map(({ m, r }) => {
          const slides = r.format === "pptx";
          const lines = r.findings.map((f) => `- ${docFindingForTask(f, slides)}`).join("\n");
          const pics = r.pictures.length ? `\nIts ${r.pictures.length} ${slides ? "slides" : "pages"} as pictures, to look at one by one: ${r.pictures.length <= 12 ? r.pictures.join(", ") : `${r.pictures.slice(0, 12).join(", ")} … (in ${r.pictures[0]!.replace(/\/[^/]+$/, "")})`}` : "";
          return `${m.name ?? "the document"}:\n${lines}${pics}`;
        });
        return {
          again: `Not sent yet: before the user sees it, Ducter checked the document page by page and found:\n${parts.join("\n\n")}\n\nFix these in the same file, render it again, look at every page, and call report_to_main again with the same state and show. If one of these is wrong (the user asked for it that way), keep it and say why in one line of the summary.`,
          media: withPages,
        };
      }
      if (!found.length) return { media: withPages };
      const slides = found.some((x) => x.r.format === "pptx");
      const all = found.flatMap((x) => x.r.findings);
      const doc: DocCheck = {
        ...(results[0]?.r.pages ? { pages: results[0].r.pages } : {}),
        found: all,
        left: all.slice(0, DOC_LEFT_MAX).map((f) => docFindingWords(f, open?.language ?? (reads === "latin" ? "en" : reads === "han" ? "zh-CN" : undefined), slides)),
      };
      return { doc, media: withPages };
    },
    /** A restart forgets which went back (one more round at most). */
    forget(taskId: string) {
      asked.delete(taskId);
    },
  };
}

export type DocChecker = ReturnType<typeof createDocCheck>;
