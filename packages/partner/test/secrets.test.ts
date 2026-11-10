// D174 (research/48 F7): one secret detector. What a task is given (the partner's brief guard)
// and what a screen shows (protocol/redact.ts, D152) find the same keys; the only key a task may
// get is a Nowledge Mem connect code the user pasted in their own words, as D152's scenario needs.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import cases from "../../protocol/fixtures/redact.json";
import { redact } from "../../protocol/src/redact.ts";
import { redactSecrets } from "../src/index.ts";

test("every key the screens hide never reaches a task", () => {
  let checked = 0;
  for (const c of cases as { in: string; want: string }[]) {
    if (redact(c.in) === c.in) continue; // strict may find more (a long key with no digit); never less
    const out = redactSecrets(c.in);
    expect(out).toContain("[secret removed");
    // What the screen hides is gone from the brief too: every run the screen replaced.
    for (const part of c.in.split(/[\s"'=:,@]+/).filter((p) => p.length >= 12 && !c.want.includes(p))) expect(out).not.toContain(part);
    checked++;
  }
  expect(checked).toBeGreaterThan(10);
});

test("a connect code the user pasted to connect stays; any other key, or a code they didn't give, goes", () => {
  const code = "nmem_ct_8fK2pQx7Lm4vRz9TbW3y";
  const user = [`用这个连上 Mem：${code}`];
  expect(redactSecrets(`Connect Nowledge Mem with ${code}, then run nmem doctor.`, user)).toContain(code);
  expect(redactSecrets(`Connect Nowledge Mem with ${code}.`)).not.toContain(code); // not the user's words this turn
  const key = "sk-ant-api03-" + "Ab3".repeat(12);
  expect(redactSecrets(`Put ${key} in .env`, [`my key ${key}`])).not.toContain(key); // only connect codes
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
  expect(redactSecrets(`call it with ${jwt}`, [jwt])).not.toContain(jwt);
});

test("the partner keeps no secret list of its own", () => {
  const src = readFileSync(new URL("../src/partner.ts", import.meta.url), "utf8");
  expect(src).not.toMatch(/gh\[pousr\]|AKIA\[0-9A-Z\]|SECRET_RE\b/);
});
