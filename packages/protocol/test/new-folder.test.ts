// D272: 新建一个文件夹 / New folder: a project with no git, made in the Ducter folder's projects/.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { folderName, newProjectFolder } from "../src/new-folder.ts";

const dirs: string[] = [];
const scratch = () => {
  const d = mkdtempSync(join(tmpdir(), "ducter-newfolder-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("D272 new folder", () => {
  test("a name is one folder's name, never a path", () => {
    expect(folderName("  发票 2026 ")).toBe("发票 2026");
    expect(folderName("Trip plans")).toBe("Trip plans");
    for (const bad of ["", "   ", ".", "..", ".hidden", "a/b", "..\\x", "a\nb", "x".repeat(81), "a:b", 42]) expect(folderName(bad)).toBeUndefined();
  });

  test("made in <Ducter folder>/projects (a data folder of its own keeps it inside), then the same name is that folder", () => {
    const data = scratch();
    const r = newProjectFolder("发票", { dataDir: data, home: scratch() });
    expect(r).toEqual({ ok: true, path: join(data, "ducter", "projects", "发票"), name: "发票" });
    expect(existsSync(join(data, "ducter", "projects", "发票"))).toBe(true);
    expect(newProjectFolder("发票", { dataDir: data, home: scratch() })).toEqual({ ok: true, path: join(data, "ducter", "projects", "发票"), name: "发票", existed: true });
  });

  test("refused: a path, a hidden name, a file of that name", () => {
    const data = scratch();
    expect(newProjectFolder("../../etc", { dataDir: data }).ok).toBe(false);
    expect(newProjectFolder(".ssh", { dataDir: data }).ok).toBe(false);
    newProjectFolder("x", { dataDir: data });
    writeFileSync(join(data, "ducter", "projects", "notes"), "a file");
    const r = newProjectFolder("notes", { dataDir: data });
    expect(r.ok).toBe(false);
  });
});
