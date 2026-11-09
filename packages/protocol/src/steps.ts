// What a task's tool call was, as one quiet line of an opened task (D127): a verb label and a
// short target, the same on every harness (Claude Code, Codex, pi, DeepSeek Harness) and every
// client. Pure and language-neutral: the clients word it from `kind`, `act`, `target` and `app`
// in their i18n. The Go port (apps/desktop/internal/views/steps.go) reads the same cases from
// fixtures/steps.json, so both say a step alike.

export type StepKind = "ran" | "read" | "edited" | "searched" | "browsed" | "computer" | "waited" | "delegated" | "other";

export interface Step {
  kind: StepKind;
  /** The action within the kind: open, look, click, type, key, launch, shot, script, list, web, fetch, … */
  act?: string;
  /** What it acted on, short: a command ("bun test"), a path tail ("src/cart.ts"), a host, a key. */
  target?: string;
  /** The app it worked in, when it says ("Chrome"). */
  app?: string;
  /** More files than the target names (an edit of several files). */
  more?: number;
  /** Not a step of the work: Ducter's own tools and a harness's bookkeeping (D124). */
  hidden?: boolean;
  /** A look that may find nothing (`command -v`, `which`, `test -e`, `ls`, `grep`): a non-zero
   *  exit is "not there", said in neutral ink, never an error (D152). */
  probe?: boolean;
  /** What the agent said the step is for, when its harness carries it (Claude Code's Bash
   *  `description`, Codex's `justification`): the row's words before any summary (D152). */
  says?: string;
}

export interface ToolLike {
  name: string;
  input?: unknown;
  output?: string;
  ok?: boolean;
}

const DUCTER_TOOLS = ["report_to_main", "checkpoint", "log_search", "log_read"];
/** Bookkeeping a harness does for itself: its plan list, a computer session's sign-off. */
const BOOKKEEPING = ["TodoWrite", "TodoRead", "update_plan", "todo_write", "todowrite", "ExitPlanMode"];

const SHELL = ["Bash", "bash", "PowerShell", "shell", "exec_command", "commandExecution", "run_shell_command", "run_terminal_command", "local_shell", "run_command"];
const READ = ["Read", "read", "read_file", "NotebookRead", "view", "view_image", "ls", "LS", "list_directory"];
const EDIT = ["Edit", "Write", "MultiEdit", "NotebookEdit", "edit", "write", "apply_patch", "fileChange", "search_replace", "str_replace_editor", "write_file", "edit_file", "create_file", "delete"];
const SEARCH = ["Grep", "Glob", "grep", "glob", "find", "grep_search", "codebase_search", "semSearch", "file_search"];
const WEB_SEARCH = ["WebSearch", "webSearch", "web_search"];
const FETCH = ["WebFetch", "webFetch", "fetch", "web_fetch"];
const DELEGATE = ["Agent", "Task", "subagent", "collabAgentToolCall", "spawn_agent"];
const WAIT = ["sleep", "wait"];
/** A desktop driver's tools (cua-driver and alike): what a person would do at the computer. */
const COMPUTER_TOOLS = [
  "launch_app", "click", "double_click", "right_click", "type_text", "press_key", "hotkey", "get_window_state", "get_desktop_state",
  "list_apps", "list_windows", "screenshot", "move_cursor", "set_value", "insert_text", "invoke_menu", "run_steps", "run_script",
  "scroll", "computer", "bring_to_front", "set_window_frame", "verify_state",
];

/** mcp__server__tool → [server, tool]; anything else → ["", name]. */
export function splitTool(name: string): [string, string] {
  if (name.startsWith("mcp__")) {
    const i = name.lastIndexOf("__");
    if (i > 4) return [name.slice(5, i), name.slice(i + 2)];
  }
  return ["", name];
}

/** Ducter's own tools: never a step of the work (D124). */
export function isDucterTool(name: string): boolean {
  return /^mcp__ducter[\w-]*__/.test(name) || DUCTER_TOOLS.includes(name);
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");
function firstStr(o: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v) && typeof v.at(-1) === "string" && (v.at(-1) as string).trim()) return (v.at(-1) as string).trim();
  }
  return "";
}

/** The last two parts of a path: "src/cart.ts" (never a home folder in full). */
export function pathTail(p: string): string {
  const s = p.trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/, "");
  const parts = s.split("/").filter(Boolean);
  if (parts.length <= 2) return s.startsWith("/") && parts.length ? parts.join("/") : s;
  return parts.slice(-2).join("/");
}

/** A URL as a person says it: host and its first two path parts ("appstoreconnect.apple.com/apps"). */
export function shortUrl(u: string): string {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#\s]+)([^?#\s]*)/i.exec(u.trim());
  if (!m) return u.trim();
  const host = m[1]!.replace(/^www\./, "");
  const path = m[2]!.split("/").filter(Boolean).slice(0, 2).join("/");
  return path ? `${host}/${path}` : host;
}

const BUNDLES: Record<string, string> = {
  "com.google.chrome": "Chrome",
  "com.apple.safari": "Safari",
  "com.apple.finder": "Finder",
  "com.apple.dt.xcode": "Xcode",
  "com.apple.systempreferences": "System Settings",
  "com.apple.terminal": "Terminal",
  "com.apple.mail": "Mail",
  "com.apple.notes": "Notes",
};

/** An app's name as a person says it: "/Applications/Google Chrome.app" → "Chrome". */
export function appName(s: string): string {
  let a = s.trim().replace(/^['"]|['"]$/g, "");
  if (!a) return "";
  if (/^[a-z]{2,}\.[\w-]+\.[\w.-]+$/i.test(a) && !a.includes(" ")) {
    const known = BUNDLES[a.toLowerCase()];
    if (known) return known;
    const last = a.split(".").at(-1)!;
    return last.charAt(0).toUpperCase() + last.slice(1);
  }
  a = a.replace(/\/+$/, "").split("/").at(-1)!.replace(/\.app$/i, "");
  if (/^google chrome$/i.test(a)) return "Chrome";
  return a;
}

const APP_IN_TEXT = /(Google Chrome|Chrome|Safari|Finder|Xcode|Transporter|System Settings|Terminal|Simulator)/;
function appInText(s: string): string {
  const m = APP_IN_TEXT.exec(s);
  return m ? appName(m[1]!) : "";
}

const MOD: Record<string, string> = { super: "⌘", cmd: "⌘", command: "⌘", meta: "⌘", win: "⌘", ctrl: "⌃", control: "⌃", alt: "⌥", option: "⌥", opt: "⌥", shift: "⇧" };
const KEYS: Record<string, string> = { return: "Return", enter: "Return", tab: "Tab", escape: "Esc", esc: "Esc", space: "Space", backspace: "Delete", delete: "Delete" };

/** A key combo as macOS writes it: "super+t" → "⌘T", ["cmd","shift","4"] → "⌘⇧4". */
export function keyCombo(v: unknown): string {
  const parts = (Array.isArray(v) ? v.map(String) : String(v ?? "").split(/[+\s]+/)).map((p) => p.trim()).filter(Boolean);
  let mods = "";
  let key = "";
  for (const p of parts) {
    const l = p.toLowerCase();
    if (MOD[l]) mods += MOD[l];
    else key = KEYS[l] ?? (p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1));
  }
  return mods + key;
}

// ---------- shell commands ----------

/** `/bin/zsh -lc "…"` → the command inside (once or twice nested). */
export function unwrapShell(cmd: string): string {
  let s = cmd.trim();
  for (let i = 0; i < 2; i++) {
    const m = /^(?:\/usr\/bin\/env\s+)?(?:\/(?:usr\/)?bin\/)?(?:ba|z)?sh\s+-l?c\s+/.exec(s);
    if (!m) break;
    let rest = s.slice(m[0].length).trim();
    const q = rest.charAt(0);
    if ((q === '"' || q === "'") && rest.endsWith(q) && rest.length >= 2) {
      rest = rest.slice(1, -1);
      if (q === '"') rest = rest.replace(/\\(["\\$`])/g, "$1");
    }
    s = rest.trim();
  }
  return s;
}

const SKIP_SEGMENT = ["cd", "set", "source", ".", "export", "pushd", "popd", "unset", "true", ":", "local", "for", "while", "if", "done", "fi", "esac", "case"];
const PREFIX = ["sudo", "time", "env", "nohup", "exec", "do", "then", "else", "builtin"];

function tokens(seg: string): string[] {
  return seg.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
}
const unquote = (s: string) => s.replace(/^(["'])([\s\S]*)\1$/, "$2");

/** The tokens of the command that does the work: wrappers, `cd … &&`, `set -a; source …` and env assignments dropped. */
export function mainCommand(cmd: string): string[] {
  const segs = unwrapShell(cmd).split(/&&|\|\||[;|\n]/).map((s) => s.trim()).filter(Boolean);
  let first: string[] = [];
  for (const seg of segs) {
    let ts = tokens(seg);
    while (ts.length) {
      const t0 = ts[0]!;
      // `command git …` runs git; `command -v git` asks where git is (a probe, kept).
      if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t0) || PREFIX.includes(t0) || (t0 === "command" && !/^-[vV]$/.test(ts[1] ?? ""))) ts = ts.slice(1);
      else if (t0 === "timeout" && ts.length > 1) ts = ts.slice(/^\d/.test(ts[1]!) ? 2 : 1);
      else break;
    }
    if (!ts.length) continue;
    if (!first.length) first = ts;
    if (SKIP_SEGMENT.includes(ts[0]!)) continue;
    return ts;
  }
  return first;
}

/** Commands said by what they do, not by name (D152): "prog sub" or "prog sub subsub" → act. */
const KNOWN: Record<string, string> = {
  "nmem connect": "mem_connect",
  "nmem doctor": "mem_check",
  "nmem status": "mem_check",
  "nmem search": "mem_search",
  "gh pr create": "pr_open",
  "gh pr checks": "pr_look",
  "gh pr view": "pr_look",
  "gh pr merge": "pr_merge",
};

const base = (p: string) => unquote(p).split("/").filter(Boolean).at(-1) ?? p;
const isFlag = (t: string) => t.startsWith("-");
const SUBWORD = /^[a-z][a-z0-9:._-]*$/;

/** A shell command as one step: a read, a search, opening a page, or a run with its short name. */
export function commandStep(cmd: string): Step {
  const ts = mainCommand(cmd);
  if (!ts.length) return { kind: "ran", target: cmd.trim().split(/\s+/)[0] ?? "" };
  const prog = base(ts[0]!);
  const args = ts.slice(1);
  const plain = args.filter((a) => !isFlag(a)).map(unquote);
  const whole = unwrapShell(cmd);
  // `python3 -m pip install x` is pip.
  if (/^python[\d.]*$/.test(prog) && args[0] === "-m" && args[1] && ["pip", "pip3", "uv"].includes(args[1])) return commandStep(args.slice(1).join(" "));
  switch (prog) {
    case "command":
    case "which":
    case "type":
    case "hash":
    case "whereis":
      if (plain.length) return { kind: "searched", act: "cmd", target: plain.slice(0, 3).map(base).join(" "), probe: true };
      break;
    case "test":
    case "[":
    case "[[": {
      const p = plain.filter((a) => a !== "]" && a !== "]]" && a !== "!").at(-1);
      if (p) return { kind: "read", act: "exists", target: pathTail(p), probe: true };
      break;
    }
    case "curl":
    case "wget":
    case "http":
    case "xh": {
      const u = plain.find((a) => /^https?:\/\//.test(a)) ?? plain.find((a) => /^[\w-]+(\.[\w-]+)+(\/|$)/.test(a));
      const host = u ? shortUrl(/^https?:/.test(u) ? u : `https://${u}`).split("/")[0]! : "";
      if (/\|\s*(?:sudo\s+)?(?:ba|z)?sh\b/.test(whole)) return { kind: "ran", act: "installer", ...(host ? { target: host } : {}) };
      return { kind: "browsed", act: "request", ...(host ? { target: host } : {}) };
    }
    case "pip":
    case "pip3":
    case "pipx":
    case "uv":
    case "npm":
    case "pnpm":
    case "yarn":
    case "bun":
    case "brew":
    case "apt":
    case "apt-get":
    case "dnf":
    case "yum":
    case "cargo":
    case "gem":
    case "go": {
      const rest = prog === "uv" && plain[0] === "pip" ? plain.slice(1) : plain;
      const verb = rest[0] ?? "";
      if (["install", "add", "i"].includes(verb)) {
        const pkgs = rest.slice(1).filter((a) => !/^[<>=]/.test(a)).map((a) => base(a.replace(/@latest$/, "")));
        return { kind: "ran", act: "install", ...(pkgs.length ? { target: pkgs.slice(0, 2).join(" ") } : {}), ...(pkgs.length > 2 ? { more: pkgs.length - 2 } : {}) };
      }
      break;
    }
    case "mkdir":
      if (plain.length) return { kind: "edited", act: "mkdir", target: pathTail(plain.at(-1)!) };
      break;
    case "cat":
    case "head":
    case "tail":
    case "nl":
    case "less":
    case "more":
    case "bat":
      if (plain.length) return { kind: "read", target: pathTail(plain.at(-1)!) };
      break;
    case "sed":
      if (args.includes("-n") && !args.some((a) => a.startsWith("-i")) && plain.length) return { kind: "read", target: pathTail(plain.at(-1)!) };
      break;
    case "rg":
    case "grep":
    case "ag":
    case "ack":
      if (plain.length) return { kind: "searched", target: plain[0]!, probe: true };
      break;
    case "fd":
    case "find": {
      const i = args.indexOf("-name");
      const name = i >= 0 && args[i + 1] ? unquote(args[i + 1]!) : "";
      return { kind: "searched", target: name || pathTail(plain[0] ?? ".") };
    }
    case "ls":
    case "tree": {
      const p = plain[0] ?? ".";
      // `ls ~/.venv/bin/python*` looks for files by name; `ls src` lists a folder.
      if (/[*?]/.test(base(p))) return { kind: "searched", act: "files", target: base(p), probe: true };
      return { kind: "read", act: "list", target: pathTail(p), probe: true };
    }
    case "open": {
      const url = plain.find((a) => /^https?:\/\//.test(a));
      const ai = args.indexOf("-a");
      const app = ai >= 0 && args[ai + 1] ? appName(unquote(args[ai + 1]!)) : "";
      if (url) return { kind: "browsed", act: "open", target: shortUrl(url), ...(app ? { app } : {}) };
      if (app) return { kind: "computer", act: "launch", app };
      break;
    }
    case "osascript": {
      const m = /tell application\s+\\?"([^"\\]+)/.exec(cmd);
      return { kind: "computer", act: "script", ...(m ? { app: appName(m[1]!) } : {}) };
    }
  }
  // A command a person knows by what it does (D152): `nmem connect` connects Mem.
  const known = KNOWN[`${prog} ${plain[0] ?? ""}`] ?? KNOWN[`${prog} ${plain[0] ?? ""} ${plain[1] ?? ""}`];
  if (known) return { kind: "ran", act: known };
  // `python3 -c "…"`, `node -e "…"`: a snippet, not a script by name.
  if (/^(?:python[\d.]*|node|bun|deno|ruby|perl)$/.test(prog) && (args[0] === "-c" || args[0] === "-e")) return { kind: "ran", act: "snippet", target: prog };
  const words: string[] = [];
  for (const a of args) {
    if (words.length === 2 || !SUBWORD.test(a)) break;
    words.push(a);
  }
  if (!words.length && args[0] && !isFlag(args[0]) && /[/.]/.test(args[0])) words.push(base(args[0]));
  return { kind: "ran", target: [prog, ...words].join(" ") };
}

// ---------- a script driving the computer (Codex's js tool, alike) ----------

function scriptStep(code: string, output: string): Step {
  const app = appInText(code) || appInText(output);
  const withApp = (s: Step): Step => (app && !s.app ? { ...s, app } : s);
  const url = /https?:\/\/[^\s'"`)]+/.exec(code);
  if (url) return withApp({ kind: "browsed", act: "open", target: shortUrl(url[0]) });
  const launch = /\b(?:launch|activate|openApp)\w*\(\s*['"`]([^'"`]+)/.exec(code);
  if (launch) return { kind: "computer", act: "launch", app: appName(launch[1]!) };
  const key = /\bpressKeys?\(\s*['"`]([^'"`]+)/.exec(code);
  if (key) return withApp({ kind: "computer", act: "key", target: keyCombo(key[1]) });
  if (/\.(?:type|typeText|fill|insertText)\w*\(/.test(code)) return withApp({ kind: "computer", act: "type" });
  if (/\.(?:click|doubleClick|tap)\w*\(/.test(code)) return withApp({ kind: "computer", act: "click" });
  if (/screenshot/i.test(code)) return withApp({ kind: "computer", act: "shot" });
  return withApp({ kind: "computer", act: "script" });
}

// ---------- browsers and the computer ----------

const BROWSER_ACT: [RegExp, string][] = [
  [/navigate|goto|open_url|new_tab|tabs_create/, "open"],
  [/prepare|launch/, "launch"],
  [/click|pointer|tap/, "click"],
  [/type|fill|form_input|press|key/, "type"],
  [/select/, "select"],
  [/dialog/, "dialog"],
  [/screenshot|capture/, "shot"],
  [/scroll/, "scroll"],
  [/state|snapshot|read|find|get_page|text|content|tabs/, "look"],
];

function browserStep(tool: string, input: Record<string, unknown>): Step {
  const t = tool.toLowerCase();
  let act = "look";
  for (const [re, a] of BROWSER_ACT)
    if (re.test(t)) {
      act = a;
      break;
    }
  const url = firstStr(input, ["url", "href"]);
  if (act === "open" && url) return { kind: "browsed", act, target: shortUrl(url), app: "Chrome" };
  if (act === "launch") return { kind: "browsed", act, app: "Chrome" };
  return { kind: "browsed", act, app: "Chrome" };
}

function computerStep(tool: string, input: Record<string, unknown>): Step {
  const app = appName(firstStr(input, ["app", "app_name", "application", "bundle_id", "bundleId", "name"]));
  const withApp = (s: Step): Step => (app ? { ...s, app } : s);
  switch (tool) {
    case "launch_app":
    case "bring_to_front":
      return withApp({ kind: "computer", act: "launch" });
    case "click":
    case "double_click":
    case "right_click":
    case "move_cursor":
      return withApp({ kind: "computer", act: tool === "move_cursor" ? "pointer" : "click" });
    case "type_text":
    case "set_value":
    case "insert_text":
      return withApp({ kind: "computer", act: "type" });
    case "press_key":
    case "hotkey": {
      const mods = input.modifiers ?? input.mods;
      const k = input.key ?? input.keys ?? input.combo;
      const combo = keyCombo(Array.isArray(mods) ? [...mods.map(String), ...(Array.isArray(k) ? k.map(String) : [String(k ?? "")])] : k);
      return withApp({ kind: "computer", act: "key", ...(combo ? { target: combo } : {}) });
    }
    case "screenshot":
      return withApp({ kind: "computer", act: "shot" });
    case "invoke_menu": {
      const path = input.path ?? input.menu ?? input.menu_path;
      const t = Array.isArray(path) ? path.map(String).join(" › ") : str(path);
      return withApp({ kind: "computer", act: "menu", ...(t ? { target: t } : {}) });
    }
    case "run_steps":
    case "run_script":
      return withApp({ kind: "computer", act: "script" });
    case "scroll":
      return withApp({ kind: "computer", act: "scroll" });
  }
  return withApp({ kind: "computer", act: "look" });
}

// ---------- files ----------

function patchPaths(patch: string): string[] {
  const out: string[] = [];
  for (const m of patch.matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm)) out.push(m[1]!.trim());
  if (!out.length) for (const m of patch.matchAll(/^\+\+\+ (?:b\/)?(.+)$/gm)) if (m[1] !== "/dev/null") out.push(m[1]!.trim());
  return out;
}

function editPaths(input: unknown): string[] {
  if (typeof input === "string") return patchPaths(input);
  const o = obj(input);
  const one = firstStr(o, ["file_path", "path", "notebook_path", "filePath", "file", "target_file"]);
  if (one) return [one];
  const changes = o.changes;
  if (Array.isArray(changes)) return changes.map((c) => str(obj(c).path)).filter(Boolean);
  if (changes && typeof changes === "object") return Object.keys(changes as object);
  const patch = firstStr(o, ["patch", "input"]);
  return patch ? patchPaths(patch) : [];
}

// ---------- the step ----------

/** The agent's own short words for a shell step, when its harness carries them (D152). */
function saysOf(o: Record<string, unknown>): string {
  const d = firstStr(o, ["description", "justification"]).split("\n")[0]!.trim().replace(/[.。]$/, "");
  return d.length >= 3 && [...d].length <= 80 ? d : "";
}

/** What one tool call was, as a step. `harness` is the task's (claude-code, codex, pi, deepseek-harness). */
export function stepOf(harness: string, t: ToolLike): Step {
  void harness; // the names don't collide across the four harnesses today; kept for when they do
  if (isDucterTool(t.name)) return { kind: "other", hidden: true };
  const [server, tool] = splitTool(t.name);
  const input = t.input;
  const o = obj(input);
  if (BOOKKEEPING.includes(tool)) return { kind: "other", hidden: true };
  // A computer session's sign-off (Codex's js tool with only a completion summary): bookkeeping.
  if (tool === "js" && o.completion_summary !== undefined && o.code === undefined) return { kind: "other", hidden: true };
  if (tool === "js" || tool === "javascript" || tool === "node_repl") {
    const code = typeof input === "string" ? input : firstStr(o, ["code", "script", "source"]);
    return scriptStep(code, t.output ?? "");
  }
  if (SHELL.includes(tool)) {
    const cmd = typeof input === "string" ? input : firstStr(o, ["command", "cmd", "script", "CommandLine"]);
    const st: Step = cmd ? commandStep(cmd) : { kind: "ran" };
    const says = saysOf(o);
    return says ? { ...st, says } : st;
  }
  if (READ.includes(tool)) {
    const p = typeof input === "string" ? input : firstStr(o, ["file_path", "path", "notebook_path", "filePath", "file", "target_file", "dir", "directory"]);
    const list = tool === "ls" || tool === "LS" || tool === "list_directory";
    return { kind: "read", ...(list ? { act: "list" } : {}), ...(p ? { target: pathTail(p) } : {}) };
  }
  if (EDIT.includes(tool)) {
    const ps = [...new Set(editPaths(input))];
    return { kind: "edited", ...(ps.length ? { target: pathTail(ps[0]!) } : {}), ...(ps.length > 1 ? { more: ps.length - 1 } : {}) };
  }
  if (WEB_SEARCH.includes(tool)) {
    const q = typeof input === "string" ? input : firstStr(o, ["query", "q", "search"]);
    return { kind: "searched", act: "web", ...(q ? { target: q } : {}) };
  }
  if (FETCH.includes(tool) && !server) {
    const u = firstStr(o, ["url", "href"]);
    return { kind: "browsed", act: "fetch", ...(u ? { target: shortUrl(u) } : {}) };
  }
  if (SEARCH.includes(tool)) {
    const q = typeof input === "string" ? input : firstStr(o, ["pattern", "query", "glob", "name", "regex"]);
    return { kind: "searched", ...(q ? { target: q } : {}) };
  }
  if (DELEGATE.includes(tool)) {
    const d = firstStr(o, ["description", "prompt", "task"]);
    return { kind: "delegated", ...(d ? { target: d.split("\n")[0]! } : {}) };
  }
  if (WAIT.includes(tool)) {
    const ms = Number(o.durationMs ?? o.duration_ms ?? (Number(o.seconds) || 0) * 1000);
    return { kind: "waited", ...(ms > 0 ? { target: `${Math.round(ms / 1000)}` } : {}) };
  }
  const srv = server.toLowerCase();
  if (srv === "browser" || /playwright|puppeteer|chrome|browser/.test(srv) || tool.startsWith("browser_") || tool === "get_browser_state") return browserStep(tool, o);
  if (/cua|computer/.test(srv) || COMPUTER_TOOLS.includes(tool)) return computerStep(tool, o);
  return { kind: "other", target: tool.replace(/_/g, " ") };
}
