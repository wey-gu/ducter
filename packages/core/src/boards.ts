// D407: a routine fills a small app (design/apps.md "A routine fills an app"). A task that repeats
// keeps one of the person's apps current instead of writing the same report again: the review
// routine's 审查看板 / Review board is written by the home from its review_report (the same state
// the Ongoing card's line reads, never a second copy kept by the task); any other repeating task
// given an app writes its data with the app_data tool (data only, never the file). Ducter offers
// once, after BOARD_OFFER_AFTER rounds of the same shape: 要不要把这些做成一个看板？ behind Go.
// D615: a board is only for work that comes back in rounds (a Keep, a loop, a routine); a
// one-off task never gets an offer, whatever its report count, and an offer that no longer qualifies
// is withdrawn (decision_resolved hold, by "withdrawn") rather than answered into an app.
import { randomBytes } from "node:crypto";
import { APP_TASK_KEYS_PER_CALL, BOARD_OFFER_AFTER, appTasks, type AppMeta, type AppTask, type Bodies, type ReviewBoard } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
import { jsonText } from "@ducter/protocol/src/tool-schema.ts";
import type { AppsStore } from "./apps.ts";
import { REVIEW_BOARD_HTML, REVIEW_BOARD_NAME } from "./review-board.ts";

type Lang = "zh" | "en";

export interface BoardsDeps {
  log: LogStore;
  apps: AppsStore;
  persona: () => string;
  lang: () => Lang;
  /** The task's title (and that it exists). */
  title: (taskId: string) => string | undefined;
  /** A review task's board data and round count (the pile; undefined before the to-do sources start). */
  pile: () => { board(taskId: string): ReviewBoard | undefined; rounds(taskId: string): number } | undefined;
  /** D615: the task belongs to work that comes back in rounds (a Keep's task, a loop, a routine run). */
  runsInRounds: (taskId: string) => boolean;
  /** D615: the board offers still open at the home. */
  openOffers: () => Bodies["decision"][];
  /** D615: take back an open offer (decision_resolved hold, by "withdrawn"). */
  withdraw: (decisionId: string) => boolean;
  /** Is this task a review routine (sees review_report)? */
  isReview: (taskId: string) => boolean;
  /** D612: the Keep a task's rounds belong to, when the app follows a Keep. */
  keepOf: (taskId: string) => AppTask | undefined;
  /** D612: the tasks a Keep's rounds run in now (told how to fill its app). */
  tasksOfKeep: (keepId: string) => AppTask[];
  /** Says something to a task (its next turn reads it). */
  tell: (taskId: string, text: string) => void;
}

const W = {
  zh: {
    q: "要不要把这些做成一个看板？",
    go: "做成看板",
    hold: "不用了",
    made: "做好了。每一轮都会更新它，不用再读一遍报告。",
  },
  en: {
    q: "Keep these on a board?",
    go: "Make a board",
    hold: "No thanks",
    made: "Done. Each round updates it, so there's no report to read again.",
  },
} as const;

export interface Boards {
  /** The review board of this task written again from the pile (the pile's onBoard calls it). */
  write(taskId: string): void;
  /** After a review task's round: offer a board once when it has none (the board itself is written by write). */
  afterRound(taskId: string): void;
  /** The app a task keeps current (the Ongoing card opens it). */
  appOf(taskId: string): AppMeta | undefined;
  /** Make the review board for a task now (Go on the offer, or the partner's app tool without a file). One per person: a second review task's work joins it. */
  makeReviewBoard(taskId: string): { ok: true; app: AppMeta } | { ok: false; error: string };
  /** D612: what a round of this task should write into the app it was given (a task's or its Keep's), or "". */
  appNote(taskId: string): string;
  /**
   * A round's done report from a task that keeps one of the person's apps current wakes nobody: the
   * app is the news (D394's silence at the source). A question, a block or a failure still does.
   */
  wakes(e: import("@ducter/protocol").LogEvent): boolean;
  /** The offer, now (also how tests and the eval put it up). */
  offer(taskId: string, kind: "reviews" | "reports"): string | undefined;
  /** D615: take back every open offer whose task doesn't run in rounds (on start and whenever the rule is read). */
  sweep(): void;
}

export function createBoards(d: BoardsDeps): Boards {
  const reports = new Map<string, number>();
  // D612: a board shows only the work of the task(s) it follows, never the global pile: merge
  // the rounds of the tasks written on this one app (a second review task joined the same board).
  const merge = (apps: AppMeta[]): ReviewBoard | undefined => {
    const pile = d.pile();
    if (!pile) return undefined;
    const boards = apps.flatMap((a) => appTasks(a)).map((t) => pile.board(t.id)).filter((b): b is ReviewBoard => !!b);
    if (!boards.length) return undefined;
    const prs = new Map<string, ReviewBoard["prs"][number]>();
    for (const b of boards.sort((a, c) => a.at.localeCompare(c.at))) for (const p of b.prs) prs.set(p.ref, p);
    const rows = [...prs.values()];
    return {
      at: boards.map((b) => b.at).sort().at(-1)!,
      waiting: rows.length,
      again: rows.filter((p) => p.changed).length,
      same: rows.filter((p) => !p.changed).length,
      drafted: rows.filter((p) => p.draft === "drafted").length,
      prs: rows.sort((a, b) => Number(b.draft === "drafted") - Number(a.draft === "drafted") || Number(b.changed) - Number(a.changed) || a.ref.localeCompare(b.ref)),
    };
  };
  const write = (taskId: string) => {
    for (const a of d.apps.byTask(taskId)) {
      if (a.kind !== "reviews") continue;
      const b = merge([a]);
      if (b) d.apps.put(a.id, "board", b, "task");
    }
  };
  const appOf = (taskId: string) => d.apps.byTask(taskId).find((a) => a.persona === d.persona()) ?? d.apps.byTask(taskId)[0];
  // D615: an offer made by an older version (or before its task stopped coming back) is taken
  // back, never answered into an app: the offer is settled quietly, by "withdrawn", before it can
  // be tapped. Read whenever the offer rule is evaluated, and once on start.
  const sweep = () => {
    for (const card of d.openOffers()) {
      if (!card.board || d.runsInRounds(card.board.taskId)) continue;
      d.withdraw(card.decisionId);
    }
  };
  const offer = (taskId: string, kind: "reviews" | "reports") => {
    sweep();
    if (d.apps.offered(taskId) || appOf(taskId)) return undefined;
    // D615: only work that comes back in rounds is offered a board, whatever its report count.
    // A one-off task's own page, its PR and the hand-off say everything.
    if (!d.runsInRounds(taskId)) return undefined;
    // D612: only a review task is offered a reviews board; one board per purpose, so with one
    // already there the offer is nothing (the task's work joins it when asked, never a second board).
    if (kind === "reviews" && (!d.isReview(taskId) || d.apps.list(d.persona()).some((a) => a.kind === "reviews"))) return undefined;
    const title = d.title(taskId);
    if (!title) return undefined;
    d.apps.markOffered(taskId);
    const w = W[d.lang()];
    const body: Bodies["decision"] = {
      decisionId: `d_${randomBytes(6).toString("hex")}`,
      question: w.q,
      goLabel: w.go,
      holdLabel: w.hold,
      defaultOption: "hold",
      reversible: false,
      board: { taskId, title, kind },
    };
    d.log.append({ stream: "channel", origin: "partner", kind: "decision", body });
    return body.decisionId;
  };
  const makeReviewBoard = (taskId: string): { ok: true; app: AppMeta } | { ok: false; error: string } => {
    if (!d.isReview(taskId)) return { ok: false, error: "This task isn't a review task: a review board is only for a task whose job is reviewing other people's PRs. A task's own PR is followed by the Babysitter or the hand-off, not a board." };
    // D615: a board is only for work that comes back in rounds. A one-off task's own page and
    // PR say everything; an offer made before its task stopped coming back is not honoured.
    if (!d.runsInRounds(taskId)) return { ok: false, error: "This task doesn't run in rounds: a board is for work that comes back (a Keep, a loop, a routine). Its own page, its PR and the hand-off say everything. If the person asked for a board in words, make it a snapshot (snapshot: true, no task) from what you know; otherwise say one plain line why and make nothing." };
    const title = d.title(taskId);
    if (!title) return { ok: false, error: `unknown task ${taskId}` };
    // D612: one board per purpose: the person's existing review board takes this task's work.
    const had = d.apps.list(d.persona()).find((a) => a.kind === "reviews");
    if (had) {
      const task: AppTask = { id: taskId, title };
      d.apps.addTask(had.id, task);
      write(taskId);
      return { ok: true, app: d.apps.get(had.id) ?? had };
    }
    const r = d.apps.make(d.persona(), { name: REVIEW_BOARD_NAME[d.lang()], html: REVIEW_BOARD_HTML, task: { id: taskId, title }, kind: "reviews" });
    if (r.ok) write(taskId);
    return r;
  };
  const appNote = (taskId: string): string => {
    const keep = d.keepOf(taskId);
    const apps = [...d.apps.byTask(taskId), ...(keep ? d.apps.byKeep(keep.id) : [])].filter((a) => !a.kind);
    if (!apps.length) return "";
    return apps
      .map((a) => {
        const keys = [...new Set([...(d.apps.html(a.id) ?? "").matchAll(/ducter\.get\(\s*["'`]([^"'`]{1,64})["'`]/g)].map((x) => x[1]!))].slice(0, 12);
        return `[Ducter] The person keeps this work's rounds in their small app "${a.name}" (app ${a.id}). Each round, write what stands now into it with app_data (app ${a.id}, set {key: value}; null removes a key)${keys.length ? `; the app reads the keys ${keys.join(", ")}` : ""}. Write whole values, once a round; a round that only updated it needs no report_to_main.`;
      })
      .join("\n");
  };
  // The offer's answer. Reviews: the board is made now, its card under one line. Reports: the
  // partner wakes on the answer and makes the app (render.ts tells it how).
  d.log.subscribe((e) => {
    if (e.kind !== "decision_resolved") return;
    const r = e.body as Bodies["decision_resolved"];
    if (r.option !== "go" || r.settled) return;
    const card = d.log.read({ stream: "channel", kinds: ["decision"], limit: 400 }).find((x) => (x.body as Bodies["decision"]).decisionId === r.decisionId)?.body as Bodies["decision"] | undefined;
    if (card?.board?.kind !== "reviews") return;
    const m = makeReviewBoard(card.board.taskId);
    if (!m.ok) return void console.warn("[boards] couldn't make the review board:", m.error);
    d.log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: W[d.lang()].made, app: { id: m.app.id, name: m.app.name, version: m.app.version, change: "made" } } });
  });
  // A task given an app (made for it, or given later) hears how to fill it, once.
  d.apps.onChange((c) => {
    if (c.kind !== "give" || (!c.task && !c.keep)) return;
    const a = d.apps.get(c.id);
    if (!a) return;
    if (!c.task) {
      // D612: an app given to a Keep: every task its rounds run in hears how to fill it.
      for (const t of c.keep ? d.tasksOfKeep(c.keep.id) : []) {
        const text = appNote(t.id);
        if (text) d.tell(t.id, text);
      }
      return;
    }
    if (a.kind === "reviews") {
      d.tell(c.task.id, `[Ducter] The person now keeps your rounds on their small app "${a.name}": Ducter fills it from each review_report (every PR waiting on them, with its title and ci state), so keep calling review_report once a round and say nothing else between rounds.`);
      return;
    }
    const keys = [...new Set([...(d.apps.html(a.id) ?? "").matchAll(/ducter\.get\(\s*["'`]([^"'`]{1,64})["'`]/g)].map((x) => x[1]!))].slice(0, 12);
    d.tell(
      c.task.id,
      `[Ducter] The person now keeps this work's rounds in their small app "${a.name}" (app ${a.id}). Each round, write what stands now into it with app_data (app ${a.id}, set {key: value}; null removes a key)${keys.length ? `; the app reads the keys ${keys.join(", ")}` : ""}. Write whole values (a key's value is replaced), once a round. Then don't report_to_main for a round that only updated it: report only when something needs the person.`,
    );
  });
  // Another repeating task's reports: the same shape again and again (BOARD_OFFER_AFTER of them
  // while it rests on its own timer) is the moment to offer, once. D615: the count alone never
  // offers anything; the task must also belong to work that comes back in rounds.
  d.log.subscribe((e) => {
    if (e.kind !== "report") return;
    const b = e.body as Bodies["report"];
    if (b.state !== "done" || d.isReview(b.taskId)) return;
    sweep();
    const n = (reports.get(b.taskId) ?? 0) + 1;
    reports.set(b.taskId, n);
    if (n >= BOARD_OFFER_AFTER) offer(b.taskId, "reports");
  });
  return {
    write,
    wakes(e) {
      if (e.kind !== "report") return true;
      const b = e.body as Bodies["report"];
      const keep = d.keepOf(b.taskId);
      const follows = d.apps.byTask(b.taskId).length > 0 || (!!keep && d.apps.byKeep(keep.id).length > 0);
      return !(b.state === "done" && !b.questions?.length && follows);
    },
    afterRound(taskId) {
      if (!d.isReview(taskId)) return;
      sweep();
      const pile = d.pile();
      if (pile && pile.rounds(taskId) >= BOARD_OFFER_AFTER) offer(taskId, "reviews");
    },
    appOf,
    makeReviewBoard,
    appNote,
    offer,
    sweep,
  };
}

/** The app_data task tool's input (data only: keys and JSON values). */
export const APP_DATA_SCHEMA = {
  type: "object",
  properties: {
    app: { type: "string", description: "The app's id (from the message that gave it to you)" },
    set: jsonText(`Keys to write, each a whole JSON value (null removes the key); at most ${APP_TASK_KEYS_PER_CALL}`),
  },
  required: ["app", "set"],
} as const;
