// D456: the same cases as apps/desktop/internal/views/loosefind_test.go, so the Mac and the web
// find the same tasks for the same words.
import { expect, test } from "bun:test";
import { looseMatch } from "../src/fuzzy.ts";

const cases: [string, string, string, boolean][] = [
  ["compactoin", "compaction 调度器改成按层限流", "compaction 调度器改成按层限流", true],
  ["compcation", "l0 compaction 卡住不动", "L0 compaction 卡住不动", true],
  ["wgc", "wal 的 group commit", "WAL 的 group commit", true],
  ["lruk", "block cache 换成 lru-k", "block cache 换成 LRU-K", true],
  ["bcl", "block cache 换成 lru-k", "block cache 换成 LRU-K", true],
  ["blom", "bloom filter 误判率太高", "bloom filter 误判率太高", false],
  ["wal", "hawdb 重启后丢数据", "hawdb 重启后丢数据", false],
  ["cmpctn", "compaction", "compaction", false],
  ["xyz", "range scan 基准", "range scan 基准", false],
];

test.each(cases)("looseMatch(%p) in %p", (word, hay, title, want) => {
  expect(looseMatch(word, hay, title)).toBe(want);
});
