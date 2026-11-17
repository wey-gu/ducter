// `ducter tailscale`: an address on your own tailnet (D265). Tailscale's `serve` puts HTTPS in
// front of this Ducter at https://<machine>.<tailnet>.ts.net, reachable only from devices in
// that tailnet: no domain, no DNS record, no public port. Then a fresh pair code there.
//
//   ducter tailscale            check Tailscale is up and can issue HTTPS, serve 443 → Ducter, wait, pair
//   ducter tailscale --remove   stop serving Ducter on 443 (Tailscale itself stays)
//
// Every step checks before it changes anything, so running it again is safe. Ducter keeps
// listening on 127.0.0.1 only; `tailscale serve` connects from loopback but passes the ts.net
// Host and adds X-Forwarded-For and Tailscale-User-Login, so its requests count as remote and
// need a paired device (D54): tailnet identity adds to pairing, never replaces it.
import { existsSync, mkdirSync } from "node:fs";
import { addWay, removeKind } from "@ducter/core/src/reach-book.ts";
import { join } from "node:path";
import type { Style } from "./doctor.ts";
import { ensureLocalDucter, realDomainSys, type DomainSys } from "./domain.ts";
import type { T } from "./i18n.ts";
import { newPairing, type Pairing } from "./remote.ts";

/** Where the Mac App Store and standalone Tailscale apps keep their CLI (not on PATH by default). */
export const MAC_APP_CLI = "/Applications/Tailscale.app/Contents/MacOS/Tailscale";
export const ADMIN_DNS = "https://login.tailscale.com/admin/dns";
export const ADMIN_MACHINES = "https://login.tailscale.com/admin/machines";
/** How long `tailscale serve --bg` may take; past it, it is waiting on an interactive "enable" flow. */
export const SERVE_TIMEOUT_S = 25;

/** The link Tailscale prints when a feature must be turned on for the tailnet first (".../f/serve?node=…", ".../f/https?…"). */
export function enableLink(out: string): string | undefined {
  return out.match(/https:\/\/login\.tailscale\.com\/f\/[^\s'"]+/)?.[0];
}

/** What `ducter tailscale` needs from the machine; tests pass a fake that records every command. */
export type TailscaleSys = Pick<DomainSys, "platform" | "which" | "run" | "read" | "status" | "sleep" | "unitPath"> & {
  exists(path: string): boolean;
};

/** The parts of `tailscale status --json` (ipn/ipnstate.Status) this reads. */
interface StatusJson {
  BackendState?: string;
  Self?: { DNSName?: string; HostName?: string } | null;
  CertDomains?: string[] | null;
  MagicDNSSuffix?: string;
  CurrentTailnet?: { Name?: string; MagicDNSSuffix?: string; MagicDNSEnabled?: boolean } | null;
}

export interface Tailnet {
  /** ipn.State: Running, NeedsLogin, NeedsMachineAuth, Stopped, Starting, NoState. */
  state: string;
  /** This machine's MagicDNS name without the trailing dot: hel.tail1234.ts.net. */
  dnsName?: string;
  tailnet?: string;
  magicDNS: boolean;
  /** The control plane will issue a certificate for dnsName (HTTPS Certificates is on). */
  https: boolean;
}

/** Reads `tailscale status --json`; undefined when it isn't that. */
export function parseStatus(text: string): Tailnet | undefined {
  let j: StatusJson;
  try {
    j = JSON.parse(text) as StatusJson;
  } catch {
    return undefined;
  }
  if (!j || typeof j !== "object" || typeof j.BackendState !== "string") return undefined;
  const dnsName = j.Self?.DNSName?.trim().replace(/\.$/, "").toLowerCase() || undefined;
  const certs = (j.CertDomains ?? []).map((d) => d.toLowerCase().replace(/\.$/, ""));
  return {
    state: j.BackendState,
    ...(dnsName ? { dnsName } : {}),
    ...(j.CurrentTailnet?.Name ? { tailnet: j.CurrentTailnet.Name } : {}),
    magicDNS: j.CurrentTailnet?.MagicDNSEnabled ?? Boolean(j.MagicDNSSuffix || dnsName),
    https: Boolean(dnsName && certs.includes(dnsName)),
  };
}

/** What `tailscale serve status --json` says port 443's root forwards to, for this name. */
export function served443(text: string, dnsName: string): string | undefined {
  try {
    const j = JSON.parse(text) as { Web?: Record<string, { Handlers?: Record<string, { Proxy?: string; Path?: string; Text?: string }> }> };
    const h = j?.Web?.[`${dnsName}:443`]?.Handlers?.["/"];
    return h ? (h.Proxy ?? (h.Path ? `path ${h.Path}` : h.Text !== undefined ? "text" : "?")) : undefined;
  } catch {
    return undefined;
  }
}

/** A handler that is Ducter's own: a proxy to this port on loopback. */
export function isOurs(proxy: string | undefined, port: number): boolean {
  if (!proxy) return false;
  const s = /^[a-z+]+:\/\//i.test(proxy) ? proxy : `http://${/^\d+$/.test(proxy) ? `127.0.0.1:${proxy}` : proxy}`;
  try {
    const u = new URL(s);
    return /^(127\.0\.0\.1|localhost)$/.test(u.hostname) && u.port === String(port) && (u.pathname === "/" || u.pathname === "");
  } catch {
    return false;
  }
}

/** The tailscale CLI here: on PATH, else inside the Mac app. */
export function findTailscale(sys: Pick<TailscaleSys, "platform" | "which" | "exists">): string | null {
  return sys.which("tailscale") ?? (sys.platform === "darwin" && sys.exists(MAC_APP_CLI) ? MAC_APP_CLI : null);
}

/** Is this machine in a tailnet right now? For `ducter pair` and the install's last lines; never changes anything. */
export async function detectTailnet(sys: TailscaleSys = realTailscaleSys()): Promise<Tailnet | undefined> {
  const bin = findTailscale(sys);
  if (!bin) return undefined;
  const r = await sys.run([bin, "status", "--json"], { timeoutMs: 5000 });
  return parseStatus(r.out) ?? { state: "NoState", magicDNS: false, https: false };
}

const accessDenied = (out: string) => /access denied|--operator|permission denied/i.test(out);
const firstLine = (s: string) => s.trim().split("\n")[0] ?? "";

export interface TsStep {
  id: "ducter" | "tailscale" | "tailnet" | "https" | "serve" | "reach" | "address" | "remove";
  ok: boolean;
  detail: string;
}

export interface TailscaleResult {
  ok: boolean;
  address?: string;
  dnsName?: string;
  steps: TsStep[];
  error?: string;
  next?: string;
  /** The last status https://<name>/health gave (0: no answer from this machine). */
  httpStatus?: number;
  /** Set when serve is on but this machine couldn't open its own address (its DNS skips MagicDNS). */
  warning?: string;
  pair?: Pairing;
}

interface Opts {
  t: T;
  style: Style;
  sys: TailscaleSys;
  dataDir: string;
  port: number;
  json: boolean;
  remove?: boolean;
  pair?: () => Promise<number>;
  /** Seconds to wait for https://<name>/health (the first certificate takes a few seconds). */
  waitS?: number;
}

export async function cmdTailscale(o: Opts): Promise<number> {
  const { t, style, sys } = o;
  const res: TailscaleResult = { ok: false, steps: [] };
  const say = (s: string) => !o.json && console.log(s);
  const step = (id: TsStep["id"], ok: boolean, detail: string) => {
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
  if (sys.platform !== "linux" && sys.platform !== "darwin") return fail(t("ts.platform"), "ducter pair");

  const bin = findTailscale(sys);
  const install = sys.platform === "darwin" ? "https://tailscale.com/download/mac" : "curl -fsSL https://tailscale.com/install.sh | sh";
  if (!bin) {
    step("tailscale", false, t("ts.missing"));
    return fail(t("ts.missing.why"), install);
  }
  const ts = (args: string[], timeoutMs = 20_000) => sys.run([bin, ...args], { timeoutMs });
  const status = parseStatus((await ts(["status", "--json"], 5000)).out);

  // ---- remove ----
  if (o.remove) {
    const name = status?.dnsName;
    const now = name ? served443((await ts(["serve", "status", "--json"], 5000)).out, name) : undefined;
    if (name && now !== undefined && !isOurs(now, o.port)) {
      step("remove", true, t("ts.notOurs", { name, what: now }));
    } else if (name && now === undefined) {
      step("remove", true, t("ts.nothingToRemove", { name }));
    } else {
      const r = await ts(["serve", "--https=443", "off"]);
      if (r.code !== 0 && accessDenied(r.out)) return fail(t("ts.operator"), "sudo tailscale set --operator=$USER");
      if (r.code !== 0 && !/not found|no serve config|nothing/i.test(r.out)) return fail(t("ts.serveFailed", { reason: firstLine(r.out) }), "tailscale serve status");
      step("remove", true, t("ts.removed", { name: name ?? "ts.net" }));
    }
    // D293: only the tailnet's own way leaves the book; a domain or a tunnel stays.
    removeKind(o.dataDir, "tailnet");
    res.ok = true;
    say("  " + style.dim(t("ts.removedNote")));
    return done();
  }

  say(`\n  ${style.bold(t("ts.title"))}\n`);

  // 1. Ducter answers here: serve only forwards to it.
  const here = await ensureLocalDucter(sys, o.port, () => say("  " + style.dim(t("domain.ducterStarting"))));
  if (!here.alive) {
    step("ducter", false, t("domain.ducterDown", { port: o.port }));
    if (here.installed) return fail(t("domain.ducterBroken"), "journalctl --user -u ducter -n 50 --no-pager");
    return fail(t("domain.ducterDown.why"), sys.platform === "linux" ? "ducter service install" : "ducter up");
  }
  step("ducter", true, t("domain.ducterUp", { port: o.port }));

  // 2. Tailscale is up and this machine is in a tailnet.
  if (!status) {
    step("tailscale", false, t("ts.daemonDown"));
    return fail(t("ts.daemonDown.why"), sys.platform === "linux" ? "sudo systemctl enable --now tailscaled" : "open -a Tailscale");
  }
  if (status.state !== "Running" || !status.dnsName) {
    // Each state says what it is in plain words; on a Mac the app is where you sign in or turn it on.
    const mac = sys.platform === "darwin";
    const up = mac ? "open -a Tailscale" : "sudo tailscale up";
    if (status.state === "NeedsLogin") {
      step("tailscale", false, t("ts.needsLogin"));
      return fail(t(mac ? "ts.needsLogin.mac" : "ts.needsLogin.why"), up);
    }
    if (status.state === "NeedsMachineAuth") {
      step("tailscale", false, t("ts.needsApproval"));
      return fail(t("ts.needsApproval.why"), ADMIN_MACHINES);
    }
    if (status.state === "Stopped") {
      step("tailscale", false, t("ts.stopped"));
      return fail(t("ts.stopped.why"), up);
    }
    step("tailscale", false, t("ts.notRunning", { state: status.state }));
    return fail(t("ts.notRunning.why"), up);
  }
  res.dnsName = status.dnsName;
  res.address = `https://${status.dnsName}`;
  step("tailnet", true, t("ts.inTailnet", { name: status.dnsName }));

  // 3. HTTPS is possible: MagicDNS and HTTPS Certificates on in the admin console. Without it,
  // `tailscale serve` would stop to ask in a browser, so this says so first.
  if (!status.magicDNS || !status.https) {
    step("https", false, t("ts.noCerts"));
    return fail(t("ts.noCerts.why", { url: ADMIN_DNS }), "ducter tailscale");
  }
  step("https", true, t("ts.certsOk"));

  // 4. Port 443 on this name forwards to Ducter (and isn't something else's).
  const now = served443((await ts(["serve", "status", "--json"], 5000)).out, status.dnsName);
  if (now !== undefined && !isOurs(now, o.port)) {
    step("serve", false, t("ts.busy", { name: status.dnsName, what: now }));
    return fail(t("ts.busy.why", { name: status.dnsName }), "tailscale serve status");
  }
  if (now === undefined) {
    const serveCmd = `tailscale serve --bg --https=443 http://127.0.0.1:${o.port}`;
    const r = await ts(["serve", "--bg", "--https=443", `http://127.0.0.1:${o.port}`], SERVE_TIMEOUT_S * 1000);
    if (r.code !== 0) {
      if (accessDenied(r.out)) {
        step("serve", false, t("ts.denied"));
        return fail(t("ts.operator"), "sudo tailscale set --operator=$USER");
      }
      // Serve stopped to ask for a feature to be turned on (its "enable" flow): give the link, never hang.
      const link = enableLink(r.out);
      if (link) {
        step("serve", false, t("ts.enable"));
        return fail(t("ts.enable.why"), link);
      }
      if (r.code === -1) {
        step("serve", false, t("ts.serveHung", { s: SERVE_TIMEOUT_S }));
        return fail(t("ts.serveHung.why"), serveCmd);
      }
      step("serve", false, t("ts.serveFailed", { reason: firstLine(r.out) }));
      return fail(t("ts.serveFailed", { reason: firstLine(r.out) }), serveCmd);
    }
    step("serve", true, t("ts.served", { name: status.dnsName, port: o.port }));
  } else step("serve", true, t("ts.servedAlready", { name: status.dnsName, port: o.port }));

  // 5. The address answers. The first request gets the certificate, which takes a few seconds.
  say("  " + style.dim(t("ts.waiting")));
  const tries = Math.max(1, Math.round((o.waitS ?? 45) / 3));
  let code = 0;
  for (let i = 0; i < tries && code !== 200; i++) {
    code = await sys.status(`${res.address}/health`);
    if (code !== 200 && i < tries - 1) await sys.sleep(3000);
  }
  res.httpStatus = code;
  if (code === 502 || code === 503 || code === 504) {
    step("reach", false, t("domain.httpsUpstream", { domain: status.dnsName, code }));
    return fail(t("ts.upstream.why", { port: o.port }), sys.platform === "linux" ? "systemctl --user restart ducter && ducter doctor" : "ducter up");
  }
  if (code === 200) step("reach", true, t("domain.httpsOk", { domain: status.dnsName }));
  else {
    // Serving is on, but this machine couldn't open its own name: often a server whose DNS
    // doesn't go through MagicDNS (--accept-dns=false). Devices in the tailnet still can.
    res.warning = t("ts.selfUnreachable", { name: status.dnsName });
    say(`  ${style.dim("·")} ${res.warning}`);
  }

  // 6. The address pairing hands out from now on.
  // D293: a way of its own in the book, beside a domain or a tunnel (never over them).
  mkdirSync(o.dataDir, { recursive: true });
  addWay(o.dataDir, "tailnet", res.address);
  step("address", true, t("domain.saved"));
  say("  " + style.dim(t("ts.tailnetOnly")));
  res.ok = true;
  if (o.json) {
    res.pair = newPairing(o.dataDir, o.port);
    return done();
  }
  console.log("");
  return o.pair ? o.pair() : 0;
}

// ---------- the real machine ----------

export function realTailscaleSys(): TailscaleSys {
  return { ...realDomainSys(), exists: (p) => existsSync(p) };
}
