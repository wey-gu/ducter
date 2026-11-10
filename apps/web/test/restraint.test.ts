// D172: proactive help never boasts of what it read. The phone's words for the accounts card and
// the conversation header carry no read counts, a quiet day shows nothing, and the morning note
// draws no left-out line (the partner says it only when asked).
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { TABLES } from "../src/i18n.ts";

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const READ_COUNT = /看了[^。；]*%d|%d\s*封信|\bread %d|%d emails|%d worth/i;

test("no card status or header line says how much was read, in zh or en", () => {
  for (const lang of ["zh", "en"] as const) {
    for (const [k, v] of Object.entries(TABLES[lang])) {
      if (/^(card\.status|header)\./.test(k)) expect(`${k}: ${v}`).not.toMatch(READ_COUNT);
    }
    expect(TABLES[lang]["header.quiet_day"]).toBeUndefined();
    expect(TABLES[lang]["card.status.watching"]).toBeString();
  }
});

test("the card's status line and the note never draw counts or the left-out line", () => {
  expect(src("accounts.tsx")).not.toMatch(/readToday|worthToday/);
  expect(src("finds.tsx")).not.toMatch(/leftOut/);
  expect(src("app.ts")).not.toMatch(/quiet_day|quietMorning/);
});
