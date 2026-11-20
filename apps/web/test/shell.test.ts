// D262: one shell. Every bar is the same anatomy (where you are; this place's own actions; the way
// to the other places, one per screen) built from the shared NavBtn, and a page's first frame is
// already in the person's language.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

describe("the shell (D262)", () => {
  test("every bar ends in the way to the other places", () => {
    const views = src("views.tsx");
    const top = views.slice(views.indexOf("function Top("), views.indexOf("function Held("));
    // The conversation's bar and a phone's inner bars both carry Places.
    expect(top.match(/<Places\b/g)?.length).toBe(2);
    // The whole-screen bar (On hand, an opened task) too.
    expect(src("board.tsx")).toMatch(/<Places here=/);
  });

  test("New task is the bar's clay button, never a bare ＋ or a text button", () => {
    expect(src("views.tsx")).not.toMatch(/class="plus"(?! fill)/);
    expect(src("board.tsx")).not.toMatch(/<Btn kind="text"[^>]*newtask\.button/);
    expect(src("views.tsx")).toMatch(/<NavBtn label=\{t\("newtask\.button"\)\}/);
  });

  test("Settings is a visible button, and an update waiting is said in the bar", () => {
    const views = src("views.tsx");
    const places = views.slice(views.indexOf("export function Places("), views.indexOf("function Top("));
    expect(places).toMatch(/t\("nav\.settings"\)/);
    expect(places).toMatch(/nav\.update/);
  });

  test("on a phone the update pill is its pebble and count, so the counts keep their line (D446)", () => {
    const views = src("views.tsx");
    const places = views.slice(views.indexOf("export function Places("), views.indexOf("function Top("));
    expect(places).toMatch(/cls="update"/);
    expect(places).toMatch(/short=\{!running && n > 1 \? String\(n\) : undefined\}/);
    const css = readFileSync(new URL("../static/app.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    // The count is hidden by default; inside a phone-width block the words go and the count shows.
    expect(css).toMatch(/\.btn\.nav \.lbl-short \{\s*display: none;\s*\}/);
    const at = css.search(/@media \(max-width: \d+px\) \{\s*\.top \.btn\.nav\.update \{/);
    expect(at).toBeGreaterThan(-1);
    const width = Number(css.slice(at).match(/max-width: (\d+)px/)![1]);
    expect(width).toBeGreaterThanOrEqual(430); // the widest phones too
    const block = css.slice(at, css.indexOf("\n}", at));
    expect(block).toMatch(/\.top \.btn\.nav\.update \.lbl \{\s*display: none;/);
    expect(block).toMatch(/\.top \.btn\.nav\.update \.lbl-short \{\s*display: inline;/);
    // A count never breaks inside (1 个 / 等你).
    expect(css).toMatch(/\.top \.who \.sum \.facts > span \{\s*white-space: nowrap;/);
  });

  test("a page opens in the language it followed last, not the system's", async () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    const { startLang } = await import("../src/app.ts");
    store.set("ducter.spoke", "zh");
    expect(startLang("auto")).toBe("zh");
    expect(startLang("en")).toBe("en"); // this device's own choice wins
    store.delete("ducter.spoke");
    expect(["zh", "en"]).toContain(startLang("auto"));
  });
});
