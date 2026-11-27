// D630: Cursor in Ducter. OAR 0.137.0's cursor runtime has two execution modes; in-process
// refuses SessionOptions.env (which Ducter always passes for D102), so Ducter always runs it in
// subprocess mode. A `bun build --compile` binary cannot run `process.execPath -e`, so there the
// child is Ducter itself: `ducter __cursor-child <spec>`, whose entrypoint calls OAR's exported
// `runCursorChild(spec)` (CursorSubprocessOptions.childProcess, OAR #1188). In a checkout (no
// compiled host) the default `node -e` child runs, so no hidden command is needed.
import { cursorSdkModule } from "@ducter/protocol/src/cursor.ts";

/** The hidden CLI command the compiled binary re-enters as OAR's Cursor SDK child. */
export const CURSOR_CHILD_COMMAND = "__cursor-child";

export interface CursorRuntimePlan {
  execution: "subprocess";
  sdkModule: string;
  childProcess?: { command: string; args: string[] };
}

/** Inside `bun build --compile`: modules live under Bun's virtual /$bunfs root (or isStandaloneExecutable). */
export function compiledHost(): boolean {
  if (import.meta.url.includes("$bunfs") || import.meta.path.includes("$bunfs")) return true;
  return (globalThis as { Bun?: { isStandaloneExecutable?: boolean } }).Bun?.isStandaloneExecutable === true;
}

/**
 * What `createCursorRuntime` gets on this computer. Undefined means the pinned SDK is not
 * installed in Ducter's tools folder: the card offers to add it, and a start says so plainly.
 * `envBase` is left at OAR's `inherit` on purpose: the session's env is Ducter's D102 overlay,
 * whose null entries remove everything the harness was not granted (child-env.ts).
 */
export function cursorRuntimePlan(o: { dataDir: string; compiled?: boolean; execPath?: string }): CursorRuntimePlan | undefined {
  const sdkModule = cursorSdkModule(o.dataDir);
  if (!sdkModule) return undefined;
  const compiled = o.compiled ?? compiledHost();
  return {
    execution: "subprocess",
    sdkModule,
    ...(compiled ? { childProcess: { command: o.execPath ?? process.execPath, args: [CURSOR_CHILD_COMMAND] } } : {}),
  };
}
