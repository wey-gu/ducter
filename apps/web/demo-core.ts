// D337 (research/118 #23): every demo core starts here, never from `@ducter/core` directly, so a
// demo never reads this machine: no real `nmem` (its memories, its update state, its Bridge), no real
// Mem plugin check, no real sound devices or adb (the own-number steps), no real agent sessions
// (D299's "outside"). A demo that wants one of these passes its own fake, which wins; anything it
// leaves out is filled with a pretend one here. scripts/demo-core.test.ts keeps every demo on it.
import { startCore as startRealCore, type Core, type CoreOptions } from "@ducter/core";

export * from "@ducter/core";

/** A computer with nothing on it: no nmem, no Mem app, no pipx, nothing to read. */
const emptySys = {
  which: () => undefined,
  exists: () => false,
  read: () => undefined,
  list: () => [],
  real: (p: string) => p,
  home: "/Users/demo",
  platform: process.platform,
  uid: 501,
};

/** The pretend computer's own speakers and microphone (a MacBook Air's, no USB sound card yet). */
export const demoAudio = async () => ({ inputs: ["MacBook Air Microphone"], outputs: ["MacBook Air Speakers"], tool: true });

/** The pretend computer's name (the home), so no shot carries this Mac's own name. */
export const DEMO_HOME = "Ada's MacBook Air";

/** adb with no phone plugged in. */
const noPhone = async () => ({ code: 0, out: "List of devices attached\n\n", err: "" });

export function demoOptions(opts: CoreOptions = {}): CoreOptions {
  const b = opts.bridgeLink ?? {};
  const own = opts.ownNumber ?? {};
  return {
    ...opts,
    // No nmem unless the demo brings its pretend one (demo-mem.ts's fakeNmem); its env never points
    // at the real one, and nothing is installed or updated for real.
    bridgeLink: {
      ...b,
      run: b.run ?? (async () => undefined),
      exec: b.exec ?? (async () => ({ code: 1, out: "", err: "not in the demo" })),
      env: b.env ?? { PATH: "/usr/bin:/bin", NMEM_CLI_PATH: "/nonexistent/nmem" },
      sys: b.sys ?? (emptySys as never),
      ...("memApp" in b ? {} : { memApp: () => undefined }),
    } as CoreOptions["bridgeLink"],
    memPlugins: { ...(opts.memPlugins ?? {}), inspectLocal: opts.memPlugins?.inspectLocal ?? (async () => undefined) },
    ownNumber: { ...own, listAudio: own.listAudio ?? demoAudio, exec: own.exec ?? noPhone },
    // The home's name is the pretend computer's, never this Mac's own name.
    update: { ...(opts.update ?? {}), homeName: opts.update?.homeName ?? DEMO_HOME },
  };
}

/** startCore with the demo's pretend machine (see the head of this file). */
export function startCore(opts: CoreOptions = {}): Core {
  // D299: the agents' own sessions on this computer stay unread unless the demo brings its own.
  if (!opts.localAgents) process.env.DUCTER_OUTSIDE ??= "0";
  return startRealCore(demoOptions(opts));
}
