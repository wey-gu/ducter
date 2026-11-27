// D628: hel's five "waiting" tasks, before and after one truth for a PR. Before: five tasks
// rest on timers after four PRs already merged; after: four are done (their hand-off settled) and
// only the real release wait stays. Never this machine's gh, oo or Mem.
//   DUCTER_PORT=7611 DEMO_BEFORE=1 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-waits.ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const before = process.env.DEMO_BEFORE === "1";
const w = (z: string, e: string) => (zh ? z : e);
const dataDir = process.env.DUCTER_DATA_DIR || join(mkdtempSync(join(tmpdir(), "ducter-demo-waits-")), "data");
mkdirSync(dataDir, { recursive: true });
const persona = { id: "default", name: "Ducter", identity: "" };
const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

const helper = {
  id: "nowledge-mem-pr-babysitter",
  name: "Nowledge Mem PR Babysitter",
  about: w("用 Codex 接手 Nowledge Mem 的 PR，修复 CI 和评审问题，跟到可合并后通过 Bridge 回信。", "Take over Nowledge Mem PRs with Codex, fix CI and review comments, follow each until it can merge, then answer over Bridge."),
  brief: "Never merge.",
  persona: "default",
  agentId: "ducter-helper-nowledge-mem-pr-babysitter",
  state: "on",
  createdAt: iso(-50 * HOUR),
  link: { context: "ducter-helper-nowledge-mem-pr-babysitter-on-hetzner-server", connectionId: "c-demo", spaceId: "personal-4e742092" },
  mem: "ready",
  said: "ready",
};
writeFileSync(join(dataDir, "helpers.json"), JSON.stringify({ helpers: [helper] }, null, 2));

const core = startCore({ dataDir, persona, push: false, ooSource: noOo, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
const log = core.log;
core.keeps.sync();
const h = core.helpers.list()[0]!;

const open = (id: string, title: string, report: string) => {
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project: "mem", place: { kind: "none" }, harness: "codex", brief: report } });
  log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, state: "done", summary: report, questions: [], evidence: [] } });
};

const wait = (id: string, reason: string, extra: Record<string, unknown> = {}) => {
  log.append({ stream: "channel", origin: "task", kind: "waiter", body: { waiterId: `w-${id}`, taskId: id, reason, state: "armed", at: iso(-2 * MIN), everyMs: 45 * MIN, ...extra } });
  core.tasks.setState(id, "blocked", "warm", reason);
};

const merged = [
  { id: "t_11408", title: w("用 agy 处理 Mem #11408", "Handle Mem #11408 with agy"), ref: "nowledge-co/mem#11408", report: w("改好了，PR 开好了，交给你跟进。", "Fixed, the PR is open; handing it to you.") },
  { id: "t_378", title: w("修 mem-backbone 的 #378", "Fix mem-backbone #378"), ref: "nowledge-co/mem-backbone#378", report: w("问题修好了，PR 交给帮手。", "Fixed; the PR is with the helper.") },
  { id: "t_11441", title: w("评审 Mem #11441", "Review Mem #11441"), ref: "nowledge-co/mem#11441", report: w("评审完了，PR 交给帮手。", "Reviewed; the PR is with the helper.") },
  { id: "t_11389", title: w("接手 mem#11389", "Take over mem#11389"), ref: "nowledge-co/mem#11389", report: w("看过了，交给帮手。", "Looked at; handing it over.") },
];

for (const t of merged) {
  open(t.id, t.title, t.report);
  log.append({ stream: `task:${t.id}`, origin: "partner", kind: "checkpoint", body: { taskId: t.id, owns: [t.ref] } });
}

// The real wait: a display fix that ships with the next Ducter release.
open("t_release", w("等 Ducter 发版后补上显示", "Add the display fix when Ducter ships"), w("显示修复已经写好，等新版本发出来再补上。", "The display fix is written; it goes in once the new version ships."));

// Let the done reports settle, then rest each task on its own wait.
await new Promise((r) => setTimeout(r, 120));
for (const t of merged) {
  log.append({ stream: `task:${t.id}`, origin: "system", kind: "owned_news", body: { taskId: t.id, pr: t.ref, news: [], seen: { since: iso(-3 * HOUR), state: before ? "open" : "merged", head: "b4bb875" } } });
  wait(t.id, w(`复查 PR Babysitter 对 #${t.ref.split("#")[1]} 的接手回执`, `Check the Babysitter's acknowledgement of #${t.ref.split("#")[1]}`));
  core.handoffs.giveLocal({ helper: h, text: w(`请接手 ${t.ref}：按你自己的要求跟到底。`, `Please take ${t.ref}: own it to the end by your own rules.`), fromTask: t.id, fromTaskTitle: t.title, fromName: "Ducter", item: { kind: "pr", ref: t.ref, title: t.ref } });
}
wait("t_release", w("Ducter 发 0.1.97", "Ducter 0.1.97 ships"), { check: { argv: ["gh", "release", "view", "v0.1.97", "--repo", "nowledge-co/ducter"], succeedWhen: { exitCode: 0 } }, kind: "check", everyMs: 30 * MIN });

// Let the settlement watcher run once.
await new Promise((r) => setTimeout(r, 200));

console.log(`[demo] waits ${before ? "before" : "after"} at http://127.0.0.1:${core.port}/app (data: ${dataDir})`);
console.log(`[demo] counts ${JSON.stringify(core.tasks.onHand().counts)}`);
for (const t of [...merged, { id: "t_release", title: "release" }]) console.log(`[demo] task ${t.id} ${core.tasks.get(t.id)?.attention}`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
