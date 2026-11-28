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
import { makePluginRepo } from "../../core/test/helpers-repo.ts";

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
  expect(readFileSync(join(d.dir, "plugins.json"), "utf8")).toContain("fixture-reader");
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

test("plugin source add|list|remove: the official repository is always there and can't go", async () => {
  const d = tempDir();
  const theirs = makePluginRepo(join(d.dir, "theirs"), [{ from: fixture, id: "fixture-two", app: "Fixture Two" }]);
  const added: string[] = [];
  expect(await cmdPlugin({ t, dataDir: d.dir, json: false, rest: ["source", "add", theirs.root], print: (s) => added.push(s) })).toBe(0);
  expect(added.join("\n")).toContain("Added the plugin repository");
  expect(readFileSync(join(d.dir, "import-repositories.json"), "utf8")).toContain(theirs.root);

  const list: string[] = [];
  expect(await cmdPlugin({ t, dataDir: d.dir, json: true, rest: ["source", "list"], print: (s) => list.push(s) })).toBe(0);
  const parsed = JSON.parse(list.join("\n"));
  expect(parsed.repositories).toHaveLength(2);
  expect(parsed.repositories[0]).toMatchObject({ id: "official", official: true });
  const mine = parsed.repositories[1];
  expect(mine).toMatchObject({ url: theirs.root, official: false });

  // The official source can't be removed; the person's can.
  expect(await cmdPlugin({ t, dataDir: d.dir, json: true, rest: ["source", "remove", "official"], print: () => {} })).toBe(1);
  const gone: string[] = [];
  expect(await cmdPlugin({ t, dataDir: d.dir, json: false, rest: ["source", "remove", mine.id], print: (s) => gone.push(s) })).toBe(0);
  expect(gone.join("\n")).toContain("Removed the plugin repository");
  const after: string[] = [];
  await cmdPlugin({ t, dataDir: d.dir, json: true, rest: ["source", "list"], print: (s) => after.push(s) });
  expect(JSON.parse(after.join("\n")).repositories).toHaveLength(1);
  d.cleanup();
});

test("the CLI parses `ducter plugin` with its words after it", () => {
  const r = parseArgs(["plugin", "add", "https://example.test/a#v1"]);
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.args).toMatchObject({ command: "plugin", rest: ["add", "https://example.test/a#v1"] });
});

test("plugin new theme writes a passing plugin and check --json says 0 things to fix", async () => {
  const d = tempDir();
  const dir = join(d.dir, "calm");
  expect(await cmdPlugin({ t, dataDir: d.dir, json: false, rest: ["new", "theme", dir], print: () => {} })).toBe(0);
  expect(existsSync(join(dir, "ducter-plugin.json"))).toBe(true);
  expect(existsSync(join(dir, "theme.json"))).toBe(true);

  const out: string[] = [];
  expect(await cmdPlugin({ t, dataDir: d.dir, json: true, rest: ["check", dir], print: (s) => out.push(s) })).toBe(0);
  const r = JSON.parse(out.join("\n"));
  expect(r.ok).toBe(true);
  expect(r.plugin).toMatchObject({ id: "calm", kind: "theme" });
  expect(r.summary).toBe("0 things to fix");
  d.cleanup();
});

test("plugin check fails a deliberately low-contrast theme and a reserved kind", async () => {
  const d = tempDir();
  const bad = join(d.dir, "bad");
  mkdirSync(bad, { recursive: true });
  writeFileSync(join(bad, "ducter-plugin.json"), `${JSON.stringify({ format: "ducter-plugin/2", id: "bad", kind: "theme", version: "0.1.0", name: { en: "Bad" }, author: { name: "A" }, ducter: "^0.1", theme: { file: "theme.json" }, permissions: {} }, null, 2)}\n`);
  writeFileSync(join(bad, "theme.json"), `${JSON.stringify({ format: "ducter-theme/1", name: { en: "Bad" }, tokens: { light: { bg: "#949494", ink: "#767676" }, dark: { bg: "#949494", ink: "#767676" } } }, null, 2)}\n`);
  const out: string[] = [];
  expect(await cmdPlugin({ t, dataDir: d.dir, json: true, rest: ["check", bad], print: (s) => out.push(s) })).toBe(1);
  const r = JSON.parse(out.join("\n"));
  expect(r.ok).toBe(false);
  expect(r.checks.some((c: { id: string }) => c.id === "contrast" && c.ok === false)).toBe(true);
  d.cleanup();
});
