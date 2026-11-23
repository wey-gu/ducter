// scripts/test/no-mem.ts holds for every test: the real nmem is never found or run, a test's own fake is.
import { expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realNmem } from "./no-mem.ts";

test("no NMEM_* from the developer's shell, and Mem's config dir is an empty one", () => {
  expect(Object.keys(process.env).filter((k) => k.startsWith("NMEM_"))).toEqual(["NMEM_CLI_CONFIG_DIR"]);
  expect(process.env.NMEM_CLI_CONFIG_DIR!.startsWith(tmpdir())).toBe(true);
});

test("an nmem on PATH is never found or started; the child's PATH finds the guard first", async () => {
  expect(Bun.which("nmem")).toBeNull();
  expect(() => Bun.spawn(["nmem", "--json", "status"])).toThrow(/not found/);
  expect(() => Bun.spawn(["/usr/local/bin/nmem", "--json", "status"])).toThrow(/not found/);
  expect(() => Bun.spawnSync({ cmd: ["nmem", "m", "add", "x"] })).toThrow(/not found/);
  expect(realNmem("/Users/someone/.local/bin/nmem")).toBe(true);
  const child = Bun.spawn(["/bin/sh", "-c", "nmem --json status"], { stdout: "pipe", stderr: "pipe" });
  expect(await child.exited).toBe(127);
  expect(await new Response(child.stderr).text()).toContain("off in tests");
});

test("a fake nmem a test wrote runs, by its path or on its own PATH", async () => {
  const dir = mkdtempSync(join(tmpdir(), "no-mem-fake-"));
  writeFileSync(join(dir, "nmem"), "#!/bin/sh\necho fake\n");
  chmodSync(join(dir, "nmem"), 0o755);
  expect(Bun.which("nmem", { PATH: dir })).toBe(join(dir, "nmem"));
  const byPath = Bun.spawn([join(dir, "nmem")], { stdout: "pipe" });
  expect((await new Response(byPath.stdout).text()).trim()).toBe("fake");
  const byName = Bun.spawn(["nmem"], { stdout: "pipe", env: { PATH: dir } });
  expect((await new Response(byName.stdout).text()).trim()).toBe("fake");
});

test("a fetch to Mem's local server is refused", async () => {
  await expect(fetch("http://127.0.0.1:14242/health")).rejects.toThrow(/off in tests/);
});
