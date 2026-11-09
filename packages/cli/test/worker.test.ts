import { describe, expect, test } from "bun:test";
import { systemdUnit } from "../src/remote.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "../src/args.ts";
import { plainStyle } from "../src/doctor.ts";
import { translator } from "../src/i18n.ts";
import { cmdWorker, parseJoin } from "../src/worker.ts";

describe("worker", () => {
  test("parseJoin takes an address or the whole link", () => {
    expect(parseJoin("d.example.com")).toEqual({ base: "https://d.example.com" });
    expect(parseJoin("https://d.example.com/pair#c=K7QM-4XPA")).toEqual({ base: "https://d.example.com", code: "K7QM-4XPA" });
    expect(parseJoin("http://192.168.104.2:8080/")).toEqual({ base: "http://192.168.104.2:8080" });
    expect(parseJoin("127.0.0.1:7777")).toEqual({ base: "http://127.0.0.1:7777" });
    expect(parseJoin("wss://d.example.com/worker")).toEqual({ base: "https://d.example.com" });
  });

  test("D83: `ducter worker <address> --code <code>` joins as a computer that does tasks (role: worker)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ducter-worker-"));
    const sent: { url: string; body: any }[] = [];
    const real = globalThis.fetch;
    const log = console.log;
    const out: string[] = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      sent.push({ url: String(url), body: JSON.parse(String(init.body)) });
      return new Response("{}", { status: 401 }); // a wrong code: stops before connecting
    }) as unknown as typeof fetch;
    console.log = (...x: unknown[]) => void out.push(x.join(" "));
    try {
      const parsed = parseArgs(["worker", "d.example.com", "--code", "K7QM-4XPA", "--name", "vps-2"]);
      if (!parsed.ok) throw new Error("parse");
      expect(await cmdWorker({ t: translator("en"), style: plainStyle, args: parsed.args, dataDir: dir })).toBe(1);
    } finally {
      globalThis.fetch = real;
      console.log = log;
      rmSync(dir, { recursive: true, force: true });
    }
    expect(sent).toEqual([{ url: "https://d.example.com/pair", body: expect.objectContaining({ code: "K7QM-4XPA", name: "vps-2", role: "worker" }) }]);
    expect(out.join("\n")).toContain("On the computer Ducter lives on, run: ducter pair");
  });

  test("a worker unit runs `ducter worker`, not the main process", () => {
    const u = systemdUnit({ execStart: ["/home/me/.local/bin/ducter"], dataDir: "/home/me/.ducter", path: "/usr/bin", port: 7777, worker: true });
    expect(u).toContain("Description=Ducter (worker)");
    expect(u).toContain("ExecStart=/home/me/.local/bin/ducter worker\n");
    expect(u).not.toContain("--headless");
    expect(u).toContain("\nRestartPreventExitStatus=3\n");
  });
});
