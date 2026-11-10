// D169: one line per agent from `nmem --json plugins inspect`, honest about what the check knows.
// Fixtures: a real answer on a Mac (2026-11-10, nmem 0.10.116, trimmed to the agents Ducter
// knows plus one it doesn't), a fresh worker, and a disabled plugin beside an update.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inspectMemPlugins, memPluginOf, memPluginsFromInspect } from "../src/mem-plugins.ts";

const fx = (n: string) => JSON.parse(readFileSync(join(import.meta.dir, "../fixtures/mem-inspect", n), "utf8"));

test("a real Mac: installed with its version, several copies is a review, absent, can't tell", () => {
  const m = memPluginsFromInspect(fx("mac-2026-11-10.json"), "2026-11-10T08:00:00.000Z");
  expect(m["claude-code"]).toEqual({ state: "installed", version: "0.7.34", checkedAt: "2026-11-10T08:00:00.000Z" });
  // codex-cli: installed twice (0.1.10 and 0.1.49): the check infers no version, so neither do we.
  expect(m.codex).toEqual({ state: "review", why: "multiple", checkedAt: "2026-11-10T08:00:00.000Z" });
  expect(m.pi?.state).toBe("absent");
  expect(m["deepseek-harness"]).toMatchObject({ state: "review", why: "unclear" });
  // An agent Ducter doesn't carry (gemini-cli) never shows.
  expect(Object.keys(m).sort()).toEqual(["claude-code", "codex", "deepseek-harness", "pi"]);
});

test("'runtime loading is not verified' alone never turns installed into a review", () => {
  const e = fx("mac-2026-11-10.json").plugins.find((p: any) => p.host === "claude-code");
  expect(e.warnings[0]).toMatch(/not verified/);
  expect(memPluginOf(e)?.state).toBe("installed");
});

test("a fresh worker: absent everywhere; a disabled plugin is a review; update when the check says so", () => {
  const w = memPluginsFromInspect(fx("worker-fresh.json"));
  expect(Object.values(w).every((v) => v.state === "absent")).toBe(true);
  const u = memPluginsFromInspect(fx("disabled-and-update.json"));
  expect(u["claude-code"]).toMatchObject({ state: "review", why: "unclear" });
  expect(u.codex).toMatchObject({ state: "update", version: "0.1.10" });
});

test("unreadable or missing: nothing to say", async () => {
  expect(memPluginsFromInspect(null)).toEqual({});
  expect(memPluginsFromInspect({ plugins: "x" })).toEqual({});
  expect(await inspectMemPlugins(async () => ({ code: 127, out: "" }))).toBeUndefined();
  expect(await inspectMemPlugins(async () => ({ code: 0, out: "not json" }))).toBeUndefined();
  // A notice line before the JSON is skipped.
  const out = "nmem: a newer version is available\n" + JSON.stringify(fx("worker-fresh.json"));
  const m = await inspectMemPlugins(async (argv) => (expect(argv).toEqual(["nmem", "--json", "plugins", "inspect"]), { code: 0, out }));
  expect(m?.["claude-code"]?.state).toBe("absent");
});
