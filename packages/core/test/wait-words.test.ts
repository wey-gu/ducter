// D261: a wait says what it waits for in words a person reads on On hand. A reason written as an
// agent's notes, and a check that only reads the clock, are refused at the source.
import { expect, test } from "bun:test";
import { clockCheck, shorthand } from "../src/work.ts";

test("a reason in notes is caught; plain words, units and versions are not", () => {
  expect(shorthand("requests仍4+mentions7去重9…45minwait")).toBe("mentions7");
  for (const ok of ["PR #1592 的 CI 通过", "PR #1592's CI passes", "the p99 drops under 41ms on arm64", "tokio 1.42 lands on crates.io", "gpt5 and es2022 builds pass", "域名续费的邮件", "the 2nd run of v1.4.4 finishes"]) {
    expect(shorthand(ok)).toBe("");
  }
});

test("a check that only reads the clock is not a wait", () => {
  expect(clockCheck({ argv: ["date", "-u", "+%s"], succeedWhen: { matches: "^17[0-9]{8}$" } })).toBe(true);
  expect(clockCheck({ argv: ["gh", "pr", "checks", "9811"], succeedWhen: {} })).toBe(false);
});
