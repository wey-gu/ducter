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
    if (g.members.length < 2) continue;
    if (persona && g.persona && g.persona !== persona) continue;
    const rows: MemberRow[] = g.members.map((m, i) => (isHeld(m) ? { kind: "held", key: m.key, part: i + 1, title: m.title, ...(m.device ? { device: m.device } : {}) } : { kind: "task", taskId: m.taskId, part: i + 1, attention: attentionOf(m.taskId) }));
    const lanes = rows.flatMap((r) => (r.kind === "task" ? [laneOf(r.taskId)] : [])).filter((l) => l >= 0);
    if (!lanes.length) continue;
    const ids = new Set(rows.flatMap((r) => (r.kind === "task" && laneOf(r.taskId) >= 0 ? [r.taskId] : [])));
    const done = rows.filter((r) => markOf(r) === "done").length;
    let stopped: BoardGroup["stopped"];
    if (g.stopped) {
      const at = rows.findIndex((r) => r.kind === "task" && r.taskId === g.stopped!.taskId);
      const after = rows.slice(at + 1).filter((r) => r.kind === "held");
      if (at >= 0 && after.length) stopped = { why: g.stopped.why, part: at + 1, next: after[0]!.part, waiting: after.length, taskId: g.stopped.taskId };
    }
    // A stopped line waits for the person: it stands with what needs them.
    out.push({ g, lane: stopped ? 0 : Math.min(...lanes), rows, ids, done, of: rows.length, ...(stopped ? { stopped } : {}) });
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
