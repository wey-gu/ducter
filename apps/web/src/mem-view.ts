// D257: what Settings › 记忆 / Memory and › 和你的其他 agent 通信 / Talk with your other agents (D332) show, from the
// settings frame (settings.memory, mem, bridge). Pure, so the phone, the wide page and the tests
// read it the same way; the Mac has the same rules (apps/desktop/internal/views/memory.go).
import type { BridgeView, MemHealth, MemView, PeersSettings } from "@ducter/protocol";
import { compareVersions, isVersion } from "@ducter/protocol/src/version.ts";

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

/**
 * D375: what the Nowledge Mem head on Memory says about Mem's own health (its doctor on the home):
 * unread (not read yet, or it can't tell: the plain "Connected"), ok (one calm line), or the one thing
 * wrong with its one action: old (this nmem has no doctor; Update when Ducter can run it, and not
 * when the update row already offers it), unreachable (Check again), signed_out (Sign in again: the
 * link field in place), plugin (these agents aren't connected: Connect, Mem's own command; busy while
 * it runs).
 */
export type MemHealthLook =
  | { look: "unread" }
  | { look: "ok" }
  | { look: "old"; canUpdate: boolean }
  | { look: "unreachable" }
  | { look: "signed_out" }
  | { look: "plugin"; agents: string[]; busy: boolean };

export function memHealthLook(h: MemHealth | undefined, b: BridgeView | undefined, home: { harness: string; mem?: { state: string; busy?: true; fresh?: true } }[] = []): MemHealthLook {
  if (!h) return { look: "unread" };
  switch (h.issue) {
    case undefined:
      return { look: "ok" };
    case "old":
      // The update row already says Mem's command line is behind, with its own button.
      return memUpdate(b) ? { look: "unread" } : { look: "old", canUpdate: !!b?.canRun };
    case "unreachable":
    case "signed_out":
      return { look: h.issue };
    case "plugin": {
      // An agent Mem's command just put in is connected: the next read says so.
      const agents = (h.agents ?? []).filter((a) => !home.find((x) => x.harness === a)?.mem?.fresh);
      if (!agents.length) return { look: "ok" };
      return { look: "plugin", agents, busy: agents.some((a) => !!home.find((x) => x.harness === a)?.mem?.busy) };
    }
  }
  return { look: "unread" };
}

/** D364: the first nmem that asks Mem who sent a message and what it answers (Mem #10278, research/134). */
export const MEM_NAMES = "0.10.120";

/**
 * D364: on the connected Talk with your other agents pane, an nmem older than MEM_NAMES while Mem says
 * a newer one is out: Mem's update, offered there with what it gives this pane (the sender's name, the
 * answer tied to its question). Nothing when it is current or nothing newer is out.
 */
export function peersNamesUpdate(b: BridgeView | undefined): Extract<MemUpdate, { kind: "newer" | "app" }> | undefined {
  if (b?.state !== "connected" || !isVersion(b.version) || compareVersions(b.version, MEM_NAMES) >= 0) return undefined;
  const u = memUpdate(b);
  return u && (u.kind === "newer" || u.kind === "app") ? u : undefined;
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
// D448: tasksent, a task's own message Ducter carried; taskin, an answer that went into that task.
export type Handoff = { seq: number; at: string; agent: string; host?: string; way: "in" | "sent" | "replied" | "tasksent" | "taskin"; words: string; taskId?: string; mine?: boolean; role?: string; selfNamed?: boolean; state?: OutState };
/** D433: an outgoing message that hasn't plainly gone: still going, being checked, given up on, or refused. */
export type OutState = "sending" | "unknown" | "unconfirmed" | "failed";

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
  channel: { ev: { seq: number; ts: string }; peer?: { direction: "in" | "out"; agent?: string; host?: string; from?: string; to?: string; text: string; taskId?: string; decisionId?: string; state?: string; mine?: boolean; role?: string; selfNamed?: boolean } }[],
  limit = 5,
  outOps?: ReadonlyMap<string, { seq: number; ts: string; b: { direction: "in" | "out"; agent?: string; host?: string; to?: string; text: string; taskId?: string; decisionId?: string; state?: string; mine?: boolean; role?: string; selfNamed?: boolean } }>,
): Handoff[] {
  const out: Handoff[] = [];
  // D433: what went out and hasn't plainly gone yet joins the list with its state, so the person sees it.
  const unsent: typeof channel = [];
  for (const o of outOps?.values() ?? []) if (o.b.state && o.b.state !== "sent") unsent.push({ ev: { seq: o.seq, ts: o.ts }, peer: o.b });
  if (unsent.length) channel = [...channel, ...unsent].sort((a, b) => a.ev.seq - b.ev.seq);
  for (let i = channel.length - 1; i >= 0 && out.length < limit; i--) {
    const e = channel[i]!;
    const p = e.peer;
    if (!p) continue;
    // D418: a contact test answered by code (and its answer) is a check, not an exchange worth listing.
    const pending = p.direction === "out" && (p.state === "sending" || p.state === "unknown" || p.state === "unconfirmed" || p.state === "failed") ? (p.state as OutState) : undefined;
    if (p.direction === "in" ? p.state === "early" || p.state === "set_aside" || p.state === "muted" || p.state === "ping" : (p.state !== undefined && p.state !== "sent" && p.state !== "followed" && !pending) || (p as { ack?: boolean }).ack) continue;
    const words = p.text.replace(/\s+/g, " ").trim();
    if (!words) continue;
    const who = peerCalled(p, p.direction);
    out.push({ seq: e.ev.seq, at: e.ev.ts, agent: who.name ?? "", ...(who.host ? { host: who.host } : {}), way: (p as { by?: string }).by === "task" ? "tasksent" : p.direction === "in" ? (p.state === "task" ? "taskin" : "in") : p.decisionId ? "sent" : "replied", words, ...(p.taskId ? { taskId: p.taskId } : {}), ...(p.mine ? { mine: true } : {}), ...(p.selfNamed ? { selfNamed: true } : {}), ...(p.role ? { role: p.role } : {}), ...(pending ? { state: pending } : {}) });
  }
  return out;
}

/** D433: the tools whose Nowledge Mem plugin carries Bridge today (research/66 §10, research/183): they can reach the partner. */
export const BRIDGE_TOOLS = ["claude-code", "codex"] as const;
/** D433: tools the person may run whose Mem plugin has no Bridge yet: they share the memory but can't pass a message. */
export const NO_BRIDGE_TOOLS = ["pi", "antigravity"] as const;
export const TOOL_NAME: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex", pi: "pi", antigravity: "Antigravity" };

/**
 * D433: 能找到{name}的 / Who can reach {name}: one row per AI tool the person runs (on any computer of
 * theirs, or their own records here), in a fixed order. can: its Mem plugin carries Bridge and is in;
 * install: it carries Bridge but isn't in on that device (one tap); unknown: Mem's check hasn't said;
 * none: its Mem plugin can't pass messages yet (Mem's to add). last: the newest exchange with it.
 * D448: relay: its Mem plugin can't, but it is signed in on a computer of Ducter's, so the tasks Ducter
 * runs on it pass messages through Ducter; the person's own sessions of it outside Ducter still can't.
 */
// D444: box, from Mem's grouped contact list: its mailbox takes messages (open) or not (closed); absent when Mem didn't list it.
export type ReachRow = { harness: string; tool: string; can: "yes" | "install" | "unknown" | "none" | "relay"; device?: string; deviceName?: string; last?: string; box?: "open" | "closed" };
export function reachRows(
  devices: { id: string; name: string; home?: boolean; harnesses: { harness: string; installed: boolean; loggedIn: boolean; mem?: { state: string } }[] }[],
  ownAgents: readonly string[],
  recent: readonly Pick<Handoff, "agent" | "host" | "at">[],
  boxes: readonly { harness: string; open: boolean }[] = [],
): ReachRow[] {
  const ds = [...devices].sort((a, b) => Number(!!b.home) - Number(!!a.home));
  const out: ReachRow[] = [];
  for (const h of [...BRIDGE_TOOLS, ...NO_BRIDGE_TOOLS] as string[]) {
    const here = ds.flatMap((d) => d.harnesses.filter((x) => x.harness === h && x.installed && x.loggedIn).map((x) => ({ d, x })));
    const mb = boxes.find((x) => x.harness === h);
    const box = mb ? { box: mb.open ? ("open" as const) : ("closed" as const) } : {};
    if (!here.length && !ownAgents.includes(h) && !mb) continue;
    const tool = TOOL_NAME[h]!;
    const last = recent.find((r) => r.host === tool || new RegExp(`\\b${tool.replace(/ /g, "\\s*")}\\b`, "i").test(r.agent))?.at;
    const at = last ? { last } : {};
    if (!(BRIDGE_TOOLS as readonly string[]).includes(h)) {
      out.push({ harness: h, tool, can: here.length ? "relay" : "none", ...at });
      continue;
    }
    // D444: Mem listing its mailbox as open is the plainest proof it can reach the partner.
    if (here.some((v) => v.x.mem?.state === "installed" || v.x.mem?.state === "update") || last || mb?.open) {
      out.push({ harness: h, tool, can: "yes", ...at, ...box });
      continue;
    }
    const off = here.find((v) => v.x.mem?.state === "absent");
    out.push(off ? { harness: h, tool, can: "install", device: off.d.id, deviceName: off.d.name, ...box } : { harness: h, tool, can: "unknown", ...box });
  }
  return out;
}

/**
 * D433: when the other computer that receives the partner's mail was last seen by Nowledge Mem
 * (`bridge connections list --include-activity`): quiet for over a day reads as away.
 */
export const AWAY_MS = 24 * 3_600_000;
export const awayFor = (seenAt: number | undefined, now = Date.now()): boolean => seenAt !== undefined && now - seenAt > AWAY_MS;

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
export function recallLine(r: { by: "said" | "tool" | "you"; from?: string; thread?: true }, date: string): { key: string; args: string[] } {
  // D433: a past conversation with another AI tool: 想起了你 11月12日 和 Codex 聊的.
  if (r.thread && r.from) return { key: `recall.thread${date ? "" : ".any"}`, args: [r.from, ...(date ? [date] : [])] };
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
