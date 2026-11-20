// D407: a routine fills a small app (design/apps.md "A routine fills an app"). A task that repeats
// keeps one of the person's apps current instead of writing the same report again: the review
// routine's 审查看板 / Review board is written by the home from its review_report (the same state
// the Ongoing card's line reads, never a second copy kept by the task); any other repeating task
// given an app writes its data with the app_data tool (data only, never the file). Ducter offers
// once, after BOARD_OFFER_AFTER rounds of the same shape: 要不要把这些做成一个看板？ behind Go.
import { randomBytes } from "node:crypto";
import { APP_TASK_KEYS_PER_CALL, BOARD_OFFER_AFTER, type AppMeta, type Bodies, type ReviewBoard } from "@ducter/protocol";
import type { LogStore } from "@ducter/protocol/src/internal.ts";
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
  /** The task looks again on its own timer (it repeats). */
  repeats: (taskId: string) => boolean;
  /** Is this task a review routine (sees review_report)? */
  isReview: (taskId: string) => boolean;
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
  /** Make the review board for a task now (Go on the offer, or the partner's app tool without a file). */
  makeReviewBoard(taskId: string): { ok: true; app: AppMeta } | { ok: false; error: string };
  /**
   * A round's done report from a task that keeps one of the person's apps current wakes nobody: the
   * app is the news (D394's silence at the source). A question, a block or a failure still does.
   */
  wakes(e: import("@ducter/protocol").LogEvent): boolean;
  /** The offer, now (also how tests and the eval put it up). */
  offer(taskId: string, kind: "reviews" | "reports"): string | undefined;
}

export function createBoards(d: BoardsDeps): Boards {
  const reports = new Map<string, number>();
  const write = (taskId: string) => {
    const pile = d.pile();
    if (!pile) return;
    for (const a of d.apps.byTask(taskId)) {
      if (a.kind !== "reviews") continue;
      const b = pile.board(taskId);
      if (b) d.apps.put(a.id, "board", b, "task");
    }
  };
  const appOf = (taskId: string) => d.apps.byTask(taskId).find((a) => a.persona === d.persona()) ?? d.apps.byTask(taskId)[0];
  const offer = (taskId: string, kind: "reviews" | "reports") => {
    if (d.apps.offered(taskId) || appOf(taskId)) return undefined;
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
    const had = d.apps.byTask(taskId).find((a) => a.kind === "reviews");
    if (had) return { ok: true, app: had };
    const title = d.title(taskId);
    if (!title) return { ok: false, error: `unknown task ${taskId}` };
    const r = d.apps.make(d.persona(), { name: REVIEW_BOARD_NAME[d.lang()], html: REVIEW_BOARD_HTML, task: { id: taskId, title }, kind: "reviews" });
    if (r.ok) write(taskId);
    return r;
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
    if (c.kind !== "give" || !c.task) return;
    const a = d.apps.get(c.id);
    if (!a) return;
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
  // while it rests on its own timer) is the moment to offer, once.
  d.log.subscribe((e) => {
    if (e.kind !== "report") return;
    const b = e.body as Bodies["report"];
    if (b.state !== "done" || d.isReview(b.taskId)) return;
    const n = (reports.get(b.taskId) ?? 0) + 1;
    reports.set(b.taskId, n);
    if (n >= BOARD_OFFER_AFTER && d.repeats(b.taskId)) offer(b.taskId, "reports");
  });
  return {
    write,
    wakes(e) {
      if (e.kind !== "report") return true;
      const b = e.body as Bodies["report"];
      return !(b.state === "done" && !b.questions?.length && d.apps.byTask(b.taskId).length > 0);
    },
    afterRound(taskId) {
      const pile = d.pile();
      if (pile && pile.rounds(taskId) >= BOARD_OFFER_AFTER) offer(taskId, "reviews");
    },
    appOf,
    makeReviewBoard,
    offer,
  };
}

/** The app_data task tool's input (data only: keys and JSON values). */
export const APP_DATA_SCHEMA = {
  type: "object",
  properties: {
    app: { type: "string", description: "The app's id (from the message that gave it to you)" },
    set: { type: "object", description: `Keys to write, each a whole JSON value (null removes the key); at most ${APP_TASK_KEYS_PER_CALL}` },
  },
  required: ["app", "set"],
} as const;
