// /changelog (D344): the repo's CHANGELOG.md, parsed at build time; the latest three open, the rest
// folded, an anchor per release, and nothing a builder would say (decision numbers, source paths,
// unrendered code) in what a visitor reads. The built page is checked too when dist/ is there.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseChangelog, renderReleases, split, whatsNew } from "../src/lib/changelog";

const root = join(import.meta.dir, "..", "..", "..");
const text = readFileSync(join(root, "CHANGELOG.md"), "utf8");
const releases = parseChangelog(text);
const page = readFileSync(join(import.meta.dir, "..", "src", "pages", "changelog.astro"), "utf8");
const built = join(import.meta.dir, "..", "dist", "changelog.html");

/** What a visitor reads: the HTML's text, without tags, scripts and styles. */
const visible = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ");

function internals(s: string): string[] {
  const out: string[] = [];
  for (const re of [/\bD\d{3}\b/g, /\b(?:packages|apps|design|research|scripts)\/[\w./-]+/g, /\b[\w-]+\/[\w.-]+\.(?:ts|tsx|go|kt|swift)\b/g, /`/g]) for (const m of s.matchAll(re)) out.push(m[0]);
  return out;
}

describe("the changelog", () => {
  test("every section parses, newest first, each with its date and both languages' lines", () => {
    expect(releases.length).toBe((text.match(/^## /gm) ?? []).length);
    expect(releases[0]!.version).toMatch(/^\d+\.\d+\.\d+$/);
    for (const r of releases) expect(r.date, r.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (let i = 1; i < releases.length; i++) expect(releases[i - 1]!.date >= releases[i]!.date, releases[i]!.version).toBe(true);
    const top = releases[0]!;
    expect(top.whatsNew.en.length).toBeGreaterThan(0);
    expect(top.whatsNew.zh.length).toBeGreaterThan(0);
    expect(top.body).not.toContain("whats-new");
    expect(top.body).toMatch(/^\*\*/m); // the sections as written
  });

  test("whats-new keeps the card's rules: two whole lines per language, none too long", () => {
    const n = whatsNew(`<!-- whats-new\nzh: 一\nen: One\nzh: 二\nen: Two\nzh: 三\nen: ${"x".repeat(81)}\n-->`);
    expect(n).toEqual({ zh: ["一", "二"], en: ["One", "Two"] });
  });

  test("the latest three open, the rest folded by month", async () => {
    const { latest, months } = split(await renderReleases(releases.slice(0, 8)));
    expect(latest.map((r) => r.version)).toEqual(releases.slice(0, 3).map((r) => r.version));
    expect(months.flatMap((m) => m.releases).length).toBe(5);
    expect(months[0]!.month).toMatch(/^[A-Z][a-z]+ \d{4}$/);
    expect(page).toContain('<details class="cl-fold" id={r.version}>');
    expect(page).toContain('<article class="cl-rel" id={r.version}');
  });

  test("the recent releases render with nothing a builder would say", async () => {
    for (const r of await renderReleases(releases.slice(0, 12))) {
      expect(internals(visible(r.html)), r.version).toEqual([]);
      expect(internals(r.whatsNew.en.join(" ")), r.version).toEqual([]);
    }
  });

  test.if(existsSync(built))("the built page: three open, the rest folded, an anchor each, no internals", () => {
    const html = readFileSync(built, "utf8");
    expect((html.match(/<article class="cl-rel"/g) ?? []).length).toBe(3);
    expect((html.match(/<details class="cl-fold"/g) ?? []).length).toBe(releases.length - 3);
    for (const r of releases) expect(html, r.version).toContain(`id="${r.version}"`);
    const main = /<main[\s\S]*<\/main>/.exec(html)![0];
    expect(internals(visible(main))).toEqual([]);
  });
});
