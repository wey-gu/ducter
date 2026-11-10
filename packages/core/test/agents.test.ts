// D156: the AI agents' own versions and their updates. Fakes only: a fake registry (fetch), a
// fake npm / brew / claude (a run that changes a fake installed version), a fake clock. No
// network, no install, nothing on this Mac's own CLIs is touched.
import { afterEach, expect, test } from "bun:test";
import type { DeviceHarness, ServerFrame } from "@ducter/protocol";
import { HARNESS_FACTS } from "@ducter/protocol/src/harness-facts.ts";
import type { HarnessId } from "@ducter/protocol/src/harnesses.ts";
import { createAgentLatest, createAgentUpdates, createWorkerAgentUpdater, judgeAgent, nightTarget, parseLatest, updateAgent, updatePlan, type AgentLatest } from "../src/agents.ts";
import { agentHow, detectAgent, type AgentInstall } from "../src/harness-probe.ts";
import { startCore, type Core } from "../src/core.ts";
import type { DeviceProbes } from "../src/devices.ts";
import { openLog } from "../src/log.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

// ---------- how a copy was installed ----------

test("how: the real path decides the channel (research/42)", () => {
  const none = () => false;
  expect(agentHow("codex", "/opt/homebrew/lib/node_modules/@openai/codex/bin/codex.js", none)).toEqual({ how: "npm", prefix: "/opt/homebrew" });
  expect(agentHow("codex", "/usr/local/lib/node_modules/@openai/codex/bin/codex.js", none)).toEqual({ how: "npm", prefix: "/usr/local" });
  expect(agentHow("codex", "/opt/homebrew/Caskroom/codex/0.167.0/codex-aarch64-apple-darwin", none)).toEqual({ how: "brew" });
  expect(agentHow("codex", "/home/u/.codex/packages/standalone/releases/0.167.0/bin/codex", none)).toEqual({ how: "installer" });
  expect(agentHow("codex", "/Applications/Codex.app/Contents/Resources/codex", none)).toEqual({ how: "app", app: "Codex" });
  expect(agentHow("claude-code", "/Users/u/.local/share/claude/versions/2.1.321", none)).toEqual({ how: "installer" });
  expect(agentHow("claude-code", "/Users/u/Library/Application Support/Claude/claude-code/2.1.284/claude", none)).toEqual({ how: "app", app: "Claude" });
  expect(agentHow("claude-code", "/opt/homebrew/Caskroom/claude-code/2.1.311/claude", none)).toEqual({ how: "brew" });
  expect(agentHow("claude-code", "/home/u/.npm-global/lib/node_modules/@anthropic-ai/claude-code/cli.js", none)).toEqual({ how: "npm", prefix: "/home/u/.npm-global" });
  // A pnpm or bun global is no channel Ducter drives; DeepSeek Harness has no cask.
  expect(agentHow("codex", "/home/u/.local/share/pnpm/global/5/.pnpm/@openai+codex@0.167.0/node_modules/@openai/codex/bin/codex.js", none)).toEqual({ how: "unknown" });
  expect(agentHow("codex", "/home/u/.bun/install/global/node_modules/@openai/codex/bin/codex.js", none)).toEqual({ how: "unknown" });
  expect(agentHow("deepseek-harness", "/opt/homebrew/Cellar/dsh/0.2.2/bin/dsh", none)).toEqual({ how: "unknown" });
  expect(agentHow("deepseek-harness", "/usr/lib/node_modules/@deepseek-ai/dsh/bin/dsh.js", none)).toEqual({ how: "npm", prefix: "/usr" });
  // pi's managed install is marked by a file in a parent folder.
  expect(agentHow("pi", "/home/u/.pi/releases/1.5.0/bin/pi", (p) => p === "/home/u/.pi/managed-install.json")).toEqual({ how: "installer" });
  expect(agentHow("pi", "/home/u/somewhere/pi", none)).toEqual({ how: "unknown" });
});

test("detect: the version from its own --version, pi inside Ducter says so", async () => {
  const a = await detectAgent("codex", {
    which: (c) => (c === "codex" ? "/opt/homebrew/bin/codex" : null),
    exec: async (argv) => (argv.join(" ") === "/opt/homebrew/bin/codex --version" ? { code: 0, out: "codex-cli 0.167.0" } : { code: 1, out: "" }),
    realpath: () => "/opt/homebrew/lib/node_modules/@openai/codex/bin/codex.js",
    exists: () => false,
  });
  expect(a).toEqual({ version: "0.167.0", how: "npm", prefix: "/opt/homebrew", path: "/opt/homebrew/bin/codex" });
  expect(await detectAgent("pi", { which: () => null, exec: async () => ({ code: 1, out: "" }), piBundled: () => "1.5.0" })).toEqual({ version: "1.5.0", how: "ducter" });
  expect(await detectAgent("codex", { which: () => null, exec: async () => ({ code: 1, out: "" }) })).toBeUndefined();
});

// ---------- the channels ----------

test("latest: a bare version, JSON {version}, a cask's version,build; anything else is nothing", () => {
  expect(parseLatest("2.1.321\n")).toBe("2.1.321");
  expect(parseLatest('{"ok":true,"version":"1.5.0","packageName":"@earendil-works/pi-coding-agent"}')).toBe("1.5.0");
  expect(parseLatest('{"name":"@deepseek-ai/dsh","version":"0.2.2-rc.1"}')).toBe("0.2.2-rc.1");
  expect(parseLatest('{"token":"codex","version":"0.167.0,abc123"}')).toBe("0.167.0");
  expect(parseLatest("<html>rate limited</html>")).toBeUndefined();
  expect(parseLatest("{oops")).toBeUndefined();
});

function fakeRegistry(map: Record<string, string>) {
  const calls: string[] = [];
  let offline = false;
  const fetch = async (url: string) => {
    calls.push(url);
    if (offline) throw new Error("ENOTFOUND");
    const body = map[url];
    return body === undefined ? new Response("not found", { status: 404 }) : new Response(body, { status: 200 });
  };
  return { fetch, calls, set: (u: string, b: string) => (map[u] = b), offline: (v: boolean) => (offline = v) };
}

const NPM_CODEX = "https://registry.npmjs.org/@openai/codex/latest";
const CLAUDE_FEED = "https://downloads.claude.ai/claude-code-releases/latest";

test("latest per channel: read once, kept 6 h in the data folder, silent offline; never without a fetch", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  let now = Date.parse("2026-11-10T01:00:00Z");
  const reg = fakeRegistry({ [NPM_CODEX]: '{"version":"0.168.0"}', [CLAUDE_FEED]: "2.1.322" });
  const l = createAgentLatest({ dataDir: t.dir, fetch: reg.fetch as any, now: () => now, env: {} });
  await l.refresh([{ harness: "codex", how: "npm" }, { harness: "claude-code", how: "installer" }, { harness: "codex", how: "app" }]);
  expect(l.get("codex", "npm")).toBe("0.168.0");
  expect(l.get("claude-code", "installer")).toBe("2.1.322");
  expect(l.get("codex", "app")).toBeUndefined();
  expect(reg.calls.length).toBe(2);
  await l.refresh([{ harness: "codex", how: "npm" }]);
  expect(reg.calls.length).toBe(2); // fresh: not read again
  now += 7 * 60 * 60_000;
  reg.offline(true);
  await l.refresh([{ harness: "codex", how: "npm" }]);
  expect(l.get("codex", "npm")).toBe("0.168.0"); // offline: the last answer stays
  // A restart reads the file.
  const again = createAgentLatest({ dataDir: t.dir, fetch: reg.fetch as any, now: () => now, env: { DUCTER_UPDATE_CHECK: "off" } });
  expect(again.get("codex", "npm")).toBe("0.168.0");
  const before = reg.calls.length;
  await again.refresh([{ harness: "codex", how: "npm" }], true);
  expect(reg.calls.length).toBe(before); // off: never asks
  const none = createAgentLatest({ dataDir: tempDir().dir, env: {} });
  await none.refresh([{ harness: "codex", how: "npm" }], true);
  expect(none.get("codex", "npm")).toBeUndefined();
});

// ---------- the update commands ----------

test("plans: npm pins under the same prefix, Homebrew upgrades the cask, an installer updates or pins, an app has none", () => {
  const exists = (p: string) => p === "/opt/homebrew/bin/npm";
  expect(updatePlan("codex", { how: "npm", prefix: "/opt/homebrew", version: "0.167.0" }, "0.168.0", { exists })).toMatchObject({
    argv: ["/opt/homebrew/bin/npm", "--prefix", "/opt/homebrew", "install", "-g", "@openai/codex@0.168.0"],
    pinned: true,
  });
  expect(updatePlan("deepseek-harness", { how: "npm", version: "0.2.1" }, "0.2.2-rc.1", { exists })!.argv).toEqual(["npm", "install", "-g", "@deepseek-ai/dsh@0.2.2-rc.1"]);
  expect(updatePlan("codex", { how: "brew", version: "0.167.0" }, "0.168.0")).toMatchObject({ argv: ["brew", "upgrade", "--cask", "codex"], pinned: false });
  const claude: AgentInstall = { how: "installer", version: "2.1.319", path: "/home/u/.local/bin/claude" };
  expect(updatePlan("claude-code", claude, "2.1.321", { latest: "2.1.321" })).toMatchObject({ argv: ["/home/u/.local/bin/claude", "update"], pinned: false });
  expect(updatePlan("claude-code", claude, "2.1.319", { latest: "2.1.321" })).toMatchObject({ argv: ["/home/u/.local/bin/claude", "install", "2.1.319"], pinned: true });
  expect(updatePlan("codex", { how: "installer", version: "0.166.0", path: "/home/u/.local/bin/codex" }, "0.166.0", { latest: "0.167.0" })!.argv.at(-1)).toContain("--release 0.166.0");
  expect(updatePlan("pi", { how: "installer", version: "1.4.0", path: "/home/u/.local/bin/pi" }, "1.5.0", { latest: "1.5.0" })!.argv).toEqual(["/home/u/.local/bin/pi", "update", "--self"]);
  expect(updatePlan("codex", { how: "app", version: "0.167.0" }, "0.168.0")).toBeUndefined();
  expect(updatePlan("pi", { how: "ducter", version: "1.5.0" }, "1.6.0")).toBeUndefined();
  expect(updatePlan("codex", { how: "unknown", version: "0.167.0" }, "0.168.0")).toBeUndefined();
});

/** A machine with one agent: run changes the installed version as the updater would. */
function fakeMachine(o: { how: AgentInstall["how"]; version: string; prefix?: string; path?: string; behave?: (argv: string[], m: { version: string | undefined; loggedIn: boolean }) => void }) {
  const m = { version: o.version as string | undefined, loggedIn: true };
  const runs: string[][] = [];
  const sys = {
    run: async (argv: string[]) => {
      runs.push(argv);
      if (o.behave) o.behave(argv, m);
      else {
        const pinned = /@(\d[^@]*)$/.exec(argv.at(-1) ?? "")?.[1] ?? (argv[1] === "install" ? argv[2] : undefined);
        if (pinned) m.version = pinned;
      }
      return { code: 0, out: "" };
    },
    sleep: async () => {},
    now: () => Date.now(),
  };
  const detect = async (): Promise<AgentInstall | undefined> => ({ how: o.how, ...(m.version ? { version: m.version } : {}), ...(o.prefix ? { prefix: o.prefix } : {}), ...(o.path ? { path: o.path } : {}) });
  return { m, runs, sys, detect, loggedIn: async () => m.loggedIn };
}

test("an update: run the channel's updater, then judge by the version read back", async () => {
  const f = fakeMachine({ how: "npm", version: "0.167.0", prefix: "/usr" });
  const phases: string[] = [];
  const out = await updateAgent(f.sys, { harness: "codex", to: "0.168.0", detect: f.detect, loggedIn: f.loggedIn, onPhase: (p) => phases.push(p), exists: () => false });
  expect(out).toEqual({ ok: true, from: "0.167.0", to: "0.168.0" });
  expect(f.runs).toEqual([["npm", "--prefix", "/usr", "install", "-g", "@openai/codex@0.168.0"]]);
  expect(phases).toEqual(["updating", "checking"]);
});

test("a new version that doesn't answer goes back where the channel pins; a cask can't, and says so", async () => {
  const npm = fakeMachine({ how: "npm", version: "0.167.0", behave: (argv, m) => (m.version = argv.at(-1)!.endsWith("@0.167.0") ? "0.167.0" : undefined) });
  const out = await updateAgent(npm.sys, { harness: "codex", to: "0.168.0", detect: npm.detect, loggedIn: npm.loggedIn, exists: () => false });
  expect(out).toMatchObject({ ok: false, reason: "version", from: "0.167.0", rolledBack: true });
  expect(npm.runs.map((r) => r.at(-1))).toEqual(["@openai/codex@0.168.0", "@openai/codex@0.167.0"]);

  const brew = fakeMachine({ how: "brew", version: "0.167.0", behave: (_a, m) => (m.version = undefined) });
  const b = await updateAgent(brew.sys, { harness: "codex", to: "0.168.0", detect: brew.detect, loggedIn: brew.loggedIn });
  expect(b).toMatchObject({ ok: false, reason: "version", rolledBack: false });
  expect(brew.runs.length).toBe(1);
});

test("a lost sign-in goes back too; an updater that changes nothing says so; work on it is waited for", async () => {
  const f = fakeMachine({
    how: "installer",
    version: "2.1.319",
    path: "/u/.local/bin/claude",
    behave: (argv, m) => {
      if (argv[1] === "update") (m.version = "2.1.321"), (m.loggedIn = false);
      if (argv[1] === "install") (m.version = argv[2]), (m.loggedIn = true);
    },
  });
  const out = await updateAgent(f.sys, { harness: "claude-code", to: "2.1.321", latest: "2.1.321", detect: f.detect, loggedIn: f.loggedIn });
  expect(out).toMatchObject({ ok: false, reason: "signed_out", rolledBack: true });
  expect(f.runs).toEqual([
    ["/u/.local/bin/claude", "update"],
    ["/u/.local/bin/claude", "install", "2.1.319"],
  ]);

  const same = fakeMachine({ how: "brew", version: "0.167.0", behave: () => {} });
  expect(await updateAgent(same.sys, { harness: "codex", to: "0.168.0", detect: same.detect, loggedIn: same.loggedIn })).toMatchObject({ ok: false, reason: "unchanged" });

  const busy = fakeMachine({ how: "npm", version: "0.167.0" });
  const r = await updateAgent(busy.sys, { harness: "codex", to: "0.168.0", detect: busy.detect, loggedIn: busy.loggedIn, settle: async () => ({ ok: false, reason: "busy" }), exists: () => false });
  expect(r).toMatchObject({ ok: false, reason: "busy" });
  expect(busy.runs.length).toBe(0); // nothing ran
  const app = fakeMachine({ how: "app", version: "0.167.0" });
  expect(await updateAgent(app.sys, { harness: "codex", to: "0.168.0", detect: app.detect, loggedIn: app.loggedIn })).toMatchObject({ ok: false, reason: "how" });
  expect(app.runs.length).toBe(0); // never touched
});

test("night target: only verified versions; a pinning channel may go to the newest verified one", () => {
  const top = HARNESS_FACTS.codex.verified.to; // 0.167.0
  expect(nightTarget("codex", "npm", "0.166.0", top)).toBe(top);
  expect(nightTarget("codex", "npm", "0.166.0", "0.199.0")).toBe(top); // latest unverified: the newest verified
  expect(nightTarget("codex", "brew", "0.166.0", "0.199.0")).toBeUndefined(); // a cask can't pin
  expect(nightTarget("codex", "npm", top, "0.199.0")).toBeUndefined(); // already there: waits for a tap
  expect(nightTarget("codex", "app", "0.166.0", top)).toBeUndefined();
  expect(nightTarget("deepseek-harness", "npm", "0.2.1", "0.2.2-rc.1")).toBeUndefined(); // nothing verified yet
});

// ---------- the home's side ----------

function staticLatest(map: Partial<Record<HarnessId, string>>): AgentLatest {
  return { get: (h, how) => (how === "npm" || how === "brew" || how === "installer" ? map[h] : undefined), checkedAt: () => undefined, refresh: async () => {}, onChange: () => () => {} };
}

test("the card: latest, behind, verified or not, then a tap runs the steps at a safe point, each in the Log", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const log = openLog({ path: t.dir + "/log.db", persona: "p" });
  stops.push(() => log.close());
  const f = fakeMachine({ how: "npm", version: "0.167.0", prefix: "/usr" });
  let working = 1;
  const holds: string[] = [];
  const ag = createAgentUpdates({
    log,
    sys: { ...f.sys, sleep: async () => void (working = 0) },
    latest: staticLatest({ codex: "0.168.0", "claude-code": "2.1.321" }),
    name: () => "hel",
    detect: async (h) => (h === "codex" ? f.detect() : { how: "app", version: "2.1.284" }),
    loggedIn: f.loggedIn,
    busy: () => working,
    hold: (h, on) => holds.push(`${h}:${on}`),
    autoEveryMs: 0,
    exists: () => false,
  });
  stops.push(() => ag.stop());
  const list: DeviceHarness[] = [
    { harness: "codex", installed: true, loggedIn: true, canBePartner: true, version: "0.167.0", how: "npm" },
    { harness: "claude-code", installed: true, loggedIn: true, canBePartner: true, version: "2.1.284", how: "app" },
  ];
  const [cx, cc] = ag.view("local", list);
  expect(cx).toMatchObject({ latest: "0.168.0", available: true, standing: "verified", latestVerified: false });
  expect(cc).toMatchObject({ standing: "older" });
  expect(cc!.available).toBeFalsy(); // an app's copy: never offered
  expect(cc!.latest).toBeUndefined();

  expect(await ag.start("local", "codex", { by: "user" })).toEqual({ ok: true });
  // The devices frame reads each copy again after an update: the view is judged against it.
  const now = () => [{ ...list[0]!, version: f.m.version! }, list[1]!];
  for (let i = 0; i < 50 && ag.view("local", now())[0]!.update?.phase !== "done"; i++) await Bun.sleep(5);
  expect(ag.view("local", now())[0]!.update).toMatchObject({ phase: "done", from: "0.167.0", to: "0.168.0", by: "user" });
  // A stale list (still the old version) doesn't call it done.
  expect(ag.view("local", list)[0]!.update).toBeUndefined();
  expect(holds).toEqual(["codex:true", "codex:false"]);
  const steps = log.read({ stream: "devices", kinds: ["agent_update"] }).map((e) => (e.body as any).phase);
  expect(steps).toEqual(["waiting", "updating", "checking", "done"]);
  expect(await ag.start("local", "claude-code")).toMatchObject({ ok: false, reason: "how" });
});

test("night: in quiet hours, nothing working, only to a verified version; outside the range it waits", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const log = openLog({ path: t.dir + "/log.db", persona: "p" });
  stops.push(() => log.close());
  const f = fakeMachine({ how: "npm", version: "0.166.0" });
  const top = HARNESS_FACTS.codex.verified.to;
  let latest = "0.199.0";
  const quiet = { start: "00:00", end: "23:59", tz: "UTC" };
  const harnesses = (): DeviceHarness[] => [{ harness: "codex", installed: true, loggedIn: true, canBePartner: true, version: f.m.version!, how: "npm" }];
  const ag = createAgentUpdates({
    log,
    sys: f.sys,
    latest: { get: () => latest, checkedAt: () => undefined, refresh: async () => {}, onChange: () => () => {} },
    name: () => "hel",
    detect: f.detect,
    loggedIn: f.loggedIn,
    busy: () => 0,
    settings: () => ({ autoUpdate: true, quiet } as any),
    devices: async () => [{ id: "local", name: "hel", awake: true, harnesses: harnesses() }],
    autoEveryMs: 0,
    exists: () => false,
  });
  stops.push(() => ag.stop());
  await ag.nightly();
  for (let i = 0; i < 50 && f.m.version !== top; i++) await Bun.sleep(5);
  expect(f.m.version).toBe(top); // the newest verified, not 0.199.0
  expect(ag.view("local", harnesses())[0]!.update).toMatchObject({ phase: "done", by: "night", to: top });
  const before = f.runs.length;
  await ag.nightly(); // on the top verified version now: 0.199.0 waits for a tap
  await Bun.sleep(20);
  expect(f.runs.length).toBe(before);
  latest = top;
});

test("a worker: the op goes down its socket, the worker updates itself and reports each step and its agents after", async () => {
  const f = fakeMachine({ how: "npm", version: "0.167.0" });
  const sent: any[] = [];
  const w = createWorkerAgentUpdater({ sys: f.sys, detect: f.detect, loggedIn: f.loggedIn, probe: async () => [{ id: "codex", installed: true, loggedIn: true, version: f.m.version, how: "npm" }] });
  await w.handle({ id: 7, args: { harness: "codex", to: "0.168.0", latest: "0.168.0" } }, (x) => sent.push(x), { turningOn: () => 0 });
  expect(sent[0]).toEqual({ t: "res", id: 7, ok: true, result: { ok: true } });
  expect(sent.filter((x) => x.t === "agent_update").map((x) => x.phase)).toEqual(["waiting", "updating", "checking", "done"]);
  expect(sent.at(-1)).toEqual({ t: "agents", harnesses: [{ id: "codex", installed: true, loggedIn: true, version: "0.168.0", how: "npm" }] });
  const refused: any[] = [];
  const app = fakeMachine({ how: "app", version: "0.167.0" });
  const w2 = createWorkerAgentUpdater({ sys: app.sys, detect: app.detect, loggedIn: app.loggedIn, probe: async () => [] });
  await w2.handle({ id: 8, args: { harness: "codex", to: "0.168.0" } }, (x) => refused.push(x), { turningOn: () => 0 });
  expect(refused).toEqual([{ t: "res", id: 8, ok: true, result: { ok: false, reason: "how", detail: "app" } }]);
});

// The author's MacBook: pi updated to 1.5.1, the home still thought 1.5.0 (the worker's hello was
// probed once, at its start) and asked again; the card said 没更新成 · 没有更新的版本.
test("a stale view asking for a version already there: never a failure, and the home hears the truth", async () => {
  const f = fakeMachine({ how: "npm", version: "1.5.1" });
  const sent: any[] = [];
  const w = createWorkerAgentUpdater({ sys: f.sys, detect: f.detect, loggedIn: f.loggedIn, probe: async () => [{ id: "pi", installed: true, loggedIn: true, version: "1.5.1", how: "npm" }] });
  await w.handle({ id: 9, args: { harness: "pi", to: "1.5.1", latest: "1.5.1" } }, (x) => sent.push(x), { turningOn: () => 0 });
  expect(sent).toEqual([
    { t: "res", id: 9, ok: true, result: { ok: false, reason: "no_update", detail: "already on 1.5.1" } },
    { t: "agents", harnesses: [{ id: "pi", installed: true, loggedIn: true, version: "1.5.1", how: "npm" }] },
  ]);
  expect(f.runs.length).toBe(0);
  // On this machine: done with nothing run.
  expect(await updateAgent(f.sys, { harness: "pi", to: "1.5.1", detect: f.detect, loggedIn: f.loggedIn })).toEqual({ ok: true, from: "1.5.1", to: "1.5.1", already: true });
});

test("judgeAgent: an outcome is judged against the version installed now", () => {
  const failed = { phase: "failed" as const, from: "1.5.0", to: "1.5.1", reason: "unchanged" as const };
  expect(judgeAgent(failed, "1.5.0")).toBe("stands"); // still on from: it didn't update
  expect(judgeAgent(failed, "1.5.1")).toBe("done"); // reached the target since
  expect(judgeAgent(failed, "1.5.2")).toBe("superseded"); // moved on
  expect(judgeAgent({ phase: "failed", from: "1.5.1", to: "1.5.1", reason: "no_update" }, "1.5.1")).toBe("done");
  expect(judgeAgent({ phase: "failed", from: "1.5.0", to: "1.5.1", reason: "no_update" }, "1.5.0")).toBe("superseded"); // never a failure
  expect(judgeAgent({ phase: "done", from: "1.5.0", to: "1.5.1" }, "1.5.1")).toBe("done");
  expect(judgeAgent({ phase: "done", from: "1.5.0", to: "1.5.1" }, "1.5.0")).toBe("superseded");
  expect(judgeAgent({ phase: "updating", from: "1.5.0", to: "1.5.1" }, "1.5.0")).toBe("stands");
});

test("the card drops a failure the copy has moved past (an older worker's frame, a hand update)", async () => {
  const t = tempDir();
  stops.push(t.cleanup);
  const log = openLog({ path: t.dir + "/log.db", persona: "p" });
  stops.push(() => log.close());
  const ag = createAgentUpdates({
    log,
    sys: { run: async () => ({ code: 0, out: "" }), sleep: async () => {}, now: () => Date.now() },
    latest: staticLatest({ pi: "1.5.1" }),
    name: () => "hel",
    detect: async () => undefined,
    loggedIn: async () => true,
    busy: () => 0,
    autoEveryMs: 0,
  });
  stops.push(() => ag.stop());
  // A worker on an older build still says "failed · no_update".
  ag.fromWorker("w1", "MacBook", { t: "agent_update", harness: "pi", phase: "failed", from: "1.5.1", to: "1.5.1", reason: "no_update" });
  const pi = (v: string): DeviceHarness[] => [{ harness: "pi", installed: true, loggedIn: true, canBePartner: true, version: v, how: "npm" }];
  expect(ag.view("w1", pi("1.5.1"))[0]!.update).toMatchObject({ phase: "done", to: "1.5.1" });
  ag.fromWorker("w1", "MacBook", { t: "agent_update", harness: "pi", phase: "failed", from: "1.5.0", to: "1.5.1", reason: "unchanged" });
  expect(ag.view("w1", pi("1.5.0"))[0]!.update).toMatchObject({ phase: "failed", reason: "unchanged" });
  expect(ag.view("w1", pi("1.5.1"))[0]!.update).toMatchObject({ phase: "done" });
  expect(ag.view("w1", pi("1.5.1"))[0]!.available).toBe(false);
});

// ---------- over the real client socket ----------

const probes = (list: DeviceHarness[]): Partial<DeviceProbes> => ({
  cua: async () => ({ missing: "no" }),
  native: async () => undefined,
  harnesses: async () => list,
  kind: async () => "server",
});

test("over the socket: the devices frame carries each agent's version and latest; agent_update runs it", async () => {
  const t = tempDir();
  const f = fakeMachine({ how: "npm", version: "0.167.0", prefix: "/usr" });
  const reg = fakeRegistry({ [NPM_CODEX]: '{"version":"0.168.0"}' });
  const list = (): DeviceHarness[] => [{ harness: "codex", installed: true, loggedIn: true, canBePartner: true, version: f.m.version!, how: "npm" }];
  let core: Core | undefined;
  core = startCore({
    dataDir: t.dir,
    port: 0,
    batchMs: 5,
    deviceProbes: { ...probes([]), harnesses: async () => list() },
    update: { autoEveryMs: 0 },
    agents: { fetch: reg.fetch as any, sys: { ...(f.sys as any), fetch: reg.fetch }, detect: async () => f.detect(), loggedIn: f.loggedIn, exists: () => false, autoEveryMs: 0 },
  });
  stops.push(t.cleanup, () => core!.stop());
  core.setPartner({ onTrigger: () => {} });
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  const until = async (pred: (f: ServerFrame) => boolean) => {
    for (let i = 0; i < 400; i++) {
      const hit = [...frames].reverse().find(pred);
      if (hit) return hit;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((x) => x.t)}`);
  };
  await until((x) => x.t === "on_hand");
  ws.send(JSON.stringify({ t: "agent_update", device: "local", harness: "", check: true }));
  await until((x) => x.t === "agent_update_result");
  core.devicesView.refresh();
  ws.send(JSON.stringify({ t: "devices" }));
  const codexOf = (x: ServerFrame) => (x.t === "devices" ? x.devices.find((d) => d.home)?.harnesses.find((h) => h.harness === "codex") : undefined);
  await until((x) => codexOf(x)?.latest === "0.168.0");
  expect(codexOf(frames.findLast((x) => codexOf(x)?.latest === "0.168.0")!)).toMatchObject({ version: "0.167.0", how: "npm", available: true, standing: "verified", latestVerified: false });
  ws.send(JSON.stringify({ t: "agent_update", device: "local", harness: "codex" }));
  expect(await until((x) => x.t === "agent_update_result" && x.harness === "codex")).toMatchObject({ ok: true, harness: "codex" });
  await until((x) => codexOf(x)?.update?.phase === "done");
  expect(f.runs.at(-1)).toEqual(["npm", "--prefix", "/usr", "install", "-g", "@openai/codex@0.168.0"]);
  expect(core.log.read({ stream: "devices", kinds: ["agent_update"] }).map((e) => (e.body as any).phase)).toEqual(["waiting", "updating", "checking", "done"]);
});
