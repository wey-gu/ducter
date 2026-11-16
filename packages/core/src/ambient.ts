// D306: the iPhone's Live Activity for a task the person followed, or a call that is live. The app
// starts the activity itself (its title never leaves the phone) and hands this home the activity's
// push token; the home follows the Log and pushes each change of phase, nothing else.
//
// - Words-free: a Live Activity push carries `content-state` in the clear (no extension opens it,
//   unlike D159's sealed alerts), so it holds only {phase, since}. Apple and the relay learn that
//   something moved from "working" to "needs_you", never what.
// - Only on a change of phase (a task's attention, a call's state), never a heartbeat: a handful of
//   pushes over a task's life, far inside Apple's budget. Needs you and the end go at priority 10,
//   the rest at 5 (Apple's advice for updates that don't need the person at once).
// - Honest when it can't keep up: every update sets a stale date (4 h ahead), past which the phone
//   says "may be out of date" instead of a phase it can no longer vouch for.
// - The end: a done, didn't-work or ended call pushes `event: end` with a dismissal date 15 min on, so
//   the result rests on the Lock Screen a moment and then goes by itself; the follow is forgotten.
// - Two ways out, as alerts (apns.ts): this home's own Apple key (topic <bundle>.push-type.liveactivity),
//   or the relay's `activity` op with a handle the app got for the activity token (D159's rule: a
//   home never sends to a raw token through the relay).
import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Bodies, LogEvent } from "@ducter/protocol";
import { ambientEnded, ambientNeedsYou, callPhase, isAmbientPhase, taskPhase, type AmbientKind, type AmbientPhase, type AmbientState } from "@ducter/protocol/src/ambient.ts";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { realClock, type Clock } from "./clock.ts";
import { apnsJwt, isApnsToken, isTopic, type ApnsConfig, type ApnsTransport } from "./apns.ts";
import { isRelayHandle, type RelayFetch } from "./push-relay.ts";

export const STALE_AFTER_S = 4 * 3600;
export const DISMISS_AFTER_S = 15 * 60;
/** One phone keeps a few in sight at most; Apple shows only a few anyway. */
export const MAX_FOLLOWS_PER_DEVICE = 4;

export interface Follow {
  id: string;
  deviceId: string;
  kind: AmbientKind;
  /** The task's or the call's id. */
  target: string;
  /** The activity's push token (hex), its app's topic and APNs environment; relay: its handle. */
  apns: { token: string; topic: string; env: "sandbox" | "production"; relay?: string };
  startedAt: string;
  last?: AmbientState;
}

export interface AmbientStore {
  list(): Follow[];
  add(f: Follow): void;
  remove(id: string): boolean;
  setLast(id: string, s: AmbientState): void;
}

/** Kept in <dataDir>/ambient.json (0600); a store in memory when dataDir is undefined (tests). */
export function openAmbientStore(dataDir?: string): AmbientStore {
  const path = dataDir ? join(dataDir, "ambient.json") : undefined;
  let follows: Follow[] = [];
  if (path && existsSync(path)) {
    try {
      follows = (JSON.parse(readFileSync(path, "utf8")) as { follows?: Follow[] }).follows ?? [];
    } catch (err) {
      console.warn(`[ambient] ${path} is unreadable; starting fresh:`, (err as Error).message);
    }
  }
  const save = () => {
    if (!path) return;
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify({ follows }, null, 2), { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, path);
  };
  return {
    list: () => [...follows],
    add(f) {
      follows = follows.filter((x) => !(x.deviceId === f.deviceId && x.kind === f.kind && x.target === f.target));
      const mine = follows.filter((x) => x.deviceId === f.deviceId);
      if (mine.length >= MAX_FOLLOWS_PER_DEVICE) follows = follows.filter((x) => x !== mine[0]);
      follows.push(f);
      save();
    },
    remove(id) {
      const n = follows.length;
      follows = follows.filter((x) => x.id !== id);
      if (follows.length !== n) save();
      return follows.length !== n;
    },
    setLast(id, s) {
      const f = follows.find((x) => x.id === id);
      if (f) (f.last = s), save();
    },
  };
}

/** What a Log event says about a followed thing: its kind, id and phase now. */
export function phaseOf(e: LogEvent): { kind: AmbientKind; target: string; phase: AmbientPhase } | undefined {
  if (e.kind === "task_state") {
    const b = e.body as Bodies["task_state"];
    return { kind: "task", target: b.taskId, phase: taskPhase(b.attention) };
  }
  if (e.kind === "phone_call") {
    const b = e.body as Bodies["phone_call"];
    const phase = callPhase(b.state);
    return phase ? { kind: "call", target: b.callId, phase } : undefined;
  }
  return;
}

/** The APNs body for a Live Activity update or end (Apple's `aps` for push type liveactivity). */
export function activityPayload(s: AmbientState, nowS: number): Record<string, unknown> {
  const end = ambientEnded(s.phase);
  return {
    aps: {
      timestamp: nowS,
      event: end ? "end" : "update",
      "content-state": { phase: s.phase, since: s.since },
      "stale-date": nowS + STALE_AFTER_S,
      ...(end ? { "dismissal-date": nowS + DISMISS_AFTER_S } : {}),
    },
  };
}

export const activityPriority = (p: AmbientPhase) => (ambientNeedsYou(p) || ambientEnded(p) ? "10" : "5");

export interface ActivitySender {
  configured: boolean;
  /** status 0: not sent (no way out); gone: the activity token is dead (ended on the phone). */
  send(f: Follow, s: AmbientState, nowS: number): Promise<{ status: number; gone: boolean }>;
}

const GONE = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic", "ExpiredToken"]);
const HOSTS = { sandbox: "api.sandbox.push.apple.com", production: "api.push.apple.com" } as const;

/** This home's own key first (as alerts), else the relay's `activity` op. */
export function createActivitySender(o: { config?: ApnsConfig; transport?: ApnsTransport; relayUrl?: string; relayFetch?: RelayFetch; now?: () => number }): ActivitySender {
  const now = o.now ?? Date.now;
  let jwt: { token: string; at: number } | undefined;
  const provider = async () => {
    if (!jwt || now() - jwt.at > 50 * 60_000) jwt = { token: await apnsJwt(o.config!, now()), at: now() };
    return jwt.token;
  };
  const direct = async (f: Follow, s: AmbientState, nowS: number) => {
    const res = await o.transport!({
      host: HOSTS[f.apns.env],
      path: `/3/device/${f.apns.token}`,
      headers: {
        authorization: `bearer ${await provider()}`,
        "apns-topic": `${f.apns.topic}.push-type.liveactivity`,
        "apns-push-type": "liveactivity",
        "apns-priority": activityPriority(s.phase),
        "content-type": "application/json",
      },
      body: JSON.stringify(activityPayload(s, nowS)),
    });
    let reason = "";
    try {
      reason = (JSON.parse(res.body || "{}") as { reason?: string }).reason ?? "";
    } catch {}
    if (res.status === 403 && reason === "ExpiredProviderToken") jwt = undefined;
    if (res.status >= 300) console.warn(`[ambient] APNs ${res.status} ${reason}`);
    return { status: res.status, gone: res.status === 410 || GONE.has(reason) };
  };
  const relay = async (f: Follow, s: AmbientState, nowS: number) => {
    const fetcher = o.relayFetch ?? (fetch as RelayFetch);
    try {
      const r = await fetcher(`${o.relayUrl}/activity`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle: f.apns.relay, s, at: nowS }),
        signal: AbortSignal.timeout(15_000),
      });
      return { status: r.status, gone: r.status === 410 };
    } catch (err) {
      console.warn(`[ambient] relay unreachable: ${(err as Error).message}`);
      return { status: 0, gone: false };
    }
  };
  const hasKey = !!(o.config && o.transport);
  return {
    configured: hasKey || !!o.relayUrl,
    async send(f, s, nowS) {
      if (hasKey) {
        const r = await direct(f, s, nowS).catch(() => ({ status: 0, gone: false }));
        if (r.status !== 403 || !f.apns.relay || !o.relayUrl) return r;
      }
      if (o.relayUrl && isRelayHandle(f.apns.relay)) return relay(f, s, nowS);
      return { status: 0, gone: false };
    },
  };
}

export interface Ambient {
  /** A phone keeps this in sight: returns the follow's id, or an error word for a 400. */
  follow(deviceId: string, b: unknown): { id: string } | { error: string };
  unfollow(deviceId: string, id: string): boolean;
  stop(): void;
}

/** Follows the Log; pushes each change of phase to every follow of that thing. */
export function createAmbient(opts: {
  log: LogStore;
  store: AmbientStore;
  sender: ActivitySender;
  clock?: Clock;
  /** A follow's device was disconnected: it is forgotten. */
  alive?: (deviceId: string) => boolean;
}): Ambient {
  const clock = opts.clock ?? realClock;
  let running: Promise<void> = Promise.resolve();
  const push = async (e: LogEvent) => {
    const p = phaseOf(e);
    if (!p) return;
    const nowS = Math.floor(clock.now() / 1000);
    for (const f of opts.store.list()) {
      if (f.kind !== p.kind || f.target !== p.target) continue;
      if (opts.alive && !opts.alive(f.deviceId)) {
        opts.store.remove(f.id);
        continue;
      }
      if (f.last?.phase === p.phase) continue; // a phase, not a heartbeat
      const s: AmbientState = { phase: p.phase, since: nowS };
      const r = await opts.sender.send(f, s, nowS);
      if (r.gone || ambientEnded(p.phase)) opts.store.remove(f.id);
      else opts.store.setLast(f.id, s);
    }
  };
  const off = opts.log.subscribe((e) => {
    running = running.then(() => push(e)).catch((err) => console.warn(`[ambient] ${(err as Error).message}`));
  });
  return {
    follow(deviceId, raw) {
      const b = (raw ?? {}) as { kind?: unknown; id?: unknown; apns?: { token?: unknown; topic?: unknown; env?: unknown; relay?: unknown }; phase?: unknown };
      if (b.kind !== "task" && b.kind !== "call") return { error: "kind" };
      if (typeof b.id !== "string" || !/^[A-Za-z0-9_.:-]{1,120}$/.test(b.id)) return { error: "id" };
      const a = b.apns;
      if (!a || !isApnsToken(a.token) || !isTopic(a.topic) || (a.env !== "sandbox" && a.env !== "production")) return { error: "apns" };
      if (a.relay !== undefined && !isRelayHandle(a.relay)) return { error: "apns" };
      const id = `amb_${crypto.randomUUID().slice(0, 12)}`;
      opts.store.add({
        id,
        deviceId,
        kind: b.kind,
        target: b.id,
        apns: { token: a.token.toLowerCase(), topic: a.topic, env: a.env, ...(isRelayHandle(a.relay) ? { relay: a.relay } : {}) },
        startedAt: new Date(clock.now()).toISOString(),
        // The phase the app started the activity with: the first push is the next change.
        ...(isAmbientPhase(b.phase) ? { last: { phase: b.phase, since: Math.floor(clock.now() / 1000) } } : {}),
      });
      return { id };
    },
    unfollow(deviceId, id) {
      const f = opts.store.list().find((x) => x.id === id && x.deviceId === deviceId);
      return !!f && opts.store.remove(id);
    },
    stop: () => off(),
  };
}
