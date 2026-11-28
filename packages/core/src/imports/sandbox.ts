// D668 (research/246 §3.3, §3.7, §3.9): the OS sandbox a plugin reader runs in.
//
// The manifest declares what the reader may read (`reads`, globs allowed) and which programs it
// may start (`starts`). This module turns that into the platform's own confinement, never into a
// promise:
//
//   macOS  sandbox-exec with a generated Seatbelt profile: deny default, read the plugin folder,
//          Ducter's own Bun and the system libraries plus each declared path, write only the
//          temporary folder Ducter gives it, deny network, and allow exec only for the programs
//          the manifest names.
//   Linux  bubblewrap: --unshare-net, a read-only bind per declared path, a tmpfs /tmp, no
//          capabilities, die with parent.
//
// Where neither is available the plugin is refused with `sandbox_unavailable`; it is never run
// unconfined (research/246 rule 4, principle 18). The profile is generated for the declaration; a
// glob is granted at its static prefix (Seatbelt and bwrap have no glob rules), which is the
// narrowest directory the declaration names.
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { whichNow } from "@ducter/protocol/src/which.ts";

export type SandboxPlatform = "darwin" | "linux";
export type SandboxError = "sandbox_unavailable" | "plugin_failed";

/**
 * A command the manifest declares, resolved for this run (D670). The reader may start this
 * exact program; its package/install folder is readable so it can load, and a script's own
 * interpreter is allowed too (an npm-installed CLI is a `node` script under a shebang).
 */
export interface PluginUseRun {
  command: string;
  /** What PATH resolution or the declared path found. */
  path: string;
  real: string;
  /** The package folder to read: the nearest package.json above the program, else its folder. */
  installDir: string;
  interpreter?: string;
  interpreterDir?: string;
  online: boolean;
}

export interface PluginRun {
  id: string;
  /** The checked-out plugin folder; it is always readable. */
  dir: string;
  /** Executable and arguments, already resolved (Ducter's own Bun for a `bun` command). */
  argv: string[];
  /** Declared paths, as the manifest wrote them. */
  reads: string[];
  /** Declared extra programs, resolved. */
  starts: string[];
  /** Declared commands (`uses`), resolved. */
  uses?: PluginUseRun[];
  /** Outbound network for this run only: true when a declared use is online. */
  network?: boolean;
  /** The one folder the reader may write. */
  tempDir: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  /** The home the `~` in a declaration means; default this process's. */
  home?: string;
}

export interface SandboxResult {
  code: number;
  stdout: string;
  stderr: string;
  /** The OS error's code when the sandbox could not start at all. */
  spawnError?: string;
  /** `sandbox_unavailable` when the host refused to apply a profile, never the plugin's fault. */
  error?: SandboxError;
}

export interface SandboxPlan {
  platform: SandboxPlatform;
  command: string;
  args: string[];
  /** The Seatbelt profile text (macOS only), kept so it can be shown and tested as text. */
  profile?: string;
}

export interface SandboxAvailability {
  ok: boolean;
  /** Why it can't run here, in the CLI's words (never shown on a row unread). */
  reason?: "no_seatbelt" | "no_bwrap" | "unsupported_platform";
}

/** Apple's deprecated-but-shipping sandbox launcher. */
export const SEATBELT = "/usr/bin/sandbox-exec";
export const BWRAP = "bwrap";

export function sandboxAvailable(platform: NodeJS.Platform = process.platform, path = process.env.PATH ?? ""): SandboxAvailability {
  if (platform === "darwin") return existsSync(SEATBELT) ? { ok: true } : { ok: false, reason: "no_seatbelt" };
  if (platform === "linux") return whichNow(BWRAP, { PATH: path }) ? { ok: true } : { ok: false, reason: "no_bwrap" };
  return { ok: false, reason: "unsupported_platform" };
}

/** The executable a bare `bun` means in a manifest: Ducter's own, never the person's PATH. */
export function pluginArgv(command: string[], o: { dir: string; bunPath?: string; path?: string }): string[] {
  const [first, ...rest] = command;
  if (!first) return [];
  let exe: string;
  if (first === "bun") exe = o.bunPath ?? process.execPath;
  else if (first.includes("/")) exe = first;
  else exe = whichNow(first, { PATH: o.path ?? process.env.PATH ?? "" }) ?? first;
  return [exe, ...rest];
}

/** The nearest package folder above a program: its dependencies live there, not in /usr/bin. */
function installRoot(file: string): string {
  const home = (process.env.HOME ?? "").replace(/\/+$/, "");
  let d = dirname(file);
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(d, "package.json"))) return d;
    const up = dirname(d);
    if (up === d || d === "/" || (home && d === home)) break;
    d = up;
  }
  return dirname(file);
}

/** `#!/bin/sh` or `#!/usr/bin/env node`: the program the kernel will also execute. */
function shebangOf(file: string): string | undefined {
  try {
    const head = readFileSync(file, { encoding: "latin1", flag: "r" }).slice(0, 256);
    if (!head.startsWith("#!")) return undefined;
    const line = head.slice(2).split(/\r?\n/)[0]!.trim();
    if (!line) return undefined;
    const parts = line.split(/\s+/).filter(Boolean);
    if (/\/env$/.test(parts[0] ?? "")) {
      let i = 1;
      if (parts[i] === "-S") i++;
      return parts[i];
    }
    return parts[0];
  } catch {
    return undefined;
  }
}

/**
 * Resolves one `uses` command for one run: a bare name through PATH, a path relative to the
 * plugin. Undefined means the command isn't on this computer, and the host refuses the run
 * before the sandbox (the consent card promised that command).
 */
export function resolveUse(command: string, o: { dir: string; path?: string }): PluginUseRun | undefined {
  const raw = command.trim();
  if (!raw) return undefined;
  let found: string | undefined;
  if (raw.includes("/")) {
    const p = isAbsolute(raw) ? raw : resolve(o.dir, raw);
    if (existsSync(p)) found = p;
  } else {
    found = whichNow(raw, { PATH: o.path ?? process.env.PATH ?? "" }) ?? undefined;
  }
  if (!found) return undefined;
  let real: string;
  try {
    real = realpathSync(found);
  } catch {
    real = found;
  }
  const shebang = shebangOf(real);
  let interpreter: string | undefined;
  let interpreterDir: string | undefined;
  if (shebang) {
    const exe = shebang.startsWith("/") ? shebang : whichNow(shebang, { PATH: o.path ?? process.env.PATH ?? "" });
    if (exe && existsSync(exe)) {
      try {
        interpreter = realpathSync(exe);
      } catch {
        interpreter = exe;
      }
      interpreterDir = installRoot(interpreter);
    }
  }
  return { command: raw, path: found, real, installDir: installRoot(real), online: false, ...(interpreter ? { interpreter } : {}), ...(interpreterDir ? { interpreterDir } : {}) };
}

function quote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * A declaration as an absolute path. `~` is this computer's home; a relative path is under the
 * plugin folder. `..` inside a declaration is refused: a path is literal or it isn't a declaration.
 */
export function expandDeclaredPath(declared: string, o: { dir: string; home: string }): string {
  const raw = declared.trim();
  if (!raw) throw new Error("an empty read path");
  if (raw.includes("\0")) throw new Error("a NUL in a read path");
  const parts = raw.split(/[\\/]/);
  if (parts.includes("..")) throw new Error(".. is not allowed in a read path");
  if (raw === "~") return o.home;
  if (raw.startsWith("~/")) return normalize(join(o.home, raw.slice(2)));
  if (raw.startsWith("~")) throw new Error("only ~/ is allowed, not another user's home");
  return isAbsolute(raw) ? normalize(raw) : resolve(o.dir, raw);
}

/**
 * The static prefix of a declared path: everything before its first glob character, cut back to a
 * directory. `~/Library/Notes/**\/*.sqlite*` becomes `~/Library/Notes`.
 */
export function declaredRoot(abs: string): { path: string; glob: boolean } {
  const at = abs.search(/[*?[\]{}]/);
  if (at < 0) return { path: abs, glob: false };
  let cut = abs.slice(0, at);
  if (!cut.endsWith("/")) cut = cut.slice(0, cut.lastIndexOf("/"));
  return { path: cut.replace(/\/+$/, "") || "/", glob: true };
}

function canStat(p: string): boolean {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

/** Seatbelt's rules for one declared path: a file is a literal, a directory or glob is a subpath. */
/**
 * The path Seatbelt sees: it matches resolved paths, so a path through a symlink (macOS's own
 * /var -> /private/var, a linked home folder) would be denied by name. The nearest existing
 * ancestor is resolved and the rest kept, so a declared path that doesn't exist yet still maps.
 */
export function seatbeltPath(p: string): string {
  let head = p;
  const tail: string[] = [];
  while (head && head !== dirname(head)) {
    try {
      const r = realpathSync(head);
      return tail.length ? join(r, ...tail.reverse()) : r;
    } catch {
      tail.push(basename(head));
      head = dirname(head);
    }
  }
  return p;
}

function readRules(abs: string): string[] {
  const resolved = seatbeltPath(abs);
  return [...new Set([...readRulesAt(abs), ...(resolved !== abs ? readRulesAt(resolved) : [])])];
}

function readRulesAt(abs: string): string[] {
  const root = declaredRoot(abs);
  if (!root.glob && canStat(root.path)) {
    try {
      return statSync(root.path).isDirectory() ? [`(subpath ${quote(root.path)})`] : [`(literal ${quote(root.path)})`];
    } catch {
      /* fall through to a literal */
    }
  }
  return root.glob ? [`(subpath ${quote(root.path)})`] : [`(literal ${quote(root.path)})`];
}

/** A Seatbelt profile for one run: the whole boundary, in text. */
export function seatbeltProfile(run: PluginRun, o: { bunPath?: string } = {}): string {
  const home = run.home ?? process.env.HOME ?? tmpdir();
  const reads = run.reads
    .map((r) => expandDeclaredPath(r, { dir: run.dir, home }))
    .flatMap(readRules);
  const temp = normalize(run.tempDir);
  const uses = run.uses ?? [];
  const execs = [
    ...new Set(
      [run.argv[0], o.bunPath, ...run.starts, ...uses.flatMap((u) => [u.path, u.real, u.interpreter])].filter((x): x is string => !!x),
    ),
  ];
  // macOS's /bin/sh is a shim that execs its variant (/private/var/select/sh -> bash, zsh or dash):
  // allowing /bin/sh alone denies every #!/bin/sh script ("Failed to exec /bin/bash as variant").
  if (execs.includes("/bin/sh")) {
    for (const v of ["/private/var/select/sh", "/bin/bash"]) {
      try {
        const r = realpathSync(v);
        if (!execs.includes(r)) execs.push(r);
      } catch {
        /* not on this system */
      }
    }
  }
  const online = run.network === true || uses.some((u) => u.online);
  // The program's package folder and its interpreter's folder are readable so it can load; its
  // own declared read paths are still the only data it can reach.
  const useDirs = uses.flatMap((u) => [u.installDir, u.interpreterDir]).filter((x): x is string => !!x);
  const real = (p: string) => {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  };
  const bunDirs = [...new Set([...execs.map((e) => real(e)).map(dirname), ...useDirs])];
  return [
    "(version 1)",
    "(deny default)",
    "(allow process-fork)",
    `(allow process-exec ${execs.map((e) => `(literal ${quote(real(e))})`).join(" ")})`,
    "(allow signal (target self))",
    "(allow sysctl-read)",
    "(allow file-read-metadata)",
    "(allow mach-lookup (global-name \"com.apple.system.logger\"))",
    "(allow ipc-posix-shm)",
    // The root directory entry itself (not what is under it): Bun's startup reads it and aborts
    // (SIGABRT) without it. Found by running the fixture under this profile on a Mac, 2026-11-28.
    '(allow file-read* (literal "/"))',
    // The plugin's own folder, its temporary folder, and the runtime it runs on.
    ...[...new Set([normalize(run.dir), seatbeltPath(normalize(run.dir))])].map((d) => `(allow file-read* (subpath ${quote(d)}))`),
    ...[...new Set([temp, seatbeltPath(temp)])].flatMap((d) => [`(allow file-read* (subpath ${quote(d)}))`, `(allow file-write* (subpath ${quote(d)}))`]),
    `(allow file-write* (literal "/dev/null"))`,
    ...bunDirs.map((d) => `(allow file-read* (subpath ${quote(d)}))`),
    // System libraries only: no home, no documents, no other app's store.
    ...["/usr/lib", "/usr/libexec", "/usr/share", "/usr/local/lib", "/System/Library", "/Library/Apple", "/private/var/db/dyld", "/private/var/db/timezone", "/usr/share/zoneinfo"].map((d) => `(allow file-read* (subpath ${quote(d)}))`),
    ...["/dev/null", "/dev/zero", "/dev/random", "/dev/urandom", "/private/etc/passwd", "/private/etc/group", "/private/etc/hosts"].map((p) => `(allow file-read* (literal ${quote(p)}))`),
    // DNS and TLS are part of going online, not extra data: mDNSResponder answers getaddrinfo,
    // and the system's own roots answer a TLS handshake. Only an online run gets them.
    ...(online
      ? [
          '(allow mach-lookup (global-name "com.apple.system.logger") (global-name "com.apple.dnssd.service"))',
          ...["/private/etc/resolv.conf", "/private/etc/ssl", "/etc/ssl", "/System/Library/Keychains", "/Library/Keychains"].map((p) => `(allow file-read* (subpath ${quote(p)}))`),
        ]
      : []),
    ...reads.map((r) => `(allow file-read* ${r})`),
    // D670: a declared online use gets outbound network for this run only. Everything else
    // keeps the default deny; an undeclared reader can't even open a loopback socket.
    online ? "(allow network-outbound)" : "(deny network*)",
  ].join("\n");
}

/** The bwrap arguments for one run; `--` and the reader's own argv come last. */
export function bwrapArgs(run: PluginRun, o: { bunPath?: string; path?: string } = {}): string[] {
  const home = run.home ?? process.env.HOME ?? tmpdir();
  const uses = run.uses ?? [];
  const online = run.network === true || uses.some((u) => u.online);
  // D670: an online use is the only reason not to unshare the network; every other run
  // keeps the same --unshare-net bubblewrap had (D668).
  const args: string[] = [...(online ? [] : ["--unshare-net"]), "--die-with-parent", "--new-session", "--unshare-pid", "--cap-drop", "ALL", "--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp"];
  const bound = new Set<string>();
  const covered = (src: string) => [...bound].some((b) => src === b || src.startsWith(`${b}/`));
  const ro = (src: string) => {
    if (!src || covered(src) || !existsSync(src)) return;
    bound.add(src);
    args.push("--ro-bind", src, src);
  };
  for (const d of [
    "/usr",
    "/usr/local",
    "/lib",
    "/lib64",
    "/bin",
    "/sbin",
    "/etc/ld.so.cache",
    "/etc/passwd",
    "/etc/group",
    ...(online
      ? ["/etc/resolv.conf", "/etc/hosts", "/etc/nsswitch.conf", "/etc/ssl", "/etc/pki", "/etc/ca-certificates", "/usr/share/ca-certificates"]
      : []),
  ])
    if (existsSync(d)) ro(d);
  for (const e of [run.argv[0], o.bunPath, ...run.starts, ...uses.flatMap((u) => [u.path, u.real, u.interpreter])]) {
    if (!e) continue;
    const real = (() => {
      try {
        return realpathSync(e);
      } catch {
        return e;
      }
    })();
    ro(real);
  }
  for (const u of uses) {
    ro(u.installDir);
    if (u.interpreterDir) ro(u.interpreterDir);
  }
  ro(run.dir);
  for (const r of run.reads) {
    const abs = expandDeclaredPath(r, { dir: run.dir, home });
    const root = declaredRoot(abs).path;
    ro(root);
  }
  const path = [...new Set([...uses.map((u) => dirname(u.real)), "/usr/local/bin", "/usr/bin", "/bin"])].join(":");
  // Only /tmp is writable inside; the reader's temp folder is that tmpfs.
  return [
    ...args,
    "--chdir",
    run.dir,
    "--clearenv",
    "--setenv",
    "PATH",
    run.env?.PATH ?? path,
    "--setenv",
    "HOME",
    run.home ?? "/tmp",
    "--setenv",
    "TMPDIR",
    "/tmp",
    "--setenv",
    "DUCTER_PLUGIN_TMP",
    "/tmp",
    "--setenv",
    "DUCTER_PLUGIN_ID",
    run.id,
    ...(run.env ? Object.entries(run.env).flatMap(([k, v]) => (k === "PATH" ? [] : ["--setenv", k, v])) : []),
    "--",
    ...run.argv,
  ];
}

/** The plan for this platform; undefined when no sandbox can be built. */
export function sandboxPlan(run: PluginRun, o: { platform?: NodeJS.Platform; bunPath?: string; path?: string } = {}): SandboxPlan | undefined {
  const platform = o.platform ?? process.platform;
  if (platform === "darwin") {
    if (!existsSync(SEATBELT)) return undefined;
    const profile = seatbeltProfile(run, o);
    return { platform: "darwin", command: SEATBELT, profile, args: ["-p", profile, ...run.argv] };
  }
  if (platform === "linux") {
    const bwrap = whichNow(BWRAP, { PATH: o.path ?? process.env.PATH ?? "" });
    if (!bwrap) return undefined;
    return { platform: "linux", command: bwrap, args: bwrapArgs(run, o) };
  }
  return undefined;
}

/** Runs a plan with no shell, a timeout and a large but bounded stdout. */
function execPlan(plan: SandboxPlan, run: PluginRun): Promise<SandboxResult> {
  return new Promise((resolvePromise) => {
    execFile(
      plan.command,
      plan.args,
      {
        cwd: run.dir,
        timeout: run.timeoutMs ?? 5 * 60_000,
        maxBuffer: 512 * 1024 * 1024,
        encoding: "utf8",
        env: {
          PATH: run.env?.PATH ?? "/usr/local/bin:/usr/bin:/bin",
          // D670: HOME is the person's home the `~` declarations name, but the profile still
          // denies every read outside them and every write outside TMPDIR. A reader that resolves
          // `~/.example` or whose command reads its own login must see the real home; the boundary is
          // the profile, not a fake HOME that makes every declared path unreachable.
          HOME: run.home ?? run.tempDir,
          TMPDIR: run.tempDir,
          LANG: run.env?.LANG ?? "en_US.UTF-8",
          ...run.env,
        },
      },
      (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { code?: number | string; killed?: boolean }) | null;
        const code = e ? (typeof e.code === "number" ? e.code : e.killed ? -2 : -1) : 0;
        const text = String(stderr ?? "");
        const refused = /^sandbox-exec: sandbox_apply/m.test(text) || /^bwrap:.*(No permissions|setting up uid|unshare|Creating new namespace)/im.test(text);
        resolvePromise({
          code,
          stdout: String(stdout ?? ""),
          stderr: text,
          ...(e && typeof e.code === "string" ? { spawnError: e.code } : {}),
          ...(code !== 0 && refused ? { error: "sandbox_unavailable" as const } : {}),
        });
      },
    );
  });
}

/**
 * Runs one reader under the platform sandbox. It never falls back to an unconfined run: no plan
 * means `sandbox_unavailable`. The caller removes the temp folder.
 */
export async function runSandboxed(run: PluginRun, o: { platform?: NodeJS.Platform; bunPath?: string; path?: string } = {}): Promise<SandboxResult> {
  const plan = sandboxPlan(run, o);
  if (!plan) return { code: -1, stdout: "", stderr: "", error: "sandbox_unavailable" };
  return execPlan(plan, run);
}

/** Makes the temporary folder a reader may write, under Ducter's own data folder. */
export function pluginTempDir(dataDir: string): string {
  return mkdtempSync(join(dataDir, "plugin-tmp-"));
}

export function removePluginTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* a reader's leftovers are not worth failing a run over */
  }
}

