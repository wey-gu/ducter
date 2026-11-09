package views

import (
	"hash/fnv"
	"math"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// Idle motion (D77): only the clay character and scene move on their
// own. The partner breathes and blinks; an awake device floats, a cloud
// machine drifts, a sleeping device's blanket rises and falls, and an AI
// account's cords catch a sheen now and then. Status, chips, lines and
// buttons never do. Each moving thing has its own phase, so nothing moves
// in unison.
//
// It is all computed at paint time from the frame's clock and drawn with
// the painter's transform: the window repaints the moving drawings at
// idleFPS without building the view again (Painter.AnimationFrameRate),
// and an element out of view asks for nothing. Under reduced motion every
// drawing is still.

// idleFPS is how often idle motion repaints: slow, small movements look
// as smooth at 30 frames a second, for a fraction of the display's rate.
const idleFPS = 30

// idleKind is how a piece of clay moves while nothing happens.
type idleKind int

const (
	idleStill   idleKind = iota
	idleBreathe          // the partner: scale 1.012 × 1.03 from its feet, 3.8 s
	idleFloat            // an awake device: up 5 points and back, 5.6 s
	idleDrift            // a cloud machine: a slow ±4-point wander, 11 s
	idleBlanket          // a sleeping device: scale-y 1.045 from the bottom, 4.8 s
)

// phaseOf is a stable fraction for key, to stagger the motions.
func phaseOf(key string) float64 {
	h := fnv.New32a()
	h.Write([]byte(key))
	return float64(h.Sum32()%10000) / 10000
}

// cycle is where now is in a loop of period, from 0 to 1, offset by phase.
func cycle(now time.Time, period time.Duration, phase float64) float64 {
	t := float64(now.UnixMilli()) / float64(period.Milliseconds())
	_, f := math.Modf(t + phase)
	return f
}

// easeWave is 0 at 0 and 1, 1 at 0.5, eased in and out (CSS's
// ease-in-out keyframes 0% / 50% / 100%).
func easeWave(f float64) float32 {
	return float32(0.5 - 0.5*math.Cos(2*math.Pi*f))
}

// idlePose is a motion's transform at now, and the point (as fractions of
// the drawing's box) it scales from.
func idlePose(kind idleKind, now time.Time, phase float64) (tr ui.Transform, ox, oy float32) {
	switch kind {
	case idleBreathe:
		w := easeWave(cycle(now, 3800*time.Millisecond, phase))
		return ui.Scaling(1+0.012*w, 1+0.03*w), 0.5, 1
	case idleFloat:
		w := easeWave(cycle(now, 5600*time.Millisecond, phase))
		return ui.Translation(0, -5*w), 0.5, 0.5
	case idleDrift:
		// 0 → (4, −3) at 30% → (−3, −1) at 65% → 0, eased between.
		f := cycle(now, 11*time.Second, phase)
		keys := [][3]float64{{0, 0, 0}, {0.30, 4, -3}, {0.65, -3, -1}, {1, 0, 0}}
		for i := 1; i < len(keys); i++ {
			if f <= keys[i][0] {
				a, b := keys[i-1], keys[i]
				s := (f - a[0]) / (b[0] - a[0])
				s = 0.5 - 0.5*math.Cos(math.Pi*s)
				return ui.Translation(float32(a[1]+(b[1]-a[1])*s), float32(a[2]+(b[2]-a[2])*s)), 0.5, 0.5
			}
		}
	case idleBlanket:
		// Up to 1.015 × 1.045 at 45%, back by 100%.
		f := cycle(now, 4800*time.Millisecond, phase)
		var w float64
		if f < 0.45 {
			w = 0.5 - 0.5*math.Cos(math.Pi*f/0.45)
		} else {
			w = 0.5 + 0.5*math.Cos(math.Pi*(f-0.45)/0.55)
		}
		return ui.Scaling(float32(1+0.015*w), float32(1+0.045*w)), 0.5, 1
	}
	return ui.Transform{}, 0.5, 0.5
}

// blink is how closed the eyelids are at now (0 open … 1 shut) and when
// the next frame that changes it is due. Blinks come every 3–6 s, 150 ms
// each, and one in four is a double blink.
func blink(now time.Time, phase float64) (float32, time.Duration) {
	const window = 4500 * time.Millisecond
	const dur = 150 * time.Millisecond
	ms := now.UnixMilli() + int64(phase*float64(window.Milliseconds()))
	n := ms / window.Milliseconds()
	in := time.Duration(ms%window.Milliseconds()) * time.Millisecond
	// This window's blink starts somewhere in its first 1.5 s: two blinks
	// in a row are 3–6 s apart.
	r := phaseOf(string(rune(n%7919)) + "blink")
	at := time.Duration(r * 1500 * float64(time.Millisecond))
	starts := []time.Duration{at}
	if r < 0.25 {
		starts = append(starts, at+260*time.Millisecond)
	}
	next := window - in
	for _, s := range starts {
		if in >= s && in < s+dur {
			x := float64(in-s) / float64(dur)
			return float32(math.Sin(math.Pi * x)), 0
		}
		if in < s && s-in < next {
			next = s - in
		}
	}
	return 0, next
}

// idleFrame asks for the next idle frame: at idleFPS while something moves.
func idleFrame(p *ui.Painter) {
	p.AnimationFrameRate(idleFPS)
}

// clayArt draws a clay bitmap in r (fitted, as ui.Image does) moving by
// kind, with the idle face's eyelids when lids is set (lids are the lid
// boxes as fractions of r). Grey draws it a little grey and still: a
// device that can't be reached.
func clayArt(p *ui.Painter, r ui.Rect, bmp *ui.Bitmap, kind idleKind, phase float64, lids *[2]theme.Lid) {
	if bmp == nil {
		return
	}
	still := p.Preferences().ReduceMotion || kind == idleStill
	draw := func() {
		p.Image(bmp, r, ui.Contain)
		if lids == nil || still {
			return
		}
		k, next := blink(p.Now(), phase)
		if k > 0.01 {
			for _, l := range lids {
				box := ui.Rect{X: r.X + l.X*r.W, Y: r.Y + l.Y*r.H, W: l.W * r.W, H: l.H * r.H * k}
				var m ui.Path
				ellipse(&m, box.X+box.W/2, box.Y+box.H/2, box.W/2, box.H/2)
				p.FillPathGradient(&m, ui.LinearGradient{From: l.From, To: l.To, Angle: 90})
			}
			p.AnimationFrame() // a blink is quick: the display's rate
		} else if next < time.Second/idleFPS {
			p.After(next)
		}
	}
	if still {
		draw()
		return
	}
	tr, ox, oy := idlePose(kind, p.Now(), phase)
	p.Transform(tr, r.X+ox*r.W, r.Y+oy*r.H, draw)
	idleFrame(p)
}

// fitIn is where a bitmap fitted into r (contained, centered) lands.
func fitIn(bmp *ui.Bitmap, r ui.Rect) ui.Rect {
	if bmp == nil {
		return r
	}
	w, h := bmp.Size()
	if w <= 0 || h <= 0 {
		return r
	}
	s := min(r.W/float32(w), r.H/float32(h))
	fw, fh := float32(w)*s, float32(h)*s
	return ui.Rect{X: r.X + (r.W-fw)/2, Y: r.Y + (r.H-fh)/2, W: fw, H: fh}
}

// partnerFace is the clay partner in a presence, cut to its outline, w
// points wide (its height follows the art): it breathes, and blinks while
// idle (D77). A face of another presence cross-fades in.
func (a *App) partnerFace(c *ui.Context, key string, p theme.Presence, w float32) ui.Element {
	bmp := theme.Face(p, w*2)
	idle := theme.Face(theme.Idle, w*2)
	h := w
	if idle != nil {
		iw, ih := idle.Size()
		h = w * float32(ih) / float32(iw)
	}
	label := a.L.T(presenceLabel[p], a.S.PersonaName)
	phase := phaseOf(key)
	box := ui.Box(c.Key("face:"+key)).Size(w, h).Role(ui.RoleImage).Label(label).Shrink(0)
	box.Draw(func(pt *ui.Painter, r ui.Rect) {
		if bmp == nil {
			return
		}
		// Each face fills the box's width or height, standing on its
		// bottom edge.
		at := fitIn(bmp, r)
		at.Y = r.Y + r.H - at.H
		var lids *[2]theme.Lid
		if p == theme.Idle {
			lids = &theme.FaceLids
		}
		clayArt(pt, at, bmp, idleBreathe, phase, lids)
	})
	return box
}
