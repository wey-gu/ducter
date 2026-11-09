package views

import (
	"math"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// An AI agent's clay coin (tools/art/coins.py, design/art/LOGOS.md): each
// agent Ducter knows has its own, printed with its logo where its owner
// allows that and its name otherwise; an unknown agent gets the generic
// clay token. The agent's name and model are always text beside the coin.

// coinIDs maps a harness to its coin's art.
var coinIDs = map[string]string{
	"claude-code":      "claude_code",
	"codex":            "codex",
	"pi":               "pi",
	"deepseek-harness": "deepseek_harness",
}

// coinPrintMin is the size in points below which a coin's print would be a
// smudge: smaller coins show the plain body.
const coinPrintMin = 32

// coinArt names an agent's coin at a size in points; off: signed out or not
// installed (grey clay, the print unchanged, a pale layer over it all).
func coinArt(harness string, size float32, off bool) string {
	id, ok := coinIDs[harness]
	switch {
	case !ok:
		return "token_ink"
	case off:
		return "coin_" + id + "_off"
	case size < coinPrintMin:
		return "coin_" + id + "_plain"
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
	coinWorking            // a soft light turns a quarter of the way round its rim, 4.2 s
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

// drawCoin paints an agent's coin into r, moving by m. The light runs only
// over the rim (the sheen layer never reaches the dome where the print is).
func drawCoin(p *ui.Painter, r ui.Rect, harness string, off bool, m coinMotion, phase float64) {
	bmp := theme.Clay(coinArt(harness, r.W, off))
	if bmp == nil {
		return
	}
	if off || p.Preferences().ReduceMotion {
		m = coinStill
	}
	now := p.Now()
	switch m {
	case coinWorking:
		p.Image(bmp, r, ui.Contain)
		f := cycle(now, 4200*time.Millisecond, phase)
		if f < 0.65 {
			s := f / 0.65
			alpha := float32(math.Sin(math.Pi * s))
			deg := float32(-30 + 90*(0.5-0.5*math.Cos(math.Pi*s)))
			if sh := theme.Clay("coin_sheen"); sh != nil {
				at := fitIn(bmp, r)
				p.Transform(ui.Rotation(deg), at.X+at.W/2, at.Y+at.H/2, func() {
					p.ImageRegion(sh, ui.Rect{}, at, ui.ImageOptions{Tint: ui.RGBA(255, 255, 255, alpha)})
				})
			}
		}
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
