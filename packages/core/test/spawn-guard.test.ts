// D523: no bare-name spawn of a tool Ducter installs. Bun.spawn looks a bare name up on the PATH the
// process started with unless it is given an env, and Bun.which with no PATH does the same
// (research/132), so a tool Ducter put in its own folder while running (hel's Claude Code, D518), or
// one the person installed since, reads as missing. Product code spawns these through `spawnNow`
// (protocol which.ts: resolved on PATH as it is now) and looks them up with `whichNow`.
import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { resolveArgv } from "@ducter/protocol/src/which.ts";

const ROOT = join(import.meta.dir, "../../..");
/** What Ducter puts on a computer (D363 agents and Node, D366 nmem and uv, the gh it installs) and the agents' own names. */
const INSTALLS = ["claude", "codex", "pi", "dsh", "agy", "node", "npm", "npx", "nmem", "uv", "uvx", "gh"];
const DIRS = ["packages/core/src", "packages/cli/src", "packages/runner/src", "packages/protocol/src", "packages/partner/src", "apps/web/src"];

function files(dir: string): string[] {
  let out: string[] = [];
  let names: string[] = [];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const n of names) {
    const p = join(dir, n);
    if (n === "node_modules") continue;
    if (statSync(p).isDirectory()) out = out.concat(files(p));
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

const sources = DIRS.flatMap((d) => files(join(ROOT, d))).map((p) => ({ file: relative(ROOT, p), text: readFileSync(p, "utf8") }));

test("no Bun.spawn of a tool Ducter installs by its bare name", () => {
  const bare = new RegExp(`Bun\\.spawn(?:Sync)?\\(\\s*\\[\\s*["'\`](${INSTALLS.join("|")})["'\`]`, "g");
  const found = sources.flatMap(({ file, text }) => [...text.matchAll(bare)].map((m) => `${file}: ${m[0]}`));
  expect(found).toEqual([]);
});

test("no Bun.which without the PATH as it is now", () => {
  const found = sources.flatMap(({ file, text }) =>
    text
      .split("\n")
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /Bun\.which\(/.test(l) && !/Bun\.which\([^)]*\{\s*PATH\s*:/.test(l))
      .map(({ l, i }) => `${file}:${i + 1}: ${l.trim()}`),
  );
  expect(found).toEqual([]);
});

test("the shared helper resolves a bare name on the PATH it is given, and keeps a path as it is", () => {
  expect(resolveArgv(["sh", "-c", "true"], { PATH: "/bin:/usr/bin" })[0]).toMatch(/^\/(usr\/)?bin\/sh$/);
  expect(resolveArgv(["/opt/x/agy", "models"], { PATH: "" })).toEqual(["/opt/x/agy", "models"]);
  expect(resolveArgv(["no-such-tool-here"], { PATH: "/bin" })).toEqual(["no-such-tool-here"]);
});
