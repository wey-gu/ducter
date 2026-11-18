// D299: the AI agents the person runs by hand on this computer, and the sessions they keep: one
// small reader shared by Past tasks (也在这台电脑上 / Also on this computer, D299) and the first
// greeting (D298). Three questions: which projects, which sessions, what one session was.
//
// Read only, lazily and locally: nothing is read until asked, a file is read only at its head
// and tail (sessions reach a GB, research/103 §4), a summary is kept until the file changes, and
// nothing here leaves the computer. Never writes, renames or locks an agent's files: when a
// session is carried on, the agent itself appends to it, as it does by hand.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { filesOf, LOCAL_AGENTS, type LocalAgent, rootsOf, type SessionSummary, type SessionTurn, summarize, turnsOf } from "./agents.ts";

export { LOCAL_AGENTS, type LocalAgent, type SessionSummary, type SessionTurn } from "./agents.ts";

/** A folder the person worked in with their agents, newest first. */
export interface LocalProject {
  cwd: string;
  agents: LocalAgent[];
  sessions: number;
  lastAt: string;
}

export interface LocalAgents {
  /** Where each agent keeps its sessions here. */
  roots(): Record<LocalAgent, string>;
  /** Sessions, newest first; at most `limit` per agent (default 400) are read. */
  sessions(o?: { agents?: readonly LocalAgent[]; limit?: number; cwd?: string }): SessionSummary[];
  /** The folders those sessions ran in, newest first. */
  projects(o?: { agents?: readonly LocalAgent[]; limit?: number }): LocalProject[];
  /** One session by its agent and id. */
  summary(agent: LocalAgent, id: string): SessionSummary | undefined;
  /** The conversation at the end of one session (the person's words and the agent's). */
  history(agent: LocalAgent, id: string, o?: { turns?: number }): SessionTurn[];
  /** D327: drops every summary read so far (looking was turned off: what was read is forgotten). */
  forget(): void;
  /**
   * D327: the agents with a session file changed since `since` (ms), by file times and names
   * alone: nothing inside a file is read. Claude Code's and pi's folder names say where a session
   * ran, so those under `skip` (Ducter's own, temporary folders) don't count; Codex's don't say.
   */
  active(o: { since: number; skip?: string[] }): LocalAgent[];
  /**
   * D376: whether a session is still open where the person ran it: "running" when its agent says
   * so (Claude Code keeps one small file per running process, `sessions/<pid>.json`, with the
   * session's id; the process is alive), "recent" when its file was written in the last two
   * minutes (Codex and pi keep no such file). Carrying on an open session would put two writers
   * on one conversation.
   */
  openNow(agent: LocalAgent, id: string): "running" | "recent" | undefined;
}

/** D376: a session written this recently may still be open in a terminal. */
export const OPEN_RECENT_MS = 120_000;

/** Whether a process runs (signal 0 checks without sending anything). */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function createLocalAgents(opts: { home?: string; env?: Record<string, string | undefined>; uid?: number | null; now?: () => number; alive?: (pid: number) => boolean } = {}): LocalAgents {
  const roots = rootsOf(opts.home ?? homedir(), opts.env ?? process.env);
  const now = opts.now ?? Date.now;
  const alive = opts.alive ?? pidAlive;
  const cache = new Map<string, { size: number; mtime: number; sum: SessionSummary | undefined }>();
  // D327: only the files of the account this Ducter runs as (null: any, for a test's fixtures).
  const uid = opts.uid === null ? undefined : (opts.uid ?? process.getuid?.());
  const statOf = (path: string) => {
    try {
      const st = statSync(path);
      // Another account's records on a shared computer are theirs, even where the system lets them be read.
      if (uid !== undefined && st.uid !== uid) return undefined;
      return st.isFile() ? { size: st.size, mtime: st.mtimeMs } : undefined;
    } catch {
      return undefined;
    }
  };
  const read = (agent: LocalAgent, f: { path: string; id: string }, st: { size: number; mtime: number }) => {
    const had = cache.get(f.path);
    if (had && had.size === st.size && had.mtime === st.mtime) return had.sum;
    const sum = summarize(agent, f, st.size, st.mtime);
    cache.set(f.path, { ...st, sum });
    return sum;
  };
  const sessions: LocalAgents["sessions"] = (o = {}) => {
    const out: SessionSummary[] = [];
    for (const agent of o.agents ?? LOCAL_AGENTS) {
      const files = filesOf(agent, roots[agent])
        .map((f) => ({ f, st: statOf(f.path) }))
        .filter((x): x is { f: { path: string; id: string }; st: { size: number; mtime: number } } => !!x.st)
        .sort((a, b) => b.st.mtime - a.st.mtime)
        .slice(0, o.limit ?? 400);
      for (const { f, st } of files) {
        const sum = read(agent, f, st);
        if (sum && (!o.cwd || sum.cwd === o.cwd)) out.push(sum);
      }
    }
    return out.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  };
  const find = (agent: LocalAgent, id: string) => filesOf(agent, roots[agent]).find((f) => f.id === id);
  return {
    roots: () => ({ ...roots }),
    sessions,
    projects(o = {}) {
      const by = new Map<string, LocalProject>();
      for (const s of sessions({ ...(o.agents ? { agents: o.agents } : {}), ...(o.limit ? { limit: o.limit } : {}) })) {
        const p = by.get(s.cwd) ?? { cwd: s.cwd, agents: [], sessions: 0, lastAt: s.updatedAt };
        p.sessions++;
        if (!p.agents.includes(s.agent)) p.agents.push(s.agent);
        if (s.updatedAt > p.lastAt) p.lastAt = s.updatedAt;
        by.set(s.cwd, p);
      }
      return [...by.values()].sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt));
    },
    summary(agent, id) {
      const f = find(agent, id);
      const st = f && statOf(f.path);
      return f && st ? read(agent, f, st) : undefined;
    },
    forget: () => cache.clear(),
    active({ since, skip = [] }) {
      // Claude Code: projects/<cwd with every non-alphanumeric as "-">; pi: sessions/--<cwd with "/" as "-">--.
      const slugs = skip.filter(Boolean).map((p) => p.replace(/[^A-Za-z0-9]/g, "-"));
      const skipped = (agent: LocalAgent, path: string) => {
        if (agent === "codex") return false;
        const dir = basename(dirname(path)).replace(/^--|--$/g, "").replace(/[^A-Za-z0-9]/g, "-");
        const d = agent === "pi" ? `-${dir}` : dir;
        return slugs.some((s) => d === s || d.startsWith(`${s}-`));
      };
      return LOCAL_AGENTS.filter((agent) => filesOf(agent, roots[agent]).some((f) => !skipped(agent, f.path) && (statOf(f.path)?.mtime ?? 0) >= since));
    },
    openNow(agent, id) {
      if (agent === "claude-code") {
        // <config>/sessions/<pid>.json: { pid, sessionId, cwd, status, … } while that process runs.
        const dir = join(dirname(roots["claude-code"]), "sessions");
        let names: string[] = [];
        try {
          names = readdirSync(dir).filter((n) => /^\d+\.json$/.test(n));
        } catch {
          /* none running, or an agent before the file */
        }
        for (const n of names) {
          const path = join(dir, n);
          if (!statOf(path)) continue;
          try {
            const j = JSON.parse(readFileSync(path, "utf8")) as { pid?: unknown; sessionId?: unknown };
            if (j.sessionId !== id || typeof j.pid !== "number") continue;
            if (alive(j.pid)) return "running";
          } catch {
            /* a file being written */
          }
        }
      }
      const f = find(agent, id);
      const st = f && statOf(f.path);
      return st && now() - st.mtime < OPEN_RECENT_MS ? "recent" : undefined;
    },
    history(agent, id, o = {}) {
      const f = find(agent, id);
      const st = f && statOf(f.path);
      return f && st ? turnsOf(agent, f.path, st.size, o.turns ?? 60) : [];
    },
  };
}
