// The cases behind fixtures/transcript.json (D152): a real kind of run, written as its Log
// events. `bun packages/protocol/fixtures/transcript-cases.ts` rewrites the JSON from the model
// (review the diff: it is the expected output both ports must match).
import { writeFileSync } from "node:fs";
import type { LogEvent, MediaRef } from "../src/index.ts";
import { blocksOf, inTurn, turnsOf } from "../src/transcript.ts";

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

/**
 * D268: a run the way a connected service makes one: a plan, thinking, twenty GitHub calls (one a
 * JSON 404), prose that runs Chinese into Latin, a subagent, a compaction, an edit and a test; the
 * user's next ask, its turn still under way. `zh` words it in Chinese.
 */
export const conductEvents = (o: { zh?: boolean; id?: string } = {}) => {
  const L = (zh: string, en: string) => (o.zh ? zh : en);
  const id = o.id ?? "cd1";
  const gh = (tool: string, input: Record<string, unknown>, output = "Action completed.", ok = true) => ({ role: "tool", tool: { name: `mcp__github__${tool}`, input, output, ok } });
  const plan = (states: string[]) => ({
    role: "tool",
    tool: {
      name: "TodoWrite",
      input: {
        todos: [L("列出最近两周跟 compaction 有关的 issue", "List the last two weeks' compaction issues"), L("读每个 issue 的复现步骤", "Read each issue's repro steps"), L("修能顺手修的", "Fix what can be fixed on the way"), L("整理还没修的", "Sum up what's still open")].map((content, i) => ({ content, status: states[i], activeForm: content })),
      },
      output: "Todos have been modified successfully.",
      ok: true,
    },
  });
  const items: [number, string, LogEvent["origin"], unknown][] = [
    [0, "task_open", "partner", { taskId: id, title: L("整理 hawdb 最近两周 compaction 相关的 issue，能顺手修的就修掉", "Sort out hawdb's compaction issues from the last two weeks, fixing the small ones on the way"), project: "HawDB", place: { kind: "repo", device: "MacBook", repoPath: "~/dev/hawdb", branch: "ducter/compaction-issues", baseBranch: "main" }, harness: "claude-code", model: "opus", brief: L("看一下 hawdb 仓库最近两周跟 compaction 有关的 issue 和 PR，整理出还没修的；能顺手修的小问题就修掉，测试要过。", "Look through hawdb's issues and PRs about compaction from the last two weeks and list what's still open; fix the small ones on the way, tests green.") }],
    [2, "task_event", "runner", { role: "user", from: "runner", text: "<brief>…</brief>\nStart the task." }],
    [6, "task_event", "task", { role: "assistant", thinking: [L("先找 compaction 相关的 issue 在哪", "Where the compaction issues are")] }],
    [7, "task_event", "task", plan(["in_progress", "pending", "pending", "pending"])],
    [9, "task_event", "task", { role: "assistant", text: L("先从GitHub上把最近两周的issue和PR拉下来。", "Pulling the last two weeks' issues and PRs from GitHub first.") }],
    [11, "task_event", "task", gh("search_issues", { q: "repo:weyl/hawdb compaction created:>2026-11-02" }, '{"total_count":7}')],
    [13, "task_event", "task", gh("search_pull_requests", { q: "repo:weyl/hawdb compaction" }, '{"total_count":3}')],
    ...[1281, 1283, 1284, 1287, 1288, 1290, 1291].map((n, i): [number, string, LogEvent["origin"], unknown] => [15 + i * 3, "task_event", "task", gh("get_issue", { owner: "weyl", repo: "hawdb", issue_number: n })]),
    ...["crates/storage/src/compaction.rs", "crates/storage/src/options.rs", "crates/storage/src/flush.rs", "crates/storage/src/version.rs", "docs/tuning.md"].map((p, i): [number, string, LogEvent["origin"], unknown] => [40 + i * 3, "task_event", "task", gh("get_file_contents", { owner: "weyl", repo: "hawdb", path: p })]),
    [56, "task_event", "task", gh("get_file_contents", { owner: "weyl", repo: "hawdb", path: "crates/storage/src/l0_stall.rs" }, 'GitHub API error 404: {"message":"Not Found","documentation_url":"https://docs.github.com/rest/repos/contents#get-repository-content","status":"404"}', false)],
    ...["crates/storage/src/stall.rs", "crates/storage/src/scheduler.rs", "crates/storage/tests/compaction.rs"].map((p, i): [number, string, LogEvent["origin"], unknown] => [58 + i * 3, "task_event", "task", gh("get_file_contents", { owner: "weyl", repo: "hawdb", path: p })]),
    [68, "task_event", "task", plan(["completed", "in_progress", "pending", "pending"])],
    [72, "task_event", "task", { role: "assistant", text: L("最近两周有7个issue提到compaction，其中3个已经有PR在修。剩下4个里 **#1287 最急**：在v0.9.2上，约04:10UTC开始requests涨了4倍，之后compaction就卡住了，L0文件数涨到180多个。\n\n原因是 `max_background_jobs` 默认只有2，flush和compaction抢同一个线程池；`l0_stall.rs` 在仓库里已经不存在了，issue里引用的是旧路径。", "Seven issues in the last two weeks mention compaction; three already have PRs. Of the other four, **#1287 is the urgent one**: on v0.9.2, from about 04:10 UTC requests grew 4×, then compaction stalled and L0 grew past 180 files.\n\nThe cause: `max_background_jobs` defaults to 2, so flush and compaction share one pool; `l0_stall.rs` no longer exists, the issue cites an old path.") }],
    [80, "task_event", "task", { role: "assistant", thinking: [L("要不要先复现再改默认值", "Reproduce before changing the default?")] }],
    [126, "task_event", "task", { role: "tool", tool: { name: "Task", input: { description: L("找能复现 #1287 的最小步骤", "Find the smallest repro for #1287"), prompt: "…" }, output: L("用 4 倍写入压 90 秒就能复现：L0 到 64 个文件后 compaction 不再推进。", "4× writes for 90 s reproduce it: past 64 L0 files compaction stops advancing."), ok: true } }],
    [128, "task_event", "task", { role: "system", text: "compaction ok", raw: { kind: "compaction_ended", outcome: "ok", trigger: "auto" } }],
    [134, "task_event", "task", { role: "tool", tool: { name: "Read", input: { file_path: "/Users/weyl/dev/hawdb/crates/storage/src/options.rs" }, ok: true } }],
    [140, "task_event", "task", { role: "tool", tool: { name: "Edit", input: { file_path: "/Users/weyl/dev/hawdb/crates/storage/src/options.rs", old_string: "    max_background_jobs: 2,", new_string: "    // Flush and compaction each get their own: one pool starved compaction under load (#1287).\n    max_background_jobs: 4,\n    max_background_flushes: 1," }, output: "The file has been updated.", ok: true } }],
    [176, "task_event", "task", { role: "tool", tool: { name: "Bash", input: { command: "cargo test -p hawdb-storage compaction", description: L("跑 compaction 的测试", "Run the compaction tests") }, output: "test result: ok. 38 passed; 0 failed", ok: true } }],
    [180, "task_event", "task", plan(["completed", "completed", "completed", "in_progress"])],
    [192, "task_event", "task", { role: "assistant", text: L("#1287 修好了：flush 和 compaction 各用各的线程，`max_background_jobs` 改成4。compaction 的38个测试全过。\n\n还没修的3个：#1283（Windows上的路径）、#1288（要先定接口）、#1291（复现不了，等作者回）。", "#1287 is fixed: flush and compaction each get their own threads, `max_background_jobs` is now 4. All 38 compaction tests pass.\n\nStill open: #1283 (Windows paths), #1288 (needs an API decision), #1291 (can't reproduce, waiting on the reporter).") }],
    [400, "task_event", "user", { role: "user", from: "user", text: L("#1290 也看一下，能修就修", "Take a look at #1290 too; fix it if you can") }],
    [404, "task_event", "task", gh("get_issue", { owner: "weyl", repo: "hawdb", issue_number: 1290 })],
    [408, "task_event", "task", { role: "tool", tool: { name: "Read", input: { file_path: "/Users/weyl/dev/hawdb/crates/storage/src/scheduler.rs" }, ok: true } }],
    [414, "task_event", "task", { role: "tool", tool: { name: "Bash", input: { command: "cargo test -p hawdb-storage scheduler" }, output: "running 12 tests", ok: true } }],
  ];
  return stream(id, items);
};

/**
 * D271: the author's review loop on Codex: every 45 minutes Ducter wakes it ("等到了：「…」。接着做。"),
 * it looks for review requests and mentions, reviews what came in, arms its next wait and ends its
 * turn. `rounds` wakes after the first turn; round 3 reviews a PR in full (`reads` files), the
 * others look and find little. `oldWake` words the second wake the way core did before D271, its
 * observation a bare epoch. The last turn has ended: the task rests on its wait.
 */
export const loopEvents = (o: { zh?: boolean; id?: string; rounds?: number; reads?: number; oldWake?: boolean } = {}) => {
  const L = (zh: string, en: string) => (o.zh ? zh : en);
  const id = o.id ?? "lp1";
  const rounds = o.rounds ?? 3;
  const reads = o.reads ?? 6;
  type Item = [number, string, LogEvent["origin"], unknown];
  const reason = L("约45分钟后继续检查 nowledge-co 的 review 请求与提及", "Check nowledge-co's review requests and mentions again in about 45 minutes");
  const ex = (cmd: string, output: string, ok = true) => ({ role: "tool", tool: { name: "exec_command", input: { cmd: ["bash", "-lc", cmd] }, output, ok } });
  const items: Item[] = [
    [0, "task_open", "partner", { taskId: id, title: L("盯着 nowledge-co 的 review 请求，来了就看", "Watch nowledge-co's review requests and review what comes in"), project: "", place: { kind: "folder", device: "MacBook", path: "~/dev/nowledge" }, harness: "codex", model: "gpt-6-luna", brief: L("今天帮我盯着 nowledge-co 组织里请我 review 的 PR 和提到我的地方。来了就先看一遍，能直接给意见的写好意见草稿给我；每 45 分钟看一次。", "Today, watch nowledge-co for PRs that ask for my review and anywhere I'm mentioned. When something comes in, read it first and draft review comments I can send; look every 45 minutes.") }],
    [2, "task_event", "runner", { role: "user", from: "runner", text: "<brief>…</brief>\nStart the task." }],
  ];
  const round = (at: number, n: number) => {
    let s = at;
    const add = (dt: number, kind: string, origin: LogEvent["origin"], body: unknown) => items.push([(s += dt), kind, origin, body]);
    if (n > 0) {
      const old = o.oldWake && n === 2;
      add(0, "task_event", "partner", { role: "user", from: "partner", text: L(`等到了：「${reason}」${old ? "（1794807944）" : ""}。接着做。`, `The wait is over: "${reason}"${old ? " (1794807944)" : ""}. Carry on.`) });
    }
    add(6, "task_event", "task", { role: "assistant", thinking: [L("先看有没有新的 review 请求", "Any new review requests")] });
    // Every fourth round from the third, a PR came in: #1612, then #1621, #1630, ….
    const review = n % 4 === 3;
    const pr = 1612 + ((n - 3) / 4) * 9;
    add(3, "task_event", "task", ex("gh search prs --review-requested=@me --owner nowledge-co --state open --json number,title,url", review ? `[{"number":${pr},"title":"mem: batch the embedding writes","url":"https://github.com/nowledge-co/mem/pull/${pr}"}]` : "[]"));
    add(2, "task_event", "task", ex("curl -fsSL https://api.github.com/notifications?participating=true", n === 1 ? '[{"reason":"mention","subject":{"title":"bridge: handshake timeout on Vault"}}]' : "[]"));
    if (review) {
      add(4, "task_event", "task", { role: "assistant", text: L(`有一个新的 review 请求：**#${pr} mem: batch the embedding writes**。我先把改动读一遍。`, `One new review request: **#${pr} mem: batch the embedding writes**. Reading the change first.`) });
      add(3, "task_event", "task", ex(`gh pr view ${pr} --repo nowledge-co/mem --json files,additions,deletions`, '{"additions":214,"deletions":61,"files":[{"path":"crates/embed/src/batch.rs"}]}'));
      add(3, "task_event", "task", ex(`gh pr diff ${pr} --repo nowledge-co/mem`, "diff --git a/crates/embed/src/batch.rs b/crates/embed/src/batch.rs\n+pub struct Batcher { max: usize, wait: Duration }"));
      const files = ["crates/embed/src/batch.rs", "crates/embed/src/lib.rs", "crates/embed/src/queue.rs", "crates/store/src/vectors.rs", "crates/store/src/wal.rs", "crates/embed/tests/batch.rs", "crates/embed/Cargo.toml", "docs/embedding.md"];
      for (let i = 0; i < reads; i++) add(2, "task_event", "task", ex(`sed -n ${1 + (i % 7) * 80},${80 + (i % 7) * 80}p ${files[i % files.length]}`, "    let mut pending = Vec::with_capacity(self.max);"));
      add(5, "task_event", "task", ex("rg -n \"flush_every|max_batch\" crates", "crates/embed/src/batch.rs:41:    flush_every: Duration::from_millis(250),"));
      add(40, "task_event", "task", ex("cargo test -p mem-embed batch", "test result: ok. 17 passed; 0 failed"));
      add(9, "task_event", "task", { role: "assistant", text: L(`#${pr} 看完了，整体可以合，有两处意见：\n\n1. \`Batcher::push\` 在满了之后直接 \`flush\`，但 \`wait\` 的计时没有重置，下一批会提前写出去。\n2. \`queue.rs\` 里 \`max_batch\` 默认 512，跟 \`docs/embedding.md\` 写的 256 不一致。\n\n意见草稿放在 \`~/dev/nowledge/review-${pr}.md\`，你看过再发。`, `#${pr} is read; it can merge, with two comments:\n\n1. \`Batcher::push\` flushes when full but doesn't reset the \`wait\` timer, so the next batch goes out early.\n2. \`max_batch\` defaults to 512 in \`queue.rs\`, while \`docs/embedding.md\` says 256.\n\nThe draft is in \`~/dev/nowledge/review-${pr}.md\`; send it once you've read it.`) });
      add(2, "checkpoint", "task", { taskId: id, text: L(`#${pr} 的意见草稿写好了：review-${pr}.md`, `Drafted the #${pr} review: review-${pr}.md`) });
    } else if (n === 1) {
      add(4, "task_event", "task", ex("gh issue view 88 --repo nowledge-co/bridge --comments", "bridge: handshake timeout on Vault\n@weyl can you look at the 10s timeout?"));
      add(6, "task_event", "task", { role: "assistant", text: L("bridge#88 里有人 @ 你，问 Vault 上握手 10 秒超时的事。这不是 review，我记下了，等你回来看。", "Someone mentioned you in bridge#88 about the 10 s handshake timeout on Vault. Not a review; noted for when you're back.") });
    } else {
      add(4, "task_event", "task", { role: "assistant", text: L("这一轮没有新的 review 请求，也没有新的提及。", "Nothing new this round: no review requests, no mentions.") });
    }
    add(2, "task_event", "task", { role: "tool", tool: { name: "mcp__ducter__wait_for", input: { reason, everyMs: 2_700_000 }, output: "armed", ok: true } });
    add(2, "task_event", "task", { role: "assistant", text: L("45 分钟后再看。", "Looking again in 45 minutes.") });
    add(1, "task_event", "task", { role: "system", text: "turn completed", raw: { turnEnd: true, kind: "turn_ended", outcome: "completed" } });
  };
  for (let n = 0; n <= rounds; n++) round(10 + n * 2700, n);
  return stream(id, items);
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
      [14, "task_event", "runner", { role: "system", from: "runner", text: "now on gpt-5.5 · high", raw: { retuned: { harness: "codex", model: "gpt-5.5", effort: "high" } } }],
      [14, "task_event", "runner", { role: "system", from: "runner", text: "moved from hel to MacBook", raw: { switched: { from: "codex", to: "codex" }, moved: { from: "hel", to: "MacBook" } } }],
      [15, "task_event", "task", { role: "system", text: "harness exited (code 0)", raw: { kind: "exited" } }],
      [16, "task_event", "runner", { role: "system", from: "runner", text: "delivery failed: socket closed" }],
      [20, "task_event", "task", { role: "system", text: "no report after one nudge; leaving the task idle (stall rule)", raw: { stall: true } }],
    ]),
  },
  // D210: turns, looks folded, edits with their diffs, a failure's line, pictures on the prompts.
  { name: "a long claude code run, finished (zh)", harness: "claude-code", working: false, events: glanceEvents({ zh: true, pics: { brief: pic("a1", 688, 918), you: pic("b2", 688, 918), report: pic("b2", 688, 918) } }) },
  { name: "a long claude code run, under way", harness: "claude-code", working: true, events: glanceEvents({ upTo: 342 }) },
  // D268: a summary line per run, a service said by its name, a 404 in words, a subagent, a plan, a turn under way.
  { name: "a run through a connected service, under way (zh)", harness: "claude-code", working: true, events: conductEvents({ zh: true }) },
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
  {
    // D266: the harness's own background work: started, ended, one that failed; a bare one.
    name: "background work in claude code",
    harness: "claude-code",
    working: true,
    events: stream("bg1", [
      [0, "task_open", "user", { taskId: "bg1", title: "Soak the WAL bench", project: "", place: { kind: "none" }, harness: "claude-code", origin: "you", brief: "Run the WAL bench for an hour and tell me the p99." }],
      [1, "task_event", "task", { role: "tool", tool: { name: "Bash", input: { command: "bun run bench:wal --minutes 60 > bench.log", description: "Run the WAL bench for an hour", run_in_background: true }, output: "Command running in background with ID: b1", ok: true } }],
      [2, "task_event", "task", { role: "system", text: "running in the background: Run the WAL bench for an hour", raw: { background: { act: "started", type: "shell", what: "Run the WAL bench for an hour" } } }],
      [3, "task_event", "task", { role: "system", text: "running in the background", raw: { background: { act: "started", type: "agent" } } }],
      [4, "task_event", "task", { role: "system", text: "turn completed", raw: { turnEnd: true, kind: "turn_ended", outcome: "completed" } }],
      [3600, "task_event", "task", { role: "system", text: "failed in the background", raw: { background: { act: "failed", type: "agent" } } }],
      [3601, "task_event", "task", { role: "system", text: "finished in the background: Run the WAL bench for an hour", raw: { background: { act: "ended", type: "shell", what: "Run the WAL bench for an hour" } } }],
      [3602, "task_event", "task", { role: "tool", tool: { name: "Read", input: { file_path: "/w/bench.log" }, output: "p99 4.1ms", ok: true } }],
    ]),
  },
  // D271: a review loop woken by its own wait, resting on the next one (its turn has ended).
  { name: "a review loop on its own wait (zh)", harness: "codex", working: true, events: loopEvents({ zh: true, rounds: 3, oldWake: true }) },
  { name: "a review loop, its turn under way", harness: "codex", working: true, events: loopEvents({ rounds: 1 }).slice(0, -3) },
  {
    // D271: what Ducter itself tells a task (a phone lent, a Stop) is never the person's bubble:
    // the line of an older run (logged as from the user) and one from "ducter" alike.
    name: "the person's phone lent and stopped",
    harness: "claude-code",
    working: true,
    events: stream("ph1", [
      [0, "task_open", "user", { taskId: "ph1", title: "看一下 Chrome 前台驻留", project: "", place: { kind: "none" }, harness: "claude-code", origin: "you", brief: "在我手机上开 Chrome，看它在前台待多久会被系统收走。" }],
      [5, "task_event", "user", { role: "user", from: "user", text: 'You may use Pixel Fold now: the user\'s own phone, with their own apps, accounts and messages on it. It shows "Ducter 正在用这台手机" with a Stop button while you work; locking the phone gives it back. Take only the steps this task needs; anything that sends, pays or deletes still waits for their Go. Start with phone_look.' }],
      [8, "task_event", "task", { role: "tool", tool: { name: "mcp__ducter__phone_look", input: {}, output: "home screen", ok: true } }],
      [12, "task_event", "task", { role: "assistant", text: "Chrome 已在前台，开始计时。" }],
      [300, "task_event", "user", { role: "user", from: "ducter", text: "The user said no to lending you their phone for this. Carry on without it, or report in one line what you'd need it for." }],
      [302, "task_event", "user", { role: "user", from: "ducter", text: "Something new Ducter says." }],
      [303, "task_event", "user", { role: "user", from: "user", text: "好的，先停一下" }],
    ]),
  },
];

if (import.meta.main) {
  // D271: `inTurn`, whether a turn is under way, both ports alike.
  const out = cases.map((c) => ({ ...c, inTurn: inTurn(c.events), want: turnsOf(blocksOf(c.harness, c.events, c.working)) }));
  writeFileSync(new URL("./transcript.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
  console.log(`wrote ${out.length} cases`);
}
