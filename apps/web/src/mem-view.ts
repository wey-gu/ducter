// D257: what Settings › 记忆 / Memory and › 和你的其他 agent 通信 / Talk with your other agents (D332) show, from the
// settings frame (settings.memory, mem, bridge). Pure, so the phone, the wide page and the tests
// read it the same way; the Mac has the same rules (apps/desktop/internal/views/memory.go).
import type { BridgeView, MemView, PeersSettings } from "@ducter/protocol";

/** D225: the first nmem with `bridge connections` (bridge-link.ts BRIDGE_CONNECT_SINCE). */
export const MEM_MIN = "0.10.118";

/**
 * Where the partner's memory stands, from the person's side: off (switched off), missing (no Mem
 * here, and no way Ducter can say more), install / installing (Ducter can put Mem's command line
 * on the home), sign_in / signing_in (it's there, not signed in), closed (D329: the Nowledge Mem app on
 * the home isn't open; what it remembers waits), on (Mem answers).
 */
export type MemPhase = "off" | "missing" | "install" | "installing" | "sign_in" | "signing_in" | "closed" | "on";

export function memPhase(memoryOn: boolean, mem: MemView | undefined, b: BridgeView | undefined): MemPhase {
  if (!memoryOn) return "off";
  switch (b?.state) {
    case "install_mem":
      return "install";
    case "installing":
      return "installing";
    case "sign_in":
      return "sign_in";
    case "signing_in":
      return "signing_in";
    case "mem_closed":
      return "closed";
    case undefined:
      return mem?.state === "connected" ? "on" : "missing";
  }
  // Every other state has a signed-in nmem on the home (an older one still remembers).
  return "on";
}

/**
 * The one thing about Mem's own version worth saying, in order: a step running, one just done, an
 * update Bridge needs (needed), a move to Mem's recommended install, Mem's word that a newer one is
 * out that Ducter can run (newer), or that only the Nowledge Mem app can (app).
 */
export type MemUpdate =
  | { kind: "updating"; move: boolean }
  | { kind: "done"; done: "installed" | "updated" | "moved" }
  | { kind: "needed"; canRun: boolean; move: boolean; app: boolean; version?: string; detail?: string; kept?: boolean }
  | { kind: "move"; detail?: string; kept?: boolean }
  | { kind: "newer"; newer: string; version?: string; detail?: string; kept?: boolean }
  | { kind: "app"; newer: string; version?: string };

export function memUpdate(b: BridgeView | undefined): MemUpdate | undefined {
  if (!b) return undefined;
  if (b.state === "updating") return { kind: "updating", move: b.upkeep?.kind === "move" };
  if (b.done && b.done !== "installed") return { kind: "done", done: b.done };
  if (b.state === "update_mem")
    return { kind: "needed", canRun: !!b.canRun, move: b.upkeep?.kind === "move", app: b.need === "app" || !b.version, ...(b.version ? { version: b.version } : {}), ...(b.detail ? { detail: b.detail } : {}), ...(b.kept ? { kept: true } : {}) };
  if (b.upkeep?.kind === "move") return { kind: "move", ...(b.upkeep.detail ? { detail: b.upkeep.detail } : {}), ...(b.upkeep.kept ? { kept: true } : {}) };
  if (b.upkeep?.kind === "update") return { kind: "newer", newer: b.newer ?? "", ...(b.version ? { version: b.version } : {}), ...(b.upkeep.detail ? { detail: b.upkeep.detail } : {}), ...(b.upkeep.kept ? { kept: true } : {}) };
  if (b.newer !== undefined) return { kind: "app", newer: b.newer, ...(b.version ? { version: b.version } : {}) };
  return undefined;
}

/** The Settings entry's line for Memory (the list row, the Mac's rail): key, or "" for its usual words. */
export function memBadge(u: MemUpdate | undefined): "" | "mem.badge.newer" | "mem.badge.needed" {
  if (!u) return "";
  if (u.kind === "needed") return "mem.badge.needed";
  return u.kind === "newer" || u.kind === "app" ? "mem.badge.newer" : "";
}

/**
 * D332: 和你的其他 agent 通信 / Talk with your other agents shows by who: to the person who runs AI agents of their own
 * (own: Ducter saw their records here, or Mem's plugin in one of their agents), to anyone another agent
 * has written to or who stopped listening to one, and while the partner is connected (or answers
 * elsewhere). Everyone else meets one quiet line on the Partner page instead (J6).
 */
export function peersShown(peers: PeersSettings | undefined, b: BridgeView | undefined, seen: boolean, own: boolean): boolean {
  if (!peers) return false;
  if (seen || peers.muted.length > 0) return true;
  if (b && ["connected", "disconnecting", "elsewhere", "unconfirmed"].includes(b.state)) return true;
  return own;
}

/** D332: whether the person runs AI agents of their own: their records here, or Mem's plugin in one. */
export function ownsAgents(ownAgents: readonly string[], devices: { harnesses: { harness: string; mem?: { state: string } }[] }[]): boolean {
  return ownAgents.length > 0 || devices.some((d) => d.harnesses.some((h) => h.mem?.state === "installed" || h.mem?.state === "update"));
}

/**
 * D332: what the pane is about, in one word: on (connected: what came and went, what to say, the
 * switch), off (the person switched it off), getting (Mem isn't ready yet: one sentence of value and
 * the step that gets it, in place), joining (Mem is ready and the home connects by itself), problem
 * (one row, its one fix), none (no Mem answer at all: memory is off).
 */
export type PeersPhase = "on" | "off" | "getting" | "joining" | "problem" | "none";

/**
 * D340: whether the switch shows on. A home that isn't the person's own (a scratch or second home)
 * never connects by itself: while Mem is ready there it shows off, and flipping it on is the ask.
 */
export function peersSwitchOn(reach: string | undefined, b: BridgeView | undefined): boolean {
  return reach !== "off" && !(b?.state === "ready" && b.asks);
}

export function peersPhase(b: BridgeView | undefined, switchOn: boolean): PeersPhase {
  if (!b) return "none";
  if (b.state === "connected" || b.state === "disconnecting") return switchOn || b.state === "connected" ? "on" : "off";
  if (!switchOn) return "off";
  switch (b.state) {
    case "install_mem":
    case "installing":
    case "update_mem":
    case "updating":
    case "sign_in":
    case "signing_in":
      return "getting";
    case "ready":
    case "connecting":
      return "joining";
  }
  return "problem"; // local_mem, no_space, refused, failed, unconfirmed, elsewhere
}

/** D332: one exchange with another agent, as 最近 / Recently lists it: who (its name, else the tool it runs in), which way, its words, when, where it leads. */
export type Handoff = { seq: number; at: string; agent: string; host?: string; way: "in" | "sent" | "replied"; words: string; taskId?: string };

/**
 * What another agent is called, in this order: its own name in Mem (the sender's agent, else the readable
 * sender), else the tool it runs in when Mem says (`host`: "Claude Code 里的 agent"), else nothing (unnamed).
 * nmem stores a sender it can't name as "another agent"; that is no name.
 */
export function peerCalled(b: { agent?: string; from?: string; to?: string; host?: string }, dir: "in" | "out" = "in"): { name?: string; host?: string } {
  const named = (dir === "in" ? [b.agent, b.from] : [b.agent, b.to]).find((x) => x && x.trim() && x !== "another agent");
  if (named) return { name: named };
  return b.host ? { host: b.host } : {};
}

/**
 * D332: the latest exchanges with the person's other agents, both ways, newest first: what one sent the
 * partner, what the partner sent or answered. Only what really went: never a draft still waiting for the
 * person's tap, one that didn't go, or one set aside or muted.
 */
export function recentHandoffs(
  channel: { ev: { seq: number; ts: string }; peer?: { direction: "in" | "out"; agent?: string; host?: string; from?: string; to?: string; text: string; taskId?: string; decisionId?: string; state?: string } }[],
  limit = 5,
): Handoff[] {
  const out: Handoff[] = [];
  for (let i = channel.length - 1; i >= 0 && out.length < limit; i--) {
    const e = channel[i]!;
    const p = e.peer;
    if (!p) continue;
    if (p.direction === "in" ? p.state === "early" || p.state === "set_aside" || p.state === "muted" : p.state !== undefined && p.state !== "sent" && p.state !== "followed") continue;
    const words = p.text.replace(/\s+/g, " ").trim();
    if (!words) continue;
    const who = peerCalled(p, p.direction);
    out.push({ seq: e.ev.seq, at: e.ev.ts, agent: who.name ?? "", ...(who.host ? { host: who.host } : {}), way: p.direction === "in" ? "in" : p.decisionId ? "sent" : "replied", words, ...(p.taskId ? { taskId: p.taskId } : {}) });
  }
  return out;
}

/** The noted lines by when: today (this computer's day), this week (the last 7 days), earlier. */
export type NotedGroup<T> = { when: "today" | "week" | "earlier"; items: T[] };

export function groupNoted<T extends { at: string }>(noted: T[], now: Date = new Date()): NotedGroup<T>[] {
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const week0 = day0 - 6 * 86_400_000;
  const out: NotedGroup<T>[] = [];
  for (const n of noted) {
    const at = Date.parse(n.at);
    const when = Number.isNaN(at) ? "earlier" : at >= day0 ? "today" : at >= week0 ? "week" : "earlier";
    const last = out.at(-1);
    if (last?.when === when) last.items.push(n);
    else out.push({ when, items: [n] });
  }
  return out;
}

/**
 * D304: the 想起了 / Remembered line's key and arguments: who it is from (the person's words to the
 * partner, another AI tool, the person's own note), and the day, when Mem has it.
 */
export function recallLine(r: { by: "said" | "tool" | "you"; from?: string }, date: string): { key: string; args: string[] } {
  const by = r.by === "tool" && !r.from ? "you" : r.by;
  const key = `recall.${by}${date ? "" : ".any"}`;
  const args = by === "tool" ? [r.from!, ...(date ? [date] : [])] : date ? [date] : [];
  return { key, args };
}

/** D304: 这周记下的: the noted lines of the last 7 days, newest first (as the Memory page's this week). */
export function weekNoted<T extends { at: string }>(noted: T[], now: Date = new Date()): T[] {
  return groupNoted(noted, now).filter((g) => g.when !== "earlier").flatMap((g) => g.items);
}

/** D321: what it knows about the person, as the Memory page's groups, in a fixed order; empty kinds left out. */
export const ABOUT_KINDS = ["preference", "decision", "fact", "other"] as const;
export type AboutKind = (typeof ABOUT_KINDS)[number];
export function aboutGroups<T extends { kind: AboutKind }>(items: T[]): { kind: AboutKind; items: T[] }[] {
  return ABOUT_KINDS.map((kind) => ({ kind, items: items.filter((x) => x.kind === kind) })).filter((g) => g.items.length > 0);
}

/** D321: who a memory is from, as the page's key and argument. */
export function bySource(x: { by: "said" | "tool" | "you" | "mem"; from?: string }): { key: string; args: string[] } {
  if (x.by === "tool" && x.from) return { key: "mem.by.tool", args: [x.from] };
  return { key: `mem.by.${x.by === "tool" ? "you" : x.by}`, args: [] };
}

export type TryAgent = { harness: "claude-code" | "codex"; plugin?: "on" | "off"; device?: string };

/**
 * D321: the agents 试试看 names, from the person's computers: Claude Code and Codex where they're signed
 * in, each with whether Mem's plugin is in it somewhere (on), missing where it's signed in (off, with
 * the computer to put it on, the home first), or unknown (Mem's check can't tell).
 */
export function tryAgents(devices: { id: string; name: string; home?: boolean; harnesses: { harness: string; installed: boolean; loggedIn: boolean; mem?: { state: string } }[] }[]): TryAgent[] {
  const out: TryAgent[] = [];
  const ds = [...devices].sort((a, b) => Number(!!b.home) - Number(!!a.home));
  for (const h of ["claude-code", "codex"] as const) {
    const here = ds.flatMap((d) => d.harnesses.filter((x) => x.harness === h && x.installed && x.loggedIn).map((x) => ({ d, x })));
    if (!here.length) continue;
    if (here.some((v) => v.x.mem?.state === "installed" || v.x.mem?.state === "update")) out.push({ harness: h, plugin: "on" });
    else {
      const off = here.find((v) => v.x.mem?.state === "absent");
      out.push(off ? { harness: h, plugin: "off", device: off.d.id } : { harness: h });
    }
  }
  return out;
}
