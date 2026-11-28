// D668/D670 (research/246 §3.6, §3.10, §3.11): plugin sources on the web.
//
// An installed reader says 你加的 / Added by you (unless it came from Ducter's official repository),
// its repository and who made it as their own elements, and 没有人替你检查过 / Nobody has checked
// it for you outside the official index. Its consent card names each declared path and every
// command it starts; an unreviewed online reader makes the person tick the second line. An
// Available row installs first, then opens the same card.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { strings } from "../src/i18n.ts";
import { importWords } from "../src/i18n-imports.ts";

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
  for (const k of ["imports.added", "imports.author", "imports.reviewed", "imports.unreviewed", "imports.update", "imports.state.update", "imports.consent.made.plugin"]) {
    expect(pane.includes(`"${k}"`)).toBe(true);
  }
  expect(pane).toContain('{r.added && <p class="small muted import-added">{t("imports.added")}</p>}');
  expect(pane).toContain('{r.repo && <p class="small muted import-repo">{r.repo}</p>}');
  expect(pane).toContain('{r.unreviewed && <p class="small import-unreviewed">{t("imports.unreviewed")}</p>}');
  expect(pane).not.toContain('t("imports.added") + " "');
});

test("the consent card names each path and every command it starts", () => {
  expect(pane).toContain("reads?.length ?");
  expect(pane).toContain("reads.map((p, i)");
  expect(pane).toContain("uses.map((u, i)");
  expect(pane).toContain("whyWords(u.why)");
  expect(pane).toContain('t("imports.consent.nonet")');
  expect(pane).toContain("!u.online");
  expect(pane).toContain('t("imports.consent.made.plugin", author ?? "")');
  expect(pane).toContain('t("imports.consent.online.unreviewed")');
  expect(pane).toContain("<Toggle");
});

test("an install answer opens the installed row's consent card", async () => {
  const { A } = await import("../src/app.ts");
  const { IM } = await import("../src/imports.tsx");
  A.L = strings("en");
  A.onImportsFrame?.({ t: "import_answer", id: "fixture-reader", op: "install", ok: true, needsConsent: true });
  expect(IM.pendingConsent["fixture-reader"]).toBe(true);
  A.onImportsFrame?.({ t: "imports", sources: [{ id: "fixture-reader", app: "Fixture Notes", kind: "plugin", state: "ready", imported: 0, consented: false }] });
  expect(IM.consent["fixture-reader"]).toBe(true);
  IM.consent["fixture-reader"] = false;
});

test("a plugin repository can be added, and its answer says so", async () => {
  const { A } = await import("../src/app.ts");
  const { IM } = await import("../src/imports.tsx");
  A.L = strings("en");
  expect(pane).toContain('"imports.repo.add"');
  expect(pane).toContain("{ t: \"import_source_add\", url:");
  A.onImportsFrame?.({ t: "import_answer", id: "source", op: "source_add", ok: true, sourceId: "src-abc" });
  expect(IM.addRepo).toBe(false);
  expect(IM.err["source"]).toBeUndefined();
});

test("both languages carry the new words, the same as the Mac", () => {
  const zh = Object.keys(importWords.zh).sort();
  const en = Object.keys(importWords.en).sort();
  expect(en).toEqual(zh);
  const mac = src("../../desktop/internal/i18n/imports.go");
  for (const k of ["imports.added", "imports.reviewed", "imports.unreviewed", "imports.avail.title", "imports.avail.official", "imports.repo.add", "imports.repo.count.one", "imports.repo.unread", "imports.consent.online.unreviewed", "imports.consent.made.official", "imports.problem.needs_newer", "imports.error.sandbox_unavailable"]) {
    expect(mac).toContain(JSON.stringify(k));
    expect(importWords.zh[k]).toBeTruthy();
    expect(importWords.en[k]).toBeTruthy();
  }
  expect(importWords.zh["imports.added"]).toBe("你加的");
  expect(importWords.en["imports.added"]).toBe("Added by you");
  expect(importWords.zh["imports.unreviewed"]).toBe("没有人替你检查过。");
  expect(importWords.zh["imports.avail.official"]).toBe("官方仓库");
});
