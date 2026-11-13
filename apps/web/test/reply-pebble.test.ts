// D256: the reply pebble's placement rules, read from the stylesheet and the source (the layout
// itself is checked in a real browser for the shots: user, partner, picture and find, wide and
// narrow, zh and en, light and dark, never on a bubble or a card).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../static/app.css", import.meta.url), "utf8");
const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
/** The declarations of the rule whose selector list is exactly sel. */
const rule = (sel: string) => {
  const i = css.indexOf(`\n${sel} {`);
  if (i < 0) throw new Error(`no rule ${sel}`);
  return css.slice(css.indexOf("{", i) + 1, css.indexOf("}", i));
};

describe("the reply pebble sits in the gutter, never on what it replies to", () => {
  test("the person's bubble: left of it, resting on its bottom line", () => {
    expect(rule(".hover-reply")).toContain("bottom: 3px");
    expect(rule(".hover-reply")).not.toMatch(/\btop:/);
    expect(rule(".user > .hover-reply")).toContain("right: calc(100% + 8px)");
  });
  test("the partner's bubble: right of the bubble itself, not of its row", () => {
    expect(rule(".partner > .bubble > .hover-reply")).toContain("left: calc(100% + 8px)");
    expect(css).not.toMatch(/\n\.partner > \.hover-reply \{/);
  });
  test("a find: outside the note card (its 14px inset, then the 8px gutter)", () => {
    expect(rule(".find > .ftext > .hover-reply")).toContain("left: calc(100% + 22px)");
    expect(src("finds.tsx")).toMatch(/<div class="ftext">[\s\S]*?<HoverReply k=\{rk\} \/>[\s\S]*?<\/div>/);
  });
  test("pictures alone: left of the pictures, by their own width", () => {
    expect(rule(".user-m > .hover-reply")).toContain("right: calc(var(--pics-w) + 8px)");
  });
  test("a partner bubble always leaves room for it with a mouse", () => {
    expect(css).toContain("max-width: min(88%, calc(100% - 44px), var(--bubble-measure));");
  });
  test("touch never shows it (the swipe and the menu reply there)", () => {
    expect(rule(".hover-reply")).toContain("display: none");
  });
  test("reduced motion: no settle", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\n {2}\.hover-reply,\n {2}\.hover-reply:hover \{\n {4}animation: none !important;/);
  });
});

describe("one drawn reply mark", () => {
  test("the hover pebble, the swipe and the menu draw the same paths, never a stock arrow or text", () => {
    const r = src("reply.tsx");
    expect(r).toContain('export const REPLY_PATHS = \'<path d="M6.4 3 3 6.4l3.4 3.4"/><path d="M3.4 6.4c5.6 0 9.4 1.8 9.4 6.6"/>\'');
    expect(r).toContain("${REPLY_PATHS}</svg>");
    expect(r).not.toContain("M9.5 5.5 4 11l5.5 5.5");
    expect(r).not.toMatch(/[↩↪⤺⤶]/);
  });
});
