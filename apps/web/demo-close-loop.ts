// D633: hel's 2026-11-27 06:45 board, for the before/after shots. Two Plus year-fix tasks whose
// PRs merged, whose loops the person ended, left standing in 在做 with nothing running; the #11389
// takeover waits on a merged PR Ducter never watched. CLOSE_LOOP_BEFORE=1 draws the old version (the
// repair off); the default draws the first start of the new one (the repair fixes the two, the GitHub
// read settles #11389). Never this machine's gh, oo or Mem.
//   DUCTER_PORT=7611 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-close-loop.ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { Bodies, Place } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const w = (z: string, e: string) => (zh ? z : e);
const before = process.env.CLOSE_LOOP_BEFORE === "1";
const dataDir = process.env.DUCTER_DATA_DIR || join(mkdtempSync(join(tmpdir(), "ducter-demo-close-loop-")), "data");
mkdirSync(dataDir, { recursive: true });
const persona = { id: "default", name: "Ducter", identity: "" };
const MIN = 60_000;
const HOUR = 60 * MIN;
const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const SPACE = "personal-4e742092";
const helper = {
  id: "nowledge-mem-pr-babysitter",
  name: "PR helper",
  about: w("用 Codex 接手 Nowledge Mem 的 PR，修复 CI 和评审问题，跟到可合并后通过 Bridge 回信。", "Take over Nowledge Mem PRs with Codex, follow each until it can merge, then answer over Bridge."),
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

let shift = -3 * HOUR;
const clock = { now: () => Date.now() + shift, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
/** The one GitHub read the demo answers: #11389 merged; anything else open. */
const exec = async (argv: string[]) => {
  const path = argv[2] ?? "";
  const out = (v: unknown) => ({ exitCode: 0, stdout: JSON.stringify(v) });
  if (/^repos\/[^/]+\/[^/]+\/pulls\/(11389|11441)$/.test(path)) return out({ state: "closed", merged: true });
  if (/^repos\/[^/]+\/[^/]+\/pulls\/\d+$/.test(path)) return out({ state: "open", merged: false });
  return { exitCode: 1, stdout: "not found" };
};
const at = async (ms: number) => {
  await Bun.sleep(30);
  shift = ms;
};
const place = (branch: string): Place => ({ kind: "repo", device: "local", repoPath: "/Users/weyl/dev/nowledge-mem", branch, baseBranch: "main", hasRemote: true } as Place);

process.env.DUCTER_CLOSE_LOOP_REPAIR = "0";
const seed = startCore({ dataDir, port: 0, push: false, persona, ooSource: noOo, clock, work: { exec, holdingsEveryMs: 0 } });
seed.setRunner(stubRunner(seed));
seed.setPartner({ onTrigger() {} });
seed.settings.set({ language: zh ? "zh" : "en" });
const log = seed.log;

// ---- plus-a and plus-b: merged, a loop ended by the person at 06:45, left working/parked ----
const plus = [
  { id: "plusrfu1", title: w("Plus 年付修复：退款上限", "Plus yearly fix: refund cap"), pr: "nowledge-co/website#11441", summary: w("退款上限的修复已合并（#11441），线上版本已带上。", "The refund-cap fix merged (#11441) and is live.") },
  { id: "plusrfu2", title: w("Plus 年付修复：续费按年", "Plus yearly fix: yearly renewal"), pr: "nowledge-co/website#11389", summary: w("续费按年的修复已合并（#11389），不用再等接手回执。", "The yearly-renewal fix merged (#11389); no acknowledgement is needed.") },
];
for (const [i, t] of plus.entries()) {
  await at(-(3 * HOUR) + i * 7 * MIN);
  log.append({ stream: `task:${t.id}`, origin: "partner", kind: "task_open", body: { taskId: t.id, title: t.title, project: "website", place: place(`ducter/task-${t.id}`), harness: "codex", model: "gpt-6-luna", brief: w("每 45 分钟看一下 Plus 年付的修复，直到合并。", "Check the Plus yearly fix every 45 minutes until it merges.") } });
  seed.tasks.setState(t.id, "working", "hot");
  await at(-(2 * HOUR) + i * 5 * MIN);
  log.append({ stream: `task:${t.id}`, origin: "task", kind: "report", body: { taskId: t.id, state: "done", summary: t.summary, questions: [], evidence: [{ kind: "url", label: w("合并记录", "The merge"), ref: `https://github.com/${t.pr.replace("#", "/pull/")}` }] } });
  await Bun.sleep(30); // the report's own done_claimed lands first
  // The loop ending at 06:45 and the old version's write: working/parked with nothing running.
  log.append({ stream: `task:${t.id}`, origin: "system", kind: "task_loop", body: { taskId: t.id, state: "ended", endedBy: "user", before: "done_claimed", reason: w("等接手回执", "the takeover acknowledgement"), since: iso(-2 * HOUR), by: "rounds" } });
  log.append({ stream: `task:${t.id}`, origin: "system", kind: "task_state", body: { taskId: t.id, attention: "working", residency: "parked" } });
}

// ---- #11389 takeover: an open hand-off over a PR Ducter never watched; a timer waits on it ----
const take = { id: "take11389", title: w("接手 mem#11389 的收尾", "Take over the end of mem#11389"), pr: "nowledge-co/mem#11389" };
await at(-(5 * HOUR));
log.append({ stream: `task:${take.id}`, origin: "partner", kind: "task_open", body: { taskId: take.id, title: take.title, project: "mem", place: place("ducter/task-take11389"), harness: "codex", model: "gpt-6-luna", brief: w("接手并跟进 mem#11389，PR 合并后收尾。", "Take over mem#11389 and finish once its PR merges.") } });
seed.tasks.setState(take.id, "working", "hot");
log.append({ stream: `task:${take.id}`, origin: "task", kind: "report", body: { taskId: take.id, state: "progress", summary: w("已交回，等 #11389 合并。", "Handed back; waiting for #11389 to merge."), questions: [], evidence: [{ kind: "url", label: "PR", ref: `https://github.com/${take.pr.replace("#", "/pull/")}` }] } });
const h = seed.helpers.get(helper.id);
if (h) seed.handoffs.giveLocal({ helper: h, text: w(`请接手 https://github.com/${take.pr.replace("#", "/pull/")}`, `Please take https://github.com/${take.pr.replace("#", "/pull/")}`), fromTask: take.id, fromName: "Ducter" });
log.append({ stream: "channel", origin: "task", kind: "waiter", body: { waiterId: "w-take", reason: w("等 #11389 合并", "waiting for #11389 to merge"), taskId: take.id, state: "armed", wakes: "task", at: iso(-30 * MIN) } });
seed.tasks.setState(take.id, "blocked", "parked");

await at(-30 * MIN);
// The person's words, so the web opens in the conversation's language (D262).
log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w("两个 Plus 年付修复合并了的话，可以关闭了不用等。", "If the two Plus yearly fixes merged, close them; no need to wait.") } });
await Bun.sleep(200);
await seed.stop();

// ---- serve: the old board (before) or the first start of the new version (after) ----
process.env.DUCTER_CLOSE_LOOP_REPAIR = before ? "0" : "1";
const core = startCore({
  dataDir,
  persona,
  push: false,
  ooSource: noOo,
  hostname: process.env.DUCTER_HOST || "127.0.0.1",
  work: before ? { exec, holdingsEveryMs: 0 } : { exec, holdingsEveryMs: HOUR },
});
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
console.log(`[demo] close-loop ${before ? "before" : "after"} at http://127.0.0.1:${core.port}/app#onhand (data: ${dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
