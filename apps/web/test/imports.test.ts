// D655/D668/D670 (research/246 §3.10, §3.11): Settings › 导入 / Import.
//
// Readers are plugin sources now. The row's state words, the consent card all literal (paths,
// commands, online), the quiet Available list and the plugin repositories. Source checks, as
// settings-polish.test.ts does, plus the state and frame behavior.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { strings } from "../src/i18n.ts";
import { importWords } from "../src/i18n-imports.ts";

const css = readFileSync(new URL("../static/app.css", import.meta.url), "utf8");
const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const row = (over: Record<string, unknown> = {}) => ({
  id: "fixture-reader",
  app: "Fixture Notes",
  kind: "plugin" as const,
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
  for (const k of [
    "imports.lede",
    "imports.consent.past",
    "imports.consent.online.unreviewed",
    "imports.consent.made.plugin",
    "imports.consent.made.official",
    "imports.avail.title",
    "imports.avail.lede",
    "imports.avail.detected",
    "imports.avail.official",
    "imports.repo.title",
    "imports.repo.add",
    "imports.repo.field",
    "imports.remove.ask",
    "say.import.n",
  ]) {
    expect(mac).toContain(JSON.stringify(k));
  }
  expect(importWords.zh["settings.tab.import"]).toBe("导入");
  expect(importWords.en["settings.tab.import"]).toBe("Import");
  expect(importWords.zh["imports.consent.online.unreviewed"]).toBe("它会联网，没有人替你检查过。");
});

test("the row's state: brought in when, what's new, or why not", async () => {
  const { stateWords } = await import("../src/imports.tsx");
  const { A } = await import("../src/app.ts");
  A.L = strings("zh");
  expect(stateWords(row({ state: "looking" }) as never)).toBe("正在看…");
  expect(stateWords(row({ imported: 1, importedDay: "2026-11-28", consented: true }) as never)).toBe("带进来的 11 月 28 日");
  expect(stateWords(row({ imported: 1, fresh: 1 }) as never)).toBe("有新的 1 段");
  expect(stateWords(row({ state: "failed", problem: "sandbox_unavailable" }) as never)).toContain("沙箱");
  A.L = strings("en");
  expect(stateWords(row({ imported: 1, fresh: 2 }) as never)).toBe("2 new");
  expect(stateWords(row() as never)).toBe("Installed");
});

test("the Available list is a quiet row per plugin: its source, its check, detected first", async () => {
  const { A } = await import("../src/app.ts");
  const { IM } = await import("../src/imports.tsx");
  A.L = strings("zh");
  A.onImportsFrame?.({
    t: "imports",
    sources: [],
    repositories: [{ id: "official", url: "https://github.com/wey-gu/ducter-plugins", official: true, state: "ready", plugins: 2 }],
    available: [
      { id: "lody", app: "Lody", name: "Lody", version: "0.1.0", commit: "aaaa", hash: "bbbb", source: "official", sourceUrl: "https://github.com/wey-gu/ducter-plugins", sourceName: "wey-gu/ducter-plugins", official: true, reads: ["~/.lody/**"], uses: [], online: false, detected: true, reviewed: true },
    ],
  });
  const pane = src("../src/imports.tsx");
  expect(pane).toContain("f.available");
  expect(pane).toContain("<AvailableRow");
  expect(pane).toContain('t("imports.avail.detected")');
  expect(pane).toContain('t("imports.avail.official")');
  // Two lines: the source short name (the URL is only the tooltip and the ⋯).
  expect(pane).toContain("a.sourceName");
  expect(pane).toContain('title={a.sourceUrl}');
  expect(pane).toContain("<MenuHead");
  expect(IM.frame?.available?.[0]?.app).toBe("Lody");
});

test("the consent card is all literal: paths, every command and its why, online, who made it", () => {
  const pane = src("../src/imports.tsx");
  for (const k of ["imports.consent.title", "imports.consent.past", "imports.consent.online.unreviewed", "imports.consent.made.plugin", "imports.consent.go", "imports.consent.no", "imports.consent.nonet"]) {
    expect(pane).toContain(`"${k}"`);
  }
  expect(pane).toContain("reads.map((p, i)");
  expect(pane).toContain("whyWords(u.why)");
  expect(pane).toContain("u.command");
  // The online fact lives in the use's own sentence; there is no extra bold 它会联网。 line.
  expect(pane).toContain("{!u.online &&");
  expect(pane).not.toContain('t(u.online ? "imports.consent.online"');
  // Never a decision card, never a push: the card is a group in the pane, its two buttons quiet.
  expect(pane).toContain('role="group"');
  expect(pane).not.toContain("Dialog");
});

test("removal says what will be hidden before it asks, and the row keeps its ⋯ menu", () => {
  const pane = src("../src/imports.tsx");
  expect(pane).toContain('t(r.imported === 0 ? "imports.remove.ask.none" : r.imported === 1 ? "imports.remove.ask.one" : "imports.remove.ask", r.imported)');
  expect(pane).toContain('t("imports.remove.yes")');
  expect(pane).toContain('t("imports.remove.no")');
  for (const control of ["<Btn", "<DangerButton", "<MoreButton", "<Menu", "<MenuItem", "<Toggle", "<Field"]) expect(pane).toContain(control);
  // The shared pieces, never a raw button or a system control.
  expect(pane).not.toMatch(/<button/);
});

test("the pane and the repositories are styled from tokens in both themes, and narrow rows keep two edges", () => {
  for (const cls of [".import-read", ".import-consent", ".import-last", ".import-avail", ".import-repos", ".import-repo-row", ".import-remove-ask"]) expect(css).toContain(cls);
  expect(css).toMatch(/@media \(max-width: 520px\) \{\s*\.import-read, \.import-consent, \.import-last/);
  expect(css).toContain("margin: 0 var(--s5) var(--s4)");
  expect(src("../src/views.tsx")).toContain('{ page: "import", art: "wait_file", title: "settings.tab.import" }');
  expect(src("../src/views.tsx")).toContain("<ImportSettings />");
  expect(src("../src/past.tsx")).toContain("<ImportOfferLine />");
  expect(src("../src/settings-home.tsx")).toContain('case "import":');
});
