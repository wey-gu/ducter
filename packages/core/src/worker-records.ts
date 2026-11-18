// D377: the person's own AI agent sessions on a computer for tasks (a worker), for the partner's
// own_session_find and own_session_continue at the home. D327 (9): a worker's records are read only
// after a yes said for that computer, because reading them moves what is derived from them off the
// computer they were written on. The yes is kept here, on that computer (<dataDir>/records.json),
// and this side enforces it: without it, nothing inside a session file is read, and only the
// agents and when each last wrote (file times alone, as D327's look start uses) go to the home.
//
// Cheap to ask again: the reader keeps each summary until its file changes (stat only), and the
// home keeps the last answer for a minute (outside.ts).
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import type { DeviceRecordsView, OutsideAgent } from "@ducter/protocol";
import { LOCAL_AGENTS, type LocalAgent, type LocalAgents, type SessionSummary, type SessionTurn } from "./local-agents/index.ts";

/** One session as a worker sends it up: what D327 (4) says is read, nothing more. */
export interface WireSession {
  agent: OutsideAgent;
  id: string;
  title?: string;
  firstPrompt?: string;
  lastPrompt?: string;
  /** The folder it ran in, absolute on that computer. */
  cwd: string;
  /** The folder's project name there (a git worktree's own repo). */
  project: string;
  branch?: string;
  model?: string;
  startedAt: string;
  updatedAt: string;
  /** D376's check, done there: open in its agent now (Claude Code's sessions/<pid>.json), or written a moment ago. */
  open?: "running" | "recent";
  /** Its folder isn't there any more. */
  gone?: true;
}

/** The local_sessions op's answer. allowed false: only the agents and their file times. */
export type LocalSessionsAnswer =
  | { allowed: false; state: "unasked" | "off"; agents: DeviceRecordsView["agents"] }
  | { allowed: true; home: string; agents: DeviceRecordsView["agents"]; sessions: WireSession[] };

/** The local_session op's answer: one session to carry on, with the end of its conversation. */
export type LocalSessionAnswer =
  | { allowed: false }
  | { allowed: true; home: string; session?: WireSession; turns: SessionTurn[] };

export interface WorkerRecords {
  view(): DeviceRecordsView;
  /** The person's yes (true) or 别再看了 (false), from that computer's card. Off forgets what was read. */
  set(on: boolean): DeviceRecordsView;
  ops: Record<"local_sessions" | "local_session" | "records_allow", (a: any) => Promise<unknown>>;
}

/** At most this many sessions go up per answer, newest first (the home ranks them, as its own). */
const MAX_SESSIONS = 200;
/** A line of the person's words or a name, as sent: enough to recognise it. */
const clip = (s: string | undefined, n = 300) => (s === undefined ? undefined : [...s].length > n ? `${[...s].slice(0, n - 1).join("")}…` : s);

export function createWorkerRecords(o: {
  dataDir: string;
  reader: LocalAgents;
  home?: string;
  /** This computer's Ducter folder (worktrees, projects): sessions there are Ducter's own. */
  ducterFolder?: () => string;
  /** Said when the view changed (the yes given or taken back): sent up as a `records` frame. */
  changed?: () => void;
}): WorkerRecords {
  const home = o.home ?? homedir();
  const file = join(o.dataDir, "records.json");
  let state: "unasked" | "on" | "off" = "unasked";
  try {
    if (existsSync(file)) {
      const j = JSON.parse(readFileSync(file, "utf8")) as { allowed?: unknown };
      if (j.allowed === true) state = "on";
      else if (j.allowed === false) state = "off";
    }
  } catch {
    /* a broken file: asked again */
  }
  const save = () => {
    mkdirSync(o.dataDir, { recursive: true });
    writeFileSync(`${file}.tmp`, JSON.stringify({ version: 1, allowed: state === "on", at: new Date().toISOString() }, null, 2), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  };

  const under = (p: string, root: string) => p === root || p.startsWith(root.endsWith(sep) ? root : root + sep);
  const read = Object.values(o.reader.roots()).map((r) => resolve(r));
  const temp = [tmpdir(), "/tmp", "/private/tmp", "/var/folders", "/private/var/folders"].map((p) => resolve(p)).filter((t) => !read.some((r) => under(r, t)));
  const ducters = () => [resolve(o.dataDir), ...(o.ducterFolder ? [resolve(o.ducterFolder())] : [])];
  // Ducter's own sessions here (its worktrees, its data folder) and experiments in a temporary folder.
  const ours = (s: SessionSummary) => ducters().some((r) => under(resolve(s.cwd), r)) || temp.some((r) => under(resolve(s.cwd), r));

  /** By file times and names alone: which agents wrote a session here, and when last. */
  const agents = (): DeviceRecordsView["agents"] => {
    const at = o.reader.latest({ skip: ducters() });
    return LOCAL_AGENTS.flatMap((agent) => (at[agent] !== undefined ? [{ agent, lastAt: new Date(at[agent]!).toISOString() }] : []));
  };

  const projectOf = (cwd: string): string => {
    let name = basename(cwd) || cwd;
    try {
      const dotgit = join(cwd, ".git");
      if (existsSync(dotgit) && statSync(dotgit).isFile()) {
        const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotgit, "utf8"));
        if (m) {
          const gd = resolve(cwd, m[1]!.trim());
          if (basename(dirname(gd)) === "worktrees") name = basename(dirname(dirname(dirname(gd)))) || name;
        }
      }
    } catch {
      /* the folder's own name */
    }
    return name;
  };
  const wire = (s: SessionSummary, open: "running" | "recent" | undefined): WireSession => {
    const title = clip(s.title);
    const firstPrompt = clip(s.firstPrompt);
    const lastPrompt = clip(s.lastPrompt);
    return {
      agent: s.agent,
      id: s.id,
      ...(title ? { title } : {}),
      ...(firstPrompt ? { firstPrompt } : {}),
      ...(lastPrompt ? { lastPrompt } : {}),
      cwd: s.cwd,
      project: projectOf(s.cwd),
      ...(s.branch ? { branch: s.branch } : {}),
      ...(s.model ? { model: s.model } : {}),
      startedAt: s.startedAt,
      updatedAt: s.updatedAt,
      ...(open ? { open } : {}),
      ...(existsSync(s.cwd) ? {} : { gone: true as const }),
    };
  };

  const view = (): DeviceRecordsView => ({ state, agents: agents() });
  const set = (on: boolean) => {
    state = on ? "on" : "off";
    save();
    // D327 (7): off forgets what was read.
    if (!on) o.reader.forget();
    o.changed?.();
    return view();
  };
  const isAgent = (a: unknown): a is LocalAgent => typeof a === "string" && (LOCAL_AGENTS as readonly string[]).includes(a);

  return {
    view,
    set,
    ops: {
      async local_sessions(): Promise<LocalSessionsAnswer> {
        if (state !== "on") return { allowed: false, state, agents: agents() };
        const all = o.reader.sessions({ limit: MAX_SESSIONS }).filter((s) => !ours(s)).slice(0, MAX_SESSIONS);
        // Only the newest few could still be open: the check reads Claude Code's small per-process files.
        const sessions = all.map((s, i) => wire(s, i < 20 ? o.reader.openNow(s.agent, s.id) : undefined));
        return { allowed: true, home, agents: agents(), sessions };
      },
      async local_session(a: { agent?: unknown; id?: unknown }): Promise<LocalSessionAnswer> {
        if (state !== "on") return { allowed: false };
        if (!isAgent(a.agent) || typeof a.id !== "string" || !a.id) return { allowed: true, home, turns: [] };
        const s = o.reader.summary(a.agent, a.id);
        if (!s || ours(s)) return { allowed: true, home, turns: [] };
        // D376: checked here, on the computer it runs on, the moment it is carried on.
        return { allowed: true, home, session: wire(s, o.reader.openNow(a.agent, a.id)), turns: o.reader.history(a.agent, a.id, { turns: 60 }) };
      },
      async records_allow(a: { on?: unknown }) {
        return set(a.on === true);
      },
    },
  };
}
