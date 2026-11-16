// D298: a pasted key, checked against a fake network that spends nothing, kept in keys.env.
import { afterEach, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { addKey } from "../src/api-key.ts";
import { tempDir } from "./helpers.ts";

const DS = "sk-0123456789abcdef0123456789abcdef";
const KIMI = "sk-aB3dE5gH7jK9mN1pQ2rS4tU6vW8xY0zAaB3dE5gH7jK9mN1p";
const OPENAI = "sk-proj-" + "a".repeat(74) + "T3BlbkFJ" + "b".repeat(74);

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;
const fake = (routes: Record<string, Route>) => {
  const calls: { url: string; auth?: string }[] = [];
  const f = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const h = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, auth: h.authorization ?? h["x-api-key"] });
    const host = new URL(url).host;
    const r = routes[host];
    if (!r) throw Object.assign(new Error("getaddrinfo ENOTFOUND " + host), { code: "ENOTFOUND" });
    return r(url, init);
  }) as typeof fetch;
  return { f, calls };
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let t = tempDir();
afterEach(() => {
  t.cleanup();
  t = tempDir();
});
const piOnly = (h: string) => h === "pi";
const keys = () => readFileSync(join(t.dir, "keys.env"), "utf8");

test("a DeepSeek key with money in it is kept for pi when DeepSeek Harness isn't installed", async () => {
  const { f, calls } = fake({ "api.deepseek.com": () => json(200, { is_available: true, balance_infos: [{ currency: "CNY", total_balance: "10.00" }] }) });
  const r = await addKey(`  DEEPSEEK_API_KEY="${DS}"\n`, { dataDir: t.dir, lang: "zh", fetch: f, canRun: piOnly });
  expect(r).toMatchObject({ ok: true, provider: "deepseek", harness: "pi", model: "deepseek/deepseek-flash", checked: true });
  expect(JSON.stringify(r)).not.toContain(DS);
  expect(calls).toEqual([{ url: "https://api.deepseek.com/user/balance", auth: `Bearer ${DS}` }]);
  expect(keys()).toContain(`DEEPSEEK_API_KEY=${DS}\n`);
  expect(statSync(join(t.dir, "keys.env")).mode & 0o777).toBe(0o600);
  // Again: replaced, never two lines.
  await addKey(DS, { dataDir: t.dir, lang: "zh", fetch: f, canRun: piOnly });
  expect(keys().match(/DEEPSEEK_API_KEY=/g)!.length).toBe(1);
});

test("with DeepSeek Harness installed, it thinks with DeepSeek Harness", async () => {
  const { f } = fake({ "api.deepseek.com": () => json(200, { is_available: true }) });
  const r = await addKey(DS, { dataDir: t.dir, lang: "en", fetch: f, canRun: () => true });
  expect(r).toMatchObject({ ok: true, harness: "deepseek-harness" });
  expect(r.model).toBeUndefined();
});

test("no balance, a wrong key, and Model Studio's look-alike key", async () => {
  let { f } = fake({ "api.deepseek.com": () => json(200, { is_available: false }) });
  expect(await addKey(DS, { dataDir: t.dir, lang: "zh", fetch: f, canRun: piOnly })).toMatchObject({ ok: false, provider: "deepseek", reason: "no_balance" });
  ({ f } = fake({ "api.deepseek.com": () => json(402, { error: { message: "Insufficient Balance" } }) }));
  expect(await addKey(DS, { dataDir: t.dir, lang: "zh", fetch: f, canRun: piOnly })).toMatchObject({ reason: "no_balance" });
  ({ f } = fake({ "api.deepseek.com": () => json(401, {}), "dashscope.aliyuncs.com": () => json(401, {}) }));
  expect(await addKey(DS, { dataDir: t.dir, lang: "zh", fetch: f, canRun: piOnly })).toEqual({ ok: false, reason: "wrong" });
  // DeepSeek doesn't know it, Model Studio does: right, but not something Ducter thinks with yet; not kept.
  ({ f } = fake({ "api.deepseek.com": () => json(401, {}), "dashscope.aliyuncs.com": () => json(200, { data: [] }) }));
  expect(await addKey(DS, { dataDir: t.dir, lang: "zh", fetch: f, canRun: piOnly })).toMatchObject({ ok: false, provider: "dashscope", reason: "unsupported" });
  expect(() => keys()).toThrow();
});

test("a Kimi key from the China console, and one from the international console", async () => {
  let { f } = fake({ "api.moonshot.cn": () => json(200, { data: { available_balance: 12.5 } }), "api.moonshot.ai": () => json(401, {}) });
  expect(await addKey(KIMI, { dataDir: t.dir, lang: "zh", fetch: f, canRun: piOnly })).toMatchObject({ ok: true, provider: "moonshot-cn", model: "moonshotai-cn/kimi-k2.6" });
  ({ f } = fake({ "api.moonshot.cn": () => json(401, {}), "api.moonshot.ai": () => json(200, { data: { available_balance: 3 } }) }));
  expect(await addKey(KIMI, { dataDir: t.dir, lang: "zh", fetch: f, canRun: piOnly })).toMatchObject({ ok: true, provider: "moonshot", model: "moonshotai/kimi-k2.6" });
  expect(keys()).toContain(`MOONSHOT_API_KEY=${KIMI}`);
});

test("blocked abroad, the network down, a busy provider, a shape that isn't a key", async () => {
  const none = fake({}).f;
  expect(await addKey(OPENAI, { dataDir: t.dir, lang: "zh", fetch: none, canRun: piOnly })).toMatchObject({ ok: false, provider: "openai", reason: "blocked", abroad: true });
  expect(await addKey(DS, { dataDir: t.dir, lang: "zh", fetch: none, canRun: piOnly })).toMatchObject({ ok: false, reason: "offline" });
  const busy = fake({ "api.openai.com": () => json(429, {}) }).f;
  expect(await addKey(OPENAI, { dataDir: t.dir, lang: "en", fetch: busy, canRun: piOnly })).toMatchObject({ reason: "limited" });
  expect(await addKey("my password is hunter2", { dataDir: t.dir, lang: "en", fetch: none })).toEqual({ ok: false, reason: "shape" });
});

test("a good key on a computer that can't run pi yet: kept, with pi's own installer named", async () => {
  const { f } = fake({ "api.openai.com": () => json(200, { data: [] }) });
  const r = await addKey(OPENAI, { dataDir: t.dir, lang: "en", fetch: f, canRun: () => false });
  expect(r).toMatchObject({ ok: true, provider: "openai", harness: "pi", needs: "pi" });
  expect(r.install).toContain("pi.dev/install.sh");
  expect(keys()).toContain("OPENAI_API_KEY=");
});

test("a Claude Code sign-in token is kept for Claude Code without a call", async () => {
  const tok = "sk-ant-oat01-" + "x".repeat(90);
  const { f, calls } = fake({});
  const r = await addKey(tok, { dataDir: t.dir, lang: "en", fetch: f, canRun: (h) => h === "claude-code" });
  expect(r).toMatchObject({ ok: true, provider: "claude-token", harness: "claude-code", checked: false });
  expect(calls).toEqual([]);
  expect(keys()).toContain(`CLAUDE_CODE_OAUTH_TOKEN=${tok}`);
});
