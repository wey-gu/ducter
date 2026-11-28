// D668 (research/246 §3.5, §3.6, §3.9): the manifest, the pinned install and the curated list.
//
// Nothing here runs a reader: install reads the manifest and hashes the files, update moves to a
// new commit, and the curated list decides "Ducter checked this version" vs "nobody has checked
// it for you". The sandbox and the first real run are checked in plugin-sandbox.test.ts.
import { expect, test } from "bun:test";
import { cpSync, mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { contentHash, createPluginRuntime, hostRangeOk, parseManifest, splitRef, type GitExec } from "../src/imports/plugins.ts";
import { tempDir } from "./helpers.ts";

const fixture = join(import.meta.dir, "fixtures/plugin");
const NOW = Date.parse("2026-12-01T10:00:00Z");
const ok = (stdout = "") => ({ code: 0, stdout, stderr: "" });

function copyFixture(dir: string, o: { reads?: string[]; version?: string; app?: string } = {}): string {
  mkdirSync(dir, { recursive: true });
  cpSync(fixture, dir, { recursive: true });
  const file = join(dir, "ducter-plugin.json");
  const m = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  if (o.reads) m.reads = o.reads;
  if (o.version) m.version = o.version;
  if (o.app) m.app = { name: o.app };
  writeFileSync(file, `${JSON.stringify(m, null, 2)}\n`);
  return dir;
}

function fakeGit(state: { commit: string; remote?: string; reads?: string[]; version?: string; app?: string }): GitExec {
  const git: GitExec = async (args, opts) => {
    if (args[0] === "clone") {
      const dest = args[args.length - 1]!;
      copyFixture(dest, { ...(state.reads ? { reads: state.reads } : {}), ...(state.version ? { version: state.version } : {}), ...(state.app ? { app: state.app } : {}) });
      return ok();
    }
    if (args[0] === "checkout") return ok();
    if (args[0] === "rev-parse") return ok(`${state.commit}\n`);
    if (args[0] === "ls-remote") return ok(`${state.remote ?? state.commit}\tHEAD\n`);
    return { code: 1, stdout: "", stderr: `unexpected git ${args.join(" ")} in ${opts?.cwd ?? "."}` };
  };
  return git;
}

test("the manifest keeps only its own fields and refuses what an importer can't be", () => {
  const m = parseManifest(JSON.parse(readFileSync(join(fixture, "ducter-plugin.json"), "utf8")));
  expect(m.id).toBe("fixture-reader");
  expect(m.kind).toBe("importer");
  expect(m.reads).toEqual(["./threads.json"]);
  expect(m.network).toBe(false);
  expect(m.online).toBe(false);
  expect(m.uses).toEqual([]);
  expect(m.name.zh).toBe("测试笔记");

  const raw = JSON.parse(readFileSync(join(fixture, "ducter-plugin.json"), "utf8")) as Record<string, unknown>;
  expect(() => parseManifest({ ...raw, kind: "reader" })).toThrow();
  expect(() => parseManifest({ ...raw, network: true })).toThrow();
  // D670: Lody is the official plugin now, so its id and app name are allowed.
  expect(parseManifest({ ...raw, id: "lody" }).id).toBe("lody");
  expect(parseManifest({ ...raw, app: { name: "Lody" } }).app.name).toBe("Lody");
  expect(() => parseManifest({ ...raw, app: { name: "Notes", icon: "../icon.png" } })).toThrow();
  expect(parseManifest({ ...raw, app: { name: "Notes", icon: "icon.png" } }).app.icon).toBe("icon.png");
  expect(() => parseManifest({ ...raw, reads: ["~/x/../secret"] })).toThrow();
  expect(() => parseManifest({ ...raw, emits: "ducter-import/2" })).toThrow();
  expect(() => parseManifest({ ...raw, author: {} })).toThrow();
});

test("a use names a command, says why, and is the only way a run may go online", () => {
  const raw = JSON.parse(readFileSync(join(fixture, "ducter-plugin.json"), "utf8")) as Record<string, unknown>;
  const m = parseManifest({
    ...raw,
    uses: [{ command: "lody", online: true, why: { en: "It reads with lody, signed in here, and goes online.", zh: "它会用这里登录着的 lody 读，会联网。" } }],
  });
  expect(m.online).toBe(true);
  expect(m.uses).toHaveLength(1);
  expect(m.uses[0]).toMatchObject({ command: "lody", online: true });
  expect(m.uses[0]!.why.zh).toContain("会联网");
  // A path, not only a bare name, is a command too.
  expect(parseManifest({ ...raw, uses: [{ command: "./bin/reader", online: false, why: { en: "A bundled command." } }] }).uses[0]!.command).toBe("./bin/reader");
  // No why, no online flag, or an online flag without a use is refused.
  expect(() => parseManifest({ ...raw, uses: [{ command: "lody", online: true }] })).toThrow();
  expect(() => parseManifest({ ...raw, uses: [{ command: "lody", online: "yes", why: { en: "x" } }] })).toThrow();
  expect(() => parseManifest({ ...raw, network: true })).toThrow();
});

test("the host range: caret, at least, exact", () => {
  expect(hostRangeOk("^0.1", "0.1.102")).toBe(true);
  expect(hostRangeOk("^0.2", "0.1.102")).toBe(false);
  expect(hostRangeOk("^0.1.100", "0.1.102")).toBe(true);
  expect(hostRangeOk("^0.1.103", "0.1.102")).toBe(false);
  expect(hostRangeOk(">=0.1.90", "0.1.102")).toBe(true);
  expect(hostRangeOk("0.1.102", "0.1.102")).toBe(true);
  expect(hostRangeOk("0.2.0", "0.1.102")).toBe(false);
  expect(hostRangeOk("nonsense", "0.1.102")).toBe(false);
});

test("a folder install is pinned by content hash, consented once, and removed without deleting it", async () => {
  const t = tempDir();
  const dir = copyFixture(join(t.dir, "reader"));
  const hash = contentHash(dir);
  const rt = createPluginRuntime({ dataDir: t.dir, now: () => NOW, curated: [] });
  const a = await rt.install(dir);
  expect(a).toMatchObject({ ok: true, id: "fixture-reader", app: "Fixture Notes", hash, unreviewed: true, needsConsent: true });
  const e = rt.get("fixture-reader")!;
  expect(e.record.kind).toBe("folder");
  expect(e.record.commit).toBeUndefined();
  expect(e.manifest?.author.name).toBe("Ducter tests");

  rt.consent("fixture-reader", e.manifest!.reads);
  expect(rt.consented("fixture-reader", ["./threads.json"])).toBe(true);
  // A read the person did not see is not covered.
  expect(rt.consented("fixture-reader", ["./threads.json", "~/Library/Wide/**"])).toBe(false);
  // Narrowing doesn't ask again.
  expect(rt.consented("fixture-reader", [])).toBe(true);

  const again = await rt.install(dir);
  expect(again.ok).toBe(false);
  expect(again.error).toBe("already_installed");

  const gone = rt.remove("fixture-reader");
  expect(gone).toEqual({ ok: true, deletedFolder: false });
  expect(rt.list()).toEqual([]);
  expect(readFileSync(join(dir, "ducter-plugin.json"), "utf8")).toContain("fixture-reader");
  t.cleanup();
});

test("a curated commit says Ducter checked it; another commit is nobody's check", async () => {
  const t = tempDir();
  const g = fakeGit({ commit: "aaaa1111" });
  const rt = createPluginRuntime({ dataDir: t.dir, now: () => NOW, git: g, curated: [{ id: "fixture-reader", repo: "https://example.test/fixture.git", commit: "aaaa1111" }] });
  const a = await rt.install("https://example.test/fixture.git");
  expect(a.ok).toBe(true);
  expect(rt.get("fixture-reader")!.reviewed).toBe(true);

  const u = createPluginRuntime({
    dataDir: join(t.dir, "other"),
    now: () => NOW,
    git: g,
    curated: [{ id: "fixture-reader", repo: "https://example.test/fixture.git", commit: "bbbb2222" }],
  });
  const b = await u.install("https://example.test/fixture.git");
  expect(b.unreviewed).toBe(true);
  expect(u.get("fixture-reader")!.reviewed).toBe(false);
  t.cleanup();
});

test("a git install pins the commit and URL, and an update that reads more asks again", async () => {
  const t = tempDir();
  const state = { commit: "aaaa1111", remote: "aaaa1111", reads: ["./threads.json"], version: "0.1.0" };
  const rt = createPluginRuntime({ dataDir: t.dir, now: () => NOW, git: fakeGit(state), curated: [] });
  const a = await rt.install("https://example.test/fixture.git#main");
  expect(a).toMatchObject({ ok: true, commit: "aaaa1111", source: "https://example.test/fixture.git" });
  const first = rt.get("fixture-reader")!;
  expect(first.record.ref).toBe("main");

  // The proof that an update is out: the ref's head moved.
  state.remote = "bbbb2222";
  await rt.check(true);
  expect(rt.get("fixture-reader")!.update).toMatchObject({ commit: "bbbb2222" });

  rt.consent("fixture-reader", first.manifest!.reads);
  expect(rt.consented("fixture-reader", first.manifest!.reads)).toBe(true);

  // The newer commit reads one more path (and a new version).
  state.commit = "bbbb2222";
  state.reads = ["./threads.json", "~/Library/Notes/**/*.sqlite*"];
  state.version = "0.2.0";
  const u = await rt.update("fixture-reader");
  expect(u).toMatchObject({ ok: true, commit: "bbbb2222", version: "0.2.0", needsConsent: true, widened: true });
  const after = rt.get("fixture-reader")!;
  expect(after.manifest!.reads).toEqual(["./threads.json", "~/Library/Notes/**/*.sqlite*"]);
  expect(rt.consented("fixture-reader", after.manifest!.reads)).toBe(false);
  expect(rt.get("fixture-reader")!.update).toBeUndefined();
  t.cleanup();
});

test("an update that reads the same doesn't ask again", async () => {
  const t = tempDir();
  const state = { commit: "aaaa1111", remote: "aaaa1111", reads: ["./threads.json"], version: "0.1.0" };
  const rt = createPluginRuntime({ dataDir: t.dir, now: () => NOW, git: fakeGit(state), curated: [] });
  await rt.install("https://example.test/fixture.git");
  rt.consent("fixture-reader", ["./threads.json"]);
  state.commit = "bbbb2222";
  state.remote = "bbbb2222";
  state.version = "0.1.1";
  const u = await rt.update("fixture-reader");
  expect(u).toMatchObject({ ok: true, version: "0.1.1" });
  expect(u.needsConsent).toBe(false);
  expect(rt.consented("fixture-reader", ["./threads.json"])).toBe(true);
  t.cleanup();
});

test("a second plugin can't take another's app name, and a symlink is refused", async () => {
  const t = tempDir();
  const rt = createPluginRuntime({ dataDir: t.dir, now: () => NOW, curated: [] });
  const one = copyFixture(join(t.dir, "one"));
  expect((await rt.install(one)).ok).toBe(true);

  const two = copyFixture(join(t.dir, "two"));
  const m = JSON.parse(readFileSync(join(two, "ducter-plugin.json"), "utf8")) as Record<string, unknown>;
  writeFileSync(join(two, "ducter-plugin.json"), JSON.stringify({ ...m, id: "fixture-two", app: { name: "Fixture Notes" } }));
  const taken = await rt.install(two);
  expect(taken.ok).toBe(false);
  expect(taken.error).toBe("app_taken");

  const three = copyFixture(join(t.dir, "three"));
  const m3 = JSON.parse(readFileSync(join(three, "ducter-plugin.json"), "utf8")) as Record<string, unknown>;
  writeFileSync(join(three, "ducter-plugin.json"), JSON.stringify({ ...m3, id: "fixture-three" }));
  symlinkSync("/etc/passwd", join(three, "leak"));
  const link = await rt.install(three);
  expect(link.ok).toBe(false);
  expect(link.error).toBe("symlink");
  t.cleanup();
});

test("a git install follows its data folder when Ducter moves", async () => {
  const t = tempDir();
  const rt = createPluginRuntime({ dataDir: t.dir, now: () => NOW, git: fakeGit({ commit: "aaaa1111" }), curated: [] });
  expect((await rt.install("https://example.test/fixture.git")).ok).toBe(true);
  const moved = `${t.dir}-moved`;
  renameSync(t.dir, moved);
  const after = createPluginRuntime({ dataDir: moved, now: () => NOW, curated: [] });
  const e = after.get("fixture-reader")!;
  expect(e.record.dir).toBe(join(moved, "plugins", "fixture-reader"));
  expect(e.problem).toBeUndefined();
  rmSync(moved, { recursive: true, force: true });
});

test("splitRef keeps a plain URL and takes the last #ref", () => {
  expect(splitRef("https://example.test/a/b")).toEqual({ url: "https://example.test/a/b" });
  expect(splitRef("https://example.test/a/b#v1")).toEqual({ url: "https://example.test/a/b", ref: "v1" });
});
