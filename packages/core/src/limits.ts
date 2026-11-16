// D297 (research/101): a task whose agent hits its usage limit doesn't die. The runner logs the hit
// (a task_event with raw.limit: whose limit, when it resets if the agent said); here the task
//   - is handed to another signed-in agent at once, when the person chose that (Settings
//     limitHandoff, chosen on the limit card) and one can take it (D282's in-task switch, with
//     the task's progress carried over);
//   - else rests on a wait of its own (D267's `wakes: "task"` timer, with `limit`) until the reset,
//     and then carries on in the same native session (resumed by id, a home restart included:
//     the wait is in the Log). Every task on the same account shares the one reset: a task whose
//     agent said no time takes the time another task on that account was given.
// With no reset known, it tries again on its own (in 10 minutes for a throttle, else every hour,
// at most a day), and the partner says it once when nobody else can take it (it matters then).
// Hand it to {agent} now (`handoff`) and Stop waiting (`cancel`) are the card's two actions.
import { harnessName, type Bodies, type Candidate, type LimitWait, type LogEvent, type WaiterView } from "@ducter/protocol";
import type { LogStore, Runner } from "@ducter/protocol/src/internal.ts";
import type { AccountUsageBook } from "./account-usage.ts";
import { realClock, type Clock } from "./clock.ts";
import type { Loadout } from "./loadout.ts";
import { isActive, taskStream, type CoreRegistry } from "./registry.ts";
import type { SettingsStore } from "./settings.ts";
import type { Waiters } from "./waiters.ts";

/** What the runner logs when a turn failed on a usage limit (runner/src/limit-hit.ts LimitHit). */
export interface LimitSeen {
  harness: string;
  failure: "quota" | "rate_limited";
  resetsAt?: string;
  source?: string;
  said?: string;
}

/** A throttle that outlived the agent's own retries: try again this soon. */
export const THROTTLE_RETRY_MS = 10 * 60_000;
/** A limit with no reset named: try again this often (each try is one short turn that fails fast if still limited). */
export const UNKNOWN_RETRY_MS = 60 * 60_000;
/** Tries with no reset known before it stops and waits for the person. */
export const MAX_UNKNOWN_TRIES = 24;
/** After a named reset, a little slack so the first turn isn't refused at the edge. */
export const RESET_GRACE_MS = 60_000;
/** A hit this soon after the last wait on the task ended counts as the same limit (tries go up). */
const AGAIN_MS = 30 * 60_000;

export interface LimitWaits {
  /** A waiter_action on a limit wait (handoff, cancel); undefined when the wait isn't one. */
  act(waiterId: string, action: string): Promise<boolean> | undefined;
  /** The view a client gets: the person's hand-off choice on each limit wait. */
  decorate(w: WaiterView): WaiterView;
  stop(): void;
}

export interface LimitDeps {
  log: LogStore;
  tasks: CoreRegistry;
  waiters: Waiters;
  loadout?: Pick<Loadout, "candidates" | "switchTask">;
  settings?: Pick<SettingsStore, "get">;
  usage?: AccountUsageBook;
  runner: () => Runner | undefined;
  clock?: Clock;
}

const zhOf = (s: string) => /[一-鿿]/.test(s);

/** The limit a task_event says the runner saw, or undefined. */
export function limitOf(e: LogEvent): (LimitSeen & { taskId: string }) | undefined {
  if (e.kind !== "task_event") return undefined;
  const b = e.body as Bodies["task_event"];
  const l = (b.raw as { limit?: LimitSeen } | undefined)?.limit;
  // Only the runner says a turn hit the limit (a seeded or quoted line is only a line).
  return b.from === "runner" && l && typeof l.harness === "string" && (l.failure === "quota" || l.failure === "rate_limited") ? { ...l, taskId: b.taskId } : undefined;
}

/** The latest reset a used-up window names, from the account's limits as last read or heard. */
function usageReset(windows: { used: number; resetsAt?: string }[] | undefined, now: number): number | undefined {
  let best: number | undefined;
  for (const w of windows ?? []) {
    const t = Date.parse(w.resetsAt ?? "");
    if (!Number.isFinite(t) || t <= now || w.used < 0.999) continue;
    if (best === undefined || t > best) best = t;
  }
  return best;
}

export function createLimitWaits(o: LimitDeps): LimitWaits {
  const clock = o.clock ?? realClock;
  const armedLimits = () => o.waiters.views().filter((w) => w.state === "armed" && w.limit);
  /** When the last limit wait on each task ended, and how many tries it had (tries go up while it keeps hitting). */
  const lastEnded = new Map<string, { at: number; tries: number; harness: string }>();
  let stopped = false;

  /** Another signed-in agent that can take this task now: same computer, not limited, not paid per use. */
  async function handTo(taskId: string, limited: string): Promise<Candidate | undefined> {
    if (!o.loadout) return undefined;
    const list = await o.loadout.candidates(taskId).catch(() => [] as Candidate[]);
    const cur = list.find((c) => c.current);
    for (const c of list) {
      if (c.current || c.blocked || c.waits || c.harness === limited || c.billing === "usage") continue;
      if (c.device && cur?.device && c.device !== cur.device) continue;
      if (c.left !== undefined && c.left <= 0) continue;
      const u = o.usage ? await o.usage.get(c.harness).catch(() => undefined) : undefined;
      if (u?.usage?.limited) continue;
      return c;
    }
    return undefined;
  }

  async function onHit(hit: LimitSeen & { taskId: string }) {
    const card = o.tasks.get(hit.taskId);
    if (!card || !isActive(card.attention) || card.attention === "done_claimed" || card.attention === "needs_you") return;
    const now = clock.now();
    const prev = lastEnded.get(hit.taskId);
    const tries = prev && prev.harness === hit.harness && now - prev.at < AGAIN_MS ? prev.tries + 1 : 1;
    const to = await handTo(hit.taskId, hit.harness);
    // The person chose to hand off right away: no wait at all.
    if (to && o.settings?.get().limitHandoff) {
      const r = await o.loadout!.switchTask(hit.taskId, to.harness, to.model, o.runner()).catch((err) => ({ ok: false, message: (err as Error).message }));
      if (r.ok) {
        o.log.append({ stream: taskStream(hit.taskId), origin: "system", kind: "task_event", body: { taskId: hit.taskId, role: "system", from: "runner", text: `usage limit: handed to ${to.harness}`, raw: { limitHanded: { from: hit.harness, to: to.harness, auto: true } } } } as never);
        return;
      }
    }
    // The reset: the agent's own word; else what the account says (a read or what a session said);
    // else the reset another task on the same account was given (one account, one reset).
    let at = Date.parse(hit.resetsAt ?? "");
    let known = Number.isFinite(at) && at > now;
    if (!known && o.usage && hit.failure === "quota") {
      const u = await o.usage.get(hit.harness).catch(() => undefined);
      const r = usageReset(u?.usage?.windows, now);
      if (r) (at = r), (known = true);
    }
    if (!known) {
      const shared = armedLimits().find((w) => w.limit!.harness === hit.harness && w.limit!.resetKnown && Date.parse(w.at ?? "") > now);
      if (shared) (at = Date.parse(shared.at!) - RESET_GRACE_MS), (known = true);
    }
    if (!known && tries > MAX_UNKNOWN_TRIES) {
      const zh = zhOf(card.title);
      o.tasks.setState(hit.taskId, "needs_you", card.residency, zh ? `${harnessName(hit.harness)} 的额度一直没恢复` : `${harnessName(hit.harness)}'s limit hasn't come back`);
      return;
    }
    // One wait per task: a new hit replaces the old one (a newer reset, or one more try).
    for (const w of armedLimits()) if (w.taskId === hit.taskId) o.waiters.cancel(w.waiterId, { by: "system" });
    const wakeAt = known ? at + RESET_GRACE_MS : now + (hit.failure === "rate_limited" ? THROTTLE_RETRY_MS : UNKNOWN_RETRY_MS);
    // A newer reset for the account moves every task waiting on it with no time of its own.
    if (known)
      for (const w of armedLimits())
        if (w.limit!.harness === hit.harness && !w.limit!.resetKnown && w.taskId !== hit.taskId) {
          o.waiters.cancel(w.waiterId, { by: "system" });
          arm(w.taskId!, { ...w.limit!, resetKnown: true }, wakeAt, w.reason);
        }
    const limit: LimitWait = {
      harness: hit.harness,
      resetKnown: known,
      ...(to ? { handTo: { harness: to.harness, ...(to.model ? { model: to.model } : {}) } } : {}),
      // It matters (the partner says it once): no time to give, nobody else to take it.
      ...(!known && !to && hit.failure === "quota" && tries === 1 ? { tell: true } : {}),
      ...(tries > 1 ? { tries } : {}),
    };
    const zh = zhOf(card.title);
    arm(hit.taskId, limit, wakeAt, zh ? `${harnessName(hit.harness)} 的额度恢复` : `${harnessName(hit.harness)}'s limit resets`);
  }

  function arm(taskId: string, limit: LimitWait, at: number, reason: string) {
    try {
      o.waiters.arm({ reason, taskId, at: new Date(at).toISOString(), wakes: "task", limit });
    } catch (err) {
      console.warn(`[limits] could not arm the wait for ${taskId}: ${(err as Error).message}`);
    }
  }

  const unsubscribe = o.log.subscribe((e) => {
    if (stopped) return;
    const hit = limitOf(e);
    if (hit) return void onHit(hit).catch((err) => console.warn(`[limits] ${hit.taskId}: ${(err as Error).message}`));
    if (e.kind === "waiter") {
      const w = e.body as Bodies["waiter"];
      if (!w.limit || !w.taskId || w.state === "armed") return;
      lastEnded.set(w.taskId, { at: clock.now(), tries: w.limit.tries ?? 1, harness: w.limit.harness });
    }
  });

  return {
    act(waiterId, action) {
      const w = o.waiters.views().find((x) => x.waiterId === waiterId);
      if (!w?.limit || !w.taskId || (action !== "handoff" && action !== "cancel")) return undefined;
      const taskId = w.taskId;
      return (async () => {
        if (action === "cancel") {
          // Stop waiting: the wait ends and the task stops where it is, the person's turn.
          if (!o.waiters.cancel(waiterId, { by: "user" })) return false;
          const card = o.tasks.get(taskId);
          if (card && isActive(card.attention)) {
            const zh = zhOf(card.title);
            o.tasks.setState(taskId, "needs_you", card.residency, zh ? `没等 ${harnessName(w.limit!.harness)} 的额度，先停下了` : `Stopped instead of waiting for ${harnessName(w.limit!.harness)}'s limit`);
          }
          return true;
        }
        const to = (await handTo(taskId, w.limit!.harness)) ?? (w.limit!.handTo as Candidate | undefined);
        if (!to || !o.loadout) return false;
        // The wait ends first (the task is working again), then it carries on with the other agent.
        if (!o.waiters.cancel(waiterId, { by: "user" })) return false;
        const r = await o.loadout.switchTask(taskId, to.harness, to.model, o.runner()).catch((err) => ({ ok: false, message: (err as Error).message }));
        if (r.ok) o.log.append({ stream: taskStream(taskId), origin: "user", kind: "task_event", body: { taskId, role: "system", from: "runner", text: `usage limit: handed to ${to.harness}`, raw: { limitHanded: { from: w.limit!.harness, to: to.harness } } } } as never);
        return r.ok;
      })();
    },
    decorate(w) {
      return w.limit && o.settings?.get().limitHandoff ? { ...w, limitAuto: true } : w;
    },
    stop() {
      stopped = true;
      unsubscribe();
    },
  };
}

