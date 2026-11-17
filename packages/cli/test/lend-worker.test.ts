// D347: the lend line's last step, `ducter worker <address> --code <code> --service`: join, then
// install the worker service; run again, it keeps the join that works and spends no code. As
// root the service is a system one.
import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "../src/args.ts";
import { plainStyle, type Host } from "../src/doctor.ts";
import { translator } from "../src/i18n.ts";
import { cmdService } from "../src/remote.ts";
import { cmdWorker } from "../src/worker.ts";

const en = translator("en");
const realFetch = globalThis.fetch;
const realLog = console.log;
let dirs: string[] = [];
afterEach(() => {
  globalThis.fetch = realFetch;
  console.log = realLog;
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

function tmp() {
  const d = mkdtempSync(join(tmpdir(), "ducter-lend-"));
  dirs.push(d);
  return d;
}

/** A fake home: /pair trades GOOD once; /worker answers 426 (a live token) or 401 (revoked). */
function fakeHome(o: { revoked?: boolean; expired?: boolean } = {}) {
  const calls: string[] = [];
  let used = false;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    calls.push(`${init?.method ?? "GET"} ${u}`);
    if (u.endsWith("/pair")) {
      const body = JSON.parse(String(init!.body));
      if (o.expired) return Response.json({ error: "expired" }, { status: 401 });
      if (body.code !== "GOOD-CODE" || used) return Response.json({ error: "invalid" }, { status: 401 });
      used = true;
      return Response.json({ token: "dvc.0123456789.x", deviceId: "0123456789", personaName: "Ducter", fp: "fp1" });
    }
    if (u.endsWith("/worker")) return new Response("upgrade", { status: o.revoked ? 401 : 426 });
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
  return calls;
}

const run = async (dataDir: string, argv: string[], service: () => Promise<number>) => {
  const out: string[] = [];
  console.log = (...x: unknown[]) => void out.push(x.join(" "));
  const p = parseArgs(argv);
  if (!p.ok) throw new Error("parse");
  const code = await cmdWorker({ t: en, style: plainStyle, args: p.args, dataDir, installService: service });
  console.log = realLog;
  return { code, out: out.join("\n") };
};

test("join, then the service; run again: already joined, the service again, no code spent", async () => {
  const dataDir = tmp();
  const calls = fakeHome();
  let installs = 0;
  const service = async () => (installs++, 0);
  const argv = ["worker", "https://hel.example.com", "--code", "GOOD-CODE", "--name", "nas", "--service"];

  const first = await run(dataDir, argv, service);
  expect(first.code).toBe(0);
  expect(first.out).toContain("nas joined Ducter at https://hel.example.com.");
  expect(installs).toBe(1);
  expect(JSON.parse(readFileSync(join(dataDir, "worker.json"), "utf8"))).toMatchObject({ url: "https://hel.example.com", deviceId: "0123456789", name: "nas" });

  const pairs = () => calls.filter((c) => c.startsWith("POST")).length;
  const again = await run(dataDir, argv, service);
  expect(again.code).toBe(0);
  expect(again.out).toContain("nas is already doing tasks for the Ducter at https://hel.example.com.");
  expect(pairs()).toBe(1); // the used code was not tried again
  expect(installs).toBe(2); // the service is (re)installed: safe to rerun
});

test("a revoked join takes the new code; an expired code says so and installs nothing", async () => {
  const dataDir = tmp();
  writeFileSync(join(dataDir, "worker.json"), JSON.stringify({ url: "https://hel.example.com", token: "dvc.old.x", deviceId: "old", persona: "Ducter", name: "nas" }));
  fakeHome({ revoked: true });
  let installs = 0;
  const r = await run(dataDir, ["worker", "https://hel.example.com", "--code", "GOOD-CODE", "--service"], async () => (installs++, 0));
  expect(r.code).toBe(0);
  expect(JSON.parse(readFileSync(join(dataDir, "worker.json"), "utf8")).deviceId).toBe("0123456789");

  const fresh = tmp();
  fakeHome({ expired: true });
  const x = await run(fresh, ["worker", "https://hel.example.com", "--code", "OLD0-CODE", "--service"], async () => (installs++, 0));
  expect(x.code).toBe(1);
  expect(x.out).toContain("That code has expired");
  expect(installs).toBe(1);
  expect(existsSync(join(fresh, "worker.json"))).toBe(false);
});

test("can't reach the home: one sentence, the outbound need, and the check to run", async () => {
  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;
  const r = await run(tmp(), ["worker", "https://hel.example.com", "--code", "GOOD-CODE", "--service"], async () => 0);
  expect(r.code).toBe(1);
  expect(r.out).toContain("Can't reach https://hel.example.com from this machine.");
  expect(r.out).toContain("curl -sS -m 10 https://hel.example.com/health");
});

test("as root the worker is a system service: /etc/systemd/system, multi-user.target, no --user", async () => {
  const root = tmp();
  const dataDir = join(root, "data");
  const sys = join(root, "system");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(sys, { recursive: true });
  writeFileSync(join(dataDir, "worker.json"), JSON.stringify({ url: "https://hel.example.com", token: "dvc.x", deviceId: "x", persona: "Ducter", name: "nas" }));
  const calls: string[][] = [];
  const host = {
    compiled: false,
    bunVersion: "1",
    which: () => null,
    writable: () => true,
    port: async () => "free" as const,
    run: async (cmd: string[]) => (calls.push(cmd), { code: 0, stdout: cmd.includes("is-active") ? "active\n" : "" }),
  } as unknown as Host;
  console.log = () => {};
  const svc = (verb: string) => cmdService({ t: en, style: plainStyle, host, dataDir, port: 7777, worker: true, rest: [verb], platform: "linux", uid: 0, systemDir: sys });
  expect(await svc("install")).toBe(0);
  const unit = readFileSync(join(sys, "ducter.service"), "utf8");
  expect(unit).toContain("WantedBy=multi-user.target");
  expect(unit).toContain(" worker\n");
  expect(calls.some((c) => c.includes("--user"))).toBe(false);
  expect(calls).toContainEqual(["systemctl", "enable", "ducter.service"]);
  expect(await svc("install")).toBe(0); // again: the same unit, restarted
  expect(await svc("uninstall")).toBe(0);
  expect(existsSync(join(sys, "ducter.service"))).toBe(false);
});
