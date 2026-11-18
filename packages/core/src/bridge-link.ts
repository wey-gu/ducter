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
//
// D324: one partner, one mailbox, one home answering it. The identity stays the partner's (D141,
// D312's `ducter-<id>`); the connection is the home's own, named for it (`<identity>-on-<home>-<key
// tag>`, the tag from the home's D293 key), so Mem's own list says which computer holds each one. A
// home that finds another home's active connection for the same identity never connects beside it on
// its own: the row says where the partner answers now (elsewhere) and offers one action, 改由这台收 /
// Receive here instead, which connects here and then revokes the other (the tap is the Go for both).
// A home connected beside another (two from before D324) says so (others) with 只留这台 / Keep only
// this one. A revoke Mem won't do from here (another login's connection) is said, with where to do it.
//
// D334: the address is the identity, not the Space. A Mem context is (identity, one exact Space) and
// `bridge inbox` reads only its context's Space, while the identity is a contact in every Space the
// person is in: a message sent to the partner from a team Space was delivered and never read. So the
// home reads in every Space the identity is reachable in: beside the connection's own context, one
// local context per other Space (`agents context select`, a local write), named `<its label>-in-<space
// slug>`, found at connect and again at the 30-minute recheck (a new Space is added, a gone one
// dropped). A Space Mem won't give a reader for is kept as `unread`: one quiet problem row. Once Mem
// reads every Space with one inbox (nowledge-co/mem#10402; seen as `--all-spaces` in `bridge inbox
// --help`), the per-Space contexts are no longer used: the connection's context alone reads them all.
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
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
  /** D334: the other Spaces the home reads the identity's mailbox in, each through its own local context. */
  places?: { context: string; spaceId: string; spaceLabel: string; kind?: string }[];
  /**
   * D334: Spaces where Mem refused a reader (`agents context select`): the problem row's. D338: why
   * (Mem's code, the HTTP status) and, for a 404, when it was tried and with which nmem: it is tried
   * again once a day, or as soon as nmem's version changes.
   */
  unread?: { spaceId: string; spaceLabel: string; code?: string; status?: number; at?: string; nmem?: string }[];
  /** D334: Mem reads every Space with one inbox (#10402): the connection's context alone. */
  wide?: boolean;
}

/** How the description Ducter enrolls an identity with begins (mem-identity.ts): a card Ducter may keep current. */
export const CARD_MARK = "Ducter, a personal AI partner.";
/**
 * D333, D334, D338: the identity's card in Mem (its public profile description, shown on `bridge
 * contacts` cards in every Space) says where it reads its messages, on its one home, and that it
 * answers in the Space a message came from. `reads`: the labels of the Spaces the home reads now;
 * absent (Mem reads every Space with one inbox, #10402) it says every Space. Otherwise it names only
 * those, and says plainly that a message sent to it in any other Space is not read yet: a card that
 * claimed every Space sent the author's Codex to a mailbox nobody reads (nmem 0.10.120's 404).
 */
export function whereCard(home: string, reads?: readonly string[]): string {
  const head = `${CARD_MARK} Its conversation and its tasks write to Mem as this identity.`;
  if (!reads) return `${head} It reads messages sent to it in every Space it is in, on its home computer ${home}, and replies in the Space the message came from.`;
  const names = [...new Set(reads)].map((l) => `"${l}"`);
  const list = names.length <= 1 ? (names[0] ?? '""') : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${head} It reads messages sent to it only in ${names.length === 1 ? "the Space" : "the Spaces"} ${list}, on its home computer ${home}, and replies in the Space the message came from. A message sent to it in any other Space is not read yet: send to it in ${names.length === 1 ? "that one" : "one of those"}.`;
}

/** D338: the labels of the Spaces a connection reads now, or undefined when Mem reads every Space (wide). */
export function readsOf(r: BridgeConnectionRecord): string[] | undefined {
  return r.wide ? undefined : [r.spaceLabel, ...(r.places ?? []).map((p) => p.spaceLabel)];
}

/** D338: the HTTP status in a failed nmem answer (`http_status`, or "HTTP 404" / "status 404" in its text). */
export function httpStatusIn(out: string, err: string): number | undefined {
  for (const j of jsonIn(out, err)) {
    const s = j?.http_status ?? j?.upstream?.http_status ?? j?.error?.http_status ?? j?.status_code;
    if (typeof s === "number" && s >= 100 && s < 600) return s;
  }
  const m = /\b(?:HTTP|status)[\s:/]*(\d{3})\b/i.exec(`${out}\n${err}`);
  return m ? Number(m[1]) : undefined;
}

/** D338: a Space Mem answered 404 for is tried again once a day, or when nmem's version changes. */
export const UNREAD_RETRY_MS = 24 * 3_600_000;

/** D334: a Space's name as a context name part: lowercase letters, digits and hyphens, at most 16 (else from its id). */
export function spaceSlug(label: string, id: string): string {
  const of = (t: string) => t.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 16).replace(/-+$/, "");
  return of(label) || of(id) || "space";
}

/** D334: the home's local context for one more Space: its connection's label, then `-in-<space slug>`. */
export function placeContext(base: string, label: string, id: string, taken: ReadonlySet<string>): string {
  const head = `${base}-in-${spaceSlug(label, id)}`;
  if (!taken.has(head)) return head;
  for (let n = 2; ; n++) if (!taken.has(`${head}-${n}`)) return `${head}-${n}`;
}

/** D334: every place passive `bridge setup` lists (the person's Spaces), by exact id. */
export function candidatesIn(setup: any): { id: string; label: string; kind?: string }[] | undefined {
  if (!Array.isArray(setup?.candidates)) return undefined;
  return setup.candidates
    .filter((c: any) => c && typeof c.id === "string" && c.id)
    .map((c: any) => ({ id: c.id, label: typeof c.label === "string" && c.label.trim() ? c.label.trim() : c.id, ...(typeof c.kind === "string" ? { kind: c.kind } : {}) }));
}

/** D334: the Spaces whose cards (`bridge contacts --all-spaces`) name this identity. */
export function identitySpaces(j: any, agent: string): Set<string> {
  const list = Array.isArray(j?.contacts) ? j.contacts : Array.isArray(j?.cards) ? j.cards : [];
  const out = new Set<string>();
  for (const c of list) {
    const who = c?.agent_id ?? c?.agent?.agent_id ?? c?.agent?.id ?? (typeof c?.agent === "string" ? c.agent : undefined);
    const space = c?.resolved_space_id ?? c?.space_id ?? c?.space?.id;
    if (who === agent && typeof space === "string" && space) out.add(space);
  }
  return out;
}

/** D334: whether this nmem reads every Space with one inbox (Mem #10402): `bridge inbox --help` offers `--all-spaces`. */
export function wideInboxIn(help: string): boolean {
  return /--all-spaces\b/.test(help);
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
export const detailIn = (out: string, err: string): string => {
  for (const j of jsonIn(out, err)) if (typeof j?.detail === "string" && j.detail.trim()) return clip(j.detail);
  // research/124: `nmem --json` says `{"error": "not_found", …}` or `{"message": …}`; the row shows those words, never the braces.
  for (const j of jsonIn(out, err))
    for (const w of [j?.message, j?.error?.message, j?.error]) if (typeof w === "string" && w.trim()) return clip(w.replace(/_/g, " "));
  return clip(err || out || "no answer");
};

/**
 * The one personal place among passive setup's candidates ("Only me"), or undefined: none, or more
 * than one (never a guess between them).
 */
export function personalSpace(setup: any, local = false): { id: string; label: string } | undefined {
  const list = (Array.isArray(setup?.candidates) ? setup.candidates : []).filter((c: any) => c && typeof c.id === "string" && c.id);
  const personal = list.filter((c: any) => c.kind === "personal");
  // D269: Mem on this computer (the app, a Vault) may hold one place of another kind: that one.
  const pick = personal.length === 1 ? personal : local && list.length === 1 ? list : [];
  if (pick.length !== 1) return undefined;
  const c = pick[0];
  return { id: c.id, label: typeof c.label === "string" && c.label.trim() ? c.label.trim() : "Only me" };
}


/** D295: `nmem status`.backend in the person's words: the cloud, this computer, or their own server. */
/** D324: a computer's name as a connection label part: lowercase letters, digits and hyphens, at most 24. */
export function homeSlug(home: string): string {
  const s = home.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24).replace(/-+$/, "");
  return s || "home";
}

/** D324: six hex characters of the home's key fingerprint (D293). */
export function keyTag(fp: string | undefined): string | undefined {
  if (!fp) return undefined;
  const raw = Buffer.from(fp, "base64url");
  return (raw.length >= 3 ? raw.subarray(0, 3) : createHash("sha256").update(fp).digest().subarray(0, 3)).toString("hex");
}

/**
 * D324: the home's own name for its connection (Mem's `--context`, which Mem shows as the
 * connection's label): `<identity>-on-<home>-<key tag>`, then `-2`... after a revoked one (Mem never
 * reopens a revoked connection under its old name).
 */
export function homeLabel(agent: string, home: string, fp?: string, gen = 1): string {
  const tag = keyTag(fp);
  return [agent.slice(0, 80), "on", homeSlug(home), ...(tag ? [tag] : []), ...(gen > 1 ? [String(gen)] : [])].join("-");
}

/** D324: which home a connection's label names (its slug and key tag); undefined: a label from before D324 (or not Ducter's). */
export function labelHome(label: string, agent: string): { home: string; tag?: string; gen: number } | undefined {
  const head = `${agent}-on-`;
  if (!label.startsWith(head)) return undefined;
  const parts = label.slice(head.length).split("-").filter(Boolean);
  let gen = 1;
  if (parts.length > 1 && /^[2-9]$/.test(parts.at(-1)!)) gen = Number(parts.pop());
  const tag = parts.length > 1 && /^[0-9a-f]{6}$/.test(parts.at(-1)!) ? parts.pop() : undefined;
  return parts.length ? { home: parts.join("-"), ...(tag ? { tag } : {}), gen } : undefined;
}

/** One connection in Mem's list for the identity, as Ducter reads it (D324). */
export interface MemConnection {
  connectionId: string;
  label: string;
  active: boolean;
}

/** D329: the Nowledge Mem app's bundle, as macOS keeps it in Applications. */
export const MEM_APP = "Nowledge Mem.app";

/**
 * D329: a failed `nmem status` that says Mem on this very computer didn't answer (the Mem app, or a
 * Vault, closed): a refused or failed connection to a loopback address. Anything else (no sign-in, a
 * remote server down) is not "closed".
 */
export function memClosedIn(text: string): boolean {
  return /(connection refused|tcp connect error|error sending request|couldn'?t connect|failed to connect)/i.test(text) && /(127\.0\.0\.1|localhost|\[::1\])/i.test(text);
}

export const whereOf = (backend: string): "cloud" | "local" | "server" => (backend === "cloud" ? "cloud" : backend === "local" ? "local" : "server");

export interface BridgeLink extends BridgeLinkApi {
  /** The row for Settings › 伙伴; undefined when memory is off (nothing shows). */
  view(): Promise<BridgeView | undefined>;
  connect(how?: { here?: boolean }): Promise<void>;
  /** D324: this home alone answers the partner's mailbox: connect here if needed, then end the other homes' connections. */
  onlyHere(): Promise<void>;
  /** D324: reads Mem's list again (read-only) and drops this home's connection if another home ended it. */
  recheck(): Promise<void>;
  disconnect(): Promise<void>;
  /** D225: puts in (or updates) the home's `nmem` with Mem's official route, on the user's tap. */
  installMem(): Promise<void>;
  /** D225: signs the home's `nmem` in with a one-time connect link (never logged or kept). */
  signInMem(link: string): Promise<void>;
  /** D329: mem_closed: opens the Nowledge Mem app on the home (a Mac with the app), then looks again. */
  openMem(): Promise<void>;
  /** D329: Mem answered here at the last look, signed in (the first words' line); false before any look. */
  memSignedIn(): boolean;
  /**
   * D329: Update all's Mem step. behind: the home's nmem has a newer version Mem names and Ducter can
   * update this copy (from: now, to: Mem's newer, "" when unnamed); cached: the same from the last
   * look, without asking; update: the update (installMem's), then how it went.
   */
  memUpdate: {
    behind(): Promise<{ from: string; to: string } | undefined>;
    cached(): { from: string; to: string } | undefined;
    run(): Promise<{ ok: true } | { ok: false; detail?: string }>;
  };
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
  /** D324: the home's key fingerprint (D293), carried in its connection's label. */
  homeFp?: () => string | undefined;
  run?: NmemCall;
  exec?: MemExec;
  sys?: MemSys;
  env?: Record<string, string | undefined>;
  now?: () => number;
  /** D340: false: this home connects only when asked, and its ready view says so (asks). */
  byItself?: () => boolean;
  /** D371: Mem's code when the partner's mailbox needs sorting out on Mem's side (the partner says so). */
  trouble?: () => { code: string } | undefined;
  /** D329: where the Nowledge Mem app is on this computer (a Mac); undefined: none to open. Tests inject it. */
  memApp?: () => string | undefined;
  /** D329: how long openMem waits for the app to answer, looking every `openEveryMs`. */
  openWaitMs?: number;
  openEveryMs?: number;
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
  // D324: else the home's own label for the identity (a later generation past a revoked one).
  const contextFor = (agent: string, conns?: MemConnection[]) => {
    const forced = env.DUCTER_BRIDGE_CONTEXT?.trim();
    if (forced) return forced;
    const fp = opts.homeFp?.();
    for (let gen = 1; gen < 9; gen++) {
      const l = homeLabel(agent, opts.home(), fp, gen);
      if (!conns?.some((c) => c.label === l && !c.active)) return l;
    }
    return homeLabel(agent, opts.home(), fp, 9);
  };
  const stuck = new Set<string>(); // D324: other homes' connections Mem wouldn't revoke from here
  /** D324: a connection this home made (its record's, or its own label with its own key tag). */
  const ownConn = (c: MemConnection, r: BridgeConnectionRecord | undefined, agent: string) => {
    if (r && c.connectionId === r.connectionId) return true;
    const h = labelHome(c.label, agent);
    const tag = keyTag(opts.homeFp?.());
    return !!h && !!tag && h.tag === tag && h.home === homeSlug(opts.home());
  };
  /** D324: other homes' active connections for the identity (one a revoke from here didn't end is stuck). */
  const othersIn = (conns: MemConnection[] | undefined, r: BridgeConnectionRecord | undefined, agent: string) =>
    (conns ?? [])
      .filter((c) => c.active && !ownConn(c, r, agent))
      .map((c) => {
        const h = labelHome(c.label, agent);
        return { label: c.label, connectionId: c.connectionId, ...(h ? { home: h.home } : {}), ...(stuck.has(c.connectionId) ? { stuck: true as const } : {}) };
      });
  const pinned = () => env.DUCTER_BRIDGE === "1" && !!env.DUCTER_BRIDGE_CONTEXT?.trim();
  const agentNow = () => opts.identity() ?? opts.fallbackIdentity?.() ?? "ducter";

  type Probe = { at: number; version?: string; supported: boolean; signedIn: boolean; closed?: boolean; backend?: string; space?: { id: string; label: string }; updateAvailable?: boolean; latest?: string; conns?: MemConnection[] };
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
      // D329: the Mem it talks to is this computer's own (the app) and nothing answers there: the app is closed.
      const closed = !sj && !!st && st.code !== 0 && memClosedIn(`${st.err}\n${st.out}`);
      if (closed) return (probe = { at: now(), version: shortVersion, supported, signedIn: false, closed });
      const backend = typeof sj?.backend === "string" ? sj.backend : undefined;
      // Mem's own word that a newer nmem is out (`status`.update; its command is only a hint).
      const updateAvailable = sj?.update?.update_available === true;
      // D257: the newer version's number, when Mem names it (said beside 有新版本 / New version).
      const latest = updateAvailable && typeof sj?.update?.latest === "string" ? parseNmemVersion(sj.update.latest)?.join(".") : undefined;
      let space: { id: string; label: string } | undefined;
      if (signedIn) {
        // Passive: no context, no Space, never --enable. It lists the user's places and picks none.
        // D269: asked of every Mem, the cloud's and this computer's own (the app, a Vault): Mem says
        // whether it connects agents, never Ducter's guess from where it runs.
        const s = await run(["bridge", "setup"]);
        if (s && s.code === 0) space = personalSpace(jsonIn(s.out)[0], backend === "local");
      }
      // D324: every connection Mem holds for the identity in that place (read-only): which homes answer it.
      const r = read();
      const where = r ? { space: r.spaceId, agent: r.agentId } : space ? { space: space.id, agent: agentNow() } : undefined;
      const conns = signedIn && where ? await listConns(where.space, where.agent) : undefined;
      return (probe = { at: now(), version: shortVersion, supported, signedIn, ...(backend ? { backend } : {}), ...(space ? { space } : {}), ...(updateAvailable ? { updateAvailable } : {}), ...(latest ? { latest } : {}), ...(conns ? { conns } : {}) });
    })().finally(() => (probing = undefined));
    return probing;
  }

  /** Mem's whole list for the identity in one place; undefined when it can't be told (a failure, a partial page). */
  async function listConns(spaceId: string, agentId: string): Promise<MemConnection[] | undefined> {
    const l = await run(["bridge", "connections", "list", "--space-id", spaceId, "--agent-id", agentId]);
    if (!l || l.code !== 0) return undefined;
    const j = jsonIn(l.out)[0];
    if (!Array.isArray(j?.connections) || j.next_connection_id) return undefined; // a partial page proves nothing
    return j.connections
      .filter((c: any) => typeof c?.connection_id === "string" && (c.agent_id === undefined || c.agent_id === agentId))
      .map((c: any) => ({ connectionId: c.connection_id, label: typeof c.client_label === "string" ? c.client_label : "", active: c.state === "active" }));
  }

  // A connection revoked somewhere else (Mem's own list) is dropped here. D324: the list is read with
  // every probe, so a home whose connection another home ended notices at its next look.
  function verify(r: BridgeConnectionRecord, conns: MemConnection[] | undefined): boolean {
    if (!conns) return true; // can't tell: keep it
    const mine = conns.find((c) => c.connectionId === r.connectionId);
    if (mine?.active) return true;
    drop();
    probe = undefined; // the next look reads Mem's list again: which home answers now
    probeAt = 0;
    changed();
    return false;
  }

  // D333: the card says where this home reads. Only an identity Ducter enrolled (source app
  // `ducter`) and only over a description Ducter wrote (or none): the person's own words stay.
  // Once per place and home a run; a failure is tried again at the next recheck.
  let carded: string | undefined;
  async function publishWhere(r: BridgeConnectionRecord) {
    if (!r.confirmed || env.DUCTER_BRIDGE_CONTEXT?.trim()) return;
    const want = whereCard(opts.home(), readsOf(r));
    const key = `${r.agentId}\0${want}`;
    if (carded === key) return;
    const shown = await run(["agents", "show", r.agentId]);
    const j = shown && shown.code === 0 ? jsonIn(shown.out)[0] : undefined;
    const a = j?.agent ?? j?.profile ?? j;
    if (!a || typeof a !== "object") return;
    const app = a.source_app ?? a.sourceApp;
    const desc = typeof a.description === "string" ? a.description.trim() : "";
    if (app !== "ducter" || (desc && !desc.startsWith(CARD_MARK))) return void (carded = key);
    if (desc === want) return void (carded = key);
    const set = await run(["agents", "set", r.agentId, "--description", want]);
    if (set?.code === 0) carded = key;
  }

  // D334: the home reads the identity's mailbox in every Space it is reachable in. Read-only looks
  // (`bridge inbox --help`, passive `bridge setup`, `bridge contacts --all-spaces`, `agents context
  // show`), and for a Space not read yet, `agents context select` (a local context; Mem checks it on
  // use). Never a connect, an enrol or `--enable`: a Space Mem refuses stays unread, said once.
  const wideBy = new Map<string, boolean>(); // per nmem version: one inbox for every Space (#10402)
  async function wideInbox(): Promise<boolean> {
    const v = probe?.version ?? "";
    const known = wideBy.get(v);
    if (known !== undefined) return known;
    const h = await run(["bridge", "inbox", "--help"]);
    const wide = !!h && h.code === 0 && wideInboxIn(`${h.out}\n${h.err}`);
    if (h) wideBy.set(v, wide);
    return wide;
  }
  let discovering: Promise<void> | undefined;
  function discover(r0: BridgeConnectionRecord): Promise<void> {
    return (discovering ??= (async () => {
      if (!r0.confirmed || env.DUCTER_BRIDGE_CONTEXT?.trim()) return;
      const save = (next: BridgeConnectionRecord) => {
        const cur = read();
        if (!cur || cur.connectionId !== r0.connectionId) return; // ended meanwhile
        const keep = { ...cur, places: next.places, unread: next.unread, wide: next.wide };
        if (!keep.places?.length) delete keep.places;
        if (!keep.unread?.length) delete keep.unread;
        if (!keep.wide) delete keep.wide;
        if (JSON.stringify(keep) === JSON.stringify(cur)) return;
        write(keep);
        changed();
      };
      if (await wideInbox()) return save({ ...r0, places: [], unread: [], wide: true });
      // Every Space the person reads (passive: no context, nothing chosen).
      const s = await run(["bridge", "setup"]);
      const spaces = s && s.code === 0 ? candidatesIn(jsonIn(s.out)[0]) : undefined;
      if (!spaces) return; // can't tell: keep what the home reads now
      // The Spaces whose cards name the identity; none told (Mem hides the caller's own card, or the
      // look failed): every Space the person reads.
      const c = await run(["--agent-context", r0.context, "bridge", "contacts", "--all-spaces", "--query", r0.agentId]);
      const named = c && c.code === 0 ? identitySpaces(jsonIn(c.out)[0], r0.agentId) : new Set<string>();
      named.delete(r0.spaceId);
      const want = spaces.filter((x) => x.id !== r0.spaceId && (named.size ? named.has(x.id) : true));
      const before = new Map((r0.places ?? []).map((p) => [p.spaceId, p]));
      const taken = new Set<string>([r0.context, ...(r0.places ?? []).map((p) => p.context)]);
      const places: NonNullable<BridgeConnectionRecord["places"]> = [];
      const unread: NonNullable<BridgeConnectionRecord["unread"]> = [];
      const refused = new Map((r0.unread ?? []).map((u) => [u.spaceId, u]));
      // The nmem in use now, looked up (cached 5 min) only when a 404 Space is to be decided.
      let nmemNow: string | undefined;
      const nmemVersion = async () => (nmemNow ??= (await look().catch(() => probe))?.version ?? "");
      for (const sp of want) {
        const had = before.get(sp.id);
        if (had) {
          places.push({ ...had, spaceLabel: sp.label, ...(sp.kind ? { kind: sp.kind } : {}) });
          continue;
        }
        // D338: a Space Mem answered 404 for (nmem 0.10.120: the identity is a contact there but can't
        // be selected, nowledge-co/mem#10402) is asked again once a day, or with another nmem.
        const was = refused.get(sp.id);
        if (was?.status === 404 && was.at && now() - Date.parse(was.at) < UNREAD_RETRY_MS && (was.nmem ?? "") === (await nmemVersion())) {
          unread.push({ ...was, spaceLabel: sp.label });
          continue;
        }
        // A context by that name already (an earlier run's) is used when it is this identity in this
        // Space; one that is something else keeps its name, and this one takes the next.
        let name = placeContext(r0.context, sp.label, sp.id, taken);
        let reuse = false;
        for (let tries = 0; tries < 3; tries++) {
          const shown = await run(["agents", "context", "show", "--name", name]);
          const sj = shown && shown.code === 0 ? jsonIn(shown.out)[0] : undefined;
          if (!sj?.configured) break;
          if (sj.selection?.address?.agent_id === r0.agentId && sj.selection?.scope?.space_id === sp.id) {
            reuse = true;
            break;
          }
          taken.add(name);
          name = placeContext(r0.context, sp.label, sp.id, taken);
        }
        taken.add(name);
        if (reuse) {
          places.push({ context: name, spaceId: sp.id, spaceLabel: sp.label, ...(sp.kind ? { kind: sp.kind } : {}) });
          continue;
        }
        const sel = await run(["agents", "context", "select", "--name", name, "--agent-id", r0.agentId, "--space-id", sp.id]);
        const j = sel && sel.code === 0 ? jsonIn(sel.out)[0] : undefined;
        const said = j?.selection ?? j?.context?.selection;
        const ok = !!sel && sel.code === 0 && (!said || ((said.address?.agent_id ?? r0.agentId) === r0.agentId && (said.scope?.space_id ?? sp.id) === sp.id));
        if (ok) places.push({ context: name, spaceId: sp.id, spaceLabel: sp.label, ...(sp.kind ? { kind: sp.kind } : {}) });
        else if (sel) {
          const code = errorCodeIn(sel.out, sel.err);
          const status = httpStatusIn(sel.out, sel.err);
          const v = status === 404 ? await nmemVersion() : "";
          unread.push({ spaceId: sp.id, spaceLabel: sp.label, ...(code ? { code } : {}), ...(status ? { status } : {}), ...(status === 404 ? { at: new Date(now()).toISOString(), ...(v ? { nmem: v } : {}) } : {}) });
        }
      }
      save({ ...r0, places, unread, wide: false });
    })().finally(() => (discovering = undefined)));
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
  /** D329: Update all's view of the home's Mem: behind, from the last look (refreshed by every view and behind()). */
  let behindNow: { from: string; to: string } | undefined;
  const memAppHere = opts.memApp ?? (() => (sys.platform !== "darwin" ? undefined : [join("/Applications", MEM_APP), join(sys.home, "Applications", MEM_APP)].find(sys.exists)));
  let opening = false;

  const shown = (o: { label: string; home?: string; stuck?: true }) => ({ label: o.label, ...(o.home ? { home: o.home } : {}), ...(o.stuck ? { stuck: true as const } : {}) });
  /** D324: end other homes' connections for the identity (on the person's tap); one Mem won't end from here stays, marked stuck. */
  async function revokeOthers(r: BridgeConnectionRecord) {
    const conns = await listConns(r.spaceId, r.agentId);
    for (const o of othersIn(conns, r, r.agentId)) {
      const v = await run(["bridge", "connections", "revoke", o.connectionId]);
      const j = v && v.code === 0 ? jsonIn(v.out)[0] : undefined;
      const gone = (j?.connection?.connection_id === o.connectionId && j?.connection?.state === "revoked") || (!!v && errorCodeIn(v.out, v.err) === "cloud_bridge_setup_connection_revoked");
      if (gone) stuck.delete(o.connectionId);
      else stuck.add(o.connectionId);
    }
  }

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
    const said = (q: Probe): Partial<BridgeView> => ({ home, ...(q.version ? { version: q.version } : {}), ...(q.backend ? { where: whereOf(q.backend) } : {}), ...(q.updateAvailable ? { newer: q.latest ?? "" } : {}) });
    const extras = async (): Promise<Partial<BridgeView>> => {
      if (!p) return {};
      if (memDone && now() - memDone.at < DONE_SHOWN_MS) return { ...said(p), done: memDone.kind };
      if (!p.supported) return said(p);
      const u = await upkeepFor(p);
      behindNow = u?.kind === "update" && p.version ? { from: p.version, to: p.latest ?? "" } : undefined;
      return u ? { ...said(p), upkeep: { kind: u.kind, ...(memFailed ? { detail: memFailed, ...(memKept ? { kept: true as const } : {}) } : {}) } } : said(p);
    };
    if (r && p?.supported && !verify(r, p.conns)) return view(); // revoked elsewhere: the row as it is now
    if (r && p?.supported) {
      if (!r.confirmed) return { state: "unconfirmed", ...base, ...(undoFailed ? { detail: undoFailed } : {}) };
      const others = othersIn(p.conns, r, r.agentId);
      // D334: a Space Mem refused a reader in: one quiet problem row (never a list of Spaces otherwise).
      const unread = r.unread?.length ? { unread: r.unread.map((u) => ({ label: u.spaceLabel, ...(u.code ? { code: u.code } : {}), ...(u.status ? { status: u.status } : {}) })) } : {};
      const stuck = opts.trouble?.();
      return { state: "connected", ...(await extras()), ...base, ...(others.length ? { others: others.map(shown) } : {}), ...unread, ...(stuck ? { stuck: { code: stuck.code } } : {}), ...(undoFailed ? { detail: undoFailed } : {}) };
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
    if (p.closed) {
      const app = memAppHere();
      return { state: "mem_closed", identity: agent, home, ...(p.version ? { version: p.version } : {}), ...(app ? { canOpen: true } : {}) };
    }
    if (!p.signedIn) return { state: "sign_in", identity: agent, home, version: p.version, ...(memDone && now() - memDone.at < DONE_SHOWN_MS ? { done: memDone.kind } : {}), ...(signIn ? { signIn } : {}), ...(signInDetail ? { detail: signInDetail } : {}) };
    // D269: only when Mem on this computer offers no place to connect in does the row say so.
    if (p.backend === "local" && !p.space) return { state: "local_mem", identity: agent, home, ...(await extras()) };
    if (outcome) return { ...outcome, ...base };
    if (!p.space) return { state: "no_space", identity: agent, ...(await extras()) };
    // D324: another home answers this partner's mailbox now: say where, never connect beside it.
    const others = othersIn(p.conns, undefined, agent);
    if (others.length) return { state: "elsewhere", ...(await extras()), ...base, others: others.map(shown) };
    return { state: "ready", ...(await extras()), ...base, ...(opts.byItself?.() === false ? { asks: true as const } : {}) };
  };

  const api: BridgeLink = {
    context() {
      const r = read();
      return r?.confirmed ? r.context : undefined;
    },
    places() {
      const r = read();
      if (!r?.confirmed) return undefined;
      return {
        wide: !!r.wide,
        places: [{ context: r.context, spaceId: r.spaceId, spaceLabel: r.spaceLabel }, ...(r.wide ? [] : (r.places ?? []).map((p) => ({ context: p.context, spaceId: p.spaceId, spaceLabel: p.spaceLabel, ...(p.kind ? { kind: p.kind } : {}) })))],
      };
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
    async connect(how) {
      const agent = agentNow();
      if (busy || pinned() || !ID.test(agent) || (opts.memoryOn && !opts.memoryOn())) return;
      busy = "connecting";
      outcome = undefined;
      undoFailed = undefined;
      changed();
      try {
        const p = await look(true);
        if (!p?.supported || !p.signedIn || !p.space) return; // the row says why (install, update, sign in, no_space)
        // D324: another home answers it: only 改由这台收 (here) connects beside it, and then ends that one.
        if (!how?.here && othersIn(p.conns, undefined, agent).length) return;
        const ctx = contextFor(agent, p.conns);
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
        else if (how?.here) await revokeOthers(read()!);
        if (confirmed) await discover(read()!).catch(() => {});
        if (confirmed) await publishWhere(read()!).catch(() => {});
        await look(true);
      } finally {
        busy = undefined;
        changed();
      }
    },
    async recheck() {
      // D324: a connection another home ended (改由这台收 there) stops this home's checks at the next recheck.
      const r = read();
      if (!r || busy || pinned()) return;
      const conns = await listConns(r.spaceId, r.agentId);
      if (!verify(r, conns)) return;
      // D334: Spaces the identity was added to or left since the last look.
      await discover(r).catch(() => {});
      await publishWhere(read() ?? r).catch(() => {});
    },
    async onlyHere() {
      // D324: 改由这台收 / 只留这台: connected here first (never a moment with nobody answering), then the others end.
      const r = read();
      if (!r?.confirmed) return this.connect({ here: true });
      if (busy || pinned()) return;
      busy = "connecting";
      changed();
      try {
        await revokeOthers(r);
        await look(true);
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
          await look(true); // D324: Mem's list as it is now, so this home's own ended one isn't read as another's
        } else {
          const code = v ? errorCodeIn(v.out, v.err) : undefined;
          undoFailed = code && REFUSALS[code] === "unavailable" ? "Nowledge Mem can't take it right now" : v ? detailIn(v.out, v.err) : "nmem didn't start";
        }
      } finally {
        busy = undefined;
        changed();
      }
    },
    async openMem() {
      const app = memAppHere();
      if (!app || opening || (opts.memoryOn && !opts.memoryOn())) return;
      opening = true;
      changed();
      try {
        // The person's tap is the Go; `open` hands it to macOS, which starts the app as the person would.
        await exec(["/usr/bin/open", "-a", app], 15_000);
        const until = now() + (opts.openWaitMs ?? 20_000);
        const every = opts.openEveryMs ?? 2000;
        for (;;) {
          const q = await look(true);
          if (q && !q.closed) {
            if (q.signedIn) memReady();
            break;
          }
          if (now() >= until) break;
          await new Promise((r) => setTimeout(r, every));
        }
      } finally {
        opening = false;
        changed();
      }
    },
    memSignedIn: () => !!probe?.supported && probe.signedIn,
    memUpdate: {
      async behind() {
        if (env.DUCTER_BRIDGE === "0" || (opts.memoryOn && !opts.memoryOn())) return (behindNow = undefined);
        const p = await look();
        if (!p?.supported || !p.signedIn || busy) return (behindNow = undefined);
        const u = await upkeepFor(p);
        return (behindNow = u?.kind === "update" && p.version ? { from: p.version, to: p.latest ?? "" } : undefined);
      },
      cached: () => (opts.memoryOn && !opts.memoryOn() ? undefined : behindNow),
      async run() {
        if (busy) return { ok: false, detail: "busy" };
        await api.installMem();
        if (memDone?.kind === "updated" || memDone?.kind === "moved") {
          behindNow = undefined;
          return { ok: true };
        }
        return { ok: false, ...(memFailed ? { detail: memFailed } : {}) };
      },
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
  return api;
}
