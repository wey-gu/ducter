// A demo core for D482: the two conversation screens the author read on 2026-11-23, in the same
// shapes and lengths as his real home and in invented words (the export stays outside git in
// `.shots/`). The morning note: 早。, an offer from a done task whose title a source had cut, its
// GitHub evidence with a long issue title, the day's to-do picks, and the week's noted line; then a
// task's ask whose default holds (好，现在跑一次) and one whose default goes in 25 minutes.
//   DUCTER_PORT=7482 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh [DEMO_VOICE=old] bun apps/web/demo-d482.ts
// DEMO_VOICE=old writes the offer as the spotter's old prompt wrote it (the before shots).
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import { taskOrigin } from "../../packages/core/src/proactive/wider.ts";
import { cutAtWord } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const old = process.env.DEMO_VOICE === "old";
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
const log = core.log;
const tick = () => Bun.sleep(30);
const H = 3_600_000;
const now = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();

// The done task, its title cut by its source (the real one is 78 letters, cut at 42 with "…").
const doneTitle = "A partially failed Tagset rebuild run…";
const issueTitle = "A partially failed Tagset rebuild run stays hidden under every Project lens";
const origin = taskOrigin({ title: doneTitle, updatedAt: iso(now - 9 * H) } as never, Intl.DateTimeFormat().resolvedOptions().timeZone, "done");
const offer = old
  ? { zh: "#10731 已合并，但没有提到修复 #10418。可以检查 #10418 是否仍需处理并补上后续修复。", en: "#10731 is merged but doesn't mention fixing #10418. You could check whether #10418 still needs work and add a follow-up fix." }
  : { zh: "#10731 合进去了，但它没说修好了 #10418。要我看看 #10418 还差什么，接着补上吗？", en: "#10731 is merged, but it doesn't say it fixed #10418. Want me to check what #10418 still needs and finish it?" };
const finds = [
  {
    findId: "f482a",
    kind: "next_step",
    text: zh ? offer.zh : offer.en,
    origin: zh ? origin.zh : origin.en,
    how: [
      { src: "task", what: cutAtWord(doneTitle, 80), at: iso(now - 9 * H) },
      { src: "github", what: `#10418 ${issueTitle}`, at: iso(now - 55 * 60_000), url: "https://github.com/example-org/tags/issues/10418" },
    ],
    decisionId: "d482a",
    goLabel: zh ? "接着处理" : "Pick it up",
    offer: true,
  },
  {
    findId: "f482b",
    kind: "todos",
    text: zh ? "昨天替你清掉了 2 个。今天能替你清掉这 3 个。" : "Cleared 2 for you yesterday. I can clear these 3 for you today.",
    how: [
      { what: "Docs: the Space switcher still says Workspace in two places", from: "example-org/tags#10433", at: iso(now - 30 * H) },
      { what: "Settings › Labels loses its scroll position after a rename", from: "example-org/tags#10427", at: iso(now - 50 * H) },
      { what: "整理 11 月的发票，报销截止前交给财务", from: "Obsidian", at: iso(now - 70 * H) },
    ],
    decisionId: "d482b",
    goLabel: zh ? "交给 Ducter" : "Hand them to Ducter",
    offer: true,
  },
  {
    findId: "f482c",
    kind: "loose_end",
    text: zh ? "你周三说回头看看 Weizhen 在 #10559 上的 review 意见。要我先把意见理成一份清单吗？" : "On Wednesday you said you'd look at Weizhen's review on #10559. Want me to sort the comments into a list first?",
    origin: zh ? "从你 11 月 19 日说的话想到的" : "From what you said on Nov 19",
    how: [{ src: "you", what: zh ? "回头看看 Weizhen 那个 PR #10559 的 review 意见" : "look at Weizhen's review on PR #10559 later", at: iso(now - 98 * H) }],
    decisionId: "d482c",
    goLabel: zh ? "理一下" : "Sort them",
    offer: true,
  },
];
log.append({ stream: "channel", origin: "partner", kind: "finds", body: { noteId: "n482", rung: "morning", opening: zh ? "早。" : "Morning.", finds, learned: { count: 5 } } as never });
for (const f of finds)
  log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: f.decisionId, question: f.text, goLabel: f.goLabel, defaultOption: "hold", reversible: false, findId: f.findId, offer: true } });
await tick();

// The author's card: a task in rounds late for its round (D427's keeper: its default holds, Go
// runs a round now), then a task's ask whose default goes in a while.
const loopTitle = zh ? "持续评审 example-org 的 PR，并在每轮结束后把结论贴回去" : "Keep reviewing example-org's PRs and post the verdict after each round";
log.append({ stream: "task:t482_loop", origin: "partner", kind: "task_open", body: { taskId: "t482_loop", title: loopTitle, project: "", place: { kind: "none" }, harness: "claude-code", brief: loopTitle } });
core.tasks.setState("t482_loop", "working", "hot");
const late = zh ? "「持续评审 example-org 的 PR」该 9:00 跑一轮，已经晚了 12 分钟：还没开始。" : "“Keep reviewing example-org's PRs” was due for a round at 9:00 and is 12 min late: it hasn't started yet.";
log.append({ stream: "channel", origin: "system", kind: "decision", body: { decisionId: "d482_loop", question: late, goLabel: zh ? "现在跑一次" : "Run it now", defaultOption: "hold", reversible: true, loop: { taskId: "t482_loop" } } });
await tick();
const a = zh
  ? { title: "mem：rebase 到 main", q: "main 上多了 4 个提交，rebase 后再提 PR？", said: "main 上多了 4 个提交，和这次的改动没有冲突。我 rebase 一下再提 PR，行吗？", go: "rebase" }
  : { title: "mem: rebase onto main", q: "main has 4 new commits. Rebase, then open the PR?", said: "main has 4 new commits, none touching this change. I'll rebase and then open the PR, OK?", go: "Rebase" };
log.append({ stream: "task:t482_rb", origin: "partner", kind: "task_open", body: { taskId: "t482_rb", title: a.title, project: "", place: { kind: "none" }, harness: "claude-code", brief: a.q } });
core.tasks.setState("t482_rb", "working", "hot");
log.append({ stream: "task:t482_rb", origin: "task", kind: "report", body: { taskId: "t482_rb", state: "needs_input", summary: a.q, questions: [{ id: "q", text: a.q, blocking: true, default: a.go, reversible: true }], evidence: [] } });
await tick();
const rb = log.read({ kinds: ["decision"] }).at(-1)!.body as { decisionId: string };
log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: a.said, decisionId: rb.decisionId } });
await tick();
core.living.render();

console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
