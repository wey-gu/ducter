// `ducter anywhere [on|off|status]` (D228): the terminal's way to 在哪儿都能用 / From anywhere, the
// same switch as the home's device card. It talks to the running Ducter over its WebSocket, which
// runs the tunnel; on, it waits for the address and then shows a pair code for the phone.
import type { Anywhere, ServerFrame } from "@ducter/protocol";
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
  address?: string;
  /** After it is on, in a terminal: a pair code for the phone. */
  pair?: () => Promise<unknown>;
  conn?: Conn;
  waitMs?: number;
  print?: (s: string) => void;
}

type Devices = Extract<ServerFrame, { t: "devices" }>;
const isFrame =
  <K extends ServerFrame["t"]>(t: K) =>
  (f: ServerFrame): f is Extract<ServerFrame, { t: K }> =>
    f.t === t;

const ON = new Set(["on", "start", "打开"]);
const OFF = new Set(["off", "stop", "关掉"]);

function line(t: T, a: Anywhere | undefined, address: string | undefined): string {
  if (!a) return t("anywhere.status.off");
  if (a.how === "own") return t("anywhere.status.own", { address: address ?? "" });
  if (a.state === "starting") return t(a.getting ? "anywhere.getting" : "anywhere.starting");
  if (a.state === "failed") return t("anywhere.failed", { why: t(`anywhere.why.${a.reason ?? "failed"}` as MsgKey), detail: a.detail ?? "" }).trim();
  return t(a.how === "named" ? "anywhere.status.named" : "anywhere.status.tunnel", { address: address ?? "" });
}

export async function cmdAnywhere(o: Opts): Promise<number> {
  const { t, style } = o;
  const p = o.print ?? ((s: string) => console.log(s));
  const verb = (o.rest[0] ?? "status").toLowerCase();
  if (!ON.has(verb) && !OFF.has(verb) && verb !== "status") return p(t("anywhere.usage")), 2;
  if ((o.token && !o.address) || (!o.token && o.address)) return p(t("anywhere.named.both")), 2;
  const c = o.conn ?? (await connect(o.target));
  if (!c) return p(await notReached(t, o.target)), 1;
  const devices = async () => {
    c.send({ t: "devices" });
    return c.next(isFrame("devices"), 15_000);
  };
  const out = (f: Devices | undefined) => ({ on: !!f?.reach.anywhere, ...(f?.reach.address ? { address: f.reach.address } : {}), ...(f?.reach.anywhere ? { anywhere: { ...f.reach.anywhere, follow: undefined } } : {}) });
  try {
    if (verb === "status") {
      const f = await devices();
      if (!f) return 1;
      if (o.json) return p(JSON.stringify(out(f))), 0;
      return p(line(t, f.reach.anywhere, f.reach.address)), 0;
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
    c.send({ t: "ability", device: "local", ability: "remote", on: true, ...(o.token && o.address ? { named: { token: o.token, address: o.address } } : {}) });
    const r = await c.next(isFrame("ability_result"), 30_000);
    if (!r?.ok) {
      if (o.json) return p(JSON.stringify({ ok: false, reason: r?.reason ?? "no_answer", ...(r?.detail ? { detail: r.detail } : {}) })), 1;
      return p(t("anywhere.failed", { why: t(r?.detail === "token" || r?.detail === "address" ? "anywhere.why.named" : "anywhere.why.failed"), detail: r?.detail ?? "" }).trim()), 1;
    }
    const until = Date.now() + (o.waitMs ?? 4 * 60_000);
    let said = "";
    for (;;) {
      const f = await devices();
      const a = f?.reach.anywhere;
      if (a?.state === "on") {
        if (o.json) return p(JSON.stringify({ ok: true, ...out(f) })), 0;
        p(`  ${style.ok("✓")} ${line(t, a, f!.reach.address)}`);
        if (a.moves) p(style.dim(`  ${t("anywhere.moves")}`));
        p(style.dim(`  ${t("anywhere.who")}`));
        if (o.pair) await o.pair();
        return 0;
      }
      if (a?.state === "failed") {
        if (o.json) return p(JSON.stringify({ ok: false, reason: a.reason, ...(a.detail ? { detail: a.detail } : {}) })), 1;
        return p(line(t, a, undefined)), 1;
      }
      const now = line(t, a, undefined);
      if (!o.json && now !== said) p(style.dim(`  ${now}`));
      said = now;
      if (Date.now() > until) return p(t("anywhere.slow")), 1;
      await Bun.sleep(1500);
    }
  } finally {
    if (!o.conn) c.close();
  }
}
