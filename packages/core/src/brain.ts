// What the partner thinks with right now (D150): the one place core decides it, used by the
// partner's runner (through partnerFallback) and by the settings frame every client shows, so no
// client computes it a second time.
import type { Brain, BrainNow, DeviceHarness } from "@ducter/protocol";
import { brainModelRows } from "./candidates.ts";

/**
 * The brain in use. The user's choice, or the default when nothing was chosen; but with nothing
 * chosen, Claude Code not signed in on the home and Codex signed in, Codex (D143: a Codex-only
 * server works as it is).
 */
export function effectiveBrain(set: Brain, chosen: boolean, home: Pick<DeviceHarness, "harness" | "loggedIn">[] | undefined): Omit<BrainNow, "models"> {
  const signedIn = (id: string) => Boolean(home?.find((h) => h.harness === id)?.loggedIn);
  if (!chosen && home && !signedIn("claude-code") && signedIn("codex")) return { harness: "codex", auto: true, why: "only_codex" };
  return { harness: set.harness, ...(set.model ? { model: set.model } : {}), auto: !chosen };
}

/** The brain in use with the models its harness offers on the home (never a client's own list). */
export function brainNow(set: Brain, chosen: boolean, home: DeviceHarness[] | undefined): BrainNow {
  const e = effectiveBrain(set, chosen, home);
  const h = home?.find((x) => x.harness === e.harness);
  return { ...e, models: brainModelRows(e.harness, h) };
}
