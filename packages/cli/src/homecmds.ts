// The commands of D146 (the CLI follows the active home): `ducter connect` / `disconnect`, `pair`
// and `devices` against a Ducter elsewhere (over its client socket, as the app does), the
// "→ where" line, and doctor's two rows (what the CLI follows; what this `ducter` is).
import type { DeviceView, Reach, ServerFrame } from "@ducter/protocol";
import QR from "qrcode";
import { connect } from "./client.ts";
import type { Check } from "./doctor.ts";
import { plainStyle, width, type Style } from "./doctor.ts";
import type { T } from "./i18n.ts";
import { clearHome, cliDeviceName, cliInstall, connectCommand, homeJson, isLoopbackBase, pairCli, readHome, writeHome, type ConnectError, type Target } from "./home.ts";
import { workerCommand } from "./remote.ts";
import { notReached } from "./talk.ts";

type Print = (s: string) => void;
const say = (p?: Print): Print => p ?? ((s) => console.log(s));

/** The first line of every home command in human mode: where it goes. */
export function targetLine(t: T, target: Target, style: Style = plainStyle): string {
  return style.dim(`→ ${target.kind === "local" ? t("home.here") : target.name}`);
}

const CONNECT_ERR: Record<ConnectError, "connect.err.code" | "connect.err.locked" | "connect.err.unreachable" | "connect.err.notducter" | "connect.err.nocode" | "connect.err.address"> = {
  code: "connect.err.code",
  locked: "connect.err.locked",
  unreachable: "connect.err.unreachable",
  notducter: "connect.err.notducter",
  nocode: "connect.err.nocode",
  address: "connect.err.address",
};

/** `ducter connect <address> --code <code>` (or the whole pair link). */
export async function cmdConnect(o: { t: T; style: Style; dataDir: string; json: boolean; rest: string[]; code?: string; fetcher?: typeof fetch; print?: Print; name?: string }): Promise<number> {
  const { t, style } = o;
  const p = say(o.print);
  const address = o.rest.join(" ").trim();
  if (!address) return p(t("connect.usage")), 2;
  const r = await pairCli({ address, ...(o.code ? { code: o.code } : {}), ...(o.name ? { name: o.name } : {}), ...(o.fetcher ? { fetcher: o.fetcher } : {}) });
  if (!r.ok) {
    if (o.json) return p(JSON.stringify({ ok: false, error: r.error, ...(r.base ? { address: r.base } : {}) })), 1;
    return p(t(CONNECT_ERR[r.error], { address: r.base ?? address, name: r.base ? new URL(r.base).host : address, command: connectCommand(r.base ?? address) })), r.error === "nocode" || r.error === "address" ? 2 : 1;
  }
  writeHome(o.dataDir, r.home);
  if (o.json) return p(JSON.stringify({ ok: true, home: { kind: "remote", address: r.home.address, name: r.home.name }, ...(r.home.deviceId ? { deviceId: r.home.deviceId } : {}) })), 0;
  const device = o.name ?? cliDeviceName();
  p(`  ${style.ok("✓")} ${t(r.home.token ? "connect.done" : "connect.doneTunnel", { name: r.home.name, device })}`);
  p(style.dim(`  ${t("connect.after")}`));
  return 0;
}

/** `ducter disconnect`: the CLI goes back to this machine's Ducter. */
export function cmdDisconnect(o: { t: T; style: Style; dataDir: string; json: boolean; print?: Print }): number {
  const p = say(o.print);
  const was = readHome(o.dataDir);
  clearHome(o.dataDir);
  if (o.json) return p(JSON.stringify({ ok: true, was: was ? { address: was.address, name: was.name } : null, home: { kind: "local" } })), 0;
  if (!was) return p(o.t("disconnect.none")), 0;
  p(`  ${o.style.ok("✓")} ${o.t("disconnect.done", { name: was.name })}`);
  if (was.token) p(o.style.dim(`  ${o.t(was.by === "app" ? "disconnect.app" : "disconnect.device", { name: was.name, device: cliDeviceName() })}`));
  return 0;
}

type Remote = Extract<Target, { kind: "remote" }>;

/** `ducter pair` on a Ducter elsewhere: a fresh one-time code from it (the pair_code frame). */
export async function cmdPairAt(o: { t: T; style: Style; target: Remote; json: boolean; print?: Print }): Promise<number> {
  const { t, style } = o;
  const p = say(o.print);
  const k = await connect(o.target);
  if (!k) return p(await notReached(t, o.target)), 1;
  try {
    k.send({ t: "pair_code" });
    const f = await k.next((x): x is Extract<ServerFrame, { t: "pair_code" }> => x.t === "pair_code" || x.t === "error", 10_000);
    if (!f || f.t !== "pair_code") return p(t("home.noGreeting", { name: o.target.name, address: o.target.address })), 1;
    const address = f.address ?? o.target.address;
    const link = f.link ?? `${address}/pair#c=${f.code}`;
    if (o.json) return p(JSON.stringify({ code: f.code, expiresAt: f.expiresAt, address, link, command: workerCommand(address, f.code), connect: `ducter connect ${address} --code ${f.code}`, home: homeJson(o.target) })), 0;
    const min = Math.max(1, Math.round((Date.parse(f.expiresAt) - Date.now()) / 60_000));
    const lw = Math.max(width(t("pair.address")), width(t("pair.code"))) + 2;
    const row = (key: string, v: string) => `    ${key}${" ".repeat(lw - width(key))}${style.bold(v)}`;
    p(["", `  ${style.ok("●")} ${style.bold(t("pair.title"))}   ${style.bold(f.code)}   ${style.dim(t("pair.once", { min }))}`, "", `  ${t("pair.howApp")}`, row(t("pair.address"), address), row(t("pair.code"), f.code), "", `  ${t("pair.orLink")}`, `    ${link}`, ""].join("\n"));
    const qr = await QR.toString(link, { type: "terminal", small: true, errorCorrectionLevel: "L" });
    p(qr.split("\n").map((l) => "  " + l).join("\n"));
    p([`  ${t("pair.worker.how")}`, `    ${style.bold(workerCommand(address, f.code))}`, "", `  ${t("pair.cli.how")}`, `    ${style.bold(`ducter connect ${address} --code ${f.code}`)}`, ""].join("\n"));
    return 0;
  } finally {
    k.close();
  }
}

/** The devices a Ducter elsewhere knows: the apps and command lines paired with it, then the computers. */
export function formatRemoteDevices(devices: DeviceView[], reach: Reach, t: T, style: Style = plainStyle): string {
  const rows: [string, string][] = [
    ...reach.clients.map((c): [string, string] => [c.name, `${t("devices.kind.app")}${c.platform ? " · " + c.platform : ""} · ${c.connected ? t("devices.awake") : t("devices.seenAt", { when: c.lastSeen ?? "—" })} · ${c.id}`]),
    ...devices.filter((d) => !d.home).map((d): [string, string] => [d.name, `${t("devices.kind.computer")} · ${t(d.state === "awake" ? "devices.awake" : d.state === "asleep" ? "devices.asleep" : "devices.unreachable")} · ${d.id}`]),
  ];
  if (!rows.length) return t("devices.none");
  const w = Math.max(...rows.map(([n]) => width(n))) + 2;
  return [style.bold(t("devices.header")), "", ...rows.map(([n, rest]) => `  ${style.ok("●")} ${n}${" ".repeat(w - width(n))}${style.dim(rest)}`)].join("\n");
}

/** `ducter devices [rename …]` on a Ducter elsewhere. Disconnecting one is done where it lives. */
export async function cmdDevicesAt(o: { t: T; style: Style; target: Remote; json: boolean; rest: string[]; print?: Print }): Promise<number> {
  const { t } = o;
  const p = say(o.print);
  const [verb, what] = o.rest;
  if (verb === "disconnect" || verb === "revoke" || verb === "rm") return p(t("devices.disconnectThere", { name: o.target.name })), 2;
  if (verb && verb !== "list" && verb !== "rename") return p(t("devices.revokeUsage")), 2;
  const name = o.rest.slice(2).join(" ").trim();
  if (verb === "rename" && (!what || !name)) return p(t("devices.renameUsage")), 2;
  const k = await connect(o.target);
  if (!k) return p(await notReached(t, o.target)), 1;
  try {
    if (verb === "rename") {
      k.send({ t: "rename_device", device: what!, name });
      const r = await k.next((x): x is Extract<ServerFrame, { t: "rename_result" }> => x.t === "rename_result", 10_000);
      if (!r) return p(t("home.noGreeting", { name: o.target.name, address: o.target.address })), 1;
      if (!r.ok) return p(t(r.reason === "name_taken" || r.reason === "home" ? "devices.renameTaken" : r.reason === "empty" ? "devices.renameUsage" : "devices.revokeNone", { what: what!, name })), 1;
      return p(t("devices.renamed", { device: r.name ?? name })), 0;
    }
    k.send({ t: "devices" });
    const f = await k.next((x): x is Extract<ServerFrame, { t: "devices" }> => x.t === "devices", 15_000);
    if (!f) return p(t("home.noGreeting", { name: o.target.name, address: o.target.address })), 1;
    if (o.json) return p(JSON.stringify({ home: homeJson(o.target), clients: f.reach.clients, devices: f.devices.filter((d) => !d.home) }, null, 2)), 0;
    p(formatRemoteDevices(f.devices, f.reach, t, o.style));
    return 0;
  } finally {
    k.close();
  }
}

/**
 * doctor's two rows (D146): which Ducter the command line follows, and what this `ducter` is
 * (the app's own, which updates with it; or a copy that doesn't).
 */
export function cliChecks(t: T, o: { dataDir: string; realExecPath: string; compiled: boolean; platform: string; appInstalled: boolean; appCli?: string }): Check[] {
  const home = readHome(o.dataDir);
  const follows: Check = !home
    ? { id: "home", label: t("check.home"), status: "ok", required: false, detail: t("check.home.here") }
    : !home.token && !isLoopbackBase(home.address)
      ? { id: "home", label: t("check.home"), status: "warn", required: false, detail: t("check.home.noToken", { name: home.name }), fix: connectCommand(home.address) }
      : { id: "home", label: t("check.home"), status: "ok", required: false, detail: t(home.by === "app" ? "check.home.app" : "check.home.cli", { name: home.name }) };
  const kind = cliInstall({ realExecPath: o.realExecPath, compiled: o.compiled });
  const fix = o.appCli ? `ln -sf "${o.appCli}" ~/.local/bin/ducter` : undefined;
  const cli: Check =
    kind === "app"
      ? { id: "cli", label: t("check.cli"), status: "ok", required: false, detail: t("check.cli.app") }
      : o.platform === "darwin" && o.appInstalled
        ? { id: "cli", label: t("check.cli"), status: "warn", required: false, detail: t(kind === "source" ? "check.cli.sourceApp" : "check.cli.copyApp", { path: o.realExecPath }), ...(fix && kind === "standalone" ? { fix } : {}) }
        : { id: "cli", label: t("check.cli"), status: "ok", required: false, detail: t(kind === "source" ? "check.cli.source" : "check.cli.standalone") };
  return [follows, cli];
}
