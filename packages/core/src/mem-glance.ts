// D295: a glance at Nowledge Mem itself for Settings › 记忆 / Memory: how many memories it holds,
// and the latest ones the person's other AI tools saved there (Claude Code, Codex, Cursor…), so the
// page shows that the memory is shared, not only what Ducter noted. Read-only: one
// `nmem --json m list -n 40` with the home's own nmem and sign-in, at most once per TTL, never on a
// test without a fake nmem (core.ts gates it like the Bridge row). Only titles, sources and dates
// travel to the person's own clients; contents never leave Mem. A source that isn't a known AI tool
// (the person's own `cli`, the app, a web clip) is not "another tool" and is left out; Ducter's own
// memories are the noted lines (settings.ts), so they are left out too.
import { AI_TOOLS, type MemView } from "@ducter/protocol";
import type { NmemCall } from "./bridge-link.ts";

export type MemGlance = NonNullable<MemView["glance"]>;

/** Mem's `source` for an AI tool (D304: shared with the 想起了 line and task briefs, protocol/src/mem-source.ts). */
export { AI_TOOLS };

const OTHERS_SHOWN = 6;
const LIST_N = 40;
const TTL_MS = 2 * 60_000;

const clip = (s: string, n = 120) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length <= n ? one : one.slice(0, n - 1) + "…";
};

/** The glance from `nmem --json m list`'s answer; undefined when it isn't one. */
export function parseGlance(out: string): MemGlance | undefined {
  let j: any;
  try {
    j = JSON.parse(out);
  } catch {
    return undefined;
  }
  const list = Array.isArray(j?.memories) ? j.memories : undefined;
  if (!list) return undefined;
  const others: MemGlance["others"] = [];
  for (const m of list) {
    if (others.length >= OTHERS_SHOWN) break;
    const from = AI_TOOLS[String(m?.source ?? "").toLowerCase()];
    if (!from || typeof m?.id !== "string" || typeof m?.title !== "string" || !m.title.trim()) continue;
    const at = typeof m.created_at === "string" && !Number.isNaN(Date.parse(m.created_at)) ? new Date(m.created_at).toISOString() : "";
    others.push({ id: m.id, title: clip(m.title), from, ...(at ? { at } : {}) });
  }
  const total = typeof j.total === "number" && j.total >= 0 ? Math.floor(j.total) : list.length;
  return { total, others };
}

export function createMemGlance(opts: { run: NmemCall; on: () => boolean; changed: () => void; now?: () => number; ttlMs?: number }) {
  const now = opts.now ?? Date.now;
  const ttl = opts.ttlMs ?? TTL_MS;
  let last: MemGlance | undefined;
  let at: number | undefined;
  let loading: Promise<void> | undefined;
  const refresh = () => {
    if (loading) return loading;
    loading = (async () => {
      const r = await opts.run(["m", "list", "-n", String(LIST_N)]).catch(() => undefined);
      at = now();
      const g = r && r.code === 0 ? parseGlance(r.out) : undefined;
      if (JSON.stringify(g) === JSON.stringify(last)) return;
      last = g;
      opts.changed();
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
  };
}
