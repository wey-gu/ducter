// D360: 分组 / Groups on On hand, as data: which groups stand on the board, in which state section
// (the most urgent member's), how far along each is, and what its stopped line says. Pure, so the
// web's tests read it without a DOM; onhand.tsx draws it (the Mac's views/groups.go does the same).
import type { GroupMember, TaskGroupView } from "@ducter/protocol";
import type { Attention } from "@ducter/protocol";

/** One member as the card draws it. */
export type MemberRow =
  | { kind: "task"; taskId: string; part: number; attention: Attention | undefined }
  | { kind: "held"; key: string; part: number; title: string; device?: string };

export interface BoardGroup {
  g: TaskGroupView;
  /** The state section it stands in: 0 needs you, 1 working, 2 waiting, 3 done today. */
  lane: number;
  rows: MemberRow[];
  /** Its tasks that are on the board (they leave their own sections). */
  ids: Set<string>;
  done: number;
  of: number;
  /** The stopped line, when the line waits for the person: which part ended, which part is next, how many wait. */
  stopped?: { why: "failed" | "dropped"; part: number; next: number; waiting: number; taskId: string };
}

const isHeld = (m: GroupMember): m is Extract<GroupMember, { key: string }> => "key" in m;

/**
 * The groups to draw: two or more members and at least one task on the board (in the lens's lanes).
 * laneOf: a task's lane on the board (0..3), or -1 when it isn't on it.
 */
export function boardGroups(groups: TaskGroupView[] | undefined, laneOf: (taskId: string) => number, attentionOf: (taskId: string) => Attention | undefined, persona?: string): BoardGroup[] {
  const out: BoardGroup[] = [];
  for (const g of groups ?? []) {
    // D385: a hand-over's group stands with one part too (its plan, or as one task).
    if (g.members.length < 2 && !(g.hand && g.members.length)) continue;
    if (persona && g.persona && g.persona !== persona) continue;
    // D385: plan first's own part is the plan, said by the card's plan block, never a numbered part.
    const plan = g.hand?.plan?.taskId;
    const parts = plan ? g.members.filter((m) => isHeld(m) || m.taskId !== plan) : g.members;
    const rows: MemberRow[] = parts
      .map((m, i): MemberRow => (isHeld(m) ? { kind: "held", key: m.key, part: i + 1, title: m.title, ...(m.device ? { device: m.device } : {}) } : { kind: "task", taskId: m.taskId, part: i + 1, attention: attentionOf(m.taskId) }))
      // D471: a part whose task is off the board (removed, gone) is no row: a lone number said nothing.
      .filter((r) => r.kind === "held" || laneOf(r.taskId) >= 0);
    // D471: one part left is that task's own row, never a group of one.
    if (!g.hand && rows.length < 2) continue;
    const all = [...rows.flatMap((r) => (r.kind === "task" ? [r.taskId] : [])), ...(plan ? [plan] : [])];
    const lanes = all.map(laneOf).filter((l) => l >= 0);
    if (!lanes.length) continue;
    const ids = new Set(all.filter((id) => laneOf(id) >= 0));
    const done = rows.filter((r) => markOf(r) === "done").length;
    let stopped: BoardGroup["stopped"];
    if (g.stopped) {
      const at = rows.findIndex((r) => r.kind === "task" && r.taskId === g.stopped!.taskId);
      const after = rows.slice(at + 1).filter((r) => r.kind === "held");
      if (at >= 0 && after.length) stopped = { why: g.stopped.why, part: at + 1, next: after[0]!.part, waiting: after.length, taskId: g.stopped.taskId };
    }
    // A stopped line waits for the person: it stands with what needs them. D385: so does a plan
    // waiting to be looked at, and a finished hand-over offering review together.
    const waits = !!g.hand && ((!!g.hand.plan && (g.hand.plan.state === "ready" || g.hand.plan.state === "held" || g.hand.plan.state === "failed")) || g.hand.review === "ready");
    out.push({ g, lane: stopped || waits ? 0 : Math.min(...lanes), rows, ids, done, of: rows.length, ...(stopped ? { stopped } : {}) });
  }
  return out;
}

/** The rows a folded card shows: what needs you, what works, the next one in line; the rest under "n more". */
export function foldedRows(b: BoardGroup): { shown: MemberRow[]; rest: number } {
  if (b.rows.length <= 3) return { shown: b.rows, rest: 0 };
  const live = (r: MemberRow) => r.kind === "task" && (r.attention === "needs_you" || r.attention === "working" || r.attention === "queued" || r.attention === "blocked");
  const firstHeld = b.rows.find((r) => r.kind === "held");
  const keep = new Set(b.rows.filter((r) => live(r) || r === firstHeld || (b.stopped && r.kind === "task" && r.taskId === b.stopped.taskId)));
  if (!keep.size) b.rows.slice(-2).forEach((r) => keep.add(r));
  const shown = b.rows.filter((r) => keep.has(r));
  return { shown, rest: b.rows.length - shown.length };
}

/**
 * D430: the card's count, in the conversation's words (asks.count): shown only while something is
 * done and something is left (a part that didn't work out counts in neither; the beads say the rest).
 */
export function groupCount(rows: MemberRow[]): { done: number; left: number } | undefined {
  const marks = rows.map(markOf);
  const done = marks.filter((m) => m === "done").length;
  const left = marks.filter((m) => m !== "done" && m !== "failed" && m !== "dropped").length;
  return done && left ? { done, left } : undefined;
}

/** The member's state as its row's mark: done, at work, needs you, waits, didn't work out, put down, in line. */
export function markOf(r: MemberRow): "done" | "working" | "needs" | "waiting" | "failed" | "dropped" | "held" {
  if (r.kind === "held") return "held";
  switch (r.attention) {
    case "done":
    case "done_claimed":
    case "superseded":
      return "done";
    case "needs_you":
      return "needs";
    case "blocked":
      return "waiting";
    case "failed":
      return "failed";
    case "dropped":
      return "dropped";
    default:
      return "working";
  }
}

/**
 * D454: a group none of whose parts is at work, as a card that can leave On hand: its tasks, the
 * ones that didn't work out (再试一次 / 看看为什么 opens the first), else its last part (打开).
 * Something waiting in line only counts as finished behind a stopped part (it is dropped with it).
 * Undefined while any part works, needs the person or waits.
 */
export function finishedGroup(b: BoardGroup): { name: string; groupId: string; taskIds: string[]; failedIds: string[]; openId?: string } | undefined {
  const marks = b.rows.map(markOf);
  if (marks.some((m) => m === "working" || m === "needs" || m === "waiting")) return undefined;
  if (marks.includes("held") && !b.stopped) return undefined;
  const tasks = b.rows.flatMap((r) => (r.kind === "task" ? [r] : []));
  const failedIds = tasks.filter((r) => markOf(r) === "failed").map((r) => r.taskId);
  const plan = b.g.hand?.plan?.taskId;
  const taskIds = [...tasks.map((r) => r.taskId), ...(plan ? [plan] : [])];
  if (!taskIds.length) return undefined;
  return { name: b.g.name, groupId: b.g.id, taskIds, failedIds, openId: failedIds[0] ?? tasks.at(-1)?.taskId };
}
