// D214: the screens a task can drive besides Ducter's browser (a phone, later a computer), shown in
// the workbench in the same frame (workbench.tsx Screen). A screen view registers itself here; the
// workbench shows its page only for a task it says it has a screen for. The phone-use view mounts
// with: registerScreen("phone", { has: (task) => …, view: PhoneScreen }), where PhoneScreen takes
// { task } and reads its device, mode (watch | takeover | blind-signin) and turn from the home.
import type { FunctionComponent } from "preact";
import type { Task } from "./store.ts";

export type ScreenKind = "phone" | "computer";
interface Entry {
  has(task: Task): boolean;
  view: FunctionComponent<{ task: Task }>;
}
const screens = new Map<ScreenKind, Entry>();

export function registerScreen(kind: ScreenKind, e: Entry) {
  screens.set(kind, e);
}

/** The view of this kind of screen for the task, when it has one. */
export function screenFor(kind: ScreenKind, task: Task): FunctionComponent<{ task: Task }> | undefined {
  const e = screens.get(kind);
  return e && e.has(task) ? e.view : undefined;
}
