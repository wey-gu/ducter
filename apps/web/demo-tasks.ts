// A demo core for the On hand card and the opened task's transcript (D127): Codex preparing App
// Store Connect (Chrome driven by its computer tool, a step that went wrong, saved progress, an
// ask), and a code fix on Claude Code (ran, read, edited, the tests). The same tasks as the
// desktop's apps/desktop/internal/views/task_transcript_test.go.
//   DUCTER_PORT=7991 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh DEMO_PHASE=ask|go bun apps/web/demo-tasks.ts
// DEMO_PHASE=go answers the ask with Go and lets the task carry on.
import { startCore, stubRunner } from "@ducter/core";
import type { Bodies } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const core = startCore({ persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
const log = core.log;
// The runner logs what it sends a task, as the real one does (a Go arrives as "User says Go: …").
core.setRunner({
  ...stubRunner(core),
  async send(taskId: string, text: string) {
    log.append({ stream: `task:${taskId}`, origin: "task", kind: "task_event", body: { taskId, role: "user", from: "user", text, raw: { delivered: "turn" } } });
    return { delivered: "turn" as const };
  },
});
core.setPartner({ onTrigger() {} });
const tick = () => Bun.sleep(30);
const ev = (id: string, b: Omit<Bodies["task_event"], "taskId">) => log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, ...b } });
const tool = (id: string, name: string, input: unknown, output = "ok", ok = true) => ev(id, { role: "tool", tool: { name, input, output, ok } });
const say = (id: string, text: string) => ev(id, { role: "assistant", text });
const think = (id: string, ...thinking: string[]) => ev(id, { role: "assistant", thinking });
const saved = (id: string, text: string) => log.append({ stream: `task:${id}`, origin: "task", kind: "checkpoint", body: { taskId: id, text } });

// 1. A code fix on Claude Code, done.
{
  const id = "t_flaky";
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title: w("修 compaction 偶发失败的测试", "Fix the flaky compaction test"), project: "HawDB",
    place: { kind: "repo", device: "local", repoPath: "/Users/someone/dev/hawdb", branch: "ducter/compaction-fix", baseBranch: "main" }, harness: "claude-code", model: "opus",
    brief: w("HawDB 里 compaction 那个偶发失败的测试，找到原因修好，跑 50 遍确认。", "Find why the compaction test in HawDB fails now and then, fix it, and run it 50 times to confirm.") } });
  core.tasks.setState(id, "working", "hot");
  await tick();
  say(id, w("先跑 50 遍看失败率。", "Running it 50 times first to see how often it fails."));
  tool(id, "Bash", { command: "cd ~/dev/hawdb && cargo test -p hawdb-storage compaction -- --test-threads=1" }, "test result: FAILED. 47 passed; 3 failed");
  tool(id, "Read", { file_path: "/Users/someone/dev/hawdb/crates/storage/tests/compaction.rs" }, "");
  tool(id, "Grep", { pattern: "sleep\\(Duration::from_millis", path: "crates" }, "crates/storage/tests/compaction.rs:88");
  tool(id, "Read", { file_path: "/Users/someone/dev/hawdb/crates/storage/src/flush.rs" }, "");
  say(id, w("失败的 3 次都是 flush 还没写完测试就去读了：测试里写死了等 200ms。改成等 flush 完成的信号。", "All 3 failures read before the flush finished: the test sleeps a fixed 200 ms. Switching it to wait for the flush signal."));
  tool(id, "Edit", { file_path: "/Users/someone/dev/hawdb/crates/storage/tests/compaction.rs" }, "");
  tool(id, "Edit", { file_path: "/Users/someone/dev/hawdb/crates/storage/src/flush.rs" }, "");
  tool(id, "Bash", { command: "for i in $(seq 50); do cargo test -p hawdb-storage compaction -q || break; done" }, "50/50 ok");
  tool(id, "Bash", { command: "cargo clippy -p hawdb-storage -- -D warnings" }, "ok");
  tool(id, "Bash", { command: "git commit -am 'compaction test: wait for the flush signal'" }, "[ducter/compaction-fix a1c9e07]");
  log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, state: "done", questions: [],
    summary: w("修好了：测试写死等 200ms，flush 慢的时候就读早了。改成等 flush 完成的信号，跑了 50 遍全过。", "Fixed: the test slept a fixed 200 ms and read too early when a flush was slow. It now waits for the flush signal; 50 runs in a row pass."),
    evidence: [{ kind: "test", label: w("50 遍全过", "50/50 pass"), ref: "cargo test" }, { kind: "diff", label: w("改了 2 个文件", "2 files changed"), ref: "a1c9e07" }] } });
  await tick();
}

// 2. Codex preparing App Store Connect: it asks for a sign-in.
const id = "t_asc";
const brief = w("把 Ducter iOS 0.0.1 在 App Store Connect 上的资料准备好：截图、描述、关键词和隐私问卷。要登录的时候停下来问我，不要提交审核。",
  "Get Ducter iOS 0.0.1 ready in App Store Connect: screenshots, description, keywords and the privacy questionnaire. Stop and ask me when it needs a sign-in; don't submit for review.");
log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title: w("准备 Ducter iOS 在 App Store Connect 上的上架资料（截图、描述、隐私问卷）", "Prepare Ducter iOS in App Store Connect (screenshots, description, privacy)"),
  project: "", place: { kind: "repo", device: "local", repoPath: "/Users/someone/dev/ducter", branch: "ducter/app-store-connect", baseBranch: "main" }, harness: "codex", model: "gpt-5.5", brief } });
core.tasks.setState(id, "working", "hot");
await tick();
ev(id, { role: "user", from: "runner", text: `<brief>\n${brief}\n</brief>\n\nStart the task now, following your task brief.` });
ev(id, { role: "system", from: "runner", text: "session started" });
think(id, "Planning the App Store Connect prep");
say(id, w("先看看仓库里已有的元数据和截图，再去 App Store Connect。", "First a look at the metadata and screenshots already in the repo, then App Store Connect."));
tool(id, "commandExecution", "/bin/zsh -lc 'ls -la fastlane/metadata'", "en-US\nzh-Hans\nscreenshots");
tool(id, "commandExecution", "/bin/zsh -lc 'sed -n 1,80p fastlane/metadata/zh-Hans/description.txt'", "Ducter 是你自己部署的个人 AI……");
tool(id, "commandExecution", `/bin/zsh -lc "rg -n \\"CFBundleShortVersionString\\" apps/ios"`, "apps/ios/Info.plist:21: <string>0.0.1</string>");
tool(id, "commandExecution", `/bin/zsh -lc "set -a; source .env; set +a; xcrun altool --list-apps --apiKey $ASC_KEY_ID"`, "Ducter (app.ducter.ios)");
saved(id, w("描述和关键词的草稿写好了（中英两份）", "Description and keywords drafted, in Chinese and English"));
think(id, "Opening App Store Connect in Chrome");
tool(id, "mcp__computer__js", { code: "await app.launch('Google Chrome')" });
tool(id, "mcp__computer__js", { code: "await app.pressKey('super+t'); await app.typeText('appstoreconnect.apple.com\\n');" },
  "The user changed '/Applications/Google Chrome.app'. Re-query the window state before acting, then try again.\n    at assertFresh (computer.js:88)", false);
tool(id, "mcp__computer__js", { code: "await page.goto('https://appstoreconnect.apple.com/login')" }, "navigated");
tool(id, "mcp__computer__js", { code: "const s = await app.screenshot()" }, "[image image/png]");
tool(id, "mcp__computer__js", { code: "const s = await app.screenshot()" }, "[image image/png]");
tool(id, "mcp__computer__js", { completion_summary: "Login page open." }, "Completion summary received.");
tool(id, "mcp__ducter__checkpoint", { text: "x" }, "");
say(id, w("App Store Connect 停在 Apple ID 登录这一步。账号和密码我不碰，等你登录。", "App Store Connect is at the Apple ID sign-in. I won't touch your account or password; I'll wait for you to sign in."));
const goWords = w("等待你完成登录后继续。", "Wait for you to sign in, then continue.");
log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, state: "needs_input", evidence: [],
  summary: w("App Store Connect 要登录。Chrome 已经打开在登录页，描述、关键词和截图都准备好了，登录后我接着填，不会提交审核。",
    "App Store Connect needs a sign-in. Chrome is open at the login page; the description, keywords and screenshots are ready, and I'll fill them in after you sign in. Nothing gets submitted for review."),
  questions: [{ id: "q1", text: w("在 Chrome 里登录一下 App Store Connect？登好了我接着填资料。", "Could you sign in to App Store Connect in Chrome? I'll carry on filling it in once you have."), blocking: true, default: goWords, reversible: true }] } });
await tick();

if (process.env.DEMO_PHASE === "go") {
  const d = log.read({ stream: "channel", kinds: ["decision"] }).at(-1)!;
  core.decisions.decide((d.body as Bodies["decision"]).decisionId, "go");
  await tick();
  think(id, "Checking the sign-in", "Filling in the app information");
  tool(id, "mcp__computer__js", { code: "await page.goto('https://appstoreconnect.apple.com/apps/6739/distribution/ios/version/inflight')" }, "navigated");
  say(id, w("登录好了。先填中文描述和关键词。", "Signed in. The Chinese description and keywords first."));
  tool(id, "mcp__computer__js", { code: "await page.click('#description'); await page.fill('#description', desc)" });
  tool(id, "mcp__computer__js", { code: "await page.click('#keywords'); await page.fill('#keywords', kw)" });
  tool(id, "commandExecution", "/bin/zsh -lc 'python3 scripts/ios/shots.py --device iphone-6.9 --out build/shots'", "6 screenshots");
  tool(id, "mcp__computer__js", { code: "await app.screenshot()" }, "[image image/png]");
  saved(id, w("中文描述、关键词填好了；在传 6.9 寸截图", "Chinese description and keywords in; uploading the 6.9-inch screenshots"));
  say(id, w("中文资料填好了，现在传 6.9 寸的 6 张截图，然后做隐私问卷。", "The Chinese text is in. Uploading the six 6.9-inch screenshots now, then the privacy questionnaire."));
  tool(id, "mcp__computer__js", { code: "await page.setInputFiles('input[type=file]', files)" });
  core.tasks.setState(id, "working", "hot");
}

console.log(`[demo] Ducter demo is up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
