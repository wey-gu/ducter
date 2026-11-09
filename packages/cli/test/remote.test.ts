// Server-mode helpers: the systemd unit, the tunnel line, the pair link, the devices list. No systemd, no network.
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { plainStyle } from "../src/doctor.ts";
import { translator } from "../src/i18n.ts";
import { openDeviceAuth } from "@ducter/core/src/auth.ts";
import { cmdDevices, cmdPair, cmdService, ducterCommand, formatDevices, isLoopback, launchAgentPath, launchdWorkerPlist, pairLink, publicUrl, servicePath, systemdUnit, tunnelCommand, WORKER_LABEL } from "../src/remote.ts";
import { refusedExit, EXIT_REFUSED } from "../src/worker.ts";
import type { Host } from "../src/doctor.ts";

const en = translator("en");
const zh = translator("zh");

describe("systemd unit", () => {
  test("headless, restart on failure, data dir and env file; loopback by default", () => {
    const u = systemdUnit({ execStart: ["/home/me/.local/bin/ducter"], dataDir: "/home/me/.ducter", path: "/home/me/.local/bin:/usr/bin", port: 7777 });
    expect(u).toContain("ExecStart=/home/me/.local/bin/ducter up --headless --port 7777\n");
    expect(u).toContain("Restart=on-failure");
    expect(u).toContain("Environment=DUCTER_DATA_DIR=/home/me/.ducter");
    expect(u).toContain("EnvironmentFile=-/home/me/.ducter/env\n");
    // D102: the key file is never loaded into the process environment.
    expect(u.split("\n").filter((l) => l.startsWith("EnvironmentFile="))).toEqual(["EnvironmentFile=-/home/me/.ducter/env"]);
    expect(u).not.toMatch(/^EnvironmentFile=.*keys/m);
    expect(u).toContain("WantedBy=default.target");
    expect(u).not.toContain("--host");
  });

  test("a public bind is carried only when asked; paths with spaces are quoted", () => {
    const u = systemdUnit({ execStart: ["/opt/my apps/bun", "/src/main.ts"], dataDir: "/d", path: "/usr/bin", port: 7790, host: "0.0.0.0" });
    expect(u).toContain('ExecStart="/opt/my apps/bun" /src/main.ts up --headless --port 7790 --host 0.0.0.0');
    expect(systemdUnit({ execStart: ["/b"], dataDir: "/d", path: "/p", port: 1, host: "127.0.0.1" })).not.toContain("--host");
  });

  test("service PATH keeps the user's PATH first, adds the usual bins once", () => {
    expect(servicePath({ PATH: "/home/me/.local/bin:/usr/bin:/home/me/.local/bin" }, "/home/me")).toBe("/home/me/.local/bin:/usr/bin:/home/me/.bun/bin:/usr/local/bin:/bin");
  });
});

describe("pairing text", () => {
  test("tunnel line uses the address the user SSHed to", () => {
    expect(tunnelCommand(7777, { USER: "anna", SSH_CONNECTION: "203.0.113.5 50122 198.51.100.7 22" })).toBe("ssh -N -L 7777:127.0.0.1:7777 anna@198.51.100.7");
    expect(tunnelCommand(7777, { USER: "anna", SSH_CONNECTION: "2001:db8::1 50122 2001:db8::2 22" })).toBe("ssh -N -L 7777:127.0.0.1:7777 anna@[2001:db8::2]");
  });

  test("pair link keeps the code in the fragment; public URL from env or file", () => {
    expect(pairLink("https://d.example.com", "K7QM-4XPA")).toBe("https://d.example.com/pair#c=K7QM-4XPA");
    const dir = mkdtempSync(join(tmpdir(), "ducter-cli-"));
    try {
      expect(publicUrl(dir, {})).toBeUndefined();
      writeFileSync(join(dir, "public-url"), "https://d.example.com/\n");
      expect(publicUrl(dir, {})).toBe("https://d.example.com");
      expect(publicUrl(dir, { DUCTER_PUBLIC_URL: "https://other.example.com" })).toBe("https://other.example.com");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("printed commands work in the same shell: ducter when PATH finds this binary, else its path", () => {
    const dir = mkdtempSync(join(tmpdir(), "ducter-self-"));
    const self = join(dir, ".local/bin/ducter");
    mkdirSync(join(dir, ".local/bin"), { recursive: true });
    writeFileSync(self, "");
    try {
      expect(ducterCommand({ execPath: self, compiled: true, home: dir, which: () => null })).toBe("~/.local/bin/ducter");
      expect(ducterCommand({ execPath: self, compiled: true, home: dir, which: () => self })).toBe("ducter");
      expect(ducterCommand({ execPath: "/opt/ducter", compiled: true, home: dir, which: () => self })).toBe("/opt/ducter");
      expect(ducterCommand({ compiled: false })).toBe("ducter");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("isLoopback", () => {
    expect(isLoopback(undefined)).toBe(true);
    expect(isLoopback("127.0.0.1")).toBe(true);
    expect(isLoopback("0.0.0.0")).toBe(false);
  });
});

describe("ducter pair without a public address", () => {
  const run = async (env: { SSH_CONNECTION?: string; DUCTER_PUBLIC_URL?: string }, o: { worker?: boolean; t?: typeof en; json?: boolean; server?: boolean; ip?: string } = {}) => {
    const dir = mkdtempSync(join(tmpdir(), "ducter-pair-"));
    const saved = { ssh: process.env.SSH_CONNECTION, pub: process.env.DUCTER_PUBLIC_URL };
    const out: string[] = [];
    const log = console.log;
    console.log = (...a: unknown[]) => void out.push(a.join(" "));
    try {
      if (env.SSH_CONNECTION) process.env.SSH_CONNECTION = env.SSH_CONNECTION;
      else delete process.env.SSH_CONNECTION;
      if (env.DUCTER_PUBLIC_URL) process.env.DUCTER_PUBLIC_URL = env.DUCTER_PUBLIC_URL;
      else delete process.env.DUCTER_PUBLIC_URL;
      await cmdPair({ t: o.t ?? en, style: plainStyle, dataDir: dir, port: 7777, json: o.json ?? false, running: true, wait: false, worker: o.worker, server: o.server ?? Boolean(env.SSH_CONNECTION), publicIp: async () => o.ip });
    } finally {
      console.log = log;
      if (saved.ssh === undefined) delete process.env.SSH_CONNECTION;
      else process.env.SSH_CONNECTION = saved.ssh;
      if (saved.pub === undefined) delete process.env.DUCTER_PUBLIC_URL;
      else process.env.DUCTER_PUBLIC_URL = saved.pub;
      rmSync(dir, { recursive: true, force: true });
    }
    return out.join("\n");
  };
  test("on the Mac itself: no phone QR for 127.0.0.1, and the tunnel comes from another computer", async () => {
    const out = await run({});
    expect(out).toContain("From another computer");
    expect(out).toContain("A phone can't reach this address");
    expect(out).not.toContain("scan this with your phone");
  });
  test("a server leads with ducter domain and its public IP, then the tunnel for a Mac alone; with an address the QR is back", async () => {
    const out = await run({}, { server: true, ip: "203.0.113.7" });
    const lead = out.indexOf("To use it from your phone and Mac anywhere:");
    expect(lead).toBeGreaterThan(0);
    expect(out).toContain("point a domain at this server's public IP 203.0.113.7 (an A record), then run:\n    ducter domain ducter.example.com");
    expect(out.indexOf("Just your Mac, no domain:")).toBeGreaterThan(lead);
    expect(out).toMatch(/ssh -N -L 7777:127\.0\.0\.1:7777 \S+@203\.0\.113\.7/);
    expect(out).not.toContain("caddy-setup");
    // Over SSH the tunnel names the address the user typed.
    expect(await run({ SSH_CONNECTION: "203.0.113.5 50122 198.51.100.7 22" }, { ip: "203.0.113.7" })).toMatch(/@198\.51\.100\.7/);
    const zhOut = await run({}, { server: true, ip: "203.0.113.7", t: zh });
    expect(zhOut).toContain("把一个域名指向这台服务器的公网 IP 203.0.113.7（加一条 A 记录），然后运行：");
    expect(zhOut).toContain("只连你的 Mac、不用域名");
    expect(await run({ DUCTER_PUBLIC_URL: "https://d.example.com" })).toContain("scan this with your phone");
  });
  test("pair --json without an address: the public IP and the two next steps, as commands", async () => {
    const j = JSON.parse((await run({}, { json: true, server: true, ip: "203.0.113.7" })).trim());
    expect(j.reachable).toBe(false);
    expect(j.publicIp).toBe("203.0.113.7");
    expect(j.steps.map((x: { command: string }) => x.command)).toEqual(["ducter domain <your domain>", j.tunnel]);
    expect(j.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const k = JSON.parse((await run({ DUCTER_PUBLIC_URL: "https://d.example.com" }, { json: true })).trim());
    expect(k.reachable).toBe(true);
    expect(k.link).toBe(`https://d.example.com/pair#c=${k.code}`);
    expect(k.steps).toBeUndefined();
  });
  test("D83: one code, both ways to use it: a phone or app window, and another computer's one command", async () => {
    const pub = { DUCTER_PUBLIC_URL: "https://d.example.com" };
    const out = await run(pub);
    const code = /Code\s+([A-Z2-9]{4}-[A-Z2-9]{4})/.exec(out)![1]!;
    expect(out).toContain("On a phone or in the Ducter app: open the address, then type the code.");
    expect(out).toContain("Another computer: run this one command on it, and it does tasks for Ducter:");
    expect(out).toContain(`ducter worker https://d.example.com --code ${code}`);
    expect(out).not.toContain("--join");
    const zhOut = await run(pub, { t: zh });
    expect(zhOut).toContain("手机或 Ducter 应用：打开这个地址，再输入连接码。");
    expect(zhOut).toContain("另一台电脑：在它上面运行这一条命令，它就会替 Ducter 做事：");
    // No public address: the computer's line keeps a placeholder and says why.
    const bare = await run({});
    expect(bare).toMatch(/ducter worker <address> --code [A-Z2-9]{4}-[A-Z2-9]{4}/);
    expect(bare).toContain("That computer dials out to this Ducter");
    // The hidden --worker alias prints only the computer's way.
    const w = await run(pub, { worker: true });
    expect(w).toContain("ducter worker https://d.example.com --code");
    expect(w).not.toContain("open the address");
    // --json carries the command too.
    const j = JSON.parse((await run(pub, { json: true })).trim());
    expect(j.command).toBe(`ducter worker https://d.example.com --code ${j.code}`);
  });
});

describe("ducter devices rename (D84)", () => {
  test("renames by id or name; a taken name is refused", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ducter-rename-"));
    const a = openDeviceAuth(dir);
    const w = a.redeem(a.createCode().code, { name: "ip-172-31-4-9", role: "worker" }) as { device: { id: string } };
    a.redeem(a.createCode().code, { name: "iPhone" });
    a.close();
    const out: string[] = [];
    const log = console.log;
    console.log = (...x: unknown[]) => void out.push(x.join(" "));
    const devices = (rest: string[]) => cmdDevices({ t: en, style: plainStyle, dataDir: dir, json: false, rest, port: 1 });
    try {
      expect(await devices(["rename", w.device.id, "Build", "box"])).toBe(0);
      expect(await devices(["rename", "Build box", "iPhone"])).toBe(1);
      expect(await devices(["rename", "Build box"])).toBe(2);
      expect(await devices(["rename", "nobody", "x"])).toBe(1);
    } finally {
      console.log = log;
    }
    expect(out).toEqual([
      "Renamed. It's Build box now.",
      "Another device is already called iPhone. Pick another name.",
      "Usage: ducter devices rename <id or name> <new name>",
      "No connected device matches nobody. See the list with: ducter devices",
    ]);
    const b = openDeviceAuth(dir);
    expect(b.list().map((d) => d.name)).toEqual(["Build box", "iPhone"]);
    b.close();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("devices list", () => {
  const now = Date.parse("2026-11-09T08:00:00Z");
  const list = [
    { id: "a1b2c3d4e5", name: "MacBook Pro", kind: "client" as const, platform: "darwin", createdAt: "2026-11-09T01:00:00Z", lastSeenAt: "2026-11-09T07:58:00Z" },
    { id: "f6a7b8c9d0", name: "vps-2", kind: "worker" as const, platform: "", createdAt: "2026-11-09T02:00:00Z" },
  ];
  test("en and zh", () => {
    const out = formatDevices(list, en, plainStyle, now);
    expect(out).toContain("MacBook Pro");
    expect(out).toContain("client · darwin · last seen 2m · a1b2c3d4e5");
    expect(out).toContain("worker · not seen yet · f6a7b8c9d0");
    expect(formatDevices([], zh, plainStyle)).toBe("还没有连接的设备。用这条命令连一台：ducter pair");
  });
});

// D155: a Mac doing tasks for a Ducter elsewhere keeps running under launchd. A fake launchctl and
// a scratch home: no real LaunchAgent is ever written or loaded.
describe("service install --worker on a Mac (launchd)", () => {
  test("the plist: ducter worker, at login, kept alive, logs in the data folder", () => {
    const p = launchdWorkerPlist({ execStart: ["/Applications/Ducter.app/Contents/MacOS/ducter"], dataDir: "/Users/me/Library/Application Support/Ducter", path: "/usr/bin:/bin", home: "/Users/me" });
    expect(p).toContain(`<string>${WORKER_LABEL}</string>`);
    expect(p).toContain("<string>/Applications/Ducter.app/Contents/MacOS/ducter</string>\n\t\t<string>worker</string>");
    expect(p).toContain("<key>RunAtLoad</key>\n\t<true/>");
    expect(p).toContain("<key>SuccessfulExit</key>\n\t\t<false/>");
    expect(p).toContain("<string>/Users/me/Library/Application Support/Ducter/worker.log</string>");
    expect(p).toContain("<key>DUCTER_SUPERVISOR</key>\n\t\t<string>launchd</string>");
    expect(launchdWorkerPlist({ execStart: ["/a&b"], dataDir: "/d", path: "/p", home: "/h" })).toContain("<string>/a&amp;b</string>");
    // Refused by the main: exit 0 under launchd (not started again), 3 under systemd.
    expect(refusedExit(EXIT_REFUSED, { DUCTER_SUPERVISOR: "launchd" })).toBe(0);
    expect(refusedExit(EXIT_REFUSED, {})).toBe(EXIT_REFUSED);
    expect(refusedExit(1, { DUCTER_SUPERVISOR: "launchd" })).toBe(1);
  });

  test("install, status and uninstall talk to launchctl only; install needs the worker to have joined", async () => {
    const root = mkdtempSync(join(tmpdir(), "ducter-launchd-"));
    const home = join(root, "home");
    const dataDir = join(root, "data");
    mkdirSync(dataDir, { recursive: true });
    const calls: string[][] = [];
    let loaded = false;
    const host = {
      compiled: true,
      bunVersion: "1",
      which: () => null,
      writable: () => true,
      port: async () => "free" as const,
      run: async (cmd: string[]) => {
        calls.push(cmd);
        if (cmd[0] !== "launchctl") return { code: 127, stdout: "" };
        if (cmd[1] === "bootstrap") loaded = true;
        if (cmd[1] === "bootout") loaded = false;
        if (cmd[1] === "print") return loaded ? { code: 0, stdout: "state = running\n" } : { code: 113, stdout: "Could not find service" };
        return { code: 0, stdout: "" };
      },
    } as unknown as Host;
    const logs: string[] = [];
    const log = console.log;
    console.log = (...a: unknown[]) => void logs.push(a.join(" "));
    try {
      const svc = (verb: string) => cmdService({ t: en, style: plainStyle, host, dataDir, port: 7777, worker: true, rest: [verb], platform: "darwin", home, uid: 501 });
      expect(await svc("install")).toBe(1);
      expect(logs.join("\n")).toContain("ducter worker <address> --code <code>");
      expect(calls).toEqual([]);

      writeFileSync(join(dataDir, "worker.json"), JSON.stringify({ url: "https://hel.example.com", token: "dvc.x", deviceId: "x", persona: "Ducter", name: "mac" }));
      expect(await svc("install")).toBe(0);
      const plist = launchAgentPath(home);
      expect(await Bun.file(plist).text()).toContain("<string>worker</string>");
      expect(calls.at(-1)).toEqual(["launchctl", "bootstrap", "gui/501", plist]);
      expect(await svc("status")).toBe(0);
      expect(calls.at(-1)).toEqual(["launchctl", "print", `gui/501/${WORKER_LABEL}`]);

      expect(await svc("uninstall")).toBe(0);
      expect(calls.at(-1)).toEqual(["launchctl", "bootout", `gui/501/${WORKER_LABEL}`]);
      expect(await Bun.file(plist).exists()).toBe(false);
      expect(await svc("status")).toBe(1);
      // Not a worker: a Mac's own Ducter is the app's to keep running.
      expect(await cmdService({ t: en, style: plainStyle, host, dataDir, port: 7777, rest: ["install"], platform: "darwin", home })).toBe(1);
      expect(calls.every((c) => c[0] === "launchctl")).toBe(true);
    } finally {
      console.log = log;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
