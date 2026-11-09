// `ducter domain`: the Caddy block, DNS first, idempotence, --remove. A fake machine records every
// command; nothing touches Caddy, DNS or the network.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { plainStyle } from "../src/doctor.ts";
import { caddyBlock, cmdDomain, stripDucterBlocks, validDomain, withDucterBlock, type DomainSys } from "../src/domain.ts";
import { translator } from "../src/i18n.ts";

const en = translator("en");
const CF = "/etc/caddy/Caddyfile";
const DEMO = ":80 {\n\troot * /usr/share/caddy\n\tfile_server\n}\n";

function fakeSys(o: { dns?: string[]; ip?: string[]; caddy?: boolean; file?: string; listeners?: Record<number, string>; https?: boolean; root?: boolean } = {}) {
  const files = new Map<string, string>();
  if (o.file !== undefined) files.set(CF, o.file);
  let caddy = o.caddy ?? true;
  let active = caddy;
  const calls: string[] = [];
  const sys: DomainSys = {
    platform: "linux",
    isRoot: o.root ?? true,
    resolve: async () => o.dns ?? ["203.0.113.7"],
    publicIps: async () => o.ip ?? ["203.0.113.7"],
    which: (c) => (c === "caddy" ? (caddy ? "/usr/bin/caddy" : null) : c === "apt-get" || c === "sudo" ? `/usr/bin/${c}` : null),
    async run(cmd, x = {}) {
      calls.push(cmd.join(" "));
      const c = cmd[0] === "sudo" ? cmd.slice(1) : cmd;
      if (c[0] === "tee") files.set(c[1]!, x.input ?? "");
      if (c.join(" ") === "apt-get install -y caddy") caddy = true;
      if (c[0] === "systemctl" && c[1] === "is-active") return { code: active ? 0 : 3, out: active ? "active\n" : "inactive\n" };
      if (c[0] === "systemctl" && c[1] === "enable") active = true;
      return { code: 0, out: "" };
    },
    read: (p) => files.get(p),
    listener: async (p) => o.listeners?.[p] ?? (active ? "caddy" : null),
    ok: async (url) => (url.startsWith("http://127.0.0.1") ? true : (o.https ?? true)),
    sleep: async () => {},
  };
  return { sys, files, calls };
}

let dataDir: string;
let out: string[];
const log = console.log;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "ducter-domain-"));
  out = [];
  console.log = (...a: unknown[]) => void out.push(a.join(" "));
});
afterEach(() => {
  console.log = log;
  rmSync(dataDir, { recursive: true, force: true });
});
const run = (sys: DomainSys, x: Partial<Parameters<typeof cmdDomain>[0]> = {}) =>
  cmdDomain({ t: en, style: plainStyle, sys, dataDir, port: 7777, json: false, domain: "ducter.example.com", pair: async () => (console.log("PAIRED"), 0), waitS: 6, ...x });

describe("the Caddy block", () => {
  test("marked, forwards to 127.0.0.1, and comes out again leaving other sites", () => {
    const b = caddyBlock("d.example.com", 7790);
    expect(b).toContain("d.example.com {");
    expect(b).toContain("reverse_proxy 127.0.0.1:7790");
    const other = "shop.example.com {\n\treverse_proxy 127.0.0.1:3000\n}\n";
    const both = withDucterBlock(other, "d.example.com", 7790);
    expect(both.text).toBe(other + "\n" + b + "\n");
    expect(stripDucterBlocks(both.text)).toEqual({ text: other, domains: ["d.example.com"] });
    // The package's demo site holds :80, which the certificate needs: it goes (backed up).
    expect(withDucterBlock(DEMO, "d.example.com", 7777)).toEqual({ text: caddyBlock("d.example.com", 7777) + "\n", changed: true, demo: true });
    // The older block scripts/caddy-setup.sh wrote, with no end marker, is found too.
    const legacy = "# ducter: written by scripts/caddy-setup.sh\nold.example.com {\n\treverse_proxy 127.0.0.1:7777\n}\n";
    expect(stripDucterBlocks(other + "\n" + legacy)).toEqual({ text: other, domains: ["old.example.com"] });
  });
  test("scripts/caddy-setup.sh writes the same block, so either one removes it", () => {
    const r = Bun.spawnSync(["sh", join(import.meta.dir, "../../../scripts/caddy-setup.sh"), "d.example.com", "7790", "--print"]);
    expect(r.stdout.toString()).toBe(caddyBlock("d.example.com", 7790) + "\n");
  });
  test("domain names", () => {
    expect(validDomain("ducter.example.com")).toBe(true);
    for (const bad of ["localhost", "-x.com", "a b.com", "203.0.113.7", "x..com"]) expect(validDomain(bad)).toBe(false);
  });
});

describe("ducter domain", () => {
  test("DNS first: a name that points elsewhere stops before anything changes, with the exact record", async () => {
    const { sys, calls } = fakeSys({ dns: ["198.51.100.9"], caddy: false });
    expect(await run(sys)).toBe(1);
    const text = out.join("\n");
    expect(text).toContain("Change the DNS record to A ducter.example.com → 203.0.113.7 (it points at 198.51.100.9 now)");
    expect(text).toContain("ducter domain ducter.example.com");
    expect(calls).toEqual([]);
    expect(existsSync(join(dataDir, "public-url"))).toBe(false);
  });
  test("no record yet: says which A record to add", async () => {
    const { sys } = fakeSys({ dns: [] });
    expect(await run(sys, { json: true })).toBe(1);
    const j = JSON.parse(out.join("\n"));
    expect(j.ok).toBe(false);
    expect(j.error).toContain("A ducter.example.com → 203.0.113.7");
    expect(j.next).toBe("ducter domain ducter.example.com");
  });
  test("a port held by another web server: stop, and point at --print", async () => {
    const { sys, calls } = fakeSys({ listeners: { 80: "nginx" }, caddy: false });
    expect(await run(sys)).toBe(1);
    expect(out.join("\n")).toContain("Port 80 is in use by nginx");
    expect(out.join("\n")).toContain("ducter domain ducter.example.com --print");
    expect(calls).toEqual([]);
  });
  test("fresh Ubuntu as root: installs Caddy without sudo, replaces the demo site, waits for HTTPS, saves the address, pairs", async () => {
    const fresh = fakeSys({ caddy: false, file: DEMO });
    expect(await run(fresh.sys)).toBe(0);
    expect(fresh.calls.some((c) => c.startsWith("sudo"))).toBe(false);
    expect(fresh.calls).toContain("apt-get install -y caddy");
    expect(fresh.calls).toContain(`cp ${CF} ${CF}.before-ducter`);
    expect(fresh.calls).toContain("systemctl enable --now caddy");
    expect(fresh.files.get(CF)).toBe(caddyBlock("ducter.example.com", 7777) + "\n");
    expect(readFileSync(join(dataDir, "public-url"), "utf8")).toBe("https://ducter.example.com\n");
    expect(out.at(-1)).toBe("PAIRED");
  });
  test("idempotent: a second run changes nothing and doesn't reload Caddy", async () => {
    const { sys, files, calls } = fakeSys({ file: caddyBlock("ducter.example.com", 7777) + "\n" });
    const before = files.get(CF);
    expect(await run(sys)).toBe(0);
    expect(files.get(CF)).toBe(before);
    expect(calls.filter((c) => /tee|reload|restart|apt-get/.test(c))).toEqual([]);
    expect(out.join("\n")).toContain("Ducter's site is already in /etc/caddy/Caddyfile");
  });
  test("not root: privileged steps go through sudo", async () => {
    const { sys, calls } = fakeSys({ root: false, file: "" });
    expect(await run(sys)).toBe(0);
    expect(calls).toContain(`sudo tee ${CF}`);
  });
  test("HTTPS never answers: the firewall step, with this server's IP", async () => {
    const { sys } = fakeSys({ file: "", https: false });
    expect(await run(sys)).toBe(1);
    expect(out.join("\n")).toContain("Open TCP ports 80 and 443 to 203.0.113.7");
    expect(existsSync(join(dataDir, "public-url"))).toBe(false);
  });
  test("--json on success carries the address and a fresh code", async () => {
    const { sys } = fakeSys({ file: "" });
    expect(await run(sys, { json: true })).toBe(0);
    const j = JSON.parse(out.join("\n"));
    expect(j.ok).toBe(true);
    expect(j.address).toBe("https://ducter.example.com");
    expect(j.pair.link).toBe(`https://ducter.example.com/pair#c=${j.pair.code}`);
    expect(j.steps.map((s: { id: string }) => s.id)).toEqual(["ducter", "dns", "ports", "caddy", "site", "https", "address"]);
  });
  test("--remove takes only Ducter's site out, reloads, forgets the address; twice is fine", async () => {
    const other = "shop.example.com {\n\treverse_proxy 127.0.0.1:3000\n}\n";
    const { sys, files, calls } = fakeSys({ file: withDucterBlock(other, "ducter.example.com", 7777).text });
    await Bun.write(join(dataDir, "public-url"), "https://ducter.example.com\n");
    expect(await run(sys, { remove: true, domain: undefined })).toBe(0);
    expect(files.get(CF)).toBe(other);
    expect(calls).toContain("systemctl reload caddy");
    expect(existsSync(join(dataDir, "public-url"))).toBe(false);
    expect(await run(sys, { remove: true, domain: undefined })).toBe(0);
    expect(out.join("\n")).toContain("No Ducter site in /etc/caddy/Caddyfile");
  });
});
