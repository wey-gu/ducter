// The Settings polish of 2026-11-28 (design/settings.md "Every pane a pleasure"): Plugins and Import
// in the shared grammar, their heads the state, a phone never seen saying so on Overview. The Mac's
// settings_setpolish_test.go checks the same.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strings } from "../src/i18n.ts";

const src = (f: string) => readFileSync(join(import.meta.dir, "../src", f), "utf8");
const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8");

test("Plugins' head is what is installed, never what the pane is for", async () => {
  const { A } = await import("../src/app.ts");
  const { TH, pluginsSay } = await import("../src/plugins.tsx");
  const { paneSay } = await import("../src/settings-home.tsx");
  A.L = strings("zh");
  TH.frame = undefined;
  expect(pluginsSay()).toBe("");
  TH.frame = { t: "themes", active: "pebble", themes: [] } as never;
  expect(paneSay("plugins")).toBe("还没装别人做的外观；现在是 Ducter 自带的 Pebble。");
  TH.frame = { t: "themes", active: "midnight", themes: [{ id: "midnight", name: { en: "Midnight", zh: "午夜" }, consented: true, active: true }] } as never;
  expect(pluginsSay()).toBe("装了 1 套别人做的外观；现在用的是午夜。");
  A.L = strings("en");
  TH.frame = { t: "themes", active: "pebble", themes: [] } as never;
  expect(pluginsSay()).toBe("No looks from other people yet; you're on Pebble, the one Ducter ships.");
  TH.frame = undefined;
});

test("the looks are one group titled above its card, Pebble always first, a way to add one when empty", () => {
  const p = src("plugins.tsx");
  // Never a heading drawn as an empty row inside the card, never a bare line on the card's edge.
  expect(p).not.toContain("<span />");
  expect(p).not.toContain('<p class="small muted">{t("settings.look.back.note")}</p>');
  expect(p).toContain("<h3>{t(title)}</h3>");
  expect(p).toContain('<ThemesGroup foot title="plugins.theme.group" />');
  expect(p).toContain("<PebbleRow on=");
  expect(p).toContain('<GFoot note={t("plugins.none")}>');
  expect(p).toContain('<LinkBtn kind="text" size="sm" href={PLUGINS_DOCS} label={t("plugins.how")} />');
  // The one name: Pebble, never 卵石 beside it.
  expect(strings("zh").t("settings.look.back.note")).not.toContain("卵石");
});

test("Import: the head is what was brought in; Available and the repositories are groups with the shared rows", async () => {
  const { A } = await import("../src/app.ts");
  const { IM } = await import("../src/imports.tsx");
  const { paneSay } = await import("../src/settings-home.tsx");
  A.L = strings("zh");
  IM.frame = { t: "imports", sources: [] } as never;
  expect(paneSay("import")).toBe("还没从别的 app 带进来什么。");
  IM.frame = { t: "imports", sources: [{ id: "a", app: "Lody", kind: "plugin", state: "ready", imported: 3, consented: true }] } as never;
  expect(paneSay("import")).toBe("有 3 段对话是从别的 app 带进来的。");
  IM.frame = undefined;
  const pane = src("imports.tsx");
  expect(pane).not.toContain("import-lede");
  expect(pane).toContain('<h3>{t("imports.avail.title")}</h3>');
  expect(pane).toContain('<h3>{t("imports.repo.title")}</h3>');
  expect(pane).toContain('<AddRow label={t("imports.repo.add")}');
  expect(pane).toContain('<div class="chat-row tiled import-avail"');
  // A repository's removal is the quiet destructive action that asks in place (D289).
  expect(pane).toContain('<DangerButton quiet label={t("imports.repo.remove")}');
  // An Available row's button never stretches to a full-width bar on a phone.
  expect(css).not.toContain(".import-avail-acts .btn { flex: 1; }");
});

test("a phone paired but never here says so on Overview, as Your devices does", async () => {
  const { A } = await import("../src/app.ts");
  const h = await import("../src/settings-home.tsx");
  A.L = strings("zh");
  A.devices = [] as never;
  A.reach = { clients: [{ id: "c1", name: "iPad", platform: "ios-app", connected: false }] } as never;
  const ps = h.mapPlaces();
  expect(ps.map((p) => [p.role, p.now])).toEqual([["随时找我", "还没连上过"]]);
  A.reach = undefined as never;
});

test("a partner row's quiet first action starts its words on the text edge; Agent messaging's picture keeps the page's rhythm", () => {
  expect(css).toContain(".partners-set .partner-acts > .btn.text:first-child { margin-inline-start: calc(-1 * var(--end-pad)); }");
  expect(css).toContain(".peers-pic + .mem-sec > .chat-app:first-child { margin-top: 0; }");
  expect(css).not.toMatch(/\.peers-pic \{[^}]*margin: 0 0 var\(--s4\)/);
});
