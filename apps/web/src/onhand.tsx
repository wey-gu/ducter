// On hand as a workspace (D216): one list on every screen. The phone, the side pane beside the
// conversation, the whole screen and the rail beside an opened task all draw the same rows, and
// only the room changes. A row says what the task is on now in words (its latest step, what it
// waits for, its question, its result), and on a repo task its branch, +/−, and a draft PR or a
// merge. Density grows with use: the find field from ten tasks, by project from two projects,
// keys and selection only where a keyboard and a pointer are.
import { copyKeyTitle } from "./autofill.tsx";
import { cantClause } from "./cant.tsx";
import type { ComponentChildren } from "preact";
import { memo } from "preact/compat";
import { useDwell, useResting } from "./alive.tsx";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { KeepPageView, KeepSheetCard, K, keepOfTask, openKeep } from "./keep.tsx";
import { still } from "./nav.ts";
import { wideNow } from "./fold.ts";
import { bgRunning, callEnded, helperGlance, looseMatch, type Bodies, type HelperWork, type LogEvent, type Place, type ProjectChange, type TruthAttr, type TruthItem } from "@ducter/protocol";
import { blocksOf, type Block } from "@ducter/protocol/src/transcript.ts";
import { sayable, proofLabel } from "@ducter/protocol/src/say.ts";
import { A, type Wear } from "./app.ts";
import type { TableLang } from "./i18n.ts";
import { Btn, Chev, Facts, Field, MoreButton, Seg, TaskLink } from "./controls.tsx";
import { Menu, MenuHead, MenuItem, MenuSep } from "./menu.tsx";
import { openPast } from "./past.tsx";
import { openDid } from "./did.tsx";
import { ago, clock, day, harnessName, spoken, when } from "./format.ts";
import { CallRow } from "./phone.tsx";
import { attention, canIntegrate, cantOf, endable, finished, harnessOf, headlineEvidence, LANE, placeOf, projectGroupOf, projectNameOf, projectOf, reasonOf, reportOf, title, type Task } from "./store.ts";
import { liveRow, liveWords, rowWords, shortTitle, StepMark, taskBlocks } from "./transcript.tsx";
import { computerName, deviceWait, manyComputers } from "./where.ts";
import { Avatar, DecisionCard, stateLabel } from "./views.tsx";
import { BrandMark } from "./brand.tsx";
import { askFold, SourceChip, TF, TodoCard, todoCounts, TodoFold, todoGroupName, TS } from "./todos.tsx";
import { openPile, PileBlock, pileTaken } from "./pile.tsx";
import { openHand } from "./handover.tsx";
import type { PileView } from "@ducter/protocol";
import { HandBlock } from "./handover.tsx";
import { Goal, Groove, limitAt, limitState, untilLine, WaitBubble, waitCaption, waitLine } from "./work.tsx";
import { handover, isNewResult, lookedAt, statusOf, urgentOf, type Status } from "./seen.ts";
import { figArt, OtherAsk, PartnerMark } from "./partners.tsx";
import { boardGroups, finishedGroup, foldedRows, groupCount, markOf, type BoardGroup, type MemberRow } from "./groups-view.ts";
import { linesOfPart } from "./asks.tsx";

import { AwayX, FinishedActs, finishedMenu, runFinished, useSwipeAway, type Finished } from "./away.tsx";
import { echoes, ensureSteps, firstSentence, lastStepAt, Outcome, outcomeOf, PeekPicture, peekSaid, peekTask, QUIET_STEP_MS, saidOf, StuckActs, stuckClause, stuckOf, turnStart, useTick } from "./onhand-brief.tsx";
import { healthLine, rhythm, RepeatGlyph, reviewLine } from "./past.tsx";
import { hasPR, PrLine, prFacts, prPhaseWords, prRowOf, prWords } from "./onhand-pr.tsx";
import { prOf } from "@ducter/protocol/src/pr-state.ts";
import { ListBoard, BoardViews, LIST_FROM, listRows, listTasks, readMode, truthState, writeMode, type BulkAsk } from "./onhand-list.tsx";
import { cutAtWord } from "@ducter/protocol";
import { DEFAULT_PARTNER } from "@ducter/protocol/src/partners.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** Where the list is drawn: the phone's page, the pane beside the conversation, the whole screen,
 *  or the rail beside a task opened at the whole screen. */
export type Room = "phone" | "side" | "full" | "rail";

// ---------- what a row says ----------

const isStep = (b: Bodies["task_event"]) => b.role === "tool" || (b.role === "assistant" && (!!b.text?.trim() || !!b.thinking?.length));

/** The task's latest step or words: the newest one this client holds, else the card's (D216). */
export function latestOf(task: Task): LogEvent | undefined {
  let held: LogEvent | undefined;
  for (let i = task.events.length - 1; i >= 0; i--) {
    const e = task.events[i]!;
    if (e.kind === "task_event" && isStep(e.body as Bodies["task_event"])) {
      held = e;
      break;
    }
  }
  const card = task.card?.latest;
  return held && (!card || held.seq >= card.seq) ? held : card;
}

const stepCache = new WeakMap<LogEvent, Block[]>();
/** What a working task is on now: the mark of its latest step and the step in words (the
 *  transcript's own words, D210), or the agent's latest words. */
export function nowLine(task: Task): { mark: string; words: string; code: string; bad?: boolean } | undefined {
  const ev = latestOf(task);
  if (!ev) return undefined;
  let blocks = stepCache.get(ev);
  if (!blocks) stepCache.set(ev, (blocks = blocksOf(harnessOf(task), [ev], true)));
  const b = blocks.at(-1);
  if (b?.k === "voice") return { mark: "", words: b.text.split("\n")[0]!, code: "" };
  if (b?.k !== "steps") return undefined;
  const l = b.lines.at(-1);
  if (!l) return undefined;
  if (l.k === "group") return { mark: l.rows.at(-1)!.step?.kind ?? "other", words: liveWords(blocks), code: "" };
  const [words, code] = b.live ? liveRow(l.row) : rowWords(l.row);
  const bad = l.row.outcome === "error";
  return { mark: bad ? "error" : (l.row.step?.kind ?? "thought"), words, code, bad };
}

/** D633: the line that settled an outside thing, when it is the task's last step: its row and
 *  head say this, not the report it wrote before the thing ended. */
export function settledLine(task: Task): string | undefined {
  const b = task.card?.latest?.body;
  const raw = b?.raw as { settled?: { text?: string } } | undefined;
  return b?.role === "system" && raw?.settled?.text ? raw.settled.text : undefined;
}

/** The second line of a row: what it is on, waits for, asks, or came to. */
export function storyOf(task: Task): { mark?: string; words: string; code?: string; tone?: "needs" | "failed" | "said" } {
  const a = attention(task);
  const r = reportOf(task);
  // D661 (research/245 §3.3 rule 4): core's one person-language line for the latest report;
  // the raw report is shown only behind 它说 / It said when no gist exists yet.
  const gist = task.card?.gist?.text?.trim();
  // D645 (research/245 §3.7, B1): no computer could read GitHub for it; after its quiet the
  // row says so, with the fix (install gh there, or read it on the home).
  const blind = task.card?.githubBlind;
  if (blind && (a === "blocked" || a === "working" || a === "queued") && Date.now() - Date.parse(blind.since) >= 30 * 60_000)
    return { words: t("onhand.github.blind", blind.device || blind.home || "", blind.home || blind.device || "") };
  if (a === "needs_you") {
    const d = A.S.pendingDecision(task.id);
    // D539: a copy card says what it copies where, in the reader's words. D661 turn 2: the one
    // truth's line wins — a stopped task says its fact and its own choices, never a bare question;
    // a real question names its object.
    const q = (d?.copyKey ? copyKeyTitle(d) : "") || task.card?.truth?.waitsFor || d?.question || r?.questions?.[0]?.text || gist || (r?.summary ? sayable(r.summary, A.readerLang(task)) : "");
    return { words: q || stateLabel(a), tone: "needs" };
  }
  if (a === "blocked") {
    // D661 turn 2: a stopped task that needs the person says its fact (how long, and that it did
    // not say), never the old bare question; its Continue / Put down are the row's own choices.
    if (task.card?.truth?.needs === "stopped" && task.card.truth.waitsFor) return { words: task.card.truth.waitsFor, tone: "needs" };
    // D382: a question put off: when it asks again, and what.
    const later = A.S.pendingDecision(task.id);
    if (later?.later) return { words: t("later.row", soon(later.later), later.said || later.question) };
    // D261: a wait always says what it waits for: its waiter, the state's reason, what the task
    // last reported, or that it stopped without saying (true, and worth a look).
    const w = A.S.waiterFor(task.id);
    // D297: whose limit it waits for, in the viewer's own words.
    if (w?.limit) return { words: t("limit.line", harnessName(w.limit.harness)) };
    if (w?.reason?.trim()) return { words: waitLine(w.reason) };
    const why = reasonOf(task);
    if (why && !why.startsWith("report:") && !why.endsWith("by user")) return { words: deviceWait(why) ?? why };
    // D656: a wait set while the task was still at work has no reason on its state yet; the
    // message it sent is the fact that says who it waits on.
    const sent = A.S.bridgeWaitFor(task.id);
    if (sent) return { words: t("onhand.wait.agent", sent.to || sent.agent || "") };
    const said = r?.summary?.trim() ? sayable(r.summary.trim().split("\n")[0], A.readerLang(task)) : "";
    if (gist) return { words: gist };
    return said ? { words: t("onhand.said", said), tone: "said" } : { words: t("onhand.wait.unsaid") };
  }
  if (a === "working" || a === "queued") {
    const u = A.S.untilOf(task);
    if (u) return { words: untilLine(u) };
    // D498 (D152): what it is on, in a sentence: this turn's latest line of saidOf (its own words, or
    // the steps it took without words as one gist), never a bare command; a step that didn't work
    // keeps the quiet ink (it went on). Before this turn holds a step: the turn's start in words.
    const said = saidOf(task, turnStart(task)).at(-1);
    if (said) return { mark: said.bad ? "error" : said.k === "voice" ? "" : said.k, words: said.words };
    // No live step yet: the last report's gist is the person-language line (never a raw summary here).
    if (gist) return { words: gist };
    return { words: task.card?.turnAt && task.events.some((e) => e.kind === "task_event") ? t("onhand.turn.fresh") : stateLabel(a) };
  }
  // D633: the last word about it was the outside thing ending: its row says that, not the
  // report written while it still waited.
  const settled = settledLine(task);
  if (settled) return { words: settled };
  const failed = a === "failed";
  // D472: a task that couldn't start says why in its row too (the page's own words, cant.tsx).
  const cant = failed ? cantOf(task) : undefined;
  if (cant) return { words: cantClause(cant), tone: "failed" };
  if (gist) return { words: gist, ...(failed ? { tone: "failed" as const } : {}) };
  const ev = r && !failed ? headlineEvidence(task.evidence.length ? task.evidence : r.evidence) : undefined;
  const first = r ? sayable(r.summary.split("\n")[0], A.readerLang(task)) : undefined;
  // The report's own words are the task's, not the partner's: 它说 / It said, in the muted ink.
  if (first) return { words: t("onhand.said", first), tone: "said" };
  return { words: (ev && proofLabel(ev, A.readerLang(task))) || stateLabel(a), ...(failed ? { tone: "failed" as const } : {}) };
}

/** How long it has been at it ("12 分钟"), or when it last changed ("3 分钟前"). */
function timeOf(task: Task, now = Date.now()): string {
  const a = attention(task);
  if (a === "working" || a === "queued") {
    const at = turnStart(task); // D498 (D210): this turn's time, never since the task opened
    if (!Number.isFinite(at)) return "";
    const m = Math.max(0, Math.floor((now - at) / 60_000));
    return m < 1 ? t("time.now") : m < 60 ? t("time.min", m) : t("time.hour", Math.floor(m / 60));
  }
  return ago(A.L, task.card?.updatedAt, now);
}

/** A repo task's draft PR or merge from Ducter, in a word. */
function prWord(task: Task): string {
  // D508: once Ducter watches its PR, the PR says it: 已合并 when merged; nothing while open (the
  // row's line says where it is).
  const own = prOf(task.card?.prs);
  if (own) return own.state === "merged" ? t("onhand.pr.merged") : "";
  const i = task.card?.integrated;
  if (task.acted?.ok && task.acted.action === "merge") return t("onhand.pr.merged");
  if (task.acted?.ok && task.acted.action === "open_pr") return t("onhand.pr.draft");
  return i ? t(i.act === "merge" ? "onhand.pr.merged" : "onhand.pr.draft") : "";
}

// ---------- D261: quiet waits, the next look, the project lens ----------

/** A wait nothing has changed on for a day folds away under the fresh ones. */
export const QUIET_MS = 24 * 3600_000;
export function quietWait(task: Task, now = Date.now()): boolean {
  if (attention(task) !== "blocked" || !task.card?.updatedAt) return false;
  let at = Date.parse(task.card.updatedAt);
  const w = A.S.waiterFor(task.id);
  if (w?.changes && w.lastLookAt) at = Math.max(at, Date.parse(w.lastLookAt));
  return Number.isFinite(at) && now - at >= QUIET_MS;
}

/** D467: how long a wait with nothing to bring it back may sit before it is the person's to look at. */
export const STOPPED_AFTER = 30 * 60_000;
/** When a task last changed: its card's time or its newest event's, whichever is later. */
function lastChange(task: Task): number {
  const at = Math.max(Date.parse(task.card?.updatedAt ?? "") || 0, Date.parse(task.events.at(-1)?.ts ?? "") || 0);
  return at || NaN;
}
/** D467: a wait nothing will bring back on its own (no waiter of any kind, no question asked for
 *  later, not a computer that will wake): it stopped, and it is the person's to look at. It stands
 *  in 等你 with 接着做 and 放下, never under 在等. */
export function stoppedWait(task: Task, now = Date.now()): boolean {
  if (attention(task) !== "blocked") return false;
  if (A.S.pendingDecision(task.id)?.later || A.S.waiterFor(task.id)) return false;
  // D467 round 4: a computer that said it was going to sleep comes back by itself; one that went
  // away without a word needs someone to turn it on, once it has been away a while.
  if (reasonOf(task).startsWith("device:asleep:")) return false;
  // D656: a task that asked another agent and waits for its answer has something that will
  // bring it back (the answer arrives into the task): not a stop, even after half an hour.
  if (A.S.bridgeWaitFor(task.id)) return false;
  const at = lastChange(task);
  return Number.isFinite(at) && now - at >= STOPPED_AFTER;
}
/** D539: a group's part as its row reads it: a wait that stopped with nothing to bring it back is
 *  the person's (等你), never 在等, the same as the task's own row (stoppedWait). */
function memberAttention(id: string) {
  const t = A.S.tasks.get(id);
  if (!t) return undefined;
  return stoppedWait(t) ? "needs_you" : attention(t);
}
/** D467: finished on today's local date, done (or done and being checked): 今天做完 lists these. */
export function doneToday(task: Task, now = Date.now()): boolean {
  const a = attention(task);
  if (a !== "done" && a !== "done_claimed") return false;
  const at = lastChange(task);
  return Number.isFinite(at) && new Date(at).toDateString() === new Date(now).toDateString();
}
/** D467: a lens's tasks by where On hand stands them: the stopped waits and the failed ones go to
 *  等你; 在等 keeps the rest; 今天做完 is today only, what finished before folds under it. */
export function boardParts(lanes: Task[][], now = Date.now()) {
  const waiting = lanes[LANE.waiting]!;
  const done = lanes[LANE.done]!;
  // D473, D471: what Ducter is mending right now is at work, never the person's yet.
  const mending = [...done, ...waiting].filter((x) => !!mendingOf(x));
  // D517: a stop, a failure or a PR to merge the person has opened since it last changed leaves 等你:
  // the stop waits with the rest, the failure stands with what finished on its day, the PR waits.
  const stopped = waiting.filter((x) => stoppedWait(x, now) && !mending.includes(x) && !looked(x));
  const failed = done.filter((x) => attention(x) === "failed" && !mending.includes(x) && !looked(x));
  const seenFailed = done.filter((x) => attention(x) === "failed" && !mending.includes(x) && looked(x));
  const onToday = (x: Task) => {
    const at = lastChange(x);
    return !Number.isFinite(at) || new Date(at).toDateString() === new Date(now).toDateString();
  };
  // D508: a finished task whose PR is open is not done: ready to merge stands in 等你 (the merge is
  // the person's), any other open phase waits in 在等; only merged or closed is done.
  const pr = (x: Task) => (mending.includes(x) ? undefined : prRowOf(x)?.stands);
  const ready = done.filter((x) => pr(x) === "needs" && !looked(x));
  const prWait = done.filter((x) => pr(x) === "waiting" || (pr(x) === "needs" && looked(x)));
  const today = [...done.filter((x) => doneToday(x, now) && !pr(x)), ...seenFailed.filter(onToday)];
  const earlier = [...done.filter((x) => attention(x) !== "failed" && !doneToday(x, now) && !pr(x)), ...seenFailed.filter((x) => !onToday(x))];
  return { stopped, ready, failed, mending, waiting: [...waiting.filter((x) => !stopped.includes(x) && !mending.includes(x)), ...prWait], today, earlier };
}

/** D517: a stop, a failure or a PR to merge the person opened on this device after it last changed. A
 *  question is never "looked": it leaves 等你 when it is answered. */
export function looked(task: Task): boolean {
  return attention(task) !== "needs_you" && lookedAt(task.id, task.card?.updatedAt);
}

/** D517: a task that stands in 等你: it asks, or (until looked at) it stopped, didn't work out, or its
 *  PR can merge. Ducter mending it is at work, not the person's yet. */
export function waitsForYou(x: Task, now = Date.now()): boolean {
  const a = attention(x);
  if (a === "needs_you") return true;
  if (mendingOf(x) || looked(x)) return false;
  return a === "failed" || stoppedWait(x, now) || prRowOf(x)?.stands === "needs";
}

/** D517: where a group card stands: 等你 when a part waits for the person, else its parts' first lane. */
export function groupLaneOf(lanes: Task[][]) {
  return (id: string) => {
    const at = lanes.findIndex((l) => l.some((x) => x.id === id));
    const task = at >= 0 ? A.S.tasks.get(id) : undefined;
    return task && waitsForYou(task) ? LANE.needs : at;
  };
}

/** D517: the person's one count's items, from one source: the Dock and app badge, the conversation's
 *  line, a partner's number in the list of partners and On hand's head all count these, and On hand
 *  draws each of them under 等你. A lens counts its tasks; all (and Other) the questions of no task too. */
export function needsYouItems(lens = "", now = Date.now()): NeedItem[] {
  const truth = A.S.onHand?.truth;
  if (truth) {
    // D661 (research/245 §3.3): core's needs-you list is the one answer. Never add an item it
    // does not hold: the strip, the Dock badge and the rows must name the same work.
    const items = truthInLens(truth.needsYou, lens);
    const out: NeedItem[] = [];
    const inLine = new Set<string>();
    const taskIds = new Set(items.flatMap((i) => (i.taskId ? [i.taskId] : [])));
    // A stopped line counts once: a group with a part in needs-you is its own card, and its parts
    // stand aside (D385, D517).
    for (const g of boardGroups(A.S.onHand?.groups?.filter((x) => !A.S.awayNow.has(x.id)), groupLaneOf(lensLanes(lens)), (id) => memberAttention(id))) {
      if (![...g.ids].some((id) => taskIds.has(id))) continue;
      for (const id of g.ids) inLine.add(id);
      const first = [...g.ids].map((id) => A.S.tasks.get(id)).find(Boolean);
      out.push({ partner: first ? A.taskPartner(first) : DEFAULT_PARTNER, key: `g:${g.g.id}`, groupId: g.g.id });
    }
    for (const it of items) {
      if (it.taskId && inLine.has(it.taskId)) continue;
      const task = it.taskId ? A.S.tasks.get(it.taskId) : undefined;
      const partner = task ? A.taskPartner(task) : it.persona || DEFAULT_PARTNER;
      if (it.taskId) out.push({ partner, key: `t:${it.taskId}`, taskId: it.taskId });
      else if (it.keepId) out.push({ partner, key: `k:${it.keepId}`, keepId: it.keepId });
      else if (it.routineId) out.push({ partner, key: `r:${it.routineId}`, routineId: it.routineId });
      else if (it.askId) out.push({ partner, key: `a:${it.askId}`, askId: it.askId });
      else if (it.decisionId) out.push({ partner, key: `d:${it.decisionId}`, decisionId: it.decisionId });
      else if (it.callId) out.push({ partner, key: `c:${it.callId}`, callId: it.callId });
      else if (it.waiterId) out.push({ partner, key: `w:${it.waiterId}`, waiterId: it.waiterId });
    }
    return out;
  }
  const l = lensLanes(lens);
  const parts = boardParts(l, now);
  const out: NeedItem[] = [];
  const inLine = new Set<string>();
  for (const g of boardGroups(A.S.onHand?.groups?.filter((x) => !A.S.awayNow.has(x.id)), groupLaneOf(l), (id) => memberAttention(id))) {
    if (!g.stopped) continue;
    for (const id of g.ids) inLine.add(id);
    const first = [...g.ids].map((id) => A.S.tasks.get(id)).find(Boolean);
    out.push({ partner: first ? A.taskPartner(first) : DEFAULT_PARTNER, key: `g:${g.g.id}`, groupId: g.g.id });
  }
  for (const x of [...l[LANE.needs]!, ...parts.stopped, ...parts.ready, ...parts.failed]) {
    if (attention(x) === "failed" && inLine.has(x.id)) continue; // a part of a stopped line is the line's
    out.push({ partner: A.taskPartner(x), key: `t:${x.id}`, taskId: x.id });
  }
  if (looseIn(lens)) {
    const shown = A.S.persona || A.partnerShown || DEFAULT_PARTNER;
    for (const d of A.S.partnerDecisions()) out.push({ partner: shown, key: `d:${d.decisionId}`, decisionId: d.decisionId });
    for (const a of A.otherAsks()) out.push({ partner: a.persona, key: `a:${a.decisionId}`, askId: a.decisionId });
  }
  return out;
}

/** D535: one item of the person's one count, and where it lives: a stopped line, a task, the
 *  partner's own question (its card in the conversation), another partner's (On hand's 等你), a
 *  Keep's item or a paused routine. */
export type NeedItem = { partner: string; key: string; taskId?: string; groupId?: string; keepId?: string; routineId?: string; decisionId?: string; askId?: string; callId?: string; waiterId?: string };

/** D473, D471: a failure or a stop Ducter is mending right now: its newest event is a repair under
 *  way (not the partner's rethink, which may still ask the person). Said on its row in the words
 *  the task's steps use ("第一次没开起来，我又开了一次"). */
export function mendingOf(task: Task): Pick<Bodies["mend"], "cls" | "how" | "name"> | undefined {
  const a = attention(task);
  if (a !== "failed" && a !== "blocked") return undefined;
  // What streamed since the card first; else the home's word on the card (a client that just connected).
  for (let i = task.events.length - 1; i >= 0; i--) {
    const e = task.events[i]!;
    if (e.kind === "task_state" || e.kind === "report") return undefined;
    if (e.kind === "mend") {
      const b = e.body as Bodies["mend"];
      return b.state === "going" && b.rung !== "rethink" ? b : undefined;
    }
  }
  return task.card?.mending;
}

/** D473: a repair under way, in the words of the task's steps. */
export function mendWords(b: Pick<Bodies["mend"], "cls" | "how" | "name">): string {
  if (b.cls === "stall") return t("note.mend_stall");
  return t(`note.mend_${b.how ?? "reopen"}`, b.name ?? "");
}

/** A time of day, with its day only when it isn't today. */
export function soon(iso: string, now = Date.now()): string {
  return day(A.L, iso, now) === day(A.L, new Date(now).toISOString(), now) ? clock(iso) : when(A.L, iso, now);
}

/** When a wait looks again (or goes on), in words, and how far along that interval it is (the
 *  small ring); "" when it doesn't look on its own. The waiter's own times, never a model. */
export function waitNext(w: ReturnType<typeof A.S.waiterFor>, now = Date.now()): { text: string; frac: number } {
  if (!w) return { text: "", frac: 0 };
  if (w.limit) {
    const at = Date.parse(w.at ?? ""), from = Date.parse(w.armedAt ?? "");
    return { text: limitState(w, now), frac: Number.isFinite(at) && Number.isFinite(from) && at > from ? Math.min(1, Math.max(0, (now - from) / (at - from))) : 0 };
  }
  if (w.check || w.event) {
    const next = Date.parse(w.nextLookAt ?? "");
    if (!Number.isFinite(next) || next <= now) return { text: "", frac: 0 };
    const last = Date.parse(w.lastLookAt ?? w.armedAt ?? "");
    const frac = Number.isFinite(last) && next > last ? (now - last) / (next - last) : 0;
    return { text: t("onhand.wait.next", soon(w.nextLookAt!, now)), frac };
  }
  const at = Date.parse(w.at ?? "");
  if (Number.isFinite(at) && at > now) {
    const from = Date.parse(w.armedAt ?? "");
    return { text: t("onhand.wait.at", soon(w.at!, now)), frac: Number.isFinite(from) && at > from ? (now - from) / (at - from) : 0 };
  }
  return { text: "", frac: 0 };
}

/** D498 (D427, D394): a task in rounds between rounds, each its own fact (D291): paused; else its
 *  health when it isn't on time; else a review's standing; else the last round's own line. */
export function roundsLine(r: NonNullable<NonNullable<Task["card"]>["rounds"]>): string[] {
  if (r.paused) return [t("og.paused")];
  if (r.health) return healthLine(r.health);
  if (r.reviews) return reviewLine(r.reviews);
  const l = r.last;
  if (l) return [l.line || t(`og.run.${l.state}`)];
  return [];
}

/** D498: a task in rounds at its right edge: this round's time while one runs, else when the next
 *  one comes (or that it is paused). */
export function roundsBeat(task: Task, r: NonNullable<NonNullable<Task["card"]>["rounds"]>, running: boolean, now = Date.now()): string {
  if (running) return timeOf(task, now) === t("time.now") ? t("onhand.rounds.started") : t("onhand.rounds.now", timeOf(task, now));
  if (r.paused) return t("onhand.rounds.paused");
  return r.nextAt && Date.parse(r.nextAt) > now ? t("onhand.rounds.next", soon(r.nextAt, now)) : "";
}

/** What comes next for a waiting task, in one line, for the opened task's head: when it comes back,
 *  or, with nothing to come back for, when it last moved (D291: one thought, not two joined). */
export function taskNext(task: Task, now = Date.now()): string {
  if (attention(task) !== "blocked") return "";
  const s = waitNext(A.S.waiterFor(task.id), now).text || (quietWait(task, now) ? t("onhand.wait.since", ago(A.L, task.card?.updatedAt, now)) : "");
  return !A.L.style.cased || !s ? s : s[0]!.toUpperCase() + s.slice(1);
}

/** D297: waiting tasks on the same agent's limit, two or more, as one group (the earliest wait first). */
export function groupLimits(tasks: Task[]): { harness: string; tasks: Task[]; w: NonNullable<ReturnType<typeof A.S.waiterFor>> }[] {
  const by = new Map<string, { harness: string; tasks: Task[]; w: NonNullable<ReturnType<typeof A.S.waiterFor>> }>();
  for (const x of tasks) {
    const w = A.S.waiterFor(x.id);
    if (!w?.limit) continue;
    const g = by.get(w.limit.harness) ?? { harness: w.limit.harness, tasks: [], w };
    g.tasks.push(x);
    // The group says the account's reset: a known one over a next try.
    if (w.limit.resetKnown && !g.w.limit?.resetKnown) g.w = w;
    by.set(w.limit.harness, g);
  }
  return [...by.values()].filter((g) => g.tasks.length >= 2);
}

/** D297: one account's limit, one line over its tasks: the small ring toward the reset, whose limit
 *  and when, and that they carry on together. Each task stays its own row under it. */
function LimitGroup({ g, room }: { g: ReturnType<typeof groupLimits>[number]; room: Room }) {
  const next = waitNext(g.w);
  const at = limitAt(g.w);
  const name = harnessName(g.harness);
  return (
    <div class="limit-group" role="group" aria-label={g.w.limit?.resetKnown && at ? t("limit.group", name, soon(at)) : t("limit.group.unknown", name)}>
      <p class="limit-head">
        <Ring frac={next.frac} />
        <span class="w">{g.w.limit?.resetKnown && at ? t("limit.group", name, soon(at)) : t("limit.group.unknown", name)}</span>
        <span class="n">{t("limit.group.n", g.tasks.length)}</span>
      </p>
      <Rows tasks={g.tasks} room={room} cards />
    </div>
  );
}

/** A small ring: how far along a wait's interval is. */
const Ring = ({ frac }: { frac: number }) => {
  const f = Math.max(0, Math.min(1, frac));
  const a = f * 2 * Math.PI;
  const x = 6 + 3.6 * Math.sin(a), y = 6 - 3.6 * Math.cos(a);
  return (
    <svg class="wring" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
      <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0.5" />
      {f >= 0.999 ? <circle cx="6" cy="6" r="3.6" class="fill" /> : f > 0 && <path class="fill" d={`M6 6V2.4A3.6 3.6 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`} />}
    </svg>
  );
};

/**
 * D654 (research/245 §3.2): the lens key a task is under, read from core's card. A repository
 * is one project however many folders and computers it has; a folder with no remote is its own.
 * A task of no project stands under 不在项目里 / Not in a project, or 电脑上的事 / On your computers
 * when it is an errand or machine set-up.
 */
export const OTHER = "~";
export const COMPUTERS = "~computers";
export const lensOf = (task: Task) => projectOf(task) || (projectGroupOf(task) === "computer" ? COMPUTERS : OTHER);
export const lensName = (key: string) =>
  key === OTHER ? t("onhand.other") : key === COMPUTERS ? t("onhand.computers") : (A.S.onHand?.projectList?.find((p) => p.key === key)?.name ?? key);

const LENS = "ducter.onhand.lens";
export function readLens(): string {
  try {
    return localStorage.getItem(LENS) ?? "";
  } catch {
    return "";
  }
}
export function setLens(key: string) {
  try {
    if (key) localStorage.setItem(LENS, key);
    else localStorage.removeItem(LENS);
  } catch {}
  L.focus = "";
  L.walked = false;
  A.changed();
}

export type LensGroup = { key: string; name: string; place?: Place; tasks: Task[]; where?: string[]; pinned?: boolean; order?: number; hidden?: boolean; aliases?: string[] };
/**
 * The board's projects, in core's order (`OnHand.projectList`: pinned, then the person's drag order,
 * else what needs the person first and the most recent activity). The names and flags come from core;
 * nothing here reads a folder name.
 */
export function lensGroups(): LensGroup[] {
  const b = A.S.board();
  const plist = A.S.onHand?.projectList ?? [];
  const byKey = new Map(plist.map((p) => [p.key, p]));
  const out: LensGroup[] = [];
  const at = new Map<string, number>();
  let other: LensGroup | undefined;
  let computers: LensGroup | undefined;
  for (const lane of b.lanes.slice(0, 4))
    for (const task of lane) {
      const k = lensOf(task);
      if (k === OTHER || k === COMPUTERS) {
        const g = k === OTHER ? (other ??= { key: OTHER, name: t("onhand.other"), tasks: [] }) : (computers ??= { key: COMPUTERS, name: t("onhand.computers"), tasks: [] });
        g.tasks.push(task);
        continue;
      }
      let i = at.get(k);
      if (i === undefined) {
        const p = byKey.get(k);
        at.set(k, (i = out.push({ key: k, name: p?.name || projectNameOf(task) || k, tasks: [] }) - 1));
      }
      const g = out[i]!;
      const pl = placeOf(task);
      if (!g.place && (pl.kind === "repo" || pl.kind === "folder")) g.place = pl;
      g.tasks.push(task);
    }
  // A folder added by hand shows before its first task; a project with no task and no add is no row.
  for (const p of plist) {
    if (at.has(p.key) || !p.added) continue;
    at.set(p.key, out.push({ key: p.key, name: p.name, place: p.place, tasks: [] }) - 1);
  }
  // D471: a project is a place work lives. One whose every task never started there (its folder
  // missing on that computer) is not one yet: its tasks stand under All, where their fix is.
  for (let i = out.length - 1; i >= 0; i--) {
    const g = out[i]!;
    if (g.tasks.length && g.tasks.every((x) => attention(x) === "failed" && !!cantOf(x))) out.splice(i, 1);
  }
  // D654: where it lives (one repo on many computers is one project) and how it was set.
  for (const g of out) {
    const p = byKey.get(g.key);
    if (p) {
      g.pinned = p.pinned;
      g.order = p.order;
      g.hidden = p.hidden;
      g.aliases = p.aliases;
      if (manyComputers() && p.devices?.length) g.where = p.devices;
    }
    if (!g.where && manyComputers()) {
      const ids: string[] = [];
      const add = (pl: Place) => {
        if (pl.kind !== "repo" && pl.kind !== "folder") return;
        const id = A.placeComputer(pl);
        if (!ids.includes(id)) ids.push(id);
      };
      for (const x of g.tasks) add(placeOf(x));
      // An older home sends the folders added by hand without keys: their places still count.
      for (const p of A.S.onHand?.projects ?? []) if ((p.key || p.name) === g.key) add(p.place);
      const home = (A.devices ?? []).find((d) => d.home)?.id;
      ids.sort((a, b) => Number(b === home || b === "local") - Number(a === home || a === "local"));
      g.where = ids.map((id) => computerName(id));
    }
  }
  const needsHere = (g: LensGroup) => g.tasks.some((x) => attention(x) === "needs_you" || attention(x) === "failed" || stoppedWait(x));
  // The person hid this project: its tasks still count under All and needs-you; it shows again the
  // moment something there needs the person.
  const shown = out.filter((g) => !g.hidden || needsHere(g));
  // D654: core sends the order (pinned, the person's drag order, else needs-you then the most
  // recent activity). An older home has no projectList: keep its urgency order.
  if (plist.length) {
    const at = new Map(plist.map((p, i) => [p.key, i]));
    shown.sort((a, b) => (at.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (at.get(b.key) ?? Number.MAX_SAFE_INTEGER));
  }
  if (other) shown.push(other);
  if (computers) shown.push(computers);
  return shown;
}
/** D341: where the board's bound tasks come from: a filter over any project, never a project row. */
export type SourceGroup = { key: string; name: string; kind: string; tasks: Task[] };
export function sourceGroups(): SourceGroup[] {
  const out = new Map<string, SourceGroup>();
  for (const lane of A.S.board().lanes.slice(0, 4))
    for (const task of lane) {
      const s = task.card?.source;
      if (!s) continue;
      const key = `src:${s.source}`;
      let g = out.get(key);
      if (!g) {
        const v = TS.frame?.sources.find((x) => x.id === s.source);
        out.set(key, (g = { key, name: s.kind === "github" ? "GitHub" : (v?.name ?? "Obsidian"), kind: s.kind, tasks: [] }));
      }
      g.tasks.push(task);
    }
  return [...out.values()];
}
/** Offered from two groups (one project with errands beside it is already two kinds of work). */
export const lensOn = (groups: LensGroup[]) => groups.length >= 2;
/** The lens kept on this device, if that project is still there; else all. */
export function currentLens(groups: LensGroup[]): string {
  const k = readLens();
  return k && lensOn(groups) && groups.some((g) => g.key === k) ? k : "";
}
/** The lanes narrowed to the lens and the 来自 / From filter (a source is a filter, never a lens). */
export const lensLanes = (lens: string): Task[][] =>
  A.S.board()
    .lanes.slice(0, 4)
    .map((l) => l.filter((x) => (!lens || lensOf(x) === lens) && (!L.source || `src:${x.card?.source?.source ?? ""}` === L.source)));
/** Only all, and the two no-project lenses, hold what belongs to no task: the partner's own asks,
 *  task-less waits, calls. */
export const looseIn = (lens: string) => !lens || lens === OTHER;
/** D661 (research/245 §3.3): the snapshot's lists narrowed to a lens. "" is all; a project by
 *  its key; D654's two no-project lenses keep their own: Computers is the errands and machine
 *  set-ups (projectGroup "computer"), Other is everything else with no key. */
export function truthInLens(items: TruthItem[], lens: string): TruthItem[] {
  if (!lens) return items;
  if (lens === COMPUTERS) return items.filter((i) => !i.projectKey && i.projectGroup === "computer");
  if (lens === OTHER) return items.filter((i) => !i.projectKey && i.projectGroup !== "computer");
  return items.filter((i) => i.projectKey === lens);
}

/** D654: a project name is one line, cut in the middle when too long (the start and the end
 *  stay), the whole in the tooltip and the ⋯ menu's head. Measured, never a guess at a width. */
function MidName({ text, class: cls }: { text: string; class?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(text);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const width = el.clientWidth;
      if (!width) return;
      const cs = getComputedStyle(el);
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return;
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      if (ctx.measureText(text).width <= width) {
        setShown(text);
        return;
      }
      const ell = "…";
      // A hyphenated name keeps its first and last part: nowledge-…-website.
      const parts = text.split("-");
      if (parts.length > 2) {
        // nowledge-labs-website keeps its first and last part; the column has the room for it.
        setShown(`${parts[0]}-${ell}-${parts[parts.length - 1]}`);
        return;
      }
      let lo = 0;
      let hi = Math.max(0, text.length - 1);
      let best = 0;
      while (lo <= hi) {
        const n = (lo + hi) >> 1;
        const left = Math.ceil(n / 2);
        const right = Math.floor(n / 2);
        const s = text.slice(0, left) + ell + (right ? text.slice(text.length - right) : "");
        if (ctx.measureText(s).width <= width) {
          best = n;
          lo = n + 1;
        } else hi = n - 1;
      }
      const left = Math.ceil(best / 2);
      const right = Math.floor(best / 2);
      setShown(best > 2 ? text.slice(0, left) + ell + (right ? text.slice(text.length - right) : "") : text.slice(0, 1) + ell);
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : undefined;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [text]);
  return (
    <b ref={ref} class={cls} title={text}>
      {shown}
    </b>
  );
}

/** D654: a project row's computers on one line, each its own element (D291), what fits then
 *  +N; the whole list is in the row's accessible label. Never a wrapped or cut line. */
function WhereLine({ where }: { where: string[] }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [state, setState] = useState<{ shown: string[]; rest: number }>({ shown: where, rest: 0 });
  const key = where.join("|");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const width = el.clientWidth;
      const ctx = document.createElement("canvas").getContext("2d");
      if (!width || !ctx) {
        setState({ shown: where, rest: 0 });
        return;
      }
      const cs = getComputedStyle(el);
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      let used = 0;
      let n = 0;
      for (const w of where) {
        const add = ctx.measureText(w).width + (n ? 8 : 0);
        if (n > 0 && used + add > width) break;
        used += add;
        n++;
      }
      setState({ shown: where.slice(0, n), rest: where.length - n });
    };
    fit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : undefined;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [key]);
  if (!where.length) return null;
  return (
    <span ref={ref} class="where" aria-hidden="true">
      {state.shown.map((w) => (
        <i key={w}>{w}</i>
      ))}
      {state.rest > 0 && <i class="more">+{state.rest}</i>}
    </span>
  );
}

function LensEntry({ k, name, tasks, on, tab, brand, where, hidden, pinned, renamed, aliases }: { k: string; name: string; tasks: Task[]; on: boolean; tab?: boolean; brand?: string; where?: string[]; hidden?: boolean; pinned?: boolean; renamed?: boolean; aliases?: string[] }) {
  const [open, setOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const statuses = tasks.map((x) => statusOf(x.id, attention(x), x.card?.updatedAt));
  // D467 round 3: the face only where something there needs you (a question, a stopped wait, a
  // task that didn't work out); otherwise the name and the count (D69: art must mean something).
  // D471: no line counts (a sum of branches says nothing about a project) and no faces (six flags
  // in a column say nothing either): the count, in the needs-you ink where something there needs you.
  const needsHere = tasks.some((x) => attention(x) === "needs_you" || attention(x) === "failed" || stoppedWait(x));
  const counts = foldCounts(statuses);
  const project = k !== "" && k !== OTHER && k !== COMPUTERS;
  const change = (c: ProjectChange) => A.send({ t: "project_change", change: c });
  const saveName = () => {
    if (renaming !== null && k) change({ act: "rename", key: k, name: renaming.trim() });
    setRenaming(null);
  };
  const row = (
    <button
      class={`lens-row${on ? " on" : ""}${needsHere ? " needs" : ""}${k === OTHER || k === COMPUTERS ? " other" : ""}${project ? " has-menu" : ""}${k && A.arrived && [name, k].some((x) => x.toLowerCase() === A.arrived!.name.toLowerCase()) ? " arrived" : ""}`}
      aria-pressed={on}
      aria-label={spoken(A.L, name, ...(where?.length ? [t("onhand.where", where.join(t("onhand.where.and")))] : []), counts)}
      title={counts || undefined}
      draggable={!tab && project}
      onDragStart={(e: DragEvent) => {
        if (!project) return;
        dragging = k;
        e.dataTransfer?.setData("text/plain", k);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e: DragEvent) => {
        if (!project || !dragging || dragging === k) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e: DragEvent) => {
        if (!project || !dragging || dragging === k) return;
        e.preventDefault();
        reorderProjects(dragging, k);
        dragging = "";
      }}
      onClick={() => setLens(k)}
    >
      <span class="nm">
        {/* The mark sits on the name's line, never above it (.nm stacks the name over its stat). */}
        <span class="nm-line">
          {brand && <BrandMark name={brand} size={14} />}
          <MidName text={name} class="proj-name" />
        </span>
        {/* D455: where it lives, each computer its own word (D291), in up to two lines. */}
        {!tab && where && where.length > 0 && <WhereLine where={where} />}
      </span>
      {!tab && <span class={`n${needsHere ? " needs" : ""}`}>{tasks.length || ""}</span>}
    </button>
  );
  if (tab || !project) return row;
  return (
    <div class="lens-item">
      {renaming !== null ? (
        <div class="lens-rename">
          <Field value={renaming} label={t("onhand.project.rename")} placeholder={t("onhand.project.rename.ph")} autoFocus onInput={setRenaming} onKeyDown={(e) => (e.key === "Enter" ? saveName() : e.key === "Escape" ? setRenaming(null) : undefined)} />
        </div>
      ) : (
        row
      )}
      <span class="lens-more">
        <MoreButton label={t("onhand.project.menu", name)} open={open} onClick={() => (setOpen(!open), setMerging(false))} />
      </span>
      {open && (
        <Menu class="lens-menu" label={t("onhand.project.menu", name)} onClose={() => setOpen(false)}>
          {merging ? (
            <>
              <MenuItem class="dmenu-head" onClick={() => {}}>{t("onhand.project.merge.title", name)}</MenuItem>
              {lensGroups()
                .filter((g) => g.key !== k && g.key !== OTHER && g.key !== COMPUTERS)
                .map((g) => (
                  <MenuItem key={g.key} onClick={() => (change({ act: "merge", key: k, into: g.key }), setMerging(false), setOpen(false))}>
                    {g.name}
                  </MenuItem>
                ))}
              <MenuSep />
              <MenuItem onClick={() => setMerging(false)}>{t("onhand.project.back")}</MenuItem>
            </>
          ) : (
            <>
              <MenuHead>{name}</MenuHead>
              <MenuItem onClick={() => (setOpen(false), setRenaming(name))}>{t("onhand.project.rename")}</MenuItem>
              {renamed && <MenuItem onClick={() => (change({ act: "rename", key: k, name: "" }), setOpen(false))}>{t("onhand.project.rename.undo")}</MenuItem>}
              <MenuItem onClick={() => setMerging(true)}>{t("onhand.project.merge")}</MenuItem>
              {aliases && aliases.length > 0 && <MenuItem onClick={() => (change({ act: "unmerge", key: k }), setOpen(false))}>{t("onhand.project.unmerge")}</MenuItem>}
              <MenuSep />
              <MenuItem onClick={() => (change({ act: "pin", key: k, pinned: !pinned }), setOpen(false))}>{pinned ? t("onhand.project.unpin") : t("onhand.project.pin")}</MenuItem>
              <MenuItem onClick={() => (change({ act: "hide", key: k, hidden: !hidden }), setOpen(false))}>{hidden ? t("onhand.project.show") : t("onhand.project.hide")}</MenuItem>
            </>
          )}
        </Menu>
      )}
    </div>
  );
}

/** A drag on a project row keeps the person's order (on the home, so every device sees it). */
let dragging = "";
function reorderProjects(from: string, to: string) {
  const keys = lensGroups()
    .filter((g) => g.key !== OTHER && g.key !== COMPUTERS)
    .map((g) => g.key);
  const a = keys.indexOf(from);
  const b = keys.indexOf(to);
  if (a < 0 || b < 0 || a === b) return;
  keys.splice(a, 1);
  keys.splice(b, 0, from);
  A.send({ t: "project_change", change: { act: "order", keys } });
}

/** D341: 来自 / From is a filter over any project, never a row in the project column. */
export function SourceChips() {
  const groups = sourceGroups();
  if (!groups.length) return null;
  return (
    <div class="src-chips" role="group" aria-label={t("todos.lens")}>
      <small class="src-h">{t("todos.lens")}</small>
      {groups.map((g) => (
        <button key={g.key} class={`src-chip${L.source === g.key ? " on" : ""}`} aria-pressed={L.source === g.key} onClick={() => ((L.source = L.source === g.key ? "" : g.key), A.changed())}>
          <BrandMark name={g.kind} size={13} />
          <span>{g.name}</span>
        </button>
      ))}
    </div>
  );
}

/** The lens beside the board (wide): All, each project, Other; then Add a folder. */
export function LensColumn() {
  const groups = lensGroups();
  if (!lensOn(groups)) return null;
  const lens = currentLens(groups);
  return (
    <nav class="lens-col" aria-label={t("onhand.lens")}>
      <LensEntry k="" name={t("onhand.lens.all")} tasks={lensLanes("").flat()} on={!lens} />
      <span class="gap" />
      {groups.map((g) => (
        <LensEntry key={g.key} k={g.key} name={g.name} tasks={g.tasks} on={lens === g.key} where={g.where} hidden={g.hidden} pinned={g.pinned} renamed={pinnedOf(g.key)?.renamed} aliases={g.aliases} />
      ))}
      {/* D-PENDING (research/245 §3.5): the saved views, under the projects. */}
      <BoardViews tasks={lensLanes("").flat()} />
      {/* D455: a folder on any computer of the home, looked through by that computer. */}
      {A.ntBrowsable().length > 0 && (
        <button class="lens-add" type="button" title={t("addfolder.about")} onClick={() => A.openAddFolder()}>
          ＋ {t("onhand.addfolder")}
        </button>
      )}
    </nav>
  );
}

/** The lens where there is no room for the column: one row of names that never wraps. What does
 *  not fit goes into the one 更多 / More menu (D654, research/245 §3.2). */
export function LensTabs({ inBoard }: { inBoard?: boolean }) {
  const [more, setMore] = useState(false);
  const [avail, setAvail] = useState(0);
  const nav = useRef<HTMLElement>(null);
  const groups = lensGroups();
  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return;
    const measure = () => setAvail(el.clientWidth);
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : undefined;
    ro?.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [groups.length, inBoard]);
  if (!lensOn(groups)) return null;
  const lens = currentLens(groups);
  const all = lensLanes("").flat();
  // One row, never a wrap: a tab's room from its longest real string, the row's own width. What
  // does not fit goes in 更多 / More.
  const width = typeof window === "undefined" ? 390 : window.innerWidth;
  const budget = Math.max(190, (avail || width) - 8);
  const roomFor = (name: string) => 30 + [...name].reduce((n, ch) => n + (/[\u3000-\u9fff]/.test(ch) ? 15 : 8.6), 0);
  let used = roomFor(t("onhand.lens.all"));
  const shown: LensGroup[] = [];
  const folded: LensGroup[] = [];
  for (const g of groups) {
    const w = roomFor(g.name) + (g.tasks.length ? 12 : 0);
    if (shown.length === 0 || used + w <= budget) {
      used += w;
      shown.push(g);
    } else folded.push(g);
  }
  const moreW = folded.length ? 54 : 0;
  while (folded.length && used + moreW > budget + 30) {
    const last = shown.pop();
    if (!last) break;
    used -= roomFor(last.name) + (last.tasks.length ? 12 : 0);
    folded.unshift(last);
  }
  return (
    <nav ref={nav} class={`lens-tabs${inBoard ? " in-board" : ""}`} aria-label={t("onhand.lens")}>
      <LensEntry k="" name={t("onhand.lens.all")} tasks={all} on={!lens} tab />
      {shown.map((g) => (
        <LensEntry key={g.key} k={g.key} name={g.name} tasks={g.tasks} on={lens === g.key} tab />
      ))}
      {folded.length > 0 && (
        <span class="lens-more-tab">
          <Btn kind="text" size="sm" class="lens-more-btn" label={t("onhand.more")} onClick={() => setMore(!more)} />
          {more && (
            <Menu class="lens-menu" label={t("onhand.lens")} onClose={() => setMore(false)}>
              {folded.map((g) => (
                <MenuItem key={g.key} onClick={() => (setLens(g.key), setMore(false))}>
                  {g.name}
                </MenuItem>
              ))}
            </Menu>
          )}
        </span>
      )}
      {/* D455: a folder on any computer of the home, at the end of the row. */}
      {A.ntBrowsable().length > 0 && (
        <button class="lens-add tab" type="button" aria-label={t("onhand.addfolder")} title={t("addfolder.about")} onClick={() => A.openAddFolder()}>
          ＋
        </button>
      )}
    </nav>
  );
}

/** The core's project row for a key (its renamed flag), from the home's list. */
function pinnedOf(key: string) {
  return A.S.onHand?.projectList?.find((p) => p.key === key);
}

/** The strip's four counts in a lens: needs you, working, waiting, done today (D310). */
export function stateCounts(lens: string, now = Date.now()): number[] {
  const truth = A.S.onHand?.truth;
  if (truth) {
    // D661 (research/245 §3.3): the snapshot's own lists, never a second derivation. For "" the
    // four are exactly its counts, so the web can never disagree with the Dock or the Mac.
    return [
      truthInLens(truth.needsYou, lens).length,
      truthInLens(truth.working, lens).length,
      truthInLens(truth.waiting, lens).length,
      truthInLens(truth.done, lens).filter((x) => x.doneToday !== false).length,
    ];
  }
  const l = lensLanes(lens);
  const parts = boardParts(l, now);
  const loose = looseIn(lens);
  const calls = loose ? (A.S.onHand?.calls ?? []) : [];
  return [
    // D467, D517: 等你 is the person's one count's items (needsYouItems): the badges say the same.
    needsYouItems(lens, now).length,
    l[1]!.length + parts.mending.length + calls.filter((c) => ["waiting", "calling", "talking", "question"].includes(c.state)).length,
    parts.waiting.length + (loose ? A.S.armedWaiters().filter((w) => !w.taskId).length : 0),
    // D467: 今天做完 counts what it lists: finished today (a done being checked included); a failed
    // task stands in 等你, yesterday's folds away, a missed wait and an ended call say their own words.
    parts.today.length,
  ];
}

// ---------- D287: the partner at the head of the board ----------

/** When the soonest of a lens's waits comes back on its own (ms), and how many have gone quiet. */
function waitsAhead(lens: string, now = Date.now()): { first: number; quiet: number } {
  let first = Infinity;
  let quiet = 0;
  const at = (iso?: string) => {
    const x = Date.parse(iso ?? "");
    if (Number.isFinite(x) && x > now && x < first) first = x;
  };
  for (const task of lensLanes(lens)[LANE.waiting]!) {
    if (stoppedWait(task, now)) continue; // D467: it stands in 等你, never "back at"
    if (quietWait(task, now)) {
      quiet++;
      continue;
    }
    const w = A.S.waiterFor(task.id);
    if (w) at(w.check || w.event ? w.nextLookAt : w.at);
  }
  if (looseIn(lens)) for (const w of A.S.armedWaiters().filter((w) => !w.taskId)) at(w.check || w.event ? w.nextLookAt : w.at);
  return { first, quiet };
}

/** The partner's one sentence over the board, in its own voice and only from what is there (never a
 *  model): whether anything needs you, then what works, what waits and when the first comes back,
 *  and what got done today. "现在没有待你处理的。4 个在等：最早 22:40 回来，2 个一天多没有动静；今天做完 1 个。" */
export function headSay(lens: string, n = stateCounts(lens), now = Date.now()): string {
  const p = SAY_MARKS[A.L.lang];
  const first = n[0] ? (n[0] === 1 ? t("onhand.say.needs.one") : t("onhand.say.needs", n[0])) : t("onhand.say.none");
  const parts: string[] = [];
  if (n[1]) parts.push(t("onhand.say.working", n[1]));
  if (n[2]) {
    const w = waitsAhead(lens, now);
    const more = [Number.isFinite(w.first) ? (n[2] === 1 ? t("onhand.wait.next", soon(new Date(w.first).toISOString(), now)) : t("onhand.say.first", soon(new Date(w.first).toISOString(), now))) : "", w.quiet ? (w.quiet >= n[2] ? t("onhand.say.quiet.all") : t("onhand.say.quiet", w.quiet)) : ""].filter(Boolean);
    parts.push(t("onhand.say.waiting", n[2]) + (more.length ? p.colon + more.join(p.comma) : ""));
  }
  if (n[3]) parts.push(t("onhand.say.done", n[3]));
  if (!parts.length) return first;
  const rest = parts.join(p.semi) + p.stop;
  return `${first}${A.L.style.spaced ? " " : ""}${A.L.style.cased ? rest[0]!.toUpperCase() + rest.slice(1) : rest}`;
}

/** On hand's own line under the partner (D315): one short sentence in its voice that says what the
 *  strip can't, whether anything needs you and, when nothing does, what comes next. The counts are
 *  the strip's; the full sentence (headSay) stays the bar's. The Mac's headLine says the same. */
export function headLine(lens: string, n = stateCounts(lens), now = Date.now()): string {
  const truth = A.S.onHand?.truth;
  if (truth) {
    // D661 turn 2: a stopped task that is now needs-you counts in its stopped list, so a board of
    // only stops says so; a real question leads.
    const stoppedNeeds = truthInLens(truth.needsYou, lens).filter((x) => x.needs === "stopped").length;
    // Only needs-you items are in n[0]; the stopped/failed lists stand apart from it, so they
    // must not be added to its halted count (a fresh stop is not the person's yet).
    const halted = stoppedNeeds;
    if (n[0] && n[0] > halted) return n[0] === 1 ? t("onhand.say.needs.one") : t("onhand.say.needs", n[0]);
    if (n[0]) return n[0] === 1 ? t("onhand.line.stopped.one") : t("onhand.line.stopped", n[0]);
  } else {
    // D467: the line is true to the body: what only stopped is said as stopped, never "nothing needs you".
    const parts = boardParts(lensLanes(lens), now);
    const halted = Math.min(n[0]!, parts.stopped.length + parts.failed.length);
    if (n[0] && n[0] > halted) return n[0] === 1 ? t("onhand.say.needs.one") : t("onhand.say.needs", n[0]);
    if (n[0]) return n[0] === 1 ? t("onhand.line.stopped.one") : t("onhand.line.stopped", n[0]);
  }
  if (n[1]) return t("onhand.line.working");
  if (n[2]) {
    const w = waitsAhead(lens, now);
    if (!Number.isFinite(w.first)) return t("onhand.line.quiet");
    const at = soon(new Date(w.first).toISOString(), now);
    return n[2] - w.quiet <= 1 ? t("onhand.line.one", at) : t("onhand.line.first", at);
  }
  return n[3] ? t("onhand.line.done") : t("onhand.line.idle");
}

/** The head sentence's marks, per language (D292). */
const SAY_MARKS: Record<TableLang, { colon: string; comma: string; semi: string; stop: string }> = {
  zh: { colon: "：", comma: "，", semi: "；", stop: "。" },
  en: { colon: ": ", comma: ", ", semi: "; ", stop: "." },
};

/** How the partner looks over the whole: its flag when something needs you, reading while anything
 *  works, on its bench while all of it waits, smiling when all that is left came back done. */
export function moodOf(n: number[]): "needsyou" | "working" | "waiting" | "done" | "idle" {
  return n[0] ? "needsyou" : n[1] ? "working" : n[2] ? "waiting" : n[3] ? "done" : "idle";
}

/** The board's head (D287): the partner, its face saying how the whole stands, and its one sentence;
 *  under it the strip of four counts (each one a filter; pressed again, or Esc, lets go), Find from
 *  ten tasks, New task here under a project. */
function BoardTop({ lens, groups, findable, room, mode, onMode, showMode }: { lens: string; groups: LensGroup[]; findable: boolean; room: Room; mode?: "overview" | "list"; onMode?: (m: "overview" | "list") => void; showMode?: boolean }) {
  const n = stateCounts(lens);
  L.filter = 0; // D467: no strip, so no filter; Find and the lens narrow
  const g = groups.find((x) => x.key === lens && x.key !== OTHER && x.key !== COMPUTERS);
  const mood = moodOf(n);
  // D471: the partner's one sentence over the board, and nothing more: every task is said once, by
  // its own row below (the brief's lines named tasks the rows named again, and disagreed with them).
  return (
    <div class="board-top">
      <div class={`oh-head oh-brief m-${mood}`}>
        <span class="oh-face">
          <Avatar size={room === "full" ? 88 : 56} state={mood} />
        </span>
        <div class="oh-says">
          <p class="oh-say" aria-live="polite">
            {headLine(lens, n)}
          </p>
        </div>
      </div>
      <SourceChips />
      {(g || findable) && (
        <div class="strip-row">
          {/* D457: a project with nothing yet (one just added) says its first step in words. */}
          {g && !g.tasks.length && <Btn kind="secondary" size="sm" class="proj-first" label={t("onhand.project.start", g.name)} onClick={() => A.openNewTask(g.place && g.place.kind !== "none" ? g.place : { kind: "none" })} />}
          {g && g.tasks.length > 0 && (
            <button class="plus" aria-label={`${t("onhand.newhere")} ${g.name}`} title={t("onhand.newhere")} onClick={() => A.openNewTask(g.place && g.place.kind !== "none" ? g.place : { kind: "none" })}>
              <PlusSm />
            </button>
          )}
          <span class="grow" />
          {/* D-PENDING (research/245 §3.5): one board, two ways to look: offered from eight tasks on,
              kept per device, never the default by itself. */}
          {showMode && mode && onMode && <Seg label={t("onhand.view.label")} value={mode} options={[{ v: "overview", label: t("onhand.overview") }, { v: "list", label: t("onhand.list") }]} onPick={onMode} />}
          {findable && <Find />}
        </div>
      )}
    </div>
  );
}

/** What a row is matched against by Find and the switcher. */
export function haystack(task: Task): string {
  const p = placeOf(task);
  return [title(task), projectOf(task), p.kind === "repo" ? `${p.repoPath} ${p.branch ?? ""}` : p.kind === "folder" ? p.path : "", harnessName(harnessOf(task)), p.kind !== "none" ? computerName(p.device) : "", storyOf(task).words].join(" ").toLowerCase();
}

/** Every word typed is in it as typed (any order); "" matches all. */
export function matchesExactly(task: Task, q: string): boolean {
  const hay = haystack(task);
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

/** Every word typed is somewhere in it (any order), or one slip away, or the title's initials (D456); "" matches all. */
export function matches(task: Task, q: string): boolean {
  const hay = haystack(task);
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => looseMatch(w, hay, title(task)));
}

// ---------- the keys, the focus and the selection ----------

/** The list's state that outlives a render: the row the keys are on, what is selected, Find. */
export const L = { walked: false, focus: "", sel: new Set<string>(), anchor: "", find: "", order: [] as string[], dropAsk: false, filter: 0, quietOn: false, showProj: false, usual: "", groupAsk: null as string | null, source: "", /** D-PENDING (research/245 §3.5): the view this device chose, its filter and sort. */ mode: readMode() as "overview" | "list", tfilter: {} as import("@ducter/protocol").TaskFilter, sort: "urgency" as import("@ducter/protocol").TaskSort, pickOp: "" as "" | "move" | "reassign", gPending: 0 };

/** D661 (research/245 §3.3 rule 5): who else holds the outside thing, in words: a task's
 *  agent on its computer ("Mac 上的 Antigravity" / "Antigravity on Mac"), a Keep by its name, a
 *  hand-off by who it went to. */
function holderWho(h: TruthAttr): string {
  if (h.role === "handoff") return h.to?.trim() || h.keep?.trim() || "";
  if (h.keep?.trim()) return h.keep.trim();
  // A task holder may name only its task: its card still says which agent on which computer.
  const held = h.taskId ? A.S.tasks.get(h.taskId) : undefined;
  const harnessId = h.harness || (held ? harnessOf(held) : "");
  const device = h.device || (held ? (placeOf(held) as { device?: string }).device : undefined);
  const harness = harnessId ? harnessName(harnessId) : "";
  if (!harness) return device ? computerName(device) : "";
  return device ? t("onhand.holder.on", computerName(device), harness) : harness;
}

/** D661: each holder its own fact (never a " · " join). */
export function holderFacts(task: Task): string[] {
  return (task.card?.holders ?? []).map((h) => {
    const who = holderWho(h);
    if (!who) return "";
    if (h.role === "author") return t("onhand.holder.author", who);
    if (h.role === "review") return t("onhand.holder.review", who);
    return t("onhand.holder.handoff", who);
  });
}

/** D315: where a card says its task is, each its own element (D291): its project when the board
 *  shows them all, never 其他 / Other, which says nothing; its computer only when it isn't the one
 *  most of the board runs on (the usual needs no saying on every card). The Mac's whereMeta. */
export function whereMeta(task: Task): string[] {
  const p = placeOf(task);
  const k = lensOf(task);
  // D507: a helper's task anywhere but under its helper (beside an opened task, in Find, done after
  // its PR merged) says whose it is.
  // D511: so does a Keep's task anywhere but under its Keep (a question in 等你, Find, the rail).
  const helper = NESTED.has(task.id) ? "" : (task.card?.keep?.name ?? task.card?.helper?.name ?? "");
  return [
    L.showProj && k !== OTHER && k !== COMPUTERS ? lensName(k) : "",
    manyComputers() && p.kind !== "none" && p.device && p.device !== L.usual ? computerName(p.device) : "",
    helper,
    ...holderFacts(task),
  ].filter(Boolean);
}

/** D521: a running task's one quiet fact: how many of its agent's jobs still run in the background. */
export function bgFact(task: Task): string[] {
  const a = attention(task);
  const n = bgRunning(task.card?.background);
  return n > 0 && !finished(task) && a !== "dropped" && a !== "superseded" ? [t("bg.onhand", n)] : [];
}

/** D507: the tasks the board draws under their helper right now (so their rows don't name it again). */
let NESTED = new Set<string>();

/** The computer most of these tasks run on. */
export function usualComputer(tasks: Task[]): string {
  const n = new Map<string, number>();
  let best = "";
  for (const x of tasks) {
    const p = placeOf(x);
    if (p.kind === "none" || !p.device) continue;
    n.set(p.device, (n.get(p.device) ?? 0) + 1);
    if (n.get(p.device)! > (n.get(best) ?? 0)) best = p.device;
  }
  return best;
}

const typing = () => {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);
};

function move(by: number, open: boolean, shift = false) {
  const o = L.order;
  if (!o.length) return;
  const i = o.indexOf(L.focus);
  const next = o[i < 0 ? (by > 0 ? 0 : o.length - 1) : Math.max(0, Math.min(o.length - 1, i + by))]!;
  if (shift && A.listMode && !open) {
    if (!L.anchor) L.anchor = L.focus;
    if (L.anchor) extend(next);
    L.focus = next;
    A.changed();
    requestAnimationFrame(() => document.querySelector(`[data-row="${CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest" }));
    return;
  }
  L.focus = next;
  L.walked = true; // D471: the peek follows what the keys moved to
  if (open) A.go({ name: "task", id: next, full: A.route.name !== "conv" && !!A.route.full });
  else A.changed();
  requestAnimationFrame(() => document.querySelector(`[data-row="${CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest" }));
}

/** D244: the next (1) or the previous (-1) task, opened in place: the rail's order when it is
 *  drawn (or On hand's), else the board's own by state. */
/** D456: the order the keys walk tasks in: On hand's own list as shown, else its lanes (needs you,
 *  working, waiting, done today). The header's 3 / 9 and ⌃1–⌃9 count in it too. */
export function walkOrder(cur = A.route.name === "task" ? A.route.id : L.focus): string[] {
  if (L.order.includes(cur) || (!cur && L.order.length)) return L.order;
  const b = A.S.board();
  return [b.lanes[LANE.needs]!, b.lanes[LANE.working]!, b.lanes[LANE.waiting]!, b.lanes[LANE.done]!].flat().map((x) => x.id);
}

function goWalk(next: string) {
  const r = A.route;
  L.focus = next;
  A.go({ name: "task", id: next, full: r.name !== "conv" && !!r.full });
  requestAnimationFrame(() => document.querySelector(`[data-row="${CSS.escape(next)}"]`)?.scrollIntoView({ block: "nearest" }));
}

export function walk(by: number) {
  const r = A.route;
  const cur = r.name === "task" ? r.id : L.focus;
  const o = walkOrder(cur);
  if (!o.length) return;
  const i = o.indexOf(cur);
  const next = o[i < 0 ? (by > 0 ? 0 : o.length - 1) : Math.max(0, Math.min(o.length - 1, i + by))]!;
  if (next === cur) return;
  goWalk(next);
}

/** D456: ⌃1–⌃9 open the first to ninth task of On hand, from anywhere (the composer included). */
export function nthKey(e: KeyboardEvent) {
  if (!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || A.sheet || A.live) return;
  const n = /^Digit([1-9])$/.exec(e.code)?.[1];
  if (!n) return;
  const id = walkOrder("")[Number(n) - 1];
  if (!id) return;
  e.preventDefault();
  if (A.route.name !== "task" || A.route.id !== id) goWalk(id);
}
A.walk = walk;

/** ⌘⇧] / ⌘⇧[ (Ctrl elsewhere), from anywhere, the composer included (Lody's keys). */
export function walkKey(e: KeyboardEvent) {
  if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.altKey || A.sheet || A.live) return;
  const by = e.code === "BracketRight" || e.key === "}" || e.key === "]" ? 1 : e.code === "BracketLeft" || e.key === "{" || e.key === "[" ? -1 : 0;
  if (!by || A.route.name !== "task") return;
  e.preventDefault();
  walk(by);
}

function toggle(id: string) {
  if (L.sel.has(id)) L.sel.delete(id);
  else L.sel.add(id);
  L.anchor = id;
  L.dropAsk = false;
  A.changed();
}

function extend(id: string) {
  const o = L.order;
  const a = o.indexOf(L.anchor || L.focus);
  const b = o.indexOf(id);
  if (a < 0 || b < 0) return toggle(id);
  for (const x of o.slice(Math.min(a, b), Math.max(a, b) + 1)) L.sel.add(x);
  L.dropAsk = false;
  A.changed();
}

/** The rows a list key acts on: the selection, else the row the keys are on. */
function keyIDs(): string[] {
  return L.sel.size ? [...L.sel] : L.focus ? [L.focus] : [];
}

/** e / p / ⌘⌫: act on the selection (or the focused row), then let go of it. */
function selectAct(op: "end" | "pause" | "drop") {
  const ids = keyIDs();
  if (!ids.length) return;
  A.bulk(ids, op);
  L.sel.clear();
  A.changed();
}

/** m / a: move or reassign needs a choice, so the bar opens it (the focused row joins the selection). */
function pickAct(op: "move" | "reassign") {
  const ids = keyIDs();
  if (!ids.length) return;
  if (!L.sel.size) L.sel.add(L.focus);
  L.pickOp = op;
  A.changed();
}

/** j/k (or the arrows) walk the list, Enter opens, x selects, / finds, Esc lets go first. In the
 *  rail beside an opened task, j/k open the next one. */
function useKeys(room: Room) {
  useEffect(() => {
    if (room === "phone") return;
    const k = (e: KeyboardEvent) => {
      if (A.sheet || A.live || e.defaultPrevented) return;
      // D325: the locator's card has its own keys (the arrows move its choice).
      if ((e.target as Element | null)?.closest?.(".locator")) return;
      const rail = room === "rail";
      const list = !!A.listMode && room === "full" && !rail;
      const mod = e.metaKey || e.ctrlKey;
      // D-PENDING (research/245 §3.5): ⌘1 概览 / ⌘2 列表 on the board (the toggle's own keys). The
      // conversation keeps Esc and the breadcrumb; elsewhere the app's ⌘1 / ⌘2 are untouched.
      if (list && mod && !e.altKey && (e.code === "Digit1" || e.code === "Digit2")) {
        e.preventDefault();
        const m = e.code === "Digit1" ? "overview" : "list";
        if (L.mode !== m) (L.mode = m), writeMode(m), A.changed();
        return;
      }
      if (list && mod && !e.altKey && e.code === "KeyA") {
        e.preventDefault();
        L.sel.clear();
        for (const id of L.order) L.sel.add(id);
        L.anchor = L.order[0] ?? "";
        A.changed();
        return;
      }
      if (list && mod && !e.altKey && e.code === "Backspace") {
        e.preventDefault();
        selectAct("drop");
        return;
      }
      if (list && mod && !e.altKey && e.code === "KeyK") {
        e.preventDefault();
        document.querySelector<HTMLElement>(".sel-bar .btn")?.focus();
        return;
      }
      if (mod || e.altKey) return;
      if (e.key === "/" && !typing()) {
        const f = document.getElementById("onhand-find");
        if (f) return void (e.preventDefault(), f.focus());
      }
      if (typing()) return;
      if (list) {
        if (e.key === "x" && L.focus) return void (e.preventDefault(), toggle(L.focus));
        if (e.key === "f") {
          e.preventDefault();
          document.querySelector<HTMLElement>(".filter-chip")?.focus();
          return;
        }
        if (e.key === "e") return void (e.preventDefault(), selectAct("end"));
        if (e.key === "p") return void (e.preventDefault(), selectAct("pause"));
        if (e.key === "m") return void (e.preventDefault(), pickAct("move"));
        if (e.key === "a") return void (e.preventDefault(), pickAct("reassign"));
        if (e.key === "g") {
          e.preventDefault();
          L.gPending = Date.now();
          return;
        }
        if (L.gPending && Date.now() - L.gPending < 1200 && (e.key === "p" || e.key === "s")) {
          e.preventDefault();
          L.gPending = 0;
          const task = A.S.tasks.get(L.focus);
          if (!task) return;
          if (e.key === "p") L.tfilter = { ...L.tfilter, project: task.card?.projectKey ?? "" };
          else L.tfilter = { ...L.tfilter, state: truthState(task) };
          if (!L.tfilter.project) delete L.tfilter.project;
          A.changed();
          return;
        }
      }
      if (e.key === "j" || e.key === "ArrowDown") return void (e.preventDefault(), move(1, rail, e.shiftKey));
      if (e.key === "k" || e.key === "ArrowUp") return void (e.preventDefault(), move(-1, rail, e.shiftKey));
      if ((e.key === "Enter" || e.key === "o") && L.focus && !rail) return void (e.preventDefault(), A.go({ name: "task", id: L.focus, full: A.route.name === "onhand" && !!A.route.full }));
      if (e.key === "Escape" && (L.sel.size || L.find || L.filter || L.source || Object.keys(L.tfilter).length) && !rail) {
        e.preventDefault();
        if (L.sel.size) L.sel.clear();
        else if (L.find) L.find = "";
        else if (Object.keys(L.tfilter).length) L.tfilter = {};
        else if (L.filter) L.filter = 0; // D261: then the strip's filter
        else L.source = ""; // D654: then 来自 / From
        L.dropAsk = false;
        A.changed();
      }
    };
    // Before Esc's "up one level" (main.tsx), so a selection or a Find is let go of first.
    addEventListener("keydown", k, true);
    return () => removeEventListener("keydown", k, true);
  }, [room]);
}

// ---------- one row ----------

/** D454: a finished task as a card that can leave On hand (done, or didn't work out); none for one at work. */
export function finishedOf(task: Task): Finished | undefined {
  if (!finished(task)) return undefined;
  const failed = attention(task) === "failed";
  const p = placeOf(task);
  const integrated = !!task.card?.integrated || !!(task.acted?.ok && (task.acted.action === "merge" || task.acted.action === "open_pr"));
  // D508: a repo task with a branch and no PR offers its merge and a draft PR in ⋯.
  const integrate = !failed && p.kind === "repo" && canIntegrate(task) && !integrated && !task.acting && !hasPR(task) ? { base: p.baseBranch ?? "main" } : undefined;
  return { name: shortTitle(title(task)) || t("task.unknown"), taskIds: [task.id], failedIds: failed ? [task.id] : [], openId: task.id, ...(integrate ? { integrate } : {}), ...(endable(task) ? { ends: true } : {}) };
}

type RowProps = { task: Task; room: Room; state?: boolean; v: string; focus: boolean; sel: boolean; opened: boolean };

/** One task in two lines: the title, and what it is on; on the right what changed, a draft PR or
 *  a merge, and the time; under it where and who (wide). Hover offers the one next step. */
const TaskRow = memo(function TaskRow({ task, room, state, focus, sel, opened }: RowProps) {
  const a = attention(task);
  const p = placeOf(task);
  const s = storyOf(task);
  const ch = task.card?.changes;
  const pr = prWord(task);
  const w = a === "blocked" ? A.S.waiterFor(task.id) : undefined;
  const u = A.S.untilOf(task);
  const arrived = a !== "blocked" && A.S.justArrived(task.id);
  // D244: one status place: needs you > working > new result. In the rail all three; elsewhere the
  // sections already say needs you and working, so only a new result takes it.
  const st = statusOf(task.id, a, task.card?.updatedAt);
  const handing = handover(task.id, st);
  const rail = room === "rail";
  const place: Status = rail ? st : st === "new" ? "new" : "";
  // An active row in the rail drops its resting facts (+a −d, a draft PR, the time).
  const active = rail && place !== "";
  const unseen = st === "new";
  const wide = room !== "phone";
  // D261: where, quietly: its project when the board shows all of them, its computer with two or
  // more. Who does it and its branch are in the task.
  const meta = [...(room !== "rail" ? (wide ? whereMeta(task) : whereMeta(task).slice(0, L.showProj && lensOf(task) !== OTHER ? 1 : 0)) : []), ...bgFact(task)];
  const quiet = a === "blocked" && room !== "rail" && quietWait(task);
  const next = a === "blocked" && room !== "rail" && !quiet ? waitNext(w) : undefined;
  const acts = wide ? <RowActs task={task} /> : null;
  // D578: a real link (a Keep's own work in the rail links to the Keep's page, which it opens); on
  // the board ⌘-click and Shift-click still pick.
  const kept = room === "rail" ? keepOfTask(task.id) : undefined;
  return (
    <div class={`trow${quiet ? " quiet" : ""}${focus ? " kfocus" : ""}${sel ? " sel" : ""}${opened ? " opened" : ""}${arrived ? " arrived" : ""}${unseen ? " unseen" : ""} a-${a}`} data-row={task.id} data-look={A.lookOf(task.card?.persona)}>
      <TaskLink class="tmain" id={task.id} full={room === "full" || room === "rail"} href={kept ? `#keep=${encodeURIComponent(kept)}` : undefined} title={title(task)} current={opened} onPick={(e) => pickClick(e, task.id, room)} onOpen={() => openRow(task.id, room)}>
        {arrived && <span class="pop-bub" aria-hidden="true" />}
        <span class="l1">
          {w && <WaitBubble w={w} />}
          <PartnerMark persona={task.card?.persona} />
          <span class="t">{shortTitle(title(task)) || t("task.unknown")}</span>
          {!active && ch && (ch.adds > 0 || ch.dels > 0) && (
            <span class="stat">
              {ch.adds > 0 && <i class="add">+{ch.adds}</i>}
              {ch.dels > 0 && <i class="del">−{ch.dels}</i>}
            </span>
          )}
          {pr && !active && <span class="pr">{pr}</span>}
          {state && <b class={`st ${a === "needs_you" ? "needs" : a === "failed" ? "failed" : ""}`}>{stateLabel(a)}</b>}
          {place && <StatusFace s={place} failed={a === "failed"} handing={handing} wear={A.wearOf(task.card?.persona)} />}
          {!active && !quiet && <span class="time">{timeOf(task)}</span>}
        </span>
        <span class={`l2${s.tone ? ` ${s.tone}` : ""}`}>
          {s.mark && <StepMark k={s.mark} />}
          <span class="w">{s.words}</span>
          {s.code && <code class="c">{s.code}</code>}
          {quiet && <span class="next">{t("onhand.wait.since", ago(A.L, task.card?.updatedAt))}</span>}
          {next?.text && (
            <span class="next">
              <Ring frac={next.frac} />
              {next.text}
            </span>
          )}
          <Facts class="meta" items={meta} />
        </span>
        {u && !finished(task) && room !== "rail" && <Goal u={u} />}
        {w && (w.check || w.event) && room !== "rail" && <Groove w={w} />}
      </TaskLink>
      {acts}
    </div>
  );
});

/** D578: On hand's board takes ⌘-click (or Ctrl-click) and Shift-click on a row to pick (D216), so
 *  those never open a tab there; anywhere else they are the link's own. */
export function pickClick(e: MouseEvent, taskId: string, room: Room): boolean {
  if (room !== "full" || e.button !== 0) return false;
  if (e.metaKey || e.ctrlKey) return toggle(taskId), true;
  if (e.shiftKey) return extend(taskId), true;
  return false;
}

/** D542: what a row's tap opens. In the rail a Keep's own work (its rounds' task) is the Keep: its
 *  row opens the Keep's page, never the round's task; any other row opens its task, at the whole
 *  screen from the board and the rail, at its conversation (the workbench is the task's own). */
export function openRow(taskId: string, room: Room) {
  const kept = room === "rail" ? keepOfTask(taskId) : undefined;
  if (kept) return openKeep(kept);
  L.focus = taskId;
  A.go({ name: "task", id: taskId, full: room === "full" || room === "rail" });
}

/** D287: results already celebrated this session, so a done card's little moment plays once. */
const cheered = new Map<string, number>();

/** D467: a card's state, drawn in its mark: the same vocabulary as a group's parts. */
type MarkKind = "needs" | "failed" | "working" | "waiting" | "done" | "seen" | "rounds";

/** D467: the state mark at the head of every card: a 32 sunk round holding the part marks' glyph
 *  (a flag for what stopped, a cross for what didn't work out, D498's pebble at work, the ring filling
 *  toward a wait's next look, a tick when done: filled for a new result, quiet once seen). Never the
 *  agent's brand coin, never the partner's face. */
export function StateMark({ k, frac = 0, beat, still }: { k: MarkKind; frac?: number; beat?: number; still?: boolean }) {
  // D498 (research/216): at work, a pebble that beats once each time a step lands (keyed by the
  // newest step, so it beats only when the task truly moves) and rests between; dimmed once no step
  // has come for a while. No bars (read as pause or an equalizer), no track pretending to progress.
  if (k === "working")
    return (
      <span class={`omark k-working${still ? " still" : ""}`} aria-hidden="true">
        <span key={beat ?? 0} class="peb" />
      </span>
    );
  if (k === "rounds")
    return (
      <span class="omark k-rounds" aria-hidden="true">
        <RepeatGlyph task={false} />
      </span>
    );
  if (k === "waiting")
    return (
      <span class="omark k-waiting" aria-hidden="true">
        <Ring frac={frac} />
      </span>
    );
  const path = k === "done" || k === "seen" ? "M5 10.5l3.2 3.2L15 7" : k === "failed" ? "M6.5 6.5l7 7M13.5 6.5l-7 7" : "M10 5.5v5.5M10 14.2v.3";
  return (
    <span class={`omark k-${k}`} aria-hidden="true">
      <svg viewBox="0 0 20 20" width="20" height="20">
        <circle cx="10" cy="10" r="8.4" />
        <path d={path} fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
  );
}

/**
 * D467: one task as one card, the same shape in every section: its state mark; the subject (the
 * short title, then where, quietly); under it the living line (what it is on now, waits for, why it
 * stopped, what it came to); at the right the heartbeat in words (在做 23 分钟, 5:17 回来, 3:09 做完,
 * 上次有动静是 8 天前) and its one action. What stopped and what didn't work out stand in 等你 with
 * their action always in sight; a quiet wait offers its calm next step; a finished one leaves by ×,
 * ⋯ or a swipe (D454). Who does it (the agent) is in the tooltip and the opened task.
 */
const TaskCard = memo(function TaskCard({ task, room, focus, sel }: RowProps) {
  const a = attention(task);
  const s = storyOf(task);
  const ch = task.card?.changes;
  const pr = prWord(task);
  const w = a === "blocked" ? A.S.waiterFor(task.id) : undefined;
  const u = A.S.untilOf(task);
  // D508: a finished task whose PR is open is not done: its row says where the PR is.
  const prr = room !== "rail" ? prRowOf(task) : undefined;
  const st = statusOf(task.id, a, task.card?.updatedAt);
  const fresh = st === "new" && !prr;
  const arrived = a !== "blocked" && A.S.justArrived(task.id);
  if (fresh && !cheered.has(task.id)) cheered.set(task.id, Date.now());
  const cheer = fresh && Date.now() - (cheered.get(task.id) ?? 0) < 1400;
  const mend = mendingOf(task);
  const stopped = !mend && stoppedWait(task);
  const quiet = !stopped && !mend && quietWait(task);
  const next = w ? waitNext(w) : undefined;
  const working = a === "working" || a === "queued" || !!mend;
  const failed = a === "failed" && !mend;
  const at = task.card?.updatedAt;
  const stacked = room === "phone" || room === "side";
  // D471 round 2: stacked, the row says its project too (a quiet second line, never ahead of the task).
  const projKey = lensOf(task);
  const meta = stacked && projKey !== OTHER && projKey !== COMPUTERS && !whereMeta(task).includes(lensName(projKey)) ? [lensName(projKey), ...whereMeta(task)] : whereMeta(task);
  const open = () => {
    L.focus = task.id;
    A.go({ name: "task", id: task.id, full: room === "full" });
  };
  // D425: what it is on changes like the waiting line (held for the dwell, a short entrance), and
  // the heartbeat rests when the person has been away a while.
  const words = useDwell(mend ? mendWords(mend) : s.words);
  const rest = useResting();
  // D498: a working row's line and pebble read its steps: ask once for its history (as the peek does).
  useEffect(() => void (working && ensureSteps(task)), [task.id, working, A.S.welcomed]);
  const fin = finishedOf(task);
  const ref = useRef<HTMLDivElement>(null);
  useSwipeAway(ref, fin);
  // D498 (D427): a task in rounds stands under 一直在跑的 and says its rhythm: the round under way, or
  // the last round's outcome and when the next one comes; never "at work for 182 hours".
  const rounds = room !== "rail" && a !== "needs_you" && !stopped && !failed ? task.card?.rounds : undefined;
  // D498: at work, the pebble beats with each new step and dims once none has come for a while; the
  // row then says when the last one was (a fact; silence means fine while it moves).
  const lastAt = working && !mend ? Math.max(lastStepAt(task) || 0, turnStart(task) || 0) || NaN : NaN;
  const stepQuiet = Number.isFinite(lastAt) && Number.isFinite(lastStepAt(task)) && Date.now() - lastAt >= QUIET_STEP_MS;
  const k: MarkKind = prr ? (prr.stands === "needs" ? "needs" : "waiting") : stopped ? "needs" : failed ? "failed" : rounds && !working ? "rounds" : working ? "working" : a === "blocked" ? "waiting" : a === "needs_you" ? "needs" : fresh ? "done" : "seen";
  // D467: a waiting line that only says the title again gives way to what the task last said, else
  // when it looks again, else nothing (the heartbeat says when it is back).
  // D467 round 4: what stopped or didn't work out says what fixes it, and offers it.
  const truthStopped = task.card?.truth?.needs === "stopped";
  const stuck = room !== "rail" && (stopped || failed) && !truthStopped ? stuckOf(task) : undefined;
  // D584: a story that is only the state's own word (在做 / 做完了) is what the row's time already
  // says (在做 3 分钟了 / 7:52 做完): the status is said once, the second line left out.
  const bare = !stuck && !mend && s.words === stateLabel(a);
  const line = bare ? "" : stuck ? stuckClause(stuck) : a === "blocked" && !stopped && echoes(title(task), s.words) ? firstSentence(sayable(reportOf(task)?.summary ?? "", A.readerLang(task))) || (w ? waitCaption(w) : "") : s.words;
  const roundFacts = rounds && !working ? roundsLine(rounds) : [];
  if (rounds?.everyMs) meta.push(t("og.round.every", rhythm(rounds.everyMs)));
  meta.push(...bgFact(task));
  const pb = placeOf(task);
  const beat = task.acting
    ? t(`result.acting.${task.acting}`, pb.kind === "repo" ? (pb.baseBranch ?? "main") : "")
    : prr
    ? ago(A.L, at) // D508: when it last moved; where the PR is, is the row's own line
    : rounds
    ? roundsBeat(task, rounds, working)
    : working
    ? timeOf(task) && (timeOf(task) === t("time.now") ? t("onhand.card.started") : t("onhand.card.working", timeOf(task)))
    : stopped || quiet
      ? ago(A.L, at) // D471: the time column says a time; why is the row's own line
      : a === "blocked"
        ? next?.text || timeOf(task)
        : failed
          ? timeOf(task)
          : at && finished(task)
            ? t("onhand.card.done", soon(at))
            : timeOf(task);
  // D508: the title whole in its two lines, else cut at a word's end; the tooltip says only what the
  // row doesn't (the whole title, when it was cut), never the title, agent and computer again.
  // D508: a row with a PR (open, or merged) groups its source and its PR's facts on lines of their own.
  const grouped = room !== "rail" && (!!prr || (finished(task) && !!outcomeOf(task)?.url));
  const full = title(task);
  const named = cutAtWord(shortTitle(full) || t("task.unknown"), stacked ? 72 : 110);
  const about = named !== full ? full : undefined;
  // D529: a row that shows its own actions (看看为什么, 再试一次, 到 GitHub 合并) keeps its ⋯ in that same
  // group, revealed in place on hover or focus; never a second row of controls.
  const acts = !!stuck || stopped || quiet || (failed && !!fin) || prr?.stands === "needs" || !!w?.limit?.handTo;
  const joined = fin && !stacked && acts ? <FinishedActs f={fin} full={room === "full"} menuOnly /> : null;
  return (
    <div
      ref={ref}
      class={`ocard a-${a}${prr ? ` pr-${prr.stands}` : ""}${stopped ? " stopped" : ""}${quiet ? " quiet" : ""}${fin ? " fin" : ""}${focus ? " kfocus" : ""}${sel ? " sel" : ""}${fresh ? " unseen" : ""}${cheer ? " cheer" : ""}${arrived ? " arrived" : ""}${rest ? " resting" : ""}`}
      data-row={task.id}
      data-look={A.lookOf(task.card?.persona)}
    >
      <TaskLink class="omain" id={task.id} full={room === "full"} title={about} onPick={(e) => pickClick(e, task.id, room)} onOpen={open}>
        <StateMark k={k} frac={next?.frac ?? 0} beat={latestOf(task)?.seq} still={stepQuiet || rest} />
        <span class="otx">
          <span class="o1">
            <PartnerMark persona={task.card?.persona} />
            <span class="t">{named}</span>
            {!stacked && !grouped && <Facts class="meta" items={meta} />}
            {!stacked && !grouped && ch && (ch.adds > 0 || ch.dels > 0) && (
              <span class="stat">
                {ch.adds > 0 && <i class="add">+{ch.adds}</i>}
                {ch.dels > 0 && <i class="del">−{ch.dels}</i>}
              </span>
            )}
            {!stacked && !grouped && pr && <span class="pr">{pr}</span>}
            {!stacked && !grouped && finished(task) && <Outcome task={task} />}
            {!stacked && !grouped && task.card?.source && <SourceChip src={task.card.source} small plain short />}
          </span>
          {/* D508: a row with a PR groups its facts by what they describe: the source (its to-do and
              where), then the PR (its chip, its diff, where it stands) in one sentence's order; with no
              to-do (or on a phone, where a row shows none), where and the PR share a line. */}
          {grouped && !stacked && task.card?.source && (
            <span class="osrc">
              <SourceChip src={task.card.source} small plain short />
              <Facts class="meta" items={meta} />
            </span>
          )}
          {grouped && (
            <span class="oprg">
              {(stacked || !task.card?.source) && meta.map((m) => (
                <span key={m} class="m">
                  {m}
                </span>
              ))}
              <Outcome task={task} small={stacked} />
              {ch && (ch.adds > 0 || ch.dels > 0) && (
                <span class="stat">
                  {ch.adds > 0 && <i class="add">+{ch.adds}</i>}
                  {ch.dels > 0 && <i class="del">−{ch.dels}</i>}
                </span>
              )}
              {prr ? (
                <>
                  <span class={`ph ${prr.stands}`}>{prWords(task, prr.said)}</span>
                  {prFacts(prr.said).map((f) => (
                    <span key={f} class="pf">
                      {f}
                    </span>
                  ))}
                </>
              ) : (
                pr && <span class="pr">{pr}</span>
              )}
            </span>
          )}
          {prr ? null : roundFacts.length > 0 ? (
            <span class={`o2 rounds${rounds?.health ? " late" : ""}`}>
              <Facts class="w" items={roundFacts} />
            </span>
          ) : (
            ((working && !bare) || line) && (
              <span class={`o2${stuck ? " needs" : s.tone && !mend ? ` ${s.tone}` : ""}`}>
                {s.mark && !stuck && <StepMark k={s.mark} />}
                <span key={working ? words : ""} class={working ? "w say" : "w"}>
                  {working ? words : line}
                </span>
                {s.code && !stuck && <code class="c">{s.code}</code>}
              </span>
            )
          )}
          {stepQuiet && room !== "rail" && <span class="oquiet">{t("onhand.progress.last", ago(A.L, new Date(lastAt).toISOString()))}</span>}
          {u && !finished(task) && <Goal u={u} />}
          {/* D471 round 2: on a phone, where it is and when, quietly, on a line of their own under the
              words (never a chip past the edge, never a time jammed under one). */}
          {stacked && (grouped ? !!beat : meta.length > 0 || !!beat || (finished(task) && !!outcomeOf(task))) && (
            <span class="ometa">
              {!grouped && meta.map((m) => (
                <span key={m} class="m">
                  {m}
                </span>
              ))}
              {!grouped && finished(task) && <Outcome task={task} small />}
              {beat && <span class={`ow${stopped || quiet || failed ? " still" : ""}`}>{beat}</span>}
            </span>
          )}
        </span>
        {/* D471: the heartbeat has its own column, so every row's time stands on one edge. */}
        {!stacked && <span class={`obeat${stopped || quiet || failed ? " still" : ""}`}>{beat}</span>}
      </TaskLink>
      {/* D471: what to do has its own column, so every row's first button starts at one x. */}
      <span class="ocol">
      {stuck ? (
        <span class="oacts on">
          <StuckActs n={stuck} onRetry={fin ? () => runFinished("retry", fin, room === "full") : undefined} />
          {joined}
        </span>
      ) : stopped || quiet ? (
        <span class="oacts on">
          {w && (w.check || w.event) ? (
            <Btn kind="secondary" size="sm" label={t("onhand.quiet.look")} about={title(task)} onClick={() => A.waiterAction(w.waiterId, "look")} />
          ) : (
            <Btn kind="secondary" size="sm" label={t("onhand.quiet.go")} about={title(task)} onClick={() => A.send({ t: "past_continue", taskId: task.id, words: t("onhand.quiet.go") })} />
          )}
          <Btn kind="text" size="sm" label={t("onhand.quiet.drop")} about={title(task)} onClick={() => A.taskAction(task.id, "drop")} />
          {joined}
        </span>
      ) : failed && fin ? (
        <span class="oacts on">
          <Btn kind="secondary" size="sm" label={t("away.retry")} about={title(task)} onClick={() => runFinished("retry", fin, room === "full")} />
          {joined}
        </span>
      ) : prr?.stands === "needs" ? (
        // D508: the one thing a ready PR needs: its merge, on GitHub.
        <span class="oacts on">
          <Btn kind="secondary" size="sm" label={t("onhand.prs.merge")} about={full} onClick={() => window.open(prr.pr.url, "_blank", "noopener")} />
          {joined}
        </span>
      ) : w?.limit?.handTo ? (
        // D471 (D297): a limit used up, with another agent that can take it now: its row offers it.
        <span class="oacts on">
          <Btn kind="secondary" size="sm" label={t("limit.handoff", harnessName(w.limit.handTo.harness))} about={title(task)} onClick={() => A.waiterAction(w.waiterId, "handoff")} />
          {joined}
        </span>
      ) : (
        room !== "phone" && <RowActs task={task} room="card" />
      )}
      </span>
      {/* D471 round 2: on a phone a finished row leaves by its swipe; no lone ⋯ under it. D529: a row
          with actions of its own has its ⋯ in that group (joined); else × and ⋯ come in over its time. */}
      {fin && !stacked && !acts && <FinishedActs f={fin} full={room === "full"} />}
    </div>
  );
});

/** D244: a row's status place: the partner's own clay face at 24, still (no breathing in a row).
 *  Needs you raises its flag, working reads, a new result smiles (a failed one raises the flag).
 *  The handover plays once: the reading face sinks and fades as the done face pops up. */
export function StatusFace({ s, failed, handing, title: label, wear }: { s: Status; failed?: boolean; handing?: boolean; title?: string; /** D565: its task's owner's figure */ wear?: Wear }) {
  if (!s) return null;
  const art = s === "needs" || (s === "new" && failed) ? "needsyou" : s === "working" ? "working" : "done";
  const words = label ?? (s === "new" ? t("onhand.new") : s === "needs" ? t("lane.needs_you") : t("lane.working"));
  return (
    <span key={`${s}${handing ? "-h" : ""}`} class={`sface s-${s}${handing ? " handing" : ""}`} role="img" aria-label={words} title={words}>
      {handing && <img class="from" src={figArt("working", wear)} alt="" draggable={false} />}
      <img class="to" src={figArt(art, wear)} alt="" draggable={false} />
    </span>
  );
}

/** The one next step a row offers on hover (pointer, wide): merge or a draft PR for finished work
 *  with a branch, Pause for work under way. */
function RowActs({ task, room }: { task: Task; room?: "card" }) {
  const a = attention(task);
  const p = placeOf(task);
  // D508: a merge or a draft PR under way says so where the row's time stands (TaskCard's beat); 合进
  // {base} and 开草稿 PR are in the row's ⋯ (finishedOf), and never offered once a PR holds the branch.
  if (task.acting) return room === "card" ? null : <span class="tacts on"><span class="busy">{t(`result.acting.${task.acting}`, p.kind === "repo" ? (p.baseBranch ?? "main") : "")}</span></span>;
  const put = a === "blocked" ? A.S.pendingDecision(task.id) : undefined;
  if (put?.later)
    return (
      <span class="tacts">
        <Btn kind="text" size="sm" label={t("later.now")} about={title(task)} onClick={() => A.later(put.decisionId, null)} />
      </span>
    );
  if (a === "working")
    return (
      <span class="tacts">
        <Btn kind="text" size="sm" label={t("task.action.pause")} about={title(task)} onClick={() => A.taskAction(task.id, "interrupt")} />
      </span>
    );
  return null;
}

// ---------- groups ----------

function Rows({ tasks, room, state, cards, compact }: { tasks: Task[]; room: Room; state?: boolean; cards?: boolean; compact?: "quiet" | "seen" }) {
  if (!tasks.length) return null;
  const r = A.route;
  const openId = r.name === "task" ? r.id : "";
  // D467: on the board every task is the one card, one to a row; the rail beside an opened task
  // stays rows.
  if ((compact || cards) && room !== "rail")
    return (
      <div class="ocards">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} room={room} v={ver(task)} focus={L.focus === task.id && room !== "phone"} sel={L.sel.has(task.id)} opened={false} />
        ))}
      </div>
    );
  return (
    <div class="trows">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} room={room} state={state} v={ver(task)} focus={L.focus === task.id && room !== "phone"} sel={L.sel.has(task.id)} opened={openId === task.id} />
      ))}
    </div>
  );
}

/** What a row draws from, so a row is redrawn only when it changed (memo). */
function ver(task: Task): string {
  const c = task.card;
  const l = latestOf(task);
  const w = A.S.waiterFor(task.id);
  return [attention(task), l?.seq, c?.updatedAt, bgRunning(c?.background), c?.changes?.adds, c?.changes?.dels, c?.integrated?.act, task.acting, task.acted?.action, w?.lastLookAt, w?.nextLookAt, L.showProj, quietWait(task), A.S.justArrived(task.id), timeOf(task), A.L.lang, A.convLang, task.open?.title, isNewResult(task.id, attention(task), c?.updatedAt), handover(task.id, statusOf(task.id, attention(task), c?.updatedAt))].join("|");
}

type Fold = { shut: boolean; onToggle: () => void; mark: Status; counts: string };

function Section({ name, n, children, end, fold }: { name: string; n?: number; children: ComponentChildren; end?: ComponentChildren; fold?: Fold }) {
  if (fold) {
    const about = spoken(A.L, fold.shut ? t("onhand.fold.open") : t("onhand.fold.close"), fold.counts);
    return (
      <section class={`tsec fold${fold.shut ? " shut" : ""}`} aria-label={name}>
        <h3>
          <button class="fold-name" aria-expanded={!fold.shut} title={about} aria-label={spoken(A.L, name, fold.counts)} onClick={fold.onToggle}>
            <Chevron open={!fold.shut} />
            <span class="nm">{name}</span> {n ? <span class="n">{n}</span> : null}
          </button>
          {fold.shut && fold.mark && <StatusFace s={fold.mark} title={fold.counts} />}
          {end && <span class="end">{end}</span>}
        </h3>
        <div class="tbody">{children}</div>
      </section>
    );
  }
  return (
    <section class="tsec" aria-label={n ? `${name} ${n}` : name}>
      <h3>
        {/* D467: a quiet label, never a count: the brief and the cards say what is there. */}
        <span class="nm">{name}</span>
        {end && <span class="end">{end}</span>}
      </h3>
      <div class="tbody">{children}</div>
    </section>
  );
}

/**
 * D507: one helper on On hand: a standing teammate that takes one kind of work. Its head (its first
 * letter on the sunken pebble, as in Settings: research/220 kept the literal mark; its name; how it
 * reads at a glance: nothing handed over yet, n on hand, n waiting for you; what it takes; this week's
 * count on the time edge) opens its row in Settings › Agent 通信. Under it, on the same sheet and set
 * in by the mark's width, the work it keeps: each task's own row (what waits for you first), and a
 * finished one while its PR is still open, until the merge. The sheet takes the needs-you ledge when
 * something on it waits for the person. Read from the home's one model (OnHand.helpers, HelperWork).
 */
function HelperSheet({ h, room }: { h: HelperWork; room: Room }) {
  const g = helperGlance(h);
  const stacked = room === "phone" || room === "side";
  const ts = h.items.flatMap((x) => (A.S.tasks.has(x.taskId) ? [A.S.tasks.get(x.taskId)!] : []));
  const loose = h.items.filter((x) => !A.S.tasks.has(x.taskId));
  const you = h.items.filter((x) => x.at === "you" || (A.S.tasks.has(x.taskId) && stoppedWait(A.S.tasks.get(x.taskId)!))).length;
  const line = g === "address" ? t(`peers.helper.${h.mem}`) : you ? t("helper.you", you) : h.items.length ? t("peers.helper.open", h.items.length) : t("helper.idle");
  const beat = h.week > 0 ? t("peers.helper.week", h.week) : "";
  return (
    <div class={`ocards hsheet${you ? " needs" : ""}`} data-helper={h.id}>
      <div class="ocard hhead">
        <button class="omain" onClick={() => A.openSettings("peers")} title={t("helper.see", h.name)}>
          <span class="omark k-helper" aria-hidden="true">
            <span class="hl">{[...h.name][0]?.toUpperCase()}</span>
          </span>
          <span class="otx">
            <span class="o1">
              <span class="t">{h.name}</span>
            </span>
            <span class={`o2${you ? " needs" : ""}`}>
              <span class="w">{line}</span>
              {you > 0 && h.items.length > you && <span class="w more">{t("peers.helper.open", h.items.length)}</span>}
            </span>
            {g === "idle" && <span class="oquiet">{t("peers.helper.ready")}</span>}
            {h.about && <span class="oquiet habout">{t("peers.helper.takes", h.about)}</span>}
            {stacked && beat && (
              <span class="ometa">
                <span class="ow still">{beat}</span>
              </span>
            )}
          </span>
          {!stacked && <span class="obeat still">{beat}</span>}
        </button>
        <span class="ocol" />
      </div>
      {ts.map((task) => (
        <TaskCard key={task.id} task={task} room={room} v={ver(task)} focus={L.focus === task.id && room !== "phone"} sel={L.sel.has(task.id)} opened={false} />
      ))}
      {loose.map((x) => (
        <div key={x.taskId} class="ocard hitem">
          <TaskLink class="omain" id={x.taskId} full={room === "full"} title={x.title} onOpen={() => A.go({ name: "task", id: x.taskId, full: room === "full" })}>
            <StateMark k={x.at === "you" || x.at === "ready" ? "needs" : "waiting"} />
            <span class="otx">
              <span class="o1">
                <span class="t">{shortTitle(x.title)}</span>
                {x.pr && <span class="pr">{x.pr.replace(/^.*#/, "#")}</span>}
              </span>
              {/* D508: where its PR stands in the one model's words; else what waits for the person. */}
              {x.said && !x.yours ? (
                <span class={`o2 prl ${x.at === "ready" ? "needs" : "waiting"}`}>
                  <span class="ph">{prPhaseWords(x.said)}</span>
                  {prFacts(x.said).map((f) => (
                    <span key={f} class="pf">
                      {f}
                    </span>
                  ))}
                </span>
              ) : (
                <span class={`o2${x.at === "you" ? " needs" : ""}`}>
                  <span class="w">{x.yours ?? ""}</span>
                </span>
              )}
            </span>
            {!stacked && <span class="obeat still" />}
          </TaskLink>
          <span class="ocol" />
        </div>
      ))}
    </div>
  );
}

/** A drawn disclosure chevron: right when folded, down when open. */
const Chevron = ({ open }: { open: boolean }) => (
  <svg class={`chev${open ? " open" : ""}`} viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
    <path d="M4.5 2.5L8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

/** A folded group's counts in words, only the parts that are there, read as a list (a tooltip and
 *  an accessible name, D291): "1 needs you, 2 working". */
export function foldCounts(statuses: Status[]): string {
  const n = (s: Status) => statuses.filter((x) => x === s).length;
  const needs = n("needs");
  const working = n("working");
  const fresh = n("new");
  return spoken(A.L, needs ? t("onhand.fold.needs", needs) : "", working ? t("onhand.fold.working", working) : "", fresh ? (fresh === 1 ? t("onhand.fold.new.one") : t("onhand.fold.new", fresh)) : "");
}
/** From how many tasks Find shows. */
export const FIND_FROM = 10;
/** D287: from how many a fold folds (fewer stay in sight: a fold of one hides more than it saves). */
export const FOLD_FROM = 3;

// ---------- the list ----------

/** Seen results under 今天做完 are folded by default; unfolded is remembered on this device. */
const DONE_OPEN = "ducter.onhand.done-open";
function doneOpenKept(): boolean {
  try {
    return localStorage.getItem(DONE_OPEN) === "1";
  } catch {
    return false;
  }
}
function keepDoneOpen(on: boolean) {
  try {
    if (on) localStorage.setItem(DONE_OPEN, "1");
    else localStorage.removeItem(DONE_OPEN);
  } catch {}
  A.changed();
}

/** A quiet line that folds what is under it away: its words and a chevron. */
const FoldLine = ({ words, open, onToggle }: { words: string; open: boolean; onToggle: () => void }) => (
  <button class="fold-line" aria-expanded={open} onClick={onToggle}>
    <span>{words}</span>
    <Chevron open={open} />
  </button>
);

/** D467: yesterday's finished tasks unfolded under 今天做完, this session. */
let earlierShown = false;

/** On hand's list, in any room (D216, D261): under the project lens, by state, with the strip's
 *  filter; what needs you first and taking no room when there is none; a wait quiet for a day and
 *  a result you have seen folded away. Beside an opened task (the rail) every task is a row. */
export function OnHandList({ room }: { room: Room }) {
  useKeys(room);
  // D290: on its first paint the rows come in one after another (app.css .entering), then never again.
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    L.walked = false; // D471: a focus kept from an opened task doesn't hold the peek
    const t = setTimeout(() => setEntering(false), 700);
    return () => clearTimeout(t);
  }, []);
  // D511: a Keep's page takes the board's place (the rail beside an opened task keeps the list).
  if (K.open && room !== "rail") return <KeepPageView room={room} />;
  const groups = lensGroups();
  const lens = currentLens(groups);
  L.showProj = lensOn(groups) && !lens;
  const lanes = lensLanes(lens);
  const all = lanes.flat();
  L.usual = usualComputer(all);
  const q = L.find.trim();
  const rail = room === "rail";
  // D-PENDING (research/245 §3.5): 概览 / Overview or 列表 / List. List is offered from eight tasks
  // on, kept per device, and never becomes the default by itself. A rail stays rows.
  const listOn = !rail && L.mode === "list" && all.length >= LIST_FROM;
  A.listMode = listOn;
  A.applyView = (v) => {
    L.tfilter = { ...v.filter };
    L.sort = v.sort;
    L.mode = v.mode;
    writeMode(v.mode);
    A.changed();
  };
  if (listOn) {
    const rows = listRows(all, L.tfilter, L.sort, q);
    L.order = rows.map((x) => x.id);
    for (const id of [...L.sel]) if (!all.some((x) => x.id === id)) L.sel.delete(id);
    const setMode = (m: "overview" | "list") => {
      if (L.mode === m) return;
      L.mode = m;
      writeMode(m);
      A.changed();
    };
    return (
      <div class={`onhand-list room-${room} list-mode${entering ? " entering" : ""}`}>
        {room !== "full" && <LensTabs />}
        {room === "full" && <LensTabs inBoard />}
        <BoardTop lens={lens} groups={groups} findable={all.length >= FIND_FROM} room={room} mode={L.mode} onMode={setMode} showMode={all.length >= LIST_FROM} />
        <ListBoard
          room={room === "phone" ? "phone" : room === "side" ? "side" : "full"}
          tasks={all}
          rows={rows}
          filter={L.tfilter}
          sort={L.sort}
          mode={L.mode}
          focus={L.focus}
          sel={L.sel}
          onFilter={(f) => ((L.tfilter = f), A.changed())}
          onSort={(x) => ((L.sort = x), A.changed())}
          onSave={(name) => A.viewSave({ id: `v_${Date.now().toString(36)}`, name, filter: { ...L.tfilter }, sort: L.sort, mode: L.mode })}
          onFocus={(id) => ((L.focus = id), (L.walked = true), A.changed())}
          onPick={(id, e) => pickClick(e, id, room)}
          onOpen={(id) => openRow(id, room)}
          onClear={() => (L.sel.clear(), A.changed())}
          onBulk={(ask) => {
            const ids = [...L.sel];
            if (!ids.length) return;
            A.bulk(ids, ask.op, { ...(ask.device ? { device: ask.device } : {}), ...(ask.harness ? { harness: ask.harness } : {}) });
            L.sel.clear();
            A.changed();
          }}
          pick={L.pickOp}
          onPicked={() => (L.pickOp = "")}
        />
      </div>
    );
  }
  const f = rail ? 0 : L.filter;
  const show = (i: number) => !f || f === i;
  const keep = (ts: Task[]) => (q ? ts.filter((x) => matches(x, q)) : ts);
  // D360: a group stands as one card in its most urgent member's section (not while finding, nor
  // in the rail: there every task is its own row; with a filter, only in its own section). Counts stay per task.
  // D517: a group with a part that waits for the person stands in 等你, where the head counts it.
  const laneOf = groupLaneOf(lanes);
  const bgs = (rail || q ? [] : boardGroups(A.S.onHand?.groups?.filter((g) => !A.S.awayNow.has(g.id)), laneOf, (id) => memberAttention(id))).filter((b) => show(b.lane + 1));
  const inGroup = new Set(bgs.flatMap((b) => [...b.ids]));
  // D507: each helper that is on is its own sheet, its work under it until it lets go (the task ended
  // and its PR merged or closed): never scattered into 在做 or 今天做完. A helper whose work waits for
  // the person stands at the head of 等你; the rest under 你的帮手 after the waits. Find and the rail
  // beside an opened task show the tasks as rows, each with its helper's name.
  // D511: 看守中 / Looking after takes the place of 你的帮手 and 一直在跑的 when the home sends Keeps:
  // each Keep one sheet; a task it owns stands under it (a Keep in rounds is its task), never in 在做
  // or 在等; one that waits for the person stays in 等你 once, its row naming the Keep.
  const keepsOn = A.S.onHand?.keeps;
  const ks = rail || q || (lens && lens !== OTHER) ? [] : (keepsOn ?? []);
  const byKeep = ks.flatMap((k) => k.taskIds).filter((id) => !A.S.tasks.has(id) || !waitsForYou(A.S.tasks.get(id)!));
  const hws = keepsOn || rail || q || (lens && lens !== OTHER) ? [] : (A.S.onHand?.helpers ?? []);
  const kept = new Set([...hws.flatMap((h) => h.items.map((x) => x.taskId)), ...byKeep]);
  NESTED = kept;
  const helperYou = (h: HelperWork) => helperGlance(h) === "you" || h.items.some((x) => A.S.tasks.has(x.taskId) && stoppedWait(A.S.tasks.get(x.taskId)!));
  const hsYou = hws.filter(helperYou);
  const hsRest = hws.filter((h) => !helperYou(h));
  const hIds = (hs: HelperWork[]) => hs.flatMap((h) => h.items.filter((x) => A.S.tasks.has(x.taskId)).map((x) => x.taskId));
  const ungrouped = (ts: Task[]) => (inGroup.size || kept.size ? ts.filter((x) => !inGroup.has(x.id) && !kept.has(x.id)) : ts);
  const groupsIn = (lane: number) => bgs.filter((b) => b.lane === lane);
  const nIn = (lane: number) => lanes[lane]!.length;
  const needs = ungrouped(keep(lanes[LANE.needs]!));
  // D498 (D427): a task in rounds, at work on a round or resting till the next, stands under
  // 一直在跑的 (its rhythm), never under 在做 or 在等; one that asks or stopped stays in 等你.
  const inRounds = (x: Task) => !keepsOn && !rail && !!x.card?.rounds && ["working", "queued", "blocked"].includes(attention(x)) && !stoppedWait(x);
  const workingAll = [...ungrouped(keep(lanes[LANE.working]!)), ...(rail ? [] : boardParts(lanes).mending.filter((x) => keep([x]).length > 0 && !inGroup.has(x.id) && !kept.has(x.id)))];
  const working = workingAll.filter((x) => !inRounds(x));
  // D467: a wait nothing brings back and a task that didn't work out stand in 等你; 今天做完 is
  // today's; what finished before folds under it. Beside an opened task the rail keeps the lanes.
  const parts = boardParts([[], [], ungrouped(keep(lanes[LANE.waiting]!)), ungrouped(keep(lanes[LANE.done]!))]);
  const stoppedTs = rail ? [] : parts.stopped;
  const readyTs = rail ? [] : parts.ready; // D508: a PR ready to merge: the merge is the person's
  const failedTs = rail ? [] : parts.failed;
  // D471: every task is one row in its section, said once; the head names none of them.
  const waiting = rail ? ungrouped(keep(lanes[LANE.waiting]!)) : parts.waiting.filter((x) => !inRounds(x));
  const ongoing = [...workingAll.filter(inRounds), ...parts.waiting.filter(inRounds)];
  const done = rail ? ungrouped(keep(lanes[LANE.done]!)) : parts.today;
  const earlier = rail ? [] : parts.earlier;
  const earlierOpen = earlierShown || f === 4 || !!q;
  const loose = !q && looseIn(lens);
  const partnerDs = loose ? A.S.partnerDecisions().filter((d) => d.src?.kind !== "plan") : [];
  // D312: another partner's own questions are listed here too (answered in its conversation).
  const otherAs = loose ? A.otherAsks() : [];
  const looseWs = loose ? A.S.armedWaiters().filter((w) => !w.taskId) : [];
  const missed = loose ? A.S.missedToday() : [];
  const calls = loose ? (A.S.onHand?.calls ?? []) : [];
  const liveCalls = calls.filter((c) => ["waiting", "calling", "talking", "question"].includes(c.state));
  const endedCalls = calls.filter((c) => callEnded(c.state) && c.state !== "held");
  // D297: tasks waiting on one account's limit share one reset: drawn together under one line.
  const limitGroups = rail ? [] : groupLimits(waiting.filter((x) => !quietWait(x)));
  const grouped = new Set(limitGroups.flatMap((g) => g.tasks.map((x) => x.id)));
  const fresh = rail ? waiting : [...waiting.filter((x) => !quietWait(x) && !grouped.has(x.id)), ...limitGroups.flatMap((g) => g.tasks)];
  const quiet = rail ? [] : waiting.filter((x) => quietWait(x));
  const newer = rail ? done : done.filter((x) => statusOf(x.id, attention(x), x.card?.updatedAt) === "new");
  const seen = rail ? [] : done.filter((x) => statusOf(x.id, attention(x), x.card?.updatedAt) !== "new");
  // D287: a fold earns its line from three: one or two quiet waits or seen results stay in sight.
  const quietFolds = !rail && quiet.length >= FOLD_FROM;
  const seenFolds = !rail && seen.length + missed.length + endedCalls.length >= FOLD_FROM;
  const quietOpen = !quietFolds || L.quietOn || f === 3 || !!q;
  const doneOpen = !seenFolds || doneOpenKept() || f === 4 || !!q;
  // The order the keys walk, as drawn.
  const gIds = (lane: number) => groupsIn(lane).flatMap((b) => b.rows.flatMap((r) => (r.kind === "task" && b.ids.has(r.taskId) ? [r.taskId] : [])));
  L.order = [...hIds(hsYou), ...gIds(0), ...needs.map((x) => x.id), ...stoppedTs.map((x) => x.id), ...readyTs.map((x) => x.id), ...failedTs.map((x) => x.id), ...gIds(1), ...working.map((x) => x.id), ...gIds(2), ...fresh.map((x) => x.id), ...(quietOpen ? quiet : []).map((x) => x.id), ...hIds(hsRest), ...ongoing.map((x) => x.id), ...gIds(3), ...newer.map((x) => x.id), ...(doneOpen ? seen : []).map((x) => x.id), ...(earlierOpen ? earlier : []).map((x) => x.id)].filter((id) => {
    const lane = stoppedTs.some((x) => x.id === id) || readyTs.some((x) => x.id === id) || failedTs.some((x) => x.id === id) ? 0 : parts.waiting.some((x) => x.id === id) ? LANE.waiting : laneOf(id);
    return show(lane + 1) || inGroup.has(id) || kept.has(id);
  });
  for (const id of [...L.sel]) if (!all.some((x) => x.id === id)) L.sel.delete(id);
  const openN = A.defaultable().length;
  const shown = needs.length + stoppedTs.length + readyTs.length + failedTs.length + working.length + waiting.length + ongoing.length + done.length + earlier.length + inGroup.size + kept.size;
  return (
    <div class={`onhand-list room-${room}${entering && room !== "rail" ? " entering" : ""}`}>
      {!rail && (
        <>
          {room !== "full" && <LensTabs />}
          {room === "full" && <LensTabs inBoard />}
          <BoardTop lens={lens} groups={groups} findable={all.length >= FIND_FROM} room={room} mode={all.length >= LIST_FROM ? "overview" : undefined} showMode={all.length >= LIST_FROM} onMode={(m) => { L.mode = m; writeMode(m); A.changed(); }} />
        </>
      )}
      {q && !shown && <p class="none">{t("onhand.find.none")}</p>}
      {/* D285: a Find that matches nothing here leads to every earlier task. */}
      {q && !rail && <PastLink words={t("past.find.in", q)} q={q} />}
      {needs.length + partnerDs.length + otherAs.length + groupsIn(0).length + stoppedTs.length + readyTs.length + failedTs.length + hsYou.length > 0 && show(1) && (
        <Section name={t("lane.needs_you")} n={(bgs.length ? nIn(LANE.needs) : needs.length) + partnerDs.length + otherAs.length + stoppedTs.length + readyTs.length + failedTs.length} end={openN >= 2 && !rail ? <Btn kind="text" size="sm" label={t("decision.goall", openN)} onClick={() => A.goOnAllDefaults()} /> : undefined}>
          {/* What needs you is answered in place: its card, not a row (beside a task, a row). */}
          {rail ? (
            <Rows tasks={needs} room={room} />
          ) : (
            <>
              {hsYou.map((h) => (
                <HelperSheet key={h.id} h={h} room={room} />
              ))}
              {groupsIn(0).map((b) => (
                <GroupCard key={b.g.id} b={b} room={room} />
              ))}
              {partnerDs.map((d) => (
                <DecisionCard key={d.decisionId} d={d} />
              ))}
              {otherAs.map((x) => (
                <OtherAsk key={x.decisionId} a={x} />
              ))}
              {needs.map((task) => {
                const d = A.S.pendingDecision(task.id);
                return d ? <DecisionCard key={task.id} d={d} taskId={task.id} /> : <Rows key={task.id} tasks={[task]} room={room} cards />;
              })}
              {/* D467: what stopped and what didn't work out, said plainly with the one action. */}
              <Rows tasks={[...stoppedTs, ...readyTs, ...failedTs]} room={room} cards />
            </>
          )}
        </Section>
      )}
      {working.length + liveCalls.length + groupsIn(1).length > 0 && show(2) && (
        <Section name={t("lane.working")} n={(bgs.length ? nIn(LANE.working) : working.length) + liveCalls.length}>
          {groupsIn(1).map((b) => (
            <GroupCard key={b.g.id} b={b} room={room} />
          ))}
          {!rail && liveCalls.map((c) => <CallRow key={c.callId} c={c} />)}
          <Rows tasks={working} room={room} cards />
        </Section>
      )}
      {waiting.length + looseWs.length + groupsIn(2).length > 0 && show(3) && (
        <Section name={t("lane.waiting")} n={(bgs.length ? Math.max(0, nIn(LANE.waiting) - stoppedTs.length) : waiting.length) + looseWs.length}>
          {groupsIn(2).map((b) => (
            <GroupCard key={b.g.id} b={b} room={room} />
          ))}
          <Rows tasks={fresh.filter((x) => !grouped.has(x.id))} room={room} cards />
          {limitGroups.map((g) => (
            <LimitGroup key={g.harness} g={g} room={room} />
          ))}
          {!rail && looseWs.map((w) => <LooseWait key={w.waiterId} w={w} />)}
          {quietFolds && f !== 3 && !q && <FoldLine words={t("onhand.wait.quiet", quiet.length)} open={quietOpen} onToggle={() => ((L.quietOn = !L.quietOn), A.changed())} />}
          {quiet.length > 0 && !quietFolds && !rail && fresh.length + looseWs.length > 0 && <p class="sub-h">{t("onhand.wait.quiet.head")}</p>}
          {quiet.length > 0 && quietOpen && <Rows tasks={quiet} room={room} compact="quiet" />}
        </Section>
      )}
      {/* D511: 看守中 / Looking after: what Ducter keeps on for the person, each its own sheet, after the waits. */}
      {ks.length > 0 && show(2) && (
        <Section name={t("keep.section")}>
          {ks.map((k) => (
            <KeepSheetCard key={k.id} k={k} stacked={room === "phone" || room === "side"} />
          ))}
        </Section>
      )}
      {/* D507: the person's helpers, each its own sheet with the work it keeps, after the waits. */}
      {hsRest.length > 0 && show(2) && (
        <Section name={t("peers.helpers.title")}>
          {hsRest.map((h) => (
            <HelperSheet key={h.id} h={h} room={room} />
          ))}
        </Section>
      )}
      {/* D498: what keeps going on its own rhythm (a task in rounds), after the waits. */}
      {ongoing.length > 0 && show(2) && (
        <Section name={t("og.tab")}>
          <Rows tasks={ongoing} room={room} cards />
        </Section>
      )}
      {/* D467 round 3: with nothing of today's left to draw, only yesterday's fold, no heading. */}
      {done.length + missed.length + endedCalls.length + groupsIn(3).length === 0 && earlier.length > 0 && show(4) && !rail && (
        <div class="done-earlier">
          {f !== 4 && !q && <FoldLine words={t("onhand.done.yesterday", earlier.length)} open={earlierOpen} onToggle={() => ((earlierShown = !earlierShown), A.changed())} />}
          {earlierOpen && <Rows tasks={earlier} room={room} compact="seen" />}
        </div>
      )}
      {done.length + missed.length + endedCalls.length + groupsIn(3).length > 0 && show(4) && (
        <Section name={t("lane.done")} n={done.length}>
          {groupsIn(3).map((b) => (
            <GroupCard key={b.g.id} b={b} room={room} />
          ))}
          <Rows tasks={newer} room={room} cards />
          {seenFolds && f !== 4 && !q && (
            <FoldLine words={t("onhand.done.seen", seen.length + missed.length + endedCalls.length)} open={doneOpen} onToggle={() => keepDoneOpen(!doneOpenKept())} />
          )}
          {doneOpen && (
            <>
              {!seenFolds && !rail && newer.length > 0 && seen.length + missed.length + endedCalls.length > 0 && <p class="sub-h">{t("onhand.done.seen.head")}</p>}
              {!rail && endedCalls.map((c) => <CallRow key={c.callId} c={c} />)}
              {!rail &&
                missed.map((w) => (
                  <div class="trow loose" key={w.waiterId}>
                    <span class="tmain static">
                      <span class="l1">
                        <WaitBubble w={w} />
                        <span class="t">{w.reason}</span>
                      </span>
                      <span class="l2">
                        <span class="w">{t("wait.missed", w.unmet ?? t("wait.missed.ranout"))}</span>
                      </span>
                    </span>
                    <span class="tacts on">
                      <Btn kind="text" size="sm" label={t("wait.rearm")} about={w.reason} onClick={() => A.waiterAction(w.waiterId, "rearm")} />
                    </span>
                  </div>
                ))}
              <Rows tasks={seen} room={room} compact="seen" />
            </>
          )}
          {/* D467: 今天做完 is today's; yesterday's folds away under it, one tap from sight. */}
          {earlier.length > 0 && f !== 4 && !q && <FoldLine words={t("onhand.done.yesterday", earlier.length)} open={earlierOpen} onToggle={() => ((earlierShown = !earlierShown), A.changed())} />}
          {earlier.length > 0 && earlierOpen && <Rows tasks={earlier} room={room} compact="seen" />}
        </Section>
      )}
      {/* D357: the person's to-dos in their own apps: a few, the rest folded. */}
      {!rail && !q && !f && <TodoGroup lens={lens} />}
      {/* D285: 做过的事 / Past tasks: what you have seen, and everything before it. */}
      {!rail && !q && (
        <div class="past-links">
          {ongoingCount() > 0 && <PastLink words={t("og.link", ongoingCount())} tab="ongoing" />}
          <PastLink words={t("past.link")} />
          {/* D300: 替你做过的 / Done for you: what went out in the person's name. */}
          <button class="past-link" onClick={() => openDid()}>
            <span>{t("did.link")}</span>
            <Chev />
          </button>
        </div>
      )}
      {room === "full" && L.sel.size > 0 && <BulkBar />}
    </div>
  );
}

// ---------- groups (D360) ----------

/** Groups unfolded this session (a folded card shows what is live and the next in line). */
const groupOpen = new Set<string>();

/** One member's mark: the literal state, drawn (never a dot that means nothing, D69). */
function MemberMark({ k }: { k: ReturnType<typeof markOf> }) {
  if (k === "working")
    return (
      <span class="gmark k-working" aria-hidden="true">
        <span class="peb" />
      </span>
    );
  const path =
    k === "done" ? "M5 10.5l3.2 3.2L15 7" : k === "failed" || k === "dropped" ? "M6.5 6.5l7 7M13.5 6.5l-7 7" : k === "needs" ? "M10 5.5v5.5M10 14.2v.3" : "";
  return (
    <span class={`gmark k-${k}`} aria-hidden="true">
      <svg viewBox="0 0 20 20" width="20" height="20">
        {k === "held" || k === "waiting" ? <circle cx="10" cy="10" r="6.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-dasharray={k === "held" ? "2.4 2.6" : undefined} /> : <circle cx="10" cy="10" r="8.4" />}
        {path && <path d={path} fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />}
      </svg>
    </span>
  );
}

/** D430: a part's name: the person's own words when it does one line of their message, else its title. */
function partWords(r: MemberRow): string {
  const lines = r.kind === "task" ? linesOfPart(r.taskId) : linesOfPart(undefined, r.key);
  if (lines.length === 1) return lines[0]!.words;
  if (r.kind === "held") return r.title;
  const task = A.S.tasks.get(r.taskId);
  return task ? shortTitle(title(task)) || t("task.unknown") : t("task.unknown");
}

/** What a member's row says at its right: how long it has worked, when it came back, or that it waits its turn. */
function memberWhen(r: MemberRow, task: Task | undefined): string {
  if (r.kind === "held") return r.device ? t("group.held.on", computerName(r.device)) : t("group.held");
  if (!task) return "";
  const a = attention(task);
  if (a === "working" || a === "queued") return timeOf(task) === t("time.now") ? t("onhand.card.started") : t("onhand.card.working", timeOf(task));
  if (a === "blocked") return waitNext(A.S.waiterFor(task.id)).text || stateLabel(a);
  const prr = prRowOf(task); // D508: a part whose PR is open isn't done
  if (prr) return prWords(task, prr.said);
  if (a === "done" || a === "done_claimed") return task.card?.updatedAt ? t("onhand.card.done", soon(task.card.updatedAt)) : stateLabel(a);
  return stateLabel(a);
}

/**
 * D360: a group of tasks that are one piece of work, as one card: its name, how far along (beads, one
 * per part, and the conversation's count, 好了 1 个，还有 2 个, D430), its parts in order (each opens its
 * task; one waiting its turn says 排着), how they run (一个做完接下一个), and, when a part didn't work
 * out, the person's three ways on. A part that needs the person shows its question inside the card:
 * what needs you never folds. D430: no counter noun; a part is named by its own words (partWords).
 */
function GroupCard({ b, room }: { b: BoardGroup; room: Room }) {
  const [menu, setMenu] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const open = groupOpen.has(b.g.id);
  const { shown, rest } = open ? { shown: b.rows, rest: 0 } : foldedRows(b);
  const send = (op: "rename" | "dissolve" | "order" | "move" | "next" | "drop_rest" | "remove", extra: Record<string, unknown> = {}) => A.send({ t: "task_group", op, groupId: b.g.id, ...extra } as never);
  const held = b.rows.filter((r): r is Extract<MemberRow, { kind: "held" }> => r.kind === "held");
  const live = b.rows.some((r) => r.kind === "task" && (r.attention === "working" || r.attention === "queued"));
  const count = groupCount(b.rows);
  const countWords = count ? t("asks.count", count.done, count.left) : "";
  const stopWords = b.stopped ? { ended: partWords(b.rows[b.stopped.part - 1]!), next: partWords(b.rows[b.stopped.next - 1]!) } : undefined;
  const save = () => {
    const n = (draft ?? "").trim();
    if (n && n !== b.g.name) send("rename", { name: n });
    setDraft(null);
  };
  const toggle = () => (open ? groupOpen.delete(b.g.id) : groupOpen.add(b.g.id), A.changed());
  // D454: a group none of whose parts is at work can leave On hand (what waits after a stopped part goes with it).
  const fin = finishedGroup(b);
  const finItems = fin ? finishedMenu(fin) : [];
  const ref = useRef<HTMLDivElement>(null);
  useSwipeAway(ref, fin);
  // D467: a part at work says what it is on now: its history, asked once, gives the line its words.
  const atWork = b.rows.flatMap((r) => (r.kind === "task" && markOf(r) === "working" ? [r.taskId] : []));
  useEffect(() => {
    for (const id of atWork) {
      const x = A.S.tasks.get(id);
      if (x) ensureSteps(x);
    }
  }, [atWork.join(","), A.S.welcomed]);
  return (
    <div ref={ref} class={`tgroup${live ? " live" : ""}${b.stopped ? " stopped" : ""}${fin ? " fin" : ""}`} data-group={b.g.id} data-look={A.lookOf(b.g.persona)} role="group" aria-label={countWords ? spoken(A.L, b.g.name, countWords) : b.g.name}>
      <div class="ghead">
        {/* D546: whose line of work it is, once there is more than one partner (a part's own row says it again only when another's). */}
        <PartnerMark persona={b.g.persona} />
        {draft === null ? (
          <span class="gname">{b.g.name}</span>
        ) : (
          <input
            class="gname-input"
            value={draft}
            aria-label={t("group.rename")}
            title={t("group.rename.keys")}
            autoFocus
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") e.stopPropagation(), setDraft(null);
            }}
            onBlur={save}
          />
        )}
        {countWords && <span class="gcount">{countWords}</span>}
        {fin && <AwayX f={fin} />}
        <MoreButton label={t("group.menu")} open={menu} onClick={() => setMenu(!menu)} />
      </div>
      {/* D467: the parts as one track: done, at work (breathing), needs you, didn't work, in line. */}
      <span class="gtrack" aria-hidden="true">
        {b.rows.map((r) => (
          <i key={r.kind === "task" ? r.taskId : r.key} class={`gseg b-${markOf(r)}`} />
        ))}
      </span>
      {/* D385: a hand-over's plan, its making, review together. */}
      {b.g.hand && <HandBlock g={b.g} />}
      {menu && (
        <Menu class="gmenu" label={b.g.name} onClose={() => setMenu(false)}>
          {finItems
            .filter((k) => k !== "remove")
            .map((k) => (
              <MenuItem key={k} class="btn text sm" onClick={() => (setMenu(false), runFinished(k, fin!, room === "full"))}>
                <span class="lbl">{t(`away.${k}`)}</span>
              </MenuItem>
            ))}
          <MenuItem class="btn text sm" onClick={() => (setMenu(false), setDraft(b.g.name))}>
            <span class="lbl">{t("group.rename")}</span>
          </MenuItem>
          <MenuItem class="btn text sm" onClick={() => (setMenu(false), send("order", { order: b.g.order === "one_by_one" ? "side_by_side" : "one_by_one" }))}>
            <span class="lbl">{b.g.order === "one_by_one" ? t("group.toSide") : t("group.toLine")}</span>
          </MenuItem>
          <MenuItem class="btn text sm" onClick={() => (setMenu(false), send("dissolve"))}>
            <span class="lbl">{t("group.ungroup")}</span>
          </MenuItem>
          {fin && (
            <MenuItem class="btn text sm" onClick={() => (setMenu(false), runFinished("remove", fin, room === "full"))}>
              <span class="lbl">{t("away.remove")}</span>
            </MenuItem>
          )}
        </Menu>
      )}
      <ol class="gparts">
        {shown.map((r) => {
          const task = r.kind === "task" ? A.S.tasks.get(r.taskId) : undefined;
          const k = markOf(r);
          const d = task && k === "needs" ? A.S.pendingDecision(task.id) : undefined;
          const hi = r.kind === "held" ? held.indexOf(r) : -1;
          return (
            <li key={r.kind === "task" ? r.taskId : r.key} class={`gpart m-${k}${task && L.focus === task.id && room !== "phone" ? " kfocus" : ""}`} data-row={task?.id}>
              <span class="gidx" aria-hidden="true">
                {r.part}
              </span>
              {/* D498: a part at work has the board's mark: its pebble beats with each step. */}
              {k === "working" && task ? (
                <span class="gmark k-working" aria-hidden="true">
                  <span key={latestOf(task)?.seq ?? 0} class="peb" />
                </span>
              ) : (
                <MemberMark k={k} />
              )}
              {task ? (
                <TaskLink class="gtitle" id={task.id} full={room === "full"} title={title(task)} onOpen={() => ((L.focus = task.id), A.go({ name: "task", id: task.id, full: room === "full" }))}>
                  {partWords(r)}
                </TaskLink>
              ) : (
                <span class="gtitle is-held">{r.kind === "held" ? partWords(r) : ""}</span>
              )}
              <span class="gwhen">{memberWhen(r, task)}</span>
              {/* D467: a part at work says what it is on now, as every card does. */}
              {task && k === "working" && <span class="gnow">{storyOf(task).words}</span>}
              {hi > 0 && room !== "phone" && <Btn kind="text" size="sm" label={t("group.up")} about={r.kind === "held" ? r.title : ""} onClick={() => send("move", { member: (r as { key: string }).key, to: hi - 1 })} />}
              {d && (
                <div class="gask">
                  <DecisionCard d={d} taskId={task!.id} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {rest > 0 && <FoldLine words={t("group.more.tasks", rest)} open={false} onToggle={toggle} />}
      {open && b.rows.length > 3 && <FoldLine words={t("onhand.fold.close")} open onToggle={toggle} />}
      {b.stopped ? (
        <div class="gstop">
          <p>{b.stopped.waiting > 1 ? t(`group.stopped.${b.stopped.why}.many`, stopWords!.ended) : t(`group.stopped.${b.stopped.why}`, stopWords!.ended, stopWords!.next)}</p>
          <span class="gacts">
            <Btn kind="secondary" size="sm" label={t("group.retry")} onClick={() => A.send({ t: "past_continue", taskId: b.stopped!.taskId, words: t("group.retry") })} />
            <Btn kind="secondary" size="sm" label={t("group.go")} onClick={() => send("next")} />
            <Btn kind="text" size="sm" label={t("group.drop")} onClick={() => send("drop_rest")} />
          </span>
        </div>
      ) : (
        held.length > 0 && (
          <p class="gfoot">
            <LineGlyph side={b.g.order === "side_by_side"} />
            <span>{b.g.order === "side_by_side" ? t("group.side") : t("group.line")}</span>
          </p>
        )
      )}
    </div>
  );
}

/** How the parts run, drawn: three beads on one thread (one after another) or side by side. */
const LineGlyph = ({ side }: { side: boolean }) => (
  <svg class="gline" viewBox="0 0 28 12" width="28" height="12" aria-hidden="true">
    {side ? (
      <>
        <path d="M3 3h22M3 9h22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.55" />
      </>
    ) : (
      <>
        <path d="M4 6h20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.45" />
        <circle cx="5" cy="6" r="2.6" fill="currentColor" />
        <circle cx="14" cy="6" r="2.6" fill="currentColor" opacity="0.7" />
        <path d="M21 3.4l3 2.6-3 2.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </>
    )}
  </svg>
);

/**
 * D357: 你的待办 / Your to-dos (GitHub 上标给你的 / Assigned to you on GitHub when it is the only
 * source): only while a source is on, under All or that source's lens. At most three stand as
 * cards (GLANCE_MAX: a review request, a mention, a due line, the newest); the rest fold under
 * 还有 n 个 / n more, which opens in place with Find, chips and pages. Nothing for someone with no source.
 */
function TodoGroup({ lens }: { lens: string }) {
  useEffect(() => {
    // The sources frame keeps coming once asked (on each connection; the look it starts is ETag'd:
    // free when nothing changed).
    if (A.S.welcomed) A.send({ t: "sources" });
  }, [A.S.welcomed]);
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (TF.scroll && ref.current) (TF.scroll = false), ref.current.scrollIntoView({ block: "start", behavior: "smooth" });
  });
  const frame = TS.frame;
  if (!frame?.sources.length) return null;
  if (lens && !lens.startsWith("src:")) return null;
  const sources = lens ? frame.sources.filter((s) => `src:${s.id}` === lens) : frame.sources;
  if (!sources.length) return null;
  const glance = (frame.glance ?? []).filter((g) => sources.some((s) => s.id === g.source));
  const c = todoCounts(sources, glance);
  // D359: the pile stands at the head of the group (every source's, so under All or a lone source's lens).
  const pile = frame.pile && (!lens || frame.sources.length === 1) ? frame.pile : undefined;
  // Silence: a source that reads and has nothing open draws nothing (the pile's day line still shows a cleared day).
  if (!glance.length && !c.rest && !c.review && !TF.open && !(pile && (pile.open > 0 || pile.clearedToday > 0))) return null;
  const toggle = () => {
    TF.open = !TF.open;
    if (TF.open && !TF.items.length) askFold(1);
    A.changed();
  };
  return (
    <section class="tsec todo-group" aria-label={todoGroupName(sources)} ref={ref as never}>
      <h3>
        {/* Several sources: their marks before the name (one is named by the heading itself). */}
        {sources.length > 1 && (
          <span class="todo-marks" aria-hidden="true">
            {[...new Set(sources.map((s) => s.kind))].map((k) => (
              <BrandMark key={k} name={k} size={18} />
            ))}
          </span>
        )}
        <span class="nm">{todoGroupName(sources)}</span>
      </h3>
      {pile ? (
        <>
          {/* D467: one calm card on the board: what the sort found, its one action; the whole
              triage (the pile, the cards, every to-do) behind 看看全部. */}
          <SourceSummary pile={pile} kind={sources[0]!.kind} review={c.review} />
          {(pile.open > 0 || glance.length > 0) && <FoldLine words={srcOpen ? t("onhand.src.hide") : t("onhand.src.all", pile.open)} open={srcOpen} onToggle={() => ((srcOpen = !srcOpen), A.changed())} />}
          {srcOpen && (
            <div class="src-all">
              <PileBlock pile={pile} />
              {glance.length > 0 && (
                <div class="ocards">
                  {glance.map((g) => (
                    <TodoCard key={g.ref} i={g} />
                  ))}
                </div>
              )}
              {(c.rest > 0 || c.review > 0 || TF.open) && <FoldLine words={t("onhand.todos.more", c.rest)} open={TF.open} onToggle={toggle} />}
              {TF.open && <TodoFold sources={sources} shown={glance.map((g) => g.ref)} />}
            </div>
          )}
        </>
      ) : (
        <>
          {glance.length > 0 && (
            <div class="ocards">
              {glance.map((g) => (
                <TodoCard key={g.ref} i={g} />
              ))}
            </div>
          )}
          {(c.rest > 0 || c.review > 0 || TF.open) && <FoldLine words={t("onhand.todos.more", c.rest)} open={TF.open} onToggle={toggle} />}
          {TF.open && <TodoFold sources={sources} shown={glance.map((g) => g.ref)} />}
        </>
      )}
    </section>
  );
}

/** D467: the whole triage behind the summary card, unfolded this session. */
let srcOpen = false;

/** D467: what the sort found, as facts that add up to the open count: each group's count, and what
 *  is already under way (handed over, or bound to a task) as the rest. The lead is the first group
 *  with something in it; a PR waiting for review is said apart (it is no assigned issue). */
export function sourceFacts(pile: PileView, name: string): { lead: string; leadGroup: string; facts: string[] } {
  if (pile.sorting) return { lead: t("pile.sorting"), leadGroup: "", facts: [t("pile.sorting.read", pile.sorting.read), t("pile.sorting.of", pile.sorting.of)] };
  if (!pile.sortedAt || !pile.read) return { lead: pile.open > 0 ? t("pile.first.lede", name) : t("pile.clear"), leadGroup: pile.open > 0 ? "first" : "", facts: [] };
  const g = pile.groups;
  const all: [string, number][] = [
    ["do", g.do],
    ["decide", g.decide],
    ["close", g.close],
    ["later", g.later],
    ["unread", pile.unread],
    ["taken", pileTaken(pile)],
  ];
  const words = (k: string, n: number) => (k === "do" ? t("onhand.src.do", n, name) : t(`onhand.src.${k}`, n));
  const there = all.filter(([, n]) => n > 0);
  if (!there.length) return { lead: t("pile.clear"), leadGroup: "", facts: [] };
  const [lk, ln] = there[0]!;
  return { lead: words(lk, ln), leadGroup: lk, facts: there.slice(1).map(([k, n]) => words(k, n)) };
}

/** D467: the to-dos as one card of the board's own shape: the app's mark in the state mark's place,
 *  what the sort found (its lead, then the rest as quiet facts, each its own element), and the one
 *  action at the right. No art and no giant numeral: those are the triage's, behind 看看全部. */
function SourceSummary({ pile, kind, review }: { pile: PileView; kind: string; review: number }) {
  const name = A.S.personaName;
  const f = sourceFacts(pile, name);
  // D498: what is the person's own leads: PRs whose review is asked of them, a row of its own with
  // its way in; the offer follows at a sane size: a few picked, never the whole pile in one press.
  const lead = f.leadGroup === "do" ? t("onhand.src.offer", pile.groups.do) : f.lead;
  const facts = pile.sorting ? f.facts : [];
  const act =
    f.leadGroup === "do" ? (
      <Btn kind="secondary" size="sm" label={t("onhand.src.pick")} about={f.lead} onClick={() => openHand({ door: "do", doCount: pile.groups.do, pick: true })} />
    ) : f.leadGroup === "decide" ? (
      <Btn kind="secondary" size="sm" label={t("pile.act.decide")} about={f.lead} onClick={() => openPile("decide")} />
    ) : f.leadGroup === "close" ? (
      <Btn kind="secondary" size="sm" label={t("pile.act.close")} about={f.lead} onClick={() => openPile("close")} />
    ) : f.leadGroup === "first" ? (
      <Btn kind="secondary" size="sm" label={t("pile.first")} about={f.lead} onClick={() => A.send({ t: "pile_sort" })} />
    ) : null;
  return (
    <div class="ocards src-sheet">
    {review > 0 && !pile.sorting && (
      <div class="ocard src-sum src-asked">
        <span class="omain static">
          <span class="omark k-src" aria-hidden="true">
            <BrandMark name={kind} size={18} />
          </span>
          <span class="otx">
            <span class="o1">
              <span class="t offer">{t("onhand.src.review", review)}</span>
            </span>
          </span>
        </span>
        <span class="ocol">
          <span class="oacts on">
            <Btn kind="secondary" size="sm" label={t("onhand.src.review.go")} about={t("onhand.src.review", review)} onClick={() => ((srcOpen = true), A.changed())} />
          </span>
        </span>
      </div>
    )}
    <div class="ocard src-sum">
      <span class="omain static">
        <span class="omark k-src" aria-hidden="true">
          <BrandMark name={kind} size={18} />
        </span>
        <span class="otx">
          <span class="o1">
            <span class="t offer">{lead}</span>
          </span>
          {facts.length > 0 && (
            <span class="o2 facts">
              {facts.map((x) => (
                <span key={x} class="fact">
                  {x}
                </span>
              ))}
            </span>
          )}
          {pile.sorting && (
            <span class="pile-bar" aria-hidden="true">
              <span style={{ width: `${Math.round((100 * pile.sorting.read) / Math.max(1, pile.sorting.of))}%` }} />
            </span>
          )}
        </span>
      </span>
      {act && (
        <span class="ocol">
          <span class="oacts on">{act}</span>
        </span>
      )}
    </div>
    </div>
  );
}

/** D285: On hand's one quiet way to 做过的事 / Past tasks. */
/** D285: what keeps going on its own: routines that are on or paused, and tasks resting on their own wait. */
function ongoingCount(): number {
  const o = A.S.onHand;
  const routines = (o?.routines ?? []).filter((r) => r.state !== "ended" && r.state !== "dismissed").length;
  // D498: a task in rounds counts while a round runs too (its wait is re-armed only after it).
  const tasks = new Set([...(o?.waiters ?? []).filter((w) => w.taskId && !w.routineId && w.state === "armed").map((w) => w.taskId), ...(o?.tasks ?? []).filter((c) => c.rounds).map((c) => c.taskId)]).size;
  return routines + tasks;
}

function PastLink({ words, q, tab }: { words: string; q?: string; tab?: "ongoing" }) {
  return (
    <button class="past-link" onClick={() => openPast(q ?? "", tab ?? "past")}>
      <span>{words}</span>
      <Chev />
    </button>
  );
}

function LooseWait({ w }: { w: NonNullable<ReturnType<typeof A.S.armedWaiters>>[number] }) {
  const live = !!(w.check || w.event);
  return (
    <div class="trow loose">
      <span class="tmain static">
        <span class="l1">
          {live ? <WaitBubble w={w} /> : null}
          <span class="t">{live ? waitLine(w.reason) : w.reason}</span>
        </span>
        {waitCaption(w) && (
          <span class="l2">
            <span class="w">{waitCaption(w)}</span>
          </span>
        )}
        {live && <Groove w={w} />}
      </span>
      {live && (
        <span class="tacts on">
          <Btn kind="text" size="sm" label={t("wait.cancel")} about={w.reason} onClick={() => A.waiterAction(w.waiterId, "cancel")} />
        </span>
      )}
    </div>
  );
}

/** Find: narrows the list as you type; Esc or Clear lets go. */
function Find() {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label class="find">
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
        <circle cx="7" cy="7" r="4.4" />
        <path d="M10.3 10.3 13.5 13.5" />
      </svg>
      <input
        id="onhand-find"
        ref={ref}
        type="search"
        value={L.find}
        placeholder={t("onhand.find.placeholder")}
        aria-label={t("onhand.find.placeholder")}
        autocomplete="off"
        spellcheck={false}
        onInput={(e) => ((L.find = e.currentTarget.value), (L.focus = ""), A.changed())}
        onKeyDown={(e) => {
          if (e.key === "Escape") e.stopPropagation(), e.preventDefault(), (L.find = ""), ref.current?.blur(), A.changed();
          if (e.key === "Enter" || e.key === "ArrowDown") e.preventDefault(), ref.current?.blur(), (L.focus = L.order[0] ?? ""), A.changed();
        }}
      />
    </label>
  );
}

// ---------- many at once ----------

/** What the selected tasks can do together, each counted; Cancel asks once. */
export function bulkOf(ids: Iterable<string>) {
  const ts = [...ids].map((id) => A.S.tasks.get(id)).filter((x): x is Task => !!x);
  const integrated = (x: Task) => !!x.card?.integrated || !!(x.acted?.ok && (x.acted.action === "merge" || x.acted.action === "open_pr"));
  const merge = ts.filter((x) => finished(x) && canIntegrate(x) && !integrated(x) && !x.acting && !hasPR(x)); // D508
  return {
    all: ts,
    merge,
    pr: merge,
    pause: ts.filter((x) => attention(x) === "working"),
    drop: ts.filter((x) => !finished(x) && attention(x) !== "dropped"),
  };
}

/** D360: the selected tasks into one group, by the name typed (none: the first one's title). */
function makeGroup(ts: Task[], done: () => void) {
  A.send({ t: "task_group", op: "make", taskIds: ts.map((x) => x.id), ...(L.groupAsk?.trim() ? { name: L.groupAsk.trim() } : {}) });
  L.groupAsk = null;
  done();
}

function BulkBar() {
  const k = bulkOf(L.sel);
  const done = () => (L.sel.clear(), (L.dropAsk = false), A.changed());
  const run = (ts: Task[], action: "merge" | "open_pr" | "interrupt" | "drop") => {
    for (const x of ts) A.taskAction(x.id, action);
    done();
  };
  return (
    <div class="bulk" role="toolbar" aria-label={t("onhand.sel.n", k.all.length)}>
      <b>{t("onhand.sel.n", k.all.length)}</b>
      {L.dropAsk ? (
        <>
          <span class="ask">{t("onhand.sel.drop.ask", k.drop.length)}</span>
          <Btn kind="secondary" size="sm" label={t("onhand.sel.drop.yes")} onClick={() => run(k.drop, "drop")} />
          <Btn kind="text" size="sm" label={t("onhand.sel.drop.no")} onClick={() => ((L.dropAsk = false), A.changed())} />
        </>
      ) : (
        <>
          {k.merge.length > 0 && <Btn kind="text" size="sm" label={t("onhand.sel.merge", k.merge.length)} onClick={() => run(k.merge, "merge")} />}
          {k.pr.length > 0 && <Btn kind="text" size="sm" label={t("onhand.sel.pr", k.pr.length)} onClick={() => run(k.pr, "open_pr")} />}
          {k.pause.length > 0 && <Btn kind="text" size="sm" label={t("onhand.sel.pause", k.pause.length)} onClick={() => run(k.pause, "interrupt")} />}
          {k.drop.length > 0 && <Btn kind="text" size="sm" label={t("onhand.sel.drop", k.drop.length)} onClick={() => ((L.dropAsk = true), A.changed())} />}
          {/* D360: 放进一个分组 / Put in a group: a name, then they stand as one card. */}
          {k.all.length >= 2 && L.groupAsk === null && <Btn kind="text" size="sm" label={t("group.make")} onClick={() => ((L.groupAsk = ""), A.changed())} />}
          {L.groupAsk !== null && (
            <span class="gmake">
              <input
                class="gname-input"
                value={L.groupAsk}
                placeholder={t("group.make.name")}
                aria-label={t("group.make.name")}
                autoFocus
                onInput={(e) => ((L.groupAsk = (e.target as HTMLInputElement).value), A.changed())}
                onKeyDown={(e) => {
                  if (e.key === "Escape") e.stopPropagation(), (L.groupAsk = null), A.changed();
                  if (e.key === "Enter") makeGroup(k.all, done);
                }}
              />
              <Btn kind="secondary" size="sm" label={t("group.make.go")} onClick={() => makeGroup(k.all, done)} />
            </span>
          )}
          <span class="grow" />
          <Btn kind="text" size="sm" label={t("onhand.sel.clear")} about="Esc" onClick={done} />
        </>
      )}
    </div>
  );
}

const PlusSm = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
  </svg>
);

// ---------- the switcher (⌘O) ----------

/** Every task this client knows that has a title, what needs you first, then the newest. */
export function switchList(q: string, limit = 40): Task[] {
  const rank = (x: Task) => ({ needs_you: 0, working: 1, queued: 1, blocked: 2 }[attention(x) as string] ?? 3);
  const at = (x: Task) => x.card?.updatedAt ?? x.openedAt ?? "";
  const low = q.toLowerCase();
  // D456: the title with the words, then the words as typed anywhere, then a slip or the initials.
  const named = (x: Task) => (low && title(x).toLowerCase().includes(low) ? 0 : !low || matchesExactly(x, q) ? 1 : 2);
  return [...A.S.tasks.values()]
    .filter((x) => title(x) && attention(x) !== "superseded" && matches(x, q))
    .sort((a, b) => named(a) - named(b) || rank(a) - rank(b) || at(b).localeCompare(at(a)))
    .slice(0, limit);
}

// ---------- D467: the peek ----------

/**
 * D467: the peek, the conductor's "sit in" at a wide window: the focused task (the keys' focus, else
 * the first in the walk) as it is right now: its mark, title and where, its state in words, what it
 * is on in full, its latest steps with the newest breathing, what a wait waits for and when it looks
 * again, what a result made; and the way into the task. It follows the keys, never the pointer.
 */
export function Peek() {
  useTick(1000);
  const task = peekTask(L.focus, L.order, L.walked);
  useEffect(() => void (task && ensureSteps(task)), [task?.id, A.S.welcomed]);
  if (!task) return null;
  const a = attention(task);
  const s = storyOf(task);
  const working = a === "working" || a === "queued";
  const stopped = stoppedWait(task);
  const w = a === "blocked" ? A.S.waiterFor(task.id) : undefined;
  const next = w ? waitNext(w) : undefined;
  // D508: under its open PR the peek says where the PR is, never 做完.
  const prr = prRowOf(task);
  const k: MarkKind = prr ? (prr.stands === "needs" ? "needs" : "waiting") : stopped || a === "needs_you" ? "needs" : a === "failed" ? "failed" : working ? "working" : a === "blocked" ? "waiting" : statusOf(task.id, a, task.card?.updatedAt) === "new" ? "done" : "seen";
  const at = task.card?.updatedAt;
  const beat = prr
    ? ""
    : working
    ? timeOf(task) && (timeOf(task) === t("time.now") ? t("onhand.card.started") : t("onhand.card.working", timeOf(task)))
    : stopped
      ? t("onhand.wait.since", ago(A.L, at))
      : a === "blocked"
        ? next?.text || timeOf(task)
        : at && finished(task)
          ? t("onhand.card.done", soon(at))
          : stateLabel(a);
  const steps = peekSaid(task);
  const r = reportOf(task);
  const result = finished(task) && r?.summary ? (sayable(r.summary, A.readerLang(task)) ?? "").split("\n").filter(Boolean).slice(0, 3) : [];
  const where = whereMeta(task);
  // D471: what stopped says why in the partner's words; what the task itself last said follows,
  // whole, under its own label (never in place of the reason).
  const stuck = stopped || a === "failed" ? stuckOf(task) : undefined;
  const said = stuck && r?.summary ? (sayable(r.summary, A.readerLang(task)) ?? "").split("\n").filter(Boolean).slice(0, 2) : [];
  return (
    <aside class={`peek a-${a}`} aria-label={title(task)}>
      <div class="phead">
        <StateMark k={k} frac={next?.frac ?? 0} />
        <span class="ptx">
          <span class="pt" title={title(task)}>{shortTitle(title(task)) || t("task.unknown")}</span>
          <Facts class="meta" items={where.length ? where : [harnessName(harnessOf(task))]} />
        </span>
      </div>
      {beat && <p class={`pbeat k-${k}`}>{beat}</p>}
      {prr && <PrLine task={task} said={prr.said} stands={prr.stands} />}
      {stuck ? <p class="pnow needs">{stuckClause(stuck)}</p> : !finished(task) && <p class={`pnow${s.tone ? ` ${s.tone}` : ""}`}>{s.words}</p>}
      {said.length > 0 && (
        <div class="presult said">
          <p class="plabel">{t("onhand.peek.said")}</p>
          {said.map((x, i) => (
            <p key={i}>{x}</p>
          ))}
        </div>
      )}
      <PeekPicture task={task} />
      {w && (w.check || w.event) && waitCaption(w) && <p class="pwait">{waitCaption(w)}</p>}
      {result.length > 0 && (
        <div class="presult">
          {result.map((x, i) => (
            <p key={i}>{x}</p>
          ))}
          <Outcome task={task} />
        </div>
      )}
      {steps.length > 0 && (
        <div class="psteps">
          <p class="plabel">{t("onhand.peek.steps")}</p>
          <ol>
            {/* D498: the steps in sentences (D152): its own words, one gist for steps without words; a
                step that didn't work is a quiet line with the transcript's small cross, never red. */}
            {steps.map((l, i) => (
              <li key={l.seq} class={`${l.bad ? "bad" : ""}${i === steps.length - 1 ? " pnew" : ""}`}>
                <StepMark k={l.bad ? "error" : l.k === "voice" ? "thought" : l.k} />
                <span class="sw">{l.words}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <span class="pacts">
        <Btn kind="secondary" size="sm" label={t("onhand.peek.open")} about={title(task)} onClick={() => A.go({ name: "task", id: task.id, full: A.route.name !== "conv" })} />
      </span>
    </aside>
  );
}

// D517: the app's counts (the conversation's line, a partner's number in the list) read the same items as
// On hand's 等你.
A.needsItems = () => needsYouItems("");

// ---------- D535: every needs-you count is a door ----------

/** D535: the last item a count's door opened (its key), for the next tap's step. */
export const door = { last: "" };

/** D535: a count's items in the order 等你 draws them (a stopped line, the partner's own questions,
 *  another partner's, then the tasks); partner "" is the person's one count, else that partner's part. */
export function doorItems(partner = ""): NeedItem[] {
  const all = needsYouItems("").filter((i) => !partner || i.partner === partner);
  const rank = (i: NeedItem) => (i.groupId ? 0 : i.decisionId ? 1 : i.askId ? 2 : 3);
  return all.map((i, n) => ({ i, n })).sort((a, b) => rank(a.i) - rank(b.i) || a.n - b.n).map((x) => x.i);
}

/** D535: the item after the one last opened; the first when that one is gone or was the last. */
export function nextDoor(items: { key: string }[], last: string): number {
  const at = items.findIndex((i) => i.key === last);
  return at < 0 ? 0 : (at + 1) % items.length;
}

/** D535: whose items the conversation's line opens: with more than one partner the shown one's. */
export const barDoorPartner = () => (A.manyPartners() ? A.S.persona || A.partnerShown || DEFAULT_PARTNER : "");

/** D535: opens the next item of a count where it lives: the partner's own question in the
 *  conversation (scrolled to, its tint deepening once), else On hand's overview with the item
 *  focused, scrolled to and deepening once. A second tap steps on; after the last, the first. */
export function openDoor(partner = ""): boolean {
  const items = doorItems(partner);
  if (!items.length) return false;
  const it = items[nextDoor(items, door.last)]!;
  door.last = it.key;
  if (K.open) closeKeepHere();
  if (it.decisionId && A.S.channel.some((e) => e.decision?.decisionId === it.decisionId)) {
    // Wide, the conversation stands beside On hand: it is found there without leaving the pane.
    const convShown = A.route.name === "conv" || (wideNow() && !A.route.full);
    if (!convShown) A.go({ name: "conv" });
    else A.changed();
    // Found in the conversation itself, never its copy in On hand's 等你 beside it.
    findIn(() => `main[role="log"] #d-${CSS.escape(it.decisionId!)}`);
    return true;
  }
  L.filter = 0;
  L.find = "";
  L.focus = it.taskId ?? "";
  L.walked = !!it.taskId;
  // The lens kept on this device stays when it holds the item; else All.
  const lens = readLens();
  if (lens) {
    const task = it.taskId ? A.S.tasks.get(it.taskId) : undefined;
    const holds = task ? lensOf(task) === lens : (it.decisionId || it.askId) && lens === OTHER;
    if (!holds) setLens("");
    L.focus = it.taskId ?? "";
    L.walked = !!it.taskId;
  }
  if (A.route.name !== "onhand") A.go({ name: "onhand", ...(A.route.name === "task" && A.route.full ? { full: true } : {}) });
  else A.changed();
  findIn(() => `.onhand-list:not(.room-rail) :is(${itemSelector(it)})`);
  return true;
}

/** D535: scrolls an element to the middle of its own list, and only that list: scrollIntoView also
 *  moves every scrolling ancestor, the page itself included, which slid the two panes off the window. */
export function centerIn(el: HTMLElement) {
  let sc = el.parentElement;
  while (sc && !(sc.scrollHeight > sc.clientHeight && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
  if (!sc) return;
  const r = el.getBoundingClientRect();
  const box = sc.getBoundingClientRect();
  const top = sc.scrollTop + (r.top - box.top) - Math.max(0, (box.height - r.height) / 2);
  sc.scrollTo({ top: Math.max(0, top), behavior: still() ? "auto" : "smooth" });
}

/** D535: closes a Keep's page without a render of its own (the door's move renders once). */
function closeKeepHere() {
  K.open = "";
  K.pause = K.stop = false;
}

/** D535: the element On hand draws for an item: its row, its line's card, its question's card. */
function itemSelector(it: NeedItem): string {
  if (it.groupId) return `[data-group="${CSS.escape(it.groupId)}"]`;
  if (it.keepId) return `[data-keep="${CSS.escape(it.keepId)}"]`;
  if (it.askId) return `[data-ask="${CSS.escape(it.askId)}"]`;
  if (it.decisionId) return `#d-${CSS.escape(it.decisionId)}`;
  const d = it.taskId ? A.S.pendingDecision(it.taskId) : undefined;
  const row = `[data-row="${CSS.escape(it.taskId ?? "")}"]`;
  return d ? `#d-${CSS.escape(d.decisionId)}, ${row}` : row;
}

/** D535: once On hand has drawn it (a few frames at most, through a page's move), the item is
 *  scrolled to the middle of its list and its tint deepens once (app.css .door-found); at once and
 *  colour only under reduced motion. */
function findIn(sel: () => string, tries = 24) {
  if (typeof document !== "object" || typeof requestAnimationFrame !== "function") return;
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(sel());
    if (!el) return tries > 0 ? findIn(sel, tries - 1) : undefined;
    centerIn(el);
    el.classList.remove("door-found");
    void el.offsetWidth; // a second find on the same element plays again
    el.classList.add("door-found");
    const off = () => el.classList.remove("door-found");
    el.addEventListener("animationend", off, { once: true });
    setTimeout(off, 1800);
  });
}

A.openDoor = openDoor;
