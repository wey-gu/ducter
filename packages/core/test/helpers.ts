import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LogStore } from "@ducter/protocol/src/internal.ts";

export function tempDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "ducter-core-"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function openTask(log: LogStore, taskId: string, title = "Fix the flaky test") {
  return log.append({
    stream: `task:${taskId}`,
    origin: "partner",
    kind: "task_open",
    body: { taskId, title, project: "foo", place: { kind: "none" }, harness: "claude-code", brief: "Fix it." },
  });
}

export function report(log: LogStore, taskId: string, r: Partial<import("@ducter/protocol").Bodies["report"]>) {
  return log.append({
    stream: `task:${taskId}`,
    origin: "task",
    kind: "report",
    body: { taskId, state: "progress", summary: "Working on it.", questions: [], evidence: [], ...r },
  });
}

export const tick = () => new Promise((r) => setTimeout(r, 0));
