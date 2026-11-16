// D298: a pasted key's shape names its provider (research/102); the check decides among several.
import { expect, test } from "bun:test";
import { cleanKey, keyWords, recognizeKey } from "../src/api-keys.ts";

const hex = (n: number) => "0123456789abcdef".repeat(8).slice(0, n);
const alnum = (n: number) => "aB3dE5gH7jK9mN1pQ2rS4tU6vW8xY0zA".repeat(4).slice(0, n);

test("distinct prefixes name one provider", () => {
  expect(recognizeKey(`sk-ant-api03-${alnum(93)}AA`)).toEqual(["anthropic"]);
  expect(recognizeKey(`sk-ant-oat01-${alnum(80)}`)).toEqual(["claude-token"]);
  expect(recognizeKey(`sk-or-v1-${hex(64)}`)).toEqual(["openrouter"]);
  expect(recognizeKey(`sk-proj-${alnum(74)}T3BlbkFJ${alnum(74)}`)).toEqual(["openai"]);
  expect(recognizeKey(`sk-${alnum(20)}T3BlbkFJ${alnum(20)}`)).toEqual(["openai"]);
  expect(recognizeKey(`AIza${alnum(35)}`)).toEqual(["google"]);
  expect(recognizeKey(`xai-${alnum(80)}`)).toEqual(["xai"]);
  expect(recognizeKey(`gsk_${alnum(52)}`)).toEqual(["groq"]);
  expect(recognizeKey(`${hex(32)}.${alnum(16)}`)).toEqual(["zhipu-cn", "zai"]);
});

test("a plain sk- key is a guess the check settles: DeepSeek's 32 first, Kimi's longer ones first", () => {
  expect(recognizeKey(`sk-${hex(32)}`)).toEqual(["deepseek", "dashscope"]);
  expect(recognizeKey(`sk-${alnum(48)}`)).toEqual(["moonshot-cn", "moonshot"]);
  expect(recognizeKey(`sk-${alnum(24)}_x`)[0]).toBe("deepseek");
});

test("what was pasted is cleaned: quotes, NAME=, Bearer, spaces around", () => {
  const k = `sk-${hex(32)}`;
  for (const raw of [`  ${k}\n`, `"${k}"`, `DEEPSEEK_API_KEY=${k}`, `export DEEPSEEK_API_KEY='${k}'`, `Bearer ${k}`]) expect(cleanKey(raw)).toBe(k);
  expect(recognizeKey("hello there, this is not a key")).toEqual([]);
  expect(recognizeKey("sk-short")).toEqual([]);
});

test("every result has the partner's words in both languages, and never the key", () => {
  const k = `sk-${hex(32)}`;
  for (const r of [
    { ok: true, provider: "deepseek" as const, checked: true },
    { ok: true, provider: "deepseek" as const, needs: "pi" as const },
    { ok: false, reason: "shape" as const },
    { ok: false, reason: "wrong" as const },
    { ok: false, provider: "deepseek" as const, reason: "wrong" as const },
    { ok: false, provider: "deepseek" as const, reason: "no_balance" as const },
    { ok: false, provider: "openai" as const, reason: "blocked" as const, abroad: true },
    { ok: false, provider: "deepseek" as const, reason: "offline" as const },
    { ok: false, provider: "dashscope" as const, reason: "unsupported" as const },
    { ok: false, provider: "groq" as const, reason: "limited" as const },
  ]) {
    const w = keyWords(r);
    expect(w.zh.length).toBeGreaterThan(5);
    expect(w.en.length).toBeGreaterThan(5);
    expect(w.zh + w.en).not.toContain(k);
    expect(w.zh + w.en).not.toContain(" · ");
  }
  expect(keyWords({ ok: false, provider: "openai", reason: "blocked", abroad: true }).zh).toContain("代理");
});
