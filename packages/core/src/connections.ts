// Connections (D96, design/connectors.md): the user's own OpenConnector (OOMOL Hosted or
// self-hosted) or any other MCP server, reached only through this broker.
//
//   - The token lives in <dataDir>/connection-tokens.json (0600), never in a harness's config,
//     env, args or files, never in the Log, never in a client frame.
//   - Every call is a `connection_call` event. Reads run. A write (anything the server does not
//     mark as a read; unknown counts as a write) is staged with its input and runs once, only
//     after the user's Go on the decision card the partner made for it.
//   - Tasks read only what the partner granted them, and never write.
import { chmodSync, existsSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Bodies, ConnectionReason, ConnectionSource, ConnectionView, OoDetect } from "@ducter/protocol";
import type { ConnectionCaller, ConnectionInfo, ConnectionOutcome, ConnectionsApi, LogStore } from "@ducter/protocol/src/internal.ts";

export const CONNECTIONS_FILE = "connections.json";
export const CONNECTION_TOKENS_FILE = "connection-tokens.json";
const RESULT_MAX = 24_000; // characters of a result handed to a model
const SUMMARY_MAX = 200;
const RECHECK_MS = 5 * 60_000;

// ---------- the MCP link (a seam for tests) ----------

export interface LinkTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
}
export interface LinkResult {
  isError: boolean;
  /** structuredContent, or the text parsed as JSON when it is JSON, else the text. */
  data: unknown;
}
export interface Link {
  tools(): Promise<LinkTool[]>;
  call(name: string, args: Record<string, unknown>): Promise<LinkResult>;
  close(): Promise<void>;
}
export type Linker = (url: string, token?: string) => Promise<Link>;

export class LinkError extends Error {
  constructor(
    readonly reason: "unreachable" | "unauthorized" | "not_mcp",
    message: string,
  ) {
    super(message);
  }
}

function linkErrorOf(err: unknown): LinkError {
  if (err instanceof LinkError) return err;
  const m = String((err as Error)?.message ?? err);
  if (/\b401\b|\b403\b|unauthori[sz]ed|forbidden/i.test(m)) return new LinkError("unauthorized", m);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|timed? ?out|Unable to connect|abort/i.test(m)) return new LinkError("unreachable", m);
  return new LinkError("not_mcp", m);
}

/** The real link: one MCP client over Streamable HTTP, Bearer token in a header only. */
export const httpLinker: Linker = async (url, token) => {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const client = new Client({ name: "ducter", version: "0.0.1" });
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });
  try {
    await client.connect(transport);
  } catch (err) {
    await client.close().catch(() => {});
    throw linkErrorOf(err);
  }
  return {
    async tools() {
      try {
        const r = await client.listTools();
        return r.tools as LinkTool[];
      } catch (err) {
        throw linkErrorOf(err);
      }
    },
    async call(name, args) {
      let r: Awaited<ReturnType<typeof client.callTool>>;
      try {
        r = await client.callTool({ name, arguments: args });
      } catch (err) {
        throw linkErrorOf(err);
      }
      const text = Array.isArray(r.content)
        ? (r.content as { type: string; text?: string }[]).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n")
        : "";
      let data: unknown = r.structuredContent ?? text;
      if (r.structuredContent === undefined && text) {
        try {
          data = JSON.parse(text);
        } catch {
          /* plain text */
        }
      }
      return { isError: Boolean(r.isError), data };
    },
    close: () => client.close().catch(() => {}),
  };
};

// ---------- addresses ----------

const PRIVATE_HOST = /^(localhost|127(\.\d{1,3}){3}|\[::1\]|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}|[a-z0-9-]+\.local|host\.docker\.internal)$/i;

/**
 * The MCP endpoint for an address the user typed: an OpenConnector base URL gets "/mcp".
 * Plain http only for this machine and the local network (a token must not cross the internet
 * in the clear). No credentials, query or fragment in the address.
 */
export function normalizeUrl(raw: string): string | undefined {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return;
  if (u.username || u.password || u.search || u.hash) return;
  if (u.protocol === "http:" && !PRIVATE_HOST.test(u.hostname)) return;
  const path = u.pathname.replace(/\/+$/, "");
  u.pathname = /\/mcp$/.test(path) ? path : `${path}/mcp`;
  return u.toString();
}

const isOomol = (url: string) => {
  try {
    const h = new URL(url).hostname;
    return h === "oomol.com" || h.endsWith(".oomol.com");
  } catch {
    return false;
  }
};

/** OpenConnector's MCP endpoint exposes this discovery set (research/34 §4). */
const OC_TOOLS = ["search_actions", "get_action_guide", "execute_action"];
const isOpenConnector = (tools: LinkTool[]) => OC_TOOLS.every((n) => tools.some((t) => t.name === n));

// ---------- the oo CLI (OOMOL's) ----------

export function ooConfigDir(env: Record<string, string | undefined> = process.env, platform = process.platform, home = homedir()): string {
  if (env.OO_CONFIG_DIR) return env.OO_CONFIG_DIR;
  if (env.XDG_CONFIG_HOME) return join(env.XDG_CONFIG_HOME, "oo");
  if (platform === "darwin") return join(home, "Library", "Application Support", "oo");
  if (platform === "win32") return join(env.APPDATA ?? join(home, "AppData", "Roaming"), "oo");
  return join(home, ".config", "oo");
}

/** [self_hosted] url / token from oo's connector.toml (a two-key subset of TOML). */
export function parseOoConnectorToml(text: string): { url?: string; token?: string } {
  const out: { url?: string; token?: string } = {};
  let inSection = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("[")) {
      inSection = line === "[self_hosted]";
      continue;
    }
    if (!inSection) continue;
    const m = /^(url|token)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')\s*(#.*)?$/.exec(line);
    if (m) out[m[1] as "url" | "token"] = m[2] !== undefined ? m[2].replace(/\\(["\\])/g, "$1") : m[3];
  }
  return out;
}

export interface OoSource {
  detect(): OoDetect;
  /** Reads the self-hosted address and token: only when the user tapped to use them. */
  read(): { url: string; token?: string } | undefined;
}

export function ooSource(opts: { env?: Record<string, string | undefined>; dir?: string; which?: (bin: string) => string | null } = {}): OoSource {
  const env = opts.env ?? process.env;
  const dir = opts.dir ?? ooConfigDir(env);
  const which = opts.which ?? ((b: string) => Bun.which(b) ?? (existsSync(join(homedir(), ".local", "bin", b)) ? join(homedir(), ".local", "bin", b) : null));
  const fromFile = () => {
    const p = join(dir, "connector.toml");
    if (!existsSync(p)) return;
    try {
      return parseOoConnectorToml(readFileSync(p, "utf8"));
    } catch {
      return;
    }
  };
  // oo's own precedence (docs/self-hosted-connector.md): OO_CONNECTOR_URL, then connector.toml.
  const resolve = () => (env.OO_CONNECTOR_URL ? { url: env.OO_CONNECTOR_URL, token: env.OO_CONNECTOR_TOKEN } : fromFile());
  return {
    detect() {
      const auth = join(dir, "auth.toml");
      let account = false;
      try {
        account = existsSync(auth) && statSync(auth).size > 0;
      } catch {
        /* no account */
      }
      const r = resolve();
      return {
        installed: Boolean(which("oo")) || existsSync(dir),
        ...(r?.url ? { selfHosted: { url: r.url, hasToken: Boolean(r.token) } } : {}),
        account,
      };
    },
    read() {
      const r = resolve();
      return r?.url ? { url: r.url, ...(r.token ? { token: r.token } : {}) } : undefined;
    },
  };
}

// ---------- the store ----------

interface Record_ {
  id: string;
  name: string;
  url: string;
  source: ConnectionSource;
  addedAt: string;
  via: "manual" | "oo";
  /** Optional, hand-edited: action or tool patterns ("gmail.*", "*.send_*"); deny wins. */
  policy?: { allow?: string[]; deny?: string[] };
}

function writePrivate(path: string, data: unknown) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (err) {
    console.warn(`[connections] ${path} is unreadable; starting empty:`, (err as Error).message);
    return fallback;
  }
}

const glob = (pat: string, s: string) => new RegExp(`^${pat.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i").test(s);

export function policyAllows(policy: Record_["policy"], action: string): boolean {
  if (policy?.deny?.some((p) => glob(p, action))) return false;
  if (policy?.allow?.length) return policy.allow.some((p) => glob(p, action));
  return true;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** A short, secret-free line about a result for the Log (never the provider's output itself). */
export function summarize(data: unknown): string {
  const d = data as { ok?: boolean; data?: unknown; error?: { code?: string; message?: string } };
  if (d && typeof d === "object" && "ok" in d) {
    if (d.ok === false) return clip(`error ${d.error?.code ?? ""}`.trim(), SUMMARY_MAX);
    data = d.data;
  }
  if (Array.isArray(data)) return `${data.length} items`;
  if (data && typeof data === "object") {
    const arrays = Object.entries(data as Record<string, unknown>).filter(([, v]) => Array.isArray(v)) as [string, unknown[]][];
    if (arrays.length) return clip(arrays.map(([k, v]) => `${v.length} ${k}`).join(", "), SUMMARY_MAX);
    return clip(`fields: ${Object.keys(data as object).slice(0, 8).join(", ")}`, SUMMARY_MAX);
  }
  return typeof data === "string" ? `${data.length} chars` : "ok";
}

const forModel = (data: unknown): unknown => {
  const s = typeof data === "string" ? data : JSON.stringify(data);
  if (s.length <= RESULT_MAX) return data;
  return { truncated: true, note: `The result was ${s.length} characters; the first ${RESULT_MAX} follow. Narrow the query for less.`, head: s.slice(0, RESULT_MAX) };
};

/** An OpenConnector payload that says ok: false is an error even when the MCP call isn't. */
const failed = (r: LinkResult) => r.isError || ((r.data as { ok?: boolean })?.ok === false);
const errorText = (r: LinkResult) => {
  const e = (r.data as { error?: { code?: string; message?: string } })?.error;
  if (e) return clip(`${e.code ?? "error"}: ${e.message ?? ""}`, 400);
  return clip(typeof r.data === "string" ? r.data : JSON.stringify(r.data), 400);
};

export interface ConnectionsStore extends ConnectionsApi {
  /** Settings: the user's connections, without secrets. */
  view(): ConnectionView[];
  /** Settings: checks the address and token, then saves. */
  add(input: { url: string; token?: string; name?: string; via?: "manual" | "oo" }): Promise<{ ok: true; id: string } | { ok: false; reason: ConnectionReason }>;
  remove(id: string): boolean;
  oo(): OoDetect;
  /** The one tap: the self-hosted OpenConnector oo is set up with (read only now). */
  addFromOo(): Promise<{ ok: true; id: string } | { ok: false; reason: ConnectionReason }>;
  /** Re-checks stale connections in the background (for the Settings frame). */
  recheck(): Promise<void>;
  onChange(fn: () => void): () => void;
  /**
   * D112: new items from an OpenConnector Provider Trigger (design/connectors.md 4.5): a read with
   * the checkpoint the last read returned (null the first time). Only for OpenConnector sources.
   */
  readTrigger(key: string, service: string, trigger: string, config: unknown, checkpoint: unknown): Promise<TriggerRead>;
}

export type TriggerRead = { ok: true; items: { id: string; text: string }[]; checkpoint: unknown } | { ok: false; error: string };

/** One item's text for a watcher: subject, sender, snippet when they are there; never a full body. */
function itemText(x: unknown): string {
  if (!x || typeof x !== "object") return String(x ?? "");
  const o = x as Record<string, unknown>;
  const pick = ["subject", "from", "sender", "title", "snippet", "summary", "text"].map((k) => (typeof o[k] === "string" ? `${k}: ${o[k]}` : "")).filter(Boolean);
  return (pick.length ? pick.join(" · ") : JSON.stringify(o)).slice(0, 2000);
}

export function openConnections(opts: { dataDir: string; log: LogStore; linker?: Linker; oo?: OoSource; now?: () => number; fetcher?: (url: string, init: RequestInit) => Promise<Response> }): ConnectionsStore {
  const linker = opts.linker ?? httpLinker;
  const fetcher = opts.fetcher ?? ((u: string, i: RequestInit) => fetch(u, i));
  const oo = opts.oo ?? ooSource();
  const now = opts.now ?? Date.now;
  const listPath = join(opts.dataDir, CONNECTIONS_FILE);
  const tokPath = join(opts.dataDir, CONNECTION_TOKENS_FILE);
  let records: Record_[] = readJson<{ connections?: Record_[] }>(listPath, {}).connections ?? [];
  let tokens: Record<string, string> = readJson<Record<string, string>>(tokPath, {});
  const health = new Map<string, { state: ConnectionView["state"]; at: number }>();
  const toolCache = new Map<string, { tools: LinkTool[]; at: number }>();
  const opCache = new Map<string, "read" | "write">(); // `${id} ${action}`
  const grants = new Map<string, Set<string>>(); // taskId -> connection ids
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((f) => f());
  const save = () => {
    writePrivate(listPath, { connections: records });
    writePrivate(tokPath, tokens);
  };

  const find = (key: string) => records.find((r) => r.id === key) ?? records.find((r) => r.name.toLowerCase() === key.trim().toLowerCase());
  const allowedFor = (who: ConnectionCaller, r: Record_) => who.role === "partner" || Boolean(grants.get(who.taskId)?.has(r.id));

  async function withLink<T>(r: Record_, fn: (l: Link) => Promise<T>): Promise<T> {
    let link: Link | undefined;
    try {
      link = await linker(r.url, tokens[r.id]);
      const out = await fn(link);
      health.set(r.id, { state: "ok", at: now() });
      return out;
    } catch (err) {
      const e = linkErrorOf(err);
      health.set(r.id, { state: e.reason === "unauthorized" ? "unauthorized" : e.reason === "unreachable" ? "unreachable" : "unknown", at: now() });
      throw e;
    } finally {
      await link?.close();
    }
  }

  async function tools(r: Record_): Promise<LinkTool[]> {
    const c = toolCache.get(r.id);
    if (c && now() - c.at < RECHECK_MS) return c.tools;
    const t = await withLink(r, (l) => l.tools());
    toolCache.set(r.id, { tools: t, at: now() });
    return t;
  }

  const isOC = (r: Record_) => r.source !== "mcp";

  async function classify(key: string, action: string): Promise<"read" | "write"> {
    const r = find(key);
    if (!r) return "write";
    const ck = `${r.id} ${action}`;
    const hit = opCache.get(ck);
    if (hit) return hit;
    let op: "read" | "write" = "write";
    try {
      if (isOC(r)) {
        const g = await withLink(r, (l) => l.call("get_action_guide", { actionId: action }));
        const t = (g.data as { data?: { capability?: { operationType?: string } } })?.data?.capability?.operationType;
        op = !failed(g) && t === "read" ? "read" : "write";
      } else {
        const t = (await tools(r)).find((x) => x.name === action);
        op = t?.annotations?.readOnlyHint === true ? "read" : "write";
      }
    } catch {
      return "write"; // can't tell: treat as a write, and don't remember it
    }
    opCache.set(ck, op);
    return op;
  }

  const record = (body: Omit<Bodies["connection_call"], "callId"> & { callId?: string }) => {
    const b: Bodies["connection_call"] = { callId: body.callId ?? `cc_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`, ...body };
    opts.log.append({ stream: b.taskId ? `task:${b.taskId}` : "channel", origin: b.taskId ? "task" : "partner", kind: "connection_call", body: b });
    return b.callId;
  };

  async function execute(r: Record_, action: string, input: unknown, account?: string): Promise<LinkResult> {
    const args = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    if (isOC(r)) return withLink(r, (l) => l.call("execute_action", { actionId: action, input: args, ...(account ? { connectionName: account } : {}) }));
    return withLink(r, (l) => l.call(action, args));
  }

  const err = (error: string, op?: "read" | "write"): ConnectionOutcome => ({ ok: false, error, ...(op ? { op } : {}) });
  const NOT_FOUND = "No such connection. Call connections_list for the user's connections.";

  const api: ConnectionsStore = {
    list(who) {
      return records
        .filter((r) => who.role === "partner" || allowedFor(who, r))
        .map((r): ConnectionInfo => ({ id: r.id, name: r.name, source: r.source, ...(who.role === "task" ? { granted: true } : {}) }));
    },

    async search(who, query, o = {}) {
      const pool = o.connection ? [find(o.connection)].filter(Boolean) as Record_[] : records;
      const usable = pool.filter((r) => allowedFor(who, r));
      if (!usable.length) return err(o.connection ? NOT_FOUND : "No connections yet. The user can add their OpenConnector on the Partner page.");
      const out: unknown[] = [];
      for (const r of usable) {
        try {
          if (isOC(r)) {
            const res = await withLink(r, (l) => l.call("search_actions", { query, ...(o.service ? { service: o.service } : {}), limit: 8 }));
            const items = (res.data as { data?: unknown })?.data ?? res.data;
            out.push({ connection: r.name, kind: "openconnector", actions: failed(res) ? [] : items, ...(failed(res) ? { error: errorText(res) } : {}) });
          } else {
            const words = query.toLowerCase().split(/\s+/).filter(Boolean);
            const ts = (await tools(r)).filter((t) => !words.length || words.some((w) => `${t.name} ${t.description ?? ""}`.toLowerCase().includes(w)));
            out.push({ connection: r.name, kind: "mcp", tools: ts.slice(0, 12).map((t) => ({ id: t.name, description: clip(t.description ?? "", 300), op: t.annotations?.readOnlyHint === true ? "read" : "write" })) });
          }
        } catch (e) {
          out.push({ connection: r.name, error: `can't reach it right now (${(e as LinkError).reason})` });
        }
      }
      record({ connectionId: usable.length === 1 ? usable[0].id : "*", connection: usable.length === 1 ? usable[0].name : "all", action: "search", op: "read", state: "done", summary: clip(`search: ${query}`, SUMMARY_MAX), ...(who.role === "task" ? { taskId: who.taskId } : {}) });
      return { ok: true, op: "read", result: forModel(out) };
    },

    async guide(who, key, action) {
      const r = find(key);
      if (!r || !allowedFor(who, r)) return err(NOT_FOUND);
      try {
        if (isOC(r)) {
          const g = await withLink(r, (l) => l.call("get_action_guide", { actionId: action }));
          if (failed(g)) return err(errorText(g));
          const op = await classify(r.id, action);
          const md = (g.data as { data?: { markdown?: string } })?.data?.markdown;
          return { ok: true, op, result: { op, guide: md ? clip(md, RESULT_MAX) : forModel(g.data) } };
        }
        const t = (await tools(r)).find((x) => x.name === action);
        if (!t) return err(`No tool ${action} on ${r.name}.`);
        const op = t.annotations?.readOnlyHint === true ? "read" : "write";
        return { ok: true, op, result: { op, description: t.description, inputSchema: t.inputSchema } };
      } catch (e) {
        return err(`${r.name} can't be reached right now (${(e as LinkError).reason}).`);
      }
    },

    classify,

    async read(who, key, action, input, account) {
      const r = find(key);
      if (!r || !allowedFor(who, r)) return err(NOT_FOUND);
      const base = { connectionId: r.id, connection: r.name, action, ...(who.role === "task" ? { taskId: who.taskId } : {}) };
      if (!policyAllows(r.policy, action)) {
        record({ ...base, op: "read", state: "denied" });
        return err(`The user's rules for ${r.name} don't allow ${action}.`);
      }
      const op = await classify(r.id, action);
      if (op === "write") {
        record({ ...base, op, state: "denied", error: "a write outside the Go path" });
        return err(who.role === "task" ? "This changes something outside. Tasks only read connections; tell the partner what you'd do and why." : "This changes something outside: ask the user first (connection_call with question and goLabel).", "write");
      }
      try {
        const res = await execute(r, action, input, account);
        if (failed(res)) {
          record({ ...base, op, state: "failed", error: errorText(res) });
          return err(errorText(res), op);
        }
        record({ ...base, op, state: "done", summary: summarize(res.data) });
        return { ok: true, op, result: forModel((res.data as { data?: unknown })?.data ?? res.data) };
      } catch (e) {
        record({ ...base, op, state: "failed", error: (e as LinkError).reason });
        return err(`${r.name} can't be reached right now (${(e as LinkError).reason}).`, op);
      }
    },

    stage(key, action, input, decisionId, account) {
      const r = find(key);
      if (!r) return { ok: false, error: NOT_FOUND };
      if (!policyAllows(r.policy, action)) return { ok: false, error: `The user's rules for ${r.name} don't allow ${action}.` };
      const callId = record({ connectionId: r.id, connection: r.name, action, op: "write", state: "needs_go", decisionId, input: account ? { input, account } : { input } });
      return { ok: true, callId };
    },

    async runApproved(decisionId) {
      const evs = opts.log.read({ stream: "channel", kinds: ["connection_call", "decision_resolved"], limit: 5000 });
      const staged = evs.find((e) => e.kind === "connection_call" && (e.body as Bodies["connection_call"]).decisionId === decisionId && (e.body as Bodies["connection_call"]).state === "needs_go");
      if (!staged) return err("Nothing is waiting on that decision.");
      const s = staged.body as Bodies["connection_call"];
      const ran = evs.some((e) => e.kind === "connection_call" && (e.body as Bodies["connection_call"]).decisionId === decisionId && ["done", "failed", "held"].includes((e.body as Bodies["connection_call"]).state));
      if (ran) return err("That one already ran (or was held); it never runs twice.", "write");
      const answer = evs.find((e) => e.kind === "decision_resolved" && (e.body as Bodies["decision_resolved"]).decisionId === decisionId)?.body as Bodies["decision_resolved"] | undefined;
      if (!answer) return err("The user hasn't answered yet. End your turn; the answer wakes you.", "write");
      const base = { callId: s.callId, connectionId: s.connectionId, connection: s.connection, action: s.action, op: "write" as const, decisionId };
      if (answer.option !== "go") {
        record({ ...base, state: "held" });
        return err(answer.option === "hold" ? "The user said Hold: it did not run." : "The user replied instead of Go: it did not run. Read their reply.", "write");
      }
      const r = find(s.connectionId);
      if (!r) {
        record({ ...base, state: "failed", error: "connection removed" });
        return err("That connection was removed; nothing ran.", "write");
      }
      const staged_ = (s.input ?? {}) as { input?: unknown; account?: string };
      try {
        const res = await execute(r, s.action, staged_.input, staged_.account);
        if (failed(res)) {
          record({ ...base, state: "failed", error: errorText(res) });
          return err(errorText(res), "write");
        }
        record({ ...base, state: "done", summary: summarize(res.data) });
        return { ok: true, op: "write", result: forModel((res.data as { data?: unknown })?.data ?? res.data) };
      } catch (e) {
        // Not retried: a write whose answer was lost may have happened (research/34, G-safety).
        record({ ...base, state: "failed", error: (e as LinkError).reason });
        return err(`It may or may not have gone through: ${r.name} didn't answer (${(e as LinkError).reason}). Tell the user to check; don't run it again.`, "write");
      }
    },

    grant(taskId, key) {
      const r = find(key);
      if (!r) return { ok: false, error: NOT_FOUND };
      if (!grants.has(taskId)) grants.set(taskId, new Set());
      grants.get(taskId)!.add(r.id);
      record({ connectionId: r.id, connection: r.name, action: "grant", op: "read", state: "done", taskId, summary: "the task may read this connection" });
      return { ok: true };
    },

    view() {
      return records.map((r) => {
        const h = health.get(r.id);
        return { id: r.id, name: r.name, url: r.url, source: r.source, addedAt: r.addedAt, via: r.via, state: h?.state ?? "unknown", ...(h ? { checkedAt: new Date(h.at).toISOString() } : {}) };
      });
    },

    async add(input) {
      const url = normalizeUrl(input.url);
      if (!url) return { ok: false, reason: "bad_url" };
      if (records.some((r) => r.url === url)) return { ok: false, reason: "duplicate" };
      const token = input.token?.trim() || undefined;
      if (token && /[\s\u0000-\u001f]/.test(token)) return { ok: false, reason: "unauthorized" };
      let ts: LinkTool[];
      let link: Link | undefined;
      try {
        link = await linker(url, token);
        ts = await link.tools();
      } catch (e) {
        const reason = linkErrorOf(e).reason;
        return { ok: false, reason };
      } finally {
        await link?.close();
      }
      const oc = isOpenConnector(ts);
      const source: ConnectionSource = oc ? (isOomol(url) ? "oomol" : "self") : "mcp";
      const name = (input.name?.trim() || (source === "oomol" ? "OOMOL" : oc ? "OpenConnector" : new URL(url).hostname)).slice(0, 40);
      const id = `conn_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
      records = [...records, { id, name: records.some((r) => r.name === name) ? `${name} ${records.length + 1}` : name, url, source, addedAt: new Date(now()).toISOString(), via: input.via ?? "manual" }];
      if (token) tokens = { ...tokens, [id]: token };
      save();
      health.set(id, { state: "ok", at: now() });
      toolCache.set(id, { tools: ts, at: now() });
      changed();
      return { ok: true, id };
    },

    remove(id) {
      const before = records.length;
      records = records.filter((r) => r.id !== id);
      if (records.length === before) return false;
      const { [id]: _gone, ...rest } = tokens;
      tokens = rest;
      save();
      health.delete(id);
      toolCache.delete(id);
      for (const k of [...opCache.keys()]) if (k.startsWith(`${id} `)) opCache.delete(k);
      for (const g of grants.values()) g.delete(id);
      changed();
      return true;
    },

    oo: () => oo.detect(),

    async addFromOo() {
      const r = oo.read();
      if (!r) return { ok: false, reason: "no_oo" };
      return api.add({ url: r.url, token: r.token, via: "oo" });
    },

    async recheck() {
      const stale = records.filter((r) => now() - (health.get(r.id)?.at ?? 0) > RECHECK_MS);
      if (!stale.length) return;
      await Promise.all(stale.map((r) => tools(r).catch(() => undefined)));
      changed();
    },

    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    async readTrigger(key, service, trigger, config, checkpoint) {
      const r = find(key);
      if (!r) return { ok: false, error: NOT_FOUND };
      if (r.source === "mcp") return { ok: false, error: `${r.name} is not an OpenConnector: it has no triggers to watch` };
      const base = r.url.replace(/\/mcp\/?$/, "").replace(/\/+$/, "");
      const url = `${base}/v1/providers/${encodeURIComponent(service)}/triggers/${encodeURIComponent(trigger)}/execute`;
      try {
        const res = await fetcher(url, {
          method: "POST",
          headers: { "content-type": "application/json", ...(tokens[r.id] ? { authorization: `Bearer ${tokens[r.id]}` } : {}) },
          body: JSON.stringify({ operation: "read", config: config ?? {}, checkpoint: checkpoint ?? null }),
        });
        if (res.status === 401 || res.status === 403) return { ok: false, error: `${r.name} refused the watch (its token may not allow ${trigger})` };
        if (!res.ok) return { ok: false, error: `${r.name} answered ${res.status}` };
        const j = (await res.json()) as { items?: unknown[]; events?: unknown[]; data?: unknown[]; checkpoint?: unknown };
        const raw = j.items ?? j.events ?? j.data ?? [];
        const items = raw.map((x, i) => ({ id: String((x as { id?: unknown })?.id ?? i), text: itemText(x) }));
        return { ok: true, items, checkpoint: j.checkpoint ?? checkpoint ?? null };
      } catch (e) {
        return { ok: false, error: `${r.name} didn't answer (${(e as Error).message})` };
      }
    },
  };
  return api;
}
