// D654 (research/245 §3.2): hel's board as the fixture for "one project per repository".
// Three folders of nowledge-co/mem on three computers are one project (mem, 10 tasks); mem-backbone
// (haswell, 1); nowledge-labs-website nested inside the Mac's mem checkout (2); six tasks with no
// repo, four in 不在项目里 and two machine set-ups in 电脑上的事; two GitHub-bound tasks keep their
// project with a 来自 GitHub filter chip. Real core, real clients; the runner is the stub.
//   DUCTER_PORT=7823 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-projects.ts
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { Bodies, Place } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const core = startCore({
  ooSource: noOo,
  persona: { id: "default", name: "Ducter", identity: "" },
  hostname: "127.0.0.1",
  deviceProbes: {
    cua: async () => ({ version: "0.44.0" }),
    native: async () => undefined,
    harnesses: async () => [{ harness: "codex", installed: true, loggedIn: true }],
    kind: async () => "server",
  },
  update: { homeName: "hel", autoEveryMs: 0 } as never,
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });

// The other computers: haswell (a server) and the Mac, both doing hel's tasks (D155).
const haswell = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "haswell", platform: "linux-x64" }) as { device: { id: string } };
const mac = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "MacBook Pro M3", platform: "darwin-arm64" }) as { device: { id: string } };
await Bun.sleep(80);

const log = core.log;
const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

type Task = { id: string; title: string; key?: string; name?: string; group?: "computer" | "none"; place: Place; attention: "working" | "blocked" | "needs_you" | "done" | "failed"; updated: number; line?: string; source?: { ref: string; label: string; where: string; kind: "github" } };
const memKey = "github.com/nowledge-co/mem";
const backboneKey = "github.com/nowledge-co/mem-backbone";
const siteKey = "github.com/nowledge-co/nowledge-labs-website";
const repo = (device: string, path: string, branch: string): Place => ({ kind: "repo", device, repoPath: path, branch: `ducter/${branch}`, baseBranch: "main" });
const helMem = "/home/w/ducter/projects/mem";
const haswellMem = "/home/w/ducter/projects/mem";
const identity = "/home/w/dev/mem-identity";
const macMem = "/Users/weyl/dev/nowledge-mem";
const site = "/Users/weyl/dev/nowledge-mem/nowledge-labs-website";
const none = (device = "local"): Place => (device === "local" ? { kind: "none" } : { kind: "none", device });

const tasks: Task[] = [
  // mem: ten tasks over three folders on three computers, one project.
  { id: "p1", title: w("修 Mem 首次连接遇到 403 的体验（#11406）", "Fix the 403 on Mem's first connection (#11406)"), key: memKey, name: "mem", place: repo("local", helMem, "403-first-connect"), attention: "working", updated: -3 * MIN, line: w("在连接器设置里换掉旧的 CLI 调用。", "Replacing the old CLI call in the connector settings."), source: { ref: "nowledge-co/mem#11406", label: "#11406", where: "nowledge-co/mem", kind: "github" } },
  { id: "p2", title: w("独立复审远程访问设置并跟进 #11230", "Re-review the access-anywhere setting and follow #11230"), key: memKey, name: "mem", place: repo("local", helMem, "access-review"), attention: "blocked", updated: -18 * MIN, line: w("PR #11230 的 CI 在跑，等 vitest。", "PR #11230's CI is running; waiting on vitest.") },
  { id: "p3", title: w("核对数据迁移设计并补齐统一备份与恢复", "Check the data-migration design and finish backup and restore"), key: memKey, name: "mem", place: repo("local", helMem, "migration-backup"), attention: "needs_you", updated: -7 * MIN, line: w("备份和恢复两条路都写好了，要你定保留几份。", "Both backup and restore are written; you decide how many copies to keep.") },
  { id: "p4", title: w("把 Mem 的长文案改成新的语气", "Move Mem's long copy to the new voice"), key: memKey, name: "mem", place: repo("local", helMem, "voice-copy"), attention: "done", updated: -2 * HOUR, line: w("改完了，开了 PR。", "Done; opened a PR.") },
  { id: "p5", title: w("修 haswell 上 gh 找不到导致 PR 状态读不到", "Read PR state when haswell has no gh"), key: memKey, name: "mem", place: repo("haswell", haswellMem, "gh-at-home"), attention: "working", updated: -12 * MIN, line: w("把 github.com 的读取挪到 hel 上。", "Moving github.com reads to hel.") },
  { id: "p6", title: w("撤回 mem-identity 里重复的迁移", "Undo the duplicate migration in mem-identity"), key: memKey, name: "mem", place: repo("haswell", identity, "identity-duplicate"), attention: "done", updated: -5 * HOUR, line: w("撤回了，identity 的索引重新对上。", "Undone; mem-identity's index lines up again.") },
  { id: "p7", title: w("把 PR #11408 交给 PR Babysitter", "Hand PR #11408 to the PR Babysitter"), key: memKey, name: "mem", place: repo("haswell", haswellMem, "hand-11408"), attention: "working", updated: -26 * MIN, line: w("在等它认领。", "Waiting for it to claim it.") },
  { id: "p8", title: w("写 Mem 迁移的发布说明", "Write the release notes for the Mem migration"), key: memKey, name: "mem", place: repo("mac", macMem, "release-notes"), attention: "blocked", updated: -40 * MIN, line: w("等 #11230 合了再发。", "Waiting for #11230 to merge.") },
  { id: "p9", title: w("给 Mem 的搜索补上中文样例", "Add Chinese examples to Mem's search"), key: memKey, name: "mem", place: repo("mac", macMem, "search-zh"), attention: "done", updated: -3 * HOUR, line: w("加了 12 条，测试都过。", "Added 12; the tests pass.") },
  { id: "p10", title: w("看一眼 #11406 的 merge 之后主线", "Check main after #11406 merged"), key: memKey, name: "mem", place: repo("mac", macMem, "main-after-11406"), attention: "working", updated: -1 * MIN, line: w("在跑 lcov 和 e2e。", "Running lcov and e2e."), source: { ref: "nowledge-co/mem#11406", label: "#11406", where: "nowledge-co/mem", kind: "github" } },

  // mem-backbone: its own origin, one task.
  { id: "k1", title: w("Backbone 的 schema 和后端对齐", "Line the Backbone schema up with the backend"), key: backboneKey, name: "mem-backbone", place: repo("haswell", "/home/w/ducter/projects/mem-backbone", "schema-align"), attention: "working", updated: -9 * MIN, line: w("两个表的外键对上了。", "Two tables' foreign keys agree now.") },

  // The website is a repository nested inside the Mac's mem checkout: its own project.
  { id: "s1", title: w("官网首页的截图在手机上被切到一半", "The homepage shot is cut in half on a phone"), key: siteKey, name: "nowledge-labs-website", place: repo("mac", site, "phone-shot"), attention: "needs_you", updated: -22 * MIN, line: w("裁好了，要你看一下新的构图。", "Recropped; take a look at the new framing.") },
  { id: "s2", title: w("文档页的搜索在 390 宽不好用", "Docs search is awkward at 390"), key: siteKey, name: "nowledge-labs-website", place: repo("mac", site, "docs-search"), attention: "done", updated: -4 * HOUR, line: w("改成一行，手机上能用了。", "One row now; it works on a phone.") },

  // 不在项目里: no folder, ordinary work.
  { id: "n1", title: w("读 research/244 的会话审计", "Read research/244's conversation audit"), group: "none", place: none(), attention: "working", updated: -6 * MIN, line: w("在看第三部分。", "Reading part three.") },
  { id: "n2", title: w("整理这周的 Mem 邮箱", "Tidy this week's Mem mailbox"), group: "none", place: none(), attention: "done", updated: -6 * HOUR, line: w("清到 0 封。", "Down to zero.") },
  { id: "n3", title: w("给下周的发布写一页提纲", "Draft one page for next week's release"), group: "none", place: none("haswell"), attention: "blocked", updated: -2 * HOUR, line: w("等 #11230 的结果。", "Waiting on #11230.") },
  { id: "n4", title: w("回 Lina 关于 HawDB 发布的邮件", "Reply to Lina about the HawDB release"), group: "none", place: none(), attention: "failed", updated: -1 * HOUR, line: w("没能开始：这台电脑上没有你的邮件。", "Couldn't start: your mail isn't on this computer.") },

  // 电脑上的事: machine set-up and errands.
  { id: "c1", title: w("在 hel 上装 Prow MCP 并接上", "Install Prow MCP on hel and connect it"), group: "computer", place: none(), attention: "failed", updated: -32 * MIN, line: w("装到一半，缺一个系统依赖。", "Half installed; a system dependency is missing.") },
  { id: "c2", title: w("在 haswell 上装 Prow MCP 并接上", "Install Prow MCP on haswell and connect it"), group: "computer", place: none("haswell"), attention: "done", updated: -1 * DAY, line: w("装好了，已接上。", "Installed and connected.") },
];

const source = new Map<string, Task["source"]>();
for (const t of tasks) {
  const body: Bodies["task_open"] = {
    taskId: t.id,
    title: t.title,
    project: "",
    place: t.place,
    harness: "claude-code",
    brief: t.title,
    ...(t.key ? { projectKey: t.key, projectName: t.name } : {}),
    ...(t.group ? { projectGroup: t.group } : {}),
    ...(t.group === "computer" ? { workKind: "errand" as const } : {}),
  };
  log.append({ stream: `task:${t.id}`, origin: t.key ? "partner" : "you", kind: "task_open", body });
  core.tasks.setState(t.id, t.attention, t.attention === "done" || t.attention === "failed" ? "parked" : "hot", t.line ? undefined : undefined);
  log.append({ stream: `task:${t.id}`, origin: "system", kind: "task_state", body: { taskId: t.id, attention: t.attention, residency: t.attention === "done" || t.attention === "failed" ? "parked" : "hot" } });
  if (t.line) log.append({ stream: `task:${t.id}`, origin: "task", kind: "task_event", body: { taskId: t.id, role: "assistant", text: t.line } });
  if (t.attention === "done" || t.attention === "failed") log.append({ stream: `task:${t.id}`, origin: "task", kind: "report", body: { taskId: t.id, state: t.attention === "done" ? "done" : "failed", summary: t.line ?? t.title, questions: [], evidence: [] } });
  if (t.source) source.set(t.id, t.source);
}
// The GitHub-bound tasks: they keep their project and get a 来自 GitHub chip, never a project.
for (const [id, s] of source) log.append({ stream: `task:${id}`, origin: "system", kind: "task_bound", body: { taskId: id, by: "you", item: { source: "src_github", kind: "github", ref: s!.ref, label: s!.label, where: s!.where, title: tasks.find((x) => x.id === id)!.title, url: `https://github.com/${s!.where}/issues/${s!.label.slice(1)}` } } });
// A wait: one task blocked on CI that comes back on its own.
log.append({ stream: "waiter:w1", origin: "waiter", kind: "waiter", body: { waiterId: "w1", taskId: "p2", reason: w("PR #11230 的 CI 通过", "PR #11230's CI passes"), state: "armed", armedAt: iso(-18 * MIN), lastLookAt: iso(-1 * MIN), nextLookAt: iso(6 * MIN), everyMs: 5 * MIN } });

void haswell;
void mac;
console.log(`demo at http://127.0.0.1:${core.port}/app`);
