// D661 (research/245 §3.3): one state per task, derived once in core from facts, never set by
// a client. This is the one function: every surface reads its result (`OnHandTruth`, and each
// card's `truth`), so the Mac and the web cannot disagree.
//
// The facts it reads are the ones Ducter already keeps: the task's attention (a turn is running or
// a start is queued), its open question (`waitsFor`, a pending decision, a needs_input report), the
// subject card D653 keeps, the Bridge wait D656 keeps, a Keep's held item, the armed waiter, the
// GitHub blindness, the PR a finished task still carries, and the clock. It never asks a model.
//
// `needs_you` is the only state that carries `waitsFor`, one line in the task's own language. A
// task told to wait for the person stays here until the answer is delivered to that task: the line
// is derived from the question's own fact, not from a partner's word that it resumed (task_send
// delivers, and only then does the next turn's state leave this one).
import type { KeepItem, TaskCard, TaskTruth, TruthItem, TruthState, TruthWait, WaiterView } from "@ducter/protocol";
import { prGoesOn, prSaid, type PrSaid } from "@ducter/protocol/src/pr-state.ts";
import { detect, fill, words, type LangTag } from "@ducter/protocol/src/lang.ts";
import { questionFor } from "@ducter/protocol/src/turn-end.ts";

/** D467: a rest with nothing to bring it back is said as stopped after this quiet. */
export const STOPPED_AFTER_MS = 30 * 60_000;
/** D645 B1: a GitHub read no computer can run is a blind wait; after this it needs the person. */
export const BLIND_AFTER_MS = 30 * 60_000;
/** A computer away this long needs someone to turn it on (D157, D467). */
export const DEVICE_AFTER_MS = 30 * 60_000;

const W = {
  zh: {
    stop: "它停下了，没说在等什么。接着做，它从停下的地方接着来。",
    blind: "看不到 GitHub 的状态：{device} 上没有 gh。",
    blindFix: "在 {home} 上读，或在 {device} 上装上 gh。",
    blindNoHome: "在一台有 gh 的电脑上读，或在这台上装上 gh。",
    away: "在等 {device} 连上：它回来就接着做。",
    awayFix: "打开 {device}，它就接着做。",
    asleep: "这台电脑睡着了，它醒来就接着做。",
    bridge: "在等 {who} 回话。",
    limit: "等 {agent} 的额度恢复。",
    ready: "{pr} 可以合并了，等你到 GitHub 上合并。",
    keepReady: "它手上的 {pr} 可以合并了，等你到 GitHub 上合并。",
    keepYou: "它在等你的回答。",
    timer: "在等 {what}。",
    genericWait: "在等它自己回来。",
    nextRound: "下一轮会接着看。",
    stopAgo: "它停下了，没说在等什么。", // when: the row's right edge already says it (D471); never twice
    namedAsk: "「{object}」在等你：{q}",
    askWaiting: "「{title}」在等你回答。",
    callWaiting: "给「{name}」的电话在等你回答。",
    callWaitingAny: "一通电话在等你回答。",
    stopJust: "它刚停下，没说在等什么。",
    keepWait: "「{keep}」在等你回答。",
    callWait: "「{who}」在等你回答。",
    callGeneric: "一通电话在等你回答。",
    pr: {
      checks: "{pr} 的检查还在跑。",
      failing: "{pr} 的检查没过。",
      review: "{pr} 在等评审。",
      changes: "{pr} 有人要求修改。",
      conflict: "{pr} 和 {base} 有冲突。",
      draft: "{pr} 还是草稿。",
      open: "{pr} 还没有新结果。",
    },
  },
  en: {
    stop: "It stopped without saying what it waits for. Continue, and it picks up where it stopped.",
    blind: "Can't see GitHub: there is no gh on {device}.",
    blindFix: "Read it on {home}, or install gh on {device}.",
    blindNoHome: "Read it on a computer that has gh, or install gh here.",
    away: "Waiting for {device} to come back; it carries on then.",
    awayFix: "Turn {device} on and it carries on.",
    asleep: "That computer is asleep; it carries on when it wakes.",
    bridge: "Waiting for {who} to answer.",
    limit: "Waiting for {agent}'s limit to reset.",
    ready: "{pr} is ready to merge; the merge is yours.",
    keepReady: "The {pr} it holds is ready to merge; the merge is yours.",
    keepYou: "It is waiting for your answer.",
    timer: "Waiting for {what}.",
    genericWait: "Waiting for it to come back by itself.",
    nextRound: "The next round will look again.",
    stopAgo: "It stopped without saying what it waits for.",
    namedAsk: "“{object}” is waiting for you: {q}",
    askWaiting: "“{title}” is waiting for your answer.",
    callWaiting: "The call to {name} is waiting for you.",
    callWaitingAny: "A call is waiting for you.",
    stopJust: "It just stopped without saying what it waits for.",
    keepWait: "\"{keep}\" is waiting for your answer.",
    callWait: "The call to {who} is waiting for you.",
    callGeneric: "A call is waiting for you.",
    pr: {
      checks: "{pr}'s checks are still running.",
      failing: "{pr}'s checks failed.",
      review: "{pr} is waiting for a review.",
      changes: "{pr} has changes requested.",
      conflict: "{pr} conflicts with {base}.",
      draft: "{pr} is still a draft.",
      open: "{pr} has no new result yet.",
    },
  },
} as const;

/** The task's own language (its title, then its report), the table's branch. */
function langOf(c: Pick<TaskCard, "title" | "lastReport">): LangTag {
  return (detect(`${c.title} ${c.lastReport?.summary ?? ""}`)?.lang ?? "en") as LangTag;
}

const prShort = (ref: string) => `#${ref.split("#")[1] ?? ref}`;

/** The one line of a PR's current phase, in the task's language. */
function prLine(said: PrSaid, ref: string, lang: LangTag): string {
  const w = words(W, lang);
  const pr = prShort(ref);
  switch (said.phase) {
    case "checks":
      return fill(w.pr.checks, { pr });
    case "failing":
      return fill(w.pr.failing, { pr });
    case "review":
      return fill(w.pr.review, { pr });
    case "changes":
      return fill(w.pr.changes, { pr });
    case "conflict":
      return fill(w.pr.conflict, { pr, base: "base" });
    case "draft":
      return fill(w.pr.draft, { pr });
    case "ready":
      return fill(w.ready, { pr });
    default:
      return fill(w.pr.open, { pr });
  }
}

/** A bare choice with no object is the old template D647 removed. */
const BARE_STOP = /^(这个任务(要)?停下吗[？?]?|要停下吗[？?]?|should (this task|it) stop[？?]?|stop (this task|it)[？?]?)$/i;

/** A question that names its object; a generic one gets the task's title first. */
function namedQuestion(q: string, card: TaskCard, lang: LangTag, keepName?: string): string {
  const s = q.trim();
  if (/#\d+|[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+|「|"|“/.test(s) || s.length > 32) return s;
  const object = keepName?.trim() || card.title;
  return fill(words(W, lang).namedAsk, { object, q: s });
}

/** The fact a stopped task says, never a bare question: how long and that it did not say. */
function stoppedLine(card: TaskCard, now: number, lang: LangTag, w: (typeof W)["zh"] | (typeof W)["en"]): string {
  const at = Date.parse(card.updatedAt || card.openedAt);
  // How long is the row's right edge (D471); the line says only the fact, never the time twice.
  return Number.isFinite(at) && now - at >= 60_000 ? w.stopAgo : w.stopJust;
}

/** What this task's one state is, from its facts. Never a model, never a client. */
export interface TruthInput {
  now: number;
  card: TaskCard;
  /** D645: the armed waiter on it, if any (its reason is the named thing). */
  waiter?: Pick<WaiterView, "reason" | "limit" | "check" | "event" | "nextLookAt" | "at">;
  /** D656: the last message it sent through Bridge that is not answered yet. */
  bridge?: { who?: string };
  /** D653: the subject card's state, one fact (its line is only a fallback for a row's words). */
  subject?: { state: "working" | "waiting" | "done" | "failed"; line?: string };
  /** D511: the Keep's held item, when a Keep holds this task (its "you"/"ready" is a fact). */
  keepItem?: Pick<KeepItem, "at" | "yours" | "pr" | "said">;
  /** D511: the Keep's name, so a generic held-item wait still names its object. */
  keepName?: string;
  /** D473: Ducter is mending it right now: it is at work, not the person's. */
  mending?: boolean;
}

export function truthOf(i: TruthInput): TaskTruth {
  const { card } = i;
  const lang = langOf(card);
  const w = words(W, lang);
  const since = card.turnAt ?? card.updatedAt;
  // D647: a bare「这个任务停下吗？」is not a question any more. It is a stopped task's old
  // template; the row says the fact (how long, and that it did not say) and offers Continue /
  // Put down. A real question that names its object is still a question.
  const asked = questionFor(card)?.trim();
  const waited = card.waitsFor?.trim();
  const ask = asked && !BARE_STOP.test(asked) ? asked : waited && !BARE_STOP.test(waited) ? waited : undefined;

  // D473: a repair under way is work, never a stop.
  if (i.mending) return { state: "working", since };

  // 1. An open question, a person's answer owed: needs_you, with its one named line.
  const later = card.pendingDecision?.later;
  if (ask && !later) return { state: "needs_you", needs: "question", waitsFor: namedQuestion(ask, card, lang, i.keepName), since };

  // 2. A Keep's held item that waits for the person (a PR ready to merge is theirs; D508).
  if (i.keepItem?.at === "you") {
    const yours = i.keepItem.yours?.trim();
    const line = yours && !BARE_STOP.test(yours) ? namedQuestion(yours, card, lang, i.keepName) : i.keepName ? fill(w.keepWait, { keep: i.keepName }) : w.keepYou;
    return { state: "needs_you", needs: "keep", waitsFor: line, since };
  }
  if (i.keepItem?.at === "ready") {
    const ref = i.keepItem.pr;
    const line = ref ? fill(w.keepReady, { pr: prShort(ref) }) : i.keepName ? fill(w.keepWait, { keep: i.keepName }) : w.keepYou;
    return { state: "needs_you", needs: "ready", waitsFor: line, since };
  }

  // 3. D508: a finished task whose PR is open is not done. Ready is the person's; anything else is
  //    a named thing that comes back by itself (CI, a reviewer).
  if (card.attention === "done" || card.attention === "done_claimed") {
    const pr = prGoesOn(card.prs);
    if (pr) {
      const line = prLine(pr.said, pr.pr.pr, lang);
      return pr.stands === "needs"
        ? { state: "needs_you", needs: "ready", waitsFor: line, since }
        : { state: "waiting", wait: { name: line }, since };
    }
    return { state: "done", since };
  }
  if (card.attention === "failed") return { state: "failed", since };
  if (card.attention === "dropped" || card.attention === "superseded") return { state: "stopped", since };

  // 4. A question put off until later: it waits on the clock, then asks again.
  if (ask && later) return { state: "waiting", wait: { name: namedQuestion(ask, card, lang, i.keepName), back: later }, since };

  // 5. A live turn (or a queued start): working. A question above it wins. D661's invariant:
  //    a turn that ended leaves working at once, so `working` needs the live residency `hot` too; a
  //    card left saying working/warm is a rest, and the rest of this function says what it really is.
  if (card.attention === "queued") return { state: "working", since };
  if (card.attention === "working" && card.residency === "hot") return { state: "working", since };

  // 5b. A task in rounds between rounds: the next round is the named thing that comes back.
  if (i.keepItem?.at === "rest" || card.rounds?.nextAt) {
    return { state: "waiting", wait: { name: w.nextRound, ...(card.rounds?.nextAt ? { back: card.rounds.nextAt } : {}) }, since };
  }

  // 6. A named wait that comes back by itself.
  const bridgeWho = i.bridge?.who?.trim();
  if (bridgeWho || i.bridge) return { state: "waiting", wait: { name: fill(w.bridge, { who: bridgeWho || "agent" }) }, since };
  const reason = String(card.reason ?? "");
  if (reason.startsWith("device:asleep:")) return { state: "waiting", wait: { name: w.asleep }, since };
  if (reason.startsWith("device:unreachable:")) {
    const device = reason.slice("device:unreachable:".length) || "";
    const quiet = i.now - Date.parse(card.updatedAt || card.openedAt);
    if (Number.isFinite(quiet) && quiet >= DEVICE_AFTER_MS) return { state: "needs_you", needs: "blind", waitsFor: fill(w.awayFix, { device }), since };
    return { state: "waiting", wait: { name: fill(w.away, { device }) }, since };
  }
  if (i.waiter) {
    const limit = i.waiter.limit as { harness?: string } | undefined;
    if (limit?.harness) return { state: "waiting", wait: { name: fill(w.limit, { agent: limit.harness }) }, since };
    const named = String(i.waiter.reason ?? "").trim();
    if (named) return { state: "waiting", wait: { name: fill(w.timer, { what: named }), back: i.waiter.nextLookAt ?? i.waiter.at }, since };
    return { state: "waiting", wait: { name: w.genericWait }, since };
  }

  // 7. D645 B1: no computer could read GitHub. A blind wait still waits inside its half hour; after
  //    it, it is the person's, with the fix.
  const blind = card.githubBlind;
  if (blind) {
    const quiet = i.now - Date.parse(blind.since);
    const device = blind.device || blind.home || "";
    const fix = blind.home ? fill(w.blindFix, { device, home: blind.home }) : w.blindNoHome;
    const wait = { name: fill(w.blind, { device }), blind: true, fix } satisfies TruthWait;
    if (Number.isFinite(quiet) && quiet >= BLIND_AFTER_MS) return { state: "needs_you", needs: "blind", waitsFor: `${wait.name} ${fix}`.trim(), wait, since };
    return { state: "waiting", wait, since };
  }

  // 8. Blocked with nothing named: a rest. Fresh, it is stopped; after its quiet it is the person's
  //    (D467's 停下了, with 接着做 and 放下). D653's subject line is a fact of the same work and the
  //    task's own words when the card has no question of its own.
  if (card.attention === "needs_you") {
    return { state: "needs_you", needs: "stopped", waitsFor: stoppedLine(card, i.now, lang, w), since };
  }
  if (card.attention === "blocked") {
    const quiet = i.now - Date.parse(card.updatedAt || card.openedAt);
    if (Number.isFinite(quiet) && quiet < STOPPED_AFTER_MS) return { state: "stopped", since };
    return { state: "needs_you", needs: "stopped", waitsFor: stoppedLine(card, i.now, lang, w), since };
  }
  return { state: "stopped", since };
}

export interface TruthItemFacts {
  taskId?: string;
  keepId?: string;
  routineId?: string;
  decisionId?: string;
  askId?: string;
  callId?: string;
  waiterId?: string;
  persona?: string;
  projectKey?: string;
  projectGroup?: "none" | "computer";
  line?: string;
  attrs?: TruthItem["attrs"];
  doneToday?: boolean;
}

/** One OnHandTruth item from a derived state plus which row it is. */
export function truthItem(truth: TaskTruth, facts: TruthItemFacts = {}): TruthItem {
  return { ...truth, ...facts };
}

/**
 * The board's one computed state: every task, a Keep's item, a paused routine, every partner's ask,
 * a live call and a task-less wait, by the one function above. `doneToday` uses the person's day.
 */
export interface OnHandTruthInput {
  now: number;
  /** The person's local day, "YYYY-MM-DD". */
  day: string;
  tasks: TaskCard[];
  keeps?: { id: string; title: string; life: string; pausedWhy?: string; pausedBy?: "user" | "partner" | "system"; routineId?: string; projectKey?: string; items?: Pick<KeepItem, "taskId" | "at" | "yours" | "pr" | "said">[]; persona?: string }[];
  asks?: { persona: string; decisionId: string; question: string; at: string; keepId?: string; routineId?: string; title?: string }[];
  calls?: { callId: string; state: string; persona?: string; since?: string; name?: string }[];
  waiters?: { waiterId: string; taskId?: string; reason?: string; state?: string; persona?: string }[];
  waiterOf?: (taskId: string) => Pick<WaiterView, "reason" | "limit" | "check" | "event" | "nextLookAt" | "at"> | undefined;
  bridgeOf?: (taskId: string) => { who?: string } | undefined;
  subjectOf?: (taskId: string) => { state: "working" | "waiting" | "done" | "failed"; line?: string } | undefined;
  keepItemOf?: (taskId: string) => Pick<KeepItem, "at" | "yours" | "pr" | "said"> | undefined;
  mendingOf?: (taskId: string) => boolean;
  asOf?: number;
  at?: string;
}

const stateBuckets = {
  working: "working",
  needs_you: "needsYou",
  waiting: "waiting",
  stopped: "stopped",
  done: "done",
  failed: "failed",
} as const satisfies Record<TruthState, keyof Omit<OnHandTruthLite, "asOf" | "at">>;

interface OnHandTruthLite {
  needsYou: TruthItem[];
  working: TruthItem[];
  waiting: TruthItem[];
  stopped: TruthItem[];
  done: TruthItem[];
  failed: TruthItem[];
  asOf: number;
  at: string;
}

/** A task counts today by the same rule every surface uses (D310): done on the person's local day. */
function doneToday(at: string | undefined, day: string): boolean {
  if (!at) return true;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return true;
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${dd}` === day;
}

export function onHandTruth(i: OnHandTruthInput): OnHandTruthLite {
  const out: OnHandTruthLite = { needsYou: [], working: [], waiting: [], stopped: [], done: [], failed: [], asOf: i.asOf ?? 0, at: i.at ?? new Date(i.now).toISOString() };
  const keepByTask = new Map<string, { id: string; title: string; item: Pick<KeepItem, "at" | "yours" | "pr" | "said"> }>();
  for (const k of i.keeps ?? []) for (const it of k.items ?? []) keepByTask.set(it.taskId, { id: k.id, title: k.title, item: it });

  for (const c of i.tasks) {
    if (c.imported || c.heldUnder) continue;
    const held = keepByTask.get(c.taskId);
    const t = truthOf({
      now: i.now,
      card: c,
      ...(held ? { keepItem: held.item, keepName: held.title } : {}),
      ...(i.waiterOf?.(c.taskId) ? { waiter: i.waiterOf(c.taskId) } : {}),
      ...(i.bridgeOf?.(c.taskId) ? { bridge: i.bridgeOf(c.taskId) } : {}),
      ...(i.subjectOf?.(c.taskId) ? { subject: i.subjectOf(c.taskId) } : {}),
      ...(i.mendingOf?.(c.taskId) ? { mending: true } : {}),
    });
    const item = truthItem(t, {
      taskId: c.taskId,
      ...(held ? { keepId: held.id } : {}),
      ...(c.projectKey ? { projectKey: c.projectKey } : {}),
      ...(c.projectGroup ? { projectGroup: c.projectGroup } : {}),
      ...(c.gist?.text ? { line: c.gist.text } : {}),
      ...(c.holders?.length ? { attrs: c.holders } : {}),
      ...(t.state === "done" ? { doneToday: doneToday(c.updatedAt, i.day) } : {}),
    });
    out[stateBuckets[t.state]].push(item);
  }

  // D312: another partner's own open question is on On hand too; the home knows every one.
  for (const a of i.asks ?? []) {
    if (out.needsYou.some((x) => x.decisionId === a.decisionId || (a.keepId && x.keepId === a.keepId))) continue;
    const line = a.question?.trim() && !BARE_STOP.test(a.question.trim()) ? a.question.trim() : a.title ? fill(words(W, langOf({ title: a.title })).askWaiting, { title: a.title }) : a.question;
    out.needsYou.push(truthItem({ state: "needs_you", needs: "question", waitsFor: line, since: a.at }, { askId: a.decisionId, decisionId: a.decisionId, persona: a.persona, line, ...(a.keepId ? { keepId: a.keepId } : {}), ...(a.routineId ? { routineId: a.routineId } : {}) }));
  }

  // D650 (B11): a routine Ducter paused needs a decision; its own words are the line. A person's
  // pause is not an ask.
  for (const k of i.keeps ?? []) {
    if (k.life !== "paused" || k.pausedBy === "user" || k.pausedBy === "partner" || !k.pausedWhy) continue;
    if (out.needsYou.some((x) => x.keepId === k.id || (k.routineId && x.routineId === k.routineId))) continue;
    out.needsYou.push(truthItem({ state: "needs_you", needs: "routine", waitsFor: k.pausedWhy, since: undefined }, { keepId: k.id, ...(k.routineId ? { routineId: k.routineId } : {}), line: k.pausedWhy, ...(k.projectKey ? { projectKey: k.projectKey } : {}), ...(k.persona ? { persona: k.persona } : {}) }));
  }

  // A live call is work the person is in; one waiting for Go is the person's.
  for (const c of i.calls ?? []) {
    if (!["waiting", "calling", "talking", "question"].includes(c.state)) continue;
    if (c.state === "question") {
      const line = c.name ? fill(words(W, langOf({ title: c.name })).callWaiting, { name: c.name }) : words(W, langOf({ title: "" })).callWaitingAny;
      out.needsYou.push(truthItem({ state: "needs_you", needs: "question", waitsFor: line, since: c.since }, { callId: c.callId, persona: c.persona }));
    }
    else out.working.push(truthItem({ state: "working", since: c.since }, { callId: c.callId, persona: c.persona }));
  }

  // A wait of no task: it is a named thing that comes back.
  for (const w of i.waiters ?? []) {
    if (w.taskId || w.state !== "armed") continue;
    const reason = String(w.reason ?? "").trim();
    out.waiting.push(truthItem({ state: "waiting", wait: { name: reason || "Waiting for it to come back." } }, { waiterId: w.waiterId, persona: w.persona, line: reason }));
  }

  return out;
}

/** The snapshot's four counts, from the one truth: needs-you, working, waiting, done today. */
export function countsOfTruth(t: Pick<OnHandTruthLite, "needsYou" | "working" | "waiting" | "done">): { needs_you: number; working: number; waiting: number; done_today: number } {
  return {
    needs_you: t.needsYou.length,
    working: t.working.length,
    waiting: t.waiting.length,
    done_today: t.done.filter((x) => x.doneToday !== false).length,
  };
}
