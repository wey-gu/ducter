// The suite's 20 s per-test timeout lives on the command line (scripts/test/setup.ts says why: a
// preload's setDefaultTimeout reaches only the first file Bun runs). Without the flag, every file
// after the first gets Bun's 5 s, and a loaded machine fails on that alone.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

test("`bun run test` and CI carry --timeout; CI runs the suite through it", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  expect(pkg.scripts.test).toMatch(/^bun test --timeout (\d+)$/);
  expect(Number(/--timeout (\d+)/.exec(pkg.scripts.test)![1])).toBeGreaterThanOrEqual(20_000);
  const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
  const runs = [...ci.matchAll(/^\s+run: (bun (?:run )?test\b.*)$/gm)].map((m) => m[1]!);
  expect(runs.length).toBeGreaterThan(0);
  for (const r of runs) expect(r).toMatch(/^bun run test\b|--timeout \d+/);
});
