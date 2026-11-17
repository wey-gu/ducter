// D347: 借一台电脑来干活 / Lend a computer: which step the sheet is on, from what the person chose
// and what the home said (lend frames, packages/core/src/lend.ts). Pure, so tests drive it.
import type { DeviceView, LendFrame } from "@ducter/protocol";

export type LendKind = "mac" | "linux";

/** The sheet's state on the page: open while defined. */
export interface LendState {
  kind?: LendKind;
  /** The code's frame: the asking window's (with its line), merged with the later ones. */
  frame?: LendFrame;
  /** A lend_code is out and its answer not here yet. */
  awaiting?: boolean;
}

export type LendStep = "ask" | "asking" | "noaddress" | "line" | "expired" | "joined" | "here";

export function lendStep(l: LendState, now: number): LendStep {
  if (!l.kind) return "ask";
  const f = l.frame;
  if (!f) return "asking";
  if (f.state === "here") return "here";
  if (f.state === "joined") return "joined";
  if (!f.address || !f.line) return "noaddress";
  if (now >= Date.parse(f.expiresAt)) return "expired";
  return "line";
}

/** Whole minutes the code has left, at least 1 while it still works. */
export function minutesLeft(f: Pick<LendFrame, "expiresAt">, now: number): number {
  return Math.max(1, Math.ceil((Date.parse(f.expiresAt) - now) / 60_000));
}

/**
 * A lend frame from the home into the sheet's state: the asking window takes the waiting frame it
 * asked for; the later ones (joined, here) land only on the same code, keeping the line.
 */
export function applyLend(l: LendState | undefined, f: LendFrame): LendState | undefined {
  if (!l) return l;
  if (f.state === "waiting") return l.awaiting ? { ...l, frame: f, awaiting: false } : l;
  if (!l.frame || l.frame.code !== f.code) return l;
  return { ...l, frame: { ...l.frame, ...f, ...(l.frame.line ? { line: l.frame.line } : {}) } };
}

/** The lent computer as Devices shows it now: its name, OS word key, and the agents signed in there. */
export function arrived(f: LendFrame, devices: readonly DeviceView[] | undefined): { id?: string; name: string; os?: "linux" | "mac"; arch?: string; agents: string[] } {
  const d = f.device ? devices?.find((x) => x.id === f.device) : undefined;
  const p = (d?.platform ?? "").toLowerCase();
  const os = p.startsWith("linux") ? "linux" : p.startsWith("darwin") || p.includes("mac") ? "mac" : undefined;
  const arch = /-(x64|arm64)$/.exec(p)?.[1];
  return {
    ...(f.device ? { id: f.device } : {}),
    name: d?.name ?? f.name ?? "",
    ...(os ? { os } : {}),
    ...(arch ? { arch } : {}),
    agents: (d?.harnesses ?? []).filter((h) => h.loggedIn).map((h) => h.harness),
  };
}
