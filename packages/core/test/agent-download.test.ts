// D362: an AI agent's update says what it is doing while it runs: Codex's 155 MB binary is
// fetched first into npm's own cache (bytes as they come, the installed copy untouched), then npm
// installs from there; a stall or the whole limit fails into one reason; 停止 stops it cleanly.
// Fakes only: a fake npm (a run that changes a fake version), a fake download that streams,
// stalls or never ends, a local HTTP server for the real download; no registry, no install.
import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import type { DeviceHarness, DeviceView } from "@ducter/protocol";
import { AGENT_INSTALL_MS, AGENT_SLOW_DEFAULT_MS, AGENT_UPDATER_MS, createAgentUpdates, createWorkerAgentUpdater, slowAfter, updateAgent, updatePlan, type AgentLatest } from "../src/agents.ts";
import { downloadFile } from "../src/download.ts";
import type { AgentInstall } from "../src/harness-probe.ts";
import type { DownloadOpts, DownloadResult } from "../src/update.ts";
import { createUpdateAll } from "../src/update-all.ts";
import { openLog } from "../src/log.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

const MB = 1024 * 1024;

/**
 * A Mac with Codex from Homebrew's npm, and a fake installer: `download` streams `chunks` (or
 * stalls after them, or waits for 停止), `npm cache add` records what was cached, `npm install`
 * moves the version only to a cached tarball's version (or to any, without one) unless `install`
 * says otherwise.
 */
function fakeMac(o: { chunks?: number[]; size?: number; then?: "end" | "stall" | "timeout" | "hang" | "404"; install?: "ok" | "timeout" | "hang" } = {}) {
  const m = { version: "0.169.1" as string | undefined, cached: [] as string[], runs: [] as string[][], held: [] as boolean[] };
  let release: (() => void) | undefined;
  const sys = {
    now: () => Date.now(),
    sleep: async () => {},
    run: async (argv: string[], ro: { timeoutMs?: number; signal?: AbortSignal } = {}) => {
      m.runs.push(argv);
      if (argv[1] === "config") return { code: 0, out: "https://registry.npmjs.org/" };
      if (argv[1] === "cache") {
        m.cached.push(argv[3]!);
        return { code: 0, out: "" };
      }
      if (o.install === "timeout") return { code: -1, out: "", timedOut: true };
      if (o.install === "hang")
        return await new Promise<{ code: number; out: string; stopped?: boolean }>((res) => {
          ro.signal?.addEventListener("abort", () => res({ code: -1, out: "", stopped: true }));
        });
      const v = /@(\d[^@]*)$/.exec(argv.find((a) => a.startsWith("@openai/codex@")) ?? "")?.[1];
      if (v) m.version = v;
      return { code: 0, out: "" };
    },
    download: async (url: string, _file: string, d: DownloadOpts = {}): Promise<DownloadResult> => {
      m.runs.push(["download", url]);
      if (o.then === "404") return { ok: false, why: "network", detail: "HTTP 404" };
      let got = 0;
      for (const c of o.chunks ?? [o.size ?? 10 * MB]) {
        got += c;
        d.onBytes?.(got, o.size);
        await Bun.sleep(1);
        if (d.signal?.aborted) return { ok: false, why: "stopped" };
      }
      if (o.then === "stall") return { ok: false, why: "stalled" };
      if (o.then === "timeout") return { ok: false, why: "timeout" };
      if (o.then === "hang")
        return await new Promise<DownloadResult>((res) => {
          release = () => res({ ok: false, why: "stopped" });
          d.signal?.addEventListener("abort", () => res({ ok: false, why: "stopped" }));
        });
      return { ok: true, size: got };
    },
  };
  const detect = async (): Promise<AgentInstall | undefined> => ({ how: "npm", prefix: "/opt/homebrew", ...(m.version ? { version: m.version } : {}) });
  return { m, sys, detect, loggedIn: async () => true, release: () => release?.() };
}

test("plan: Codex from npm names its binary's tarball for this machine; other channels and agents don't", () => {
  const a: AgentInstall = { how: "npm", prefix: "/opt/homebrew", version: "0.169.1" };
  const p = updatePlan("codex", a, "0.170.0", { exists: () => true, platform: "darwin", arch: "arm64" })!;
  expect(p.argv).toEqual(["/opt/homebrew/bin/npm", "--prefix", "/opt/homebrew", "install", "-g", "@openai/codex@0.170.0"]);
  expect(p.fetch).toEqual({ npm: "/opt/homebrew/bin/npm", pkg: "@openai/codex@0.170.0", blob: "@openai/codex/-/codex-0.170.0-darwin-arm64.tgz" });
  expect(updatePlan("codex", a, "0.170.0", { exists: () => false, platform: "linux", arch: "x64" })!.fetch!.blob).toBe("@openai/codex/-/codex-0.170.0-linux-x64.tgz");
  expect(updatePlan("codex", a, "0.170.0", { platform: "freebsd", arch: "x64" })!.fetch).toBeUndefined();
  expect(updatePlan("claude-code", { ...a, version: "2.1.319" }, "2.1.321")!.fetch).toBeUndefined();
  expect(updatePlan("codex", { how: "brew", version: "0.169.1" }, "0.170.0")!.fetch).toBeUndefined();
});

test("the download comes first, watched, while the agent still works; npm then installs from its cache; only the install holds it", async () => {
  const f = fakeMac({ chunks: [12 * MB, 40 * MB, 46 * MB], size: 98 * MB });
  const seen: string[] = [];
  const out = await updateAgent(f.sys, {
    harness: "codex",
    to: "0.170.0",
    detect: f.detect,
    loggedIn: f.loggedIn,
    platform: "darwin",
    arch: "arm64",
    exists: () => true,
    hold: (on) => seen.push(`hold:${on}`),
    onPhase: (p) => seen.push(p),
    onProgress: (p) => seen.push(`${p.step}${p.got !== undefined ? `:${Math.round(p.got / MB)}/${Math.round((p.size ?? 0) / MB)}` : ""}`),
  });
  expect(out).toEqual({ ok: true, from: "0.169.1", to: "0.170.0" });
  // The first and the last byte always say so (the throttle lets at most one a second between).
  expect(seen[0]).toBe("updating");
  expect(seen[1]).toBe("downloading");
  expect(seen).toContain("downloading:12/98");
  expect(seen).toContain("downloading:98/98");
  expect(seen.slice(seen.indexOf("downloading:98/98") + 1)).toEqual(["installing", "hold:true", "checking", "hold:false"]);
  expect(f.m.runs.find((r) => r[0] === "download")![1]).toBe("https://registry.npmjs.org/@openai/codex/-/codex-0.170.0-darwin-arm64.tgz");
  // npm's own cache gets the package's metadata and the downloaded tarball; the install reads from there.
  expect(f.m.cached.some((c) => c === "@openai/codex@0.170.0")).toBe(true);
  expect(f.m.cached.some((c) => c.endsWith("codex-0.170.0-darwin-arm64.tgz"))).toBe(true);
  expect(f.m.runs.at(-1)).toEqual(["/opt/homebrew/bin/npm", "--prefix", "/opt/homebrew", "install", "-g", "@openai/codex@0.170.0", "--prefer-offline", "--no-audit"]);
});

test("a stalled or endless download fails as timeout with the copy untouched; a source that won't serve it falls back to npm alone", async () => {
  for (const then of ["stall", "timeout"] as const) {
    const f = fakeMac({ chunks: [3 * MB], size: 98 * MB, then });
    const held: boolean[] = [];
    const out = await updateAgent(f.sys, { harness: "codex", to: "0.170.0", detect: f.detect, loggedIn: f.loggedIn, platform: "darwin", arch: "arm64", exists: () => true, hold: (on) => held.push(on) });
    expect(out).toMatchObject({ ok: false, reason: "timeout", from: "0.169.1", to: "0.170.0", rolledBack: false });
    expect(f.m.version).toBe("0.169.1");
    expect(f.m.runs.some((r) => r.includes("install"))).toBe(false); // npm never touched the copy
    expect(held).toEqual([]); // the agent was never held
  }
  const f = fakeMac({ then: "404" });
  const steps: string[] = [];
  const out = await updateAgent(f.sys, { harness: "codex", to: "0.170.0", detect: f.detect, loggedIn: f.loggedIn, platform: "darwin", arch: "arm64", exists: () => true, onProgress: (p) => steps.push(p.step) });
  expect(out).toMatchObject({ ok: true, to: "0.170.0" });
  expect(f.m.runs.at(-1)).toEqual(["/opt/homebrew/bin/npm", "--prefix", "/opt/homebrew", "install", "-g", "@openai/codex@0.170.0"]); // npm by itself
  expect(steps).toEqual(["downloading"]); // no "installing": npm's own download is unseen
});

test("an updater cut off at its limit says timeout; 停止 mid-download stops with nothing changed; 停止 mid-install is judged and put back", async () => {
  // brew / an installer: no download Ducter can see, a longer limit, and a timeout is said as one.
  const limits: number[] = [];
  const f = fakeMac({ install: "timeout" });
  const sys = { ...f.sys, run: async (argv: string[], o: any = {}) => (limits.push(o.timeoutMs), f.sys.run(argv, o)) };
  const out = await updateAgent(sys, { harness: "codex", to: "0.170.0", detect: async () => ({ how: "brew", version: f.m.version! }), loggedIn: f.loggedIn });
  expect(out).toMatchObject({ ok: false, reason: "timeout", rolledBack: false });
  expect(limits).toEqual([AGENT_UPDATER_MS]);

  const hang = fakeMac({ chunks: [5 * MB], size: 98 * MB, then: "hang" });
  const ctl = new AbortController();
  const p = updateAgent(hang.sys, { harness: "codex", to: "0.170.0", detect: hang.detect, loggedIn: hang.loggedIn, platform: "darwin", arch: "arm64", exists: () => true, signal: ctl.signal, onProgress: (x) => x.got && ctl.abort() });
  expect(await p).toMatchObject({ ok: false, reason: "stopped", from: "0.169.1", rolledBack: false });
  expect(hang.m.runs.some((r) => r.includes("install"))).toBe(false);

  const slow = fakeMac({ install: "hang" });
  const c2 = new AbortController();
  const q = updateAgent(slow.sys, { harness: "codex", to: "0.170.0", detect: slow.detect, loggedIn: slow.loggedIn, platform: "darwin", arch: "arm64", exists: () => true, signal: c2.signal, onProgress: (x) => x.step === "installing" && setTimeout(() => c2.abort(), 2) });
  expect(await q).toMatchObject({ ok: false, reason: "stopped", from: "0.169.1" });
  expect(AGENT_INSTALL_MS).toBeLessThan(AGENT_UPDATER_MS);
});

// ---------- the real download ----------

test("downloadFile: bytes as they come with the size; a stall and the whole limit stop it; 停止 too; nothing half-written is left", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const body = new Uint8Array(300_000).fill(7);
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      const u = new URL(req.url);
      if (u.pathname === "/missing") return new Response("no", { status: 404 });
      if (u.pathname === "/ok") return new Response(body);
      const stall = u.pathname === "/stall";
      const slow = u.pathname === "/slow";
      return new Response(
        new ReadableStream({
          async pull(c) {
            for (let i = 0; i < 3; i++) {
              c.enqueue(body.subarray(i * 100_000, (i + 1) * 100_000));
              await Bun.sleep(slow ? 40 : 5);
              if (stall && i === 0) await Bun.sleep(5000);
            }
            c.close();
          },
        }),
        { headers: { "content-length": String(body.length) } },
      );
    },
  });
  stops.push(() => void server.stop(true));
  const base = `http://127.0.0.1:${server.port}`;
  const seen: number[] = [];
  const ok = await downloadFile(`${base}/ok`, `${t.dir}/a.tgz`, { onBytes: (g, s) => (expect(s).toBe(300_000), seen.push(g)) });
  expect(ok).toEqual({ ok: true, size: 300_000 });
  expect(seen.at(-1)).toBe(300_000);
  expect(readFileSync(`${t.dir}/a.tgz`).length).toBe(300_000);

  expect(await downloadFile(`${base}/stall`, `${t.dir}/b.tgz`, { stallMs: 150 })).toEqual({ ok: false, why: "stalled" });
  expect(existsSync(`${t.dir}/b.tgz`) || existsSync(`${t.dir}/b.tgz.part`)).toBe(false);
  expect(await downloadFile(`${base}/slow`, `${t.dir}/c.tgz`, { timeoutMs: 50 })).toEqual({ ok: false, why: "timeout" });
  const ctl = new AbortController();
  const p = downloadFile(`${base}/slow`, `${t.dir}/d.tgz`, { signal: ctl.signal, onBytes: (g) => g > 0 && ctl.abort() });
  expect(await p).toEqual({ ok: false, why: "stopped" });
  expect(await downloadFile(`${base}/missing`, `${t.dir}/e.tgz`)).toMatchObject({ ok: false, why: "network" });
});

// ---------- the home's side ----------

const latest = (v: string): AgentLatest => ({ get: () => v, checkedAt: () => undefined, refresh: async () => {}, onChange: () => () => {} });

test("the card's row: the steps ride on the update, the elapsed time counts from the updater's start, slower than usual comes from the last one there", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const log = openLog({ path: t.dir + "/log.db", persona: "p" });
  stops.push(() => log.close());
  const f = fakeMac({ chunks: [12 * MB, 86 * MB], size: 98 * MB, then: "hang" });
  const ag = createAgentUpdates({ log, sys: f.sys, latest: latest("0.170.0"), name: () => "MacBook", detect: f.detect, loggedIn: f.loggedIn, busy: () => 0, autoEveryMs: 0, exists: () => true, dataDir: t.dir });
  stops.push(() => ag.stop());
  const row = (): DeviceHarness => ({ harness: "codex", installed: true, loggedIn: true, canBePartner: true, version: f.m.version!, how: "npm" });
  expect(await ag.start("local", "codex")).toEqual({ ok: true });
  for (let i = 0; i < 100 && ag.view("local", [row()])[0]!.update?.got !== 98 * MB; i++) await Bun.sleep(5);
  const u = ag.view("local", [row()])[0]!.update!;
  expect(u).toMatchObject({ phase: "updating", step: "downloading", got: 98 * MB, size: 98 * MB, slowMs: AGENT_SLOW_DEFAULT_MS });
  expect(Date.parse(u.since!)).toBeLessThanOrEqual(Date.now());
  const since = u.since;
  // 停止: the card goes back to how it was (nothing to say), the copy untouched.
  expect(await ag.cancel("local", "codex")).toBe(true);
  for (let i = 0; i < 100 && ag.view("local", [row()])[0]!.update; i++) await Bun.sleep(5);
  expect(ag.view("local", [row()])[0]!.update).toBeUndefined();
  expect(f.m.version).toBe("0.169.1");
  expect(log.read({ stream: "devices", kinds: ["agent_update"] }).map((e) => [(e.body as any).phase, (e.body as any).reason])).toEqual([["waiting", undefined], ["updating", undefined], ["failed", "stopped"]]);
  expect(since).toBeDefined();

  // A finished one keeps how long it took there; the next is slow after 3x that (never under 90 s).
  const g = fakeMac({ chunks: [1 * MB], size: 1 * MB });
  const ag2 = createAgentUpdates({ log, sys: g.sys, latest: latest("0.170.0"), name: () => "MacBook", detect: g.detect, loggedIn: g.loggedIn, busy: () => 0, autoEveryMs: 0, exists: () => true, dataDir: t.dir });
  stops.push(() => ag2.stop());
  await ag2.start("local", "codex");
  for (let i = 0; i < 100 && ag2.view("local", [{ ...row(), version: g.m.version! }])[0]!.update?.phase !== "done"; i++) await Bun.sleep(5);
  const kept = JSON.parse(readFileSync(`${t.dir}/updates/agent-times.json`, "utf8"));
  expect(typeof kept["local|codex"]).toBe("number");
  expect(slowAfter(kept["local|codex"])).toBe(90_000);
  expect(slowAfter(200_000)).toBe(600_000);
  expect(slowAfter(undefined)).toBe(AGENT_SLOW_DEFAULT_MS);
});

test("a worker reports its download's bytes up the socket and stops on the home's agent_update_stop", async () => {
  const f = fakeMac({ chunks: [12 * MB], size: 98 * MB, then: "hang" });
  const frames: any[] = [];
  const up = (x: object) => void frames.push(x);
  const w = createWorkerAgentUpdater({ sys: f.sys, detect: f.detect, loggedIn: f.loggedIn, probe: async () => [] });
  const p = w.handle({ id: 1, args: { harness: "codex", to: "0.170.0" } }, up, { turningOn: () => 0 });
  for (let i = 0; i < 100 && !frames.some((x) => x.got); i++) await Bun.sleep(5);
  expect(frames.find((x) => x.got)).toMatchObject({ t: "agent_update", harness: "codex", phase: "updating", step: "downloading", got: 12 * MB, size: 98 * MB });
  w.stop({ id: 2, args: { harness: "codex" } }, up);
  await p;
  expect(frames.find((x) => x.id === 2)).toMatchObject({ result: { ok: true } });
  expect(frames.find((x) => x.phase === "failed")).toMatchObject({ reason: "stopped", rolledBack: false });
  expect(f.m.version).toBe("0.169.1");
});

// ---------- Update all ----------

test("Update all: a running agent step carries its live part; 停止 on it reads 已停止 and the rest goes on", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const log = openLog({ path: t.dir + "/log.db", persona: "p" });
  stops.push(() => log.close());
  const h = (harness: string, version: string, to: string): DeviceHarness => ({ harness, installed: true, loggedIn: true, canBePartner: false, version, latest: to, how: "npm", available: true }) as DeviceHarness;
  const dv: DeviceView = { id: "mbp", name: "MacBook Pro M3", kind: "laptop", home: false, state: "awake", version: "0.0.77", harnesses: [h("codex", "0.169.1", "0.170.0"), h("claude-code", "2.1.319", "2.1.321")], abilities: [], update: { current: "0.0.77", latest: "0.0.77", available: false, how: "app" } };
  const home: DeviceView = { id: "local", name: "Hetzner", kind: "server", home: true, state: "awake", version: "0.0.77", harnesses: [], abilities: [], update: { current: "0.0.77", latest: "0.0.77", available: false, how: "self" } };
  const cancelled: string[] = [];
  const agents = {
    start: async (_id: string, hh: string, a: { to?: string }) => {
      const x = dv.harnesses.find((y) => y.harness === hh)!;
      x.update = { phase: "updating", from: x.version!, to: a.to!, at: new Date().toISOString(), since: new Date().toISOString(), slowMs: 240_000, step: "downloading", got: 12 * MB, size: 98 * MB };
      return { ok: true as const };
    },
    cancel: async (id: string, hh: string) => (cancelled.push(`${id}:${hh}`), true),
    onChange: () => () => {},
  };
  const ua = createUpdateAll({ dataDir: t.dir, log, now: () => Date.now(), updates: () => ({ start: async () => ({ ok: true }), onChange: () => () => {} }) as any, agents: () => agents as any, devices: async () => [home, dv], busy: () => 0, tickMs: 0, nightEveryMs: 0 });
  stops.push(() => ua.stop_());
  await ua.start();
  await ua.step();
  await ua.step();
  const codex = ua.plan()!.items.find((i) => i.harness === "codex")!;
  expect(codex).toMatchObject({ state: "running", phase: "updating", step: "downloading", got: 12 * MB, size: 98 * MB, slowMs: 240_000 });
  expect(codex.since).toBeDefined();
  expect(await ua.stopItem("agent:mbp:nope")).toBe(false);
  expect(await ua.stopItem(codex.key)).toBe(true);
  expect(cancelled).toEqual(["mbp:codex"]);
  const after = ua.plan()!.items.find((i) => i.harness === "codex")!;
  expect(after).toMatchObject({ state: "skipped", reason: "stopped" });
  expect(after.step).toBeUndefined();
  expect(after.since).toBeUndefined();
  // The next agent on that computer goes on.
  dv.harnesses[0]!.update = { phase: "failed", from: "0.169.1", to: "0.170.0", reason: "stopped", at: new Date().toISOString() };
  await ua.step();
  expect(ua.plan()!.items.find((i) => i.harness === "claude-code")!.state).toBe("running");
});
