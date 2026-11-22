// D476: the person's own word on where a piece of work runs binds every later step of it.
//
// "请用我们 hel 上的 agy 而不是 mac 上的" (hel, 2026-11-22): the task couldn't start on hel, and the
// partner's rethink opened the same work again on the Mac. A prompt asks; code refuses. From the
// person's words (their message, the task's own title and brief, which quote them verbatim) Ducter
// reads, by code, which computers the work may not use and which one it must stay on, and every step
// after (task_open's pre-flight, the chooser of who does it, a failed start's fixes, Ducter's own
// mends) holds to it. The person's own tap on a card is a new word: it always goes.
//
// Only an explicit word counts: a computer named by its name, its host name, or (when only one
// computer fits) its kind ("mac", "服务器"), with a negation before it (而不是 / 不要 / 别 / not /
// instead of) or "only" (只 / 仅 / only). A computer named plainly ("在 hel 上做") is the place the
// person meant: Ducter never moves the work off it by itself, though the card may still offer it.
import { hostname } from "node:os";
import type { TaskBound } from "@ducter/protocol";

/** only: the one computer it may run on; not: the ones excluded; named: the one named (device ids, "local" for the home). */
export type Bound = TaskBound;

export interface BoundComputer {
  /** "local" for the home, else the worker's device id. */
  id: string;
  name: string;
  home: boolean;
  /** Other names the person may use for it (its host name). */
  aliases?: string[];
  /** Its platform ("darwin", "linux"): "mac" and "服务器" name it when only one computer fits. */
  os?: string;
}

/** The home's host name, short ("hel" for hel.example.net), as a name the person may call it. */
export function hostAlias(): string[] {
  try {
    const h = hostname().split(".")[0]?.trim() ?? "";
    return h && h.toLowerCase() !== "localhost" ? [h] : [];
  } catch {
    return [];
  }
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LATIN = /^[\x00-\x7f]+$/;

/** The words for each computer, longest first; a kind word only when it fits exactly one computer. */
function namesOf(comps: BoundComputer[]): { c: BoundComputer; re: RegExp }[] {
  const out: { c: BoundComputer; word: string }[] = [];
  for (const c of comps) for (const w of [c.name, ...(c.aliases ?? [])]) if (w && w.trim().length >= 3) out.push({ c, word: w.trim() });
  const isMac = (c: BoundComputer) => /darwin|mac/i.test(c.os ?? "") || /\bmac/i.test(c.name);
  const isServer = (c: BoundComputer) => /linux/i.test(c.os ?? "") && !isMac(c);
  const macs = comps.filter(isMac);
  const servers = comps.filter(isServer);
  if (macs.length === 1) for (const w of ["macbook", "mac mini", "mac", "苹果电脑"]) out.push({ c: macs[0]!, word: w });
  if (servers.length === 1) for (const w of ["服务器", "server"]) out.push({ c: servers[0]!, word: w });
  return out
    .sort((a, b) => b.word.length - a.word.length)
    .map(({ c, word }) => ({ c, re: LATIN.test(word) ? new RegExp(`(?<![a-z0-9_-])${esc(word)}(?![a-z0-9_-])`, "gi") : new RegExp(esc(word), "gi") }));
}

/** A negation right before a computer's name, in the same clause. */
const NOT_BEFORE = /(而不是|而非|不是|不要|不用|不在|别在|别用|别|不能|绝不|不准|不许|勿|\bnot\b|\binstead of\b|\brather than\b|\bavoid\b|\bnever\b|\bdon'?t use\b|\bother than\b|\bexcept\b|\bno\b)\s*(?:用|在|去|on|in|use|using|to)?\s*(?:我们|我的|你的|那台|这台|\bmy\b|\bour\b|\bthe\b)?\s*(?:的)?\s*$/i;
/** "mac 不行", "mac 上的不要". */
const NOT_AFTER = /^\s*(?:上的?|那台|这台)?\s*(?:不行|不要|别用|不可以|不能用)/;
const ONLY_BEFORE = /(只|仅|只能|只在|只用|\bonly\b|\bjust\b)\s*(?:用|在|on|in|use|using)?\s*(?:我们|我的|\bmy\b|\bour\b|\bthe\b)?\s*(?:的)?\s*$/i;
const ONLY_AFTER = /^\s*(?:上的?\s*)?(?:\bonly\b|就好|就行|就可以)/i;
const CLAUSE_END = /[，,。.;；!！?？\n]/;

/**
 * What the person's words say about where the work runs. Texts are read in order; a later
 * exclusion of a computer named earlier wins.
 */
export function boundIn(texts: string[], comps: BoundComputer[]): Bound {
  const names = namesOf(comps);
  const not = new Set<string>();
  let only: string | undefined;
  let named: string | undefined;
  for (const text of texts) {
    if (!text) continue;
    const taken: [number, number][] = [];
    for (const { c, re } of names) {
      re.lastIndex = 0;
      for (let m = re.exec(text); m; m = re.exec(text)) {
        const a = m.index;
        const b = a + m[0].length;
        if (taken.some(([x, y]) => a < y && b > x)) continue;
        taken.push([a, b]);
        const before = text.slice(Math.max(0, a - 24), a);
        const cut = Math.max(...[...before].map((ch, i) => (CLAUSE_END.test(ch) ? i + 1 : 0)));
        const pre = before.slice(cut);
        const post = text.slice(b, b + 16);
        if (NOT_BEFORE.test(pre) || NOT_AFTER.test(post)) {
          not.add(c.id);
          if (only === c.id) only = undefined;
          if (named === c.id) named = undefined;
        } else if (ONLY_BEFORE.test(pre) || ONLY_AFTER.test(post)) {
          only = c.id;
          not.delete(c.id);
        } else if (!named && !not.has(c.id)) named = c.id;
      }
    }
  }
  // Named one and excluded another: the named one is where it runs.
  if (!only && named && not.size) only = named;
  return { ...(only ? { only } : {}), ...(not.size ? { not: [...not] } : {}), ...(named ? { named } : {}) };
}

/** Whether the work may run on that computer at all. */
export function allowedBy(b: Bound | undefined, device: string | undefined): boolean {
  if (!b) return true;
  const d = !device ? "local" : device;
  if (b.only && b.only !== d) return false;
  return !(b.not ?? []).includes(d);
}

/** Whether Ducter may move the work there by itself (the person named another one). */
export function movableTo(b: Bound | undefined, device: string | undefined): boolean {
  if (!allowedBy(b, device)) return false;
  const d = !device ? "local" : device;
  return !b?.named || b.named === d;
}

/** Two words on one piece of work, as one: an exclusion stands; the later "only" wins. */
export function mergeBound(a: Bound | undefined, b: Bound | undefined): Bound {
  const not = [...new Set([...(a?.not ?? []), ...(b?.not ?? [])])];
  const only = b?.only ?? a?.only;
  const named = b?.named ?? a?.named;
  return { ...(only && !not.includes(only) ? { only } : {}), ...(not.length ? { not } : {}), ...(named && !not.includes(named) ? { named } : {}) };
}

export const isBound = (b: Bound | undefined): b is Bound => !!b && (!!b.only || !!b.not?.length || !!b.named);

/** The bound in words for the partner ("only on Hetzner Server; not on MacBook"). */
export function boundWords(b: Bound | undefined, nameOf: (id: string) => string): string {
  if (!b) return "";
  const parts: string[] = [];
  if (b.only) parts.push(`only on ${nameOf(b.only)}`);
  if (b.not?.length) parts.push(`not on ${b.not.map(nameOf).join(" or ")}`);
  if (!b.only && b.named) parts.push(`on ${nameOf(b.named)}, as they named it`);
  return parts.join("; ");
}
