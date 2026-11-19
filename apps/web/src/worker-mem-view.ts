// D366: where Nowledge Mem stands on a computer for tasks, as its row shows it (the card, the lend
// sheet). Pure, so tests drive it; the Mac's views/workermem.go reads the same order.
import type { DeviceMemReason, DeviceMemView, DeviceView } from "@ducter/protocol";

/**
 * D386: the person's own Mem command line there is too old to sign in. old: nothing of Ducter's
 * there yet (the row offers its own current copy, never the paste); using: Ducter's own copy is
 * used there, the person's stays as it is. Undefined: nothing to say.
 */
export function memRowTheirs(m: DeviceMemView): "old" | "using" | undefined {
  if (!m.theirs?.old) return undefined;
  return m.ours ? "using" : "old";
}

/** D386: the one command that updates the person's own copy, when its install says how (shown, never run). */
export function theirUpdateCommand(how: NonNullable<DeviceMemView["theirs"]>["how"]): string | undefined {
  return how === "pipx" ? "pipx upgrade nmem-cli" : how === "uv" ? "uv tool upgrade nmem-cli" : how === "pip" ? "python3 -m pip install --user --upgrade nmem-cli" : undefined;
}

/**
 * D386: after a failed sign-in, whether the paste stays in the box: only when nothing was spent
 * (refused before the link reached Mem: not a link, too old, putting the command line there
 * failed, Mem not reachable). A used, refused or unknown failure clears it: make a new one.
 */
export const memKeepsPaste = (reason: DeviceMemReason | undefined) =>
  reason === "bad_link" || reason === "old" || reason === "network" || reason === "space" || reason === "unsupported" || reason === "unreachable";

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
  if (memRowLook(m) !== "sign_in" || memRowTheirs(m) === "old") return undefined; // D386: that row says its own
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
