// /changelog (D344): the repo's CHANGELOG.md, read at build time. Each `## X.Y.Z - YYYY-MM-DD`
// section is one release: its date is the one written in the heading (never fetched), its headline
// is the section's whats-new block (the same lines the apps' update cards show, by the rules of
// packages/core/src/release.ts whatsNew), and the rest is rendered as written.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";

// The build runs in apps/site (as the docs' DOCS_DIR); a test may run from the repo's root.
export const CHANGELOG_PATH = process.env.DUCTER_CHANGELOG ?? [resolve(process.cwd(), "../../CHANGELOG.md"), resolve(process.cwd(), "CHANGELOG.md")].find((p) => existsSync(p)) ?? resolve(process.cwd(), "../../CHANGELOG.md");

export type WhatsNew = { zh: string[]; en: string[] };

export interface Release {
  version: string;
  /** YYYY-MM-DD, from the heading; "" when the heading has none. */
  date: string;
  whatsNew: WhatsNew;
  /** The section as written, without its heading and its whats-new block. */
  body: string;
}

const NOTE_MAX = { zh: 40, en: 80 } as const;

/** The whats-new block's lines: per language at most two whole lines, none longer than a card shows. */
export function whatsNew(section: string, max = 2): WhatsNew {
  const m = /<!--\s*whats-new\b([\s\S]*?)-->/.exec(section);
  const out: WhatsNew = { zh: [], en: [] };
  for (const raw of (m?.[1] ?? "").split(/\r?\n/)) {
    const l = /^\s*(zh|en)\s*[:：]\s*(.+?)\s*$/.exec(raw);
    if (!l) continue;
    const lang = l[1] as "zh" | "en";
    if ([...l[2]!].length > NOTE_MAX[lang]) continue;
    if (out[lang].length < max) out[lang].push(l[2]!);
  }
  return out;
}

export function parseChangelog(text: string): Release[] {
  const out: Release[] = [];
  for (const s of text.split(/^## /m).slice(1)) {
    const nl = s.indexOf("\n");
    const head = (nl < 0 ? s : s.slice(0, nl)).trim();
    const h = /^\[?v?(\d+\.\d+\.\d+[^\s\]]*)\]?(?:\s+-\s+(\d{4}-\d{2}-\d{2}))?/.exec(head);
    if (!h) continue;
    const rest = nl < 0 ? "" : s.slice(nl + 1);
    out.push({
      version: h[1]!,
      date: h[2] ?? "",
      whatsNew: whatsNew(rest),
      body: rest.replace(/<!--[\s\S]*?-->/g, "").trim(),
    });
  }
  return out;
}

export const readChangelog = (path = CHANGELOG_PATH) => parseChangelog(readFileSync(path, "utf8"));

/** "November 17, 2026" (UTC: the date as written, whatever the build machine's zone). */
export const longDate = (d: string) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : "");
export const shortDate = (d: string) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");
export const monthOf = (d: string) => (d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", timeZone: "UTC" }) : "Earlier");

export interface Rendered extends Release {
  html: string;
}

/** Each release's body as HTML, through the same Markdown renderer the docs use. */
export async function renderReleases(rs: Release[]): Promise<Rendered[]> {
  const md = await createMarkdownProcessor({ syntaxHighlight: false }); // the notes hold no code blocks
  return Promise.all(rs.map(async (r) => ({ ...r, html: (await md.render(r.body)).code })));
}

/** The releases a visitor sees open, then the rest by month, newest first. */
export function split(rs: Rendered[], open = 3): { latest: Rendered[]; months: { month: string; releases: Rendered[] }[] } {
  const months: { month: string; releases: Rendered[] }[] = [];
  for (const r of rs.slice(open)) {
    const m = monthOf(r.date);
    const last = months.at(-1);
    if (last?.month === m) last.releases.push(r);
    else months.push({ month: m, releases: [r] });
  }
  return { latest: rs.slice(0, open), months };
}
