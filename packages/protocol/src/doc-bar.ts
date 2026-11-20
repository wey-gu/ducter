// D439: 拿去就能发 / Ready to send. When the person asks for a document to send to someone (a PDF,
// a slide deck, a Word file, a one-pager), the task is told the bar it holds itself to, Ducter
// checks the pages before they reach the person (fonts that carry their script, nothing past an
// edge, no blank pages, no placeholders, their language, the page count asked for), what it finds
// goes back to the task once to fix, and only what is still so is said under the result. An Office
// file shown with a PDF of the same name opens as its pages (design/documents.md).

/** The formats Ducter knows how to check, first PDF, then slides, then Word. */
export type DocFormat = "pdf" | "pptx" | "docx";

/** What the person's words ask for, read by code from the task's title and brief. */
export interface DocAsk {
  formats: DocFormat[];
  /** The page (or slide) count asked for: exactly (`pages`) or at most (`maxPages`). */
  pages?: number;
  maxPages?: number;
}

/** One thing the check found, as code; said to the task in English and to the person in theirs. */
export type DocFindingCode =
  | "unreadable" // the file doesn't open
  | "cjk" // Chinese, Japanese or Korean characters don't render (no font carries them)
  | "overflow" // text runs past a page's edge or its margin
  | "box" // a slide's text is longer than its box holds
  | "off" // something sits off the slide
  | "wide" // a table or a picture is wider than the page
  | "blank" // a blank page or slide
  | "stub" // the last page holds a line or two
  | "placeholder" // placeholder words left in (lorem, TODO, XXX, [Name], 单击此处添加标题)
  | "language" // not in the person's language
  | "count" // not the page or slide count asked for
  | "small"; // body text too small to read

export interface DocFinding {
  code: DocFindingCode;
  /** The page or slide, counted from 1. */
  page?: number;
  /** A count: the pages made (count), the lines on the last page (stub). */
  n?: number;
  /** The count asked for (count), and whether it was a most. */
  asked?: number;
  most?: boolean;
  /** The words concerned (placeholder: the words left in). */
  text?: string;
}

/** What Ducter keeps on a done report (set by Ducter, never by the task). */
export interface DocCheck {
  /** The document's pages (or slides), when known. */
  pages?: number;
  /** What it found the first time (codes), and what is still so after the task's fix. */
  found: DocFinding[];
  /** Still so, in the person's language, one short line each: said under the result. */
  left: string[];
}

/** At most this many things are said to the person (the rest would be noise). */
export const DOC_LEFT_MAX = 4;

const FORMAT_WORDS: [DocFormat, RegExp][] = [
  ["pdf", /\bpdfs?\b|一页纸|单页|\bone[- ]pager\b|简历|\bresume\b|\bcv\b|海报|传单|\bflyer\b|\bposter\b/i],
  ["pptx", /\bpptx?\b|\bdecks?\b|\bslides?\b|\bslideshow\b|\bkeynote\b|\bpowerpoint\b|幻灯片|演示文稿|路演|胶片/i],
  ["docx", /\bdocx?\b|\bword (?:doc|document|file)\b|word ?文档|word ?文件/i],
];

/** A verb of making, near the format: "this PDF says…" is a reading, not an ask. */
const MAKE = /做|写|出(?:一|个|份|张)|生成|导出|整理成|排(?:成|版|一)|弄(?:成|个|一)|准备|改成|转成|输出|制作|设计|\b(?:make|makes|making|made|create|build|write|draft|prepare|turn\b.*\binto|export|put together|produce|design|generate|lay out|format)\b/i;

const ZH_NUM: Record<string, number> = { 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
function zhNumber(s: string): number | undefined {
  if (/^\d+$/.test(s)) return Number(s);
  if (s === "十") return 10;
  const m = s.match(/^([一两二三四五六七八九])?十([一二三四五六七八九])?$/);
  if (m) return (m[1] ? ZH_NUM[m[1]]! : 1) * 10 + (m[2] ? ZH_NUM[m[2]]! : 0);
  return s.length === 1 ? ZH_NUM[s] : undefined;
}

/**
 * D439: a document to send, read from the ask's own words (the task's title and brief); undefined
 * when it isn't one. A format word and a verb of making are both needed.
 */
export function docAsk(text: string): DocAsk | undefined {
  if (!text || !MAKE.test(text)) return undefined;
  // Work on the code that makes documents ("修一下 PDF 导出的 bug") is not a document to send.
  if (/\b(?:bug|bugs|fix|fixes|crash|regression|exporter|endpoint)\b|修复|修一下|报错|崩溃|接口/i.test(text)) return undefined;
  const formats = FORMAT_WORDS.filter(([, re]) => re.test(text)).map(([f]) => f);
  if (!formats.length) return undefined;
  const out: DocAsk = { formats };
  if (/一页纸|单页|\bone[- ]pager\b|\bone[- ]page\b|\bsingle page\b|(?<!第|每|下|上|这|那)一页(?!页)/i.test(text)) out.pages = 1;
  const m = text.match(/(最多|不超过|至多|以内|\bat most\b|\bup to\b|\bno more than\b|\bunder\b)?\s*(?<!第)(\d{1,2}|[一两二三四五六七八九十]{1,3})\s*(页|张|\bpages?\b|\bslides?\b)(以内|之内)?/i);
  if (m) {
    const n = zhNumber(m[2]!);
    if (n && n > 0 && n <= 60) {
      if (m[1] || m[4]) {
        delete out.pages;
        out.maxPages = n;
      } else out.pages = n;
    }
  }
  return out;
}

/** The kind of a shown file as a document Ducter checks, by its type or name. */
export function docFormat(m: { type: string; name?: string }): DocFormat | undefined {
  const ext = (m.name ?? "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (m.type === "application/pdf" || ext === "pdf") return "pdf";
  if (m.type.includes("presentationml") || ext === "pptx") return "pptx";
  if (m.type.includes("wordprocessingml") || ext === "docx") return "docx";
  return undefined;
}

/** A file's name without its extension: an Office file and its PDF pair by it. */
export const docStem = (name: string | undefined) => (name ?? "").replace(/\.[a-z0-9]+$/i, "").trim().toLowerCase();

const clipText = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1) + "…");

type Words = (f: DocFinding, slides: boolean) => string;

const ZH_WORDS: Words = (f, slides) => {
  const unit = slides ? "张" : "页";
  switch (f.code) {
    case "unreadable":
      return "这个文件打不开";
    case "cjk":
      return "中文字显示不出来：用的字体里没有中文";
    case "overflow":
      return `第 ${f.page} ${unit}有文字超出了页面`;
    case "box":
      return `第 ${f.page} 张幻灯片的字超出了文本框`;
    case "off":
      return `第 ${f.page} 张幻灯片有内容跑到了边外`;
    case "wide":
      return f.page ? `第 ${f.page} 页的表格比页面宽` : "有表格或图片比页面宽";
    case "blank":
      return `第 ${f.page} ${unit}是空白的`;
    case "stub":
      return `最后一页只有 ${f.n} 行`;
    case "placeholder":
      return `还留着占位的字：${clipText(f.text ?? "", 24)}`;
    case "language":
      return "正文不是中文";
    case "count":
      return f.most ? `要的是最多 ${f.asked} ${unit}，做出来 ${f.n} ${unit}` : `要的是 ${f.asked} ${unit}，做出来 ${f.n} ${unit}`;
    case "small":
      return `第 ${f.page} ${unit}的字太小，不好读`;
  }
};

const EN_WORDS: Words = (f, slides) => {
  const unit = slides ? "slide" : "page";
  switch (f.code) {
    case "unreadable":
      return "The file doesn't open";
    case "cjk":
      return "Chinese characters don't show: the font has none";
    case "overflow":
      return `Text runs off ${unit} ${f.page}`;
    case "box":
      return `Text overflows its box on slide ${f.page}`;
    case "off":
      return `Something sits off the edge of slide ${f.page}`;
    case "wide":
      return f.page ? `A table on page ${f.page} is wider than the page` : "A table or picture is wider than the page";
    case "blank":
      return `${slides ? "Slide" : "Page"} ${f.page} is blank`;
    case "stub":
      return `The last page holds only ${f.n} ${f.n === 1 ? "line" : "lines"}`;
    case "placeholder":
      return `Placeholder words left in: ${clipText(f.text ?? "", 24)}`;
    case "language":
      return "The text isn't in English";
    case "count":
      return f.most ? `You asked for at most ${f.asked}; it has ${f.n} ${unit}s` : `You asked for ${f.asked}; it has ${f.n} ${unit}s`;
    case "small":
      return `The text on ${unit} ${f.page} is too small to read`;
  }
};

/** The words per base language; any other language reads English. */
const DOC_WORDS: Record<string, Words> = { zh: ZH_WORDS, en: EN_WORDS };

/** D439: what the person reads for one thing still so, in their language (by its base tag). */
export function docFindingWords(f: DocFinding, lang: string | undefined, slides = false): string {
  return (DOC_WORDS[(lang ?? "").toLowerCase().split("-")[0]!] ?? EN_WORDS)(f, slides);
}

/**
 * D439: an Office file's pages as a ref of their own (the PDF the task showed with it): what the
 * card's glimpse and the viewer draw. Undefined for a file with no pages.
 */
export function pagesRef(m: { pages?: { id: string; k: string; bytes: number }; name?: string; from?: { taskId: string } }): { id: string; k: string; type: string; bytes: number; name: string; from?: { taskId: string } } | undefined {
  if (!m.pages) return undefined;
  return { id: m.pages.id, k: m.pages.k, type: "application/pdf", bytes: m.pages.bytes, name: `${(m.name ?? "document").replace(/\.[a-z0-9]+$/i, "")}.pdf`, ...(m.from ? { from: m.from } : {}) };
}

/** D439: what the task is told for one thing found (English, specific, with how to fix it). */
export function docFindingForTask(f: DocFinding, slides = false): string {
  const unit = slides ? "slide" : "page";
  switch (f.code) {
    case "unreadable":
      return "the file doesn't open as a document (broken or locked): make it again";
    case "cjk":
      return "Chinese/Japanese/Korean characters don't render: no font in the file carries them (they extract as mojibake, boxes or with no CJK-capable font). Name a CJK font in the CSS or the file (PingFang SC, Noto Sans CJK SC, Source Han Sans SC, Microsoft YaHei) and make it again";
    case "overflow":
      return `text runs past the edge or the margin of ${unit} ${f.page}: wrap it, shorten it or make it smaller`;
    case "box":
      return `the text on slide ${f.page} is longer than its box holds: cut it, split the slide or make the box bigger`;
    case "off":
      return `a shape or picture sits partly off slide ${f.page}: move it inside the slide`;
    case "wide":
      return `a table or picture${f.page ? ` on page ${f.page}` : ""} is wider than the page's text area: narrower columns, wrapped cells, or a landscape page`;
    case "blank":
      return `${unit} ${f.page} is blank: remove the stray page break or the empty ${unit}`;
    case "stub":
      return `the last page holds only ${f.n} line(s): tighten the page before it so it fits, or rebalance`;
    case "placeholder":
      return `placeholder words are left in ("${clipText(f.text ?? "", 40)}"): put the real content there`;
    case "language":
      return "the text is not in the user's language: write it in their language";
    case "count":
      return `the user asked for ${f.most ? "at most " : ""}${f.asked} ${unit}s and it has ${f.n}`;
    case "small":
      return `the body text on ${unit} ${f.page} is too small to read (under 8 pt on paper, 14 pt on a slide)`;
  }
}
