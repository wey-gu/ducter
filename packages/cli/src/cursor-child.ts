// D630: OAR's Cursor SDK child, re-entered in the compiled binary. OAR's
// CursorSubprocessOptions.childProcess spawns `command [...args, spec]`; this binary's command is
// `ducter`, its args `__cursor-child`, and here the spec goes straight to OAR's runCursorChild,
// which takes over the process (IPC, signals, exit). Never reached in a checkout, where OAR runs
// its own `bun/node -e` child.
import { CURSOR_CHILD_COMMAND } from "@ducter/runner/src/cursor.ts";

/** The spec this argv asks for, or undefined when it is any other command. */
export function cursorChildSpec(argv: readonly string[]): string | undefined {
  return argv[0] === CURSOR_CHILD_COMMAND && typeof argv[1] === "string" && argv[1].trim() !== "" ? argv[1] : undefined;
}

/**
 * Run the hidden child. Returns a code only for a malformed invocation: a valid spec never returns
 * (runCursorChild exits the process when the host shuts it down or dies).
 */
export async function runCursorChildCommand(argv: readonly string[]): Promise<number> {
  if (argv[0] !== CURSOR_CHILD_COMMAND) return 2;
  const spec = cursorChildSpec(argv);
  if (!spec) return 2;
  const { runCursorChild } = await import("@botiverse/oar/runtimes/cursor");
  runCursorChild(spec);
  return 0;
}
