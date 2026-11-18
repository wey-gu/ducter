package protocol

// D381: 置顶 / Pin (packages/protocol/src/pins.ts). A table, chart or list
// from a reply, kept at the top of the default conversation and kept
// current: ticks live on the home, the partner changes it in place.

// PinsMax is how many can be pinned at once (PINS_MAX).
const PinsMax = 6

// PinView is one pinned block as it is now.
type PinView struct {
	ID string `json:"id"`
	// UI is the block now (its plain form included).
	UI    RichUI `json:"ui"`
	Title string `json:"title"`
	// Seq and Index: the message and block it is in now.
	Seq   int64 `json:"seq"`
	Index int   `json:"index"`
	// Was: where it was before the partner changed it; those older blocks
	// offer no 置顶 of their own.
	Was []PinPlace `json:"was,omitempty"`
	// Ticks: a checklist's ticked items, by their words.
	Ticks   []string `json:"ticks,omitempty"`
	At      string   `json:"at"`
	Updated string   `json:"updated,omitempty"`
	Version int      `json:"version"`
}

// Pin pins block Index of the partner message Seq.
type Pin struct {
	T     string `json:"t"` // "pin"
	Seq   int64  `json:"seq"`
	Index int    `json:"index"`
}

// Unpin is 取消置顶 / Unpin.
type Unpin struct {
	T  string `json:"t"` // "unpin"
	ID string `json:"id"`
}

// PinTick ticks a pinned checklist's item on the home.
type PinTick struct {
	T    string `json:"t"` // "pin_tick"
	ID   string `json:"id"`
	Item string `json:"item"`
	On   bool   `json:"on"`
}

// PinAt is the pin a block in a message stands for now (only its newest
// message shows it as pinned).
func PinAt(pins []PinView, seq int64, index int) *PinView {
	for i := range pins {
		if pins[i].Seq == seq && pins[i].Index == index {
			return &pins[i]
		}
	}
	return nil
}

// PinPlace is a block's place: its message and index.
type PinPlace struct {
	Seq   int64 `json:"seq"`
	Index int   `json:"index"`
}

// PinWas is whether a block is an older version of a pin (pinWas).
func PinWas(pins []PinView, seq int64, index int) bool {
	for _, p := range pins {
		for _, w := range p.Was {
			if w.Seq == seq && w.Index == index {
				return true
			}
		}
	}
	return false
}

// PinProgress is a pinned checklist's ticked and total; ok false for
// other kinds.
func PinProgress(p PinView) (done, total int, ok bool) {
	if p.UI.Type != "checklist" {
		return 0, 0, false
	}
	on := map[string]bool{}
	for _, t := range p.Ticks {
		on[t] = true
	}
	for _, x := range p.UI.Items {
		if on[x] {
			done++
		}
	}
	return done, len(p.UI.Items), true
}

// Pinnable is whether a block's kind can be pinned (PINNABLE).
func Pinnable(t string) bool { return t == "table" || t == "chart" || t == "checklist" }
