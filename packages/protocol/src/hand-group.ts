// D535: where a hand-over's group (D385) stands on On hand, one rule for every client. The Mac's Go
// port (apps/desktop/internal/protocol/handgroup.go) passes the same cases (fixtures/hand-group.json).
//
// - needs: its plan waits for the person (ready, held, or it failed), or its review is ready: 等你,
//   as its card, whatever of it is on the board.
// - board: tasks of it are on the board: it stands with its most urgent one.
// - queued: nothing of it on the board, parts held in line: 在做, each part saying where it waits.
// - none: nothing on the board and nothing queued (every task it started removed, or long done), or
//   its review was sent: not listed. A card that opens nothing is never shown.

export type HandGroupStand = "needs" | "board" | "queued" | "none";

export function handGroupStand(hand: { plan?: { state: string } | null; review?: string }, onBoard: number, queued: number): HandGroupStand {
  const plan = hand.plan?.state;
  if (plan === "ready" || plan === "held" || plan === "failed" || hand.review === "ready") return "needs";
  if (onBoard > 0) return "board";
  if (hand.review === "sent") return "none";
  return queued > 0 ? "queued" : "none";
}
