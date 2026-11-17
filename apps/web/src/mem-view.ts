// D257: what Settings › 记忆 / Memory and › 连上的 AI agent / Connected AI agents show, from the
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
 * 连上的 AI agent shows once it means something (J6: a fresh user never meets it): another agent wrote,
 * the person trusted or muted one, or Mem is on the home and signed in (older counts: one line says
 * to update it). Before Mem is there, Memory is where it goes in.
 */
export function peersShown(peers: PeersSettings | undefined, b: BridgeView | undefined, seen: boolean): boolean {
  if (!peers) return false;
  if (seen || peers.trusted.length > 0 || peers.muted.length > 0) return true;
  return !!b && !["install_mem", "installing", "sign_in", "signing_in"].includes(b.state);
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

/** How long the first hand-off stays celebrated on 连上的 AI agent. */
export const FIRST_FRESH_MS = 15 * 60_000;

/**
 * D321: the live row on 连上的 AI agent's 试试看: waiting (nothing came from another agent yet), first
 * (the first came in the last 15 minutes: say it worked), or none (it's been used).
 */
export function handoffPhase(firstAt: string | undefined, now: number = Date.now()): "waiting" | "first" | "none" {
  if (!firstAt) return "waiting";
  const at = Date.parse(firstAt);
  return !Number.isNaN(at) && now - at < FIRST_FRESH_MS ? "first" : "none";
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
