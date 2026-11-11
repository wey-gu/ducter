// D214: asking the home for one workbench op (a `wb` frame), and its answer. Kept apart from the
// workbench's view so app.ts can hand answers here without loading any view.
import type { ClientFrame } from "@ducter/protocol";
import type { WbAnswer, WbError, WbRequest } from "@ducter/protocol/src/workbench.ts";

let seq = 0;
const waiting = new Map<string, { resolve: (a: WbAnswer) => void; reject: (e: { error: WbError; message?: string }) => void }>();
let sender: ((f: ClientFrame) => void) | undefined;

/** Where requests go (app.ts sets it to its socket). */
export function wbSender(send: (f: ClientFrame) => void) {
  sender = send;
}

/** One workbench op of a task, answered by the home (a `wb` frame with the same id). */
export function ask(taskId: string, req: WbRequest): Promise<WbAnswer> {
  const id = `wb${++seq}`;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    sender?.({ t: "wb", id, taskId, req });
    setTimeout(() => {
      if (waiting.delete(id)) reject({ error: "failed", message: "timeout" });
    }, 45_000);
  });
}

/** A `wb` frame from the home. */
export function onWbFrame(f: { id: string; ok: boolean; answer?: WbAnswer; error?: WbError; message?: string }) {
  const w = waiting.get(f.id);
  if (!w) return;
  waiting.delete(f.id);
  if (f.ok && f.answer) w.resolve(f.answer);
  else w.reject({ error: f.error ?? "failed", ...(f.message ? { message: f.message } : {}) });
}
