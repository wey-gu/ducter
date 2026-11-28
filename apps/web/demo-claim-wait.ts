// research/247 Brief A: a claim waits for its call, and information stays in the card. The same
// morning in two shapes: before, the review's record says all three comments went out and a
// settled summary says the merges again; after, the record names only the two that went, one
// failed line waits with 再试一次, and the merge and the run's cost sit on the living card.
//   DUCTER_PORT=7527 DUCTER_DATA_DIR=$(mktemp -d) DEMO_LANG=zh bun apps/web/demo-claim-wait.ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";
import type { Bodies, SourceItemRef } from "@ducter/protocol";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const before = process.env.DEMO_BEFORE === "1";
const w = (z: string, e: string) => (zh ? z : e);
const dataDir = process.env.DUCTER_DATA_DIR || join(mkdtempSync(join(tmpdir(), "ducter-demo-claim-")), "data");
const persona = { id: "default", name: "Ducter", identity: "" };
const seed = startCore({ dataDir, port: 0, push: false, persona, ooSource: noOo });
seed.setRunner(stubRunner(seed));
seed.setPartner({ onTrigger() {} });
seed.settings.set({ language: zh ? "zh" : "en" });
const log = seed.log;
const ref = (n: number, title: string): SourceItemRef => ({ source: "src_github", kind: "github", ref: `nowledge-co/mem#${n}`, label: `#${n}`, where: "nowledge-co/mem", title, url: `https://github.com/nowledge-co/mem/issues/${n}` });

const label = w("设置卡的标签", "Fix the settings card's label");
const scroll = w("设置卡的滚动", "Fix the settings card's scroll");
const oldRows = w("迁移页的旧数据", "Migrate the old rows");
const msg = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w("这三个都弄完了，一起过目，留言吧", "All three are done — review them together and comment") } });

// research/247 Brief A, rule 1: before, the record claims all three comments; after, only the two
// whose writes went out. The failed one is its own card.
const record = before
  ? w(
      "在「设置卡的标签」（#11108）、「设置卡的滚动」（#11156）、「迁移页的旧数据」（#10500）下留了言：「Fixed in #11163.」",
      "Commented on “Fix the settings card's label” (#11108), “Fix the settings card's scroll” (#11156), “Migrate the old rows” (#10500): “Fixed in #11163.”",
    )
  : w(
      "在「设置卡的标签」（#11108）、「设置卡的滚动」（#11156）下留了言：「Fixed in #11163.」",
      "Commented on “Fix the settings card's label” (#11108), “Fix the settings card's scroll” (#11156): “Fixed in #11163.”",
    );
log.append({
  stream: "channel",
  origin: "partner",
  kind: "decision",
  body: {
    decisionId: "d_review",
    question: w("在这 3 个下面留言？", "Comment on these 3?"),
    record,
    goLabel: w("留言", "Comment"),
    holdLabel: w("先不留", "Not now"),
    defaultOption: "hold",
    reversible: false,
    src: { kind: "group_review", item: ref(before ? 11108 : 11108, label), groupId: "g1", items: (before ? [ref(11108, label), ref(11156, scroll), ref(10500, oldRows)] : [ref(11108, label), ref(11156, scroll)]).map((item) => ({ item, text: "Fixed in #11163." })) },
  },
});
log.append({ stream: "channel", origin: "user", kind: "decision_resolved", body: { decisionId: "d_review", option: "go", by: "user" } });
if (!before) {
  const failed = ref(10500, oldRows);
  log.append({
    stream: "channel",
    origin: "partner",
    kind: "decision",
    body: {
      decisionId: "d_review_failed",
      question: w("有 1 个没留上，要再试一次吗？", "1 didn't go through. Try again?"),
      goLabel: w("再试一次", "Try again"),
      holdLabel: w("先不留", "Not now"),
      defaultOption: "hold",
      reversible: false,
      src: { kind: "group_review_failed", item: failed, groupId: "g1", failed: [{ item: failed, text: "Fixed in #11163.", op: "comment", why: "gh: Server Error (HTTP 500)" }] },
    },
  });
}

// Before: the merged summary as a settled line, naming the same merges a second time.
if (before)
  log.append({
    stream: "channel",
    origin: "partner",
    kind: "ai_msg",
    body: {
      text: w("「设置卡的标签」「设置卡的滚动」「迁移页的旧数据」都合并了，相关的事都收了尾。", "“Fix the settings card's label”, “Fix the settings card's scroll” and “Migrate the old rows” merged; everything around them is wrapped up."),
      settled: { prs: 3, issues: 0, refs: ["nowledge-co/mem#11108", "nowledge-co/mem#11156", "nowledge-co/mem#10500"], names: [] },
    },
  });

// The living card under that message: after, the merge and the run's real cost as their own fact.
log.append({
  stream: `task:t_card`,
  origin: "system",
  kind: "task_open",
  body: { taskId: "t_card", title: w("设置卡的三处修正", "Three fixes to the settings card"), project: "mem", place: { kind: "none" }, harness: "codex", brief: "x" },
});
log.append({
  stream: "channel",
  origin: "system",
  kind: "subject_card",
  body: {
    card: {
      key: "pr:nowledge-co/mem#11163",
      msgSeq: msg.seq,
      title: w("设置卡的三处修正", "Three fixes to the settings card"),
      state: "done",
      line: w("PR #11163 合并了", "PR #11163 merged"),

      took: 17 * 60_000,
      taskId: "t_card",
      at: new Date().toISOString(),
    } satisfies Bodies["subject_card"]["card"],
  },
});

// A routine's first run's real cost: an information-only fact, its own line, never a message.
const msg2 = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: w("日报今天也照旧", "The daily note again today") } });
log.append({
  stream: `task:t_daily`,
  origin: "system",
  kind: "task_open",
  body: { taskId: "t_daily", title: w("每天早上的日报", "The morning note, every day"), project: "", place: { kind: "none" }, harness: "codex", brief: "x" },
});
log.append({
  stream: "channel",
  origin: "system",
  kind: "subject_card",
  body: {
    card: {
      key: "task:t_daily",
      msgSeq: msg2.seq,
      title: w("每天早上的日报", "The morning note, every day"),
      state: "working",
      line: w("在写今天的日报", "Writing today's note"),
      ...(before ? {} : { info: w("第一次运行用了 102K token。", "Its first run cost 102K tokens.") }),
      taskId: "t_daily",
      at: new Date().toISOString(),
    } satisfies Bodies["subject_card"]["card"],
  },
});

await Bun.sleep(300);
await seed.stop();

const core = startCore({ dataDir, persona, push: false, ooSource: noOo, hostname: process.env.DUCTER_HOST || "127.0.0.1", port: Number(process.env.DUCTER_PORT ?? 7527) });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
console.log(`[demo] claim-wait (${zh ? "zh" : "en"}${before ? ", before" : ""}) at http://127.0.0.1:${core.port}/app (data: ${dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
