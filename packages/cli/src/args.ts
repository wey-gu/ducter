// Argument parsing for `ducter`. Pure: no env, no I/O, so it is easy to test.

export type Command = "up" | "open" | "doctor" | "status" | "version" | "help" | "pair" | "devices" | "service" | "worker" | "uninstall" | "report" | "merge" | "undo" | "task" | "say" | "tail" | "answer";

export interface Args {
  command: Command;
  port?: number;
  dataDir?: string;
  desktop: boolean; // false with --no-desktop
  json: boolean;
  headless?: boolean; // a server: no desktop, never opens anything
  worker?: boolean; // service install --worker; pair --worker (hidden alias: a code fixed to a worker)
  host?: string; // interface to bind; only ever set on purpose
  name?: string; // this device's name when joining as a worker
  join?: string; // worker: the main process's address (`ducter worker <address>`; --join is a hidden alias)
  code?: string; // worker: a pairing code
  rest?: string[]; // words after devices / service (e.g. "revoke <id>")
  all?: boolean; // uninstall --all: everything, not only the background item
  dryRun?: boolean; // uninstall --dry-run: only the plan
  yes?: boolean; // uninstall --all --yes: no typed confirmation
  includeConversation?: boolean; // report --include-conversation
  out?: string; // report --out <dir>
  repo?: string; // task --repo <dir> (or "none": no particular place)
  agent?: string; // task --agent <name>: who does it (pinned for this task)
  base?: string; // task --base <branch>: what it starts from
  timeout?: number; // say --timeout <seconds>
}

export type ParseResult = { ok: true; args: Args } | { ok: false; error: { key: "err.unknownCommand" | "err.unknownFlag" | "err.missingValue" | "err.badPort" | "err.badTimeout"; vars: Record<string, string> } };

const COMMANDS = new Set<Command>(["up", "open", "doctor", "status", "version", "help", "pair", "devices", "service", "worker", "uninstall", "report", "merge", "undo", "task", "say", "tail", "answer"]);
/** Commands that take words after them (`ducter devices revoke a1b2`, `ducter service install`). */
const WITH_REST = new Set<Command>(["devices", "service", "merge", "undo", "open", "task", "say", "tail", "answer"]);
const ALIASES: Record<string, Command> = {
  "-v": "version",
  "--version": "version",
  "-h": "help",
  "--help": "help",
  start: "up",
};

/** `argv` is the user part only (process.argv.slice(2)). No command means `up`. */
export function parseArgs(argv: string[]): ParseResult {
  const args: Args = { command: "up", desktop: true, json: false };
  let commandSeen = false;
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i]!;
    let inline: string | undefined;
    if (a.startsWith("--") && a.includes("=")) [a, inline] = [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)];
    const value = () => {
      if (inline !== undefined) return inline;
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("-")) return undefined;
      i++;
      return v;
    };
    if (!commandSeen && ALIASES[a]) {
      args.command = ALIASES[a]!;
      commandSeen = true;
      continue;
    }
    switch (a) {
      case "--port":
      case "-p": {
        const v = value();
        if (v === undefined) return { ok: false, error: { key: "err.missingValue", vars: { flag: a } } };
        const n = Number(v);
        if (!/^\d+$/.test(v) || n < 1 || n > 65535) return { ok: false, error: { key: "err.badPort", vars: { value: v } } };
        args.port = n;
        continue;
      }
      case "--data-dir": {
        const v = value();
        if (v === undefined) return { ok: false, error: { key: "err.missingValue", vars: { flag: a } } };
        args.dataDir = v;
        continue;
      }
      case "--no-desktop":
        args.desktop = false;
        continue;
      case "--worker":
        args.worker = true;
        continue;
      case "--headless":
        args.headless = true;
        args.desktop = false;
        continue;
      case "--host":
      case "--name":
      case "--join":
      case "--code": {
        const v = value();
        if (v === undefined || !v.trim()) return { ok: false, error: { key: "err.missingValue", vars: { flag: a } } };
        args[a.slice(2) as "host" | "name" | "join" | "code"] = v.trim();
        continue;
      }
      case "--json":
        args.json = true;
        continue;
      case "--all":
        args.all = true;
        continue;
      case "--dry-run":
        args.dryRun = true;
        continue;
      case "--yes":
      case "-y":
        args.yes = true;
        continue;
      case "--include-conversation":
        args.includeConversation = true;
        continue;
      case "--repo":
      case "--agent":
      case "--base": {
        const v = value();
        if (v === undefined || !v.trim()) return { ok: false, error: { key: "err.missingValue", vars: { flag: a } } };
        args[a.slice(2) as "repo" | "agent" | "base"] = v.trim();
        continue;
      }
      case "--timeout": {
        const v = value();
        if (v === undefined) return { ok: false, error: { key: "err.missingValue", vars: { flag: a } } };
        if (!/^\d+$/.test(v) || Number(v) < 1) return { ok: false, error: { key: "err.badTimeout", vars: { value: v } } };
        args.timeout = Number(v);
        continue;
      }
      case "--out": {
        const v = value();
        if (v === undefined || !v.trim()) return { ok: false, error: { key: "err.missingValue", vars: { flag: a } } };
        args.out = v;
        continue;
      }
      case "-h":
      case "--help":
        args.command = "help";
        continue;
    }
    if (a.startsWith("-")) return { ok: false, error: { key: "err.unknownFlag", vars: { flag: a } } };
    if (commandSeen && WITH_REST.has(args.command)) {
      (args.rest ??= []).push(a);
      continue;
    }
    // `ducter worker <address> --code <code>` (D83): the address is the one word it takes.
    if (commandSeen && args.command === "worker" && args.join === undefined) {
      args.join = a;
      continue;
    }
    if (commandSeen) return { ok: false, error: { key: "err.unknownCommand", vars: { cmd: a } } };
    if (!COMMANDS.has(a as Command)) return { ok: false, error: { key: "err.unknownCommand", vars: { cmd: a } } };
    args.command = a as Command;
    commandSeen = true;
  }
  return { ok: true, args };
}
