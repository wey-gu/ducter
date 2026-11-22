// D476, D477: the person's word on where a piece of work runs (protocol/src/where.ts holds the
// structured form the partner records and every check of it). This file adds only the home's host
// name, a name the person may call it by: a fact read from the system, never from their words.
import { hostname } from "node:os";
import type { TaskBound } from "@ducter/protocol";

export { allowedBy, boundFrom, boundWords, computerBy, isBound, mergeBound, movableTo, type BoundComputer, type Where } from "@ducter/protocol/src/where.ts";

/** only: the one computer it may run on; not: the ones excluded; named: the one named (device ids, "local" for the home). */
export type Bound = TaskBound;

/** The home's host name, short ("hel" for hel.example.net), as a name the person may call it. */
export function hostAlias(): string[] {
  try {
    const h = hostname().split(".")[0]?.trim() ?? "";
    return h && h.toLowerCase() !== "localhost" ? [h] : [];
  } catch {
    return [];
  }
}
