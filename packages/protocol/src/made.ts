// D383: 给你做的 / Made for you. What Ducter made for the person, found again without remembering which
// task made it: the files and pictures a task showed, the files it wrote or named in its report,
// the tables, charts and lists in the partner's replies, the pages and pull requests it left.
// Nothing new is stored: the home reads them from the Log (reports, replies, a task's own steps)
// and the media it already keeps, and opens each with what already opens it (D206's viewer,
// D356's file_open, the rich block, the browser). design/made.md.
import type { MediaRef } from "./media.ts";
import type { RichUi } from "./rich.ts";

/** What a made thing is, as the person names it: a file, a picture, a table, a chart, a list, a link. */
// D405: an app the partner made is one of them (小应用 / Apps), opened in its own sheet or window.
export const MADE_KINDS = ["app", "file", "picture", "table", "chart", "list", "link"] as const;
export type MadeKind = (typeof MADE_KINDS)[number];

/** Why a thing came up for the words: its name, its kind, the task that made it, what the person asked, what is in it. */
export type MadeField = "name" | "kind" | "task" | "ask" | "content" | "report";

/** One thing Ducter made, as Made lists it and the partner names it. */
export interface MadeItem {
  /** Stable: m:<media id> · p:<task id>:<path> · b:<seq>:<index> · u:<url>. */
  id: string;
  kind: MadeKind;
  /** Its name: the file's name, the block's title (else the first words of its message), the link's words. */
  title: string;
  /** When it was made (the report, the reply, the step). */
  at: string;
  /** The task that made it; absent when the partner made it in the conversation. */
  task?: { taskId: string; title: string };
  /** The person's own words it answered, when known (the message a reply answered). */
  ask?: string;
  /** A file or picture the home keeps (a task showed it): opened in the viewer as it is. */
  media?: MediaRef;
  /** A file on a computer, by its path (a task wrote it, or named it): opened through file_open. */
  path?: string;
  /** A table, chart or list as it was drawn, and the message it is in. */
  block?: RichUi;
  seq?: number;
  /** A page or pull request (a task's evidence, a PR it or the person opened). */
  url?: string;
  /** D381: this block is pinned at the top of the conversation now. */
  pinned?: true;
  /** D405: an app (its id and version now); opened with app_open. */
  app?: { id: string; version: number };
  /** For a search: where it matched, with a short piece of the text. */
  hit?: { field: MadeField; text: string };
}

/** What narrows Made. Together they AND. */
export interface MadeQuery {
  /** Free words: names, kinds (PDF, 表格, screenshot…), the task, what was asked, what is in it. Time words become a date range. */
  q?: string;
  kind?: MadeKind;
  /** Only what this task made. */
  taskId?: string;
  since?: string;
  before?: string;
  limit?: number;
}

export type MadeClientFrame =
  // Answered with made_result (id echoed).
  { t: "made"; id?: string; query: MadeQuery };

export type MadeServerFrame =
  // kinds: how many of each kind there are (before the kind filter), for the chips; range: the
  // dates the time words in q meant (上周 → 11月9日–15日).
  { t: "made_result"; id?: string; items: MadeItem[]; total: number; kinds: { kind: MadeKind; n: number }[]; range?: { since: string; before: string; words: string }; kind?: MadeKind };

/** Words in a query that name a kind of thing, by language-free match (lowercased, whole term). */
export const MADE_KIND_WORDS: Record<string, MadeKind | "pdf"> = {
  pdf: "pdf",
  app: "app",
  apps: "app",
  应用: "app",
  小应用: "app",
  小工具: "app",
  工具: "app",
  tool: "app",
  tracker: "app",
  文件: "file",
  文档: "file",
  file: "file",
  files: "file",
  doc: "file",
  docs: "file",
  document: "file",
  documents: "file",
  报告: "file",
  report: "file",
  图: "picture",
  图片: "picture",
  截图: "picture",
  照片: "picture",
  画: "picture",
  picture: "picture",
  pictures: "picture",
  image: "picture",
  images: "picture",
  screenshot: "picture",
  screenshots: "picture",
  photo: "picture",
  表: "table",
  表格: "table",
  对比表: "table",
  对比: "table",
  table: "table",
  tables: "table",
  comparison: "table",
  spreadsheet: "table",
  图表: "chart",
  chart: "chart",
  charts: "chart",
  graph: "chart",
  清单: "list",
  列表: "list",
  checklist: "list",
  list: "list",
  链接: "link",
  网页: "link",
  页面: "link",
  link: "link",
  page: "link",
  pr: "link",
  "pull request": "link",
};

/** A spreadsheet or CSV file counts as a table when the person asks for one. */
export const SHEET_EXTS: ReadonlySet<string> = new Set(["csv", "tsv", "xlsx", "xls", "numbers"]);

/** The kinds of file a task writes that are things made for the person, not working files. */
export const MADE_FILE_EXTS: ReadonlySet<string> = new Set([
  "md", "markdown", "pdf", "csv", "tsv", "xlsx", "xls", "numbers", "docx", "doc", "pages", "pptx", "key", "html", "htm", "txt", "ics",
  "png", "jpg", "jpeg", "gif", "webp", "svg", "mp3", "m4a", "wav", "mp4", "mov",
]);

/** The extension of a name, lowercased ("" when none). */
export const madeExt = (name: string): string => {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name);
  return m ? m[1]!.toLowerCase() : "";
};
