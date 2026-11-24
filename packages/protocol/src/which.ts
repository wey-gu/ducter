// D363: a command on PATH as it is now. Bun.which reads the PATH the process started with and
// never sees a later `process.env.PATH = …` (Bun 1.4.4, research/132), so a worker that widens its
// PATH to the person's own agent folders (core agent-path.ts) must ask with it.
export function whichNow(cmd: string, env: Record<string, string | undefined> = process.env): string | null {
  return Bun.which(cmd, { PATH: env.PATH ?? "" });
}

/**
 * D523: a command line whose program is found on PATH as it is now. Bun.spawn looks a bare name up
 * on the PATH the process started with unless it is given an env (research/132; hel's Claude Code,
 * D518), so a tool Ducter put in its own folder while running, or one the person installed since,
 * is "not found". A path (anything with a `/`) is kept as it is; a name not found is kept too, so
 * the spawn fails the way it always did.
 */
export function resolveArgv(argv: readonly string[], env: Record<string, string | undefined> = process.env): string[] {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd.includes("/")) return [...argv];
  return [whichNow(cmd, env) ?? cmd, ...rest];
}

/**
 * D523: Bun.spawn with the program resolved on PATH as it is now and, unless one is given, the
 * environment as it is now. Every spawn of a tool Ducter may install (or the person may install
 * while Ducter runs) goes through this; `spawn-guard.test.ts` fails on a bare one.
 */
export function spawnNow<const In extends Bun.SpawnOptions.Writable = "ignore", const Out extends Bun.SpawnOptions.Readable = "pipe", const Err extends Bun.SpawnOptions.Readable = "inherit">(
  argv: readonly string[],
  opts?: Bun.SpawnOptions.SpawnOptions<In, Out, Err>,
): Bun.Subprocess<In, Out, Err> {
  const env = (opts?.env as Record<string, string | undefined> | undefined) ?? process.env;
  return Bun.spawn(resolveArgv(argv, env), { ...opts, env } as Bun.SpawnOptions.SpawnOptions<In, Out, Err>);
}
