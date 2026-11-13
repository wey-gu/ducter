// D214: the screens a task can drive besides Ducter's browser (a phone, later a computer), shown in
// the workbench in the same frame (workbench.tsx Screen). A screen view registers itself here; the
// workbench shows its page only for a task it says it has a screen for. The phone-use view mounts
// with registerScreen("phone", { has, view: PhoneScreen }) (phone-use.tsx, D220): PhoneScreen takes
// { task, active } and mounts the live view of Ducter's phone, watching the task.
import type { FunctionComponent } from "preact";
import type { Task } from "./store.ts";

export type ScreenKind = "phone" | "computer";
interface Entry {
  has(task: Task): boolean;
  /** active: its page is the one shown (a view that streams starts only then). */
  view: FunctionComponent<{ task: Task; active?: boolean }>;
  /** D248: who is driving it now, for the frame's chip (idle: asleep, or not open yet). */
  driver?(task: Task): "agent" | "you" | "idle";
}

/** D248: who is driving this kind of screen for the task (the frame's chip); "agent" when it can't say. */
export function driverFor(kind: ScreenKind, task: Task): "agent" | "you" | "idle" {
  return screens.get(kind)?.driver?.(task) ?? "agent";
}
const screens = new Map<ScreenKind, Entry>();

export function registerScreen(kind: ScreenKind, e: Entry) {
  screens.set(kind, e);
}

/** The view of this kind of screen for the task, when it has one. */
export function screenFor(kind: ScreenKind, task: Task): FunctionComponent<{ task: Task; active?: boolean }> | undefined {
  const e = screens.get(kind);
  return e && e.has(task) ? e.view : undefined;
}
