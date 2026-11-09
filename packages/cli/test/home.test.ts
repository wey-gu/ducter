// D147: the CLI follows the active home. Command classes, home.json, --local / --home, and
// connect / pair / devices / status against a real core whose gate trusts nobody (every caller
// needs a device token, as on a server).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startCore, type Core } from "@ducter/core/src/core.ts";
import { openDeviceAuth } from "@ducter/core/src/auth.ts";
import { parseArgs } from "../src/args.ts";
import { translator } from "../src/i18n.ts";
import { clearHome, cliInstall, commandClass, homePath, parseAddress, readHome, resolveTarget, writeHome, type Target } from "../src/home.ts";
import { cliChecks, cmdConnect, cmdDevicesAt, cmdDisconnect, cmdPairAt, targetLine } from "../src/homecmds.ts";
import { fetchSnapshot } from "../src/status.ts";
import { notReached } from "../src/talk.ts";
import { plainStyle } from "../src/doctor.ts";

const en = translator("en");
const zh = translator("zh");
const tmp = () => realpathSync(mkdtempSync(join(tmpdir(), "ducter-home-")));

describe("command classes", () => {
  test("machine commands stay here; home commands follow; the CLI's own are neither", () => {
    for (const c of ["up", "service", "uninstall", "worker", "doctor", "domain", "report"]) expect(commandClass(c)).toBe("machine");
    for (const c of ["status", "say", "task", "tail", "answer", "merge", "undo", "open", "pair", "devices"]) expect(commandClass(c)).toBe("home");
    for (const c of ["help", "version", "connect", "disconnect"]) expect(commandClass(c)).toBe("self");
    expect(commandClass("update")).toBe("machine");
    expect(commandClass("update", { all: true })).toBe("home");
  });

  test("args: connect takes the address; --local and --home", () => {
    expect(parseArgs(["connect", "hel.siwei.info", "--code", "K7QM-4XPA"])).toEqual({ ok: true, args: { command: "connect", desktop: true, json: false, rest: ["hel.siwei.info"], code: "K7QM-4XPA" } });
    expect(parseArgs(["status", "--local"])).toEqual({ ok: true, args: { command: "status", desktop: true, json: false, local: true } });
    expect(parseArgs(["status", "--home", "https://hel.siwei.info"])).toEqual({ ok: true, args: { command: "status", desktop: true, json: false, home: "https://hel.siwei.info" } });
    expect(parseArgs(["disconnect"]).ok).toBe(true);
    expect(parseArgs(["status", "--home"]).ok).toBe(false);
  });
});

describe("home.json", () => {
  test("written owner-only, read back, cleared", () => {
    const dir = tmp();
    expect(readHome(dir)).toBeUndefined();
    writeHome(dir, { address: "https://hel.siwei.info", token: "dvc.0123456789.x", name: "hel.siwei.info", since: "2026-11-10T09:00:00Z", by: "cli" });
    expect(statSync(homePath(dir)).mode & 0o777).toBe(0o600);
    expect(readHome(dir)).toEqual({ address: "https://hel.siwei.info", token: "dvc.0123456789.x", name: "hel.siwei.info", since: "2026-11-10T09:00:00Z", by: "cli" });
    expect(clearHome(dir)).toBe(true);
    expect(clearHome(dir)).toBe(false);
    writeFileSync(homePath(dir), "{not json");
    expect(readHome(dir)).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });

  test("addresses read like the app reads them", () => {
    expect(parseAddress("hel.siwei.info")).toEqual({ base: "https://hel.siwei.info" });
    expect(parseAddress("https://hel.siwei.info/")).toEqual({ base: "https://hel.siwei.info" });
    expect(parseAddress("wss://hel.siwei.info/ws")).toEqual({ base: "https://hel.siwei.info" });
    expect(parseAddress("127.0.0.1:7799")).toEqual({ base: "http://127.0.0.1:7799" });
    expect(parseAddress("https://d.example.com/pair#c=K7QM-4XPA")).toEqual({ base: "https://d.example.com", code: "K7QM-4XPA" });
    expect(parseAddress("ftp://x")).toBeUndefined();
  });
});

describe("where a home command goes", () => {
  const dir = tmp();
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test("no home.json: this machine", () => {
    expect(resolveTarget({ dataDir: dir, port: 7777 })).toEqual({ ok: true, target: { kind: "local", port: 7777 } });
  });

  test("home.json: there; --local and an explicit --port: here; --home: there once", () => {
    writeHome(dir, { address: "https://hel.siwei.info", token: "dvc.a", name: "hel.siwei.info", since: "", by: "app" });
    const r = resolveTarget({ dataDir: dir, port: 7777 });
    expect(r.ok && r.target).toEqual({ kind: "remote", address: "https://hel.siwei.info", name: "hel.siwei.info", token: "dvc.a" });
    expect(resolveTarget({ dataDir: dir, port: 7777, local: true })).toEqual({ ok: true, target: { kind: "local", port: 7777 } });
    expect(resolveTarget({ dataDir: dir, port: 7798, portGiven: true })).toEqual({ ok: true, target: { kind: "local", port: 7798 } });
    // The token home.json holds for that address rides along.
    const same = resolveTarget({ dataDir: dir, port: 7777, local: false, home: "hel.siwei.info" });
    expect(same.ok && same.target).toEqual({ kind: "remote", address: "https://hel.siwei.info", name: "hel.siwei.info", token: "dvc.a" });
    // A tunnel needs no token.
    const tunnel = resolveTarget({ dataDir: dir, port: 7777, home: "127.0.0.1:7799" });
    expect(tunnel.ok && tunnel.target).toEqual({ kind: "remote", address: "http://127.0.0.1:7799", name: "127.0.0.1:7799" });
  });

  test("an address with no token says the exact connect command", () => {
    const r = resolveTarget({ dataDir: dir, port: 7777, home: "https://other.example" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.key).toBe("home.needsConnect");
      expect(en(r.key, r.vars)).toContain("ducter connect https://other.example --code <code>");
    }
    writeHome(dir, { address: "https://hel.siwei.info", name: "hel.siwei.info", since: "", by: "app" });
    const r2 = resolveTarget({ dataDir: dir, port: 7777 });
    expect(!r2.ok && en(r2.key, r2.vars)).toContain("ducter connect https://hel.siwei.info --code <code>");
  });

  test("the → line names the target", () => {
    expect(targetLine(en, { kind: "local", port: 7777 })).toBe("→ this computer");
    expect(targetLine(zh, { kind: "remote", address: "https://hel.siwei.info", name: "hel.siwei.info" })).toBe("→ hel.siwei.info");
  });
});

describe("doctor rows", () => {
  test("what this ducter is", () => {
    expect(cliInstall({ realExecPath: "/Applications/Ducter.app/Contents/Helpers/ducter", compiled: true })).toBe("app");
    expect(cliInstall({ realExecPath: "/Users/w/.local/bin/ducter", compiled: true })).toBe("standalone");
    expect(cliInstall({ realExecPath: "/opt/homebrew/bin/bun", compiled: false })).toBe("source");
  });

  test("a copy beside the app warns it won't update with it; the home row says what the CLI follows", () => {
    const dir = tmp();
    const app = "/Applications/Ducter.app/Contents/Helpers/ducter";
    let [home, cli] = cliChecks(en, { dataDir: dir, realExecPath: "/Users/w/.local/bin/ducter", compiled: true, platform: "darwin", appInstalled: true, appCli: app });
    expect(home).toMatchObject({ id: "home", status: "ok", detail: "this computer's Ducter" });
    expect(cli).toMatchObject({ id: "cli", status: "warn", fix: `ln -sf "${app}" ~/.local/bin/ducter` });
    expect(cli!.detail).toContain("won't update with the app");
    writeHome(dir, { address: "https://hel.siwei.info", name: "hel.siwei.info", since: "", by: "app" });
    [home, cli] = cliChecks(en, { dataDir: dir, realExecPath: app, compiled: true, platform: "darwin", appInstalled: true, appCli: app });
    expect(home).toMatchObject({ status: "warn", fix: "ducter connect https://hel.siwei.info --code <code>" });
    expect(cli).toMatchObject({ status: "ok", detail: "the app's own: it updates with the app" });
    writeHome(dir, { address: "https://hel.siwei.info", token: "dvc.a", name: "hel.siwei.info", since: "", by: "app" });
    expect(cliChecks(en, { dataDir: dir, realExecPath: app, compiled: true, platform: "darwin", appInstalled: true })[0]!.detail).toBe("the Ducter on hel.siwei.info, like the app");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("against a Ducter that needs a device token", () => {
  let core: Core;
  let dir: string;
  let cliData: string;
  let base: string;
  const trust = process.env.DUCTER_LOCAL_TRUST;

  beforeAll(() => {
    dir = tmp();
    cliData = join(dir, "cli");
    process.env.DUCTER_LOCAL_TRUST = "off"; // read when the gate is made
    core = startCore({ dataDir: join(dir, "home"), port: 0, batchMs: 5, push: false, deviceProbes: { cua: async () => ({ missing: "test" }), harnesses: async () => [], kind: async () => "server" } });
    if (trust === undefined) delete process.env.DUCTER_LOCAL_TRUST;
    else process.env.DUCTER_LOCAL_TRUST = trust;
    base = `http://localhost:${core.port}`;
  });
  afterAll(async () => {
    await core.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  const code = () => {
    const a = openDeviceAuth(join(dir, "home"));
    const c = a.createCode().code;
    a.close();
    return c;
  };
  const target = (): Extract<Target, { kind: "remote" }> => {
    const r = resolveTarget({ dataDir: cliData, port: 7777 });
    if (!r.ok || r.target.kind !== "remote") throw new Error("not following");
    return r.target;
  };

  test("without a token the home refuses, and the words say how to connect", async () => {
    const t: Target = { kind: "remote", address: base, name: "home.test", token: "dvc.0123456789.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" };
    expect(await fetchSnapshot(t, 3000)).toBeUndefined();
    expect(await notReached(en, t)).toContain(`ducter connect ${base} --code <code>`);
    expect(await notReached(en, { kind: "remote", address: "http://127.0.0.1:1", name: "gone" })).toContain("Can't reach the Ducter on gone");
  });

  test("a wrong code is refused", async () => {
    const lines: string[] = [];
    expect(await cmdConnect({ t: en, style: plainStyle, dataDir: cliData, json: false, rest: [base], code: "AAAA-AAAA", print: (s) => void lines.push(s) })).toBe(1);
    expect(lines.join("\n")).toContain("wrong or has expired");
    expect(readHome(cliData)).toBeUndefined();
  });

  test("connect pairs the CLI as its own device; status, pair and devices go there", async () => {
    const lines: string[] = [];
    expect(await cmdConnect({ t: en, style: plainStyle, dataDir: cliData, json: false, rest: [base], code: code(), name: "CLI on test-mac", print: (s) => void lines.push(s) })).toBe(0);
    expect(lines[0]).toContain("now go to the Ducter on localhost:");
    const h = readHome(cliData)!;
    expect(h.token).toMatch(/^dvc\./);
    expect(h.by).toBe("cli");
    expect(statSync(homePath(cliData)).mode & 0o777).toBe(0o600);

    const snap = await fetchSnapshot(target());
    expect(snap?.url).toBe(`${base}/app`);

    const out: string[] = [];
    expect(await cmdDevicesAt({ t: en, style: plainStyle, target: target(), json: true, rest: [], print: (s) => void out.push(s) })).toBe(0);
    const j = JSON.parse(out[0]!);
    expect(j.home).toEqual({ kind: "remote", address: base, name: h.name });
    expect(j.clients.map((c: { name: string }) => c.name)).toContain("CLI on test-mac");

    const pair: string[] = [];
    expect(await cmdPairAt({ t: en, style: plainStyle, target: target(), json: true, print: (s) => void pair.push(s) })).toBe(0);
    const p = JSON.parse(pair[0]!);
    expect(p.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(p.connect).toBe(`ducter connect ${p.address} --code ${p.code}`);
  });

  test("the main entry: → first, home in --json, --local stays here", async () => {
    const main = resolve(import.meta.dir, "../src/main.ts");
    const env = { ...process.env, DUCTER_LOCALE: "en", NO_COLOR: "1", DUCTER_PORT: "1" };
    const human = Bun.spawnSync(["bun", main, "status", "--data-dir", cliData], { env, stdout: "pipe", stderr: "pipe" });
    expect(human.stdout.toString().split("\n")[0]).toBe(`→ localhost:${core.port}`);
    expect(human.exitCode).toBe(0);
    const json = Bun.spawnSync(["bun", main, "status", "--json", "--data-dir", cliData], { env, stdout: "pipe" });
    expect(JSON.parse(json.stdout.toString()).home).toEqual({ kind: "remote", address: base, name: `localhost:${core.port}` });
    const here = Bun.spawnSync(["bun", main, "status", "--local", "--data-dir", cliData], { env, stdout: "pipe" });
    expect(here.stdout.toString()).toContain("→ this computer");
    expect(here.stdout.toString()).toContain("isn't running on port 1");
  });

  test("a disconnected CLI device is told to connect again; disconnect goes back here", async () => {
    const a = openDeviceAuth(join(dir, "home"));
    a.revoke("CLI on test-mac");
    a.close();
    const t = target();
    expect(await fetchSnapshot(t, 3000)).toBeUndefined();
    expect(await notReached(en, t)).toContain("no longer accepts this command line");
    const lines: string[] = [];
    expect(cmdDisconnect({ t: en, style: plainStyle, dataDir: cliData, json: false, print: (s) => void lines.push(s) })).toBe(0);
    expect(lines[0]).toContain("uses this computer's Ducter again");
    expect(readHome(cliData)).toBeUndefined();
    expect(resolveTarget({ dataDir: cliData, port: 7777 })).toEqual({ ok: true, target: { kind: "local", port: 7777 } });
  });
});
