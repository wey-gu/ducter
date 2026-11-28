// D668 (research/246 §3.6, §3.10, §3.11): an added plugin's row on the web.
//
// The row says 你加的 / Added by you, its repository and who made it as their own elements, and
// 没有人替你检查过 / Nobody has checked it for you outside the curated list. Its consent card
// names each declared path; an update that widens the list opens that card again.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { strings } from "../src/i18n.ts";
import { importWords } from "../src/i18n-imports.ts";

const css = readFileSync(new URL("../static/app.css", import.meta.url), "utf8");
const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const pane = src("../src/imports.tsx");

test("the plugin row: installed, added by you, its repository, nobody's check", async () => {
  const { stateWords } = await import("../src/imports.tsx");
  const { A } = await import("../src/app.ts");
  A.L = strings("zh");
  const row = { id: "fixture-reader", app: "Fixture Notes", kind: "plugin", state: "ready", imported: 0, consented: false, added: true, repo: "https://example.test/fixture.git", author: "Ducter tests", reads: ["./threads.json"], unreviewed: true };
  expect(stateWords(row as never)).toBe("装好了");
  expect(stateWords({ ...row, imported: 2, importedDay: "2026-11-28" } as never)).toBe("带进来的 11 月 28 日");
  A.L = strings("en");
  expect(stateWords(row as never)).toBe("Installed");
});

test("every fact is its own element: added, author, repository, the check, the update", () => {
  for (const k of ["imports.added", "imports.author", "imports.reviewed", "imports.unreviewed", "imports.update", "imports.state.update", "imports.consent.nonet", "imports.consent.made.plugin"]) {
    expect(pane.includes(`t("${k}"`)).toBe(true);
  }
  expect(pane).toContain("{r.added && <p class=\"small muted import-added\">{t(\"imports.added\")}</p>}");
  expect(pane).toContain("{r.repo && <p class=\"small muted import-repo\">{r.repo}</p>}");
  expect(pane).toContain("{r.unreviewed && <p class=\"small import-unreviewed\">{t(\"imports.unreviewed\")}</p>}");
  expect(pane).not.toContain('t("imports.added") + " "');
});

test("the consent card names each declared path and says it can't go online", () => {
  expect(pane).toContain("reads?.length ?");
  expect(pane).toContain("reads.map((p, i)");
  expect(pane).toContain('t("imports.consent.nonet")');
  expect(pane).toContain('t("imports.consent.made.plugin", author ?? "")');
  // The Lody card keeps its own command sentence; a plugin never inherits it.
  expect(pane).toContain('t("imports.consent.command")');
  expect(css).toContain(".import-read-path");
  expect(css).toContain(".import-meta .import-repo");
  expect(css).toContain(".import-meta .import-unreviewed");
});

test("an update frame that widens the list opens the same consent card again", async () => {
  const { A } = await import("../src/app.ts");
  const { IM } = await import("../src/imports.tsx");
  A.L = strings("en");
  A.onImportsFrame?.({ t: "import_answer", id: "fixture-reader", op: "update", ok: true, needsConsent: true, widened: true });
  expect(IM.consent["fixture-reader"]).toBe(true);
  IM.consent["fixture-reader"] = false;
  A.onImportsFrame?.({ t: "import_answer", id: "fixture-reader", op: "update", ok: true, upToDate: true });
  expect(IM.consent["fixture-reader"]).toBe(false);
});

test("both languages carry the plugin words, the same as the Mac", () => {
  const zh = Object.keys(importWords.zh).sort();
  const en = Object.keys(importWords.en).sort();
  expect(en).toEqual(zh);
  const mac = src("../../desktop/internal/i18n/imports.go");
  for (const k of ["imports.added", "imports.reviewed", "imports.unreviewed", "imports.update", "imports.consent.nonet", "imports.consent.made.plugin", "imports.problem.needs_newer", "imports.error.sandbox_unavailable"]) {
    expect(mac).toContain(JSON.stringify(k));
    expect(importWords.zh[k]).toBeTruthy();
    expect(importWords.en[k]).toBeTruthy();
  }
  expect(importWords.zh["imports.added"]).toBe("你加的");
  expect(importWords.en["imports.added"]).toBe("Added by you");
  expect(importWords.zh["imports.unreviewed"]).toBe("没有人替你检查过。");
});
