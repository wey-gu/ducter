// D591: the limit card's line never leaves its share alone on a line: the share stays glued to the
// word before it (English) or to the two characters before its bracket (Chinese).
import { expect, test } from "bun:test";
import { glueTail, usageWords } from "../src/i18n-usage.ts";

const fill = (s: string, ...a: string[]) => a.reduce((x, v) => x.replace("%s", v), s);

test("the share and what is before it are one piece; the rest is untouched", () => {
  const zh = fill(usageWords.zh["usage.why"]!, "Claude Code", "跑完 WAL 基准测试，给出 p99", "46%");
  expect(glueTail(zh, "46%")).toEqual(["这周 Claude Code 用得最多的是「跑完 WAL 基准测试，给出 p9", "9」（46%）"]);
  const zhThis = fill(usageWords.zh["usage.why.this"]!, "Claude Code", "46%");
  expect(glueTail(zhThis, "46%")[1]).toBe("任务（46%）");
  const en = fill(usageWords.en["usage.why"]!, "Claude Code", "Run the WAL bench and report the p99", "46%");
  expect(glueTail(en, "46%")).toEqual(["Most of Claude Code this week went to “Run the WAL bench and report the ", "p99” (46%)"]);
  expect(glueTail(fill(usageWords.en["usage.why.this"]!, "Codex", "8%"), "8%")[1]).toBe("week (8%)");
  for (const [k, v] of [["zh", zh], ["en", en]] as const) expect(glueTail(v, "46%").join(""), k).toBe(v);
});
