// D226: 今天看了什么 / What it looked at today: the same words on the phone and the Mac, zh and en.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { strings } from "../src/i18n.ts";

test("the day view's words: zh and en have the same keys, and the same as the Mac", () => {
  const zh = strings("zh");
  const en = strings("en");
  const src = readFileSync(new URL("../src/i18n.ts", import.meta.url), "utf8");
  const keys = [...new Set([...src.matchAll(/"(day\.[a-z_.]+)":/g)].map((m) => m[1]!))].sort();
  expect(keys.length).toBeGreaterThan(20);
  const mac = readFileSync(new URL("../../desktop/internal/i18n/accounts.go", import.meta.url), "utf8");
  for (const k of keys) {
    expect(zh.t(k, 1, 2)).not.toBe(k);
    expect(en.t(k, 1, 2)).not.toBe(k);
    expect(mac).toContain(`"${k}":`);
  }
  expect(zh.t("day.problem.not_installed", "Claude Code")).toBe("没法细读你的信：这台电脑上没装 Claude Code，现在只看得到标题。");
  expect(en.t("day.held.not_urgent", 2)).toBe("2 not urgent, held (you chose Only urgent)");
});
