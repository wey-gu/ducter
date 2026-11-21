// D169: one line per agent from `nmem --json plugins inspect`, honest about what the check knows.
// Fixtures: a real answer on a Mac (2026-11-10, nmem 0.10.116, trimmed to the agents Ducter
// knows plus one it doesn't), a fresh worker, and a disabled plugin beside an update.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkMemPluginUpdates, inspectMemPlugins, memPluginCatalog, memPluginOf, memPluginsFromInspect, withAvailable, withCatalog } from "../src/mem-plugins.ts";

const fx = (n: string) => JSON.parse(readFileSync(join(import.meta.dir, "../fixtures/mem-inspect", n), "utf8"));

test("a real Mac: installed with its version, several copies is a review, absent, can't tell", () => {
  const m = memPluginsFromInspect(fx("mac-2026-11-10.json"), "2026-11-10T08:00:00.000Z");
  expect(m["claude-code"]).toEqual({ state: "installed", version: "0.7.34", checkedAt: "2026-11-10T08:00:00.000Z" });
  // codex-cli: installed twice (0.1.10 and 0.1.49): the check infers no version, so neither do we; D466 names both copies.
  expect(m.codex).toEqual({ state: "review", why: "multiple", versions: ["0.1.10", "0.1.49"], checkedAt: "2026-11-10T08:00:00.000Z" });
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

// D466: a newer plugin from Mem's own `plugins check` (fixtures from the author's Mac, 2026-11-22,
// nmem 0.10.122: Claude Code 0.7.37 at the newest; Codex installed twice, 0.1.10 and 0.1.53; check
// doesn't list Codex or pi; OpenClaw installed by inspect, "not detected" by check).
const chk = (n: string) => JSON.parse(readFileSync(join(import.meta.dir, "../fixtures/mem-check", n), "utf8"));

test("D466: several copies are said by their versions; one copy says none", () => {
  const m = memPluginsFromInspect(fx("mac-2026-11-22.json"));
  expect(m.codex).toEqual({ state: "review", why: "multiple", versions: ["0.1.10", "0.1.53"] });
  expect(m["claude-code"]).toEqual({ state: "installed", version: "0.7.37" });
});

test("D466: the check's newest version per Ducter agent, by its host id; agents it doesn't list have none", () => {
  expect(memPluginCatalog(chk("mac-2026-11-22.json"))).toEqual({ "claude-code": "0.7.37" });
  // A Ducter id is taken too, and a bad or missing version is skipped.
  expect(memPluginCatalog({ plugins: [{ id: "codex", available_version: "0.1.60" }, { id: "pi", available_version: null }, { id: "claude-code", available_version: "latest" }] })).toEqual({ codex: "0.1.60" });
  expect(memPluginCatalog(null)).toEqual({});
});

test("D466: installed below the newest is an update from to; at or past it, a review, absent, or no version: as inspect said", () => {
  expect(withAvailable({ state: "installed", version: "0.7.34" }, "0.7.37")).toEqual({ state: "update", version: "0.7.34", available: "0.7.37" });
  expect(withAvailable({ state: "installed", version: "0.7.37" }, "0.7.37")).toEqual({ state: "installed", version: "0.7.37" });
  expect(withAvailable({ state: "installed", version: "0.8.0" }, "0.7.37").state).toBe("installed");
  expect(withAvailable({ state: "installed" }, "0.7.37").state).toBe("installed");
  expect(withAvailable({ state: "review", why: "multiple", versions: ["0.1.10", "0.1.53"] }, "0.1.60").state).toBe("review");
  expect(withAvailable({ state: "absent" }, "0.7.37").state).toBe("absent");
  // Inspect's own update gains where it goes.
  expect(withAvailable({ state: "update", version: "0.1.10" }, "0.1.53")).toEqual({ state: "update", version: "0.1.10", available: "0.1.53" });
  expect(withCatalog({ "claude-code": { state: "installed", version: "0.7.30" }, pi: { state: "installed", version: "0.8.14" } }, { "claude-code": "0.7.37" })).toEqual({
    "claude-code": { state: "update", version: "0.7.30", available: "0.7.37" },
    pi: { state: "installed", version: "0.8.14" },
  });
});

test("D466: the check runs `nmem --json plugins check`; offline, missing or unreadable: nothing", async () => {
  const out = JSON.stringify(chk("mac-2026-11-22.json"));
  expect(await checkMemPluginUpdates(async (argv) => (expect(argv).toEqual(["nmem", "--json", "plugins", "check"]), { code: 0, out }))).toEqual({ "claude-code": "0.7.37" });
  expect(await checkMemPluginUpdates(async () => ({ code: 1, out: "" }))).toBeUndefined();
  expect(await checkMemPluginUpdates(async () => ({ code: 127, out: "" }))).toBeUndefined();
  expect(await checkMemPluginUpdates(async () => ({ code: 0, out: "error: network unreachable" }))).toBeUndefined();
  expect(await checkMemPluginUpdates(async () => ({ code: 0, out: "{}" }))).toBeUndefined();
  expect(await checkMemPluginUpdates(async () => Promise.reject(new Error("timeout")))).toBeUndefined();
});
