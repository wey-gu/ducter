// L1 identity loading: memory off never reads Mem (review 2 #14).
import { expect, test } from "bun:test";
import { DEFAULT_IDENTITY, loadPersona } from "../src/persona.ts";

test("memory off: the default identity, source 'off', and nmem is never run", async () => {
  const p = await loadPersona({ off: true, bin: "/nonexistent/nmem-must-not-run" });
  expect(p).toMatchObject({ source: "off", identity: DEFAULT_IDENTITY });
});

test("memory on but nmem missing: the default identity, source 'default'", async () => {
  const p = await loadPersona({ off: false, bin: "/nonexistent/nmem", timeoutMs: 500 });
  expect(p.source).toBe("default");
});
