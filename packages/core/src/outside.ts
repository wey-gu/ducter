// D299: 也在这台电脑上 / Also on this computer. The sessions the person ran by hand in their own
// AI agents (Claude Code, Codex, pi) on the home, found in Past tasks beside Ducter's own tasks,
// and carried on in Ducter: the same agent resumes the very session in its own folder, or another
// agent starts there from what it said.
//
// Shown by default, read lazily (only when Past tasks asks) and locally; one tap hides an agent's
// sessions for good (<dataDir>/outside.json). Ducter's own sessions are never listed (the Log
// knows their ids; its folders and temporary folders are left out). Nothing leaves the home.
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fill, words, type LangTag } from "@ducter/protocol/src/lang.ts";
import { harnessName, OUTSIDE_AGENTS, type Bodies, type LogEvent, type OutsideAgent, type OutsideField, type OutsideItem, type OutsideSource, type PastQuery } from "@ducter/protocol";
import type { LogStore, Runner, TaskRegistry } from "@ducter/protocol/src/internal.ts";
import type { LocalAgents, SessionSummary } from "./local-agents/index.ts";
import { kindOf, queryTerms, termIn, timeWords } from "./past.ts";

export interface OutsideDeps {
  reader: LocalAgents;
  dataDir: string;
  log: LogStore;
  tasks: TaskRegistry;
  /** Ducter's own folder (worktrees, projects): sessions there are Ducter's. */
  ducterFolder?: () => string;
  home?: string;
  now?: () => number;
  /** The language the person reads in (the task's reports, what a refusal says). */
  language?: () => LangTag;
  /** D327: whether the person lets Ducter read their agents' records at all (Settings, 别再看了). */
  looks?: () => boolean;
}

export interface Outside {
  /** The sessions to show for this query, best first (at most `limit`, default 40), and each agent's count. */
  list(q: PastQuery, limit?: number): { items: OutsideItem[]; sources: OutsideSource[] };
  hide(agent: OutsideAgent, hidden: boolean): void;
  hidden(): OutsideAgent[];
  /** D327: 这个文件夹别看了 / Leave this folder out, for Past tasks and the first words alike (`~/…` or absolute). */
  hideFolder(path: string, hidden: boolean): void;
  /** The folders left out, absolute. */
  hiddenFolders(): string[];
  /** Whether a session's folder is one left out (it or a folder inside it). */
  leftOut(cwd: string): boolean;
  /** `~/…` for a folder under the home folder. */
  tilde(path: string): string;
  /** Carries one on as a Ducter task; the task's id. A session carried on before opens its task again. */
  adopt(runner: Runner | undefined, persona: string, agent: OutsideAgent, id: string, harness?: string, model?: string): Promise<{ ok: boolean; taskId?: string; message?: string }>;
}

const DAY = 24 * 3600_000;

/** What a refusal says, per language (D292). */
const SAY = {
  en: { noRunner: "Tasks can't run right now.", missing: "I can't find that session any more.", gone: "Its folder {path} isn't there any more." },
  zh: { noRunner: "现在开不了任务。", missing: "找不到这段对话了。", gone: "它的文件夹 {path} 不在了。" },
};
const WEIGHT: Record<OutsideField, number> = { title: 5, branch: 4, project: 4, words: 3, agent: 2.5 };

export function createOutside(d: OutsideDeps): Outside {
  const now = d.now ?? Date.now;
  const home = d.home ?? homedir();
  const file = join(d.dataDir, "outside.json");
  let hidden = new Set<OutsideAgent>();
  let folders = new Set<string>();
  try {
    if (existsSync(file)) {
      const j = JSON.parse(readFileSync(file, "utf8")) as { hidden?: unknown; folders?: unknown };
      if (Array.isArray(j.hidden)) hidden = new Set(j.hidden.filter((a): a is OutsideAgent => (OUTSIDE_AGENTS as readonly string[]).includes(a)));
      if (Array.isArray(j.folders)) folders = new Set(j.folders.filter((f): f is string => typeof f === "string" && f.startsWith("/")));
    }
  } catch {
    /* a broken file shows everything */
  }
  const save = () => {
    mkdirSync(d.dataDir, { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify({ version: 1, hidden: [...hidden], ...(folders.size ? { folders: [...folders] } : {}) }, null, 2));
    renameSync(`${file}.tmp`, file);
  };
  const absolute = (p: string) => resolve(p === "~" ? home : p.startsWith("~/") ? join(home, p.slice(2)) : p);
  const leftOut = (cwd: string) => {
    const c = resolve(cwd);
    for (const f of folders) if (c === f || c.startsWith(f.endsWith(sep) ? f : f + sep)) return true;
    return false;
  };

  // Ducter's own sessions: every native id a task ever ran under, kept live.
  const owned = new Set<string>();
  let watching = false;
  const note = (e: LogEvent) => {
    if (e.kind !== "task_event") return;
    const raw = (e.body as Bodies["task_event"]).raw as { sessionId?: unknown } | undefined;
    if (typeof raw?.sessionId === "string") owned.add(raw.sessionId);
  };
  const watch = () => {
    if (watching) return;
    watching = true;
    for (const e of d.log.read({ fromSeq: 0, limit: Number.MAX_SAFE_INTEGER, kinds: ["task_event"] })) note(e);
    d.log.subscribe(note);
  };
  const under = (p: string, root: string) => p === root || p.startsWith(root.endsWith(sep) ? root : root + sep);
  // Sessions in a temporary folder are experiments, not work; unless the home read is itself a
  // temporary one (a test's, the demo's).
  const read = Object.values(d.reader.roots()).map((r) => resolve(r));
  const temp = [tmpdir(), "/tmp", "/private/tmp", "/var/folders", "/private/var/folders"].map((p) => resolve(p)).filter((t) => !read.some((r) => under(r, t)));
  const ducters = () => [resolve(d.dataDir), ...(d.ducterFolder ? [resolve(d.ducterFolder())] : [])];
  const ours = (s: SessionSummary) => owned.has(s.id) || ducters().some((r) => under(resolve(s.cwd), r)) || temp.some((r) => under(resolve(s.cwd), r));

  // A folder's project name: a git worktree's own repo when it is one (another workbench's
  // worktrees are named by place), else the folder's name. Cached per folder.
  const names = new Map<string, string>();
  const projectOf = (cwd: string): string => {
    const had = names.get(cwd);
    if (had !== undefined) return had;
    let name = basename(cwd) || cwd;
    try {
      const dotgit = join(cwd, ".git");
      if (existsSync(dotgit) && statSync(dotgit).isFile()) {
        const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotgit, "utf8"));
        // <repo>/.git/worktrees/<name>
        if (m) {
          const gd = resolve(cwd, m[1]!.trim());
          if (basename(dirname(gd)) === "worktrees") name = basename(dirname(dirname(dirname(gd)))) || name;
        }
      }
    } catch {
      /* the folder's own name */
    }
    names.set(cwd, name);
    return name;
  };
  const tilde = (p: string) => (under(p, home) ? `~${p.slice(home.length)}` : p);

  const itemOf = (s: SessionSummary): OutsideItem => {
    const title = s.title ?? s.firstPrompt ?? "";
    return {
      agent: s.agent,
      id: s.id,
      title,
      ...(s.title && s.firstPrompt && s.firstPrompt !== s.title ? { ask: s.firstPrompt } : {}),
      project: projectOf(s.cwd),
      cwd: tilde(s.cwd),
      ...(s.branch ? { branch: s.branch } : {}),
      ...(s.model ? { model: s.model } : {}),
      startedAt: s.startedAt,
      updatedAt: s.updatedAt,
      kind: kindOf(title, `${s.firstPrompt ?? ""}\n${s.lastPrompt ?? ""}`),
      ...(existsSync(s.cwd) ? {} : { gone: true as const }),
    };
  };

  return {
    list(q, limit = 40) {
      watch();
      // A session carried on already is a task now: it is listed as one.
      const adopted = new Set(d.tasks.list().flatMap((c) => (c.outside ? [c.outside.sessionId] : [])));
      // D327: 别再看了 means everywhere: with looking off, nothing of the records is read or listed.
      if (d.looks && !d.looks()) return { items: [], sources: [] };
      const all = d.reader.sessions().filter((s) => !ours(s) && !adopted.has(s.id) && !leftOut(s.cwd));
      const sources: OutsideSource[] = OUTSIDE_AGENTS.map((agent) => ({ agent, n: all.filter((s) => s.agent === agent).length, hidden: hidden.has(agent) })).filter((x) => x.n > 0 || x.hidden);
      // Starred and tags are the person's marks on Ducter's tasks: an outside session has none.
      if (q.starred || q.tag) return { items: [], sources };
      const t = now();
      const raw = String(q.q ?? "").trim().slice(0, 200);
      const tw = raw ? timeWords(raw, t) : undefined;
      const terms = queryTerms(tw ? tw.rest : raw);
      const since = Math.max(tw?.since ?? -Infinity, q.since ? Date.parse(q.since) : -Infinity);
      const before = Math.min(tw?.before ?? Infinity, q.before ? Date.parse(q.before) : Infinity);
      const scored: { it: OutsideItem; score: number; at: number }[] = [];
      for (const s of all) {
        if (hidden.has(s.agent)) continue;
        if (q.harness && q.harness !== s.agent) continue;
        const at = Date.parse(s.updatedAt);
        if (!(Date.parse(s.startedAt) < before && at >= since)) continue;
        const it = itemOf(s);
        if (q.project !== undefined && q.project !== null && it.project !== q.project) continue;
        if (!terms.length) {
          scored.push({ it, score: 1, at });
          continue;
        }
        const fields: [OutsideField, string, string][] = [
          ["title", it.title.toLowerCase(), it.title],
          ["branch", (s.branch ?? "").toLowerCase(), s.branch ?? ""],
          ["project", `${it.project} ${s.cwd}`.toLowerCase(), it.project],
          ["words", [s.firstPrompt, s.lastPrompt].filter(Boolean).join("\n").toLowerCase(), [s.firstPrompt, s.lastPrompt].filter(Boolean).join("\n")],
          ["agent", `${s.agent} ${harnessName(s.agent)} ${s.model ?? ""}`.toLowerCase(), harnessName(s.agent)],
        ];
        let score = 0;
        let matched = 0;
        let best: { f: OutsideField; w: number; shown: string } | undefined;
        for (const term of terms) {
          let top = 0;
          for (const [f, text, shown] of fields) {
            const m = termIn(term, text);
            if (!m.s) continue;
            const w = WEIGHT[f] * m.s;
            top = Math.max(top, w);
            if (f !== "title" && f !== "project" && f !== "agent" && (!best || w > best.w)) best = { f, w, shown };
          }
          if (top) matched++;
          score += top;
        }
        // Every word somewhere (the tasks' rule); outside sessions never stand in as the closest.
        if (matched < terms.length) continue;
        if (best) {
          const line = best.shown.split("\n").find((l) => terms.some((x) => l.toLowerCase().includes(x))) ?? best.shown;
          it.hit = { field: best.f, text: line.length > 90 ? `${line.slice(0, 89)}…` : line };
        }
        const ageDays = Math.max(0, (t - at) / DAY);
        scored.push({ it, score: score * (1 + 0.35 * Math.exp(-ageDays / 21)), at });
      }
      scored.sort((a, b) => (terms.length ? b.score - a.score : 0) || b.at - a.at);
      return { items: scored.slice(0, Math.max(1, limit)).map((x) => x.it), sources };
    },
    hide(agent, on) {
      if (!(OUTSIDE_AGENTS as readonly string[]).includes(agent)) return;
      if (on) hidden.add(agent);
      else hidden.delete(agent);
      save();
    },
    hidden: () => [...hidden],
    hideFolder(path, on) {
      const p = String(path ?? "").trim();
      if (!p || !(p.startsWith("/") || p.startsWith("~"))) return;
      const abs = absolute(p);
      if (abs === "/" || abs === resolve(home)) return; // never the whole computer or home folder: that is 别再看了
      if (on) folders.add(abs);
      else folders.delete(abs);
      save();
    },
    hiddenFolders: () => [...folders],
    leftOut,
    tilde,
    async adopt(runner, persona, agent, id, harness, model) {
      const lang = d.language?.() ?? "en";
      const say = words(SAY, lang);
      // Carried on before: that task is the one to open (the person continues it there).
      const had = d.tasks.list().find((c) => c.outside?.agent === agent && c.outside.sessionId === id);
      if (had) return { ok: true, taskId: had.taskId };
      if (!runner) return { ok: false, message: say.noRunner };
      const s = d.reader.summary(agent, id);
      if (!s) return { ok: false, message: say.missing };
      if (!existsSync(s.cwd)) return { ok: false, message: fill(say.gone, { path: tilde(s.cwd) }) };
      const to = harness && harness !== agent ? harness : agent;
      const it = itemOf(s);
      const title = [...it.title].length > 80 ? `${[...it.title].slice(0, 79).join("")}…` : it.title || harnessName(agent);
      // The brief is the person's own first ask, as they typed it (what 你交给它的事 shows); where the
      // session came from goes to the agent with its first turn (the runner's).
      const brief = s.firstPrompt ?? title;
      try {
        const card = await runner.openTask({
          persona,
          title,
          brief,
          place: { kind: "folder", device: "local", path: s.cwd },
          project: it.project,
          harness: to,
          // The same agent keeps the session's own model unless the person picked one.
          ...(model ? { model } : to === agent && s.model ? { model: s.model } : {}),
          language: lang,
          origin: "you",
          adopt: { agent, sessionId: id, startedAt: s.startedAt, turns: d.reader.history(agent, id, { turns: 60 }) },
        });
        return { ok: true, taskId: card.taskId };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    },
  };
}
