// D477: the person's own word on where a piece of work runs, as structured data.
//
// "请用我们 hel 上的 agy 而不是 mac 上的" (hel, 2026-11-22): the task couldn't start on hel, and the
// partner's rethink opened the same work again on the Mac. The partner, which understands the
// words, records the word on task_open (`where`: on / only / not, by computer name); code checks the
// names against the home's computers and then holds every later step to it (task_open's pre-flight,
// the chooser, a failed start's fixes, Ducter's own mends, a task opened again with `replaces`).
// Nothing here reads natural language: D476's regex over the person's words was retired (D477).
// The person's own tap on a card is a new word: it always goes.
import type { TaskBound } from "./index.ts";

/** A computer as the bound speaks of it: "local" for the home, else the worker's device id. */
export interface BoundComputer {
  id: string;
  name: string;
  home: boolean;
  /** Other names the person calls it (its host name: "hel"). */
  aliases?: string[];
}

/** What the partner recorded on task_open: the computer the person named, whether only there, the ones ruled out (names). */
export interface Where {
  on?: string;
  only?: boolean;
  not?: string[];
}

/** A computer by what the partner wrote: its device id, its name, a name it is called by, or "local" for the home. Exact, never a guess. */
export function computerBy<C extends BoundComputer>(comps: C[], said: string | undefined): C | undefined {
  const l = String(said ?? "").trim().toLowerCase();
  if (!l) return undefined;
  if (l === "local" || l === "home") return comps.find((c) => c.home);
  return comps.find((c) => c.id.toLowerCase() === l || c.name.toLowerCase() === l || (c.aliases ?? []).some((a) => a.toLowerCase() === l));
}

/**
 * The bound the partner recorded, as device ids. A name that is no computer of this home comes
 * back as unknown (the tool says so, naming the computers there are): never dropped, never guessed.
 */
export function boundFrom(w: Where | undefined, comps: BoundComputer[]): { bound: TaskBound } | { unknown: string[] } {
  if (!w) return { bound: {} };
  const unknown: string[] = [];
  const id = (s: string) => {
    const c = computerBy(comps, s);
    if (!c) unknown.push(s);
    return c ? (c.home ? "local" : c.id) : undefined;
  };
  const on = w.on ? id(w.on) : undefined;
  const not = [...new Set((w.not ?? []).map(id).filter((x): x is string => !!x))];
  if (unknown.length) return { unknown };
  return { bound: { ...(on && w.only && !not.includes(on) ? { only: on } : {}), ...(not.length ? { not } : {}), ...(on && !not.includes(on) ? { named: on } : {}) } };
}

/** Whether the work may run on that computer at all. */
export function allowedBy(b: TaskBound | undefined, device: string | undefined): boolean {
  if (!b) return true;
  const d = !device ? "local" : device;
  if (b.only && b.only !== d) return false;
  return !(b.not ?? []).includes(d);
}

/** Whether Ducter may move the work there by itself (the person named another one). */
export function movableTo(b: TaskBound | undefined, device: string | undefined): boolean {
  if (!allowedBy(b, device)) return false;
  const d = !device ? "local" : device;
  return !b?.named || b.named === d;
}

/** Two words on one piece of work, as one: an exclusion stands; the later "only" wins. */
export function mergeBound(a: TaskBound | undefined, b: TaskBound | undefined): TaskBound {
  const not = [...new Set([...(a?.not ?? []), ...(b?.not ?? [])])];
  const only = b?.only ?? a?.only;
  const named = b?.named ?? a?.named;
  return { ...(only && !not.includes(only) ? { only } : {}), ...(not.length ? { not } : {}), ...(named && !not.includes(named) ? { named } : {}) };
}

export const isBound = (b: TaskBound | undefined): b is TaskBound => !!b && (!!b.only || !!b.not?.length || !!b.named);

/** The bound in words for the partner ("only on hel; not on Weyl's MacBook Pro"). */
export function boundWords(b: TaskBound | undefined, nameOf: (id: string) => string): string {
  if (!b) return "";
  const parts: string[] = [];
  if (b.only) parts.push(`only on ${nameOf(b.only)}`);
  if (b.not?.length) parts.push(`not on ${b.not.map(nameOf).join(" or ")}`);
  if (!b.only && b.named) parts.push(`on ${nameOf(b.named)}, as they named it`);
  return parts.join("; ");
}
