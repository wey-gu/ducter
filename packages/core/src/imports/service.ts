// D651 (research/246): the import service, the only code that appends imported events.
//
// One thread becomes one read-only task stream: a `task_open` carrying its app, account, thread
// id and run; one `task_event` per message with the source's own `at` and `importedId`; a closing
// `task_state` that leaves it ended (带进来的 / Brought in). The task id is derived from
// (app, account, threadId), so importing again finds the same task and appends only messages it
// doesn't have yet (same `importedId`). Nothing is woken by it and no attention is made: origin
// "import" is outside every subscriber that wakes the partner (core.ts triggersPartner), and the
// registry leaves imported tasks out of On hand. One `import_run` records the run on "system".
import { createHash, randomBytes } from "node:crypto";
import { basename } from "node:path";
import type { Bodies, ImportAnswer, ImportedTask, LogEvent } from "@ducter/protocol";
import { isHarnessId } from "@ducter/protocol/src/harnesses.ts";
import { expandHome, folderInfo, normalizeRemote, type FolderInfo } from "@ducter/protocol/src/folder-info.ts";
import type { LogStore, TaskRegistry } from "@ducter/protocol/src/internal.ts";
import { parseImport, type ImportThread } from "./format.ts";

export interface ImportDeps {
  log: LogStore;
  tasks: TaskRegistry;
  /** Whose tasks they become (the default partner, as `ducter up` runs). */
  persona?: string;
  now?: () => number;
  /** A folder read on this computer; injected in tests. */
  folder?: (path: string) => Promise<FolderInfo>;
  /** A new run id; injected in tests. */
  runId?: () => string;
}

/** The task id a thread gets: deterministic, so a re-import finds it (`imp_` + 16 hex). */
export function importedTaskId(app: string, account: string | undefined, threadId: string): string {
  return `imp_${createHash("sha256").update(`${app}\u0000${account ?? ""}\u0000${threadId}`).digest("hex").slice(0, 16)}`;
}

/** The repo's own name, from a source's repo or a folder's origin (never a folder match). */
export function repoProject(repo: string): string {
  return normalizeRemote(repo).split("/").filter(Boolean).pop() ?? "";
}

/** Every event of one task's stream, in pages (a grown thread can be long). */
function readStream(log: LogStore, taskId: string): LogEvent[] {
  const stream = `task:${taskId}`;
  const out: LogEvent[] = [];
  for (let from = 0; ; ) {
    const page = log.read({ stream, fromSeq: from, limit: 5000 });
    out.push(...page);
    if (page.length < 5000) break;
    from = page.at(-1)!.seq + 1;
  }
  return out;
}

interface Project {
  project: string;
  gone: boolean;
}

/**
 * The project from `repo`, else the folder's origin remote, else the folder's name (D299: its
 * folder is gone). A folder that no longer exists never becomes an empty project: its last path
 * part stays, marked gone.
 */
async function projectOf(thread: ImportThread, folder: (path: string) => Promise<FolderInfo>): Promise<Project> {
  if (thread.repo) return { project: repoProject(thread.repo), gone: false };
  if (!thread.folder) return { project: "", gone: false };
  const path = expandHome(thread.folder);
  const info = await folder(path).catch(() => ({ exists: false }) as FolderInfo);
  if (!info.exists) return { project: basename(path) || path, gone: true };
  const remote = info.remote ? repoProject(info.remote) : "";
  return { project: remote || info.name || basename(path) || path, gone: false };
}

/** One import run over one reader's stream. */
export async function importInto(d: ImportDeps, input: string): Promise<ImportAnswer> {
  const now = d.now ?? Date.now;
  const parsed = parseImport(input, { now });
  if (!parsed.source) {
    return {
      ok: false,
      threads: 0,
      messages: 0,
      skipped: 0,
      ...(parsed.stopped ? { stopped: parsed.stopped } : {}),
      error: parsed.stopped?.reason ?? "no source record",
    };
  }
  const source = parsed.source;
  const persona = d.persona;
  const runId = d.runId?.() ?? `run_${randomBytes(6).toString("hex")}`;
  const folder = d.folder ?? ((path: string) => folderInfo(path));
  let opened = 0;
  let appended = 0;
  let skipped = 0;
  const taskIds: string[] = [];

  for (const thread of parsed.threads) {
    const taskId = importedTaskId(source.app, source.account, thread.id);
    const existing = d.tasks.get(taskId);
    const had = existing
      ? new Map(
          readStream(d.log, taskId)
            .filter((e) => e.kind === "task_event")
            .map((e) => {
              const b = e.body as Bodies["task_event"];
              return [b.importedId ?? "", b.text ?? ""] as const;
            })
            .filter(([id]) => !!id),
        )
      : undefined;
    if (existing && (!existing.imported || existing.imported.threadId !== thread.id || existing.imported.account !== source.account || existing.imported.app !== source.app)) {
      // A deterministic id that is already something else: never overwrite it.
      skipped += thread.messages.length;
      continue;
    }
    // time words and the sort use the source's newest message (`task_event.at`); a thread with no
    // messages keeps the source's own updatedAt.
    const at = thread.messages.at(-1)?.at ?? thread.updatedAt;
    if (!existing) {
      const p = await projectOf(thread, folder);
      const imported: ImportedTask = {
        app: source.app,
        ...(source.account ? { account: source.account } : {}),
        threadId: thread.id,
        runId,
        createdAt: thread.createdAt,
        at,
        ...(thread.agent ? { agent: thread.agent } : {}),
        ...(thread.model ? { model: thread.model } : {}),
        ...(thread.repo ? { repo: thread.repo } : {}),
        ...(thread.folder ? { folder: thread.folder } : {}),
        ...(p.gone ? { folderGone: true } : {}),
        ...(thread.archived ? { archived: true } : {}),
      };
      const harness = thread.agent && isHarnessId(thread.agent) ? thread.agent : "";
      d.log.append({
        ...(persona ? { persona } : {}),
        stream: `task:${taskId}`,
        origin: "import",
        kind: "task_open",
        body: {
          taskId,
          title: thread.title,
          project: p.project,
          place: thread.folder ? { kind: "folder", device: "local", path: expandHome(thread.folder) } : { kind: "none" },
          harness,
          ...(thread.model ? { model: thread.model } : {}),
          brief: "",
          imported,
        },
      });
      opened++;
      taskIds.push(taskId);
    }
    for (const m of thread.messages) {
      if (had?.has(m.id)) {
        // A message edited in the source isn't updated (read only): its count is the run's skipped.
        if (had.get(m.id) !== m.text) skipped++;
        continue;
      }
      d.log.append({
        ...(persona ? { persona } : {}),
        stream: `task:${taskId}`,
        origin: "import",
        kind: "task_event",
        body: { taskId, role: m.role, text: m.text, at: m.at, importedId: m.id, ...(m.role === "user" ? { from: "user" } : {}) },
      });
      appended++;
    }
    if (!existing) {
      d.log.append({
        ...(persona ? { persona } : {}),
        stream: `task:${taskId}`,
        origin: "import",
        kind: "task_state",
        body: { taskId, attention: "done", residency: "archived" },
      });
    }
    skipped += thread.skipped.reduce((a, s) => a + s.n, 0);
  }

  d.log.append({
    ...(persona ? { persona } : {}),
    stream: "system",
    origin: "import",
    kind: "import_run",
    body: {
      runId,
      app: source.app,
      ...(source.account ? { account: source.account } : {}),
      phase: parsed.stopped ? "stopped" : "done",
      threads: opened,
      messages: appended,
      skipped,
      ...(parsed.stopped ? { line: parsed.stopped.line, reason: parsed.stopped.reason } : {}),
    },
  });

  return {
    ok: parsed.ok,
    runId,
    threads: opened,
    messages: appended,
    skipped,
    ...(parsed.stopped ? { stopped: parsed.stopped } : {}),
    ...(taskIds.length ? { taskIds } : {}),
  };
}
