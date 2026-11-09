// Keys never render (D148): every rendered surface gets text with credentials hidden. The desktop
// (apps/desktop/internal/redact) passes the same cases (fixtures/redact.json).
import { expect, test } from "bun:test";
import cases from "../fixtures/redact.json";
import { HIDDEN, hasHidden, redact, redactDeep } from "../src/redact.ts";

for (const c of cases) test(`redact ${c.in.slice(0, 50)}`, () => expect(redact(c.in)).toBe(c.want));

test("redactDeep hides every string and whole secret-named fields, and keeps what didn't change", () => {
  const ev = { seq: 3, kind: "task_open", body: { brief: "use nmem_ct_8fK2pQx7Lm4vRz9TbW3y", title: "Connect Mem", raw: { headers: { authorization: "Basic dXNlcjpwYXNz" } } } };
  const out = redactDeep(ev);
  expect(out.body.brief).toBe(`use nmem_ct_${HIDDEN}`);
  expect(out.body.raw.headers.authorization).toBe(HIDDEN);
  expect(out.body.title).toBe("Connect Mem");
  expect(ev.body.brief).toContain("8fK2"); // the input is never changed
  const same = { a: "plain", b: [1, "two"] };
  expect(redactDeep(same)).toBe(same);
  expect(hasHidden(out.body.brief)).toBe(true);
});
