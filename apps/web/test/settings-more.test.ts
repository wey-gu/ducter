// D307: the Settings rows the last lanes left on their own surfaces: every word in both languages
// with the same keys as the Mac's, no " · " joins (D291), only the shared controls (D161), and the
// home's hidden agents reaching the first screen for Settings' way back.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { strings } from "../src/i18n.ts";
import { settingsMore } from "../src/i18n-settings.ts";

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("every word in zh and en, the same keys, never a dot join", () => {
  expect(Object.keys(settingsMore.zh).sort()).toEqual(Object.keys(settingsMore.en).sort());
  for (const v of [...Object.values(settingsMore.zh), ...Object.values(settingsMore.en)]) expect(v).not.toContain(" · ");
  expect(strings("zh").t("records.hidden", "Codex")).toBe("Codex 的对话不在「做过的事」里显示");
  expect(strings("en").t("handoff.row")).toBe("Hand it to another AI agent right away");
  expect(strings("zh").t("settings.look.mode.system")).toBe("跟随系统");
});

test("the Mac says the same words under the same keys", () => {
  const mac = readFileSync(new URL("../../desktop/internal/i18n/settings_more.go", import.meta.url), "utf8");
  for (const lang of ["zh", "en"] as const)
    for (const [k, v] of Object.entries(settingsMore[lang])) {
      if (k.startsWith("settings.look.mode") || k.startsWith("key.paste.")) continue; // the Mac's own tables hold these
      expect(mac).toContain(`"${k}":`);
      expect(mac).toContain(JSON.stringify(v));
    }
});

test("settings-more.tsx draws its controls only through controls.tsx", () => {
  const f = src("settings-more.tsx");
  expect(f.match(/<(button|input|select|textarea|a)\b/g) ?? []).toEqual([]);
  expect(f.match(/<[a-z][a-z0-9]*\b[^>]*\bon(Click|Input|Change|KeyDown)=/g) ?? []).toEqual([]);
});

test("the first screen carries the agents Past tasks hides", async () => {
  const { A } = await import("../src/app.ts");
  A.L = strings("en");
  A.send = () => {};
  A.receive({ t: "first_screen", first: { visit: "returning", line: { zh: "", en: "" }, starters: [], looks: false, outsideHidden: ["codex"] } } as any);
  expect(A.S.first?.outsideHidden).toEqual(["codex"]);
  expect(A.S.first?.looks).toBe(false);
});
