// D655 (research/246 §3.10, §3.11): Settings › 导入 / Import. The row's state words, the
// consent card all literal, the one line in Past tasks fading and 先不, and removal saying what it
// hides. Source checks, as settings-polish.test.ts does, plus the state and frame behavior.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { strings } from "../src/i18n.ts";
import { importWords } from "../src/i18n-imports.ts";

const css = readFileSync(new URL("../static/app.css", import.meta.url), "utf8");
const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const row = (over: Record<string, unknown> = {}) => ({
  id: "lody" as const,
  app: "Lody",
  state: "ready" as const,
  imported: 0,
  consented: false,
  ...over,
});

test("both languages carry every key, and the Mac's words are the same", () => {
  const zh = Object.keys(importWords.zh).sort();
  const en = Object.keys(importWords.en).sort();
  expect(en).toEqual(zh);
  const mac = src("../../desktop/internal/i18n/imports.go");
  for (const k of ["imports.lede", "imports.consent.path", "imports.consent.command", "imports.consent.past", "imports.offer", "imports.remove.ask", "say.import.n"]) {
    expect(mac).toContain(JSON.stringify(k));
    expect(mac).toContain(importWords.zh[k]!.replace(/%s/g, "%s"));
  }
  expect(importWords.zh["settings.tab.import"]).toBe("导入");
  expect(importWords.en["settings.tab.import"]).toBe("Import");
});

test("the row's state: how many, brought in when, or what's new", async () => {
  const { stateWords } = await import("../src/imports.tsx");
  const { A } = await import("../src/app.ts");
  A.L = strings("zh");
  expect(stateWords(row({ state: "looking" }) as never)).toBe("正在看…");
  expect(stateWords(row({ total: 4 }) as never)).toBe("4 段对话");
  expect(stateWords(row({ total: 1, imported: 1, importedDay: "2026-11-28", consented: true }) as never)).toBe("带进来的 11 月 28 日");
  expect(stateWords(row({ total: 2, imported: 1, fresh: 1 }) as never)).toBe("有新的 1 段");
  expect(stateWords(row({ state: "missing", problem: "no_lody" }) as never)).toContain("找不到 lody");
  expect(stateWords(row({ state: "signed_out", problem: "signed_out" }) as never)).toContain("lody login");
  expect(stateWords(row({ state: "needs_authorization", problem: "needs_authorization" }) as never)).toContain("允许这台电脑");
  A.L = strings("en");
  expect(stateWords(row({ total: 2, imported: 1, fresh: 2 }) as never)).toBe("2 new");
});

test("the offer is one line; 先不 hides it here, and the offer frame carries it once", async () => {
  const { A } = await import("../src/app.ts");
  const { IM, importOffer } = await import("../src/imports.tsx");
  A.onImportsFrame?.({ t: "imports", sources: [row({ total: 3 }) as never], offer: { id: "lody", app: "Lody", total: 3 } });
  expect(importOffer()).toMatchObject({ id: "lody", total: 3 });
  IM.frame = { t: "imports", sources: [], offer: undefined } as never;
  expect(importOffer()).toBeUndefined();
});

test("the consent card is all literal: the read list, the signed-in command, read only, who made it, two buttons", () => {
  const pane = src("../src/imports.tsx");
  for (const k of ["imports.consent.title", "imports.consent.path", "imports.consent.command", "imports.consent.past", "imports.consent.made", "imports.consent.go", "imports.consent.no"]) {
    expect(pane).toContain(`t("${k}")`);
  }
  // Never a decision card, never a push: the card is a group in the pane, its two buttons quiet.
  expect(pane).toContain('role="group"');
  expect(pane).not.toContain("Dialog");
});

test("removal says what will be hidden before it asks, and the row keeps its ⋯ menu", () => {
  const pane = src("../src/imports.tsx");
  expect(pane).toContain('t(r.imported === 0 ? "imports.remove.ask.none" : r.imported === 1 ? "imports.remove.ask.one" : "imports.remove.ask", r.imported)');
  expect(pane).toContain('t("imports.remove.yes")');
  expect(pane).toContain('t("imports.remove.no")');
  for (const control of ["<Btn", "<DangerButton", "<MoreButton", "<Menu", "<MenuItem"]) expect(pane).toContain(control);
  // The shared pieces, never a raw button or a system control.
  expect(pane).not.toMatch(/<button/);
});

test("the pane and the offer are styled from tokens in both themes, and narrow rows keep two edges", () => {
  for (const cls of [".import-read", ".import-consent", ".import-last", ".past-import-offer", ".import-remove-ask"]) expect(css).toContain(cls);
  expect(css).toMatch(/@media \(max-width: 520px\) \{\s*\.import-read, \.import-consent, \.import-last/);
  expect(css).toContain("margin: 0 var(--s5) var(--s4)");
  expect(src("../src/set-sections.ts")).toContain('{ page: "import", art: "wait_file", title: "settings.tab.import" }');
  expect(src("../src/views.tsx")).toContain('<ImportSettings />');
  expect(src("../src/past.tsx")).toContain("<ImportOfferLine />");
  expect(src("../src/settings-home.tsx")).toContain('case "import":');
});
