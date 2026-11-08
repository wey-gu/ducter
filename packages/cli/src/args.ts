// Argument parsing for `ducter`. Pure: no env, no I/O, so it is easy to test.

export type Command = "up" | "open" | "doctor" | "status" | "version" | "help";

export interface Args {
  command: Command;
  port?: number;
  dataDir?: string;
  desktop: boolean; // false with --no-desktop
  json: boolean;
}

export type ParseResult = { ok: true; args: Args } | { ok: false; error: { key: "err.unknownCommand" | "err.unknownFlag" | "err.missingValue" | "err.badPort"; vars: Record<string, string> } };

const COMMANDS = new Set<Command>(["up", "open", "doctor", "status", "version", "help"]);
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
      case "--json":
        args.json = true;
        continue;
      case "-h":
      case "--help":
        args.command = "help";
        continue;
    }
    if (a.startsWith("-")) return { ok: false, error: { key: "err.unknownFlag", vars: { flag: a } } };
    if (commandSeen) return { ok: false, error: { key: "err.unknownCommand", vars: { cmd: a } } };
    if (!COMMANDS.has(a as Command)) return { ok: false, error: { key: "err.unknownCommand", vars: { cmd: a } } };
    args.command = a as Command;
    commandSeen = true;
  }
  return { ok: true, args };
}
