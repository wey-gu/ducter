// Esc on an opened task (D210): while it works, the first Esc asks (the foot says "Press Esc again
// to pause") and a second within ESC_MS pauses it. Elsewhere Esc goes up a level (wide.ts).
import { A } from "./app.ts";
import { attention } from "./store.ts";

export const ESC_MS = 3000;

/** True when Esc was taken by a task at work. */
export function escPause(taskId: string): boolean {
  const task = A.S.tasks.get(taskId);
  if (!task || attention(task) !== "working") return false;
  if (escArmed(taskId)) {
    A.escAt = undefined;
    A.taskAction(taskId, "interrupt");
  } else {
    A.escAt = { id: taskId, at: Date.now() };
    setTimeout(() => A.changed(), ESC_MS + 50);
  }
  A.changed();
  return true;
}

/** A first Esc is waiting for the second on this task. */
export const escArmed = (taskId: string) => !!A.escAt && A.escAt.id === taskId && Date.now() - A.escAt.at < ESC_MS;
