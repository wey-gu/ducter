// 在哪儿都能用 / From anywhere (D228): a home with no public address reached at the person's own
// domain, through their own Cloudflare account and a named tunnel that Ducter runs.
//
// - The guided way: 让 Ducter 帮我设好 / Set it up for me opens one task on the home (D169's
//   pattern: the person started it). Its agent runs the steps below with `ducter anywhere step
//   <login|create|run>`; the home does each step with cloudflared and keeps the state, so the
//   card's list ticks by itself whatever the agent says. Signing in is the person's (a link, a
//   QR); creating the tunnel and its DNS record in their account waits for their Go.
// - The dashboard way: a tunnel the person made in Cloudflare's dashboard, given as a token and
//   the hostname it serves (`ducter anywhere on --token … --hostname …`).
// - An address set up some other way (D143's `ducter domain`, DUCTER_PUBLIC_URL) always wins;
//   then there is nothing to run.
//
// Once the address answers from outside (HTTPS and a WebSocket, through Cloudflare), it becomes the
// home's public address (<dataDir>/public-url, where `ducter domain` writes it), so pairing codes
// carry it. The tunnel process lives beside Ducter (detached, or its own systemd user unit), so an
// update doesn't cut it; a starting Ducter adopts it, or starts it again.
//
// The tunnel only carries what pairing already guards (D54/D57): cloudflared connects from
// loopback but sends the outside Host and Cf-Connecting-IP / X-Forwarded-For, so every request
// through it counts as remote and needs a device token (auth.ts isLocalRequest; research/67).
// Cloudflare ends TLS at its edge. Credentials (cert.pem, the tunnel's JSON, a token) stay in
// <dataDir>/anywhere (0700, files 0600 or stricter) and are never logged.
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Anywhere, AnywhereReason, AnywhereSetup, AnywhereStepCmd, AnywhereStepId, AnywhereStepResult } from "@ducter/protocol";

/** The cloudflared Ducter downloads when the computer has none: pinned, each file's SHA-256 checked. */
export const CLOUDFLARED = {
  version: "2026.10.5",
  base: "https://github.com/cloudflare/cloudflared/releases/download",
  assets: {
    "darwin-arm64": { file: "cloudflared-darwin-arm64.tgz", sha256: "184c7d4f5f977348243a6d7ca8f6cf6073b9b2746cfe8c1fe15aa59e9a522bf0", bin: "2b23964528ddcd641c1449275df8b5b51e3c7193b5257919846331bc5bc13b0f" },
    "darwin-x64": { file: "cloudflared-darwin-amd64.tgz", sha256: "6699392fed92367808c248c2d90bed66e49bbf66e1b4ee3e4141230f3f7391b3", bin: "cb09afb9b4d0a4730de477ac710aebb6107568930a8345775629bf264f70c284" },
    "linux-x64": { file: "cloudflared-linux-amd64", sha256: "e1bc0cf084fd9e590554fe769a86b1db46701c3f847a43d902f7b974a4e16298", bin: "e1bc0cf084fd9e590554fe769a86b1db46701c3f847a43d902f7b974a4e16298" },
    "linux-arm64": { file: "cloudflared-linux-arm64", sha256: "72e0d05a67e09da87cf495e409a28c3cc5994dd23fc66a982eebea6a55923b7d", bin: "72e0d05a67e09da87cf495e409a28c3cc5994dd23fc66a982eebea6a55923b7d" },
  } as Record<string, { file: string; sha256: string; bin: string }>,
};

export const CHECK_PATH = "/.well-known/ducter-anywhere";
export const STEPS: AnywhereStepId[] = ["get", "login", "name", "create", "dns", "run", "check", "use"];

/** What runs the tunnel: a process handle that outlives Ducter. */
export interface TunnelHandle {
  pid?: number;
  unit?: string; // systemd --user transient unit
}

export interface TunnelStart {
  bin: string;
  port: number;
  metricsPort: number;
  logFile: string;
  configFile: string;
  /** A file holding TUNNEL_TOKEN=… (0600): a dashboard tunnel's token, never on a command line. */
  envFile?: string;
}

/** `cloudflared tunnel login` while it runs: the link it printed, and its end. */
export interface LoginRun {
  url: Promise<{ url: string; opened: boolean } | undefined>;
  done: Promise<number>;
  stop(): void;
}

/** The system seams (fakes in tests): cloudflared, its process, its metrics, the network. */
export interface TunnelSys {
  /** cloudflared ready to run: DUCTER_CLOUDFLARED, Ducter's own copy, one on PATH, else downloaded. */
  ensure(onGetting: () => void): Promise<{ bin: string } | { error: AnywhereReason; detail?: string }>;
  /** `cloudflared tunnel login` with HOME at dir (so cert.pem lands in dir/.cloudflared, not the person's own). */
  login(bin: string, dir: string): LoginRun;
  /** A short cloudflared command (create, route); its exit code and everything it printed. */
  exec(bin: string, args: string[]): Promise<{ code: number; out: string }>;
  start(s: TunnelStart): Promise<TunnelHandle>;
  alive(h: TunnelHandle): Promise<boolean>;
  stop(h: TunnelHandle): Promise<void>;
  /** cloudflared holds a connection to Cloudflare (/ready on its metrics server). */
  ready(metricsPort: number): Promise<boolean>;
  /** The hostname resolves in public DNS (asked over HTTPS, so no negative answer is cached
   *  here). undefined: DNS over HTTPS can't be reached from this network. */
  resolves(host: string): Promise<boolean | undefined>;
  /** Opens a WebSocket to url and returns the first message (the self-check's answer). */
  wsFirst(url: string): Promise<string | undefined>;
  freePort(): Promise<number>;
  fetch: typeof fetch;
}

type StepState = AnywhereSetup["steps"][number]["state"];
interface Saved {
  /** The tunnel should run. */
  on: boolean;
  /** setup: made by the guided setup (credentials file); token: a dashboard tunnel's token. */
  how?: "setup" | "token";
  hostname?: string;
  tunnelId?: string;
  port: number;
  since?: string;
  handle?: TunnelHandle;
  metricsPort?: number;
  check: string;
  /** This home wrote <dataDir>/public-url for it (so off takes it out again). */
  wrotePublic?: string;
  setup?: {
    taskId?: string;
    steps: Partial<Record<AnywhereStepId, { state: StepState; reason?: AnywhereReason; detail?: string }>>;
    zone?: string;
    hostname?: string;
    /** The hostname the person said Go to (create + DNS in their account). */
    approved?: string;
    asked?: { hostname: string; decisionId: string };
  };
}

export const anywhereDir = (dataDir: string) => join(dataDir, "anywhere");
const stateFile = (dataDir: string) => join(anywhereDir(dataDir), "state.json");
const certFile = (dataDir: string) => join(anywhereDir(dataDir), ".cloudflared", "cert.pem");
const credFile = (dataDir: string) => join(anywhereDir(dataDir), "tunnel.json");
const tokenEnv = (dataDir: string) => join(anywhereDir(dataDir), "token.env");
const configFile = (dataDir: string) => join(anywhereDir(dataDir), "cloudflared.yml");
const logFile = (dataDir: string) => join(anywhereDir(dataDir), "cloudflared.log");
const publicFile = (dataDir: string) => join(dataDir, "public-url");

function readSaved(dataDir: string): Saved | undefined {
  try {
    const s = JSON.parse(readFileSync(stateFile(dataDir), "utf8")) as Saved;
    return typeof s.on === "boolean" && typeof s.check === "string" ? s : undefined;
  } catch {
    return undefined;
  }
}

function writeSaved(dataDir: string, s: Saved) {
  mkdirSync(anywhereDir(dataDir), { recursive: true, mode: 0o700 });
  const tmp = stateFile(dataDir) + ".tmp";
  writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, stateFile(dataDir));
}

/** The zone (domain) a cert.pem from `cloudflared tunnel login` is for, asked of Cloudflare's API
 *  with the token inside it; undefined when it can't tell (research/67 §6: INFERRED that the
 *  login's token may read its own zone). */
export async function certZone(pem: string, f: typeof fetch): Promise<string | undefined> {
  const m = pem.match(/-----BEGIN ARGO TUNNEL TOKEN-----([\s\S]+?)-----END ARGO TUNNEL TOKEN-----/);
  if (!m) return;
  let tok: { zoneID?: string; apiToken?: string; endpoint?: string };
  try {
    tok = JSON.parse(Buffer.from(m[1]!.replace(/\s+/g, ""), "base64").toString("utf8"));
  } catch {
    return;
  }
  if (!tok.zoneID || !tok.apiToken || tok.endpoint) return; // FedRAMP and others: not guessed
  try {
    const r = await f(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(tok.zoneID)}`, { headers: { authorization: `Bearer ${tok.apiToken}` }, signal: AbortSignal.timeout(10_000) });
    const b = (await r.json()) as { success?: boolean; result?: { name?: string } };
    const name = b.success ? b.result?.name : undefined;
    return name && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(name) ? name.toLowerCase() : undefined;
  } catch {
    return;
  }
}

/** A hostname as the person or the agent typed it: "ducter.example.com", "https://ducter.example.com/". */
export function cleanHostname(s: string): string | undefined {
  let h = s.trim().toLowerCase();
  if (/^https?:\/\//.test(h)) {
    try {
      h = new URL(h).hostname;
    } catch {
      return;
    }
  }
  h = h.replace(/\.$/, "");
  return /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h) ? h : undefined;
}

/** What `cloudflared tunnel route dns` said: the record's name, or why not. */
export function parseRoute(out: string): { hostname: string } | { reason: AnywhereReason; detail: string } {
  const m = out.match(/Added CNAME ([a-z0-9.-]+) which will route/i) ?? out.match(/([a-z0-9.-]+) (?:is already configured to route|updated to route) to your tunnel/i);
  if (m) return { hostname: m[1]!.toLowerCase() };
  if (/already exists/i.test(out)) return { reason: "taken", detail: lastError(out) };
  return { reason: "cloudflare", detail: lastError(out) };
}

/** The tunnel's id from `cloudflared tunnel create --output json`. */
export function parseCreate(out: string): { id: string } | { reason: AnywhereReason; detail: string } {
  const j = out.match(/\{[\s\S]*\}/);
  if (j) {
    try {
      const b = JSON.parse(j[0]) as { id?: string };
      if (b.id && /^[0-9a-f-]{36}$/i.test(b.id)) return { id: b.id };
    } catch {}
  }
  const m = out.match(/Created tunnel \S+ with id ([0-9a-f-]{36})/i);
  if (m) return { id: m[1]! };
  return { reason: /already exists/i.test(out) ? "taken" : "cloudflare", detail: lastError(out) };
}

/** The last line that reads like an error, without timestamps, paths of ours or anything long. */
function lastError(out: string): string {
  const lines = out
    .split("\n")
    .map((l) => l.replace(/^\S+Z\s+(ERR|INF|WRN|FTL)\s+/, "").trim())
    .filter(Boolean);
  const l = [...lines].reverse().find((x) => /error|fail|exist|denied|unauthori|forbidden|not found|invalid/i.test(x)) ?? lines.at(-1) ?? "";
  return l.replace(/\/[^\s"']*anywhere[^\s"']*/g, "…").slice(0, 200);
}

/** The cloudflared config for a tunnel made by the setup: that hostname to this Ducter only. */
export function tunnelConfig(o: { tunnelId: string; credentials: string; hostname: string; port: number }): string {
  return [
    "# Written by Ducter for 在哪儿都能用 / From anywhere (D228). Rewritten on every start.",
    `tunnel: ${o.tunnelId}`,
    `credentials-file: ${o.credentials}`,
    "no-autoupdate: true",
    "ingress:",
    `  - hostname: ${o.hostname}`,
    `    service: http://127.0.0.1:${o.port}`,
    "  - service: http_status:404",
    "",
  ].join("\n");
}

export interface AnywhereOptions {
  dataDir: string;
  /** Ducter's own port (a function: the server may not be listening yet when this is made). */
  port: number | (() => number);
  env?: Record<string, string | undefined>;
  sys?: TunnelSys;
  now?: () => number;
  /** How often the tunnel is looked at while on. */
  pollMs?: number;
  /** How long starting and checking may take before it counts as failed. */
  startMs?: number;
  /** How long one step waits for its result before answering "still working" (the agent asks again). */
  stepWaitMs?: number;
  /** The address set up some other way (D143's public-url, DUCTER_PUBLIC_URL), if any. */
  own?: () => string | undefined;
  /** The guided setup's task and its Go card (core wires them to the runner and the Log). */
  setup?: SetupDeps;
  log?: (m: string) => void;
}

export interface SetupDeps {
  /** Opens the setup task on the home; undefined when no agent is signed in here. */
  openTask(brief: string, title: string): Promise<string | undefined>;
  /** The task is still open (not finished). */
  open(taskId: string): boolean;
  /** Asks the person's Go on the card, as a decision of that task; returns its id. */
  ask(taskId: string, hostname: string): string;
  /** The command the task's agent types to reach this home ("ducter --port 7777"). */
  cli(): string;
  homeName(): string;
  zh(): boolean;
  /** A QR code's rows for the sign-in link (devices.ts qrRows). */
  qr?(text: string): string[];
}

export interface AnywhereCtl {
  view(): Anywhere | undefined;
  /** Turn on: a dashboard tunnel (token + hostname), else the tunnel the setup made before. */
  turnOn(named?: { token: string; hostname: string }): Promise<{ ok: boolean; reason?: "own_address" | "no_address" | AnywhereReason; detail?: string }>;
  /** Stops the tunnel and takes the address out (the tunnel stays in the person's account). */
  turnOff(): Promise<void>;
  /** At boot: adopt the tunnel still running from before, or start it again. */
  resume(): Promise<void>;
  /** 让 Ducter 帮我设好 / Set it up for me: opens the setup task. */
  begin(): Promise<{ ok: true; taskId: string } | { ok: false; reason: "own_address" | "no_agent" | "running" | "failed"; taskId?: string }>;
  /** One step for the setup task's agent. */
  step(cmd: AnywhereStepCmd, o?: { hostname?: string }): Promise<AnywhereStepResult>;
  /** The person's Go (or Hold) on the setup's card. */
  answered(decisionId: string, go: boolean): void;
  cancel(): void;
  /** The self-check's answer (served at CHECK_PATH, over HTTP and as a WebSocket's first message). */
  checkToken(): string;
  onChange(fn: () => void): () => void;
  close(): void;
  /** Test seam: one look at the tunnel now. */
  tick(): Promise<void>;
}

const START_MS = 180_000;
const STEP_WAIT_MS = 75_000;

export function createAnywhere(o: AnywhereOptions): AnywhereCtl {
  const env = o.env ?? process.env;
  const sys = o.sys ?? realTunnelSys({ dataDir: o.dataDir, env });
  const now = o.now ?? Date.now;
  const log = o.log ?? ((m: string) => console.log(`[anywhere] ${m}`));
  const port = () => (typeof o.port === "function" ? o.port() : o.port);
  const stepWait = o.stepWaitMs ?? STEP_WAIT_MS;
  let saved = readSaved(o.dataDir);
  let phase: "off" | "starting" | "on" | "failed" = saved?.on && saved.wrotePublic ? "on" : "off";
  let failure: { reason: AnywhereReason; detail?: string } | undefined;
  let strikes = 0;
  let restarts = 0;
  let ticks = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let busy: Promise<unknown> | undefined;
  let bin: string | undefined;
  let login: { run: LoginRun; url?: { url: string; opened: boolean }; qr?: string[]; ended?: number } | undefined;
  const running = new Map<AnywhereStepCmd, Promise<AnywhereStepResult>>();
  const fns = new Set<() => void>();
  const changed = () => {
    for (const fn of fns) fn();
  };
  const persist = () => saved && writeSaved(o.dataDir, saved);
  const fresh = (): Saved => ({ on: false, check: randomBytes(16).toString("hex"), port: port() });
  const url = () => (saved?.hostname ? `https://${saved.hostname}` : undefined);
  const zh = () => o.setup?.zh() ?? false;

  /** Ours: the address in public-url is the one this home wrote for its tunnel. */
  const ownOther = () => {
    const own = o.own?.();
    return own && (!saved?.wrotePublic || own !== saved.wrotePublic) ? own : undefined;
  };

  // ---------- the setup's steps ----------

  const st = () => (saved!.setup ??= { steps: {} });
  function mark(id: AnywhereStepId, state: StepState, reason?: AnywhereReason, detail?: string) {
    if (!saved?.setup) return;
    saved.setup.steps[id] = { state, ...(reason ? { reason } : {}), ...(detail ? { detail } : {}) };
    persist();
    changed();
  }
  const stepOf = (id: AnywhereStepId) => saved?.setup?.steps[id]?.state ?? "todo";

  async function getBin(mark_ = true): Promise<{ bin: string } | { error: AnywhereReason; detail?: string }> {
    if (bin && existsSync(bin)) return { bin };
    const r = await sys.ensure(() => mark_ && mark("get", "doing"));
    if ("bin" in r) bin = r.bin;
    return r;
  }

  const result = (step: AnywhereStepCmd, r: Omit<AnywhereStepResult, "step">): AnywhereStepResult => ({ step, ...r });
  const failed = (step: AnywhereStepCmd, id: AnywhereStepId, reason: AnywhereReason, detail: string | undefined, next: string): AnywhereStepResult => {
    mark(id, "failed", reason, detail);
    return result(step, { state: "failed", reason, ...(detail ? { detail } : {}), next });
  };

  /** Waits for p up to the step's wait; undefined = still going (the agent asks again). */
  const within = <T>(p: Promise<T>, ms = stepWait): Promise<T | undefined> => Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);

  async function stepLogin(): Promise<AnywhereStepResult> {
    const b = await getBin();
    if ("error" in b) return failed("login", "get", b.error, b.detail, b.error === "unsupported" ? "Tell the user this computer's system has no cloudflared build; stop." : "Try once more; if it fails again, report the error and stop.");
    mark("get", "done");
    const cert = certFile(o.dataDir);
    const zoneDone = async () => {
      login?.run.stop();
      login = undefined;
      const s = st();
      if (!s.zone) {
        const z = await certZone(readFileSync(cert, "utf8"), sys.fetch);
        if (z) s.zone = z;
      }
      s.hostname ??= s.zone ? `ducter.${s.zone}` : undefined;
      mark("login", "done");
      return result("login", {
        state: "done",
        ...(s.zone ? { zone: s.zone } : {}),
        ...(s.hostname ? { hostname: s.hostname } : {}),
        next: s.hostname ? `Signed in. Run: ${cmd("create")} (it suggests ${s.hostname}; the user says Go on the card).` : `Signed in, but the domain couldn't be read. Ask the user which domain they picked (report_to_main, needs_input), then run: ${cmd("create")} --hostname ducter.<that domain>.`,
      });
    };
    if (existsSync(cert)) return zoneDone();
    if (!login || login.ended !== undefined) {
      mkdirSync(join(anywhereDir(o.dataDir), ".cloudflared"), { recursive: true, mode: 0o700 });
      const run = sys.login(b.bin, anywhereDir(o.dataDir));
      const l: NonNullable<typeof login> = { run };
      login = l;
      void run.url.then((u) => {
        if (!u || login !== l) return;
        l.url = u;
        l.qr = o.setup?.qr?.(u.url);
        changed();
      });
      void run.done.then((code) => {
        l.ended = code;
        if (login === l) changed();
      });
      mark("login", "waiting");
    }
    const l = login;
    const u = await within(l.run.url, 15_000);
    const code = await within(l.run.done, u ? stepWait : 1);
    if (existsSync(cert)) return zoneDone();
    if (code !== undefined) {
      login = undefined;
      return failed("login", "login", "login", undefined, `The sign-in ended without a certificate (the link expired, or it was refused). Run ${cmd("login")} again for a fresh link, and tell the user.`);
    }
    if (!l.url) {
      l.run.stop();
      login = undefined;
      return failed("login", "login", "cloudflare", "no sign-in link", "cloudflared printed no sign-in link. Try once more, then report.");
    }
    return result("login", {
      state: "waiting",
      waiting: "login",
      url: l.url.url,
      next: `${l.url.opened ? "A browser window opened on this computer" : "The user opens the link (it shows as a link and a QR code on the home's card)"}: they sign in to Cloudflare, pick their domain and press Authorize. Say that in one short progress report (report_to_main, state "progress"), then run ${cmd("login")} again; it waits for them. The link works for about 10 minutes.`,
    });
  }

  async function stepCreate(hostIn?: string): Promise<AnywhereStepResult> {
    if (!existsSync(certFile(o.dataDir))) return result("create", { state: "failed", reason: "login", next: `Not signed in yet. Run ${cmd("login")} first.` });
    const s = st();
    let host = hostIn ? cleanHostname(hostIn) : s.hostname;
    if (hostIn && !host) return result("create", { state: "failed", reason: "failed", detail: "hostname", next: `"${hostIn}" isn't a hostname. Use one like ducter.example.com.` });
    if (!host) return result("create", { state: "failed", reason: "failed", detail: "hostname", next: `Ask the user which domain they picked in Cloudflare, then run ${cmd("create")} --hostname ducter.<that domain>.` });
    if (s.zone && host !== s.zone && !host.endsWith("." + s.zone)) return result("create", { state: "failed", reason: "failed", detail: "zone", next: `${host} isn't under ${s.zone}, the domain the user signed in with. Use a name under ${s.zone}, or run ${cmd("login")} again after the user picks another domain (delete nothing yourself).` });
    if (saved!.hostname && stepOf("dns") === "done" && saved!.hostname === host) return result("create", { state: "done", hostname: host, next: `Already done. Run: ${cmd("run")}` });
    s.hostname = host;
    if (s.approved !== host) {
      // Outward: it changes the person's Cloudflare account, so it waits for their Go.
      const taskId = s.taskId;
      if (!o.setup || !taskId) return result("create", { state: "failed", reason: "failed", next: "There is no setup task to ask in." });
      if (s.asked?.hostname !== host) s.asked = { hostname: host, decisionId: o.setup.ask(taskId, host) };
      mark("name", "waiting");
      return result("create", { state: "waiting", waiting: "go", hostname: host, next: `The user is asked on the card whether to create the tunnel and point ${host} at this computer. Stop here and end your turn; you will be told their answer.` });
    }
    mark("name", "done");
    // The tunnel: one per home, kept when it was made before (its credentials are here).
    if (!saved!.tunnelId || !existsSync(credFile(o.dataDir))) {
      mark("create", "doing");
      const b = await getBin(false);
      if ("error" in b) return failed("create", "create", b.error, b.detail, "cloudflared went missing. Run the login step again.");
      if (existsSync(credFile(o.dataDir))) renameSync(credFile(o.dataDir), `${credFile(o.dataDir)}.old-${now()}`);
      const name = `ducter-${slug(o.setup?.homeName() ?? "home")}-${randomBytes(2).toString("hex")}`;
      const r = await sys.exec(b.bin, ["tunnel", "--origincert", certFile(o.dataDir), "create", "--output", "json", "--credentials-file", credFile(o.dataDir), name]);
      const c = r.code === 0 ? parseCreate(r.out) : { reason: "cloudflare" as const, detail: lastError(r.out) };
      if (!("id" in c)) return failed("create", "create", c.reason, c.detail, "Creating the tunnel failed. Read the detail; try once more if it looks temporary, else report it plainly and stop.");
      try {
        chmodSync(credFile(o.dataDir), 0o400);
      } catch {}
      saved!.tunnelId = c.id;
      saved!.how = "setup";
      persist();
    }
    mark("create", "done");
    mark("dns", "doing");
    const b = await getBin(false);
    if ("error" in b) return failed("create", "dns", b.error, b.detail, "cloudflared went missing. Run the login step again.");
    const r = await sys.exec(b.bin, ["tunnel", "--origincert", certFile(o.dataDir), "route", "dns", saved!.tunnelId!, host]);
    const d = parseRoute(r.out);
    if (!("hostname" in d) || (r.code !== 0 && !("hostname" in d)))
      return failed(
        "create",
        "dns",
        "reason" in d ? d.reason : "cloudflare",
        "detail" in d ? d.detail : undefined,
        "reason" in d && d.reason === "taken"
          ? `${host} already has a DNS record in the user's Cloudflare account. Never overwrite it. Ask the user (report_to_main, needs_input, default "ducter2.${s.zone ?? "<domain>"}") for another name, then run ${cmd("create")} --hostname <that name>.`
          : "Pointing the address failed. Try once more if it looks temporary, else report it plainly and stop.",
      );
    // Cloudflare's own answer is the name that exists (it adds the zone to a bare name).
    saved!.hostname = d.hostname;
    s.hostname = d.hostname;
    persist();
    mark("dns", "done");
    return result("create", { state: "done", hostname: d.hostname, next: `Run: ${cmd("run")}` });
  }

  async function stepRun(): Promise<AnywhereStepResult> {
    if (!saved?.tunnelId || !saved.hostname || stepOf("dns") !== "done") return result("run", { state: "failed", reason: "failed", next: `The tunnel isn't made yet. Run ${cmd("create")} first.` });
    if (phase === "on" && saved.on) {
      for (const id of ["run", "check", "use"] as const) mark(id, "done");
      return result("run", { state: "done", hostname: saved.hostname, next: `Done: ${url()} reaches this home and pairing uses it. Report done.` });
    }
    saved.on = true;
    saved.how = "setup";
    persist();
    if (phase !== "starting" || !busy) void run(() => start()).then(watch);
    const end = new Promise<void>((r) => {
      const f = () => (phase === "on" || phase === "failed") && (off(), r());
      const off = api.onChange(f);
      f();
    });
    await within(end);
    if (phase === "on") return result("run", { state: "done", hostname: saved.hostname, next: `Done: ${url()} reaches this home and pairing uses it. Report done, in one or two plain sentences.` });
    if (phase === "failed") return result("run", { state: "failed", reason: failure?.reason ?? "failed", ...(failure?.detail ? { detail: failure.detail } : {}), next: failure?.reason === "unreachable" ? `cloudflared is connected but ${url()} doesn't answer yet (DNS can take a few minutes). Run ${cmd("run")} again in a minute; after three tries, report it.` : "Read the detail; try once more, then report it plainly." });
    return result("run", { state: "waiting", waiting: "working", next: `Still starting and checking. Run ${cmd("run")} again.` });
  }

  const cmd = (s: AnywhereStepCmd) => `${o.setup?.cli() ?? "ducter"} anywhere step ${s} --json`;

  // ---------- the tunnel ----------

  function fail(reason: AnywhereReason, detail?: string) {
    phase = "failed";
    failure = { reason, ...(detail ? { detail } : {}) };
    if (saved?.setup && saved.how === "setup") {
      const id: AnywhereStepId = reason === "unreachable" ? "check" : "run";
      saved.setup.steps[id] = { state: "failed", reason, ...(detail ? { detail } : {}) };
      persist();
    }
    log(`couldn't turn on: ${reason}${detail ? ` (${detail})` : ""}`);
    changed();
  }

  /** Does the address lead here from outside, over HTTPS and as a WebSocket? */
  async function answers(): Promise<boolean> {
    const u = url();
    if (!u || !saved) return false;
    const ok = await sys
      .fetch(u + CHECK_PATH, { signal: AbortSignal.timeout(10_000) })
      .then(async (r) => r.ok && (await r.text()).trim() === saved?.check)
      .catch(() => false);
    if (!ok) return false;
    return (await sys.wsFirst(u.replace(/^https/, "wss") + CHECK_PATH).catch(() => undefined))?.trim() === saved.check;
  }

  /** Starts cloudflared, waits for Cloudflare and for the address to answer, then uses it. */
  async function start(): Promise<void> {
    if (!saved?.on || !saved.hostname) return;
    phase = "starting";
    failure = undefined;
    const setup = saved.how === "setup";
    if (setup) mark("run", "doing");
    changed();
    const b = await getBin(false);
    if ("error" in b) return fail(b.error, b.detail);
    if (saved.handle) await sys.stop(saved.handle).catch(() => {});
    const metricsPort = await sys.freePort();
    mkdirSync(anywhereDir(o.dataDir), { recursive: true, mode: 0o700 });
    // Its own config (a config.yml the person keeps for their own tunnels never applies).
    writeFileSync(configFile(o.dataDir), setup ? tunnelConfig({ tunnelId: saved.tunnelId!, credentials: credFile(o.dataDir), hostname: saved.hostname, port: port() }) : "# Written by Ducter for 在哪儿都能用 / From anywhere (D228).\nno-autoupdate: true\n", { mode: 0o600 });
    let handle: TunnelHandle;
    try {
      handle = await sys.start({ bin: b.bin, port: port(), metricsPort, logFile: logFile(o.dataDir), configFile: configFile(o.dataDir), ...(setup ? {} : { envFile: tokenEnv(o.dataDir) }) });
    } catch (e) {
      return fail("failed", (e as Error).message);
    }
    saved.handle = handle;
    saved.metricsPort = metricsPort;
    saved.port = port();
    persist();
    const until = now() + (o.startMs ?? START_MS);
    let connected = false;
    let asked = false;
    for (;;) {
      if (!saved?.on) return; // turned off meanwhile
      if (!(await sys.alive(handle))) return fail("cloudflare", lastLogLine(o.dataDir));
      if (!connected && (connected = await sys.ready(metricsPort)) && setup) {
        mark("run", "done");
        mark("check", "doing");
      }
      // Never ask this computer's own DNS before public DNS has the name: it would remember
      // "no such name" for a minute or more (research/67 §1a). Without DNS over HTTPS, 25 s.
      if (connected) {
        const r = asked ? true : await sys.resolves(saved.hostname);
        if (r === true || (r === undefined && now() - (until - (o.startMs ?? START_MS)) > 25_000)) {
          asked = true;
          if (await answers()) break;
        }
      }
      if (now() > until) return fail(connected ? "unreachable" : "cloudflare", connected ? saved.hostname : lastLogLine(o.dataDir));
      await sleep(1000);
    }
    if (setup) mark("check", "done");
    // The home's public address: where `ducter domain` writes it, so pairing codes carry it.
    const u = url()!;
    const own = o.own?.();
    if (!own || own === saved.wrotePublic) {
      writeFileSync(publicFile(o.dataDir), u + "\n");
      saved.wrotePublic = u;
    }
    if (setup) mark("use", "done");
    saved.since ??= new Date(now()).toISOString();
    persist();
    phase = "on";
    strikes = 0;
    log(`on at ${u}`);
    changed();
  }

  async function restart(why: string) {
    restarts++;
    log(`starting the tunnel again (${why})`);
    await start();
  }

  async function tick() {
    if (!saved?.on || busy || phase === "starting") return;
    ticks++;
    const h = saved.handle;
    if (!h || !(await sys.alive(h))) {
      if (phase === "failed" && restarts > 20) return;
      await run(() => restart("it stopped"));
      return;
    }
    if (phase === "failed") return;
    // Every few looks: does the address still lead here? Only counted while Cloudflare is
    // connected (no network is not a broken tunnel; cloudflared reconnects by itself).
    if (ticks % 5 === 0 && saved.metricsPort && (await sys.ready(saved.metricsPort))) {
      strikes = (await answers()) ? 0 : strikes + 1;
      if (strikes >= 3) {
        strikes = 0;
        await sys.stop(h).catch(() => {});
        await run(() => restart("its address stopped answering"));
      }
    }
  }

  function run<T>(fn: () => Promise<T>): Promise<T> {
    const p = fn().finally(() => {
      if (busy === p) busy = undefined;
    });
    busy = p;
    return p;
  }

  const watch = () => {
    if (timer || !saved?.on) return;
    timer = setInterval(() => void tick().catch((e) => log(String(e))), o.pollMs ?? 30_000);
    (timer as { unref?: () => void }).unref?.();
  };
  const unwatch = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };

  /** The setup as the card shows it (none once the tunnel is on). */
  function setupView(): AnywhereSetup | undefined {
    const s = saved?.setup;
    if (!s || (phase === "on" && saved?.on)) return;
    return {
      ...(s.taskId ? { taskId: s.taskId } : {}),
      steps: STEPS.map((id) => ({ id, state: s.steps[id]?.state ?? "todo", ...(s.steps[id]?.reason ? { reason: s.steps[id]!.reason } : {}), ...(s.steps[id]?.detail ? { detail: s.steps[id]!.detail } : {}) })),
      ...(login?.url && login.ended === undefined ? { login: { url: login.url.url, opened: login.url.opened, ...(login.qr ? { qr: login.qr } : {}) } } : {}),
      ...(s.hostname ? { hostname: s.hostname } : {}),
      ...(s.zone ? { zone: s.zone } : {}),
    };
  }

  const api: AnywhereCtl = {
    view() {
      if (ownOther()) return { how: "own", state: "on" };
      if (saved?.on) {
        const setup = setupView();
        return {
          how: "cloudflare",
          state: phase === "off" ? "starting" : phase,
          ...(saved.hostname ? { hostname: saved.hostname } : {}),
          ...(failure && phase === "failed" ? { reason: failure.reason, ...(failure.detail ? { detail: failure.detail } : {}) } : {}),
          ...(phase === "on" && saved.since ? { since: saved.since } : {}),
          ...(setup ? { setup } : {}),
        };
      }
      const setup = setupView();
      if (setup) return { how: "cloudflare", state: "setup", setup };
      // Off, the tunnel kept in the person's account: on again needs no setup.
      if (saved?.hostname && (saved.how === "setup" ? !!saved.tunnelId && existsSync(credFile(o.dataDir)) : existsSync(tokenEnv(o.dataDir)))) return { how: "cloudflare", state: "off", hostname: saved.hostname };
      return undefined;
    },
    async turnOn(named) {
      if (ownOther()) return { ok: false, reason: "own_address" };
      if (named) {
        const host = cleanHostname(named.hostname);
        if (!host) return { ok: false, reason: "failed", detail: "hostname" };
        if (!/^[A-Za-z0-9=_.+/-]{20,}$/.test(named.token.trim())) return { ok: false, reason: "failed", detail: "token" };
        mkdirSync(anywhereDir(o.dataDir), { recursive: true, mode: 0o700 });
        writeFileSync(tokenEnv(o.dataDir), `TUNNEL_TOKEN=${named.token.trim()}\n`, { mode: 0o600 });
        saved = { ...(saved ?? fresh()), on: true, how: "token", hostname: host, port: port() };
        delete saved.since;
        delete saved.setup;
      } else {
        // On again: the tunnel the setup made before (it is still in the person's account).
        if (!saved?.hostname || (saved.how === "setup" ? !saved.tunnelId || !existsSync(credFile(o.dataDir)) : !existsSync(tokenEnv(o.dataDir)))) return { ok: false, reason: "no_address" };
        if (saved.on && (phase === "on" || phase === "starting")) return { ok: true };
        saved.on = true;
      }
      persist();
      restarts = 0;
      void run(() => start()).then(watch);
      phase = "starting";
      changed();
      return { ok: true };
    },
    async turnOff() {
      unwatch();
      const h = saved?.handle;
      if (saved) {
        saved.on = false;
        delete saved.handle;
        delete saved.since;
        delete saved.setup;
        // The address goes with it, unless the person put another one there meanwhile.
        if (saved.wrotePublic && o.own?.() === saved.wrotePublic && !env.DUCTER_PUBLIC_URL) rmSync(publicFile(o.dataDir), { force: true });
        delete saved.wrotePublic;
        persist();
      }
      phase = "off";
      failure = undefined;
      login?.run.stop();
      login = undefined;
      if (h) await sys.stop(h).catch(() => {});
      changed();
    },
    async resume() {
      if (!saved?.on || ownOther()) return;
      const h = saved.handle;
      // The tunnel from before this Ducter started (a restart, an update): kept.
      if (h && saved.port === port() && saved.metricsPort && (await sys.alive(h))) {
        phase = saved.wrotePublic ? "on" : "starting";
        log(`kept the tunnel from before at ${url()}`);
        changed();
        watch();
        if (phase === "starting") await run(() => start());
        return;
      }
      await run(() => start());
      watch();
    },
    async begin() {
      if (ownOther()) return { ok: false, reason: "own_address" };
      if (!o.setup) return { ok: false, reason: "failed" };
      const open = saved?.setup?.taskId;
      if (open && o.setup.open(open)) return { ok: false, reason: "running", taskId: open };
      saved ??= fresh();
      const s = (saved.setup ??= { steps: {} });
      // Again after a stop: what is done stays done (the sign-in, the tunnel), the rest starts over.
      for (const id of STEPS) if (s.steps[id]?.state !== "done") delete s.steps[id];
      delete s.asked;
      const z = zh();
      const taskId = await o.setup
        .openTask(setupBrief({ cli: o.setup.cli(), device: o.setup.homeName(), zh: z }), z ? `让 ${o.setup.homeName()} 在哪儿都能用` : `Make ${o.setup.homeName()} reachable from anywhere`)
        .catch((e) => (log(`couldn't open the setup task: ${(e as Error).message}`), undefined));
      if (!taskId) {
        if (!Object.keys(s.steps).length && !s.taskId) delete saved.setup;
        persist();
        return { ok: false, reason: "no_agent" };
      }
      s.taskId = taskId;
      persist();
      changed();
      return { ok: true, taskId };
    },
    step(c, so) {
      // One at a time per step: the agent asking again joins the one under way.
      const busyStep = running.get(c);
      if (busyStep && c !== "create") return busyStep;
      saved ??= fresh();
      saved.setup ??= { steps: {} };
      const p = (c === "login" ? stepLogin() : c === "create" ? stepCreate(so?.hostname) : stepRun()).finally(() => running.delete(c));
      running.set(c, p);
      return p;
    },
    answered(decisionId, go) {
      const s = saved?.setup;
      if (!s?.asked || s.asked.decisionId !== decisionId) return;
      if (go) {
        s.approved = s.asked.hostname;
        mark("name", "done");
      }
    },
    cancel() {
      login?.run.stop();
      login = undefined;
      if (saved?.setup && !saved.on) {
        delete saved.setup;
        persist();
      }
      changed();
    },
    checkToken() {
      if (!saved) {
        saved = fresh();
        persist();
      }
      return saved.check;
    },
    onChange(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    close() {
      unwatch();
      login?.run.stop();
    },
    tick,
  };
  return api;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "home";

/** D228: the brief of the task that sets up From anywhere with the person's own domain. */
export function setupBrief(o: { cli: string; device: string; zh: boolean }): string {
  const step = (s: string) => `\`${o.cli} anywhere step ${s} --json\``;
  const lang = o.zh ? "Write every report in Chinese (简体中文), in plain words a person who has never heard of a tunnel understands." : "Write every report in English, in plain words a person who has never heard of a tunnel understands.";
  return `Make this computer (${o.device}) reachable from anywhere at the user's own domain, through their own Cloudflare account. The user tapped "Set it up for me" for this. Ducter does each step with Cloudflare's own program (cloudflared) and shows its progress on the card; you run the steps, read what each answers, and talk to the user only when it matters.

The steps (each prints one JSON line: state done | waiting | failed, and "next", which says what to do; one can take up to two minutes, so give each command a timeout of at least 3 minutes):
1. ${step("login")}: gets cloudflared (checked) and signs in. The user opens a link (on this computer a browser may open by itself; elsewhere it shows on the card as a link and a QR code), signs in to Cloudflare, picks their domain and presses Authorize. While it says waiting, say so once in a short progress report, then run it again: it waits for them.
2. ${step("create")} (optionally --hostname <name>): suggests ducter.<their domain>. The first time for a name it asks the user's Go on the card and answers waiting: end your turn and wait. If the user replies with another name instead, run it again with --hostname <that name>. After their Go, run it again: it creates the tunnel in their account and points the name at this computer.
3. ${step("run")}: starts the tunnel on this computer (kept running across Ducter restarts), checks the address answers from outside (HTTPS and a WebSocket), then makes it the address new devices connect with. It may answer waiting while DNS settles: run it again.

Rules:
- Use only these commands for the setup. Never run cloudflared yourself, never edit Cloudflare settings another way, never delete or overwrite a DNS record or a tunnel, and never print or copy files from Ducter's data folder (they hold credentials).
- If the user has no domain on Cloudflare, tell them plainly: a free Cloudflare account, then add a domain they own, or buy one in Cloudflare (Domain Registration; sold at cost). Then stop with needs_input.
- When a step fails, follow its "next" once; if it fails again, report the exact reason in plain words and stop.
- Done means: ${step("run")} answered done. Then report done in one or two sentences with the address.

${lang}`;
}

/** Stops the tunnel saved in a data folder (uninstall: it outlives Ducter by design). */
export async function stopSavedTunnel(dataDir: string, sys: Pick<TunnelSys, "stop" | "alive"> = realTunnelSys({ dataDir })): Promise<void> {
  const h = readSaved(dataDir)?.handle;
  if (h && (await sys.alive(h))) await sys.stop(h);
}

/** The last thing cloudflared said that looks like trouble (for the failed line's detail). */
function lastLogLine(dataDir: string): string | undefined {
  try {
    const lines = readFileSync(logFile(dataDir), "utf8").split("\n").filter((l) => / (ERR|FTL) /.test(l));
    const l = lines.at(-1);
    return l ? l.replace(/^\S+\s+(ERR|FTL)\s+/, "").slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- the real system ----------

export function cloudflaredArgs(s: Pick<TunnelStart, "configFile" | "metricsPort">): string[] {
  // A dashboard tunnel's token rides in the environment (TUNNEL_TOKEN), never on the command line.
  return ["tunnel", "--no-autoupdate", "--config", s.configFile, "--metrics", `127.0.0.1:${s.metricsPort}`, "run"];
}

/** TUNNEL_TOKEN from the 0600 env file, for a process started without systemd. */
function envFromFile(f?: string): Record<string, string> {
  if (!f) return {};
  try {
    const m = readFileSync(f, "utf8").match(/^TUNNEL_TOKEN=(.+)$/m);
    return m ? { TUNNEL_TOKEN: m[1]!.trim() } : {};
  } catch {
    return {};
  }
}

export function realTunnelSys(o: { dataDir: string; env?: Record<string, string | undefined>; platform?: string; arch?: string }): TunnelSys {
  const env = o.env ?? process.env;
  const platform = o.platform ?? process.platform;
  const arch = o.arch ?? process.arch;
  const ownBin = join(o.dataDir, "bin", `cloudflared-${CLOUDFLARED.version}`);
  const underSystemd = () => platform === "linux" && !!env.INVOCATION_ID && !!Bun.which("systemd-run") && !!Bun.which("systemctl");
  const exec = async (argv: string[], extra: Record<string, string> = {}) => {
    const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", env: { ...(env as Record<string, string>), ...extra } });
    const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
    return { code: await p.exited, out: out + err };
  };
  const metrics = async (port: number, path: string) => {
    try {
      return await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(3000) });
    } catch {
      return undefined;
    }
  };
  return {
    async ensure(onGetting) {
      if (env.DUCTER_CLOUDFLARED) return existsSync(env.DUCTER_CLOUDFLARED) ? { bin: env.DUCTER_CLOUDFLARED } : { error: "failed", detail: `${env.DUCTER_CLOUDFLARED} is missing` };
      if (existsSync(ownBin)) return { bin: ownBin };
      const onPath = Bun.which("cloudflared");
      if (onPath) return { bin: onPath };
      const asset = CLOUDFLARED.assets[`${platform}-${arch}`];
      if (!asset) return { error: "unsupported", detail: `${platform}-${arch}` };
      onGetting();
      let bytes: Uint8Array;
      try {
        const r = await fetch(`${CLOUDFLARED.base}/${CLOUDFLARED.version}/${asset.file}`, { signal: AbortSignal.timeout(5 * 60_000) });
        if (!r.ok) return { error: "download", detail: `HTTP ${r.status}` };
        bytes = new Uint8Array(await r.arrayBuffer());
      } catch (e) {
        return { error: "download", detail: (e as Error).message };
      }
      if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) return { error: "download", detail: "checksum" };
      const dir = join(o.dataDir, "bin");
      mkdirSync(dir, { recursive: true });
      const tmp = `${ownBin}.part`;
      if (asset.file.endsWith(".tgz")) {
        writeFileSync(`${tmp}.tgz`, bytes);
        const x = join(dir, `.cloudflared-${process.pid}`);
        mkdirSync(x, { recursive: true });
        const t = await exec(["tar", "-xzf", `${tmp}.tgz`, "-C", x, "cloudflared"]);
        rmSync(`${tmp}.tgz`, { force: true });
        if (t.code !== 0) return rmSync(x, { recursive: true, force: true }), { error: "download", detail: t.out.trim().slice(0, 200) };
        const inner = readFileSync(join(x, "cloudflared"));
        if (createHash("sha256").update(inner).digest("hex") !== asset.bin) return rmSync(x, { recursive: true, force: true }), { error: "download", detail: "checksum" };
        renameSync(join(x, "cloudflared"), tmp);
        rmSync(x, { recursive: true, force: true });
      } else writeFileSync(tmp, bytes);
      chmodSync(tmp, 0o755);
      renameSync(tmp, ownBin);
      return { bin: ownBin };
    },
    login(bin, dir) {
      // HOME points at Ducter's folder: cert.pem lands in <dir>/.cloudflared, never in the
      // person's own ~/.cloudflared (which they may keep for their own tunnels).
      const p = Bun.spawn([bin, "tunnel", "--no-autoupdate", "login"], { stdout: "pipe", stderr: "pipe", env: { ...(env as Record<string, string>), HOME: dir } });
      let resolveUrl!: (u: { url: string; opened: boolean } | undefined) => void;
      const url = new Promise<{ url: string; opened: boolean } | undefined>((r) => (resolveUrl = r));
      let text = "";
      const read = async (s: ReadableStream<Uint8Array>) => {
        const dec = new TextDecoder();
        for await (const chunk of s) {
          text += dec.decode(chunk, { stream: true });
          const m = text.match(/(https:\/\/dash\.(?:fed\.)?cloudflare\.com\/argotunnel\?\S+)/);
          if (m) resolveUrl({ url: m[1]!, opened: /A browser window should have opened/.test(text) });
        }
      };
      void Promise.all([read(p.stdout), read(p.stderr)]).finally(() => resolveUrl(undefined));
      return {
        url,
        done: p.exited,
        stop: () => {
          try {
            p.kill();
          } catch {}
        },
      };
    },
    exec: (b, args) => exec([b, ...args]),
    async start(s) {
      const args = cloudflaredArgs(s);
      writeFileSync(s.logFile, "", { mode: 0o600 });
      if (underSystemd()) {
        // Its own transient unit: a restart of Ducter's service (an update) doesn't take it along.
        const unit = `ducter-anywhere-${s.port}`;
        await exec(["systemctl", "--user", "stop", unit]);
        await exec(["systemctl", "--user", "reset-failed", unit]);
        const r = await exec(["systemd-run", "--user", "--quiet", "--collect", `--unit=${unit}`, `--property=StandardOutput=append:${s.logFile}`, `--property=StandardError=append:${s.logFile}`, ...(s.envFile ? [`--property=EnvironmentFile=${s.envFile}`] : []), "--", s.bin, ...args]);
        if (r.code !== 0) throw new Error(r.out.trim().slice(0, 200) || "systemd-run failed");
        return { unit };
      }
      const fd = openSync(s.logFile, "a");
      try {
        const p = spawn(s.bin, args, { detached: true, stdio: ["ignore", fd, fd], env: { ...(env as Record<string, string>), ...envFromFile(s.envFile) } });
        p.unref();
        if (!p.pid) throw new Error("cloudflared did not start");
        return { pid: p.pid };
      } finally {
        closeSync(fd);
      }
    },
    async alive(h) {
      if (h.unit) return (await exec(["systemctl", "--user", "is-active", h.unit])).out.trim() === "active";
      if (!h.pid) return false;
      try {
        process.kill(h.pid, 0);
      } catch {
        return false;
      }
      // After a reboot the number may belong to something else: only a cloudflared counts.
      const r = await exec(["ps", "-p", String(h.pid), "-o", "comm="]);
      return /cloudflared/.test(r.out);
    },
    async stop(h) {
      if (h.unit) return void (await exec(["systemctl", "--user", "stop", h.unit]));
      if (h.pid && (await this.alive(h))) {
        try {
          process.kill(h.pid, "SIGTERM");
        } catch {}
      }
    },
    async ready(port) {
      return (await metrics(port, "/ready"))?.ok ?? false;
    },
    async resolves(host) {
      try {
        const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=A`, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(5000) });
        const b = (await r.json()) as { Status?: number; Answer?: unknown[] };
        return b.Status === 0 && (b.Answer?.length ?? 0) > 0;
      } catch {
        return undefined; // no DNS over HTTPS from here (a filtered network)
      }
    },
    wsFirst(u) {
      return new Promise((resolve) => {
        let ws: WebSocket;
        const done = (v?: string) => {
          clearTimeout(t);
          try {
            ws.close();
          } catch {}
          resolve(v);
        };
        const t = setTimeout(() => done(undefined), 10_000);
        try {
          ws = new WebSocket(u);
        } catch {
          return done(undefined);
        }
        ws.onmessage = (e) => done(String(e.data));
        ws.onerror = () => done(undefined);
        ws.onclose = () => done(undefined);
      });
    },
    async freePort() {
      const s = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
      const p = s.port;
      s.stop(true);
      return p;
    },
    fetch: ((...a: Parameters<typeof fetch>) => fetch(...a)) as typeof fetch,
  };
}
