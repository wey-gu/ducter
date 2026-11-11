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
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BridgeRefusal, BridgeView } from "@ducter/protocol";
import type { BridgeLinkApi } from "@ducter/protocol/src/internal.ts";

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
};

export type NmemCall = (args: string[]) => Promise<{ code: number; out: string; err: string } | undefined>;

/** `nmem --json <args>` with a timeout; undefined when nmem can't be started. */
export function nmemCall(opts: { bin?: string; env?: Record<string, string | undefined>; timeoutMs?: number } = {}): NmemCall {
  const env = opts.env ?? process.env;
  return async (args) => {
    let proc: ReturnType<typeof Bun.spawn>;
    try {
      // An argument vector, never a shell string.
      proc = Bun.spawn([opts.bin ?? env.NMEM_CLI_PATH ?? "nmem", "--json", ...args], { stdout: "pipe", stderr: "pipe", stdin: "ignore", env: env as Record<string, string> });
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
  /** The row for Settings › 伙伴; undefined when the persona has no Mem identity (nothing shows). */
  view(): Promise<BridgeView | undefined>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export function createBridgeLink(opts: {
  dataDir: string;
  /** The persona's Mem identity (D141); undefined until bound, with Mem missing, or off. */
  identity: () => string | undefined;
  /** The computer whose Mem would need updating: the home. */
  home: () => string;
  run?: NmemCall;
  env?: Record<string, string | undefined>;
  now?: () => number;
}): BridgeLink {
  const env = opts.env ?? process.env;
  const run = opts.run ?? nmemCall({ env });
  const now = opts.now ?? Date.now;
  const path = join(opts.dataDir, BRIDGE_CONNECTION_FILE);
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((fn) => fn());

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

  let probe: { at: number; version?: string; supported: boolean; space?: { id: string; label: string } } | undefined;
  let probing: Promise<typeof probe> | undefined;
  const supportedBy = new Map<string, boolean>(); // per version string: `bridge connections` exists
  async function look(force = false): Promise<typeof probe> {
    if (!force && probe && now() - probe.at < PROBE_TTL_MS) return probe;
    if (probing) return probing;
    probing = (async () => {
      const v = await run(["--version"]);
      if (!v || v.code !== 0) return (probe = undefined); // no nmem here: nothing to show
      const version = (v.out || v.err).trim();
      let supported = supportedBy.get(version);
      if (supported === undefined) {
        supported = versionConnects(parseNmemVersion(version)) || (await run(["bridge", "connections", "--help"]))?.code === 0;
        supportedBy.set(version, supported);
      }
      let space: { id: string; label: string } | undefined;
      if (supported) {
        // Passive: no context, no Space, never --enable. It lists the user's places and picks none.
        const s = await run(["bridge", "setup"]);
        if (s && s.code === 0) space = personalSpace(jsonIn(s.out)[0]);
      }
      return (probe = { at: now(), version, supported, ...(space ? { space } : {}) });
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

  let busy: "connecting" | "disconnecting" | undefined;
  let outcome: { state: "refused"; reason: BridgeRefusal } | { state: "failed"; detail: string } | undefined;
  let undoFailed: string | undefined;

  const view = async (): Promise<BridgeView | undefined> => {
    if (env.DUCTER_BRIDGE === "0") return undefined;
    const agent = opts.identity();
    if (!agent) return undefined;
    if (pinned()) return { state: "connected", identity: agent, pinned: true };
    const r = read();
    const p = await look();
    if (!p && !r) return undefined;
    const space = r ? { id: r.spaceId, label: r.spaceLabel } : p?.space;
    const base = { identity: r?.agentId ?? agent, ...(space ? { space } : {}) };
    if (busy) return { state: busy, ...base };
    if (r) {
      void verify(r).catch(() => {});
      if (!r.confirmed) return { state: "unconfirmed", ...base, ...(undoFailed ? { detail: undoFailed } : {}) };
      return { state: "connected", ...base, ...(undoFailed ? { detail: undoFailed } : {}) };
    }
    if (!p!.supported) return { state: "update_mem", identity: agent, home: opts.home() };
    if (outcome) return { ...outcome, ...base };
    if (!p!.space) return { state: "no_space", identity: agent };
    return { state: "ready", ...base };
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
    view,
    async connect() {
      const agent = opts.identity();
      if (busy || !agent || pinned() || !ID.test(agent)) return;
      busy = "connecting";
      outcome = undefined;
      undoFailed = undefined;
      changed();
      try {
        const p = await look(true);
        if (!p?.supported || !p.space) return; // the row says why (update_mem / no_space)
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
          outcome = reason ? { state: "refused", reason } : { state: "failed", detail: c.code === 0 ? "Mem answered with another identity or place" : detailIn(c.out, c.err) };
          return;
        }
        // Passive: does the saved context act as this identity? (never --enable)
        const s = await run(["--agent-context", ctx, "bridge", "setup"]);
        const sj = s && s.code === 0 ? jsonIn(s.out)[0] : undefined;
        const said = sj?.endpoint?.address?.agent_id ?? sj?.identity?.agent_id;
        const confirmed = !!sj && (said === undefined || said === agent);
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
        } else undoFailed = v ? detailIn(v.out, v.err) : "nmem didn't start";
      } finally {
        busy = undefined;
        changed();
      }
    },
  };
}
