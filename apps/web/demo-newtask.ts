// A demo core for 开一件事 / New task (D128): real core (Log, task_new_options, task_new, open_task,
// the diff stats on On hand), a runner that opens tasks the way the real one logs them, scratch
// git repos with branches, and work in three of them. For screenshots and manual checks.
//   DUCTER_PORT=7971 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh bun apps/web/demo-newtask.ts
// DEMO_FAIL=offline|failed: every task_new is refused that way (the card's error line).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startCore } from "@ducter/core";
import type { Bodies, BranchChanges, DeviceHarness, Place, TaskCard } from "@ducter/protocol";
import type { ListedModel, Runner } from "@ducter/protocol/src/internal.ts";
import { createModelCatalog } from "../../packages/core/src/models.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const fail = process.env.DEMO_FAIL;
const dataDir = process.env.DUCTER_DATA_DIR;
if (!dataDir) throw new Error("set DUCTER_DATA_DIR to a scratch folder");

// Three scratch repos with a few branches each, and the hint `ducter up` would leave.
const git = (cwd: string, ...args: string[]) => {
  const r = Bun.spawnSync(["git", ...args], { cwd, env: { ...process.env, GIT_AUTHOR_NAME: "demo", GIT_AUTHOR_EMAIL: "d@x", GIT_COMMITTER_NAME: "demo", GIT_COMMITTER_EMAIL: "d@x" } });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
};
const repos: Record<string, { main: string; branches: string[] }> = {
  ducter: { main: "main", branches: ["ducter/app-store-connect", "ducter/new-task-ui", "release/0.0.1", "conversation-bubbles"] },
  hawdb: { main: "main", branches: ["ducter/compaction-fix", "ducter/wal-bench"] },
  tinycart: { main: "master", branches: [] },
};
const root = join(dataDir, "repos");
for (const [name, r] of Object.entries(repos)) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q", "-b", r.main);
  writeFileSync(join(dir, "README.md"), `# ${name}\n`);
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "init");
  for (const b of r.branches) git(dir, "branch", b);
}
const at = (name: string) => join(root, name);
writeFileSync(
  join(dataDir, "firstrun.json"),
  JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), repoCount: 3, repos: Object.keys(repos).map((n, i) => ({ name: n, path: at(n), touchedAt: new Date(Date.now() - i * 3600_000).toISOString() })) }),
);

const harnesses: DeviceHarness[] = [
  { harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, billing: "plan", allowance: { left: 0.64, resetsAt: new Date(Date.now() + 18 * 3600_000).toISOString() }, models: [{ id: "opus", label: "Opus" }, { id: "sonnet", label: "Sonnet" }] },
  { harness: "codex", installed: true, loggedIn: true, canBePartner: true, billing: "plan", allowance: { left: 0.48, resetsAt: new Date(Date.now() + 3 * 86400_000).toISOString() } },
  { harness: "pi", installed: true, loggedIn: false, canBePartner: false },
  { harness: "deepseek-harness", installed: true, loggedIn: true, canBePartner: false, billing: "usage" },
];

// D202: each agent's own model list, as Claude Code 2.1.322 and Codex 0.167.1 gave it (trimmed).
const E = ["low", "medium", "high", "xhigh", "max"];
const lists: Record<string, ListedModel[]> = {
  "claude-code": [
    { id: "default", label: "Default (recommended)", efforts: E },
    { id: "opus", label: "Opus 5.5", efforts: E },
    { id: "fable", label: "Fable 5.2", efforts: E },
    { id: "sonnet", label: "Sonnet 5.5", efforts: E },
    { id: "haiku", label: "Haiku 5.5", efforts: E },
    { id: "claude-opus-4-8", label: "Opus 4.8", efforts: E },
  ],
  codex: [
    { id: "gpt-6.1-sol", label: "GPT-6.1-Sol", efforts: [...E, "ultra"], defaultEffort: "low" },
    { id: "gpt-6.1-terra", label: "GPT-6.1 Terra", efforts: [...E, "ultra"], defaultEffort: "low", default: true },
    { id: "gpt-6-luna", label: "GPT-6-Luna", efforts: E, defaultEffort: "medium" },
  ],
};

const core = startCore({
  persona: { id: "default", name: "Ducter", identity: "" },
  models: createModelCatalog({ read: async (_device, harness) => lists[harness] }),
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  deviceProbes: { cua: async () => ({ missing: "demo" }), harnesses: async () => harnesses, kind: async () => "laptop" },
});
core.setPartner({ onTrigger() {} });
const log = core.log;

const stats: Record<string, BranchChanges> = {};
let n = 0;
const runner = {
  harness: { start: async () => ({}) as never, available: async () => [] },
  async openTask(input: Parameters<Runner["openTask"]>[0]): Promise<TaskCard> {
    if (fail) throw Object.assign(new Error(fail === "offline" ? "MacBook is offline" : "the worktree couldn't be made"), fail === "offline" ? { name: "DeviceOfflineError" } : {});
    const taskId = `t_you${++n}`;
    const place = input.place?.kind === "repo" ? { ...input.place, branch: `ducter/${taskId}`, baseBranch: input.place.baseBranch ?? "main" } : (input.place ?? { kind: "none" as const });
    log.append({ stream: `task:${taskId}`, origin: "system", kind: "task_open", body: { taskId, title: input.title, project: input.project ?? "", place, harness: input.harness ?? "claude-code", ...(input.model ? { model: input.model } : {}), brief: input.brief, ...(input.origin ? { origin: input.origin } : {}) } });
    log.append({ stream: `task:${taskId}`, origin: "system", kind: "body_selected", body: { taskId, harness: input.harness ?? "claude-code", why: { kind: input.harness ? "you" : "default" } } });
    core.tasks.setState(taskId, "working", "hot");
    return core.tasks.get(taskId)!;
  },
  send: async () => ({ delivered: "prompted" as const }),
  interrupt: async () => {},
  drop: async () => {},
  branchChanges: async (id: string) => stats[id],
};
core.setRunner(runner as unknown as Runner);

const tick = () => Bun.sleep(30);
const repo = (name: string, branch: string): Place => ({ kind: "repo", device: "local", repoPath: at(name), branch, baseBranch: repos[name]!.main });
async function task(id: string, title: string, project: string, place: Place, harness: string, state: "working" | "done" | "blocked" | "needs_you", s?: [number, number, number], origin?: "you") {
  log.append({ stream: `task:${id}`, origin: origin ? "system" : "partner", kind: "task_open", body: { taskId: id, title, project, place, harness, brief: title, ...(origin ? { origin } : {}) } as Bodies["task_open"] });
  if (s) stats[id] = { files: s[0], adds: s[1], dels: s[2] } as BranchChanges;
  core.tasks.setState(id, state, "warm");
  await tick();
}
const w = (z: string, e: string) => (zh ? z : e);
await task("t_newtask", w("开一件事的卡片和按项目分组", "The New task card and By project"), "ducter", repo("ducter", "ducter/new-task-ui"), "claude-code", "working", [7, 412, 38], "you");
await task("t_asc", w("准备 Ducter iOS 在 App Store Connect 上的上架资料", "Prepare Ducter iOS in App Store Connect"), "ducter", repo("ducter", "ducter/app-store-connect"), "codex", "working", [4, 118, 12]);
await task("t_wal", w("WAL 回放的基准测试", "Benchmark WAL replay"), "HawDB", repo("hawdb", "ducter/wal-bench"), "codex", "working");
await task("t_flaky", w("修 compaction 偶发失败的测试", "Fix the flaky compaction test"), "HawDB", repo("hawdb", "ducter/compaction-fix"), "claude-code", "done", [2, 31, 9]);
await task("t_cart", w("购物车数量为 0 时隐藏结算按钮", "Hide checkout when the cart is empty"), "tinycart", repo("tinycart", "ducter/empty-cart"), "claude-code", "working", [3, 42, 7], "you");
await task("t_train", w("查下周五去上海最早的高铁", "Find the earliest train to Shanghai next Friday"), "", { kind: "none" }, "claude-code", "done");
log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w("今天先把 New task 的界面做完", "Let's finish the New task UI today") } });
log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w("好。它在做，做完我告诉你。", "Sure. It's on it, and I'll tell you when it's done.") } });

console.log(`demo-newtask on ${core.url} · ${zh ? "zh" : "en"}${fail ? ` · fail ${fail}` : ""}`);
