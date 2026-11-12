// D225: the home's own Nowledge Mem command line (`nmem`), put in or updated by Ducter on the user's
// tap in Settings › 伙伴 › 你的其他 AI, so a home without it (a headless Linux server) can connect
// the persona with the user's other AI agents (D205) without the user typing a command there.
//
// Mem's official route (research/66 §4, research/69; https://mem.nowledge.co/SKILL.md, the CLI
// docs, the plugin skills, and `nmem status`'s own update hint "pipx upgrade nmem-cli"): on a
// machine with the Nowledge Mem app, the app's own command line; anywhere else, the PyPI package
// `nmem-cli`. D229: pipx first (the route every Mem surface names, and the one a system Python
// marked externally managed (PEP 668) allows without bypassing the mark). An update comes from the
// same source the copy came from:
//   - the app's copy (the app bundle or its wrapper): Ducter can't update it; one line says to
//     update the app;
//   - pipx: `pipx upgrade nmem-cli`           · install: `pipx install nmem-cli`
//   - uv:   `uv tool upgrade nmem-cli`        · install: `uv tool install nmem-cli`
//   - pip:  `<its python> -m pip install --user --upgrade nmem-cli` (a copy pip put in the user's
//           own site) when that python is not marked externally managed. When it is (hel: the
//           system Python 3.14, the copy put there past the mark), D229 moves it instead: the
//           old copy out, `pipx install nmem-cli` in, the sign-in (~/.nowledge-mem/config.json,
//           Mem's single credential home) untouched; if the new copy doesn't go in, the old one
//           is put back. With no pipx to move to and none to get, the old in-place update past
//           the mark stays the fallback (`--break-system-packages`, never for a fresh install);
//   - anything else (a system package, a copy Ducter can't place): no command; one line.
// A fresh install tries pipx, then uv, then gets pipx from the system's own package manager when
// that needs no password (Homebrew; apt or dnf as root or with `sudo -n`), then pip into the user's
// own site when that python isn't marked; none: one line naming the one thing to install first.
// Every command is an argument vector, never a shell string, never asks for a password, and runs
// as the user Ducter runs as. Afterwards the version is read back; the folder the new `nmem` is
// in joins this process's PATH, so every later nmem call (memory, the partner's Bridge, tasks)
// finds it.
//
// Signing in is a separate step (Mem's own `nmem connect <link>`): a one-time connect link the
// user makes in Nowledge Mem and pastes on the card. `--skip-tools`: it saves the sign-in only and
// changes no AI tool's settings (D169 does that, per agent, on its own tap). The link is never
// logged, kept or shown again.
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";

export const MEM_PACKAGE = "nmem-cli";
export const MEM_INSTALL_MS = 10 * 60_000;

export type MemChannel = "app" | "uv" | "pipx" | "pip" | "other";

export interface MemCopy {
  path: string;
  channel: MemChannel;
  /** pip: the python that owns the copy ("python3.14"), and whether it is the user's own site. */
  python?: string;
  userSite?: boolean;
  /** pip: the copy lives in a virtual environment (its own python runs pip). */
  venv?: string;
}

/** One command of a plan. pastMark: a pip step on a copy already put past the system's mark. */
export interface MemStep {
  argv: string[];
  pastMark?: boolean;
}

export interface MemPlan {
  steps: MemStep[];
  /** What it does, for the record (never shown with a secret: there is none). */
  how: "uv" | "pipx" | "pip" | "move";
  /** move: puts the old copy back when the new one didn't go in. */
  undo?: MemStep;
}

/** What a plan needs to know about this computer, learned with a quick question each. */
export interface MemFacts {
  /** A python's pip: usable, marked externally managed (PEP 668), or none. Keyed by the python. */
  python?: Record<string, "ok" | "managed" | "nopip">;
  /** The system's package manager runs without a password (root, or `sudo -n` works). */
  sudo?: boolean;
}

export interface MemSys {
  which: (cmd: string, path: string) => string | undefined;
  exists: (p: string) => boolean;
  read: (p: string) => string | undefined;
  list: (dir: string) => string[];
  real: (p: string) => string;
  home: string;
  platform: NodeJS.Platform;
  /** The user Ducter runs as (0: root); undefined where there is none (Windows). */
  uid?: number;
}

export const realSys = (): MemSys => ({
  which: (cmd, path) => Bun.which(cmd, { PATH: path }) ?? undefined,
  exists: existsSync,
  read: (p) => {
    try {
      return readFileSync(p, "utf8");
    } catch {
      return undefined;
    }
  },
  list: (d) => {
    try {
      return readdirSync(d);
    } catch {
      return [];
    }
  },
  real: (p) => {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  },
  home: homedir(),
  platform: process.platform,
  uid: process.getuid?.(),
});

/** Folders a fresh `nmem` lands in that a service's PATH often lacks (pipx, uv, pip --user). */
export function extraBins(sys: MemSys): string[] {
  const out = [join(sys.home, ".local", "bin")];
  if (sys.platform === "darwin") {
    const py = join(sys.home, "Library", "Python");
    for (const v of sys.list(py).sort().reverse()) out.push(join(py, v, "bin"));
  }
  return out;
}

/** The `nmem` this process would run: on PATH, else in one of the usual user folders. */
export function findNmem(env: Record<string, string | undefined>, sys: MemSys): string | undefined {
  if (env.NMEM_CLI_PATH && sys.exists(env.NMEM_CLI_PATH)) return env.NMEM_CLI_PATH;
  const onPath = sys.which("nmem", env.PATH ?? "");
  if (onPath) return onPath;
  for (const d of extraBins(sys)) if (sys.exists(join(d, "nmem"))) return join(d, "nmem");
  return undefined;
}

/** Where this copy came from, so its update comes from the same source. */
export function copyOf(path: string, sys: MemSys): MemCopy {
  const real = sys.real(path);
  const head = sys.read(path)?.slice(0, 400) ?? "";
  if (/Nowledge Mem\.app/.test(real) || /nmem-wrapper$/.test(real) || /Auto-generated by Nowledge Mem/.test(head)) return { path, channel: "app" };
  if (/[\\/]uv[\\/]tools[\\/]nmem-cli[\\/]/.test(real)) return { path, channel: "uv" };
  if (/[\\/]pipx[\\/]venvs[\\/]nmem-cli[\\/]/.test(real)) return { path, channel: "pipx" };
  // pip: <prefix>/bin/nmem with <prefix>/lib/pythonX.Y/site-packages/nmem_cli-*.dist-info/INSTALLER = pip
  const prefix = dirname(dirname(real));
  const lib = join(prefix, "lib");
  for (const py of sys.list(lib).filter((d) => /^python3\.\d+$/.test(d))) {
    const site = join(lib, py, "site-packages");
    const dist = sys.list(site).find((d) => /^nmem_cli-.*\.dist-info$/.test(d));
    if (!dist || (sys.read(join(site, dist, "INSTALLER")) ?? "").trim() !== "pip") continue;
    if (sys.exists(join(prefix, "pyvenv.cfg"))) return { path, channel: "pip", python: join(prefix, "bin", "python"), venv: prefix };
    const userSite = prefix === join(sys.home, ".local");
    return userSite ? { path, channel: "pip", python: py, userSite } : { path, channel: "other" };
  }
  // macOS pip --user: ~/Library/Python/X.Y/bin/nmem
  const mac = /[\\/]Library[\\/]Python[\\/](3\.\d+)[\\/]bin[\\/]nmem$/.exec(real);
  if (mac && real.startsWith(sys.home)) return { path, channel: "pip", python: `python${mac[1]}`, userSite: true };
  return { path, channel: "other" };
}

/** A command by name: on PATH, in the user's own bin folders, or where the system keeps it. */
export function toolOf(cmd: string, env: Record<string, string | undefined>, sys: MemSys): string | undefined {
  const sysDirs = sys.platform === "darwin" ? ["/opt/homebrew/bin", "/usr/local/bin"] : ["/usr/local/bin", "/usr/bin"];
  return sys.which(cmd, env.PATH ?? "") ?? [...extraBins(sys), ...sysDirs].map((d) => join(d, cmd)).find(sys.exists);
}

/** The python a quick question asks about pip (`python3`, or a pip copy's own python). */
export const PY_PROBE = 'import os, sysconfig\ntry:\n    import pip\nexcept Exception:\n    print("nopip"); raise SystemExit(0)\nprint("managed" if os.path.exists(os.path.join(sysconfig.get_path("stdlib"), "EXTERNALLY-MANAGED")) else "ok")';

/**
 * pipx from the system's own package manager, when it needs no password: Homebrew on a Mac; apt
 * or dnf as root or with `sudo -n` on Linux. undefined: there's no such way here.
 */
export function pipxFromSystem(env: Record<string, string | undefined>, sys: MemSys, facts: MemFacts): MemStep | undefined {
  if (sys.platform === "darwin") {
    const brew = toolOf("brew", env, sys);
    return brew ? { argv: [brew, "install", "pipx"] } : undefined;
  }
  if (sys.platform !== "linux") return undefined;
  const root = sys.uid === 0;
  if (!root && !facts.sudo) return undefined;
  const asRoot = (argv: string[]) => (root ? argv : ["sudo", "-n", ...argv]);
  const apt = toolOf("apt-get", env, sys);
  if (apt) return { argv: asRoot(["env", "DEBIAN_FRONTEND=noninteractive", apt, "install", "-y", "-q", "pipx"]) };
  const dnf = toolOf("dnf", env, sys);
  if (dnf) return { argv: asRoot([dnf, "install", "-y", "-q", "pipx"]) };
  return undefined;
}

/** Where a fresh copy goes: pipx, uv, or pipx got from the system first; undefined: none here. */
function isolatedInstall(env: Record<string, string | undefined>, sys: MemSys, facts: MemFacts, force = false): { steps: MemStep[]; how: "pipx" | "uv" } | undefined {
  const pipx = toolOf("pipx", env, sys);
  if (pipx) return { steps: [{ argv: [pipx, "install", ...(force ? ["--force"] : []), MEM_PACKAGE] }], how: "pipx" };
  const uv = toolOf("uv", env, sys);
  if (uv) return { steps: [{ argv: [uv, "tool", "install", ...(force ? ["--force"] : []), MEM_PACKAGE] }], how: "uv" };
  const boot = pipxFromSystem(env, sys, facts);
  // After the system's pipx is in, "pipx" is found by name (bridge-link resolves it then).
  if (boot) return { steps: [boot, { argv: ["pipx", "install", ...(force ? ["--force"] : []), MEM_PACKAGE] }], how: "pipx" };
  return undefined;
}

/** The python a pip copy belongs to, as a command this computer runs. */
export const copyPython = (copy: MemCopy, env: Record<string, string | undefined>, sys: MemSys) => (copy.venv ? copy.python! : (sys.which(copy.python!, env.PATH ?? "") ?? copy.python!));

/** A pip copy in the user's own site under a python marked externally managed: D229 moves it to pipx. */
export const movable = (copy: MemCopy, env: Record<string, string | undefined>, sys: MemSys, facts: MemFacts) =>
  copy.channel === "pip" && !!copy.userSite && !!copy.python && facts.python?.[copyPython(copy, env, sys)] === "managed";

/** The update for this copy from its own source; undefined: Ducter can't (the app's, a system package). */
export function updatePlan(copy: MemCopy, env: Record<string, string | undefined>, sys: MemSys, facts: MemFacts = {}): MemPlan | undefined {
  switch (copy.channel) {
    case "uv": {
      const uv = toolOf("uv", env, sys);
      return uv ? { steps: [{ argv: [uv, "tool", "upgrade", MEM_PACKAGE] }], how: "uv" } : undefined;
    }
    case "pipx": {
      const pipx = toolOf("pipx", env, sys);
      return pipx ? { steps: [{ argv: [pipx, "upgrade", MEM_PACKAGE] }], how: "pipx" } : undefined;
    }
    case "pip": {
      if (!copy.python) return undefined;
      const py = copyPython(copy, env, sys);
      const inPlace: MemStep = { argv: [py, "-m", "pip", "install", ...(copy.userSite ? ["--user"] : []), "--upgrade", "--disable-pip-version-check", MEM_PACKAGE], pastMark: !!copy.userSite };
      if (movable(copy, env, sys, facts)) {
        const to = isolatedInstall(env, sys, facts, true);
        if (to) {
          // The old copy out first (pip would otherwise take the new `nmem` with it), then the new one in.
          const out: MemStep = { argv: [py, "-m", "pip", "uninstall", "-y", "--disable-pip-version-check", "--break-system-packages", MEM_PACKAGE] };
          const boot = to.steps.length > 1 ? [to.steps[0]!] : [];
          const undo: MemStep = { argv: [py, "-m", "pip", "install", "--user", "--disable-pip-version-check", "--break-system-packages", MEM_PACKAGE] };
          return { steps: [...boot, out, to.steps.at(-1)!], how: "move", undo };
        }
      }
      return { steps: [inPlace], how: "pip" };
    }
    default:
      return undefined;
  }
}

/** A fresh install with the first official route that is here (pipx, uv, pipx from the system, pip); undefined: none. */
export function installPlan(env: Record<string, string | undefined>, sys: MemSys, facts: MemFacts = {}): MemPlan | undefined {
  const iso = isolatedInstall(env, sys, facts);
  if (iso) return iso;
  const py = sys.which("python3", env.PATH ?? "");
  if (py && facts.python?.[py] === "ok") return { steps: [{ argv: [py, "-m", "pip", "install", "--user", "--disable-pip-version-check", MEM_PACKAGE] }], how: "pip" };
  return undefined;
}

/** pip refused because the python is marked externally managed (PEP 668). */
export const externallyManaged = (text: string) => /externally-managed-environment/i.test(text);

/** A link `nmem connect` takes (Mem's accepted shapes); anything else is refused before it runs. */
export function connectLinkOk(link: string): boolean {
  let u: URL;
  try {
    u = new URL(link.trim());
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && /^(127\.0\.0\.1|localhost)$/.test(u.hostname))) return false;
  const q = u.searchParams;
  return !!(q.get("nmem_connect") || q.get("nmem_api_key") || (/\/connect\/?$/.test(u.pathname) && (q.get("token") || q.get("key"))));
}

/** Adds a folder to this process's PATH (front), once; later spawns find the new `nmem`. */
export function joinPath(env: Record<string, string | undefined>, dir: string) {
  const parts = (env.PATH ?? "").split(delimiter).filter(Boolean);
  if (!parts.includes(dir)) env.PATH = [dir, ...parts].join(delimiter);
}
