// No joined text (D291): nothing a person reads is built by joining words with a separator.
//
// "iPhone · Ducter", "连不上 · 最后在线 3 小时前", [harness, model, effort].join(" · "): each says
// several facts by gluing strings together with a dot, and the reader has to take them apart again.
// The rule (design/ui.md "No joined text"): each fact is its own element with its own role (a title,
// one secondary line that reads as a phrase, a state word with its dot, a muted time or count, an
// icon for a kind, a quiet chip for a source); plain-text surfaces (a push, a copied line) say one
// natural sentence. So a separator glyph in a client's words or view code is a mistake by default.
//
// Scanned: the web client, the Mac app, the iOS and Android shells, and the protocol and core words
// that reach a screen or a push. Comments are skipped; tests, fixtures and evals aren't scanned. Out
// of scope: the CLI's terminal output (packages/cli), logs, and the site's page titles.
// Run: bun scripts/check-joins.ts (bun test runs it too: scripts/joins.test.ts).
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { codeLines } from "./check-glyphs.ts";

const ROOT = join(import.meta.dir, "..");

const TREES: { dir: string; glob: string }[] = [
  { dir: "apps/web/src", glob: "**/*.{ts,tsx}" },
  { dir: "apps/desktop", glob: "**/*.go" },
  { dir: "apps/ios", glob: "**/*.{swift,strings,stringsdict}" },
  { dir: "apps/android/app/src/main", glob: "**/*.{kt,xml}" },
  { dir: "packages/protocol/src", glob: "**/*.ts" },
  { dir: "packages/core/src", glob: "**/*.ts" },
];
const SKIP = /(^|\/)(test|tests|fixtures|testdata|node_modules|build|eval)\/|_test\.go$|\.test\.tsx?$/;

/** Separators that join facts into one string: the middle dot, the bullet, the katakana dot. */
const JOINER = /[·•・]/u;

/**
 * Deliberate exceptions, each with its reason. A line matches when its file is `file` and, if
 * `has` is given, the line contains it. Keep this short: a new entry needs a reason a reviewer
 * would accept, not "it was already there".
 */
export const ALLOW: { file: string; has?: string; why: string }[] = [
  // The pre-D291 device name suffix is matched (to strip it), never shown.
  { file: "apps/web/src/format.ts", has: '/ · Ducter$/', why: "strips the old suffix" },
  { file: "apps/desktop/internal/store/store.go", has: '" · Ducter"', why: "strips the old suffix" },
  { file: "packages/core/src/auth.ts", has: " · (?:Ducter|", why: "the one-time rename of devices paired before D291" },
  { file: "packages/core/src/auth.ts", has: "LIKE '% · %'", why: "finds the devices to rename once (D291)" },
];

export function joins(text: string, ext: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  codeLines(text, ext).forEach((c, i) => {
    if (JOINER.test(c)) out.push({ line: i + 1, text: c.trim() });
  });
  return out;
}

export function scan(allow = ALLOW): string[] {
  const bad: string[] = [];
  for (const { dir, glob } of TREES) {
    for (const f of new Glob(glob).scanSync({ cwd: join(ROOT, dir) })) {
      const rel = `${dir}/${f}`;
      if (SKIP.test(rel) || /static\/app\.js$/.test(rel)) continue;
      const ext = f.split(".").pop()!;
      const text = readFileSync(join(ROOT, rel), "utf8");
      for (const j of joins(text, ext)) {
        if (allow.some((a) => a.file === rel && (!a.has || j.text.includes(a.has)))) continue;
        bad.push(`${rel}:${j.line}: ${j.text.slice(0, 160)}`);
      }
    }
  }
  return bad;
}

if (import.meta.main) {
  const bad = scan();
  if (bad.length) {
    console.error(`Joined text (D291; design/ui.md "No joined text"), ${bad.length} lines:\n${bad.join("\n")}`);
    process.exit(1);
  }
  console.log("joins: ok");
}
