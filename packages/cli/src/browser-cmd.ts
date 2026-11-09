// `ducter ability add browser` and `ducter browser sites | signout <site> | clear` (D144): the
// terminal's way to the same 上网 / Browse the web the Devices page adds, for a server set up over
// SSH. Both talk to the running Ducter over its WebSocket, like the apps.
import type { DeviceAbility, ServerFrame } from "@ducter/protocol";
import { connect, type Conn } from "./client.ts";
import type { T } from "./i18n.ts";
import type { Target } from "./home.ts";
import { notReached } from "./talk.ts";

interface Opts {
  t: T;
  /** The Ducter the CLI follows (D147): these are home commands. */
  target: Target;
  json: boolean;
  rest: string[];
  /** Test seam. */
  conn?: Conn;
  /** How long `ability add` waits for the install before leaving it in the background. */
  waitMs?: number;
}

const BROWSER_WORDS = new Set(["browser", "web", "上网", "browse"]);

const isFrame =
  <K extends ServerFrame["t"]>(t: K) =>
  (f: ServerFrame): f is Extract<ServerFrame, { t: K }> =>
    f.t === t;

async function open(o: Opts): Promise<Conn | undefined> {
  const c = o.conn ?? (await connect(o.target));
  if (!c) console.log(await notReached(o.t, o.target));
  return c;
}

function webOf(f: Extract<ServerFrame, { t: "devices" }>): { name: string; web?: DeviceAbility } {
  const home = f.devices.find((d) => d.home) ?? f.devices[0];
  return { name: home?.name ?? "this computer", web: home?.abilities.find((a) => a.id === "web") };
}

export async function cmdAbility(o: Opts): Promise<number> {
  const [verb, what] = o.rest;
  if (!(verb === "add" || verb === "remove") || !BROWSER_WORDS.has(String(what))) {
    console.log(o.t("ability.usage"));
    return 2;
  }
  const c = await open(o);
  if (!c) return 1;
  try {
    c.send({ t: "devices" });
    const first = await c.next(isFrame("devices"), 15_000);
    if (!first) return 1;
    const { name } = webOf(first);
    c.send({ t: "ability", device: "local", ability: "web", on: verb === "add" });
    const r = await c.next(isFrame("ability_result"), 30_000);
    if (!r?.ok) {
      if (r?.reason === "browser_deps" && r.detail) {
        console.log(o.t("ability.deps"));
        console.log(`  ${r.detail}`);
        return 1;
      }
      console.log(o.t("ability.failed", { reason: r?.detail ?? r?.reason ?? "no answer" }));
      return 1;
    }
    if (verb === "remove") {
      console.log(o.t("ability.removed", { device: name }));
      return 0;
    }
    // Added: wait for the browser to be ready (or say why not), from fresh devices frames.
    const until = Date.now() + (o.waitMs ?? 10 * 60_000);
    let said = false;
    for (;;) {
      c.send({ t: "devices" });
      const f = await c.next(isFrame("devices"), 15_000);
      const web = f && webOf(f).web;
      if (web?.setup === "installing") {
        if (!said) console.log(o.t("ability.adding", { device: name }));
        said = true;
      } else if (web?.state === "on") {
        if (o.json) console.log(JSON.stringify({ ok: true, device: name, version: web.detail ?? "" }));
        else console.log(o.t("ability.ready", { device: name, version: web.detail ?? "" }));
        return 0;
      } else if (web?.reason === "browser_deps") {
        console.log(o.t("ability.deps"));
        console.log(`  ${web.detail ?? ""}`);
        return 1;
      } else if (web?.state === "unavailable") {
        console.log(o.t("ability.failed", { reason: web.detail ?? web.reason ?? "?" }));
        return 1;
      }
      if (Date.now() > until) {
        console.log(o.t("ability.waiting"));
        return 0;
      }
      await Bun.sleep(1_500);
    }
  } finally {
    if (!o.conn) c.close();
  }
}

const when = (iso: string) => iso.slice(0, 16).replace("T", " ");

export async function cmdBrowser(o: Opts): Promise<number> {
  const [verb, site] = o.rest;
  const frame =
    verb === "sites" || verb === undefined
      ? ({ t: "browser_sites" } as const)
      : verb === "signout" && site
        ? ({ t: "browser_site_signout", site } as const)
        : verb === "clear"
          ? ({ t: "browser_sites_clear" } as const)
          : undefined;
  if (!frame) {
    console.log(o.t("browser.usage"));
    return 2;
  }
  const c = await open(o);
  if (!c) return 1;
  try {
    c.send(frame);
    const r = await c.next(isFrame("browser_sites"), 30_000);
    if (!r) return 1;
    if (o.json) {
      console.log(JSON.stringify(r, null, 2));
      return r.ok === false ? 1 : 0;
    }
    if (r.ok === false) {
      console.log(o.t("ability.failed", { reason: r.message ?? "?" }));
      return 1;
    }
    if (!r.ready) {
      console.log(o.t("browser.notReady"));
      return verb === undefined || verb === "sites" ? 0 : 1;
    }
    if (frame.t === "browser_site_signout") console.log(o.t("browser.signedOut", { site: site! }));
    if (frame.t === "browser_sites_clear") console.log(o.t("browser.cleared"));
    if (frame.t !== "browser_sites") return 0;
    if (!r.sites.length) {
      console.log(o.t("browser.none"));
      return 0;
    }
    console.log(o.t("browser.header"));
    for (const s of r.sites) console.log(`  ${s.cookies ? o.t("browser.row", { site: s.site, when: when(s.signedInAt) }) : o.t("browser.row.gone", { site: s.site })}`);
    return 0;
  } finally {
    if (!o.conn) c.close();
  }
}
