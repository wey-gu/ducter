// The cases behind fixtures/transcript.json (D152): a real kind of run, written as its Log
// events. `bun packages/protocol/fixtures/transcript-cases.ts` rewrites the JSON from the model
// (review the diff: it is the expected output both ports must match).
import { writeFileSync } from "node:fs";
import type { LogEvent, MediaRef } from "../src/index.ts";
import { blocksOf, turnsOf } from "../src/transcript.ts";

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

/** A picture's ref as a fixture names it (the demos put real bytes behind it). */
export const pic = (id: string, w: number, h: number): MediaRef => ({ id: id.padEnd(64, "0"), type: "image/png", bytes: 48_000, w, h, k: "k" });

/**
 * D210: a long coding task from the author's own work, the way Claude Code runs one: reading and
 * searching, a test that fails with its output, edits with their diffs, a real error, a question
 * that ends its turn, the user's answer with a picture, more work, and a report with a picture.
 * `zh` words the user's and the agent's lines in Chinese (the agent speaks the brief's language);
 * `upTo` cuts the run (a task under way); `extra` adds that many reads and searches to the first
 * stretch (a long history, for the demos' timing).
 */
export const glanceEvents = (o: { zh?: boolean; upTo?: number; extra?: number; pics?: { brief?: MediaRef; you?: MediaRef; report?: MediaRef } } = {}) => {
  const L = (zh: string, en: string) => (o.zh ? zh : en);
  const id = "gl1";
  const bash = (command: string, description: string, output: string, ok = true) => ({ role: "tool", tool: { name: "Bash", input: { command, description }, output, ok } });
  const read = (file: string) => ({ role: "tool", tool: { name: "Read", input: { file_path: `/Users/weyl/dev/ducter/${file}` }, ok: true } });
  const grep = (pattern: string, path: string) => ({ role: "tool", tool: { name: "Grep", input: { pattern, path }, ok: true } });
  const edit = (file: string, old_string: string, new_string: string) => ({ role: "tool", tool: { name: "Edit", input: { file_path: `/Users/weyl/dev/ducter/${file}`, old_string, new_string }, output: "The file has been updated.", ok: true } });
  const extra: [number, string, LogEvent["origin"], unknown][] = [];
  const files = ["apps/web/src/store.ts", "apps/web/src/views.tsx", "apps/web/src/board.tsx", "apps/web/src/conn.ts", "apps/web/src/main.tsx", "packages/core/src/ws.ts", "packages/protocol/src/index.ts", "apps/web/src/native.ts"];
  for (let i = 0; i < (o.extra ?? 0); i++) {
    // Every so often it says something, as a long run does: the history is many turns of steps.
    if (i % 12 === 11) extra.push([22, "task_event", "task", { role: "assistant", text: L(`看完了第 ${(i + 1) / 12} 批文件。`, `Read batch ${(i + 1) / 12} of the files.`) }]);
    else extra.push([22, "task_event", "task", i % 3 === 2 ? grep(["onHand", "hello", "replay", "cursor"][i % 4]!, "apps/web/src") : read(files[i % files.length]!)]);
  }
  const items: [number, string, LogEvent["origin"], unknown][] = [
    [0, "task_open", "partner", { taskId: id, title: L("修好手机打开时 On hand 闪一下空白", "Stop On hand flashing empty when the phone app opens"), project: "ducter", place: { kind: "repo", repoPath: "/Users/weyl/dev/ducter", branch: "fix/glance-onhand" }, harness: "claude-code", model: "claude-opus-5-5", brief: L("iPad 上打开 app，On hand 先闪一下「什么都没有」，一两秒后才出来。D209 的 glance 缓存应该让它第一帧就是上次的样子。找到原因修好，测试要过。截图是用户发来的。", 'On the iPad, the app opens with On hand saying "Nothing on hand" for a second or two before the tasks come in. D209\'s glance cache should make the first frame what was there last time. Find why, fix it, keep the tests green. The screenshot is the user\'s.'), ...(o.pics?.brief ? { media: [o.pics.brief] } : {}) }],
    [2, "task_event", "runner", { role: "user", from: "runner", text: "<brief>…</brief>\nStart the task." }],
    [6, "task_event", "task", { role: "assistant", thinking: ["Where the glance cache restores On hand"] }],
    [8, "task_event", "task", read("apps/web/src/glance.ts")],
    [10, "task_event", "task", read("apps/web/src/app.ts")],
    [12, "task_event", "task", grep("onHand", "apps/web/src")],
    [13, "task_event", "task", { role: "tool", tool: { name: "Glob", input: { pattern: "apps/web/test/*.test.ts" }, ok: true } }],
    ...extra,
    [20, "task_event", "task", { role: "assistant", text: L("缓存里确实存了 On hand，但 `connect()` 在 hello 回来之前就把它清空了，所以第一帧是空的。先跑测试确认一下。", "The cache does keep On hand, but `connect()` clears it before hello comes back, so the first frame is empty. Running the tests to confirm.") }],
    [26, "task_event", "task", bash("bun test apps/web/test/glance.test.ts", "Run the glance cache tests", 'bun test v1.3.2\n\napps/web/test/glance.test.ts:\n✓ glance > keeps the channel\'s newest 400 events [3.12ms]\n✓ glance > forgets a revoked device [0.88ms]\n✗ glance > paints On hand before the socket opens [2.41ms]\n\n  expect(received).toEqual(expected)\n  - Expected  + Received\n  -   "tasks": 3,\n  +   "tasks": 0,\n\n 2 pass\n 1 fail\nRan 3 tests across 1 file. [118.00ms]', false)],
    [40, "task_event", "task", edit("apps/web/src/app.ts", "  connect() {\n    this.S.onHand = undefined;\n    this.S.board = emptyBoard();\n    this.open();", "  connect() {\n    // D209: the glance's On hand stays until the home answers.\n    if (!this.glanced) this.S.onHand = undefined;\n    this.open();")],
    [46, "task_event", "task", bash("bun test apps/web/test/glance.test.ts", "Run the glance cache tests", "bun test v1.3.2\n\n 3 pass\n 0 fail\nRan 3 tests across 1 file. [96.00ms]")],
    [58, "task_event", "task", bash("bun run typecheck", "Typecheck the workspace", "$ tsc -p . --noEmit\napps/web/src/app.ts(412,14): error TS2339: Property 'glanced' does not exist on type 'App'.\nerror: script \"typecheck\" exited with code 2", false)],
    [64, "task_event", "task", edit("apps/web/src/app.ts", '  draft = "";', '  draft = "";\n  /** The first frame came from the glance cache (D209). */\n  glanced = false;')],
    [70, "task_event", "task", edit("apps/web/src/glance.ts", "export function paintGlance(app: App, g: Glance) {\n  app.S.replay(g.events);", "export function paintGlance(app: App, g: Glance) {\n  app.glanced = true;\n  app.S.replay(g.events);")],
    [84, "task_event", "task", bash("bun run typecheck", "Typecheck the workspace", "$ tsc -p . --noEmit")],
    [90, "task_event", "task", { role: "assistant", text: L("测试和类型检查都过了。有一件事要你定：缓存里的 On hand 要不要也留着**等你定的事**？留着的话一打开就能看到，但其中有的可能已经在别的设备上回答过了。", "Tests and the typecheck pass. One thing for you to decide: should the cached On hand keep **the things waiting on you** too? Kept, they show the moment the app opens, but some may have been answered on another device by then.") }],
    [300, "task_event", "user", { role: "user", from: "user", text: L("留着，但回答过的要在 hello 回来后马上消失。这是我 iPad 上现在的样子：", "Keep them, but any that were answered should go as soon as hello is back. This is my iPad now:"), ...(o.pics?.you ? { media: [o.pics.you] } : {}) }],
    [304, "task_event", "task", read("apps/web/src/glance.ts")],
    [306, "task_event", "task", grep("decisions", "apps/web/src/glance.ts")],
    [318, "task_event", "task", edit("apps/web/src/glance.ts", "  const keep = { events: s.events.slice(-400), onHand: s.onHand };", "  // Kept with On hand: the asks still open when the page hid; hello's replay drops the answered.\n  const keep = { events: s.events.slice(-400), onHand: s.onHand, asks: s.openDecisions().map((d) => d.id) };")],
    [330, "task_event", "task", { role: "tool", tool: { name: "Write", input: { file_path: "/Users/weyl/dev/ducter/apps/web/test/glance-asks.test.ts", content: 'import { expect, test } from "bun:test";\nimport { glanceOf, paintGlance } from "../src/glance.ts";\nimport { fakeApp } from "./guard.ts";\n\ntest("an ask answered elsewhere goes once hello is back", () => {\n  const app = fakeApp({ asks: ["d1", "d2"] });\n  paintGlance(app, glanceOf(app.S));\n  app.hello({ answered: ["d1"] });\n  expect(app.S.openDecisions().map((d) => d.id)).toEqual(["d2"]);\n});\n' }, output: "File created successfully", ok: true } }],
    [342, "task_event", "task", bash("bun test apps/web/test", "Run the web client's tests", "bun test v1.3.2\n\n 212 pass\n 0 fail\n 611 expect() calls\nRan 212 tests across 21 files. [3.41s]")],
    [350, "task_event", "task", bash("sh scripts/build-web.sh", "Build the web client", "built apps/web/static/app.js (418 KB)")],
    [356, "task_event", "task", bash("git commit -am 'D209: On hand stays from the glance until hello'", "Commit the fix", "[fix/glance-onhand 4c1e9a2] D209: On hand stays from the glance until hello\n 4 files changed, 31 insertions(+), 4 deletions(-)")],
    [362, "task_event", "task", { role: "assistant", text: L("改好了。打开时 On hand 直接是上次的样子，等你定的事也在；hello 回来后，别处回答过的会马上消失。\n\n- `connect()` 不再清空缓存里的 On hand\n- 缓存多存了还开着的事\n- 新加了一个测试，web 的 212 个测试全过", "Fixed. On hand now opens as it was, the things waiting on you included; once hello is back, any answered elsewhere go at once.\n\n- `connect()` no longer clears the cached On hand\n- the cache also keeps the asks still open\n- a new test; all 212 web tests pass") }],
    [364, "report", "task", { taskId: id, state: "done", summary: L("On hand 不再闪空白：打开时就是上次的样子，回答过的事在连上后马上消失。测试全过，已提交到 fix/glance-onhand。", "On hand no longer flashes empty: it opens as it was, and asks answered elsewhere go once it connects. Tests pass; committed on fix/glance-onhand."), questions: [], evidence: [], ...(o.pics?.report ? { media: [o.pics.report] } : {}) }],
  ];
  return stream(id, items.filter(([sec]) => sec <= (o.upTo ?? Infinity)));
};

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
  {
    // D207: the hel run. Commands that read a page are not a browser; the runner's own lines are
    // said in the user's words or not at all.
    name: "codex on a server: shell steps, the runner's notes",
    harness: "codex",
    working: false,
    events: stream("hel1", [
      [0, "task_open", "partner", { taskId: "hel1", title: "排查电话只播放开场白的问题", project: "", place: { kind: "none", device: "hel" }, harness: "codex", brief: "看看为什么电话只播开场白" }],
      [1, "task_event", "runner", { role: "system", from: "runner", text: "recalled 2 from memory for the brief", raw: { memory: "recall", ids: ["m1", "m2"], titles: ["a", "b"] } }],
      [2, "task_event", "runner", { role: "system", from: "runner", text: "session started", raw: { sessionId: "s1" } }],
      [5, "task_event", "task", sh("pwd", "/root", false)],
      [6, "task_event", "task", sh("curl -fsS http://127.0.0.1:7777/health", '{"ok":true}')],
      [7, "task_event", "task", sh("journalctl -u ducter -n 50", "…")],
      [9, "task_event", "runner", { role: "system", from: "runner", text: "hel disconnected; the task carries on when it is back", raw: { device: "d-hel", offline: true } }],
      [12, "task_event", "runner", { role: "system", from: "runner", text: "hel is back; resuming the session", raw: { device: "d-hel", name: "hel", offline: false } }],
      [14, "task_event", "runner", { role: "system", from: "runner", text: "moved from claude-code to codex", raw: { switched: { from: "claude-code", to: "codex" } } }],
      [15, "task_event", "task", { role: "system", text: "harness exited (code 0)", raw: { kind: "exited" } }],
      [16, "task_event", "runner", { role: "system", from: "runner", text: "delivery failed: socket closed" }],
      [20, "task_event", "task", { role: "system", text: "no report after one nudge; leaving the task idle (stall rule)", raw: { stall: true } }],
    ]),
  },
  // D210: turns, looks folded, edits with their diffs, a failure's line, pictures on the prompts.
  { name: "a long claude code run, finished (zh)", harness: "claude-code", working: false, events: glanceEvents({ zh: true, pics: { brief: pic("a1", 688, 918), you: pic("b2", 688, 918), report: pic("b2", 688, 918) } }) },
  { name: "a long claude code run, under way", harness: "claude-code", working: true, events: glanceEvents({ upTo: 342 }) },
  {
    // D210: every shape an edit's input comes in.
    name: "edits of every shape",
    harness: "codex",
    working: false,
    events: stream("ed1", [
      [0, "task_open", "user", { taskId: "ed1", title: "Tidy the config", project: "", place: { kind: "none" }, harness: "codex", origin: "you", brief: "Tidy the config files." }],
      [1, "task_event", "task", { role: "tool", tool: { name: "apply_patch", input: { input: "*** Begin Patch\n*** Update File: a/config.toml\n@@ [server]\n-port = 80\n+port = 8080\n*** Add File: b/notes.md\n+# Notes\n+Port moved.\n*** End Patch" }, output: "Success. Updated 2 files", ok: true } }],
      [2, "task_event", "task", { role: "tool", tool: { name: "MultiEdit", input: { file_path: "/w/src/a.ts", edits: [{ old_string: "let a = 1;", new_string: "const a = 1;" }, { old_string: "let b = 2;\nlet c = 3;", new_string: "const b = 2;\nlet c = 3;" }] }, ok: true } }],
      [3, "task_event", "task", { role: "tool", tool: { name: "Write", input: { file_path: "/w/.env.example", content: "PORT=8080\nTOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789\n" }, ok: true } }],
      [4, "task_event", "task", { role: "tool", tool: { name: "fileChange", input: { changes: [{ path: "/w/README.md", kind: "update", diff: "--- a/README.md\n+++ b/README.md\n@@ -1,2 +1,2 @@\n # App\n-Runs on 80.\n+Runs on 8080.\n" }] }, ok: true } }],
      [5, "task_event", "task", { role: "tool", tool: { name: "Edit", input: { file_path: "/w/x.ts", old_string: "a", new_string: "b" }, output: "String to replace not found in file.", ok: false } }],
      [6, "task_event", "task", { role: "assistant", text: "Done." }],
    ]),
  },
];

if (import.meta.main) {
  const out = cases.map((c) => ({ ...c, want: turnsOf(blocksOf(c.harness, c.events, c.working)) }));
  writeFileSync(new URL("./transcript.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
  console.log(`wrote ${out.length} cases`);
}
