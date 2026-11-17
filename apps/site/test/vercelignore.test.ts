import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Vercel uploads only what .vercelignore lets through; every file outside apps/site that the
// site's build reads must be let through, or the deploy fails while local builds pass.
test("files the site's build reads from outside apps/site are uploaded to Vercel", () => {
  const ignore = readFileSync(join(import.meta.dir, "../../../.vercelignore"), "utf8").split("\n").map((l) => l.trim());
  for (const needed of ["!/CHANGELOG.md", "!/docs", "!/skills"]) expect(ignore).toContain(needed);
});
