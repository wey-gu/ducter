// D306: at a glance, without opening the app. What a glance surface may show of one thing the person
// chose to keep in sight (a task they followed, or a call that is live): its phase, never its words.
//
// The phase is all that travels over a push to an iPhone's Live Activity (Apple and the relay see it;
// a Live Activity has no extension that could open a sealed payload, unlike D159's alerts). The
// title is set on the phone when the activity starts, from the page, and never leaves it. The
// Android app's ongoing notification and the Mac read the same phases and words.
import type { Attention } from "./index.ts";
import type { CallState } from "./phone.ts";
import { words, type LangTag } from "./lang.ts";

export type AmbientKind = "task" | "call";

export type AmbientPhase =
  // a task
  | "working"
  | "waiting"
  | "needs_you"
  | "done"
  | "failed"
  | "cancelled"
  // a call
  | "calling"
  | "talking"
  | "asking"
  | "called"
  | "no_answer"
  | "not_connected";

export const AMBIENT_PHASES: readonly AmbientPhase[] = ["working", "waiting", "needs_you", "done", "failed", "cancelled", "calling", "talking", "asking", "called", "no_answer", "not_connected"];

/** What a push carries to a Live Activity: the phase and since when (unix seconds). No words. */
export interface AmbientState {
  phase: AmbientPhase;
  since: number;
}

/** The phases after which there is nothing more to see: the glance ends (and fades soon after). */
export const AMBIENT_ENDED: readonly AmbientPhase[] = ["done", "failed", "cancelled", "called", "no_answer", "not_connected"];
export const ambientEnded = (p: AmbientPhase) => AMBIENT_ENDED.includes(p);

/** The one phase that asks for the person: drawn in the accent, the rest stay quiet. */
export const ambientNeedsYou = (p: AmbientPhase) => p === "needs_you" || p === "asking";

export const isAmbientPhase = (p: unknown): p is AmbientPhase => typeof p === "string" && (AMBIENT_PHASES as readonly string[]).includes(p);

/** A task's attention as a glance phase (queued counts as at work: it is on its way). */
export function taskPhase(a: Attention): AmbientPhase {
  switch (a) {
    case "needs_you":
      return "needs_you";
    case "blocked":
      return "waiting";
    case "done":
    case "done_claimed":
      return "done";
    case "failed":
      return "failed";
    case "dropped":
    case "superseded":
      return "cancelled";
    default:
      return "working";
  }
}

/** A call's state as a glance phase. */
export function callPhase(s: CallState): AmbientPhase | undefined {
  switch (s) {
    case "waiting":
      return "waiting";
    case "calling":
      return "calling";
    case "talking":
      return "talking";
    case "question":
      return "asking";
    case "done":
    case "uncertain":
      return "called";
    case "automated":
    case "failed":
      return "not_connected";
    case "no_answer":
      return "no_answer";
    case "cancelled":
    case "held":
      return "cancelled";
    default:
      return; // needs_go: not live yet, nothing to glance at
  }
}

export interface AmbientWords {
  phase: Record<AmbientPhase, string>;
  /** Past the activity's stale date: the home hasn't been heard from. */
  stale: string;
  /** The follow switch in an opened task: iPhone, then Android. */
  showIos: string;
  hideIos: string;
  showAndroid: string;
  hideAndroid: string;
  /** Said once under the switch the first time. */
  note: string;
  /** The Android channel's name and what it is for. */
  channel: string;
  channelAbout: string;
}

/** The glossary's words for each phase (attention states, D207; calls, D193), per language (D292). */
export const AMBIENT_WORDS: { en: AmbientWords } & Partial<Record<LangTag, AmbientWords>> = {
  zh: {
    phase: {
      working: "在做",
      waiting: "在等",
      needs_you: "等你",
      done: "做完了",
      failed: "没成",
      cancelled: "已取消",
      calling: "在打",
      talking: "通话中",
      asking: "对方在问",
      called: "打完了",
      no_answer: "没人接",
      not_connected: "没打通",
    },
    stale: "可能不是最新的",
    showIos: "在锁屏上显示",
    hideIos: "不在锁屏上显示",
    showAndroid: "在通知栏显示",
    hideAndroid: "不在通知栏显示",
    note: "只显示它在做、在等还是等你，不显示内容。做完就自己收起。",
    channel: "跟着看的任务和通话",
    channelAbout: "你选了要跟着看的任务，和正在打的电话：只显示到了哪一步。",
  },
  en: {
    phase: {
      working: "Working",
      waiting: "Waiting",
      needs_you: "Needs you",
      done: "Done",
      failed: "Didn't work",
      cancelled: "Cancelled",
      calling: "Calling",
      talking: "On the call",
      asking: "They're asking",
      called: "Called",
      no_answer: "No answer",
      not_connected: "Didn't connect",
    },
    stale: "May be out of date",
    showIos: "Show on the Lock Screen",
    hideIos: "Remove from the Lock Screen",
    showAndroid: "Show in notifications",
    hideAndroid: "Remove from notifications",
    note: "Only whether it's working, waiting or needs you, never what it says. It goes away when it's done.",
    channel: "Tasks and calls you follow",
    channelAbout: "A task you chose to keep in sight, and a call in progress: only where it's at.",
  },
};

export const ambientWords = (tag: LangTag | undefined) => words(AMBIENT_WORDS, tag);
