// `ducter domain <name>`: an address that works from anywhere. Caddy in front of this Ducter
// (certificates it gets and renews itself), then a fresh pair code at https://<name>.
//
//   ducter domain ducter.example.com          check DNS, install Caddy, write its site, wait for HTTPS, pair
//   ducter domain ducter.example.com --print  only print the Caddy site block (for a proxy you run yourself)
//   ducter domain --remove                    take Ducter's site out of Caddy (Caddy itself stays)
//
// Every step checks before it changes anything, so running it again is safe. Ducter keeps
// listening on 127.0.0.1 only; requests through Caddy carry X-Forwarded-For, so they count as
// remote and need a paired device (D54). scripts/caddy-setup.sh is the same for source users.
import { promises as dns } from "node:dns";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Style } from "./doctor.ts";
import type { T } from "./i18n.ts";
import { newPairing, unitPath } from "./remote.ts";

export const MARK_BEGIN = "# ducter: begin";
export const MARK_END = "# ducter: end";
export const LINUX_CADDYFILE = "/etc/caddy/Caddyfile";

/** Ducter's site block, between markers so `--remove` and `ducter uninstall --all` find it. */
export function caddyBlock(domain: string, port: number): string {
  return [
    `${MARK_BEGIN} (written by ducter domain; remove with: ducter domain --remove)`,
    `${domain} {`,
    "\tencode zstd gzip",
    "\t# WebSocket upgrades pass through as-is. Caddy adds X-Forwarded-For, which is how Ducter",
    "\t# knows a request came from outside even though Caddy connects from 127.0.0.1.",
    `\treverse_proxy 127.0.0.1:${port}`,
    "}",
    MARK_END,
  ].join("\n");
}

/** The Caddyfile without Ducter's blocks (also the older `# ducter: written by …` one that had
 *  no end marker: it ends at its closing brace), and the domains they served. */
export function stripDucterBlocks(text: string): { text: string; domains: string[] } {
  const lines = text.split("\n");
  const out: string[] = [];
  const domains: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (!l.startsWith("# ducter:") || l.startsWith(MARK_END)) {
      out.push(l);
      continue;
    }
    let j = i + 1;
    for (; j < lines.length; j++) {
      const m = /^(\S+)\s*\{\s*$/.exec(lines[j]!);
      if (m && !domains.includes(m[1]!)) domains.push(m[1]!);
      if (lines[j] === "}") {
        if (lines[j + 1]?.startsWith(MARK_END)) j++;
        break;
      }
      if (lines[j]!.startsWith(MARK_END)) break;
    }
    i = j;
    // The blank line that separated it goes too.
    while (out.length && out[out.length - 1] === "" && lines[i + 1] === "") i++;
  }
  let s = out.join("\n").replace(/\n{3,}/g, "\n\n");
  if (s.trim() === "") s = "";
  return { text: s, domains };
}

/** The Debian package's demo site holds port 80, which the certificate check needs. */
const isPackageDemo = (text: string) => /^:80\s*\{/m.test(text) && /\/usr\/share\/caddy/.test(text);

/** The Caddyfile with Ducter's one site for <domain>; an older one for another name is replaced. */
export function withDucterBlock(text: string, domain: string, port: number): { text: string; changed: boolean; demo: boolean } {
  let base = stripDucterBlocks(text).text;
  const demo = isPackageDemo(base);
  if (demo) base = "";
  const next = (base.trimEnd() ? base.trimEnd() + "\n\n" : "") + caddyBlock(domain, port) + "\n";
  return { text: next, changed: next !== text, demo };
}

/** A hostname a certificate can be issued for: letters, digits, hyphens, at least one dot. */
export function validDomain(name: string): boolean {
  return name.length <= 253 && /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/i.test(name);
}

/** What `ducter domain` needs from the machine; tests pass a fake. */
export interface DomainSys {
  platform: string;
  isRoot: boolean;
  /** The A and AAAA records of a name (empty: it doesn't resolve). */
  resolve(name: string): Promise<string[]>;
  /** This machine's public addresses as the internet sees them (empty: couldn't tell). */
  publicIps(): Promise<string[]>;
  which(cmd: string): string | null;
  run(cmd: string[], o?: { input?: string; timeoutMs?: number }): Promise<{ code: number; out: string }>;
  read(path: string): string | undefined;
  /** The program listening on a TCP port: null when free, "" when busy but unnamed. */
  listener(port: number): Promise<string | null>;
  /** GET <url>: its HTTP status, or 0 when no answer came (refused, TLS or DNS failure, timeout). */
  status(url: string): Promise<number>;
  /** Where `ducter service install` wrote the unit (Linux). */
  unitPath?: string;
  sleep(ms: number): Promise<void>;
}

export interface Step {
  id: "ducter" | "dns" | "ports" | "caddy" | "site" | "https" | "address" | "remove";
  ok: boolean;
  detail: string;
}

export interface DomainResult {
  ok: boolean;
  domain?: string;
  address?: string;
  publicIps?: string[];
  steps: Step[];
  /** On failure: what went wrong and the exact command to run next. */
  error?: string;
  next?: string;
  /** The last status https://<domain>/health gave (0: no answer, no certificate yet). */
  httpStatus?: number;
  pair?: { code: string; expiresAt: string; address: string; link: string; command: string };
}

interface Opts {
  t: T;
  style: Style;
  sys: DomainSys;
  dataDir: string;
  port: number;
  json: boolean;
  domain?: string;
  remove?: boolean;
  print?: boolean;
  dnsCheck?: boolean;
  /** Prints the pair code the human way (and waits for the device); JSON carries it instead. */
  pair?: () => Promise<number>;
  /** Seconds to wait for HTTPS (certificate issuance). */
  waitS?: number;
}

/** The Caddyfile this platform's Caddy reads. */
async function caddyfilePath(sys: DomainSys): Promise<string> {
  if (sys.platform !== "darwin") return LINUX_CADDYFILE;
  const r = sys.which("brew") ? await sys.run(["brew", "--prefix"]) : { code: 1, out: "" };
  return join(r.code === 0 && r.out.trim() ? r.out.trim() : "/opt/homebrew", "etc", "Caddyfile");
}

/** A command as root: as is when we are root, through sudo when it is there, else null. */
function asRoot(sys: DomainSys, cmd: string[]): string[] | null {
  if (sys.isRoot || sys.platform === "darwin") return cmd; // Homebrew runs as the user
  return sys.which("sudo") ? ["sudo", ...cmd] : null;
}

export async function cmdDomain(o: Opts): Promise<number> {
  const { t, style, sys } = o;
  const res: DomainResult = { ok: false, steps: [] };
  const say = (s: string) => !o.json && console.log(s);
  const step = (id: Step["id"], ok: boolean, detail: string) => {
    res.steps.push({ id, ok, detail });
    say(`  ${ok ? style.ok("✓") : style.bad("✗")} ${detail}`);
  };
  const fail = (error: string, next: string, code = 1) => {
    res.error = error;
    res.next = next;
    if (o.json) console.log(JSON.stringify(res, null, 2));
    else console.log(`\n  ${error}\n\n  ${t("domain.next")}\n    ${style.bold(next)}\n`);
    return code;
  };
  const done = (code = 0) => {
    if (o.json) console.log(JSON.stringify(res, null, 2));
    return code;
  };
  if (sys.platform !== "linux" && sys.platform !== "darwin") return fail(t("domain.platform"), "ducter pair");

  // ---- remove ----
  if (o.remove) {
    const cf = await caddyfilePath(sys);
    const r = await removeDucterSite(sys, cf);
    if (r.error === "root") return fail(t("domain.needsRoot"), "sudo ducter domain --remove");
    if (r.error) return fail(t("domain.writeFailed", { file: cf, reason: r.error }), "sudo ducter domain --remove");
    step("remove", true, r.domains.length ? t("domain.removed", { domains: r.domains.join(", "), file: cf }) : t("domain.nothingToRemove", { file: cf }));
    rmSync(join(o.dataDir, "public-url"), { force: true });
    res.ok = true;
    say("  " + style.dim(t("domain.removedNote")));
    return done();
  }

  const domain = o.domain?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!domain || !validDomain(domain)) return fail(domain ? t("domain.badName", { name: domain }) : t("domain.usage"), "ducter domain ducter.example.com", 2);
  res.domain = domain;
  res.address = `https://${domain}`;
  if (o.print) {
    if (o.json) return console.log(JSON.stringify({ ok: true, domain, block: caddyBlock(domain, o.port) }, null, 2)), 0;
    return console.log(caddyBlock(domain, o.port)), 0;
  }
  say(`\n  ${style.bold(t("domain.title", { domain }))}\n`);

  // 1. Ducter answers here: Caddy only forwards to it. An installed service that isn't running
  // is started (and enabled at boot) first.
  const local = `http://127.0.0.1:${o.port}/health`;
  let alive = (await sys.status(local)) === 200;
  const unit = sys.platform === "linux" ? (sys.unitPath ?? unitPath()) : undefined;
  if (!alive && unit && sys.read(unit) !== undefined) {
    say("  " + style.dim(t("domain.ducterStarting")));
    await sys.run(["systemctl", "--user", "enable", "--now", "ducter.service"]);
    for (let i = 0; i < 10 && !alive; i++) {
      await sys.sleep(1500);
      alive = (await sys.status(local)) === 200;
    }
  }
  if (!alive) {
    step("ducter", false, t("domain.ducterDown", { port: o.port }));
    if (unit && sys.read(unit) !== undefined) return fail(t("domain.ducterBroken"), "journalctl --user -u ducter -n 50 --no-pager");
    return fail(t("domain.ducterDown.why"), sys.platform === "linux" ? "ducter service install" : "ducter up");
  }
  step("ducter", true, t("domain.ducterUp", { port: o.port }));

  // 2. DNS: the name points at this machine, or a certificate can never be issued.
  const [addrs, mine] = await Promise.all([sys.resolve(domain), sys.publicIps()]);
  res.publicIps = mine;
  const ip = mine.find((a) => !a.includes(":")) ?? mine[0];
  const record = (a?: string) => (a?.includes(":") ? "AAAA" : "A");
  if (o.dnsCheck !== false) {
    if (!addrs.length) {
      step("dns", false, t("domain.dnsNone", { domain }));
      return fail(ip ? t("domain.dnsAdd", { domain, type: record(ip), ip }) : t("domain.dnsAddNoIp", { domain }), `ducter domain ${domain}`);
    }
    if (mine.length && !addrs.some((a) => mine.includes(a))) {
      step("dns", false, t("domain.dnsElsewhere", { domain, addrs: addrs.join(", ") }));
      return fail(t("domain.dnsFix", { domain, type: record(ip), ip: ip ?? "", addrs: addrs.join(", ") }), `ducter domain ${domain}`);
    }
    step("dns", true, mine.length ? t("domain.dnsOk", { domain, addrs: addrs.join(", ") }) : t("domain.dnsUnverified", { domain, addrs: addrs.join(", ") }));
  } else step("dns", true, t("domain.dnsSkipped"));

  // 3. Ports 80 and 443: Caddy needs both (80 for the certificate check, 443 to serve).
  for (const p of [80, 443]) {
    const who = await sys.listener(p);
    // Unnamed (not root, so ss can't say whose) with Caddy installed: most likely Caddy itself.
    if (who !== null && !/caddy/i.test(who) && !(who === "" && sys.which("caddy"))) {
      step("ports", false, t("domain.portBusy", { port: p, who: who || "?" }));
      return fail(t("domain.portBusy.why", { port: p, who: who || t("domain.another") }), `ducter domain ${domain} --print`);
    }
  }
  step("ports", true, t("domain.portsOk"));

  // 4. Caddy.
  if (!sys.which("caddy")) {
    if (sys.platform === "darwin") {
      if (!sys.which("brew")) return fail(t("domain.noBrew"), "brew install caddy");
      say("  " + style.dim(t("domain.installing")));
      const r = await sys.run(["brew", "install", "caddy"], { timeoutMs: 600_000 });
      if (r.code !== 0) return fail(t("domain.installFailed", { reason: firstLine(r.out) }), "brew install caddy");
    } else {
      if (!sys.which("apt-get")) return fail(t("domain.noApt"), `ducter domain ${domain} --print`);
      const cmds = [
        ["apt-get", "install", "-y", "debian-keyring", "debian-archive-keyring", "apt-transport-https", "curl", "gnupg"],
        ["sh", "-c", "curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg"],
        ["sh", "-c", "curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list"],
        ["apt-get", "update"],
        ["apt-get", "install", "-y", "caddy"],
      ];
      say("  " + style.dim(t("domain.installing")));
      for (const c of cmds) {
        const cmd = asRoot(sys, c);
        if (!cmd) return fail(t("domain.needsRoot"), `sudo ducter domain ${domain}`);
        const r = await sys.run(cmd, { timeoutMs: 600_000 });
        if (r.code !== 0) return fail(t("domain.installFailed", { reason: firstLine(r.out) }), `ducter domain ${domain}`);
      }
    }
    step("caddy", true, t("domain.caddyInstalled"));
  } else step("caddy", true, t("domain.caddyThere"));

  // 5. Ducter's site in the Caddyfile, then Caddy running it.
  const cf = await caddyfilePath(sys);
  const before = sys.read(cf) ?? "";
  const next = withDucterBlock(before, domain, o.port);
  if (next.changed) {
    if (next.demo) {
      const bak = asRoot(sys, ["cp", cf, `${cf}.before-ducter`]);
      if (bak) await sys.run(bak);
    }
    const tee = asRoot(sys, ["tee", cf]);
    if (!tee) return fail(t("domain.needsRoot"), `sudo ducter domain ${domain}`);
    const w = await sys.run(tee, { input: next.text });
    if (w.code !== 0) return fail(t("domain.writeFailed", { file: cf, reason: firstLine(w.out) }), `sudo ducter domain ${domain}`);
    const v = await sys.run(asRoot(sys, ["caddy", "validate", "--config", cf, "--adapter", "caddyfile"])!);
    if (v.code !== 0) return fail(t("domain.invalid", { file: cf, reason: lastLine(v.out) }), `caddy validate --config ${cf} --adapter caddyfile`);
    step("site", true, next.demo ? t("domain.siteDemo", { file: cf }) : t("domain.siteWritten", { file: cf }));
  } else step("site", true, t("domain.siteThere", { file: cf }));
  if (!(await startCaddy(sys, next.changed))) return fail(t("domain.caddyDown"), sys.platform === "linux" ? "journalctl -u caddy -n 50" : "brew services info caddy");

  // 6. HTTPS answers: the certificate is issued and the proxy reaches Ducter.
  say("  " + style.dim(t("domain.waiting")));
  // What answers tells which layer is broken: nothing (no certificate yet: DNS, ports 80/443,
  // the firewall), 502/503/504 (HTTPS works, Ducter behind it doesn't answer), 200 (all good).
  const tries = Math.max(1, Math.round((o.waitS ?? 60) / 3));
  let code = 0;
  for (let i = 0; i < tries && code !== 200; i++) {
    code = await sys.status(`https://${domain}/health`);
    if (code !== 200 && i < tries - 1) await sys.sleep(3000);
  }
  res.httpStatus = code;
  if (code === 502 || code === 503 || code === 504) {
    step("https", false, t("domain.httpsUpstream", { domain, code }));
    return fail(t("domain.httpsUpstream.why", { port: o.port }), sys.platform === "linux" ? "systemctl --user restart ducter && ducter doctor" : "ducter up");
  }
  if (code !== 200) {
    step("https", false, code ? t("domain.httpsOdd", { domain, code }) : t("domain.httpsNo", { domain }));
    return fail(t("domain.httpsNo.why", { ip: ip ?? t("domain.thisServer") }), `ducter domain ${domain}`);
  }
  step("https", true, t("domain.httpsOk", { domain }));

  // 7. The address pairing hands out from now on.
  mkdirSync(o.dataDir, { recursive: true });
  writeFileSync(join(o.dataDir, "public-url"), `https://${domain}\n`);
  step("address", true, t("domain.saved"));
  res.ok = true;
  if (o.json) {
    res.pair = newPairing(o.dataDir, o.port);
    return done();
  }
  console.log("");
  return o.pair ? o.pair() : 0;
}

/** Takes Ducter's site out of the Caddyfile and reloads Caddy; other sites stay as they are. */
export async function removeDucterSite(sys: DomainSys, cf: string): Promise<{ domains: string[]; error?: string }> {
  const before = sys.read(cf);
  const stripped = before === undefined ? undefined : stripDucterBlocks(before);
  if (!stripped?.domains.length) return { domains: [] };
  const tee = asRoot(sys, ["tee", cf]);
  if (!tee) return { domains: stripped.domains, error: "root" };
  const w = await sys.run(tee, { input: stripped.text });
  if (w.code !== 0) return { domains: stripped.domains, error: firstLine(w.out) };
  await reloadCaddy(sys);
  return { domains: stripped.domains };
}

/** Where this platform's Caddy reads its Caddyfile (for uninstall). */
export const caddyfileFor = caddyfilePath;

async function reloadCaddy(sys: DomainSys): Promise<boolean> {
  if (sys.platform === "darwin") return (await sys.run(["brew", "services", "restart", "caddy"])).code === 0;
  const r = await sys.run(asRoot(sys, ["systemctl", "reload", "caddy"]) ?? ["false"]);
  if (r.code === 0) return true;
  return (await sys.run(asRoot(sys, ["systemctl", "restart", "caddy"]) ?? ["false"])).code === 0;
}

/** Caddy on and enabled at boot; reloaded when its file changed. */
async function startCaddy(sys: DomainSys, changed: boolean): Promise<boolean> {
  if (sys.platform === "darwin") {
    const info = await sys.run(["brew", "services", "info", "caddy", "--json"]);
    if (!changed && /"running":\s*true/.test(info.out)) return true;
    return reloadCaddy(sys);
  }
  const active = (await sys.run(["systemctl", "is-active", "caddy"])).out.trim() === "active";
  if (!active) return (await sys.run(asRoot(sys, ["systemctl", "enable", "--now", "caddy"]) ?? ["false"])).code === 0;
  return changed ? reloadCaddy(sys) : true;
}

const firstLine = (s: string) => s.trim().split("\n")[0] ?? "";
const lastLine = (s: string) => s.trim().split("\n").pop() ?? "";

// ---------- the real machine ----------

export function realDomainSys(): DomainSys {
  const which = (c: string) => Bun.which(c);
  const run: DomainSys["run"] = async (cmd, o = {}) => {
    try {
      const p = Bun.spawn(cmd, { stdin: o.input !== undefined ? new TextEncoder().encode(o.input) : "ignore", stdout: "pipe", stderr: "pipe" });
      const timer = setTimeout(() => p.kill(), o.timeoutMs ?? 30_000);
      const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
      const code = await p.exited;
      clearTimeout(timer);
      return { code: p.signalCode ? -1 : code, out: code === 0 ? out : err || out };
    } catch (e) {
      return { code: -1, out: e instanceof Error ? e.message : String(e) };
    }
  };
  const get = async (url: string, ms: number) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
      return r.ok ? (await r.text()).trim() : "";
    } catch {
      return "";
    }
  };
  return {
    platform: process.platform,
    isRoot: process.getuid?.() === 0,
    which,
    run,
    sleep: (ms) => Bun.sleep(ms),
    read: (p) => {
      try {
        return existsSync(p) ? readFileSync(p, "utf8") : undefined;
      } catch {
        return undefined;
      }
    },
    async resolve(name) {
      const [a, aaaa] = await Promise.all([dns.resolve4(name).catch(() => [] as string[]), dns.resolve6(name).catch(() => [] as string[])]);
      return [...a, ...aaaa];
    },
    async publicIps() {
      const [v4, v6] = await Promise.all([get("https://api.ipify.org", 4000), get("https://api6.ipify.org", 3000)]);
      return [...new Set([v4, v6].filter((x) => /^[\d.]+$|^[0-9a-f:]+$/i.test(x)))];
    },
    async listener(port) {
      if (process.platform === "darwin") {
        const r = await run(["lsof", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]);
        const line = r.out.trim().split("\n")[1];
        return line ? (line.split(/\s+/)[0] ?? "") : null;
      }
      const r = await run(["ss", "-Hltnp", `sport = :${port}`]);
      if (r.code !== 0) return null; // no ss: say nothing rather than guess
      if (!r.out.trim()) return null;
      return /users:\(\("([^"]+)"/.exec(r.out)?.[1] ?? "";
    },
    async status(url) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "manual" });
        return r.status;
      } catch {
        return 0;
      }
    },
  };
}
