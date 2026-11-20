// D421: one menu. Every menu panel, right-click menu and short choice in the web and phone client is
// src/menu.tsx's (Menu, MenuItem, Select): the clay look, the keys, the roles, placement inside the
// window. A raw role="menu" or a native <select> anywhere else fails here, as does a small app's
// grey <select> that isn't the kit's k-select.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { appDocument, appLint } from "@ducter/protocol";

const dir = join(import.meta.dir, "../src");

describe("one menu (D421)", () => {
  for (const f of readdirSync(dir).filter((f) => /\.tsx?$/.test(f) && f !== "menu.tsx"))
    test(`${f} builds no menu or select of its own`, () => {
      const s = readFileSync(join(dir, f), "utf8");
      expect(s.match(/role=["']menu["']|<select\b|createElement\(["']select["']\)/g) ?? []).toEqual([]);
    });

  test("the small-app kit: a k-select passes, a grey select doesn't, and the document carries the clay list", () => {
    const kit = `<main class="k-app"><select class="k-select" aria-label="分类"><option>交通</option><option>住宿</option></select></main>`;
    expect(appLint(kit)).toEqual([]);
    const grey = `<main class="k-app"><select id="cat"><option>交通</option></select></main>`;
    expect(appLint(grey).join("\n")).toContain("k-select");
    const doc = appDocument({ id: "a1", name: "x", html: kit, data: {} }, { transport: "message" });
    expect(doc).toContain(".k-select{");
    expect(doc).toContain('m.className="k-menu"');
    expect(doc.indexOf('m.className="k-menu"')).toBeLessThan(doc.indexOf(kit));
  });
});
