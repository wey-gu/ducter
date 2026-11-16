package views

import (
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D286: the picture viewer's motion on the Mac (the web's Viewer, the same
// rules): the picture grows out of the tile it was opened from and shrinks
// back into it on closing; stepping, the next picture comes in from the
// side it was stepped to; a pinch, ⌘ and the wheel, or a mouse's wheel
// zoom it where the pointer is, and a two-finger scroll pans it when it is
// zoomed or steps through the pictures when it isn't. Under reduced motion
// it simply shows, and only fades.

// viewerMaxZoom is how far a picture zooms in.
const viewerMaxZoom = 5

// stageGuess is the picture's box before it is laid out once: the window
// less the bars and the arrows around it.
func (a *App) stageGuess(w, h float32) ui.Rect {
	t := a.T
	top := t.S4 + t.S2 + t.ControlMD
	bottom := t.S3 + t.S5 + t.ControlSM
	side := t.S5 + t.ControlLG + t.S3
	return ui.Rect{X: side, Y: top + t.S2, W: max(1, w-2*side), H: max(1, h-top-bottom-2*t.S2)}
}

// fitPic is the rect a picture of w × h takes when it fits box (Contain).
func fitPic(w, h int, box ui.Rect) ui.Rect {
	if w <= 0 || h <= 0 {
		return box
	}
	s := min(box.W/float32(w), box.H/float32(h))
	fw, fh := float32(w)*s, float32(h)*s
	return ui.Rect{X: box.X + (box.W-fw)/2, Y: box.Y + (box.H-fh)/2, W: fw, H: fh}
}

// tilePoseFor is the pose that lays the fitted picture over its tile: moved
// to the tile's centre and scaled to cover it.
func tilePoseFor(tile, box ui.Rect, ref protocol.MediaRef) ui.Pose {
	f := fitPic(ref.W, ref.H, box)
	s := max(tile.W/max(1, f.W), tile.H/max(1, f.H))
	return ui.Pose{X: tile.X + tile.W/2 - (box.X + box.W/2), Y: tile.Y + tile.H/2 - (box.Y + box.H/2), Scale: max(0.05, s)}
}

// viewerPose poses the picture and takes the pinches and scrolls over it.
func (a *App) viewerPose(c *ui.Context, v *viewerState, ref protocol.MediaRef, img ui.Element) {
	t := a.T
	still := c.Preferences().ReduceMotion
	box := img.Bounds()
	if box.W <= 0 {
		w, h := c.Size()
		box = a.stageGuess(w, h)
	}
	zoomAt := func(s, x, y float32) {
		s = max(1, min(viewerMaxZoom, s))
		if s <= 1.001 {
			v.scale, v.panX, v.panY = 1, 0, 0
			return
		}
		// Keep the point under the pointer where it is.
		cx, cy := x-box.W/2, y-box.H/2
		k := s / v.scale
		v.panX, v.panY = cx-(cx-v.panX)*k, cy-(cy-v.panY)*k
		v.scale = s
		a.clampPan(v, box, ref)
	}
	swipe := ui.Local(img, "swipe", func() float32 { return 0 })
	img.HandleInput(func(ev ui.InputEvent) bool {
		switch ev.Kind {
		case ui.InputZoom:
			zoomAt(v.scale*ev.Scale, ev.X, ev.Y)
			return true
		case ui.InputScroll:
			if ev.Mods&ui.Cmd != 0 || !ev.Precise {
				// ⌘ and the wheel, or a mouse's wheel: zoom.
				f := float32(1.25)
				if ev.DY > 0 {
					f = 0.8
				}
				zoomAt(v.scale*f, ev.X, ev.Y)
				return true
			}
			if v.scale > 1.001 {
				v.panX -= ev.DX
				v.panY -= ev.DY
				a.clampPan(v, box, ref)
				return true
			}
			// At fit, a sideways two-finger swipe steps once per swipe.
			if ev.Momentum {
				return true
			}
			*swipe += ev.DX
			if *swipe > 80 {
				*swipe = -1e6
				v.step(1)
			} else if *swipe < -80 && *swipe > -1e5 {
				*swipe = 1e6
				v.step(-1)
			}
			return true
		}
		return false
	})
	if img.DoubleClicked() {
		v.zoom = false
		if v.scale > 1.001 {
			v.scale, v.panX, v.panY = 1, 0, 0
		} else {
			v.scale = 2.5
		}
	}
	p := ui.Pose{Scale: v.scale, X: v.panX, Y: v.panY}
	if !v.closing.IsZero() {
		if r, ok := a.med().tileAt[ref.ID]; ok && r.W > 0 && !still {
			p = tilePoseFor(r, box, ref)
		} else {
			p = ui.Pose{Scale: 0.94, Fade: 1}
		}
	}
	if still {
		img.AnimatePose(ui.Pose{Scale: v.scale, X: v.panX, Y: v.panY}, ui.Animation{})
		v.from = ui.Rect{}
		return
	}
	entered := ui.Local(img, "entered", func() bool { return false })
	if !*entered {
		*entered = true
		switch {
		case v.from.W > 0:
			img.AnimatePose(tilePoseFor(v.from, box, ref), t.Snappy)
		case v.dir != 0:
			img.AnimatePose(ui.Pose{X: float32(v.dir) * 72, Fade: 1}, t.Snappy)
		default:
			img.AnimatePose(ui.Pose{Scale: 0.96, Fade: 1}, t.Snappy)
		}
		v.from = ui.Rect{}
		c.Invalidate()
		return
	}
	img.AnimatePose(p, t.Snappy)
}

// clampPan keeps a zoomed picture's edges outside the stage's.
func (a *App) clampPan(v *viewerState, box ui.Rect, ref protocol.MediaRef) {
	f := fitPic(ref.W, ref.H, box)
	bx := max(0, (f.W*v.scale-box.W)/2)
	by := max(0, (f.H*v.scale-box.H)/2)
	v.panX = max(-bx, min(bx, v.panX))
	v.panY = max(-by, min(by, v.panY))
}
