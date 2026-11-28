// D670: Lody moved out of the tree and into the official plugin repository. A person who
// already brought Lody in through the built-in source keeps every imported task: the plugin's
// app is still "Lody", its account is its id ("lody"), and its deterministic task id is the same.
// Importing again through the plugin appends only messages Ducter doesn't have.
import { expect, test } from "bun:test";
import { cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, LogEvent } from "@ducter/protocol";
import { createPluginRuntime } from "../src/imports/plugins.ts";
import { importInto } from "../src/imports/service.ts";
import { createImportSources } from "../src/imports/sources.ts";
import { openLog } from "../src/log.ts";
import { createMarks, createPast } from "../src/past.ts";
import { createRegistry } from "../src/registry.ts";
import { tempDir } from "./helpers.ts";
import { makePluginRepo } from "./helpers-repo.ts";

const fixture = join(import.meta.dir, "fixtures/plugin");
const NOW = Date.parse("2026-12-01T10:00:00Z");

const oldStream = [
  JSON.stringify({ t: "source", format: "ducter-import/1", app: "Lody", account: "lody", reader: "lody-cli", readerVersion: "1" }),
  JSON.stringify({ t: "thread", id: "S-OLD", title: "The old Lody thread", repo: "acme/hawdb", createdAt: "2026-10-02T03:11:00Z", updatedAt: "2026-10-02T03:14:00Z" }),
  JSON.stringify({ t: "msg", thread: "S-OLD", id: "m1", role: "user", text: "Remember this from Lody.", at: "2026-10-02T03:11:00Z" }),
  JSON.stringify({ t: "end", threads: 1, messages: 1 }),
].join("\n") + "\n";

const grown = (app = "Lody") =>
  [
    JSON.stringify({ t: "source", format: "ducter-import/1", app, account: "anything", reader: "anything", readerVersion: "9" }),
    JSON.stringify({ t: "thread", id: "S-OLD", title: "The old Lody thread", repo: "acme/hawdb", createdAt: "2026-10-02T03:11:00Z", updatedAt: "2026-10-03T03:14:00Z" }),
    JSON.stringify({ t: "msg", thread: "S-OLD", id: "m1", role: "user", text: "Remember this from Lody.", at: "2026-10-02T03:11:00Z" }),
    JSON.stringify({ t: "msg", thread: "S-OLD", id: "m2", role: "assistant", text: "And this is new since the plugin.", at: "2026-10-03T03:14:00Z" }),
    JSON.stringify({ t: "thread", id: "S-NEW", title: "A thread after the move", repo: "acme/hawdb", createdAt: "2026-11-01T03:11:00Z", updatedAt: "2026-11-01T03:14:00Z" }),
    JSON.stringify({ t: "msg", thread: "S-NEW", id: "n1", role: "user", text: "A new conversation.", at: "2026-11-01T03:11:00Z" }),
    JSON.stringify({ t: "end", threads: 2, messages: 3 }),
  ].join("\n") + "\n";

function counts(events: LogEvent[]) {
  return events.filter((e) => e.kind === "task_event").length;
}

test("a Lody imported task stays under the plugin's row and importing again appends only new messages", async () => {
  const t = tempDir();
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock: { now: () => NOW, setTimeout: () => 0, clearTimeout: () => {} } });
  const tasks = createRegistry(log, { now: () => NOW, setTimeout: () => 0, clearTimeout: () => {} });
  const marks = createMarks({ dataDir: t.dir, now: () => NOW });
  tasks.setMarks((p, id) => marks.get(p, id));
  const past = createPast({ log, tasks, marks, now: () => NOW });
  try {
    // The old built-in Lody wrote this: no host stamp, app "Lody", account "lody".
    const before = await importInto({ log, tasks, persona: "default", now: () => NOW }, oldStream);
    expect([before.ok, before.threads, before.messages]).toEqual([true, 1, 1]);
    const ids = tasks.list().filter((c) => c.imported).map((c) => c.taskId);
    expect(ids).toHaveLength(1);

    // The official repository now carries Lody as a plugin (the same app name).
    const reader = join(t.dir, "lody-plugin");
    mkdirSync(reader, { recursive: true });
    cpSync(fixture, reader, { recursive: true });
    const repo = makePluginRepo(join(t.dir, "official"), [{ from: reader, id: "lody", app: "Lody" }], "abc12345");
    const holder = { out: grown("Impostor") };
    const runtime = createPluginRuntime({
      dataDir: t.dir,
      now: () => NOW,
      curated: [],
      sandbox: async () => ({ code: 0, stdout: holder.out, stderr: "" }),
    });
    const sources = createImportSources({
      log,
      tasks,
      dataDir: t.dir,
      persona: "default",
      now: () => NOW,
      zone: () => "UTC",
      plugins: runtime,
      officialUrl: repo.root,
      lookMs: 0,
    });
    await sources.look(true);
    const installed = await sources.install("official", "lody");
    expect(installed.ok).toBe(true);

    // The old imported task is the plugin row's imported count before anything new runs.
    const row = () => sources.view().sources.find((x) => x.id === "lody")!;
    expect(row()).toMatchObject({ app: "Lody", imported: 1, added: false, reviewed: true });
    expect(past.query("default", { q: "" }).items).toHaveLength(1);

    // The plugin's stream claims to be someone else; the host stamps it as Lody/lody, so the old
    // task is found and only m2 (and the new thread) are appended.
    const again = await sources.accept("lody");
    expect([again.ok, again.threads, again.messages]).toEqual([true, 1, 2]);
    const oldId = ids[0]!;
    const old = log.read({ stream: `task:${oldId}`, fromSeq: 0, limit: 100 });
    expect(counts(old)).toBe(2);
    const opened = old.find((e) => e.kind === "task_open")!.body as Bodies["task_open"];
    expect(opened.imported).toMatchObject({ app: "Lody", account: "lody", threadId: "S-OLD" });
    expect(tasks.list().filter((c) => c.imported)).toHaveLength(2);
    expect(row()).toMatchObject({ imported: 2 });

    // Running the same stream again appends nothing to either task.
    const third = await sources.accept("lody");
    expect([third.ok, third.threads, third.messages]).toEqual([true, 0, 0]);
    expect(counts(log.read({ stream: `task:${oldId}`, fromSeq: 0, limit: 100 }))).toBe(2);
  } finally {
    log.close();
    t.cleanup();
  }
});
