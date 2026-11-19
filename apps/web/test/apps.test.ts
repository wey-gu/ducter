// D405: 小应用 / Apps on the web: the app's rules draw with tokens only, and an app's own ask is a
// neutral bubble on the left (never the person's orange one); the frame is sandboxed from the home.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_SANDBOX } from "@ducter/protocol";

const css = readFileSync(join(import.meta.dir, "..", "static", "app.css"), "utf8");
const views = readFileSync(join(import.meta.dir, "..", "src", "views.tsx"), "utf8");
const apps = readFileSync(join(import.meta.dir, "..", "src", "apps.tsx"), "utf8");
const rules = (prefix: RegExp) => css.split("\n}").filter((r) => prefix.test(r.split("{")[0] ?? ""));

test("the app rules use tokens only", () => {
  const mine = rules(/\.(app-|user-app|mtile\.drawn\.k-app)/);
  expect(mine.length).toBeGreaterThan(8);
  for (const r of mine) expect(r).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(/);
});

test("an app's ask is a neutral bubble on the left, not the person's", () => {
  const bubble = /\.app-asked-bubble \{([^}]*)\}/.exec(css)?.[1] ?? "";
  expect(bubble).toContain("var(--sunken)");
  expect(bubble).not.toContain("--user-bubble");
  expect(css).toMatch(/\.app-asked \{[^}]*align-items: flex-start/);
  // The ask branch renders it before the person's own bubble.
  const at = views.indexOf("if (a.ask)");
  expect(at).toBeGreaterThan(0);
  expect(views.slice(at, at + 400)).toContain('class="app-asked"');
  expect(views.slice(at, at + 400)).not.toContain("UserWords");
});

test("the frame comes from the home, sandboxed, never srcdoc", () => {
  expect(apps).toContain("sandbox={APP_SANDBOX}");
  expect(apps).not.toContain("srcdoc=");
  expect(APP_SANDBOX).toBe("allow-scripts allow-forms");
});
