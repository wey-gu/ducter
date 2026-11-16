// `ducter tailscale` (D265): reads `tailscale status --json`, serves 443 → Ducter, waits, saves
// the ts.net address; --remove takes only Ducter's serve away. A fake tailscale CLI records every
// command; nothing touches a real tailnet.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { plainStyle } from "../src/doctor.ts";
import { cmdDomain, type DomainSys } from "../src/domain.ts";
import { translator } from "../src/i18n.ts";
import { cmdTailscale, detectTailnet, isOurs, MAC_APP_CLI, parseStatus, served443, type TailscaleSys } from "../src/tailscale.ts";

const en = translator("en");
const zh = translator("zh");
const NAME = "hel.tail1234.ts.net";

/** What `tailscale status --json` prints (trimmed to what Ducter reads; field names from ipn/ipnstate). */
const statusJson = (o: { state?: string; certs?: string[] | null; magic?: boolean; name?: string } = {}) =>
  JSON.stringify({
    Version: "1.90.0",
    BackendState: o.state ?? "Running",
    Self: { DNSName: `${o.name ?? NAME}.`, HostName: "hel", Online: true },
    CertDomains: o.certs === undefined ? [o.name ?? NAME] : o.certs,
    MagicDNSSuffix: "tail1234.ts.net",
    CurrentTailnet: { Name: "alice@example.com", MagicDNSSuffix: "tail1234.ts.net", MagicDNSEnabled: o.magic ?? true },
  });
const serveJson = (proxy: string, name = NAME) => JSON.stringify({ TCP: { "443": { HTTPS: true } }, Web: { [`${name}:443`]: { Handlers: { "/": { Proxy: proxy } } } } });

function fakeSys(o: { bin?: string | null; app?: boolean; platform?: string; status?: string; statusCode?: number; serve?: string; serveCode?: number; serveOut?: string; https?: number; local?: number } = {}) {
  const calls: string[] = [];
  let serving = o.serve ?? "{}";
  const sys: TailscaleSys = {
    platform: o.platform ?? "linux",
    which: (c) => (c === "tailscale" ? (o.bin === undefined ? "/usr/bin/tailscale" : o.bin) : null),
    exists: (p) => Boolean(o.app) && p === MAC_APP_CLI,
    async run(cmd) {
      calls.push(cmd.join(" "));
      const a = cmd.slice(1).join(" ");
      if (a === "status --json") return { code: o.statusCode ?? 0, out: o.status ?? statusJson() };
      if (a === "serve status --json") return { code: 0, out: serving };
      if (a.startsWith("serve --bg")) {
        if ((o.serveCode ?? 0) === 0) serving = serveJson("http://127.0.0.1:7777");
        return { code: o.serveCode ?? 0, out: o.serveOut ?? "" };
      }
      if (a === "serve --https=443 off") {
        if ((o.serveCode ?? 0) === 0) serving = "{}";
        return { code: o.serveCode ?? 0, out: o.serveOut ?? "" };
      }
      return { code: 0, out: "" };
    },
    read: () => undefined,
    status: async (url) => (url.startsWith("http://127.0.0.1") ? (o.local ?? 200) : (o.https ?? 200)),
    unitPath: "/root/.config/systemd/user/ducter.service",
    sleep: async () => {},
  };
  return { sys, calls };
}

let dataDir: string;
let out: string[];
const log = console.log;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "ducter-ts-"));
  out = [];
  console.log = (...a: unknown[]) => void out.push(a.join(" "));
});
afterEach(() => {
  console.log = log;
  rmSync(dataDir, { recursive: true, force: true });
});
const run = (sys: TailscaleSys, x: Partial<Parameters<typeof cmdTailscale>[0]> = {}) =>
  cmdTailscale({ t: en, style: plainStyle, sys, dataDir, port: 7777, json: false, pair: async () => (console.log("PAIRED"), 0), waitS: 6, ...x });
const saved = () => (existsSync(join(dataDir, "public-url")) ? readFileSync(join(dataDir, "public-url"), "utf8") : undefined);

describe("reading Tailscale", () => {
  test("status: the MagicDNS name without its dot, and whether a certificate can be issued", () => {
    expect(parseStatus(statusJson())).toEqual({ state: "Running", dnsName: NAME, tailnet: "alice@example.com", magicDNS: true, https: true });
    expect(parseStatus(statusJson({ certs: null }))?.https).toBe(false);
    expect(parseStatus(statusJson({ state: "NeedsLogin" }))?.state).toBe("NeedsLogin");
    expect(parseStatus("failed to connect to local tailscaled")).toBeUndefined();
  });
  test("serve status: what 443 forwards to, and whether that is Ducter", () => {
    expect(served443(serveJson("http://127.0.0.1:7777"), NAME)).toBe("http://127.0.0.1:7777");
    expect(served443("{}", NAME)).toBeUndefined();
    expect(isOurs("http://127.0.0.1:7777", 7777)).toBe(true);
    expect(isOurs("http://localhost:7777/", 7777)).toBe(true);
    expect(isOurs("7777", 7777)).toBe(true);
    expect(isOurs("http://127.0.0.1:3000", 7777)).toBe(false);
    expect(isOurs("http://127.0.0.1:7777/grafana", 7777)).toBe(false);
  });
  test("detect: none without the CLI; the Mac app's own CLI counts", async () => {
    expect(await detectTailnet(fakeSys({ bin: null }).sys)).toBeUndefined();
    expect((await detectTailnet(fakeSys({ bin: null, platform: "darwin", app: true }).sys))?.dnsName).toBe(NAME);
    expect((await detectTailnet(fakeSys({ status: "", statusCode: 1 }).sys))?.state).toBe("NoState");
  });
});

describe("ducter tailscale", () => {
  test("serves 443 → Ducter in the background, waits for HTTPS, saves the ts.net address, then pairs", async () => {
    const { sys, calls } = fakeSys();
    expect(await run(sys)).toBe(0);
    expect(calls).toContain("/usr/bin/tailscale serve --bg --https=443 http://127.0.0.1:7777");
    expect(saved()).toBe(`https://${NAME}\n`);
    const text = out.join("\n");
    expect(text).toContain(`in your tailnet as ${NAME}`);
    expect(text).toContain("Only devices in your tailnet reach this address");
    expect(out.at(-1)).toBe("PAIRED");
  });
  test("running it again changes nothing: Ducter's serve is already there", async () => {
    const { sys, calls } = fakeSys({ serve: serveJson("http://127.0.0.1:7777") });
    expect(await run(sys)).toBe(0);
    expect(calls.some((c) => c.includes("serve --bg"))).toBe(false);
    expect(out.join("\n")).toContain("already forwards to Ducter");
  });
  test("--json carries the steps and a pair code at the ts.net address", async () => {
    const { sys } = fakeSys();
    expect(await run(sys, { json: true })).toBe(0);
    const j = JSON.parse(out.join("\n"));
    expect(j.ok).toBe(true);
    expect(j.address).toBe(`https://${NAME}`);
    expect(j.pair.link).toBe(`https://${NAME}/pair#c=${j.pair.code}`);
  });
  test("no CLI: says how to install it, changes nothing", async () => {
    const { sys, calls } = fakeSys({ bin: null });
    expect(await run(sys)).toBe(1);
    expect(out.join("\n")).toContain("curl -fsSL https://tailscale.com/install.sh | sh");
    expect(calls).toEqual([]);
    expect(saved()).toBeUndefined();
  });
  test("signed out: tailscale up, nothing served", async () => {
    const { sys, calls } = fakeSys({ status: statusJson({ state: "NeedsLogin" }) });
    expect(await run(sys)).toBe(1);
    expect(out.join("\n")).toContain("sudo tailscale up");
    expect(calls.some((c) => c.includes("serve --bg"))).toBe(false);
  });
  test("HTTPS certificates off: points at the admin console's DNS page before serve would stop to ask", async () => {
    const { sys, calls } = fakeSys({ status: statusJson({ certs: [] }) });
    expect(await run(sys)).toBe(1);
    expect(out.join("\n")).toContain("https://login.tailscale.com/admin/dns");
    expect(calls.some((c) => c.includes("serve --bg"))).toBe(false);
    const z = fakeSys({ status: statusJson({ magic: false }) });
    expect(await run(z.sys, { t: zh })).toBe(1);
    expect(out.join("\n")).toContain("打开 MagicDNS 和 HTTPS Certificates");
  });
  test("not root and not its operator: prints the one line that fixes it", async () => {
    const denied = "Access denied: serve config denied\n\nUse 'sudo tailscale serve --bg --https=443 http://127.0.0.1:7777'.\nTo not require root, use 'sudo tailscale set --operator=$USER' once.";
    const { sys } = fakeSys({ serveCode: 1, serveOut: denied });
    expect(await run(sys)).toBe(1);
    expect(out.join("\n")).toContain("sudo tailscale set --operator=$USER");
    expect(saved()).toBeUndefined();
  });
  test("443 already serves something else: left alone", async () => {
    const { sys, calls } = fakeSys({ serve: serveJson("http://127.0.0.1:3000") });
    expect(await run(sys)).toBe(1);
    expect(out.join("\n")).toContain("already serves something else (http://127.0.0.1:3000)");
    expect(calls.some((c) => c.includes("serve --bg"))).toBe(false);
  });
  test("Ducter not answering behind it (502) fails; this machine unable to open its own name only warns", async () => {
    expect(await run(fakeSys({ https: 502 }).sys)).toBe(1);
    expect(saved()).toBeUndefined();
    out = [];
    expect(await run(fakeSys({ https: 0 }).sys, { json: true })).toBe(0);
    const j = JSON.parse(out.join("\n"));
    expect(j.warning).toContain("couldn't open");
    expect(saved()).toBe(`https://${NAME}\n`);
  });
  test("Ducter down and not installed: start it first", async () => {
    expect(await run(fakeSys({ local: 0 }).sys)).toBe(1);
    expect(out.join("\n")).toContain("ducter service install");
  });
});

describe("ducter tailscale --remove", () => {
  test("turns Ducter's serve off and clears only a ts.net address", async () => {
    writeFileSync(join(dataDir, "public-url"), `https://${NAME}\n`);
    const { sys, calls } = fakeSys({ serve: serveJson("http://127.0.0.1:7777") });
    expect(await run(sys, { remove: true })).toBe(0);
    expect(calls).toContain("/usr/bin/tailscale serve --https=443 off");
    expect(saved()).toBeUndefined();
  });
  test("keeps a domain's address and someone else's serve", async () => {
    writeFileSync(join(dataDir, "public-url"), "https://ducter.example.com\n");
    const { sys, calls } = fakeSys({ serve: serveJson("http://127.0.0.1:3000") });
    expect(await run(sys, { remove: true })).toBe(0);
    expect(calls.some((c) => c.endsWith("off"))).toBe(false);
    expect(saved()).toBe("https://ducter.example.com\n");
  });
  test("ducter domain --remove leaves a ts.net address in place", async () => {
    writeFileSync(join(dataDir, "public-url"), `https://${NAME}\n`);
    const sys = { platform: "linux", isRoot: true, which: () => null, run: async () => ({ code: 0, out: "" }), read: () => undefined, resolve: async () => [], publicIps: async () => [], listener: async () => null, status: async () => 0, sleep: async () => {} } as DomainSys;
    expect(await cmdDomain({ t: en, style: plainStyle, sys, dataDir, port: 7777, json: true, remove: true })).toBe(0);
    expect(saved()).toBe(`https://${NAME}\n`);
  });
});
