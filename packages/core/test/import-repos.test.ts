// D670: plugin repositories as sources. A repository is a git repo with an `index.json` at
// its root; the official one is the reviewed list. A local folder is a source too (an author's
// checkout, or a test fixture). Nothing runs here: the index is read, the pinned commit is
// checked out, and the plugin folder's content hash has to match the index before it is copied.
import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { contentHash, createPluginRuntime } from "../src/imports/plugins.ts";
import { createRepositories } from "../src/imports/repos.ts";
import { tempDir } from "./helpers.ts";
import { makePluginRepo } from "./helpers-repo.ts";

const fixture = join(import.meta.dir, "fixtures/plugin");
const NOW = Date.parse("2026-12-01T10:00:00Z");

function setup() {
  const t = tempDir();
  const official = makePluginRepo(join(t.dir, "official"), [{ from: fixture }]);
  const plugins = createPluginRuntime({ dataDir: t.dir, now: () => NOW, curated: [] });
  const repos = createRepositories({ dataDir: t.dir, plugins, officialUrl: official.root, now: () => NOW, lookMs: 0 });
  return { ...t, official, plugins, repos };
}

test("the official index is the reviewed list; the available row carries the app, source and icon", async () => {
  const s = setup();
  const v = await s.repos.look(true);
  expect(v.repositories[0]).toMatchObject({ id: "official", official: true, state: "ready", plugins: 1 });
  const a = v.available[0]!;
  expect(a).toMatchObject({ id: "fixture-reader", app: "Fixture Notes", version: "0.1.0", source: "official", official: true, reviewed: true, detected: true });
  // The short name is the last two path parts; the full URL stays beside it.
  expect(a.sourceName).toMatch(/official$/);
  expect(a.sourceUrl).toBe(s.official.root);
  expect(a.reads).toEqual(["./threads.json"]);
  expect(a.online).toBe(false);
  expect(a.uses).toEqual([]);
  // The fixture's detect path exists inside the plugin, so detected apps come first.
  expect(a.detected).toBe(true);

  const install = await s.repos.install("official", "fixture-reader");
  expect(install).toMatchObject({ ok: true, id: "fixture-reader", reviewed: true, needsConsent: true });
  const e = s.plugins.get("fixture-reader")!;
  expect(e.record.kind).toBe("repo");
  expect(e.record.repoId).toBe("official");
  expect(e.record.official).toBe(true);
  // Once installed it leaves the Available list.
  expect((await s.repos.look(true)).available).toEqual([]);
  s.cleanup();
});

test("a person's source is Added by you; its version is checked only when the official index lists it", async () => {
  const s = setup();
  const other = makePluginRepo(join(s.dir, "theirs"), [{ from: fixture, id: "fixture-two", app: "Fixture Two" }]);
  expect(s.repos.add(other.root)).toMatchObject({ ok: true });
  const v = await s.repos.look(true);
  const a = v.available.find((x) => x.id === "fixture-two")!;
  expect(a).toMatchObject({ official: false, reviewed: false });
  expect(a.source.startsWith("src-")).toBe(true);
  expect(a.sourceUrl).toBe(other.root);
  expect(v.repositories.some((r) => r.official === false && r.url === other.root)).toBe(true);
  // The official source's plugin stays checked even though a person's source also lists it.
  expect(v.available.find((x) => x.id === "fixture-reader")!.reviewed).toBe(true);

  const install = await s.repos.install(a.source, "fixture-two");
  expect(install.ok).toBe(true);
  const row = s.plugins.get("fixture-two")!;
  expect(row.record.official).toBe(false);
  expect(row.reviewed).toBe(false);
  expect(s.repos.remove(a.source)).toEqual({ ok: true });
  expect(s.repos.get(a.source)).toBeUndefined();
  // Removing a source leaves what it installed.
  expect(s.plugins.get("fixture-two")).toBeDefined();
  s.cleanup();
});

test("the index's hash is the proof: a changed folder and a tampered index both refuse", async () => {
  const s = setup();
  // A local source is read where it is; changing a file after the index was written is drift.
  const plugin = join(s.official.root, "plugins/fixture-reader");
  const before = readFileSync(join(plugin, "main.ts"), "utf8");
  writeFileSync(join(plugin, "main.ts"), `${before}\n// changed after the index\n`);
  const drift = await s.repos.install("official", "fixture-reader");
  expect(drift.ok).toBe(false);
  expect(drift.error).toBe("hash_mismatch");

  // Put it back; a hash the index names but the files don't have is still refused.
  writeFileSync(join(plugin, "main.ts"), before);
  const index = JSON.parse(readFileSync(join(s.official.root, "index.json"), "utf8")) as { plugins: { hash: string }[] };
  index.plugins[0]!.hash = "0".repeat(64);
  writeFileSync(join(s.official.root, "index.json"), JSON.stringify(index, null, 2));
  await s.repos.look(true);
  const bad = await s.repos.install("official", "fixture-reader");
  expect(bad.ok).toBe(false);
  expect(bad.error).toBe("hash_mismatch");
  s.cleanup();
});

test("a git source is cloned and the index's commit is checked out (not just the working tree)", async () => {
  const t = tempDir();
  const repo = makePluginRepo(join(t.dir, "git-repo"), [{ from: fixture }], "bbbb2222");
  const run = (args: string[]) => {
    const r = Bun.spawnSync(["git", ...args], { cwd: repo.root, stdout: "pipe", stderr: "pipe" });
    expect(r.exitCode, r.stderr.toString()).toBe(0);
  };
  run(["init", "-q", "."]);
  run(["config", "user.email", "tests@example.test"]);
  run(["config", "user.name", "Ducter tests"]);
  run(["add", "-A"]);
  run(["commit", "-qm", "fixture"]);
  const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: repo.root, stdout: "pipe" }).stdout.toString().trim();
  // The index is committed a moment later and pins the commit that carries the plugin bytes.
  const raw = JSON.parse(readFileSync(join(repo.root, "index.json"), "utf8")) as { plugins: { commit: string }[] };
  raw.plugins[0]!.commit = head;
  writeFileSync(join(repo.root, "index.json"), JSON.stringify(raw, null, 2));
  run(["add", "-A"]);
  run(["commit", "-qm", "index"]);
  const url = `file://${repo.root}`;
  const plugins = createPluginRuntime({ dataDir: t.dir, now: () => NOW, curated: [] });
  const repos = createRepositories({ dataDir: t.dir, plugins, officialUrl: url, now: () => NOW, lookMs: 0 });
  expect((await repos.look(true)).available[0]!.id).toBe("fixture-reader");
  const a = await repos.install("official", "fixture-reader");
  expect(a).toMatchObject({ ok: true, id: "fixture-reader" });
  const e = plugins.get("fixture-reader")!;
  expect(e.record.kind).toBe("repo");
  expect(e.record.commit).toBe(head);
  expect(e.record.hash).toBe(contentHash(join(repo.root, "plugins/fixture-reader")));
  t.cleanup();
});

test("a repository update moves to the newer pin and asks again when it reads more", async () => {
  const s = setup();
  expect((await s.repos.install("official", "fixture-reader")).ok).toBe(true);
  const first = s.plugins.get("fixture-reader")!;
  s.plugins.consent("fixture-reader", first.manifest!.reads);
  expect(s.plugins.consented("fixture-reader", first.manifest!.reads)).toBe(true);

  // The author's next version reads one more path.
  makePluginRepo(
    s.official.root,
    [{ from: fixture, version: "0.2.0", reads: ["./threads.json", "~/Library/Notes/**/*.sqlite*"] }],
    "bbbb2222",
  );
  const v = await s.repos.look(true);
  expect(v.available).toEqual([]);
  const e = s.plugins.get("fixture-reader")!;
  expect(e.update).toMatchObject({ version: "0.2.0", commit: "bbbb2222" });

  const u = await s.repos.update("fixture-reader");
  expect(u).toMatchObject({ ok: true, version: "0.2.0", needsConsent: true, widened: true });
  expect(s.plugins.consented("fixture-reader", ["~/Library/Notes/**/*.sqlite*", "./threads.json"])).toBe(false);
  expect(s.plugins.get("fixture-reader")!.record.commit).toBe("bbbb2222");
  s.cleanup();
});

test("a bad index entry is dropped, and the official URL can't be added twice or removed", async () => {
  const s = setup();
  const index = JSON.parse(readFileSync(join(s.official.root, "index.json"), "utf8")) as { plugins: Record<string, unknown>[] };
  index.plugins.push({ ...index.plugins[0], id: "BAD ID", path: "../outside" });
  index.plugins.push({ ...index.plugins[0], id: "bad-hash", hash: "nope" });
  writeFileSync(join(s.official.root, "index.json"), JSON.stringify(index, null, 2));
  const v = await s.repos.look(true);
  expect(v.available.map((a) => a.id)).toEqual(["fixture-reader"]);
  expect(s.repos.add(s.official.root)).toMatchObject({ ok: false, error: "official_source" });
  expect(s.repos.remove("official")).toMatchObject({ ok: false, error: "official_source" });
  expect(s.repos.add("not a repository")).toMatchObject({ ok: false });
  s.cleanup();
});

test("the hash in the index is the same content hash the installer computes", () => {
  const t = tempDir();
  const repo = makePluginRepo(join(t.dir, "repo"), [{ from: fixture }]);
  expect(repo.index.plugins[0]!.hash).toBe(contentHash(join(repo.root, "plugins/fixture-reader")));
  t.cleanup();
});
