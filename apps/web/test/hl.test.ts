// D214: the workbench's small highlighter: tokens per language, comments and template strings
// that span lines, markup prose never coloured as types, everything escaped.
import { expect, test } from "bun:test";
import { hlLine, hlLines, HL_CAP } from "../src/hl.ts";

test("keywords, strings, numbers, types and comments in code", () => {
  const [h] = hlLine(`const n: Tea = 180; // steep`, "ts");
  expect(h).toBe(`<span class="tk-k">const</span> n: <span class="tk-y">Tea</span> = <span class="tk-n">180</span>; <span class="tk-c">// steep</span>`);
  expect(hlLine(`print("hi")  # done`, "py")[0]).toContain(`<span class="tk-s">"hi"</span>`);
});

test("a block comment and a template string carry over to the next lines", () => {
  const lines = hlLines("/* one\ntwo */ let a = `x\ny`;", "a.ts");
  expect(lines[0]).toBe(`<span class="tk-c">/* one</span>`);
  expect(lines[1]).toStartWith(`<span class="tk-c">two */</span>`);
  expect(lines[2]).toBe(`<span class="tk-s">y\`</span>;`);
});

test("markup: tags and attributes coloured, prose left alone, all escaped", () => {
  const [h] = hlLine(`<footer class="x">Steep gently & sip</footer>`, "html");
  expect(h).toContain(`<span class="tk-t">&lt;footer</span>`);
  expect(h).toContain("Steep gently &amp; sip");
  expect(h).not.toContain(`tk-y">Steep`);
  expect(hlLine(`  color: #2b2118;`, "css")[0]).toContain(`<span class="tk-n">#2b2118</span>`);
});

test("past the cap a file is plain (escaped) text", () => {
  const big = "<b>\n" + "x".repeat(HL_CAP);
  expect(hlLines(big, "a.ts")[0]).toBe("&lt;b&gt;");
});
