// D130: a task in a folder that isn't a git repo, end to end through the runner: the copy is
// kept before its first turn, the report says what changed and until when, undo puts it back;
// a folder that can't be copied asks first and holds the turn until the answer.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptedRuntime, type ScriptedTurn } from "@botiverse/oar/testing";
import type { Bodies } from "@ducter/protocol";
import type { SessionSpec } from "@ducter/protocol/src/internal.ts";
import { createOarHarnessPort, createRunner, registerTaskTools } from "../src/index.ts";
import { adaptSpec } from "../src/oar.ts";
import { createFakeCore, waitFor, type FakeCore } from "./fake-core.ts";

let dir: string;
let core: FakeCore;
let ids: string[];
let runner: ReturnType<typeof createRunner> | undefined;

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "ducter-runner-folder-")));
  core = createFakeCore(join(dir, "data"));
  ids = ["tsk00001", "tsk00002"];
});
afterEach(async () => {
  await runner?.dispose();
  runner = undefined;
  rmSync(dir, { recursive: true, force: true });
});

function invoices(folder: string, n: number) {
  mkdirSync(folder, { recursive: true });
  for (let i = 1; i <= n; i++) writeFileSync(join(folder, `invoice-2026-0${((i - 1) % 3) + 1}-${i}.pdf`), `%PDF ${i}\n`);
}

function start(turn: (t: ScriptedTurn) => void | Promise<void>) {
  registerTaskTools(core, { folderChanges: (id) => runner!.folderReport(id) });
  const port = createOarHarnessPort({ loadRuntime: async () => scriptedRuntime({ id: "claude", turn }) });
  runner = createRunner(core, { harness: port, newId: () => ids.shift()! });
  return runner;
}

const reports = (taskId: string) => core.events.filter((e) => e.kind === "report" && (e.body as Bodies["report"]).taskId === taskId).map((e) => e.body as Bodies["report"]);

describe("a folder Ducter can copy", () => {
  test("the copy is there before the first turn; the report says what changed and until when; undo puts it back", async () => {
    const folder = join(dir, "Invoices");
    invoices(folder, 6);
    const copy = join(core.dataDir, "snapshots", "tsk00001", "copy");
    let copiedFirst = false;
    const r = start(async (t) => {
      copiedFirst = existsSync(copy) && readdirSync(copy).length === 6;
      for (const m of ["01", "02", "03"]) mkdirSync(join(folder, `2026-${m}`));
      for (const f of readdirSync(folder).filter((f) => f.endsWith(".pdf"))) renameSync(join(folder, f), join(folder, `2026-${f.slice(13, 15)}`, f));
      await t.tool("mcp__ducter__report_to_main", "{}", () => core.call("report_to_main", { state: "done", summary: "Sorted into month folders", evidence: [{ kind: "file", label: "folders", ref: "2026-01" }] }, "tsk00001"));
      t.text("done");
    });
    const card = await r.openTask({ persona: "p1", title: "Sort my invoices", brief: "by month", place: { kind: "folder", device: "mac", path: folder } });
    await r.whenStarted(card.taskId);
    const rep = await waitFor(() => reports(card.taskId)[0], "report");
    expect(copiedFirst).toBe(true);
    expect(rep.folder).toMatchObject({ moved: 6, folders: 3, added: 0, removed: 0, undo: "open" });
    expect(rep.folder!.undoUntil).toBeTruthy();
    const c = (await r.folderChanges(card.taskId, { files: true }))!;
    expect(c.files.filter((f) => f.kind === "moved")).toHaveLength(6);
    // The brief says what it may do there, and what it asks first.
    const open = core.events.find((e) => e.kind === "task_open")!.body as Bodies["task_open"];
    expect(open.place.kind).toBe("folder");

    const u = await r.undoFolder(card.taskId);
    expect(u.ok).toBe(true);
    expect(readdirSync(folder).sort()).toEqual(["invoice-2026-01-1.pdf", "invoice-2026-01-4.pdf", "invoice-2026-02-2.pdf", "invoice-2026-02-5.pdf", "invoice-2026-03-3.pdf", "invoice-2026-03-6.pdf"]);
    expect(core.events.some((e) => e.kind === "task_event" && (e.body as Bodies["task_event"]).raw && ((e.body as Bodies["task_event"]).raw as { effect?: string }).effect === "folder_undo")).toBe(true);
    expect((await r.folderChanges(card.taskId))!.undo).toBe("undone");
  });

  test("an undo after someone else changed the folder asks first; keep frees the copy", async () => {
    const folder = join(dir, "Photos");
    invoices(folder, 3);
    const r = start(async (t) => {
      unlinkSync(join(folder, "invoice-2026-01-1.pdf"));
      await t.tool("mcp__ducter__report_to_main", "{}", () => core.call("report_to_main", { state: "done", summary: "ok", evidence: [{ kind: "file", label: "x", ref: "x" }] }, "tsk00001"));
    });
    const card = await r.openTask({ persona: "p1", title: "Tidy", brief: "tidy", place: { kind: "folder", device: "mac", path: folder } });
    await r.whenStarted(card.taskId);
    await waitFor(() => reports(card.taskId)[0], "report");
    await waitFor(() => existsSync(join(core.dataDir, "snapshots", "tsk00001", "end.json")), "finished");
    writeFileSync(join(folder, "mine.txt"), "the user's own\n");
    const u = await r.undoFolder(card.taskId);
    expect(u.ok).toBe(false);
    expect(u.confirm).toEqual({ count: 1, files: ["mine.txt"] });
    expect((await r.keepFolder(card.taskId)).ok).toBe(true);
    expect(existsSync(join(core.dataDir, "snapshots", "tsk00001", "copy"))).toBe(false);
    expect((await r.undoFolder(card.taskId)).ok).toBe(false);
  });
});

describe("a folder Ducter can't copy", () => {
  test("asks first, holds the turn, and sends it once the user says Go", async () => {
    const folder = join(dir, "Library", "CloudStorage", "Dropbox-Personal", "Receipts");
    invoices(folder, 2);
    const inputs: string[] = [];
    const r = start(async (t) => {
      inputs.push(t.input);
    });
    const card = await r.openTask({ persona: "p1", title: "Rename receipts", brief: "rename", place: { kind: "folder", device: "mac", path: folder }, language: "zh" });
    await r.whenStarted(card.taskId);
    const ask = await waitFor(() => reports(card.taskId)[0], "ask");
    expect(ask.state).toBe("needs_input");
    expect(ask.summary).toContain("Dropbox");
    expect(ask.questions[0]).toMatchObject({ blocking: true, reversible: false });
    expect(ask.questions[0]!.default).toBeUndefined(); // Hold is the default
    expect(inputs).toEqual([]); // nothing reached the task
    expect(core.tasks.get(card.taskId)?.attention).toBe("needs_you");
    expect(existsSync(join(core.dataDir, "snapshots", "tsk00001"))).toBe(false);

    await r.send(card.taskId, "User says Go: Continue.", undefined, "user");
    await waitFor(() => inputs.length > 0, "the held turn");
    expect(inputs[0]).toContain('Start the task "Rename receipts"');
    expect(inputs[0]).toContain("The user said you may change it anyway");
    // From here it doesn't ask again.
    await r.send(card.taskId, "and the PDFs too", undefined, "user");
    await waitFor(() => inputs.length > 1, "next turn");
    expect(reports(card.taskId)).toHaveLength(1);
  });

  test("a held ask survives a restart: the answer still sends the turn", async () => {
    const folder = join(dir, "Library", "Mobile Documents", "com~apple~CloudDocs", "Taxes");
    invoices(folder, 1);
    const inputs: string[] = [];
    const r = start(async (t) => {
      inputs.push(t.input);
    });
    const card = await r.openTask({ persona: "p1", title: "Taxes", brief: "sort", place: { kind: "folder", device: "mac", path: folder } });
    await r.whenStarted(card.taskId);
    await waitFor(() => reports(card.taskId)[0], "ask");
    await r.dispose();
    const port = createOarHarnessPort({ loadRuntime: async () => scriptedRuntime({ id: "claude", turn: (t) => void inputs.push(t.input) }) });
    runner = createRunner(core, { harness: port, newId: () => ids.shift()! });
    await runner.send(card.taskId, "yes, go ahead", undefined, "user");
    await waitFor(() => inputs.length > 0, "the held turn after restart");
    expect(inputs[0]).toContain('the user said: "yes, go ahead"');
  });
});

test("Codex keeps a folder task's writes inside the folder; Claude Code gets no such flag", () => {
  const spec = (harness: SessionSpec["harness"]): SessionSpec => ({ harness, cwd: dir, mcp: [], permissionMode: "bypass", confineWrites: true });
  const codex = adaptSpec(spec("codex"), { dataDir: dir, env: { CODEX_HOME: join(dir, "codex") } });
  expect(codex.options.launchArgs).toEqual(expect.arrayContaining(['sandbox_mode="workspace-write"', "sandbox_workspace_write.network_access=true"]));
  const claude = adaptSpec(spec("claude-code"), { dataDir: dir });
  expect(claude.options.launchArgs).toBeUndefined();
});
