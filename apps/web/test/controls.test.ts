// The author's rule (D161): cards and settings use only the shared controls (design/ui.md
// "Shared controls", src/controls.tsx). The device card draws no control of its own: no raw
// <button>, <input>, <select>, <textarea> or <a>, and no click handler on a plain element.
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";

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
    expect(names).toEqual(["Btn", "NavBtn", "PlaceSeg", "LinkBtn", "TextLink", "Chev", "NeedsDoor", "CountDoor", "CountPebble", "AddRow", "Toggle", "How", "DangerButton", "MoreButton", "RenameTitle", "CoinButton", "SocketButton", "Chip", "Fold", "StepNumber", "StepRow", "ListRow", "BackRow", "Seg", "AppTile", "Pill", "Choice", "MenuRow", "Facts", "OpenRow", "Switch", "TextBox", "Field", "CrumbStep", "OptionRow", "SectionHead", "Tag", "TimeCol", "IconBtn", "TrayRow", "Notice", "WorkHead", "CodeChip", "FileChip", "KeyHint"]);
    // design/ui.md lists the same set.
    const ui = readFileSync(new URL("../../../design/ui.md", import.meta.url), "utf8");
    for (const n of names) expect(ui).toContain(`\`${n}\``);
  });

  test("views.tsx no longer defines its own button family", () => {
    const views = src("views.tsx");
    expect(views).not.toMatch(/^function (Btn|Toggle|Seg)\(/m);
  });
});

// D519: deny by default. Every view file is covered: a raw button of the family (`class="btn …"`), a
// raw words field (`<textarea>`) or a raw switch is drawn only by the files that define the shared
// set. A new view is covered the moment it exists. The files below drew such controls before the
// rule; each may not draw more (its count is a ceiling, lowered as it moves onto the set). Trigger
// to empty the list: design/todo.md "D519: the raw controls left in older views".
const DEFINE: Record<string, string> = {
  "controls.tsx": "defines the shared control set (D161)",
  "composer.tsx": "defines the one composer and its send (D519)",
  "menu.tsx": "defines the one clay menu (D421)",
};
const OLDER: Record<string, number> = {
  "apps-shelf.tsx": 1, "apps.tsx": 8, "fileview.tsx": 12, "first-words.tsx": 1, "handover.tsx": 5, "live.tsx": 5, "main.tsx": 1, "media.tsx": 5,
  "memory.tsx": 2, "newtask.tsx": 1, "onhand.tsx": 5, "past-preview.tsx": 1, "phone-use.tsx": 4, "phone.tsx": 1, "pile.tsx": 1, "pins.tsx": 1,
  "reply.tsx": 3, "rich.tsx": 2, "sim.tsx": 1, "talk.tsx": 6, "task-sheet.tsx": 1, "transcript.tsx": 1, "views.tsx": 12, "voice.tsx": 4,
  "work.tsx": 6, "workbench.tsx": 1, "worker-mem.tsx": 1,
};
const RAW = /class="btn[ "]|class=\{`btn[ `]|<textarea\b|role="switch"/g;

describe("D519: shared controls, deny by default", () => {
  const dir = new URL("../src/", import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".tsx")))
    test(`${f} draws no raw control beyond its ceiling`, () => {
      if (DEFINE[f]) return;
      const n = (src(f).match(RAW) ?? []).length;
      expect(n).toBeLessThanOrEqual(OLDER[f] ?? 0);
    });

  test("the list of older views only shrinks", () => {
    // Lowered as each view moves onto the set: a view under its ceiling is lowered here.
    for (const [f, max] of Object.entries(OLDER)) expect({ f, n: existsSync(new URL(`../src/${f}`, import.meta.url)) ? (src(f).match(RAW) ?? []).length : 0 }).toEqual({ f, n: max });
  });

  test("the composer and its send exist once: no other send button, words field beside a send, or drawn arrow", () => {
    for (const f of readdirSync(dir).filter((x) => /\.tsx?$/.test(x) && x !== "composer.tsx")) {
      const s = src(f);
      expect({ f, hits: s.match(/icon send|class="send"|kind="accent"[^>]*composer\.send|keep\.talk\.send|function AutoText|const Arrow\b/g) ?? [] }).toEqual({ f, hits: [] });
    }
  });
});
