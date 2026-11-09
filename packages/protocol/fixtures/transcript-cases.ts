// The cases behind fixtures/transcript.json (D152): a real kind of run, written as its Log
// events. `bun packages/protocol/fixtures/transcript-cases.ts` rewrites the JSON from the model
// (review the diff: it is the expected output both ports must match).
import { writeFileSync } from "node:fs";
import type { LogEvent } from "../src/index.ts";
import { blocksOf } from "../src/transcript.ts";

const KEY = "nmem_ct_8fK2pQx7Lm4vRz9TbW3y";
const T0 = Date.parse("2026-11-10T06:58:00Z");

function stream(taskId: string, items: [number, string, LogEvent["origin"], unknown][]): LogEvent[] {
  return items.map(([sec, kind, origin, body], i) => ({ seq: 100 + i, ts: new Date(T0 + sec * 1000).toISOString(), persona: "default", stream: `task:${taskId}`, origin, kind, body: kind === "task_event" ? { taskId, ...(body as object) } : body }) as LogEvent);
}
const sh = (cmd: string, output: string, ok = true, extra: Record<string, unknown> = {}) => ({ role: "tool", tool: { name: "exec_command", input: { cmd: `/bin/bash -lc '${cmd}'`, ...extra }, output, ok } });
const say = (text: string) => ({ role: "assistant", text });

/** Codex connecting Nowledge Mem on a Linux server home, the author's run. */
export const memEvents = (taskId = "mem1", upTo = Infinity) =>
  stream(
    taskId,
    (
      [
        [0, "task_open", "user", { taskId, title: "Connect Nowledge Mem for Codex", project: "", place: { kind: "none", device: "hel" }, harness: "codex", model: "gpt-6-luna", origin: "you", brief: `Set up Nowledge Mem for Codex on this machine so Codex can search and save memories.\n\n1. Install the nmem CLI if it isn't there.\n2. Connect it to my space with this connect token: ${KEY}\n3. Install the Mem plugin into Codex and check that a search works.\n\nThis is a headless Linux box, no browser. Don't touch my other Codex settings.` }],
        [2, "task_event", "runner", { role: "user", from: "runner", text: '<brief>…</brief>\nStart the task "Connect Nowledge Mem for Codex".' }],
        [9, "task_event", "task", { role: "assistant", text: "Starting Nowledge Mem setup on this headless Linux host. First I'll see what's already installed." }],
        [11, "task_event", "task", { role: "tool", tool: { name: "mcp__ducter__checkpoint", input: { text: "x" }, ok: true } }],
        [11, "checkpoint", "task", { taskId, text: "Starting Nowledge Mem setup on this headless Linux host. First I'll see what's already installed." }],
        [14, "task_event", "task", sh("command -v nmem", "", false)],
        [16, "task_event", "task", sh("which python3 pip3 uv", "/usr/bin/python3\n/usr/bin/pip3", false)],
        [18, "task_event", "task", sh("ls -d ~/.venv/bin/python*", "ls: cannot access '/root/.venv/bin/python*': No such file or directory", false)],
        [21, "task_event", "task", sh("test -e ~/.nowledge-mem/config.json", "", false)],
        [25, "task_event", "task", sh("curl -fsS https://cloud.nowledge.co/api/v1/health", '{"ok":true,"region":"eu-1"}')],
        [31, "task_event", "task", say("Nothing is installed yet and the cloud answers. I'll install the CLI with pipx so it stays out of the system Python.")],
        [40, "task_event", "task", sh("pipx install nowledge-mem-cli", "  installed package nowledge-mem-cli 0.9.4, installed using Python 3.12.3\n  These apps are now globally available\n    - nmem\ndone! ✨ 🌟 ✨")],
        [52, "task_event", "task", sh(`nmem connect --token ${KEY}`, "Connected to space “weyl” (eu-1). Wrote /root/.nowledge-mem/credentials.json")],
        [55, "task_event", "task", sh("nmem doctor", "✓ CLI 0.9.4\n✓ credentials\n✓ cloud reachable (84 ms)\n✓ space weyl: 1,204 memories")],
        [61, "checkpoint", "task", { taskId, text: "nmem 0.9.4 is installed and connected to the weyl space; doctor passes. Next: the Codex plugin." }],
        [70, "task_event", "task", sh("codex plugin add nowledge-mem", "error: unknown command 'plugin' for 'codex'\nRun 'codex --help' for usage.", false, { justification: "Install the Mem plugin into Codex" })],
        [74, "task_event", "task", sh("codex --version", "codex-cli 0.167.0")],
        [80, "task_event", "task", sh("sed -n 1,40p ~/.codex/config.toml", 'model = "gpt-6-luna"\n[mcp_servers.github]\ncommand = "gh-mcp"')],
        [96, "task_event", "task", { role: "tool", tool: { name: "apply_patch", input: { input: "*** Begin Patch\n*** Update File: /root/.codex/config.toml\n@@\n+[mcp_servers.nowledge-mem]\n+command = \"nmem\"\n+args = [\"mcp\"]\n*** End Patch" }, output: "Success. Updated 1 file", ok: true } }],
        [104, "task_event", "task", sh('nmem search "Ducter release checklist" --limit 3', "1. Ducter v0.0.1 release checklist (0.91)\n2. iPhone app public: TestFlight steps (0.77)\n3. Notarize the Mac app (0.70)")],
        [118, "task_event", "task", say("Mem is connected and Codex can reach it. This Codex (0.167) has no `plugin` command, so I added Mem as an MCP server in `~/.codex/config.toml` instead; a search from it returned three memories.\n\nOpen a new Codex session to pick it up.")],
        [121, "report", "task", { taskId, state: "done", summary: "Mem is connected for Codex on this machine: nmem 0.9.4 in your weyl space, added to Codex as an MCP server (this Codex has no plugin command). A search returned 3 memories.", questions: [], evidence: [] }],
      ] as [number, string, LogEvent["origin"], unknown][]
    ).filter(([sec]) => sec <= upTo),
  );

export const cases = [
  { name: "mem connect, finished", harness: "codex", working: false, events: memEvents() },
  { name: "mem connect, under way", harness: "codex", working: true, events: memEvents("mem1", 55) },
  {
    name: "claude code, a real failure and the user's go",
    harness: "claude-code",
    working: false,
    events: stream("cc1", [
      [0, "task_open", "partner", { taskId: "cc1", title: "Fix the flaky cart test", project: "tinycart", place: { kind: "none" }, harness: "claude-code", brief: "Make `bun test` pass on tinycart; the cart total test flakes." }],
      [5, "task_event", "task", { role: "assistant", thinking: ["Reading the failing test"] }],
      [6, "task_event", "task", { role: "tool", tool: { name: "Read", input: { file_path: "/Users/someone/dev/tinycart/src/cart.ts" }, ok: true } }],
      [8, "task_event", "task", { role: "tool", tool: { name: "Grep", input: { pattern: "total\\(", path: "src" }, ok: true } }],
      [12, "task_event", "task", { role: "tool", tool: { name: "Bash", input: { command: "bun test", description: "Run the test suite" }, output: "1 fail\n  expect(total()).toBe(30)\n  Received: 29.999999", ok: false } }],
      [20, "task_event", "task", { role: "tool", tool: { name: "Edit", input: { file_path: "src/cart.ts", old_string: "a + b", new_string: "round(a + b)" }, ok: true } }],
      [24, "task_event", "task", { role: "tool", tool: { name: "Bash", input: { command: "bun test", description: "Run the test suite" }, output: "14 pass\n0 fail", ok: true } }],
      [30, "report", "task", { taskId: "cc1", state: "needs_input", summary: "Fixed rounding in total(); tests pass. Commit?", questions: [{ id: "q", text: "Commit the fix?", blocking: true, default: "commit", reversible: true }], evidence: [] }],
      [60, "task_event", "user", { role: "user", from: "user", text: "User says Go: commit." }],
      [64, "task_event", "task", { role: "system", text: "turn failed: stream disconnected" }],
    ]),
  },
];

if (import.meta.main) {
  const out = cases.map((c) => ({ ...c, want: blocksOf(c.harness, c.events, c.working) }));
  writeFileSync(new URL("./transcript.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
  console.log(`wrote ${out.length} cases`);
}
