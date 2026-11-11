// D202 (design/new-task.md "Model and effort"): the models each AI agent's account offers on each
// computer, with each model's reasoning effort levels, read from the agent itself (OAR
// listModels: Claude Code's list_models control request, Codex's model/list; both token-free).
// The home reads its own through the runner's harness port; a worker answers the `models` op
// (runner/src/worker-host.ts). A list is kept 10 minutes (an account's list changes with its plan
// and the agent's version, rarely within a session); a read that is slow leaves the card on
// Ducter's tier table, and the next card gets the list.
//
// The New task card shows a short row: Ducter's suggestion (the tier table's ranking, tagged
// 推荐) and the agent's own named models. Claude Code's pinned versions (claude-opus-4-8, …) and
// its "default" alias stay out of the row (the alias is what runs when no model is named).
import type { AgentModels, Candidate, ModelChoice } from "@ducter/protocol";
import type { ListedModel } from "@ducter/protocol/src/internal.ts";
import { HARNESS_FACTS } from "@ducter/protocol/src/harness-facts.ts";
import { isHarnessId } from "@ducter/protocol";
import { brainModelRows } from "./candidates.ts";

export type ModelReader = (device: string, harness: string) => Promise<ListedModel[] | undefined>;

export interface ModelCatalog {
  /** The list of that agent on that computer ("local": the home), waiting at most `ms` for a read. */
  get(device: string, harness: string, ms: number): Promise<ListedModel[] | undefined>;
}

export const MODELS_TTL_MS = 10 * 60_000;
/** How long the New task card waits for a list it doesn't have yet. */
export const MODELS_WAIT_MS = 3_000;

export function createModelCatalog(o: { read: ModelReader; now?: () => number; ttlMs?: number }): ModelCatalog {
  const now = o.now ?? Date.now;
  const ttl = o.ttlMs ?? MODELS_TTL_MS;
  const kept = new Map<string, { at: number; list: ListedModel[] }>();
  const reading = new Map<string, Promise<ListedModel[] | undefined>>();
  const read = (device: string, harness: string) => {
    const k = `${device} ${harness}`;
    let p = reading.get(k);
    if (!p) {
      p = o
        .read(device, harness)
        .catch(() => undefined)
        .then((list) => {
          if (list?.length) kept.set(k, { at: now(), list });
          return list?.length ? list : kept.get(k)?.list;
        })
        .finally(() => reading.delete(k));
      reading.set(k, p);
    }
    return p;
  };
  return {
    async get(device, harness, ms) {
      const k = `${device || "local"} ${harness}`;
      const had = kept.get(k);
      if (had && now() - had.at < ttl) return had.list;
      const p = read(device || "local", harness);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<undefined>((r) => (timer = setTimeout(() => r(undefined), ms)));
      try {
        return (await Promise.race([p, late])) ?? had?.list;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** The models the card's row offers for one agent: its own named ones (Claude Code: not its pinned versions nor "default"). */
export function shortModels(harness: string, list: ListedModel[]): ListedModel[] {
  if (harness === "claude-code") return list.filter((m) => m.id !== "default" && !m.id.startsWith("claude-"));
  return list;
}

/** At most this many models in one agent's row (the suggestion always among them). */
const ROW_MAX = 8;

/**
 * The model the agent runs when none is named, as a model of the list: its own word (default),
 * else Claude Code's "default" alias resolved by name.
 */
export function defaultModelOf(harness: string, list: ListedModel[]): ListedModel | undefined {
  return list.find((m) => m.default) ?? (harness === "claude-code" ? list.find((m) => m.id === "default") : undefined);
}

/**
 * D202: one agent's row of models for the card. suggested: Ducter's (the candidate's model, else
 * the agent's own default); from "tiers" when the live list couldn't be read (no effort levels then).
 */
export function agentModels(harness: string, device: string | undefined, suggestedModel: string | undefined, list: ListedModel[] | undefined): AgentModels {
  const base = { harness, ...(device ? { device } : {}) };
  if (!list?.length) {
    const rows = brainModelRows(harness, undefined);
    const sug = suggestedModel ?? rows[0]?.id;
    return { ...base, from: "tiers", models: rows.map((r) => ({ id: r.id, label: r.label, ...(r.id === sug ? { suggested: true as const } : {}) })) };
  }
  const own = defaultModelOf(harness, list);
  const short = shortModels(harness, list);
  const sugId = suggestedModel && list.some((m) => m.id === suggestedModel) ? suggestedModel : own && short.some((m) => m.id === own.id) ? own.id : undefined;
  let row = short.slice(0, ROW_MAX);
  if (sugId && !row.some((m) => m.id === sugId)) {
    const s = list.find((m) => m.id === sugId);
    if (s) row = [s, ...row.slice(0, ROW_MAX - 1)];
  }
  const models: ModelChoice[] = row.map((m) => ({
    id: m.id,
    label: m.label,
    ...(m.id === sugId ? { suggested: true as const } : {}),
    ...(m.default ? { default: true as const } : {}),
    ...(m.efforts?.length ? { efforts: m.efforts } : {}),
    ...(m.defaultEffort ? { defaultEffort: m.defaultEffort } : {}),
  }));
  return { ...base, from: "live", models };
}

/** The (computer, agent) pairs the card may offer: one per agent and computer, picked or pickable (an agent on another computer too). */
export function agentsOf(candidates: Candidate[]): { harness: string; device?: string; model?: string }[] {
  const seen = new Set<string>();
  const out: { harness: string; device?: string; model?: string }[] = [];
  for (const c of candidates) {
    if (c.blocked && c.blocked !== "elsewhere") continue;
    const k = `${c.device ?? ""}|${c.harness}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ harness: c.harness, ...(c.device ? { device: c.device } : {}), ...(c.model ? { model: c.model } : {}) });
  }
  return out;
}

/**
 * D202: is `effort` one the model takes? The live list's levels for that model when it is known;
 * else, for an agent whose levels are the same for every model it lists (none today), its facts.
 * The reason is a short line for the task's log when it isn't.
 */
export function checkEffort(harness: string, model: string | undefined, effort: string, list: ListedModel[] | undefined): { ok: true } | { ok: false; why: string } {
  const facts = isHarnessId(harness) ? HARNESS_FACTS[harness].effort?.value : undefined;
  if (!facts) return { ok: false, why: `${harness} takes no reasoning effort` };
  if (!facts.levels.includes(effort)) return { ok: false, why: `${harness} has no effort called ${effort}` };
  const entry = list?.length ? (model ? list.find((m) => m.id === model) : defaultModelOf(harness, list)) : undefined;
  if (entry) return entry.efforts?.includes(effort) ? { ok: true } : { ok: false, why: `${entry.label} doesn't offer effort ${effort}${entry.efforts?.length ? ` (it offers ${entry.efforts.join(", ")})` : " (it takes none)"}` };
  if (!facts.perModel) return { ok: true };
  return { ok: false, why: `couldn't read which efforts ${model ?? "its default model"} offers on that computer` };
}
