// D205: Settings › 伙伴's one-tap Bridge connection for the persona, over a FAKE nmem
// (packages/partner/eval/fake-bridge-nmem.ts, in the shapes of nmem 0.10.118-rc2). Nothing here
// reaches Mem. What is checked: the capability check, the exact connect argv (the one personal
// place's id, never a guessed one), each registered refusal said as its own reason with nothing
// else tried, connected → the context that turns the partner's Bridge on, disconnect, old nmem.
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ServerFrame } from "@ducter/protocol";
import { BRIDGE_CONNECTION_FILE, createBridgeLink, errorCodeIn, nmemCall, parseNmemVersion, personalSpace, REFUSALS, versionConnects, type MemExec, type NmemCall } from "../src/bridge-link.ts";
import { connectLinkOk, installPlan, type MemSys } from "../src/mem-cli.ts";
import { startCore } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

// Each fake nmem call starts a bun process: under a full, loaded run a test can pass 5 s.
setDefaultTimeout(30_000);
const FAKE = resolve(import.meta.dir, "../../partner/eval/fake-bridge-nmem.ts");
let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function rig(env: Record<string, string> = {}) {
  const t = tempDir();
  stops.push(t.cleanup);
  const bin = join(t.dir, "nmem");
  writeFileSync(bin, `#!/bin/sh\nexec bun ${FAKE} "$@"\n`);
  chmodSync(bin, 0o755);
  const state = join(t.dir, "state.json");
  writeFileSync(state, JSON.stringify({ identities: {}, messages: [], seq: 0 }));
  const argvLog = join(t.dir, "argv.log");
  const fullEnv = { PATH: process.env.PATH ?? "", NMEM_CLI_PATH: bin, NMEM_FAKE_BRIDGE_STATE: state, NMEM_FAKE_ARGV_LOG: argvLog, ...env };
  const calls = (): string[][] => (existsSync(argvLog) ? readFileSync(argvLog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  const data = join(t.dir, "data");
  mkdirSync(data);
  let changes = 0;
  const link = createBridgeLink({ dataDir: data, identity: () => "ducter", home: () => "hel", run: nmemCall({ bin, env: fullEnv }), env: fullEnv });
  link.onChange(() => changes++);
  return { link, calls, data, bin, fullEnv, changes: () => changes, state };
}
const writes = (calls: string[][]) => calls.filter((c) => c.includes("connections") && (c.includes("connect") || c.includes("revoke")));

describe("pieces", () => {
  test("version: 0.10.118 and its pre-releases have `bridge connections`; 0.10.117 doesn't", () => {
    expect(parseNmemVersion("nmem 0.10.118-rc2")).toEqual([0, 10, 118]);
    expect(versionConnects(parseNmemVersion("nmem 0.10.118-rc2"))).toBe(true);
    expect(versionConnects([0, 10, 117])).toBe(false);
    expect(versionConnects([0, 11, 0])).toBe(true);
    expect(versionConnects(undefined)).toBe(false);
  });
  test("the one personal place, or none (none listed, or two: never a guess)", () => {
    const c = (kind: string, id: string) => ({ id, label: kind === "personal" ? "Only me" : id, kind, write_default: false });
    expect(personalSpace({ candidates: [c("team", "t"), c("personal", "p")] })).toEqual({ id: "p", label: "Only me" });
    expect(personalSpace({ candidates: [c("team", "t")] })).toBeUndefined();
    expect(personalSpace({ candidates: [c("personal", "p"), c("personal", "q")] })).toBeUndefined();
    expect(personalSpace({ state: "enable_needed" })).toBeUndefined();
  });
  test("a refusal's code, wherever the CLI printed it", () => {
    expect(errorCodeIn('{"error_code":"cloud_bridge_setup_role_lifetime_inactive","http_status":403}', "")).toBe("cloud_bridge_setup_role_lifetime_inactive");
    expect(errorCodeIn("", 'warn\n{"upstream":{"error_code":"cloud_bridge_setup_binding_conflict"}}')).toBe("cloud_bridge_setup_binding_conflict");
    expect(errorCodeIn("", "connection reset")).toBeUndefined();
  });
});

describe("the link over a fake nmem", () => {
  test("an older nmem: one line, update Mem on the home; nothing else is run", async () => {
    const r = rig({ NMEM_FAKE_VERSION: "0.10.116" });
    // The fake's copy isn't one Ducter can place (not the app's, pipx, uv or pip): the line alone.
    expect(await r.link.view()).toEqual({ state: "update_mem", identity: "ducter", home: "hel", version: "0.10.116", canRun: false, need: "other" });
    await r.link.connect();
    expect(writes(r.calls())).toEqual([]);
    // Only the version and the help probe: no setup, no list.
    expect(r.calls().every((c) => c.includes("--version") || c.join(" ").includes("bridge connections --help"))).toBe(true);
  });

  test("ready: what 接上 will do, read passively", async () => {
    const r = rig();
    expect(await r.link.view()).toEqual({ state: "ready", identity: "ducter", space: { id: "fake-space", label: "Only me" } });
    expect(writes(r.calls())).toEqual([]);
    expect(r.calls().some((c) => c.includes("--enable"))).toBe(false);
    expect(r.link.context()).toBeUndefined();
  });

  test("connect: the exact argv, the passive check, then on (and Disconnect undoes it)", async () => {
    const r = rig();
    await r.link.view();
    await r.link.connect();
    expect(writes(r.calls())).toEqual([["--json", "bridge", "connections", "connect", "--space-id", "fake-space", "--agent-id", "ducter", "--context", "ducter"]]);
    const after = r.calls().slice(r.calls().findIndex((c) => c.includes("connect")) + 1);
    expect(after[0]).toEqual(["--json", "--agent-context", "ducter", "bridge", "setup"]);
    expect(r.link.context()).toBe("ducter");
    expect(await r.link.view()).toEqual({ state: "connected", identity: "ducter", space: { id: "fake-space", label: "Only me" } });
    expect(r.changes()).toBeGreaterThanOrEqual(2); // connecting…, then connected
    const kept = JSON.parse(readFileSync(join(r.data, BRIDGE_CONNECTION_FILE), "utf8"));
    expect(kept).toMatchObject({ context: "ducter", agentId: "ducter", spaceId: "fake-space", confirmed: true });

    await r.link.disconnect();
    expect(writes(r.calls()).at(-1)).toEqual(["--json", "bridge", "connections", "revoke", kept.connectionId]);
    expect(r.link.context()).toBeUndefined();
    expect(existsSync(join(r.data, BRIDGE_CONNECTION_FILE))).toBe(false);
    expect((await r.link.view())?.state).toBe("ready");
  });

  test("nmem 0.10.118: setup can't find a connected context; the saved context and the inbox confirm it instead", async () => {
    const t = tempDir();
    stops.push(t.cleanup);
    const bin = join(t.dir, "nmem");
    writeFileSync(bin, `#!/bin/sh\nexec bun ${FAKE} "$@"\n`);
    chmodSync(bin, 0o755);
    const state = join(t.dir, "state.json");
    writeFileSync(state, JSON.stringify({ identities: {}, messages: [], seq: 0 }));
    const env = { PATH: process.env.PATH ?? "", NMEM_CLI_PATH: bin, NMEM_FAKE_BRIDGE_STATE: state };
    const real = nmemCall({ bin, env });
    const seen: string[][] = [];
    let inboxWorks = true;
    const run: NmemCall = async (args) => {
      seen.push(args);
      if (args.includes("--agent-context") && args.at(-1) === "setup") return { code: 1, out: "", err: 'error: agent context "ducter" was not found\n' };
      if (args[0] === "agents" && args[1] === "context" && args[2] === "show")
        return { code: 0, out: JSON.stringify({ name: "ducter", selection: { scope: { space_id: "fake-space" }, address: { agent_id: "ducter", custodian_id: "m-1" } } }), err: "" };
      if (args.includes("inbox") && !inboxWorks) return { code: 1, out: "", err: "error: refused\n" };
      if (args.includes("inbox")) return { code: 0, out: JSON.stringify({ messages: [], next: "" }), err: "" };
      return real(args);
    };
    const connected = async (name: string) => {
      const data = join(t.dir, name);
      mkdirSync(data);
      const link = createBridgeLink({ dataDir: data, identity: () => "ducter", home: () => "hel", run, env });
      await link.view();
      await link.connect();
      return JSON.parse(readFileSync(join(data, BRIDGE_CONNECTION_FILE), "utf8"));
    };
    expect(await connected("a")).toMatchObject({ context: "ducter", confirmed: true });
    expect(seen.some((a) => a[0] === "agents" && a.includes("show"))).toBe(true);
    // A context whose inbox doesn't answer stays unconfirmed.
    inboxWorks = false;
    writeFileSync(state, JSON.stringify({ identities: {}, messages: [], seq: 0 }));
    expect(await connected("b")).toMatchObject({ confirmed: false });
  });

  test("DUCTER_BRIDGE_CONTEXT names the context it saves", async () => {
    const r = rig({ DUCTER_BRIDGE_CONTEXT: "ducter-bridge" });
    await r.link.view();
    await r.link.connect();
    expect(writes(r.calls())[0]).toEqual(["--json", "bridge", "connections", "connect", "--space-id", "fake-space", "--agent-id", "ducter", "--context", "ducter-bridge"]);
    expect(r.link.context()).toBe("ducter-bridge");
  });

  for (const [code, reason] of Object.entries(REFUSALS))
    test(`refused ${code}: said as ${reason}, nothing else tried`, async () => {
      const r = rig({ NMEM_FAKE_REFUSE: code });
      await r.link.view();
      await r.link.connect();
      expect(await r.link.view()).toEqual({ state: "refused", reason, identity: "ducter", space: { id: "fake-space", label: "Only me" } });
      // One connect, with the persona's identity and the personal place: no other identity, place or key.
      expect(writes(r.calls())).toEqual([["--json", "bridge", "connections", "connect", "--space-id", "fake-space", "--agent-id", "ducter", "--context", "ducter"]]);
      expect(r.calls().some((c) => c.includes("--enable") || c.includes("select-cloud") || c.includes("keys") || c.includes("enroll"))).toBe(false);
      expect(r.link.context()).toBeUndefined();
    });

  for (const which of ["none", "two"])
    test(`no single personal place (${which}): nothing offered, connect runs nothing`, async () => {
      const r = rig({ NMEM_FAKE_SPACES: which });
      expect(await r.link.view()).toEqual({ state: "no_space", identity: "ducter" });
      await r.link.connect();
      expect(writes(r.calls())).toEqual([]);
    });

  test("a connection revoked elsewhere is dropped at the next look", async () => {
    const r = rig();
    await r.link.view();
    await r.link.connect();
    const s = JSON.parse(readFileSync(r.state, "utf8"));
    s.connections[0].state = "revoked";
    writeFileSync(r.state, JSON.stringify(s));
    // A new link (a restart) verifies once with the read-only list.
    const again = createBridgeLink({ dataDir: r.data, identity: () => "ducter", home: () => "hel", run: nmemCall({ bin: r.bin, env: r.fullEnv }), env: r.fullEnv });
    const dropped = new Promise<void>((res) => again.onChange(res));
    await again.view();
    await dropped;
    expect(again.context()).toBeUndefined();
  });

  test("DUCTER_BRIDGE=1 pins it on (no disconnect here); DUCTER_BRIDGE=0 shows nothing", async () => {
    const on = rig({ DUCTER_BRIDGE: "1", DUCTER_BRIDGE_CONTEXT: "ducter-test" });
    expect(await on.link.view()).toEqual({ state: "connected", identity: "ducter", pinned: true });
    expect(on.calls()).toEqual([]);
    const off = rig({ DUCTER_BRIDGE: "0" });
    expect(await off.link.view()).toBeUndefined();
  });

  test("memory off: nothing shows, nothing runs", async () => {
    const r = rig();
    const link = createBridgeLink({ dataDir: r.data, identity: () => undefined, memoryOn: () => false, home: () => "hel", run: nmemCall({ bin: r.bin, env: r.fullEnv }), env: r.fullEnv });
    expect(await link.view()).toBeUndefined();
    await link.installMem();
    await link.connect();
    expect(r.calls()).toEqual([]);
  });

  test("no identity bound yet: the persona's own id is named (D141)", async () => {
    const r = rig();
    const link = createBridgeLink({ dataDir: r.data, identity: () => undefined, fallbackIdentity: () => "ducter", home: () => "hel", run: nmemCall({ bin: r.bin, env: r.fullEnv }), env: r.fullEnv });
    expect((await link.view())?.state).toBe("ready");
    await link.connect();
    expect(writes(r.calls())[0]).toContain("ducter");
  });

  test("Mem's side unavailable (503, outcome unknown): a plain reason, never Mem's agent-facing words", async () => {
    const r = rig({ NMEM_FAKE_REFUSE: "cloud_bridge_setup_unavailable" });
    await r.link.view();
    await r.link.connect();
    const v = await r.link.view();
    expect(v).toMatchObject({ state: "refused", reason: "unavailable" });
    expect(JSON.stringify(v)).not.toMatch(/mint|Stop|backend/);
  });

  test("an unregistered code: its name, not Mem's agent-facing detail", async () => {
    const r = rig({ NMEM_FAKE_REFUSE: "cloud_bridge_setup_policy_invalid" });
    await r.link.view();
    await r.link.connect();
    expect(await r.link.view()).toMatchObject({ state: "failed", detail: "Nowledge Mem: policy_invalid" });
  });

  test("not signed in: sign_in; a bad link runs nothing; a used one says so; a good one signs in, then ready", async () => {
    const r = rig({ NMEM_FAKE_SIGNED_OUT: "1" });
    let ready = 0;
    r.link.onMemReady(() => ready++);
    expect(await r.link.view()).toEqual({ state: "sign_in", identity: "ducter", home: "hel", version: "0.10.118" });
    await r.link.signInMem("just some words");
    expect(await r.link.view()).toMatchObject({ state: "sign_in", signIn: "bad" });
    expect(r.calls().some((c) => c.includes("connect") && !c.includes("connections"))).toBe(false);
    await r.link.signInMem("https://cloud.example/app?nmem_connect=nmem_ct_used");
    expect(await r.link.view()).toMatchObject({ state: "sign_in", signIn: "used" });
    await r.link.signInMem("https://cloud.example/app?nmem_connect=nmem_ct_fresh");
    // Credential only: no AI tool's settings change.
    expect(r.calls().find((c) => c.some((x) => x.includes("nmem_ct_fresh")))).toEqual(["--json", "connect", "--skip-tools", "https://cloud.example/app?nmem_connect=nmem_ct_fresh"]);
    expect(ready).toBe(1);
    expect((await r.link.view())?.state).toBe("ready");
    expect(JSON.stringify(await r.link.view())).not.toContain("nmem_ct_");
  });

  test("Mem answering from this computer, not a cloud workspace: local_mem, no setup run", async () => {
    const r = rig({ NMEM_FAKE_BACKEND: "local" });
    expect(await r.link.view()).toEqual({ state: "local_mem", identity: "ducter", home: "hel" });
    expect(r.calls().some((c) => c.includes("setup"))).toBe(false);
  });
});

describe("D225: the home's own nmem, put in or updated on the tap", () => {
  // A home with no nmem: `run` can't start it; the installer is recorded, never run for real.
  function sysOf(files: Record<string, string>, tools: Record<string, string>, o: { home?: string; uid?: number; platform?: NodeJS.Platform } = {}): MemSys {
    return {
      which: (cmd) => tools[cmd],
      exists: (p) => p in files,
      read: (p) => files[p],
      list: (d) => [...new Set(Object.keys(files).filter((p) => p.startsWith(d + "/")).map((p) => p.slice(d.length + 1).split("/")[0]!))],
      real: (p) => p,
      home: o.home ?? "/home/u",
      platform: o.platform ?? "linux",
      uid: o.uid ?? 1000,
    };
  }
  // `python` is what PY_PROBE answers ("ok", "managed", "nopip"); `sudo`: `sudo -n true` works.
  function homeRig(o: { files?: Record<string, string>; tools?: Record<string, string>; version?: string; signedIn?: boolean; installOk?: boolean; python?: "ok" | "managed" | "nopip"; sudo?: boolean; uid?: number; pipxInstallOk?: boolean; latest?: boolean }) {
    const t = tempDir();
    stops.push(t.cleanup);
    const files = { ...(o.files ?? {}) };
    const tools = { ...(o.tools ?? {}) };
    let version = o.version;
    let updateAvailable = !!o.latest;
    const execs: string[][] = [];
    const env: Record<string, string | undefined> = { PATH: "/usr/bin:/bin" };
    // In the shape of nmem 0.10.118's `--json status` (research/69): mode, backend, update.
    const run: NmemCall = async (args) => {
      if (!version) return undefined;
      if (args[0] === "--version") return { code: 0, out: `nmem ${version}`, err: "" };
      if (args.join(" ") === "bridge connections --help") return { code: 2, out: "", err: "unrecognized" };
      if (args[0] === "status")
        return o.signedIn === false
          ? { code: 1, out: "", err: "unreachable" }
          : { code: 0, out: JSON.stringify({ status: "healthy", cli_version: version, mode: "remote", backend: "cloud", update: { current: version, latest: "0.10.119", update_available: updateAvailable, command: "pipx upgrade nmem-cli" } }), err: "" };
      if (args.join(" ") === "bridge setup") return { code: 0, out: JSON.stringify({ candidates: [{ id: "p1", label: "Only me", kind: "personal" }] }), err: "" };
      return { code: 1, out: "", err: "not in this rig" };
    };
    const exec: MemExec = async (argv) => {
      execs.push(argv);
      if (argv.includes("-c")) return o.python ? { code: 0, out: `${o.python}\n`, err: "" } : { code: 127, out: "", err: "no python" };
      if (argv.join(" ") === "sudo -n true") return o.sudo ? { code: 0, out: "", err: "" } : { code: 1, out: "", err: "sudo: a password is required" };
      if (argv.some((a) => a.endsWith("apt-get"))) {
        tools.pipx = "/usr/bin/pipx";
        return { code: 0, out: "Setting up pipx", err: "" };
      }
      const pip = argv.includes("pip");
      if (pip && o.python === "managed" && !argv.includes("--break-system-packages")) return { code: 1, out: "", err: "error: externally-managed-environment\n× This environment is externally managed" };
      if (pip && argv.includes("uninstall")) {
        delete files["/home/u/.local/bin/nmem"];
        version = undefined;
        return { code: 0, out: "Successfully uninstalled nmem-cli", err: "" };
      }
      if (o.installOk === false || (o.pipxInstallOk === false && argv[0]!.endsWith("pipx"))) return { code: 1, out: "", err: "ERROR: No matching distribution found for nmem-cli" };
      version = "0.10.118";
      updateAvailable = false;
      files["/home/u/.local/bin/nmem"] = "ELF";
      return { code: 0, out: "installed", err: "" };
    };
    const link = createBridgeLink({ dataDir: t.dir, identity: () => "ducter", home: () => "hel", run, exec, sys: sysOf(files, tools, { uid: o.uid }), env });
    return { link, execs, env, files };
  }
  const installs = (execs: string[][]) => execs.filter((a) => !a.includes("-c") && a.join(" ") !== "sudo -n true");

  test("no nmem, pipx here: install_mem with one tap; it runs pipx, finds the new nmem, and goes on, with a warm word", async () => {
    const r = homeRig({ tools: { pipx: "/usr/bin/pipx", python3: "/usr/bin/python3" } });
    expect(await r.link.view()).toEqual({ state: "install_mem", identity: "ducter", home: "hel", canRun: true });
    await r.link.installMem();
    expect(r.execs).toEqual([["/usr/bin/pipx", "install", "nmem-cli"]]);
    expect(r.env.PATH!.split(":")[0]).toBe("/home/u/.local/bin");
    expect(r.env.NMEM_CLI_PATH).toBe("/home/u/.local/bin/nmem");
    expect(await r.link.view()).toMatchObject({ state: "ready", done: "installed" });
  });

  test("D229: pipx first (Mem's route), uv when pipx isn't here", async () => {
    const both = homeRig({ tools: { uv: "/usr/bin/uv", pipx: "/usr/bin/pipx" } });
    await both.link.installMem();
    expect(both.execs[0]).toEqual(["/usr/bin/pipx", "install", "nmem-cli"]);
    const uv = homeRig({ tools: { uv: "/usr/bin/uv" } });
    await uv.link.installMem();
    expect(uv.execs[0]).toEqual(["/usr/bin/uv", "tool", "install", "nmem-cli"]);
  });

  test("D229: no pipx or uv, root on Debian/Ubuntu: pipx from apt first (no password), then pipx", async () => {
    const r = homeRig({ tools: { python3: "/usr/bin/python3", "apt-get": "/usr/bin/apt-get" }, uid: 0, python: "managed" });
    expect(await r.link.view()).toEqual({ state: "install_mem", identity: "ducter", home: "hel", canRun: true });
    await r.link.installMem();
    expect(installs(r.execs)).toEqual([
      ["env", "DEBIAN_FRONTEND=noninteractive", "/usr/bin/apt-get", "install", "-y", "-q", "pipx"],
      ["/usr/bin/pipx", "install", "nmem-cli"],
    ]);
    expect(r.execs.some((a) => a[0] === "sudo")).toBe(false); // root: no sudo asked
    expect((await r.link.view())?.state).toBe("ready");
  });

  test("D229: a user with password-free sudo gets pipx with `sudo -n`; with a password, never asked", async () => {
    const ok = homeRig({ tools: { python3: "/usr/bin/python3", "apt-get": "/usr/bin/apt-get" }, sudo: true, python: "managed" });
    await ok.link.installMem();
    expect(installs(ok.execs)[0]).toEqual(["sudo", "-n", "env", "DEBIAN_FRONTEND=noninteractive", "/usr/bin/apt-get", "install", "-y", "-q", "pipx"]);
    const no = homeRig({ tools: { python3: "/usr/bin/python3", "apt-get": "/usr/bin/apt-get" }, sudo: false, python: "managed" });
    expect(await no.link.view()).toEqual({ state: "install_mem", identity: "ducter", home: "hel", canRun: false, need: "pipx" });
    await no.link.installMem();
    expect(installs(no.execs)).toEqual([]);
  });

  test("no pipx, uv or a password-free package manager; pip usable and unmarked: pip into the user's own site", async () => {
    const r = homeRig({ tools: { python3: "/usr/bin/python3" }, python: "ok" });
    await r.link.installMem();
    expect(installs(r.execs)).toEqual([["/usr/bin/python3", "-m", "pip", "install", "--user", "--disable-pip-version-check", "nmem-cli"]]);
  });

  test("no nmem, no pipx or uv, pip refused by the system: one line naming pipx, nothing installed", async () => {
    const r = homeRig({ tools: { python3: "/usr/bin/python3" }, python: "managed" });
    expect(await r.link.view()).toEqual({ state: "install_mem", identity: "ducter", home: "hel", canRun: false, need: "pipx" });
    await r.link.installMem();
    expect(installs(r.execs)).toEqual([]);
  });

  test("an install that fails: the installer's last line, and Try again", async () => {
    const r = homeRig({ tools: { pipx: "/usr/bin/pipx" }, installOk: false });
    await r.link.installMem();
    expect(await r.link.view()).toMatchObject({ state: "install_mem", canRun: true, detail: "ERROR: No matching distribution found for nmem-cli" });
  });

  const HEL = {
    "/home/u/.local/bin/nmem": "ELF",
    "/home/u/.local/lib/python3.14/site-packages/nmem_cli-0.10.116.dist-info/INSTALLER": "pip\n",
  };

  test("D229 hel's shape, too old: nmem 0.10.116 put past the mark by pip: 更新 moves it to pipx (apt as root), sign-in kept", async () => {
    const r = homeRig({ files: HEL, tools: { nmem: "/home/u/.local/bin/nmem", "python3.14": "/usr/bin/python3.14", "apt-get": "/usr/bin/apt-get" }, version: "0.10.116", python: "managed", uid: 0 });
    expect(await r.link.view()).toEqual({ state: "update_mem", identity: "ducter", home: "hel", version: "0.10.116", canRun: true, upkeep: { kind: "move" } });
    await r.link.installMem();
    expect(installs(r.execs)).toEqual([
      ["env", "DEBIAN_FRONTEND=noninteractive", "/usr/bin/apt-get", "install", "-y", "-q", "pipx"],
      ["/usr/bin/python3.14", "-m", "pip", "uninstall", "-y", "--disable-pip-version-check", "--break-system-packages", "nmem-cli"],
      ["/usr/bin/pipx", "install", "--force", "nmem-cli"],
    ]);
    // `nmem connect`'s sign-in lives in ~/.nowledge-mem/config.json: no step touches it, and Mem still answers signed in.
    expect(r.execs.flat().some((a) => a.includes(".nowledge-mem") || a === "connect")).toBe(false);
    expect(await r.link.view()).toMatchObject({ state: "ready", done: "moved" });
  });

  test("D229 hel's shape, working: a quiet move offered under ready; one tap; pipx already here", async () => {
    const r = homeRig({ files: HEL, tools: { nmem: "/home/u/.local/bin/nmem", "python3.14": "/usr/bin/python3.14", pipx: "/usr/bin/pipx" }, version: "0.10.118", python: "managed" });
    expect(await r.link.view()).toMatchObject({ state: "ready", upkeep: { kind: "move" } });
    await r.link.installMem();
    expect(installs(r.execs)).toEqual([
      ["/usr/bin/python3.14", "-m", "pip", "uninstall", "-y", "--disable-pip-version-check", "--break-system-packages", "nmem-cli"],
      ["/usr/bin/pipx", "install", "--force", "nmem-cli"],
    ]);
    const v = await r.link.view();
    expect(v).toMatchObject({ state: "ready", done: "moved" });
    expect(v?.upkeep).toBeUndefined();
  });

  test("D229: a move whose new copy doesn't go in puts the old one back, and says so", async () => {
    const r = homeRig({ files: HEL, tools: { nmem: "/home/u/.local/bin/nmem", "python3.14": "/usr/bin/python3.14", pipx: "/usr/bin/pipx" }, version: "0.10.118", python: "managed", pipxInstallOk: false });
    await r.link.installMem();
    expect(installs(r.execs).at(-1)).toEqual(["/usr/bin/python3.14", "-m", "pip", "install", "--user", "--disable-pip-version-check", "--break-system-packages", "nmem-cli"]);
    expect(await r.link.view()).toMatchObject({ state: "ready", upkeep: { kind: "move", detail: "ERROR: No matching distribution found for nmem-cli", kept: true } });
  });

  test("D229: past the mark with no pipx to move to and none to get: the old in-place update, past the mark", async () => {
    const r = homeRig({ files: HEL, tools: { nmem: "/home/u/.local/bin/nmem", "python3.14": "/usr/bin/python3.14" }, version: "0.10.116", python: "managed" });
    expect(await r.link.view()).toEqual({ state: "update_mem", identity: "ducter", home: "hel", version: "0.10.116", canRun: true });
    await r.link.installMem();
    expect(installs(r.execs)).toEqual([
      ["/usr/bin/python3.14", "-m", "pip", "install", "--user", "--upgrade", "--disable-pip-version-check", "nmem-cli"],
      ["/usr/bin/python3.14", "-m", "pip", "install", "--user", "--upgrade", "--disable-pip-version-check", "--break-system-packages", "nmem-cli"],
    ]);
    expect(await r.link.view()).toMatchObject({ state: "ready", done: "updated" });
  });

  test("D229: a pip copy under an unmarked python is left where it is (no move offered)", async () => {
    const r = homeRig({ files: HEL, tools: { nmem: "/home/u/.local/bin/nmem", "python3.14": "/usr/bin/python3.14", pipx: "/usr/bin/pipx" }, version: "0.10.118", python: "ok" });
    const v = await r.link.view();
    expect(v?.state).toBe("ready");
    expect(v?.upkeep).toBeUndefined();
  });

  test("D229: Mem says a newer nmem is out: a quiet 更新 from the copy's own source", async () => {
    const files = { "/home/u/.local/pipx/venvs/nmem-cli/bin/nmem": "ELF", "/home/u/.local/bin/nmem": "ELF" };
    const r = homeRig({ files, tools: { nmem: "/home/u/.local/pipx/venvs/nmem-cli/bin/nmem", pipx: "/usr/bin/pipx" }, version: "0.10.118", latest: true });
    expect(await r.link.view()).toMatchObject({ state: "ready", upkeep: { kind: "update" } });
    await r.link.installMem();
    expect(installs(r.execs)).toEqual([["/usr/bin/pipx", "upgrade", "nmem-cli"]]);
    expect(await r.link.view()).toMatchObject({ state: "ready", done: "updated" });
  });

  test("the app's copy: update the app (no command here)", async () => {
    const files = { "/Applications/Nowledge Mem.app/Contents/Resources/nmem": "bin" };
    const r = homeRig({ files, tools: { nmem: "/Applications/Nowledge Mem.app/Contents/Resources/nmem" }, version: "0.10.116" });
    expect(await r.link.view()).toMatchObject({ state: "update_mem", canRun: false, need: "app" });
    await r.link.installMem();
    expect(r.execs).toEqual([]);
  });

  test("a fresh install is never forced past the system's mark", () => {
    const sys: MemSys = { which: (c) => (c === "python3" ? "/usr/bin/python3" : undefined), exists: () => false, read: () => undefined, list: () => [], real: (p) => p, home: "/h", platform: "linux", uid: 1000 };
    expect(installPlan({ PATH: "" }, sys, { python: { "/usr/bin/python3": "ok" } })?.steps).toEqual([{ argv: ["/usr/bin/python3", "-m", "pip", "install", "--user", "--disable-pip-version-check", "nmem-cli"] }]);
    expect(installPlan({ PATH: "" }, sys, { python: { "/usr/bin/python3": "managed" } })).toBeUndefined();
  });

  test("connect links: Mem's shapes only", () => {
    expect(connectLinkOk("https://mem.example.com/app?nmem_connect=nmem_ct_x")).toBe(true);
    expect(connectLinkOk("https://mem.example.com/connect?token=abc")).toBe(true);
    expect(connectLinkOk("https://mem.example.com/app")).toBe(false);
    expect(connectLinkOk("http://evil.example/app?nmem_connect=x")).toBe(false);
    expect(connectLinkOk("nowledgemem://login?x=1")).toBe(false);
  });
});

test("over the socket: 接上 pushes connecting…, then connected, in the settings frame", async () => {
  const r = rig();
  const t = tempDir();
  stops.push(t.cleanup);
  const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5, deviceProbes: { cua: async () => null, harnesses: async () => [], kind: async () => "laptop" }, bridgeLink: { run: nmemCall({ bin: r.bin, env: r.fullEnv }), env: r.fullEnv } });
  stops.push(() => core.stop());
  core.setPartner({ onTrigger: () => {} });
  core.persona.mem = { agentId: "ducter", owned: true };
  core.settings.setMemState("connected");
  const frames: ServerFrame[] = [];
  const ws = new WebSocket(core.url);
  ws.onmessage = (m) => frames.push(JSON.parse(String(m.data)));
  await new Promise<void>((res, rej) => ((ws.onopen = () => res()), (ws.onerror = rej)));
  stops.push(() => ws.close());
  ws.send(JSON.stringify({ t: "hello" }));
  const until = async (pred: (f: ServerFrame) => boolean) => {
    for (let i = 0; i < 600; i++) {
      const hit = frames.find(pred);
      if (hit) return hit;
      await Bun.sleep(10);
    }
    throw new Error(`timeout; got ${frames.map((f) => f.t)}`);
  };
  ws.send(JSON.stringify({ t: "settings" }));
  const first = (await until((f) => f.t === "settings" && !!f.bridge)) as Extract<ServerFrame, { t: "settings" }>;
  expect(first.bridge?.state).toBe("ready");
  ws.send(JSON.stringify({ t: "bridge_connect" }));
  await until((f) => f.t === "settings" && f.bridge?.state === "connecting");
  await until((f) => f.t === "settings" && f.bridge?.state === "connected");
  expect(core.bridgeLink.context()).toBe("ducter");
});
