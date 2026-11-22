// D478 (D477 phase 2b): each agent's usage limit, per computer, as a fact for the partner's world
// line. Three true sources, nothing inferred:
//   - the runner's own limit hits (a task_event with raw.limit, D297), on the computer the task ran on;
//   - the armed limit waits (a task resting until its agent's reset), which outlive a restart;
//   - the home's account reads (D288), as last read or heard, never a new read per turn.
// A hit on the home asks the home's other signed-in agents for their accounts once (each read
// cached by the book), so the partner can see who has room. Nothing here picks an agent or moves a
// task: the partner judges from these facts (principle 21).
import type { Bodies, LogEvent } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import type { AccountUsageBook, UsageAnswer } from "./account-usage.ts";
import { realClock, type Clock } from "./clock.ts";
import { limitOf, RESET_GRACE_MS } from "./limits.ts";
import type { CoreRegistry } from "./registry.ts";

/** One agent's limit on one computer: used up (until when, if known), or room left (a read said so). */
export interface AgentLimit {
  device: string;
  harness: string;
  state: "used_up" | "room";
  /** When it resets, when known (ISO). */
  until?: string;
  /** Tasks resting until it resets. */
  waiting?: string[];
}

export interface AgentLimits {
  now(): AgentLimit[];
  stop(): void;
}

/** A window used to its end is used up: the agent's own number says so (1 = all of it). */
const usedUp = (w: { used: number }) => w.used >= 1;

export function createAgentLimits(o: {
  log: LogStore;
  tasks: Pick<CoreRegistry, "get">;
  waiters: () => Bodies["waiter"][];
  usage?: AccountUsageBook & { peek?(harness: string): UsageAnswer | undefined };
  /** The home's signed-in agents, as last probed. */
  home: () => { harness: string; loggedIn: boolean }[] | undefined;
  clock?: Clock;
}): AgentLimits {
  const clock = o.clock ?? realClock;
  const hits = new Map<string, { device: string; harness: string; until?: string; taskId: string }>();
  const deviceOf = (taskId: string) => ((o.tasks.get(taskId)?.place as { device?: string } | undefined)?.device || "local");
  const unsubscribe = o.log.subscribe((e: LogEvent) => {
    const hit = limitOf(e);
    if (!hit) return;
    const device = deviceOf(hit.taskId);
    hits.set(`${device}\u0000${hit.harness}`, { device, harness: hit.harness, taskId: hit.taskId, ...(hit.resetsAt ? { until: hit.resetsAt } : {}) });
    // Who else on the home has room: read once (the book caches each read for minutes).
    if (device === "local" && o.usage) for (const h of o.home() ?? []) if (h.loggedIn && h.harness !== hit.harness) void o.usage.get(h.harness).catch(() => undefined);
  });
  return {
    now() {
      const t = clock.now();
      const out = new Map<string, AgentLimit>();
      const key = (d: string, h: string) => `${d}\u0000${h}`;
      // Armed waits: a task rests until this agent's reset (known or not).
      for (const w of o.waiters()) {
        if (w.state !== "armed" || !w.limit || !w.taskId) continue;
        const device = deviceOf(w.taskId);
        const k = key(device, w.limit.harness);
        const had = out.get(k);
        // The wait wakes a little after the reset (RESET_GRACE_MS); the reset itself is the fact.
        const until = w.limit.resetKnown && w.at ? new Date(Date.parse(w.at) - RESET_GRACE_MS).toISOString() : had?.until;
        out.set(k, { device, harness: w.limit.harness, state: "used_up", ...(until ? { until } : {}), waiting: [...(had?.waiting ?? []), w.taskId] });
      }
      // A hit whose reset is still ahead stands; one with no reset stands only while a wait holds it (above).
      for (const h of hits.values()) {
        const k = key(h.device, h.harness);
        if (out.has(k) || !h.until || Date.parse(h.until) <= t) continue;
        out.set(k, { device: h.device, harness: h.harness, state: "used_up", until: h.until });
      }
      // The home's accounts, as last read or heard (never a read here).
      for (const a of o.home() ?? []) {
        if (!a.loggedIn) continue;
        const u = o.usage?.peek?.(a.harness)?.usage;
        if (!u) continue;
        const k = key("local", a.harness);
        const resets = u.windows.filter((w) => usedUp(w) && w.resetsAt && Date.parse(w.resetsAt) > t).map((w) => w.resetsAt!).sort();
        if (u.limited || resets.length) {
          const had = out.get(k);
          const until = resets.at(-1) ?? had?.until;
          out.set(k, { ...(had ?? {}), device: "local", harness: a.harness, state: "used_up", ...(until ? { until } : {}) });
        } else if (!out.has(k)) out.set(k, { device: "local", harness: a.harness, state: "room" });
      }
      return [...out.values()];
    },
    stop: unsubscribe,
  };
}
