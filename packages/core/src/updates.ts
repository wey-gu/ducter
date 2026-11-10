// The home's side of updating in place (D148): what each device stands at against the latest
// release, the update of the home itself (staged, at a safe point, restarted from a helper), the
// update op sent down a worker's socket, every step in the Log, and the night-time auto-update.
// The mechanics are in update.ts; the release check in release.ts.
import { statSync } from "node:fs";
import type { Bodies, DeviceUpdate, Settings, UpdateHow, UpdatePhase, UpdateReason } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { compareVersions, DUCTER_VERSION, isVersion } from "@ducter/protocol/src/version.ts";
import { FRESH_MS, hasNotes, type Release, type ReleaseWatch } from "./release.ts";
import { judgeResult, readResult, resultFile, runUpdate, writeResult, type Fail, type RunInput, type UpdateResult, type UpdateSys } from "./update.ts";
import { inQuiet } from "./push.ts";

/** How long 回来了 / Back stays on a card, and how long a failure does. */
export const DONE_SHOWN_MS = 30 * 60_000;
export const FAILED_SHOWN_MS = 24 * 60 * 60_000;
/** The safe point: a merge or an undo may take this long; a turn in flight gets TURN_GRACE_MS. */
export const CRITICAL_WAIT_MS = 15 * 60_000;
export const TURN_GRACE_MS = 2 * 60_000;
export const HOLD_MESSAGE = "Ducter is restarting for an update; try again in a minute.";

interface Progress {
  phase: UpdatePhase;
  progress?: number;
  from: string;
  to: string;
  reason?: UpdateReason;
  detail?: string;
  rolledBack?: boolean;
  at: number;
}

/** What a worker says about its update over its socket (worker.ts), and in its hello. */
export interface WorkerUpdateFrame {
  t: "update";
  phase: UpdatePhase;
  progress?: number;
  from: string;
  to: string;
  reason?: UpdateReason;
  detail?: string;
  rolledBack?: boolean;
}

export interface WorkerSide {
  /** Online workers: id, name, version and how they update (from their hello). */
  online(): { id: string; name: string; version?: string; how?: UpdateHow }[];
  /** Sends the update op; resolves with the worker's first answer (accepted or why not). */
  update(id: string, args: { to: string; explicit?: boolean }): Promise<{ ok: boolean; reason?: UpdateReason; detail?: string }>;
}

export interface UpdatesDeps {
  dataDir: string;
  log: LogStore;
  release: ReleaseWatch;
  sys: UpdateSys;
  /** This process: what it is and how it updates. */
  self: { execPath: string; how: UpdateHow; arch: string; port: number; env?: Record<string, string | undefined> };
  name: () => string; // the home's name
  workers?: () => WorkerSide | undefined;
  /** The runner's critical sections (merge, undo, keep, archive) and its hold (D148 (4)). */
  critical?: () => string[];
  holdCritical?: (why: string | undefined) => void;
  /** Tasks in the middle of a turn right now. */
  working?: () => number;
  settings?: () => Pick<Settings, "autoUpdate" | "quiet">;
  /** Tests: a fake run (the default runs update.ts's runUpdate). */
  run?: (i: RunInput) => ReturnType<typeof runUpdate>;
  version?: string;
  graceMs?: number;
  criticalWaitMs?: number;
  /** How often the night-time auto-update looks (0: never). */
  autoEveryMs?: number;
  /** How long after the start the helper's outcome is looked for (0: only on a card's view). */
  resultWatchMs?: number;
}

export interface Updates {
  /** What a device's card shows. id "local" is the home. */
  view(id: string, current: string | undefined, how: UpdateHow | undefined): DeviceUpdate | undefined;
  /** Update a device. Resolves once it is under way (or refused); progress comes as changes. */
  start(id: string, o?: { to?: string; by?: "user" | "night" }): Promise<{ ok: true } | Fail>;
  /** A worker's update frame (its socket) or the result in its hello. */
  fromWorker(id: string, name: string, f: WorkerUpdateFrame): void;
  /** Reads the latest release again now. */
  check(): Promise<Release | undefined>;
  /** Devices or Updates and about opened: read it again when the last answer is older than 15 min. */
  freshen(): void;
  /**
   * A device, a worker or an app says it runs v. Newer than the latest release known: that answer
   * is stale (a 0.0.6 app can't talk to a home that thinks 0.0.4 is the latest), so read it again
   * now (once per version every 15 min).
   */
  sawVersion(v: string | undefined): void;
  onChange(fn: () => void): () => void;
  /** The night-time look, once (the timer runs it too). */
  nightly(): Promise<void>;
  stop(): void;
}

export function createUpdates(d: UpdatesDeps): Updates {
  const version = d.version ?? DUCTER_VERSION;
  const states = new Map<string, Progress>();
  const fns = new Set<() => void>();
  const changed = () => fns.forEach((fn) => queueMicrotask(fn));
  const offRelease = d.release.onChange(changed);
  const now = () => d.sys.now();

  const log = (device: string, name: string, p: Progress) => {
    const body: Bodies["device_update"] = {
      device,
      name,
      phase: p.phase,
      from: p.from,
      to: p.to,
      ...(p.reason ? { reason: p.reason } : {}),
      ...(p.detail ? { detail: p.detail } : {}),
      ...(p.rolledBack !== undefined ? { rolledBack: p.rolledBack } : {}),
    };
    try {
      d.log.append({ stream: "devices", origin: "system", kind: "device_update", body });
    } catch (err) {
      console.warn("[update] could not log:", (err as Error).message);
    }
  };

  const set = (id: string, name: string, p: Omit<Progress, "at">, quietStep = false) => {
    const prev = states.get(id);
    const next = { ...p, at: now() };
    states.set(id, next);
    // Every phase change is logged once; download progress isn't.
    if (!quietStep && prev?.phase !== p.phase) log(id, name, next);
    changed();
  };

  // The restart's outcome, left by the helper (update.ts finish): logged once, shown a while.
  // The helper writes it only once this Ducter answers, so it is read again whenever the file
  // changes (on a card's view, and every few seconds for a while after the start), and judged
  // against the version this runs (D167): an old file left by an earlier attempt, or by the
  // update before this one, never makes a Ducter on the target say it didn't update.
  let seen = "";
  function absorb() {
    let stamp = "";
    try {
      const st = statSync(resultFile(d.dataDir));
      stamp = `${st.mtimeMs}:${st.size}`;
    } catch {
      return;
    }
    if (stamp === seen) return;
    seen = stamp;
    const r = readResult(d.dataDir);
    if (!r || r.reported) return;
    const judged = judgeResult(r, version);
    if (judged === "pending") return; // swapped, not restarted yet: this process already says so
    if (running("local")) return; // an update of its own is under way; its own outcome follows
    if (judged !== "superseded") {
      set("local", d.name(), {
        phase: judged,
        from: r.from,
        to: r.to,
        ...(judged === "failed" ? { reason: r.reason ?? "health", detail: r.detail ?? `still on ${version}`, rolledBack: r.rolledBack ?? false } : {}),
      });
      const at = Date.parse(r.at);
      if (Number.isFinite(at)) states.get("local")!.at = at;
    }
    writeResult(d.dataDir, { ...r, reported: true } satisfies UpdateResult);
    try {
      const st = statSync(resultFile(d.dataDir));
      seen = `${st.mtimeMs}:${st.size}`;
    } catch {}
  }

  const running = (id: string) => {
    const p = states.get(id)?.phase;
    return p === "downloading" || p === "verifying" || p === "waiting" || p === "restarting";
  };

  absorb();
  const watchMs = d.resultWatchMs ?? 15 * 60_000;
  const watch = watchMs > 0 ? setInterval(absorb, 3000) : undefined;
  const watchEnd = watch ? setTimeout(() => clearInterval(watch), watchMs) : undefined;
  (watch as any)?.unref?.();
  (watchEnd as any)?.unref?.();

  const asked = new Map<string, number>();
  function sawVersion(v: string | undefined) {
    if (!v || !isVersion(v)) return;
    const latest = d.release.latest()?.version;
    if (latest && compareVersions(v, latest) <= 0) return;
    if (!latest && !d.release.checkedAt()) return; // never read yet: the first check is on its way
    const last = asked.get(v);
    if (last !== undefined && now() - last < FRESH_MS) return;
    asked.set(v, now());
    void d.release.check(true);
  }

  function freshen() {
    const at = Date.parse(d.release.checkedAt() ?? "");
    if (!Number.isFinite(at) || now() - at >= FRESH_MS) void d.release.check(true);
  }

  // This Ducter itself, newer than the last answer (a home updated by hand).
  queueMicrotask(() => sawVersion(version));

  function view(id: string, current: string | undefined, how: UpdateHow | undefined): DeviceUpdate | undefined {
    if (!current) return undefined;
    if (id === "local") absorb();
    sawVersion(current);
    const rel = d.release.latest();
    const latest = rel?.version;
    const available = Boolean(latest && compareVersions(latest, current) > 0);
    const out: DeviceUpdate = {
      current,
      available,
      how: how ?? "source",
      ...(latest ? { latest } : {}),
      ...(available && hasNotes(rel?.notes) ? { notesBy: rel!.notes } : {}),
      ...(available && rel?.security ? { security: true } : {}),
      ...(d.release.checkedAt() ? { checkedAt: d.release.checkedAt() } : {}),
    };
    const p = states.get(id);
    if (p) {
      const age = now() - p.at;
      // A failure stands only while the device still runs what it started from (D167): one
      // that has since reached the target, or moved on, didn't fail as far as anyone can see.
      // "Nothing newer is out" is never a failure.
      const stands = p.phase !== "failed" || (p.reason !== "no_release" && judgeResult({ ok: false, from: p.from, to: p.to }, current) === "failed");
      const shown = stands && (p.phase === "done" ? age < DONE_SHOWN_MS : p.phase === "failed" ? age < FAILED_SHOWN_MS : true);
      if (shown) {
        Object.assign(out, {
          phase: p.phase,
          from: p.from,
          to: p.to,
          at: new Date(p.at).toISOString(),
          ...(p.progress !== undefined ? { progress: p.progress } : {}),
          ...(p.reason ? { reason: p.reason } : {}),
          ...(p.detail ? { detail: p.detail } : {}),
          ...(p.rolledBack !== undefined ? { rolledBack: p.rolledBack } : {}),
        });
      }
    }
    return out;
  }

  /** The safe point: no merge or undo mid-way (new ones are held), turns get a short grace. */
  async function settle(): Promise<Fail | undefined> {
    d.holdCritical?.(HOLD_MESSAGE);
    const end = now() + (d.criticalWaitMs ?? CRITICAL_WAIT_MS);
    while ((d.critical?.() ?? []).length) {
      if (now() > end) {
        d.holdCritical?.(undefined);
        return { ok: false, reason: "busy", detail: `still merging or undoing: ${(d.critical?.() ?? []).join(", ")}` };
      }
      await d.sys.sleep(1000);
    }
    // A task mid-turn is resumed after the restart (the runner's recovery), so it only gets a grace.
    const grace = now() + (d.graceMs ?? TURN_GRACE_MS);
    while ((d.working?.() ?? 0) > 0 && now() < grace) await d.sys.sleep(1000);
  }

  async function startHome(to: string, explicit: boolean): Promise<{ ok: true } | Fail> {
    if (d.self.how !== "self") return { ok: false, reason: d.self.how };
    const name = d.name();
    const run = d.run ?? ((i: RunInput) => runUpdate(d.sys, i));
    set("local", name, { phase: "downloading", progress: 0, from: version, to });
    void (async () => {
      const out = await run({
        dataDir: d.dataDir,
        current: version,
        to,
        explicit,
        arch: d.self.arch,
        execPath: d.self.execPath,
        role: "home",
        port: d.self.port,
        env: d.self.env,
        settle,
        onPhase: (phase, progress) => set("local", name, { phase, from: version, to, ...(progress !== undefined ? { progress } : {}) }, phase === "downloading" && states.get("local")?.phase === "downloading"),
      }).catch((err): Fail => ({ ok: false, reason: "failed", detail: (err as Error).message }));
      if (!out.ok) {
        d.holdCritical?.(undefined);
        set("local", name, { phase: "failed", from: version, to, reason: out.reason, ...(out.detail ? { detail: out.detail } : {}), rolledBack: false });
      } else if (!out.restarting) {
        // Swapped, no service to restart it: the person restarts Ducter.
        d.holdCritical?.(undefined);
        set("local", name, { phase: "done", from: version, to, detail: "restart Ducter to run it" });
      }
      // restarting: this process is about to be replaced; the new one logs the outcome.
    })();
    return { ok: true };
  }

  async function start(id: string, o: { to?: string; by?: "user" | "night" } = {}): Promise<{ ok: true } | Fail> {
    if (running(id)) return { ok: false, reason: "running" };
    let to = o.to;
    if (!to) {
      const rel = (await d.release.check(true)) ?? d.release.latest();
      if (!rel) return { ok: false, reason: d.release.checkedAt() ? "no_release" : "network" };
      to = rel.version;
    }
    if (id === "local" || id === d.name()) return startHome(to, Boolean(o.to));
    const ws = d.workers?.();
    const w = ws?.online().find((x) => x.id === id || x.name === id);
    if (!ws || !w) return { ok: false, reason: "offline" };
    if (w.how && w.how !== "self") return { ok: false, reason: w.how };
    const from = w.version ?? "?";
    if (!o.to && w.version && compareVersions(to, w.version) <= 0) return { ok: false, reason: "no_release", detail: `already on ${w.version}` };
    const res = await ws.update(w.id, { to, explicit: Boolean(o.to) }).catch((err) => ({ ok: false, reason: "offline" as UpdateReason, detail: (err as Error).message }));
    if (!res.ok) return { ok: false, reason: res.reason ?? "failed", ...(res.detail ? { detail: res.detail } : {}) };
    set(w.id, w.name, { phase: "downloading", progress: 0, from, to });
    return { ok: true };
  }

  function fromWorker(id: string, name: string, f: WorkerUpdateFrame) {
    const quiet = f.phase === "downloading" && states.get(id)?.phase === "downloading";
    set(id, name, { phase: f.phase, from: f.from, to: f.to, ...(f.progress !== undefined ? { progress: f.progress } : {}), ...(f.reason ? { reason: f.reason } : {}), ...(f.detail ? { detail: f.detail } : {}), ...(f.rolledBack !== undefined ? { rolledBack: f.rolledBack } : {}) }, quiet);
  }

  /** D148 (10): in quiet hours, nothing working, nothing critical: workers first, then the home. */
  async function nightly() {
    const s = d.settings?.();
    if (!s?.autoUpdate || !inQuiet(now(), s.quiet ?? null)) return;
    if ((d.working?.() ?? 0) > 0 || (d.critical?.() ?? []).length) return;
    const rel = await d.release.check();
    if (!rel) return;
    for (const w of d.workers?.()?.online() ?? []) {
      if (w.how === "self" && w.version && compareVersions(rel.version, w.version) > 0 && !running(w.id)) await start(w.id, { by: "night" });
    }
    const anyWorker = [...states.entries()].some(([id]) => id !== "local" && running(id));
    if (!anyWorker && d.self.how === "self" && compareVersions(rel.version, version) > 0 && !running("local")) await start("local", { by: "night" });
  }

  const every = d.autoEveryMs ?? 10 * 60_000;
  const timer = every > 0 ? setInterval(() => void nightly().catch(() => {}), every) : undefined;
  (timer as any)?.unref?.();

  return {
    view,
    start,
    fromWorker,
    check: () => d.release.check(true),
    freshen,
    sawVersion,
    onChange(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    nightly,
    stop() {
      clearInterval(timer);
      clearInterval(watch);
      clearTimeout(watchEnd);
      offRelease();
    },
  };
}
