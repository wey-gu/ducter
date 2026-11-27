// D628: one truth for a PR. When the PR a task handed to a helper merges or closes, the
// hand-off settles by itself (`settled`, why merged/closed, never a reminder), and a task whose
// work was that merged PR and whose only remaining waits are timers is done: its waiters are
// cancelled and it leaves 等结果. Code reads the world's own facts (Ducter's owned look and the
// task's PR records), never the words in a waiter's reason.
import type { HandoffBody } from "@ducter/protocol/src/handoff.ts";
import { prsCarried } from "@ducter/protocol/src/pr-state.ts";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { detect, words, type LangTag } from "@ducter/protocol/src/lang.ts";
import type { CoreRegistry } from "./registry.ts";
import type { Waiters } from "./waiters.ts";
import { kindOf } from "./waiters.ts";

const W = {
  zh: {
    moved: "「{item}」已经合并了，交给「{helper}」的事也用不着了；不用再等它接手。",
    closed: "「{item}」关掉了，交给「{helper}」的事也用不着了；不用再等它接手。",
  },
  en: {
    moved: "{item} is merged, so there is nothing more for {helper} to take; no need to wait for an acknowledgement.",
    closed: "{item} is closed, so there is nothing more for {helper} to take; no need to wait for an acknowledgement.",
  },
} as const;

const NOTE = {
  zh: {
    merged: "「{item}」已经合并了，交给「{helper}」的事也用不着了：用 report_to_main 报 done，不要再等它接手。",
    closed: "「{item}」关掉了，交给「{helper}」的事也用不着了：用 report_to_main 报 done，不要再等它接手。",
  },
  en: {
    merged: "{item} has merged, so there is nothing left for {helper} to take: report done with report_to_main, and never wait for an acknowledgement.",
    closed: "{item} is closed, so there is nothing left for {helper} to take: report done with report_to_main, and never wait for an acknowledgement.",
  },
} as const;

/** D628: the line a task hears when it wakes anyway after its PR ended. */
export function settledHandoffNote(h: HandoffBody, lang: LangTag): string {
  const w = words(NOTE, lang);
  return (h.settledBy === "merged" ? w.merged : w.closed).replaceAll("{item}", h.item.title?.trim() || h.item.ref).replaceAll("{helper}", h.to.name);
}

export interface SettledHandoffs {
  /** One pass now (tests and start). */
  sweep(): void;
  stop(): void;
}

export function createSettledHandoffs(o: {
  log: LogStore;
  handoffs: { all(): HandoffBody[] };
  tasks: CoreRegistry;
  waiters: Waiters;
  onChange?: () => void;
}): SettledHandoffs {
  const done = new Set<string>();
  let stopped = false;

  const sweep = () => {
    if (stopped) return;
    for (const h of o.handoffs.all()) {
      if (h.state !== "settled" || !h.from.task || !h.settledBy) continue;
      if (done.has(h.from.task)) continue;
      const c = o.tasks.get(h.from.task);
      if (!c || c.attention !== "blocked") continue;
      // The hand-off it is waiting on must be its latest: a newer open one keeps the task alive.
      if (c.handoff?.id !== h.handoffId) continue;
      // Its work must be over: no open PR it still carries, and the hand-off's own PR is merged or closed.
      if (prsCarried(c.prs).length) continue;
      const pr = c.prs?.find((p) => p.pr === h.item.ref);
      if (!pr || pr.state === "open") continue;
      // Only waits that cost a model turn (timers): a check or event is a real wait and stays.
      const mine = o.waiters.views().filter((w) => w.taskId === c.taskId && w.state === "armed");
      if (!mine.length || mine.some((w) => kindOf(w) !== "timer")) continue;
      done.add(c.taskId);
      for (const w of mine) o.waiters.cancel(w.waiterId, { by: "system" });
      o.tasks.setState(c.taskId, "done", c.residency);
      const lang = (detect(c.title)?.lang ?? "en") as LangTag;
      const w = words(W, lang);
      const item = h.item.title?.trim() || h.item.ref;
      const text = (h.settledBy === "merged" ? w.moved : w.closed).replaceAll("{item}", item).replaceAll("{helper}", h.to.name);
      o.log.append({ persona: c.persona, stream: `task:${c.taskId}`, origin: "system", kind: "task_event", body: { taskId: c.taskId, role: "system", from: "ducter", text } });
      o.onChange?.();
    }
  };

  const unsubscribe = o.log.subscribe((e) => {
    if (!stopped && (e.kind === "handoff" || e.kind === "owned_news")) queueMicrotask(sweep);
  });
  queueMicrotask(sweep);
  return {
    sweep,
    stop() {
      stopped = true;
      unsubscribe();
    },
  };
}
