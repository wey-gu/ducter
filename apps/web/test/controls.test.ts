// The author's rule (D161): cards and settings use only the shared controls (design/ui.md
// "Shared controls", src/controls.tsx). The device card draws no control of its own: no raw
// <button>, <input>, <select>, <textarea> or <a>, and no click handler on a plain element.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

describe("only shared controls (D161)", () => {
  test("the device card draws its controls only through controls.tsx", () => {
    const card = src("devcard.tsx");
    expect(card.match(/<(button|input|select|textarea|a)\b/g) ?? []).toEqual([]);
    expect(card.match(/<[a-z][a-z0-9]*\b[^>]*\bon(Click|Input|Change|KeyDown)=/g) ?? []).toEqual([]);
  });

  // D166: the accounts cards and the notes the partner says by itself, the same rule.
  for (const f of ["accounts.tsx", "finds.tsx", "updateall.tsx"])
    test(`${f} draws its controls only through controls.tsx`, () => {
      const card = src(f);
      expect(card.match(/<(button|input|select|textarea|a)\b/g) ?? []).toEqual([]);
      expect(card.match(/<[a-z][a-z0-9]*\b[^>]*\bon(Click|Input|Change|KeyDown)=/g) ?? []).toEqual([]);
    });

  test("controls.tsx is the registry: each control is exported once", () => {
    const reg = src("controls.tsx");
    const names = [...reg.matchAll(/^export function (\w+)/gm)].map((m) => m[1]);
    expect(names).toEqual(["Btn", "LinkBtn", "Chev", "Toggle", "DangerButton", "MoreButton", "RenameTitle", "CoinButton", "SocketButton", "Chip", "ListRow", "BackRow", "Seg", "AppTile", "Pill", "Choice", "MenuRow"]);
    // design/ui.md lists the same set.
    const ui = readFileSync(new URL("../../../design/ui.md", import.meta.url), "utf8");
    for (const n of names) expect(ui).toContain(`\`${n}\``);
  });

  test("views.tsx no longer defines its own button family", () => {
    const views = src("views.tsx");
    expect(views).not.toMatch(/^function (Btn|Toggle|Seg)\(/m);
  });
});
