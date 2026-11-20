// D443: small follow-ups of D425–D441 on the web. A filled detail named in the person's language in
// Done for you (D436); the size said once on a handed-over row (D428/D385); the Agent messaging
// pane's long fix button under its words at phone width (D433, checked at 390 with Chrome's device
// emulation, `.shots/followups-443/`).
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { A } from "../src/app.ts";
import { didOwn } from "../src/did.tsx";
import { strings } from "../src/i18n.ts";

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("Done for you names a filled detail in the person's language; an older home's row keeps its words", () => {
  const was = A.L;
  try {
    A.L = strings("zh");
    expect(didOwn({ id: "u1", kind: "filled", sub: "detail", at: "", line: "Phone", detail: "phone", who: { by: "you" } })).toBe("电话");
    expect(didOwn({ id: "u2", kind: "filled", sub: "detail", at: "", line: "Full name", detail: "name", who: { by: "you" } })).toBe("姓名");
    expect(didOwn({ id: "u3", kind: "filled", sub: "detail", at: "", line: "Phone", who: { by: "you" } })).toBe("Phone");
    A.L = strings("en");
    expect(didOwn({ id: "u1", kind: "filled", sub: "detail", at: "", line: "Phone", detail: "phone", who: { by: "you" } })).toBe("Phone");
    for (const lang of ["zh", "en"] as const)
      for (const k of ["name", "email", "phone", "address", "birthday", "passport_number", "passport_country", "passport_expiry", "known_traveler", "loyalty", "seat", "meal"])
        expect(strings(lang).t(`did.detail.${k}`)).not.toBe(`did.detail.${k}`);
  } finally {
    A.L = was;
  }
});

test("a to-do row's size pill gives way to a line that already says it (pile and hand-over sheet)", () => {
  for (const f of ["src/pile.tsx", "src/handover.tsx"]) expect(src(f)).toContain("sizeSaid(");
});

test("the Agent messaging pane: a state row's long fix drops under its words on a phone", () => {
  const css = src("static/app.css");
  expect(css).toMatch(/\.mem-g \.chat-row\.act-under \{ flex-wrap: wrap; \}/);
  expect((src("src/memory.tsx").match(/cls="act-under"/g) ?? []).length).toBe(3);
});
