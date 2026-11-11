// D214: the workbench's ops over real files and real git (no model calls): confinement, caps,
// binary detection, writes with conflict detection, a repo's and a folder's changes and diffs,
// a per-file revert, and the pages a task serves.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Place } from "@ducter/protocol";
import { cleanRel, portsSaid, langOf, type WbAnswer } from "@ducter/protocol/src/workbench.ts";
import { confine, parseLsofListen, versionOf, wbHost, wbOp, WbFail, type WbCtx } from "../src/workbench.ts";
import { userEditsNote } from "../src/brief.ts";

let dir: string;
beforeEach(() => void (dir = realpathSync(mkdtempSync(join(tmpdir(), "ducter-wb-")))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const sh = (cwd: string, ...args: string[]) => Bun.spawnSync(["git", "-C", cwd, "-c", "user.email=t@t", "-c", "user.name=t", ...args]);

function repo(): { root: string; place: Extract<Place, { kind: "repo" }> } {
  const root = join(dir, "app");
  Bun.spawnSync(["git", "init", "-q", "-b", "main", root]);
  writeFileSync(join(root, "index.html"), "<title>Hi</title>\n<p>one</p>\n");
  writeFileSync(join(root, "gone.txt"), "bye\n");
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "src", "a.ts"), "export const a = 1;\n");
  sh(root, "add", ".");
  sh(root, "commit", "-qm", "init");
  sh(root, "switch", "-qc", "ducter/t1");
  return { root, place: { kind: "repo", repoPath: root, worktree: root, branch: "ducter/t1", baseBranch: "main" } as Extract<Place, { kind: "repo" }> };
}

const ctxOf = (cwd: string, place: Place, extra: Partial<WbCtx> = {}): WbCtx => ({ taskId: "t1", cwd, place, dataDir: join(dir, "data"), ...extra });
const op = async <K extends WbAnswer["op"]>(ctx: WbCtx, req: Parameters<typeof wbOp>[1]) => (await wbOp(ctx, req)) as Extract<WbAnswer, { op: K }>;
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e) => (e instanceof WbFail ? e.code : String(e)));

test("paths stay inside the working copy: .., absolute, a link out, and Ducter's data folder are refused", async () => {
  const { root, place } = repo();
  mkdirSync(join(dir, "secret"));
  writeFileSync(join(dir, "secret", "k"), "x");
  symlinkSync(join(dir, "secret"), join(root, "out"));
  const ctx = ctxOf(root, place);
  expect(cleanRel("../x")).toBeUndefined();
  expect(cleanRel("/etc/passwd")).toBe("etc/passwd"); // read as relative to the working copy
  expect(await code(op(ctx, { op: "read", path: "../secret/k" }))).toBe("outside");
  expect(await code(op(ctx, { op: "read", path: "out/k" }))).toBe("outside");
  expect(await code(op(ctx, { op: "files", path: "out" }))).toBe("outside");
  // A folder task over a folder that holds Ducter's data: the data folder is not listed or read.
  const data = join(dir, "data");
  mkdirSync(join(data, "logs"), { recursive: true });
  writeFileSync(join(data, "logs", "x.log"), "secret");
  const outer = ctxOf(dir, { kind: "folder", path: dir } as Place);
  const top = await op<"files">(outer, { op: "files", path: "" });
  expect(top.entries.map((e) => e.name)).not.toContain("data");
  expect(await code(op(outer, { op: "read", path: "data/logs/x.log" }))).toBe("outside");
  // The working copy itself inside Ducter's data (not a worktree, not its own scratch): refused.
  expect(await code(op(ctxOf(join(data, "logs"), { kind: "folder", path: join(data, "logs") } as Place), { op: "files", path: "" }))).toBe("outside");
  // Its own scratch folder is its working copy.
  mkdirSync(join(data, "scratch", "t1"), { recursive: true });
  writeFileSync(join(data, "scratch", "t1", "n.md"), "# hi");
  expect((await op<"read">(ctxOf(join(data, "scratch", "t1"), { kind: "none" } as Place), { op: "read", path: "n.md" })).text).toBe("# hi");
  expect(() => confine(ctx, "src/a.ts")).not.toThrow();
});

test("files: folders first, .git hidden; read: text, binary, a picture, too big", async () => {
  const { root, place } = repo();
  writeFileSync(join(root, "blob.bin"), new Uint8Array([1, 0, 2, 3]));
  writeFileSync(join(root, "big.txt"), "x".repeat(1024 * 1024 + 1));
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  writeFileSync(join(root, "dot.png"), png);
  const ctx = ctxOf(root, place);
  const ls = await op<"files">(ctx, { op: "files", path: "" });
  expect(ls.entries[0]).toEqual({ name: "src", kind: "d" });
  expect(ls.entries.map((e) => e.name)).not.toContain(".git");
  const a = await op<"read">(ctx, { op: "read", path: "src/a.ts" });
  expect(a.text).toBe("export const a = 1;\n");
  expect(a.version).toBe(versionOf(readFileSync(join(root, "src/a.ts"))));
  expect((await op<"read">(ctx, { op: "read", path: "blob.bin" })).binary).toBe(true);
  expect((await op<"read">(ctx, { op: "read", path: "dot.png" })).image).toStartWith("data:image/png;base64,");
  const big = await op<"read">(ctx, { op: "read", path: "big.txt" });
  expect(big.tooBig).toBe(true);
  expect(big.text).toBeUndefined();
});

test("write: only over the version opened; the agent's write in between is a conflict", async () => {
  const { root, place } = repo();
  const ctx = ctxOf(root, place);
  const a = await op<"read">(ctx, { op: "read", path: "src/a.ts" });
  const w = await op<"write">(ctx, { op: "write", path: "src/a.ts", text: "export const a = 2;\n", base: a.version });
  expect(readFileSync(join(root, "src/a.ts"), "utf8")).toBe("export const a = 2;\n");
  // Saved again from the editor's first version: the file moved on.
  expect(await code(op(ctx, { op: "write", path: "src/a.ts", text: "x", base: a.version }))).toBe("conflict");
  writeFileSync(join(root, "src/a.ts"), "agent wrote this\n");
  expect(await code(op(ctx, { op: "write", path: "src/a.ts", text: "y", base: w.version }))).toBe("conflict");
  expect(readFileSync(join(root, "src/a.ts"), "utf8")).toBe("agent wrote this\n");
  expect(await code(op(ctx, { op: "write", path: "nope.ts", text: "y", base: "0" }))).toBe("missing");
});

test("a repo task's changes against its base, a file's diff, and putting one back", async () => {
  const { root, place } = repo();
  writeFileSync(join(root, "index.html"), "<title>Hi</title>\n<p>two</p>\n<p>three</p>\n");
  rmSync(join(root, "gone.txt"));
  writeFileSync(join(root, "src", "new.ts"), "a\nb\n");
  sh(root, "add", "index.html", "gone.txt");
  sh(root, "commit", "-qm", "work");
  writeFileSync(join(root, "src", "a.ts"), "export const a = 3;\n"); // uncommitted
  const ctx = ctxOf(root, place);
  const c = await op<"changes">(ctx, { op: "changes" });
  expect(c.kind).toBe("repo");
  expect(c.base).toBe("main");
  expect(c.files).toEqual([
    { path: "gone.txt", status: "deleted", adds: 0, dels: 1 },
    { path: "index.html", status: "modified", adds: 2, dels: 1 },
    { path: "src/a.ts", status: "modified", adds: 1, dels: 1 },
    { path: "src/new.ts", status: "added", adds: 2, dels: 0 },
  ]);
  const d = await op<"diff">(ctx, { op: "diff", path: "index.html" });
  expect(d.patch).toContain("-<p>one</p>");
  expect(d.patch).toContain("+<p>three</p>");
  const nd = await op<"diff">(ctx, { op: "diff", path: "src/new.ts" });
  expect(nd.patch).toContain("+++ b/src/new.ts");
  expect(nd.patch).toContain("+b");
  expect((await op<"diff">(ctx, { op: "diff", path: "gone.txt" })).patch).toContain("-bye");
  // Put back: a changed file as the base has it, a new file removed, a deleted one restored.
  await op(ctx, { op: "revert", path: "src/a.ts" });
  expect(readFileSync(join(root, "src/a.ts"), "utf8")).toBe("export const a = 1;\n");
  await op(ctx, { op: "revert", path: "src/new.ts" });
  expect(existsSync(join(root, "src/new.ts"))).toBe(false);
  await op(ctx, { op: "revert", path: "gone.txt" });
  expect(readFileSync(join(root, "gone.txt"), "utf8")).toBe("bye\n");
  expect(await code(op(ctx, { op: "revert", path: "../x" }))).toBe("outside");
});

test("a folder task: changes and diffs against the copy kept before it wrote (D142)", async () => {
  const folder = join(dir, "notes");
  mkdirSync(folder);
  writeFileSync(join(folder, "a.md"), "one\n");
  writeFileSync(join(folder, "b.md"), "keep\n");
  const copy = join(dir, "data", "snapshots", "t1", "copy");
  mkdirSync(join(dir, "data", "snapshots", "t1"), { recursive: true });
  cpSync(folder, copy, { recursive: true });
  writeFileSync(join(folder, "a.md"), "one\ntwo\n");
  writeFileSync(join(folder, "c.md"), "new\n");
  const host = wbHost({
    dataDir: join(dir, "data"),
    folders: {
      changes: async () => ({ files: [{ kind: "changed", path: "a.md" }, { kind: "added", path: "c.md" }], more: 0 }),
      undo: async (_id, o) => (writeFileSync(join(folder, o!.path!), readFileSync(join(copy, o!.path!))), { ok: true, message: "Put back" }),
    },
  });
  const place = { kind: "folder", path: folder } as Place;
  const c = (await host.op({ taskId: "t1", cwd: folder, place, req: { op: "changes" } })) as Extract<WbAnswer, { op: "changes" }>;
  expect(c.kind).toBe("folder");
  expect(c.files).toEqual([
    { path: "a.md", status: "modified", adds: 1, dels: 0 },
    { path: "c.md", status: "added", adds: 1, dels: 0 },
  ]);
  const d = (await host.op({ taskId: "t1", cwd: folder, place, req: { op: "diff", path: "a.md" } })) as Extract<WbAnswer, { op: "diff" }>;
  expect(d.patch).toContain("--- a/a.md");
  expect(d.patch).toContain("+two");
  expect(d.patch).not.toContain(copy);
  await host.op({ taskId: "t1", cwd: folder, place, req: { op: "revert", path: "a.md" } });
  expect(readFileSync(join(folder, "a.md"), "utf8")).toBe("one\n");
});

test("pages: ports the task said, lsof's listening list, and only a task's own page is fetched", async () => {
  expect(portsSaid("  ➜  Local:   http://localhost:5173/\n  also http://127.0.0.1:3000 and http://localhost:5173")).toEqual([5173, 3000]);
  expect(portsSaid("https://example.com:8443 and localhost:80")).toEqual([]);
  expect(parseLsofListen("p101\ncnode\nn*:5173\nn[::1]:5173\np202\ncbun\nn127.0.0.1:3000\n")).toEqual([
    { pid: 101, command: "node", port: 5173 },
    { pid: 202, command: "bun", port: 3000 },
  ]);
  expect(langOf("src/App.tsx")).toBe("ts");
  expect(langOf("Dockerfile")).toBe("shell");
  // A page this test serves, named in the task's output.
  const { root, place } = repo();
  const srv = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (r) => new Response(`<title>Scratch app</title>${new URL(r.url).pathname}`, { headers: { "content-type": "text/html" } }) });
  try {
    const host = wbHost({ dataDir: join(dir, "data"), folders: { changes: async () => undefined, undo: async () => ({ ok: false, message: "" }) } });
    const call = { taskId: "t1", cwd: root, place };
    expect(await code(host.fetch({ ...call, port: srv.port!, method: "GET", path: "/x", headers: [] }))).toBe("outside");
    const p = (await host.op({ ...call, req: { op: "ports" }, said: [srv.port!], exclude: [7777] })) as Extract<WbAnswer, { op: "ports" }>;
    expect(p.ports).toEqual([{ port: srv.port!, via: "said", ...(p.ports[0]?.command ? { command: p.ports[0].command } : {}), title: "Scratch app" }]);
    const r = await host.fetch({ ...call, port: srv.port!, method: "GET", path: "/hello", headers: [] });
    expect(r.status).toBe(200);
    expect(Buffer.from(r.body, "base64").toString()).toContain("/hello");
    // Excluded (Ducter's own) never shows.
    const none = (await host.op({ ...call, req: { op: "ports" }, said: [srv.port!], exclude: [srv.port!] })) as Extract<WbAnswer, { op: "ports" }>;
    expect(none.ports).toEqual([]);
  } finally {
    srv.stop(true);
  }
});

test("through the runner: a folder task's file edited in the workbench; the task hears of it once, with its next turn", async () => {
  const { scriptedRuntime } = await import("@botiverse/oar/testing");
  const { createOarHarnessPort, createRunner } = await import("../src/index.ts");
  const { createFakeCore, waitFor } = await import("./fake-core.ts");
  const core = createFakeCore(join(dir, "data"));
  const folder = join(dir, "site");
  mkdirSync(folder);
  writeFileSync(join(folder, "index.html"), "<p>one</p>\n");
  const inputs: string[] = [];
  const port = createOarHarnessPort({ loadRuntime: async () => scriptedRuntime({ id: "claude", turn: (t) => void inputs.push(t.input) }) });
  const ids = ["tsk00001"];
  const runner = createRunner(core, { harness: port, newId: () => ids.shift()! });
  try {
    const card = await runner.openTask({ persona: "p1", title: "Make a page", brief: "b", place: { kind: "folder", device: "mac", path: folder } as Place });
    await runner.whenStarted(card.taskId);
    // Its first turn and the one nudge after it (it never reports here).
    await waitFor(() => inputs.length >= 2, "first turn and the nudge");
    await Bun.sleep(50);
    const ls = (await runner.workbench(card.taskId, { op: "files", path: "" })) as Extract<WbAnswer, { op: "files" }>;
    expect(ls.entries.map((e) => e.name)).toEqual(["index.html"]);
    const r = (await runner.workbench(card.taskId, { op: "read", path: "index.html" })) as Extract<WbAnswer, { op: "read" }>;
    await runner.workbench(card.taskId, { op: "write", path: "index.html", text: "<p>mine</p>\n", base: r.version });
    expect(readFileSync(join(folder, "index.html"), "utf8")).toBe("<p>mine</p>\n");
    expect(core.events.some((e) => e.kind === "task_event" && ((e.body as { raw?: { effect?: string } }).raw?.effect === "user_edit"))).toBe(true);
    await Bun.sleep(30);
    await runner.send(card.taskId, "Looks good, carry on", undefined, "user");
    await waitFor(() => inputs.some((i) => i.includes("Looks good")), "second turn");
    const said = inputs.find((i) => i.includes("Looks good"))!;
    expect(said).toContain("the user edited index.html themselves");
    expect(said).toEndWith("Looks good, carry on");
    // Said once: the next message goes as it is.
    await Bun.sleep(30);
    await runner.send(card.taskId, "and the footer", undefined, "user");
    await waitFor(() => inputs.some((i) => i.includes("and the footer")), "third turn");
    expect(inputs.find((i) => i.includes("and the footer"))).toBe("and the footer");
    // What the user typed is logged as they typed it.
    expect(core.events.some((e) => e.kind === "task_event" && (e.body as { text?: string }).text === "Looks good, carry on")).toBe(true);
  } finally {
    await runner.dispose();
  }
});

test("the task hears what the user changed, once, before its next words", () => {
  const n = userEditsNote([{ path: "src/a.ts", how: "edited" }, { path: "b.css", how: "edited" }, { path: "c.ts", how: "reverted" }]);
  expect(n).toContain("edited src/a.ts, b.css");
  expect(n).toContain("put c.ts back as it was before this task");
  expect(n).toContain("Read those files again");
});
