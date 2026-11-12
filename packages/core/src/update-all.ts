// 全部更新 / Update all (D224, design/system.md "Update all"): one tap updates everything that is
// behind, in the one order that is always safe, and never cuts running work off.
//
//   1. the home's own Ducter first: everything else talks to it, and every release is built and
//      tested for a newer home serving older computers and apps, never the reverse; it also
//      brings the newest list of AI agent versions Ducter has checked (harness-facts);
//   2. then every other computer's Ducter, side by side (each waits for its own safe point); a
//      computer never goes past a home that didn't update (it stays with it: skipped "home");
//   3. then each computer's AI agents, one at a time per computer, computers side by side, each
//      once that computer's Ducter step is over and nothing on it uses that agent (it waits;
//      it never stops a task);
//   4. the apps last, each by itself (a Mac app restarts when the rest is over or only waiting;
//      the phone page reloads; the Android app checks), from the plan the home shows them.
//
// The plan is kept in <dataDir>/updates/update-all.json and picked up again by the restarted
// home, which judges each step by what runs now (D167, D172): the home on its target is done.
// The steps themselves are the ones a single 更新 takes (updates.ts, agents.ts); this file only
// orders them, waits, and keeps the list. With autoUpdate on, the same plan runs at night.
//
// D227: a computer's agents also wait while its Ducter updates outside the plan (a 更新 tapped
// on its card a moment before), since that Ducter's restart would cut the updater off. A step
// whose computer went away says it waits for it to reconnect; one that came back cut off (its
// Ducter restarted under the updater, `interrupted`) is judged by what runs there now and, still
// on the old version, started again once, then failed with that reason.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentPhase, Bodies, DeviceHarness, DeviceView, Settings, UpdateAllBy, UpdateAllItem, UpdateAllNotNow, UpdateAllPlan, UpdateAllView, UpdatePhase } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { isHarnessId, type HarnessId } from "@ducter/protocol/src/harnesses.ts";
import { compareVersions } from "./harness-probe.ts";
import { nightTarget, updatable, type AgentUpdates } from "./agents.ts";
import type { Updates } from "./updates.ts";
import { inQuiet } from "./push.ts";

/** A finished plan stays on the card this long, a day when something failed (as a single update's). */
export const PLAN_DONE_SHOWN_MS = 30 * 60_000;
export const PLAN_FAILED_SHOWN_MS = 24 * 60 * 60_000;
/**
 * A step that started and never said how it ended (a computer that went away mid-way): longer than
 * any step's own limits (a download, the safe point's 15 min, the 3 min health wait; an agent's
 * 30 min settle and 10 min install).
 */
export const DUCTER_STEP_MS = 45 * 60_000;
export const AGENT_STEP_MS = 45 * 60_000;
/** How often a running plan looks again, besides every change it hears of. */
export const PLAN_TICK_MS = 3000;
/** The night window when no quiet hours are set: 03:00–05:00 on the home's clock. */
export const NIGHT_DEFAULT = { start: "03:00", end: "05:00" } as const;
/** A step that failed at night is not tried again at night for this long. */
export const NIGHT_RETRY_MS = 24 * 60 * 60_000;

const cmp = (a: string, b: string) => compareVersions(a, b) ?? (a === b ? 0 : a < b ? -1 : 1);
const FINAL = new Set(["done", "failed", "skipped"]);
const isFinal = (i: UpdateAllItem) => FINAL.has(i.state);

export interface UpdateAllDeps {
  dataDir: string;
  log: LogStore;
  now: () => number;
  updates: () => Updates | undefined;
  agents: () => AgentUpdates | undefined;
  /** The devices frame's devices (each with its update and agents' views). */
  devices: () => Promise<DeviceView[]>;
  /** Tasks (and the partner's turn, on the home) using this agent on that device right now. */
  busy: (device: string, harness: string) => number;
  /** Tasks working anywhere, and the runner's critical sections (the night starts only when none). */
  working?: () => number;
  settings?: () => Pick<Settings, "autoUpdate" | "quiet">;
  /** How often a running plan looks again (0: only on changes and step()); tests drive it. */
  tickMs?: number;
  /** How often the night looks (0: never). */
  nightEveryMs?: number;
  /** The home's time zone for the default night window (tests). */
  tz?: string;
}

export interface UpdateAll {
  /** The frame's part: the offer (no plan running), what can't be part of it, and the plan. */
  view(devices: DeviceView[]): UpdateAllView;
  /** 全部更新: make the plan and start it. */
  start(by?: UpdateAllBy): Promise<{ ok: true; id: string } | { ok: false; reason: "nothing" | "running" | "failed"; detail?: string }>;
  /** 停止剩下的: what hasn't started is skipped; what runs finishes. */
  stop(): boolean;
  /** Put a finished plan away. */
  dismiss(): boolean;
  /** Look at every step once (the timer and every change call it). */
  step(): Promise<void>;
  /** The night's look, once. */
  nightly(): Promise<void>;
  plan(): UpdateAllPlan | undefined;
  onChange(fn: () => void): () => void;
  stop_(): void;
}

// ---------- what Update all would do now (pure) ----------

const ducterKey = (device: string) => `ducter:${device}`;
const agentKey = (device: string, h: string) => `agent:${device}:${h}`;

/** A computer's Ducter is behind and can take 更新 from here. */
function ducterTakes(dv: DeviceView): boolean {
  const u = dv.update;
  if (!u?.available || !u.latest) return false;
  return u.how === "self" || (u.how === "app" && !!u.fromHere);
}

/** A computer's Ducter is in the middle of an update (not over, not swapped and waiting by hand). */
export function ducterMidUpdate(dv: DeviceView): boolean {
  const p = dv.update?.phase;
  return !!p && p !== "done" && p !== "failed";
}

/** Its agents that are behind, with where each would go (night: only a version Ducter checked). */
function agentsBehind(dv: DeviceView, night: boolean): { h: DeviceHarness; to: string }[] {
  const out: { h: DeviceHarness; to: string }[] = [];
  for (const h of dv.harnesses) {
    if (!isHarnessId(h.harness) || !h.installed || !h.version || !updatable(h.how)) continue;
    if (h.update && (h.update.phase === "waiting" || h.update.phase === "updating" || h.update.phase === "checking")) continue;
    if (night) {
      if (!h.loggedIn) continue;
      const to = nightTarget(h.harness as HarnessId, h.how, h.version, h.latest);
      if (to) out.push({ h, to });
    } else if (h.available && h.latest && cmp(h.latest, h.version) > 0) out.push({ h, to: h.latest });
  }
  return out;
}

/**
 * The plan's steps in order (the home, the other computers, then the agents computer by computer)
 * and what is behind but can't be part of it. Pure: the frame and start() both use it.
 */
export function offerFrom(devices: DeviceView[], o: { night?: boolean; at?: string; skip?: (key: string, to: string) => boolean } = {}): { offer: UpdateAllItem[]; notNow: UpdateAllNotNow[] } {
  const at = o.at ?? new Date().toISOString();
  const night = Boolean(o.night);
  const skip = o.skip ?? (() => false);
  const home = devices.filter((d) => d.home);
  const others = devices.filter((d) => !d.home && d.kind !== "phone");
  const ordered = [...home, ...others];
  const ducter: UpdateAllItem[] = [];
  const agents: UpdateAllItem[] = [];
  const notNow: UpdateAllNotNow[] = [];
  for (const dv of ordered) {
    const awake = dv.home || dv.state === "awake";
    const u = dv.update;
    // Under way already, or swapped and waiting for its restart: not offered again.
    const busyDucter = !!u?.phase && (u.phase !== "failed" && (u.phase !== "done" || u.to === u.latest));
    const behindDucter = Boolean(u?.available && u.latest) && !busyDucter;
    const behindAgents = agentsBehind(dv, night);
    if (!awake) {
      const n = (behindDucter ? 1 : 0) + behindAgents.length;
      if (n) notNow.push({ device: dv.id, deviceName: dv.name, why: "offline", items: n });
      continue;
    }
    if (behindDucter && u) {
      // The night takes only what updates by itself (D148 (10)); a Mac app is updated by day.
      if (ducterTakes(dv) && !(night && u.how !== "self") && !skip(ducterKey(dv.id), u.latest!)) {
        ducter.push({ key: ducterKey(dv.id), kind: "ducter", device: dv.id, deviceName: dv.name, from: u.current, to: u.latest!, state: "queued", at });
      } else if (!ducterTakes(dv)) {
        notNow.push({ device: dv.id, deviceName: dv.name, why: u.how === "app" ? "app_old" : u.how === "source" ? "source" : "manual", items: 1 });
      }
    }
    for (const { h, to } of behindAgents) {
      if (skip(agentKey(dv.id, h.harness), to)) continue;
      agents.push({ key: agentKey(dv.id, h.harness), kind: "agent", device: dv.id, deviceName: dv.name, harness: h.harness, from: h.version!, to, state: "queued", at });
    }
  }
  return { offer: [...ducter, ...agents], notNow };
}

// ---------- the plan on disk ----------

const planFile = (dataDir: string) => join(dataDir, "updates", "update-all.json");

export function readPlanFile(dataDir: string): UpdateAllPlan | undefined {
  try {
    const p = JSON.parse(readFileSync(planFile(dataDir), "utf8")) as UpdateAllPlan;
    return p && typeof p.id === "string" && Array.isArray(p.items) ? p : undefined;
  } catch {
    return undefined;
  }
}

function writePlanFile(dataDir: string, p: UpdateAllPlan | undefined) {
  const f = planFile(dataDir);
  mkdirSync(join(dataDir, "updates"), { recursive: true });
  if (!p) {
    if (existsSync(f)) writeFileSync(f, "{}\n");
    return;
  }
  const tmp = `${f}.tmp`;
  writeFileSync(tmp, JSON.stringify(p, null, 2) + "\n");
  renameSync(tmp, f);
}

// ---------- running it ----------

export function createUpdateAll(d: UpdateAllDeps): UpdateAll {
  const fns = new Set<() => void>();
  const changed = () => fns.forEach((fn) => queueMicrotask(fn));
  const iso = (ms = d.now()) => new Date(ms).toISOString();
  let plan: UpdateAllPlan | undefined = readPlanFile(d.dataDir);
  let dismissed = false;
  /** When each running step started (ms), for its timeout; not kept on disk: a restart starts it again. */
  const startedAt = new Map<string, number>();
  /** Agent steps this process started (D227: a step from disk with no update state was forgotten). */
  const dispatched = new Set<string>();
  /** Steps that failed at night: not tried again at night for a day. */
  const nightFailed = new Map<string, number>();

  const save = () => {
    try {
      writePlanFile(d.dataDir, plan);
    } catch (err) {
      console.warn("[update-all] could not keep the plan:", (err as Error).message);
    }
    changed();
  };
  const logEvent = (body: Bodies["update_all"]) => {
    try {
      d.log.append({ stream: "devices", origin: "system", kind: "update_all", body });
    } catch (err) {
      console.warn("[update-all] could not log:", (err as Error).message);
    }
  };

  const set = (i: UpdateAllItem, patch: Partial<UpdateAllItem>): boolean => {
    const next = { ...i, ...patch };
    const same = (Object.keys(patch) as (keyof UpdateAllItem)[]).every((k) => i[k] === next[k]);
    if (same) return false;
    if (patch.state && patch.state !== i.state) next.at = iso();
    // A step's leftovers don't follow it into its next state.
    if (patch.state && patch.state !== "running") {
      delete next.phase;
      delete next.progress;
    }
    if (patch.state && patch.state !== "waiting") delete next.busy;
    if (patch.state && patch.state !== i.state && !("wait" in patch)) delete next.wait;
    for (const k of Object.keys(i) as (keyof UpdateAllItem)[]) if (!(k in next) || next[k] === undefined) delete i[k];
    for (const k of Object.keys(next) as (keyof UpdateAllItem)[]) if (next[k] !== undefined) (i as any)[k] = next[k];
    return true;
  };

  const running = () => !!plan && !plan.finishedAt;

  function view(devices: DeviceView[]): UpdateAllView {
    const shown = (() => {
      if (!plan || dismissed) return undefined;
      if (!plan.finishedAt) return plan;
      const age = d.now() - Date.parse(plan.finishedAt);
      const failed = plan.items.some((i) => i.state === "failed");
      return age < (failed ? PLAN_FAILED_SHOWN_MS : PLAN_DONE_SHOWN_MS) ? plan : undefined;
    })();
    const { offer, notNow } = offerFrom(devices, { at: iso() });
    return { offer: running() ? [] : offer, notNow, ...(shown ? { plan: structuredClone(shown) } : {}) };
  }

  async function start(by: UpdateAllBy = "user"): Promise<{ ok: true; id: string } | { ok: false; reason: "nothing" | "running" | "failed"; detail?: string }> {
    if (running()) return { ok: false, reason: "running" };
    let devices: DeviceView[];
    try {
      devices = await d.devices();
    } catch (err) {
      return { ok: false, reason: "failed", detail: (err as Error).message };
    }
    const night = by === "night";
    const now = d.now();
    const { offer } = offerFrom(devices, {
      night,
      at: iso(now),
      ...(night ? { skip: (key: string, to: string) => now - (nightFailed.get(`${key}@${to}`) ?? -Infinity) < NIGHT_RETRY_MS } : {}),
    });
    if (!offer.length) return { ok: false, reason: "nothing" };
    plan = { id: `ua-${now.toString(36)}`, by, startedAt: iso(now), items: offer };
    dismissed = false;
    startedAt.clear();
    dispatched.clear();
    logEvent({ id: plan.id, phase: "started", by, items: offer.length });
    save();
    void step();
    return { ok: true, id: plan.id };
  }

  function stop(): boolean {
    if (!running()) return false;
    for (const i of plan!.items) if (i.state === "queued" || i.state === "waiting") set(i, { state: "skipped", reason: "stopped" });
    plan!.stopped = true;
    save();
    void step();
    return true;
  }

  function dismiss(): boolean {
    if (!plan?.finishedAt) return false;
    dismissed = true;
    changed();
    return true;
  }

  /** Where a computer's Ducter step stands, from what that computer says now. */
  function judgeDucter(i: UpdateAllItem, dv: DeviceView | undefined): Partial<UpdateAllItem> | undefined {
    const u = dv?.update;
    const current = u?.current ?? dv?.version;
    if (current && cmp(current, i.to) >= 0) return { state: "done" };
    if (u?.phase === "done" && u.to === i.to) return { state: "done", ...(u.detail ? { detail: u.detail } : {}) }; // swapped; Ducter there restarts by hand
    if (u?.phase === "failed" && u.to === i.to) return { state: "failed", reason: u.reason ?? "failed", ...(u.detail ? { detail: u.detail } : {}), rolledBack: u.rolledBack ?? false };
    if (u?.phase) return { phase: u.phase as UpdatePhase, ...(u.progress !== undefined ? { progress: u.progress } : {}) };
    return undefined;
  }

  function judgeAgent(i: UpdateAllItem, h: DeviceHarness | undefined): Partial<UpdateAllItem> | undefined {
    if (h?.version && cmp(h.version, i.to) >= 0) return { state: "done" };
    const u = h?.update;
    if (u?.phase === "failed" && (!u.to || u.to === i.to)) {
      // "Nothing newer" is never a failure (D172): it is already where it can go.
      if (u.reason === "no_update") return { state: "done" };
      return { state: "failed", reason: u.reason ?? "failed", ...(u.detail ? { detail: u.detail } : {}), ...(u.rolledBack !== undefined ? { rolledBack: u.rolledBack } : {}) };
    }
    if (u?.phase === "done" && (!u.to || u.to === i.to)) return { state: "done" };
    if (u?.phase === "waiting") return { phase: "waiting" as AgentPhase };
    if (u?.phase) return { phase: u.phase };
    return undefined;
  }

  // One look at a time; a look asked for meanwhile runs right after it, and its caller waits for that.
  let current: Promise<void> | undefined;
  let again = false;
  function step(): Promise<void> {
    if (!plan || plan.finishedAt) return Promise.resolve();
    if (current) {
      again = true;
      return current;
    }
    current = (async () => {
      try {
        do {
          again = false;
          await stepOnce();
        } while (again && plan && !plan.finishedAt);
      } finally {
        current = undefined;
      }
    })();
    return current;
  }

  async function stepOnce() {
    const p = plan!;
    let devices: DeviceView[];
    try {
      devices = await d.devices();
    } catch {
      return;
    }
    const byId = new Map(devices.map((x) => [x.id, x]));
    const now = d.now();
    let dirty = false;
    const mark = (i: UpdateAllItem, patch: Partial<UpdateAllItem>) => {
      if (set(i, patch)) dirty = true;
    };
    const homeItem = p.items.find((i) => i.kind === "ducter" && byId.get(i.device)?.home);
    const ducterOf = (device: string) => p.items.find((i) => i.kind === "ducter" && i.device === device);
    const updates = d.updates();
    const agents = d.agents();

    // 1–2: each computer's Ducter.
    for (const i of p.items.filter((x) => x.kind === "ducter" && !isFinal(x))) {
      const dv = byId.get(i.device);
      const home = dv?.home ?? i === homeItem;
      if (i.state === "running") {
        const j = judgeDucter(i, dv);
        if (j) mark(i, j);
        if (!isFinal(i)) mark(i, { wait: !home && dv?.state !== "awake" ? "reconnect" : undefined });
        if (!isFinal(i) && now - (startedAt.get(i.key) ?? now) > DUCTER_STEP_MS) mark(i, { state: "failed", reason: "no_answer" });
        if (!startedAt.has(i.key)) startedAt.set(i.key, now); // a restarted home times it from now
        continue;
      }
      // A computer waits for the home, and never goes past one that didn't update.
      if (!home && homeItem && !isFinal(homeItem)) continue;
      if (!home && homeItem && homeItem.state !== "done") {
        mark(i, { state: "skipped", reason: "home", detail: homeItem.deviceName });
        continue;
      }
      if (!dv || (!dv.home && dv.state !== "awake")) {
        mark(i, { state: "skipped", reason: "offline" });
        continue;
      }
      const already = judgeDucter(i, dv);
      if (already?.state === "done") {
        mark(i, already);
        continue;
      }
      if (!updates) {
        mark(i, { state: "failed", reason: "failed", detail: "updates are not available" });
        continue;
      }
      // Marked before the call: a home that restarts at once finds its step under way, not queued.
      mark(i, { state: "running" });
      startedAt.set(i.key, now);
      if (dirty) save(), (dirty = false);
      const r = await updates.start(i.device, { to: i.to, by: p.by === "night" ? "night" : "user" }).catch((err) => ({ ok: false as const, reason: "failed" as const, detail: (err as Error).message }));
      if (!r.ok) {
        if (r.reason === "running") continue; // someone tapped 更新 there already: follow it
        if (r.reason === "no_release" && /already on/.test(r.detail ?? "")) mark(i, { state: "done" });
        else mark(i, { state: "failed", reason: r.reason, ...(r.detail ? { detail: r.detail } : {}), rolledBack: false });
      }
    }

    // 3: each computer's agents, one at a time there, once its Ducter step is over.
    // One updater at a time on a computer.
    const updating = (device: string) => p.items.some((x) => x.kind === "agent" && x.device === device && x.state === "running");
    for (const i of p.items.filter((x) => x.kind === "agent" && !isFinal(x))) {
      const dv = byId.get(i.device);
      const h = dv?.harnesses.find((x) => x.harness === i.harness);
      if (i.state === "running") {
        const away = !dv || (!dv.home && dv.state !== "awake");
        let j = judgeAgent(i, h);
        // An interruption counts only when it is news since this attempt started (a devices frame
        // from before it still shows the last one).
        if (j?.reason === "interrupted" && !(h?.update?.at && Date.parse(h.update.at) > Date.parse(i.at))) j = undefined;
        // Back, still on the old version, and nobody updating it, for a step this process didn't
        // start (a restarted home forgot the update, and its updater likely died too): judged like
        // an interruption. Started again, a worker still running it answers "running" and is followed.
        if (!j && !away && !h?.update && !dispatched.has(i.key) && !(h?.version && cmp(h.version, i.to) >= 0)) j = { state: "failed", reason: "interrupted" };
        if (j?.state === "failed" && j.reason === "interrupted" && !i.retried) {
          // D227: once more, said on the row; started below as soon as nothing holds it.
          mark(i, { state: "queued", retried: true });
          startedAt.delete(i.key);
        } else {
          if (j) mark(i, j);
          if (!isFinal(i)) mark(i, { wait: away ? "reconnect" : undefined });
          if (!isFinal(i) && now - (startedAt.get(i.key) ?? now) > AGENT_STEP_MS) mark(i, { state: "failed", reason: "no_answer" });
          if (!startedAt.has(i.key)) startedAt.set(i.key, now);
          continue;
        }
      }
      const own = ducterOf(i.device);
      if (own && !isFinal(own)) continue;
      // D227: that computer's Ducter is updating outside this plan: its restart would cut the
      // updater off, so the agent waits for it (and is judged afresh once it's back).
      if (dv && ducterMidUpdate(dv)) {
        mark(i, { state: "waiting", wait: "ducter" });
        continue;
      }
      if (homeItem && !isFinal(homeItem)) continue; // the home's restart would cut an updater off
      if (!dv || (!dv.home && dv.state !== "awake")) {
        mark(i, { state: "skipped", reason: "offline" });
        continue;
      }
      if (h?.version && cmp(h.version, i.to) >= 0) {
        mark(i, { state: "done" });
        continue;
      }
      if (updating(i.device)) continue;
      const n = d.busy(i.device, i.harness!);
      if (n > 0) {
        mark(i, { state: "waiting", busy: n, wait: undefined });
        continue;
      }
      if (!agents) {
        mark(i, { state: "failed", reason: "failed", detail: "agent updates are not available" });
        continue;
      }
      mark(i, { state: "running", wait: undefined });
      startedAt.set(i.key, now);
      dispatched.add(i.key);
      const r = await agents.start(i.device, i.harness!, { by: p.by === "night" ? "night" : "user", to: i.to }).catch((err) => ({ ok: false as const, reason: "failed" as const, detail: (err as Error).message }));
      if (!r.ok) {
        if (r.reason === "running") continue; // already updating there: follow it
        if (r.reason === "busy") mark(i, { state: "waiting", busy: Math.max(1, d.busy(i.device, i.harness!)) });
        else if (r.reason === "no_update") mark(i, { state: "done" });
        else mark(i, { state: "failed", reason: r.reason, ...(r.detail ? { detail: r.detail } : {}) });
      }
    }

    if (p.items.every(isFinal)) {
      p.finishedAt = iso();
      const failed = p.items.filter((i) => i.state === "failed");
      if (p.by === "night") for (const i of failed) nightFailed.set(`${i.key}@${i.to}`, now);
      logEvent({ id: p.id, phase: p.stopped ? "stopped" : "finished", by: p.by, items: p.items.length, done: p.items.filter((i) => i.state === "done").length, failed: failed.length });
      dirty = true;
    }
    if (dirty) save();
  }

  // Night: inside quiet hours (else 03:00–05:00 on the home's clock), the same plan to verified versions.
  async function nightly() {
    const s = d.settings?.();
    if (!s?.autoUpdate || running()) return;
    const q = s.quiet ?? { ...NIGHT_DEFAULT, tz: d.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone };
    if (!inQuiet(d.now(), q)) return;
    if ((d.working?.() ?? 0) > 0) return;
    await start("night");
  }

  const offUpdates = d.updates()?.onChange(() => void step());
  const offAgents = d.agents()?.onChange(() => void step());
  const tickMs = d.tickMs ?? PLAN_TICK_MS;
  const tick = tickMs > 0 ? setInterval(() => running() && void step().catch(() => {}), tickMs) : undefined;
  (tick as any)?.unref?.();
  const nightMs = d.nightEveryMs ?? 10 * 60_000;
  const night = nightMs > 0 ? setInterval(() => void nightly().catch(() => {}), nightMs) : undefined;
  (night as any)?.unref?.();
  // A plan the last process left unfinished: go on with it (its home step judged by what runs now).
  if (running()) queueMicrotask(() => void step().catch(() => {}));

  return {
    view,
    start,
    stop,
    dismiss,
    step,
    nightly,
    plan: () => plan,
    onChange(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    stop_() {
      clearInterval(tick);
      clearInterval(night);
      offUpdates?.();
      offAgents?.();
    },
  };
}
