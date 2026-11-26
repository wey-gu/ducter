// D589: Settings, every pane end to end (the fifth round). What the walk changed on the web, kept.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { todoWords } from "../src/i18n-todos.ts";

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

describe("D589", () => {
  test("正在聊 is the shared state word on the actions' line, where the others have 换到", () => {
    const s = src("partners.tsx");
    const acts = s.slice(s.indexOf('<span class="partner-acts">'));
    expect(acts.indexOf('<Tag text={t("partners.talking")}')).toBeGreaterThan(-1);
    expect(acts.indexOf('<Tag text={t("partners.talking")}')).toBeLessThan(acts.indexOf('t("partners.switch"'));
    // never a third line under the words any more
    expect(s).not.toContain('<small>{t("partners.talking")}</small>');
  });

  test("a phone number in Your details never breaks at its spaces", () => {
    expect(src("autofill.tsx")).toMatch(/d\.key === "phone" \? d\.value!\.replace\(\/ \/g, "\\u00a0"\)/);
  });

  test("To-do sources with nothing added never says 还能加上", () => {
    expect(src("todos.tsx")).toContain('t(f.sources.length ? "todos.add.title" : "todos.add.first")');
    for (const lang of ["zh", "en"] as const) expect(todoWords[lang]["todos.add.first"]).toBeTruthy();
    expect(todoWords.zh["todos.add.first"]).not.toContain("还");
  });
});
