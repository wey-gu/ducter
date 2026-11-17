// D348 (research/124 F8, D341's left items): the small things from the live walk, and To-do sources'
// own filters. The task pane's wait line gives way instead of running 7 px past the pane; held words
// with nothing running say they go with the next message; a locator jump lands a turn below the top
// edge (under anything stuck there, with the page's top room); memory held off by the home's start
// shows its switch, still, and says why; a GitHub source's repositories and a vault's folder and tag
// are fields. The words are the Mac's (apps/desktop/internal/views/d348_test.go).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strings } from "../src/i18n.ts";
import { memoryWords } from "../src/i18n-memory.ts";
import { todoWords } from "../src/i18n-todos.ts";
import { transcriptWords } from "../src/i18n-transcript.ts";

const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");
const goWords = (file: string) => readFileSync(join(import.meta.dir, "../../desktop/internal/i18n", file), "utf8");

describe("the wait line", () => {
  test("its one line of words shrinks in full, so the line never runs past the pane", () => {
    // `.step .sum:first-of-type` shrinks at 0.35: alone, it took only 35% of the overflow.
    expect(css).toMatch(/\.step \.sum:first-of-type \{\s*flex-shrink: 0\.35;/);
    expect(css).toMatch(/\.wait-end \.step \.sum:first-of-type \{\s*flex-shrink: 1;\s*\}/);
  });
});

describe("held words", () => {
  test("nothing running: they go with the next message; working: after this turn", async () => {
    const { A } = await import("../src/app.ts");
    const { heldHead } = await import("../src/views.tsx");
    for (const lang of ["zh", "en"] as const) {
      A.L = strings(lang);
      expect(heldHead(false, true, "claude-code")).toBe(lang === "zh" ? "跟你下一句一起发" : "Sent with your next message");
      expect(heldHead(false, false, "pi")).toBe(heldHead(false, true, "claude-code"));
      expect(heldHead(true, true, "claude-code")).toBe(A.L.t("held.head"));
      expect(heldHead(true, false, "pi")).toBe(A.L.t("held.head.nosteer", "pi"));
    }
    expect(Object.keys(transcriptWords.zh)).toContain("held.head.idle");
    expect(Object.keys(transcriptWords.en)).toContain("held.head.idle");
    const mac = goWords("turns.go");
    expect(mac).toContain(`"held.head.idle":         "跟你下一句一起发"`);
    expect(mac).toContain(`"held.head.idle":         "Sent with your next message"`);
  });
});

describe("the locator's landing", () => {
  type Box = { top: number; bottom: number };
  const el = (r: Box, position = "static") => ({ r, position, getBoundingClientRect: () => r });
  const withStyles = async (fn: () => Promise<void> | void) => {
    const was = (globalThis as { getComputedStyle?: unknown }).getComputedStyle;
    (globalThis as { getComputedStyle?: unknown }).getComputedStyle = (e: { position?: string; pad?: string }) => ({ position: e.position ?? "static", paddingTop: e.pad ?? "0px" });
    try {
      await fn();
    } finally {
      (globalThis as { getComputedStyle?: unknown }).getComputedStyle = was;
    }
  };

  test("below anything stuck to the top, with the page's own top room, never against the edge", async () => {
    const { landOffset } = await import("../src/transcript.tsx");
    await withStyles(() => {
      const plain = { children: [el({ top: 61, bottom: 300 })], pad: "24px", getBoundingClientRect: () => ({ top: 61, bottom: 800 }) };
      expect(landOffset(plain as never)).toBe(24);
      // A header stuck at the top inside the scroller (44 tall): the turn lands under it.
      const stuck = { children: [el({ top: 61, bottom: 105 }, "sticky"), el({ top: 105, bottom: 400 })], pad: "6px", getBoundingClientRect: () => ({ top: 61, bottom: 800 }) };
      expect(landOffset(stuck as never)).toBe(44 + 16);
      // A sticky element further down (a table's head) covers nothing at the top.
      const low = { children: [el({ top: 400, bottom: 430 }, "sticky")], pad: "0px", getBoundingClientRect: () => ({ top: 61, bottom: 800 }) };
      expect(landOffset(low as never)).toBe(16);
    });
  });
});

describe("memory held off", () => {
  test("the page says why, in both languages, the same words as the Mac's", () => {
    expect(memoryWords.zh["mem.pinned"]).toContain("DUCTER_MEMORY=off");
    expect(memoryWords.en["mem.pinned"]).toContain("can't be turned on here");
    const mac = goWords("memory.go");
    expect(mac).toContain(memoryWords.zh["mem.pinned"]!);
    expect(mac).toContain(memoryWords.en["mem.pinned"]!);
  });
});

describe("to-do sources' filters", () => {
  test("repositories read from what was typed: owner/repo, at commas or spaces, links and .git trimmed", async () => {
    const { reposOf } = await import("../src/todos.tsx");
    expect(reposOf("acme/web，acme/api  https://github.com/acme/web.git")).toEqual(["acme/web", "acme/api"]);
    expect(reposOf(" , ")).toEqual([]);
    expect(reposOf("lin/notes、lin/site; lin/cli")).toEqual(["lin/notes", "lin/site", "lin/cli"]);
  });

  test("the words exist in zh and en, the same as the Mac's", () => {
    const mac = goWords("todos.go");
    for (const k of ["todos.repos", "todos.repos.all", "todos.repos.hint", "todos.folder", "todos.folder.all", "todos.tag", "todos.tag.any"]) {
      for (const lang of ["zh", "en"] as const) {
        const w = todoWords[lang][k];
        expect(w).toBeTruthy();
        expect(mac).toContain(`"${w}"`);
      }
    }
  });

  test("the fields are 44 tall and wrap one under the other on a phone", () => {
    expect(css).toMatch(/\.acct-field input \{\s*height: 44px;/);
    expect(css).toMatch(/\.todo-filters \{\s*flex-wrap: wrap;/);
  });
});
