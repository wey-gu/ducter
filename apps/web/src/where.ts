// D157 (design/where.md): where a task runs. With one computer nothing is said; with two or more,
// every task says which one in a few words ("在 hel 上 · 用 Ducter 自己的浏览器") and a tap on it
// says why. The same words and rules as the desktop's views/where.go.
import type { Candidate, ClosingPlan, DeviceView, WhereAsk, WhereWhy } from "@ducter/protocol";
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

/** A switch row's reason when what stops it is the computer (or it would wait there). */
export function whereCandReason(c: Candidate): string {
  const name = c.deviceName ?? "";
  if (c.blocked === "no_chrome") return t("switch.cant.chrome", name);
  if (c.blocked === "no_browser") return t("switch.cant.web", name);
  if (c.blocked === "no_app") return t("switch.cant.app");
  if (c.blocked === "no_draw") return t("switch.cant.draw");
  if (c.blocked === "elsewhere") return t("switch.cant.folder");
  if (!c.blocked && c.waits) return t(c.waits === "asleep" ? "switch.waits" : "switch.waits.away");
  return "";
}

/** What sets a computer apart on New task's list: asleep, always awake, or the user's Chrome and Mac apps. */
export function computerApart(d: DeviceView): string {
  if (d.state === "asleep") return t("newtask.computer.asleep");
  if (d.state === "unreachable") return t("newtask.computer.away");
  if (d.alwaysOn) return t("newtask.computer.always_on");
  if (d.abilities.some((a) => a.id === "web" && a.where === "chrome")) return t("newtask.computer.mac");
  return "";
}

/** D157: the closing card in the reader's words: what moves where, what stays until it wakes. */
export function closingWords(p: ClosingPlan): { question: string; go: string; hold: string } {
  const zh = A.L.lang === "zh";
  const q = (s: string) => (zh ? `「${s}」` : `“${s}”`);
  const sep = zh ? "" : ", ";
  const moved = p.moves.map((m) => q(m.title)).join(sep);
  const stay = p.stays.map((s) => q(s.title)).join(sep);
  const dst = p.moves[0]?.toName ?? "";
  const question = moved && stay ? t("move.closing.line", moved, dst, stay, p.name) : moved ? t("move.closing.moves", moved, dst) : t("move.closing.stays", stay, p.name);
  return { question, go: t("move.closing.go"), hold: t("move.closing.hold") };
}

/** A computer group's state words: 醒着 · 一直醒着. */
export function computerState(d: DeviceView): string {
  const s = d.state === "asleep" ? t("switch.computer.asleep") : d.state === "unreachable" ? t("switch.computer.away") : t("switch.computer.awake");
  return [s, d.alwaysOn ? t("switch.computer.on") : ""].filter(Boolean).join(" · ");
}

/** A task waiting on its computer, in words (the runner's device:asleep / device:unreachable reasons). */
export function deviceWait(reason: string): string | undefined {
  const asleep = /^device:asleep:(.+)$/.exec(reason);
  if (asleep) return t("where.waiting", asleep[1]);
  const away = /^device:unreachable:(.+)$/.exec(reason);
  if (away) return t("device.unreachable", away[1]);
  return undefined;
}

/** D157: a where ask's words (where.md §4.4), built here so they read in the user's language. */
export function whereAsk(w: WhereAsk): { question: string; go: string; hold: string; lines: { text: string; widen?: boolean }[] } {
  const question =
    w.kind === "pin"
      ? t("where.ask.pin", harnessName(w.agent ?? ""), w.device)
      : w.state === "unreachable"
        ? t("where.ask.away", w.device, w.other)
        : t(w.here === "chrome" ? "where.ask.asleep.chrome" : "where.ask.asleep", w.device, w.other);
  const go = w.kind === "pin" && w.otherAgent ? t("where.ask.now.pin", harnessName(w.otherAgent)) : t("where.ask.now", w.other);
  const hold = t(w.kind === "pin" ? "where.ask.wait.pin" : "where.ask.wait");
  const lines = [
    ...(w.signIn ? [{ text: w.site ? t("where.ask.signin", w.other, w.site) : t("where.ask.signin.0", w.other) }] : []),
    // Never widen silently: the most important sentence on the card, in the accent ink.
    ...(w.widens ? [{ text: t("switch.move.widens"), widen: true }] : []),
    { text: t("where.ask.default") },
  ];
  return { question, go, hold, lines };
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
