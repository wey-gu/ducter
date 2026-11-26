// D530: an opened task's steps as the rows it draws. A turn's work (everything before its last
// words) is one group under a quiet head, "12 步，3 条消息" / "12 steps, 3 messages", with a mark
// for what failed; inside it, the agent's words at their own size and, between them, one row per
// step: a drawn mark by kind, a plain verb, its object in a mono chip or files as file chips. A
// run of reads of files is one row with their chips ("读了 3 个文件"). A connected service's tool
// is said by the service and what it did, never its raw name. Pure and language-neutral: the
// clients word it in their i18n. The Go port (apps/desktop/internal/views/stepview.go) passes
// the same cases (fixtures/stepview.json).
import type { Block, Line, StepRow } from "./transcript.ts";

/** One row a stretch draws: a step, or a run of file reads as one row with their files. */
export type Item = { k: "row"; row: StepRow } | { k: "files"; seq: number; rows: StepRow[] };

/** A read of one named file that went well: it may join its neighbours as one row. */
const fileRead = (r: StepRow) => !!r.step && r.step.kind === "read" && !r.step.act && !!r.step.target && r.outcome === "ok";

/** A stretch's lines (D268's summary runs taken apart) as rows, two or more file reads in a row as one. */
export function itemsOf(lines: Line[]): Item[] {
  const out: Item[] = [];
  let run: StepRow[] = [];
  const flush = () => {
    if (run.length >= 2) out.push({ k: "files", seq: run[0]!.seq, rows: run });
    else for (const r of run) out.push({ k: "row", row: r });
    run = [];
  };
  for (const l of lines)
    for (const r of l.k === "row" ? [l.row] : l.rows) {
      if (fileRead(r)) run.push(r);
      else {
        flush();
        out.push({ k: "row", row: r });
      }
    }
  flush();
  return out;
}

/**
 * D585: what the agent said to the person in a turn they opened with their own words: its words and
 * its reports. They stay out of the turn's fold (only the steps fold), so its answer is never hidden.
 */
export const saidOut = (b: Block): boolean => b.k === "voice" || b.k === "report";

/** What a turn's work holds (D530): its steps (thinking is no step), the words it said along the way, how many failed. */
export interface Work {
  steps: number;
  messages: number;
  failed: number;
}

export function workOf(blocks: Block[]): Work {
  const w: Work = { steps: 0, messages: 0, failed: 0 };
  for (const b of blocks) {
    if (b.k === "voice") w.messages++;
    if (b.k !== "steps") continue;
    for (const l of b.lines)
      for (const r of l.k === "row" ? [l.row] : l.rows) {
        if (!r.step) continue;
        w.steps += r.n;
        if (r.outcome === "error") w.failed++;
      }
  }
  return w;
}

/** What a connected service's tool did, as a person says it (D530). */
export type ToolAct = "read" | "list" | "search" | "create" | "update" | "delete" | "send" | "run" | "use";

const ACTS: [RegExp, ToolAct][] = [
  [/^(get|read|fetch|view|show|retrieve|download|describe|load|open)$/, "read"],
  [/^(list|browse|enumerate)$/, "list"],
  [/^(search|find|query|lookup|grep)$/, "search"],
  [/^(create|add|new|insert|make)$/, "create"],
  [/^(update|edit|set|patch|modify|rename|move|merge|change|write|save|upsert)$/, "update"],
  [/^(delete|remove|close|archive|drop|clear)$/, "delete"],
  [/^(send|reply|comment|notify|publish|post|share|message)$/, "send"],
  [/^(run|execute|exec|invoke|call|trigger|start)$/, "run"],
];

/**
 * A service's tool name (a step's target: "get pull request", "listIssues", "search_code") as what
 * it did and on what: get pull request → read + "pull request". A name that starts with no known
 * verb is used whole: "browser snapshot" → use + "browser snapshot".
 */
export function toolAct(name: string): { act: ToolAct; object: string } {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_.-]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  const act = ACTS.find(([re]) => re.test(words[0] ?? ""))?.[1];
  if (!act || words.length < 2) return { act: act ?? "use", object: act ? "" : words.join(" ") };
  return { act, object: words.slice(1).join(" ") };
}

/**
 * A command or a pattern cut for its chip (D530): its first line, a heredoc's body left out, at
 * most `max` characters cut at a word's end, with an ellipsis when cut.
 */
export function chipText(s: string, max = 72): string {
  let line = s.split("\n")[0]!.trim();
  let cut = line !== s.trim();
  const here = /<<-?\s*['"]?\w+['"]?/.exec(line);
  if (here) {
    line = line.slice(0, here.index + here[0].length);
    cut = true;
  }
  const cs = [...line];
  if (cs.length > max) {
    let i = max;
    while (i > max * 0.6 && cs[i] !== " ") i--;
    line = cs.slice(0, i > max * 0.6 ? i : max).join("").trimEnd();
    cut = true;
  }
  const whole = wholeQuotes(line);
  if (whole !== line) [line, cut] = [whole, true];
  return cut ? `${line}…` : line;
}

/** A chip's quotes kept whole (D530: never `"cat`): a quote opened and not closed, by a cut or a
 *  command that came cut, takes the chip back to before it; when that would leave almost nothing,
 *  the quote alone goes. The Mac's wholeQuotes. */
export function wholeQuotes(line: string): string {
  const cs = [...line];
  let open = "";
  let at = -1;
  for (let i = 0; i < cs.length; i++) {
    const ch = cs[i]!;
    if (ch === "\\" && open !== "'") i++;
    else if (open && ch === open) [open, at] = ["", -1];
    else if (!open && (ch === '"' || ch === "'") && (i === 0 || " \t=(".includes(cs[i - 1]!))) [open, at] = [ch, i];
  }
  if (!open) return line;
  const before = cs.slice(0, at).join("").trimEnd();
  if ([...before].length >= 8) return before;
  return (cs.slice(0, at).join("") + cs.slice(at + 1).join("")).trim();
}

/** A file's name and the kind its chip draws (D530): code, text, picture, data, or a plain file. */
export function fileKind(path: string): "code" | "text" | "picture" | "data" | "file" {
  const ext = /\.([A-Za-z0-9]+)$/.exec(path)?.[1]?.toLowerCase() ?? "";
  if (/^(png|jpe?g|gif|webp|svg|heic|ico|bmp|avif)$/.test(ext)) return "picture";
  if (/^(md|mdx|txt|rst|adoc|org)$/.test(ext)) return "text";
  if (/^(json|ya?ml|toml|csv|tsv|xml|lock|sql|ini|env|plist)$/.test(ext)) return "data";
  if (ext) return "code";
  return "file";
}

/** A path's last part: what a file chip says (its tail on hover). */
export const fileName = (path: string): string => path.replace(/\/+$/, "").split("/").at(-1) ?? path;
