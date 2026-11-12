// D161: the character sheet's words, without the page: a device's one status line, the list's
// one word, how it is connected, how an agent was installed, and which chips it gets. The same
// rules as the desktop's devicecard.go.
import type { DeviceHarness, DeviceView, Reach } from "@ducter/protocol";

export type Client = Reach["clients"][number];
type Words = { t(key: string, ...args: unknown[]): string };
export type Tone = "" | "working" | "asleep" | "away";

/** The one status line under a device's name: the role or the state, never the kind. */
export function statusLine(L: Words, dv: DeviceView, o: { persona: string; home: string; running: number; ago?: string }): { text: string; tone: Tone } {
  if (dv.state === "unreachable") return { text: o.ago ? L.t("card.status.unreachable", o.ago) : L.t("card.status.unreachable.none"), tone: "away" };
  if (dv.state === "asleep") return { text: L.t("device.state.asleep"), tone: "asleep" };
  const n = o.running;
  if (dv.home) return { text: n === 1 ? L.t("card.status.home.working.one", o.persona) : n > 1 ? L.t("card.status.home.working", o.persona, n) : L.t("card.status.home", o.persona), tone: "" };
  if (dv.kind === "phone") return { text: L.t("device.client.now"), tone: "" };
  if (n === 1) return { text: L.t("card.status.working.one", o.home), tone: "working" };
  if (n > 1) return { text: L.t("card.status.working", o.home, n), tone: "working" };
  return { text: L.t("card.status.does", o.home), tone: "" };
}

/** The list's one word of state: the status line shortened to its first idea. */
export function listWord(L: Words, dv: DeviceView, o: { home: string; running: number }): { text: string; tone: Tone } {
  const ph = dv.update?.phase;
  if (ph === "downloading" || ph === "verifying" || ph === "waiting" || ph === "restarting") return { text: L.t("list.state.updating"), tone: "" };
  if (dv.state === "asleep") return { text: L.t("list.state.asleep"), tone: "asleep" };
  if (dv.state === "unreachable") return { text: L.t("list.state.away"), tone: "away" };
  if (dv.home) return { text: L.t("list.state.home"), tone: "" };
  if (dv.kind === "phone") return { text: L.t("list.state.now"), tone: "" };
  if (o.running > 0) return { text: L.t("list.state.tasks", o.running), tone: "working" };
  return { text: L.t("list.state.does", o.home), tone: "" };
}

/** The Android app (D178): its platform says "android-app"; one paired before that is named "… · Ducter". */
export const androidApp = (cl: Client) => cl.platform.toLowerCase().includes("app") || cl.name.endsWith("· Ducter");

const cli = (cl: Client) => cl.form === "cli" || (!cl.form && cl.name.startsWith("CLI on "));

/** How a connection reaches Ducter. */
export function connWay(cl: Client): "app" | "cli" | "safari" | "browser" {
  const p = cl.platform.toLowerCase();
  if (cli(cl)) return "cli";
  if (p.includes("ios") || p.includes("iphone")) return p.includes("safari") || p.includes("web") ? "safari" : "app";
  if (p.includes("android")) return androidApp(cl) ? "app" : "browser";
  if (p.startsWith("darwin") || p.includes("mac")) return "app";
  return "browser";
}

/** One quiet line: 通过 app 和命令行连着 / Connected via the app and command line. */
export function viaText(L: Words, list: Client[]): string {
  const ways: string[] = [];
  for (const cl of list) {
    const w = L.t(`card.via.${connWay(cl)}`);
    if (!ways.includes(w)) ways.push(w);
  }
  return ways.length ? L.t("card.via", ways.join(L.t("card.via.and"))) : "";
}

/** How a copy was installed, in words, for the version line. */
export function coinHow(L: Words, h: DeviceHarness): string {
  switch (h.how) {
    case "npm":
    case "brew":
    case "installer":
      return L.t(`coin.how.${h.how}`);
    case "app":
      return L.t("agentv.how.app", h.harness === "claude-code" ? "Claude" : "Codex");
    case "ducter":
      return L.t("agentv.how.ducter");
  }
  return "";
}

/** The version line in a coin's detail: 版本 2.1.322 · 用 npm 装的. */
export function versionLine(L: Words, h: DeviceHarness): string {
  if (!h.version) return "";
  const how = coinHow(L, h);
  return how ? L.t("coin.version", h.version, how) : L.t("agentv.version", h.version);
}

export type ChipLook = "on" | "off" | "add" | "fail" | "later" | "elsewhere";
/** D237: an "elsewhere" chip points at the device that has the ability: the first, and how many more. */
export type ChipAt = { id: string; name: string; more: number };
export type ChipOut = { id: string; look: ChipLook; at?: ChipAt };

/** D237: the abilities the home can have through another computer. */
const LENT = ["computer", "phone"];

/** D237: a device has it: on, being installed, or added and waiting for macOS's two switches. */
function hasIt(d: DeviceView, id: string): boolean {
  const ab = d.abilities.find((a) => a.id === id);
  if (!ab) return false;
  return ab.state === "on" || ab.setup === "installing" || (id === "computer" && ab.state === "unavailable" && ab.reason === "computer_permissions");
}

/** D237: a home with no screen of its own (a server, a Linux home): 用电脑 never comes to it. */
export const headless = (dv: DeviceView) => dv.kind === "server" || (dv.platform ?? "").toLowerCase().startsWith("linux");

/** D237: the other computers that have an ability, awake ones first. */
export function holders(dv: DeviceView, all: DeviceView[], id: string): DeviceView[] {
  const list = all.filter((d) => d.id !== dv.id && !d.home && d.kind !== "phone" && hasIt(d, id));
  return [...list.filter((d) => d.state === "awake"), ...list.filter((d) => d.state !== "awake")];
}

/**
 * The ability chips a device gets, in order: 上网 · 用电脑 · 从外面连 as it has them, then on the
 * home 打电话 (D199: on with a calling connection, + to add one, failed when its sign-in is gone),
 * then the home's abilities it doesn't have itself (D237): one another computer has on (or is
 * installing) points there (用手机 · 在 MacBook Pro M3 上; a tap opens that card); one no computer
 * has is a ghost (以后会有) that only explains, except 用电脑 on a home with no screen, which
 * shows nothing. Another computer shows none of these; a worker Mac has its own 用手机 and 用电脑
 * (D234, D235). The same rules as the desktop's chipSpecs.
 */
export function chipsFor(dv: DeviceView, all: DeviceView[] = []): ChipOut[] {
  const out: ChipOut[] = [];
  const ghosts: ChipOut[] = [];
  for (const id of ["web", "computer", "remote", "call", "phone"]) {
    const ab = dv.abilities.find((a) => a.id === id);
    if (!ab) continue;
    if (ab.state === "later") {
      if (!dv.home) continue;
      const there = LENT.includes(id) ? holders(dv, all, id) : [];
      if (there.length) ghosts.push({ id, look: "elsewhere", at: { id: there[0]!.id, name: there[0]!.name, more: there.length - 1 } });
      else if (!(id === "computer" && headless(dv))) ghosts.push({ id, look: "later" });
      continue;
    }
    if (id === "call") {
      if (dv.home) out.push({ id, look: ab.state !== "on" ? "add" : ab.reason === "signed_out" ? "fail" : "on" });
      continue;
    }
    // D217: 用手机 on a Mac: + adds it (the install sheet), on while installing too.
    if (id === "phone") {
      out.push({ id, look: ab.state === "on" ? "on" : ab.state === "unavailable" ? "fail" : dv.state === "awake" ? "add" : "off" });
      continue;
    }
    let look: ChipLook = "off";
    if (id === "web" && ab.where === "ducter" && ab.state === "unavailable" && ab.reason !== "env_off") look = "fail";
    // D235: 用电脑 added, but macOS hasn't given cua-driver its two switches yet.
    else if (id === "computer" && ab.state === "unavailable" && ab.reason === "computer_permissions") look = "fail";
    else if (ab.state === "on") look = "on";
    else if (ab.state === "off" && dv.state === "awake") look = "add";
    out.push({ id, look });
  }
  return [...out, ...ghosts];
}

/** An agent update under way. */
export const agentRunning = (h: DeviceHarness) => !!h.update && ["waiting", "updating", "checking"].includes(h.update.phase);

/** Newer on its own channel, updatable from here, not mid-way. */
export const agentBehind = (h: DeviceHarness) => !!h.available && !!h.latest && !agentRunning(h) && h.update?.phase !== "failed";
