// D600: a finished task an open PR still held, as on hel (2026-11-26): 「跟进 Bridge 试用指引 PR #11166」,
// handed to the PR Babysitter, its PR #11166 merged, then a draft #11179 opened from its branch: a
// duplicate whose one check fails. It stood under 在等 for two days and the helper's Keep held
// 「#11179 … CI 未通过」. Beside it the babysitter's other work (#11030 at work on lint). Open the task
// (/app#task=5ykh7m6y), its ⋯ has 结束任务 / End task and its line asks in place; after it, the task is
// done and the Keep (/app#keep=<id>) holds only #11030. Never this machine's gh, oo or Mem.
//   DUCTER_PORT=7600 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-d600.ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { Bodies, OwnedSeen, Place } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const dataDir = process.env.DUCTER_DATA_DIR || join(mkdtempSync(join(tmpdir(), "ducter-demo-d600-")), "data");
mkdirSync(dataDir, { recursive: true });
const persona = { id: "default", name: "Ducter", identity: "" };
const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const SPACE = "personal-4e742092";
const helper = {
  id: "nowledge-mem-pr-babysitter",
  name: "Nowledge Mem PR Babysitter",
  about: w("用 Codex 接手 Nowledge Mem 的 PR，修复 CI 和评审问题，跟到可合并后通过 Bridge 回信。", "Take over Nowledge Mem PRs with Codex, fix CI and review comments, follow each until it can merge, then answer over Bridge."),
  brief: "Never merge.",
  persona: "default",
  agentId: "ducter-helper-nowledge-mem-pr-babysitter",
  state: "on",
  createdAt: iso(-50 * HOUR),
  link: { context: "ducter-helper-nowledge-mem-pr-babysitter-on-hetzner-server", connectionId: "c-demo", spaceId: SPACE },
  mem: "ready",
  said: "ready",
};
writeFileSync(join(dataDir, "helpers.json"), JSON.stringify({ helpers: [helper] }, null, 2));

let shift = 0;
const clock = { now: () => Date.now() + shift, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const work = { exec: async () => ({ exitCode: 1, stdout: "" }), ownedEveryMs: 3_600_000 };
const seed = startCore({ dataDir, port: 0, push: false, persona, ooSource: noOo, clock, work });
seed.setRunner(stubRunner(seed));
seed.setPartner({ onTrigger() {} });
seed.settings.set({ language: zh ? "zh" : "en" });
const log = seed.log;
const at = async (ms: number) => {
  await Bun.sleep(40);
  shift = ms;
};
const ev = (id: string, b: Omit<Bodies["task_event"], "taskId">) => log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, ...b } });
const say = (id: string, text: string) => ev(id, { role: "assistant", text });
const tool = (id: string, name: string, input: unknown, output = "") => ev(id, { role: "tool", tool: { name, input, output, ok: true } });
const report = (id: string, r: Omit<Bodies["report"], "taskId" | "questions">) => log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, questions: [], ...r } });
const place = (branch: string): Place => ({ kind: "repo", device: "local", repoPath: "/Users/weyl/dev/nowledge-mem", branch, baseBranch: "main", hasRemote: true } as Place);
const owned = (id: string, pr: string, seen: Omit<OwnedSeen, "since">, since = iso(-40 * HOUR)) => log.append({ stream: `task:${id}`, origin: "system", kind: "owned_news", body: { taskId: id, pr, news: [], seen: { since, ...seen } } });
const zsh = (c: string) => `/bin/zsh -lc '${c}'`;
let n = 0;
const handed = (id: string, pr: string, ago: number) => {
  n++;
  const from = { from: "another agent", mine: true, agent: "Codex", selfNamed: true, space: SPACE, helper: helper.id };
  log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: `m-h${n}`, ...from, sentAt: iso(-ago), text: `https://github.com/${pr.replace("#", "/pull/")}`, linked: true } as never });
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: `m-hc${n}`, to: "another agent", ...from, text: w("接下了。", "On it."), inReplyTo: `m-h${n}`, taskId: id, opId: `hc${n}`, state: "sent" } as never });
};

// ---- 5ykh7m6y, as hel's Log has it ----
const ID = "5ykh7m6y";
await at(-(41 * HOUR));
log.append({ stream: `task:${ID}`, origin: "partner", kind: "task_open", body: { taskId: ID, title: w("跟进 Bridge 试用指引 PR #11166", "Follow the Bridge trial guide PR #11166"), project: "mem", place: place(`ducter/task-${ID}`), harness: "codex", model: "gpt-6-luna", brief: "PR #11166" } });
seed.tasks.setState(ID, "working", "hot");
handed(ID, "nowledge-co/mem#11166", 41 * HOUR);
tool(ID, "commandExecution", zsh("gh pr view 11166 --json title,state,statusCheckRollup"), "");
await at(-(40 * HOUR));
owned(ID, "nowledge-co/mem#11166", { head: "8248c67f1957bfed83a83acce8b6e112402cad5d", state: "merged", standing: { at: iso(-40 * HOUR), title: "docs(bridge): guide three everyday exchanges", head: "8248c67f1957bfed83a83acce8b6e112402cad5d", checks: { total: 3, passed: 3, failed: [], pending: [] } } });
report(ID, { state: "done", summary: w("PR #11166 已由 Nowledge CI 机器人合并。真实双成员交接仍由 hawkingrei 跟进。", "PR #11166 was merged by the Nowledge CI bot. The two-member hand-over check stays with hawkingrei."), evidence: [{ kind: "url", label: w("合并记录", "The merge"), ref: "https://github.com/nowledge-co/mem/commit/41cce44ba1c34773fcdcfe9abb8be2e5c583609b" }] });
seed.tasks.setState(ID, "done", "warm");
await at(-(40 * HOUR) + 4 * MIN);
log.append({ stream: "channel", origin: "user", kind: "job_status", body: { jobId: `act_${ID}_open_pr`, taskId: ID, state: "done", text: "the user opened a draft PR for this task: https://github.com/nowledge-co/mem/pull/11179", act: "open_pr", ref: "https://github.com/nowledge-co/mem/pull/11179" } });
owned(ID, "nowledge-co/mem#11179", { from: "integrate", head: "8248c67f1957bfed83a83acce8b6e112402cad5d", ciFor: "8248c67f1957bfed83a83acce8b6e112402cad5d", state: "open", standing: { at: iso(-40 * HOUR + 5 * MIN), title: `ducter/task ${ID}`, head: "8248c67f1957bfed83a83acce8b6e112402cad5d", draft: true, checks: { total: 3, passed: 2, failed: ["ci/pr-closing-references"], pending: [] } } }, iso(-40 * HOUR + 4 * MIN));
report(ID, { state: "done", summary: w("#11179 是 #11166 已合并内容的重复草稿，两份文档与合并提交中的版本完全一致。失败的检查源于草稿正文缺少 Issue Number 行。", "#11179 is a duplicate draft of what #11166 merged: both documents match the merged commit. Its failing check is the draft's missing Issue Number line."), evidence: [{ kind: "url", label: w("重复草稿", "The duplicate draft"), ref: "https://github.com/nowledge-co/mem/pull/11179/checks" }] });
seed.tasks.setState(ID, "done", "parked");

// ---- #11030, the babysitter's other work, at work on lint ----
await at(-(48 * MIN));
log.append({ stream: "task:t_11030", origin: "partner", kind: "task_open", body: { taskId: "t_11030", title: w("跟进 #11030：自定义 provider 切到 Embedding 时只留一个模型", "Follow #11030: one clean model when a custom provider switches to Embedding"), project: "mem", place: place("fix/embedding-one-model"), harness: "codex", model: "gpt-6-luna", brief: "#11030" } });
seed.tasks.setState("t_11030", "working", "hot");
handed("t_11030", "nowledge-co/mem#11030", 48 * MIN);
owned("t_11030", "nowledge-co/mem#11030", { head: "c7f1b09", state: "open", standing: { at: iso(-6 * MIN), title: "fix(settings): one clean model when a custom provider switches to Embedding", head: "c7f1b09", checks: { total: 14, passed: 11, failed: ["lint"], pending: ["e2e-linux", "e2e-mac"] }, merge: "unstable" } }, iso(-48 * MIN));
await at(-(2 * MIN));
say("t_11030", w("lint 挂在一个没用的 import 上，删掉了，测试过了，正在 push。", "Lint failed on an unused import; removed it, the tests pass, pushing now."));
await at(0);
await Bun.sleep(300);
await seed.stop();

// A start in between, as after an upgrade: the helper becomes its Keep.
const endAsk = async () => ({ until: w("每个 PR 跟到能合并为止", "Each PR until it can merge") });
const mid = startCore({ dataDir, persona, push: false, ooSource: noOo, work, keeps: { endAsk } });
mid.setRunner(stubRunner(mid));
mid.setPartner({ onTrigger() {} });
mid.keeps!.sync();
await Bun.sleep(100);
const ids = mid.keeps!.all().map((k) => `${k.title}=${k.keepId}`);
await mid.stop();

const core = startCore({ dataDir, persona, push: false, ooSource: noOo, hostname: process.env.DUCTER_HOST || "127.0.0.1", work, keeps: { endAsk } });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
console.log(`[demo] D600 at http://127.0.0.1:${core.port}/app#task=${ID} (data: ${dataDir})`);
for (const x of ids) console.log(`[demo] keep ${x}`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
