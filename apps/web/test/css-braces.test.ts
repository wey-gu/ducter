// app.css is source, merged by hand when branches each append a tail. Two merges on 2026-11-18
// left a rule open (a tail cut before its closing brace), which swallowed every rule after it.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("app.css: every block closes, and none goes below zero", () => {
  const css = readFileSync(join(import.meta.dir, "../static/app.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  let depth = 0;
  let line = 1;
  for (const ch of css) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === "\n") line++;
    if (depth < 0) throw new Error(`app.css: a } with nothing open at line ${line}`);
  }
  expect(depth).toBe(0);
});
