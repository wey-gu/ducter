// D214: the workbench's ops, run on the computer that holds the task's working copy (this machine,
// or a worker through worker-host.ts). Everything is confined to the task's own working copy (its
// worktree, its folder, its scratch folder): a path is resolved, links included, and refused when
// it lands outside it or in Ducter's data folder (D207). Reads and lists are capped; a write names
// the version it was opened at and is refused when the file changed since (the agent wrote it).
import { lstatSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync, chmodSync, existsSync, unlinkSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { Place } from "@ducter/protocol";
import { isDucterData } from "@ducter/protocol/src/ducter-folder.ts";
import {
  cleanRel,
  WB_CHANGES_CAP,
  WB_DIFF_CAP,
  WB_HIDDEN,
  WB_IMAGE_CAP,
  WB_LIST_CAP,
  WB_READ_CAP,
  WB_WRITE_CAP,
  type WbAnswer,
  type WbChange,
  type WbEntry,
  type WbError,
  type WbPort,
  type WbRequest,
} from "@ducter/protocol/src/workbench.ts";
import { git } from "./places.ts";
import { createSims, holdsApp, type Sims } from "./sim.ts";

let sims: Sims | undefined;
/** This computer's simulators (one per process: their list is cached for a moment). */
const defaultSims = () => (sims ??= createSims());

export class WbFail extends Error {
  constructor(readonly code: WbError, message?: string) {
    super(message ?? code);
  }
}

export interface WbCtx {
  taskId: string;
  /** The task's working copy on this computer. */
  cwd: string;
  place: Place;
  dataDir: string;
  /** D142: where the copy of a folder task's folder is kept (for its diffs). */
  copy?: string;
  /** Ports never offered as a page (Ducter's own, its browser's). */
  exclude?: number[];
  /** Ports the task's own output named (the home reads them from the Log). */
  said?: number[];
  /** D220: the task's own output touched an iOS Simulator (the home reads it from the Log). */
  simSaid?: boolean;
}

const real = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return undefined;
  }
};

/** The working copy itself, resolved; refused when it is Ducter's data folder (its own scratch folder aside). */
function rootOf(ctx: WbCtx): string {
  const r = real(ctx.cwd);
  if (!r) throw new WbFail("missing", "The task's working copy isn't on this computer any more.");
  const scratch = real(join(ctx.dataDir, "scratch", ctx.taskId));
  if (r !== scratch && isDucterData(r, ctx.dataDir)) throw new WbFail("outside");
  return r;
}

const within = (root: string, p: string) => p === root || p.startsWith(root.endsWith(sep) ? root : root + sep);

/** A path in the working copy, resolved with its links; refused outside it or in Ducter's data. */
export function confine(ctx: WbCtx, rel: unknown, o: { mayBeMissing?: boolean } = {}): { root: string; abs: string; rel: string } {
  const root = rootOf(ctx);
  const clean = cleanRel(rel);
  if (clean === undefined) throw new WbFail("outside");
  const abs = resolve(root, clean);
  if (!within(root, abs)) throw new WbFail("outside");
  const r = real(abs);
  if (!r) {
    if (!o.mayBeMissing) throw new WbFail("missing");
    // A file that is gone (deleted by the task): its folder must still be inside.
    const parent = real(resolve(abs, ".."));
    if (!parent || !within(root, parent)) throw new WbFail("outside");
    return { root, abs, rel: clean };
  }
  if (!within(root, r)) throw new WbFail("outside");
  const scratch = real(join(ctx.dataDir, "scratch", ctx.taskId));
  if (!(scratch && within(scratch, r)) && isDucterData(r, ctx.dataDir)) throw new WbFail("outside");
  return { root, abs: r, rel: clean };
}

export const versionOf = (bytes: Uint8Array) => Bun.hash(bytes).toString(36);

const IMAGE: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", ico: "image/x-icon", avif: "image/avif" };

function list(ctx: WbCtx, path: string): WbAnswer {
  const { abs, rel, root } = confine(ctx, path);
  if (!statSync(abs).isDirectory()) throw new WbFail("missing");
  const dataReal = real(ctx.dataDir);
  const all = readdirSync(abs, { withFileTypes: true }).filter((d) => !WB_HIDDEN.has(d.name));
  const entries: WbEntry[] = [];
  for (const d of all) {
    const full = join(abs, d.name);
    // A folder task over the home folder holds Ducter's data folder: it is never listed.
    if (dataReal && (full === dataReal || (within(full, dataReal) && full !== root && isDucterData(full, ctx.dataDir)))) continue;
    if (d.isSymbolicLink()) entries.push({ name: d.name, kind: "l" });
    else if (d.isDirectory()) entries.push({ name: d.name, kind: "d" });
    else if (d.isFile()) {
      let size: number | undefined;
      try {
        size = lstatSync(full).size;
      } catch {}
      entries.push({ name: d.name, kind: "f", ...(size != null ? { size } : {}) });
    }
  }
  entries.sort((a, b) => (a.kind === "d") !== (b.kind === "d") ? (a.kind === "d" ? -1 : 1) : a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" }));
  return { op: "files", path: rel, entries: entries.slice(0, WB_LIST_CAP), more: Math.max(0, entries.length - WB_LIST_CAP) };
}

/** Not text: a NUL in the first 8 KB, or bytes that aren't UTF-8. */
export function textOf(bytes: Uint8Array): string | undefined {
  const head = bytes.subarray(0, 8192);
  if (head.includes(0)) return undefined;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

function read(ctx: WbCtx, path: string): WbAnswer {
  const { abs, rel } = confine(ctx, path);
  const st = statSync(abs);
  if (!st.isFile()) throw new WbFail("missing");
  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  const mime = IMAGE[ext];
  if (mime && st.size <= WB_IMAGE_CAP) {
    const bytes = readFileSync(abs);
    return { op: "read", path: rel, size: st.size, version: versionOf(bytes), image: `data:${mime};base64,${bytes.toString("base64")}`, binary: ext !== "svg" };
  }
  if (st.size > WB_READ_CAP) return { op: "read", path: rel, size: st.size, version: `${st.size}:${st.mtimeMs}`, tooBig: true };
  const bytes = readFileSync(abs);
  const text = textOf(bytes);
  return text === undefined ? { op: "read", path: rel, size: st.size, version: versionOf(bytes), binary: true } : { op: "read", path: rel, size: st.size, version: versionOf(bytes), text };
}

/** Writes the file the user edited, if it is still the version they opened. Atomic; mode kept. */
function write(ctx: WbCtx, path: string, text: unknown, base: unknown): WbAnswer {
  if (typeof text !== "string" || typeof base !== "string") throw new WbFail("failed");
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > WB_WRITE_CAP) throw new WbFail("too_big");
  const { abs, rel } = confine(ctx, path);
  const st = statSync(abs);
  if (!st.isFile()) throw new WbFail("missing");
  const now = readFileSync(abs);
  if (versionOf(now) !== base) throw new WbFail("conflict");
  if (textOf(now) === undefined) throw new WbFail("binary");
  const tmp = `${abs}.ducter-${process.pid}-${Date.now()}.tmp`;
  writeFileSync(tmp, bytes);
  try {
    chmodSync(tmp, st.mode & 0o7777);
    renameSync(tmp, abs);
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {}
    throw e;
  }
  return { op: "write", path: rel, version: versionOf(bytes) };
}

// ---------- changes ----------

type Repo = Extract<Place, { kind: "repo" }>;
const asRepo = (p: Place): Repo | undefined => (p.kind === "repo" && p.baseBranch && !p.baseBranch.startsWith("-") ? p : undefined);

/** Where the task's branch left its base (the base itself when it can't tell). */
async function mergeBase(root: string, base: string): Promise<string> {
  const mb = await git(root, ["merge-base", base, "HEAD"]);
  return mb.ok && mb.out ? mb.out : base;
}

/** `git diff --numstat -z` and `--name-status -z` against the base, plus untracked files. */
export async function repoChanges(root: string, base: string): Promise<{ files: WbChange[]; more: number }> {
  const mb = await mergeBase(root, base);
  const [ns, st, un] = await Promise.all([
    git(root, ["diff", "--numstat", "-M", "-z", mb, "--"]),
    git(root, ["diff", "--name-status", "-M", "-z", mb, "--"]),
    git(root, ["ls-files", "--others", "--exclude-standard", "-z"]),
  ]);
  const files = new Map<string, WbChange>();
  if (st.ok) {
    const parts = st.out.split("\0").filter((s) => s !== "");
    for (let i = 0; i < parts.length; ) {
      const code = parts[i++]!;
      if (code.startsWith("R") || code.startsWith("C")) {
        const from = parts[i++]!, to = parts[i++]!;
        files.set(to, { path: to, from, status: "renamed" });
      } else {
        const p = parts[i++]!;
        files.set(p, { path: p, status: code === "A" ? "added" : code === "D" ? "deleted" : "modified" });
      }
    }
  }
  if (ns.ok) {
    // "adds\tdels\tpath\0" or, for a rename, "adds\tdels\t\0from\0to\0".
    const parts = ns.out.split("\0");
    for (let i = 0; i < parts.length; i++) {
      const m = /^(-|\d+)\t(-|\d+)\t(.*)$/s.exec(parts[i]!.replace(/^\n/, ""));
      if (!m) continue;
      let p = m[3]!;
      if (!p) {
        i += 2;
        p = parts[i]!;
      }
      const f = files.get(p);
      if (!f) continue;
      if (m[1] === "-") f.binary = true;
      else (f.adds = Number(m[1])), (f.dels = Number(m[2]));
    }
  }
  if (un.ok)
    for (const p of un.out.split("\0").filter(Boolean)) {
      if (files.has(p)) continue;
      let adds: number | undefined;
      let binary: boolean | undefined;
      try {
        const st = statSync(join(root, p));
        if (st.size <= WB_READ_CAP) {
          const t = textOf(readFileSync(join(root, p)));
          if (t === undefined) binary = true;
          else adds = t ? t.split("\n").length - (t.endsWith("\n") ? 1 : 0) : 0;
        }
      } catch {}
      files.set(p, { path: p, status: "added", ...(adds != null ? { adds, dels: 0 } : {}), ...(binary ? { binary } : {}) });
    }
  const all = [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
  return { files: all.slice(0, WB_CHANGES_CAP), more: Math.max(0, all.length - WB_CHANGES_CAP) };
}

/** git diff between two paths outside any repo (a folder against its copy); "" when git can't. */
async function noIndex(a: string, b: string, args: string[] = []): Promise<string> {
  const r = await git(process.cwd(), ["diff", "--no-index", "--no-color", ...args, "--", a, b]);
  return r.out; // exit 1 means "they differ"
}

/** Line counts of one folder entry against its copy (git's numstat), or undefined. */
async function folderStat(copy: string, root: string, rel: string, status: WbChange["status"]): Promise<{ adds?: number; dels?: number; binary?: boolean }> {
  const a = status === "added" ? "/dev/null" : join(copy, rel);
  const b = status === "deleted" ? "/dev/null" : join(root, rel);
  const out = await noIndex(a, b, ["--numstat"]);
  const m = /^(-|\d+)\t(-|\d+)\t/.exec(out);
  if (!m) return {};
  return m[1] === "-" ? { binary: true } : { adds: Number(m[1]), dels: Number(m[2]) };
}

/** A unified diff of one file against its base, the headers naming it by its path in the task. */
export async function fileDiff(ctx: WbCtx, path: string): Promise<WbAnswer> {
  const clean = cleanRel(path);
  if (!clean) throw new WbFail("outside");
  const root = rootOf(ctx);
  // Gone files are allowed: their folder must still be inside.
  confine(ctx, clean, { mayBeMissing: true });
  let patch = "";
  const repo = asRepo(ctx.place);
  if (repo) {
    const mb = await mergeBase(root, repo.baseBranch!);
    const tracked = await git(root, ["diff", "--no-color", "-M", mb, "--", clean]);
    patch = tracked.out;
    if (!patch) {
      const untracked = await git(root, ["ls-files", "--others", "--exclude-standard", "--", clean]);
      if (untracked.ok && untracked.out) patch = await noIndex("/dev/null", join(root, clean));
    }
  } else if (ctx.copy) {
    const inCopy = existsSync(join(ctx.copy, clean)), inRoot = existsSync(join(root, clean));
    patch = await noIndex(inCopy ? join(ctx.copy, clean) : "/dev/null", inRoot ? join(root, clean) : "/dev/null");
  } else throw new WbFail("unsupported");
  // The headers name the copy's and the folder's absolute paths: name the file instead.
  patch = patch.replace(/^(diff --git ).*$/m, `$1a/${clean} b/${clean}`).replace(/^--- (?!\/dev\/null).*$/m, `--- a/${clean}`).replace(/^\+\+\+ (?!\/dev\/null).*$/m, `+++ b/${clean}`);
  const binary = /^Binary files /m.test(patch);
  const truncated = patch.length > WB_DIFF_CAP;
  return { op: "diff", path: clean, patch: truncated ? patch.slice(0, WB_DIFF_CAP) : patch, ...(binary ? { binary } : {}), ...(truncated ? { truncated } : {}) };
}

export async function changesOf(ctx: WbCtx, folder?: () => Promise<{ files: { kind: string; path: string; from?: string; dir?: boolean }[]; more: number } | undefined>): Promise<WbAnswer> {
  const repo = asRepo(ctx.place);
  if (repo) {
    const root = rootOf(ctx);
    const c = await repoChanges(root, repo.baseBranch!);
    return { op: "changes", kind: "repo", base: repo.baseBranch!, ...c };
  }
  if (ctx.place.kind === "folder" && folder && ctx.copy) {
    const root = rootOf(ctx);
    const f = await folder();
    if (!f) return { op: "changes", kind: "folder", files: [], more: 0 };
    const files: WbChange[] = [];
    for (const x of f.files) {
      if (x.dir) continue;
      const status: WbChange["status"] = x.kind === "added" ? "added" : x.kind === "removed" ? "deleted" : x.kind === "moved" ? "renamed" : "modified";
      const stat = files.length < 200 && status !== "renamed" ? await folderStat(ctx.copy, root, x.path, status) : {};
      files.push({ path: x.path, status, ...(x.from ? { from: x.from } : {}), ...stat });
    }
    return { op: "changes", kind: "folder", files, more: f.more };
  }
  return { op: "changes", kind: "none", files: [], more: 0 };
}

/** Puts one file of a repo task back as its base has it (a file the task added is removed). */
async function revertRepo(ctx: WbCtx, path: string): Promise<WbAnswer> {
  const repo = asRepo(ctx.place);
  if (!repo) throw new WbFail("unsupported");
  const { root, rel } = confine(ctx, path, { mayBeMissing: true });
  const mb = await mergeBase(root, repo.baseBranch!);
  const there = await git(root, ["cat-file", "-e", `${mb}:${rel}`]);
  if (there.ok) {
    const r = await git(root, ["restore", `--source=${mb}`, "--worktree", "--", rel]);
    if (!r.ok) throw new WbFail("failed", r.err.split("\n")[0]);
    return { op: "revert", path: rel, message: "restored" };
  }
  const abs = join(root, rel);
  if (existsSync(abs)) unlinkSync(abs);
  // Committed on the branch: it stays in the index until the agent commits again; say it as removed.
  return { op: "revert", path: rel, message: "removed" };
}

// ---------- pages the task serves ----------

async function run(cmd: string[], ms = 3000): Promise<string> {
  try {
    const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "ignore", stdin: "ignore" });
    const timer = setTimeout(() => p.kill(), ms);
    const out = await new Response(p.stdout).text();
    clearTimeout(timer);
    await p.exited;
    return out;
  } catch {
    return "";
  }
}

/** Listening TCP ports with the pid and command that hold them (lsof on macOS and Linux). */
export function parseLsofListen(out: string): { pid: number; command: string; port: number }[] {
  const res: { pid: number; command: string; port: number }[] = [];
  let pid = 0, command = "";
  for (const line of out.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    else if (line.startsWith("c")) command = line.slice(1);
    else if (line.startsWith("n")) {
      const m = /:(\d+)$/.exec(line);
      if (m && pid) {
        const port = Number(m[1]);
        if (!res.some((r) => r.pid === pid && r.port === port)) res.push({ pid, command, port });
      }
    }
  }
  return res;
}

/** The working folder of each pid (lsof's cwd file descriptor, or /proc on Linux). */
async function cwds(pids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!pids.length) return out;
  if (process.platform === "linux") {
    const { readlinkSync } = await import("node:fs");
    for (const p of pids)
      try {
        out.set(p, readlinkSync(`/proc/${p}/cwd`));
      } catch {}
    if (out.size) return out;
  }
  const text = await run(["lsof", "-a", "-p", pids.join(","), "-d", "cwd", "-Fn"]);
  let pid = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    else if (line.startsWith("n") && pid) out.set(pid, line.slice(1));
  }
  return out;
}

/** Linux without lsof: LISTEN sockets from /proc/net/tcp{,6}, matched to pids by their fds. */
async function procListen(): Promise<{ pid: number; command: string; port: number }[]> {
  if (process.platform !== "linux") return [];
  const { readdirSync: rd, readlinkSync, readFileSync: rf } = await import("node:fs");
  const inodes = new Map<string, number>();
  for (const f of ["/proc/net/tcp", "/proc/net/tcp6"])
    try {
      for (const line of rf(f, "utf8").split("\n").slice(1)) {
        const c = line.trim().split(/\s+/);
        if (c[3] === "0A") inodes.set(c[9]!, parseInt(c[1]!.split(":")[1]!, 16));
      }
    } catch {}
  if (!inodes.size) return [];
  const res: { pid: number; command: string; port: number }[] = [];
  for (const d of rd("/proc")) {
    if (!/^\d+$/.test(d)) continue;
    let fds: string[] = [];
    try {
      fds = rd(`/proc/${d}/fd`);
    } catch {
      continue;
    }
    for (const fd of fds) {
      let l = "";
      try {
        l = readlinkSync(`/proc/${d}/fd/${fd}`);
      } catch {
        continue;
      }
      const m = /^socket:\[(\d+)\]$/.exec(l);
      const port = m ? inodes.get(m[1]!) : undefined;
      if (port) {
        let command = "";
        try {
          command = rf(`/proc/${d}/comm`, "utf8").trim();
        } catch {}
        if (!res.some((r) => r.port === port)) res.push({ pid: Number(d), command, port });
      }
    }
  }
  return res;
}

/** The page's <title>, if it answers as a web page on this computer within a second and a half. */
export async function probePage(port: number, ms = 1500): Promise<{ ok: boolean; title?: string; host?: string }> {
  for (const host of ["127.0.0.1", "[::1]"]) {
    try {
      const r = await fetch(`http://${host}:${port}/`, { signal: AbortSignal.timeout(ms), redirect: "manual", headers: { accept: "text/html,*/*" } });
      let title: string | undefined;
      if ((r.headers.get("content-type") ?? "").includes("html")) {
        const html = (await r.text()).slice(0, 65536);
        title = /<title[^>]*>([^<]{1,120})<\/title>/i.exec(html)?.[1]?.trim() || undefined;
      } else await r.body?.cancel();
      return { ok: true, ...(title ? { title } : {}), host };
    } catch {}
  }
  return { ok: false };
}

export async function portsOf(ctx: WbCtx): Promise<WbAnswer> {
  const root = rootOf(ctx);
  const exclude = new Set(ctx.exclude ?? []);
  let listening = parseLsofListen(await run(["lsof", "-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn"]));
  if (!listening.length) listening = await procListen();
  const dirs = await cwds([...new Set(listening.map((l) => l.pid))]);
  const mine = listening.filter((l) => {
    const d = dirs.get(l.pid);
    const rd = d ? (real(d) ?? d) : undefined;
    return !!rd && within(root, rd);
  });
  const found: WbPort[] = [];
  const add = async (port: number, via: WbPort["via"], command?: string) => {
    if (exclude.has(port) || found.some((f) => f.port === port) || port < 1024) return;
    const p = await probePage(port);
    if (p.ok) found.push({ port, via, ...(command ? { command } : {}), ...(p.title ? { title: p.title } : {}) });
  };
  for (const l of mine) await add(l.port, "listening", l.command);
  // A port the task named that some process of its own holds, or that it said and answers.
  for (const p of ctx.said ?? []) await add(p, "said", listening.find((l) => l.port === p)?.command);
  return { op: "ports", ports: found.slice(0, 8) };
}

/** Whether a port is one of this task's pages (the proxy serves only those). */
export async function isTaskPort(ctx: WbCtx, port: number): Promise<boolean> {
  const a = (await portsOf(ctx)) as Extract<WbAnswer, { op: "ports" }>;
  return a.ports.some((p) => p.port === port);
}

/** One workbench op on this computer. folder(): D142's list for a folder task; undo(): its per-file undo. */
export async function wbOp(
  ctx: WbCtx,
  req: WbRequest,
  o: {
    folder?: () => Promise<{ files: { kind: string; path: string; from?: string; dir?: boolean }[]; more: number } | undefined>;
    undo?: (path: string) => Promise<{ ok: boolean; message: string }>;
    sims?: Sims;
  } = {},
): Promise<WbAnswer> {
  switch (req?.op) {
    case "files":
      return list(ctx, req.path ?? "");
    case "read":
      return read(ctx, req.path);
    case "write":
      return write(ctx, req.path, req.text, req.base);
    case "changes":
      return changesOf(ctx, o.folder);
    case "diff":
      return fileDiff(ctx, req.path);
    case "revert": {
      if (ctx.place.kind === "folder") {
        const clean = cleanRel(req.path);
        if (!clean || !o.undo) throw new WbFail(clean ? "unsupported" : "outside");
        const r = await o.undo(clean);
        if (!r.ok) throw new WbFail("failed", r.message);
        return { op: "revert", path: clean, message: r.message };
      }
      return revertRepo(ctx, req.path);
    }
    case "ports":
      return portsOf(ctx);
    // D220: simulators are this task's business only when it touched one or holds an iOS app.
    case "sims": {
      const sims = o.sims ?? defaultSims();
      if (!(await sims.booted()).length) return { op: "sims", sims: [] };
      let app = false;
      try {
        app = holdsApp(rootOf(ctx));
      } catch {}
      return { op: "sims", sims: ctx.simSaid || app ? await sims.list() : [] };
    }
    case "sim_frame":
      return (o.sims ?? defaultSims()).frame(req.udid, req.edge);
    case "sim_act":
      return (o.sims ?? defaultSims()).act(req.udid, req.act, req.value);
    default:
      throw new WbFail("unsupported");
  }
}

/** A refusal as it goes over the wire. */
export const wbErrorOf = (e: unknown): { error: WbError; message?: string } =>
  e instanceof WbFail ? { error: e.code, ...(e.message !== e.code ? { message: e.message } : {}) } : (e as { code?: string })?.code === "ENOENT" ? { error: "missing" } : { error: "failed", message: String((e as Error)?.message ?? e).slice(0, 200) };

// ---------- the ops as a computer serves them ----------

/** One workbench call as the runner (or the home, through a worker) makes it. */
export interface WbCall {
  taskId: string;
  cwd: string;
  place: Place;
  req: WbRequest;
  said?: number[];
  exclude?: number[];
  simSaid?: boolean;
}

/** A request for a task's page, carried to the computer it runs on (a worker's preview). */
export interface WbFetch {
  taskId: string;
  port: number;
  method: string;
  path: string;
  headers: [string, string][];
  /** base64 */
  body?: string;
}
export interface WbFetched {
  status: number;
  headers: [string, string][];
  /** base64 */
  body: string;
}

/** A page answer carried back is capped (a worker's preview is for looking, not for downloads). */
export const WB_FETCH_CAP = 16 * 1024 * 1024;

type FolderLike = {
  changes(taskId: string, opts?: { files?: boolean }): Promise<{ files: { kind: string; path: string; from?: string; dir?: boolean }[]; more: number } | undefined>;
  undo(taskId: string, opts?: { path?: string }): Promise<{ ok: boolean; message: string }>;
};

/** The workbench as this computer serves it: its ops, and the pages of its tasks for a preview. */
export function wbHost(o: { dataDir: string; folders: FolderLike }) {
  /** Ports found to be a task's pages, so a page request goes only to those. */
  const pages = new Map<string, Set<number>>();
  const ctxOf = (a: WbCall): WbCtx => {
    const copy = join(o.dataDir, "snapshots", a.taskId.replace(/[^\w-]/g, "_"), "copy");
    return { taskId: a.taskId, cwd: a.cwd, place: a.place, dataDir: o.dataDir, ...(existsSync(copy) ? { copy } : {}), ...(a.exclude ? { exclude: a.exclude } : {}), ...(a.said ? { said: a.said } : {}), ...(a.simSaid ? { simSaid: true } : {}) };
  };
  return {
    async op(a: WbCall): Promise<WbAnswer> {
      const r = await wbOp(ctxOf(a), a.req, { folder: () => o.folders.changes(a.taskId, { files: true }), undo: (path) => o.folders.undo(a.taskId, { path }) });
      if (r.op === "ports") pages.set(a.taskId, new Set(r.ports.map((p) => p.port)));
      return r;
    },
    /** Whether a port was found to be this task's page here. */
    isPage: (taskId: string, port: number) => !!pages.get(taskId)?.has(port),
    /** A page request for a task's port on this computer (only one its ports op found). */
    async fetch(a: WbFetch): Promise<WbFetched> {
      if (!pages.get(a.taskId)?.has(a.port)) throw new WbFail("outside");
      if (typeof a.path !== "string" || !a.path.startsWith("/")) throw new WbFail("outside");
      const h = await probeHost(a.port);
      const headers = new Headers(a.headers);
      headers.set("host", `localhost:${a.port}`);
      const r = await fetch(`http://${h}:${a.port}${a.path}`, {
        method: a.method,
        headers,
        redirect: "manual",
        ...(a.body && a.method !== "GET" && a.method !== "HEAD" ? { body: Buffer.from(a.body, "base64") } : {}),
        signal: AbortSignal.timeout(60_000),
      });
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.length > WB_FETCH_CAP) throw new WbFail("too_big");
      const out: [string, string][] = [];
      r.headers.forEach((v, k) => out.push([k, v]));
      return { status: r.status, headers: out, body: Buffer.from(buf).toString("base64") };
    },
  };
}

const hostOfPort = new Map<number, string>();
/** Which loopback address a port answers on (127.0.0.1 or [::1]), remembered once it answered. */
export async function probeHost(port: number): Promise<string> {
  const known = hostOfPort.get(port);
  if (known) return known;
  const p = await probePage(port, 1500);
  if (!p.host) return "127.0.0.1";
  hostOfPort.set(port, p.host);
  return p.host;
}
