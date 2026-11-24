package protocol

// D535: where a hand-over's group (D385) stands on On hand, one rule for
// every client: the port of packages/protocol/src/hand-group.ts, over the
// same cases (fixtures/hand-group.json).
//
//   - needs: its plan waits for the person (ready, held, or it failed), or
//     its review is ready: 等你, as its card.
//   - board: tasks of it are on the board: with its most urgent one.
//   - queued: nothing on the board, parts held in line: 在做, each part
//     saying where it waits.
//   - none: nothing on the board and nothing queued, or its review was
//     sent: not listed (a card that opens nothing is never shown).

// HandGroupStand is where a hand-over's group stands.
type HandGroupStand string

const (
	HandNeeds  HandGroupStand = "needs"
	HandBoard  HandGroupStand = "board"
	HandQueued HandGroupStand = "queued"
	HandNone   HandGroupStand = "none"
)

// HandStand is where a hand-over's group stands, from its hand, how many of
// its tasks are on the board and how many parts wait in line.
func HandStand(hand *GroupHandView, onBoard, queued int) HandGroupStand {
	if hand == nil {
		return HandNone
	}
	plan := ""
	if hand.Plan != nil {
		plan = hand.Plan.State
	}
	switch {
	case plan == "ready" || plan == "held" || plan == "failed" || hand.Review == "ready":
		return HandNeeds
	case onBoard > 0:
		return HandBoard
	case hand.Review == "sent":
		return HandNone
	case queued > 0:
		return HandQueued
	}
	return HandNone
}
