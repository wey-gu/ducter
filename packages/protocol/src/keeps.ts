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
  /** Carried over on start from `made`'s older record (D511's migration), never changing that record. */
  migratedAt?: string;
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
  /** time: its rhythm or its clock; arrival: work handed to it; change: a watched fact changed; now: the person's Look now; first: its first look. */
  woke: "time" | "arrival" | "change" | "now" | "first";
  /** What woke it, in words where there are some (#11030's CI; Codex). */
  wokeWhat?: string;
  /** What it did, in one line (the round's report). */
  did?: string;
  /** silent; told: its result went to the person; asked: it waits for the person's answer. */
  spoke: "silent" | "told" | "asked";
  state: "running" | "done" | "failed" | "skipped";
  taskId?: string;
}

/** A Keep on On hand: one sheet under 在照看的 / Looking after (the home's one model of its state). */
export interface KeepSheet {
  id: string;
  title: string;
  persona?: string;
  life: KeepLife;
  run: KeepRun;
  wakes: KeepWake[];
  until?: string;
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

/** Silent rounds folded: the rounds as drawn, newest first; a run of silent rounds after the first
 *  `keep` shown becomes one fold with its count (又看过 {n} 次，都没有变化). */
export function foldRounds(rounds: KeepRound[], keep = 4): ({ round: KeepRound } | { fold: number; since: string })[] {
  const out: ({ round: KeepRound } | { fold: number; since: string })[] = [];
  let shown = 0;
  for (const r of rounds) {
    const quiet = r.spoke === "silent" && r.state !== "running" && r.state !== "failed";
    const last = out.at(-1);
    if (quiet && shown >= keep) {
      if (last && "fold" in last) {
        last.fold++;
        last.since = r.at;
      } else out.push({ fold: 1, since: r.at });
      continue;
    }
    out.push({ round: r });
    shown++;
  }
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
  /** A gesture: pause (until a time), resume, look now, stop. */
  act?: KeepAction;
}

export interface KeepsApi {
  /** Every Keep, ended ones too. */
  all(): KeepBody[];
  get(id: string): KeepBody | undefined;
  /** The Keep a task is a round or an item of. */
  ofTask(taskId: string): { id: string; name: string } | undefined;
  /** On hand's 在照看的: this partner's Keeps on or paused. */
  sheets(persona: string): KeepSheet[];
  /** Ended ones, newest first (照看过的 / Looked after before). */
  ended(persona: string): KeepSheet[];
  page(id: string): KeepPage | undefined;
  act(id: string, a: KeepAction): Promise<{ ok: boolean; message?: string }>;
  make(input: KeepMakeInput): Promise<{ ok: true; keep: KeepBody; card: KeepCard } | { ok: false; error: string }>;
  change(id: string, c: KeepChange): Promise<{ ok: true; keep: KeepBody } | { ok: false; error: string }>;
  /** Every mechanism's record without a Keep gets one; every Keep's life follows its mechanism. */
  sync(): { made: number; changed: number };
  /** The one-line answer for one Keep in the person's language (keep_list's `say`). */
  say(id: string): string;
  stop(): void;
}
