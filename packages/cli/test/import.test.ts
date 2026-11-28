// D651 (research/246): `ducter import`. --check prints the counts and writes nothing; without
// a running home the same service imports straight into this computer's Log.
import { expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { IMPORT_FORMAT } from "@ducter/core/src/imports/format.ts";
import { openLog } from "@ducter/core/src/log.ts";
import { cmdImport } from "../src/import.ts";
import { translator } from "../src/i18n.ts";
import { tempDir } from "../../core/test/helpers.ts";

const t = translator("en");
const src = { t: "source", format: IMPORT_FORMAT, app: "Lody", account: "workspace:my-team" };
const stream = [
  JSON.stringify(src),
  JSON.stringify({ t: "thread", id: "s1", title: "Fix the WAL test", folder: "/x/hawdb", createdAt: "2026-10-02T03:11:00Z", updatedAt: "2026-10-02T03:14:00Z" }),
  JSON.stringify({ t: "msg", thread: "s1", id: "m1", role: "user", text: "WAL 测试偶尔失败。", at: "2026-10-02T03:11:00Z" }),
  JSON.stringify({ t: "msg", thread: "s1", id: "m2", role: "assistant", text: "It races the checkpoint.", at: "2026-10-02T03:14:00Z" }),
  JSON.stringify({ t: "end", threads: 1, messages: 2 }),
].join("\n");

test("--check prints the counts and writes nothing", async () => {
  const d = tempDir();
  const out: string[] = [];
  const code = await cmdImport({
    t,
    target: { kind: "local", port: 1 },
    dataDir: d.dir,
    json: false,
    check: true,
    read: async () => stream,
    print: (s) => out.push(s),
  });
  expect(code).toBe(0);
  expect(out.join("\n")).toContain("1 conversations, 2 messages");
  expect(readdirSync(d.dir)).toEqual([]);
  expect(existsSync(join(d.dir, "ducter.db"))).toBe(false);

  // JSON, for a reader's own check.
  const json: string[] = [];
  await cmdImport({ t, target: { kind: "local", port: 1 }, dataDir: d.dir, json: true, check: true, read: async () => stream, print: (s) => json.push(s) });
  expect(JSON.parse(json.join("\n"))).toMatchObject({ ok: true, app: "Lody", threads: 1, messages: 2, skipped: 0 });
  expect(readdirSync(d.dir)).toEqual([]);
  d.cleanup();
});

test("--check on a broken stream exits 1 and still writes nothing", async () => {
  const d = tempDir();
  const out: string[] = [];
  const code = await cmdImport({
    t,
    target: { kind: "local", port: 1 },
    dataDir: d.dir,
    json: false,
    check: true,
    read: async () => `${JSON.stringify(src)}\n{"t":"thread","id":"s1","title":"x"}`,
    print: (s) => out.push(s),
  });
  expect(code).toBe(1);
  expect(out.join("\n")).toContain("Stopped at line 2");
  expect(readdirSync(d.dir)).toEqual([]);
  d.cleanup();
});

test("without a running home, the same service imports into this computer's Log", async () => {
  const d = tempDir();
  const out: string[] = [];
  const code = await cmdImport({
    t,
    target: { kind: "local", port: 1 },
    dataDir: join(d.dir, "data"),
    json: false,
    check: false,
    read: async () => stream,
    print: (s) => out.push(s),
  });
  expect(code).toBe(0);
  expect(out.join("\n")).toContain("Brought in 1 conversation, 2 messages");
  const log = openLog({ path: join(d.dir, "data", "ducter.db"), persona: "default" });
  const opened = log.read({ kinds: ["task_open"], fromSeq: 0, limit: 10 });
  expect(opened).toHaveLength(1);
  expect(opened[0]!.origin).toBe("import");
  expect((opened[0]!.body as { imported: { app: string } }).imported.app).toBe("Lody");
  expect(log.read({ kinds: ["import_run"], fromSeq: 0, limit: 10 })).toHaveLength(1);
  log.close();
  d.cleanup();
});

test("a stream with no source is refused before anything is written", async () => {
  const d = tempDir();
  const out: string[] = [];
  const code = await cmdImport({
    t,
    target: { kind: "local", port: 1 },
    dataDir: join(d.dir, "data"),
    json: false,
    check: false,
    read: async () => JSON.stringify({ t: "end", threads: 0, messages: 0 }),
    print: (s) => out.push(s),
  });
  expect(code).toBe(1);
  expect(existsSync(join(d.dir, "data"))).toBe(false);
  d.cleanup();
});
