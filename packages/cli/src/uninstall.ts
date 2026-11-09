// `ducter uninstall [--all]`: take Ducter off this computer, and only Ducter.
//
//   (no --all)  the background item only: the LaunchAgent (macOS) or the systemd user unit (Linux).
//               Data stays; the app or `ducter up` brings it back.
//   --all       also the data folder (the Log, worktrees, browser profiles, scratch), the
//               ~/.local/bin/ducter link Ducter.app made, and the app's own Library folders.
//
// Nothing outside that list is ever touched: repos and their ducter/* branches, harness logins,
// Nowledge Mem and cua-driver stay. Ducter.app itself is moved to the Trash by the app, last.
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { T } from "./i18n.ts";
import { UNIT_NAME, unitPath } from "./remote.ts";

export const DEFAULT_BUNDLE_ID = "co.nowledge.ducter";

export type ItemKind = "agent" | "service" | "data" | "worktree" | "link" | "appdata";
export interface Item {
  path: string;
  what: string;
  kind: ItemKind;
  bytes?: number;
}
export interface Keep {
  what: string;
  detail: string;
}
export type WarningId = "unsaved-worktree" | "running-elsewhere" | "unsafe-data-dir";
export interface Warning {
  id: WarningId;
  detail: string;
  path?: string;
}
export interface Plan {
  remove: Item[];
  keep: Keep[];
  warnings: Warning[];
  /** Repos whose worktrees live in the data folder: `git worktree prune` after it is gone. */
  repos?: string[];
}

export interface PlanInput {
  home: string;
  dataDir: string;
  platform: NodeJS.Platform;
  agentLabel: string;
  execPath: string;
  all: boolean;
  /** The app runs this (DUCTER_FROM_APP=1): it trashes itself last. */
  fromApp?: boolean;
  t: T;
  /** `git -C dir args…`; returns stdout or null on failure. Injected by tests. */
  git?: (dir: string, args: string[]) => string | null;
}

export function realGit(dir: string, args: string[]): string | null {
  const r = Bun.spawnSync(["git", "-C", dir, ...args], { stdout: "pipe", stderr: "ignore", stdin: "ignore" });
  return r.exitCode === 0 ? r.stdout.toString() : null;
}

/** DUCTER_AGENT_LABEL, else the bundle id of the app around execPath + ".agent", else the default. */
export function agentLabel(env: Record<string, string | undefined>, execPath: string): string {
  if (env.DUCTER_AGENT_LABEL?.trim()) return env.DUCTER_AGENT_LABEL.trim();
  const id = bundleIdAround(execPath);
  return (id ?? DEFAULT_BUNDLE_ID) + ".agent";
}

/** CFBundleIdentifier of X.app when execPath is X.app/Contents/Helpers/ducter. */
export function bundleIdAround(execPath: string): string | null {
  const helpers = dirname(execPath);
  const contents = dirname(helpers);
  if (basename(helpers) !== "Helpers" || basename(contents) !== "Contents" || !dirname(contents).endsWith(".app")) return null;
  try {
    const plist = readFileSync(join(contents, "Info.plist"), "utf8");
    const m = /<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/.exec(plist);
    return m ? m[1]!.trim() : null;
  } catch {
    return null;
  }
}

export function plistPath(home: string, label: string): string {
  return join(home, "Library", "LaunchAgents", `${label}.plist`);
}

/** Bytes under a path (no symlinks followed); 0 if unreadable. */
export function sizeOf(p: string): number {
  let st;
  try {
    st = lstatSync(p);
  } catch {
    return 0;
  }
  if (!st.isDirectory()) return st.size;
  let n = 0;
  let entries: string[] = [];
  try {
    entries = readdirSync(p);
  } catch {
    return 0;
  }
  for (const e of entries) n += sizeOf(join(p, e));
  return n;
}

/** The data folder is Ducter's only if it looks like one: never /, never $HOME. */
export function dataDirIsOurs(dataDir: string, home: string): boolean {
  const d = resolve(dataDir);
  if (d === "/" || d === resolve(home) || d === dirname(resolve(home))) return false;
  return basename(d) === ".ducter" || existsSync(join(d, "ducter.db")) || existsSync(join(d, "persona.json"));
}

/** The repo a worktree belongs to, from its `.git` file (`gitdir: <repo>/.git/worktrees/<name>`). */
export function worktreeRepo(wt: string): string | null {
  try {
    const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(join(wt, ".git"), "utf8"));
    if (!m) return null;
    const gitdir = resolve(wt, m[1]!.trim());
    const i = gitdir.lastIndexOf(`${"/"}.git/worktrees/`);
    return i > 0 ? gitdir.slice(0, i) : null;
  } catch {
    return null;
  }
}

/**
 * This app's link: a symlink to <X.app>/Contents/Helpers/ducter that is this very helper
 * (execPath), or one whose app is gone. A link to another copy of Ducter.app that still
 * exists is that copy's, and stays.
 */
export function isAppLink(p: string, execPath: string): boolean {
  try {
    if (!lstatSync(p).isSymbolicLink()) return false;
    const to = readlinkSync(p);
    if (!to.endsWith("/Contents/Helpers/ducter")) return false;
    if (!existsSync(to)) return true;
    return realpathSync(to) === realpathSync(execPath);
  } catch {
    return false;
  }
}

const exists = (p: string) => {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
};

export function planUninstall(i: PlanInput): Plan {
  const { t, home } = i;
  const git = i.git ?? realGit;
  const remove: Item[] = [];
  const keep: Keep[] = [];
  const warnings: Warning[] = [];
  const repos: string[] = [];

  // The background item.
  if (i.platform === "darwin") {
    const p = plistPath(home, i.agentLabel);
    if (exists(p)) remove.push({ path: p, what: t("uninstall.item.agent"), kind: "agent" });
  } else if (i.platform === "linux") {
    const p = unitPath(home);
    if (exists(p)) remove.push({ path: p, what: t("uninstall.item.service"), kind: "service" });
  }

  if (i.all) {
    if (exists(i.dataDir)) {
      if (!dataDirIsOurs(i.dataDir, home)) {
        warnings.push({ id: "unsafe-data-dir", detail: t("uninstall.warn.unsafe", { dir: i.dataDir }), path: i.dataDir });
      } else {
        const wtRoot = join(i.dataDir, "worktrees");
        let wts: string[] = [];
        try {
          wts = readdirSync(wtRoot).map((n) => join(wtRoot, n)).filter((p) => statSync(p).isDirectory());
        } catch {}
        for (const wt of wts) {
          const repo = worktreeRepo(wt);
          if (repo && !repos.includes(repo)) repos.push(repo);
          const st = git(wt, ["status", "--porcelain"]);
          if (st && st.trim()) warnings.push({ id: "unsaved-worktree", detail: t("uninstall.warn.unsaved", { name: basename(wt), repo: repo ?? "?" }), path: wt });
        }
        remove.push({ path: i.dataDir, what: t("uninstall.item.data", { n: wts.length }), kind: "data", bytes: sizeOf(i.dataDir) });
      }
    }
    const link = join(home, ".local", "bin", "ducter");
    if (isAppLink(link, i.execPath)) remove.push({ path: link, what: t("uninstall.item.link"), kind: "link" });
    else if (exists(link)) {
      let to = "";
      try {
        if (lstatSync(link).isSymbolicLink()) to = readlinkSync(link);
      } catch {}
      keep.push({ what: link, detail: to ? t("uninstall.keep.otherLink", { path: link, to }) : t("uninstall.keep.copied", { path: link }) });
    }

    if (i.platform === "darwin") {
      const lib = join(home, "Library");
      const id = i.agentLabel.replace(/\.agent$/, "");
      // Ducter.app's folder is "Ducter"; another build's (a scratch copy) is its bundle id.
      const app: string[] = [join(lib, "Application Support", id === DEFAULT_BUNDLE_ID ? "Ducter" : id)];
      app.push(join(lib, "Caches", id), join(lib, "Preferences", `${id}.plist`), join(lib, "Saved Application State", `${id}.savedState`), join(lib, "HTTPStorages", id));
      for (const p of app) if (exists(p)) remove.push({ path: p, what: t("uninstall.item.appdata"), kind: "appdata", bytes: sizeOf(p) });
    }
  } else if (exists(i.dataDir)) {
    keep.push({ what: t(i.fromApp ? "uninstall.keep.data.fromApp" : "uninstall.keep.data"), detail: i.dataDir });
  }

  keep.push(
    { what: t("uninstall.keep.repos"), detail: t("uninstall.keep.repos.detail") },
    { what: t("uninstall.keep.logins"), detail: t("uninstall.keep.logins.detail") },
    { what: "Nowledge Mem", detail: t("uninstall.keep.mem.detail") },
    { what: "cua-driver", detail: t("uninstall.keep.cua.detail") },
  );
  if (i.platform === "darwin") keep.push({ what: "Ducter.app", detail: t(i.fromApp ? "uninstall.keep.app.fromApp" : "uninstall.keep.app") });
  return { remove, keep, warnings, repos };
}

export interface Runner {
  /** launchctl / systemctl; never throws. */
  run(cmd: string[]): Promise<{ code: number; stdout: string }>;
  /** Whether a Ducter still answers /health on the port. */
  healthy(port: number): Promise<boolean>;
  uid: number;
}

export interface Result {
  removed: string[];
  failed: { path: string; error: string }[];
  warnings: Warning[];
}

/** Carries out a plan. Background item first; with data, stops if a Ducter still answers. */
export async function executeUninstall(plan: Plan, o: { runner: Runner; port: number; label: string; t: T; git?: PlanInput["git"] }): Promise<Result> {
  const res: Result = { removed: [], failed: [], warnings: [...plan.warnings] };
  const rm = (p: string) => {
    try {
      rmSync(p, { recursive: true, force: true });
      res.removed.push(p);
    } catch (e) {
      res.failed.push({ path: p, error: e instanceof Error ? e.message : String(e) });
    }
  };
  for (const it of plan.remove.filter((x) => x.kind === "agent" || x.kind === "service")) {
    if (it.kind === "agent") await o.runner.run(["/bin/launchctl", "bootout", `gui/${o.runner.uid}/${o.label}`]);
    else await o.runner.run(["systemctl", "--user", "disable", "--now", UNIT_NAME]);
    rm(it.path);
    if (it.kind === "service") await o.runner.run(["systemctl", "--user", "daemon-reload"]);
  }
  const rest = plan.remove.filter((x) => x.kind !== "agent" && x.kind !== "service");
  if (rest.some((x) => x.kind === "data")) {
    // launchd's bootout returns before the process is gone; give it a moment.
    let up = await o.runner.healthy(o.port);
    for (let n = 0; up && n < 20; n++) {
      await Bun.sleep(250);
      up = await o.runner.healthy(o.port);
    }
    if (up) {
      res.warnings.push({ id: "running-elsewhere", detail: o.t("uninstall.warn.running", { port: o.port }) });
      return res;
    }
  }
  for (const it of rest) rm(it.path);
  const git = o.git ?? realGit;
  for (const repo of plan.repos ?? []) if (existsSync(repo)) git(repo, ["worktree", "prune"]);
  return res;
}

export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) (v /= 1024), i++;
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

export function formatPlan(plan: Plan, t: T, home: string): string {
  const tilde = (p: string) => (p.startsWith(home + "/") ? "~" + p.slice(home.length) : p);
  const lines = [t("uninstall.removes")];
  if (!plan.remove.length) lines.push("  " + t("uninstall.nothing"));
  for (const it of plan.remove) lines.push(`  ${it.what}  ${tilde(it.path)}${it.bytes ? `  (${humanBytes(it.bytes)})` : ""}`);
  lines.push("", t("uninstall.keeps"));
  for (const k of plan.keep) lines.push(`  ${k.what}: ${tilde(k.detail)}`);
  if (plan.warnings.length) {
    lines.push("");
    for (const w of plan.warnings) lines.push(`  ! ${w.detail}`);
  }
  return lines.join("\n");
}
