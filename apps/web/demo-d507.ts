// D507: a helper on On hand, as its own sheet with the work it keeps. The author's real helper on hel
// ("Nowledge Mem PR Babysitter", made 2026-11-24 00:47 UTC, its about in his words) in one of three
// shapes (DEMO_HELPER):
//   idle  hel as it stands: the address ready, nothing handed over yet (0 on hand, 0 this week);
//   busy  three PRs his agents handed over: one asks him (comment /test on #10932, research/217), one
//         being fixed on CI (#11030, the Embedding dialog fix hel's task opened), one finished and
//         mergeable, waiting for his merge (#10847);
//   done  as busy, after #10847 merged: it leaves the helper for 今天做完, with the helper's name.
// Beside them his ordinary work (a release-notes result, a settings export at work), so the sheet
// is seen among the rest. Never this machine's gh, oo or Mem: the home's checks answer from a fake.
//   DUCTER_PORT=7506 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_HELPER=busy bun apps/web/demo-d507.ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { Bodies, OwnedSeen, Place } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const shape = process.env.DEMO_HELPER ?? "busy";
const w = (z: string, e: string) => (zh ? z : e);
const scratch = mkdtempSync(join(tmpdir(), "ducter-demo-d507-"));
const dataDir = process.env.DUCTER_DATA_DIR || join(scratch, "data");
mkdirSync(dataDir, { recursive: true });
const persona = { id: "default", name: "Ducter", identity: "" };
const now = Date.now();
const iso = (ms: number) => new Date(now + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const SPACE = "personal-4e742092";
// The helper as hel keeps it (helpers.json), its about in the author's words.
const helper = {
  id: "nowledge-mem-pr-babysitter",
  name: "Nowledge Mem PR Babysitter",
  about: w("用 Codex 接手 Nowledge Mem 的 PR，修复 CI 和评审问题，跟到可合并后通过 Bridge 回信。", "Nowledge Mem PRs, on Codex: fix CI and review comments, follow each until it can merge, answer over Bridge."),
  brief: "Never merge.",
  persona: "default",
  agentId: "ducter-helper-nowledge-mem-pr-babysitter",
  state: "on",
  createdAt: iso(-(shape === "idle" ? 12 * MIN : 26 * HOUR)),
  link: { context: "ducter-helper-nowledge-mem-pr-babysitter-on-hetzner-server", connectionId: "c-demo", spaceId: SPACE },
  mem: "ready",
  said: "ready",
};
writeFileSync(join(dataDir, "helpers.json"), JSON.stringify({ helpers: [helper] }, null, 2));

let shift = 0;
const clock = { now: () => Date.now() + shift, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
// The home's checks (owned PRs, waits) never reach this machine's gh: a fake that answers nothing.
const work = { exec: async () => ({ exitCode: 1, stdout: "" }), ownedEveryMs: 3_600_000 };
const seed = startCore({ dataDir, port: 0, push: false, persona, ooSource: noOo, clock, work });
seed.setRunner(stubRunner(seed));
seed.setPartner({ onTrigger() {} });
seed.settings.set({ language: zh ? "zh" : "en" });
const log = seed.log;
const tick = () => Bun.sleep(15);
const at = async (ms: number) => {
  await Bun.sleep(40);
  shift = ms;
};
const ev = (id: string, b: Omit<Bodies["task_event"], "taskId">) => log.append({ stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, ...b } });
const tool = (id: string, name: string, input: unknown, output = "", ok = true) => ev(id, { role: "tool", tool: { name, input, output, ok } });
const say = (id: string, text: string) => ev(id, { role: "assistant", text });
const report = (id: string, r: Omit<Bodies["report"], "taskId" | "questions"> & { questions?: Bodies["report"]["questions"] }) =>
  log.append({ stream: `task:${id}`, origin: "task", kind: "report", body: { taskId: id, questions: [], ...r } });
const repo = (name: string, branch: string): Place => ({ kind: "repo", device: "local", repoPath: `/root/code/${name}`, branch, baseBranch: "main" });
async function open(id: string, title: string, project: string, place: Place, harness: string, model: string) {
  log.append({ stream: `task:${id}`, origin: "partner", kind: "task_open", body: { taskId: id, title, project, place, harness, model, brief: title } });
  seed.tasks.setState(id, "working", "hot");
  await tick();
}
const zsh = (c: string) => `/bin/zsh -lc '${c}'`;
// A PR the task owns (D483), as the home last saw it.
const owns = (id: string, pr: string, seen: Omit<OwnedSeen, "since">) => {
  log.append({ stream: `task:${id}`, origin: "task", kind: "checkpoint", body: { taskId: id, text: `${pr} open`, owns: [pr] } });
  log.append({ stream: `task:${id}`, origin: "system", kind: "owned_news", body: { taskId: id, pr, news: [], seen: { since: iso(-30 * HOUR), ...seen } } });
};
// Handed over by his Codex through Bridge, to the helper; its claim names the task.
let n = 0;
const handed = (id: string, pr: string, ago: number) => {
  n++;
  const from = { from: "another agent", mine: true, agent: "Codex", selfNamed: true, space: SPACE, helper: helper.id };
  log.append({ stream: "channel", origin: "peer", kind: "bridge_msg", body: { direction: "in", messageId: `m-h${n}`, ...from, sentAt: iso(-ago), text: `https://github.com/${pr.replace("#", "/pull/")}`, linked: true } as never });
  log.append({ stream: "channel", origin: "partner", kind: "bridge_msg", body: { direction: "out", messageId: `m-hc${n}`, to: "another agent", ...from, text: w("接下了。", "On it."), inReplyTo: `m-h${n}`, taskId: id, opId: `hc${n}`, state: "sent" } as never });
};

// ---- his own work around it ----
await at(-(2 * HOUR + 10 * MIN));
await open("t_notes", w("整理本周 mem 的发布说明", "Write this week's mem release notes"), "mem", repo("mem", "ducter/release-notes"), "claude-code", "sonnet");
tool("t_notes", "Bash", { command: "git log --oneline v0.10.121..HEAD", description: "List the commits since the last release" }, "");
await at(-(1 * HOUR + 40 * MIN));
report("t_notes", { state: "done", summary: w("发布说明写好了，按新功能、修复和文档分了三段；草稿 PR #10855。", "The release notes are written in three parts: features, fixes and docs. Draft PR #10855."), evidence: [{ kind: "url", ref: "https://github.com/nowledge-co/mem/pull/10855" }] });
seed.tasks.setState("t_notes", "done", "parked");

if (shape !== "idle") {
  // ---- #10847: finished, mergeable, waiting for his merge (or merged: shape done) ----
  await at(-(26 * HOUR));
  await open("t_10847", "graph_error_response_tests intermittently #8826", "mem", repo("mem", "ducter/graph-error-response-tests"), "codex", "gpt-6-luna");
  handed("t_10847", "nowledge-co/mem#10847", 26 * HOUR);
  tool("t_10847", "commandExecution", zsh("cargo test -p mem-graph graph_error_response -- --test-threads 1"), "test result: ok. 12 passed");
  await at(-(3 * HOUR));
  owns("t_10847", "nowledge-co/mem#10847", { head: "4b52ac6", state: shape === "done" ? "merged" : "open", standing: { at: iso(-3 * HOUR), head: "4b52ac6", approvedBy: ["hawkingrei"], checks: { total: 14, passed: 14, failed: [], pending: [] }, merge: "clean" } });
  report("t_10847", { state: "done", summary: w("#10847 能合并了：14 项检查都过了，hawkingrei 批准了。没有替你合并。", "#10847 can merge: all 14 checks pass and hawkingrei approved. I didn't merge it."), evidence: [{ kind: "url", ref: "https://github.com/nowledge-co/mem/pull/10847" }] });
  seed.tasks.setState("t_10847", "done", "parked");

  // ---- #10932: it asks him (research/217's /test) ----
  await at(-(5 * HOUR));
  await open("t_10932", w("跟进 #10932：Settings 里 Space 切换后列表不刷新", "Follow #10932: the list doesn't refresh after switching Space in Settings"), "mem", repo("mem", "fix/space-switch-refresh"), "codex", "gpt-6-luna");
  handed("t_10932", "nowledge-co/mem#10932", 5 * HOUR);
  owns("t_10932", "nowledge-co/mem#10932", { head: "91d0e2a", state: "open", standing: { at: iso(-40 * MIN), head: "91d0e2a", checks: { total: 14, passed: 12, failed: ["e2e-linux"], pending: [] }, merge: "unstable" } });
  tool("t_10932", "commandExecution", zsh("gh run view 18822 --repo nowledge-co/mem --log-failed"), "e2e-linux: runner lost connection");
  await at(-(38 * MIN));
  log.append({ stream: "channel", origin: "system", kind: "decision", body: { decisionId: "d_10932", taskId: "t_10932", question: w("e2e-linux 是 runner 断线挂的，和改动无关。要我在 #10932 上评论 /test 重跑一遍吗？", "e2e-linux failed on a lost runner, not the change. Shall I comment /test on #10932 to run it again?"), goLabel: w("评论 /test", "Comment /test"), defaultOption: "hold", reversible: false } });
  seed.tasks.setState("t_10932", "needs_you", "parked");

  // ---- #11030: at work on CI ----
  await at(-(48 * MIN));
  await open("t_11030", w("跟进 #11030：自定义 provider 切到 Embedding 时只留一个模型", "Follow #11030: one clean model when a custom provider switches to Embedding"), "mem", repo("mem", "fix/embedding-one-model"), "codex", "gpt-6-luna");
  handed("t_11030", "nowledge-co/mem#11030", 48 * MIN);
  owns("t_11030", "nowledge-co/mem#11030", { head: "c7f1b09", state: "open", standing: { at: iso(-6 * MIN), head: "c7f1b09", checks: { total: 14, passed: 11, failed: ["lint"], pending: ["e2e-linux", "e2e-mac"] }, merge: "unstable" } });
  for (const [m, cmd] of [[-30, "pnpm -C nowledge-graph lint"], [-22, "sed -n 1,80p src/components/settings/embedding-model-selection.ts"], [-12, "pnpm -C nowledge-graph test embedding-model-selection"]] as const) {
    await at(m * MIN);
    tool("t_11030", "commandExecution", zsh(cmd), "");
  }
  await at(-(2 * MIN));
  say("t_11030", w("lint 挂在一个没用的 import 上，删掉了，测试过了，正在 push。", "Lint failed on an unused import; removed it, the tests pass, pushing now."));
}

// ---- his settings export, at work ----
await at(-(14 * MIN));
await open("t_prefs", w("把 Macbook Pro M3 的通用设置导出来", "Export the general settings from the Macbook Pro M3"), "dotfiles", repo("dotfiles", "ducter/general-settings"), "codex", "gpt-6-luna");
tool("t_prefs", "commandExecution", zsh("defaults read -g KeyRepeat"), "");
await at(-(1 * MIN));
say("t_prefs", w("读完了 41 项全局设置，在挑出键盘和触控板的那几项写进 defaults.sh。", "Read 41 global settings; picking out the keyboard and trackpad ones for defaults.sh."));
await at(0);

await Bun.sleep(300);
await seed.stop();

// Serve from a second core over the same Log, as after a restart.
const core = startCore({ dataDir, persona, push: false, ooSource: noOo, hostname: process.env.DUCTER_HOST || "127.0.0.1", work });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
console.log(`[demo] D507 helper on On hand (${zh ? "zh" : "en"}, ${shape}) at http://127.0.0.1:${core.port}/app (data: ${dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
