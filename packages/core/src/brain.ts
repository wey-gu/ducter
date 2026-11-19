// What the partner thinks with right now (D150): the one place core decides it, used by the
// partner's runner (through partnerFallback) and by the settings frame every client shows, so no
// client computes it a second time.
import { HARNESSES, PARTNER_FALLBACK, type Brain, type BrainNow, type DeviceHarness } from "@ducter/protocol";
import type { ListedModel } from "@ducter/protocol/src/internal.ts";
import { brainModelRows, tierOf } from "./candidates.ts";
import { defaultModelOf, ROW_MAX, shortModels } from "./models.ts";

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

/**
 * D390: the partner's models from the agent's own live list on the home (the catalog the task
 * composer reads, D202/D352): its named ones as the task card's row has them (Claude Code: not its
 * pinned versions nor "default"), at most ROW_MAX, the one it thinks with now always among them.
 * The tier table gives a known model its kind and plain words; a model it doesn't know has no kind.
 */
export function liveBrainRows(harness: string, list: ListedModel[], current?: string): BrainNow["models"] {
  const short = shortModels(harness, list);
  let row = short.slice(0, ROW_MAX);
  if (current && !row.some((m) => m.id === current)) {
    const c = list.find((m) => m.id === current);
    if (c) row = [...row.slice(0, ROW_MAX - 1), c];
  }
  const own = defaultModelOf(harness, list);
  return row.map((m) => {
    const t = tierOf(harness, m.id);
    return { id: m.id, label: t?.label || m.label || m.id, ...(t ? { kind: t.kind } : {}), ...(own?.id === m.id || m.default ? { default: true as const } : {}) };
  });
}

/**
 * The brain in use with the models its harness offers on the home (never a client's own list).
 * listed: the agent's live list as core last read it on the home (D390), when there is one.
 */
export function brainNow(set: Brain, chosen: boolean, home: DeviceHarness[] | undefined, listed?: (harness: string) => ListedModel[] | undefined): BrainNow {
  const e = effectiveBrain(set, chosen, home);
  const live = listed?.(e.harness);
  if (live?.length) return { ...e, models: liveBrainRows(e.harness, live, e.model) };
  const h = home?.find((x) => x.harness === e.harness);
  return { ...e, models: brainModelRows(e.harness, h) };
}
