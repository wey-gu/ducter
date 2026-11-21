// D303: rich answers. The block format the partner writes, its plain form, and the drawing model
// both clients share (the Go port passes fixtures/rich.json too: internal/protocol/rich_test.go).
import { describe, expect, test } from "bun:test";
import fixture from "../fixtures/rich.json" with { type: "json" };
import { build, RICH_REPLIES } from "../fixtures/rich-cases.ts";
import { chartScale, parseRich, plainOf, richModel, splitRich, validateRich, wordsOnly } from "../src/rich.ts";

describe("rich answers (D303)", () => {
  test("the fixture is what the model gives (rerun fixtures/rich-cases.ts after a change)", () => {
    expect(JSON.parse(JSON.stringify(build()))).toEqual(fixture as never);
  });

  test("every reply keeps plain words that read fine without the block", () => {
    for (const r of RICH_REPLIES) {
      const { text, ui, dropped } = parseRich(r.src, r.lang);
      expect(dropped).toEqual([]);
      expect(ui.length).toBe(1);
      // No JSON, no fence: a chat app, a push or a copy shows sentences and lines.
      expect(text).not.toMatch(/[{}]|```|ducter-ui/);
      expect(text).toContain(ui[0]!.plain);
      expect(wordsOnly(text, ui)).not.toContain(ui[0]!.plain);
    }
  });

  test("a table reads as one line per row, in the reply's language", () => {
    const b = validateRich({ type: "table", columns: ["", "Mac mini", "MacBook Air"], rows: [["价格", "¥4,499", "¥7,999"], ["带出门", "", "可以"]] });
    expect(plainOf(b, "zh")).toBe("- 价格：Mac mini ¥4,499，MacBook Air ¥7,999\n- 带出门：MacBook Air 可以");
    expect(plainOf(b, "en")).toBe("- 价格: Mac mini ¥4,499, MacBook Air ¥7,999\n- 带出门: MacBook Air 可以");
    expect(plainOf(b, "zh-Hant")).toContain("：");
  });

  test("the schema and its limits", () => {
    const bad = (o: unknown) => expect(() => validateRich(o)).toThrow();
    bad({ type: "pie" });
    bad({ type: "table", columns: ["one"], rows: [["a"]] });
    bad({ type: "table", columns: ["a", "b"], rows: [["x"]] });
    bad({ type: "chart", kind: "bar", points: [{ label: "a", value: 1 }, { label: "b", value: 2 }] }); // no summary
    bad({ type: "chart", kind: "bar", summary: "s", points: [{ label: "a", value: "3" }, { label: "b", value: 2 }] }); // a number as text
    bad({ type: "chart", kind: "bar", summary: "s", points: [{ label: "a", value: 1 }] });
    bad({ type: "checklist", items: [] });
    bad({ type: "choices", options: ["only one"] });
    bad({ type: "choices", options: ["a", "a"] });
    bad({ type: "choices", options: ["a", "x".repeat(41)] });
    expect(validateRich({ type: "choices", options: [" ducter ", "hawdb"] })).toEqual({ type: "choices", options: ["ducter", "hawdb"] });
    expect(validateRich({ type: "checklist", items: ["a"], tell: "yes" })).toEqual({ type: "checklist", items: ["a"] });
  });

  test("a bad block is left out and said; a message that would be empty keeps its JSON as code", () => {
    const r = parseRich("Before.\n```ducter-ui\n{nope\n```\nAfter.", "en");
    expect(r).toEqual({ text: "Before.\n\nAfter.", ui: [], dropped: [{ error: "not valid JSON" }], pins: [] });
    const only = parseRich('```ducter-ui\n{"type":"x"}\n```', "en");
    expect(only.text).toBe('```\n{"type":"x"}\n```');
    // At most one choices block, at most three blocks.
    const two = parseRich('```ducter-ui\n{"type":"choices","options":["a","b"]}\n```\n```ducter-ui\n{"type":"choices","options":["c","d"]}\n```', "en");
    expect(two.ui.length).toBe(1);
    expect(two.dropped.length).toBe(1);
  });

  test("ordinary code fences are left alone", () => {
    const src = "Run this:\n\n```sh\nbun test\n```";
    expect(parseRich(src, "en")).toEqual({ text: src, ui: [], dropped: [], pins: [] });
  });

  test("an older home's message (no ui) is just words; a newer kind falls back to its plain text", () => {
    expect(splitRich("Hi.", undefined)).toEqual([{ words: "Hi." }]);
    expect(splitRich("A\n\n- x", [{ type: "map", plain: "- x" } as never])).toEqual([{ words: "A\n\n- x" }]);
  });

  test("D462: a fence after words on the same line, and a valid block written bare on its own line, are blocks", () => {
    const glued = parseRich('Here is your list.```ducter-ui\n{"type":"checklist","items":["Tag it","Notes"]}\n```', "en");
    expect(glued.ui.map((b) => b.type)).toEqual(["checklist"]);
    expect(glued.text).not.toMatch(/```|[{}]/);
    expect(glued.text.startsWith("Here is your list.")).toBe(true);
    const bare = parseRich('可以，点下面这张卡片一步步来。\n{"type":"lend"}', "zh");
    expect(bare.ui.map((b) => b.type)).toEqual(["lend"]);
    expect(bare.text).not.toMatch(/[{}]/);
    const only = parseRich('{"type":"checklist","items":["护照","充电宝"],"pin":true}', "zh");
    expect(only.ui.map((b) => b.type)).toEqual(["checklist"]);
    expect(only.pins.length).toBe(1);
    // Not a valid block, or JSON inside a sentence: the words stay as they are.
    for (const s of ['{"type":"map","x":1}', 'Send {"type":"lend"} to the API.', '{"type":"table"}'])
      expect(parseRich(s, "en")).toMatchObject({ text: s, ui: [], dropped: [] });
  });

  test("the chart's scale is round and starts at zero", () => {
    expect(chartScale([5, 8, 3, 6, 9, 2, 1])).toEqual({ lo: 0, hi: 10, step: 2 });
    expect(chartScale([18.5, 26.4])).toEqual({ lo: 0, hi: 30, step: 10 });
    expect(chartScale([-3, 7])).toEqual({ lo: -5, hi: 10, step: 5 });
    expect(chartScale([0, 0])).toEqual({ lo: 0, hi: 1, step: 0.2 });
    expect(chartScale([0.012, 0.047])).toEqual({ lo: 0, hi: 0.05, step: 0.01 });
    const m = richModel(validateRich({ type: "table", columns: ["Plan", "Price", "Note"], rows: [["Pro", "$20", "most days"], ["Max", "$100", ""]] }));
    expect(m.type === "table" && m.numeric).toEqual([false, true, false]);
  });
});
