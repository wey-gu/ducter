// 从 Git 地址加… / Add from a Git address… (D204): the computer the user chose clones a repo into
// its Ducter folder, `<Ducter folder>/projects/<repo>`, with that computer's own git sign-in.
// The home runs it for itself; a worker answers the home's `clone` op (runner/src/worker-host.ts).
//
// Safety: the address is the only thing that comes from a client, and it is checked strictly
// before git sees it (`parseGitAddress`): https, ssh:// and scp-like `user@host:path` only, or a
// GitHub `owner/repo`; no `ext::`, `file://`, local paths, options, credentials, spaces or control
// characters. git gets it after `--`, with no other argument from the client, only https and ssh
// allowed (GIT_ALLOW_PROTOCOL, which also covers redirects), never a prompt
// (GIT_TERMINAL_PROMPT=0, ssh in batch mode), and a time limit.
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ensureDucterFolder, type DucterFolderOpts } from "./ducter-folder.ts";
import { normalizeRemote } from "./folder-info.ts";
import { defaultBranchOf, originOf, realFs, type FsLike } from "./repos.ts";
import { ghEnv } from "./tool-env.ts";

/** D204: how long a clone may take before it is stopped. */
export const CLONE_TIMEOUT_MS = 10 * 60_000;

export type GitAddress = { ok: true; url: string; name: string; remote: string } | { ok: false; message: string };

const HOST = String.raw`[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*`;
const SEG = String.raw`[A-Za-z0-9_~][A-Za-z0-9._~-]*`;
const PATH = String.raw`${SEG}(?:/${SEG})*`;
const USER = String.raw`[A-Za-z0-9_][A-Za-z0-9._-]*`;
const FORMS: { re: RegExp; url: (m: RegExpExecArray) => string }[] = [
  // https://host[:port]/owner/repo(.git)
  { re: new RegExp(String.raw`^https://(${HOST})(?::(\d{1,5}))?/(${PATH})/?$`), url: (m) => m[0]!.replace(/\/$/, "") },
  // ssh://[user@]host[:port]/owner/repo(.git)
  { re: new RegExp(String.raw`^ssh://(?:(${USER})@)?(${HOST})(?::(\d{1,5}))?/(${PATH})/?$`), url: (m) => m[0]!.replace(/\/$/, "") },
  // user@host:owner/repo(.git) (scp-like; a user is required so it never reads as a local path)
  { re: new RegExp(String.raw`^(${USER})@(${HOST}):(${PATH})/?$`), url: (m) => m[0]!.replace(/\/$/, "") },
  // host/owner/repo with no scheme (github.com/owner/repo, as a browser's address bar shows it): https
  { re: new RegExp(String.raw`^(${HOST}\.[A-Za-z]{2,})/(${PATH})/?$`), url: (m) => `https://${m[0]!.replace(/\/$/, "")}` },
  // owner/repo: GitHub (its own rules for an owner's name)
  { re: /^([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]+)$/, url: (m) => `https://github.com/${m[1]}/${m[2]!.replace(/\.git$/i, "")}.git` },
];

const BAD = "That doesn't look like a Git address: use https://…, ssh://…, git@host:owner/repo or owner/repo.";

/** D204: a Git address as a client typed it, checked; the URL git gets and the folder's name. */
export function parseGitAddress(raw: unknown): GitAddress {
  const s = typeof raw === "string" ? raw.trim() : "";
  // One line, printable ASCII, no spaces; nothing git could read as an option or a transport.
  if (!s || s.length > 300 || !/^[\x21-\x7e]+$/.test(s) || s.startsWith("-") || s.includes("::") || s.includes("..")) return { ok: false, message: BAD };
  for (const f of FORMS) {
    const m = f.re.exec(s);
    if (!m) continue;
    const url = f.url(m);
    const last = url.split(/[/:]/).pop()!.replace(/\.git$/i, "");
    // A path needs an owner and a repo (host/owner/repo at least), and the repo a name of its own.
    if (!last || last.startsWith(".") || normalizeRemote(url).split("/").length < 3) return { ok: false, message: BAD };
    return { ok: true, url, name: last, remote: normalizeRemote(url) };
  }
  return { ok: false, message: BAD };
}

/** Why a clone failed, in a word the clients put in their own language. */
export type CloneReason = "invalid" | "not_found" | "no_access" | "network" | "timeout" | "failed";

export type CloneResult =
  | { ok: true; path: string; name: string; remote: string; defaultBranch?: string; existed?: true }
  | { ok: false; reason: CloneReason; message: string };

/** Runs `git <args>`; resolves with its exit code and stderr. Injected in tests (no network there). */
export type GitSpawn = (args: string[], o: { env: Record<string, string>; timeoutMs: number }) => Promise<{ code: number; err: string; timedOut?: boolean }>;

export const realGitSpawn: GitSpawn = async (args, o) => {
  const p = Bun.spawn(["git", ...args], { env: o.env, stdout: "ignore", stderr: "pipe", stdin: "ignore" });
  let timedOut = false;
  const timer = setTimeout(() => ((timedOut = true), p.kill()), o.timeoutMs);
  try {
    const [err, code] = await Promise.all([new Response(p.stderr).text(), p.exited]);
    return { code, err: err.slice(-4000), ...(timedOut ? { timedOut } : {}) };
  } finally {
    clearTimeout(timer);
  }
};

/** git's words for a failed clone, sorted. */
export function cloneReason(err: string): CloneReason {
  const e = err.toLowerCase();
  if (/could not resolve host|could not resolve hostname|network is unreachable|failed to connect|connection (timed out|refused)|operation timed out|no route to host|temporary failure in name resolution/.test(e)) return "network";
  if (/repository not found|not found|does not exist|does not appear to be a git repository|404/.test(e)) return "not_found";
  if (/authentication failed|permission denied|could not read username|could not read password|terminal prompts disabled|host key verification failed|403|access denied|publickey/.test(e)) return "no_access";
  return "failed";
}

const inflight = new Set<string>();

export interface CloneDeps extends DucterFolderOpts {
  spawn?: GitSpawn;
  repoFs?: FsLike;
  timeoutMs?: number;
}

/**
 * D204: clone `address` into this computer's `<Ducter folder>/projects/<repo>`. The same origin
 * already there is simply that project (`existed`); a folder of that name holding something else
 * makes it `<repo>-2`, `-3`. A failed or stopped clone leaves nothing behind.
 */
export async function cloneRepo(address: unknown, d: CloneDeps = {}): Promise<CloneResult> {
  const a = parseGitAddress(address);
  if (!a.ok) return { ok: false, reason: "invalid", message: a.message };
  const fs = d.repoFs ?? realFs;
  const folder = ensureDucterFolder(d);
  const projects = join(folder, "projects");
  let target = "";
  for (let n = 1; n < 100; n++) {
    const p = join(projects, n === 1 ? a.name : `${a.name}-${n}`);
    if (inflight.has(p)) continue;
    if (!existsSync(p)) {
      target = p;
      break;
    }
    if (originOf(fs.readText?.(join(p, ".git", "config"))) === a.remote) {
      const def = defaultBranchOf(join(p, ".git"), fs);
      return { ok: true, path: p, name: a.name, remote: a.remote, existed: true, ...(def ? { defaultBranch: def } : {}) };
    }
  }
  if (!target) return { ok: false, reason: "failed", message: `There are too many folders named ${a.name} in ${projects}.` };
  inflight.add(target);
  try {
    const env: Record<string, string> = {
      ...ghEnv(d.env),
      GIT_TERMINAL_PROMPT: "0",
      GIT_ALLOW_PROTOCOL: "https:ssh",
      // ssh never asks either (a passphrase, an unknown host); the user's own GIT_SSH_COMMAND stays.
      ...((d.env ?? process.env).GIT_SSH_COMMAND ? {} : { GIT_SSH_COMMAND: "ssh -o BatchMode=yes" }),
    };
    const r = await (d.spawn ?? realGitSpawn)(["clone", "--", a.url, target], { env, timeoutMs: d.timeoutMs ?? CLONE_TIMEOUT_MS });
    if (r.code !== 0 || r.timedOut) {
      try {
        rmSync(target, { recursive: true, force: true }); // only ever the folder this clone made
      } catch {}
      if (r.timedOut) return { ok: false, reason: "timeout", message: `Cloning took longer than ${Math.round((d.timeoutMs ?? CLONE_TIMEOUT_MS) / 60_000)} minutes and was stopped.` };
      const lines = r.err.split("\n").map((l) => l.trim()).filter(Boolean);
      const line = (lines.find((l) => /^(fatal|error):/i.test(l)) ?? lines.pop() ?? "git clone failed").replace(/^(fatal|error|remote):\s*/i, "");
      return { ok: false, reason: cloneReason(r.err), message: line };
    }
    const def = defaultBranchOf(join(target, ".git"), fs);
    return { ok: true, path: target, name: a.name, remote: a.remote, ...(def ? { defaultBranch: def } : {}) };
  } finally {
    inflight.delete(target);
  }
}
