// Pairing codes, device tokens, and the gate in front of core's routes. No model calls.
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CODE_ALPHABET, createGate, isLocalRequest, normalizeCode, openDeviceAuth, type DeviceAuth } from "../src/auth.ts";
import { startCore, type Core } from "../src/core.ts";
import { tempDir } from "./helpers.ts";

let stops: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const s of stops.reverse()) await s();
  stops = [];
});

function auth(now?: () => number): { a: DeviceAuth; dir: string } {
  const t = tempDir();
  const a = openDeviceAuth(t.dir, { now });
  stops.push(t.cleanup, () => a.close());
  return { a, dir: t.dir };
}

describe("pairing codes and device tokens", () => {
  test("a code is 8 unambiguous characters, works once, and yields a token that verifies", () => {
    const { a } = auth();
    const { code } = a.createCode();
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    for (const ch of normalizeCode(code)) expect(CODE_ALPHABET).toContain(ch);
    const r = a.redeem(code.toLowerCase().replace("-", " "), { name: "MacBook Pro", platform: "darwin" });
    if ("error" in r) throw new Error(r.error);
    expect(r.token).toMatch(/^dvc\.[0-9a-f]{10}\.[A-Za-z0-9_-]{43}$/);
    expect(a.verify(r.token)).toMatchObject({ name: "MacBook Pro", kind: "client", platform: "darwin" });
    expect(a.redeem(code, { name: "again" })).toEqual({ error: "invalid" });
    expect(a.verify(r.token.slice(0, -1) + (r.token.endsWith("A") ? "B" : "A"))).toBeUndefined();
    expect(a.verify("dtk.partner.sig")).toBeUndefined();
  });

  test("codes expire after 10 minutes", () => {
    let t = 1_000_000;
    const { a } = auth(() => t);
    const { code, expiresAt } = a.createCode();
    expect(expiresAt - t).toBe(10 * 60_000);
    t += 10 * 60_000 + 1;
    expect(a.redeem(code, { name: "late" })).toEqual({ error: "expired" });
    expect(a.list()).toEqual([]);
  });

  test("only hashes are stored: neither the code nor the token is on disk, and the file is 0600", () => {
    const { a, dir } = auth();
    const { code } = a.createCode();
    const r = a.redeem(code, { name: "phone" }) as { token: string };
    const { code: pending } = a.createCode();
    a.close();
    const bytes = ["devices.db", "devices.db-wal"].map((f) => {
      try {
        return readFileSync(join(dir, f)).toString("latin1");
      } catch {
        return "";
      }
    }).join("");
    expect(bytes).not.toContain(r.token.split(".")[2]!);
    expect(bytes).not.toContain(normalizeCode(pending));
    expect(statSync(join(dir, "devices.db")).mode & 0o777).toBe(0o600);
  });

  test("wrong codes are rate limited per caller; a flood voids every pending code", () => {
    const { a } = auth();
    const { code } = a.createCode();
    for (let i = 0; i < 10; i++) expect(a.redeem("AAAA-AAAA", { name: "x" }, "1.2.3.4")).toEqual({ error: "invalid" });
    expect(a.redeem(code, { name: "x" }, "1.2.3.4")).toEqual({ error: "locked" });
    // Another caller can still pair with the right code.
    expect("token" in a.redeem(code, { name: "mine" }, "5.6.7.8")).toBe(true);

    const { code: c2 } = a.createCode();
    for (let i = 0; i < 30; i++) a.redeem("BBBB-BBBB", { name: "x" }, `10.0.0.${i}`);
    expect(a.pendingCodes()).toBe(0);
    expect(a.redeem(c2, { name: "x" }, "9.9.9.9")).toEqual({ error: "invalid" });
  });

  test("devices are listed and revoked by id or unique name; a revoked token stops working", () => {
    const { a } = auth();
    const pair = (name: string) => a.redeem(a.createCode().code, { name }) as { token: string; device: { id: string } };
    const mac = pair("mac");
    const p1 = pair("phone");
    const p2 = pair("phone");
    expect(a.list().map((d) => d.name)).toEqual(["mac", "phone", "phone"]);
    expect(a.revoke("phone")).toEqual([]); // ambiguous name: nothing revoked
    expect(a.revoke(p1.device.id).map((d) => d.id)).toEqual([p1.device.id]);
    expect(a.verify(p1.token)).toBeUndefined();
    expect(a.verify(p2.token)).toBeDefined();
    expect(a.revoke("mac")).toHaveLength(1);
    expect(a.verify(mac.token)).toBeUndefined();
    expect(a.list().map((d) => d.id)).toEqual([p2.device.id]);
    expect(a.list({ all: true })).toHaveLength(3);
  });

  test("a second handle on the same file (the CLI) sees codes and revocations at once", () => {
    const { a, dir } = auth();
    const cli = openDeviceAuth(dir);
    stops.push(() => cli.close());
    const { code } = cli.createCode();
    const r = a.redeem(code, { name: "mac" }) as { token: string; device: { id: string } };
    expect(cli.list().map((d) => d.name)).toEqual(["mac"]);
    cli.revoke(r.device.id);
    expect(a.verify(r.token)).toBeUndefined();
  });
});

describe("isLocalRequest", () => {
  const req = (host: string, headers: Record<string, string> = {}) => new Request(`http://${host}/ws`, { headers: { host, ...headers } });
  test.each([
    ["127.0.0.1", "127.0.0.1:7777", {}, true],
    ["::1", "localhost:7420", {}, true],
    ["::ffff:127.0.0.1", "[::1]:7777", {}, true],
    ["192.168.1.5", "127.0.0.1:7777", {}, false], // a LAN peer
    ["127.0.0.1", "ducter.example.com", {}, false], // a reverse proxy passing the Host through
    ["127.0.0.1", "127.0.0.1:7777", { "x-forwarded-for": "8.8.8.8" }, false], // Caddy's default
    ["127.0.0.1", "127.0.0.1:7777", { "cf-connecting-ip": "8.8.8.8" }, false], // cloudflared
    ["127.0.0.1", "127.0.0.1:7777", { forwarded: "for=8.8.8.8" }, false],
  ] as const)("%s Host %s %j → %p", (ip, host, headers, want) => {
    expect(isLocalRequest(req(host, headers as Record<string, string>), ip)).toBe(want);
  });
});

describe("gate on a real server", () => {
  function boot(): Core {
    const t = tempDir();
    const core = startCore({ dataDir: t.dir, port: 0, batchMs: 5 });
    stops.push(t.cleanup, () => core.stop());
    return core;
  }
  // A reverse proxy on the same box: loopback peer, but X-Forwarded-For says it's relayed.
  const REMOTE = { "x-forwarded-for": "203.0.113.9" };

  async function wsOpen(url: string, headers: Record<string, string>): Promise<{ ok: boolean; welcome?: any; ws?: WebSocket }> {
    return new Promise((resolve) => {
      const ws = new WebSocket(url, { headers } as any);
      const timer = setTimeout(() => resolve({ ok: false }), 2000);
      ws.onopen = () => ws.send(JSON.stringify({ t: "hello" }));
      ws.onmessage = (m) => {
        const f = JSON.parse(String(m.data));
        if (f.t === "welcome") {
          clearTimeout(timer);
          resolve({ ok: true, welcome: f, ws });
        }
      };
      ws.onerror = () => {
        clearTimeout(timer);
        resolve({ ok: false });
      };
    });
  }

  test("remote: no token → 401; pair → token → welcome; revoked → 401; local stays token-free", async () => {
    const core = boot();
    const base = `http://127.0.0.1:${core.port}`;
    expect((await fetch(`${base}/ws`, { headers: { ...REMOTE, upgrade: "websocket" } })).status).toBe(401);
    expect(await (await fetch(`${base}/health`, { headers: REMOTE })).json()).toEqual({ ok: true });

    const bad = await fetch(`${base}/pair`, { method: "POST", headers: REMOTE, body: JSON.stringify({ code: "AAAA-AAAA", name: "x" }) });
    expect(bad.status).toBe(401);

    const { code } = core.devices.createCode();
    const res = await fetch(`${base}/pair`, { method: "POST", headers: REMOTE, body: JSON.stringify({ code, name: "MacBook", platform: "darwin" }) });
    expect(res.status).toBe(200);
    const paired: any = await res.json();
    expect(paired).toMatchObject({ name: "MacBook", personaName: "Ducter" });

    // With the token, a foreign Origin is fine (tokens don't ride along ambiently like cookies).
    const ok = await wsOpen(core.url, { ...REMOTE, authorization: `Bearer ${paired.token}`, origin: "https://ducter.example.com" });
    expect(ok.ok).toBe(true);
    expect(ok.welcome.personaName).toBe("Ducter");
    ok.ws!.close();

    core.devices.revoke(paired.deviceId);
    expect((await wsOpen(core.url, { ...REMOTE, authorization: `Bearer ${paired.token}` })).ok).toBe(false);

    const local = await wsOpen(core.url, {});
    expect(local.ok).toBe(true);
    local.ws!.close();
    // The local path keeps its browser-origin check.
    expect((await fetch(`${base}/ws`, { headers: { origin: "https://evil.example", upgrade: "websocket" } })).status).toBe(403);
  });

  test("remote /mcp needs a device token beside its role token", async () => {
    const core = boot();
    const url = `http://127.0.0.1:${core.port}/mcp`;
    const role = core.mcp.configFor("partner").headers!;
    const rpc = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
    const post = (headers: Record<string, string>) =>
      fetch(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify(rpc) });
    expect((await post({ ...REMOTE, ...role })).status).toBe(401);
    const r = core.devices.redeem(core.devices.createCode({ kind: "worker" }).code, { name: "vps-2" }) as { token: string };
    expect((await post({ ...REMOTE, ...role, "x-ducter-device": r.token })).status).not.toBe(401);
    expect((await post({ ...REMOTE, authorization: `Bearer ${r.token}` })).status).toBe(401); // a device token is not a role token
    expect((await post(role)).status).not.toBe(401); // local harness, as today
  });

  test("createGate honours trustLoopback: false (every caller needs a token)", async () => {
    const { a } = auth();
    const gate = createGate({ auth: a, trustLoopback: false });
    const r = await gate.check(new Request("http://127.0.0.1:7777/ws", { headers: { host: "127.0.0.1:7777" } }), "127.0.0.1");
    expect(r.pass).toBe(false);
  });
});
