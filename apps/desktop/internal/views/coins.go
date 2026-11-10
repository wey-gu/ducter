package views

import (
	"math"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// An AI agent's clay coin (tools/art/coins.py, D183): the agent's own mark
// sculpted as a small clay object (Claude Code's starburst, Codex's cloud,
// DeepSeek's whale, pi's blocks); an unknown agent gets the generic clay
// token. The agent's name and model are always text beside the coin.

// coinIDs maps a harness to its coin's art.
var coinIDs = map[string]string{
	"claude-code":      "claude_code",
	"codex":            "codex",
	"pi":               "pi",
	"deepseek-harness": "deepseek_harness",
}

// coinArt names an agent's coin; off: signed out or not installed (the same
// object in grey clay). A sculpted mark reads at every size the apps draw,
// so there is one image per look, whatever the size.
func coinArt(harness string, off bool) string {
	id, ok := coinIDs[harness]
	switch {
	case !ok:
		return "token_ink"
	case off:
		return "coin_" + id + "_off"
	}
	return "coin_" + id
}

// coinKnown: the agent has its own coin (an unknown one is dimmed the old way).
func coinKnown(harness string) bool {
	_, ok := coinIDs[harness]
	return ok
}

// coinMotion is how a coin moves (D77: clay may move, status and words
// never). Reduced motion: still.
type coinMotion int

const (
	coinStill   coinMotion = iota
	coinWorking            // a gentle rock on its base, 5 degrees each way, 4.2 s
	coinWaiting            // waiting on you: a 2-point bob, 2.6 s
)

// coinMotionOf is a task's coin motion from its attention.
func coinMotionOf(att protocol.Attention) coinMotion {
	switch att {
	case protocol.Working:
		return coinWorking
	case protocol.NeedsYou:
		return coinWaiting
	}
	return coinStill
}

// drawCoin paints an agent's coin into r, moving by m.
func drawCoin(p *ui.Painter, r ui.Rect, harness string, off bool, m coinMotion, phase float64) {
	bmp := theme.Clay(coinArt(harness, off))
	if bmp == nil {
		return
	}
	if off || p.Preferences().ReduceMotion {
		m = coinStill
	}
	now := p.Now()
	switch m {
	case coinWorking:
		// It rocks on its base like a toy someone is busy with.
		deg := float32(5 * math.Sin(2*math.Pi*cycle(now, 4200*time.Millisecond, phase)))
		at := fitIn(bmp, r)
		p.Transform(ui.Rotation(deg), at.X+at.W/2, at.Y+at.H*0.92, func() { p.Image(bmp, r, ui.Contain) })
		idleFrame(p)
	case coinWaiting:
		w := easeWave(cycle(now, 2600*time.Millisecond, phase))
		p.Transform(ui.Translation(0, -2*w), r.X+r.W/2, r.Y+r.H/2, func() { p.Image(bmp, r, ui.Contain) })
		idleFrame(p)
	default:
		p.Image(bmp, r, ui.Contain)
	}
}

// coinBox is an agent's coin as an element, size points square.
func (a *App) coinBox(c *ui.Context, key, harness string, size float32, off bool, m coinMotion) ui.Element {
	phase := phaseOf(key + harness)
	return ui.Box(c.Key("coin-art:"+key)).Size(size, size).Shrink(0).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
		drawCoin(p, r, harness, off, m, phase)
	})
}
