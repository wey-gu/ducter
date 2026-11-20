// D440: a first answer with no plan. Fakes only (a fake network for every key check, a fake
// install of pi, the home's agents faked): the ways to a key by where the home is, a free Gemini
// or OpenRouter key thinking on a free model, a key whose pi isn't there yet answered twice (works,
// putting pi in place; then ready), and the hold that says nothing can think. Fake keys look fake.
import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KEY_ROUTES, keyRegion, keyRoutes, keyWords, recognizeKey, type ServerFrame } from "@ducter/protocol";
import { addKey, OPENROUTER_FREE_MODEL } from "../src/api-key.ts";
import { installAndWait } from "../src/agent-setup.ts";
import { createBrainHold } from "../src/brain-hold.ts";
import { FakeClock } from "../src/clock.ts";
import { startCore } from "../src/core.ts";
import { tempDir } from "./helpers.ts";
import { openLog } from "../src/log.ts";

// Shaped like the real ones so the shape check passes, and plainly fake.
const GEMINI = "AIza" + "FAKEfake0".repeat(3) + "FAKEfake";
const OPENROUTER = "sk-or-v1-" + "0".repeat(64);
const DS = "sk-" + "0".repeat(32);

let t = tempDir();
afterEach(() => {
  t.cleanup();
  t = tempDir();
});
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("the fake keys are recognised as the providers they stand for", () => {
  expect(recognizeKey(GEMINI)).toEqual(["google"]);
  expect(recognizeKey(OPENROUTER)).toEqual(["openrouter"]);
  expect(recognizeKey(DS)[0]).toBe("deepseek");
});

test("the ways to a key follow where the home is", () => {
  expect(keyRoutes({ tz: "Asia/Shanghai" }).map((r) => r.id)).toEqual(["kimi-voucher", "deepseek-topup"]);
  expect(keyRoutes({ tz: "Asia/Urumqi" })[0]!.id).toBe("kimi-voucher");
  expect(keyRoutes({ tz: "America/Los_Angeles" }).map((r) => r.id)).toEqual(["gemini", "openrouter-free"]);
  expect(keyRoutes({ tz: "Europe/Berlin" })[0]!.id).toBe("gemini");
  // Where Gemini's free tier isn't offered: a free OpenRouter key first.
  expect(keyRoutes({ tz: "Asia/Hong_Kong" }).map((r) => r.id)).toEqual(["openrouter-free", "deepseek-topup"]);
  expect(keyRoutes({ tz: "Europe/Moscow" })[0]!.id).toBe("openrouter-free");
  // No zone: a Chinese language counts as mainland China, a traditional one doesn't.
  expect(keyRegion({ lang: "zh" })).toBe("china");
  expect(keyRegion({ lang: "zh-Hant" })).toBe("elsewhere");
  expect(keyRegion({ lang: "en" })).toBe("elsewhere");
});

test("every way is the provider's own page, three steps in both languages, a provider Ducter can think with", () => {
  for (const r of Object.values(KEY_ROUTES)) {
    expect(r.url.startsWith("https://")).toBe(true);
    expect(r.steps).toHaveLength(3);
    for (const s of r.steps) expect(s.zh && s.en).toBeTruthy();
    expect(r.line.zh && r.line.en).toBeTruthy();
    // No counter word 件 in the copy (the Chinese style rule).
    expect(JSON.stringify(r)).not.toContain("件");
  }
  // The free Gemini tier may train on what is sent: said before signing up.
  expect(KEY_ROUTES.gemini.note?.en).toMatch(/improve its models/);
});

test("a free Gemini key thinks on a model of the free tier", async () => {
  const f = (async () => json(200, { models: [{ name: "models/gemini-3.8-flash" }] })) as unknown as typeof fetch;
  const r = await addKey(GEMINI, { dataDir: t.dir, lang: "en", fetch: f, canRun: (h) => h === "pi" });
  expect(r).toMatchObject({ ok: true, provider: "google", harness: "pi", model: "google/gemini-3.8-flash" });
  expect(readFileSync(join(t.dir, "keys.env"), "utf8")).toContain("GEMINI_API_KEY=");
});

test("an OpenRouter key with no credit bought thinks on a free model that calls tools; a paid one on the default", async () => {
  const free = (async () => json(200, { data: { is_free_tier: true, limit_remaining: null } })) as unknown as typeof fetch;
  const r = await addKey(OPENROUTER, { dataDir: t.dir, lang: "zh", fetch: free, canRun: (h) => h === "pi" });
  expect(r).toMatchObject({ ok: true, provider: "openrouter", model: OPENROUTER_FREE_MODEL });
  const paid = (async () => json(200, { data: { is_free_tier: false, limit_remaining: 12 } })) as unknown as typeof fetch;
  const p = await addKey(OPENROUTER, { dataDir: t.dir, lang: "zh", fetch: paid, canRun: (h) => h === "pi" });
  expect(p.ok).toBe(true);
  expect(p.model).toBeUndefined();
});

test("a good key whose pi isn't here yet: said to work at once, pi put in place, then ready", async () => {
  const f = (async () => json(200, { is_available: true })) as unknown as typeof fetch;
  let there = false;
  const told: unknown[] = [];
  const r = await addKey(DS, {
    dataDir: t.dir,
    lang: "zh",
    fetch: f,
    canRun: (h) => h === "pi" && there,
    prepare: async (h) => {
      expect(h).toBe("pi");
      there = true;
      return true;
    },
    onPreparing: (x) => told.push(x),
  });
  expect(told).toEqual([expect.objectContaining({ ok: true, preparing: true, harness: "pi" })]);
  expect(keyWords(told[0] as never).zh).toContain("一两分钟");
  expect(r).toMatchObject({ ok: true, harness: "pi" });
  expect(r.needs).toBeUndefined();
  // An install that fails falls back to what it was: kept, pi's own installer named.
  const failed = await addKey(DS, { dataDir: t.dir, lang: "zh", fetch: f, canRun: () => false, prepare: async () => false });
  expect(failed).toMatchObject({ ok: true, needs: "pi" });
  expect(failed.install).toContain("pi.dev");
});

test("installAndWait: done when the setup's row clears, false when it fails", async () => {
  let st: { phase: "queued" | "installing" | "failed" } | undefined = { phase: "queued" };
  const steps = [{ phase: "installing" as const }, undefined];
  const setup = { install: () => {}, state: () => ({ setup: st, installable: true }) };
  const sleep = async () => void (st = steps.shift());
  expect(await installAndWait(setup, "pi", { sleep })).toBe(true);
  st = { phase: "failed" };
  expect(await installAndWait({ install: () => {}, state: () => ({ setup: st, installable: true }) }, "pi", { sleep: async () => {} })).toBe(false);
});

test("the hold knows when nothing can think, and wakes what waited when something can", () => {
  const log = openLog({ path: join(t.dir, "log.db"), persona: "default" });
  const home = [{ harness: "claude-code", installed: false, loggedIn: false }, { harness: "pi", installed: false, loggedIn: true }];
  const hold = createBrainHold({ log, clock: new FakeClock(0), base: () => "claude-code", home: () => home });
  // A key kept for a pi that isn't there yet thinks nothing.
  expect(hold.blind()).toBe(true);
  let woke = 0;
  hold.onChange(() => woke++);
  hold.seen();
  expect(woke).toBe(0);
  home[1] = { harness: "pi", installed: true, loggedIn: true };
  hold.seen();
  expect(hold.blind()).toBe(false);
  expect(woke).toBe(1);
  hold.stop();
});

test("the home: first_screen offers the ways for its own zone; key_add answers twice while pi is put in place", async () => {
  const keyFetch = (async () => json(200, { is_available: true })) as unknown as typeof fetch;
  let there = false;
  const core = startCore({
    dataDir: t.dir,
    port: 0,
    batchMs: 5,
    keyFetch,
    keyCanRun: (h) => h === "pi" && there,
    keyPrepare: async () => {
      await Bun.sleep(30);
      there = true;
      return true;
    },
    keyTz: () => "Asia/Shanghai",
    deviceProbes: { cua: async () => null, harnesses: async () => [{ harness: "claude-code", installed: false, loggedIn: false }], kind: async () => "laptop" },
  });
  core.setPartner({ onTrigger: () => {} });
  try {
    const frames: ServerFrame[] = [];
    const raw: string[] = [];
    const ws = new WebSocket(core.url);
    ws.onmessage = (m) => (raw.push(String(m.data)), frames.push(JSON.parse(String(m.data))));
    await new Promise<void>((res) => (ws.onopen = () => res()));
    ws.send(JSON.stringify({ t: "hello", locale: "zh", client: "web", tz: "America/New_York" }));
    for (let i = 0; i < 300 && !frames.some((f) => f.t === "first_screen" && f.first.noBrain); i++) await Bun.sleep(10);
    const fs = frames.find((f) => f.t === "first_screen" && f.first.noBrain) as Extract<ServerFrame, { t: "first_screen" }>;
    // The home's zone, not the phone's: the key is used from the home's network.
    expect(fs.first.keyRoutes?.map((r) => r.id)).toEqual(["kimi-voucher", "deepseek-topup"]);
    ws.send(JSON.stringify({ t: "key_add", key: DS, clientId: "k1" }));
    for (let i = 0; i < 300 && frames.filter((f) => f.t === "key_add_result").length < 2; i++) await Bun.sleep(10);
    ws.close();
    const rs = frames.filter((f) => f.t === "key_add_result") as Extract<ServerFrame, { t: "key_add_result" }>[];
    expect(rs.map((r) => [r.clientId, !!r.result.preparing, r.result.ok])).toEqual([
      ["k1", true, true],
      ["k1", false, true],
    ]);
    expect(rs[1]!.result.needs).toBeUndefined();
    expect(raw.join("\n")).not.toContain(DS);
  } finally {
    core.stop();
  }
});
