// D416: Antigravity (Google's agy CLI over OAR 0.124) as a work agent, with fakes only: never the
// network, never a real agy, never Google's installer. Found as OAR finds it, said plainly when
// it is too old, broken or only the desktop app, installed the way its own installer does,
// updated with its own updater, signed in with its own Google sign-in carried to the person,
// never chosen over the others and never given web pages.
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HARNESSES, deviceHarness, type DeviceHarness } from "@ducter/protocol";
import { ANTIGRAVITY, HARNESS_FACTS, agyPlatform, versionStanding } from "@ducter/protocol/src/harness-facts.ts";
import { agyPaths, agyVersion, agentHow, probeHarnesses } from "../src/harness-probe.ts";
import { createAgentSetup, parseLogin, type AgentSetupSys, type LoginProc } from "../src/agent-setup.ts";
import { latestUrl, updatePlan } from "../src/agents.ts";
import { fwCandidates } from "../src/candidates.ts";
import { agentSignature } from "../src/agent-path.ts";

const HOME = "/home/w";
const OFFICIAL = join(HOME, ".local", "bin", "agy");

/** A probe rig: which copies of agy answer what. */
function probe(o: { onPath?: string; official?: boolean; versions?: Record<string, string | null>; models?: { code: number; out: string }; app?: boolean; dangling?: boolean; token?: boolean; env?: Record<string, string>; looked?: string[] }) {
  const runs: string[][] = [];
  return probeHarnesses({
    exec: async (argv) => {
      runs.push(argv);
      if (argv[1] === "--version") {
        const v = o.versions?.[argv[0]!];
        return v === null || v === undefined ? { code: 1, out: "" } : { code: 0, out: `${v}\n` };
      }
      if (argv[1] === "models") return o.models ?? { code: 0, out: "gemini-3.8-flash\n" };
      return { code: 1, out: "" };
    },
    which: (c) => (c === "agy" ? (o.onPath ?? null) : null),
    env: { HOME, ...(o.env ?? {}) },
    home: HOME,
    dataDir: "/home/w/.ducter",
    read: () => undefined,
    only: ["antigravity"],
    exists: (p) => (o.looked?.push(p), false) || (p === OFFICIAL && !!o.official) || (p === "/Applications/Antigravity.app" && !!o.app) || (p.endsWith("antigravity-oauth-token") && !!o.token),
    dangling: () => !!o.dangling,
    realpath: (p) => p,
  }).then((hs) => ({ h: hs[0]!, runs }));
}

test("the registry: a task agent that is never the partner, picked not chosen, no web pages, OAR's floor", () => {
  expect(HARNESSES.antigravity).toMatchObject({ name: "Antigravity", command: "agy", partner: false, task: true, steer: true, images: true, mcp: "stdio-bridge", pickOnly: true, directOnly: true, noWebTasks: true });
  expect(HARNESS_FACTS.antigravity.verified.from).toBe("1.5.0");
  expect(ANTIGRAVITY.minVersion).toBe("1.5.0");
  expect(HARNESS_FACTS.antigravity.effort?.value.levels).toEqual(["low", "medium", "high"]);
  expect(versionStanding("antigravity", "1.5.11")).toBe("verified");
  expect(versionStanding("antigravity", "1.5.13")).toBe("newer");
  expect(versionStanding("antigravity", "1.4.9")).toBe("older");
  expect(agyVersion("1.5.13\n")).toBe("1.5.13");
  // OAR refuses prereleases and anything but the bare line (the retired agy_acp_server's stamp too).
  expect(agyVersion("1.5.13-rc.1")).toBeUndefined();
  expect(agyVersion("agy_acp_server 1.4.5 (build 77)")).toBeUndefined();
  // A device that has it signed in still can't make it the partner.
  expect(deviceHarness({ harness: "antigravity", installed: true, loggedIn: true }).canBePartner).toBe(false);
});

test("found where OAR looks: the override alone, else PATH, else the official ~/.local/bin/agy", () => {
  expect(agyPaths({ which: () => "/usr/local/bin/agy", env: { OAR_ANTIGRAVITY_BIN: "/opt/agy" }, home: HOME, exists: () => true })).toEqual(["/opt/agy"]);
  expect(agyPaths({ which: () => "/usr/local/bin/agy", home: HOME, exists: (p) => p === OFFICIAL })).toEqual(["/usr/local/bin/agy", OFFICIAL]);
  // Off PATH (a launchd or systemd service's PATH): the official place still counts.
  expect(agyPaths({ which: () => null, home: HOME, exists: (p) => p === OFFICIAL })).toEqual([OFFICIAL]);
  expect(agyPaths({ which: () => null, home: HOME, exists: () => false })).toEqual([]);
});

test("probe: installed at or above 1.5.0 and signed in when `agy models` answers", async () => {
  const { h, runs } = await probe({ official: true, versions: { [OFFICIAL]: "1.5.13" } });
  expect(h).toMatchObject({ harness: "antigravity", installed: true, loggedIn: true, version: "1.5.13", how: "installer", canBePartner: false });
  expect(runs.some((r) => r[1] === "models")).toBe(true);
});

test("probe: signed out when agy asks for a sign-in; no network is never read from its token file (D594)", async () => {
  const looked: string[] = [];
  const out = await probe({ official: true, versions: { [OFFICIAL]: "1.5.13" }, models: { code: 1, out: "Please sign in to view available models\n" }, token: true });
  expect(out.h).toMatchObject({ installed: true, loggedIn: false });
  const offline = await probe({ official: true, versions: { [OFFICIAL]: "1.5.13" }, models: { code: 1, out: "getaddrinfo ENOTFOUND" }, token: true, looked });
  expect(offline.h.loggedIn).toBe(false);
  expect(looked.filter((p) => p.includes(".gemini"))).toEqual([]);
  const none = await probe({ official: true, versions: { [OFFICIAL]: "1.5.13" }, models: { code: 1, out: "getaddrinfo ENOTFOUND" } });
  expect(none.h.loggedIn).toBe(false);
});

test("probe: too old says the version and the floor; an old PATH copy doesn't hide a good official one", async () => {
  const old = await probe({ onPath: "/usr/local/bin/agy", versions: { "/usr/local/bin/agy": "1.4.9" } });
  expect(old.h).toMatchObject({ installed: false, loggedIn: false, version: "1.4.9", trouble: { kind: "too_old", need: "1.5.0" } });
  const both = await probe({ onPath: "/usr/local/bin/agy", official: true, versions: { "/usr/local/bin/agy": "1.4.9", [OFFICIAL]: "1.5.12" } });
  expect(both.h).toMatchObject({ installed: true, loggedIn: true });
  expect(both.h.trouble).toBeUndefined();
});

test("probe: a copy that doesn't answer is broken; only the desktop app (or its dead link) is app_only", async () => {
  expect((await probe({ official: true, versions: { [OFFICIAL]: null } })).h).toMatchObject({ installed: false, trouble: { kind: "broken" } });
  expect((await probe({ app: true })).h).toMatchObject({ installed: false, trouble: { kind: "app_only", app: "Antigravity" } });
  // The author's Mac (2026-11-20): ~/.antigravity/antigravity/bin/agy points into an app that moved on.
  expect((await probe({ dangling: true })).h).toMatchObject({ installed: false, trouble: { kind: "app_only" } });
  const nothing = (await probe({})).h;
  expect(nothing).toMatchObject({ installed: false, loggedIn: false });
  expect(nothing.trouble).toBeUndefined();
});

test("updates: its own installer's copy, read from Google's manifest for this platform, `agy update` on that same file", () => {
  expect(agentHow("antigravity", OFFICIAL).how).toBe("installer");
  expect(agyPlatform("darwin", "arm64")).toBe("darwin_arm64");
  expect(agyPlatform("linux", "x64")).toBe("linux_amd64");
  expect(agyPlatform("linux", "arm64", true)).toBe("linux_arm64_musl");
  expect(agyPlatform("win32", "x64")).toBeUndefined();
  expect(latestUrl("antigravity", "installer")).toMatch(/\/manifests\/(darwin|linux)_(arm64|amd64)\.json$/);
  // No pinned install: always its own updater, to its newest.
  expect(updatePlan("antigravity", { version: "1.5.11", how: "installer", path: OFFICIAL }, "1.5.13", { latest: "1.5.13" })).toEqual({ argv: [OFFICIAL, "update"], pinned: false });
});

test("the 5-second fingerprint moves when agy lands at its official place or the app comes, never on its sign-in (D594)", () => {
  const base = { dataDir: "/home/w/.ducter", home: HOME, env: { HOME }, which: () => null };
  const seen: string[] = [];
  const sig = (m: Record<string, number>) => agentSignature({ ...base, mtime: (p) => (seen.push(p), m[p]) });
  const a = sig({});
  expect(sig({ [OFFICIAL]: 1 })).not.toBe(a);
  expect(sig({ [join(HOME, ".gemini", "antigravity-cli", "antigravity-oauth-token")]: 2 })).toBe(a);
  expect(seen.filter((p) => p.includes(".gemini"))).toEqual([]);
  expect(sig({ "/Applications/Antigravity.app": 3 })).not.toBe(a);
});

// ---------- install and sign-in ----------

function fakeLogin() {
  const fns: ((t: string) => void)[] = [];
  const written: string[] = [];
  let end!: (c: number) => void;
  const proc: LoginProc = { onOutput: (fn) => void fns.push(fn), write: (t) => void written.push(t), kill: () => end(-1), exited: new Promise((r) => (end = r)) };
  return { proc, say: (t: string) => fns.forEach((f) => f(t)), exit: (c: number) => end(c), written };
}

/** A rig with a real scratch home (agy really lands in its ~/.local/bin) and a fake network and agy. */
function rig(o: { versions?: Record<string, string | null>; update?: (bin: string) => string | null; manifest?: string; payload?: Uint8Array; sha?: string; platform?: string; onPath?: string } = {}) {
  const root = mkdtempSync(join(tmpdir(), "ducter-agy-"));
  const home = join(root, "home");
  const dataDir = join(root, "data");
  mkdirSync(home, { recursive: true });
  const target = join(home, ".local", "bin", "agy");
  const payload = o.payload ?? new TextEncoder().encode("#!/bin/sh\necho agy\n");
  const sha = o.sha ?? createHash("sha512").update(payload).digest("hex");
  const url = "https://storage.googleapis.com/antigravity-public/antigravity-cli/1.5.13-1/linux-x64/agy";
  const manifest = o.manifest ?? JSON.stringify({ version: "1.5.13", url, sha512: sha });
  const versions = { ...(o.versions ?? {}) };
  const downloads: string[] = [];
  const runs: string[][] = [];
  const spawned: { argv: string[]; env: Record<string, string>; login: ReturnType<typeof fakeLogin> }[] = [];
  const sys: AgentSetupSys = {
    platform: o.platform ?? "linux",
    arch: "x64",
    home,
    musl: false,
    download: async (u, on) => {
      downloads.push(u);
      if (u.includes("/manifests/")) return new TextEncoder().encode(manifest);
      on?.(50);
      on?.(100);
      return payload;
    },
    run: async (argv) => {
      runs.push(argv);
      if (argv[1] === "--version") {
        const v = existsSync(argv[0]!) && readFileSync(argv[0]!, "utf8").includes("echo agy") ? "1.5.13" : versions[argv[0]!];
        return v ? { code: 0, out: `${v}\n` } : { code: 1, out: "" };
      }
      if (argv[1] === "update") {
        const v = o.update?.(argv[0]!) ?? null;
        if (v) versions[argv[0]!] = v;
        return v ? { code: 0, out: `updated to ${v}` } : { code: 1, out: "agy update: getaddrinfo ENOTFOUND" };
      }
      return { code: 0, out: "" };
    },
    spawn: (argv, env) => {
      const login = fakeLogin();
      spawned.push({ argv, env, login });
      return login.proc;
    },
    which: (c) => (c === "agy" ? (o.onPath ?? null) : null),
    env: () => ({ PATH: "/usr/bin", HOME: home }),
    chmod: () => {},
  };
  let probes = 0;
  const s = createAgentSetup({ dataDir, sys, probe: async () => void probes++, changed: () => {}, setTimer: () => 0, clearTimer: () => {} });
  return { s, home, dataDir, target, downloads, runs, spawned, url, probes: () => probes, done: () => rmSync(root, { recursive: true, force: true }) };
}

const settle = async (s: { busy(): boolean }) => {
  for (let i = 0; i < 200 && s.busy(); i++) await Bun.sleep(2);
};

test("install: Google's manifest for this platform, its build, sha512 checked, agy at ~/.local/bin/agy; no shell profile touched", async () => {
  const r = rig();
  try {
    expect(r.s.state("antigravity").installable).toBe(true);
    r.s.install(["antigravity"]);
    await settle(r.s);
    expect(r.downloads[0]).toBe(ANTIGRAVITY.manifest.replace("{platform}", "linux_amd64"));
    expect(r.downloads[1]).toBe(r.url);
    expect(readFileSync(r.target, "utf8")).toContain("echo agy");
    expect(r.s.state("antigravity").setup).toBeUndefined();
    // Nothing but the binary: no .bashrc / .zshrc, no staging left beside it.
    expect(existsSync(join(r.home, ".bashrc")) || existsSync(join(r.home, ".zshrc"))).toBe(false);
    expect(readdirSync(join(r.home, ".local", "bin"))).toEqual(["agy"]);
    // Never Google's install.sh or `agy install` (its shell-profile step).
    expect(r.runs.some((a) => a.join(" ").includes("install.sh") || a[1] === "install")).toBe(false);
    expect(r.probes()).toBe(1);
  } finally {
    r.done();
  }
});

test("install: a download that doesn't match its sha512 is never put in place", async () => {
  const r = rig({ sha: "00".repeat(64) });
  try {
    r.s.install(["antigravity"]);
    await settle(r.s);
    expect(existsSync(r.target)).toBe(false);
    expect(r.s.state("antigravity").setup).toMatchObject({ phase: "failed", reason: "failed", detail: "the download didn't match its checksum" });
  } finally {
    r.done();
  }
});

test("install: no network says so; a manifest that names nothing usable fails before any download", async () => {
  const off = rig();
  (off as any).s = createAgentSetup({ dataDir: off.dataDir, sys: { platform: "linux", arch: "x64", home: off.home, download: async () => Promise.reject(new Error("fetch failed")), run: async () => ({ code: 1, out: "" }), spawn: () => fakeLogin().proc, which: () => null, env: () => ({}) }, probe: async () => {}, changed: () => {} });
  try {
    off.s.install(["antigravity"]);
    await settle(off.s);
    expect(off.s.state("antigravity").setup).toMatchObject({ phase: "failed", reason: "network" });
  } finally {
    off.done();
  }
  const bad = rig({ manifest: JSON.stringify({ version: "1.5.13", url: "http://plain/agy", sha512: "x" }) });
  try {
    bad.s.install(["antigravity"]);
    await settle(bad.s);
    expect(bad.downloads).toHaveLength(1);
    expect(bad.s.state("antigravity").setup?.phase).toBe("failed");
  } finally {
    bad.done();
  }
});

test("install: a copy that works is left alone; a broken one at the official place is replaced", async () => {
  const fine = rig({ onPath: "/usr/local/bin/agy", versions: { "/usr/local/bin/agy": "1.5.12" } });
  try {
    fine.s.install(["antigravity"]);
    await settle(fine.s);
    expect(fine.downloads).toHaveLength(0);
    expect(fine.s.state("antigravity").setup).toBeUndefined();
  } finally {
    fine.done();
  }
  const broken = rig();
  try {
    mkdirSync(join(broken.home, ".local", "bin"), { recursive: true });
    writeFileSync(broken.target, "garbage");
    broken.s.install(["antigravity"]);
    await settle(broken.s);
    expect(readFileSync(broken.target, "utf8")).toContain("echo agy");
  } finally {
    broken.done();
  }
});

test("install on a too-old copy: its own `agy update`, read back; still old says so", async () => {
  const up = rig({ onPath: "/usr/local/bin/agy", versions: { "/usr/local/bin/agy": "1.4.9" }, update: () => "1.5.13" });
  try {
    up.s.install(["antigravity"]);
    await settle(up.s);
    expect(up.runs.some((a) => a[0] === "/usr/local/bin/agy" && a[1] === "update")).toBe(true);
    expect(up.downloads).toHaveLength(0);
    expect(up.s.state("antigravity").setup).toBeUndefined();
  } finally {
    up.done();
  }
  const stuck = rig({ onPath: "/usr/local/bin/agy", versions: { "/usr/local/bin/agy": "1.4.9" } });
  try {
    stuck.s.install(["antigravity"]);
    await settle(stuck.s);
    expect(stuck.s.state("antigravity").setup).toMatchObject({ phase: "failed", reason: "network" });
  } finally {
    stuck.done();
  }
});

test("sign-in: `agy acp --login`, the Google link carried to the person, the pasted code to its input; no browser opens on a server", async () => {
  const r = rig({ onPath: "/usr/local/bin/agy", versions: { "/usr/local/bin/agy": "1.5.13" } });
  try {
    r.s.login("antigravity");
    // D523: the copy that answers its --version is the one signed in (pickAgy), so it starts once that is known.
    for (let i = 0; i < 100 && !r.spawned.length; i++) await Bun.sleep(2);
    const sp = r.spawned[0]!;
    expect(sp.argv).toEqual(["/usr/local/bin/agy", "acp", "--login"]);
    // On Linux a do-nothing xdg-open goes first on its PATH (agy ignores BROWSER).
    const first = sp.env.PATH!.split(":")[0]!;
    expect(first).toBe(join(r.dataDir, "tools", "no-browser"));
    expect(readFileSync(join(first, "xdg-open"), "utf8")).toBe("#!/bin/sh\nexit 0\n");
    sp.login.say("Open this link in a browser to log in with Google:\nhttps://accounts.google.com/o/oauth2/v2/auth?client_id=x&scope=y\nThen paste the authorization code, or the full URL of the page you land on, and press Enter:\n");
    expect(r.s.state("antigravity").login).toMatchObject({ state: "waiting", url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=x&scope=y", paste: true });
    r.s.code("antigravity", "  4/0Ab-code  ");
    expect(sp.login.written).toEqual(["4/0Ab-code\n"]);
    expect(r.s.state("antigravity").login?.state).toBe("checking");
    sp.login.exit(0);
    await Bun.sleep(5);
    expect(r.s.state("antigravity").login?.state).toBe("done");
    expect(r.probes()).toBe(1);
  } finally {
    r.done();
  }
  expect(parseLogin("antigravity", "x https://example.com/a then https://accounts.google.com/o/oauth2/auth?a=1.").url).toBe("https://accounts.google.com/o/oauth2/auth?a=1");
});

test("D523 sign-in on a Mac: agy's own `open` is a no-op too (it opened a browser on whichever Mac ran it)", async () => {
  const r = rig({ onPath: "/Users/w/.local/bin/agy", platform: "darwin", versions: { "/Users/w/.local/bin/agy": "1.5.13" } });
  try {
    r.s.login("antigravity");
    for (let i = 0; i < 100 && !r.spawned.length; i++) await Bun.sleep(2);
    const first = r.spawned[0]!.env.PATH!.split(":")[0]!;
    expect(first).toBe(join(r.dataDir, "tools", "no-browser"));
    expect(readFileSync(join(first, "open"), "utf8")).toBe("#!/bin/sh\nexit 0\n");
  } finally {
    r.done();
  }
});

// ---------- who does the work ----------

const dh = (harness: string, o: Partial<DeviceHarness> = {}): DeviceHarness => ({ harness, installed: true, loggedIn: true, canBePartner: harness !== "antigravity", billing: "plan", ...o });
const settings = { brain: { harness: "claude-code" }, taskAccounts: {} } as any;

test("picked, never chosen: after every other agent that can take it, first only when it is the one left", () => {
  const all = fwCandidates({ work: { kind: "code" } as any, harnesses: [dh("antigravity", { models: [{ id: "gemini-3.8-flash", label: "Gemini 3.8 Flash" }] }), dh("codex"), dh("deepseek-harness", { billing: "usage" })], settings, rules: [], every: true });
  expect(all.at(-1)?.harness).toBe("antigravity");
  expect(all[0]?.harness).toBe("codex");
  const alone = fwCandidates({ work: { kind: "code" } as any, harnesses: [dh("antigravity"), dh("codex", { loggedIn: false })], settings, rules: [] });
  expect(alone[0]).toMatchObject({ harness: "antigravity" });
  expect(alone[0]?.blocked).toBeUndefined();
});

test("never web pages: a browsing task greys it as no_web", () => {
  const c = fwCandidates({ work: { kind: "errand" } as any, harnesses: [dh("antigravity"), dh("claude-code")], needs: { browse: true }, place: { kind: "browser", device: "local", profile: "default" } as any, settings, rules: [], every: true });
  expect(c.find((x) => x.harness === "antigravity")?.blocked).toBe("no_web");
});

test("said: its name, its command and 反重力 name it", async () => {
  const { readSaid } = await import("../src/said.ts");
  for (const s of ["写代码的事以后都用 Antigravity。", "以后写代码都用 agy。", "写代码的事以后都用反重力。"]) expect(readSaid(s).map((p) => p.harness)).toContain("antigravity");
});

test("D416 sign-out: its own (the runner's OAR logout), the row says it's running, then reads signed out; refused says so", async () => {
  const mk = (logout?: AgentSetupSys["logout"]) => {
    let probes = 0;
    const sys: AgentSetupSys = { platform: "linux", arch: "x64", home: "/h", download: async () => new Uint8Array(), run: async () => ({ code: 0, out: "" }), spawn: () => fakeLogin().proc, which: () => null, env: () => ({}), ...(logout ? { logout } : {}) };
    const s = createAgentSetup({ dataDir: "/nonexistent-ducter", sys, probe: async () => void probes++, changed: () => {}, setTimer: () => 0, clearTimer: () => {} });
    return { s, probes: () => probes };
  };
  let release!: (v: { ok: boolean }) => void;
  const ok = mk(() => new Promise((r) => (release = r)));
  ok.s.logout("antigravity");
  expect(ok.s.state("antigravity").login).toEqual({ state: "signing_out" });
  // Shown on a row that still reads signed in.
  expect(ok.s.decorate([{ harness: "antigravity", installed: true, loggedIn: true }])[0]!.login?.state).toBe("signing_out");
  release({ ok: true });
  await Bun.sleep(5);
  expect(ok.s.state("antigravity").login).toBeUndefined();
  expect(ok.probes()).toBe(1);
  const no = mk(async () => ({ ok: false, detail: "still_logged_in" }));
  no.s.logout("antigravity");
  await Bun.sleep(5);
  expect(no.s.state("antigravity").login).toEqual({ state: "failed", reason: "signout_failed" });
  // An agent with no sign-out Ducter can run (Codex here) is never signed out from Ducter.
  const codex = mk(async () => ({ ok: true }));
  codex.s.logout("codex");
  expect(codex.s.state("codex").login).toEqual({ state: "failed", reason: "signout_failed" });
});
