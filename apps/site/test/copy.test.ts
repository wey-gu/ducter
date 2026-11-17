// The site speaks from the visitor's side (D326, the copy pass in design/site.md): no fact strips
// joined with a dot (D291), and none of the builders' words a visitor would have to look up.
//
// Two layers. The source scan always runs (CI has no site build): every site source line outside
// comments, and the words a visitor reads in the templates and the scripts' strings. The rendered
// scan runs when apps/site/dist exists (after `bun run build`) and reads the built pages' visible
// text, alt text, labels and meta descriptions, so a string composed at build time is caught too.
// Page titles are held too (D346): "page – site" with an en dash, never a dot ("Install – Ducter
// docs"). Every built page is scanned for a joined title; the docs pages' own words are checked in
// their Markdown by scripts/check-joins.ts.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { Glob } from "bun";

const SITE = join(import.meta.dir, "..");

/** Each line with its comments taken out (block, line and HTML comments), as check-glyphs does. */
function codeLines(text: string): string[] {
  const noBlocks = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, "")).replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ""));
  return noBlocks.split("\n").map((l) => l.replace(/(^|[\s;,(){}])\/\/.*$/, "$1"));
}
const JOINER = /[·•・]/u;

/**
 * Words a visitor shouldn't meet on the site, each with why. Keep it tight: a word joins only when
 * it's a builder's word with a plain one ready ("Intel or AMD" for x64), never to police style.
 */
export const INTERNAL: { re: RegExp; why: string }[] = [
  { re: /\bOAR\b/, why: "the internal task runtime's name" },
  // DeepSeek Harness is a product a visitor signs in to; "harness" alone is our word for any of them.
  { re: /\b(?<!DeepSeek )harness(es)?\b/i, why: "say AI agent" },
  { re: /\bevals?\b/i, why: "how we test the partner, not something a visitor uses" },
  { re: /\bworkers?\b/i, why: "the internal name for a computer that does tasks; say computer" },
  { re: /\b(tarball|binar(y|ies))\b/i, why: "build jargon; say the app or the file" },
  { re: /\b(arm64|x64|x86_64|aarch64|amd64)\b/i, why: "say Intel or AMD, ARM, or Apple silicon" },
  { re: /\bApple chips?\b/i, why: "say a Mac with Apple silicon (M1 or later), Apple's own term (D346)" },
  { re: /\bSHA-?256(SUMS)?\b/i, why: "say checksums" },
  { re: /\bD\d{2,3}\b/, why: "a decision number" },
  { re: /(^|\s)\.(dmg|apk|tar\.gz)\b/i, why: "a file format; say what it's for" },
];

const words = (text: string) => INTERNAL.filter((w) => w.re.test(text)).map((w) => `${text.match(w.re)![0]} (${w.why})`);

/** The site's sources: the pages, components, layout, and the scripts and data they show. */
const sources = [
  ...new Glob("src/**/*.{astro,ts}").scanSync(SITE),
].filter((f) => !f.startsWith("src/content")).sort();

/** The words a visitor reads in a template: text between tags and the attributes read aloud. */
function templateText(src: string): string[] {
  const body = src.replace(/^---[\s\S]*?\n---/, "")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(pre|code)\b[\s\S]*?<\/\1>/g, "");
  const out: string[] = [];
  for (const m of body.matchAll(/\b(alt|aria-label|description|content|placeholder)="([^"]*)"/g)) out.push(m[2]);
  for (const t of body.replace(/<[^>]*>/g, "\n").split("\n")) {
    const s = t.replace(/\{[^{}]*\}/g, " ").trim();
    if (/[A-Za-z]{2}/.test(s)) out.push(s);
  }
  return out;
}

/** String literals that read as a sentence or a label (a space and a letter), in code. */
function sentences(src: string): string[] {
  const code = codeLines(src).join("\n");
  return [...code.matchAll(/(["`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)]
    .map((m) => m[2])
    .filter((s) => / /.test(s) && /[A-Za-z]{3}/.test(s) && !/[{}<>=;]|=>|^\.|\[data-/.test(s));
}

describe("site copy: sources", () => {
  test("no fact strip joined with a dot (D291)", () => {
    const bad: string[] = [];
    for (const f of sources) {
      codeLines(readFileSync(join(SITE, f), "utf8")).forEach((c, i) => {
        if (JOINER.test(c)) bad.push(`${f}:${i + 1}: ${c.trim()}`);
      });
    }
    expect(bad).toEqual([]);
  });
  test("no builder's words in what a visitor reads", () => {
    const bad: string[] = [];
    for (const f of sources) {
      const src = readFileSync(join(SITE, f), "utf8");
      const texts = f.endsWith(".astro") ? [...templateText(src), ...sentences(src.match(/^---([\s\S]*?)\n---/)?.[1] ?? "")] : sentences(src);
      for (const t of texts) for (const w of words(t)) bad.push(`${f}: ${w}: ${t.slice(0, 90)}`);
    }
    expect(bad).toEqual([]);
  });
  test("the list catches what it's for", () => {
    expect(words("Download the arm64 tarball and check SHA256SUMS.txt")).toHaveLength(3);
    expect(words("through Claude Code, Codex, pi or DeepSeek Harness")).toEqual([]);
    expect(words("your harness runs it on a worker")).toHaveLength(2);
  });
});

const DIST = join(SITE, "dist");
const PAGES = ["index.html", "start.html", "download.html", "404.html", "docs.html"];

/** A page's titles: the tab's, and what a shared link shows (og:title, twitter:title). */
function titles(html: string): string[] {
  const out = [html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ""];
  for (const m of html.matchAll(/<meta (?:property="og:title"|name="twitter:title") content="([^"]*)"/g)) out.push(m[1]);
  return out.filter(Boolean);
}

/** What a visitor sees or hears on a built page: text, alt, labels, the meta description. */
function rendered(html: string): string[] {
  const out: string[] = [];
  out.push(...titles(html));
  for (const m of html.matchAll(/<meta (?:name="description"|property="og:description"|property="og:image:alt") content="([^"]*)"/g)) out.push(m[1]);
  const body = (html.match(/<body[\s\S]*<\/body>/)?.[0] ?? "")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<(pre|code)\b[\s\S]*?<\/\1>/g, " ");
  for (const m of body.matchAll(/\b(alt|aria-label|title)="([^"]+)"/g)) out.push(m[2]);
  out.push(...body.replace(/<[^>]*>/g, "\n").split("\n").map((s) => s.trim()).filter(Boolean));
  return out.map((s) => s.replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"'));
}

describe.skipIf(!existsSync(join(DIST, "index.html")))("site copy: the built pages", () => {
  for (const p of PAGES) {
    test(p, () => {
      const file = join(DIST, p);
      if (!existsSync(file)) return;
      const texts = rendered(readFileSync(file, "utf8"));
      // The docs index is held to no joins; its words are docs/README.md's own, which may name
      // what a reader looks up (a file, a command), so the word list stops at the site's pages.
      const bad = [
        ...texts.filter((t) => JOINER.test(t)).map((t) => `joined: ${t}`),
        ...(p === "docs.html" ? [] : texts.flatMap((t) => words(t).map((w) => `${w}: ${t.slice(0, 90)}`))),
      ];
      expect(bad, relative(SITE, file)).toEqual([]);
    });
  }
});

describe.skipIf(!existsSync(join(DIST, "index.html")))("site copy: every built page's title", () => {
  const all = [...new Glob("**/*.html").scanSync(DIST)].sort();
  test("titles say the page, then the site, with an en dash (D346)", () => {
    expect(all.length).toBeGreaterThan(PAGES.length);
    const bad: string[] = [];
    for (const f of all) {
      for (const t of titles(readFileSync(join(DIST, f), "utf8"))) {
        if (JOINER.test(t) || / [-|] Ducter/.test(t)) bad.push(`${f}: ${t}`);
      }
    }
    expect(bad).toEqual([]);
  });
  test("a docs page is titled page – Ducter docs", () => {
    const f = all.find((f) => /^docs\/install(\.html|\/index\.html)$/.test(f));
    expect(f).toBeDefined();
    expect(titles(readFileSync(join(DIST, f!), "utf8"))[0]).toMatch(/^[^–]+ – Ducter docs$/);
  });
});

describe("the share image", () => {
  test("og.png's alt carries the home page's line, so a new line means a redrawn og.png (D346)", () => {
    const h1 = readFileSync(join(SITE, "src/pages/index.astro"), "utf8").match(/<h1>([\s\S]*?)<\/h1>/)![1];
    const line = h1.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    const alt = readFileSync(join(SITE, "src/components/Head.astro"), "utf8").match(/og:image:alt" content="([^"]*)"/)![1];
    expect(alt).toContain(line);
    expect(Bun.file(join(SITE, "public/og.png")).size).toBeLessThanOrEqual(400 * 1024);
  });
});
