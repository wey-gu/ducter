// D655 (research/246 §4.2): the Lody reader, in tree.
//
// Lody keeps its sessions on its own service, not in a local file, and its workspaces may be
// end-to-end encrypted. So Ducter runs the person's own `lody` CLI, already signed in on this
// computer, the way it runs `gh` — never the other app's code, never a credential of ours:
//
//   lody workspace list --json                      which workspaces this login can read
//   lody session list --workspace <w> --all --json  the sessions, paging by nextCursor
//   lody session show <id> --json                   machine, workspace binding, repository
//   lody session history <id> --all --jsonl         the visible transcript
//
// The reader turns that into `ducter-import/1` records and hands them to the one import service
// (service.ts); it never writes the Log itself. Only visible user and assistant words come in:
// tool calls, thinking, plans, system messages and unfinished (streaming) replies are left out,
// and attachments are counted in a `skipped` record. A workspace this computer may not read yet
// because it is encrypted says so in its own words and is skipped; a signed-out CLI is not a run.
//
// The command itself is injectable so tests (and demo cores) put a fake `lody` on PATH: the real
// binary is never run here. `DUCTER_LODY_BIN` names another binary; absent, `lody` on PATH.
import { execFile } from "node:child_process";
import { IMPORT_FORMAT } from "./format.ts";

export interface LodyResult {
  /** The process's exit code; -1 when it could not start (ENOENT and friends). */
  code: number;
  stdout: string;
  stderr: string;
  /** The OS error's code when it could not start. */
  spawnError?: string;
}

/** Runs `lody` with these arguments. Injected in tests; the default is the real PATH lookup. */
export type LodyExec = (args: string[]) => Promise<LodyResult>;

export const LODY_BIN = "lody";
/** An encrypted workspace's CLI refusal, verbatim (`command-runtime.ts`, VERIFIED). */
export const LODY_ENCRYPTED = "Update the owner machine to access encrypted Roost history.";
/** The CLI when there is no stored login, and when the stored one was revoked. */
const SIGNED_OUT = [/not logged in/i, /login again/i, /invalid or expired/i, /unauthorized/i];

export interface LodyWorkspace {
  id: string;
  name: string;
  slug?: string;
}

export interface LodyDetect {
  /** `lody` answered at all (so it is on PATH). */
  present: boolean;
  signedIn: boolean;
  /** The CLI said there is no login (or the login was revoked), not a network or other failure. */
  signedOut?: boolean;
  workspaces: LodyWorkspace[];
  /** Why there is nothing to read, in the CLI's own words (for the log, never the row). */
  error?: string;
}

/** The default runner: one `lody` process, a timeout, no shell, the person's own PATH. */
export function lodyRunner(opts: { bin?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; maxBytes?: number } = {}): LodyExec {
  const bin = opts.bin ?? process.env.DUCTER_LODY_BIN ?? LODY_BIN;
  return (args) =>
    new Promise((resolve) => {
      execFile(
        bin,
        args,
        {
          timeout: opts.timeoutMs ?? 180_000,
          maxBuffer: opts.maxBytes ?? 512 * 1024 * 1024,
          env: opts.env ?? process.env,
          encoding: "utf8",
        },
        (err, stdout, stderr) => {
          const e = err as (NodeJS.ErrnoException & { code?: number | string; killed?: boolean }) | null;
          const code = e ? (typeof e.code === "number" ? e.code : e.killed ? -2 : -1) : 0;
          resolve({ code, stdout: stdout ?? "", stderr: stderr ?? "", ...(e && typeof e.code === "string" ? { spawnError: e.code } : {}) });
        },
      );
    });
}

const trimmed = (s: string) => s.replace(/\s+/g, " ").trim();
const isSignedOut = (s: string) => SIGNED_OUT.some((re) => re.test(s));

function parseJson<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

/** Reads what is there without reading a conversation: `lody` on PATH, signed in or not. */
export async function detectLody(run: LodyExec): Promise<LodyDetect> {
  const r = await run(["workspace", "list", "--json"]);
  if (r.spawnError === "ENOENT" || (r.code === -1 && /not found/i.test(r.stderr))) return { present: false, signedIn: false, workspaces: [] };
  const body = parseJson<{ ok?: boolean; workspaces?: unknown; error?: string }>(r.stdout);
  if (r.code !== 0 || body?.ok === false) {
    const why = trimmed(body?.error ?? r.stderr ?? "");
    return { present: true, signedIn: false, ...(isSignedOut(why) ? { signedOut: true } : {}), workspaces: [], ...(why ? { error: why } : {}) };
  }
  const list = Array.isArray(body?.workspaces) ? body.workspaces : [];
  const workspaces = list
    .map((w): LodyWorkspace | undefined => {
      const o = (w && typeof w === "object" ? w : {}) as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id.trim() : "";
      const name = typeof o.name === "string" ? o.name.trim() : "";
      const slug = typeof o.slug === "string" ? o.slug.trim() : "";
      return id || slug ? { id: id || slug, name: name || slug || id, ...(slug ? { slug } : {}) } : undefined;
    })
    .filter((w): w is LodyWorkspace => !!w);
  return { present: true, signedIn: true, workspaces };
}

interface LodySession {
  id: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  isArchived?: boolean;
  repoFullName?: string;
  project?: { kind?: string; repoFullName?: string; githubRepoFullName?: string; branch?: string };
  branchName?: string;
  baseBranch?: string;
  agentType?: string;
  cliType?: string;
  lastModel?: { modelId?: string; name?: string };
  lastMessageAt?: number;
}

interface LodyHistoryEntry {
  id?: string;
  role?: string;
  timestamp?: string;
  items?: { type?: string; text?: string }[];
  finished?: boolean;
  status?: string;
  endedAt?: number;
}

/** One workspace's reading, as the row says it. */
export interface LodyWorkspaceRead {
  slug: string;
  name: string;
  state: "ready" | "needs_authorization" | "failed";
  sessions: number;
  /** The CLI's own words when it refused (the log's, never the row's). */
  error?: string;
}

export interface LodyRead {
  /** `lody` was there and the login answered (false: nothing was read). */
  present: boolean;
  signedIn: boolean;
  /** The CLI said there is no login; false with present and not signedIn means another failure. */
  signedOut?: boolean;
  /** `ducter-import/1` JSON lines, for the one import service. */
  stream: string;
  /** Conversations in the source's index (readable workspaces only). */
  total: number;
  /** Workspaces this computer may not read because they are encrypted (their names). */
  waiting: string[];
  workspaces: LodyWorkspaceRead[];
  /** What the source did, for the row and the one quiet line. */
  threads: number;
  messages: number;
  skipped: number;
}

const iso = (ms: number) => new Date(ms).toISOString();
const MAX_PAGES = 200;

function repoOf(s: LodySession): string | undefined {
  const p = s.project;
  const r = s.repoFullName ?? p?.repoFullName ?? p?.githubRepoFullName;
  return r && r.trim() ? r.trim() : undefined;
}

function agentOf(s: LodySession): string | undefined {
  const a = (s.agentType ?? s.cliType ?? "").trim();
  return a || undefined;
}

function modelOf(s: LodySession): string | undefined {
  const m = s.lastModel?.name ?? s.lastModel?.modelId;
  return m && m.trim() ? m.trim() : undefined;
}

/**
 * Lists one workspace's sessions, a page at a time (`items`/`sessions`, `hasMore`, `nextCursor`).
 * Returns the refusal as a state instead of throwing, so one encrypted workspace never stops the
 * others.
 */
async function listSessions(run: LodyExec, w: LodyWorkspace): Promise<{ sessions: LodySession[]; state: "ready" | "needs_authorization" | "failed"; error?: string }> {
  const all: LodySession[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const args = ["session", "list", "--workspace", w.slug ?? w.id, "--all", "--json"];
    if (cursor) args.push("--cursor", cursor);
    const r = await run(args);
    if (r.code !== 0) {
      const why = trimmed(r.stderr || r.stdout);
      return { sessions: all, state: LODY_ENCRYPTED.length > 0 && why.includes(LODY_ENCRYPTED) ? "needs_authorization" : "failed", error: why };
    }
    const body = parseJson<{ ok?: boolean; items?: unknown; sessions?: unknown; hasMore?: boolean; nextCursor?: string; error?: string }>(r.stdout);
    if (!body || body.ok === false) {
      const why = trimmed(body?.error ?? r.stderr ?? "");
      return { sessions: all, state: why.includes(LODY_ENCRYPTED) ? "needs_authorization" : "failed", error: why };
    }
    const list = Array.isArray(body.items) ? body.items : Array.isArray(body.sessions) ? body.sessions : [];
    for (const raw of list) {
      const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id.trim() : typeof o.sessionId === "string" ? o.sessionId.trim() : "";
      if (id) all.push(o as unknown as LodySession);
    }
    const next = typeof body.nextCursor === "string" && body.nextCursor.trim() ? body.nextCursor.trim() : undefined;
    if (!body.hasMore || !next) break;
    cursor = next;
  }
  return { sessions: all, state: "ready" };
}

/** The binding `session show` adds: repository and branch when the list didn't carry them. */
async function showSession(run: LodyExec, id: string): Promise<LodySession | undefined> {
  const r = await run(["session", "show", id, "--json"]);
  if (r.code !== 0) return undefined;
  const body = parseJson<{ ok?: boolean; session?: unknown }>(r.stdout);
  const s = body?.session;
  return s && typeof s === "object" ? (s as LodySession) : undefined;
}

/** The visible words of one history entry: its text blocks, in order; everything else is not words. */
function wordsOf(e: LodyHistoryEntry): { text: string; others: number } {
  let text = "";
  let others = 0;
  for (const it of e.items ?? []) {
    if (!it || typeof it !== "object") continue;
    if (it.type === "text" && typeof it.text === "string") {
      const t = it.text.trim();
      if (t) text += `${text ? "\n" : ""}${t}`;
    } else if (it.type) others++;
  }
  return { text, others };
}

/** Reads one session's visible transcript, in source order (`--all`). */
async function historyOf(run: LodyExec, id: string): Promise<{ entries: LodyHistoryEntry[]; state: "ready" | "needs_authorization" | "failed"; error?: string }> {
  const r = await run(["session", "history", id, "--all", "--jsonl"]);
  if (r.code !== 0) {
    const why = trimmed(r.stderr || r.stdout);
    return { entries: [], state: why.includes(LODY_ENCRYPTED) ? "needs_authorization" : "failed", error: why };
  }
  const entries: LodyHistoryEntry[] = [];
  for (const line of r.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const o = parseJson<LodyHistoryEntry & { type?: string; error?: string }>(line);
    if (!o) continue;
    if (o.type === "error") return { entries, state: "failed", error: trimmed(o.error ?? "") };
    if (typeof o.id === "string" && typeof o.role === "string") entries.push(o);
  }
  return { entries, state: "ready" };
}

/**
 * Reads every workspace the login can read and prints `ducter-import/1` records. Never throws for
 * one workspace's refusal: the others still come in, and the row says which one waits.
 */
export async function readLody(run: LodyExec, o: { now?: () => number } = {}): Promise<LodyRead> {
  const now = o.now ?? Date.now;
  const detected = await detectLody(run);
  const lines: string[] = [];
  const workspaces: LodyWorkspaceRead[] = [];
  const waiting: string[] = [];
  let threads = 0;
  let messages = 0;
  let skipped = 0;
  let total = 0;
  if (!detected.present || !detected.signedIn) {
    return { present: detected.present, signedIn: detected.signedIn, ...(detected.signedOut ? { signedOut: true } : {}), stream: "", total: 0, waiting, workspaces, threads: 0, messages: 0, skipped: 0 };
  }
  const at = now();
  const clamp = (value: string | undefined): string | undefined => {
    if (!value) return undefined;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? iso(Math.min(ms, at)) : undefined;
  };
  for (const w of detected.workspaces) {
    const listed = await listSessions(run, w);
    if (listed.state !== "ready") {
      workspaces.push({ slug: w.slug ?? w.id, name: w.name, state: listed.state, sessions: 0, ...(listed.error ? { error: listed.error } : {}) });
      if (listed.state === "needs_authorization") waiting.push(w.name);
      continue;
    }
    total += listed.sessions.length;
    const counts = { threads: 0, messages: 0, skipped: 0 };
    let trouble: { state: "needs_authorization" | "failed"; error?: string } | undefined;
    for (const s of listed.sessions) {
      // The list's own metadata carries the repository most of the time; `show` is the honest
      // answer when it doesn't (machine, workspace binding, repository). Never for every session:
      // that would be one network round trip each.
      let meta = s;
      if (!repoOf(s)) {
        const shown = await showSession(run, s.id).catch(() => undefined);
        if (shown) meta = { ...s, ...shown };
      }
      const hist = await historyOf(run, s.id);
      if (hist.state !== "ready") {
        // One session Ducter can't read is one row it can't decode, never a failed run (4.1).
        if (!trouble || hist.state === "needs_authorization") trouble = { state: hist.state, ...(hist.error ? { error: hist.error } : {}) };
        continue;
      }
      const msgs: { id: string; role: "user" | "assistant"; text: string; at: string }[] = [];
      let attachments = 0;
      for (const e of hist.entries) {
        if (e.role !== "user" && e.role !== "assistant") continue;
        // An assistant reply still arriving is not words yet (research/246 §4.6): leave it for the
        // next run, never import a half answer.
        if (e.role === "assistant" && (e.finished === false || e.status === "processing" || e.status === "pending")) continue;
        const w2 = wordsOf(e);
        if (w2.others) attachments += w2.others;
        if (!w2.text || typeof e.id !== "string" || !e.id) continue;
        const when = clamp(e.timestamp);
        if (!when) continue;
        msgs.push({ id: e.id, role: e.role, text: w2.text, at: when });
      }
      if (!msgs.length) {
        if (attachments) skipped += attachments;
        continue;
      }
      msgs.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
      const created = clamp(meta.createdAt) ?? msgs[0]!.at;
      const updated = clamp(typeof meta.lastMessageAt === "number" ? iso(meta.lastMessageAt) : undefined) ?? clamp(meta.updatedAt) ?? msgs.at(-1)!.at;
      const title = (meta.title ?? "").trim() || msgs.find((m) => m.role === "user")?.text.slice(0, 80) || "Lody session";
      const repo = repoOf(meta);
      const agent = agentOf(meta);
      const model = modelOf(meta);
      lines.push(
        JSON.stringify({
          t: "thread",
          id: s.id,
          title,
          ...(repo ? { repo } : {}),
          ...(meta.branchName ?? meta.project?.branch ? { branch: meta.branchName ?? meta.project?.branch } : {}),
          ...(agent ? { agent } : {}),
          ...(model ? { model } : {}),
          createdAt: created,
          updatedAt: updated,
          archived: meta.isArchived === true,
        }),
      );
      for (const m of msgs) lines.push(JSON.stringify({ t: "msg", thread: s.id, id: m.id, role: m.role, text: m.text, at: m.at }));
      if (attachments) lines.push(JSON.stringify({ t: "skipped", thread: s.id, what: "attachment", n: attachments }));
      counts.threads++;
      counts.messages += msgs.length;
      counts.skipped += attachments;
    }
    // A workspace that read something is ready; one that could read nothing says why.
    const state = trouble && !counts.threads ? trouble.state : "ready";
    if (state === "needs_authorization") waiting.push(w.name);
    workspaces.push({ slug: w.slug ?? w.id, name: w.name, state, sessions: listed.sessions.length, ...(state !== "ready" && trouble?.error ? { error: trouble.error } : {}) });
    threads += counts.threads;
    messages += counts.messages;
    skipped += counts.skipped;
  }
  // One source: Lody, across the workspaces this login can read. The account is stable across
  // runs (the app), so a thread's deterministic id never moves between workspaces.
  const source = { t: "source", format: IMPORT_FORMAT, app: "Lody", account: "lody", reader: "lody-cli", readerVersion: "1" };
  if (threads || messages) {
    lines.unshift(JSON.stringify(source));
    lines.push(JSON.stringify({ t: "end", threads, messages }));
  }
  return { present: true, signedIn: true, stream: lines.length ? `${lines.join("\n")}\n` : "", total, waiting: [...new Set(waiting)], workspaces, threads, messages, skipped };
}

/** A look at the source's index only: what is there, never a conversation's words. */
export interface LodyLook {
  present: boolean;
  signedIn: boolean;
  signedOut?: boolean;
  total: number;
  waiting: string[];
  workspaces: LodyWorkspaceRead[];
  error?: string;
}

/**
 * What the source holds on this computer, without reading a conversation: `workspace list` then
 * each workspace's `session list`. The pane and the offer use this; a run reads whole threads.
 */
export async function lookLody(run: LodyExec): Promise<LodyLook> {
  const detected = await detectLody(run);
  if (!detected.present || !detected.signedIn) {
    return { present: detected.present, signedIn: detected.signedIn, ...(detected.signedOut ? { signedOut: true } : {}), total: 0, waiting: [], workspaces: [], ...(detected.error ? { error: detected.error } : {}) };
  }
  let total = 0;
  const waiting: string[] = [];
  const workspaces: LodyWorkspaceRead[] = [];
  let failed: string | undefined;
  for (const w of detected.workspaces) {
    const listed = await listSessions(run, w);
    workspaces.push({ slug: w.slug ?? w.id, name: w.name, state: listed.state, sessions: listed.sessions.length, ...(listed.error ? { error: listed.error } : {}) });
    if (listed.state === "needs_authorization") waiting.push(w.name);
    else if (listed.state === "failed") failed ??= listed.error;
    else total += listed.sessions.length;
  }
  return { present: true, signedIn: true, total, waiting, workspaces, ...(failed ? { error: failed } : {}) };
}
