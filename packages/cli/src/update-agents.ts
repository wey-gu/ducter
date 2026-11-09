// `ducter update --agents` (D153): the AI agents' own versions on this machine (or --all
// devices), and an update of the ones behind with each one's own updater.
//
//   ducter update --agents --check [--json]   where each agent stands (agents read --json)
//   ducter update --agents [--yes]            update the ones behind, each at its safe point
//   ducter update --agents --all              every connected computer too
//
// With a Ducter running here, the work goes through it (safe point, Log, the cards follow);
// without one, this process detects, reads the channels and runs the updaters itself.
import type { AgentReason, DeviceHarness, ServerFrame } from "@ducter/protocol";
import { harnessName, type HarnessId } from "@ducter/protocol/src/harnesses.ts";
import { versionStanding } from "@ducter/protocol/src/harness-facts.ts";
import { createAgentLatest, inVerified, updatable, updateAgent } from "@ducter/core/src/agents.ts";
import { compareVersions, detectAgent, probeHarnesses } from "@ducter/core/src/harness-probe.ts";
import { realSys, type UpdateSys } from "@ducter/core/src/update.ts";
import type { Conn } from "./client.ts";
import type { UpdateCtx } from "./update.ts";
import type { T } from "./i18n.ts";
import type { Style } from "./doctor.ts";

interface AgentRow {
  device: string;
  deviceName: string;
  home: boolean;
  online: boolean;
  agent: DeviceHarness;
}

const rowsOf = (devices: { id: string; name: string; home: boolean; state: string; harnesses: DeviceHarness[] }[]): AgentRow[] =>
  devices.flatMap((d) => d.harnesses.filter((h) => h.installed).map((h) => ({ device: d.id, deviceName: d.name, home: d.home, online: d.state === "awake", agent: h })));

/** What this copy's line says after its version. */
function stateOf(h: DeviceHarness, t: T, style: Style): string {
  const u = h.update;
  if (u && (u.phase === "waiting" || u.phase === "updating" || u.phase === "checking")) return t(`agents.phase.${u.phase}` as any, { v: u.to ?? "" });
  if (!h.version) return style.dim(t("agents.row.unknown"));
  if (h.how === "app") return style.dim(t("agents.how.app", { app: h.harness === "codex" ? "Codex" : "Claude" }));
  if (h.how === "ducter") return style.dim(t("agents.how.ducter"));
  if (h.how === "unknown") return style.dim(t("agents.how.unknown"));
  const unverified = h.standing === "newer" || h.standing === "older" ? "  " + style.dim(t("agents.row.unverified")) : "";
  if (h.available && h.latest) return style.bold(t("agents.row.behind", { v: h.latest })) + (h.latestVerified === false ? "  " + style.dim(t("agents.row.latestUnverified")) : "") + unverified;
  if (h.latest) return style.ok(t("agents.row.current")) + unverified;
  return style.dim(t("agents.row.noLatest")) + unverified;
}

export function formatAgentRows(list: AgentRow[], t: T, style: Style, showDevice: boolean): string {
  if (!list.length) return `  ${t("agents.none")}`;
  const w = Math.max(...list.map((r) => harnessName(r.agent.harness).length)) + 2;
  const dw = showDevice ? Math.max(...list.map((r) => r.deviceName.length)) + 2 : 0;
  return list
    .map((r) => {
      const v = r.agent.version ?? "?";
      const how = r.agent.how ? style.dim(r.agent.how.padEnd(10)) : "".padEnd(10);
      return `  ${showDevice ? r.deviceName.padEnd(dw) : ""}${harnessName(r.agent.harness).padEnd(w)}${v.padEnd(12)}${how}${r.online ? stateOf(r.agent, t, style) : style.dim(t("update.row.away"))}`;
    })
    .join("\n");
}

const jsonOf = (r: AgentRow) => ({
  device: r.device,
  deviceName: r.deviceName,
  harness: r.agent.harness,
  version: r.agent.version ?? null,
  how: r.agent.how ?? null,
  latest: r.agent.latest ?? null,
  available: Boolean(r.agent.available),
  standing: r.agent.standing ?? null,
  latestVerified: r.agent.latestVerified ?? null,
  ...(r.agent.update ? { update: r.agent.update } : {}),
});

const reasonText = (t: T, reason: AgentReason | undefined, detail?: string) => t(`agents.reason.${reason ?? "failed"}` as any) + (detail ? ` (${detail})` : "");

export async function cmdUpdateAgents(c: UpdateCtx, conn: Conn | undefined): Promise<number> {
  const say = c.log ?? ((s: string) => console.log(s));
  return conn ? viaHome(c, conn, say) : direct(c, c.sys ?? realSys, say);
}

async function devicesNow(conn: Conn) {
  conn.send({ t: "devices" });
  const f = (await conn.next((x): x is Extract<ServerFrame, { t: "devices" }> => x.t === "devices", 20_000)) as Extract<ServerFrame, { t: "devices" }> | undefined;
  return f?.devices;
}

async function viaHome(c: UpdateCtx, conn: Conn, say: (s: string) => void): Promise<number> {
  const { t, style, args } = c;
  // Read every channel again first (the home does, once), then list.
  conn.send({ t: "agent_update", device: "local", harness: "", check: true });
  await conn.next((f) => f.t === "agent_update_result", 30_000);
  const devices = await devicesNow(conn);
  if (!devices) return say(t("update.noAnswer")), 1;
  const all = rowsOf(devices);
  const shown = args.all ? all : all.filter((r) => r.home);
  if (args.check) {
    say(args.json ? JSON.stringify({ agents: shown.map(jsonOf) }, null, 2) : formatAgentRows(shown, t, style, Boolean(args.all)));
    return 0;
  }
  const targets = shown.filter((r) => r.online && r.agent.available);
  if (!targets.length) {
    say(args.json ? JSON.stringify({ ok: true, updated: [] }) : `  ${t("agents.nothing")}`);
    return 0;
  }
  if (!(await confirmed(c, targets))) return 2;
  const outcome: { device: string; harness: string; ok: boolean; version?: string; reason?: AgentReason; detail?: string; rolledBack?: boolean }[] = [];
  for (const r of targets) {
    const name = harnessName(r.agent.harness);
    conn.send({ t: "agent_update", device: r.device, harness: r.agent.harness });
    const res = (await conn.next((f): f is Extract<ServerFrame, { t: "agent_update_result" }> => f.t === "agent_update_result" && f.harness === r.agent.harness, 60_000)) as Extract<ServerFrame, { t: "agent_update_result" }> | undefined;
    if (!res?.ok) {
      outcome.push({ device: r.deviceName, harness: r.agent.harness, ok: false, reason: res?.reason ?? "failed", ...(res?.detail ? { detail: res.detail } : {}) });
      continue;
    }
    let last = "";
    const end = Date.now() + 30 * 60_000;
    let final: DeviceHarness | undefined;
    while (Date.now() < end) {
      const f = (await conn.next((x): x is Extract<ServerFrame, { t: "devices" }> => x.t === "devices", Math.max(1, end - Date.now()))) as Extract<ServerFrame, { t: "devices" }> | undefined;
      if (!f) break;
      const h = f.devices.find((d) => d.id === r.device)?.harnesses.find((x) => x.harness === r.agent.harness);
      const p = h?.update?.phase;
      if (p && p !== last && !args.json) say(`  ${name}: ${t(`agents.phase.${p}` as any, { v: h?.update?.to ?? "" })}`);
      last = p ?? last;
      if (p === "done" || p === "failed") {
        final = h;
        break;
      }
    }
    const u = final?.update;
    outcome.push(
      u?.phase === "done"
        ? { device: r.deviceName, harness: r.agent.harness, ok: true, version: u.to ?? final?.version }
        : { device: r.deviceName, harness: r.agent.harness, ok: false, reason: u?.reason ?? "failed", ...(u?.detail ? { detail: u.detail } : {}), ...(u?.rolledBack !== undefined ? { rolledBack: u.rolledBack } : {}) },
    );
  }
  return report(c, outcome, say);
}

async function confirmed(c: UpdateCtx, targets: AgentRow[]): Promise<boolean> {
  const { t, args } = c;
  if (args.yes) return true;
  if (!process.stdin.isTTY || args.json) {
    console.error(t("agents.needsYes"));
    return false;
  }
  const names = targets.map((r) => `${harnessName(r.agent.harness)} ${r.agent.latest}`).join(", ");
  const ok = await (c.ask ?? (async (q: string) => /^(y|yes|好|是)$/i.test((prompt(q) ?? "").trim())))(t("agents.confirm", { names }));
  if (!ok) console.log(t("update.cancelled"));
  return ok;
}

function report(c: UpdateCtx, outcome: { device: string; harness: string; ok: boolean; version?: string; reason?: AgentReason; detail?: string; rolledBack?: boolean }[], say: (s: string) => void): number {
  const { t, style, args } = c;
  if (args.json) say(JSON.stringify({ ok: outcome.every((o) => o.ok), updated: outcome }, null, 2));
  else
    for (const o of outcome) {
      const name = harnessName(o.harness);
      say(o.ok ? `  ${style.ok("✓")} ${name} · ${t("agents.done", { v: o.version ?? "" })}` : `  ${name} · ${o.rolledBack ? t("agents.rolledBack") + " " : ""}${reasonText(t, o.reason, o.detail)}`);
    }
  return outcome.every((o) => o.ok) ? 0 : 1;
}

/** No Ducter answers here: detect, read the channels and update in this process. */
async function direct(c: UpdateCtx, sys: UpdateSys, say: (s: string) => void): Promise<number> {
  const { t, style, args } = c;
  const exec = async (argv: string[], ms?: number) => sys.run(argv, { timeoutMs: ms ?? 15_000 });
  const probe = { exec, which: (x: string) => Bun.which(x), env: process.env, dataDir: c.dataDir };
  const found = (await probeHarnesses(probe)).filter((h) => h.installed && h.version);
  const latest = createAgentLatest({ dataDir: c.dataDir, fetch: sys.fetch, env: process.env });
  await latest.refresh(found, true);
  const rows: AgentRow[] = found.map((h) => {
    const id = h.harness as HarnessId;
    const l = latest.get(id, h.how);
    return {
      device: "local",
      deviceName: "",
      home: true,
      online: true,
      agent: {
        ...h,
        standing: versionStanding(id, h.version),
        ...(l ? { latest: l, available: updatable(h.how) && (compareVersions(l, h.version!) ?? 0) > 0, latestVerified: inVerified(id, l) } : {}),
      },
    };
  });
  if (args.check) {
    say(args.json ? JSON.stringify({ agents: rows.map(jsonOf) }, null, 2) : formatAgentRows(rows, t, style, false));
    return 0;
  }
  const targets = rows.filter((r) => r.agent.available);
  if (!targets.length) return say(args.json ? JSON.stringify({ ok: true, updated: [] }) : `  ${t("agents.nothing")}`), 0;
  if (!(await confirmed(c, targets))) return 2;
  const outcome = [];
  for (const r of targets) {
    const h = r.agent.harness as HarnessId;
    const out = await updateAgent(sys, {
      harness: h,
      to: r.agent.latest!,
      latest: r.agent.latest!,
      detect: () => detectAgent(h, probe),
      loggedIn: async () => (await probeHarnesses({ ...probe, only: [h] }))[0]?.loggedIn ?? false,
      onPhase: (p, v) => !args.json && say(`  ${harnessName(h)}: ${t(`agents.phase.${p}` as any, { v: v ?? "" })}`),
    });
    outcome.push(out.ok ? { device: "", harness: h, ok: true, version: out.to } : { device: "", harness: h, ok: false, reason: out.reason, ...(out.detail ? { detail: out.detail } : {}), ...(out.rolledBack !== undefined ? { rolledBack: out.rolledBack } : {}) });
  }
  return report(c, outcome, say);
}

