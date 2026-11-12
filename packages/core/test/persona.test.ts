// L1 identity loading: memory off never reads Mem (review 2 #14).
import { expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_IDENTITY, loadPersona } from "../src/persona.ts";

test("memory off: the default identity, source 'off', and nmem is never run", async () => {
  const p = await loadPersona({ off: true, bin: "/nonexistent/nmem-must-not-run" });
  expect(p).toMatchObject({ source: "off", identity: DEFAULT_IDENTITY });
});

test("memory on but nmem missing: the default identity, source 'default'", async () => {
  const p = await loadPersona({ off: false, bin: "/nonexistent/nmem", timeoutMs: 500 });
  expect(p.source).toBe("default");
});

test("D141: a bound identity's own bundle is read (--agent-id, its Space), still without ensuring a profile", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ducter-persona-"));
  const bin = join(dir, "nmem");
  writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' "$@" > "${dir}/args"\necho '{"agent_profile":{"display_name":"小鸭"}}'\n`);
  chmodSync(bin, 0o755);
  const p = await loadPersona({ off: false, bin, mem: { agentId: "ducter", space: "ducter-scratch" } });
  expect(p).toMatchObject({ name: "小鸭", source: "nowledge-mem" });
  expect(readFileSync(join(dir, "args"), "utf8").trim().split("\n")).toEqual(["--json", "context", "--no-ensure", "--no-working-memory", "--source-app", "ducter", "--agent-id", "ducter", "--space", "ducter-scratch"]);
});
