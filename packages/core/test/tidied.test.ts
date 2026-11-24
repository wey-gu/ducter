// D514: what the home says holds a task's working copy, and what it counts as tidied per computer.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KeepLife } from "@ducter/protocol";
import { createTidied, holdOf } from "../src/tidied.ts";
import { openLog } from "../src/log.ts";

const facts = (o: { waiting?: boolean; life?: KeepLife; prs?: string[]; mark?: { starred?: boolean; keepCopy?: boolean } } = {}) => ({
  waiting: () => !!o.waiting,
  keepLife: () => o.life,
  openPrs: () => o.prs ?? [],
  mark: () => o.mark,
});

test("holdOf: a wait, a Keep on or paused, an open PR, a star or a keep; nothing else holds", () => {
  expect(holdOf("t", facts())).toBeUndefined();
  expect(holdOf("t", facts({ waiting: true }))).toBe("waiting");
  expect(holdOf("t", facts({ life: "on" }))).toBe("looking_after");
  expect(holdOf("t", facts({ life: "paused" }))).toBe("looking_after");
  // A Keep that ended holds nothing.
  expect(holdOf("t", facts({ life: "done" }))).toBeUndefined();
  expect(holdOf("t", facts({ life: "stopped" }))).toBeUndefined();
  expect(holdOf("t", facts({ prs: ["nowledge-co/mem#11070"] }))).toBe("pr_open");
  expect(holdOf("t", facts({ mark: { starred: true } }))).toBe("pinned");
  expect(holdOf("t", facts({ mark: { keepCopy: true } }))).toBe("pinned");
  expect(holdOf("t", facts({ mark: {} }))).toBeUndefined();
  // The first that holds is said.
  expect(holdOf("t", facts({ waiting: true, life: "on", prs: ["o/r#1"], mark: { starred: true } }))).toBe("waiting");
});

let dir = "";
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "ducter-tidied-"))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("createTidied: counts each computer's removals and their bytes from the Log, before and after start", () => {
  const log = openLog({ path: join(dir, "ducter.db"), persona: "default" });
  log.append({ stream: "task:a", origin: "system", kind: "copy_tidied", body: { taskId: "a", device: "local", path: "/x/a", bytes: 1000, why: "finished" } });
  let changed = 0;
  const t = createTidied(log, () => changed++);
  expect(t.of("local")).toEqual({ count: 1, bytes: 1000 });
  log.append({ stream: "task:b", origin: "system", kind: "copy_tidied", body: { taskId: "b", device: "w1", path: "/y/b", bytes: 2000, why: "dropped" } });
  log.append({ stream: "task:c", origin: "system", kind: "copy_tidied", body: { taskId: "c", device: "w1", path: "/y/c", bytes: 0, why: "merged", gone: true } });
  expect(t.of("w1")).toEqual({ count: 2, bytes: 2000 });
  expect(t.of("nowhere")).toBeUndefined();
  expect(changed).toBe(2);
  t.stop();
  log.close();
});
