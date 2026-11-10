// What the partner thinks with right now (D150): the one place core decides it, used by the
// partner's runner (through partnerFallback) and by the settings frame every client shows, so no
// client computes it a second time.
import { HARNESSES, PARTNER_FALLBACK, type Brain, type BrainNow, type DeviceHarness } from "@ducter/protocol";
import { brainModelRows } from "./candidates.ts";

/**
 * The brain in use. The user's choice, or the default when nothing was chosen; but with nothing
 * chosen and Claude Code not signed in on the home, the first AI agent in PARTNER_FALLBACK that
 * is signed in there and may be the partner (D143: a Codex-only server works as it is; D177: so
 * does a DeepSeek-only or pi-only one). "only_codex" stays Codex's reason, for older clients.
 */
export function effectiveBrain(set: Brain, chosen: boolean, home: Pick<DeviceHarness, "harness" | "loggedIn">[] | undefined): Omit<BrainNow, "models"> {
  const signedIn = (id: string) => Boolean(home?.find((h) => h.harness === id)?.loggedIn);
  if (!chosen && home && !signedIn("claude-code")) {
    const next = PARTNER_FALLBACK.find((id) => id !== "claude-code" && HARNESSES[id].partner && signedIn(id));
    if (next) return { harness: next, auto: true, why: next === "codex" ? "only_codex" : "only_signed_in" };
  }
  return { harness: set.harness, ...(set.model ? { model: set.model } : {}), auto: !chosen };
}

/** The brain in use with the models its harness offers on the home (never a client's own list). */
export function brainNow(set: Brain, chosen: boolean, home: DeviceHarness[] | undefined): BrainNow {
  const e = effectiveBrain(set, chosen, home);
  const h = home?.find((x) => x.harness === e.harness);
  return { ...e, models: brainModelRows(e.harness, h) };
}
