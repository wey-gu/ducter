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
import type { Bodies, ConnectionReason, ConnectionSource, ConnectionView, OoApp, OoDetect } from "@ducter/protocol";
import { appsOf, findOo, ooCli, ooEnv, ooExec, ooLinker, ooOp, knownService, serviceTitle, type OoCli, type OoService } from "./oo-link.ts";
import type { ConnectionCaller, ConnectionInfo, ConnectionOutcome, ConnectionsApi, LogStore } from "@ducter/protocol/src/internal.ts";
import type { SignInView } from "@ducter/protocol";
import { DUCTER_VERSION } from "@ducter/protocol/src/version.ts";
import { qrRows } from "./devices.ts";
import { discover, importedToken, pollDevice, refresh as refreshToken, revoke as revokeToken, stale, startDevice, type DeviceStart, type OAuthServer, type OAuthToken } from "./mcp-oauth.ts";

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
  /** A link that can search its own catalog (the oo CLI) answers connection_search with it. */
  search?(query: string, service?: string): Promise<LinkTool[]>;
  /** One tool by name, for a link whose tools() is not the whole catalog (the oo CLI). */
  describe?(name: string): Promise<LinkTool | undefined>;
}
export type Linker = (url: string, token?: string) => Promise<Link>;

/** D193: every request the broker makes says who it is (Cloudflare refuses some default agents, error 1010). */
export const USER_AGENT = `Ducter/${DUCTER_VERSION}`;

export class LinkError extends Error {
  constructor(
    readonly reason: "unreachable" | "unauthorized" | "not_mcp" | "blocked",
    message: string,
  ) {
    super(message);
  }
}

function linkErrorOf(err: unknown): LinkError {
  if (err instanceof LinkError) return err;
  const m = String((err as Error)?.message ?? err);
  // The SDK's HTTP error carries the status in `code`, not in its message: OOMOL's gateway answers
  // 401 with the bare text "token not found" (research/44), which once read as not_mcp.
  const code = (err as { code?: unknown })?.code;
  // D193: Cloudflare's "browser signature banned" (error 1010) is a 403 that is not about the key.
  if (/\b1010\b|browser_signature_banned|error code: 1010/i.test(m)) return new LinkError("blocked", m);
  if (typeof code === "number" && code > 0) {
    if (code === 401 || code === 403) return new LinkError("unauthorized", m);
    if (code >= 500 || code === 408 || code === 429) return new LinkError("unreachable", m);
    return new LinkError("not_mcp", m);
  }
  if ((err as Error)?.name === "UnauthorizedError") return new LinkError("unauthorized", m);
  if (/\b401\b|\b403\b|unauthori[sz]ed|forbidden|token not found|invalid token/i.test(m)) return new LinkError("unauthorized", m);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|timed? ?out|Unable to connect|abort/i.test(m)) return new LinkError("unreachable", m);
  return new LinkError("not_mcp", m);
}

/** The real link: one MCP client over Streamable HTTP, Bearer token in a header only. */
export const httpLinker: Linker = async (url, token) => {
  const headers: Record<string, string> = { "User-Agent": USER_AGENT, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const client = new Client({ name: "ducter", version: DUCTER_VERSION });
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

/** OOMOL Hosted's MCP endpoint (research/44): Streamable HTTP, `Authorization: Bearer <API key>`. */
export const OOMOL_HOSTED_MCP = "https://connector.oomol.com/v1/mcp";

/**
 * The MCP endpoint for an address the user typed: OOMOL Hosted (connector.oomol.com, bare or
 * with /mcp, /v1 or /v1/mcp) is its /v1/mcp; any other OpenConnector base URL gets "/mcp".
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
  if (u.protocol === "https:" && u.hostname === "connector.oomol.com" && !u.port && ["", "/mcp", "/v1", "/v1/mcp"].includes(path)) return OOMOL_HOSTED_MCP;
  u.pathname = /\/mcp$/.test(path) ? path : `${path}/mcp`;
  return u.toString();
}

/** Whether an endpoint is OOMOL Hosted, which never answers without a key. */
export const isOomolHosted = (url: string) => normalizeUrl(url) === OOMOL_HOSTED_MCP;

/** The base an OpenConnector serves its HTTP API from (/v1/apps, /v1/providers): the endpoint without /mcp or /v1/mcp. */
export const apiBase = (mcpUrl: string) => mcpUrl.replace(/\/(v1\/)?mcp\/?$/, "").replace(/\/+$/, "");

/**
 * The accounts connected in an OpenConnector, from `GET /v1/apps?status=active` (one envelope on
 * OOMOL Hosted and self-hosted, research/44), grouped by service. The virtual no-auth and
 * Marketplace entries are not accounts and are left out. undefined: not that shape.
 */
export function appsFromV1(body: unknown): OoApp[] | undefined {
  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data)) return;
  const by = new Map<string, OoApp>();
  for (const x of data) {
    const o = (x ?? {}) as Record<string, unknown>;
    const service = typeof o.service === "string" ? o.service : "";
    const id = typeof o.id === "string" ? o.id : "";
    if (!service || /^(no_auth|marketplace):/.test(id) || o.authType === "no_auth") continue;
    if (typeof o.status === "string" && o.status !== "active") continue;
    // The app's name is the service's: on OOMOL Hosted displayName is the account's own name
    // (a Slack workspace, a mailbox's name), so it never titles the app it belongs to (D192).
    // Only a service Ducter has no name for takes it.
    const shown = typeof o.displayName === "string" ? o.displayName.trim() : "";
    const title = knownService(service) || !shown ? serviceTitle(service) : shown;
    const named = shown && shown.toLowerCase() !== title.toLowerCase() ? shown : "";
    const label = [o.accountLabel, o.alias, named, o.connectionName].find((v): v is string => typeof v === "string" && v.trim() !== "")?.trim() ?? "";
    const app = by.get(service) ?? { service, title, accounts: [] };
    if (label && !app.accounts.includes(label)) app.accounts.push(label);
    by.set(service, app);
  }
  return [...by.values()];
}

const isOomol = (url: string) => {
  try {
    const h = new URL(url).hostname;
    return h === "oomol.com" || h.endsWith(".oomol.com");
  } catch {
    return false;
  }
};

/**
 * How to speak to an OpenConnector-style catalog (OOMOL Hosted, self-hosted OpenConnector): its
 * search, guide and execute tools, what search calls its query, and how execute picks an account.
 * Found from the server's own tool list by what each tool takes, never assumed by name: OOMOL
 * renamed them once (search_actions → connector_search_actions, query → q, connectionName →
 * appId/alias; D180), and a rename must keep working. Names are only a tie-break.
 */
export interface OcDialect {
  search: string;
  query: string;
  guide: string;
  exec: string;
  /** The execute argument that picks an account, or undefined when it takes none. */
  account?: "appId" | "alias" | "connectionName";
}
const propsOf = (t: LinkTool) => Object.keys(((t.inputSchema ?? {}) as { properties?: Record<string, unknown> }).properties ?? {});
const named = (tools: LinkTool[], re: RegExp) => tools.find((t) => re.test(t.name));
export function ocDialect(tools: LinkTool[]): OcDialect | undefined {
  const exec = tools.find((t) => propsOf(t).includes("actionId") && propsOf(t).includes("input")) ?? named(tools, /(^|_)execute_action$/);
  const guide =
    tools.find((t) => t !== exec && propsOf(t).includes("actionId") && !propsOf(t).includes("input")) ?? named(tools, /(^|_)(get_action(_guide)?|action_guide)$/);
  const search =
    tools.find((t) => /search/.test(t.name) && propsOf(t).some((p) => p === "q" || p === "query")) ?? named(tools, /(^|_)search_actions$/);
  if (!exec || !guide || !search) return;
  const sp = propsOf(search);
  const ep = propsOf(exec);
  const account = ep.includes("appId") ? "appId" : ep.includes("alias") ? "alias" : ep.includes("connectionName") || !ep.length ? "connectionName" : undefined;
  return { search: search.name, query: sp.includes("q") && !sp.includes("query") ? "q" : "query", guide: guide.name, exec: exec.name, account };
}
const isOpenConnector = (tools: LinkTool[]) => ocDialect(tools) !== undefined;

/** An action's read/write from either guide shape: v1 `data.capability.operationType`, v2 `action.operationType`. */
export const ocOperation = (data: unknown): string | undefined => {
  const d = data as { data?: { capability?: { operationType?: string } }; action?: { operationType?: string } };
  return d?.action?.operationType ?? d?.data?.capability?.operationType;
};

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
  /** The oo CLI itself (D122), when oo is installed: Ducter runs it and reads none of its files. */
  cli?: OoCli;
  /** Asks oo whether it is signed in, and which accounts it has. */
  probe?(): Promise<void>;
}

export function ooSource(opts: { env?: Record<string, string | undefined>; dir?: string; which?: (bin: string) => string | null; cli?: OoCli } = {}): OoSource {
  const env = opts.env ?? process.env;
  const dir = opts.dir ?? ooConfigDir(env);
  const which = opts.which ?? ((b: string) => (b === "oo" ? findOo() : Bun.which(b)));
  const bin = which("oo");
  const cli = opts.cli ?? (bin ? ooCli({ exec: ooExec(bin, ooEnv(env, bin)) }) : undefined);
  // What oo said last (oo auth status, oo connector apps); undefined until the first probe.
  let probed: { signedIn: boolean; services?: OoService[] } | undefined;
  let probedAt = 0;
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
    cli,
    detect() {
      // Until oo has answered, a guess from the file's size alone (it is never read): a
      // signed-out oo leaves a stub of a few bytes.
      const auth = join(dir, "auth.toml");
      let account = false;
      try {
        account = existsSync(auth) && statSync(auth).size > 32;
      } catch {
        /* no account */
      }
      if (probed) account = probed.signedIn;
      const r = resolve();
      return {
        installed: Boolean(bin) || existsSync(dir),
        ...(r?.url ? { selfHosted: { url: r.url, hasToken: Boolean(r.token) } } : {}),
        account,
        ...(account && probed?.services ? { apps: appsOf(probed.services) } : {}),
      };
    },
    async probe() {
      if (!cli || (probed && Date.now() - probedAt < RECHECK_MS)) return;
      probedAt = Date.now();
      try {
        const signedIn = await cli.signedIn();
        probed = { signedIn, ...(signedIn ? { services: await cli.services().catch(() => probed?.services) } : {}) };
      } catch (e) {
        // Signed out or missing says so; a slow answer keeps what oo said before.
        if (!(e instanceof LinkError) || e.reason === "unauthorized" || /not installed/.test(e.message) || !probed) probed = { signedIn: false };
      }
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
  /**
   * D166: 不让 Ducter 看这个 / Don't let Ducter read this one, from the card: "gmail" (the whole
   * service) or "gmail:<account>". Nothing reads an excluded account, the partner included.
   */
  excluded?: string[];
  /** D165: 自己留意 / Watch on its own, by "service" or "service:<account>" (absent: the default). */
  watch?: Record<string, boolean>;
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
/** The action list inside a catalog search answer: v1 `{ data: [...] }`, v2 `{ actions: [...] }`, or a bare list. */
const listOf = (d: unknown): Record<string, unknown>[] => {
  const o = d as { data?: unknown; actions?: unknown };
  const x = Array.isArray(d) ? d : Array.isArray(o?.data) ? o.data : Array.isArray(o?.actions) ? o.actions : [];
  return x.filter((v): v is Record<string, unknown> => !!v && typeof v === "object");
};
/**
 * The actions that can run here: never one the catalog marks `authenticated: false` (no account
 * for its service), and, when the connected services are known, one of theirs or one marked
 * authenticated (no-auth services). An action that runs on nothing only misleads the partner.
 */
export const usableActions = (items: Record<string, unknown>[], connected: string[]) =>
  items.filter((x) => {
    if (x.authenticated === false || x.available === false) return false;
    const id = String(x.actionId ?? x.id ?? "");
    const svc = String(x.service ?? id.split(".")[0]);
    return !connected.length || connected.includes(svc) || x.authenticated === true;
  });

/** An action's own result inside either envelope: `{ ok, data }` or `{ executionId, output }`. */
const payloadOf = (d: unknown) => {
  const o = d as { data?: unknown; output?: unknown } | undefined;
  return o?.data ?? o?.output ?? d;
};
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
  /** apps: the accounts connected there, when it is an OpenConnector that said ([] = none yet). */
  add(input: { url: string; token?: string; name?: string; via?: "manual" | "oo" }): Promise<{ ok: true; id: string; apps?: OoApp[] } | { ok: false; reason: ConnectionReason }>;
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
  /** Whether an event wait can watch this connection, and why not (checked before a wait is set). */
  watchable(key: string): { ok: true } | { ok: false; error: string };
  /**
   * D165/D166: the apps a source can read, one per account (a tile each), with the person's
   * 自己留意 and 不让 Ducter 看这个 for it. Empty until the source has listed its accounts.
   */
  apps(id: string): AppTarget[];
  /** Sets 自己留意 (watch) or 不让 Ducter 看这个 (excluded) for one app; false: no such connection. */
  setApp(id: string, service: string, account: string | undefined, patch: { watch?: boolean; excluded?: boolean }): boolean;
  /** The connection removed (its facts go with it). */
  onRemove(fn: (id: string) => void): () => void;
  /** D193: a connection's own tool list (cached), for Ducter's own flows (phone.ts). */
  toolsOf(id: string): Promise<LinkTool[]>;
  /**
   * D193: one tool call made by Ducter itself, never by a model: the flow that calls it (phone.ts)
   * holds the owner's Go and the rails. Logged as a connection_call like any other.
   */
  invoke(id: string, tool: string, args: Record<string, unknown>): Promise<LinkResult>;
  /** D193: tools only Ducter's own flow may run (a reason when refused; undefined = allowed). */
  reserve(fn: (id: string, action: string) => string | undefined): void;
  /** D193: the device sign-in in progress (RFC 8628), if any. */
  signInView(): SignInView | undefined;
  onSignIn(fn: (v: SignInView) => void): () => void;
  cancelSignIn(): void;
  /** D193: sign in again to a connection that was signed out (its refresh token is gone). */
  reauth(id: string): Promise<{ ok: true } | { ok: false; reason: ConnectionReason }>;
}

/** One app in a source: a service and one of its accounts (oo's connection name, or a label). */
export interface AppTarget {
  connectionId: string;
  source: ConnectionSource;
  service: string;
  title: string;
  /** The account to pass to a read (absent: the source's default for the service). */
  account?: string;
  label?: string;
  watch: boolean;
  excluded: boolean;
}

/** Chat apps watch only @-mentions and DMs; the rest watch everything new (D165 call 1). */
export const CHAT_SERVICES = new Set(["discord", "discordbot", "slack", "slackbot", "telegram", "feishu", "lark", "dingtalk", "wecom_bot"]);

/**
 * oo (D122) runs actions through its CLI and has no Provider Triggers (oo 1.9: `oo connector`
 * is search / schema / run / proxy / apps), so an account reached through oo can't be watched.
 */
export const OO_NOT_WATCHABLE =
  "This account is reached through oo, which can't be watched for new items yet. Use a check instead: wait_for with a check that looks every few minutes (everyMinutes), or a routine on a schedule that reads it.";

export type TriggerRead = { ok: true; items: { id: string; text: string }[]; checkpoint: unknown } | { ok: false; error: string };

/** One item's text for a watcher: subject, sender, snippet when they are there; never a full body. */
function itemText(x: unknown): string {
  if (!x || typeof x !== "object") return String(x ?? "");
  const o = x as Record<string, unknown>;
  const pick = ["subject", "from", "sender", "title", "snippet", "summary", "text"].map((k) => (typeof o[k] === "string" ? `${k}: ${o[k]}` : "")).filter(Boolean);
  return (pick.length ? pick.join(" · ") : JSON.stringify(o)).slice(0, 2000);
}

export function openConnections(opts: {
  dataDir: string;
  log: LogStore;
  linker?: Linker;
  oo?: OoSource;
  now?: () => number;
  fetcher?: (url: string, init: RequestInit) => Promise<Response>;
  /** D193: how OAuth sign-in reaches the authorization server (tests: a fake). */
  oauthFetch?: (url: string, init?: RequestInit) => Promise<Response>;
  /** D193: milliseconds per second of the server's poll interval (tests: 1). */
  signInMsPerSec?: number;
  /** D193: the name the provider's sign-in page shows ("Ducter"). */
  clientName?: string;
  /** D193: a name for a connection whose tools are known (a calling connection: "Tuwa"). */
  knownName?: (tools: LinkTool[]) => string | undefined;
}): ConnectionsStore {
  const knownName = opts.knownName;
  const linker = opts.linker ?? httpLinker;
  const fetcher = opts.fetcher ?? ((u: string, i: RequestInit) => fetch(u, i));
  const oo = opts.oo ?? ooSource();
  const now = opts.now ?? Date.now;
  // D122: the oo CLI kind. One linker (and its catalog cache) for the store's life.
  const ooLink = oo.cli ? ooLinker(oo.cli, now) : undefined;
  const listPath = join(opts.dataDir, CONNECTIONS_FILE);
  const tokPath = join(opts.dataDir, CONNECTION_TOKENS_FILE);
  // A hosted connection saved before D158 points at connector.oomol.com/mcp, which OOMOL doesn't serve.
  let records: Record_[] = (readJson<{ connections?: Record_[] }>(listPath, {}).connections ?? []).map((r) =>
    r.source !== "oo" && r.url !== OOMOL_HOSTED_MCP && isOomolHosted(r.url) ? { ...r, url: OOMOL_HOSTED_MCP } : r,
  );
  // What each OpenConnector has connected (GET /v1/apps), as it last answered; absent: not known.
  const appsCache = new Map<string, OoApp[]>();
  async function appsAt(url: string, token: string | undefined): Promise<OoApp[] | undefined> {
    try {
      const res = await fetcher(`${apiBase(url)}/v1/apps?status=active`, {
        headers: { accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return;
      return appsFromV1(await res.json());
    } catch {
      return;
    }
  }
  // A pasted key (a string), or D193's OAuth tokens from a device sign-in (refreshed here).
  let tokens: Record<string, string | OAuthToken> = readJson<Record<string, string | OAuthToken>>(tokPath, {});
  const oauthFetch = opts.oauthFetch ?? ((u: string, i?: RequestInit) => fetch(u, i));
  /** The key for a header, for the paths that only ever hold a pasted key (OpenConnector). */
  const keyOf = (id: string): string | undefined => {
    const t = tokens[id];
    return typeof t === "string" ? t : t?.access;
  };
  const refreshing = new Map<string, Promise<string | undefined>>();
  /** The bearer for a link: an OAuth token is refreshed a minute before it runs out (or when forced). */
  async function bearer(id: string, force = false): Promise<string | undefined> {
    const t = tokens[id];
    if (!t || typeof t === "string") return t;
    if (!force && !stale(t, now())) return t.access;
    if (!refreshing.has(id))
      refreshing.set(
        id,
        (async () => {
          const r = await refreshToken(t, oauthFetch, now());
          if (r.ok) {
            tokens = { ...tokens, [id]: r.token };
            save();
            return r.token.access;
          }
          if (r.gone) (health.set(id, { state: "unauthorized", at: now() }), changed()); // D199: the home's 打电话 says sign in again
          return r.gone ? undefined : t.access;
        })().finally(() => refreshing.delete(id)),
      );
    return refreshing.get(id);
  }
  const health = new Map<string, { state: ConnectionView["state"]; at: number }>();
  const toolCache = new Map<string, { tools: LinkTool[]; at: number }>();
  const opCache = new Map<string, "read" | "write">(); // `${id} ${action}`
  const grants = new Map<string, Set<string>>(); // taskId -> connection ids
  const listeners = new Set<() => void>();
  const removed = new Set<(id: string) => void>();
  const changed = () => listeners.forEach((f) => f());
  const save = () => {
    writePrivate(listPath, { connections: records });
    writePrivate(tokPath, tokens);
  };

  const find = (key: string) => records.find((r) => r.id === key) ?? records.find((r) => r.name.toLowerCase() === key.trim().toLowerCase());
  const allowedFor = (who: ConnectionCaller, r: Record_) => who.role === "partner" || who.role === "watch" || Boolean(grants.get(who.taskId)?.has(r.id));
  // D166: the accounts behind a service, as its source last listed them (oo's connections; an
  // OpenConnector's /v1/apps labels).
  const accountsOf = (r: Record_, service: string): { name: string; label: string; default: boolean }[] => {
    if (r.source === "oo") return ooLink?.cached()?.find((s) => s.service === service)?.connections ?? [];
    return (appsCache.get(r.id)?.find((a) => a.service === service)?.accounts ?? []).map((l, i) => ({ name: l, label: l, default: i === 0 }));
  };
  const isExcluded = (r: Record_, service: string, account?: string): boolean => {
    const ex = r.excluded ?? [];
    if (!ex.length) return false;
    if (ex.includes(service)) return true;
    const accts = accountsOf(r, service);
    const want = account?.trim().toLowerCase();
    const hit = want ? accts.find((c) => c.name.toLowerCase() === want || c.label.toLowerCase() === want) : accts.find((c) => c.default);
    const keys = hit ? [hit.name, hit.label] : want ? [want] : [];
    return keys.some((k) => ex.some((e) => e.toLowerCase() === `${service}:${k}`.toLowerCase()));
  };

  async function withLink<T>(r: Record_, fn: (l: Link) => Promise<T>): Promise<T> {
    let link: Link | undefined;
    try {
      if (r.source === "oo") {
        if (!ooLink) throw new LinkError("unreachable", "oo is not installed on this computer");
        link = await ooLink(r.url);
      } else {
        // D193: an OAuth token refused mid-life (at connect or on the call): refresh once, try again.
        const once = async () => {
          link = await linker(r.url, await bearer(r.id));
          return fn(link);
        };
        const oauth = typeof tokens[r.id] === "object";
        let got: T;
        try {
          got = await once();
        } catch (err) {
          if (!oauth || linkErrorOf(err).reason !== "unauthorized") throw err;
          await link?.close();
          link = undefined;
          await bearer(r.id, true);
          got = await once();
        }
        health.set(r.id, { state: "ok", at: now() });
        return got;
      }
      const out = await fn(link);
      health.set(r.id, { state: "ok", at: now() });
      return out;
    } catch (err) {
      const e = linkErrorOf(err);
      health.set(r.id, { state: e.reason === "unauthorized" ? "unauthorized" : e.reason === "unreachable" || e.reason === "blocked" ? "unreachable" : "unknown", at: now() });
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

  const isOC = (r: Record_) => r.source === "oomol" || r.source === "self";
  /**
   * Whether to use the connection as a catalog (search, guide, execute). One whose tools no longer
   * read as a catalog is used as a plain MCP server instead: its own tools, a write unless marked
   * read-only, so a change on their side costs a Go, never a silent write or a dead connection.
   */
  async function speaksCatalog(r: Record_): Promise<boolean> {
    if (!isOC(r)) return false;
    try {
      return ocDialect(await tools(r)) !== undefined;
    } catch {
      return true; // can't list now: the catalog path reports the link error as before
    }
  }
  /** The connection's catalog tools, read from what it lists now (toolCache rechecks it). */
  const dialect = async (r: Record_): Promise<OcDialect> => {
    const d = ocDialect(await tools(r));
    if (!d) throw new LinkError("not_mcp", `${r.name} no longer lists a search, guide and execute tool`);
    return d;
  };
  /** The OpenConnector app id behind an account label (its email, alias or name), for v2's appId. */
  async function appIdOf(r: Record_, account: string): Promise<string | undefined> {
    try {
      const res = await fetcher(`${apiBase(r.url)}/v1/apps?status=active`, {
        headers: { accept: "application/json", ...(keyOf(r.id) ? { authorization: `Bearer ${keyOf(r.id)}` } : {}) },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return;
      const rows = ((await res.json()) as { data?: Record<string, unknown>[] })?.data ?? [];
      const want = account.trim().toLowerCase();
      const hit = rows.find((o) => [o.accountLabel, o.alias, o.displayName, o.connectionName].some((v) => typeof v === "string" && v.trim().toLowerCase() === want));
      return typeof hit?.id === "string" ? hit.id : undefined;
    } catch {
      return;
    }
  }
  const opOf = (t?: LinkTool) => (t?.annotations?.readOnlyHint === true ? "read" : "write");

  async function classify(key: string, action: string): Promise<"read" | "write"> {
    const r = find(key);
    if (!r) return "write";
    // oo says nothing about read or write: the action's name decides, conservatively (D122).
    if (r.source === "oo") return ooOp(action);
    const ck = `${r.id} ${action}`;
    const hit = opCache.get(ck);
    if (hit) return hit;
    let op: "read" | "write" = "write";
    try {
      if (await speaksCatalog(r)) {
        const d = await dialect(r);
        const g = await withLink(r, (l) => l.call(d.guide, { actionId: action }));
        op = !failed(g) && ocOperation(g.data) === "read" ? "read" : "write";
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

  const record = (body: Omit<Bodies["connection_call"], "callId"> & { callId?: string }, watch = false) => {
    const b: Bodies["connection_call"] = { callId: body.callId ?? `cc_${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`, ...body };
    // D165: Ducter's own looks go to the "watch" stream: 看了哪些 reads them, nothing else sees them.
    opts.log.append({ stream: watch ? "watch" : b.taskId ? `task:${b.taskId}` : "channel", origin: watch ? "system" : b.taskId ? "task" : "partner", kind: "connection_call", body: b });
    return b.callId;
  };

  async function execute(r: Record_, action: string, input: unknown, account?: string): Promise<LinkResult> {
    const args = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    if (await speaksCatalog(r)) {
      const d = await dialect(r);
      let pick: Record<string, string> = {};
      if (account && d.account === "appId") {
        // An app id when the label (email, alias or name) is one it knows; else the label as alias.
        const id = await appIdOf(r, account);
        pick = id ? { appId: id } : { alias: account };
      } else if (account && d.account) pick = { [d.account]: account };
      return withLink(r, (l) => l.call(d.exec, { actionId: action, input: args, ...pick }));
    }
    // oo: the account (one of the service's connection names) rides as `connection`.
    if (r.source === "oo") return withLink(r, (l) => l.call(action, account ? { ...args, connection: account } : args));
    return withLink(r, (l) => l.call(action, args));
  }

  /** Saves a connection that answered its tool list (a pasted key, none, or a finished sign-in). */
  async function saveNew(url: string, ts: LinkTool[], token: string | OAuthToken | undefined, input: { name?: string; via?: "manual" | "oo" }): Promise<{ ok: true; id: string; apps?: OoApp[] }> {
    const oc = isOpenConnector(ts);
    // OOMOL Hosted is OOMOL's by its address, whatever its tool list looks like (research/44).
    const source: ConnectionSource = url === OOMOL_HOSTED_MCP || (oc && isOomol(url)) ? "oomol" : oc ? "self" : "mcp";
    const known = knownName?.(ts);
    const name = (input.name?.trim() || (source === "oomol" ? "OOMOL" : oc ? "OpenConnector" : known ?? new URL(url).hostname)).slice(0, 40);
    // What it can read now: the accounts connected there (OpenConnector's /v1/apps).
    const apps = source === "mcp" ? undefined : await appsAt(url, typeof token === "string" ? token : undefined);
    const id = `conn_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
    records = [...records, { id, name: records.some((r) => r.name === name) ? `${name} ${records.length + 1}` : name, url, source, addedAt: new Date(now()).toISOString(), via: input.via ?? "manual" }];
    if (token) tokens = { ...tokens, [id]: token };
    save();
    health.set(id, { state: "ok", at: now() });
    toolCache.set(id, { tools: ts, at: now() });
    if (apps) appsCache.set(id, apps);
    changed();
    return { ok: true, id, ...(apps ? { apps } : {}) };
  }

  // ---------- D193: the device sign-in (RFC 8628), one at a time ----------
  let signIn: { view: SignInView; server: OAuthServer; start: DeviceStart; timer?: ReturnType<typeof setTimeout>; input: { name?: string; via?: "manual" | "oo"; reconnect?: string } } | undefined;
  const signInListeners = new Set<(v: SignInView) => void>();
  const emitSignIn = (v: SignInView) => {
    for (const f of signInListeners) f(v);
  };
  const msPerSec = opts.signInMsPerSec ?? 1000;
  const shortName = (s: OAuthServer, url: string) => (s.name ? s.name.split(/\s+/)[0]! : new URL(url).hostname.replace(/^(api|mcp)\./, "").split(".")[0]!).replace(/^./, (c) => c.toUpperCase());
  async function beginSignIn(url: string, server: OAuthServer, input: { name?: string; via?: "manual" | "oo"; reconnect?: string }): Promise<boolean> {
    if (signIn?.timer) clearTimeout(signIn.timer);
    signIn = undefined;
    const start = await startDevice(server, opts.clientName ?? "Ducter", oauthFetch, now());
    if ("error" in start) return false;
    const view: SignInView = {
      url,
      name: input.name?.trim() || shortName(server, url),
      state: "waiting",
      userCode: start.userCode,
      verifyUrl: start.verifyUrl,
      ...(start.verifyUrlComplete ? { verifyUrlComplete: start.verifyUrlComplete } : {}),
      expiresAt: new Date(start.expiresAt).toISOString(),
      ...(input.reconnect ? { reconnect: true, id: input.reconnect } : {}),
      qr: qrRows(start.verifyUrlComplete ?? start.verifyUrl),
    };
    signIn = { view, server, start, input };
    emitSignIn(view);
    const cur = signIn;
    const tick = async (interval: number) => {
      if (signIn !== cur) return;
      const r = await pollDevice(server, cur.start, oauthFetch, now());
      if (signIn !== cur) return;
      if (r.state === "pending") {
        cur.start = { ...cur.start, interval: r.interval };
        cur.timer = setTimeout(() => void tick(r.interval), r.interval * msPerSec);
        return;
      }
      signIn = undefined;
      if (r.state !== "done") return emitSignIn({ ...cur.view, state: r.state });
      if (input.reconnect) {
        if (!records.some((x) => x.id === input.reconnect)) return emitSignIn({ ...cur.view, state: "failed" });
        tokens = { ...tokens, [input.reconnect]: r.token };
        save();
        health.set(input.reconnect, { state: "ok", at: now() });
        toolCache.delete(input.reconnect);
        changed();
        return emitSignIn({ ...cur.view, state: "done", id: input.reconnect });
      }
      // Signed in: the server must now answer its tool list with the token, like any add.
      let link: Link | undefined;
      try {
        link = await linker(url, r.token.access);
        const ts = await link.tools();
        await link.close();
        link = undefined;
        if (records.some((x) => x.url === url)) return emitSignIn({ ...cur.view, state: "failed" });
        const saved = await saveNew(url, ts, r.token, { name: input.name, via: input.via });
        emitSignIn({ ...cur.view, state: "done", id: saved.id });
      } catch {
        await link?.close();
        emitSignIn({ ...cur.view, state: "failed" });
      }
    };
    cur.timer = setTimeout(() => void tick(start.interval), start.interval * msPerSec);
    return true;
  }

  const err = (error: string, op?: "read" | "write"): ConnectionOutcome => ({ ok: false, error, ...(op ? { op } : {}) });
  let reserved: (id: string, action: string) => string | undefined = () => undefined;
  const NOT_FOUND = "No such connection. Call connections_list for the user's connections.";

  const api: ConnectionsStore = {
    list(who) {
      return records
        .filter((r) => who.role === "partner" || allowedFor(who, r))
        .map((r): ConnectionInfo => {
          const svcs = r.source === "oo" ? ooLink?.cached() : undefined;
          return {
            id: r.id,
            name: r.name,
            source: r.source,
            ...(svcs ? { services: svcs.map((s) => ({ service: s.service, accounts: s.connections.map((c) => ({ name: c.name, label: c.label, default: c.default })) })) } : {}),
            ...(who.role === "task" ? { granted: true } : {}),
          };
        });
    },

    async search(who, query, o = {}) {
      const pool = o.connection ? [find(o.connection)].filter(Boolean) as Record_[] : records;
      const usable = pool.filter((r) => allowedFor(who, r));
      if (!usable.length) {
        if (o.connection) return err(NOT_FOUND);
        // A task sees only what the partner shared: say so, not "none yet" (the user may have some).
        if (who.role === "task" && records.length) return err("No account was shared with this task. Don't look elsewhere (no CLI, no skill): report what you need and the partner can share one (connection_share).");
        return err("No connections yet. The user can add their accounts on the Partner page (Accounts it can read; one tap with oo).");
      }
      const out: unknown[] = [];
      for (const r of usable) {
        try {
          if (await speaksCatalog(r)) {
            const d = await dialect(r);
            // A catalog searches every service it knows; only the ones with an account here can run.
            // Ask wide (20 is OOMOL's ceiling), keep what can run, and when that leaves nothing, ask each
            // connected service.
            const look = (service?: string, limit = 20) => withLink(r, (l) => l.call(d.search, { [d.query]: query, ...(service ? { service } : {}), limit }));
            const res = await look(o.service);
            if (failed(res)) {
              out.push({ connection: r.name, kind: "openconnector", actions: [], error: errorText(res) });
              continue;
            }
            if (!appsCache.has(r.id)) {
              const apps = await appsAt(r.url, keyOf(r.id));
              if (apps) appsCache.set(r.id, apps);
            }
            const connected = (appsCache.get(r.id) ?? []).map((a) => a.service);
            let items = usableActions(listOf(res.data), connected);
            // Nothing from an account the user has (only no-auth services, or nothing): ask each
            // connected service too, and put its actions first.
            const svcOf = (x: Record<string, unknown>) => String(x.service ?? String(x.actionId ?? x.id ?? "").split(".")[0]);
            if (!o.service && connected.length && !items.some((x) => connected.includes(svcOf(x)))) {
              const per = await Promise.all(connected.map((svc) => look(svc, 6).then((x) => (failed(x) ? [] : usableActions(listOf(x.data), connected))).catch(() => [])));
              items = [...per.flat(), ...items];
            }
            items = items.slice(0, 12);
            out.push({
              connection: r.name,
              kind: "openconnector",
              actions: items,
              ...(items.length ? {} : { note: connected.length ? `No action for that in the accounts connected here (${connected.join(", ")}).` : "No account is connected here yet." }),
            });
          } else if (r.source === "oo") {
            // oo's own search (it understands "unread mail from this week"), only the services
            // with an account in oo; then the known catalog by name, so it never comes back empty.
            const hits = await withLink(r, async (l) => {
              const found = l.search ? await l.search(query, o.service) : [];
              if (found.length) return found;
              const words = query.toLowerCase().split(/\s+/).filter(Boolean);
              const all = (await l.tools()).filter((t) => !o.service || t.name.startsWith(`${o.service}.`));
              const named = all.filter((t) => words.some((w) => `${t.name} ${t.description ?? ""}`.toLowerCase().includes(w)));
              return named.length ? named : all;
            });
            out.push({ connection: r.name, kind: "oo", actions: hits.slice(0, 12).map((t) => ({ id: t.name, description: clip(t.description ?? "", 300), op: opOf(t) })) });
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
        if (await speaksCatalog(r)) {
          const g = await withLink(r, async (l) => l.call((await dialect(r)).guide, { actionId: action }));
          if (failed(g)) return err(errorText(g));
          const op = await classify(r.id, action);
          const md = (g.data as { data?: { markdown?: string } })?.data?.markdown;
          return { ok: true, op, result: { op, guide: md ? clip(md, RESULT_MAX) : forModel(g.data) } };
        }
        if (r.source === "oo") {
          const t = await withLink(r, async (l) => (await l.describe?.(action)) ?? (await l.tools()).find((x) => x.name === action));
          if (!t) return err(`No action ${action} in the accounts oo has. connection_search finds them.`);
          const op = ooOp(action);
          return { ok: true, op, result: { op, description: t.description, inputSchema: t.inputSchema } };
        }
        const t = (await tools(r)).find((x) => x.name === action);
        if (!t) return err(`No tool ${action} on ${r.name}.`);
        const op = opOf(t);
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
      const w = who.role === "watch";
      if (!policyAllows(r.policy, action)) {
        record({ ...base, op: "read", state: "denied" }, w);
        return err(`The user's rules for ${r.name} don't allow ${action}.`);
      }
      const why = reserved(r.id, action);
      if (why) {
        record({ ...base, op: "read", state: "denied", error: "reserved" }, w);
        return err(why);
      }
      const service = /^([a-z0-9_-]+)\./i.exec(action)?.[1];
      if (service && isExcluded(r, service, account)) {
        record({ ...base, op: "read", state: "denied", error: "excluded" }, w);
        return err(`The user asked Ducter not to read this ${service} account (不让 Ducter 看这个). Don't read it another way.`);
      }
      const op = await classify(r.id, action);
      if (op === "write") {
        record({ ...base, op, state: "denied", error: "a write outside the Go path" }, w);
        return err(who.role !== "partner" ? "This changes something outside. Tasks only read connections; tell the partner what you'd do and why." : "This changes something outside: ask the user first (connection_call with question and goLabel).", "write");
      }
      try {
        const res = await execute(r, action, input, account);
        if (failed(res)) {
          record({ ...base, op, state: "failed", error: errorText(res) }, w);
          return err(errorText(res), op);
        }
        record({ ...base, op, state: "done", summary: summarize(res.data) }, w);
        // The watchers parse the whole answer themselves (never kept); a model gets it clipped.
        const data = payloadOf(res.data);
        return { ok: true, op, result: w ? data : forModel(data) };
      } catch (e) {
        record({ ...base, op, state: "failed", error: (e as LinkError).reason }, w);
        return err(`${r.name} can't be reached right now (${(e as LinkError).reason}).`, op);
      }
    },

    stage(key, action, input, decisionId, account) {
      const r = find(key);
      if (!r) return { ok: false, error: NOT_FOUND };
      if (!policyAllows(r.policy, action)) return { ok: false, error: `The user's rules for ${r.name} don't allow ${action}.` };
      const why = reserved(r.id, action);
      if (why) return { ok: false, error: why };
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
        return { ok: true, op: "write", result: forModel(payloadOf(res.data)) };
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
        const svcs = r.source === "oo" ? ooLink?.cached() : undefined;
        const apps = svcs ? appsOf(svcs) : appsCache.get(r.id);
        return {
          id: r.id,
          name: r.name,
          url: r.url,
          source: r.source,
          addedAt: r.addedAt,
          via: r.via,
          state: h?.state ?? "unknown",
          ...(h ? { checkedAt: new Date(h.at).toISOString() } : {}),
          ...(apps ? { apps } : {}),
          ...(typeof tokens[r.id] === "object" ? { signIn: true } : {}),
        };
      });
    },

    async add(input) {
      const url = normalizeUrl(input.url);
      if (!url) return { ok: false, reason: "bad_url" };
      if (records.some((r) => r.url === url)) return { ok: false, reason: "duplicate" };
      // D193: an OAuth token the owner already holds (JSON: a bridge's credentials or a token
      // answer), imported instead of a new device sign-in. Refreshed first when it has run out.
      if (input.token?.trim().startsWith("{")) {
        const s = await discover(url, oauthFetch).catch(() => undefined);
        let tok = s ? importedToken(input.token, s, now()) : undefined;
        if (!tok) return { ok: false, reason: "unauthorized" };
        if (!tok.access || stale(tok, now())) {
          const r = await refreshToken(tok, oauthFetch, now());
          if (!r.ok) return { ok: false, reason: "unauthorized" };
          tok = r.token;
        }
        let l: Link | undefined;
        try {
          l = await linker(url, tok.access);
          const ts = await l.tools();
          return await saveNew(url, ts, tok, input);
        } catch (e) {
          return { ok: false, reason: linkErrorOf(e).reason };
        } finally {
          await l?.close();
        }
      }
      // A pasted key often brings a space or a line break along; a key never holds one.
      const token = input.token?.replace(/\s+/g, "") || undefined;
      if (token && /[\u0000-\u001f\u007f]/.test(token)) return { ok: false, reason: "unauthorized" };
      // OOMOL Hosted never answers without a key: say so before sending anything.
      if (!token && url === OOMOL_HOSTED_MCP) return { ok: false, reason: "no_key" };
      let ts: LinkTool[];
      let link: Link | undefined;
      try {
        link = await linker(url, token);
        ts = await link.tools();
      } catch (e) {
        const reason = linkErrorOf(e).reason;
        // D193: no key, and the server signs in on its own page (OAuth device code): start that.
        if (reason === "unauthorized" && !token) {
          const s = await discover(url, oauthFetch).catch(() => undefined);
          if (s) return (await beginSignIn(url, s, { name: input.name, via: input.via })) ? { ok: false, reason: "signing_in" } : { ok: false, reason: "sign_in_failed" };
        }
        return { ok: false, reason };
      } finally {
        await link?.close();
      }
      return saveNew(url, ts, token, input);
    },

    remove(id) {
      const before = records.length;
      const tok = tokens[id];
      records = records.filter((r) => r.id !== id);
      if (records.length === before) return false;
      if (tok && typeof tok === "object") void revokeToken(tok, oauthFetch);
      const { [id]: _gone, ...rest } = tokens;
      tokens = rest;
      save();
      health.delete(id);
      toolCache.delete(id);
      appsCache.delete(id);
      for (const k of [...opCache.keys()]) if (k.startsWith(`${id} `)) opCache.delete(k);
      for (const g of grants.values()) g.delete(id);
      for (const f of removed) f(id);
      changed();
      return true;
    },

    async toolsOf(id) {
      const r = find(id);
      if (!r) throw new LinkError("not_mcp", "no such connection");
      return tools(r);
    },

    async invoke(id, tool, args) {
      const r = find(id);
      if (!r) return { isError: true, data: "no such connection" };
      const base = { connectionId: r.id, connection: r.name, action: tool, op: "write" as const };
      try {
        const res = await withLink(r, (l) => l.call(tool, args));
        record(failed(res) ? { ...base, state: "failed", error: errorText(res) } : { ...base, state: "done", summary: summarize(res.data) });
        return res;
      } catch (e) {
        record({ ...base, state: "failed", error: linkErrorOf(e).reason });
        throw e;
      }
    },

    reserve(fn) {
      reserved = fn;
    },

    signInView: () => signIn?.view,
    onSignIn(fn) {
      signInListeners.add(fn);
      return () => signInListeners.delete(fn);
    },
    cancelSignIn() {
      if (!signIn) return;
      const s = signIn;
      signIn = undefined;
      if (s.timer) clearTimeout(s.timer);
      emitSignIn({ ...s.view, state: "failed" });
    },
    async reauth(id) {
      const r = find(id);
      if (!r) return { ok: false, reason: "unknown_connection" };
      const s = await discover(r.url, oauthFetch).catch(() => undefined);
      if (!s) return { ok: false, reason: "sign_in_failed" };
      return (await beginSignIn(r.url, s, { reconnect: r.id })) ? { ok: true } : { ok: false, reason: "sign_in_failed" };
    },

    apps(id) {
      const r = find(id);
      if (!r) return [];
      const services = r.source === "oo" ? (ooLink?.cached() ?? []).map((s) => ({ service: s.service, title: s.title })) : (appsCache.get(r.id) ?? []).map((a) => ({ service: a.service, title: a.title }));
      const out: AppTarget[] = [];
      for (const s of services) {
        const accts = accountsOf(r, s.service);
        const one = (name: string | undefined, label: string | undefined, dflt: boolean): AppTarget => {
          const key = name ? `${s.service}:${name}` : s.service;
          const watch = r.watch?.[key] ?? r.watch?.[s.service] ?? true;
          return { connectionId: r.id, source: r.source, service: s.service, title: s.title, ...(name && !(dflt && accts.length === 1) ? { account: name } : {}), ...(label ? { label } : {}), watch, excluded: isExcluded(r, s.service, name) };
        };
        if (!accts.length) out.push(one(undefined, undefined, true));
        else for (const c of accts) out.push(one(c.name, c.label, c.default));
      }
      return out;
    },

    setApp(id, service, account, patch) {
      const r = find(id);
      if (!r) return false;
      const key = account ? `${service}:${account}` : service;
      if (patch.watch !== undefined) r.watch = { ...(r.watch ?? {}), [key]: patch.watch };
      if (patch.excluded !== undefined) {
        const rest = (r.excluded ?? []).filter((e) => e.toLowerCase() !== key.toLowerCase());
        r.excluded = patch.excluded ? [...rest, key] : rest;
        if (!r.excluded.length) delete r.excluded;
      }
      records = records.map((x) => (x.id === r.id ? r : x));
      save();
      changed();
      return true;
    },

    onRemove(fn) {
      removed.add(fn);
      return () => removed.delete(fn);
    },

    oo: () => oo.detect(),

    async addFromOo() {
      // D122: oo signed in is the default, through oo itself: Ducter reads no oo file and holds no
      // key. Only an oo without a sign-in falls back to the self-hosted address and token in its setup.
      if (ooLink) {
        let signedIn = false;
        try {
          signedIn = await oo.cli!.signedIn();
        } catch (e) {
          if (!oo.read()) return { ok: false, reason: linkErrorOf(e).reason === "unauthorized" ? "unauthorized" : "no_oo" };
        }
        if (signedIn) {
          if (records.some((r) => r.source === "oo")) return { ok: false, reason: "duplicate" };
          try {
            await ooLink.services();
          } catch (e) {
            return { ok: false, reason: linkErrorOf(e).reason };
          }
          const id = `conn_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
          records = [...records, { id, name: records.some((r) => r.name === "oo") ? `oo ${records.length + 1}` : "oo", url: "oo:", source: "oo", addedAt: new Date(now()).toISOString(), via: "oo" }];
          save();
          health.set(id, { state: "ok", at: now() });
          changed();
          // The catalog (a few searches and one schema call) warms in the background.
          void ooLink("oo:").then((l) => l.tools()).catch(() => {});
          return { ok: true, id };
        }
      }
      const r = oo.read();
      if (!r) return { ok: false, reason: ooLink ? "oo_signed_out" : "no_oo" };
      return api.add({ url: r.url, token: r.token, via: "oo" });
    },

    async recheck() {
      const probe = oo.probe?.().then(() => changed()).catch(() => {});
      const stale = records.filter((r) => now() - (health.get(r.id)?.at ?? 0) > RECHECK_MS);
      if (!stale.length) return void (await probe);
      await Promise.all(
        stale.map(async (r) => {
          if (r.source === "oo" && ooLink) return withLink(r, () => ooLink.services()).catch(() => undefined);
          await tools(r).catch(() => undefined);
          if (isOC(r) && health.get(r.id)?.state === "ok") {
            const apps = await appsAt(r.url, keyOf(r.id));
            if (apps) appsCache.set(r.id, apps);
          }
        }),
      );
      await probe;
      changed();
    },

    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    watchable(key) {
      const r = find(key);
      if (!r) return { ok: false, error: NOT_FOUND };
      if (r.source === "mcp") return { ok: false, error: `${r.name} is not an OpenConnector: it has no triggers to watch` };
      if (r.source === "oo" || r.url.startsWith("oo:")) return { ok: false, error: OO_NOT_WATCHABLE };
      return { ok: true };
    },

    async readTrigger(key, service, trigger, config, checkpoint) {
      const r = find(key);
      if (!r) return { ok: false, error: NOT_FOUND };
      const w = api.watchable(key);
      if (!w.ok) return w;
      const url = `${apiBase(r.url)}/v1/providers/${encodeURIComponent(service)}/triggers/${encodeURIComponent(trigger)}/execute`;
      try {
        const res = await fetcher(url, {
          method: "POST",
          headers: { "content-type": "application/json", ...(keyOf(r.id) ? { authorization: `Bearer ${keyOf(r.id)}` } : {}) },
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
