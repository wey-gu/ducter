// The long-conversation memory eval with fakes (packages/partner/eval/memory): a week-long
// channel, an oracle digest writer, and reachability in place of a model. It checks the pipeline
// (cuts, audit, ledger, roll-up, projection, search); the real-model run is memory/run.ts.
import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { corpus } from "../eval/memory/corpus.ts";
import { buildWorld, fakeReport, grade, oracleWriter, probes, runSpine } from "../eval/memory/lib.ts";

const dir = mkdtempSync(join(tmpdir(), "ducter-memeval-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test("the corpus is sound: every anchor is the user's exact words, every replaced decision exists", () => {
  const keys = new Set<string>();
  for (const l of corpus) {
    if (!("user" in l) && !("ai" in l) && !("resolve" in l)) continue;
    const n = l.note;
    if (!n) continue;
    if (n.anchor) expect("user" in l && l.user.includes(n.anchor)).toBe(true);
    if (n.replaces) expect(keys.has(n.replaces)).toBe(true);
    if (n.key) keys.add(n.key);
  }
  expect(new Set(probes.map((p) => p.type)).size).toBe(11);
});

test("fake run: everything that binds stays in view or one search away, nothing stale, nothing invented", async () => {
  const w = buildWorld(dir);
  const spine = await runSpine(w, oracleWriter(w));
  const r = fakeReport(w, spine);
  console.log(JSON.stringify(r, null, 1));
  // Several parts closed, and the oldest rolled up into an epoch.
  expect(r.digests.segments).toBeGreaterThanOrEqual(4);
  expect(r.digests.epochs).toBeGreaterThanOrEqual(1);
  expect(r.digests.degraded).toBe(0);
  // The spine keeps every probe's evidence in view or one search away; the window alone doesn't.
  expect(r.reach.spine.reachable).toBe(r.reach.spine.n);
  expect(r.reach.spine.inView).toBeGreaterThan(r.reach.window.inView);
  expect(r.byType.verbatim!.spine).toBe(1); // anchors keep the user's words in view
  expect(r.byType.supersession!.spine).toBe(1);
  // The context is far smaller than the whole channel.
  expect(r.sizes.spine).toBeLessThan(r.sizes.full);
  // No replaced decision is still in force; every replacement is.
  expect(r.stale.stillInForce).toBe(0);
  expect(r.stale.newMissing).toBe(0);
  // What is owed at the end is in the ledger or the window.
  expect(r.obligations.found).toEqual(r.obligations.expected);
  // No anchor in a frozen digest is anything but the user's exact words.
  expect(r.falseMemory.badAnchors).toBe(0);
  expect(r.falseMemory.anchors).toBeGreaterThan(5);
});

test("grading: a trap answered concretely is a false memory, an old value as current is stale", () => {
  const p = (id: string) => probes.find((x) => x.id === id)!;
  expect(grade(p("x1"), "我们定的是 bge-m3。", [], 100).label).toBe("false_memory");
  expect(grade(p("x1"), "我们没有讨论过向量模型，只定了先不上向量库。", [], 100).label).toBe("correct");
  expect(grade(p("s1"), "Tauri。", [], 100).label).toBe("stale");
  expect(grade(p("s1"), "原生 SwiftUI（之前的 Tauri 原型已放弃）。", [], 100).label).toBe("correct");
  expect(grade(p("v1"), "你说：向量库先别上，FTS 够用。", [12], 100)).toMatchObject({ label: "correct", badCites: 0 });
  expect(grade(p("v1"), "你说：向量库先别上，FTS 够用。", [400], 100).badCites).toBe(1);
  // The first real run (results/2026-11-09-memory-run1-*): "先不调到 8" is not asserting 8.
  expect(grade(p("s3"), "HawDB 的 compaction 触发阈值现在还是 4。你决定先不调到 8，只修了卡住的 manifest 锁问题（#32）。", [32], 100).label).toBe("correct");
  expect(grade(p("s3"), "现在已经调到 8 了。", [], 100).label).toBe("stale");
  // Run 3: an abstention with words in between was graded a false memory.
  expect(grade(p("x1"), "这个问题没有在我们的对话里讨论过，两个模型名都没有出现，我这边也查不到记录。", [4], 100).label).toBe("correct");
});
