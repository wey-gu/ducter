// The single binary serves only the files web.ts imports: one added to apps/web/static without its
// import is a broken image on every home that runs the binary (2026-11-11: the Autofill tab's art
// and the two "coming later" chips showed empty on the phone), while a home run from source never
// shows it. Every image and font the page can ask for is in ASSETS.
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../../../apps/web/static");
const src = readFileSync(join(import.meta.dir, "../src/web.ts"), "utf8");

test("every image and font under apps/web/static is served by the binary", () => {
  const files = readdirSync(root, { recursive: true })
    .map(String)
    .filter((f) => /\.(webp|png|svg|jpg|woff2?|ttf)$/.test(f));
  expect(files.length).toBeGreaterThan(10);
  const missing = files.filter((f) => !src.includes(`"${f}": [`) || !src.includes(`static/${f}"`));
  expect(missing).toEqual([]);
});
