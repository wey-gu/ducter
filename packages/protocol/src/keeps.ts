// D511: 照看 / Looking after (code name Keep). One object for work Ducter keeps on for the person: the
// person asked once, and Ducter acts again later, more than once or until something holds, without
// being asked again. A routine (D114), a task in rounds (D427, `task_loop`) and a helper (D494/D507)
// are each a Keep seen with different parameters (design/standing-work.md §4). The mechanisms under
// it (the scheduler, the loop keeper, the helper's Bridge address, a PR's looks) stay as they are; a
// Keep names one of them as its `from` and holds what they don't: the person's words, its goal, when
// it speaks, its life.
//
// On the Log: `keep` snapshots on stream keep:<id>, the latest wins (as routines). Code owns facts and
// invariants (a wake fired, a round reported, the person paused it); the model owns meaning (whether
// the goal holds, whether a round's result is news): principle 21.

import type { OngoingHealth } from "./past.ts";
import type { PrSaid } from "./pr-state.ts";
import type { HelperMem } from "./helpers.ts";
import type { ReviewStanding } from "./task-sources.ts";
import type { Place, RoutineTrigger } from "./index.ts";

/** How a round runs: one task across rounds (a loop), a fresh task each round (a routine), a task per item (a helper). */
export type KeepRun = "same" | "fresh" | "perItem";

/** on (its health aside), paused (its wakes held), done (its goal met, with evidence), stopped (by the person). */
export type KeepLife = "on" | "paused" | "done" | "stopped";

/** What brings it back. */
export type KeepWake =
  /** A rhythm (D427): from one round's wake to the next. */
  | { kind: "every"; everyMs: number }
  /** Times on the clock (D114), in words (每天 08:00 · 跟着你的时区). */
  | { kind: "at"; words: string }
  /** An arrival: work handed to its address by the person's other agents (D494). */
  | { kind: "arrives" }
  /** A watched fact changed (a PR's CI or reviews, a page, a price), in words; none: the PRs it holds. */
  | { kind: "changes"; words?: string };

/** The mechanism a Keep runs on (principle 16: kept as code). */
export type KeepFrom = { kind: "loop"; taskId: string } | { kind: "routine"; routineId: string } | { kind: "helper"; helperId: string };

/** How a Keep came to be: made as one (keep_make), or carried over on start from an older record. */
export type KeepMade = "keep_make" | "task_loop" | "routine" | "helpers.json";

/** One Keep as the home keeps it (`keep` on stream keep:<keepId>). */
export interface KeepBody {
  keepId: string;
  /** D312: the partner it is for; absent: the default partner. */
  persona?: string;
  /** A short name in the person's language (a helper keeps its own name). */
  title: string;
  /** The person's words, verbatim (or, carried over, the words its record kept). */
  said: string;
  from: KeepFrom;
  run: KeepRun;
  wakes: KeepWake[];
  /** The goal that ends it, in the person's words (judged by the model on facts, never by code). */
  until?: string;
  /** When it speaks, in the person's words (什么时候出声). */
  speaks?: string;
  /** Its limits in words (每天最多接 10 个). */
  limits?: string;
  life: KeepLife;
  /** Paused until this time (absent: until resumed). */
  pausedUntil?: string;
  /** Done: the model's recorded judgment that the goal holds, with its evidence. */
  met?: { at: string; evidence: string };
  createdAt: string;
  /** When it ended (done or stopped). */
  endedAt?: string;
  made: KeepMade;
  /** The model's one reading of its end from the person's words, recorded (principle 21): `until`
   *  then holds its sentence; none: their words give no end; failed: nothing is said. Never asked again. */
  end?: { at: string; said: "until" | "none" | "failed" };
  /** Carried over on start from `made`'s older record (D511's migration), never changing that record. */
  migratedAt?: string;
  /** D533: the last time the person (or the partner) changed it: from then on each round is told its rules as they are now. */
  editedAt?: string;
  /** D540: a one-off ask for its next round only, in the person's words ("这一轮先审 #551"): the
   *  round's wake carries it first, then it is gone. Never its goal (`until`). */
  next?: { text: string; at: string };
}

/** One thing a Keep holds now: a task at work on it, with the PR it owns and where that PR stands. */
export interface KeepItem {
  taskId: string;
  title: string;
  /** work: at it; rest: between rounds; you: something waits for the person; ready: its PR can merge (the merge is theirs). */
  at: "work" | "rest" | "you" | "ready";
  /** What waits for the person, in the task's words. */
  yours?: string;
  /** owner/repo#n, once the task declared it (D483). */
  pr?: string;
  /** D508: where that PR stands. */
  said?: PrSaid;
}

/** One round: one wake, what it did, and whether it spoke. Facts only; `did` is the round's own line. */
export interface KeepRound {
  at: string;
  /** time: its rhythm or its clock; arrival: work handed to it; change: a watched fact changed; now: the person's Look now; first: its first look; edit (D533, not a wake): the person or the partner changed it, `edit` says what. */
  woke: "time" | "arrival" | "change" | "now" | "first" | "edit";
  /** What woke it, in words where there are some (#11030's CI; Codex). */
  wokeWhat?: string;
  /** What happened, in one line to the person in their language: the cheap model's reading of the
   *  round's report, judged once and recorded (principle 21); absent until it has, never the raw
   *  report. A helper's arrival says the piece of work it took. */
  did?: string;
  /** The task's report as it wrote it (to Ducter), shown only behind 看细节 / Details. */
  report?: string;
  /** silent; told: its result went to the person; asked: it waits for the person's answer. */
  spoke: "silent" | "told" | "asked";
  state: "running" | "done" | "failed" | "skipped";
  taskId?: string;
  /** D550: the round changed something by its own structured word (a review_report marking a PR
   *  changed); never read from its words. */
  changed?: true;
  /** D533: a change to the Keep, as a line among its rounds (你改了：每 45 分钟 → 每小时). */
  edit?: KeepEditLine;
}

/** D533: what a person can change on a Keep's page, each with its own control. */
export type KeepField = "said" | "title" | "every" | "at" | "until" | "speaks" | "limits" | "cap" | "where" | "agent" | "address";

/** D533: one field changed, from and to as the page says them (every: minutes; agent: a harness id;
 *  where: a computer's name; at: its words; cap: a number; the rest their words). Absent: none. */
export interface KeepEdit {
  field: KeepField;
  from?: string;
  to?: string;
}

/** D533: one change: who made it and what changed; undo: it put back the change before it. */
export interface KeepEditLine {
  by: "you" | "partner";
  edits: KeepEdit[];
  undo?: true;
}

/** D533: the cap a person may set on a Keep with an address: pieces of work a day before it asks. */
export const KEEP_CAP_MIN = 1;
export const KEEP_CAP_MAX = 30;
/** D533: a Keep's own words: a title or an address, a rule's words, the person's words. */
export const KEEP_TITLE_MAX = 48;
export const KEEP_RULE_MAX = 200;
export const KEEP_SAID_MAX = 2000;

/** A Keep on On hand: one sheet under 看守中 / Looking after (the home's one model of its state). */
export interface KeepSheet {
  id: string;
  title: string;
  persona?: string;
  life: KeepLife;
  run: KeepRun;
  wakes: KeepWake[];
  until?: string;
  /** The model read the person's words as giving no end (没有终点). Neither this nor `until`: say nothing. */
  noEnd?: true;
  /** What it holds now (each item's task, what waits for the person first). */
  items: KeepItem[];
  /** Every task this Keep owns now: a client stands them under the sheet, never in 在做 or 在等;
   *  one that waits for the person stays in 等你 with the Keep's name. */
  taskIds: string[];
  /** How many things wait for the person (each is answered in 等你; the sheet only says the count). */
  asks: number;
  /** Its rhythm, when it has one. */
  everyMs?: number;
  /** Its clock, in words, when it has one (a routine's trigger words). */
  cadence?: string;
  /** When it wakes next (absent while a round runs, paused, or when it wakes on arrivals only). */
  nextAt?: string;
  /** A round runs now. */
  running?: boolean;
  /** How it keeps time, when not on time (D427/D429). */
  health?: OngoingHealth;
  /** Its last change in one sentence: the latest round that did something. */
  line?: { at: string; text: string };
  /** How many of its rounds have their line yet: a client asks for the page again when it grows. */
  lines?: number;
  /** D394: a review loop's standing after its last round. */
  reviews?: ReviewStanding;
  /** Rounds (or pieces of work taken) in the last 7 days. */
  week: number;
  pausedUntil?: string;
  /** Its address in Bridge (a helper): a detail of the Keep, never its home. */
  address?: { name: string; mem: HelperMem; detail?: string };
  since: string;
  endedAt?: string;
}

/** A Keep's own page (keep_result): the sheet, the person's words, its rules, every round. */
export interface KeepPage extends KeepSheet {
  said: string;
  speaks?: string;
  limits?: string;
  met?: { at: string; evidence: string };
  /** Newest first. */
  rounds: KeepRound[];
  /** Where its rounds run and who does them. */
  where?: { deviceName?: string; harness?: string };
  /** The questions of its tasks still open (each answered in place, the same card as in 等你). */
  decisions: string[];
  /** D407: the small app it fills. */
  app?: { id: string; name: string };
  /** D533: what the person may change here in place, each with its control (the rest by talking). */
  editable: KeepField[];
  /** D533: its clock, for 什么时候醒's editor (a Keep on a schedule). */
  at?: Extract<RoutineTrigger, { kind: "time" }>;
  /** D533: pieces of work it takes in a day before it asks (a Keep with an address). */
  cap?: number;
  /** D533: the computer its rounds go to ("local": the home) and the agent, when one was named; absent: Ducter picks. */
  device?: string;
  agent?: string;
}

/** What 暂停 / Pause, 恢复 / Resume, 现在看一次 / Look now and 停下 / Stop do to a Keep. */
export type KeepAction = { action: "pause"; until?: string } | { action: "resume" } | { action: "look_now" } | { action: "stop" };

/** D511: the receipt card under the partner's words when a Keep was made (the first-made moment). */
export interface KeepCard {
  id: string;
  title: string;
  /** Its four lines, each its own row: when it wakes, when it speaks, until when, where. */
  when: string;
  speaks?: string;
  until?: string;
  where?: string;
  /** The first round's result, when it ran at once. */
  first?: string;
  /** The first Keep ever: the one line on where it lives. */
  firstEver?: boolean;
  /** Undone (撤销): the card says so and offers nothing more. */
  undone?: boolean;
}

/** D511: how a Keep reads at its right edge: when it wakes next, or why it doesn't. */
export function keepBeat(k: Pick<KeepSheet, "life" | "nextAt" | "running" | "wakes">): "running" | "next" | "arrives" | "paused" | "ended" | "none" {
  if (k.life === "done" || k.life === "stopped") return "ended";
  if (k.life === "paused") return "paused";
  if (k.running) return "running";
  if (k.nextAt) return "next";
  return k.wakes.some((w) => w.kind === "arrives") ? "arrives" : "none";
}

/**
 * D550: a quiet round, from its structured outcome only, never its words (principle 21; the rule
 * D544 folds an opened round task by): its rhythm or its clock woke it (not a watched change, work
 * handed to it, the person's Look now or its first look), it ended done (not running, failed or
 * skipped), it said nothing (not told, not asked) and changed nothing (no review_report marked a
 * PR changed). A change to the Keep (D533) is never quiet.
 */
export function quietRound(r: KeepRound): boolean {
  return r.woke === "time" && r.spoke === "silent" && r.state === "done" && !r.changed && !r.edit;
}

/** D550: a run of quiet rounds as one row: its rounds (newest first), the newest's and the oldest's time. */
export interface RoundFold {
  fold: KeepRound[];
  from: string;
  to: string;
}

/**
 * D550: the rounds as drawn, newest first: every run of two or more consecutive quiet rounds,
 * anywhere in the list, is one fold (又看过 {n} 次，都没有变化，{from} 到 {to}), opened in place. The
 * newest round is never folded; a lone quiet round stands as itself.
 */
export function foldRounds(rounds: KeepRound[]): ({ round: KeepRound } | RoundFold)[] {
  const out: ({ round: KeepRound } | RoundFold)[] = [];
  const newest = rounds.findIndex((r) => r.woke !== "edit");
  let run: KeepRound[] = [];
  const close = () => {
    if (run.length >= 2) out.push({ fold: run, from: run.at(-1)!.at, to: run[0]!.at });
    else for (const r of run) out.push({ round: r });
    run = [];
  };
  rounds.forEach((r, i) => {
    if (i !== newest && quietRound(r)) return void run.push(r);
    close();
    out.push({ round: r });
  });
  close();
  return out;
}

// ---------- the home's Keeps, as the partner uses them (core/src/keeps.ts) ----------

export interface KeepMakeInput {
  title: string;
  /** The person's words, verbatim. */
  said: string;
  /** What each round does, self-contained. */
  brief: string;
  /** What brings it back: times on the clock, a watched fact, or an address other agents hand work to. */
  wake: { at?: Extract<RoutineTrigger, { kind: "time" }>; watch?: Extract<RoutineTrigger, { kind: "condition" }>; address?: true };
  whenWords?: string;
  until?: string;
  speaks?: string;
  limits?: string;
  place?: Place;
  effect?: "read_only" | "drafts";
  /** The first round now (the model's call: a fare has a value today, a weekly report doesn't); a watch always looks once. */
  lookNow?: boolean;
  persona?: string;
}

export interface KeepChange {
  title?: string;
  until?: string;
  speaks?: string;
  limits?: string;
  /** A new rhythm in minutes (a task in rounds). */
  everyMinutes?: number;
  /** New times on the clock (a Keep on a schedule). */
  at?: Extract<RoutineTrigger, { kind: "time" }>;
  /** D533: the person's own words, edited (their rules change only through a proposal they took). */
  said?: string;
  /** D533: pieces of work a day before it asks (a Keep with an address), KEEP_CAP_MIN..KEEP_CAP_MAX. */
  cap?: number;
  /** D533: the computer its rounds go to: "local", a worker's id, or "auto" (Ducter picks). */
  where?: string;
  /** D533: who does its rounds: an agent (a harness), or "auto". */
  agent?: string;
  /** D533: its name in Bridge, the one other agents find it by. */
  address?: string;
  /** A gesture: pause (until a time), resume, look now, stop. */
  act?: KeepAction;
  /** D540: a one-off ask for its next round only (a task in rounds); empty clears it. */
  next?: string;
}

/** D533: what a change did: each field from and to, and the change that puts it back (Undo). */
export type KeepChanged = { ok: true; keep: KeepBody; edits: KeepEdit[]; undo?: KeepChange } | { ok: false; error: string };

/** D533: the rules the cheap model read from the person's edited words, shown as a diff before one Go. */
export type KeepProposal = { ok: true; said: string; change: KeepChange; edits: KeepEdit[] } | { ok: false; said: string; error: string };

export interface KeepsApi {
  /** Every Keep, ended ones too. */
  all(): KeepBody[];
  get(id: string): KeepBody | undefined;
  /** The Keep a task is a round or an item of. */
  ofTask(taskId: string): { id: string; name: string } | undefined;
  /** A task a Keep ran one of its rounds in (a routine's run): its page holds it, not On hand's lanes or Past's list. */
  isRound(taskId: string): boolean;
  /** On hand's 看守中: this partner's Keeps on or paused. */
  sheets(persona: string): KeepSheet[];
  /** Ended ones, newest first (已结束 / Ended). */
  ended(persona: string): KeepSheet[];
  page(id: string): KeepPage | undefined;
  act(id: string, a: KeepAction): Promise<{ ok: boolean; message?: string }>;
  make(input: KeepMakeInput): Promise<{ ok: true; keep: KeepBody; card: KeepCard } | { ok: false; error: string }>;
  /** One path for the partner's keep_change and the person's edit on the page (D533): checked in code, recorded as a line among its rounds. */
  change(id: string, c: KeepChange, o?: { by?: "you" | "partner"; undo?: boolean }): Promise<KeepChanged>;
  /** D533: the person's edited words read once by the cheap model into the rules they change (nothing applied). */
  propose(id: string, said: string): Promise<KeepProposal>;
  /** Every mechanism's record without a Keep gets one; every Keep's life follows its mechanism. */
  sync(): { made: number; changed: number };
  /** The one-line answer for one Keep in the person's language (keep_list's `say`). */
  say(id: string): string;
  stop(): void;
}
