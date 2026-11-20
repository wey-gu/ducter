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

test("D443: a good key clears the field (as the Mac does), a refused one stays to be fixed", async () => {
  const { A } = await import("../src/app.ts");
  const { keyJustAdded, keyTyped, submitKey, typeKey } = await import("../src/first-words.tsx");
  const sent: unknown[] = [];
  const send = A.send;
  const changed = A.changed;
  A.send = ((f: unknown) => void sent.push(f)) as typeof A.send;
  A.changed = (() => {}) as typeof A.changed;
  try {
    typeKey("not-a-real-key-at-all-0000");
    const bad = submitKey(keyTyped(), "conv")!;
    expect(sent.length).toBe(1);
    A.S.keyResults.set(bad, { ok: false, reason: "refused" } as never);
    keyJustAdded();
    expect(keyTyped()).toBe("not-a-real-key-at-all-0000");
    typeKey("not-a-real-key-at-all-1111");
    const good = submitKey(keyTyped(), "conv")!;
    A.S.keyResults.set(good, { ok: true, provider: "google", preparing: true } as never);
    keyJustAdded();
    expect(keyTyped()).toBe("");
    expect(submitKey("again-while-preparing-xxxx", "conv")).toBeUndefined(); // the final answer is still awaited
    A.S.keyResults.set(good, { ok: true, provider: "google", harness: "pi" } as never);
    keyJustAdded();
    expect(keyTyped()).toBe("");
  } finally {
    A.send = send;
    A.changed = changed;
  }
});
