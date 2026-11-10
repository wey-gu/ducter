// D157 (design/where.md): where a task runs. With one computer nothing is said; with two or more,
// every task says which one in a few words ("在 hel 上 · 用 Ducter 自己的浏览器") and a tap on it
// says why. The same words and rules as the desktop's views/where.go.
import type { DeviceView, WhereWhy } from "@ducter/protocol";
import { A } from "./app.ts";
import { harnessName } from "./format.ts";
import { placeOf, type Task } from "./store.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** The computers that run tasks: the home and its workers (phones never do). */
export const computers = (): DeviceView[] => (A.devices ?? []).filter((d) => d.kind !== "phone");

/** Two or more computers run tasks: every task says where. */
export const manyComputers = () => computers().length > 1;

/** A computer by the name or id a place carries ("local" and "" are the home). */
export function computerOf(d: string | undefined): DeviceView | undefined {
  const cs = computers();
  if (!d || d === "local") return cs.find((c) => c.home);
  return cs.find((c) => c.id === d || c.name.toLowerCase() === d.toLowerCase());
}

/** A computer's own name (never "this Mac" once there are two: on a phone "this" means nothing). */
export function computerName(d: string | undefined): string {
  return computerOf(d)?.name || (!d || d === "local" ? (A.homeName ?? t("device.local")) : d);
}

/** What it uses there when that is the point: the user's Chrome, Ducter's own browser, an app. */
export function whereUses(w: WhereWhy | undefined): string {
  if (w?.uses === "chrome") return t("where.your_chrome");
  if (w?.uses === "ducter") return t("where.ducter_browser");
  if (w?.uses === "app" && w.app) return t("where.app", w.app);
  return "";
}

/** The one reason, in words (where.md §8). */
export function whereReason(w: WhereWhy | undefined): string {
  if (!w) return "";
  const dev = computerName(w.device);
  switch (w.kind) {
    case "always_on":
      return w.other ? t("where.reason.always_on", w.other) : t("where.reason.always_on.0");
    case "signed_in":
      return w.site ? t("where.reason.signed_in", w.site) : t("where.reason.signed_in.0");
    case "only_here":
      if (w.thing === "app") return t("where.reason.only_app", dev, w.app ?? "");
      if (w.thing === "chrome") return t("where.reason.only_chrome", dev);
      if (w.thing === "browser") return t("where.reason.only_web", dev);
      if (w.thing === "agent") return t("where.reason.agent_here", harnessName(w.agent ?? ""), dev);
      return "";
    case "awake":
      return t("where.reason.awake", w.other ?? "", dev);
    case "changes_here":
      return t("where.reason.changes", dev);
    case "agent_here":
      return t("where.reason.agent_here", harnessName(w.agent ?? ""), dev);
    case "no_signin":
      return t("where.reason.no_signin", dev);
    case "moved":
      return t("where.reason.moved", w.other ?? "", dev);
    case "you":
      return w.text ? t("where.reason.rule", w.text) : t("where.reason.you", dev);
    case "home":
      return t("where.reason.home", dev);
  }
  return "";
}

/** The where part of a task's meta line and its reason; empty with one computer. */
export function taskWhere(task: Task): { line: string; why: string } {
  if (!manyComputers()) return { line: "", why: "" };
  const name = computerName((placeOf(task) as { device?: string }).device);
  let w = task.body?.why.where;
  // A move or a re-pick since: the place says where it is now; the reason is for there only.
  if (w && computerName(w.device) !== name) w = undefined;
  const line = [t("where.on", name), whereUses(w)].filter(Boolean).join(" · ");
  const r = whereReason(w);
  return { line, why: r ? t("where.why", name, r) : "" };
}
