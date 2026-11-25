// D558: the home page's questions are the docs' questions. Each one asked on the landing (and given
// to search engines as FAQPage data) is a `###` in docs/faq.md, so the short answer always has its
// long one, and its link lands on a real heading. The built page's FAQPage data must be the
// visible words (search engines drop structured answers that the page doesn't show).
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homeFaq } from "../src/lib/faq";

const SITE = join(import.meta.dir, "..");
const faqMd = readFileSync(join(SITE, "../../docs/faq.md"), "utf8");
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9 -]/g, "").trim().replace(/ /g, "-");
const headings = [...faqMd.matchAll(/^###\s+(.+)$/gm)].map((m) => m[1].trim());

describe("the home page's questions", () => {
  test("each is a question in docs/faq.md", () => {
    const missing = homeFaq.map((f) => f.q).filter((q) => !headings.includes(q));
    expect(missing).toEqual([]);
  });
  test("each link to the FAQ lands on its heading", () => {
    const anchors = new Set(headings.map(slug));
    const bad = homeFaq
      .map((f) => f.more.href)
      .filter((h) => h.startsWith("/docs/faq#"))
      .filter((h) => !anchors.has(h.slice("/docs/faq#".length)));
    expect(bad).toEqual([]);
  });
  test("answers are plain text, the same for the page and the data", () => {
    for (const f of homeFaq) expect(f.a).not.toMatch(/[<>*_`[\]]/);
  });
});

const INDEX = join(SITE, "dist/index.html");
describe.skipIf(!existsSync(INDEX))("the built home page", () => {
  const html = readFileSync(INDEX, "utf8");
  test("its FAQPage data is the questions it shows", () => {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const faq = blocks.flat().find((b) => b["@type"] === "FAQPage");
    expect(faq).toBeTruthy();
    for (const q of faq.mainEntity) {
      expect(html).toContain(`<span class="fold-q">${q.name.replace(/"/g, "&quot;")}</span>`);
    }
  });
  test("/llms.txt is built", () => {
    const llms = join(SITE, "dist/llms.txt");
    expect(existsSync(llms)).toBe(true);
    expect(readFileSync(llms, "utf8")).toContain("## Start here");
  });
});
