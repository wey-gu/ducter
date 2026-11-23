// D494: the pane names the partner and Ducter's own lines use (protocol/settings-panes.ts) are the
// names the person sees in Settings' rail, zh and en. The partner once sent the author to a pane that
// never existed (「设置 → 与其他 AI 对话」).
import { expect, test } from "bun:test";
import { PANE_NAMES, paneName } from "../../../packages/protocol/src/settings-panes.ts";
import { TABLES } from "../src/i18n.ts";

test("every pane name is the rail's own, in both languages", () => {
  for (const lang of ["zh", "en"] as const) {
    const t = TABLES[lang];
    expect(PANE_NAMES[lang].settings).toBe(t["settings.title"]!);
    for (const [pane, name] of Object.entries(PANE_NAMES[lang].panes)) expect(name).toBe(t[`settings.short.${pane}`] ?? t[`settings.tab.${pane}`]!);
  }
  expect(paneName("peers", "zh")).toBe("设置 › Agent 通信");
  expect(paneName("peers", "zh-Hant")).toBe("设置 › Agent 通信");
  expect(paneName("peers", "en")).toBe("Settings › Agent messaging");
});
