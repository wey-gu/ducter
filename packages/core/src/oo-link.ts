// The oo CLI as a connection (D122, design/connectors.md §4.4): when the user's oo (OOMOL's CLI)
// is signed in, Ducter reads their accounts by running oo itself. oo's account key never leaves
// oo: Ducter reads no oo file and holds no secret for this kind; it only runs
//   oo auth status --json
//   oo connector apps --json
//   oo connector search <text> --json
//   oo connector schema <service>.<action>... --json
//   oo connector run <service> -a <action> -d @<0600 file> --json [--connection-name <name>]
// with a minimal environment (PATH, HOME, XDG_CONFIG_HOME, OO_*): no harness key, no token.
//
// oo gives no read/write hint, so read or write comes from the action's name (ooOp): only an
// action that starts with a clear read verb and has no changing word in it is a read; anything
// else, unknown included, is a write and waits for the user's Go like every other write.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import type { OoApp } from "@ducter/protocol";
import { LinkError, type Link, type Linker, type LinkTool } from "./connections.ts";

// ---------- read or write, from the action's name ----------

/** The first word of a read. Nothing that may move, send or change anything. */
export const READ_VERBS = new Set(["fetch", "list", "get", "search", "read", "query", "find", "lookup", "count", "describe", "retrieve", "view", "show"]);
/** A word anywhere in the name that makes it a write even after a read verb ("get_or_create_…"). */
export const WRITE_WORDS = new Set([
  "send", "reply", "forward", "create", "add", "insert", "post", "put", "patch", "update", "modify", "edit", "set", "replace",
  "delete", "remove", "trash", "untrash", "archive", "unarchive", "move", "mark", "batch", "upload", "download", "import",
  "export", "share", "invite", "approve", "cancel", "start", "stop", "watch", "subscribe", "unsubscribe", "run", "execute",
  "submit", "publish", "write", "save", "copy", "rename", "merge", "lock", "unlock", "enable", "disable", "grant", "revoke",
  "accept", "decline", "pin", "unpin", "star", "unstar", "react", "schedule", "book", "pay", "transfer", "and", "or",
]);

/**
 * Reads whose names don't start with a verb, checked one by one against the service's own docs
 * (research/64: Google Calendar's freeBusy query only reads busy times).
 */
export const KNOWN_READS = new Set(["googlecalendar.free_busy_query"]);

/** read only for a clear read verb first and no changing word anywhere; unknown is a write. */
export function ooOp(action: string): "read" | "write" {
  if (KNOWN_READS.has(action)) return "read";
  const name = action.includes(".") ? action.slice(action.indexOf(".") + 1) : action;
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (!words.length || !READ_VERBS.has(words[0])) return "write";
  if (words.slice(1).some((w) => WRITE_WORDS.has(w))) return "write";
  return "read";
}

// ---------- running oo ----------

export type OoRun = { code: number | null; stdout: string; stderr: string; timedOut?: boolean; missing?: boolean };
export type OoExec = (args: string[], opts?: { timeoutMs?: number }) => Promise<OoRun>;

/** The environment oo runs with: what it needs to find itself and its own sign-in, nothing else. */
export function ooEnv(env: Record<string, string | undefined> = process.env, bin?: string): Record<string, string> {
  const out: Record<string, string> = {};
  const path = [bin ? dirname(bin) : "", env.PATH ?? "/usr/bin:/bin"].filter(Boolean).join(delimiter);
  out.PATH = path;
  out.HOME = env.HOME ?? homedir();
  for (const k of ["XDG_CONFIG_HOME", "APPDATA"]) if (env[k]) out[k] = env[k]!;
  for (const [k, v] of Object.entries(env)) if (k.startsWith("OO_") && v !== undefined) out[k] = v;
  return out;
}

export function ooExec(bin: string, env: Record<string, string>): OoExec {
  return async (args, opts = {}) => {
    let proc: ReturnType<typeof Bun.spawn>;
    try {
      proc = Bun.spawn([bin, ...args], { env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    } catch {
      return { code: null, stdout: "", stderr: "", missing: true };
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, opts.timeoutMs ?? 30_000);
    try {
      const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout as ReadableStream).text(), new Response(proc.stderr as ReadableStream).text(), proc.exited]);
      return { code, stdout, stderr, ...(timedOut ? { timedOut } : {}) };
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Finds oo: on PATH, else where its installer puts it (an app's PATH often lacks ~/.local/bin). */
export function findOo(which: (b: string) => string | null = (b) => Bun.which(b)): string | null {
  const local = join(homedir(), ".local", "bin", "oo");
  return which("oo") ?? (existsSync(local) ? local : null);
}

// ---------- what oo answers ----------

export interface OoConnection {
  name: string;
  label: string;
  default: boolean;
}
export interface OoService {
  service: string;
  title: string;
  connections: OoConnection[];
}
interface OoAction {
  service: string;
  name: string;
  description?: string;
  inputSchema?: unknown;
}

/** Accounts, not public data or paid APIs: oo also lists no-auth sources and marketplace services that bill. */
const ACCOUNT_AUTH = new Set(["oauth2", "custom_credential", "api_key", "basic"]);

const TITLES: Record<string, string> = {
  gmail: "Gmail", googlecalendar: "Google Calendar", google_calendar: "Google Calendar", googledrive: "Google Drive", google_drive: "Google Drive",
  github: "GitHub", slack: "Slack", slackbot: "Slack bot", discord: "Discord", discordbot: "Discord bot", notion: "Notion", linear: "Linear",
  outlook: "Outlook", wecom_bot: "WeCom bot", feishu: "Feishu", lark: "Lark", dingtalk: "DingTalk", telegram: "Telegram", jira: "Jira",
};
export const knownService = (s: string) => s in TITLES;
export const serviceTitle = (s: string) => TITLES[s] ?? s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const appsOf = (services: OoService[]): OoApp[] => services.map((s) => ({ service: s.service, title: s.title, accounts: s.connections.map((c) => c.label) }));

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.@-]{0,127}$/;
const ACTION_ID = /^([a-z0-9][a-z0-9_-]{0,63})\.([A-Za-z0-9][A-Za-z0-9_]{0,127})$/;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const firstLine = (s: string) => clip(s.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] ?? "", 300);

function parseJson<T>(r: OoRun): T {
  try {
    return JSON.parse(r.stdout) as T;
  } catch {
    throw new LinkError("not_mcp", `oo answered something that isn't JSON: ${firstLine(r.stdout || r.stderr)}`);
  }
}

/** A run that failed before reaching the account: oo missing, timed out, or signed out. */
function failure(r: OoRun): LinkError | undefined {
  if (r.missing) return new LinkError("unreachable", "oo is not installed (or can't be run)");
  if (r.timedOut) return new LinkError("unreachable", "oo didn't answer in time");
  if (r.code === 0) return;
  const m = `${r.stderr}\n${r.stdout}`;
  if (/must log in|log ?in first|not logged|logged-out|sign(ed)? ?in|\b401\b|\b403\b|unauthori[sz]ed|forbidden|expired/i.test(m)) return new LinkError("unauthorized", firstLine(m) || "oo is signed out");
  return;
}

export interface OoCli {
  /** oo auth status: signed in to an OOMOL account? */
  signedIn(): Promise<boolean>;
  /** The services with an account connected in oo, and their connection names. */
  services(): Promise<OoService[]>;
  search(text: string): Promise<OoAction[]>;
  schemas(ids: string[]): Promise<OoAction[]>;
  /** Runs one action. Throws LinkError when oo can't reach the account; an action's own error comes back as isError. */
  run(service: string, action: string, input: Record<string, unknown>, connection?: string): Promise<{ isError: boolean; data: unknown }>;
}

export function ooCli(opts: { exec: OoExec; timeoutMs?: number; listTimeoutMs?: number }): OoCli {
  const exec = opts.exec;
  const listT = opts.listTimeoutMs ?? 20_000;
  const list = async <T>(args: string[]): Promise<T> => {
    const r = await exec(args, { timeoutMs: listT });
    const f = failure(r);
    if (f) throw f;
    if (r.code !== 0) throw new LinkError("not_mcp", firstLine(r.stderr || r.stdout) || `oo exited ${r.code}`);
    return parseJson<T>(r);
  };
  return {
    async signedIn() {
      const s = await list<{ status?: string; accounts?: unknown[] }>(["auth", "status", "--json"]);
      return s.status === "logged-in" || (s.status !== "logged-out" && Array.isArray(s.accounts) && s.accounts.length > 0);
    },
    async services() {
      const rows = await list<{ service?: string; connectionName?: string | null; accountLabel?: string; displayName?: string; authType?: string; status?: string; isDefault?: boolean }[]>(["connector", "apps", "--json"]);
      const by = new Map<string, OoService>();
      for (const r of Array.isArray(rows) ? rows : []) {
        if (!r.service || !r.connectionName || r.status !== "active" || !ACCOUNT_AUTH.has(r.authType ?? "")) continue;
        const s = by.get(r.service) ?? { service: r.service, title: serviceTitle(r.service), connections: [] };
        if (!s.connections.some((c) => c.name === r.connectionName)) s.connections.push({ name: r.connectionName, label: r.accountLabel || r.displayName || r.connectionName, default: Boolean(r.isDefault) });
        by.set(r.service, s);
      }
      for (const s of by.values()) {
        // oo's default first; exactly one default (the first, when oo marks none or several).
        s.connections.sort((a, b) => Number(b.default) - Number(a.default));
        s.connections.forEach((c, i) => (c.default = i === 0));
      }
      return [...by.values()];
    },
    async search(text) {
      const rows = await list<OoAction[]>(["connector", "search", text, "--json"]);
      const seen = new Set<string>();
      return (Array.isArray(rows) ? rows : []).filter((a) => a?.service && a?.name && !seen.has(`${a.service}.${a.name}`) && seen.add(`${a.service}.${a.name}`));
    },
    async schemas(ids) {
      if (!ids.length) return [];
      const rows = await list<OoAction[] | OoAction>(["connector", "schema", ...ids, "--json"]);
      return Array.isArray(rows) ? rows : [rows];
    },
    async run(service, action, input, connection) {
      const dir = mkdtempSync(join(tmpdir(), "ducter-oo-"));
      const file = join(dir, "input.json");
      try {
        // The input goes through a 0600 file, never argv: argv shows in `ps` to every user.
        writeFileSync(file, JSON.stringify(input ?? {}), { mode: 0o600 });
        const args = ["connector", "run", service, "-a", action, "-d", `@${file}`, "--json", ...(connection ? ["--connection-name", connection] : [])];
        const r = await exec(args, { timeoutMs: opts.timeoutMs ?? 60_000 });
        const f = failure(r);
        if (f) throw f;
        if (r.code !== 0) return { isError: true, data: { error: { code: "oo", message: firstLine(r.stderr || r.stdout) || `oo exited ${r.code}` } } };
        const out = parseJson<{ data?: unknown }>(r);
        return { isError: false, data: out && typeof out === "object" && "data" in out ? out.data : out };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}

// ---------- the link ----------

const APPS_MS = 5 * 60_000; // the recheck cadence
const CATALOG_MS = 60 * 60_000; // an action catalog changes rarely
/** What a service's catalog is found by: oo has no "list actions", so a few searches, read verbs first. */
const CATALOG_QUERIES = (s: string) => [s, `${s} list`, `${s} get`, `${s} search`, `${s} fetch`, `${s} read`];

/**
 * The oo link. The cache lives here, across links (the broker opens one per use). The address is
 * ignored: there is only the one oo on this computer.
 */
export function ooLinker(cli: OoCli, now: () => number = Date.now): Linker & { services(): Promise<OoService[]>; cached(): OoService[] | undefined } {
  let apps: { at: number; services: OoService[] } | undefined;
  const catalogs = new Map<string, { at: number; actions: OoAction[] }>();
  const schemaCache = new Map<string, OoAction>();

  const services = async () => {
    if (apps && now() - apps.at < APPS_MS) return apps.services;
    apps = { at: now(), services: await cli.services() };
    return apps.services;
  };

  const toTool = (a: OoAction, svc: OoService): LinkTool => {
    const id = `${a.service}.${a.name}`;
    const base = (a.inputSchema && typeof a.inputSchema === "object" ? a.inputSchema : { type: "object", properties: {} }) as { properties?: Record<string, unknown> };
    const conns = svc.connections;
    const schema =
      conns.length > 1
        ? { ...base, properties: { ...(base.properties ?? {}), connection: { type: "string", enum: conns.map((c) => c.name), description: `Which ${svc.title} account (${conns.map((c) => `${c.name}: ${c.label}`).join("; ")}). Omit for the default, ${conns[0].name}.` } } }
        : base;
    return { name: id, description: a.description, inputSchema: schema, annotations: { readOnlyHint: ooOp(id) === "read" } };
  };

  const withSchemas = async (acts: OoAction[]): Promise<OoAction[]> => {
    const missing = acts.filter((a) => !schemaCache.has(`${a.service}.${a.name}`)).map((a) => `${a.service}.${a.name}`);
    if (missing.length) {
      try {
        for (const s of await cli.schemas(missing)) if (s?.service && s?.name) schemaCache.set(`${s.service}.${s.name}`, s);
      } catch {
        /* the names and descriptions still help; the guide fetches one schema again */
      }
    }
    return acts.map((a) => ({ ...a, ...(schemaCache.get(`${a.service}.${a.name}`) ?? {}) }));
  };

  const catalog = async (svc: OoService): Promise<OoAction[]> => {
    const c = catalogs.get(svc.service);
    if (c && now() - c.at < CATALOG_MS) return c.actions;
    const found = new Map<string, OoAction>();
    const results = await Promise.allSettled(CATALOG_QUERIES(svc.service).map((q) => cli.search(q)));
    let failed: unknown;
    for (const r of results) {
      if (r.status === "rejected") failed ??= r.reason;
      else for (const a of r.value) if (a.service === svc.service && !found.has(a.name)) found.set(a.name, a);
    }
    if (!found.size && failed) throw failed;
    const actions = await withSchemas([...found.values()].sort((a, b) => a.name.localeCompare(b.name)));
    catalogs.set(svc.service, { at: now(), actions });
    return actions;
  };

  const link: Link = {
    async tools() {
      const svcs = await services();
      const out: LinkTool[] = [];
      for (const svc of svcs) for (const a of await catalog(svc)) out.push(toTool(a, svc));
      return out;
    },
    async search(query: string, service?: string) {
      const svcs = await services();
      const by = new Map(svcs.map((s) => [s.service, s]));
      if (service && !by.has(service)) return [];
      const q = service && !query.toLowerCase().includes(service) ? `${service} ${query}` : query;
      const hits = (await cli.search(q)).filter((a) => by.has(a.service) && (!service || a.service === service));
      return (await withSchemas(hits)).map((a) => toTool(a, by.get(a.service)!));
    },
    async describe(name: string) {
      const m = ACTION_ID.exec(name);
      if (!m) return;
      const svc = (await services()).find((s) => s.service === m[1]);
      if (!svc) return;
      const [a] = await withSchemas([{ service: m[1], name: m[2] }]);
      return schemaCache.has(name) ? toTool(a, svc) : undefined;
    },
    async call(name, args) {
      const m = ACTION_ID.exec(name);
      if (!m) return { isError: true, data: { error: { code: "bad_action", message: `${name} isn't an action id like gmail.fetch_emails` } } };
      const svc = (await services()).find((s) => s.service === m[1]);
      if (!svc) return { isError: true, data: { error: { code: "not_connected", message: `No ${serviceTitle(m[1])} account is connected in oo.` } } };
      const { connection, ...input } = (args ?? {}) as Record<string, unknown>;
      let conn: string | undefined;
      if (typeof connection === "string" && connection.trim()) {
        const want = connection.trim();
        const hit = svc.connections.find((c) => c.name === want || c.label.toLowerCase() === want.toLowerCase());
        if (!hit || !SAFE_NAME.test(hit.name)) return { isError: true, data: { error: { code: "unknown_account", message: `No ${svc.title} account "${want}" in oo. It has: ${svc.connections.map((c) => c.name).join(", ")}.` } } };
        conn = hit.default ? undefined : hit.name;
      }
      return cli.run(m[1], m[2], input, conn);
    },
    async close() {},
  };

  const linker = Object.assign((async () => link) as Linker, { services, cached: () => apps?.services });
  return linker;
}
