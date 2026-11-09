package views

import (
	"image"
	"image/color"
	"math"
	"math/rand"
	"sync"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// The title moment (D87). Before dawn, above a sea of clouds, the clay
// Ducter sleeps on its small island, breathing. Light rises from under the
// clouds at the left, the view pushes in a little and rises with it, each
// layer at its own depth; motes drift in the light. On one clear tone
// Ducter opens its eyes (half, a beat, then wide) and looks at you; a
// breath of light around it. Its clay name is lit from the left and a
// light passes over it. Once the music settles, a small, letter-spaced
// "Press any key" breathes in and out. Any key or click leaves at once
// (the sound fades); from the prompt the dawn floods the window and turns
// into the paper of the first setup card.
//
// Everything is drawn at paint time from one clock, with the numbers of
// the prototype's renderer (https://claude.ai/artifact/BC1i6YEt8EKQ5VtMeCjEw8,
// render.js). The art is theme.Title(): key art cut into layers by
// tools/art/title_layers.py.
//
// It plays once per Mac (desktop.json titleSeenAt), again from Settings ›
// About. No sound when Settings turned sounds off, under reduced motion,
// when the app was opened at login (then no title at all), or when the
// window isn't active when it starts. Reduced motion: the settled frame,
// still, faded in over 0.4 s; the prompt doesn't breathe.

// The timeline, in seconds.
const (
	titleExpFrom    = 0.3  // the light comes up
	titleExpTo      = 3.7  // and is up
	titleEyes       = 3.5  // the eyes open (the tone is at 3.55)
	titleBell       = 3.55 // the tone
	titleFirstBlink = 5.6  // the first ordinary blink: it's alive
	titleLogoFrom   = 4.3  // the name, lit from the left
	titleLogoDur    = 1.4
	titleSheenFrom  = 5.0 // then a light passes over it
	titleSheenDur   = 1.2
	titlePrompt     = 6.6 // "Press any key", once the music settles
	titlePromptIn   = 1.0
	titlePushDur    = 9.0  // the camera's slow push-in
	titleRest       = 99.0 // any time after everything settled
)

// How long leaving takes: skipped before the prompt, or from it.
const (
	titleSkip  = 300 * time.Millisecond
	titleLeave = 700 * time.Millisecond
)

// TitleSound is the title moment's sound while it plays.
type TitleSound interface{ Stop(fade time.Duration) }

type titleState struct {
	on      bool
	played  bool // this launch: the checking card shows Ducter awake
	start   time.Time
	leaveAt time.Time
	leaveT  float64 // where the timeline was when it left
	sound   TitleSound
	// at, when set, draws that second of the timeline (tests).
	at float64
}

// ShowTitle plays the title moment: on the first launch, and from
// Settings › About.
func (a *App) ShowTitle() {
	a.title = titleState{on: true, played: true}
}

// TitleShowing reports whether the title moment is on screen.
func (a *App) TitleShowing() bool { return a.title.on }

// titleTick moves the title on at build time: it starts its clock (and
// its sound) once the window is active, and ends once it has left.
func (a *App) titleTick(c *ui.Context) {
	tl := &a.title
	if !tl.on {
		return
	}
	now := a.Now()
	if !tl.leaveAt.IsZero() {
		if left := tl.leaveAt.Add(a.titleLeaveDur()).Sub(now); left > 0 {
			c.After(left)
			return
		}
		tl.on = false
		return
	}
	if tl.start.IsZero() && tl.at == 0 {
		if !c.WindowActive() {
			c.After(200 * time.Millisecond)
			return
		}
		tl.start = now
		if a.Local.Sound() && !c.Preferences().ReduceMotion && a.PlayTitle != nil {
			tl.sound = a.PlayTitle()
		}
	}
}

func (a *App) titleLeaveDur() time.Duration {
	if a.title.leaveT < titlePrompt {
		return titleSkip
	}
	return titleLeave
}

// titleT is where the timeline is, in seconds.
func (a *App) titleT() float64 {
	tl := &a.title
	switch {
	case tl.at != 0:
		return tl.at
	case !tl.leaveAt.IsZero():
		return tl.leaveT
	case tl.start.IsZero():
		return 0
	}
	return a.Now().Sub(tl.start).Seconds()
}

// leaveTitle starts leaving: any key or click.
func (a *App) leaveTitle() {
	tl := &a.title
	if !tl.on || !tl.leaveAt.IsZero() {
		return
	}
	tl.leaveT = a.titleT()
	tl.leaveAt = a.Now()
	if tl.sound != nil {
		fade := 500 * time.Millisecond
		if tl.leaveT < titlePrompt {
			fade = titleSkip
		}
		tl.sound.Stop(fade)
		tl.sound = nil
	}
	a.Local.MarkTitleSeen(a.Now())
}

func (a *App) titleView(c *ui.Context) {
	label := a.L.T("title.label")
	box := ui.Box(c.Key("title")).Grow(1).MinHeight(0).Focusable().Focus().FocusRing(false).
		Role(ui.RoleImage).Label(label)
	box.HandleInput(func(ev ui.InputEvent) bool {
		switch ev.Kind {
		case ui.InputKeyDown:
			// Shortcuts (⌘Q, ⌘W, ⌘,) stay shortcuts; a modifier alone isn't
			// a key pressed.
			if ev.Mods&(ui.Cmd|ui.Ctrl) != 0 || ev.Key == ui.KeyUnknown || ev.Repeat {
				return false
			}
			a.leaveTitle()
			return true
		case ui.InputPointerDown:
			a.leaveTitle()
			return true
		}
		return false
	})
	box.Draw(func(p *ui.Painter, r ui.Rect) {
		a.drawTitle(p, r)
	})
}

// ---------- the picture ----------

func clamp01(x float64) float64 { return math.Max(0, math.Min(1, x)) }

func smooth01(x float64) float64 { return 0.5 - 0.5*math.Cos(math.Pi*clamp01(x)) }

func outCubic(x float64) float64 { x = clamp01(x); return 1 - math.Pow(1-x, 3) }

// outBack overshoots a little and settles: the small look up.
func outBack(x float64) float64 {
	x = clamp01(x)
	const c = 1.3
	return 1 + (c+1)*math.Pow(x-1, 3) + c*math.Pow(x-1, 2)
}

func waveAt(t, period float64) float64 { return 0.5 - 0.5*math.Cos(2*math.Pi*t/period) }

// titleLids is how shut the eyes are at t (1 shut, 0 open): shut while it
// sleeps, half open (still sleepy), a beat, open; then a blink now and then.
func titleLids(t float64) float64 {
	if t < titleEyes {
		return 1
	}
	a := t - titleEyes
	switch {
	case a < 0.22:
		return 1 - 0.45*outCubic(a/0.22)
	case a < 0.36:
		return 0.55
	case a < 0.62:
		return 0.55 * (1 - outCubic((a-0.36)/0.26))
	}
	if t >= titleFirstBlink {
		if b := math.Mod(t-titleFirstBlink, 4.3); b < 0.15 {
			return math.Sin(math.Pi * b / 0.15)
		}
	}
	return 0
}

// titleFrame is everything the picture needs at t.
type titleFrame struct {
	exp          float64 // the dawn: 0 night, 1 up
	push, crane  float64 // the camera: push-in, and its rise
	bloom        float64 // the breath of light at the tone
	sx, sy, lift float64 // Ducter's breath, and its look up
	lids         float64
	logo, sheen  float64 // the name's reveal, and the light passing over it
	prompt       float64
	breath       float64 // the prompt's slow breath, 0.6..1
}

func titleAt(t float64) titleFrame {
	var f titleFrame
	f.exp = smooth01((t - titleExpFrom) / (titleExpTo - titleExpFrom))
	f.push = 0.03*smooth01(t/titlePushDur) + 0.004*clamp01((t-titlePushDur)/30)
	f.crane = smooth01(t / 7)
	if t >= titleBell {
		f.bloom = 0.16 * math.Exp(-(t-titleBell)/1.6) * smooth01((t-titleBell)/0.12)
	}
	awake := smooth01((t - titleEyes) / 0.8)
	sw, iw := waveAt(t, 4.4), waveAt(t-titleEyes, 3.8)
	f.sx = 1 + 0.014*sw*(1-awake) + 0.010*iw*awake
	f.sy = 1 + 0.032*sw*(1-awake) + 0.024*iw*awake
	if t > titleEyes {
		f.lift = outBack((t - titleEyes) / 0.7)
	}
	f.lids = titleLids(t)
	f.logo = clamp01((t - titleLogoFrom) / titleLogoDur)
	f.sheen = (t - titleSheenFrom) / titleSheenDur
	f.prompt = smooth01((t - titlePrompt) / titlePromptIn)
	f.breath = 1
	if t > titlePrompt+titlePromptIn {
		f.breath = 0.8 + 0.2*math.Cos(2*math.Pi*(t-titlePrompt-titlePromptIn)/3.4)
	}
	return f
}

// rgba is a color with alpha a (clamped).
func rgba(r, g, b uint8, a float64) ui.Color { return ui.RGBA(r, g, b, float32(clamp01(a))) }

// glow fills a radial gradient of radius rad around (cx, cy), squashed
// vertically by sy (1 for a circle), clipped to clip.
func glow(p *ui.Painter, clip ui.Rect, cx, cy, rad, sy float32, stops []ui.GradientStop) {
	if rad <= 0 {
		return
	}
	draw := func() {
		box := ui.Rect{X: cx - rad, Y: cy - rad, W: 2 * rad, H: 2 * rad}
		p.FillRadialGradient(box, ui.RadialGradient{Stops: stops, Center: ui.Point{X: 0.5, Y: 0.5}, Radius: rad}, 0)
	}
	p.Clip(clip, 0, func() {
		if sy == 1 {
			draw()
			return
		}
		p.Transform(ui.Scaling(1, sy), cx, cy, draw)
	})
}

// A mote of dust or pollen, drifting up and right through the light.
type titleMote struct {
	x, y, d, vx, vy, ph, sw, a float64
	big                        bool
}

var titleMotes = func() []titleMote {
	r := rand.New(rand.NewSource(87))
	m := make([]titleMote, 54)
	for i := range m {
		d := 0.5 + r.Float64()*1.1
		m[i] = titleMote{x: r.Float64(), y: 0.12 + r.Float64()*0.8, d: d, vx: 0.004 + r.Float64()*0.006,
			vy: -(0.006 + r.Float64()*0.01), ph: r.Float64() * 6.28, sw: 0.004 + r.Float64()*0.008, a: 0.25 + r.Float64()*0.6, big: d > 1.4}
	}
	return m
}()

var (
	grainOnce sync.Once
	grainBmp  *ui.Bitmap
)

// titleGrain is a 256-pixel tile of film grain.
func titleGrain() *ui.Bitmap {
	grainOnce.Do(func() {
		img := image.NewRGBA(image.Rect(0, 0, 256, 256))
		r := rand.New(rand.NewSource(5))
		for i := 0; i < 256*256; i++ {
			v := uint8(r.Intn(256))
			img.Set(i%256, i/256, color.RGBA{v, v, v, 255})
		}
		grainBmp = ui.NewBitmap(img)
	})
	return grainBmp
}

func (a *App) drawTitle(p *ui.Painter, r ui.Rect) {
	art := theme.Title()
	p.Fill(r, ui.Hex("#05040A"), 0)
	if art == nil {
		return
	}
	rm := p.Preferences().ReduceMotion
	t := a.titleT()
	fade := 1.0
	if rm {
		fade = smooth01(t / 0.4)
		t = titleRest
	}
	f := titleAt(t)
	if rm {
		f.lids = 0 // reduced motion: awake and still, never a blink
	}
	L := art.Layout
	W, H := r.W, r.H
	FH := L.Frame[1] / L.Frame[0]
	base := max(W, H/FH) * 1.05 // cover, with room to move
	u := min(W/100, H/62.5)

	// A layer's placement: zoomed about the frame's middle by its depth,
	// and the rise (far things move less).
	type place struct{ z, ox, oy float32 }
	at := func(d float64) place {
		z := base * float32(1+f.push*d)
		return place{z, r.X + W/2 - 0.5*z, r.Y + H/2 - 0.5*FH*z + 0.010*H*float32(f.crane*(d-0.4))}
	}
	rectOf := func(pl place, b theme.TitleBox) ui.Rect {
		return ui.Rect{X: pl.ox + b.X*pl.z, Y: pl.oy + b.Y*FH*pl.z, W: b.W * pl.z, H: b.H * FH * pl.z}
	}
	img := func(b *ui.Bitmap, dst ui.Rect, alpha float64) {
		p.ImageRegion(b, ui.Rect{}, dst, ui.ImageOptions{Tint: rgba(255, 255, 255, alpha)})
	}

	p.Clip(r, 0, func() {
		// The sky, the island.
		ps := at(0.45)
		img(art.Sky, ui.Rect{X: ps.ox, Y: ps.oy, W: ps.z, H: FH * ps.z}, 1)
		// The sun's bloom lives in the sky, behind the island and Ducter,
		// so the subject stays crisp.
		sunX, sunY := ps.ox+0.01*ps.z, ps.oy+0.475*FH*ps.z
		glow(p, r, sunX, sunY, max(W, H)*0.55, 1, []ui.GradientStop{
			{Color: rgba(255, 200, 140, 0.18*f.exp), At: 0}, {Color: rgba(255, 200, 140, 0), At: 1},
		})
		pi := at(1.0)
		img(art.Island, rectOf(pi, L.Island), 1)

		// Ducter: its contact shadow, then the clay, breathing from its feet.
		pd := at(1.04)
		dr := rectOf(pd, L.Ducter)
		feetX, feetY := dr.X+dr.W*0.5, dr.Y+dr.H*0.985
		glow(p, r, feetX+dr.W*0.06, feetY, dr.W*0.5, 0.16, []ui.GradientStop{
			{Color: rgba(40, 18, 6, 0.55), At: 0}, {Color: rgba(40, 18, 6, 0.18), At: 0.6}, {Color: rgba(40, 18, 6, 0), At: 1},
		})
		p.Transform(ui.Translation(0, -float32(f.lift)*0.012*dr.H), 0, 0, func() {
			p.Transform(ui.Scaling(float32(f.sx), float32(f.sy)), feetX, feetY, func() {
				img(art.Ducter, dr, 1)
				titleLidsDraw(p, art, dr, f.lids)
			})
		})

		// The night, lifting: darkest away from the sun; a vignette stays.
		n := 1 - f.exp
		far := float32(math.Hypot(float64(W), float64(H)))
		glow(p, r, sunX, sunY, far*1.1, 1, []ui.GradientStop{
			{Color: rgba(5, 4, 10, 0.86*n), At: 0},
			{Color: rgba(5, 4, 10, 0.94*n), At: 0.5},
			{Color: rgba(5, 4, 10, 0.97*n+0.30*f.exp), At: 1},
		})
		vr := far * 0.62
		inner := min(W, H) * 0.3 / vr
		glow(p, r, r.X+W/2, r.Y+H*0.48, vr, 1, []ui.GradientStop{
			{Color: rgba(8, 5, 10, 0), At: 0}, {Color: rgba(8, 5, 10, 0), At: inner}, {Color: rgba(8, 5, 10, 0.5*f.exp), At: 1},
		})
		// The breath of light at the tone.
		if f.bloom > 0.002 {
			glow(p, r, dr.X+dr.W/2, dr.Y+dr.H*0.45, dr.W*1.6, 1, []ui.GradientStop{
				{Color: rgba(255, 226, 180, f.bloom), At: 0}, {Color: rgba(255, 226, 180, 0), At: 1},
			})
		}

		// Motes, catching the light.
		tt := t
		if rm {
			tt = 0
		}
		for _, m := range titleMotes {
			x := math.Mod(m.x+m.vx*tt+m.sw*math.Sin(tt*0.6+m.ph), 1)
			y := math.Mod(math.Mod(m.y+m.vy*tt-0.05, 0.9)+0.9, 0.9) + 0.05
			pl := at(m.d)
			X, Y := pl.ox+float32(x)*pl.z, pl.oy+float32(y)*FH*pl.z
			near := math.Max(0.25, 1-math.Hypot(float64(X-sunX), float64(Y-sunY))/float64(far))
			k := 0.8
			if m.big {
				k = 0.22
			}
			alpha := m.a * f.exp * near * k * (0.7 + 0.3*math.Sin(tt*1.3+m.ph))
			if alpha < 0.01 {
				continue
			}
			rad := u * float32(0.08+0.12*m.d)
			if m.big {
				rad = u * float32(0.9+m.d*0.8)
			}
			glow(p, r, X, Y, rad, 1, []ui.GradientStop{{Color: rgba(255, 236, 205, alpha), At: 0}, {Color: rgba(255, 236, 205, 0), At: 1}})
		}

		// The clay name, lit from the left, then a light passing over it:
		// drawn in 48 slices, each with its own light.
		if f.logo > 0 {
			bw, bh := art.Logo.Size()
			lw := min(W*0.30, 620)
			lh := lw * float32(bh) / float32(bw)
			// On Ducter's axis, with air above.
			lx, ly := dr.X+dr.W/2-lw/2, r.Y+H*0.14+u*0.8*float32(1-outCubic(f.logo))
			const n = 48
			sw := float32(bw) / n
			for i := 0; i < n; i++ {
				xn := (float64(i) + 0.5) / n
				av := clamp01((f.logo*1.5 - xn) / 0.5)
				if av <= 0 {
					continue
				}
				src := ui.Rect{X: float32(i) * sw, W: sw, H: float32(bh)}
				dst := ui.Rect{X: lx + float32(i)*lw/n, Y: ly, W: lw/n + 0.5, H: lh}
				p.ImageRegion(art.Logo, src, dst, ui.ImageOptions{Tint: rgba(255, 255, 255, smooth01(av)*fade)})
				if f.sheen > 0 && f.sheen < 1 {
					sa := 0.9 * math.Max(0, 1-math.Abs(xn-(-0.25+1.5*f.sheen))/0.14)
					if sa > 0.01 {
						p.ImageRegion(art.LogoLit, src, dst, ui.ImageOptions{Tint: rgba(255, 255, 255, sa*smooth01(av))})
					}
				}
			}
		}
		if f.prompt > 0.001 {
			breath := f.breath
			if rm {
				breath = 1
			}
			a.titlePrompt(p, r, u, rgba(255, 236, 212, 0.82*f.prompt*breath*fade))
		}

		// Film grain, a new tile offset 24 times a second.
		if g := titleGrain(); g != nil && !rm {
			ox := float32(int(t*24)%8) * 31
			oy := float32(int(t*24)%5) * 47
			for y := r.Y - oy; y < r.Y+H; y += 256 {
				for x := r.X - ox; x < r.X+W; x += 256 {
					p.ImageRegion(g, ui.Rect{}, ui.Rect{X: x, Y: y, W: 256, H: 256}, ui.ImageOptions{Tint: rgba(255, 255, 255, 0.016)})
				}
			}
		}

		// Leaving: the dawn floods the window, then the paper.
		tl := &a.title
		if !tl.leaveAt.IsZero() {
			k := clamp01(float64(a.Now().Sub(tl.leaveAt)) / float64(a.titleLeaveDur()))
			g := smooth01(k / 0.7)
			glow(p, r, r.X+W/2, r.Y+H*0.55, far*float32(0.3+0.9*g), 1, []ui.GradientStop{
				{Color: rgba(255, 214, 160, g), At: 0}, {Color: rgba(255, 246, 234, g), At: 0.5}, {Color: rgba(255, 190, 130, 0.6*g), At: 1},
			})
			p.Fill(r, a.T.Bg.Alpha(float32(smooth01((k-0.35)/0.65))), 0)
		}
		if rm && fade < 1 {
			p.Fill(r, rgba(5, 4, 10, 1-fade), 0)
		}
	})

	// Frames: the display's rate while it moves; slower once it only
	// breathes.
	tl := &a.title
	switch {
	case tl.at != 0, tl.start.IsZero() && tl.leaveAt.IsZero():
	case !tl.leaveAt.IsZero():
		p.AnimationFrame()
	case rm:
		if a.titleT() < 0.4 {
			p.AnimationFrame()
		}
	case t < titlePrompt+titlePromptIn+0.5:
		p.AnimationFrame()
	default:
		p.AnimationFrameRate(idleFPS) // motes, breath, blinks
	}
}

// titleLidsDraw shuts Ducter's eyes by k (1 shut): the sleeping face
// through a lid over each eye, as every blink is drawn (lids.go).
func titleLidsDraw(p *ui.Painter, art *theme.TitleArt, dr ui.Rect, k float64) {
	if art.Closed == nil || len(art.Layout.Lids) == 0 {
		return
	}
	b := blinkArt{closed: art.Closed}
	for _, l := range art.Layout.Lids {
		b.lids = append(b.lids, theme.Lid{X: l.X, Y: l.Y, W: l.W, H: l.H})
	}
	drawLids(p, &b, dr, k)
}

// titlePrompt draws "Press any key", small and letter-spaced, centered at
// 93% of the height: one glyph run per character, so the spacing is ours.
func (a *App) titlePrompt(p *ui.Painter, r ui.Rect, u float32, c ui.Color) {
	size := max(11, 1.2*u)
	font := a.T.Display
	track := float32(0.22)
	if a.L.Lang == "zh" {
		font, track = a.T.Body, 0.35
	}
	text := []rune(a.L.T("title.prompt"))
	var widths []float32
	total := float32(0)
	for i, ch := range text {
		w, _ := p.MeasureText(0, ui.Span{Text: string(ch), Font: font, Size: size, Weight: 500})
		widths = append(widths, w)
		total += w
		if i < len(text)-1 {
			total += track * size
		}
	}
	_, h := p.MeasureText(0, ui.Span{Text: "M", Font: font, Size: size, Weight: 500})
	x, y := r.X+(r.W-total)/2, r.Y+r.H*0.93-h/2
	for i, ch := range text {
		p.RichText(x, y, 0, ui.Span{Text: string(ch), Font: font, Size: size, Weight: 500, Color: c})
		x += widths[i] + track*size
	}
}
