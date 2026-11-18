// D366: where Nowledge Mem stands on a computer for tasks, as its row shows it (the card, the lend
// sheet). Pure, so tests drive it; the Mac's views/workermem.go reads the same order.
import type { DeviceMemView, DeviceView } from "@ducter/protocol";

export type MemRowLook = "installing" | "connecting" | "failed" | "ready" | "sign_in" | "absent";

export function memRowLook(m: DeviceMemView): MemRowLook {
  if (m.step?.phase === "installing") return "installing";
  if (m.step?.phase === "connecting") return "connecting";
  if (m.step?.phase === "failed") return "failed";
  return m.state;
}

/**
 * D375: what Mem's own doctor there says is wrong, when the row would otherwise just ask to sign in:
 * unreachable (set up, its Mem doesn't answer: Check again), signed_out (it signed in once, that
 * stopped working: the link field, as a first sign-in), old (that nmem has no doctor: Update when
 * it is Ducter's own copy, else how). Undefined: the row's own words.
 */
export function memRowHealth(m: DeviceMemView): "unreachable" | "signed_out" | "old" | undefined {
  if (memRowLook(m) !== "sign_in") return undefined;
  const i = m.health?.issue;
  return i === "unreachable" || i === "signed_out" || i === "old" ? i : undefined;
}

/** The agents Mem connects by itself (Codex, Claude Code) that are installed there and not connected to it yet. */
export function unconnected(dv: Pick<DeviceView, "harnesses" | "mem">): string[] {
  if (dv.mem?.state !== "ready") return [];
  const on = new Set(dv.mem.agents ?? []);
  return dv.harnesses.filter((h) => h.installed && (h.harness === "codex" || h.harness === "claude-code") && !on.has(h.harness)).map((h) => h.harness);
}

/** The lend sheet shows the row once the computer can take tasks (an agent signed in) and the home has Mem. */
export const lendShowsMem = (dv: Pick<DeviceView, "harnesses" | "mem">) => !!dv.mem && dv.harnesses.some((h) => h.installed && h.loggedIn);
