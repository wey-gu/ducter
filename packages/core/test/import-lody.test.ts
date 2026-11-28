// D655 (research/246): the Lody reader and Settings › 导入 / Import's state.
//
// The reader is checked against a fake `lody` on a temp PATH, shaped from the CLI's own output
// (research/246 §4.2; the CLI's sources read on 2026-11-28): paging by nextCursor, a 4,000-entry
// session, CJK and English, an encrypted workspace's refusal and a signed-out login. The real
// binary is never run. The source's state (consent once, the offer fading and 先不, removal hiding
// what it brought in, and a second run appending only new words) is checked through the Log.
import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Bodies } from "@ducter/protocol";
import { parseImport } from "../src/imports/format.ts";
import { detectLody, lookLody, lodyRunner, readLody } from "../src/imports/lody.ts";
import { importedTaskId, importInto } from "../src/imports/service.ts";
import { createImportSources } from "../src/imports/sources.ts";
import { startCore } from "../src/core.ts";
import { openLog } from "../src/log.ts";
import { createMarks, createPast } from "../src/past.ts";
import { createRegistry } from "../src/registry.ts";
import { tempDir } from "./helpers.ts";

const NOW = Date.parse("2026-11-28T12:00:00Z");

interface FakeSession {
  id: string;
  title?: string;
  repoFullName?: string;
  createdAt?: string;
  lastMessageAt?: number;
  isArchived?: boolean;
  show?: Record<string, unknown>;
  history: Record<string, unknown>[];
}

interface FakeState {
  signedIn?: boolean;
  pageSize?: number;
  workspaces: { id: string; name: string; slug: string; encrypted?: boolean }[];
  sessions: Record<string, FakeSession[]>;
}

const fakeDir = mkdtempSync(join(tmpdir(), "ducter-fake-lody-"));
const SCRIPT = join(import.meta.dir, "fixtures/fake-lody.js");
writeFileSync(join(fakeDir, "lody"), '#!/bin/sh\nexec "$DUCTER_TEST_BUN" "$DUCTER_FAKE_LODY_JS" "$@"\n');
chmodSync(join(fakeDir, "lody"), 0o755);
const oldPath = process.env.PATH;
const oldEnv = { bun: process.env.DUCTER_TEST_BUN, js: process.env.DUCTER_FAKE_LODY_JS, state: process.env.DUCTER_FAKE_LODY_STATE };
process.env.DUCTER_TEST_BUN = process.execPath;
process.env.DUCTER_FAKE_LODY_JS = SCRIPT;

afterEach(() => {
  process.env.PATH = oldPath;
  process.env.DUCTER_TEST_BUN = oldEnv.bun;
  process.env.DUCTER_FAKE_LODY_JS = oldEnv.js;
  process.env.DUCTER_FAKE_LODY_STATE = oldEnv.state;
});

/** Puts the fake on PATH with this state; returns the runner that finds it. */
function fake(state: FakeState) {
  process.env.DUCTER_TEST_BUN = process.execPath;
  process.env.DUCTER_FAKE_LODY_JS = SCRIPT;
  const dir = mkdtempSync(join(tmpdir(), "ducter-lody-state-"));
  const file = join(dir, "state.json");
  writeFileSync(file, JSON.stringify({ signedIn: true, ...state }));
  process.env.DUCTER_FAKE_LODY_STATE = file;
  process.env.PATH = `${fakeDir}:${oldPath ?? ""}`;
  return {
    write(next: FakeState) {
      writeFileSync(file, JSON.stringify({ signedIn: true, ...next }));
    },
    run: lodyRunner(),
  };
}

const when = (i: number) => new Date(Date.parse("2026-10-02T03:11:00Z") + i * 60_000).toISOString();
const text = (i: number, zh: boolean) => (zh ? `第 ${i + 1} 段：WAL 测试五分之一会失败，看看 checkpoint 的时序。` : `Message ${i + 1}: the WAL test fails one run in five; look at the checkpoint timing.`);
const entry = (i: number, zh: boolean): Record<string, unknown> => ({
  id: `m${i + 1}`,
  role: i % 2 === 0 ? "user" : "assistant",
  timestamp: when(i),
  items: [{ type: "text", text: text(i, zh) }],
  ...(i % 2 === 1 ? { finished: true, endedAt: Date.parse(when(i)) } : {}),
});

const session = (id: string, n: number, o: Partial<FakeSession> = {}, zh = false): FakeSession => ({
  id,
  title: `Fix the flaky WAL test ${id}`,
  repoFullName: "acme/hawdb",
  createdAt: "2026-10-02T03:11:00Z",
  lastMessageAt: Date.parse(when(Math.max(0, n - 1))),
  history: Array.from({ length: n }, (_, i) => entry(i, zh)),
  ...o,
});

test("detect: lody on PATH and signed in, without reading a conversation", async () => {
  const f = fake({ workspaces: [{ id: "w1", name: "My Team", slug: "my-team" }], sessions: { "my-team": [session("S1", 2)] } });
  const d = await detectLody(f.run);
  expect(d).toEqual({ present: true, signedIn: true, workspaces: [{ id: "w1", name: "My Team", slug: "my-team" }] });
  const l = await lookLody(f.run);
  expect([l.total, l.waiting]).toEqual([1, []]);
});

test("detect: signed out, and no lody at all", async () => {
  const f = fake({ signedIn: false, workspaces: [], sessions: {} });
  const d = await detectLody(f.run);
  expect([d.present, d.signedIn]).toEqual([true, false]);
  const r = await readLody(f.run, { now: () => NOW });
  expect([r.present, r.signedIn, r.stream, r.total]).toEqual([true, false, "", 0]);

  // No lody on PATH: not present, and nothing read.
  process.env.PATH = join(fakeDir, "empty");
  const none = await detectLody(lodyRunner());
  expect(none.present).toBe(false);
});

test("the reader pages by nextCursor and brings every session in", async () => {
  const f = fake({
    pageSize: 2,
    workspaces: [{ id: "w1", name: "My Team", slug: "my-team" }],
    sessions: { "my-team": [session("S1", 2), session("S2", 2, { title: "Write the release notes" }), session("S3", 2)] },
  });
  const r = await readLody(f.run, { now: () => NOW });
  expect([r.total, r.threads, r.messages, r.skipped]).toEqual([3, 3, 6, 0]);
  const parsed = parseImport(r.stream, { now: () => NOW });
  expect(parsed.ok).toBe(true);
  expect(parsed.threads.map((t) => t.id).sort()).toEqual(["S1", "S2", "S3"]);
  expect(parsed.source?.app).toBe("Lody");
});

test("a 4,000-entry session comes in whole, CJK and English kept", async () => {
  const f = fake({
    workspaces: [{ id: "w1", name: "My Team", slug: "my-team" }],
    sessions: { "my-team": [session("S1", 4000, {}, true), session("S2", 2, { title: "English one" }, false)] },
  });
  const r = await readLody(f.run, { now: () => NOW });
  expect(r.messages).toBe(4002);
  const parsed = parseImport(r.stream, { now: () => NOW });
  const s1 = parsed.threads.find((t) => t.id === "S1")!;
  expect(s1.messages).toHaveLength(4000);
  expect(s1.messages[0]!.text).toContain("WAL 测试五分之一会失败");
  expect(parsed.threads.find((t) => t.id === "S2")!.messages[0]!.text).toContain("the WAL test fails");
});

test("an encrypted workspace is refused in its own words; the readable ones still come in", async () => {
  const f = fake({
    workspaces: [
      { id: "w1", name: "My Team", slug: "my-team" },
      { id: "w2", name: "Secret Roost", slug: "secret", encrypted: true },
    ],
    sessions: { "my-team": [session("S1", 2)] },
  });
  const r = await readLody(f.run, { now: () => NOW });
  expect(r.threads).toBe(1);
  expect(r.waiting).toEqual(["Secret Roost"]);
  expect(r.workspaces.find((w) => w.slug === "secret")!.state).toBe("needs_authorization");
  const l = await lookLody(f.run);
  expect([l.total, l.waiting]).toEqual([1, ["Secret Roost"]]);
});

test("session show supplies the binding when the list doesn't", async () => {
  const s = session("S1", 2, { repoFullName: undefined, show: { repoFullName: "acme/from-show", branchName: "fix/wal" } });
  const f = fake({ workspaces: [{ id: "w1", name: "My Team", slug: "my-team" }], sessions: { "my-team": [s] } });
  const r = await readLody(f.run, { now: () => NOW });
  const parsed = parseImport(r.stream, { now: () => NOW });
  expect(parsed.threads[0]!.repo).toBe("acme/from-show");
  expect(parsed.threads[0]!.branch).toBe("fix/wal");
});

function setup(run: ReturnType<typeof fake>["run"] | undefined) {
  const t = tempDir();
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock: { now: () => NOW, setTimeout: () => 0, clearTimeout: () => {} } });
  const tasks = createRegistry(log, { now: () => NOW, setTimeout: () => 0, clearTimeout: () => {} });
  const marks = createMarks({ dataDir: t.dir, now: () => NOW });
  tasks.setMarks((p, id) => marks.get(p, id));
  const past = createPast({ log, tasks, marks, now: () => NOW });
  let at = NOW;
  const sources = createImportSources({
    log,
    tasks,
    dataDir: t.dir,
    persona: "default",
    now: () => at,
    zone: () => "UTC",
    ...(run ? { run } : {}),
    lookMs: 0,
  });
  return { ...t, log, tasks, past, sources, advance: (ms: number) => (at += ms) };
}

test("a source: consent once, a run, its last line, and a second run with only the new words", async () => {
  const f = fake({ workspaces: [{ id: "w1", name: "My Team", slug: "my-team" }], sessions: { "my-team": [session("S1", 2)] } });
  const s = setup(f.run);
  await s.sources.look();
  const before = s.sources.view();
  expect(before.sources[0]).toMatchObject({ id: "lody", app: "Lody", state: "ready", total: 1, imported: 0, consented: false });
  expect(before.sources[0]!.fresh).toBeUndefined();
  expect(before.offer).toMatchObject({ id: "lody", total: 1 });

  expect((await s.sources.run("lody")).error).toBe("not_consented");
  const a = await s.sources.accept("lody");
  expect([a.ok, a.threads, a.messages]).toEqual([true, 1, 2]);
  const after = s.sources.view();
  expect(after.sources[0]).toMatchObject({ imported: 1, consented: true, fresh: 0 });
  expect(after.sources[0]!.last).toMatchObject({ threads: 1, skipped: 0 });
  expect(after.offer).toBeUndefined();

  // The source grew: only the new word is appended, and nothing is duplicated.
  f.write({ workspaces: [{ id: "w1", name: "My Team", slug: "my-team" }], sessions: { "my-team": [session("S1", 3)] } });
  const again = await s.sources.run("lody");
  expect([again.ok, again.threads, again.messages]).toEqual([true, 0, 1]);
  const tid = importedTaskId("Lody", "lody", "S1");
  const events = s.log.read({ stream: `task:${tid}` }).filter((e) => e.kind === "task_event");
  expect(events).toHaveLength(3);
  expect((events[2]!.body as Bodies["task_event"]).importedId).toBe("m3");
});

test("the offer: drawn once, fades; 先不 waits for the person to mention the app", async () => {
  const f = fake({ workspaces: [{ id: "w1", name: "My Team", slug: "my-team" }], sessions: { "my-team": [session("S1", 2)] } });
  const s = setup(f.run);
  await s.sources.look();
  expect(s.sources.view().offer).toBeTruthy();
  s.sources.offerSeen("lody");
  expect(s.sources.view().offer).toBeTruthy();
  s.advance(25 * 3_600_000);
  expect(s.sources.view().offer).toBeUndefined();

  const g = setup(f.run);
  await g.sources.look();
  g.sources.offerDecline("lody");
  expect(g.sources.view().offer).toBeUndefined();
  g.sources.mention();
  expect(g.sources.view().offer).toBeTruthy();
  expect(g.sources.offerLine()).toMatchObject({ app: "Lody", total: 1 });
});

test("removal hides what the source brought in, and bringing it in again puts it back", async () => {
  const f = fake({ workspaces: [{ id: "w1", name: "My Team", slug: "my-team" }], sessions: { "my-team": [session("S1", 2), session("S2", 2)] } });
  const s = setup(f.run);
  await s.sources.look();
  await s.sources.accept("lody");
  expect(s.tasks.list().filter((c) => c.imported)).toHaveLength(2);
  expect(s.past.query("default", { q: "" }).items).toHaveLength(2);

  s.sources.remove("lody");
  expect(s.tasks.list().filter((c) => c.imported)).toHaveLength(0);
  expect(s.past.query("default", { q: "" }).items).toHaveLength(0);
  expect(s.sources.view().sources[0]!.consented).toBe(false);
  expect(s.sources.view().sources[0]!.last).toBeUndefined();

  // The person says yes again: the same tasks come back, not new ones.
  await s.sources.accept("lody");
  expect(s.tasks.list().filter((c) => c.imported)).toHaveLength(2);
  expect(s.past.query("default", { q: "" }).items).toHaveLength(2);
});

test("an encrypted source with nothing readable says so, and a run says why", async () => {
  const f = fake({
    workspaces: [{ id: "w2", name: "Secret Roost", slug: "secret", encrypted: true }],
    sessions: {},
  });
  const s = setup(f.run);
  await s.sources.look();
  expect(s.sources.view().sources[0]).toMatchObject({ state: "needs_authorization", problem: "needs_authorization", waiting: ["Secret Roost"] });
  const r = await s.sources.accept("lody");
  expect(r.error).toBe("needs_authorization");
});

test("importInto is the only writer: the reader's stream is validated once", async () => {
  const f = fake({ workspaces: [{ id: "w1", name: "My Team", slug: "my-team" }], sessions: { "my-team": [session("S1", 2)] } });
  const r = await readLody(f.run, { now: () => NOW });
  const parsed = parseImport(r.stream, { now: () => NOW });
  expect(parsed.ok).toBe(true);
  const t = tempDir();
  const log = openLog({ path: join(t.dir, "ducter.db"), persona: "default", clock: { now: () => NOW, setTimeout: () => 0, clearTimeout: () => {} } });
  const tasks = createRegistry(log, { now: () => NOW, setTimeout: () => 0, clearTimeout: () => {} });
  const a = await importInto({ log, tasks, persona: "default", now: () => NOW }, r.stream);
  expect([a.threads, a.messages]).toEqual([1, 2]);
  expect(log.read({ stream: "system", kinds: ["import_run"] })).toHaveLength(1);
});

test("the socket: the pane asks, the consent runs, and the home's one service writes", async () => {
  const t = tempDir();
  const run = async (args: string[]): Promise<{ code: number; stdout: string; stderr: string }> => {
    const out = (o: unknown) => ({ code: 0, stdout: `${JSON.stringify(o)}\n`, stderr: "" });
    if (args[0] === "workspace" && args[1] === "list") return out({ ok: true, workspaces: [{ id: "w1", name: "Team", slug: "my-team" }] });
    if (args[0] === "session" && args[1] === "list") return out({ ok: true, items: [{ id: "S1", title: "A thread", repoFullName: "acme/hawdb", createdAt: "2026-10-02T03:11:00Z", lastMessageAt: NOW - 3_600_000 }], hasMore: false });
    if (args[0] === "session" && args[1] === "history") return { code: 0, stdout: `${JSON.stringify({ workspaceId: "w1", sessionId: "S1", id: "m1", role: "user", timestamp: "2026-10-02T03:11:00Z", items: [{ type: "text", text: "WAL 测试看看。" }] })}\n`, stderr: "" };
    return out({ ok: true, session: {} });
  };
  const core = startCore({ dataDir: t.dir, port: 0, push: false, importsRun: run });
  core.setPartner({ onTrigger() {} });
  const ws = new WebSocket(core.url);
  const frames: { t: string; [k: string]: unknown }[] = [];
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  const until = async (pred: (f: any) => boolean) => {
    for (let i = 0; i < 400; i++) {
      const hit = frames.find(pred);
      if (hit) return hit;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  try {
    ws.send(JSON.stringify({ t: "hello" }));
    await until((f) => f.t === "on_hand");
    ws.send(JSON.stringify({ t: "imports" }));
    const first = await until((f) => f.t === "imports" && (f.sources as any[])[0]?.state === "ready");
    expect((first.sources as any[])[0]).toMatchObject({ id: "lody", state: "ready", total: 1 });
    expect(first.offer).toMatchObject({ id: "lody", total: 1 });
    ws.send(JSON.stringify({ t: "import_consent", id: "lody" }));
    const answer = await until((f) => f.t === "import_answer");
    expect([answer.ok, answer.op, answer.threads]).toEqual([true, "consent", 1]);
    const after = await until((f) => f.t === "imports" && (f.sources as any[])[0]?.imported === 1);
    expect(after.offer).toBeUndefined();
    ws.send(JSON.stringify({ t: "import_remove", id: "lody" }));
    const removed = await until((f) => f.t === "import_answer" && f.op === "remove");
    expect([removed.ok, removed.removed]).toEqual([true, 1]);
  } finally {
    ws.close();
    await core.stop();
    t.cleanup();
  }
});

test("a failure that isn't a signed-out login says it couldn't read, not 'sign in'", async () => {
  const run = async (args: string[]) =>
    args[0] === "workspace"
      ? { code: 0, stdout: `${JSON.stringify({ ok: true, workspaces: [{ id: "w1", name: "Team", slug: "my-team" }] })}\n`, stderr: "" }
      : { code: 1, stdout: "", stderr: "fetch failed: network is unreachable" };
  const s = setup(run);
  await s.sources.look();
  expect(s.sources.view().sources[0]).toMatchObject({ state: "failed", problem: "failed" });
});
