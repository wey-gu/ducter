// Server-mode helpers: the systemd unit, the tunnel line, the pair link, the devices list. No systemd, no network.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { plainStyle } from "../src/doctor.ts";
import { translator } from "../src/i18n.ts";
import { openDeviceAuth } from "@ducter/core/src/auth.ts";
import { cmdDevices, cmdPair, formatDevices, isLoopback, pairLink, publicUrl, servicePath, systemdUnit, tunnelCommand } from "../src/remote.ts";

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

  test("isLoopback", () => {
    expect(isLoopback(undefined)).toBe(true);
    expect(isLoopback("127.0.0.1")).toBe(true);
    expect(isLoopback("0.0.0.0")).toBe(false);
  });
});

describe("ducter pair without a public address", () => {
  const run = async (env: { SSH_CONNECTION?: string; DUCTER_PUBLIC_URL?: string }, o: { worker?: boolean; t?: typeof en; json?: boolean } = {}) => {
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
      await cmdPair({ t: o.t ?? en, style: plainStyle, dataDir: dir, port: 7777, json: o.json ?? false, running: true, wait: false, worker: o.worker });
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
  test("over SSH (a server): the tunnel from your computer; with a public address the QR is back", async () => {
    expect(await run({ SSH_CONNECTION: "203.0.113.5 50122 198.51.100.7 22" })).toContain("From your computer");
    expect(await run({ DUCTER_PUBLIC_URL: "https://d.example.com" })).toContain("scan this with your phone");
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
