// `ducter anywhere` (D228): the terminal's way to 从外面连 / From outside, the same as the home's
// device card. It talks to the running Ducter over its WebSocket, which runs the tunnel.
//   on                              the guided setup: a task whose agent sets up the person's own
//                                   Cloudflare tunnel to their own domain; this follows its steps
//                                   (the sign-in link and a QR here too). A tunnel made before
//                                   just starts again.
//   on --token <t> --hostname <h>   a tunnel the person made in Cloudflare's dashboard
//   off | status
//   step login | create | run       one step, for the setup task's agent (always JSON)
import QR from "qrcode";
import type { Anywhere, AnywhereSetup, AnywhereStepId, ServerFrame } from "@ducter/protocol";
import { connect, type Conn } from "./client.ts";
import type { Style } from "./doctor.ts";
import type { MsgKey, T } from "./i18n.ts";
import type { Target } from "./home.ts";
import { notReached } from "./talk.ts";

interface Opts {
  t: T;
  style: Style;
  target: Target;
  json: boolean;
  rest: string[];
  token?: string;
  hostname?: string;
  /** After it is on, in a terminal: a pair code for the phone. */
  pair?: () => Promise<unknown>;
  conn?: Conn;
  waitMs?: number;
  print?: (s: string) => void;
  /** The terminal QR for the sign-in link (a seam for tests). */
  qr?: (text: string) => Promise<string>;
}

type Devices = Extract<ServerFrame, { t: "devices" }>;
const isFrame =
  <K extends ServerFrame["t"]>(t: K) =>
  (f: ServerFrame): f is Extract<ServerFrame, { t: K }> =>
    f.t === t;

const ON = new Set(["on", "start", "打开"]);
const OFF = new Set(["off", "stop", "关掉"]);
const STEP_CMDS = new Set(["login", "create", "run"]);

function line(t: T, a: Anywhere | undefined, address: string | undefined): string {
  if (!a) return t("anywhere.status.off");
  if (a.how === "own") return t("anywhere.status.own", { address: address ?? "" });
  if (a.state === "setup") return t("anywhere.status.setup");
  if (a.state === "off") return t("anywhere.status.kept", { host: a.hostname ?? "" });
  if (a.state === "starting") return t("anywhere.starting", { host: a.hostname ?? "" });
  if (a.state === "failed") return t("anywhere.failed", { why: t(`anywhere.why.${a.reason ?? "failed"}` as MsgKey, { host: a.hostname ?? "" }) }).trim();
  return t("anywhere.status.on", { address: address ?? (a.hostname ? `https://${a.hostname}` : "") });
}

const mark = (s: AnywhereSetup["steps"][number]["state"], style: Style) => (s === "done" ? style.ok("✓") : s === "failed" ? "✗" : s === "doing" || s === "waiting" ? "…" : "·");

export async function cmdAnywhere(o: Opts): Promise<number> {
  const { t, style } = o;
  const p = o.print ?? ((s: string) => console.log(s));
  const verb = (o.rest[0] ?? "status").toLowerCase();
  if (!ON.has(verb) && !OFF.has(verb) && verb !== "status" && verb !== "step") return p(t("anywhere.usage")), 2;
  if ((o.token && !o.hostname) || (o.token === undefined && o.hostname && verb !== "step")) return p(t("anywhere.named.both")), 2;
  if (verb === "step" && !STEP_CMDS.has(o.rest[1] ?? "")) return p(t("anywhere.usage")), 2;
  const c = o.conn ?? (await connect(o.target));
  if (!c) return p(await notReached(t, o.target)), 1;
  const devices = async () => {
    c.send({ t: "devices" });
    return c.next(isFrame("devices"), 15_000);
  };
  const out = (f: Devices | undefined) => ({ on: !!f?.reach.anywhere && !["setup", "off"].includes(f.reach.anywhere.state), ...(f?.reach.address ? { address: f.reach.address } : {}), ...(f?.reach.anywhere ? { anywhere: f.reach.anywhere } : {}) });
  try {
    if (verb === "step") {
      const step = o.rest[1] as "login" | "create" | "run";
      c.send({ t: "anywhere_setup", op: "step", step, ...(o.hostname ? { hostname: o.hostname } : {}) });
      const r = await c.next(isFrame("anywhere_setup_result"), 10 * 60_000);
      const res = r?.step ?? { step, state: "failed" as const, reason: r?.reason ?? "failed", next: r ? "This home can't run the setup (not the home)." : "No answer from the home. Try again." };
      p(JSON.stringify(res));
      return res.state === "failed" ? 1 : 0;
    }
    if (verb === "status") {
      const f = await devices();
      if (!f) return 1;
      if (o.json) return p(JSON.stringify(out(f))), 0;
      p(line(t, f.reach.anywhere, f.reach.address));
      const s = f.reach.anywhere?.setup;
      if (s) for (const x of s.steps) p(`  ${mark(x.state, style)} ${t(`anywhere.step.${x.id}` as MsgKey, { host: s.hostname ?? "" })}`);
      return 0;
    }
    if (OFF.has(verb)) {
      c.send({ t: "ability", device: "local", ability: "remote", on: false });
      const r = await c.next(isFrame("ability_result"), 30_000);
      if (!r?.ok) {
        if (o.json) return p(JSON.stringify({ ok: false, reason: r?.reason ?? "no_answer" })), 1;
        return p(t(r?.reason === "own_address" ? "anywhere.off.own" : "anywhere.off.failed")), 1;
      }
      if (o.json) return p(JSON.stringify({ ok: true, on: false })), 0;
      return p(`  ${style.ok("✓")} ${t("anywhere.off.done")}`), 0;
    }
    // on: a dashboard tunnel, or the tunnel made before, else the guided setup.
    c.send({ t: "ability", device: "local", ability: "remote", on: true, ...(o.token && o.hostname ? { named: { token: o.token, hostname: o.hostname } } : {}) });
    const r = await c.next(isFrame("ability_result"), 30_000);
    let setup = false;
    if (!r?.ok) {
      if (r?.reason === "no_address" && !o.token) {
        c.send({ t: "anywhere_setup", op: "begin" });
        const b = await c.next(isFrame("anywhere_setup_result"), 30_000);
        if (!b?.ok && b?.reason !== "running") {
          if (o.json) return p(JSON.stringify({ ok: false, reason: b?.reason ?? "no_answer" })), 1;
          return p(t(b?.reason === "no_agent" ? "anywhere.setup.noAgent" : b?.reason === "own_address" ? "anywhere.off.own" : "anywhere.setup.failed")), 1;
        }
        if (o.json) return p(JSON.stringify({ ok: true, setup: true, ...(b?.taskId ? { taskId: b.taskId } : {}) })), 0;
        p(t("anywhere.setup.started"));
        p(style.dim(`  ${t("anywhere.need")}`));
        setup = true;
      } else {
        if (o.json) return p(JSON.stringify({ ok: false, reason: r?.reason ?? "no_answer", ...(r?.detail ? { detail: r.detail } : {}) })), 1;
        return p(t("anywhere.failed", { why: t(r?.detail === "token" || r?.detail === "hostname" ? "anywhere.why.named" : r?.reason === "own_address" ? "anywhere.why.own" : "anywhere.why.failed", { host: o.hostname ?? "" }) }).trim()), 1;
      }
    }
    const until = Date.now() + (o.waitMs ?? (setup ? 45 * 60_000 : 4 * 60_000));
    let said = "";
    const shown = new Map<AnywhereStepId, string>();
    let link = "";
    for (;;) {
      const f = await devices();
      const a = f?.reach.anywhere;
      const s = a?.setup;
      if (s && !o.json) {
        for (const x of s.steps) {
          if (x.state === "todo" || shown.get(x.id) === x.state) continue;
          shown.set(x.id, x.state);
          if (x.state === "doing" || x.state === "waiting" || x.state === "done" || x.state === "failed") p(`  ${mark(x.state, style)} ${t(`anywhere.step.${x.id}` as MsgKey, { host: s.hostname ?? "" })}${x.state === "failed" && x.reason ? ` · ${t(`anywhere.why.${x.reason}` as MsgKey, { host: s.hostname ?? "" })}` : ""}`);
          if (x.id === "name" && x.state === "waiting") p(style.dim(`    ${t("anywhere.go.cli", { host: s.hostname ?? "" })}`));
        }
        if (s.login && s.login.url !== link) {
          link = s.login.url;
          p(`    ${t(s.login.opened ? "anywhere.login.opened" : "anywhere.login.open")}`);
          p(`    ${link}`);
          if (!s.login.opened) {
            const q = await (o.qr ?? ((x) => QR.toString(x, { type: "terminal", small: true, errorCorrectionLevel: "L" })))(link).catch(() => "");
            if (q) p(q.split("\n").map((l) => "    " + l).join("\n"));
          }
        }
      }
      if (a?.state === "on") {
        if (o.json) return p(JSON.stringify({ ok: true, ...out(f) })), 0;
        p(`  ${style.ok("✓")} ${line(t, a, f!.reach.address)}`);
        p(style.dim(`  ${t("anywhere.who")}`));
        p(style.dim(`  ${t("anywhere.edge")}`));
        if (o.pair) await o.pair();
        return 0;
      }
      if (a?.state === "failed" && !setup) {
        if (o.json) return p(JSON.stringify({ ok: false, reason: a.reason, ...(a.detail ? { detail: a.detail } : {}) })), 1;
        return p(line(t, a, undefined)), 1;
      }
      if (!setup) {
        const now = line(t, a, undefined);
        if (!o.json && now !== said) p(style.dim(`  ${now}`));
        said = now;
      }
      if (setup && !a) return p(t("anywhere.setup.stopped")), 1;
      if (Date.now() > until) return p(t(setup ? "anywhere.setup.slow" : "anywhere.slow")), 1;
      await Bun.sleep(1500);
    }
  } finally {
    if (!o.conn) c.close();
  }
}
