// D574: a verdict that holds from one run to the next. One haiku run flips about 50 of ~305
// scenarios against another run of the same code (four same-persona runs on 2026-11-25), so one
// run can't tell a regression from noise. A scenario's verdict is the majority of its attempts;
// against a baseline, only the scenarios whose first attempt disagrees with it are run again, and a
// change is reported as real only when every attempt agrees on it.
import type { Verdicts } from "./compare.ts";

/** Pass when more than half the attempts passed (1 of 1, 2 of 3; 1 of 2 is a fail). */
export const majority = (passes: boolean[]): boolean => passes.filter(Boolean).length * 2 > passes.length;

/**
 * The scenarios to run again: the first attempt disagrees with the baseline, or the scenario is
 * new and failed (a new scenario's fail is as much in question as a changed one).
 */
export function toConfirm(first: Map<string, boolean>, baseline: Verdicts): string[] {
  return [...first].filter(([id, pass]) => (baseline.has(id) ? baseline.get(id) !== pass : !pass)).map(([id]) => id);
}

export interface Against {
  /** Passed in the baseline, failed every attempt now (at least `min` of them). */
  regressions: string[];
  /** Failed in the baseline, passed every attempt now. */
  fixes: string[];
  /** Disagreed with the baseline once, then went both ways: no conclusion, the pass rate says how often. */
  flaky: string[];
  /** Not in the baseline and failed every attempt. */
  newFails: string[];
  /** Disagreed with the baseline on every attempt, but with fewer than `min` attempts (no --confirm). */
  unconfirmed: string[];
}

export function against(baseline: Verdicts, attempts: Map<string, boolean[]>, min = 3): Against {
  const out: Against = { regressions: [], fixes: [], flaky: [], newFails: [], unconfirmed: [] };
  for (const [id, ps] of attempts) {
    const k = ps.filter(Boolean).length;
    const was = baseline.get(id);
    if (was === undefined) {
      if (k === 0) out.newFails.push(id);
      else if (k < ps.length) out.flaky.push(id);
      continue;
    }
    const all = k === ps.length;
    const none = k === 0;
    if ((was && all) || (!was && none)) continue; // agrees with the baseline every time
    if (!none && !all) out.flaky.push(id);
    else if (ps.length < min) out.unconfirmed.push(id);
    else if (was) out.regressions.push(id);
    else out.fixes.push(id);
  }
  return out;
}
