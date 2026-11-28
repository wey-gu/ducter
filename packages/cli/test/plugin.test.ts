// D668 (research/246 §3.6): `ducter plugin add|list|remove|update` at the CLI's own boundary.
//
// The CLI installs, lists and removes; it never runs a reader. Removal writes the same
// import_removed the pane writes, so what the plugin brought in is hidden with it.
import { expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPluginRuntime } from "@ducter/core/src/imports/plugins.ts";
import { parseArgs } from "../src/args.ts";
import { translator } from "../src/i18n.ts";
import { cmdPlugin } from "../src/plugin-cmd.ts";
import { tempDir } from "../../core/test/helpers.ts";

const fixture = join(import.meta.dir, "../../core/test/fixtures/plugin");
const t = translator("en");
const NOW = Date.parse("2026-12-01T10:00:00Z");

function reader(t: { dir: string }): string {
  const dir = join(t.dir, "reader");
  mkdirSync(dir, { recursive: true });
  cpSync(fixture, dir, { recursive: true });
  return dir;
}

test("plugin add installs a pinned folder and says consent is owed in Settings", async () => {
  const d = tempDir();
  const out: string[] = [];
  const code = await cmdPlugin({ t, dataDir: d.dir, json: false, rest: ["add", reader(d)], print: (s) => out.push(s) });
  expect(code).toBe(0);
  const text = out.join("\n");
  expect(text).toContain("Added Fixture Notes 0.1.0");
  expect(text).toContain("Nobody has checked it for you.");
  expect(text).toContain("Open Settings › Import");
  expect(readFileSync(join(d.dir, "import-plugins.json"), "utf8")).toContain("fixture-reader");
  d.cleanup();
});

test("plugin list is quiet when empty and JSON when asked", async () => {
  const d = tempDir();
  const missing = join(d.dir, "missing");
  expect(await cmdPlugin({ t, dataDir: missing, json: false, rest: ["list"], print: () => {} })).toBe(0);
  expect(existsSync(missing)).toBe(false);
  const empty: string[] = [];
  expect(await cmdPlugin({ t, dataDir: d.dir, json: false, rest: ["list"], print: (s) => empty.push(s) })).toBe(0);
  expect(empty.join("\n")).toContain("No added reader is installed.");

  const install: string[] = [];
  await cmdPlugin({ t, dataDir: d.dir, json: true, rest: ["add", reader(d)], print: (s) => install.push(s) });
  const out: string[] = [];
  expect(await cmdPlugin({ t, dataDir: d.dir, json: true, rest: ["list"], print: (s) => out.push(s) })).toBe(0);
  const parsed = JSON.parse(out.join("\n"));
  expect(parsed.plugins[0]).toMatchObject({ id: "fixture-reader", app: "Fixture Notes", version: "0.1.0", unreviewed: true });
  expect(parsed.plugins[0].reads).toEqual(["./threads.json"]);
  d.cleanup();
});

test("plugin update says when the read list widened and consent is owed again", async () => {
  const d = tempDir();
  const dir = reader(d);
  expect(await cmdPlugin({ t, dataDir: d.dir, json: true, rest: ["add", dir], print: () => {} })).toBe(0);
  const file = join(dir, "ducter-plugin.json");
  const m = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  m.version = "0.2.0";
  m.reads = ["./threads.json", "~/Library/Notes/**/*.sqlite*"];
  writeFileSync(file, JSON.stringify(m, null, 2));
  const out: string[] = [];
  expect(await cmdPlugin({ t, dataDir: d.dir, json: false, rest: ["update", "fixture-reader"], print: (s) => out.push(s) })).toBe(0);
  expect(out.join("\n")).toContain("Updated fixture-reader to 0.2.0.");
  expect(out.join("\n")).toContain("It reads more now");
  d.cleanup();
});

test("plugin remove deletes the ledger and forgets the consent", async () => {
  const d = tempDir();
  const dir = reader(d);
  await cmdPlugin({ t, dataDir: d.dir, json: true, rest: ["add", dir], print: () => {} });
  writeFileSync(join(d.dir, "imports.json"), JSON.stringify({ sources: { "fixture-reader": { consented: true } } }));
  const out: string[] = [];
  expect(await cmdPlugin({ t, dataDir: d.dir, json: false, rest: ["remove", "fixture-reader"], print: (s) => out.push(s) })).toBe(0);
  expect(out.join("\n")).toContain("Removed fixture-reader.");
  const rt = createPluginRuntime({ dataDir: d.dir, now: () => NOW });
  expect(rt.list()).toEqual([]);
  const state = JSON.parse(readFileSync(join(d.dir, "imports.json"), "utf8"));
  expect(state.sources["fixture-reader"]).toBeUndefined();
  d.cleanup();
});

test("plugin add of something that is not a plugin exits 1 and installs nothing", async () => {
  const d = tempDir();
  mkdirSync(join(d.dir, "empty"));
  const out: string[] = [];
  expect(await cmdPlugin({ t, dataDir: d.dir, json: false, rest: ["add", join(d.dir, "empty")], print: (s) => out.push(s) })).toBe(1);
  expect(out.join("\n")).toContain("That didn't work");
  expect(createPluginRuntime({ dataDir: d.dir }).list()).toEqual([]);
  d.cleanup();
});

test("the CLI parses `ducter plugin` with its words after it", () => {
  const r = parseArgs(["plugin", "add", "https://example.test/a#v1"]);
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.args).toMatchObject({ command: "plugin", rest: ["add", "https://example.test/a#v1"] });
});
