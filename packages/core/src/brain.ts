// What the partner thinks with right now (D150): the one place core decides it, used by the
// partner's runner (through partnerFallback) and by the settings frame every client shows, so no
// client computes it a second time.
import { HARNESSES, PARTNER_FALLBACK, isHarnessId, type Brain, type BrainHeld, type BrainNow, type BrainOption, type DeviceHarness, type HarnessId } from "@ducter/protocol";
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
  return { harness: set.harness, ...(set.model ? { model: set.model } : {}), ...(set.effort ? { effort: set.effort } : {}), auto: !chosen };
}

/**
 * D435: its own agent held: the agent answering meanwhile (no model of the setting's: its own
 * default), or, with none, the same agent with the hold, so every client can say when it is back.
 */
export function withHold(e: Omit<BrainNow, "models">, hold: (BrainHeld & { to?: HarnessId }) | undefined): Omit<BrainNow, "models"> {
  if (!hold || hold.from !== e.harness) return e;
  const { to, ...held } = hold;
  if (to) return { harness: to, auto: e.auto, why: "held", held };
  return { ...e, held };
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
    // D536: its effort levels as the live list names them, so a partner's picker can offer them.
    return { id: m.id, label: t?.label || m.label || m.id, ...(t ? { kind: t.kind } : {}), ...(own?.id === m.id || m.default ? { default: true as const } : {}), ...(m.efforts?.length ? { efforts: m.efforts } : {}), ...(m.defaultEffort ? { defaultEffort: m.defaultEffort } : {}) };
  });
}

/**
 * D536: every agent a partner may think with on the home (signed in there, HARNESSES[id].partner),
 * each with its models as brainNow lists them: what each partner's own 想事情用 picker offers.
 */
export function brainOptions(home: DeviceHarness[] | undefined, listed?: (harness: string) => ListedModel[] | undefined): BrainOption[] {
  return (home ?? [])
    .filter((h): h is DeviceHarness & { harness: HarnessId } => h.loggedIn && h.installed !== false && isHarnessId(h.harness) && HARNESSES[h.harness].partner)
    .map((h) => {
      const live = listed?.(h.harness);
      return { harness: h.harness, models: live?.length ? liveBrainRows(h.harness, live) : brainModelRows(h.harness, h) };
    });
}

/**
 * D536: what one partner thinks with as set: its own (PartnerInfo.brain) when the person gave it
 * one, else the default partner's (Settings.brain). own: it is its own (no D150 fallback applies).
 */
export function brainOf(own: Brain | undefined, set: Brain): { brain: Brain; own: boolean } {
  return own ? { brain: own, own: true } : { brain: set, own: false };
}

/**
 * The brain in use with the models its harness offers on the home (never a client's own list).
 * listed: the agent's live list as core last read it on the home (D390), when there is one.
 */
export function brainNow(set: Brain, chosen: boolean, home: DeviceHarness[] | undefined, listed?: (harness: string) => ListedModel[] | undefined, hold?: (BrainHeld & { to?: HarnessId }) | undefined): BrainNow {
  const e = withHold(effectiveBrain(set, chosen, home), hold);
  const live = listed?.(e.harness);
  if (live?.length) return { ...e, models: liveBrainRows(e.harness, live, e.model) };
  const h = home?.find((x) => x.harness === e.harness);
  return { ...e, models: brainModelRows(e.harness, h) };
}
