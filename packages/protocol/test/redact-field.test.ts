// D284's note of 2026-11-19: the secret-named field is found from each secret's name on
// (replaceField) instead of by an unanchored pattern over the whole text. The old pattern stays here
// as the oracle; both give the same text over a generated corpus. The desktop's
// apps/desktop/internal/redact/field_test.go checks its port the same way.
import { expect, test } from "bun:test";
import { HIDDEN, redact, replaceField } from "../src/redact.ts";

const FIELD_BEFORE =
  /((?:[A-Za-z0-9]+[_\-])*(?:api[_\-]?key|apikey|access[_\-]?key|secret|token|password|passwd|pwd|credential|auth[_\-]?key|private[_\-]?key|connect[_\-]?code)(?:[_\-][A-Za-z0-9]+)*\\?["']?\s*(?:[:=]|\s)\s*\\?["']?)([^\s"'`,;<>()\[\]{}\\•]{12,})/gi;

// The last step as redactWith runs it, with HIDDEN in place of its marker.
const keyLike = (v: string) => v.length >= 12 && /[0-9]/.test(v) && /[A-Za-z]/.test(v) && (!v.includes("/") || /^[A-Za-z0-9+/]{20,}={0,2}$/.test(v)) && !/^v?\d+(\.\d+)+$/.test(v);
const f = (m: string, head: string, v: string, at: number, all: string) => (keyLike(v) && !all.startsWith("", at + m.length) ? `${head}x` : m);
const before = (s: string) => s.replace(FIELD_BEFORE, f);
const now = (s: string) => replaceField(s, f);

const parts = [
  "api_key", "API-KEY", "apikey", "ApiKey", "access_key", "x-api-token", "MY_SECRET_KEY", "secret", "Secret", "token", "TOKEN", "tokenizer",
  "password", "passwd", "pwd", "credential", "auth_key", "private-key", "connect_code", "my", "x", "OPENAI", "nmem", "db", "_", "-", "__", "--",
  "=", ":", " ", "  ", "\t", "\n", '"', "'", '\\"', "\\", ",", ";", "(", ")", "{", "}", "[", "]", "<", ">", "`", "•", "", "0",
  "a3f9c2e81b7d4f6a9c0e2b5d8f1a4c7e", "Tr0ub4dor&3-horse-battery", "short1", "getTokenFromEnv", "1.2.3.4", "/etc/ducter/keys/home-2026.pem",
  "QWxhZGRpbjpvcGVuIHNlc2FtZQ1234==", "abcdefghijklmnop", "0123456789012345", "v12.0.33", "max_tokens", "4096", "used", "on", "the",
  "Key", "ſecret", "API_KEY", "İ", "é", "ToKeN", "pAsSwOrD", "AUTH-key", "Connect_Code",
];
const values = parts.slice(52);

// A small seeded generator, so the corpus is the same every run.
let seed = 386;
const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed % n);
const pick = (xs: string[]) => xs[rnd(xs.length)]!;

function corpus(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    let s = "";
    if (rnd(2) === 0) {
      for (let k = rnd(3); k > 0; k--) s += pick(["my", "OPENAI", "x", "db", "nmem", "a1"]) + pick(["_", "-", "", "__"]);
      s += pick(parts.slice(0, 19));
      for (let k = rnd(2); k > 0; k--) s += pick(["_", "-"]) + pick(["key", "ID", "v2", "token", "x"]);
      s += pick(["=", ": ", " ", '": "', "='", '\\"=\\"', "\n", " = ", ":\t"]);
      s += pick(values);
    }
    for (let k = rnd(14) + 1; k > 0; k--) s += pick(parts);
    out.push(s);
  }
  return out;
}

test("the field found from each name gives the old pattern's text", () => {
  let hid = 0;
  for (const s of corpus(200_000)) {
    const got = now(s);
    if (got !== before(s)) expect({ s, got }).toEqual({ s, got: before(s) });
    if (got !== s) hid++;
  }
  // The corpus reaches the pattern: many of its texts have a value hidden.
  expect(hid).toBeGreaterThan(10_000);
});

test("the prefix forms, mixed case and across lines (fixtures/redact.json pins them too)", () => {
  expect(redact("export ANTHROPIC_API_KEY=a3f9c2e81b7d4f6a9c0e2b5d8f1a4c7e")).toBe(`export ANTHROPIC_API_KEY=${HIDDEN}`);
  expect(redact("--header x-api-token: Zx81kPq0aB7cD9eF2gH4")).toBe(`--header x-api-token: ${HIDDEN}`);
});
