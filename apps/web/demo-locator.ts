// D526: the locator's marks, as a demo core both clients read: the author's own PR review (#11105),
// handed over by the partner at 15:09, with three landmarks (DEMO_MANY unset: the brief, the result,
// the person's reply) or the whole afternoon (DEMO_MANY=1: an ask that still waits, notes, the
// partner's words, more results). Never this machine's gh or accounts.
//   DUCTER_PORT=7518 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh DEMO_MANY=1 bun apps/web/demo-locator.ts
// Then open http://127.0.0.1:7518/#task=t_rv and point at the rail at the transcript's right edge.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { Bodies } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const many = process.env.DEMO_MANY === "1";
const w = (z: string, e: string) => (zh ? z : e);
const dataDir = process.env.DUCTER_DATA_DIR || join(mkdtempSync(join(tmpdir(), "ducter-demo-locator-")), "data");
let shift = 0;
const clock = { now: () => Date.now() + shift, setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };
const core = startCore({ dataDir, port: Number(process.env.DUCTER_PORT ?? 7518), push: false, persona: { id: "default", name: "Ducter", identity: "" }, ooSource: noOo, clock });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
const log = core.log;
const id = "t_rv";
const stream = `task:${id}`;
const today = new Date();
// Each event at its time today (a step 20 s after the last when none is given).
let at = 0;
const to = (h: number, m: number) => (at = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m).getTime());
const put = (origin: "task" | "partner" | "user" | "system", kind: string, body: unknown) => {
  shift = at - Date.now();
  log.append({ stream, origin, kind, body } as never);
  at += 20_000;
};
const work = (n: number) => {
  for (let i = 0; i < n; i++) put("task", "task_event", { taskId: id, role: "tool", tool: { name: "Bash", input: { command: `gh pr diff 11105 --patch | head -${200 + i}`, description: "Read the diff" }, output: "ok", ok: true } });
};
const report = (state: Bodies["report"]["state"], summary: string) => put("task", "report", { taskId: id, state, summary, questions: [], evidence: [] });
const say = (from: "user" | "partner", text: string) => put(from, "task_event", { taskId: id, role: "user", from, text });

to(15, 9);
put("partner", "task_open", {
  taskId: id,
  title: w("走查 #11105 并修掉发现的问题", "Review #11105 and fix what it finds"),
  project: "tidb",
  place: { kind: "repo", device: "MacBook", repoPath: "/Users/weyl/dev/tidb", branch: "ducter/review-11105", baseBranch: "master" },
  harness: "claude-code",
  model: "claude-opus-5-5",
  brief: w(
    "用户原话：「接，这个用 /lgtm 的方式过一下 #11105，有问题就直接修。」\n走查 #11105：读完 diff，跑相关测试，发现的问题直接修在分支上，最后告诉他结论。",
    'The user said: "Take this, run #11105 through the /lgtm way, fix anything you find."\nReview #11105: read the diff, run its tests, fix what you find on the branch, then tell him the verdict.',
  ),
});
core.tasks.setState(id, "working", "hot");
work(6);
to(15, 45);
say("partner", "等到了：「CI 跑完了」。接着做。");
work(3);
report("done", w("已完成 #11105 走查并修复两项问题，CI 全绿，等你说合不合。", "Reviewed #11105 and fixed two problems; CI is green, merge when you say."));
to(15, 49);
say("user", w("可以，我们自己评论 /lgtm 吧，然后可以合了", "OK, let's comment /lgtm ourselves, then it can merge"));
work(2);
if (many) {
  to(15, 52);
  report("progress", w("评论了 /lgtm，在等 Prow 的合并队列", "Commented /lgtm; waiting in Prow's merge queue"));
  to(16, 5);
  say("partner", "等到了：「合并队列有动静」。接着做。");
  work(2);
  to(16, 12);
  say("partner", "等到了：「合并队列有动静」。接着做。");
  work(2);
  to(16, 20);
  report("needs_input", w("Prow 还要一个 /approve，找谁来批？", "Prow wants one more /approve: who should approve it?"));
  to(16, 24);
  say("user", w("找 Weizhen 看一下", "Ask Weizhen to look"));
  work(2);
  to(16, 58);
  say("partner", w("Weizhen 批了，接着把它合进去", "Weizhen approved it; go on and merge it"));
  work(2);
  to(17, 3);
  report("done", w("#11105 已合进 master，分支删掉了", "#11105 is merged into master and its branch deleted"));
  to(17, 6);
  say("user", w("顺便看一下 #11112 的测试为什么老是挂", "While you're there, see why #11112's tests keep failing"));
  work(3);
  to(17, 20);
  report("progress", w("#11112 的失败是一个假时钟没推进，正在修", "#11112 fails because a fake clock never advances; fixing it"));
  to(17, 34);
  report("needs_input", w("#11112 的修法要改公共接口，要我直接改吗？", "Fixing #11112 changes a public interface: shall I just change it?"));
  core.tasks.setState(id, "needs_you", "hot");
}
shift = 0;
console.log(`[demo] locator: http://127.0.0.1:${core.port}/#task=${id}`);
