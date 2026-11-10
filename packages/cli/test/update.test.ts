// `ducter update` (D148) against a running Ducter (a real core with a fake feed and a fake
// install): --check --json for agents, and --yes required off a terminal.
import { afterEach, expect, test } from "bun:test";
import { parseArgs } from "../src/args.ts";
import { cmdUpdate } from "../src/update.ts";
import { translator } from "../src/i18n.ts";
import { ansiStyle } from "../src/doctor.ts";
import { startCore, type Core } from "@ducter/core/src/core.ts";
import { tempDir } from "../../core/test/helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function boot(): Core {
  const t = tempDir();
  const core = startCore({
    dataDir: t.dir,
    port: 0,
    batchMs: 5,
    deviceProbes: { cua: async () => ({ missing: "no" }), native: async () => undefined, harnesses: async () => [], kind: async () => "server" },
    update: {
      fetch: async () => new Response(JSON.stringify({ tag_name: "v0.0.4", body: "- Update in place\n<!-- whats-new\nzh: 在任何设备上原地更新\nen: Update in place, from any device\n-->\n" })),
      how: "self",
      version: "0.0.3",
      autoEveryMs: 0,
      run: async (i) => (i.onPhase?.("downloading"), { ok: true, restarting: false, target: "/x" }),
    },
  });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  return core;
}

const t = translator("en");
const style = ansiStyle(false);
const args = (argv: string[]) => {
  const p = parseArgs(["update", ...argv]);
  if (!p.ok) throw new Error("bad args");
  return p.args;
};

test("parses --check, --to, --finish, --all, --yes, --json", () => {
  expect(args(["--check", "--json"])).toMatchObject({ command: "update", check: true, json: true });
  expect(args(["--all", "--yes", "--to", "0.0.3"])).toMatchObject({ all: true, yes: true, to: "0.0.3" });
  expect(args(["--finish", "/d/updates/plan.json"])).toMatchObject({ finish: "/d/updates/plan.json" });
});

test("--check --json: where each device stands, for an agent to read", async () => {
  const core = boot();
  const out: string[] = [];
  expect(await cmdUpdate({ t, style, args: args(["--check", "--json", "--all"]), port: core.port, dataDir: core.dataDir, log: (s) => out.push(s) })).toBe(0);
  const j = JSON.parse(out.join("\n"));
  expect(j.latest).toBe("0.0.4");
  expect(j.devices[0]).toMatchObject({ id: "local", home: true, current: "0.0.3", latest: "0.0.4", available: true, how: "self", notesBy: { zh: ["在任何设备上原地更新"], en: ["Update in place, from any device"] } });
});

test("without --yes, off a terminal, it changes nothing and asks for --yes", async () => {
  const core = boot();
  const out: string[] = [];
  const err = console.error;
  console.error = (s: string) => out.push(s);
  try {
    expect(await cmdUpdate({ t, style, args: args(["--json"]), port: core.port, dataDir: core.dataDir, log: (s) => out.push(s) })).toBe(2);
  } finally {
    console.error = err;
  }
  expect(out.join("\n")).toContain("--yes");
});

// D156: `ducter update --agents` through a running Ducter: a fake registry, a fake npm.
function bootAgents() {
  const t = tempDir();
  const m = { version: "0.167.0" };
  const runs: string[][] = [];
  const fetch = async (u: string) => (u === "https://registry.npmjs.org/@openai/codex/latest" ? new Response('{"version":"0.168.0"}') : new Response("", { status: 404 }));
  const core = startCore({
    dataDir: t.dir,
    port: 0,
    batchMs: 5,
    deviceProbes: {
      cua: async () => ({ missing: "no" }),
      native: async () => undefined,
      harnesses: async () => [{ harness: "codex", installed: true, loggedIn: true, version: m.version, how: "npm" }],
      kind: async () => "server",
    },
    update: { autoEveryMs: 0 },
    agents: {
      fetch: fetch as any,
      sys: { fetch: fetch as any, run: async (argv) => (runs.push(argv), (m.version = argv.at(-1)!.split("@").at(-1)!), { code: 0, out: "" }), freeBytes: () => undefined, sleep: async () => {}, now: () => Date.now() },
      detect: async () => ({ how: "npm", version: m.version }),
      loggedIn: async () => true,
      exists: () => false,
      autoEveryMs: 0,
    },
  });
  stops.push(t.cleanup, () => core.stop());
  core.setPartner({ onTrigger: () => {} });
  return { core, runs, m };
}

test("--agents --check --json: each AI agent's version, channel and latest; --agents --yes updates the ones behind", async () => {
  expect(args(["--agents", "--check"])).toMatchObject({ agents: true, check: true });
  const { core, runs, m } = bootAgents();
  const out: string[] = [];
  expect(await cmdUpdate({ t, style, args: args(["--agents", "--check", "--json"]), port: core.port, dataDir: core.dataDir, log: (s) => out.push(s) })).toBe(0);
  const j = JSON.parse(out.join("\n"));
  expect(j.agents).toEqual([{ device: "local", deviceName: expect.any(String), harness: "codex", version: "0.167.0", how: "npm", latest: "0.168.0", available: true, standing: "verified", latestVerified: false }]);
  out.length = 0;
  core.devicesView.refresh();
  expect(await cmdUpdate({ t, style, args: args(["--agents", "--yes", "--json"]), port: core.port, dataDir: core.dataDir, log: (s) => out.push(s) })).toBe(0);
  expect(JSON.parse(out.join("\n"))).toEqual({ ok: true, updated: [{ device: expect.any(String), harness: "codex", ok: true, version: "0.168.0" }] });
  expect(runs).toEqual([["npm", "install", "-g", "@openai/codex@0.168.0"]]);
  expect(m.version).toBe("0.168.0");
});
