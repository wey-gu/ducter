// D299: each agent's session files and how to read one (research/103, record shapes from Claude
// Code 2.1.325, codex-cli 0.169.0 and pi 1.5.2). Read only.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { eachHead, lineOf, machineWords, tailRecords, textOf } from "./read.ts";

export type LocalAgent = "claude-code" | "codex" | "pi";
export const LOCAL_AGENTS: readonly LocalAgent[] = ["claude-code", "codex", "pi"];

/** What one session is, read from its file's head and tail. */
export interface SessionSummary {
  agent: LocalAgent;
  /** The agent's own session id: what it resumes by. */
  id: string;
  path: string;
  /** The folder it ran in. */
  cwd: string;
  branch?: string;
  /** A name it was given: the person's (/rename, --name) or the agent's own (Claude Code's AI title). */
  title?: string;
  /** The person's first words in it, one line. */
  firstPrompt?: string;
  /** The person's last words in it, one line (Claude Code keeps it; else from the tail). */
  lastPrompt?: string;
  startedAt: string;
  /** When the file last changed. */
  updatedAt: string;
  model?: string;
  /** The agent's version that wrote it. */
  version?: string;
  bytes: number;
}

/** One turn of the conversation as a person reads it: their words, or the agent's. */
export interface SessionTurn {
  role: "user" | "assistant";
  text: string;
  at?: string;
}

/** Where each agent keeps its sessions on this computer (macOS and Linux alike). */
export function rootsOf(home: string, env: Record<string, string | undefined>): Record<LocalAgent, string> {
  return {
    "claude-code": join(env.CLAUDE_CONFIG_DIR || join(home, ".claude"), "projects"),
    codex: join(env.CODEX_HOME || join(home, ".codex"), "sessions"),
    pi: join(env.PI_CODING_AGENT_DIR || env.OAR_PI_AGENT_DIR || join(home, ".pi", "agent"), "sessions"),
  };
}

const ls = (dir: string): string[] => {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
};

/** The session files under an agent's root (top level only: Claude Code's subagent files are inside a session's own folder). */
export function filesOf(agent: LocalAgent, root: string): { path: string; id: string }[] {
  if (!existsSync(root)) return [];
  const out: { path: string; id: string }[] = [];
  if (agent === "codex") {
    // sessions/YYYY/MM/DD/rollout-<time>-<uuid>.jsonl
    for (const y of ls(root).filter((x) => /^\d{4}$/.test(x)))
      for (const m of ls(join(root, y)).filter((x) => /^\d{2}$/.test(x)))
        for (const d of ls(join(root, y, m)).filter((x) => /^\d{2}$/.test(x)))
          for (const f of ls(join(root, y, m, d))) {
            const id = /^rollout-.+-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/.exec(f)?.[1];
            if (id) out.push({ path: join(root, y, m, d, f), id });
          }
    return out;
  }
  // claude-code: projects/<cwd slug>/<uuid>.jsonl; pi: sessions/--<cwd slug>--/<time>_<uuid>.jsonl
  for (const dir of ls(root))
    for (const f of ls(join(root, dir))) {
      if (!f.endsWith(".jsonl")) continue;
      const id = agent === "pi" ? /_([^_]+)\.jsonl$/.exec(f)?.[1] : f.slice(0, -6);
      if (id) out.push({ path: join(root, dir, f), id });
    }
  return out;
}

const s = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const o = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : undefined);

/** A session's summary from its file; undefined when it holds nothing the person said. */
export function summarize(agent: LocalAgent, f: { path: string; id: string }, size: number, mtimeMs: number): SessionSummary | undefined {
  const sum: Partial<SessionSummary> & { agent: LocalAgent; id: string; path: string; bytes: number } = { agent, id: f.id, path: f.path, bytes: size };
  const updatedAt = new Date(mtimeMs).toISOString();
  if (agent === "claude-code") {
    eachHead(f.path, (r) => {
      if (!sum.startedAt && s(r.timestamp)) sum.startedAt = r.timestamp as string;
      if (!sum.cwd && s(r.cwd)) sum.cwd = r.cwd as string;
      if (!sum.version && s(r.version)) sum.version = r.version as string;
      if (r.type === "user" && !r.isMeta && !r.isSidechain) {
        const text = textOf(o(r.message)?.content, ["text"]);
        if (!machineWords(text) && !sum.firstPrompt) {
          sum.firstPrompt = lineOf(text);
          if (s(r.gitBranch) && r.gitBranch !== "HEAD") sum.branch = r.gitBranch as string;
        }
      }
      if (r.type === "assistant" && !sum.model) sum.model = s(o(r.message)?.model);
      return !!(sum.firstPrompt && sum.model && sum.cwd);
    });
    // The tail: its name (the last /rename wins over the AI title; an older summary line last), its last words.
    let custom: string | undefined;
    let ai: string | undefined;
    let older: string | undefined;
    for (const r of tailRecords(f.path, size, 256 * 1024)) {
      if (r.type === "custom-title" && s(r.customTitle)) custom = r.customTitle as string;
      else if (r.type === "ai-title" && s(r.aiTitle)) ai = r.aiTitle as string;
      else if (r.type === "summary" && s(r.summary)) older = r.summary as string;
      else if (r.type === "last-prompt" && s(r.lastPrompt) && !machineWords(r.lastPrompt as string)) sum.lastPrompt = lineOf(r.lastPrompt as string);
      else if (r.type === "user" && !r.isMeta && !r.isSidechain) {
        const text = textOf(o(r.message)?.content, ["text"]);
        if (!machineWords(text)) sum.lastPrompt = lineOf(text);
      }
      if (s(r.gitBranch) && r.gitBranch !== "HEAD") sum.branch = r.gitBranch as string;
    }
    const title = custom ?? ai ?? older;
    if (title) sum.title = lineOf(title);
  } else if (agent === "codex") {
    eachHead(f.path, (r) => {
      const p = o(r.payload);
      if (r.type === "session_meta" && p) {
        sum.cwd = s(p.cwd);
        sum.startedAt = s(p.timestamp) ?? s(r.timestamp);
        sum.version = s(p.cli_version);
        const branch = s(o(p.git)?.branch);
        if (branch) sum.branch = branch;
      } else if (r.type === "turn_context" && p && !sum.model) sum.model = s(p.model);
      else if (r.type === "response_item" && p?.type === "message" && p.role === "user" && !sum.firstPrompt) {
        const text = textOf(p.content);
        if (!machineWords(text)) sum.firstPrompt = lineOf(text);
      } else if (r.type === "event_msg" && p?.type === "user_message" && !sum.firstPrompt && s(p.message) && !machineWords(p.message as string)) {
        sum.firstPrompt = lineOf(p.message as string); // older Codex
      }
      return !!(sum.cwd && sum.firstPrompt && sum.model);
    });
    for (const r of tailRecords(f.path, size, 128 * 1024)) {
      const p = o(r.payload);
      if (r.type === "response_item" && p?.type === "message" && p.role === "user") {
        const text = textOf(p.content);
        if (!machineWords(text)) sum.lastPrompt = lineOf(text);
      }
      if (r.type === "event_msg" && p?.type === "thread_name_updated" && s(p.thread_name)) sum.title = lineOf(p.thread_name as string);
    }
  } else {
    eachHead(f.path, (r) => {
      if (r.type === "session") {
        sum.cwd = s(r.cwd);
        sum.startedAt = s(r.timestamp);
        if (s(r.id)) sum.id = r.id as string;
      } else if (r.type === "model_change" && !sum.model) sum.model = s(r.modelId);
      else if (r.type === "session_info" && s(r.name)) sum.title = lineOf(r.name as string);
      else if (r.type === "message" && o(r.message)?.role === "user" && !sum.firstPrompt) {
        const text = textOf(o(r.message)?.content, ["text"]);
        if (!machineWords(text)) sum.firstPrompt = lineOf(text);
      }
      return !!(sum.cwd && sum.firstPrompt && sum.model && sum.title);
    });
    for (const r of tailRecords(f.path, size, 128 * 1024)) {
      if (r.type === "session_info" && s(r.name)) sum.title = lineOf(r.name as string);
      if (r.type === "message" && o(r.message)?.role === "user") {
        const text = textOf(o(r.message)?.content, ["text"]);
        if (!machineWords(text)) sum.lastPrompt = lineOf(text);
      }
    }
  }
  if (!sum.cwd || !sum.firstPrompt) return undefined;
  return { ...sum, cwd: sum.cwd, startedAt: sum.startedAt ?? updatedAt, updatedAt } as SessionSummary;
}

/**
 * The conversation at the end of a session: the person's words and the agent's, in order, the
 * last `max` turns found in its last `bytes`. Tool calls, their output, reasoning and the
 * harness's own lines are left out: they stay in the agent's session, which it reads itself.
 */
export function turnsOf(agent: LocalAgent, path: string, size: number, max = 60, bytes = 8 << 20): SessionTurn[] {
  const out: SessionTurn[] = [];
  const push = (role: SessionTurn["role"], text: string, at?: string) => {
    const t = text.trim();
    if (!t) return;
    const last = out.at(-1);
    // One reply written over several records (Claude Code writes a block per line) is one turn.
    if (last && last.role === "assistant" && role === "assistant") last.text = `${last.text}\n\n${t}`;
    else out.push({ role, text: t, ...(at ? { at } : {}) });
  };
  for (const r of tailRecords(path, size, bytes)) {
    const at = s(r.timestamp);
    if (agent === "claude-code") {
      if (r.isSidechain) continue;
      const m = o(r.message);
      if (r.type === "user" && !r.isMeta) {
        const text = textOf(m?.content, ["text"]);
        if (!machineWords(text)) push("user", text, at);
      } else if (r.type === "assistant") push("assistant", textOf(m?.content, ["text"]), at);
    } else if (agent === "codex") {
      const p = o(r.payload);
      if (r.type !== "response_item" || p?.type !== "message") continue;
      if (p.role === "user") {
        const text = textOf(p.content);
        if (!machineWords(text)) push("user", text, at);
      } else if (p.role === "assistant") push("assistant", textOf(p.content), at);
    } else if (r.type === "message") {
      const m = o(r.message);
      if (m?.role === "user") {
        const text = textOf(m.content, ["text"]);
        if (!machineWords(text)) push("user", text, at);
      } else if (m?.role === "assistant") push("assistant", textOf(m.content, ["text"]), at);
    }
  }
  return out.slice(-max);
}
