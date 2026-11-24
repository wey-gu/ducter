// D363: putting the agents on a computer (Ducter's node, then each agent's npm package at the
// verified version, one at a time) and carrying each one's own sign-in to the person. Fakes only:
// never the network, never npm, never a real sign-in.
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HARNESS_FACTS } from "@ducter/protocol/src/harness-facts.ts";
import { agentPin, createAgentSetup, LOGIN_WAIT_MS, NODE_RELEASE, parseLogin, type AgentSetupSys, type LoginProc } from "../src/agent-setup.ts";

function fakeLogin() {
  const fns: ((t: string) => void)[] = [];
  const written: string[] = [];
  let end!: (c: number) => void;
  const proc: LoginProc = { onOutput: (fn) => void fns.push(fn), write: (t) => void written.push(t), kill: () => end(-1), exited: new Promise((r) => (end = r)) };
  return { proc, say: (t: string) => fns.forEach((f) => f(t)), exit: (c: number) => end(c), written };
}

function rig(o: { nodeThere?: boolean; npm?: (argv: string[]) => { code: number; out: string }; download?: (url: string, on?: (p: number) => void) => Promise<Uint8Array>; platform?: string; app?: boolean; files?: Record<string, string>; checkKey?: AgentSetupSys["checkKey"] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ducter-agent-setup-"));
  const runs: { argv: string[]; env: Record<string, string> }[] = [];
  const spawned: { argv: string[]; login: ReturnType<typeof fakeLogin> }[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  let probes = 0;
  let changes = 0;
  const sys: AgentSetupSys = {
    platform: o.platform ?? "linux",
    arch: "x64",
    download: (o.download as AgentSetupSys["download"]) ?? (async () => new Uint8Array([1, 2, 3])),
    run: async (argv, { env }) => (runs.push({ argv, env }), argv[0] === "tar" ? { code: 1, out: "tar: not in tests" } : (o.npm?.(argv) ?? { code: 0, out: "added 1 package" })),
    spawn: (argv) => {
      const login = fakeLogin();
      spawned.push({ argv, login });
      return login.proc;
    },
    which: (c) => `/home/w/.ducter/tools/node/bin/${c}`,
    env: () => ({ PATH: "/usr/bin", HOME: "/home/w" }),
    exists: (p) => (!!o.nodeThere && /tools\/node\/bin\/(node|npm)$/.test(p)) || (!!o.app && p === "/Applications/DeepSeek Harness.app"),
    writeFile: () => {},
    // D371: DeepSeek Harness's sign-in files (its own credential file, Ducter's key file), and DeepSeek's key check.
    read: (p) => o.files?.[p],
    dshApps: () => ["/Applications/DeepSeek Harness.app", "/Users/w/Applications/DeepSeek Harness.app"],
    ...(o.checkKey ? { checkKey: o.checkKey } : {}),
  };
  const s = createAgentSetup({ dataDir: dir, sys, probe: async () => void probes++, changed: () => void changes++, setTimer: (fn, ms) => (timers.push({ fn, ms }), timers.length), clearTimer: () => {} });
  return { s, dir, runs, spawned, timers, probes: () => probes, changes: () => changes, done: () => rmSync(dir, { recursive: true, force: true }) };
}

const settle = async (s: { busy(): boolean }) => {
  for (let i = 0; i < 200 && s.busy(); i++) await Bun.sleep(2);
};

test("pins: each agent's npm package at the newest version Ducter verified", () => {
  expect(agentPin("codex")).toEqual({ pkg: "@openai/codex", version: HARNESS_FACTS.codex.verified.to });
  expect(agentPin("claude-code")).toEqual({ pkg: "@anthropic-ai/claude-code", version: HARNESS_FACTS["claude-code"].verified.to });
  expect(agentPin("pi")).toEqual({ pkg: "@earendil-works/pi-coding-agent", version: HARNESS_FACTS.pi.verified.to });
  // D371: DeepSeek Harness's command line too.
  expect(agentPin("deepseek-harness")).toEqual({ pkg: "@deepseek-ai/dsh", version: HARNESS_FACTS["deepseek-harness"].verified.to });
  for (const a of Object.values(NODE_RELEASE.assets)) expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
});

test("install: queued in order, one at a time, npm with Ducter's node as the prefix; nothing else touched", async () => {
  const r = rig({ nodeThere: true });
  r.s.install(["claude-code", "codex", "deepseek-harness", "nope"]);
  expect(r.s.state("codex").setup).toEqual({ phase: "queued" });
  expect(r.s.state("nope").setup).toBeUndefined();
  await settle(r.s);
  const npm = r.runs.filter((x) => x.argv.includes("install"));
  expect(npm.map((x) => x.argv.at(-1))).toEqual([`@anthropic-ai/claude-code@${HARNESS_FACTS["claude-code"].verified.to}`, `@openai/codex@${HARNESS_FACTS.codex.verified.to}`, `@deepseek-ai/dsh@${HARNESS_FACTS["deepseek-harness"].verified.to}`]);
  const prefix = join(r.dir, "tools", "node");
  expect(npm[0]!.argv).toEqual([join(prefix, "bin", "node"), join(prefix, "bin", "npm"), "install", "-g", "--prefix", prefix, expect.any(String)]);
  expect(npm[0]!.env.PATH.split(":")[0]).toBe(join(prefix, "bin"));
  expect(npm[0]!.env.npm_config_update_notifier).toBe("false");
  expect(r.probes()).toBe(3); // a probe after each, so they arrive one by one
  expect(r.s.state("codex").setup).toBeUndefined();
  r.done();
});

test("install fails into one reason: no network, no room, anything else; a checksum that doesn't match never installs", async () => {
  const net = rig({ nodeThere: true, npm: () => ({ code: 1, out: "npm error code ENOTFOUND\nnpm error network request to https://registry.npmjs.org failed" }) });
  net.s.install(["codex"]);
  await settle(net.s);
  expect(net.s.state("codex").setup).toMatchObject({ phase: "failed", reason: "network" });
  net.done();
  const full = rig({ nodeThere: true, npm: () => ({ code: 1, out: "npm error code ENOSPC\nnpm error syscall write" }) });
  full.s.install(["codex"]);
  await settle(full.s);
  expect(full.s.state("codex").setup).toMatchObject({ phase: "failed", reason: "space" });
  full.done();
  const bad = rig({ download: async () => new Uint8Array([9, 9, 9]) });
  bad.s.install(["codex"]);
  await settle(bad.s);
  expect(bad.s.state("codex").setup).toEqual({ phase: "failed", reason: "failed", detail: "the download didn't match its checksum" });
  expect(bad.runs).toEqual([]); // nothing unpacked, npm never ran
  bad.done();
  const off = rig({ download: async () => Promise.reject(new Error("fetch failed")) });
  off.s.install(["codex"]);
  await settle(off.s);
  expect(off.s.state("codex").setup).toMatchObject({ phase: "failed", reason: "network" });
  off.done();
  const odd = rig({ platform: "freebsd" });
  expect(odd.s.state("codex").installable).toBe(false);
  odd.done();
});

test("a good download is unpacked with tar (checksum first)", async () => {
  const bytes = new Uint8Array([4, 5, 6]);
  const want = createHash("sha256").update(bytes).digest("hex");
  const saved = NODE_RELEASE.assets["linux-x64"]!.sha256;
  NODE_RELEASE.assets["linux-x64"]!.sha256 = want;
  try {
    const r = rig({ download: async () => bytes });
    r.s.install(["pi"]);
    await settle(r.s);
    expect(r.runs[0]!.argv.slice(0, 2)).toEqual(["tar", "-xzf"]);
    expect(r.s.state("pi").setup).toMatchObject({ phase: "failed", reason: "failed" }); // the fake tar fails
    r.done();
  } finally {
    NODE_RELEASE.assets["linux-x64"]!.sha256 = saved;
  }
});

test("decorate: installable only where it isn't there; a finished setup leaves the row", () => {
  const r = rig({ nodeThere: true });
  const rows = r.s.decorate([
    { harness: "codex", installed: false, loggedIn: false },
    { harness: "claude-code", installed: true, loggedIn: false },
    { harness: "deepseek-harness", installed: false, loggedIn: false },
  ]);
  expect(rows.map((x) => [x.harness, x.installable ?? false])).toEqual([
    ["codex", true],
    ["claude-code", false],
    ["deepseek-harness", true],
  ]);
  r.done();
});

// ---------- D371: DeepSeek Harness's sign-in ----------

const CREDS = "/home/w/.dsh/.credentials.yaml";

test("DeepSeek Harness on a Mac with its app: the app opens there, a key can be pasted too, and a sign-in made in the app turns the row ready", async () => {
  const files: Record<string, string> = {};
  const r = rig({ platform: "darwin", app: true, files });
  const prior = process.env.DSH_HOME;
  process.env.DSH_HOME = "/home/w/.dsh";
  try {
    r.s.login("deepseek-harness");
    expect(r.spawned).toEqual([]); // no sign-in process: the app is the sign-in
    expect(r.runs.map((x) => x.argv)).toEqual([["open", "/Applications/DeepSeek Harness.app"]]);
    expect(r.s.state("deepseek-harness").login).toEqual({ state: "waiting", key: true, url: "https://platform.deepseek.com/api_keys", app: "DeepSeek Harness" });
    expect(r.s.busy()).toBe(true);
    // Nothing yet: it looks again in a few seconds.
    r.timers.at(-1)!.fn();
    expect(r.s.state("deepseek-harness").login?.state).toBe("waiting");
    // The person signs in to the DeepSeek account in the app (its credential file gains the grant).
    files[CREDS] = "version: 1\nrecords:\n  deepseek-account-platform/default:\n    kind: grant\n    payload:\n      version: 1\n      token: not-a-real-token\n";
    r.timers.at(-1)!.fn();
    expect(r.s.state("deepseek-harness").login).toEqual({ state: "done" });
    expect(r.probes()).toBe(1);
  } finally {
    if (prior === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = prior;
    r.done();
  }
});

test("DeepSeek Harness without its app (a server, npm's copy): paste a key; a wrong one asks again, a good one is kept in this computer's key file only", async () => {
  const checked: string[] = [];
  const r = rig({ checkKey: async (k) => (checked.push(k), k === "sk-good-test-only-placeholder" ? { ok: true } : { ok: false, reason: "wrong_key" }) });
  r.s.login("deepseek-harness");
  expect(r.runs).toEqual([]); // nothing opened on Linux
  expect(r.s.state("deepseek-harness").login).toEqual({ state: "waiting", key: true, url: "https://platform.deepseek.com/api_keys" });
  r.s.code("deepseek-harness", " sk-bad ");
  expect(r.s.state("deepseek-harness").login?.state).toBe("checking");
  await Bun.sleep(5);
  expect(r.s.state("deepseek-harness").login).toEqual({ state: "waiting", key: true, url: "https://platform.deepseek.com/api_keys", reason: "wrong_key" });
  r.s.code("deepseek-harness", "sk-good-test-only-placeholder");
  await Bun.sleep(5);
  expect(r.s.state("deepseek-harness").login).toEqual({ state: "done" });
  expect(checked).toEqual(["sk-bad", "sk-good-test-only-placeholder"]);
  const kept = await Bun.file(join(r.dir, "keys.env")).text();
  expect(kept).toContain("DEEPSEEK_API_KEY=sk-good-test-only-placeholder");
  expect(JSON.stringify(r.s.state("deepseek-harness"))).not.toContain("sk-"); // never in a frame back
  expect(r.probes()).toBe(1);
  r.done();
});

test("DeepSeek Harness's sign-in stops after its wait; cancel stops looking", () => {
  let t = 0;
  const r = rig();
  const s = createAgentSetup({ dataDir: r.dir, sys: { platform: "linux", arch: "x64", download: async () => new Uint8Array(), run: async () => ({ code: 0, out: "" }), spawn: () => fakeLogin().proc, which: () => null, env: () => ({}), read: () => undefined }, probe: async () => {}, changed: () => {}, now: () => t, setTimer: (fn, ms) => (r.timers.push({ fn, ms }), r.timers.length), clearTimer: () => {} });
  s.login("deepseek-harness");
  t = LOGIN_WAIT_MS + 1;
  r.timers.at(-1)!.fn();
  expect(s.state("deepseek-harness").login).toEqual({ state: "expired" });
  s.login("deepseek-harness");
  s.cancel("deepseek-harness");
  expect(s.state("deepseek-harness").login).toBeUndefined();
  r.done();
});

test("Codex's sign-in: its link and code to the person, then done and a probe", async () => {
  const r = rig({ nodeThere: true });
  r.s.login("codex");
  expect(r.spawned[0]!.argv).toEqual(["/home/w/.ducter/tools/node/bin/codex", "login", "--device-auth"]);
  expect(r.s.state("codex").login).toMatchObject({ state: "starting" });
  r.spawned[0]!.login.say("\x1b[1mFollow these steps to sign in with ChatGPT using device code authorization:\x1b[0m\n\n1. Open this link in your browser and sign in to your account\n   \x1b[94mhttps://auth.openai.com/codex/device\x1b[0m\n\n2. Enter this one-time code \x1b[90m(expires in 15 minutes)\x1b[0m\n   \x1b[94mWXYZ-12345\x1b[0m\n");
  expect(r.s.state("codex").login).toMatchObject({ state: "waiting", url: "https://auth.openai.com/codex/device", code: "WXYZ-12345" });
  expect(r.s.busy()).toBe(true);
  r.s.login("codex"); // a second tap doesn't start another
  expect(r.spawned.length).toBe(1);
  r.spawned[0]!.login.exit(0);
  await Bun.sleep(5);
  expect(r.s.state("codex").login).toEqual({ state: "done" });
  expect(r.probes()).toBe(1);
  // Once the probe says signed in, the row is just ready.
  expect(r.s.decorate([{ harness: "codex", installed: true, loggedIn: true }])[0]!.login).toEqual({ state: "done" });
  r.done();
});

test("Codex with device sign-in off in the account says to turn it on", async () => {
  const r = rig();
  r.s.login("codex");
  r.spawned[0]!.login.say("Error: device code login is not enabled for this account. Enable device code authorization in ChatGPT security settings.");
  r.spawned[0]!.login.exit(1);
  await Bun.sleep(5);
  expect(r.s.state("codex").login).toEqual({ state: "failed", reason: "device_off" });
  r.done();
});

test("Claude's sign-in: the link, the pasted code to its stdin, a wrong one asks again; it stops after its wait", async () => {
  const r = rig();
  r.s.login("claude-code");
  const l = r.spawned[0]!.login;
  l.say("Opening browser to sign in…\nIf the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true&client_id=x&state=y\nPaste code here if prompted > ");
  expect(r.s.state("claude-code").login).toMatchObject({ state: "waiting", url: "https://claude.com/cai/oauth/authorize?code=true&client_id=x&state=y", paste: true });
  r.s.code("claude-code", "  abc#def  ");
  expect(l.written).toEqual(["abc#def\n"]);
  expect(r.s.state("claude-code").login?.state).toBe("checking");
  l.say("Invalid code. Please make sure the full code was copied.\nPaste code here if prompted > ");
  expect(r.s.state("claude-code").login).toMatchObject({ state: "waiting", reason: "wrong_code", paste: true });
  const wait = r.timers.find((x) => x.ms === LOGIN_WAIT_MS)!;
  wait.fn();
  expect(r.s.state("claude-code").login).toEqual({ state: "expired" });
  r.done();
});

test("pi has no sign-in to carry: the row says what to run there", () => {
  const r = rig();
  r.s.login("pi");
  expect(r.spawned).toEqual([]);
  expect(r.s.state("pi").login).toEqual({ state: "terminal", command: "pi" });
  r.done();
});

test("parseLogin ignores other links", () => {
  expect(parseLogin("codex", "see https://example.com/docs first\nhttps://auth.openai.com/codex/device\ncode: ABCD-EFGH")).toEqual({ url: "https://auth.openai.com/codex/device", code: "ABCD-EFGH" });
  expect(parseLogin("claude-code", "nothing yet")).toEqual({});
});

test("the first one shows Node's download as its progress", async () => {
  const seen: (number | undefined)[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const r = rig({
    download: async (_url?: string, on?: (p: number) => void) => {
      on?.(50);
      await gate;
      return new Uint8Array([7]);
    },
  } as any);
  r.s.install(["codex"]);
  for (let i = 0; i < 200 && r.s.state("codex").setup?.pct === undefined; i++) await Bun.sleep(5);
  seen.push(r.s.state("codex").setup?.pct);
  release();
  await settle(r.s);
  expect(seen).toEqual([35]);
  r.done();
});
