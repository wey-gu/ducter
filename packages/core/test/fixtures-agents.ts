// D299: tiny synthetic sessions in the record shapes Claude Code 2.1.325, codex-cli 0.169.0 and
// pi 1.5.2 write (research/103 §2), in a scratch home. Never a real person's sessions. The demo
// core (apps/web/demo-outside.ts) seeds its own home with these too.
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface FakeSession {
  agent: "claude-code" | "codex" | "pi";
  id: string;
  cwd: string;
  /** The person's words and the agent's, in order. */
  turns: [string, string][];
  title?: string;
  branch?: string;
  model?: string;
  /** When it began and was last written. */
  startedAt: Date;
  updatedAt: Date;
}

const iso = (d: Date, plusMs = 0) => new Date(d.getTime() + plusMs).toISOString();
const slugClaude = (cwd: string) => cwd.replace(/[^A-Za-z0-9]/g, "-");
const slugPi = (cwd: string) => `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;

/** Writes the session where its agent keeps it under `home`; the file's path. */
export function writeSession(home: string, s: FakeSession): string {
  const lines: unknown[] = [];
  const step = Math.max(1000, Math.floor((s.updatedAt.getTime() - s.startedAt.getTime()) / Math.max(1, s.turns.length * 2)));
  let path: string;
  if (s.agent === "claude-code") {
    const dir = join(home, ".claude", "projects", slugClaude(s.cwd));
    path = join(dir, `${s.id}.jsonl`);
    const base = { cwd: s.cwd, sessionId: s.id, version: "2.1.325", gitBranch: s.branch ?? "HEAD", userType: "external", entrypoint: "cli", isSidechain: false };
    lines.push({ type: "queue-operation", operation: "enqueue", timestamp: iso(s.startedAt), sessionId: s.id, content: s.turns[0]?.[0] ?? "" });
    let parent: string | null = null;
    s.turns.forEach(([you, it], i) => {
      const u = `${s.id.slice(0, 8)}-u${i}`;
      lines.push({ parentUuid: parent, ...base, type: "user", message: { role: "user", content: you }, uuid: u, timestamp: iso(s.startedAt, step * 2 * i) });
      lines.push({ parentUuid: u, ...base, type: "attachment", attachment: { type: "date", date: iso(s.startedAt).slice(0, 10) }, uuid: `${u}-a`, timestamp: iso(s.startedAt, step * 2 * i) });
      // A tool round trip the history leaves out, then the reply.
      lines.push({ parentUuid: u, ...base, type: "assistant", message: { role: "assistant", model: s.model ?? "claude-sonnet-5", content: [{ type: "tool_use", id: `t${i}`, name: "Read", input: { file_path: join(s.cwd, "README.md") } }] }, uuid: `${u}-t`, timestamp: iso(s.startedAt, step * (2 * i + 1)) });
      lines.push({ parentUuid: `${u}-t`, ...base, type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: `t${i}`, content: "…" }] }, uuid: `${u}-r`, timestamp: iso(s.startedAt, step * (2 * i + 1)) });
      lines.push({ parentUuid: `${u}-r`, ...base, type: "assistant", message: { role: "assistant", model: s.model ?? "claude-sonnet-5", content: [{ type: "text", text: it }] }, uuid: `${u}-v`, timestamp: iso(s.startedAt, step * (2 * i + 1) + 500) });
      parent = `${u}-v`;
    });
    if (s.title) lines.push({ type: "custom-title", customTitle: s.title, sessionId: s.id });
    lines.push({ type: "last-prompt", lastPrompt: s.turns.at(-1)?.[0] ?? "", leafUuid: parent, sessionId: s.id });
  } else if (s.agent === "codex") {
    const d = s.startedAt;
    const dir = join(home, ".codex", "sessions", String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0"));
    path = join(dir, `rollout-${iso(d).slice(0, 19).replace(/:/g, "-")}-${s.id}.jsonl`);
    lines.push({ timestamp: iso(d), type: "session_meta", payload: { session_id: s.id, id: s.id, timestamp: iso(d), cwd: s.cwd, originator: "codex_cli_rs", cli_version: "0.169.0", source: "cli", model_provider: "openai", base_instructions: { text: "You are a coding agent running in the Codex CLI." }, ...(s.branch ? { git: { commit_hash: "887f0335", branch: s.branch } } : {}) } });
    lines.push({ timestamp: iso(d), type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: `<environment_context>\n  <cwd>${s.cwd}</cwd>\n</environment_context>` }] } });
    lines.push({ timestamp: iso(d), type: "turn_context", payload: { cwd: s.cwd, model: s.model ?? "gpt-5.5", approval_policy: "on-request" } });
    s.turns.forEach(([you, it], i) => {
      lines.push({ timestamp: iso(d, step * 2 * i), type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: you }] } });
      lines.push({ timestamp: iso(d, step * 2 * i), type: "response_item", payload: { type: "function_call", name: "shell", arguments: "{\"command\":[\"ls\"]}", call_id: `c${i}` } });
      lines.push({ timestamp: iso(d, step * (2 * i + 1)), type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: it }] } });
      lines.push({ timestamp: iso(d, step * (2 * i + 1)), type: "event_msg", payload: { type: "task_complete", last_agent_message: it } });
    });
    if (s.title) lines.push({ timestamp: iso(s.updatedAt), type: "event_msg", payload: { type: "thread_name_updated", thread_id: s.id, thread_name: s.title } });
  } else {
    const dir = join(home, ".pi", "agent", "sessions", slugPi(s.cwd));
    path = join(dir, `${iso(s.startedAt).replace(/[:.]/g, "-")}_${s.id}.jsonl`);
    lines.push({ type: "session", version: 3, id: s.id, timestamp: iso(s.startedAt), cwd: s.cwd });
    lines.push({ type: "model_change", id: "m1", parentId: null, timestamp: iso(s.startedAt), provider: "anthropic", modelId: s.model ?? "claude-sonnet-5" });
    if (s.title) lines.push({ type: "session_info", id: "n1", parentId: "m1", timestamp: iso(s.startedAt), name: s.title });
    s.turns.forEach(([you, it], i) => {
      lines.push({ type: "message", id: `u${i}`, parentId: "m1", timestamp: iso(s.startedAt, step * 2 * i), message: { role: "user", content: [{ type: "text", text: you }], timestamp: s.startedAt.getTime() } });
      lines.push({ type: "message", id: `a${i}`, parentId: `u${i}`, timestamp: iso(s.startedAt, step * (2 * i + 1)), message: { role: "assistant", content: [{ type: "text", text: it }], model: s.model ?? "claude-sonnet-5" } });
    });
  }
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  utimesSync(path, s.updatedAt, s.updatedAt);
  return path;
}
