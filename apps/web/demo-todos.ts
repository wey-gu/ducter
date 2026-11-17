// A demo core for D341's 待办来源 / To-do sources: GitHub (a fake gh with issues assigned to "lin-dev",
// never the real GitHub) and an Obsidian vault in a scratch folder (never the person's own), a task
// bound to an issue that commented, one bound to a vault line that was ticked, one working, a
// write-back card, and a vault Obsidian lists that isn't added yet.
//   DUCTER_PORT=7999 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-todos.ts
// then open http://127.0.0.1:7999/app and Settings › 待办来源.
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { fakeGh } from "../../packages/core/test/fake-gh-issues.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-todos-"));
const home = join(scratch, "home");
const life = join(scratch, "Life");
const work = join(scratch, "Work notes");
mkdirSync(join(life, "Plans"), { recursive: true });
mkdirSync(work, { recursive: true });
writeFileSync(
  join(life, "Plans", zh ? "这周.md" : "This week.md"),
  (zh
    ? ["# 这周", "- [ ] 给房东回邮件，问暖气什么时候修 📅 2026-11-19 🔼", "- [ ] 整理 11 月的报销单 📅 2026-11-21", "- [ ] 订下周去上海的高铁票", "- [ ] 浇花 🔁 every week"]
    : ["# This week", "- [ ] Reply to the landlord about the heating 📅 2026-11-19 🔼", "- [ ] Sort November's expense receipts 📅 2026-11-21", "- [ ] Book the train to Shanghai next week", "- [ ] Water the plants 🔁 every week"]
  ).join("\n") + "\n",
);
const old = new Date(Date.now() - 3600_000);
utimesSync(join(life, "Plans", zh ? "这周.md" : "This week.md"), old, old);
const cfg = join(home, "Library", "Application Support", "obsidian");
mkdirSync(cfg, { recursive: true });
writeFileSync(join(cfg, "obsidian.json"), JSON.stringify({ vaults: { a: { path: life, ts: 2 }, b: { path: work, ts: 1 } } }));

const gh = fakeGh(
  [
    { repo: "acme/web", number: 12, title: "Login redirect drops the return path", body: "After sign-in it always lands on /.", labels: ["bug"], updated: "2026-11-17T09:10:00Z" },
    { repo: "acme/web", number: 14, title: "Footer links overflow on small phones", labels: ["ui"], updated: "2026-11-17T08:40:00Z" },
    { repo: "acme/api", number: 31, title: "Rate limiter counts retries twice", updated: "2026-11-16T18:00:00Z" },
    { repo: "acme/api", number: 33, title: "Review: move sessions to Redis", pr: true, updated: "2026-11-16T12:00:00Z" },
  ],
  { login: "lin-dev" },
);

const core = startCore({ ooSource: noOo, persona: { id: "default", name: zh ? "小鸭" : "Duckie", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1", taskSources: { ghRun: gh.run, ghEnv: {}, home, quietMs: 0, pollMs: 3_600_000 } });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });

const ts = core.taskSources;
await ts.add("github");
await ts.add("obsidian", life);
await ts.look();
const src = ts.view().sources;
ts.set(src[0]!.id, { whenNew: "take" });
const items = (await ts.items()).items;

const open = (taskId: string, title: string, repo: string | undefined, brief: string) => {
  core.log.append({ stream: `task:${taskId}`, origin: "partner", kind: "task_open", body: { taskId, title, project: repo ? repo.split("/").pop()! : "", place: repo ? { kind: "repo", device: "local", repoPath: `~/dev/${repo.split("/").pop()}`, branch: `ducter/${taskId}` } : { kind: "none" }, harness: "claude-code", brief, language: zh ? "zh" : "en" } });
};
const say = (origin: "user" | "partner", text: string) => core.log.append({ stream: "channel", origin, kind: origin === "user" ? "user_msg" : "ai_msg", body: { text } } as never);

say("user", zh ? "GitHub 上有什么分给我的？" : "Anything assigned to me on GitHub?");
say("partner", zh ? "有 4 件。最急的是 acme/web #12：登录后回不到原来的页面。要我接这件吗？" : "Four. The most pressing is acme/web #12: sign-in loses the page you came from. Want me to take it?");
say("user", zh ? "接 #12，顺便把 #14 也做了" : "Take #12, and #14 too");

const i12 = items.find((i) => i.ref === "acme/web#12")!;
const i14 = items.find((i) => i.ref === "acme/web#14")!;
open("t12", zh ? "修登录后的回跳" : "Fix the sign-in return path", "acme/web", "Fix acme/web#12");
ts.bind("t12", i12, "partner");
core.tasks.setState("t12", "working", "hot");
open("t14", zh ? "页脚在小屏上溢出" : "Footer overflow on small phones", "acme/web", "Fix acme/web#14");
ts.bind("t14", i14, "partner");
core.log.append({ stream: "task:t14", origin: "task", kind: "report", body: { taskId: "t14", state: "done", summary: zh ? "页脚链接在 360 宽以下换行了；草稿 PR #15。" : "Footer links wrap below 360 wide; draft PR #15.", questions: [], evidence: [{ kind: "url", ref: "https://github.com/acme/web/pull/15" }] } });
core.tasks.setState("t14", "done", "cold");
const card = await ts.propose({ taskId: "t14", text: "Footer links now wrap below 360 px instead of overflowing. Draft PR: https://github.com/acme/web/pull/15", lang: zh ? "zh" : "en" });
void card;

// A vault line, done and ticked by itself.
const line = items.find((i) => i.kind === "obsidian" && /房东|landlord/.test(i.title))!;
open("tv", zh ? "给房东回邮件问暖气" : "Email the landlord about the heating", undefined, "Reply to the landlord");
ts.bind("tv", line, "you");
core.tasks.setState("tv", "done", "cold");

console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir}; scratch: ${scratch})`);
