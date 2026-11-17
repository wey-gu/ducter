// D295, D321: a glance at Nowledge Mem itself for Settings › 记忆 / Memory: how many memories it holds,
// what it knows about the person (from Mem's own kinds: how they like things, what they decided, what
// it knows), and which of the person's other AI tools wrote to the same Mem this week (a count, never
// their working notes' titles: those are not about the person, research/112). Read-only, with the
// home's own nmem and sign-in, at most once per TTL, never on a test without a fake nmem (core.ts
// gates it like the Bridge row). Only titles, kinds, sources and dates travel to the person's own
// clients; contents never leave Mem. Forget, fix and find go through here too, so the page changes at once.
import { AI_TOOLS, aboutSource, type MemGlance, type MemItem } from "@ducter/protocol";
import type { NmemCall } from "./bridge-link.ts";

export type { MemGlance };

/** Mem's `source` for an AI tool (D304: shared with the 想起了 line and task briefs, protocol/src/mem-source.ts). */
export { AI_TOOLS };

/** At most this many per kind on the page. */
export const ABOUT_PER_KIND = 8;
/** The recent memories read to count what the other tools wrote this week. */
const RECENT_N = 100;
const FIND_N = 8;
const WEEK = 7 * 86_400_000;
const TTL_MS = 2 * 60_000;

const clip = (s: string, n = 120) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length <= n ? one : one.slice(0, n - 1) + "…";
};

const KINDS = new Set(["preference", "decision", "fact"]);

const listOf = (out: string): any[] | undefined => {
  try {
    const j = JSON.parse(out);
    return Array.isArray(j?.memories) ? j.memories : undefined;
  } catch {
    return undefined;
  }
};

/** One of Mem's memories as the page shows it; undefined when it isn't one, or its source is unknown. */
export function memItem(m: any): MemItem | undefined {
  if (typeof m?.id !== "string" || typeof m?.title !== "string" || !m.title.trim()) return undefined;
  const who = aboutSource(m.source);
  if (!who) return undefined;
  const kind = KINDS.has(String(m.unit_type)) ? (m.unit_type as MemItem["kind"]) : "other";
  const at = typeof m.created_at === "string" && !Number.isNaN(Date.parse(m.created_at)) ? new Date(m.created_at).toISOString() : "";
  return { id: m.id, title: clip(m.title), kind, by: who.by, ...(who.from ? { from: who.from } : {}), ...(at ? { at } : {}) };
}

/**
 * About the person, from one kind's list: a preference from anyone Mem knows (it is about them by its
 * kind); a decision or a fact only when the person saved it or told the partner (another tool's are
 * its working notes about a project).
 */
export function aboutOf(out: string, kind: "preference" | "decision" | "fact"): MemItem[] | undefined {
  const list = listOf(out);
  if (!list) return undefined;
  const items: MemItem[] = [];
  for (const m of list) {
    if (items.length >= ABOUT_PER_KIND) break;
    const it = memItem({ ...m, unit_type: kind });
    if (!it) continue;
    if (kind !== "preference" && it.by !== "said" && it.by !== "you") continue;
    items.push(it);
  }
  return items;
}

/** The total, and the other AI tools that wrote in the last 7 days, from the recent list. */
export function recentOf(out: string, now: number): Pick<MemGlance, "total" | "tools"> | undefined {
  let j: any;
  try {
    j = JSON.parse(out);
  } catch {
    return undefined;
  }
  const list = Array.isArray(j?.memories) ? j.memories : undefined;
  if (!list) return undefined;
  const counts = new Map<string, number>();
  let oldest = Infinity;
  for (const m of list) {
    const at = Date.parse(String(m?.created_at ?? ""));
    if (!Number.isNaN(at)) oldest = Math.min(oldest, at);
    if (Number.isNaN(at) || now - at > WEEK) continue;
    const from = AI_TOOLS[String(m?.source ?? "").toLowerCase()];
    if (from) counts.set(from, (counts.get(from) ?? 0) + 1);
  }
  // The whole read is inside the week: there were at least that many.
  const more = list.length >= RECENT_N && now - oldest <= WEEK;
  const tools = [...counts].sort((a, b) => b[1] - a[1]).map(([from, count]) => ({ from, count, ...(more ? { more: true as const } : {}) }));
  const total = typeof j.total === "number" && j.total >= 0 ? Math.floor(j.total) : list.length;
  return { total, tools };
}

/** D321: what Mem found for a search, titles only; undefined when Mem didn't answer. */
export function foundOf(out: string): MemItem[] | undefined {
  const list = listOf(out);
  if (!list) return undefined;
  const items: MemItem[] = [];
  for (const m of list) {
    if (items.length >= FIND_N) break;
    // A search is the person's own ask: a memory from a source Mem doesn't name is still theirs to see.
    const it = memItem(m) ?? memItem({ ...m, source: "agent" });
    if (it) items.push(it);
  }
  return items;
}

export function createMemGlance(opts: { run: NmemCall; on: () => boolean; changed: () => void; now?: () => number; ttlMs?: number }) {
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? TTL_MS;
  let last: MemGlance | undefined;
  let at: number | undefined;
  let loading: Promise<void> | undefined;
  const call = (args: string[]) => opts.run(args).then((r) => (r && r.code === 0 ? r.out : undefined)).catch(() => undefined);
  const set = (g: MemGlance | undefined) => {
    if (JSON.stringify(g) === JSON.stringify(last)) return;
    last = g;
    opts.changed();
  };
  const refresh = () => {
    if (loading) return loading;
    loading = (async () => {
      const kinds = ["preference", "decision", "fact"] as const;
      const [recent, ...lists] = await Promise.all([call(["m", "list", "-n", String(RECENT_N)]), ...kinds.map((k) => call(["m", "list", "--unit-type", k, "-n", k === "preference" ? "16" : "40"]))]);
      at = now();
      const r = recent === undefined ? undefined : recentOf(recent, now());
      if (!r) return set(undefined);
      const about = kinds.flatMap((k, i) => (lists[i] === undefined ? [] : (aboutOf(lists[i]!, k) ?? [])));
      set({ total: r.total, about, tools: r.tools });
    })().finally(() => (loading = undefined));
    return loading;
  };
  return {
    /** What's known now; a stale or missing glance is fetched in the background (a fresh settings frame follows). */
    get(): MemGlance | undefined {
      if (!opts.on()) return undefined;
      if (at === undefined || now() - at >= ttl) void refresh();
      return last;
    },
    refresh,
    /** D321: one row forgotten in Mem: it leaves the page now, and the count with it. */
    forgot(id: string) {
      if (!last?.about.some((x) => x.id === id)) return;
      set({ ...last, total: Math.max(0, last.total - 1), about: last.about.filter((x) => x.id !== id) });
    },
    /** D321: one row's words fixed in Mem: the page shows them now. */
    fixed(id: string, title: string) {
      if (!last?.about.some((x) => x.id === id)) return;
      set({ ...last, about: last.about.map((x) => (x.id === id ? { ...x, title: clip(title) } : x)) });
    },
    /** D321: search Mem for the page; undefined when Mem didn't answer. */
    async find(q: string): Promise<MemItem[] | undefined> {
      const words = q.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
      if (!words || !opts.on()) return words ? undefined : [];
      const out = await call(["m", "search", "-n", String(FIND_N), "--", words]);
      return out === undefined ? undefined : foundOf(out);
    },
  };
}
