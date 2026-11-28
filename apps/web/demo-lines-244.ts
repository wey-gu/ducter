// research/244 rules 4, 5, 7 and 10: the conversation's lines with their subject in words, an
// offer as one card (Take / Not now, default Not now), a task question that keeps every point on
// its card, a group review drawn as what was done, and the merged summary naming its PRs.
//   DUCTER_PORT=7514 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-lines-244.ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { Bodies, SourceItemRef } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
// DEMO_BEFORE=1: the same day as research/244 found it (a bubble offer, "3 个 PR 已合并", the
// group review read as a question, a four-point task question said with one point, no title on a
// write card), for the before/after pair.
const before = process.env.DEMO_BEFORE === "1";
const w = (z: string, e: string) => (zh ? z : e);
const dataDir = process.env.DUCTER_DATA_DIR || join(mkdtempSync(join(tmpdir(), "ducter-demo-244-")), "data");
const persona = { id: "default", name: "Ducter", identity: "" };
const seed = startCore({ dataDir, port: 0, push: false, persona, ooSource: noOo });
seed.setRunner(stubRunner(seed));
seed.setPartner({ onTrigger() {} });
seed.settings.set({ language: zh ? "zh" : "en" });
const log = seed.log;
const HOUR = 3_600_000;
const ref = (n: number, title: string, where = "nowledge-co/mem"): SourceItemRef => ({ source: "src_github", kind: "github", ref: `${where}#${n}`, label: `#${n}`, where, title, url: `https://github.com/${where}/issues/${n}` });

// research/244 rule 5: a to-do offer as one card, its items by title, Not now by default.
log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w("就这几个，今天做哪个你看着办", "These ones; you pick what to do today") } });
if (before) {
  log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: w("「设置卡的焦点环」和另外两个在你待办里，要我开始吗？", "“Fix the settings card's focus ring” and two more are in your to-dos. Start on them?") } });
} else
log.append({
  stream: "channel",
  origin: "partner",
  kind: "decision",
  body: {
    decisionId: "d_offer",
    question: w("你的待办里有 3 个新的，要我开始吗？", "3 new in your to-dos. Shall I start them?"),
    goLabel: w("接下", "Take them"),
    holdLabel: w("现在不", "Not now"),
    defaultOption: "hold",
    defaultAt: new Date(Date.now() + 10 * HOUR).toISOString(),
    reversible: false,
    offer: true,
    src: { kind: "offer", item: ref(11115, w("设置卡的焦点环", "Fix the settings card's focus ring")), items: [
      { item: ref(11115, w("设置卡的焦点环", "Fix the settings card's focus ring")) },
      { item: ref(11108, w("设置卡的滚动", "Fix the settings card's scroll")) },
      { item: ref(11156, w("登录后回到原页面", "Sign in returns to the right page")) },
    ] },
  },
});

// research/244 rule 7: an already-answered group review is a record, never a question.
log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w("那就一起过目，留言吧", "Review them together and comment, then") } });
log.append({
  stream: "channel",
  origin: "partner",
  kind: "decision",
  body: {
    decisionId: "d_grp",
    question: w("在这 2 个下面留言？", "Comment on these 2?"),
    ...(before ? {} : { record: w(
      "在「设置卡的标签」（#11108）、「设置卡的滚动」（#11156）下留了言：「Fixed in #11163.」",
      "Commented on “Fix the settings card's label” (#11108), “Fix the settings card's scroll” (#11156): “Fixed in #11163.”",
    ) }),
    goLabel: w("留言", "Comment"),
    holdLabel: w("先不留", "Not now"),
    defaultOption: "hold",
    reversible: false,
    src: { kind: "group_review", item: ref(11108, w("设置卡的标签", "Fix the settings card's label")), groupId: "g1", items: [
      { item: ref(11108, w("设置卡的标签", "Fix the settings card's label")), text: "Fixed in #11163." },
      { item: ref(11156, w("设置卡的滚动", "Fix the settings card's scroll")), text: "Fixed in #11163." },
    ] },
  },
});
log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d_grp", option: "go", by: "user" } });

// research/244 rule 4: the merged summary names its PRs, never "4 个 PR 已合并".
log.append({
  stream: "channel",
  origin: "partner",
  kind: "ai_msg",
  body: {
    text: before
      ? w("3 个 PR 已合并，相关的事都收了尾。", "3 pull requests merged; everything they held is wrapped up.")
      : w(
          "「设置卡的标签」「设置卡的滚动」「迁移页的旧数据」都合并了，相关的事都收了尾。",
          "“Fix the settings card's label”, “Fix the settings card's scroll” and “Migrate the old rows” merged; everything around them is wrapped up.",
        ),
    settled: { prs: 3, issues: 0, refs: ["nowledge-co/mem#11230", "nowledge-co/mem#11163", "nowledge-co/mem#10500"], names: [
      { ref: "nowledge-co/mem#11230", title: w("设置卡的标签", "Fix the settings card's label") },
      { ref: "nowledge-co/mem#11163", title: w("设置卡的滚动", "Fix the settings card's scroll") },
      { ref: "nowledge-co/mem#10500", title: w("迁移页的旧数据", "Migrate the old rows") },
    ] },
  },
});

// research/244 rule 5: a task's question of four points said in the partner's own words: the
// card keeps the task's own question, and the words only introduce it.
log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w("PR #11230 那个远程访问设置，按你说的接着弄", "Continue the remote-access settings in PR #11230") } });
const q = w(
  "PR #11230 的远程访问设置还有四点要定：\n1. 移除「本机访问也需要密钥」这个开关吗？\n2. 同事建议的提示加在哪一页？\n3. 「远程访问」那段文案改成什么？\n4. 要不要补一个本机访问的测试？",
  "PR #11230 still has four things to decide:\n1. Remove the “local access needs a key too” switch?\n2. Which page gets the hint a teammate suggested?\n3. What should the “remote access” copy say?\n4. Should there be a test for local access?",
);
log.append({ stream: "channel", origin: "partner", kind: "task_open", body: { taskId: "t_remote", title: w("远程访问设置：按方案改 #11230", "Remote access settings: the plan for #11230"), project: "mem", place: { kind: "none" }, harness: "codex", brief: "x" } });
const one = w("按同事的建议，移除「本机访问也需要密钥」这个开关吗？", "Remove the “local access needs a key too” switch, as the teammate suggested?");
log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: "d_q", taskId: "t_remote", question: before ? one : q, goLabel: w("继续", "Continue"), defaultOption: "go", reversible: true } });
if (before) log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: one, decisionId: "d_q" } });

// research/244 rule 4: a write card names its to-do by its title.
log.append({
  stream: "channel",
  origin: "partner",
  kind: "decision",
  body: {
    decisionId: "d_write",
    question: before
      ? w("在 nowledge-co/mem#11115 下留言？", "Comment on nowledge-co/mem#11115?")
      : w("在 nowledge-co/mem#11115「设置卡的焦点环」下留言？", "Comment on nowledge-co/mem#11115 “Fix the settings card's focus ring”?"),
    goLabel: w("留言", "Comment"),
    holdLabel: w("暂不留言", "Not now"),
    defaultOption: "hold",
    reversible: false,
    src: { kind: "write", item: ref(11115, w("设置卡的焦点环", "Fix the settings card's focus ring")), text: "PR #11230 is up and waiting for review.", taskId: "t_remote" },
  },
});

await Bun.sleep(300);
await seed.stop();

const core = startCore({ dataDir, persona, push: false, ooSource: noOo, hostname: process.env.DUCTER_HOST || "127.0.0.1", port: Number(process.env.DUCTER_PORT ?? 7514) });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
console.log(`[demo] lines 244 (${zh ? "zh" : "en"}) at http://127.0.0.1:${core.port}/app (data: ${dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
