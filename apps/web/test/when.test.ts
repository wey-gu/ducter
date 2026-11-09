// Human times: the phone and the desktop (apps/desktop/internal/i18n/when_test.go) pass the same
// cases (packages/protocol/fixtures/when.json).
import { expect, test } from "bun:test";
import fixture from "../../../packages/protocol/fixtures/when.json";
import { clock, day, md, when } from "../src/format.ts";
import { strings } from "../src/i18n.ts";

const now = new Date(fixture.now).getTime();
for (const lang of ["zh", "en"] as const) {
  const L = strings(lang);
  for (const c of fixture.cases) {
    test(`${lang} ${c.fn} ${c.at}`, () => {
      const at = new Date(c.at).toISOString();
      const got = c.fn === "clock" ? clock(at) : c.fn === "day" ? day(L, at, now) : c.fn === "md" ? md(at) : when(L, at, now);
      expect(got).toBe(c[lang]);
    });
  }
}
