// D662 (research/245 §3.5): 视图 / Views. One saved way of looking at On hand: its filter, its
// sort and its mode. A person's views are kept on the home (<dataDir>/views.json) so every device
// has them; the three built-ins are sent with the board and shown only while they have rows.
//
// A view's filter is deliberately small: the five chips the person can already press in the list
// (state, project, computer, agent, from-source), plus two facts the three built-ins need (a run
// over six hours, a PR that waits). A view never changes the project lens: the lens column stays.

/** 概览 / Overview (today's board) or 列表 / List (the dense table). */
export type BoardMode = "overview" | "list";

/** 按什么排 / What order the rows are in: urgency (the default), the last change, or age. */
export type TaskSort = "urgency" | "changed" | "age";

/** One bulk action on a selection (research/245 §3.5). Each goes through the task's own path:
 *  end (with a Keep's end), pause, continue, move to a computer, reassign the agent, put down. */
export type BulkOp = "end" | "pause" | "continue" | "move" | "reassign" | "drop";

/** The list's filter chips, and the two facts a built-in view adds. */
export interface TaskFilter {
  /** One truth state, as D661 derives it (done includes a failed task). */
  state?: "needs_you" | "stopped" | "working" | "waiting" | "done";
  /** A project identity (ProjectLens.key). */
  project?: string;
  /** A computer's device id ("local" is the home). */
  computer?: string;
  /** An AI agent's harness id. */
  agent?: string;
  /** 来自 / From: a to-do source's key (task.card.source.kind or its account). */
  source?: string;
  /** 跑了很久的 / Running long: working or in rounds for more than six hours. */
  long?: boolean;
  /** PR 在等 / A PR waiting: an open PR, or one ready to merge. */
  pr?: boolean;
}

/** One saved view. `builtin` names the three the home always offers (their names are the client's
 *  words); a person's view has no `builtin` and its name is their own. */
export interface BoardView {
  id: string;
  name: string;
  filter: TaskFilter;
  sort: TaskSort;
  mode: BoardMode;
  builtin?: "needs_today" | "running_long" | "prs_waiting";
}

/** The three views every home has; a client draws one only while it has rows. */
export const BUILTIN_VIEWS: BoardView[] = [
  { id: "builtin:needs-today", name: "", filter: { state: "needs_you" }, sort: "urgency", mode: "list", builtin: "needs_today" },
  { id: "builtin:running-long", name: "", filter: { long: true }, sort: "age", mode: "list", builtin: "running_long" },
  { id: "builtin:prs-waiting", name: "", filter: { pr: true }, sort: "changed", mode: "list", builtin: "prs_waiting" },
];

/** A saved view's name may be this long (a row in the project column, and the menu that renames it). */
export const VIEW_NAME_MAX = 32;
