// No emoji, and no symbol a phone can't draw as text, in anything a person reads (D211).
//
// iOS draws a symbol from the system's emoji font whenever no text font in the stack has it: the
// New task sheet's "⌘↩" key hint drew its ↩ from the emoji font, a tile among the words. U+FE0E doesn't save it (in
// WebKit on iOS it turned every such symbol into a missing-glyph box), so the rule is a list: a
// symbol may appear in user-facing text only once it was seen drawn as text by the app's own font
// stack on iOS (the probe in D211: Bricolage, PingFang SC, then the system's). Anything else is a
// drawn glyph (views.tsx, components.go) or plain words.
//
// Scanned: the web client, the Mac app, the iOS and Android shells, the site, the user docs and
// the core's outgoing words. Comments are skipped; tests and fixtures aren't scanned.
// Run: bun scripts/check-glyphs.ts (bun test runs it too: scripts/glyphs.test.ts).
import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

const TREES: { dir: string; glob: string }[] = [
  { dir: "apps/web/src", glob: "**/*.{ts,tsx}" },
  { dir: "apps/web/static", glob: "*.{html,css,webmanifest}" },
  { dir: "apps/desktop", glob: "**/*.go" },
  { dir: "apps/ios", glob: "**/*.{swift,strings,stringsdict,plist}" },
  { dir: "apps/android/app/src/main", glob: "**/*.{kt,xml}" },
  { dir: "apps/site/src", glob: "**/*.{astro,ts,md,mdx}" },
  { dir: "docs", glob: "**/*.md" },
  { dir: "packages/core/src", glob: "**/*.ts" },
];
const SKIP = /(^|\/)(test|tests|fixtures|testdata|node_modules|build)\/|_test\.go$|\.test\.tsx?$/;

/** Symbols seen drawn as text on iOS by the app's font stack (D211's probe). Add one only after
 *  the same check: a symbol outside this list renders as an emoji or a box on someone's phone. */
const SEEN_AS_TEXT = new Set([..."←→↔↗⇧⌘⌥⌃⏎✓✗×−⋯≤≥≈▾①②"]);
/** Latin-1 and letterlike marks every text font has (Unicode lists them as emoji too). */
const TEXT_MARKS = new Set([..."©®™"]);

// Symbol blocks where a phone's text fonts have gaps: arrows, maths, technical, enclosed,
// shapes, miscellaneous symbols, dingbats.
const SYMBOL_BLOCK = /[\u2190-\u21FF\u2200-\u22FF\u2300-\u23FF\u2460-\u24FF\u25A0-\u25FF\u2600-\u26FF\u2700-\u27BF\u2900-\u297F\u2B00-\u2BFF]/u;
const EMOJI = /\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator}/u;
const SELECTOR = /[\uFE0E\uFE0F\u20E3]/u;

/** Each line's code without its comments (line comments, block comments across lines, HTML comments); Markdown whole. */
export function codeLines(text: string, ext: string): string[] {
  if (ext === "md" || ext === "mdx") return text.split("\n");
  let inBlock = false;
  return text.split("\n").map((raw) => {
    let line = raw;
    let out = "";
    while (line) {
      if (inBlock) {
        const end = line.indexOf("*/");
        if (end < 0) return out;
        line = line.slice(end + 2);
        inBlock = false;
      }
      const open = line.indexOf("/*");
      if (open < 0) break;
      out += line.slice(0, open);
      line = line.slice(open + 2);
      inBlock = true;
    }
    out += line;
    return out.replace(/<!--.*?-->/g, "").replace(/(^|[\s;,(){}])\/\/.*$/, "$1");
  });
}

export function offenders(text: string, ext: string): { line: number; col: number; ch: string; why: string }[] {
  const out: { line: number; col: number; ch: string; why: string }[] = [];
  codeLines(text, ext).forEach((c, i) => {
    for (const m of c.matchAll(/./gu)) {
      const ch = m[0];
      if (SEEN_AS_TEXT.has(ch) || TEXT_MARKS.has(ch)) continue;
      const why = SELECTOR.test(ch)
        ? "a variation selector (U+FE0E draws a box on iOS; U+FE0F asks for the emoji)"
        : EMOJI.test(ch)
          ? "an emoji"
          : SYMBOL_BLOCK.test(ch)
            ? "a symbol not seen drawn as text on iOS"
            : "";
      if (why) out.push({ line: i + 1, col: m.index! + 1, ch, why });
    }
  });
  return out;
}

export function scan(): string[] {
  const bad: string[] = [];
  for (const { dir, glob } of TREES) {
    for (const f of new Glob(glob).scanSync({ cwd: join(ROOT, dir) })) {
      const rel = `${dir}/${f}`;
      if (SKIP.test(rel) || /static\/app\.js$/.test(rel)) continue;
      const ext = f.split(".").pop()!;
      const text = readFileSync(join(ROOT, rel), "utf8");
      for (const o of offenders(text, ext)) bad.push(`${rel}:${o.line}:${o.col} ${o.ch} U+${o.ch.codePointAt(0)!.toString(16).toUpperCase()}: ${o.why}`);
    }
  }
  return bad;
}

if (import.meta.main) {
  const bad = scan();
  if (bad.length) {
    console.error(`Use a drawn glyph or words instead:\n${bad.join("\n")}`);
    process.exit(1);
  }
  console.log("glyphs: ok");
}
