// A demo core for D458 (research/199): the morning note with offers from past the accounts: what a
// finished task implies next, what Mem remembers that is timely, a thing the person said they'd get
// to. Each names where it came from and has one Go; none needs the person. Synthetic content.
//   DUCTER_PORT=7799 DUCTER_DATA_DIR=/tmp/x DEMO_LANG=zh bun apps/web/demo-offers-wider.ts
import { startCore, stubRunner } from "./demo-core.ts";
import { noOo } from "./demo-oo.ts";

const zh = (process.env.DEMO_LANG ?? "zh") === "zh";
const core = startCore({ ooSource: noOo, persona: { id: "default", name: "Ducter", identity: "" }, hostname: process.env.DUCTER_HOST || "127.0.0.1" });
core.setRunner(stubRunner(core));
core.setPartner({ onTrigger() {} });
core.settings.set({ language: zh ? "zh" : "en" });
const log = core.log;
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const now = Date.now();
const rows = [
  {
    kind: "next_step",
    src: "task",
    what: "WAL group commit",
    at: now - 18 * H,
    zh: ["WAL group commit 合进去了，副本的 fsync 批量（#10562）还开着，要接着做吗？", "从 11 月 20 日做完的「WAL group commit」想到的", "接着做"],
    en: ["WAL group commit is merged; batching fsync for replicas (#10562) is still open. Pick it up?", "From “WAL group commit”, done Nov 20", "Pick it up"],
  },
  {
    kind: "remembered",
    src: "mem",
    what: "出差订座偏好",
    at: now - 50 * 24 * H,
    zh: ["周五 NH 920 还没选座。你说过出差要靠窗，要我看看还有哪些靠窗的位置吗？", "从你 10 月 2 日记下的想到的", "看看座位"],
    en: ["Friday's NH 920 has no seat yet. You like a window seat on trips; want me to see which are left?", "From what you noted on Oct 2", "See the seats"],
  },
  {
    kind: "loose_end",
    src: "you",
    what: "回头看看 Weizhen 那个 PR #10559 的 review 意见",
    at: now - 50 * H,
    zh: ["你前天说回头看看 Weizhen 在 PR #10559 上的 review 意见，要我先理一下吗？", "从你 11 月 19 日说的话想到的", "理一下"],
    en: ["Two days ago you said you'd look at Weizhen's review on PR #10559. Want me to sort the comments first?", "From what you said on Nov 19", "Sort them"],
  },
  {
    kind: "remembered",
    src: "mem",
    what: "HawDB planner join order cost model",
    at: now - 9 * 24 * H,
    zh: ["join order 的代价模型和 Codex 聊到一半，cardinality 估计还没改，要接着做吗？", "从你和 Codex 11 月 12 日的对话想到的", "接着做"],
    en: ["You and Codex left the join-order cost model halfway; cardinality estimates aren't done. Pick it up?", "From your conversation with Codex on Nov 12", "Pick it up"],
  },
] as const;
const finds = rows.map((r, i) => {
  const [text, origin, go] = zh ? r.zh : r.en;
  return { findId: `fw${i}`, kind: r.kind, text, origin, how: [{ src: r.src, what: r.what, at: iso(r.at) }], decisionId: `dw${i}`, goLabel: go, offer: true };
});
log.append({ stream: "channel", origin: "partner", kind: "finds", body: { noteId: "nw", rung: "morning", opening: zh ? "早。" : "Morning.", finds } as never });
for (const f of finds) log.append({ stream: "channel", origin: "partner", kind: "decision", body: { decisionId: f.decisionId, question: f.text, goLabel: f.goLabel, defaultOption: "hold", reversible: false, findId: f.findId, offer: true } });

console.log(`[demo] up at http://127.0.0.1:${core.port}/app (data: ${core.dataDir})`);
process.on("SIGINT", async () => {
  await core.stop();
  process.exit(0);
});
