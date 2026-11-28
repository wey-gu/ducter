// D668 (research/246 §3.2, §3.6, §3.10): an added plugin as a source in Settings › Import.
//
// The reader is faked at the sandbox boundary: everything above it is real (the ledger, the
// consent per read list, the host's stamp, the one import service). The first live run is in
// plugin-sandbox.test.ts, which needs a host that can apply a Seatbelt profile.
import { expect, test } from "bun:test";
import { chmodSync, cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import { createImportSources } from "../src/imports/sources.ts";
import { createPluginRuntime } from "../src/imports/plugins.ts";
import { importedTaskId } from "../src/imports/service.ts";
import { openLog } from "../src/log.ts";
import { createMarks, createPast } from "../src/past.ts";
import { createRegistry } from "../src/registry.ts";
import { tempDir } from "./helpers.ts";
import { makePluginRepo } from "./helpers-repo.ts";

const fixture = join(import.meta.dir, "fixtures/plugin");
const onlineFixture = join(import.meta.dir, "fixtures/plugin-online");
const NOW = Date.parse("2026-12-01T10:00:00Z");
const THREAD = { t: "thread", id: "FX-1", title: "A fixture thread", repo: "acme/hawdb", createdAt: "2026-10-02T03:11:00Z", updatedAt: "2026-10-02T03:14:00Z" };
const stream = (app = "Fixture Notes") =>
  [
    JSON.stringify({ t: "source", format: "ducter-import/1", app, account: "whatever", reader: "whatever", readerVersion: "9" }),
    JSON.stringify(THREAD),
    JSON.stringify({ t: "msg", thread: "FX-1", id: "m1", role: "user", text: "The WAL test fails one in five. 看看时序。", at: "2026-10-02T03:11:00Z" }),
    JSON.stringify({ t: "msg", thread: "FX-1", id: "m2", role: "assistant", text: "It races the checkpoint.", at: "2026-10-02T03:14:00Z" }),
    JSON.stringify({ t: "end", threads: 1, messages: 2 }),
  ].join("\n") + "\n";

function setup() {
  const t = tempDir();
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock: { now: () => NOW, setTimeout: () => 0, clearTimeout: () => {} } });
  const tasks = createRegistry(log, { now: () => NOW, setTimeout: () => 0, clearTimeout: () => {} });
  const marks = createMarks({ dataDir: t.dir, now: () => NOW });
  tasks.setMarks((p, id) => marks.get(p, id));
  const past = createPast({ log, tasks, marks, now: () => NOW });
  const holder = { out: stream(), seen: undefined as import("../src/imports/sandbox.ts").PluginRun | undefined };
  const bin = join(t.dir, "bin");
  mkdirSync(bin, { recursive: true });
  const fakeLody = join(bin, "lody");
  writeFileSync(fakeLody, "#!/bin/sh\nprintf '{\"ok\":true,\"workspaces\":[]}\\n'\n");
  chmodSync(fakeLody, 0o755);
  const runtime = createPluginRuntime({
    dataDir: t.dir,
    now: () => NOW,
    curated: [],
    path: `${bin}:${process.env.PATH ?? ""}`,
    sandbox: async (run) => {
      holder.seen = run;
      return { code: 0, stdout: holder.out, stderr: "" };
    },
  });
  const reader = join(t.dir, "reader");
  mkdirSync(reader, { recursive: true });
  cpSync(fixture, reader, { recursive: true });
  const official = makePluginRepo(join(t.dir, "official-repo"), [{ from: fixture }]);
  const sources = createImportSources({
    log,
    tasks,
    dataDir: t.dir,
    persona: "default",
    now: () => NOW,
    zone: () => "UTC",
    plugins: runtime,
    officialUrl: official.root,
    lookMs: 0,
  });
  return { ...t, log, tasks, past, runtime, reader, holder, sources, official };
}

test("an added plugin is a row of its own: added by you, its repository, its author and what it reads", async () => {
  const s = setup();
  expect((await s.runtime.install(s.reader)).ok).toBe(true);
  await s.sources.look(true);
  const v = s.sources.view();
  const row = v.sources.find((x) => x.id === "fixture-reader")!;
  // The official index lists this exact version and hash, so it is checked; it was still added
  // by the person (not through the official repository), so 你加的 stays.
  expect(row).toMatchObject({ app: "Fixture Notes", kind: "plugin", state: "ready", added: true, reviewed: true, unreviewed: false, consented: false, imported: 0 });
  expect(row.repo).toBe(s.reader);
  expect(row.author).toBe("Ducter tests");
  expect(row.reads).toEqual(["./threads.json"]);
  // The row shows the folder's short name, not the path; a folder isn't the official repository.
  expect(row.official).toBeUndefined();
  expect(row.sourceName).toBe("reader");
  t_cleanup(s);
});

test("a plugin from the official repository is 官方仓库, never its URL, and not added by you", async () => {
  const s = setup();
  await s.sources.look(true);
  const inst = await s.sources.install("official", "fixture-reader");
  expect(inst).toMatchObject({ ok: true, needsConsent: true });
  const row = s.sources.view().sources.find((x) => x.id === "fixture-reader")!;
  expect(row).toMatchObject({ added: false, official: true, reviewed: true, unreviewed: false });
  expect(row.repo).toBe(s.official.root);
  expect(row.sourceName).toMatch(/official-repo$/);
  t_cleanup(s);
});

test("nothing runs before its own yes; then the host stamps the source and the one service writes", async () => {
  const s = setup();
  expect((await s.runtime.install(s.reader)).ok).toBe(true);
  s.holder.out = stream("Impostor");
  const refused = await s.sources.run("fixture-reader");
  expect(refused.error).toBe("not_consented");

  const a = await s.sources.accept("fixture-reader");
  expect([a.ok, a.threads, a.messages]).toEqual([true, 1, 2]);
  const tid = importedTaskId("Fixture Notes", "fixture-reader", "FX-1");
  const open = s.log.read({ stream: `task:${tid}`, kinds: ["task_open"] })[0]!;
  const body = open.body as Bodies["task_open"];
  expect(body.imported).toMatchObject({ app: "Fixture Notes", account: "fixture-reader" });
  expect(body.imported?.app).not.toBe("Impostor");
  // A single-binary Ducter is Bun only in this mode; the reader gets it, never the person's env.
  expect(s.holder.seen?.env?.BUN_BE_BUN).toBe("1");
  expect(s.log.read({ stream: "system", kinds: ["import_run"] })).toHaveLength(1);
  expect(s.tasks.list().filter((c) => c.imported)).toHaveLength(1);
  expect(s.past.query("default", { q: "" }).items).toHaveLength(1);

  const row = s.sources.view().sources.find((x) => x.id === "fixture-reader")!;
  expect(row).toMatchObject({ imported: 1, consented: true });
  expect(row.last).toMatchObject({ threads: 1, skipped: 0 });
  t_cleanup(s);
});

test("an update that widens the read list asks again, and the run refuses until the person says yes", async () => {
  const s = setup();
  expect((await s.runtime.install(s.reader)).ok).toBe(true);
  expect((await s.sources.accept("fixture-reader")).ok).toBe(true);

  // The author's newer version reads one more path.
  const file = join(s.reader, "ducter-plugin.json");
  const m = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  m.version = "0.2.0";
  m.reads = ["./threads.json", "~/Library/Notes/**/*.sqlite*"];
  writeFileSync(file, JSON.stringify(m, null, 2));
  await s.runtime.check(true);
  const u = await s.sources.update("fixture-reader");
  expect(u).toMatchObject({ ok: true, needsConsent: true, widened: true });

  const row = s.sources.view().sources.find((x) => x.id === "fixture-reader")!;
  expect(row.consented).toBe(false);
  expect(row.reads).toEqual(["./threads.json", "~/Library/Notes/**/*.sqlite*"]);
  expect((await s.sources.run("fixture-reader")).error).toBe("not_consented");
  // Saying yes again runs under the new list.
  expect((await s.sources.accept("fixture-reader")).ok).toBe(true);
  t_cleanup(s);
});

test("a reader added while the home runs appears on the pane without a restart", async () => {
  const s = setup();
  expect(s.sources.view().sources.some((x) => x.id === "fixture-reader")).toBe(false);
  expect((await s.runtime.install(s.reader)).ok).toBe(true);
  const row = s.sources.view().sources.find((x) => x.id === "fixture-reader")!;
  expect(row).toMatchObject({ app: "Fixture Notes", added: true });
  t_cleanup(s);
});

test("removing an added source deletes its ledger and hides what it brought in", async () => {
  const s = setup();
  expect((await s.runtime.install(s.reader)).ok).toBe(true);
  expect((await s.sources.accept("fixture-reader")).ok).toBe(true);
  expect(s.tasks.list().filter((c) => c.imported)).toHaveLength(1);

  const r = s.sources.remove("fixture-reader");
  expect(r.ok).toBe(true);
  expect(s.runtime.list()).toEqual([]);
  expect(s.tasks.list().filter((c) => c.imported)).toHaveLength(0);
  expect(s.past.query("default", { q: "" }).items).toHaveLength(0);
  expect(s.sources.view().sources.some((x) => x.id === "fixture-reader")).toBe(false);
  // A folder an author keeps is not deleted by Ducter.
  expect(readFileSync(join(s.reader, "ducter-plugin.json"), "utf8")).toContain("fixture-reader");
  t_cleanup(s);
});

test("an unreviewed online reader needs the second, explicit line before anything runs", async () => {
  const s = setup();
  const reader = join(s.dir, "online-reader");
  mkdirSync(reader, { recursive: true });
  cpSync(onlineFixture, reader, { recursive: true });
  expect((await s.runtime.install(reader)).ok).toBe(true);
  await s.sources.look(true);
  const row = s.sources.view().sources.find((x) => x.id === "fixture-online")!;
  expect(row).toMatchObject({ online: true, needsOnlineConsent: true, unreviewed: true, reviewed: false });
  expect(row.uses?.[0]).toMatchObject({ command: "lody", online: true });
  expect(row.uses?.[0]?.why.zh).toContain("会联网");

  // No consent at all.
  expect((await s.sources.run("fixture-online")).error).toBe("not_consented");
  // A yes that didn't include the online line is not enough.
  s.sources.consent("fixture-online", false);
  expect((await s.sources.run("fixture-online")).error).toBe("not_consented");
  // The second line, ticked, is.
  s.sources.consent("fixture-online", true);
  s.holder.out = stream("Fixture Online");
  s.holder.seen = undefined;
  const run = await s.sources.run("fixture-online");
  expect([run.ok, run.threads, run.messages]).toEqual([true, 1, 2]);
  // The host resolved the declared command and gave the run that program.
  expect(s.holder.seen?.uses?.[0]).toMatchObject({ command: "lody", online: true });
  expect(s.holder.seen?.network).toBe(true);
  t_cleanup(s);
});

test("the same version from a person's source stays unchecked unless the official index lists it", async () => {
  const s = setup();
  const theirs = makePluginRepo(join(s.dir, "theirs"), [{ from: onlineFixture, id: "fixture-online", app: "Fixture Online" }]);
  const add = s.sources.addSource(theirs.root);
  expect(add.ok).toBe(true);
  await s.sources.look(true);
  const a = s.sources.view().available?.find((x) => x.id === "fixture-online")!;
  expect(a).toMatchObject({ official: false, reviewed: false, online: true });
  const installed = await s.sources.install(add.id!, "fixture-online");
  expect(installed).toMatchObject({ ok: true, needsConsent: true });
  const row = s.sources.view().sources.find((x) => x.id === "fixture-online")!;
  expect(row).toMatchObject({ added: true, unreviewed: true, online: true, needsOnlineConsent: true });
  t_cleanup(s);
});

// Kept as a function so the cleanup stays in one place even if a test grows more of them.
function t_cleanup(s: { cleanup(): void }) {
  s.cleanup();
}
