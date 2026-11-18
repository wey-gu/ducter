// D356: asking the home to open a file a link names (a `file_open` frame), and its answer. Kept
// apart from the viewer so app.ts can hand answers here without loading any view.
import type { ClientFrame, FileOpenError, MediaRef } from "@ducter/protocol";

let seq = 0;
const waiting = new Map<string, { resolve: (m: MediaRef) => void; reject: (e: { error: FileOpenError; message?: string }) => void }>();
let sender: ((f: ClientFrame) => void) | undefined;

/** Where requests go (fileview.tsx sets it to the app's socket). */
export function fileLinkSender(send: (f: ClientFrame) => void) {
  sender = send;
}

/** The file at path on the home or a worker, kept by the home for the viewer; taskId: the task it was shown in. */
export function askFile(path: string, taskId?: string, timeoutMs = 60_000): Promise<MediaRef> {
  const id = `fo${++seq}`;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    if (!sender) return void (waiting.delete(id), reject({ error: "offline" }));
    sender({ t: "file_open", id, path, ...(taskId ? { taskId } : {}) });
    setTimeout(() => {
      if (waiting.delete(id)) reject({ error: "failed" });
    }, timeoutMs);
  });
}

/** A `file_open` frame from the home. */
export function onFileOpenFrame(f: { id: string; ok: boolean; file?: MediaRef; error?: FileOpenError; message?: string }) {
  const w = waiting.get(f.id);
  if (!w) return;
  waiting.delete(f.id);
  if (f.ok && f.file) w.resolve(f.file);
  else w.reject({ error: f.error ?? "failed", ...(f.message ? { message: f.message } : {}) });
}
