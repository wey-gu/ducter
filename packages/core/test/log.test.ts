import { afterEach, expect, test } from "bun:test";
import { chmodSync, statSync } from "node:fs";
import { join } from "node:path";
import { openLog } from "../src/log.ts";
import { tempDir } from "./helpers.ts";

let cleanup = () => {};
afterEach(() => cleanup());

const fresh = () => {
  const t = tempDir();
  cleanup = t.cleanup;
  const path = join(t.dir, "ducter.db");
  return { path, log: openLog({ path, persona: "default" }) };
};

test("seq is gapless and survives reopen", () => {
  const { path, log } = fresh();
  const a = log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "hi" } });
  const b = log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: "hello" } });
  expect([a.seq, b.seq]).toEqual([1, 2]);
  expect(a.persona).toBe("default");
  log.close();
  const again = openLog({ path, persona: "default" });
  expect(again.head()).toBe(2);
  expect(again.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "x" } }).seq).toBe(3);
  again.close();
});

test("supersedes round-trips and read filters work", () => {
  const { log } = fresh();
  const v1 = log.append({ stream: "channel", origin: "system", kind: "living_msg", body: { items: [] } });
  const v2 = log.append({ stream: "channel", origin: "system", kind: "living_msg", body: { items: [] }, supersedes: v1.seq });
  log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "assistant", text: "x" } });
  expect(log.read({ stream: "channel" }).map((e) => e.supersedes)).toEqual([undefined, v1.seq]);
  expect(log.read({ kinds: ["task_event"] })).toHaveLength(1);
  expect(log.read({ fromSeq: 2 }).map((e) => e.seq)).toEqual([2, 3]);
  expect(log.read({ beforeSeq: 3, limit: 1 }).map((e) => e.seq)).toEqual([v2.seq]);
  expect(log.read({ limit: 2 }).map((e) => e.seq)).toEqual([2, 3]);
});

test("search finds English and Chinese, including 2-char queries", () => {
  const { log } = fresh();
  log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "修复 foo 仓库里不稳定的测试" } });
  log.append({ stream: "task:t1", origin: "task", kind: "task_event", body: { taskId: "t1", role: "tool", tool: { name: "bash", output: "flaky test passed 10/10" }, raw: { secret: "rawonly" } } });
  expect(log.search("不稳定").map((e) => e.seq)).toEqual([1]);
  expect(log.search("测试").map((e) => e.seq)).toEqual([1]);
  expect(log.search("Flaky passed").map((e) => e.seq)).toEqual([2]);
  expect(log.search("flaky", { stream: "channel" })).toEqual([]);
  expect(log.search("rawonly")).toEqual([]); // raw payloads are not indexed
  expect(log.search('he said "quote')).toEqual([]); // no FTS syntax errors
});

test("subscribers see events in seq order even when a listener appends", () => {
  const { log } = fresh();
  const seenA: number[] = [];
  const seenB: number[] = [];
  log.subscribe((e) => {
    seenA.push(e.seq);
    if (e.seq === 1) log.append({ stream: "channel", origin: "system", kind: "ai_msg", body: { text: "nested" } });
  });
  log.subscribe((e) => seenB.push(e.seq));
  log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "hi" } });
  expect(seenA).toEqual([1, 2]);
  expect(seenB).toEqual([1, 2]);
});

test("the Log and its WAL files are owner-only, also on an install made before this was enforced", () => {
  const { path, log } = fresh();
  log.append({ stream: "channel", origin: "user", kind: "user_msg", body: { text: "private" } });
  const mode = (f: string) => statSync(f).mode & 0o777;
  for (const f of [path, `${path}-wal`, `${path}-shm`]) expect(mode(f)).toBe(0o600);
  log.close();
  chmodSync(path, 0o644); // an older install
  const again = openLog({ path, persona: "default" });
  expect(mode(path)).toBe(0o600);
  again.close();
});

test("a fresh data dir is owner-only", async () => {
  const t = tempDir();
  cleanup = t.cleanup;
  const { startCore } = await import("../src/core.ts");
  const dir = join(t.dir, "fresh", ".ducter");
  const core = startCore({ dataDir: dir, port: 0 });
  await core.stop();
  expect(statSync(dir).mode & 0o777).toBe(0o700);
});

test("an existing loose data dir from an older install is tightened", async () => {
  const t = tempDir();
  cleanup = t.cleanup;
  const { startCore } = await import("../src/core.ts");
  const { mkdirSync, chmodSync } = await import("node:fs");
  const dir = join(t.dir, "old", ".ducter");
  mkdirSync(dir, { recursive: true });
  chmodSync(dir, 0o775);
  const core = startCore({ dataDir: dir, port: 0 });
  await core.stop();
  expect(statSync(dir).mode & 0o777).toBe(0o700);
});
