// D356: a link in a task's or the partner's words to a file on the home. The client asks over
// its socket (file_open); the home reads it from the task's own folders (D206's shown rules) on
// the computer the task works on, keeps a copy in its media, and answers with the ref the viewer
// opens; or says why not (gone, outside a task's folders, too big), never nothing.
import { afterEach, expect, test } from "bun:test";
import { mkdirSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HarnessPort, HarnessSession } from "@ducter/protocol/src/internal.ts";
import type { MediaRef, ServerFrame } from "@ducter/protocol";
import { createRunner } from "../../runner/src/index.ts";
import { startCore, type Core } from "../src/core.ts";
import { openTask, tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const idle: HarnessPort = {
  async start() {
    return { id: "s1", canSteer: false, busy: () => false, send: async () => {}, interrupt: async () => {}, close: async () => {}, events: () => ({ async *[Symbol.asyncIterator]() {} }) } as unknown as HarnessSession;
  },
  async available() {
    return [];
  },
};

function boot(): { core: Core; dir: string } {
  const t = tempDir();
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, platform: "darwin", push: false });
  const runner = createRunner(core, { harness: idle });
  core.setRunner(runner);
  stops.push(t.cleanup, () => core.stop(), () => runner.dispose());
  return { core, dir: t.dir };
}

async function client(core: Core) {
  const ws = new WebSocket(core.url);
  stops.push(() => ws.close());
  const frames: ServerFrame[] = [];
  ws.onmessage = (m) => void frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  ws.send(JSON.stringify({ t: "hello" }));
  let n = 0;
  const ask = async (path: string, taskId?: string) => {
    const id = `fo${++n}`;
    ws.send(JSON.stringify({ t: "file_open", id, path, ...(taskId ? { taskId } : {}) }));
    const end = Date.now() + 4000;
    for (;;) {
      const f = frames.find((x) => x.t === "file_open" && x.id === id);
      if (f) return f as Extract<ServerFrame, { t: "file_open" }>;
      if (Date.now() > end) throw new Error(`no file_open answer; got ${frames.map((x) => x.t).join(",")}`);
      await Bun.sleep(20);
    }
  };
  return { ask };
}

test("a link to a file in a task's scratch folder opens: the home keeps a copy and the viewer reads it", async () => {
  const { core, dir } = boot();
  openTask(core.log, "swj3zc4w", "Review PR 10419");
  const scratch = join(dir, "scratch", "swj3zc4w");
  mkdirSync(scratch, { recursive: true });
  const report = "# Review of 10419\n\nRestart round 59: **passed**.\n";
  writeFileSync(join(scratch, "review-10419-restart-round59.md"), report);
  const { ask } = await client(core);

  // From the conversation (no task named): the path's scratch folder names the task.
  const a = await ask(join(scratch, "review-10419-restart-round59.md"));
  expect(a.ok).toBe(true);
  const file = (a as { file: MediaRef }).file;
  expect(file).toMatchObject({ name: "review-10419-restart-round59.md", type: "text/markdown", bytes: report.length, from: { taskId: "swj3zc4w" } });
  // The bytes come through the keyed media path the viewer already fetches from.
  const res = await fetch(`http://127.0.0.1:${core.port}/media/${file.id}?k=${file.k}`);
  expect(res.status).toBe(200);
  expect(await res.text()).toBe(report);

  // From the task itself (its id as the hint): the same file.
  const b = await ask(join(scratch, "review-10419-restart-round59.md"), "swj3zc4w");
  expect(b.ok && (b as { file: MediaRef }).file.id).toBe(file.id);

  // A kind Ducter can't show is still kept (inert), for Save a copy.
  writeFileSync(join(scratch, "trace.bin"), new Uint8Array([0, 1, 2, 3, 0, 255]));
  const c = await ask(join(scratch, "trace.bin"), "swj3zc4w");
  expect(c.ok && (c as { file: MediaRef }).file.type).toBe("application/octet-stream");
});

test("a link outside every task's own folders, gone or too big is refused with its reason", async () => {
  const { core, dir } = boot();
  openTask(core.log, "t1");
  const scratch = join(dir, "scratch", "t1");
  mkdirSync(scratch, { recursive: true });
  const { ask } = await client(core);

  // Ducter's own data (its keys, the Log) is never a task's file, named or not.
  writeFileSync(join(dir, "keys.json"), "{}");
  expect(await ask(join(dir, "keys.json"), "t1")).toMatchObject({ ok: false, error: "outside" });
  expect(await ask(join(dir, "keys.json"))).toMatchObject({ ok: false, error: "outside" });
  // A system file no task holds.
  expect(await ask("/etc/hosts")).toMatchObject({ ok: false, error: "outside" });
  expect(await ask("/etc/hosts", "t1")).toMatchObject({ ok: false, error: "outside" });
  // Another task's scratch folder, through a link from this one's folder, stays outside.
  mkdirSync(join(dir, "scratch", "other"), { recursive: true });
  writeFileSync(join(dir, "scratch", "other", "secret.md"), "not yours");
  expect(await ask(join(dir, "scratch", "other", "secret.md"), "t1")).toMatchObject({ ok: false, error: "outside" });
  // Gone.
  expect(await ask(join(scratch, "gone.md"), "t1")).toMatchObject({ ok: false, error: "missing" });
  // Over 25 MB.
  const big = join(scratch, "huge.log");
  writeFileSync(big, "");
  truncateSync(big, 26 * 1024 * 1024);
  expect(await ask(big, "t1")).toMatchObject({ ok: false, error: "too_big" });
});

test("a folder task's own files open; Ducter's data folder inside its folder never does", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const folder = t.dir;
  const data = join(folder, ".ducter");
  const core = startCore({ dataDir: data, port: 0, batchMs: 5, platform: "darwin", push: false });
  const runner = createRunner(core, { harness: idle });
  core.setRunner(runner);
  stops.push(() => core.stop(), () => runner.dispose());
  core.log.append({ stream: "task:f1", origin: "partner", kind: "task_open", body: { taskId: "f1", title: "Tidy notes", place: { kind: "folder", path: folder }, harness: "claude-code", brief: "Tidy." } });
  writeFileSync(join(folder, "notes.txt"), "tidy\n");
  writeFileSync(join(data, "keys.json"), "{}");
  const { ask } = await client(core);
  const ok = await ask(join(folder, "notes.txt"));
  expect(ok.ok && (ok as { file: MediaRef }).file).toMatchObject({ name: "notes.txt", type: "text/plain", from: { taskId: "f1" } });
  expect(await ask(join(data, "keys.json"))).toMatchObject({ ok: false, error: "outside" });
});
