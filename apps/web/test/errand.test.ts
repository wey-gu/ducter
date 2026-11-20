// D436: 去付款 / Go to checkout on the web: every word in both languages, the same keys as the Mac,
// the card and a step routed to their own bodies, the live view's words for them, Done for you's line.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { errandWords } from "../src/i18n-errand.ts";
import { TABLES } from "../src/i18n.ts";

const src = (f: string) => readFileSync(join(import.meta.dir, "../src", f), "utf8");

test("zh and en carry the same errand words, and the Mac the same keys", () => {
  expect(Object.keys(errandWords.zh).sort()).toEqual(Object.keys(errandWords.en).sort());
  const mac = readFileSync(join(import.meta.dir, "../../desktop/internal/i18n/errand.go"), "utf8");
  for (const k of Object.keys(errandWords.zh)) expect(mac).toContain(`"${k}"`);
  for (const k of Object.keys(errandWords.zh)) expect(TABLES.zh[k]).toBe(errandWords.zh[k]!);
  expect(TABLES.zh["co.go"]).toBe("去付款");
  expect(TABLES.en["co.go"]).toBe("Go to checkout");
  expect(TABLES.zh["did.l.paid.checkout"]).toBe("在 %s 下了单");
  expect(TABLES.en["did.go.paid"]).toBe("You paid yourself at %s");
});

test("the card, a step and the live view use their own words", () => {
  const views = src("views.tsx");
  expect(views).toContain("if (d.checkout) return <CheckoutBody d={d} />;");
  expect(views).toContain("if (d.signIn?.step) return <StepBody d={d} />;");
  const live = src("live.tsx");
  expect(live).toContain("liveCard(lv.decisionId)");
  expect(live).toContain("card ? card.done : t(\"live.done\")");
  // The card never offers Pay: its Go opens the live view; Hold is its only answer of its own.
  const errand = src("errand.tsx");
  expect(errand).toContain("A.openLive(d.decisionId, c.site, liveSize())");
  expect(errand).not.toContain('A.decide(d.decisionId, "go")');
});
