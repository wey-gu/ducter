// fw_candidates v0 (D89, design/focus-window.md "Choosing a body"): who could do a task, best
// first, with a reason each. Deterministic: hard filters (installed, signed in, 用它做事 / Use it
// for tasks, the partner's reserve, a model picked), then the person's rules, then the shipped
// tier table, then the limit left. A pin (the partner's or the person's choice) wins over all of
// it unless a hard filter says no, and then the move is said, never silent.
import { HARNESSES, isHarnessId, PARTNER_RESERVE, type BodyWhy, type Candidate, type CandidateBlock, type DeviceHarness, type RuleView, type Settings } from "@ducter/protocol";
import { ruleFor } from "./rules.ts";

/** One AI agent and model, as the tier table knows it. smart: the strongest; fast: quick and light on the limit. */
interface Tier {
  harness: string;
  model?: string;
  kind: "smart" | "fast";
}

/**
 * The shipped tier table: curated data, refreshed with Ducter (no learned router). A harness
 * whose models aren't listed here runs on its own default model (one row, no model).
 */
const TIERS: Tier[] = [
  { harness: "claude-code", model: "opus", kind: "smart" },
  { harness: "claude-code", model: "sonnet", kind: "fast" },
  { harness: "codex", kind: "smart" },
  { harness: "deepseek-harness", kind: "fast" },
  { harness: "pi", kind: "fast" },
];

export interface CandidateInput {
  work: { title: string; brief?: string };
  /** The AI agents on the device the task runs on, as the devices frame reports them. */
  harnesses: DeviceHarness[];
  settings: Pick<Settings, "brain" | "taskAccounts">;
  rules: RuleView[];
  /** Who does it now (the switch sheet marks it). */
  current?: { harness: string; model?: string };
}

/** Why this agent can't take a task now, if it can't. */
export function blockOf(h: DeviceHarness | undefined, s: CandidateInput["settings"]): CandidateBlock | undefined {
  if (!h || !h.installed) return "not_installed";
  if (!h.loggedIn) return h.harness === "pi" ? "no_model" : "signed_out";
  if (isHarnessId(h.harness) && s.taskAccounts?.[h.harness]?.enabled === false) return "off";
  // Tasks never eat the part of the partner's own account kept for its answers.
  if (h.harness === s.brain.harness && h.allowance && h.allowance.left <= PARTNER_RESERVE) return "reserve";
  return undefined;
}

const rows = (h: DeviceHarness): Tier[] => {
  if (h.models?.length) {
    const known = TIERS.filter((t) => t.harness === h.harness && t.model);
    return h.models.map((m, i) => ({ harness: h.harness, model: m.id, kind: known.find((k) => k.model === m.id)?.kind ?? (i === 0 ? "smart" : "fast") }));
  }
  const own = TIERS.filter((t) => t.harness === h.harness);
  return own.length ? own : [{ harness: h.harness, kind: "fast" }];
};

const same = (a: { harness: string; model?: string }, b?: { harness: string; model?: string }) =>
  !!b && a.harness === b.harness && (a.model ?? "") === (b.model ?? "");

/**
 * Everyone who could do this work, best first: the one doing it now, then up to three others
 * who can take it, then (greyed) those who can't, with why.
 */
export function fwCandidates(inp: CandidateInput): Candidate[] {
  const rule = ruleFor(inp.rules, inp.work);
  const all: (Candidate & { score: number })[] = [];
  for (const h of inp.harnesses) {
    if (!isHarnessId(h.harness) || !HARNESSES[h.harness].task) continue;
    const blocked = blockOf(h, inp.settings);
    for (const t of rows(h)) {
      const ruled = !!rule && rule.harness === t.harness && (!rule.model || rule.model === t.model);
      const left = h.allowance?.left;
      // Rules first; then the strongest; plan before pay-per-use; then the most limit left.
      const score = (ruled ? 1000 : 0) + (t.kind === "smart" ? 100 : 50) + (h.billing === "usage" ? -30 : 0) + (left ?? 0.5) * 20;
      const reason: Candidate["reason"] = ruled ? { kind: "rule", ruleId: rule!.id, text: rule!.text } : { kind: t.kind === "smart" ? "fit" : "fast" };
      all.push({
        harness: t.harness,
        ...(t.model ? { model: t.model } : {}),
        reason,
        ...(left != null ? { left } : {}),
        ...(h.allowance?.resetsAt ? { resetsAt: h.allowance.resetsAt } : {}),
        ...(h.billing ? { billing: h.billing } : {}),
        ...(blocked ? { blocked } : {}),
        score,
      });
    }
  }
  all.sort((a, b) => b.score - a.score);
  const strip = ({ score: _s, ...c }: Candidate & { score: number }): Candidate => c;
  const cur = all.find((c) => same(c, inp.current));
  const free = all.filter((c) => !c.blocked && c !== cur).slice(0, 3);
  // A row whose only difference is a model of an agent already listed as blocked says nothing new.
  const seenBlocked = new Set<string>();
  const blocked = all.filter((c) => c.blocked && c !== cur && !seenBlocked.has(c.harness) && seenBlocked.add(c.harness)).slice(0, 3);
  const out = [...(cur ? [{ ...strip(cur), current: true, reason: { kind: "current" as const } }] : []), ...free.map(strip), ...blocked.map(strip)];
  return out;
}

/**
 * Who does a new task, and why (the body_selected the card shows). pinned: the partner's choice in
 * the moment. Undefined when no AI agent can take it: the caller says so in one line.
 */
export function chooseBody(inp: Omit<CandidateInput, "current"> & { pinned?: { harness: string; model?: string }; pinnedBy?: "you" }): { harness: string; model?: string; why: BodyWhy } | undefined {
  const list = fwCandidates(inp);
  const ok = list.filter((c) => !c.blocked);
  const rule = ruleFor(inp.rules, inp.work);
  const byHarness = (h: string) => inp.harnesses.find((x) => x.harness === h);
  if (inp.pinned) {
    const b = blockOf(byHarness(inp.pinned.harness), inp.settings);
    if (!b) {
      // D128: the user picked it on the New task card (or `ducter task --agent`): "…，是你选的".
      const why: BodyWhy = inp.pinnedBy === "you" ? { kind: "you" } : rule && rule.harness === inp.pinned.harness ? { kind: "rule", ruleId: rule.id, text: rule.text } : { kind: "partner" };
      return { harness: inp.pinned.harness, ...(inp.pinned.model ? { model: inp.pinned.model } : {}), why };
    }
    const next = ok[0];
    if (!next) return undefined;
    return { harness: next.harness, why: { kind: "limit", from: inp.pinned.harness } };
  }
  if (rule) {
    const b = blockOf(byHarness(rule.harness), inp.settings);
    if (!b) return { harness: rule.harness, ...(rule.model ? { model: rule.model } : {}), why: { kind: "rule", ruleId: rule.id, text: rule.text } };
    const next = ok[0];
    if (!next) return undefined;
    return { harness: next.harness, why: { kind: "limit", from: rule.harness, ruleId: rule.id, text: rule.text } };
  }
  const best = ok[0];
  if (!best) return undefined;
  // The brain's own account was the natural first choice but only its reserve is left: say it.
  const brain = byHarness(inp.settings.brain.harness);
  if (best.harness !== inp.settings.brain.harness && brain && blockOf(brain, inp.settings) === "reserve") {
    return { harness: best.harness, why: { kind: "limit", from: inp.settings.brain.harness } };
  }
  // The model is left to the harness (and DUCTER_TASK_MODEL) unless a rule or a pin names one.
  return { harness: best.harness, why: { kind: "default" } };
}
