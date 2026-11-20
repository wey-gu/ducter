// D363: where a computer's AI agents can be, so a worker (a systemd or launchd service, whose PATH
// is not the person's shell's) finds the ones the person installed themselves, and the ones Ducter
// put in its own tools folder. Three sources, widest first:
//   1. the login shell's PATH, captured when the service was installed and again when the worker
//      starts and whenever a device card asks it to look again (`$SHELL -lic`, so an nvm, fnm,
//      asdf or mise set up in .bashrc / .zshrc is in it);
//   2. the usual per-user places, looked at on every probe (no shell needed): ~/.local/bin, the
//      npm prefix in ~/.npmrc, ~/.npm-global/bin, every nvm node's bin, fnm, volta, asdf, mise,
//      bun, Homebrew on Linux (/home/linuxbrew), /usr/local/bin, /opt/homebrew/bin, and the CLI a Mac
//      app carries inside itself (DeepSeek Harness.app's dsh);
//   3. Ducter's own tools folder (<data>/tools/node/bin, <data>/tools/bin), last.
// The person's own copies come first: a Codex they installed wins over Ducter's. One exception,
// D386: when the person's own `nmem` is too old for Mem (the old Python CLI: no `connect`, no
// `doctor`) and Ducter put its own current copy in its tools folder, Ducter's `nmem` alone goes
// ahead of everything (<data>/tools/prefer holds only that one link), so Mem's plugins inside
// Claude Code and Codex find a working one. worker-mem.ts puts the link there and takes it away.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DSH_APP_CLI, dshAppPaths, dshCredentialsFile } from "@ducter/protocol/src/dsh.ts";
import { ANTIGRAVITY } from "@ducter/protocol/src/harness-facts.ts";

export interface AgentPathFs {
  exists(p: string): boolean;
  readdir(p: string): string[];
  read(p: string): string | undefined;
}

const realFs: AgentPathFs = {
  exists: existsSync,
  readdir: (p) => {
    try {
      return readdirSync(p);
    } catch {
      return [];
    }
  },
  read: (p) => {
    try {
      return readFileSync(p, "utf8");
    } catch {
      return undefined;
    }
  },
};

/** Ducter's own node (for npm-installed agents) and its own tools. */
export const toolsNodeBin = (dataDir: string) => join(dataDir, "tools", "node", "bin");
export const toolsOwnBin = (dataDir: string) => join(dataDir, "tools", "bin");
/** D386: a folder with only a link to Ducter's own `nmem`, first on PATH while the person's is too old. */
export const toolsPreferBin = (dataDir: string) => join(dataDir, "tools", "prefer");
/** Where the login shell's PATH is kept between runs. */
export const loginPathFile = (dataDir: string) => join(dataDir, "login-path");

/** A version folder name ("v22.11.0") as numbers, newest first when sorted with this. */
const byVersionDesc = (a: string, b: string) => {
  const n = (s: string) => (/(\d+)\.(\d+)\.(\d+)/.exec(s) ?? []).slice(1).map(Number);
  const x = n(a), y = n(b);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (y[i] ?? 0) - (x[i] ?? 0);
  return 0;
};

/** The usual per-user places agents land (source 2), only those that exist. */
export function userAgentDirs(o: { home?: string; env?: Record<string, string | undefined>; fs?: AgentPathFs } = {}): string[] {
  const home = o.home ?? homedir();
  const env = o.env ?? process.env;
  const fs = o.fs ?? realFs;
  const dirs: string[] = [join(home, ".local", "bin")];
  // npm's own prefix setting, then the common hand-made one.
  const rc = fs.read(join(home, ".npmrc")) ?? "";
  const prefix = /^\s*prefix\s*=\s*(.+?)\s*$/m.exec(rc)?.[1]?.replace(/^~(?=\/)/, home).replace(/^\$\{?HOME\}?/, home);
  if (env.NPM_CONFIG_PREFIX) dirs.push(join(env.NPM_CONFIG_PREFIX, "bin"));
  if (prefix) dirs.push(join(prefix, "bin"));
  dirs.push(join(home, ".npm-global", "bin"), join(home, ".npm-packages", "bin"));
  // nvm: every installed node, the newest first (`nvm alias default` is usually it).
  const nvm = env.NVM_DIR || join(home, ".nvm");
  for (const v of fs.readdir(join(nvm, "versions", "node")).sort(byVersionDesc)) dirs.push(join(nvm, "versions", "node", v, "bin"));
  // fnm (both of its homes), volta, asdf, mise, bun, pnpm's global bin.
  for (const fnm of [join(home, ".local", "share", "fnm"), join(home, ".fnm")]) {
    for (const v of fs.readdir(join(fnm, "node-versions")).sort(byVersionDesc)) dirs.push(join(fnm, "node-versions", v, "installation", "bin"));
  }
  dirs.push(join(home, ".volta", "bin"), join(home, ".asdf", "shims"), join(home, ".local", "share", "mise", "shims"), join(home, ".bun", "bin"), join(home, ".local", "share", "pnpm"));
  dirs.push(join(home, ".linuxbrew", "bin"), "/home/linuxbrew/.linuxbrew/bin", "/opt/homebrew/bin", "/usr/local/bin");
  // A Mac app that carries its agent's command line inside itself and never puts it on PATH:
  // DeepSeek Harness.app (0.2.2-rc.3 keeps `dsh` in Resources/runtime/cli/bin), in /Applications
  // or ~/Applications. Last, so a `dsh` the person put on PATH wins.
  for (const app of dshAppPaths(home)) dirs.push(join(app, ...DSH_APP_CLI));
  return [...new Set(dirs)].filter((d) => fs.exists(d));
}

/** The login shell's PATH (source 1) as last captured, or none. */
export function savedLoginPath(dataDir: string, fs: AgentPathFs = realFs): string[] {
  return (fs.read(loginPathFile(dataDir)) ?? "").trim().split(":").filter((p) => p.startsWith("/"));
}

/** Pulls the PATH a login shell prints between the markers (an rc file may print anything around it). */
export function parseLoginPath(out: string): string[] | undefined {
  const m = /__DUCTER_PATH__(.*?)__DUCTER_END__/s.exec(out);
  if (!m) return undefined;
  return m[1]!.trim().split(":").filter((p) => p.startsWith("/"));
}

/**
 * The person's login shell's PATH: `$SHELL -lic` (interactive too, since Ubuntu's .bashrc, where
 * nvm puts itself, returns early for a non-interactive shell). Bounded at 8 s; undefined when the
 * shell fails or prints no markers. Never throws.
 */
export async function captureLoginPath(o: { shell?: string; run: (argv: string[], timeoutMs: number) => Promise<{ code: number; out: string }> }): Promise<string[] | undefined> {
  const shell = o.shell || process.env.SHELL || "/bin/sh";
  try {
    const r = await o.run([shell, "-lic", 'printf "__DUCTER_PATH__%s__DUCTER_END__" "$PATH"'], 8000);
    return parseLoginPath(r.out);
  } catch {
    return undefined;
  }
}

export function saveLoginPath(dataDir: string, dirs: string[]): void {
  try {
    mkdirSync(dirname(loginPathFile(dataDir)), { recursive: true });
    writeFileSync(loginPathFile(dataDir), dirs.join(":") + "\n");
  } catch {
    /* a read-only data folder: the worker still widens from the usual places */
  }
}

/**
 * The PATH an agent probe and every task on this computer use: what the process has, then the
 * login shell's, then the usual places, then Ducter's tools folder; each once, in that order.
 * D386: Ducter's preferred nmem folder first, while it holds its link.
 */
export function agentPath(o: { dataDir: string; env?: Record<string, string | undefined>; home?: string; fs?: AgentPathFs; login?: string[] }): string {
  const env = o.env ?? process.env;
  const fs = o.fs ?? realFs;
  // D386: Ducter's own nmem ahead, only while its link is there (a link to nothing is no link).
  const prefer = toolsPreferBin(o.dataDir);
  const parts = [
    ...(fs.exists(join(prefer, "nmem")) ? [prefer] : []),
    ...(env.PATH ?? "").split(":").filter((p) => p !== prefer),
    ...(o.login ?? savedLoginPath(o.dataDir, fs)),
    ...userAgentDirs({ ...(o.home ? { home: o.home } : {}), env, fs }),
    toolsNodeBin(o.dataDir),
    toolsOwnBin(o.dataDir),
  ];
  return [...new Set(parts.filter(Boolean))].join(":");
}

/** Sets env.PATH to agentPath (so Bun.which, every probe and every task's spawn see the same). */
export function widenAgentPath(o: Parameters<typeof agentPath>[0] & { env?: Record<string, string | undefined> }): boolean {
  const env = o.env ?? process.env;
  const next = agentPath(o);
  if (next === env.PATH) return false;
  env.PATH = next;
  return true;
}

/**
 * A cheap fingerprint of this computer's agents (no process started): where each agent's command
 * is on the widened PATH and when it last changed, and when each sign-in file last changed. The
 * worker looks every few seconds and probes for real only when it moves, so an agent installed or
 * signed in by hand in a terminal shows on its card within seconds.
 */
export function agentSignature(o: { dataDir: string; home?: string; env?: Record<string, string | undefined>; which: (cmd: string) => string | null; mtime?: (p: string) => number | undefined }): string {
  const home = o.home ?? homedir();
  const env = o.env ?? process.env;
  const mtime =
    o.mtime ??
    ((p: string) => {
      try {
        return statSync(p).mtimeMs;
      } catch {
        return undefined;
      }
    });
  const cmds = ["claude", "codex", "pi", "dsh", "agy", "node"].map((c) => {
    const p = o.which(c);
    return `${c}=${p ?? ""}@${p ? (mtime(p) ?? "") : ""}`;
  });
  const files = [
    join(env.CODEX_HOME || join(home, ".codex"), "auth.json"),
    join(env.CLAUDE_CONFIG_DIR || join(home, ".claude"), ".credentials.json"),
    join(home, ".claude.json"),
    join(env.PI_CODING_AGENT_DIR || join(home, ".pi", "agent"), "auth.json"),
    join(env.PI_CODING_AGENT_DIR || join(home, ".pi", "agent"), "models.json"),
    // D371: DeepSeek Harness's own (its desktop app's 登录 or a key saved there lands here).
    dshCredentialsFile(env, home),
    // D415: agy at its official place (found even off PATH), its sign-in token where it keeps one
    // as a file, and the desktop app (so "the app, not its command line" changes when either does).
    join(home, ...ANTIGRAVITY.bin),
    join(env.GEMINI_HOME || join(home, ".gemini"), ...ANTIGRAVITY.token.slice(1)),
    join("/Applications", ANTIGRAVITY.app),
    join(o.dataDir, "keys.env"),
  ].map((f) => `${f}@${mtime(f) ?? ""}`);
  return [...cmds, ...files].join("|");
}
