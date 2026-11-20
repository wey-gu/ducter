// D440: the web's half of a first answer with no plan: the ways to a key arrive with the first
// screen, the card's words exist in both languages (the same as the Mac's i18n/firstwords.go), and
// both answers to one key (works and setting up, then ready) reach the store under one clientId.
import { expect, test } from "bun:test";
import { keyRoutes } from "@ducter/protocol";
import { strings } from "../src/i18n.ts";
import { Store } from "../src/store.ts";

test("the card's words, zh and en", () => {
  for (const lang of ["zh", "en"] as const)
    for (const k of ["key.route.none", "key.route.go", "key.route.other", "key.paste.preparing"]) expect(strings(lang).t(k)).not.toBe(k);
  expect(strings("zh").t("key.route.go", "Kimi")).toBe("去 Kimi 拿一个");
  expect(strings("en").t("key.route.other", "OpenRouter")).toBe("Or use OpenRouter");
});

test("the first screen carries the ways; both answers to one key reach the store", () => {
  const s = new Store();
  s.apply({ t: "first_screen", first: { visit: "first", starters: [], noBrain: true, keyRoutes: keyRoutes({ tz: "Europe/Berlin" }) } as never });
  expect(s.first?.keyRoutes?.map((r) => r.id)).toEqual(["gemini", "openrouter-free"]);
  s.apply({ t: "key_add_result", clientId: "k1", result: { ok: true, provider: "google", preparing: true } });
  expect(s.keyResults.get("k1")?.preparing).toBe(true);
  s.keyResults.delete("k1");
  s.apply({ t: "key_add_result", clientId: "k1", result: { ok: true, provider: "google", harness: "pi" } });
  expect(s.keyResults.get("k1")?.preparing).toBeUndefined();
});
