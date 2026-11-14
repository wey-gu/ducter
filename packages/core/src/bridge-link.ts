// D205: the persona's own Bridge connection, made from Settings › 伙伴 with one tap
// (design/bridge.md "Connecting the persona"). Nowledge Mem 0.10.118 can represent an existing
// identity with the user's ordinary Mem sign-in (`nmem bridge connections connect`), so Ducter
// finds the persona's context by itself (D170 (9)) instead of asking the user to make one by hand.
//
// What Ducter runs, all with the home's own nmem:
//   - read-only: `nmem --version` (and, for a version it can't place, `bridge connections --help`)
//     to know the command exists; passive `bridge setup` (no context, no Space, never --enable) for
//     the user's places, of which exactly one with kind "personal" ("Only me") is the persona's;
//     `bridge connections list` once per start, to drop a connection revoked elsewhere.
//   - only on the user's tap: `bridge connections connect --space-id <that exact id> --agent-id
//     <the persona's identity> --context <its context>`, then passive `--agent-context <ctx> bridge
//     setup` to confirm it acts as that identity; 断开 / Disconnect: `bridge connections revoke <id>`.
// Never another identity, another place or another credential: a refusal is said as Mem said it,
// with the step the user takes in Mem, and nothing else is tried. No place is guessed: no single
// personal place means nothing is offered.
//
// The confirmed connection is kept in <dataDir>/bridge-connection.json; its context turns the
// partner's Bridge on (partner/src/bridge.ts bridgeFor) without DUCTER_BRIDGE=1.
//
// D225: the home's own Mem command line comes first, on the same row: no `nmem` here, or one too
// old for `bridge connections`, is one tap that puts it in or updates it (mem-cli.ts: Mem's official
// route, the same source it came from); not signed in to Nowledge Mem, a one-time connect link the
// user pastes (`nmem connect --skip-tools <link>`, never logged or kept). Then the same row goes on
// to 连上. Mem's agent-facing detail ("stop, don't mint another key") is never shown to the user:
// every registered code is a plain line; anything else is clipped as "what Mem said".
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BridgeRefusal, BridgeView } from "@ducter/protocol";
import type { BridgeLinkApi } from "@ducter/protocol/src/internal.ts";
import { connectLinkOk, copyOf, copyPython, externallyManaged, extraBins, findNmem, installPlan, joinPath, MEM_INSTALL_MS, PY_PROBE, realSys, toolOf, updatePlan, type MemCopy, type MemFacts, type MemPlan, type MemStep, type MemSys } from "./mem-cli.ts";
import { nmemEnv, toolEnv } from "@ducter/protocol/src/tool-env.ts";

export const BRIDGE_CONNECTION_FILE = "bridge-connection.json";
/** The first nmem with `bridge connections` (Mem PR #9996, in 0.10.118). */
export const BRIDGE_CONNECT_SINCE = [0, 10, 118] as const;
const PROBE_TTL_MS = 5 * 60_000;
const ID = /^[a-z0-9][a-z0-9_.:-]{0,119}$/; // Mem's canonical Agent id (valid_agent_id)

/** One kept connection: what Mem returned for the connect Ducter ran on the user's tap. */
export interface BridgeConnectionRecord {
  context: string;
  agentId: string;
  spaceId: string;
  spaceLabel: string;
  connectionId: string;
  identityBirth?: string;
  /** The passive setup afterwards said it acts as agentId; only then is Bridge on. */
  confirmed: boolean;
  at: string;
}

/** Mem's registered refusal codes (nmem-wire cloud_bridge_setup) and what Ducter calls each. */
export const REFUSALS: Record<string, BridgeRefusal> = {
  cloud_bridge_setup_role_authority_missing: "authority_missing",
  cloud_bridge_setup_role_custody_birth_missing: "custody_birth_missing",
  cloud_bridge_setup_role_lifetime_inactive: "lifetime_inactive",
  cloud_bridge_setup_role_attachment_mismatch: "attachment_mismatch",
  cloud_bridge_setup_role_control_denied: "control_denied",
  cloud_bridge_setup_connection_revoked: "revoked",
  cloud_bridge_setup_binding_conflict: "conflict",
  // D225, the rest of nmem 0.10.118's registered codes (research/66 §2).
  cloud_bridge_setup_authority_denied: "control_denied",
  cloud_bridge_setup_authority_retired: "lifetime_inactive",
  cloud_bridge_setup_unavailable: "unavailable",
  cloud_bridge_setup_busy: "unavailable",
  cloud_bridge_setup_capacity: "unavailable",
  cloud_bridge_setup_outcome_unknown: "unknown",
};

export type NmemCall = (args: string[]) => Promise<{ code: number; out: string; err: string } | undefined>;

/** `nmem --json <args>` with a timeout; undefined when nmem can't be started. */
export function nmemCall(opts: { bin?: string; env?: Record<string, string | undefined>; timeoutMs?: number } = {}): NmemCall {
  const env = opts.env ?? process.env;
  return async (args) => {
    let proc: ReturnType<typeof Bun.spawn>;
    try {
      // An argument vector, never a shell string.
      proc = Bun.spawn([opts.bin ?? env.NMEM_CLI_PATH ?? "nmem", "--json", ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore", env: nmemEnv(env) }); // D102
    } catch {
      return undefined;
    }
    const timer = setTimeout(() => proc.kill(), opts.timeoutMs ?? 30_000);
    try {
      const [out, err, code] = await Promise.all([new Response(proc.stdout as ReadableStream).text(), new Response(proc.stderr as ReadableStream).text(), proc.exited]);
      return { code, out, err };
    } finally {
      clearTimeout(timer);
    }
  };
}

/** "nmem 0.10.118-rc2" → [0, 10, 118]; undefined when no version is in it. */
export function parseNmemVersion(text: string): [number, number, number] | undefined {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(text);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
}

/** Whether this version has `bridge connections` (a pre-release of 0.10.118 counts). */
export function versionConnects(v: readonly number[] | undefined): boolean {
  if (!v) return false;
  for (let i = 0; i < 3; i++) if (v[i] !== BRIDGE_CONNECT_SINCE[i]) return v[i]! > BRIDGE_CONNECT_SINCE[i]!;
  return true;
}

/** JSON objects in nmem's output (stdout, then stderr; whole text, then line by line). */
function jsonIn(...texts: string[]): any[] {
  const out: any[] = [];
  for (const t of texts) {
    for (const chunk of [t, ...t.split("\n")]) {
      const s = chunk.trim();
      if (!s.startsWith("{")) continue;
      try {
        out.push(JSON.parse(s));
      } catch {
        /* not JSON */
      }
    }
  }
  return out;
}

/** The registered error code in a failed nmem answer, wherever the CLI put it. */
export function errorCodeIn(out: string, err: string): string | undefined {
  for (const j of jsonIn(out, err)) {
    const c = j?.error_code ?? j?.upstream?.error_code ?? j?.error?.error_code;
    if (typeof c === "string" && c) return c;
  }
  return undefined;
}

const clip = (s: string, n = 160) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length <= n ? one : one.slice(0, n - 1) + "…";
};
const detailIn = (out: string, err: string): string => {
  for (const j of jsonIn(out, err)) if (typeof j?.detail === "string" && j.detail.trim()) return clip(j.detail);
  return clip(err || out || "no answer");
};

/**
 * The one personal place among passive setup's candidates ("Only me"), or undefined: none, or more
 * than one (never a guess between them).
 */
export function personalSpace(setup: any): { id: string; label: string } | undefined {
  const list = Array.isArray(setup?.candidates) ? setup.candidates : [];
  const personal = list.filter((c: any) => c && c.kind === "personal" && typeof c.id === "string" && c.id);
  if (personal.length !== 1) return undefined;
  const c = personal[0];
  return { id: c.id, label: typeof c.label === "string" && c.label.trim() ? c.label.trim() : "Only me" };
}


export interface BridgeLink extends BridgeLinkApi {
  /** The row for Settings › 伙伴; undefined when memory is off (nothing shows). */
  view(): Promise<BridgeView | undefined>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** D225: puts in (or updates) the home's `nmem` with Mem's official route, on the user's tap. */
  installMem(): Promise<void>;
  /** D225: signs the home's `nmem` in with a one-time connect link (never logged or kept). */
  signInMem(link: string): Promise<void>;
  /** Mem became usable here after an install or a sign-in: core binds the persona's identity. */
  onMemReady(fn: () => void): () => void;
}

/** Runs one install or update command (an argument vector); undefined when it can't start. */
export type MemExec = (argv: string[], timeoutMs: number) => Promise<{ code: number; out: string; err: string } | undefined>;

export function memExec(env: Record<string, string | undefined> = process.env): MemExec {
  return async (argv, timeoutMs) => {
    let proc: ReturnType<typeof Bun.spawn>;
    try {
      // D102: the basics and the installers' own settings, never Ducter's keys.
      proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore", env: { ...toolEnv({ own: /^(?:PIP_|PIPX_|UV_|HOMEBREW_|PYTHON)/, inherited: env }), PIP_NO_INPUT: "1", PIPX_NO_COLOR: "1", NO_COLOR: "1" } });
    } catch {
      return undefined;
    }
    const timer = setTimeout(() => proc.kill(), timeoutMs);
    try {
      const [out, err, code] = await Promise.all([new Response(proc.stdout as ReadableStream).text(), new Response(proc.stderr as ReadableStream).text(), proc.exited]);
      return { code, out, err };
    } finally {
      clearTimeout(timer);
    }
  };
}

/** The last meaningful line of an installer's output, clipped, with any URL's query dropped. */
export function lastLine(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l && !/^(hint|note|warning):/i.test(l));
  return clip((lines.at(-1) ?? "").replace(/(https?:\/\/[^\s?]+)\?\S*/g, "$1"));
}

export function createBridgeLink(opts: {
  dataDir: string;
  /** The persona's Mem identity (D141); undefined until bound. */
  identity: () => string | undefined;
  /** The id connect uses before it is bound (the persona's own, D141: `ducter`). */
  fallbackIdentity?: () => string;
  /** Memory on (Settings › 记得什么 and the run); off: nothing shows. */
  memoryOn?: () => boolean;
  /** The computer the row is about: the home. */
  home: () => string;
  run?: NmemCall;
  exec?: MemExec;
  sys?: MemSys;
  env?: Record<string, string | undefined>;
  now?: () => number;
}): BridgeLink {
  const env = opts.env ?? process.env;
  const run = opts.run ?? nmemCall({ env });
  const exec = opts.exec ?? memExec(env);
  const sys = opts.sys ?? realSys();
  const now = opts.now ?? Date.now;
  const path = join(opts.dataDir, BRIDGE_CONNECTION_FILE);
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((fn) => fn());
  const readyFns = new Set<() => void>();

  // A service's PATH often lacks the user's own bin folder: a `nmem` there is found once, at start.
  if (!env.NMEM_CLI_PATH && !sys.which("nmem", env.PATH ?? "")) {
    const found = findNmem(env, sys);
    if (found) {
      joinPath(env, dirname(found));
      env.NMEM_CLI_PATH = found;
    }
  }

  const read = (): BridgeConnectionRecord | undefined => {
    try {
      if (!existsSync(path)) return undefined;
      const r = JSON.parse(readFileSync(path, "utf8")) as BridgeConnectionRecord;
      return r && typeof r.context === "string" && typeof r.connectionId === "string" && typeof r.agentId === "string" ? r : undefined;
    } catch {
      return undefined;
    }
  };
  const write = (r: BridgeConnectionRecord) => {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(r, null, 2) + "\n", { mode: 0o600 });
    renameSync(tmp, path);
  };
  const drop = () => rmSync(path, { force: true });

  /** DUCTER_BRIDGE_CONTEXT names it; else the identity, as Mem's own default. */
  const contextFor = (agent: string) => env.DUCTER_BRIDGE_CONTEXT?.trim() || agent;
  const pinned = () => env.DUCTER_BRIDGE === "1" && !!env.DUCTER_BRIDGE_CONTEXT?.trim();
  const agentNow = () => opts.identity() ?? opts.fallbackIdentity?.() ?? "ducter";

  type Probe = { at: number; version?: string; supported: boolean; signedIn: boolean; backend?: string; space?: { id: string; label: string }; updateAvailable?: boolean; latest?: string };
  let probe: Probe | undefined;
  let probeAt = 0; // when "no nmem here" was last seen (probe stays undefined)
  let probing: Promise<Probe | undefined> | undefined;
  const supportedBy = new Map<string, boolean>(); // per version string: `bridge connections` exists
  async function look(force = false): Promise<Probe | undefined> {
    if (!force && (probe ? now() - probe.at : now() - probeAt) < PROBE_TTL_MS && (probe || probeAt)) return probe;
    if (probing) return probing;
    probing = (async () => {
      const v = await run(["--version"]);
      if (!v || v.code !== 0) {
        probeAt = now();
        return (probe = undefined); // no nmem here
      }
      const version = (v.out || v.err).trim();
      let supported = supportedBy.get(version);
      if (supported === undefined) {
        supported = versionConnects(parseNmemVersion(version)) || (await run(["bridge", "connections", "--help"]))?.code === 0;
        supportedBy.set(version, supported);
      }
      const shortVersion = parseNmemVersion(version)?.join(".") ?? version;
      if (!supported) return (probe = { at: now(), version: shortVersion, supported, signedIn: false });
      // Signed in to a Nowledge Mem workspace here? (read-only)
      const st = await run(["status"]);
      const sj = st && st.code === 0 ? jsonIn(st.out)[0] : undefined;
      const signedIn = !!sj && (sj.status === "healthy" || sj.status === "ok");
      const backend = typeof sj?.backend === "string" ? sj.backend : undefined;
      // Mem's own word that a newer nmem is out (`status`.update; its command is only a hint).
      const updateAvailable = sj?.update?.update_available === true;
      // D257: the newer version's number, when Mem names it (said beside 有新版本 / New version).
      const latest = updateAvailable && typeof sj?.update?.latest === "string" ? parseNmemVersion(sj.update.latest)?.join(".") : undefined;
      let space: { id: string; label: string } | undefined;
      if (signedIn && backend !== "local") {
        // Passive: no context, no Space, never --enable. It lists the user's places and picks none.
        const s = await run(["bridge", "setup"]);
        if (s && s.code === 0) space = personalSpace(jsonIn(s.out)[0]);
      }
      return (probe = { at: now(), version: shortVersion, supported, signedIn, ...(backend ? { backend } : {}), ...(space ? { space } : {}), ...(updateAvailable ? { updateAvailable } : {}), ...(latest ? { latest } : {}) });
    })().finally(() => (probing = undefined));
    return probing;
  }

  // A connection revoked somewhere else (Mem's own list) is dropped here, once per start.
  let verified = false;
  async function verify(r: BridgeConnectionRecord) {
    if (verified) return;
    verified = true;
    const l = await run(["bridge", "connections", "list", "--space-id", r.spaceId, "--agent-id", r.agentId]);
    if (!l || l.code !== 0) return; // can't tell: keep it
    const j = jsonIn(l.out)[0];
    if (!Array.isArray(j?.connections) || j.next_connection_id) return; // a partial page proves nothing
    const mine = j.connections.find((c: any) => c?.connection_id === r.connectionId);
    if (!mine || mine.state === "revoked") {
      drop();
      changed();
    }
  }

  type Busy = "connecting" | "disconnecting" | "installing" | "updating" | "signing_in";
  let busy: Busy | undefined;
  let busyMove = false; // the running update moves the copy (D229)
  let outcome: { state: "refused"; reason: BridgeRefusal } | { state: "failed"; detail: string } | undefined;
  let undoFailed: string | undefined;
  let memFailed: string | undefined; // the last install/update didn't work: what it said
  let memKept = false; // ...and the old copy is still there, working
  let memDone: { kind: "installed" | "updated" | "moved"; at: number } | undefined;
  let signIn: BridgeView["signIn"];
  let signInDetail: string | undefined;

  // D225/D229: what a plan needs to know, asked once each (a python's pip, a password-free sudo).
  const facts: MemFacts = { python: {} };
  let sudoAsked = false;
  async function learnPython(py: string) {
    if (facts.python![py] !== undefined) return;
    const r = await exec([py, "-c", PY_PROBE], 20_000);
    const word = r && r.code === 0 ? r.out.trim().split("\n").at(-1)?.trim() : undefined;
    facts.python![py] = word === "ok" || word === "managed" ? word : "nopip";
  }
  async function learnSudo() {
    if (sudoAsked || sys.platform !== "linux" || sys.uid === 0) return;
    sudoAsked = true;
    const r = await exec(["sudo", "-n", "true"], 10_000); // -n: never asks for a password
    facts.sudo = !!r && r.code === 0;
  }
  async function freshPlan(): Promise<MemPlan | undefined> {
    const first = installPlan(env, sys, facts);
    if (first) return first;
    await learnSudo();
    const py = sys.which("python3", env.PATH ?? "");
    if (py) await learnPython(py);
    return installPlan(env, sys, facts);
  }
  async function copyPlan(copy: MemCopy): Promise<MemPlan | undefined> {
    if (copy.channel === "pip" && copy.userSite && copy.python) {
      await learnPython(copyPython(copy, env, sys));
      if (facts.python![copyPython(copy, env, sys)] === "managed") await learnSudo();
    }
    return updatePlan(copy, env, sys, facts);
  }
  const copyHere = () => {
    const bin = findNmem(env, sys);
    return bin ? copyOf(bin, sys) : undefined;
  };
  /** D229: with Mem working here, the one quiet thing worth doing to its copy, if any. */
  async function upkeepFor(p: Probe): Promise<{ plan: MemPlan; kind: "move" | "update" } | undefined> {
    const copy = copyHere();
    if (!copy) return undefined;
    const plan = await copyPlan(copy);
    if (plan?.how === "move") return { plan, kind: "move" };
    if (plan && p.updateAvailable) return { plan, kind: "update" };
    return undefined;
  }
  /** One step: a command found by name once an earlier step put it in; pip past the mark when the copy already is. */
  async function runStep(st: MemStep) {
    const head = st.argv[0]!;
    const argv = !head.includes("/") && head !== "sudo" && head !== "env" ? [toolOf(head, env, sys) ?? head, ...st.argv.slice(1)] : st.argv;
    let r = await exec(argv, MEM_INSTALL_MS);
    if (r && r.code !== 0 && st.pastMark && externallyManaged(r.out + r.err)) r = await exec([...argv.slice(0, -1), "--break-system-packages", argv.at(-1)!], MEM_INSTALL_MS);
    return r;
  }
  const DONE_SHOWN_MS = 10 * 60_000;

  const memReady = () => readyFns.forEach((fn) => fn());

  const view = async (): Promise<BridgeView | undefined> => {
    if (env.DUCTER_BRIDGE === "0") return undefined;
    if (opts.memoryOn && !opts.memoryOn()) return undefined;
    const agent = agentNow();
    if (pinned() && opts.identity()) return { state: "connected", identity: agent, pinned: true };
    const r = read();
    const p = await look();
    const home = opts.home();
    const space = r ? { id: r.spaceId, label: r.spaceLabel } : p?.space;
    const base = { identity: r?.agentId ?? agent, ...(space ? { space } : {}) };
    const failed = memFailed ? { detail: memFailed, ...(memKept ? { kept: true as const } : {}) } : {};
    if (busy) return { state: busy, ...base, ...(busy === "installing" || busy === "updating" || busy === "signing_in" ? { home } : {}), ...(busy === "updating" && busyMove ? { upkeep: { kind: "move" as const } } : {}) };
    // D229: a quiet line under any working state: just done (a warm word), or the one thing worth doing.
    // D257: on every working state, the home's Mem version and Mem's own word that a newer one is
    // out (newer: its number, "" when Mem didn't name it), so Settings › 记忆 says so even for a
    // copy Ducter can't update (the Nowledge Mem app's).
    const said = (q: Probe): Partial<BridgeView> => ({ home, ...(q.version ? { version: q.version } : {}), ...(q.updateAvailable ? { newer: q.latest ?? "" } : {}) });
    const extras = async (): Promise<Partial<BridgeView>> => {
      if (!p) return {};
      if (memDone && now() - memDone.at < DONE_SHOWN_MS) return { ...said(p), done: memDone.kind };
      if (!p.supported) return said(p);
      const u = await upkeepFor(p);
      return u ? { ...said(p), upkeep: { kind: u.kind, ...(memFailed ? { detail: memFailed, ...(memKept ? { kept: true as const } : {}) } : {}) } } : said(p);
    };
    if (r && p?.supported) {
      void verify(r).catch(() => {});
      if (!r.confirmed) return { state: "unconfirmed", ...base, ...(undoFailed ? { detail: undoFailed } : {}) };
      return { state: "connected", ...(await extras()), ...base, ...(undoFailed ? { detail: undoFailed } : {}) };
    }
    if (!p) {
      const plan = await freshPlan();
      return { state: "install_mem", identity: agent, home, canRun: !!plan, ...(plan ? {} : { need: "pipx" as const }), ...failed };
    }
    if (!p.supported) {
      const copy = copyHere();
      const plan = copy && (await copyPlan(copy));
      return { state: "update_mem", identity: agent, home, version: p.version, canRun: !!plan, ...(plan?.how === "move" ? { upkeep: { kind: "move" as const } } : {}), ...(plan ? {} : { need: copy?.channel === "app" ? ("app" as const) : ("other" as const) }), ...failed };
    }
    if (!p.signedIn) return { state: "sign_in", identity: agent, home, version: p.version, ...(memDone && now() - memDone.at < DONE_SHOWN_MS ? { done: memDone.kind } : {}), ...(signIn ? { signIn } : {}), ...(signInDetail ? { detail: signInDetail } : {}) };
    if (p.backend === "local") return { state: "local_mem", identity: agent, home, ...(await extras()) };
    if (outcome) return { ...outcome, ...base };
    if (!p.space) return { state: "no_space", identity: agent, ...(await extras()) };
    return { state: "ready", ...(await extras()), ...base };
  };

  return {
    context() {
      const r = read();
      return r?.confirmed ? r.context : undefined;
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    onMemReady(fn) {
      readyFns.add(fn);
      return () => readyFns.delete(fn);
    },
    view,
    async connect() {
      const agent = agentNow();
      if (busy || pinned() || !ID.test(agent) || (opts.memoryOn && !opts.memoryOn())) return;
      busy = "connecting";
      outcome = undefined;
      undoFailed = undefined;
      changed();
      try {
        const p = await look(true);
        if (!p?.supported || !p.signedIn || !p.space) return; // the row says why (install, update, sign in, no_space)
        const ctx = contextFor(agent);
        const space = p.space;
        // The one write, on the user's tap: this identity, this exact place, this context.
        const c = await run(["bridge", "connections", "connect", "--space-id", space.id, "--agent-id", agent, "--context", ctx]);
        if (!c) {
          outcome = { state: "failed", detail: "nmem didn't start" };
          return;
        }
        const j = c.code === 0 ? jsonIn(c.out)[0] : undefined;
        const conn = j?.connection;
        const ok =
          j?.state === "connected" &&
          conn?.agent_id === agent &&
          conn?.state === "active" &&
          typeof conn?.connection_id === "string" &&
          (j.agent_context ?? ctx) === ctx &&
          (j.selection?.scope?.space_id ?? space.id) === space.id;
        if (!ok) {
          const code = errorCodeIn(c.out, c.err);
          const reason = code ? REFUSALS[code] : undefined;
          // An unregistered code, or no code: what Mem said, clipped. A registered one is a plain line.
          outcome = reason ? { state: "refused", reason } : { state: "failed", detail: c.code === 0 ? "Mem answered with another identity or place" : code ? `Nowledge Mem: ${code.replace(/^cloud_bridge_setup_/, "")}` : detailIn(c.out, c.err) };
          return;
        }
        // Passive: does the saved context act as this identity? (never --enable)
        const s = await run(["--agent-context", ctx, "bridge", "setup"]);
        const sj = s && s.code === 0 ? jsonIn(s.out)[0] : undefined;
        const said = sj?.endpoint?.address?.agent_id ?? sj?.identity?.agent_id;
        let confirmed = !!sj && (said === undefined || said === agent);
        // nmem 0.10.118: `bridge setup` says a context saved by `connections connect` was "not
        // found", while `agents context show` and the inbox use it. Then the saved context must name
        // this identity and place, and the inbox must answer with it (both read-only).
        if (!confirmed && s && /agent context .* was not found/i.test(`${s.err}\n${s.out}`)) {
          const shown = await run(["agents", "context", "show", "--name", ctx]);
          const sel = shown && shown.code === 0 ? jsonIn(shown.out)[0]?.selection : undefined;
          if (sel?.address?.agent_id === agent && sel?.scope?.space_id === space.id) {
            const inbox = await run(["--agent-context", ctx, "bridge", "inbox"]);
            confirmed = !!inbox && inbox.code === 0 && jsonIn(inbox.out).length > 0;
          }
        }
        write({ context: ctx, agentId: agent, spaceId: space.id, spaceLabel: space.label, connectionId: conn.connection_id, ...(typeof conn.identity_birth === "string" ? { identityBirth: conn.identity_birth } : {}), confirmed, at: new Date(now()).toISOString() });
        if (!confirmed) undoFailed = s ? detailIn(s.out, s.err) : "nmem didn't start";
        verified = true;
      } finally {
        busy = undefined;
        changed();
      }
    },
    async disconnect() {
      const r = read();
      if (busy || !r || pinned()) return;
      busy = "disconnecting";
      undoFailed = undefined;
      changed();
      try {
        const v = await run(["bridge", "connections", "revoke", r.connectionId]);
        const j = v && v.code === 0 ? jsonIn(v.out)[0] : undefined;
        const gone = (j?.connection?.connection_id === r.connectionId && j?.connection?.state === "revoked") || (!!v && errorCodeIn(v.out, v.err) === "cloud_bridge_setup_connection_revoked");
        if (gone) {
          drop();
          outcome = undefined;
        } else {
          const code = v ? errorCodeIn(v.out, v.err) : undefined;
          undoFailed = code && REFUSALS[code] === "unavailable" ? "Nowledge Mem can't take it right now" : v ? detailIn(v.out, v.err) : "nmem didn't start";
        }
      } finally {
        busy = undefined;
        changed();
      }
    },
    async installMem() {
      if (busy || (opts.memoryOn && !opts.memoryOn())) return;
      const p = await look(true);
      let plan: MemPlan | undefined;
      if (!p) {
        plan = await freshPlan();
      } else {
        const copy = copyHere();
        // Too old for Bridge: its update (D229: a move, for a copy past the system's mark);
        // working: the quiet upkeep the row offered (the move, or Mem's own "a newer one is out").
        plan = !p.supported ? copy && (await copyPlan(copy)) : (await upkeepFor(p))?.plan;
      }
      if (!plan) return changed(); // the row says what the user does instead
      busy = p ? "updating" : "installing";
      busyMove = plan.how === "move";
      memFailed = undefined;
      memKept = false;
      memDone = undefined;
      changed();
      try {
        let removed = false;
        for (const st of plan.steps) {
          const r = await runStep(st);
          if (!r || r.code !== 0) {
            memFailed = !r ? `${st.argv[0]} didn't start` : externallyManaged(r.out + r.err) ? "pip: externally-managed-environment" : lastLine(r.err || r.out) || `exit ${r.code}`;
            // A move that took the old copy out but couldn't put the new one in: the old one goes back.
            if (removed && plan.undo) {
              const u = await runStep(plan.undo);
              memKept = !!u && u.code === 0;
            } else memKept = !!p;
            return;
          }
          if (st.argv.includes("uninstall")) removed = true;
        }
        // Where the new nmem is: its folder joins this process's PATH (later spawns find it).
        const bin = findNmem({ ...env, NMEM_CLI_PATH: undefined }, sys) ?? extraBins(sys).map((d) => join(d, "nmem")).find(sys.exists);
        if (bin) {
          joinPath(env, dirname(bin));
          if (!sys.which("nmem", env.PATH ?? "") || env.NMEM_CLI_PATH) env.NMEM_CLI_PATH = bin;
        }
        supportedBy.clear();
        facts.python = {};
        const q = await look(true);
        if (!q) memFailed = "installed, but nmem doesn't answer";
        else if (!q.supported) memFailed = `nmem ${q.version ?? "?"}: still too old`;
        else {
          memDone = { kind: plan.how === "move" ? "moved" : p ? "updated" : "installed", at: now() };
          if (q.signedIn) memReady();
        }
      } finally {
        busy = undefined;
        busyMove = false;
        changed();
      }
    },
    async signInMem(link) {
      if (busy || (opts.memoryOn && !opts.memoryOn())) return;
      signInDetail = undefined;
      if (!connectLinkOk(link)) {
        signIn = "bad";
        return changed();
      }
      busy = "signing_in";
      signIn = undefined;
      changed();
      try {
        // Saves the sign-in only: no AI tool's settings change (D169 does that, on its own tap).
        const r = await run(["connect", "--skip-tools", link.trim()]);
        if (!r || r.code !== 0) {
          const text = r ? `${r.out}\n${r.err}` : "";
          signIn = /\b410\b|gone|already used|expired/i.test(text) ? "used" : "failed";
          if (signIn === "failed") signInDetail = r ? lastLine(r.err || r.out).replaceAll(link.trim(), "<link>") : "nmem didn't start";
          return;
        }
        const q = await look(true);
        if (q?.signedIn) memReady();
        else signIn = "failed";
      } finally {
        busy = undefined;
        changed();
      }
    },
  };
}
