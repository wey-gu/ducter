// D359: a command on PATH as it is now. Bun.which reads the PATH the process started with and
// never sees a later `process.env.PATH = …` (Bun 1.4.4, research/130), so a worker that widens its
// PATH to the person's own agent folders (core agent-path.ts) must ask with it.
export function whichNow(cmd: string, env: Record<string, string | undefined> = process.env): string | null {
  return Bun.which(cmd, { PATH: env.PATH ?? "" });
}
