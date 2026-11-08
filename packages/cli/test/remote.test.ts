// Server-mode helpers: the systemd unit, the tunnel line, the pair link, the devices list. No systemd, no network.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { plainStyle } from "../src/doctor.ts";
import { translator } from "../src/i18n.ts";
import { cmdPair, formatDevices, isLoopback, pairLink, publicUrl, servicePath, systemdUnit, tunnelCommand } from "../src/remote.ts";

const en = translator("en");
const zh = translator("zh");

describe("systemd unit", () => {
  test("headless, restart on failure, data dir and env file; loopback by default", () => {
    const u = systemdUnit({ execStart: ["/home/me/.local/bin/ducter"], dataDir: "/home/me/.ducter", path: "/home/me/.local/bin:/usr/bin", port: 7777 });
    expect(u).toContain("ExecStart=/home/me/.local/bin/ducter up --headless --port 7777\n");
    expect(u).toContain("Restart=on-failure");
    expect(u).toContain("Environment=DUCTER_DATA_DIR=/home/me/.ducter");
    expect(u).toContain("EnvironmentFile=-/home/me/.ducter/env");
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
  const run = async (env: { SSH_CONNECTION?: string; DUCTER_PUBLIC_URL?: string }) => {
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
      await cmdPair({ t: en, style: plainStyle, dataDir: dir, port: 7777, json: false, running: true, wait: false });
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
