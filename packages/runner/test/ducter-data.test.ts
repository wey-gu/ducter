// D207: no task works in or writes to Ducter's own data folder, on any computer.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDucterData } from "@ducter/protocol/src/ducter-folder.ts";
import { createFolderStore } from "../src/folder.ts";
import { DucterDataError, planPlace } from "../src/places.ts";

let top: string;
let data: string;
beforeEach(() => {
  top = realpathSync(mkdtempSync(join(tmpdir(), "ducter-d206-")));
  data = join(top, ".ducter");
  mkdirSync(join(data, "partner"), { recursive: true });
  writeFileSync(join(data, "partner", "state.json"), '{"v":1}');
});
afterEach(() => rmSync(top, { recursive: true, force: true }));

test("the data folder and everything in it is Ducter's data; its own Ducter folder, old worktrees and the outside are not", () => {
  const env = { DUCTER_FOLDER: "" };
  expect(isDucterData(data, data, { env })).toBe(true);
  expect(isDucterData(join(data, "partner"), data, { env })).toBe(true);
  expect(isDucterData(join(data, "partner", "nope", "deeper"), data, { env })).toBe(true);
  expect(isDucterData(join(data, "scratch", "tsk1"), data, { env })).toBe(true); // only through kind none
  expect(isDucterData(join(data, "ducter", "worktrees", "app", "fix"), data, { env })).toBe(false); // a test's own Ducter folder
  expect(isDucterData(join(data, "worktrees", "app", "fix"), data, { env })).toBe(false); // before D204
  expect(isDucterData(top, data, { env })).toBe(false); // the home holds it: asked before writing, not refused
  expect(isDucterData(join(top, ".ducter-other"), data, { env })).toBe(false);
  // Through a symlink, the same folder.
  symlinkSync(data, join(top, "link"));
  expect(isDucterData(join(top, "link", "partner"), data, { env })).toBe(true);
});

test("planPlace refuses a folder, a repo or a worktree in the data folder, before the task exists", async () => {
  for (const place of [
    { kind: "folder" as const, device: "local", path: join(data, "partner") },
    { kind: "folder" as const, device: "local", path: data },
    { kind: "repo" as const, device: "local", repoPath: join(data, "partner") },
    { kind: "repo" as const, device: "local", repoPath: join(top, "app"), worktree: join(data, "partner") },
  ]) {
    const err = await planPlace(place, "tsk1", "看看", data).then(() => undefined, (e) => e);
    expect(err).toBeInstanceOf(DucterDataError);
    expect(String(err.message)).toContain("is Ducter's own data folder");
  }
  // No place: the scratch folder Ducter makes for it.
  expect((await planPlace({ kind: "none" }, "tsk1", "看看", data)).cwd).toBe(join(data, "scratch", "tsk1"));
  // A folder outside is as given.
  mkdirSync(join(top, "invoices"));
  expect((await planPlace({ kind: "folder", device: "local", path: join(top, "invoices") }, "tsk1", "x", data)).cwd).toBe(join(top, "invoices"));
});

test("a folder in the data folder gets no copy, and undo never puts Ducter's own files back", async () => {
  const store = createFolderStore({ root: join(data, "snapshots"), assess: { xattrs: () => [] } });
  expect(await store.prepare("t1", join(data, "partner"))).toEqual({ ok: false, why: "holds_ducter" });
  // A task from before the guard: its copy exists, the partner wrote state.json since.
  mkdirSync(join(data, "snapshots", "t1", "copy"), { recursive: true });
  writeFileSync(join(data, "snapshots", "t1", "copy", "state.json"), '{"v":0}');
  writeFileSync(join(data, "snapshots", "t1", "meta.json"), JSON.stringify({ v: 1, taskId: "t1", folder: join(data, "partner"), takenAt: new Date().toISOString(), method: "copy", state: "open" }));
  const r = await store.undo("t1", { force: true });
  expect(r.ok).toBe(false);
  expect(r.message).toContain("Ducter's own data");
  expect(readFileSync(join(data, "partner", "state.json"), "utf8")).toBe('{"v":1}');
});
