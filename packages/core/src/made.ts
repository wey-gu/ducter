// D383: 给你做的 / Made for you (design/made.md). What Ducter made for the person, found again by their own
// words, its kind and when, without remembering which task made it. Nothing new is stored: the
// index is read from the Log on first use and kept live by subscription, like Past tasks' (D285):
//   - a task's report: what it showed (report.media, D206), the files its evidence points at and
//     its summary links to (D356), and, when done, the pages it names (evidence kind url);
//   - a task's own steps: a file it wrote that a person keeps (a document, a sheet, a picture…);
//   - the partner's replies: its tables, charts and lists (D303), and the files they link to;
//   - a pull request opened from Ducter (job_status act open_pr).
// Search reuses Past tasks' words, time words and matching. Deterministic; never a model.
import {
  fileLinkPath,
  isImageType,
  MADE_FILE_EXTS,
  MADE_KIND_WORDS,
  MADE_KINDS,
  madeExt,
  pinWas,
  SHEET_EXTS,
  wordsOnly,
  type Bodies,
  type LogEvent,
  type MadeField,
  type MadeItem,
  type MadeKind,
  type MadeQuery,
  type MediaRef,
  type PinView,
  type RichUi,
} from "@ducter/protocol";
import type { LogStore, TaskRegistry } from "@ducter/protocol/src/internal.ts";
import { queryTerms, termIn, timeWords } from "./past.ts";

/** One thing in the index: its card, and the words it is found by. */
interface Rec {
  item: MadeItem;
  persona: string;
  /** What is in it (a table's cells, a list's items, a file's path), lowercased. */
  content: string;
  /** The words of the report or reply it came with, lowercased (capped). */
  around: string;
  /** Its place in the Log's order: the newer of two at the same moment comes first. */
  n: number;
}

const WRITE_TOOLS = new Set(["Write", "write", "write_file", "create_file"]);
const PATH_KEYS = ["file_path", "path", "filePath", "file"];
/** A task's own working files, never something made for the person. */
const NOT_MADE = /(^|\/)(node_modules|\.git|\.claude|\.codex|\.pi|\.cache|__pycache__|dist|build|target|vendor)\//;
const AROUND_CAP = 1200;
const WEIGHT: Record<MadeField, number> = { name: 6, kind: 4, task: 4, ask: 3, content: 3, report: 2 };
const DAY = 24 * 3600_000;

const BLOCK_KIND: Partial<Record<RichUi["type"], MadeKind>> = { table: "table", chart: "chart", checklist: "list" };
const KIND_FIELD_WORDS: Record<MadeKind, string> = {
  file: "file document 文件 文档",
  picture: "picture image screenshot photo 图片 截图 照片",
  table: "table comparison 表格 对比表",
  chart: "chart graph 图表",
  list: "list checklist 清单 列表",
  link: "link page 链接 网页",
};

/** A pull request's address, said as a person says it: "PR #412" (owner/repo when not the task's). */
const PR_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;

export interface MadeDeps {
  log: LogStore;
  tasks: TaskRegistry;
  /** D381: what is pinned now (an older version of a pinned block is not listed). */
  pins?: () => readonly PinView[];
  now?: () => number;
}

export interface Made {
  query(persona: string, q: MadeQuery): { items: MadeItem[]; total: number; kinds: { kind: MadeKind; n: number }[]; range?: { since: string; before: string; words: string }; kind?: MadeKind };
  /** One by its id (the partner's show, a client's open). */
  get(id: string): MadeItem | undefined;
}

/** A block's name: its title, else the first words of the message it is in, else its own first cell. */
function blockTitle(b: RichUi, msg: string): string {
  if ("title" in b && b.title?.trim()) return b.title.trim();
  const first = msg.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("|"));
  const line = (first ?? "").replace(/[*_`#>]/g, "").trim();
  if (line) return line.length > 60 ? `${line.slice(0, 59)}…` : line;
  if (b.type === "table") return b.columns.join(" / ").slice(0, 60);
  if (b.type === "checklist") return (b.items[0] ?? "").slice(0, 60);
  if (b.type === "chart") return b.summary.slice(0, 60);
  return "";
}

function blockContent(b: RichUi): string {
  if (b.type === "table") return [b.columns.join(" "), ...b.rows.map((r) => r.join(" "))].join("\n");
  if (b.type === "checklist") return b.items.join("\n");
  if (b.type === "chart") return [b.summary, b.unit ?? "", ...b.points.map((p) => p.label)].join("\n");
  return "";
}

/** The file paths a report's or a reply's words link to (Markdown links and `code` spans). */
export function linkedPaths(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const p = fileLinkPath(m[1]);
    if (p) out.push(p);
  }
  for (const m of text.matchAll(/`((?:\/|~\/|file:\/\/)[^`\s]+)`/g)) {
    const p = fileLinkPath(m[1]);
    if (p) out.push(p);
  }
  return [...new Set(out)];
}

const nameOf = (path: string) => path.replace(/\/+$/, "").split("/").pop() || path;

/** A path that is something made for the person: a kind a person keeps, outside a project's own machinery. */
export function madePath(path: string): boolean {
  if (!path || path.length > 1024 || NOT_MADE.test(path)) return false;
  return MADE_FILE_EXTS.has(madeExt(nameOf(path)));
}

const pathKind = (path: string): MadeKind => {
  const ext = madeExt(nameOf(path));
  return ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext) ? "picture" : "file";
};

/** The task a path in Ducter's own scratch or evidence folder belongs to. */
const scratchTask = (path: string): string | undefined => /\/\.ducter[^/]*\/(?:scratch|evidence)\/([A-Za-z0-9_-]{4,40})\//.exec(path)?.[1];

export function createMade(d: MadeDeps): Made {
  const now = d.now ?? Date.now;
  const recs = new Map<string, Rec>();
  /** The person's words by the seq of their message: what a reply answered. */
  const asked = new Map<number, string>();
  let built = false;

  const put = (r: Omit<Rec, "content" | "around" | "n"> & { content?: string; around?: string }) => {
    const had = recs.get(r.item.id);
    if (had) {
      // Named again (a report linking the file a step wrote): those words find it too.
      const more = (r.around ?? "").toLowerCase();
      if (more && !had.around.includes(more)) had.around = `${had.around}\n${more}`.slice(0, AROUND_CAP);
      return;
    }
    recs.set(r.item.id, { ...r, content: (r.content ?? "").toLowerCase(), around: (r.around ?? "").slice(0, AROUND_CAP).toLowerCase(), n: recs.size });
  };
  const pathItem = (e: LogEvent, path: string, taskId: string | undefined, around: string) => {
    if (!madePath(path)) return;
    const tid = taskId ?? scratchTask(path);
    put({ item: { id: `p:${tid ?? ""}:${path}`, kind: pathKind(path), title: nameOf(path), at: e.ts, ...(tid ? { task: { taskId: tid, title: "" } } : {}), path }, persona: e.persona, content: path, around });
  };

  const apply = (e: LogEvent) => {
    if (e.kind === "user_msg") {
      const b = e.body as Bodies["user_msg"];
      if (b.text?.trim() && !b.forwarded) {
        asked.set(e.seq, b.text.trim().slice(0, 300));
        if (asked.size > 5000) asked.delete(asked.keys().next().value!);
      }
      return;
    }
    if (e.kind === "report") {
      const b = e.body as Bodies["report"];
      const around = b.summary ?? "";
      for (const m of b.media ?? []) mediaItem(e, m, b.taskId, around);
      for (const ev of b.evidence ?? []) {
        if (ev.kind === "file" && ev.check !== "missing") pathItem(e, ev.ref, b.taskId, `${ev.label}\n${around}`);
        else if (ev.kind === "url" && b.state === "done" && /^https?:\/\//.test(ev.ref)) linkItem(e, ev.ref, ev.label, b.taskId, around);
      }
      for (const p of linkedPaths(around)) pathItem(e, p, b.taskId, around);
      return;
    }
    if (e.kind === "ai_msg") {
      const b = e.body as Bodies["ai_msg"];
      if (b.decisionId) return;
      const text = b.text ?? "";
      const ask = b.replyTo !== undefined ? asked.get(b.replyTo) : undefined;
      const words = wordsOnly(text, b.ui);
      (b.ui ?? []).forEach((u, i) => {
        const kind = BLOCK_KIND[u.type];
        if (!kind) return;
        put({
          item: { id: `b:${e.seq}:${i}`, kind, title: blockTitle(u, words), at: e.ts, ...(ask ? { ask } : {}), block: u, seq: e.seq },
          persona: e.persona,
          content: blockContent(u),
          around: words,
        });
      });
      // What a task showed comes in its report first (with its task); a reply only relays it.
      for (const m of b.media ?? []) if (!recs.has(`m:${m.id}`)) mediaItem(e, m, m.from?.taskId, words);
      for (const p of linkedPaths(text)) pathItem(e, p, undefined, words);
      return;
    }
    if (e.kind === "task_event") {
      const b = e.body as Bodies["task_event"];
      if (b.role !== "tool" || !b.tool || !b.taskId || b.tool.ok === false) return;
      const inp = b.tool.input;
      if (WRITE_TOOLS.has(b.tool.name) && inp && typeof inp === "object") {
        for (const k of PATH_KEYS) {
          const v = (inp as Record<string, unknown>)[k];
          if (typeof v === "string") pathItem(e, v, b.taskId, "");
        }
      } else if (/^(apply_patch|fileChange)$/.test(b.tool.name)) {
        const s = typeof inp === "string" ? inp : JSON.stringify(inp ?? "");
        for (const m of s.matchAll(/\*\*\* Add File: ([^\s"\\]+)/g)) pathItem(e, m[1]!, b.taskId, "");
      }
      return;
    }
    if (e.kind === "job_status") {
      const b = e.body as Bodies["job_status"];
      if (b.act === "open_pr" && b.ref && /^https?:\/\//.test(b.ref) && b.state === "done") linkItem(e, b.ref, "", b.taskId, b.text ?? "");
    }
  };
  function mediaItem(e: LogEvent, m: MediaRef, taskId: string | undefined, around: string) {
    const ext = madeExt(m.name ?? "");
    const kind: MadeKind = isImageType(m.type) || m.type === "image/svg+xml" ? "picture" : "file";
    put({
      item: { id: `m:${m.id}`, kind, title: m.name ?? (kind === "picture" ? "" : ext), at: e.ts, ...(taskId ? { task: { taskId, title: "" } } : {}), media: m },
      persona: e.persona,
      content: `${m.name ?? ""} ${ext} ${m.type}`,
      around,
    });
  }
  function linkItem(e: LogEvent, url: string, label: string, taskId: string | undefined, around: string) {
    const pr = PR_RE.exec(url);
    const title = label.trim() || (pr ? `PR #${pr[3]}` : url.replace(/^https?:\/\//, "").slice(0, 60));
    put({ item: { id: `u:${url}`, kind: "link", title, at: e.ts, ...(taskId ? { task: { taskId, title: "" } } : {}), url }, persona: e.persona, content: `${url} ${pr ? "pr pull request" : ""}`, around });
  }

  const KINDS = ["user_msg", "report", "ai_msg", "task_event", "job_status"] as const;
  const build = () => {
    if (built) return;
    built = true;
    for (const e of d.log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: [...KINDS] })) apply(e);
    d.log.subscribe((e) => {
      if ((KINDS as readonly string[]).includes(e.kind)) apply(e);
    });
  };

  /** The card as it is now: the task's title today, a block that is pinned now, an older version left out. */
  const view = (r: Rec, pins: readonly PinView[]): MadeItem | undefined => {
    const it = r.item;
    if (it.block && it.seq !== undefined) {
      const index = Number(it.id.split(":")[2]);
      if (pinWas(pins as PinView[], it.seq, index)) return undefined;
      const pin = pins.find((p) => p.seq === it.seq && p.index === index);
      if (pin) return { ...it, block: pin.ui as RichUi, pinned: true };
    }
    if (it.task) {
      const c = d.tasks.get(it.task.taskId);
      if (!c) {
        const { task: _t, ...rest } = it;
        return rest;
      }
      return { ...it, task: { taskId: c.taskId, title: c.mark?.name ?? c.title } };
    }
    return { ...it };
  };

  const fields = (r: Rec, it: MadeItem): [MadeField, string][] => {
    const out: [MadeField, string][] = [["name", it.title.toLowerCase()]];
    const ext = it.media ? madeExt(it.media.name ?? "") : it.path ? madeExt(nameOf(it.path)) : "";
    const sheet = SHEET_EXTS.has(ext);
    out.push(["kind", `${KIND_FIELD_WORDS[it.kind]} ${ext}${sheet ? ` ${KIND_FIELD_WORDS.table}` : ""}`]);
    if (it.task?.title) out.push(["task", it.task.title.toLowerCase()]);
    if (it.ask) out.push(["ask", it.ask.toLowerCase()]);
    if (r.content) out.push(["content", r.content]);
    if (r.around) out.push(["report", r.around]);
    return out;
  };

  return {
    query(persona, q) {
      build();
      const t = now();
      const raw = String(q.q ?? "").trim().slice(0, 200);
      const tw = raw ? timeWords(raw, t) : undefined;
      const rest = tw ? tw.rest : raw;
      // A word that names a kind ("PDF", "表格", "screenshot") narrows to it when nothing else asks for one.
      let kind = q.kind && (MADE_KINDS as readonly string[]).includes(q.kind) ? q.kind : undefined;
      let pdf = false;
      const terms: string[] = [];
      for (const term of queryTerms(rest)) {
        const k = MADE_KIND_WORDS[term];
        if (k === "pdf") pdf = true;
        else if (k && !kind) kind = k;
        else if (!k) terms.push(term);
      }
      if (pdf && !kind) kind = "file";
      const since = Math.max(tw?.since ?? -Infinity, q.since ? Date.parse(q.since) : -Infinity);
      const before = Math.min(tw?.before ?? Infinity, q.before ? Date.parse(q.before) : Infinity);
      const pins = d.pins?.() ?? [];
      const counts = new Map<MadeKind, number>();
      const scored: { it: MadeItem; score: number; at: number; o: number }[] = [];
      const loose: { it: MadeItem; score: number; at: number; n: number; o: number }[] = [];
      for (const r of recs.values()) {
        if (persona && r.persona !== persona) continue;
        const at = Date.parse(r.item.at);
        if (!(at >= since && at < before)) continue;
        if (q.taskId && r.item.task?.taskId !== q.taskId) continue;
        const it = view(r, pins);
        if (!it) continue;
        const ext = it.media ? madeExt(it.media.name ?? "") : it.path ? madeExt(nameOf(it.path)) : "";
        if (pdf && ext !== "pdf" && it.media?.type !== "application/pdf") continue;
        const ofKind = (k: MadeKind) => it.kind === k || (k === "table" && SHEET_EXTS.has(ext));
        // The chips count what the words and the time found, before a kind narrows it.
        const fresh = 1 + 0.35 * Math.exp(-Math.max(0, (t - at) / DAY) / 21);
        const take = (score: number, n: number) => {
          if (kind && !ofKind(kind)) return;
          if (n === terms.length) scored.push({ it, score, at, o: r.n });
          else loose.push({ it, score: score * (n / terms.length), at, n, o: r.n });
        };
        if (!terms.length) {
          counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);
          take(fresh, 0);
          continue;
        }
        const fs = fields(r, it);
        let score = 0;
        let matched = 0;
        const per = fs.map(() => ({ w: 0, at: -1 }));
        for (const term of terms) {
          let top = 0;
          for (const [i, [f, text]] of fs.entries()) {
            const m = termIn(term, text);
            if (!m.s) continue;
            const w = (WEIGHT[f] ?? 1) * m.s;
            if (w > top) top = w;
            per[i]!.w += w;
            if (per[i]!.at < 0) per[i]!.at = m.at;
          }
          if (top > 0) matched++;
          score += top;
        }
        if (!matched) continue;
        if (matched === terms.length) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1);
        // Why it came up: the field that explains the most, unless the card shows it already (its name).
        let bi = -1;
        for (const [i, p] of per.entries()) if (p.w > 0 && fs[i]![0] !== "name" && fs[i]![0] !== "kind" && (bi < 0 || p.w > per[bi]!.w)) bi = i;
        if (bi >= 0 && !(per[0]!.w >= per[bi]!.w)) {
          const f = fs[bi]![0];
          const src = f === "task" ? it.task?.title ?? "" : f === "ask" ? it.ask ?? "" : f === "content" ? r.content : r.around;
          const line = src.split("\n").find((l) => terms.some((x) => l.toLowerCase().includes(x))) ?? src.split("\n")[0] ?? "";
          const flat = line.replace(/\s+/g, " ").trim();
          if (flat) it.hit = { field: f, text: flat.length > 80 ? `${flat.slice(0, 79)}…` : flat };
        }
        take(score * fresh, matched);
      }
      let list = scored;
      if (!list.length && loose.length) list = loose.filter((x) => x.n === Math.max(...loose.map((y) => y.n)));
      list.sort((a, b) => (terms.length ? b.score - a.score : 0) || b.at - a.at || b.o - a.o);
      const limit = Math.max(1, Math.min(Number(q.limit) || 200, 500));
      return {
        items: list.slice(0, limit).map((x) => x.it),
        total: list.length,
        kinds: MADE_KINDS.filter((k) => counts.get(k)).map((k) => ({ kind: k, n: counts.get(k)! })),
        ...(kind ? { kind } : {}),
        ...(tw ? { range: { since: new Date(tw.since).toISOString(), before: new Date(tw.before).toISOString(), words: tw.words } } : {}),
      };
    },
    get(id) {
      build();
      const r = recs.get(id);
      return r ? view(r, d.pins?.() ?? []) : undefined;
    },
  };
}
