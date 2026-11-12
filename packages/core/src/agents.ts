// Updating the AI agents themselves (D156, design/system.md "Updating the AI agents"): which
// version each device's Codex, Claude Code, pi and DeepSeek Harness runs, the newest on the
// channel that copy came from, and an update with the agent's own updater at a safe point, read
// back and rolled back where the channel can pin. Facts per agent: harness-facts `channels`
// (research/42). One path for the home, a worker (the `agent_update` op) and `ducter update --agents`.
//
//   know:    version + how (harness-probe.ts) · latest per channel, cached 6 h, silent offline
//   update:  wait until nothing on that agent works there → run its updater (pinned to the
//            version when the channel can) → read the version back and the login → a copy that
//            doesn't answer, or lost its login, goes back to the old version where pinning is
//   night:   the D148 switch: quiet hours, nothing working, only versions Ducter verified
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentHow, AgentPhase, AgentReason, AgentUpdate, Bodies, DeviceHarness, Settings } from "@ducter/protocol";
import { CASK_LATEST, HARNESS_FACTS, NPM_LATEST, versionStanding } from "@ducter/protocol/src/harness-facts.ts";
import { isHarnessId, type HarnessId } from "@ducter/protocol/src/harnesses.ts";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { compareVersions, versionIn, type AgentInstall } from "./harness-probe.ts";
import { inQuiet } from "./push.ts";
import type { Fetch } from "./release.ts";
import type { UpdateSys } from "./update.ts";

export const AGENT_CHECK_EVERY_MS = 6 * 60 * 60_000;
/** How long an update waits for work on that agent to settle before it gives up. */
export const AGENT_SETTLE_MS = 30 * 60_000;
/** An updater gets this long (a download, npm). */
export const AGENT_INSTALL_MS = 10 * 60_000;
export const AGENT_DONE_SHOWN_MS = 30 * 60_000;
export const AGENT_FAILED_SHOWN_MS = 24 * 60 * 60_000;

const cmp = (a: string, b: string) => compareVersions(a, b) ?? (a === b ? 0 : a < b ? -1 : 1);

// ---------- facts ----------

/** Where this copy's channel says its latest version (undefined: an app, Ducter's own, unknown). */
export function latestUrl(h: HarnessId, how: AgentHow | undefined): string | undefined {
  const ch = HARNESS_FACTS[h].channels.value;
  if (how === "npm" && ch.npm) return NPM_LATEST(ch.npm);
  if (how === "brew" && ch.cask) return CASK_LATEST(ch.cask);
  if (how === "installer") return ch.installer?.latest;
}

/** Ducter can update this copy from here. */
export const updatable = (how: AgentHow | undefined) => how === "npm" || how === "brew" || how === "installer";

/** This copy's channel installs a named version, so a bad update can go back. */
export function canPin(h: HarnessId, how: AgentHow | undefined): boolean {
  return how === "npm" ? !!HARNESS_FACTS[h].channels.value.npm : how === "installer" ? !!HARNESS_FACTS[h].channels.value.installer?.pin : false;
}

/** A version inside the range harness-facts was verified on. */
export const inVerified = (h: HarnessId, v: string) => versionStanding(h, v) === "verified";

/** The version a channel's answer names: a bare version, JSON {version}, or a cask's "1.2.3,build". */
export function parseLatest(text: string): string | undefined {
  const s = text.trim();
  let v: unknown = s;
  if (s.startsWith("{")) {
    try {
      v = JSON.parse(s)?.version;
    } catch {
      return undefined;
    }
  }
  if (typeof v !== "string") return undefined;
  const m = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:,.*)?$/.exec(v.trim());
  return m?.[1];
}

export interface AgentPlan {
  argv: string[];
  /** It installs exactly the version asked for. */
  pinned: boolean;
  env?: Record<string, string>;
}

/**
 * The command that updates this copy to `to` with its own channel (research/42): npm installs the
 * named version under the same prefix; Homebrew upgrades the cask (no version); the agent's own
 * installer runs its updater for the newest, or its pinned install for any other version. An
 * app's copy, Ducter's own pi and an unknown copy have none.
 */
export function updatePlan(h: HarnessId, a: AgentInstall, to: string, o: { latest?: string; exists?: (p: string) => boolean } = {}): AgentPlan | undefined {
  const ch = HARNESS_FACTS[h].channels.value;
  const exists = o.exists ?? existsSync;
  switch (a.how) {
    case "npm": {
      if (!ch.npm) return undefined;
      const npm = a.prefix && exists(join(a.prefix, "bin", "npm")) ? join(a.prefix, "bin", "npm") : "npm";
      return { argv: [npm, ...(a.prefix ? ["--prefix", a.prefix] : []), "install", "-g", `${ch.npm}@${to}`], pinned: true, env: { npm_config_update_notifier: "false", npm_config_fund: "false" } };
    }
    case "brew":
      return ch.cask ? { argv: ["brew", "upgrade", "--cask", ch.cask], pinned: false, env: { HOMEBREW_NO_ENV_HINTS: "1" } } : undefined;
    case "installer": {
      const inst = ch.installer;
      if (!inst) return undefined;
      const own = (argv: string[]) => (a.path && argv[0] === HARNESS_FACTS[h].version.command[0] ? [a.path, ...argv.slice(1)] : argv);
      if (inst.pin && (!o.latest || cmp(to, o.latest) !== 0)) return { argv: own(inst.pin.map((x) => x.replaceAll("{v}", to))), pinned: true };
      return { argv: own(inst.update), pinned: false };
    }
    default:
      return undefined;
  }
}

// ---------- the latest version per channel ----------

export interface AgentLatest {
  /** The channel's latest as last read (undefined: never read, or no channel). */
  get(h: HarnessId, how: AgentHow | undefined): string | undefined;
  checkedAt(): string | undefined;
  /** Reads the channels of these copies again when older than 6 h (force: now). Never throws. */
  refresh(copies: { harness: string; how?: AgentHow }[], force?: boolean): Promise<void>;
  onChange(fn: () => void): () => void;
}

type LatestSaved = Record<string, { version?: string; at: string }>;

/** One read per channel URL, kept in <dataDir>/updates/agents-latest.json. DUCTER_UPDATE_CHECK=off never asks. */
export function createAgentLatest(o: { dataDir: string; fetch?: Fetch; now?: () => number; env?: Record<string, string | undefined>; everyMs?: number }): AgentLatest {
  const env = o.env ?? process.env;
  const now = o.now ?? Date.now;
  const every = o.everyMs ?? AGENT_CHECK_EVERY_MS;
  const off = !o.fetch || /^(0|off|false|no)$/i.test((env.DUCTER_UPDATE_CHECK ?? "").trim());
  const file = join(o.dataDir, "updates", "agents-latest.json");
  let saved: LatestSaved = {};
  try {
    if (existsSync(file)) saved = JSON.parse(readFileSync(file, "utf8")) ?? {};
  } catch {}
  const fns = new Set<() => void>();
  const inflight = new Map<string, Promise<void>>();
  const persist = () => {
    try {
      mkdirSync(join(o.dataDir, "updates"), { recursive: true });
      writeFileSync(file + ".tmp", JSON.stringify(saved, null, 2));
      renameSync(file + ".tmp", file);
    } catch {}
  };
  // Tests and the E2E rig only: an npm registry on this machine (http://127.0.0.1 or localhost)
  // answers for registry.npmjs.org; anything else is ignored.
  const reg = (env.DUCTER_NPM_REGISTRY ?? "").trim().replace(/\/+$/, "");
  const npmMirror = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(reg) ? reg : undefined;
  const readOne = (url: string) => {
    let p = inflight.get(url);
    if (p) return p;
    p = (async () => {
      try {
        const r = await o.fetch!(npmMirror ? url.replace(/^https:\/\/registry\.npmjs\.org/, npmMirror) : url, { headers: { accept: "application/json, text/plain", "user-agent": "ducter-agents" }, signal: AbortSignal.timeout(10_000) });
        if (!r.ok) return;
        const v = parseLatest(await r.text());
        if (!v) return;
        const before = saved[url]?.version;
        saved[url] = { version: v, at: new Date(now()).toISOString() };
        persist();
        if (before !== v) for (const fn of fns) queueMicrotask(fn);
      } catch {
        // Offline or refused: keep what we knew.
      } finally {
        inflight.delete(url);
      }
    })();
    inflight.set(url, p);
    return p;
  };
  return {
    get: (h, how) => {
      const u = latestUrl(h, how);
      return u ? saved[u]?.version : undefined;
    },
    checkedAt: () =>
      Object.values(saved)
        .map((s) => s.at)
        .sort()
        .at(-1),
    async refresh(copies, force = false) {
      if (off) return;
      const urls = new Set<string>();
      for (const c of copies) {
        if (!isHarnessId(c.harness)) continue;
        const u = latestUrl(c.harness, c.how);
        if (!u) continue;
        const age = saved[u] ? now() - Date.parse(saved[u]!.at) : Infinity;
        if (force || !(age < every)) urls.add(u);
      }
      await Promise.all([...urls].map(readOne));
    },
    onChange(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
  };
}

// ---------- one update, on the machine the agent is on ----------

export type AgentFail = { ok: false; reason: AgentReason; detail?: string; rolledBack?: boolean };
/** already: the copy was on (or past) the target before anything ran; nothing newer to do, never a failure. */
export type AgentOutcome = { ok: true; from: string; to: string; already?: boolean } | (AgentFail & { from?: string; to?: string });

/**
 * An update's outcome judged against the version installed now (the D167 rule, for agents): on
 * its target, it is done whatever was said; still on the version it started from, a failure
 * stands; on anything else (updated since, by hand or by another update), it is superseded and
 * shown no more. "Nothing newer" (no_update) is never a failure.
 */
export function judgeAgent(u: Pick<AgentUpdate, "phase" | "from" | "to" | "reason">, version: string | undefined): "stands" | "done" | "superseded" {
  if (u.phase !== "done" && u.phase !== "failed") return "stands"; // still under way
  if (!version || !versionIn(version)) return u.phase === "failed" && u.reason !== "no_update" ? "stands" : "superseded";
  if (u.to && versionIn(u.to) && cmp(version, u.to) === 0) return "done";
  if (u.phase === "done" || u.reason === "no_update") return "superseded";
  return u.from && cmp(version, u.from) === 0 ? "stands" : "superseded";
}

export interface AgentRunInput {
  harness: HarnessId;
  /** The version to go to; the channel's latest when the copy can't pin. */
  to: string;
  /** The channel's latest (an installer updates to it with its own updater). */
  latest?: string;
  /** This copy as it is now (path, version, how): read before and after. */
  detect(): Promise<AgentInstall | undefined>;
  /** Its login answers (claude auth status, codex login status, a key's presence). */
  loggedIn(): Promise<boolean>;
  /** The safe point: resolves when nothing on this agent works here (or why it gave up). */
  settle?: () => Promise<AgentFail | undefined>;
  /** Held while the updater runs: no new session on this agent starts. */
  hold?: (on: boolean) => void;
  onPhase?: (phase: AgentPhase, to?: string) => void;
  exists?: (p: string) => boolean;
}

const firstLine = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .at(-1)
    ?.slice(0, 200);

/** The whole update of one agent on this machine. Judged by the version read back, never the updater's exit code. */
export async function updateAgent(sys: Pick<UpdateSys, "run">, i: AgentRunInput): Promise<AgentOutcome> {
  const h = i.harness;
  const before = await i.detect();
  if (!before?.version) return { ok: false, reason: "failed", detail: "not installed here" };
  const from = before.version;
  const plan = updatePlan(h, before, i.to, { latest: i.latest, exists: i.exists });
  if (!plan) return { ok: false, reason: "how", from, detail: before.how };
  // Already there (a stale view of this copy asked for it): done, with nothing run.
  if (cmp(from, i.to) >= 0) return { ok: true, from, to: from, already: true };
  const wasIn = await i.loggedIn().catch(() => false);
  if (i.settle) {
    i.onPhase?.("waiting", i.to);
    const f = await i.settle();
    if (f) return { ...f, from, to: i.to };
  }
  i.onPhase?.("updating", i.to);
  i.hold?.(true);
  try {
    const r = await sys.run(plan.argv, { timeoutMs: AGENT_INSTALL_MS, ...(plan.env ? { env: plan.env } : {}) });
    i.onPhase?.("checking", i.to);
    const after = await i.detect();
    const back = async (reason: AgentReason, detail?: string): Promise<AgentOutcome> => {
      // Back to the version that worked, where the channel can name it.
      const undo = canPin(h, before.how) ? updatePlan(h, before, from, { exists: i.exists }) : undefined;
      if (!undo?.pinned) return { ok: false, reason, from, to: i.to, rolledBack: false, ...(detail ? { detail } : {}) };
      await sys.run(undo.argv, { timeoutMs: AGENT_INSTALL_MS, ...(undo.env ? { env: undo.env } : {}) });
      const again = await i.detect();
      return { ok: false, reason, from, to: i.to, rolledBack: again?.version === from, ...(detail ? { detail } : {}) };
    };
    if (!after?.version) return await back("version", firstLine(r.out) ?? `exit ${r.code}`);
    if (cmp(after.version, from) === 0) return { ok: false, reason: r.code === 0 ? "unchanged" : "failed", from, to: i.to, rolledBack: false, ...(firstLine(r.out) ? { detail: firstLine(r.out) } : {}) };
    if (wasIn && !(await i.loggedIn().catch(() => false))) return await back("signed_out");
    return { ok: true, from, to: after.version };
  } finally {
    i.hold?.(false);
  }
}

/** What a worker says about an agent update over its socket (cli/worker.ts). */
export interface WorkerAgentFrame {
  t: "agent_update";
  harness: string;
  phase: AgentPhase;
  from: string;
  to?: string;
  reason?: AgentReason;
  detail?: string;
  rolledBack?: boolean;
}

// ---------- the home's side: every device's agents ----------

export interface AgentWorkerSide {
  online(): { id: string; name: string }[];
  /** Sends the agent_update op; resolves with the worker's first answer (accepted or why not). */
  update(id: string, args: { harness: string; to: string; latest?: string }): Promise<{ ok: boolean; reason?: AgentReason; detail?: string }>;
}

export interface AgentUpdatesDeps {
  log: LogStore;
  sys: Pick<UpdateSys, "run" | "sleep" | "now">;
  latest: AgentLatest;
  /** The home's name. */
  name: () => string;
  /** This machine's copy of an agent, read fresh. */
  detect: (h: HarnessId) => Promise<AgentInstall | undefined>;
  loggedIn: (h: HarnessId) => Promise<boolean>;
  /** Sessions on this agent on that device mid-turn (tasks; the partner's turn on the home). */
  busy: (device: string, h: HarnessId) => number;
  /** No new session on this agent starts on the home while its updater runs. */
  hold?: (h: HarnessId, on: boolean) => void;
  workers?: () => AgentWorkerSide | undefined;
  settings?: () => Pick<Settings, "autoUpdate" | "quiet">;
  /** Every device's agents as the devices frame last saw them (the night-time look reads it). */
  devices?: () => Promise<{ id: string; name: string; awake: boolean; harnesses: DeviceHarness[] }[]>;
  /** The home's probe is stale after an update (devices.ts refresh). */
  probed?: () => void;
  settleMs?: number;
  /** How often the night-time look runs (0: never). */
  autoEveryMs?: number;
  exists?: (p: string) => boolean;
}

export interface AgentUpdates {
  /** A device's agents with their latest, standing and any update under way. */
  view(device: string, list: DeviceHarness[]): DeviceHarness[];
  /** Update one agent on a device. Resolves once it is under way (or refused). */
  start(device: string, harness: string, o?: { by?: "user" | "night"; to?: string }): Promise<{ ok: true } | AgentFail>;
  fromWorker(id: string, name: string, f: WorkerAgentFrame): void;
  /**
   * D226: a worker said hello again. When its Ducter restarted (`restarted`), an update this home
   * still thinks runs there and that it no longer runs (`running`) died with it: on its target it
   * is done, else it was interrupted. A plain reconnect leaves it be (the worker's frames follow).
   */
  reconnected(id: string, name: string, o: { restarted: boolean; running?: string[]; harnesses?: { id: string; version?: string }[] }): void;
  /** Agents whose updater runs on that device now, past its safe point (the home's own restart waits for these, D226). */
  updating(device: string): string[];
  /** Reads every channel again now. */
  check(): Promise<void>;
  nightly(): Promise<void>;
  onChange(fn: () => void): () => void;
  stop(): void;
}

interface AgentState extends AgentUpdate {
  atMs: number;
}

/**
 * Where the night-time update may take this copy: the channel's latest when Ducter verified it;
 * else, where the channel can pin, the newest verified version (when it is newer than this one
 * and not past the channel's latest). Never a version outside the verified range.
 */
export function nightTarget(h: HarnessId, how: AgentHow | undefined, version: string, latest: string | undefined): string | undefined {
  if (!updatable(how)) return undefined;
  if (latest && inVerified(h, latest) && cmp(latest, version) > 0) return latest;
  const top = HARNESS_FACTS[h].verified.to;
  if (canPin(h, how) && inVerified(h, top) && cmp(top, version) > 0 && (!latest || cmp(top, latest) <= 0)) return top;
}

export function createAgentUpdates(d: AgentUpdatesDeps): AgentUpdates {
  const states = new Map<string, AgentState>();
  const fns = new Set<() => void>();
  const changed = () => fns.forEach((fn) => queueMicrotask(fn));
  const offLatest = d.latest.onChange(changed);
  const now = () => d.sys.now();
  const key = (device: string, h: string) => `${device}|${h}`;

  const set = (device: string, name: string, h: string, p: Omit<AgentUpdate, "at">) => {
    const prev = states.get(key(device, h));
    const atMs = now();
    states.set(key(device, h), { ...p, at: new Date(atMs).toISOString(), atMs });
    if (prev?.phase !== p.phase) {
      const body: Bodies["agent_update"] = {
        device,
        name,
        harness: h,
        phase: p.phase,
        from: p.from,
        ...(p.to ? { to: p.to } : {}),
        ...(p.reason ? { reason: p.reason } : {}),
        ...(p.detail ? { detail: p.detail } : {}),
        ...(p.rolledBack !== undefined ? { rolledBack: p.rolledBack } : {}),
        ...(p.by ? { by: p.by } : {}),
      };
      try {
        d.log.append({ stream: "devices", origin: "system", kind: "agent_update", body });
      } catch (err) {
        console.warn("[agents] could not log:", (err as Error).message);
      }
    }
    changed();
  };

  /** Nothing to show for it (an update that found it already there). */
  const clear = (device: string, h: string) => {
    if (states.delete(key(device, h))) changed();
  };

  const running = (device: string, h: string) => {
    const p = states.get(key(device, h))?.phase;
    return p === "waiting" || p === "updating" || p === "checking";
  };

  function view(device: string, list: DeviceHarness[]): DeviceHarness[] {
    const copies = list.filter((h) => h.installed && h.version && updatable(h.how));
    if (copies.length) void d.latest.refresh(copies); // stale channels are read in the background
    return list.map((h) => {
      if (!isHarnessId(h.harness)) return h;
      const out: DeviceHarness = { ...h };
      if (h.version) {
        out.standing = versionStanding(h.harness, h.version);
        const latest = d.latest.get(h.harness, h.how);
        if (latest) {
          out.latest = latest;
          out.available = updatable(h.how) && cmp(latest, h.version) > 0;
          out.latestVerified = inVerified(h.harness, latest);
        } else if (updatable(h.how)) out.available = false;
      }
      const s = states.get(key(device, h.harness));
      if (s) {
        const age = now() - s.atMs;
        // Judged against the version there now: a failure the copy has moved past isn't one.
        const j = judgeAgent(s, h.version);
        const phase = j === "done" ? "done" : s.phase;
        const shown = j !== "superseded" && (phase === "done" ? age < AGENT_DONE_SHOWN_MS : phase === "failed" ? age < AGENT_FAILED_SHOWN_MS : true);
        if (shown) {
          const { atMs: _, ...u } = s;
          out.update = j === "done" && s.phase === "failed" ? { phase: "done", from: u.from, at: u.at, ...(u.to ? { to: u.to } : {}), ...(u.by ? { by: u.by } : {}) } : u;
        }
      }
      return out;
    });
  }

  /** The safe point: nothing on this agent mid-turn on that device. */
  const settleFor = (device: string, h: HarnessId) => async (): Promise<AgentFail | undefined> => {
    const end = now() + (d.settleMs ?? AGENT_SETTLE_MS);
    while (d.busy(device, h) > 0) {
      if (now() > end) return { ok: false, reason: "busy", detail: `${d.busy(device, h)} still working on it` };
      await d.sys.sleep(2000);
    }
  };

  async function startLocal(h: HarnessId, o: { by?: "user" | "night"; to?: string }): Promise<{ ok: true } | AgentFail> {
    const a = await d.detect(h);
    if (!a?.version) return { ok: false, reason: "failed", detail: "not installed here" };
    if (!updatable(a.how)) return { ok: false, reason: "how", detail: a.how };
    const latest = d.latest.get(h, a.how) ?? (await d.latest.refresh([{ harness: h, how: a.how }], true), d.latest.get(h, a.how));
    const to = o.to ?? latest;
    if (!to) return { ok: false, reason: "network" };
    if (cmp(to, a.version) <= 0 && !o.to) return { ok: false, reason: "no_update", detail: `already on ${a.version}` };
    const name = d.name();
    const base = { from: a.version, to, ...(o.by ? { by: o.by } : {}) };
    set("local", name, h, { phase: "waiting", ...base });
    void (async () => {
      const out = await updateAgent(d.sys, {
        harness: h,
        to,
        ...(latest ? { latest } : {}),
        detect: () => d.detect(h),
        loggedIn: () => d.loggedIn(h),
        settle: settleFor("local", h),
        hold: (on) => d.hold?.(h, on),
        onPhase: (phase) => phase !== "waiting" && set("local", name, h, { phase, ...base }),
        ...(d.exists ? { exists: d.exists } : {}),
      }).catch((err): AgentOutcome => ({ ok: false, reason: "failed", detail: (err as Error).message }));
      d.probed?.();
      if (out.ok && out.already) clear("local", h);
      else if (out.ok) set("local", name, h, { phase: "done", from: out.from, to: out.to, ...(o.by ? { by: o.by } : {}) });
      else
        set("local", name, h, {
          phase: "failed",
          ...base,
          reason: out.reason,
          ...(out.detail ? { detail: out.detail } : {}),
          ...(out.rolledBack !== undefined ? { rolledBack: out.rolledBack } : {}),
        });
    })();
    return { ok: true };
  }

  async function start(device: string, harness: string, o: { by?: "user" | "night"; to?: string } = {}): Promise<{ ok: true } | AgentFail> {
    if (!isHarnessId(harness)) return { ok: false, reason: "failed", detail: `${harness} isn't an AI agent Ducter knows` };
    if (running(device, harness)) return { ok: false, reason: "running" };
    if (device === "local" || device === d.name()) return startLocal(harness, o);
    const ws = d.workers?.();
    const w = ws?.online().find((x) => x.id === device || x.name === device);
    if (!ws || !w) return { ok: false, reason: "offline" };
    const seen = (await d.devices?.())?.find((x) => x.id === w.id)?.harnesses.find((x) => x.harness === harness);
    if (!seen?.version) return { ok: false, reason: "failed", detail: "not installed there" };
    if (!updatable(seen.how)) return { ok: false, reason: "how", detail: seen.how };
    const latest = d.latest.get(harness, seen.how);
    const to = o.to ?? latest;
    if (!to) return { ok: false, reason: "network" };
    if (cmp(to, seen.version) <= 0 && !o.to) return { ok: false, reason: "no_update", detail: `already on ${seen.version}` };
    const res = await ws.update(w.id, { harness, to, ...(latest ? { latest } : {}) }).catch((err) => ({ ok: false, reason: "offline" as AgentReason, detail: (err as Error).message }));
    if (!res.ok) return { ok: false, reason: res.reason ?? "failed", ...(res.detail ? { detail: res.detail } : {}) };
    set(w.id, w.name, harness, { phase: "waiting", from: seen.version, to, ...(o.by ? { by: o.by } : {}) });
    return { ok: true };
  }

  function fromWorker(id: string, name: string, f: WorkerAgentFrame) {
    const by = states.get(key(id, f.harness))?.by;
    set(id, name, f.harness, {
      phase: f.phase,
      from: f.from,
      ...(f.to ? { to: f.to } : {}),
      ...(f.reason ? { reason: f.reason } : {}),
      ...(f.detail ? { detail: f.detail } : {}),
      ...(f.rolledBack !== undefined ? { rolledBack: f.rolledBack } : {}),
      ...(by ? { by } : {}),
    });
  }

  function reconnected(id: string, name: string, o: { restarted: boolean; running?: string[]; harnesses?: { id: string; version?: string }[] }) {
    for (const [k, s] of [...states]) {
      const [device, h] = k.split("|") as [string, string];
      if (device !== id || !running(device, h)) continue;
      const v = o.harnesses?.find((x) => x.id === h)?.version;
      if (v && s.to && versionIn(v) && cmp(v, s.to) >= 0) {
        set(id, name, h, { phase: "done", from: s.from, to: v, ...(s.by ? { by: s.by } : {}) });
        continue;
      }
      if (!o.restarted || o.running?.includes(h)) continue;
      set(id, name, h, { phase: "failed", from: s.from, ...(s.to ? { to: s.to } : {}), reason: "interrupted", detail: `Ducter on ${name} restarted while the update ran`, rolledBack: false, ...(s.by ? { by: s.by } : {}) });
    }
  }

  /** D156 (4): in quiet hours, nothing working, only to versions Ducter verified; one at a time. */
  async function nightly() {
    const s = d.settings?.();
    if (!s?.autoUpdate || !inQuiet(now(), s.quiet ?? null)) return;
    if ([...states.keys()].some((k) => running(...(k.split("|") as [string, string])))) return;
    const devices = (await d.devices?.()) ?? [];
    await d.latest.refresh(devices.flatMap((x) => x.harnesses));
    for (const dv of devices) {
      if (!dv.awake) continue;
      for (const h of view(dv.id, dv.harnesses)) {
        if (!isHarnessId(h.harness) || !h.installed || !h.version || !h.loggedIn) continue;
        if (d.busy(dv.id, h.harness) > 0) continue;
        const to = nightTarget(h.harness, h.how, h.version, h.latest);
        if (!to) continue;
        const r = await start(dv.id, h.harness, { by: "night", to });
        if (r.ok) return; // one agent per look; the next look takes the next
      }
    }
  }

  const every = d.autoEveryMs ?? 10 * 60_000;
  const timer = every > 0 ? setInterval(() => void nightly().catch(() => {}), every) : undefined;
  (timer as any)?.unref?.();

  return {
    view,
    start,
    fromWorker,
    reconnected,
    updating: (device) =>
      [...states]
        .filter(([k, s]) => k.startsWith(`${device}|`) && (s.phase === "updating" || s.phase === "checking"))
        .map(([k]) => k.split("|")[1]!),
    async check() {
      const devices = (await d.devices?.()) ?? [];
      await d.latest.refresh(devices.flatMap((x) => x.harnesses), true);
    },
    nightly,
    onChange(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    stop() {
      clearInterval(timer);
      offLatest();
    },
  };
}

// ---------- a worker's side ----------

export interface WorkerAgentHost {
  /** Sessions on this agent mid-turn on this worker. */
  turningOn(h: string): number;
}

/**
 * D226: what a worker is updating, kept at <dataDir>/updates/agent-updates.json while its updater
 * runs: the next process reports what a restart cut off, and the Mac app holds a restart asked of
 * it while a live process still updates an agent (internal/update/asks.go reads the same file).
 */
export interface AgentUpdatesFile {
  pid: number;
  items: Record<string, { from: string; to: string; at: string }>;
}

export const agentUpdatesFile = (dataDir: string) => join(dataDir, "updates", "agent-updates.json");

export function readAgentUpdatesFile(dataDir: string): AgentUpdatesFile | undefined {
  try {
    const f = JSON.parse(readFileSync(agentUpdatesFile(dataDir), "utf8")) as AgentUpdatesFile;
    return f && typeof f.pid === "number" && f.items && typeof f.items === "object" ? f : undefined;
  } catch {
    return undefined;
  }
}

function writeAgentUpdatesFile(dataDir: string, f: AgentUpdatesFile) {
  const p = agentUpdatesFile(dataDir);
  try {
    if (!Object.keys(f.items).length) {
      if (existsSync(p)) rmSync(p, { force: true });
      return;
    }
    mkdirSync(join(dataDir, "updates"), { recursive: true });
    writeFileSync(`${p}.tmp`, JSON.stringify(f, null, 2) + "\n");
    renameSync(`${p}.tmp`, p);
  } catch (err) {
    console.warn("[agents] could not keep the agent update:", (err as Error).message);
  }
}

const pidAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
};

/**
 * The worker's `agent_update` op: answers at once (accepted or why not), then runs the same
 * update on this machine and reports each phase up the socket; when it is over, the fresh list
 * of this machine's agents follows (`agents`), so the home sees the new version.
 */
export function createWorkerAgentUpdater(o: {
  sys: Pick<UpdateSys, "run" | "sleep" | "now">;
  detect: (h: HarnessId) => Promise<AgentInstall | undefined>;
  loggedIn: (h: HarnessId) => Promise<boolean>;
  /** This machine's agents as the hello says them, probed again. */
  probe: () => Promise<unknown[]>;
  settleMs?: number;
  /** D226: where the update under way is kept (absent: not kept, as before). */
  dataDir?: string;
  pid?: number;
  alive?: (pid: number) => boolean;
  /** D226: this computer's Ducter is updating itself: its restart would cut the updater off, so it waits. */
  held?: () => boolean;
}) {
  // A send returns false when the socket is down: the frame waits for the next welcome (D226),
  // so an outcome reached during a reconnect isn't lost.
  type Send = (f: object) => boolean | void;
  let raw: Send = () => false;
  const unsent: object[] = [];
  const out = (f: object) => {
    if (raw(f) === false) unsent.push(f);
  };
  const busy = new Set<string>();
  /** Past the safe point: the updater itself runs (a restart now would cut it off). */
  const installing = new Set<string>();
  const pid = o.pid ?? process.pid;
  const kept: AgentUpdatesFile = { pid, items: {} };
  const keep = (h: string, v?: { from: string; to: string }) => {
    if (!o.dataDir) return;
    if (v) kept.items[h] = { ...v, at: new Date(o.sys.now()).toISOString() };
    else delete kept.items[h];
    writeAgentUpdatesFile(o.dataDir, kept);
  };
  return {
    attach(send: Send) {
      raw = send;
      for (const f of unsent.splice(0)) out(f);
    },
    /** D226: agents this process is updating now, waiting or installing (the hello says them). */
    updating: () => [...busy],
    /** D226: agents whose updater runs now: this worker's own Ducter restart waits for them. */
    installing: () => [...installing],
    /**
     * D226: what a previous process left under way (its Ducter restarted under the updater): on
     * its target, done; else interrupted. Said once, on the next welcome.
     */
    async leftovers(): Promise<void> {
      if (!o.dataDir) return;
      const f = readAgentUpdatesFile(o.dataDir);
      if (!f || f.pid === pid || (o.alive ?? pidAlive)(f.pid)) return;
      for (const [h, it] of Object.entries(f.items)) {
        if (!isHarnessId(h)) continue;
        const a = await o.detect(h).catch(() => undefined);
        if (a?.version && cmp(a.version, it.to) >= 0) unsent.push({ t: "agent_update", harness: h, from: it.from, phase: "done", to: a.version });
        else unsent.push({ t: "agent_update", harness: h, from: it.from, phase: "failed", to: it.to, reason: "interrupted", detail: "Ducter on this computer restarted while the update ran", rolledBack: false });
      }
      writeAgentUpdatesFile(o.dataDir, kept);
    },
    async handle(req: { id?: number; args?: any }, send: Send, host: WorkerAgentHost): Promise<void> {
      raw = send;
      const h = String(req.args?.harness ?? "");
      const to = String(req.args?.to ?? "");
      const latest = typeof req.args?.latest === "string" ? req.args.latest : undefined;
      const answer = (ok: boolean, reason?: AgentReason, detail?: string): void => void send({ t: "res", id: req.id, ok: true, result: { ok, ...(reason ? { reason } : {}), ...(detail ? { detail } : {}) } });
      if (!isHarnessId(h) || !versionIn(to)) return answer(false, "failed", "no agent or version");
      if (busy.has(h)) return answer(false, "running");
      const a = await o.detect(h);
      if (!a?.version) return answer(false, "failed", "not installed here");
      if (!updatable(a.how)) return answer(false, "how", a.how);
      if (cmp(a.version, to) >= 0) {
        // The home's view of this copy is stale: say so (not a failure), and send what is here.
        answer(false, "no_update", `already on ${a.version}`);
        out({ t: "agents", harnesses: await o.probe().catch(() => []) });
        return;
      }
      busy.add(h);
      keep(h, { from: a.version, to });
      answer(true);
      const frame = (f: Omit<WorkerAgentFrame, "t" | "harness" | "from">) => out({ t: "agent_update", harness: h, from: a.version!, ...f });
      const settle = async (): Promise<AgentFail | undefined> => {
        const end = o.sys.now() + (o.settleMs ?? AGENT_SETTLE_MS);
        while (host.turningOn(h) > 0 || o.held?.()) {
          if (o.sys.now() > end) return { ok: false, reason: "busy" };
          await o.sys.sleep(2000);
        }
      };
      const r = await updateAgent(o.sys, {
        harness: h,
        to,
        ...(latest ? { latest } : {}),
        detect: () => o.detect(h),
        loggedIn: () => o.loggedIn(h),
        settle,
        onPhase: (phase) => {
          if (phase === "updating" || phase === "checking") installing.add(h);
          frame({ phase, to });
        },
      }).catch((err): AgentOutcome => ({ ok: false, reason: "failed", detail: (err as Error).message }));
      busy.delete(h);
      installing.delete(h);
      keep(h);
      if (r.ok) frame({ phase: "done", to: r.to });
      else frame({ phase: "failed", to, reason: r.reason, ...(r.detail ? { detail: r.detail } : {}), ...(r.rolledBack !== undefined ? { rolledBack: r.rolledBack } : {}) });
      out({ t: "agents", harnesses: await o.probe().catch(() => []) });
    },
  };
}
