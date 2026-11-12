// `ducter uninstall [--all]`: take Ducter off this computer, and only Ducter.
//
//   (no --all)  the background item only: the LaunchAgent (macOS) or the systemd user unit (Linux).
//               Data stays; the app or `ducter up` brings it back.
//   --all       also the data folder (the Log, browser profiles, scratch, tasks' worktrees from
//               before D204), the tasks' working copies in the Ducter folder (D204: ~/ducter/worktrees;
//               the whole folder when nothing else is in it), the
//               ~/.local/bin/ducter link Ducter.app made (or this very binary, copied there by
//               install.sh), the /usr/local/bin/ducter link the installer made, the PATH lines it
//               added to a shell profile, Ducter's site in Caddy's Caddyfile (Caddy stays), and
//               the app's own Library folders.
//
// One Ducter at a time: `--data-dir <dir>` removes that one only. The background item goes only
// when it runs that data folder (its DUCTER_DATA_DIR; none named = ~/.ducter). What exists once
// per user (the app's folders, the ducter link) goes only with the Ducter the background item
// runs, or ~/.ducter when there is none. The plan names what stays and whose it is.
//
// Nothing outside that list is ever touched: repos and their ducter/* branches, the projects
// Ducter cloned (D204: <Ducter folder>/projects, the user's own, even inside a data folder that
// goes), harness logins, Nowledge Mem and cua-driver stay. Ducter.app itself is moved to the Trash by the app, last.
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { T } from "./i18n.ts";
import { stripDucterBlocks } from "./domain.ts";
import { UNIT_NAME, unitPath } from "./remote.ts";
import { ducterFolder, FOLDER_MARKER } from "@ducter/protocol/src/ducter-folder.ts";

export const DEFAULT_BUNDLE_ID = "co.nowledge.ducter";

export type ItemKind = "agent" | "service" | "data" | "worktree" | "folder" | "link" | "appdata" | "rc" | "caddy";
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
  /** D204: paths that stay even inside an item that goes (the projects Ducter cloned). */
  spare?: string[];
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
  /** The AI agents installed on this machine, found by probing (pi ships inside Ducter and
   *  leaves with it, so it isn't one). Each gets a keep line saying what is actually true;
   *  absent (not probed) or empty: no line, never a claim we didn't check. */
  agents?: { name: string; signedIn: boolean }[];
  /** Caddy's Caddyfile as read on this machine (absent: no Caddy, or not readable). */
  caddyfile?: { path: string; text: string };
  /** Where the installer links `ducter` for every PATH (root, or a writable /usr/local/bin). */
  globalBin?: string;
  /** D204: the environment the Ducter folder is resolved with (DUCTER_FOLDER). Default process.env. */
  env?: Record<string, string | undefined>;
}

/** The lines install.sh adds to a shell profile when ~/.local/bin isn't on PATH. */
export const RC_BEGIN = "# added by Ducter";
export const RC_END = "# end of Ducter's lines";
export const RC_FILES = [".zshrc", ".bashrc", ".bash_profile", ".profile", ".config/fish/config.fish"];

/** A profile without the lines the installer added (from RC_BEGIN through RC_END). */
export function stripRcBlock(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.startsWith(RC_BEGIN)) {
      out.push(lines[i]!);
      continue;
    }
    let j = i + 1;
    while (j < lines.length && !lines[j]!.startsWith(RC_END) && j - i < 4) j++;
    i = lines[j]?.startsWith(RC_END) ? j : i + 1;
    if (out[out.length - 1] === "") out.pop(); // the blank line the installer put before it
  }
  return out.join("\n");
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

/**
 * The worktrees in a worktrees folder (<dataDir>/worktrees before D204, <Ducter folder>/worktrees
 * since): <taskId> before D198, <repo>/<branch slug> since. A folder with a `.git` is one; any
 * other folder is a repo's, and its folders are looked at.
 */
export function ducterWorktrees(root: string): string[] {
  const dirs = (d: string) => readdirSync(d).map((n) => join(d, n)).filter((p) => statSync(p).isDirectory());
  const out: string[] = [];
  for (const d of dirs(root)) {
    if (existsSync(join(d, ".git"))) out.push(d);
    else for (const w of dirs(d)) if (existsSync(join(w, ".git"))) out.push(w);
  }
  return out;
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

/** The `ducter` at p is this very binary (a copy install.sh put there), not a link. */
export function isThisBinary(p: string, execPath: string): boolean {
  try {
    if (lstatSync(p).isSymbolicLink()) return false;
    return realpathSync(p) === realpathSync(execPath);
  } catch {
    return false;
  }
}

/** A symlink the installer made: to this binary, to ~/.local/bin/ducter, or into a Ducter.app
 *  (an app that's gone counts; another existing copy's link stays). */
export function pointsAtDucter(p: string, execPath: string, userBin: string): boolean {
  try {
    if (!lstatSync(p).isSymbolicLink()) return false;
    const to = readlinkSync(p);
    if (to === userBin) return true;
    if (to.endsWith("/Contents/Helpers/ducter")) return isAppLink(p, execPath);
    return existsSync(to) && realpathSync(to) === realpathSync(execPath);
  } catch {
    return false;
  }
}

/** The data folder a background item (LaunchAgent plist or systemd unit) runs; null: none named. */
export function backgroundDataDir(file: string): string | null {
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const plist = /<key>DUCTER_DATA_DIR<\/key>\s*<string>([^<]+)<\/string>/.exec(text);
  if (plist) return plist[1]!.trim();
  const unit = /^Environment="?DUCTER_DATA_DIR=([^"\n]+)"?\s*$/m.exec(text);
  return unit ? unit[1]!.trim() : null;
}

/** The same folder, with symlinks resolved where it exists (/tmp is /private/tmp on macOS). */
export function sameDir(a: string, b: string): boolean {
  const real = (p: string) => {
    try {
      return realpathSync(p);
    } catch {
      return resolve(p);
    }
  };
  return resolve(a) === resolve(b) || real(a) === real(b);
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
  const spare: string[] = [];
  // D204: the tasks' working copies there: their repos are pruned after, an unsaved one warned.
  const countWorktrees = (root: string) => {
    let wts: string[] = [];
    try {
      wts = ducterWorktrees(root);
    } catch {}
    for (const wt of wts) {
      const repo = worktreeRepo(wt);
      if (repo && !repos.includes(repo)) repos.push(repo);
      const st = git(wt, ["status", "--porcelain"]);
      if (st && st.trim()) warnings.push({ id: "unsaved-worktree", detail: t("uninstall.warn.unsaved", { name: basename(wt), repo: repo ?? "?" }), path: wt });
    }
    return wts.length;
  };

  // The background item, when it runs this data folder; another Ducter's stays.
  const defaultDir = join(home, ".ducter");
  const bg = i.platform === "darwin" ? plistPath(home, i.agentLabel) : i.platform === "linux" ? unitPath(home) : undefined;
  const bgKind: "agent" | "service" = i.platform === "darwin" ? "agent" : "service";
  const bgDir = bg && exists(bg) ? (backgroundDataDir(bg) ?? defaultDir) : undefined;
  const ownsBackground = bgDir !== undefined && sameDir(bgDir, i.dataDir);
  // What exists once per user belongs to the Ducter the background item runs, else the default one.
  const owner = bgDir ?? defaultDir;
  const ownsGlobal = sameDir(owner, i.dataDir);
  const others = t("uninstall.keep.otherInstance", { dir: owner });
  if (bg && ownsBackground) remove.push({ path: bg, what: t(`uninstall.item.${bgKind}`), kind: bgKind });
  else if (bgDir !== undefined) keep.push({ what: t(`uninstall.item.${bgKind}`), detail: others });

  if (i.all) {
    if (exists(i.dataDir)) {
      if (!dataDirIsOurs(i.dataDir, home)) {
        warnings.push({ id: "unsafe-data-dir", detail: t("uninstall.warn.unsafe", { dir: i.dataDir }), path: i.dataDir });
      } else {
        const n = countWorktrees(join(i.dataDir, "worktrees"));
        remove.push({ path: i.dataDir, what: t("uninstall.item.data", { n }), kind: "data", bytes: sizeOf(i.dataDir) });
      }
    }
    // D204: the Ducter folder: its worktrees go; the projects Ducter cloned are the user's and stay
    // (said in the listing); the folder itself goes only when nothing but Ducter's is in it.
    const folder = ducterFolder({ home, dataDir: i.dataDir, ...(i.env ? { env: i.env } : {}) }).path;
    if (exists(join(folder, FOLDER_MARKER))) {
      const projects = join(folder, "projects");
      let mine: string[] = [];
      try {
        mine = readdirSync(projects).filter((n) => !n.startsWith("."));
      } catch {}
      const others = (() => {
        try {
          return readdirSync(folder).filter((n) => n !== FOLDER_MARKER && n !== "worktrees" && n !== "projects" && n !== ".DS_Store");
        } catch {
          return [];
        }
      })();
      const insideData = folder.startsWith(resolve(i.dataDir) + "/");
      const wtRoot = join(folder, "worktrees");
      const n = exists(wtRoot) ? countWorktrees(wtRoot) : 0;
      if (!mine.length && !others.length && !insideData) remove.push({ path: folder, what: t("uninstall.item.folder", { n }), kind: "folder", bytes: sizeOf(folder) });
      else if (exists(wtRoot) && !insideData) remove.push({ path: wtRoot, what: t("uninstall.item.worktrees", { n }), kind: "worktree", bytes: sizeOf(wtRoot) });
      if (mine.length) {
        spare.push(projects);
        keep.push({ what: t("uninstall.keep.projects", { n: mine.length }), detail: t("uninstall.keep.projects.detail", { dir: projects }) });
      }
    }
    const link = join(home, ".local", "bin", "ducter");
    if (!ownsGlobal) {
      if (exists(link)) keep.push({ what: link, detail: others });
    } else if (isAppLink(link, i.execPath)) remove.push({ path: link, what: t("uninstall.item.link"), kind: "link" });
    else if (isThisBinary(link, i.execPath)) remove.push({ path: link, what: t("uninstall.item.link"), kind: "link" });
    else if (exists(link)) {
      let to = "";
      try {
        if (lstatSync(link).isSymbolicLink()) to = readlinkSync(link);
      } catch {}
      keep.push({ what: link, detail: to ? t("uninstall.keep.otherLink", { path: link, to }) : t("uninstall.keep.copied", { path: link }) });
    }

    if (ownsGlobal) {
      // The installer's /usr/local/bin link, when it leads to this Ducter (or to nothing now).
      const g = join(i.globalBin ?? "/usr/local/bin", "ducter");
      if (pointsAtDucter(g, i.execPath, link)) remove.push({ path: g, what: t("uninstall.item.link"), kind: "link" });
      for (const f of RC_FILES) {
        const p = join(home, f);
        let text = "";
        try {
          text = readFileSync(p, "utf8");
        } catch {
          continue;
        }
        if (text.split("\n").some((l) => l.startsWith(RC_BEGIN))) remove.push({ path: p, what: t("uninstall.item.rc"), kind: "rc" });
      }
      const cf = i.caddyfile;
      const domains = cf ? stripDucterBlocks(cf.text).domains : [];
      if (cf && domains.length) remove.push({ path: cf.path, what: t("uninstall.item.caddy", { domains: domains.join(", ") }), kind: "caddy" });
    }

    if (i.platform === "darwin" && !ownsGlobal) {
      keep.push({ what: t("uninstall.item.appdata"), detail: others });
    } else if (i.platform === "darwin") {
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
    ...(i.all && i.caddyfile ? [{ what: "Caddy", detail: t("uninstall.keep.caddy.detail") }] : []),
    ...(i.agents ?? []).map((a) => ({ what: a.name, detail: t(a.signedIn ? "uninstall.keep.agent.signedIn" : "uninstall.keep.agent.installed") })),
    { what: "Nowledge Mem", detail: t("uninstall.keep.mem.detail") },
    { what: "cua-driver", detail: t("uninstall.keep.cua.detail") },
  );
  if (i.platform === "darwin" && ownsGlobal) keep.push({ what: "Ducter.app", detail: t(i.fromApp ? "uninstall.keep.app.fromApp" : "uninstall.keep.app") });
  return { remove, keep, warnings, repos, ...(spare.length ? { spare } : {}) };
}

/** D204: `p` removed, except whatever lies on the way to a spared path (that stays whole). */
function rmExcept(p: string, spare: string[]) {
  const on = spare.filter((s) => s.startsWith(p + "/"));
  if (spare.includes(p)) return;
  if (!on.length) return rmSync(p, { recursive: true, force: true });
  for (const n of readdirSync(p)) rmExcept(join(p, n), on);
}

export interface Runner {
  /** launchctl / systemctl; never throws. */
  run(cmd: string[]): Promise<{ code: number; stdout: string }>;
  /** Takes Ducter's site out of the Caddyfile at path and reloads Caddy (needs root). */
  removeCaddySite?(path: string): Promise<{ ok: boolean; error?: string }>;
  /** Whether a Ducter still answers /health on the port. */
  healthy(port: number): Promise<boolean>;
  /** D228: stops 在哪儿都能用's tunnel kept in this data folder (it outlives Ducter by design). */
  stopTunnel?(dataDir: string): Promise<void>;
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
      rmExcept(p, plan.spare ?? []);
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
  for (const it of rest) {
    if (it.kind === "data") await o.runner.stopTunnel?.(it.path).catch(() => {});
    if (it.kind === "rc") {
      // A shell profile is the user's: only Ducter's lines leave it.
      try {
        writeFileSync(it.path, stripRcBlock(readFileSync(it.path, "utf8")));
        res.removed.push(it.path);
      } catch (e) {
        res.failed.push({ path: it.path, error: e instanceof Error ? e.message : String(e) });
      }
    } else if (it.kind === "caddy") {
      const r = o.runner.removeCaddySite ? await o.runner.removeCaddySite(it.path) : { ok: false, error: "no way to edit Caddy here" };
      if (r.ok) res.removed.push(it.path);
      else res.failed.push({ path: it.path, error: r.error ?? "" });
    } else rm(it.path);
  }
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
