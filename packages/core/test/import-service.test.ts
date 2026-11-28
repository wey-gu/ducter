// D651 (research/246): the import service. One thread becomes one read-only past task; an
// import again brings nothing twice and a grown thread appends only its new messages; the project
// is the repo, else the folder's origin, else the folder's name marked gone; time words use the
// source's own time; and nothing wakes the partner or counts on On hand.
import { expect, test } from "bun:test";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import { parseImport } from "../src/imports/format.ts";
import { IMPORT_FORMAT } from "../src/imports/format.ts";
import { importedTaskId, importInto, repoProject } from "../src/imports/service.ts";
import { openLog } from "../src/log.ts";
import { createMarks, createPast } from "../src/past.ts";
import { createRegistry } from "../src/registry.ts";
import { startCore } from "../src/core.ts";
import { largeImport } from "./fixtures/import-large.ts";
import { tempDir } from "./helpers.ts";

const NOW = Date.parse("2026-11-28T12:00:00Z");

const src = () => ({ t: "source", format: IMPORT_FORMAT, app: "Lody", account: "workspace:my-team", reader: "lody-cli", readerVersion: "1" });
const thread = (id: string, over: Record<string, unknown> = {}) => ({ t: "thread", id, title: `Fix the flaky WAL test ${id}`, createdAt: "2026-10-02T03:11:00Z", updatedAt: "2026-10-02T05:40:12Z", ...over });
const msg = (threadId: string, id: string, over: Record<string, unknown> = {}) => ({ t: "msg", thread: threadId, id, role: "user", text: "The WAL test fails one run in five.", at: "2026-10-02T03:11:00Z", ...over });
const end = (threads: number, messages: number) => ({ t: "end", threads, messages });
const jsonl = (...rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join("\n");

const stream = () =>
  jsonl(
    src(),
    thread("s1", { repo: "github.com/acme/hawdb", folder: "/Users/me/src/hawdb" }),
    msg("s1", "m1", { text: "WAL 测试五分之一会失败，看看 checkpoint 的时序。" }),
    msg("s1", "m2", { role: "assistant", text: "It races the checkpoint. 修好了。", at: "2026-10-02T03:14:31Z" }),
    msg("s1", "m3", { text: "订一下京都的酒店，顺便看看机票。", at: "2026-10-02T03:20:00Z" }),
    thread("s2", { title: "Write the release notes", folder: "/Users/me/src/notes", repo: undefined }),
    msg("s2", "n1", { text: "Write the release notes for 0.9.", at: "2026-10-03T03:11:00Z" }),
    msg("s2", "n2", { role: "assistant", text: "Drafted them in CHANGELOG.md.", at: "2026-10-03T03:12:00Z" }),
    thread("s3", { title: "Try the old parser", folder: "/Users/me/src/old-thing", repo: undefined }),
    msg("s3", "o1", { text: "Try the old parser.", at: "2026-10-04T03:11:00Z" }),
    thread("s4", { title: "Chat about the Kyoto trip", folder: undefined, repo: undefined }),
    msg("s4", "c1", { text: "京都的酒店订哪家好？", at: "2026-10-05T03:11:00Z" }),
    end(4, 7),
  );

function setup() {
  const t = tempDir();
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock: { now: () => NOW, setTimeout: () => 0, clearTimeout: () => {} } });
  const tasks = createRegistry(log, { now: () => NOW, setTimeout: () => 0, clearTimeout: () => {} });
  const marks = createMarks({ dataDir: t.dir, now: () => NOW });
  tasks.setMarks((p, id) => marks.get(p, id));
  const past = createPast({ log, tasks, marks, now: () => NOW });
  const folders: Record<string, { exists: boolean; remote?: string; name?: string }> = {
    "/Users/me/src/notes": { exists: true, remote: "git@github.com:acme/notes.git", name: "notes" },
  };
  const deps = {
    log,
    tasks,
    persona: "default",
    now: () => NOW,
    folder: async (path: string) => {
      const f = folders[path];
      return f ? ({ ...f, root: path, kind: f.remote ? "repo" : "folder" } as never) : ({ exists: false } as never);
    },
    runId: () => "run_test",
  };
  return { ...t, log, tasks, past, deps };
}

test("an import: one read-only task per thread, its day and project from the source", async () => {
  const s = setup();
  const r = await importInto(s.deps, stream());
  expect(r.ok).toBe(true);
  expect([r.threads, r.messages, r.skipped]).toEqual([4, 7, 0]);
  const cards = s.tasks.list().filter((c) => c.imported);
  expect(cards).toHaveLength(4);
  const byThread = (id: string) => cards.find((c) => c.imported!.threadId === id)!;
  expect(byThread("s1").project).toBe("hawdb");
  expect(byThread("s2").project).toBe("notes");
  expect(byThread("s3").project).toBe("old-thing");
  expect(byThread("s3").imported!.folderGone).toBe(true);
  expect(byThread("s4").project).toBe("");
  expect(byThread("s4").imported!.folderGone).toBeUndefined();
  expect(byThread("s1").imported).toMatchObject({ app: "Lody", account: "workspace:my-team", threadId: "s1", runId: "run_test", createdAt: "2026-10-02T03:11:00.000Z", at: "2026-10-02T03:20:00.000Z", repo: "github.com/acme/hawdb", folder: "/Users/me/src/hawdb" });
  expect(byThread("s1").openedAt).toBe("2026-10-02T03:11:00.000Z");
  expect(byThread("s1").updatedAt).toBe("2026-10-02T03:20:00.000Z");
  // Its messages are task events in source order; the person's are steps; its ending is done.
  const events = s.log.read({ stream: `task:${byThread("s1").taskId}`, fromSeq: 0, limit: 1000 });
  expect(events.map((e) => e.kind)).toEqual(["task_open", "task_event", "task_event", "task_event", "task_state"]);
  expect(events.map((e) => e.origin)).toEqual(["import", "import", "import", "import", "import"]);
  expect(events.slice(1, 4).map((e) => (e.body as Bodies["task_event"]).at)).toEqual(["2026-10-02T03:11:00.000Z", "2026-10-02T03:14:31.000Z", "2026-10-02T03:20:00.000Z"]);
  expect(s.past.steps(byThread("s1").taskId).map((x) => x.at)).toEqual(["2026-10-02T03:11:00.000Z", "2026-10-02T03:20:00.000Z"]);
  expect(s.past.item(byThread("s1").taskId)!.imported).toMatchObject({ app: "Lody", threadId: "s1", at: "2026-10-02T03:20:00.000Z" });
  // One import_run, on the system stream.
  const runs = s.log.read({ kinds: ["import_run"], fromSeq: 0, limit: 10 }).map((e) => e.body as Bodies["import_run"]);
  expect(runs).toEqual([{ runId: "run_test", app: "Lody", account: "workspace:my-team", phase: "done", threads: 4, messages: 7, skipped: 0 }]);
  s.cleanup();
});

test("importing again brings nothing twice; a grown thread appends only its new messages", async () => {
  const s = setup();
  const first = await importInto(s.deps, stream());
  expect([first.threads, first.messages]).toEqual([4, 7]);
  const again = await importInto(s.deps, stream());
  expect([again.threads, again.messages, again.skipped]).toEqual([0, 0, 0]);
  expect(s.tasks.list().filter((c) => c.imported)).toHaveLength(4);
  for (const c of s.tasks.list().filter((x) => x.imported)) {
    expect(s.log.read({ stream: `task:${c.taskId}`, kinds: ["task_open"], limit: 10 })).toHaveLength(1);
  }

  // The same thread, one message longer (and one message edited in the source: not updated).
  const grown = jsonl(
    src(),
    thread("s1", { repo: "github.com/acme/hawdb", folder: "/Users/me/src/hawdb" }),
    msg("s1", "m1", { text: "WAL 测试五分之一会失败，看看 checkpoint 的时序。" }),
    msg("s1", "m2", { role: "assistant", text: "It races the checkpoint. 修好了（改了一句）。", at: "2026-10-02T03:14:31Z" }),
    msg("s1", "m3", { text: "订一下京都的酒店，顺便看看机票。", at: "2026-10-02T03:20:00Z" }),
    msg("s1", "m4", { text: "机票也订好了，12 月 5 日。", at: "2026-10-02T04:00:00Z" }),
    end(1, 4),
  );
  const r = await importInto(s.deps, grown);
  expect([r.threads, r.messages, r.skipped]).toEqual([0, 1, 1]);
  const task = s.tasks.list().find((c) => c.imported!.threadId === "s1")!;
  const events = s.log.read({ stream: `task:${task.taskId}`, fromSeq: 0, limit: 1000 }).filter((e) => e.kind === "task_event");
  expect(events.map((e) => (e.body as Bodies["task_event"]).importedId)).toEqual(["m1", "m2", "m3", "m4"]);
  // The grown thread's day moved to its newest message.
  expect(s.tasks.get(task.taskId)!.updatedAt).toBe("2026-10-02T04:00:00.000Z");
  s.cleanup();
});

test("task_find's index finds an imported thread by words and by 上个月, through at", async () => {
  const s = setup();
  await importInto(s.deps, stream());
  const byWords = s.past.query("default", { q: "京都 酒店" });
  expect(byWords.items.map((x) => x.imported?.threadId)).toEqual(["s4", "s1"]);
  const byMonth = s.past.query("default", { q: "上个月" });
  expect(byMonth.range?.words).toBe("上个月");
  expect(byMonth.items).toHaveLength(4);
  expect(byMonth.items.every((x) => !!x.imported)).toBe(true);
  // This month excludes October's.
  expect(s.past.query("default", { q: "这个月" }).items).toHaveLength(0);
  // The app is findable too ("from Lody").
  expect(s.past.query("default", { q: "Lody" }).items).toHaveLength(4);
  s.cleanup();
});

test("300 threads, one with 4,000 messages, CJK and English: real counts", { timeout: 120_000 }, async () => {
  const t = tempDir();
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock: { now: () => NOW, setTimeout: () => 0, clearTimeout: () => {} } });
  const tasks = createRegistry(log, { now: () => NOW, setTimeout: () => 0, clearTimeout: () => {} });
  const fixture = largeImport(NOW);
  const check = parseImport(fixture.text, { now: () => NOW });
  expect(check.ok).toBe(true);
  expect([check.counts.threads, check.counts.messages]).toEqual([300, fixture.messages]);
  const r = await importInto({ log, tasks, persona: "default", now: () => NOW, folder: async () => ({ exists: false }) as never, runId: () => "run_large" }, fixture.text);
  expect([r.threads, r.messages]).toEqual([300, fixture.messages]);
  expect(tasks.list().filter((c) => c.imported)).toHaveLength(300);
  expect(log.read({ stream: `task:${importedTaskId("Lody", "workspace:acme", "thread-0")}`, kinds: ["task_event"], fromSeq: 0, limit: 10_000 })).toHaveLength(4000);
  // A second run over the same stream appends nothing.
  const again = await importInto({ log, tasks, persona: "default", now: () => NOW, folder: async () => ({ exists: false }) as never, runId: () => "run_large2" }, fixture.text);
  expect([again.threads, again.messages]).toEqual([0, 0]);
  log.close();
  t.cleanup();
});

test("a chat-only reader with no folders at all works the same", async () => {
  const s = setup();
  const onlyChat = jsonl(
    src(),
    thread("chat-1", { title: "周末去哪儿", folder: undefined, repo: undefined }),
    msg("chat-1", "a", { text: "周末去苏州还是杭州？", at: "2026-10-06T03:11:00Z" }),
    msg("chat-1", "b", { role: "assistant", text: "苏州更近，园林也更适合慢慢逛。", at: "2026-10-06T03:12:00Z" }),
    end(1, 2),
  );
  const r = await importInto(s.deps, onlyChat);
  expect([r.threads, r.messages]).toEqual([1, 2]);
  const card = s.tasks.list().find((c) => c.imported!.threadId === "chat-1")!;
  expect(card.project).toBe("");
  expect(card.place).toEqual({ kind: "none" });
  expect(s.past.query("default", { q: "苏州" }).items.map((x) => x.taskId)).toEqual([card.taskId]);
  s.cleanup();
});

test("no partner wake, no report or question, no attention event, nothing on On hand", async () => {
  const t = tempDir();
  const core = startCore({ dataDir: join(t.dir, "data"), port: 0, batchMs: 5, clock: { now: () => NOW, setTimeout: () => 0, clearTimeout: () => {} } });
  let wakes = 0;
  core.setPartner({ onTrigger: () => void wakes++ });
  try {
    const r = await importInto({ log: core.log, tasks: core.tasks, persona: "default", now: () => NOW }, stream());
    expect(r.ok).toBe(true);
    await Bun.sleep(60);
    expect(wakes).toBe(0);
    const oh = core.tasks.onHand();
    expect(oh.tasks.filter((c) => c.imported)).toHaveLength(0);
    expect(oh.counts).toEqual({ needs_you: 0, working: 0, waiting: 0, done_today: 0 });
    expect(core.log.read({ kinds: ["report", "decision", "waiter"], fromSeq: 0, limit: 100 })).toHaveLength(0);
    const states = core.log.read({ kinds: ["task_state"], fromSeq: 0, limit: 100 }).map((e) => e.body as Bodies["task_state"]);
    expect(states.length).toBe(4);
    expect(states.every((s) => s.attention === "done" && s.residency === "archived")).toBe(true);
  } finally {
    await core.stop();
    t.cleanup();
  }
});

test("no client can Continue an imported task: the home refuses it", async () => {
  const t = tempDir();
  const core = startCore({ dataDir: join(t.dir, "data"), port: 0, batchMs: 5, clock: { now: () => NOW, setTimeout: () => 0, clearTimeout: () => {} } });
  try {
    const r = await importInto({ log: core.log, tasks: core.tasks, persona: "default", now: () => NOW }, stream());
    const taskId = r.taskIds![0]!;
    const frames: import("@ducter/protocol").ServerFrame[] = [];
    const ws = new WebSocket(core.url);
    ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
    await new Promise<void>((res) => (ws.onopen = () => res()));
    ws.send(JSON.stringify({ t: "hello", client: "cli" }));
    await Bun.sleep(80);
    expect(core.tasks.get(taskId)!.attention).toBe("done");
    ws.send(JSON.stringify({ t: "past_continue", taskId }));
    for (let i = 0; i < 100 && !frames.some((f) => f.t === "action_result"); i++) await Bun.sleep(10);
    const answer = frames.find((f) => f.t === "action_result") as Extract<import("@ducter/protocol").ServerFrame, { t: "action_result" }> | undefined;
    expect(answer).toMatchObject({ ok: false, action: "continue" });
    expect(answer!.message).toContain("read only");
    // Typing into the opened task is a Continue too: the home refuses it.
    ws.send(JSON.stringify({ t: "task_send", taskId, text: "接着订" }));
    for (let i = 0; i < 100 && !frames.some((f) => f.t === "error"); i++) await Bun.sleep(10);
    const refused = frames.find((f) => f.t === "error") as Extract<import("@ducter/protocol").ServerFrame, { t: "error" }> | undefined;
    expect(refused?.message).toContain("read only");
    expect(core.tasks.get(taskId)!.attention).toBe("done");
    ws.close();
  } finally {
    await core.stop();
    t.cleanup();
  }
});

test("the deterministic id and repo name", () => {
  expect(importedTaskId("Lody", "workspace", "S-1")).toBe(importedTaskId("Lody", "workspace", "S-1"));
  expect(importedTaskId("Lody", "workspace", "S-1")).not.toBe(importedTaskId("Lody", "other", "S-1"));
  expect(importedTaskId("Lody", "workspace", "S-1")).toStartWith("imp_");
  expect(repoProject("git@github.com:Acme/HawDB.git")).toBe("hawdb");
  expect(repoProject("acme/hawdb")).toBe("hawdb");
});

test("a thread a failed stream left partial is not brought in", async () => {
  const s = setup();
  const r = await importInto(s.deps, jsonl(src(), thread("s1"), msg("s1", "m1"), { t: "unknown" }));
  expect(r.ok).toBe(false);
  expect(r.stopped?.line).toBe(4);
  expect(r.threads).toBe(0);
  expect(s.tasks.list().filter((c) => c.imported)).toHaveLength(0);
  // Still one ledger, phase stopped.
  const runs = s.log.read({ kinds: ["import_run"], fromSeq: 0, limit: 10 }).map((e) => e.body as Bodies["import_run"]);
  expect(runs).toMatchObject([{ phase: "stopped", threads: 0, messages: 0 }]);
  s.cleanup();
});
