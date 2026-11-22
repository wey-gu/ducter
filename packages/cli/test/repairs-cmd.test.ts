// D473: `ducter repairs` against a running core: the frame goes over the WebSocket and the home
// counts from its Log; the report prints per week where each failure ended.
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepairReport } from "@ducter/protocol";
import { startCore, type Core } from "@ducter/core/src/core.ts";
import { cmdRepairs, repairLines } from "../src/repairs-cmd.ts";
import { translator } from "../src/i18n.ts";

let core: Core | undefined;
let dir = "";
afterEach(async () => {
  await core?.stop();
  core = undefined;
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test("usage: weeks 1 to 12", async () => {
  const lines: string[] = [];
  expect(await cmdRepairs({ t: translator("en"), target: { kind: "local", port: 1 }, json: false, weeks: 13, print: (l) => lines.push(l) })).toBe(2);
  expect(lines[0]).toContain("ducter repairs");
});

test("the home counts its own Log: a task that couldn't start and was handed to the partner", async () => {
  dir = mkdtempSync(join(tmpdir(), "ducter-cli-repairs-"));
  core = startCore({ dataDir: dir, port: 0, push: false, platform: "linux" });
  core.log.append({ stream: "task:t1", origin: "partner", kind: "task_open", body: { taskId: "t1", title: "Review the long copy", project: "", place: { kind: "repo", device: "local", repoPath: "/nowhere/mem" }, harness: "codex", brief: "Review it." } });
  core.tasks.setState("t1", "failed", "archived", "Couldn't start", { why: "no_folder", computer: "hel", what: "mem", path: "/nowhere/mem" });
  await Bun.sleep(20);
  const lines: string[] = [];
  const code = await cmdRepairs({ t: translator("en"), target: { kind: "local", port: core.port }, json: true, weeks: 1, print: (l) => lines.push(l) });
  expect(code).toBe(0);
  const r = JSON.parse(lines[0]!).report as RepairReport;
  expect(r.weeks).toHaveLength(1);
  expect(r.weeks[0]).toMatchObject({ failures: { start: 1, stall: 0 }, rethought: 1, reachedPerson: 1 });
  expect(r.causes).toEqual({ no_folder: 1 });
}, 30_000);

test("the lines say each week's failures, where they ended, and the repairs that worked", () => {
  const r: RepairReport = {
    weeks: [
      { week: "2026-11-09", failures: { start: 0, stall: 0 }, healed: 0, rethought: 0, partnerFixed: 0, reachedPerson: 0, byHow: { reopen: { tried: 0, worked: 0 }, clone_here: { tried: 0, worked: 0 }, start_at: { tried: 0, worked: 0 }, clear_lock: { tried: 0, worked: 0 } }, held: 0 },
      { week: "2026-11-16", failures: { start: 3, stall: 1 }, healed: 2, rethought: 2, partnerFixed: 1, reachedPerson: 1, byHow: { reopen: { tried: 1, worked: 0 }, clone_here: { tried: 2, worked: 2 }, start_at: { tried: 0, worked: 0 }, clear_lock: { tried: 0, worked: 0 } }, held: 0 },
    ],
    causes: { no_folder: 2, other: 1 },
  };
  const en = repairLines(translator("en"), r).join("\n");
  expect(en).toContain("Nothing went wrong.");
  expect(en).toContain("4 went wrong: 3 couldn't start, 1 stopped without a report");
  expect(en).toContain("Ducter mended 2 by itself, the partner found another way for 1, 1 reached you (75% without you)");
  expect(en).toContain("Repairs that worked: reopen 0/1, clone_here 2/2");
  expect(en).toContain("Why tasks couldn't start: no_folder 2, other 1");
  const zh = repairLines(translator("zh"), r).join("\n");
  expect(zh).toContain("Ducter 自己修好 2 次，伙伴换了办法 1 次，到了你这里 1 次（75% 没用到你）");
});
