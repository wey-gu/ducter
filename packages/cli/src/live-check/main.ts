// D463: `ducter check list | run <name> [--opt value…] | report [--json]`. A maintainer's command,
// left out of `ducter help`: it ships in the binary so it runs on hel, a worker or a bare Mac
// without the repo. Results: ~/.ducter/checks/YYYY-MM-DD-<name>.json (DUCTER_CHECKS_DIR overrides).
import { CHECKS, checkNamed } from "./checks.ts";
import { type CheckEnv, checksDir, latest, listJson, listText, reportText, runCheck, todoLine, writeResult } from "./kit.ts";

export interface CheckMainIo {
  env: CheckEnv;
  out(text: string): void;
}

const USAGE = `ducter check list [--json]            the owed live checks: what each needs, how long, its last result
ducter check run <name> [--opt value]  run one; it asks you for the step that is yours
ducter check report [--json]          where each stands, and the line for design/todo.md`;

/** Options after the check's name: --name value (repeatable), --flag alone is "true". */
export function parseOpts(argv: readonly string[]): { opts: Record<string, string[]>; json: boolean; rest: string[] } {
  const opts: Record<string, string[]> = {};
  const rest: string[] = [];
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--json") json = true;
    else if (a.startsWith("--")) {
      const [k, inline] = a.slice(2).split(/=(.*)/s, 2) as [string, string | undefined];
      const v = inline ?? (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith("--") ? argv[++i]! : "true");
      (opts[k] ??= []).push(v);
    } else rest.push(a);
  }
  return { opts, json, rest };
}

export async function checkMain(argv: readonly string[], io: CheckMainIo): Promise<number> {
  const { opts, json, rest } = parseOpts(argv);
  const dir = checksDir(io.env.dataDir, io.env.vars);
  const [verb, name] = rest;
  if (!verb || verb === "list") {
    const last = latest(dir);
    io.out(json ? JSON.stringify(listJson(CHECKS, last), null, 2) : listText(CHECKS, last));
    return 0;
  }
  if (verb === "report") {
    const last = latest(dir);
    if (json) io.out(JSON.stringify(CHECKS.map((c) => ({ name: c.name, todo: c.todo, ...(last.get(c.name) ? { outcome: last.get(c.name)!.result.outcome, date: last.get(c.name)!.result.date, file: last.get(c.name)!.file, todoLine: todoLine(last.get(c.name)!) } : { outcome: "never" }) })), null, 2));
    else io.out(reportText(CHECKS, last, dir));
    return 0;
  }
  if (verb === "run") {
    const c = name ? checkNamed(name) : undefined;
    if (!c) {
      io.out(`${name ? `No check named ${name}.` : "Which check?"} ducter check list shows them.`);
      return 2;
    }
    io.out(`${c.name} (${c.decisions.join(" ")}): ${c.title}\nneeds: ${c.needs.join("; ")}\n`);
    const r = await runCheck(c, io.env, opts);
    const file = writeResult(dir, r, io.env.home);
    io.out(json ? JSON.stringify({ outcome: r.outcome, file }) : `\n${r.outcome.toUpperCase()}: ${file}`);
    return r.outcome === "fail" ? 1 : 0;
  }
  io.out(USAGE);
  return 2;
}
