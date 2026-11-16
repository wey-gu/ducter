// The person's own AI agents' records on this computer (D298): which folders they worked in
// lately with Claude Code and Codex, and what each session was about. The one reader of those
// folders in Ducter: the first words (first-words.ts) use it, and importing earlier sessions into
// Past tasks (D299) is meant to build on it rather than read the folders a second time.
//
// What it reads, and only that: the session files' names and times, and from each file the folder
// it ran in, its title (Claude Code's summary or the name the person gave it; Codex's thread name)
// and its first words from the person. Read locally, bounded (newest files of the last weeks, the
// head and tail of each), never written, never sent anywhere by this module. Ducter's own sessions
// (its partner and its tasks run these agents too) are left out by folder.
//
// Layouts (research/102 §4): Claude Code keeps `<CLAUDE_CONFIG_DIR or ~/.claude>/projects/<encoded
// cwd>/<session>.jsonl`, one JSON object a line with `cwd`, `type` (user, assistant, summary, …) and
// `message`. Codex keeps `<CODEX_HOME or ~/.codex>/sessions/YYYY/MM/DD/rollout-<time>-<id>.jsonl`,
// whose first line is `session_meta` with the `cwd`, and `session_index.jsonl` with thread names.
import { closeSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { redact } from "@ducter/protocol/src/redact.ts";

export type LocalAgent = "claude-code" | "codex";

export interface LocalSession {
  agent: LocalAgent;
  /** The agent's own session id (Claude Code's file name, Codex's id). */
  id: string;
  /** The folder it ran in. */
  cwd: string;
  /** Its title, when it has one: Claude Code's summary or custom title, Codex's thread name. */
  title?: string;
  /** The person's first words in it, one line, cut. */
  ask?: string;
  /** When it was last written (ISO). */
  at: string;
  /** The file it was read from (for D299's import). */
  file: string;
}

export interface LocalProject {
  cwd: string;
  /** The folder's own name. */
  name: string;
  at: string;
  /** Newest first. */
  sessions: LocalSession[];
}

export interface LocalAgentsOptions {
  /** The person's home (tests: a scratch folder). */
  home?: string;
  env?: Record<string, string | undefined>;
  now?: Date;
  /** Only sessions written in the last this many days (default 14). */
  days?: number;
  /** At most this many files read per agent (default 40), newest first. */
  files?: number;
  /** Folders whose sessions are Ducter's own (its data folder, its Ducter folder). */
  exclude?: string[];
}

const HEAD = 192 * 1024;
const TAIL = 48 * 1024;
const DAY = 86_400_000;

interface FileAt {
  path: string;
  mtime: number;
}

function listJsonl(dir: string, depth: number): FileAt[] {
  const out: FileAt[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const n of names) {
    const p = join(dir, n);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (depth > 0) out.push(...listJsonl(p, depth - 1));
    } else if (n.endsWith(".jsonl")) out.push({ path: p, mtime: st.mtimeMs });
  }
  return out;
}

/** The head and the tail of a file, as lines (a cut first or last line is dropped). */
function edges(path: string, size: number): { head: string[]; tail: string[] } {
  let fd: number | undefined;
  try {
    fd = openSync(path, "r");
    const hn = Math.min(size, HEAD);
    const hb = Buffer.alloc(hn);
    readSync(fd, hb, 0, hn, 0);
    let head = hb.toString("utf8").split("\n");
    if (hn < size) head = head.slice(0, -1);
    let tail: string[] = [];
    if (size > HEAD) {
      const tn = Math.min(TAIL, size - HEAD);
      const tb = Buffer.alloc(tn);
      readSync(fd, tb, 0, tn, size - tn);
      tail = tb.toString("utf8").split("\n").slice(1);
    }
    return { head, tail };
  } catch {
    return { head: [], tail: [] };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

const parse = (line: string): any => {
  if (!line || line[0] !== "{") return undefined;
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
};

/** One line of the person's words: no tags the agents add, no code, no secrets, at most 120 characters. */
export function oneLine(text: unknown, max = 120): string | undefined {
  if (typeof text !== "string") return undefined;
  const t = text.trim();
  // What the agents wrap around the person's words, not the words themselves.
  if (!t || t.startsWith("<") || /^(caveat:|# agents\.md|\[request interrupted)/i.test(t)) return undefined;
  const first = t
    .replace(/```[\s\S]*?```/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!first) return undefined;
  const s = redact(first.replace(/\s+/g, " "));
  const cs = [...s];
  return cs.length <= max ? s : cs.slice(0, max - 1).join("").trimEnd() + "…";
}

const textOf = (content: unknown): string | undefined => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    for (const c of content) {
      if (c && typeof c === "object" && (c.type === "text" || c.type === "input_text") && typeof c.text === "string") return c.text;
    }
  }
  return undefined;
};

function claudeSession(f: FileAt, size: number): LocalSession | undefined {
  const { head, tail } = edges(f.path, size);
  let cwd: string | undefined;
  let title: string | undefined;
  let ask: string | undefined;
  for (const line of [...head, ...tail]) {
    const o = parse(line);
    if (!o) continue;
    if (!cwd && typeof o.cwd === "string") cwd = o.cwd;
    // A name the person gave beats a summary; the newest of each wins (the tail comes last).
    if (o.type === "custom-title" && typeof o.customTitle === "string") title = oneLine(o.customTitle, 80) ?? title;
    else if (o.type === "summary" && typeof o.summary === "string" && !title) title = oneLine(o.summary, 80);
    if (!ask && o.type === "user" && !o.isMeta && !o.isSidechain && o.message?.role === "user") ask = oneLine(textOf(o.message.content));
  }
  if (!cwd) return undefined;
  return { agent: "claude-code", id: basename(f.path, ".jsonl"), cwd, ...(title ? { title } : {}), ...(ask ? { ask } : {}), at: new Date(f.mtime).toISOString(), file: f.path };
}

function codexSession(f: FileAt, size: number, names: Map<string, string>): LocalSession | undefined {
  const { head } = edges(f.path, size);
  let cwd: string | undefined;
  let id: string | undefined;
  let ask: string | undefined;
  for (const line of head) {
    const o = parse(line);
    if (!o) continue;
    const p = o.payload ?? {};
    if (o.type === "session_meta") {
      if (typeof p.cwd === "string") cwd = p.cwd;
      if (typeof p.id === "string") id = p.id;
      continue;
    }
    if (!ask && o.type === "event_msg" && p.type === "user_message") ask = oneLine(p.message);
    if (!ask && o.type === "response_item" && p.type === "message" && p.role === "user") ask = oneLine(textOf(p.content));
    if (cwd && ask) break;
  }
  if (!cwd) return undefined;
  id ??= /([0-9a-f]{8}-[0-9a-f-]{27,})\.jsonl$/i.exec(f.path)?.[1] ?? basename(f.path, ".jsonl");
  const title = names.get(id);
  return { agent: "codex", id, cwd, ...(title ? { title } : {}), ...(ask ? { ask } : {}), at: new Date(f.mtime).toISOString(), file: f.path };
}

/** Codex's thread names (`session_index.jsonl`: id and thread_name a line; the last one wins). */
function codexNames(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  let text = "";
  try {
    const p = join(dir, "session_index.jsonl");
    const size = statSync(p).size;
    text = size > 2 * 1024 * 1024 ? "" : readFileSync(p, "utf8");
  } catch {
    return out;
  }
  for (const line of text.split("\n")) {
    const o = parse(line);
    const name = oneLine(o?.thread_name, 80);
    if (o && typeof o.id === "string" && name) out.set(o.id, name);
  }
  return out;
}

/** Where each agent keeps its sessions on this computer. */
export function agentDirs(o: Pick<LocalAgentsOptions, "home" | "env"> = {}): Record<LocalAgent, string> {
  const env = o.env ?? process.env;
  const home = o.home ?? homedir();
  return {
    "claude-code": join(env.CLAUDE_CONFIG_DIR || join(home, ".claude"), "projects"),
    codex: env.CODEX_HOME || join(home, ".codex"),
  };
}

const under = (p: string, root: string) => {
  const a = resolve(p);
  const b = resolve(root);
  return a === b || a.startsWith(b.endsWith(sep) ? b : b + sep);
};

/** A folder that is nobody's project: the home itself, a temporary folder, or one of Ducter's own. */
function skipped(cwd: string, home: string, exclude: string[]): boolean {
  if (!cwd.startsWith("/") && !/^[A-Za-z]:\\/.test(cwd)) return true;
  if (resolve(cwd) === resolve(home) || resolve(cwd) === "/") return true;
  const temps = [tmpdir(), "/tmp", "/private/tmp", "/private/var/folders", "/var/folders"];
  return [...temps, ...exclude].some((r) => r && under(cwd, r));
}

/**
 * The person's recent sessions in their own Claude Code and Codex, newest first. Nothing found,
 * an agent never used, or a folder that can't be read: an empty list, never an error.
 */
export function recentSessions(o: LocalAgentsOptions = {}): LocalSession[] {
  const now = (o.now ?? new Date()).getTime();
  const since = now - (o.days ?? 14) * DAY;
  const max = o.files ?? 40;
  const home = o.home ?? homedir();
  const dirs = agentDirs(o);
  const exclude = o.exclude ?? [];
  const pick = (files: FileAt[]) =>
    files
      .filter((f) => f.mtime >= since && f.mtime <= now + DAY)
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, max);
  const out: LocalSession[] = [];
  for (const f of pick(listJsonl(dirs["claude-code"], 1))) {
    let size = 0;
    try {
      size = statSync(f.path).size;
    } catch {
      continue;
    }
    const s = claudeSession(f, size);
    if (s && !skipped(s.cwd, home, exclude)) out.push(s);
  }
  const names = codexNames(dirs.codex);
  for (const f of pick(listJsonl(join(dirs.codex, "sessions"), 3))) {
    let size = 0;
    try {
      size = statSync(f.path).size;
    } catch {
      continue;
    }
    const s = codexSession(f, size, names);
    if (s && !skipped(s.cwd, home, exclude)) out.push(s);
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** The folders those sessions ran in, the most recently used first, each with its sessions. */
export function recentProjects(o: LocalAgentsOptions = {}): LocalProject[] {
  const by = new Map<string, LocalProject>();
  for (const s of recentSessions(o)) {
    const key = resolve(s.cwd);
    const p = by.get(key) ?? { cwd: key, name: basename(key), at: s.at, sessions: [] };
    p.sessions.push(s);
    by.set(key, p);
  }
  return [...by.values()].sort((a, b) => b.at.localeCompare(a.at));
}

/** Which agents have kept any session here at all (whether the first words can say "your Claude Code"). */
export function agentsUsed(o: Pick<LocalAgentsOptions, "home" | "env"> = {}): LocalAgent[] {
  const d = agentDirs(o);
  const has = (p: string) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  };
  return (["claude-code", "codex"] as const).filter((a) => has(a === "codex" ? join(d.codex, "sessions") : d[a]));
}
