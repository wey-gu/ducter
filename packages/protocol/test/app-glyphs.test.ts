// D418: the apps' marks, one table for the Mac and the web (fixtures/app-glyphs.json), and the mark an app's own words point to.
import { describe, expect, test } from "bun:test";
import fx from "../fixtures/app-glyphs.json" with { type: "json" };
import { APP_GLYPH_STROKE, APP_GLYPHS, APP_ICON_WORDS } from "../src/app-glyphs.ts";
import { APP_ICONS, appIcon, appIconFor, appKitIssues } from "../src/apps.ts";

describe("app glyphs", () => {
  test("the fixture is the table", () => {
    expect(fx.glyphs).toEqual(APP_GLYPHS);
    expect(fx.stroke).toBe(APP_GLYPH_STROKE);
    expect(fx.icons).toEqual(APP_ICONS);
    // The Mac compiles the same words (RE2): each source is the regex's own, unescaped.
    for (const [k, [, re]] of APP_ICON_WORDS.entries()) expect(new RegExp(fx.words[k]![1]!, "i").test("出差花销") === re.test("出差花销")).toBe(true);
    expect(fx.words.map(([i]) => i)).toEqual(APP_ICON_WORDS.map(([i]) => i));
    for (const [, s] of fx.words) expect(/\\u[0-9a-f]{4}/i.test(s)).toBe(false);
  });
  test("paths stay on the 20-point grid", () => {
    for (const d of Object.values(APP_GLYPHS)) expect(/^M[MmLlHhVvCcSsQqAaZz0-9.,\s-]+$/.test(d)).toBe(true);
  });
  test("an app's own words choose its mark; a trip before its spending", () => {
    expect(appIcon({ name: "出差花销" })).toBe("suitcase");
    expect(appIcon({ name: "北京出差 11/20–21" })).toBe("suitcase");
    expect(appIcon({ name: "宝宝喝奶" })).toBe("bottle");
    expect(appIcon({ name: "PRs waiting on someone" })).toBe("pr");
    expect(appIcon({ name: "Spending" })).toBe("coins");
    expect(appIcon({ name: "这周要买的" })).toBe("cart");
    expect(appIcon({ name: "Untitled", ask: "make me a habit tracker" })).toBe("flame");
    expect(appIcon({ name: "Something" })).toBe("window");
    expect(appIcon({ name: "出差花销", icon: "coins" })).toBe("coins");
    expect(appIcon({ kind: "reviews", name: "审查看板" })).toBe("board");
    // An old app's stored "window" was no choice: its words still pick.
    expect(appIcon({ name: "出差花销", icon: "window" })).toBe("suitcase");
    expect(appIconFor("print the report")).toBeUndefined();
  });
  test("an app made before the kit is told apart by its look only", () => {
    expect(appKitIssues(`<select><option>a</option></select><input type="number"><input type="date">`).length).toBe(4);
    expect(appKitIssues(`<main class="k-app"><script>fetch("x")</script></main>`)).toEqual([]);
  });
});
