// D374: Nowledge Mem's own health on the home, for Settings › 记忆 / Memory's Nowledge Mem head
// (research/144). Mem's own `nmem --json doctor`, read-only, at most once per TTL, in the
// background: the page never waits for it (it shows "Connected" until the first answer, and nothing
// at all when nmem can't tell). Gated like the glance (memory on, Mem connected, never a test
// without a fake nmem). Only the issue travels to the person's clients, never a detail line.
import { memHealthOf, type MemHealth } from "@ducter/protocol";
import type { NmemCall } from "./bridge-link.ts";

const TTL_MS = 5 * 60_000;

export function createMemHealth(o: {
  run: NmemCall;
  on: () => boolean;
  /** The AI agents installed on the home (harness ids). */
  agents: () => Promise<string[]>;
  changed: () => void;
  now?: () => number;
  ttlMs?: number;
}) {
  const now = o.now ?? Date.now;
  const ttl = o.ttlMs ?? TTL_MS;
  let last: MemHealth | undefined;
  let at: number | undefined;
  let loading: Promise<void> | undefined;
  const set = (h: MemHealth | undefined) => {
    // The time it was read alone is no change worth a frame.
    const key = (x: MemHealth | undefined) => (x ? JSON.stringify({ ...x, checkedAt: 0 }) : "");
    const same = key(h) === key(last);
    last = h;
    if (!same) o.changed();
  };
  const refresh = (): Promise<void> => {
    if (loading) return loading;
    loading = (async () => {
      const [r, agents] = await Promise.all([o.run(["doctor"]).catch(() => undefined), o.agents().catch(() => [])]);
      at = now();
      const h = memHealthOf(r, agents, new Date(at).toISOString());
      // On the home Mem was answering (the page shows only then): Mem's built-in default not
      // answering here means it went away, not that it was never set up.
      set(h?.issue === "signed_out" && h.fresh ? { issue: "unreachable", ...(h.checkedAt ? { checkedAt: h.checkedAt } : {}) } : h);
    })().finally(() => (loading = undefined));
    return loading;
  };
  return {
    /** What's known now; a stale or missing read is started in the background (a fresh settings frame follows). */
    get(): MemHealth | undefined {
      if (!o.on()) return undefined;
      if (at === undefined || now() - at >= ttl) void refresh();
      return last;
    },
    /** Read it again now (再看一次, after a sign-in or an agent connected). */
    refresh: () => (o.on() ? refresh() : Promise.resolve()),
  };
}
