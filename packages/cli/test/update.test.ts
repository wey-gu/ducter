// `ducter update` (D148) against a running Ducter (a real core with a fake feed and a fake
// install): --check --json for agents, and --yes required off a terminal.
import { afterEach, expect, test } from "bun:test";
import { parseArgs } from "../src/args.ts";
import { cmdUpdate, itemState } from "../src/update.ts";
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

// D224: --all is the home's one plan: listed in its order, asked once, followed to its end.
test("--all: the plan in its order, asked once with --yes, followed until it is over", async () => {
  const core = boot();
  await core.release.check(true);
  const out: string[] = [];
  expect(await cmdUpdate({ t, style, args: args(["--all", "--check"]), port: core.port, dataDir: core.dataDir, log: (s) => out.push(s) })).toBe(0);
  expect(out.join("\n")).toContain("1. Ducter on");
  expect(out.join("\n")).toContain("0.0.3 → 0.0.4");
  out.length = 0;
  expect(await cmdUpdate({ t, style, args: args(["--all", "--yes"]), port: core.port, dataDir: core.dataDir, log: (s) => out.push(s) })).toBe(0);
  const text = out.join("\n");
  expect(text).toContain("updated to 0.0.4");
  expect(text).toContain(t("update.all.summary"));
  expect(core.log.read({ stream: "devices", kinds: ["update_all"] }).map((e) => (e.body as any).by)).toEqual(["cli", "cli"]);
  // Nothing behind any more (the plan's step is done; the card shows 回来了): a second --all says so.
  out.length = 0;
  expect(await cmdUpdate({ t, style, args: args(["--all", "--yes", "--json"]), port: core.port, dataDir: core.dataDir, log: (s) => out.push(s) })).toBe(0);
  expect(JSON.parse(out.join("\n"))).toMatchObject({ ok: true, updated: [] });
});

// D187: on a Mac that does tasks for a home elsewhere, `ducter update --check` asked nobody and
// listed only itself. --check goes to the home the CLI follows and lists every computer there.
test("--check lists every computer of the home it follows, not only this one", async () => {
  const devices = [
    { id: "local", name: "Hetzner Server", kind: "server", home: true, state: "awake", harnesses: [], abilities: [], update: { current: "0.0.13", latest: "0.0.13", available: false, how: "self" } },
    { id: "dev_mac", name: "Macbook Pro M3", kind: "laptop", home: false, state: "awake", harnesses: [], abilities: [], update: { current: "0.0.12", latest: "0.0.13", available: true, how: "app" } },
  ];
  const asked: unknown[] = [];
  const fake = (async (target: unknown) => {
    asked.push(target);
    const frames: any[] = [{ t: "update_result", ok: true, update: devices[0]!.update }, { t: "devices", devices }];
    return {
      personaName: "Ducter",
      headSeq: 0,
      replayed: [],
      onHand: { tasks: [] } as any,
      send() {},
      on: () => () => {},
      next: async (match: (f: any) => boolean) => frames.find(match),
      closed: new Promise<void>(() => {}),
      close() {},
    };
  }) as any;
  const out: string[] = [];
  const target = { kind: "remote" as const, address: "https://hel.example", name: "hel.example", token: "dvc.x" };
  expect(await cmdUpdate({ t, style, args: args(["--check"]), port: 7777, dataDir: "/nonexistent", target, connect: fake, log: (s) => out.push(s) })).toBe(0);
  expect(asked).toEqual([target]);
  const text = out.join("\n");
  expect(text).toContain("Hetzner Server");
  expect(text).toContain("Macbook Pro M3");
  expect(text).toContain("0.0.13");
});

test("--check with the home it follows unreachable says so before this computer's own row", async () => {
  const out: string[] = [];
  const target = { kind: "remote" as const, address: "https://hel.example", name: "hel.example", token: "dvc.x" };
  const sys = { fetch: async () => new Response(JSON.stringify({ tag_name: "v0.0.13" })), run: async () => ({ code: 0, out: "" }), freeBytes: () => undefined, sleep: async () => {}, now: () => Date.now() } as any;
  expect(await cmdUpdate({ t, style, args: args(["--check"]), port: 7777, dataDir: "/nonexistent", target, sys, connect: async () => undefined, log: (s) => out.push(s) })).toBe(0);
  expect(out[0]).toBe(t("update.unreached", { name: "hel.example" }));
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

// D227: a step says what it waits on, and why one its computer's Ducter cut off twice didn't update.
test("Update all's lines: waiting for a computer's Ducter or for it to reconnect, started again, cut off twice", () => {
  const base = { key: "agent:mac:codex", kind: "agent" as const, device: "mac", deviceName: "Macbook Pro M3", harness: "codex", from: "0.167.1", to: "0.167.2", at: "x" };
  expect(itemState(t, { ...base, state: "waiting", wait: "ducter" })).toBe("waiting for Ducter on Macbook Pro M3 to finish updating");
  expect(itemState(t, { ...base, state: "running", phase: "updating", wait: "reconnect" })).toBe("waiting for Macbook Pro M3 to reconnect");
  expect(itemState(t, { ...base, state: "running", phase: "updating", retried: true })).toBe("cut off; updating to 0.167.2 again");
  expect(itemState(t, { ...base, state: "failed", reason: "interrupted", retried: true })).toBe("didn't update (Ducter on Macbook Pro M3 restarted during the update and cut it off; tried once more, and it still didn't finish)");
  const zh = translator("zh");
  expect(itemState(zh, { ...base, state: "running", phase: "updating", wait: "reconnect" })).toBe("等 Macbook Pro M3 重新连上");
});
