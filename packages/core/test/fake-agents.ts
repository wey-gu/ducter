// D298: a scratch home holding fake Claude Code and Codex records, in the layouts the real agents
// keep (research/102 §4). Never the person's own folders.
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface FakeSession {
  agent: "claude-code" | "codex";
  cwd: string;
  id: string;
  /** Claude Code: a summary line; Codex: a thread name in session_index.jsonl. */
  title?: string;
  ask?: string;
  at: Date;
}

const enc = (cwd: string) => cwd.replace(/[^A-Za-z0-9]/g, "-");

export function fakeAgents(home: string, sessions: FakeSession[]) {
  const index: string[] = [];
  for (const s of sessions) {
    let file: string;
    let lines: unknown[];
    if (s.agent === "claude-code") {
      const dir = join(home, ".claude", "projects", enc(s.cwd));
      mkdirSync(dir, { recursive: true });
      file = join(dir, `${s.id}.jsonl`);
      lines = [
        ...(s.title ? [{ type: "summary", summary: s.title, leafUuid: "x" }] : []),
        { type: "user", isMeta: true, cwd: s.cwd, sessionId: s.id, message: { role: "user", content: "<command-name>/clear</command-name>" } },
        ...(s.ask ? [{ type: "user", cwd: s.cwd, sessionId: s.id, message: { role: "user", content: [{ type: "text", text: s.ask }] } }] : []),
        { type: "assistant", cwd: s.cwd, sessionId: s.id, message: { role: "assistant", content: [{ type: "text", text: "On it." }] } },
      ];
    } else {
      const d = s.at;
      const dir = join(home, ".codex", "sessions", String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, "0"), String(d.getUTCDate()).padStart(2, "0"));
      mkdirSync(dir, { recursive: true });
      file = join(dir, `rollout-${d.toISOString().slice(0, 19).replace(/:/g, "-")}-${s.id}.jsonl`);
      lines = [
        { timestamp: d.toISOString(), type: "session_meta", payload: { id: s.id, cwd: s.cwd, originator: "codex_cli_rs" } },
        { type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context>\n  <cwd>x</cwd>\n</environment_context>" }] } },
        ...(s.ask ? [{ type: "event_msg", payload: { type: "user_message", message: s.ask } }] : []),
      ];
      if (s.title) index.push(JSON.stringify({ id: s.id, thread_name: s.title, updated_at: d.toISOString() }));
    }
    writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    utimesSync(file, s.at, s.at);
  }
  if (index.length) {
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(join(home, ".codex", "session_index.jsonl"), index.join("\n") + "\n");
  }
}
