// D360: a group of tasks that are one piece of work (登录页重做 in three tasks). Made by the partner
// when it splits one request into several tasks (task_open's `group`), by the person's words ("把这几
//件放一起", the partner's task_group), or by hand on On hand. Tasks of one group that work in the
// same folder run one after another: the later ones are held by the home (not tasks yet, no agent
// spent) and each starts when the one before it is done, from that one's unmerged branch. Kept in
// <dataDir>/task-groups.json (user data, like projects): the tasks themselves stay in the Log.
// design/on-hand.md §Groups.

/** How a group's members that share a folder run. */
export type GroupOrder = "one_by_one" | "side_by_side";

/** A member: a task that exists, or one held in line (it opens when the one before it is done). */
export type GroupMember =
  | { taskId: string }
  | {
      /** A held member's own id (until it opens as a task). */
      key: string;
      title: string;
      at: string;
      /** It opens on another computer than the one before it (said on its row). */
      device?: string;
    };

export interface TaskGroupView {
  id: string;
  name: string;
  order: GroupOrder;
  /** Who made it: the partner (a split, the person's words) or the person by hand. */
  by: "partner" | "you";
  persona: string;
  members: GroupMember[];
  /**
   * The line stopped: a member ended without being done (it failed, or the person put it down); what
   * is held after it waits for the person: 接着做下一个 / Go on with the next, or 后面的不做了 / Drop the
   * rest. Cleared when that task is done after all (continued) or the person decides.
   */
  stopped?: { taskId: string; why: "failed" | "dropped" };
  createdAt: string;
  /** D385: made by a hand-over of to-dos: its note, shape, plan and review (design/handover.md). */
  hand?: import("./handover.ts").GroupHandView;
}

/** Client → home: make, rename, reorder or take apart a group; move a stopped line on. */
export type TaskGroupFrame = {
  t: "task_group";
  /** make: a new group of these tasks (≥ 2); add: these tasks into groupId. */
  op: "make" | "add" | "rename" | "remove" | "dissolve" | "move" | "order" | "next" | "drop_rest";
  groupId?: string;
  name?: string;
  taskIds?: string[];
  /** remove / move: a task id or a held member's key. */
  member?: string;
  /** move: the member's new index among the group's held members (0 = next to open). */
  to?: number;
  order?: GroupOrder;
  clientId?: string;
};

/**
 * D454: 移走 / Remove a finished card from On hand: a task that is done or didn't work out, or a group
 * none of whose parts is still at work (what waits in line after a stopped part is dropped with it).
 * It leaves On hand on every device and stays in Past tasks; `back` puts it back (the toast's 撤销).
 * A task put away that goes back to work (再试一次, 接着做) comes back by itself. Kept in
 * <dataDir>/onhand-away.json.
 */
export type OnHandAwayFrame = { t: "onhand_away"; taskIds?: string[]; groupId?: string; back?: boolean; clientId?: string };

export const GROUP_NAME_MAX = 40;
/** How many groups a home keeps (the oldest finished ones go first). */
export const GROUPS_MAX = 200;
/** How many members a group holds. */
export const GROUP_MEMBERS_MAX = 12;

export const isHeld = (m: GroupMember): m is Extract<GroupMember, { key: string }> => "key" in m;
