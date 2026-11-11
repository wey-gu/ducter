// The glyph guard (D211) in every test run: scripts/check-glyphs.ts says why.
import { describe, expect, test } from "bun:test";
import { offenders, scan } from "./check-glyphs.ts";

describe("glyphs a person reads (D211)", () => {
  test("no emoji and no symbol iOS can't draw as text, in any client's words", () => {
    const bad = scan();
    if (bad.length) console.error(`Use a drawn glyph or words instead:\n${bad.join("\n")}`);
    expect(bad).toEqual([]);
  });

  test("the check catches what it is for", () => {
    const hits = (s: string, ext = "ts") => offenders(s, ext).map((o) => o.ch);
    expect(hits(`const k = "⌘↩ 开始";`)).toEqual(["↩"]);
    expect(hits(`label: "✔ done"`)).toEqual(["✔"]);
    expect(hits(`"⏱ 30 分钟"`)).toEqual(["⏱"]);
    expect(hits(`"好 🎉"`)).toEqual(["🎉"]);
    expect(hits(`"↗\uFE0E"`)).toEqual(["\uFE0E"]);
    expect(hits(`"更多 ⌄"`)).toEqual(["⌄"]);
    expect(hits(`"ⓘ"`)).toEqual(["ⓘ"]);
    expect(hits(`"⌘⏎ 开始 · ⇧⌘⏎" // ⌘↩ in a comment is fine`)).toEqual([]);
    expect(hits(`// 🎉 a comment`)).toEqual([]);
    expect(hits(`/**\n * ✔ inside a block comment\n */\nconst ok = "✓ → ↗";`)).toEqual([]);
    expect(hits(`{/* ✔ JSX comment */}<b>×</b>`)).toEqual([]);
    expect(hits(`Press ⌘↩ to start`, "md")).toEqual(["↩"]);
  });
});
