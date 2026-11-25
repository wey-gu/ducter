// D566: 存到 Nowledge Mem / Save to Nowledge Mem, the asking side: one `mem_file_save` per tap,
// what each file is doing now (saving, or why it wasn't kept), and the home's answer. Kept apart
// from the views so app.ts can hand answers here without loading any view (as filelink-ask.ts).
import type { ClientFrame, MemFileShared, MemFileWhy, MemHealth, MemView, Settings } from "@ducter/protocol";

export type KeepNow = { state: "saving" } | { state: "failed"; why: MemFileWhy; message?: string; shared?: MemFileShared };

let seq = 0;
const now = new Map<string, KeepNow>();
let sender: ((f: ClientFrame) => boolean | void) | undefined;
let changed: () => void = () => {};

/** Where requests go and who redraws (app.ts, once). */
export function memKeepWire(send: (f: ClientFrame) => boolean | void, redraw: () => void) {
  sender = send;
  changed = redraw;
}

/** What a file's Save to Nowledge Mem is doing on this device (nothing: as Mem's own state says). */
export const keepNow = (mediaId: string): KeepNow | undefined => now.get(mediaId);

/**
 * A tap: saving at once; the answer comes back as a mem_file_save frame. space (D575): the person's
 * answer to shared_space, once: their own Space (the default) or the shared one Mem named.
 */
export function keepInMem(mediaId: string, space?: "personal" | "shared") {
  if (now.get(mediaId)?.state === "saving") return;
  now.set(mediaId, { state: "saving" });
  changed();
  const id = `mk${++seq}`;
  if (!sender || sender({ t: "mem_file_save", id, media: mediaId, ...(space ? { space } : {}) }) === false) {
    now.set(mediaId, { state: "failed", why: "unreachable" });
    changed();
    return;
  }
  // A home that never answers (gone away mid-upload): said, never a spinner forever.
  setTimeout(() => {
    if (now.get(mediaId)?.state === "saving") now.set(mediaId, { state: "failed", why: "unreachable" }), changed();
  }, 180_000);
}

/** The home's answer: kept (the settings frame's mem.files carries it from now on), or why not. */
export function onMemFileFrame(f: { media: string; ok: boolean; why?: MemFileWhy; message?: string; shared?: MemFileShared }) {
  if (f.ok) now.delete(f.media);
  else now.set(f.media, { state: "failed", why: f.why ?? "refused", ...(f.message ? { message: f.message } : {}), ...(f.shared ? { shared: f.shared } : {}) });
  changed();
}

/**
 * D566: the action shows only when Mem is there to take it: memory on, Nowledge Mem connected, and
 * its doctor finding nothing the person must fix first (signed out, unreachable, too old).
 */
export function memKeepReady(s: Settings | undefined, mem: MemView | undefined): boolean {
  if (!s?.memory || mem?.state !== "connected") return false;
  const issue: MemHealth["issue"] = mem.health?.issue;
  return issue !== "signed_out" && issue !== "unreachable" && issue !== "old";
}
