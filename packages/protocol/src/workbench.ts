// D214: the opened task's workbench (工作台 / Workbench): what a developer looks at and works with
// beside a working agent. Its Changes, Files and Preview are read (and a file written) on the
// computer the task works on, inside the task's own working copy only (its worktree, or its
// folder), never Ducter's data folder (D207). One request/answer frame pair (`wb`) carries them;
// each op is small and capped, so a phone on a slow link never waits on a big answer.

/** A file or folder in the task's working copy (one level; folders open on a tap). */
export interface WbEntry {
  name: string;
  /** d: a folder; f: a file; l: a link (shown, not followed). */
  kind: "d" | "f" | "l";
  size?: number;
  /** Changed by the task (repo: vs its base; folder: vs the copy kept, D142). */
  changed?: "added" | "modified" | "deleted" | "renamed";
}

/** One file the task changed. adds/dels: lines; absent for a binary file. */
export interface WbChange {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  from?: string;
  adds?: number;
  dels?: number;
  binary?: boolean;
}

/** A web page the task runs: a port listening on the task's computer. */
export interface WbPort {
  port: number;
  /** How it was found: the task said it (a URL in its output), or a process in its working copy listens there. */
  via: "said" | "listening";
  /** The process that listens, when it can be told (`node`, `bun`, `python3`). */
  command?: string;
  /** The page's own <title>, read once (best effort). */
  title?: string;
}

export type WbRequest =
  | { op: "files"; path: string }
  | { op: "read"; path: string }
  // base: the version the editor opened (read's `version`); a file changed since is refused with `conflict`.
  | { op: "write"; path: string; text: string; base: string }
  | { op: "changes" }
  | { op: "diff"; path: string }
  // Puts one file back as its base has it (repo: the merge base; a folder: D142's per-file undo).
  | { op: "revert"; path: string }
  | { op: "ports" }
  // The address the client shows this port's page at (a preview of its own, preview.ts).
  | { op: "preview"; port: number }
  // D220: the booted iOS Simulators on the task's computer, when they are this task's business
  // (it touched one, or its working copy is an app project); none elsewhere.
  | { op: "sims" }
  // One frame of a simulator's screen, its long edge at most `edge` px (a JPEG).
  | { op: "sim_frame"; udid: string; edge?: number }
  // One of the controls simctl has (research/64): Home, dark or light, text size, open a link, a
  // full screenshot. No taps: simctl has none.
  | { op: "sim_act"; udid: string; act: SimAct; value?: string };

export type WbAnswer =
  | { op: "files"; path: string; entries: WbEntry[]; more: number }
  | {
      op: "read";
      path: string;
      size: number;
      /** A content hash: what a write must name as its base. */
      version: string;
      text?: string;
      /** Not text (a NUL in its first 8 KB, or not UTF-8). */
      binary?: boolean;
      /** A picture small enough to show (data: URL). */
      image?: string;
      /** Over the cap: shown only as its size. */
      tooBig?: boolean;
    }
  | { op: "write"; path: string; version: string }
  | { op: "changes"; kind: "repo" | "folder" | "none"; base?: string; files: WbChange[]; more: number }
  | { op: "diff"; path: string; patch: string; binary?: boolean; truncated?: boolean }
  | { op: "revert"; path: string; message: string }
  | { op: "ports"; ports: WbPort[] }
  | { op: "preview"; port: number; /** Where the page is, from the client's own address: a port of its own. */ previewPort: number; token: string }
  | { op: "sims"; sims: WbSim[] }
  | { op: "sim_frame"; udid: string; /** data: URL (JPEG) */ image: string; w: number; h: number }
  // shot: the full screenshot (a PNG data: URL); otherwise the simulator's settings after the act.
  | { op: "sim_act"; udid: string; act: SimAct; sim?: WbSim; image?: string };

/** D220: a booted iOS Simulator on the task's computer. */
export interface WbSim {
  udid: string;
  /** Its own name ("iPhone 16e"). */
  name: string;
  /** The runtime, said as Apple says it ("iOS 26.3"). */
  os: string;
  appearance?: "light" | "dark";
  text?: SimText;
}

export type SimAct = "home" | "appearance" | "text" | "url" | "shot";

/** Text size in four steps (T3 Code's, research/64), each a content size category of iOS's own. */
export type SimText = "small" | "default" | "large" | "xlarge";
export const SIM_TEXT: Record<SimText, string> = { small: "small", default: "large", large: "extra-extra-large", xlarge: "accessibility-large" };

/** The step a content size category falls in (categories between steps go to the nearer one below). */
export function simTextOf(category: string): SimText | undefined {
  const order = ["extra-small", "small", "medium", "large", "extra-large", "extra-extra-large", "extra-extra-extra-large", "accessibility-medium", "accessibility-large", "accessibility-extra-large", "accessibility-extra-extra-large", "accessibility-extra-extra-extra-large"];
  const i = order.indexOf(category.trim().toLowerCase());
  if (i < 0) return undefined;
  if (i <= 2) return "small";
  if (i <= 4) return "default";
  if (i <= 7) return "large";
  return "xlarge";
}

/** A link a simulator may open: a scheme and something after it, no file: (that reads this computer). */
export function simLinkOk(u: unknown): u is string {
  return typeof u === "string" && u.length <= 2048 && /^[a-z][a-z0-9+.-]{0,30}:\S+$/i.test(u) && !/^file:/i.test(u);
}

/** A simulator's udid as simctl prints it. */
export const isUdid = (u: unknown): u is string => typeof u === "string" && /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(u);

/** Whether a task's own words or commands touched an iOS Simulator (the home reads them from the Log). */
export function simsSaid(text: string): boolean {
  return /\bsimctl\b|\biOS Simulator\b|\bSimulator\.app\b|\biphonesimulator\b|\bxcodebuild\b[^\n]{0,240}\bsimulator\b/i.test(text);
}

/** Whether a folder's entries say it holds an iOS app (an Xcode project or workspace, or an ios/ folder). */
export const appProject = (names: string[]): boolean => names.some((n) => /\.(xcodeproj|xcworkspace)$/i.test(n) || n === "ios");

/** Why a workbench op was refused (the client says it in words). */
export type WbError = "outside" | "missing" | "conflict" | "too_big" | "binary" | "not_text" | "offline" | "busy" | "unsupported" | "failed";

/** Caps: what a read shows, what a write takes, how many entries a folder lists. */
export const WB_READ_CAP = 1024 * 1024;
export const WB_IMAGE_CAP = 2 * 1024 * 1024;
export const WB_WRITE_CAP = 1024 * 1024;
export const WB_LIST_CAP = 2000;
export const WB_DIFF_CAP = 400 * 1024;
export const WB_CHANGES_CAP = 1000;

/** Folders never listed: a repo's own git folder; dependency trees are listed but never opened by default. */
export const WB_HIDDEN = new Set([".git", ".DS_Store"]);
export const WB_HEAVY = new Set(["node_modules", ".next", "dist", "build", "target", ".venv", "__pycache__", ".turbo", ".cache"]);

/** A relative path inside a working copy: "/"-separated, no "..", no leading "/", no NUL. */
export function cleanRel(p: unknown): string | undefined {
  if (typeof p !== "string" || p.length > 4096 || p.includes("\0")) return undefined;
  const parts = p.replace(/\\/g, "/").split("/").filter((s) => s && s !== ".");
  if (parts.some((s) => s === "..")) return undefined;
  return parts.join("/");
}

/** Local addresses a task prints for a page it serves (`http://localhost:5173/`, `127.0.0.1:3000`). */
const LOCAL_URL = /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\])(?::(\d{2,5}))\b/gi;

/** The ports a text names as local pages, in the order they appear (no duplicates). */
export function portsSaid(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(LOCAL_URL)) {
    const n = Number(m[1]);
    if (n >= 1024 && n <= 65535 && !out.includes(n)) out.push(n);
  }
  return out;
}

/** The language a file is highlighted as, from its name (a small fixed set; the rest plain). */
export function langOf(path: string): string {
  const name = path.split("/").pop()!.toLowerCase();
  if (name === "dockerfile") return "shell";
  if (name === "makefile") return "make";
  const ext = name.includes(".") ? name.split(".").pop()! : "";
  const map: Record<string, string> = {
    ts: "ts", tsx: "ts", mts: "ts", cts: "ts", js: "js", jsx: "js", mjs: "js", cjs: "js",
    json: "json", jsonc: "json", go: "go", rs: "rust", py: "py", rb: "rb", swift: "swift", kt: "kotlin", kts: "kotlin", java: "java",
    c: "c", h: "c", cc: "c", cpp: "c", hpp: "c", m: "c", cs: "c",
    css: "css", scss: "css", less: "css", html: "html", htm: "html", vue: "html", svelte: "html", xml: "html", svg: "html",
    md: "md", mdx: "md", markdown: "md", yml: "yaml", yaml: "yaml", toml: "toml", ini: "toml",
    sh: "shell", bash: "shell", zsh: "shell", fish: "shell", sql: "sql",
  };
  return map[ext] ?? "plain";
}
