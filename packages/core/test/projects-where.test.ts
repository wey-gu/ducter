// D455: a project knows the computer it is on, and one repo on two computers is one project: the
// copy added on a second computer (same origin) joins the first one's name. A home that set
// DUCTER_FOLDER_ROOTS adds its own folders only inside them. Workers are faked (no real hel).
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjects } from "../src/projects.ts";
import { insideRoots } from "@ducter/protocol/src/repos.ts";
import type { FolderInfo } from "@ducter/protocol/src/folder-info.ts";

let dir = "";
beforeEach(() => (dir = realpathSync(mkdtempSync(join(tmpdir(), "ducter-projects-")))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const worker: Record<string, Record<string, FolderInfo>> = {
  hel: { "/root/code/ducter-main": { exists: true, kind: "repo", root: "/root/code/ducter-main", name: "ducter-main", remote: "github.com/wey-gu/ducter" } },
  "mbp-2": { "/Users/weyl/dev/ducter": { exists: true, kind: "repo", root: "/Users/weyl/dev/ducter", name: "ducter", remote: "github.com/wey-gu/ducter" }, "/Users/weyl/notes": { exists: true, kind: "folder", root: "/Users/weyl/notes", name: "notes" } },
};
const remote = async (dev: string, path: string) => worker[dev]?.[path] ?? { exists: false };

test("D455: the same repo on two computers is one project, each copy with its computer and origin", async () => {
  const p = createProjects({ dataDir: dir, remote, now: () => 1_000 });
  const a = await p.add("/Users/weyl/dev/ducter", "mbp-2");
  expect(a).toMatchObject({ ok: true, project: { name: "ducter", place: { kind: "repo", device: "mbp-2", repoPath: "/Users/weyl/dev/ducter" }, remote: "github.com/wey-gu/ducter" } });
  const b = await p.add("/root/code/ducter-main", "hel");
  expect(b).toMatchObject({ ok: true, project: { name: "ducter", place: { device: "hel", repoPath: "/root/code/ducter-main" } } });
  expect(p.list().map((x) => [x.name, (x.place as { device: string }).device])).toEqual([
    ["ducter", "hel"],
    ["ducter", "mbp-2"],
  ]);
  // A folder with no origin keeps its own name.
  expect(await p.add("/Users/weyl/notes", "mbp-2")).toMatchObject({ ok: true, project: { name: "notes" } });
  expect(p.list()[0]!.remote).toBeUndefined();
  // Kept: read back from disk.
  const again = createProjects({ dataDir: dir, remote });
  expect(again.list().filter((x) => x.name === "ducter").length).toBe(2);
});

test("D455: a home with DUCTER_FOLDER_ROOTS adds its own folders only inside them", async () => {
  const code = join(dir, "code");
  mkdirSync(join(code, "site"), { recursive: true });
  mkdirSync(join(dir, "private"), { recursive: true });
  const p = createProjects({ dataDir: join(dir, "data"), git: async () => ({ ok: false, out: "" }), allowed: (x) => insideRoots(x, [code]) });
  expect(await p.add(join(dir, "private"))).toMatchObject({ ok: false, reason: "not_found" });
  expect(await p.add(join(code, "site"))).toMatchObject({ ok: true, project: { name: "site", place: { kind: "folder", device: "local" } } });
});
