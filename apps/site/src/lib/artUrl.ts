// /art/* is cached for a week (vercel.json), and a redrawn asset keeps its file name, so a visitor
// who came before would keep the old drawing for days (the coins, 2026-11-11). Every art URL
// carries a short hash of the file's bytes, read at build time: new bytes, new URL.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";

// The build runs in apps/site (or the repo root); the bundled module's own URL points elsewhere.
const root = [join(process.cwd(), "public/art/"), join(process.cwd(), "apps/site/public/art/")].find((d) => existsSync(d)) ?? "";
const seen = new Map<string, string>();

export function artUrl(file: string): string {
  let v = seen.get(file);
  if (v === undefined) {
    try {
      v = createHash("sha256").update(readFileSync(root + file)).digest("hex").slice(0, 10);
    } catch {
      v = "";
    }
    seen.set(file, v);
  }
  return v ? `/art/${file}?v=${v}` : `/art/${file}`;
}
