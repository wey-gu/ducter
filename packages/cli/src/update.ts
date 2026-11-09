// `ducter update` (D148): update Ducter in place, here or everywhere.
//
//   ducter update                this machine (asks first; --yes doesn't)
//   ducter update --all          the computers that do tasks for it first, then Ducter's home
//   ducter update --check        only say where each stands (--json for agents)
//   ducter update --to 0.0.3     that version, even an older one
//   ducter update --agents       the AI agents' own versions instead (D156, update-agents.ts)
//   ducter update --finish <p>   internal: the restart helper (update.ts finish), run by systemd-run
//
// With a Ducter running here, the work goes through it (it waits for a safe point and logs every
// step); without one (a worker machine, or Ducter stopped), this process does the staged update.
import { existsSync } from "node:fs";
import pkg from "../package.json" with { type: "json" };
import { arch as osArch, hostname as osHostname, platform as osPlatform } from "node:os";
import { join } from "node:path";
import type { DeviceUpdate, DeviceView, ServerFrame, UpdateReason } from "@ducter/protocol";
import { compareVersions } from "@ducter/protocol/src/version.ts";
import { fetchLatest, type Release } from "@ducter/core/src/release.ts";
import { finish, readPlan, readResult, realSys, runUpdate, updateHow, writeResult, type Fail, type UpdateSys } from "@ducter/core/src/update.ts";
import type { WorkerUpdateFrame } from "@ducter/core/src/updates.ts";
import { CRITICAL_WAIT_MS, TURN_GRACE_MS } from "@ducter/core/src/updates.ts";
import type { Args } from "./args.ts";
import { connect, type Conn } from "./client.ts";
import { isCompiled, type Style } from "./doctor.ts";
import type { T } from "./i18n.ts";
import { cmdUpdateAgents } from "./update-agents.ts";

// ---------- the worker's side ----------

/** The outcome of this computer's last update, once (for its hello); markReported: said now. */
export function lastOutcome(dataDir: string, o: { markReported?: boolean } = {}): WorkerUpdateFrame | undefined {
  const r = readResult(dataDir);
  if (!r || r.reported) return undefined;
  if (o.markReported) writeResult(dataDir, { ...r, reported: true });
  return { t: "update", phase: r.ok ? "done" : "failed", from: r.from, to: r.to, ...(r.reason ? { reason: r.reason } : {}), ...(r.detail ? { detail: r.detail } : {}), ...(r.rolledBack !== undefined ? { rolledBack: r.rolledBack } : {}) };
}

export interface WorkerUpdater {
  /** The main's `update` op. Answers at once (accepted or why not); progress follows as frames. */
  handle(req: { id?: number; args?: any }, send: (f: object) => void, host: { critical(): number; turning(): number }): Promise<void>;
  /** A new socket to the main: progress goes there from now on. */
  attach(send: (f: object) => void): void;
}

export function createWorkerUpdater(o: { dataDir: string; version: string; how: string; sys?: UpdateSys; run?: typeof runUpdate; execPath?: string }): WorkerUpdater {
  const sys = o.sys ?? realSys;
  const run = o.run ?? runUpdate;
  let out: (f: object) => void = () => {};
  let busy = false;
  return {
    attach(send) {
      out = send;
    },
    async handle(req, send, host) {
      out = send;
      const to = String(req.args?.to ?? "");
      const answer = (ok: boolean, reason?: UpdateReason, detail?: string) => send({ t: "res", id: req.id, ok: true, result: { ok, ...(reason ? { reason } : {}), ...(detail ? { detail } : {}) } });
      if (o.how !== "self") return answer(false, (o.how === "app" || o.how === "source" ? o.how : "manual") as UpdateReason);
      if (busy) return answer(false, "running");
      busy = true;
      answer(true);
      const frame = (f: Omit<WorkerUpdateFrame, "t" | "from" | "to">) => out({ t: "update", from: o.version, to, ...f });
      const settle = async (): Promise<Fail | undefined> => {
        const end = sys.now() + CRITICAL_WAIT_MS;
        while (host.critical() > 0) {
          if (sys.now() > end) return { ok: false, reason: "busy" };
          await sys.sleep(1000);
        }
        const grace = sys.now() + TURN_GRACE_MS;
        while (host.turning() > 0 && sys.now() < grace) await sys.sleep(1000);
      };
      const r = await run(sys, {
        dataDir: o.dataDir,
        current: o.version,
        to,
        explicit: Boolean(req.args?.explicit),
        arch: osArch(),
        execPath: o.execPath ?? process.execPath,
        role: "worker",
        port: 0,
        env: process.env,
        settle,
        onPhase: (phase, progress) => frame({ phase, ...(progress !== undefined ? { progress } : {}) }),
      }).catch((err): Fail => ({ ok: false, reason: "failed", detail: (err as Error).message }));
      busy = false;
      if (!r.ok) frame({ phase: "failed", reason: r.reason, ...(r.detail ? { detail: r.detail } : {}), rolledBack: false });
      else if (!r.restarting) frame({ phase: "done", detail: "restart Ducter on this computer to run it" });
      // restarting: the helper restarts the service; the new worker says how it went in its hello.
    },
  };
}

// ---------- the command ----------

export interface UpdateCtx {
  t: T;
  style: Style;
  args: Args;
  port: number;
  dataDir: string;
  sys?: UpdateSys;
  /** Tests: connect to a Ducter (default: client.ts). */
  connect?: (port: number) => Promise<Conn | undefined>;
  /** Tests: a yes/no question in a terminal. */
  ask?: (q: string) => Promise<boolean>;
  log?: (s: string) => void;
}

interface Row {
  id: string;
  name: string;
  home: boolean;
  online: boolean;
  update?: DeviceUpdate;
}

const rows = (devices: DeviceView[]): Row[] => devices.map((d) => ({ id: d.id, name: d.name, home: d.home, online: d.state === "awake", ...(d.update ? { update: d.update } : {}) }));

function behind(r: Row): boolean {
  return Boolean(r.online && r.update?.available && r.update.how === "self");
}

/** One line per device: name, version, and what's next. */
export function formatRows(list: Row[], t: T, style: Style): string {
  const w = Math.max(...list.map((r) => r.name.length)) + 2;
  return list
    .map((r) => {
      const u = r.update;
      const v = u?.current ?? "?";
      let state: string;
      if (!r.online) state = style.dim(t("update.row.away"));
      else if (!u) state = style.dim(t("update.row.unknown"));
      else if (u.phase && u.phase !== "done" && u.phase !== "failed") state = t(`update.phase.${u.phase}` as any, { v: u.to ?? "" });
      else if (u.available) state = style.bold(t("update.row.behind", { v: u.latest ?? "" })) + (u.how !== "self" ? "  " + style.dim(t(`update.how.${u.how}` as any)) : "");
      else state = style.ok(t("update.row.current"));
      return `  ${(r.name + (r.home ? " *" : "")).padEnd(w)}${v.padEnd(10)}${state}`;
    })
    .join("\n");
}

const reasonText = (t: T, reason: UpdateReason | undefined, detail?: string) => t(`update.reason.${reason ?? "failed"}` as any) + (detail ? ` (${detail})` : "");

async function waitFor(conn: Conn, id: string, ms: number, done: (u: DeviceUpdate | undefined, d: DeviceView | undefined) => boolean): Promise<DeviceView | undefined> {
  let last: DeviceView | undefined;
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const f = (await conn.next((x): x is Extract<ServerFrame, { t: "devices" }> => x.t === "devices", Math.max(1, end - Date.now()))) as Extract<ServerFrame, { t: "devices" }> | undefined;
    if (!f) break;
    last = f.devices.find((d) => d.id === id);
    if (done(last?.update, last)) return last;
  }
  return last;
}

export async function cmdUpdate(c: UpdateCtx): Promise<number> {
  const { t, style, args } = c;
  const say = c.log ?? ((s: string) => console.log(s));
  const sys = c.sys ?? realSys;

  if (args.finish) {
    const plan = readPlan(args.finish);
    if (!plan) return say(t("update.finish.noPlan", { path: args.finish })), 2;
    const r = await finish(sys, plan);
    say(r.ok ? t("update.done", { v: r.to }) : t("update.rolledBack", { v: r.from, why: reasonText(t, r.reason, r.detail) }));
    return r.ok ? 0 : 1;
  }

  const conn = await (c.connect ?? ((p) => connect(p, { timeoutMs: 2000 })))(c.port);
  if (args.agents) {
    // D156: the AI agents' own versions, not Ducter's.
    try {
      return await cmdUpdateAgents(c, conn);
    } finally {
      conn?.close();
    }
  }
  if (!conn) return direct(c, sys, say);
  try {
    return await viaHome(c, conn, say);
  } finally {
    conn.close();
  }
}

/** A Ducter runs here: it does the work (safe point, Log), this only asks and follows. */
async function viaHome(c: UpdateCtx, conn: Conn, say: (s: string) => void): Promise<number> {
  const { t, style, args } = c;
  conn.send({ t: "device_update", device: "local", check: true });
  await conn.next((f) => f.t === "update_result", 20_000);
  conn.send({ t: "devices" });
  const first = (await conn.next((f): f is Extract<ServerFrame, { t: "devices" }> => f.t === "devices", 20_000)) as Extract<ServerFrame, { t: "devices" }> | undefined;
  if (!first) return say(t("update.noAnswer")), 1;
  const all = rows(first.devices);
  const shown = args.all ? all : all.filter((r) => r.home);
  const home = all.find((r) => r.home)!;
  if (args.check) {
    if (args.json) say(JSON.stringify({ latest: home.update?.latest ?? null, checkedAt: home.update?.checkedAt ?? null, devices: shown.map((r) => ({ id: r.id, name: r.name, home: r.home, online: r.online, ...(r.update ?? {}) })) }, null, 2));
    else say(formatRows(shown, t, style));
    return 0;
  }
  const to = args.to;
  const targets = (args.all ? all.filter((r) => !r.home && (to ? r.online && r.update?.how === "self" : behind(r))) : []).concat(home);
  const homeNeeds = to ? compareVersions(to, home.update?.current ?? "0.0.0") !== 0 : Boolean(home.update?.available);
  if (!homeNeeds) targets.pop();
  if (!targets.length) {
    if (args.json) say(JSON.stringify({ ok: true, updated: [] }));
    else say(home.update?.how === "app" && home.update.available ? t("update.how.app") : t("update.nothing", { v: home.update?.latest ?? home.update?.current ?? "" }));
    return 0;
  }
  if (!targets.every((r) => r.home ? home.update?.how === "self" : true) && !args.all) {
    const how = home.update?.how ?? "source";
    return say(t(`update.how.${how}` as any)), how === "self" ? 0 : 1;
  }
  if (!args.yes) {
    const names = targets.map((r) => r.name).join(", ");
    const v = to ?? home.update?.latest ?? "";
    if (!process.stdin.isTTY || args.json) return console.error(t("update.needsYes")), 2;
    if (!(await (c.ask ?? askYes)(t("update.confirm", { names, v })))) return say(t("update.cancelled")), 1;
  }
  const outcome: { name: string; ok: boolean; version?: string; reason?: UpdateReason; detail?: string }[] = [];
  for (const r of targets) {
    if (r.home && r.update?.how !== "self") {
      outcome.push({ name: r.name, ok: false, reason: r.update?.how ?? "source" });
      continue;
    }
    conn.send({ t: "device_update", device: r.id, ...(to ? { to } : {}) });
    const res = (await conn.next((f): f is Extract<ServerFrame, { t: "update_result" }> => f.t === "update_result" && !(f as any).update, 60_000)) as Extract<ServerFrame, { t: "update_result" }> | undefined;
    if (!res?.ok) {
      outcome.push({ name: r.name, ok: false, reason: res?.reason ?? "failed", ...(res?.detail ? { detail: res.detail } : {}) });
      if (!args.json) say(`  ${r.name}: ${reasonText(t, res?.reason, res?.detail)}`);
      continue;
    }
    if (!args.json) say(`  ${r.name}: ${t("update.phase.downloading", { v: to ?? r.update?.latest ?? "" })}`);
    if (r.home) {
      // The home restarts: its socket goes; it's back when /health names the new version.
      const v = to ?? r.update?.latest ?? "";
      const back = await homeBack(c.port, v, 15 * 60_000, (p) => !args.json && say(`  ${r.name}: ${t(`update.phase.${p}` as any, { v })}`), conn);
      outcome.push(back.ok ? { name: r.name, ok: true, version: v } : { name: r.name, ok: false, reason: back.reason, ...(back.detail ? { detail: back.detail } : {}) });
      continue;
    }
    let lastPhase = "";
    const d = await waitFor(conn, r.id, 15 * 60_000, (u, dv) => {
      if (u?.phase && u.phase !== lastPhase && !args.json) say(`  ${r.name}: ${t(`update.phase.${u.phase}` as any, { v: u.to ?? "" })}`);
      lastPhase = u?.phase ?? lastPhase;
      return u?.phase === "failed" || (u?.phase === "done" && dv?.state === "awake");
    });
    const u = d?.update;
    outcome.push(u?.phase === "done" ? { name: r.name, ok: true, version: d?.version ?? u.to } : { name: r.name, ok: false, reason: u?.reason ?? "failed", ...(u?.detail ? { detail: u.detail } : {}) });
  }
  if (args.json) say(JSON.stringify({ ok: outcome.every((o) => o.ok), updated: outcome }, null, 2));
  else
    for (const o of outcome) say(o.ok ? `  ${style.ok("✓")} ${o.name} · ${t("update.done", { v: o.version ?? "" })}` : `  ${o.name} · ${reasonText(t, o.reason, o.detail)}`);
  return outcome.every((o) => o.ok) ? 0 : 1;
}

/** Follows the home through its restart: phases while the socket lasts, then /health. */
async function homeBack(port: number, v: string, ms: number, phase: (p: string) => void, conn: Conn): Promise<{ ok: true } | Fail> {
  let last = "";
  const off = conn.on((f) => {
    if (f.t !== "devices") return;
    const u = f.devices.find((d) => d.home)?.update;
    if (u?.phase && u.phase !== last) phase((last = u.phase));
  });
  const end = Date.now() + ms;
  let failed: Fail | undefined;
  const offFail = conn.on((f) => {
    if (f.t !== "devices") return;
    const u = f.devices.find((d) => d.home)?.update;
    if (u?.phase === "failed" && u.to === v) failed = { ok: false, reason: u.reason ?? "failed", ...(u.detail ? { detail: u.detail } : {}) };
  });
  try {
    while (Date.now() < end) {
      if (failed) return failed;
      try {
        const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) });
        const j: any = await r.json();
        if (j?.version === v) return { ok: true };
      } catch {}
      await Bun.sleep(1000);
    }
    return { ok: false, reason: "health" };
  } finally {
    off();
    offFail();
  }
}

/** No Ducter answers here: a worker machine, or Ducter stopped. This process does the update. */
async function direct(c: UpdateCtx, sys: UpdateSys, say: (s: string) => void): Promise<number> {
  const { t, style, args } = c;
  const current = pkg.version;
  const how = updateHow({ compiled: isCompiled(), platform: osPlatform(), execPath: process.execPath });
  let rel: Release | undefined;
  try {
    rel = await fetchLatest(sys.fetch);
  } catch {
    if (!args.to) return say(t("update.reason.network")), 1;
  }
  const latest = rel?.version;
  const available = Boolean(latest && compareVersions(latest, current) > 0);
  const name = osHostname().replace(/\.local$/, "");
  const row: Row = { id: "local", name, home: !existsSync(join(c.dataDir, "worker.json")), online: true, update: { current, available, how, ...(latest ? { latest } : {}), ...(available && rel?.notes.length ? { notes: rel.notes } : {}), ...(rel?.security ? { security: true } : {}) } };
  if (args.check) {
    say(args.json ? JSON.stringify({ latest: latest ?? null, devices: [{ ...row, ...row.update }] }, null, 2) : formatRows([row], t, style));
    return 0;
  }
  const to = args.to ?? latest;
  if (!to || (!args.to && !available)) return say(t("update.nothing", { v: latest ?? current })), 0;
  if (how !== "self") return say(t(`update.how.${how}` as any)), 1;
  if (!args.yes) {
    if (!process.stdin.isTTY || args.json) return console.error(t("update.needsYes")), 2;
    if (!(await (c.ask ?? askYes)(t("update.confirm", { names: name, v: to })))) return say(t("update.cancelled")), 1;
  }
  // The service runs this binary: the helper restarts it. Otherwise only the binary is swapped.
  const active = (await sys.run(["systemctl", "--user", "is-active", "ducter.service"], { timeoutMs: 5000 })).out.trim() === "active";
  const isWorker = existsSync(join(c.dataDir, "worker.json"));
  const started = sys.now();
  const r = await runUpdate(sys, {
    dataDir: c.dataDir,
    current,
    to,
    explicit: Boolean(args.to),
    arch: osArch(),
    execPath: process.execPath,
    role: isWorker ? "worker" : "home",
    port: c.port,
    env: active ? { INVOCATION_ID: "ducter-update" } : {},
    onPhase: (p) => !args.json && say(`  ${t(`update.phase.${p}` as any, { v: to })}`),
  });
  if (!r.ok) {
    say(args.json ? JSON.stringify({ ok: false, reason: r.reason, detail: r.detail ?? null }) : reasonText(t, r.reason, r.detail));
    return 1;
  }
  if (!r.restarting) {
    say(args.json ? JSON.stringify({ ok: true, version: to, restart: "yourself" }) : t("update.swapped", { v: to }));
    return 0;
  }
  // Wait for the helper's outcome (it restarts the service and checks it).
  const end = sys.now() + 3 * 60_000;
  while (sys.now() < end) {
    const res = readResult(c.dataDir);
    if (res && res.to === to && Date.parse(res.at) >= started - 1000) {
      say(args.json ? JSON.stringify({ ok: res.ok, version: res.ok ? to : res.from, ...(res.reason ? { reason: res.reason } : {}), ...(res.rolledBack ? { rolledBack: true } : {}) }) : res.ok ? t("update.done", { v: to }) : t("update.rolledBack", { v: res.from, why: reasonText(t, res.reason, res.detail) }));
      return res.ok ? 0 : 1;
    }
    await sys.sleep(1000);
  }
  return say(t("update.noAnswer")), 1;
}

async function askYes(q: string): Promise<boolean> {
  const a = (prompt(q) ?? "").trim().toLowerCase();
  return a === "y" || a === "yes" || a === "好" || a === "是";
}
