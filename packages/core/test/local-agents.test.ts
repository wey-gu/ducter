// D299: the shared reader of the person's own agents' sessions (packages/core/src/local-agents),
// over synthetic sessions in the shapes the installed agents write (research/103 §2): which
// projects, which sessions, what one was, and the conversation at its end. Read only.
import { expect, test } from "bun:test";
import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createLocalAgents } from "../src/local-agents/index.ts";
import { writeSession } from "./fixtures-agents.ts";
import { tempDir } from "./helpers.ts";

const at = (d: number, h = 10) => new Date(2026, 10, d, h, 0, 0);

function home() {
  const h = tempDir().dir;
  const hawdb = join(h, "src", "hawdb");
  const mem = join(h, "src", "mem");
  mkdirSync(hawdb, { recursive: true });
  mkdirSync(mem, { recursive: true });
  const files = {
    claude: writeSession(h, { agent: "claude-code", id: "942ecde2-b387-45c2-bbc6-75da83748a7f", cwd: hawdb, branch: "fix/raft-snapshot", model: "claude-opus-5", title: "Raft snapshot race", turns: [["Why is TestRaftSnapshot flaky?", "The snapshot timer races the leader step-down."], ["Add a fence and a test", "Added the fence; 200 runs pass."]], startedAt: at(12), updatedAt: at(12, 11) }),
    codex: writeSession(h, { agent: "codex", id: "01a1e522-a9c6-7d53-9d33-0dfcdf329f76", cwd: hawdb, branch: "main", model: "gpt-5.5", turns: [["Look into why the release build is slow", "Linking takes 70% of it; thin LTO halves it."]], startedAt: at(14), updatedAt: at(14, 12) }),
    pi: writeSession(h, { agent: "pi", id: "01a1e523-706a-722e-8264-627a362842f1", cwd: mem, title: "Release notes", turns: [["Write the release notes for 0.9", "Drafted them in CHANGELOG.md."]], startedAt: at(10), updatedAt: at(10, 13) }),
  };
  return { h, hawdb, mem, files };
}

test("sessions: newest first, each with its folder, branch, name, first words and model", () => {
  const { h, hawdb, mem } = home();
  const r = createLocalAgents({ home: h, env: {} });
  const all = r.sessions();
  expect(all.map((s) => s.agent)).toEqual(["codex", "claude-code", "pi"]);
  expect(all[1]).toMatchObject({ id: "942ecde2-b387-45c2-bbc6-75da83748a7f", cwd: hawdb, branch: "fix/raft-snapshot", title: "Raft snapshot race", firstPrompt: "Why is TestRaftSnapshot flaky?", lastPrompt: "Add a fence and a test", model: "claude-opus-5", version: "2.1.325" });
  expect(all[0]).toMatchObject({ cwd: hawdb, branch: "main", firstPrompt: "Look into why the release build is slow", model: "gpt-5.5", version: "0.169.0" });
  expect(all[0]!.title).toBeUndefined(); // the first words stand in, at the card
  expect(all[2]).toMatchObject({ cwd: mem, title: "Release notes", firstPrompt: "Write the release notes for 0.9" });
  expect(all[1]!.updatedAt).toBe(at(12, 11).toISOString());
  expect(r.sessions({ agents: ["pi"] }).map((s) => s.id)).toEqual(["01a1e523-706a-722e-8264-627a362842f1"]);
});

test("projects: the folders, newest first, with who worked there", () => {
  const { h, hawdb, mem } = home();
  const p = createLocalAgents({ home: h, env: {} }).projects();
  expect(p.map((x) => [x.cwd, x.sessions, x.agents.sort().join(",")])).toEqual([
    [hawdb, 2, "claude-code,codex"],
    [mem, 1, "pi"],
  ]);
});

test("history: the person's words and the agent's, tool calls and the harness's own lines left out", () => {
  const { h } = home();
  const r = createLocalAgents({ home: h, env: {} });
  expect(r.history("claude-code", "942ecde2-b387-45c2-bbc6-75da83748a7f").map((x) => [x.role, x.text])).toEqual([
    ["user", "Why is TestRaftSnapshot flaky?"],
    ["assistant", "The snapshot timer races the leader step-down."],
    ["user", "Add a fence and a test"],
    ["assistant", "Added the fence; 200 runs pass."],
  ]);
  expect(r.history("codex", "01a1e522-a9c6-7d53-9d33-0dfcdf329f76").map((x) => x.text)).toEqual(["Look into why the release build is slow", "Linking takes 70% of it; thin LTO halves it."]);
  expect(r.history("pi", "01a1e523-706a-722e-8264-627a362842f1", { turns: 1 }).map((x) => x.text)).toEqual(["Drafted them in CHANGELOG.md."]);
});

test("reading never changes a session file; a changed file is read again", () => {
  const { h, files } = home();
  const before = Object.values(files).map((f) => [readFileSync(f, "utf8"), statSync(f).mtimeMs]);
  const r = createLocalAgents({ home: h, env: {} });
  r.sessions();
  r.history("codex", "01a1e522-a9c6-7d53-9d33-0dfcdf329f76");
  expect(Object.values(files).map((f) => [readFileSync(f, "utf8"), statSync(f).mtimeMs])).toEqual(before);
  // The agent appended a /rename by hand: the next listing says it.
  appendFileSync(files.claude, `${JSON.stringify({ type: "custom-title", customTitle: "The fence", sessionId: "942ecde2-b387-45c2-bbc6-75da83748a7f" })}\n`);
  expect(r.summary("claude-code", "942ecde2-b387-45c2-bbc6-75da83748a7f")?.title).toBe("The fence");
});

test("a huge session is read only at its ends; a broken or empty one is skipped", () => {
  const { h, hawdb } = home();
  const big = writeSession(h, { agent: "claude-code", id: "b16b16b1-0000-4000-8000-000000000001", cwd: hawdb, turns: [["Port the WAL to io_uring", "Started."]], startedAt: at(15), updatedAt: at(15, 9) });
  // 12 MB of tool output in the middle (sessions reach a GB, research/103 §4).
  const pad = JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", content: "x".repeat(1 << 20) }] } });
  for (let i = 0; i < 12; i++) appendFileSync(big, `${pad}\n`);
  appendFileSync(big, `${JSON.stringify({ type: "user", cwd: hawdb, message: { role: "user", content: "Now benchmark it" }, timestamp: at(15, 9).toISOString() })}\n`);
  mkdirSync(join(h, ".claude", "projects", "-broken"), { recursive: true });
  writeFileSync(join(h, ".claude", "projects", "-broken", "11111111-2222-3333-4444-555555555555.jsonl"), "{not json\n");
  const r = createLocalAgents({ home: h, env: {} });
  const t0 = performance.now();
  const s = r.summary("claude-code", "b16b16b1-0000-4000-8000-000000000001");
  expect(performance.now() - t0).toBeLessThan(500);
  expect(s).toMatchObject({ firstPrompt: "Port the WAL to io_uring", lastPrompt: "Now benchmark it" });
  expect(r.summary("claude-code", "11111111-2222-3333-4444-555555555555")).toBeUndefined();
  expect(r.history("claude-code", "b16b16b1-0000-4000-8000-000000000001").at(-1)?.text).toBe("Now benchmark it");
});

test("where each agent keeps them: CLAUDE_CONFIG_DIR, CODEX_HOME and pi's own folder count", () => {
  const r = createLocalAgents({ home: "/h", env: { CLAUDE_CONFIG_DIR: "/c", CODEX_HOME: "/x" } });
  expect(r.roots()).toEqual({ "claude-code": "/c/projects", codex: "/x/sessions", pi: "/h/.pi/agent/sessions" });
});
