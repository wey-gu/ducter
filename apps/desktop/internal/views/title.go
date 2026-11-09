package views

import (
	"math"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// The title moment (D87): the first launch opens on a warm dark field. A
// light rises like dawn, the clay Ducter is there asleep and breathing, a
// low chord swells, and on one clear tone it opens its eyes and looks at
// you. The name settles, then a quiet "Press any key". Any key or click
// leaves at once (the sound fades in 0.3 s); from the prompt the light
// fills the window and turns into the paper of the first setup card.
//
// The picture is drawn at paint time from one clock, as idle motion is
// (motion.go), with the same numbers as the prototype
// (https://claude.ai/artifact/BC1i6YEt8EKQ5VtMeCjEw8) and the sound
// (tools/sound/title.py: the tone at 3.55 s).
//
// It plays once per Mac (desktop.json titleSeenAt), again from Settings ›
// About. No sound when Settings turned sounds off, under reduced motion,
// when the app was opened at login, or when the window isn't active when
// it starts. Reduced motion: the last frame, still, faded in over 0.4 s.

// The timeline, in seconds.
const (
	titleLightFrom  = 0.4  // the light starts to rise
	titleLightTo    = 3.4  // and is up
	titleDucFrom    = 0.6  // Ducter is lit by it from here
	titleDucTo      = 3.0  // fully
	titleEyes       = 3.5  // the eyes open (the tone is at 3.55)
	titleBell       = 3.55 // the tone
	titleFirstBlink = 5.3  // the first ordinary blink: it's alive
	titleWordFrom   = 4.2  // the name
	titleWordTo     = 5.4
	titlePrompt     = 6.1 // "Press any key"
	titlePromptIn   = 0.9
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
	on     bool
	played bool // this launch: the checking card shows Ducter awake
	// quiet: opened at login, so no sound (and no title, see ShowTitle).
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

// Colors of the night and the dawn (Pebble's ink, deepened; its accent,
// warmed).
var (
	titleNight    = ui.Hex("#0F0A06")
	titleEarth    = ui.Hex("#28180C")
	titleDawn     = ui.Hex("#FFBA7A")
	titleEmber    = ui.Hex("#D66E30")
	titleUmber    = ui.Hex("#3C200E")
	titleCream    = ui.Hex("#FFF1DD")
	titleCreamDim = ui.Hex("#BFA78A")
	titleLash     = ui.Hex("#3A2116")
)

func clamp01(x float64) float64 { return math.Max(0, math.Min(1, x)) }

func smooth01(x float64) float64 { return 0.5 - 0.5*math.Cos(math.Pi*clamp01(x)) }

func outCubic(x float64) float64 { x = clamp01(x); return 1 - math.Pow(1-x, 3) }

// outBack overshoots a little and settles: the small look up.
func outBack(x float64) float64 {
	x = clamp01(x)
	const c = 1.4
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
		return 1 - 0.6*outCubic(a/0.22)
	case a < 0.36:
		return 0.4
	case a < 0.62:
		return 0.4 * (1 - outCubic((a-0.36)/0.26))
	}
	if t >= titleFirstBlink {
		if b := math.Mod(t-titleFirstBlink, 4.1); b < 0.15 {
			return math.Sin(math.Pi * b / 0.15)
		}
	}
	return 0
}

// titleFrame is everything the picture needs at t.
type titleFrame struct {
	light, bloom float64 // the dawn: 0..1, and the swell after the tone
	show, lit    float64 // Ducter: there (alpha), and how lit (brightness)
	sx, sy, lift float64 // its breath, and the look up (in units)
	lids         float64
	word, wordY  float64 // the name: alpha, and how far below its place (units)
	prompt       float64
}

func titleAt(t float64) titleFrame {
	var f titleFrame
	f.light = smooth01((t - titleLightFrom) / (titleLightTo - titleLightFrom))
	f.bloom = 0.18 * smooth01((t-titleBell)/1.2)
	f.show = smooth01((t - 0.3) / 0.8)
	f.lit = 0.1 + 0.9*smooth01((t-titleDucFrom)/(titleDucTo-titleDucFrom))
	awake := smooth01((t - titleEyes) / 0.8)
	sleepW, idleW := waveAt(t, 4.4), waveAt(t-titleEyes, 3.8)
	f.sx = 1 + 0.016*sleepW*(1-awake) + 0.012*idleW*awake
	f.sy = 1 + 0.04*sleepW*(1-awake) + 0.03*idleW*awake
	if t > titleEyes {
		f.lift = -1.6 * outBack((t-titleEyes)/0.7)
	}
	f.lids = titleLids(t)
	f.word = smooth01((t - titleWordFrom) / (titleWordTo - titleWordFrom))
	f.wordY = 1.4 * (1 - outCubic((t-titleWordFrom)/1.4))
	f.prompt = smooth01((t - titlePrompt) / titlePromptIn)
	return f
}

// dim multiplies a color's channels by k and its alpha by alpha.
func dim(c ui.Color, k, alpha float64) ui.Color {
	m := func(v uint8) uint8 { return uint8(math.Round(float64(v) * clamp01(k))) }
	return ui.RGBA(m(c.R), m(c.G), m(c.B), float32(float64(c.A)/255*clamp01(alpha)))
}

// ellipseGlow fills a radial gradient stretched into an ellipse of radii
// rx, ry around (cx, cy).
func ellipseGlow(p *ui.Painter, r ui.Rect, cx, cy, rx, ry float32, stops []ui.GradientStop) {
	if rx <= 0 || ry <= 0 {
		return
	}
	sx := rx / ry
	p.Clip(r, 0, func() {
		p.Transform(ui.Scaling(sx, 1), cx, cy, func() {
			box := ui.Rect{X: cx - r.W/sx, Y: r.Y, W: 2 * r.W / sx, H: r.H}
			p.FillRadialGradient(box, ui.RadialGradient{
				Stops:  stops,
				Center: ui.Point{X: (cx - box.X) / box.W, Y: (cy - box.Y) / box.H},
				Radius: ry,
			}, 0)
		})
	})
}

func (a *App) drawTitle(p *ui.Painter, r ui.Rect) {
	rm := p.Preferences().ReduceMotion
	t := a.titleT()
	fade := 1.0
	if rm {
		fade = smooth01(t / 0.4)
		t = titleRest
	}
	f := titleAt(t)
	// One unit is a hundredth of the width, bounded by the height (the
	// prototype's 16:10 stage).
	u := min(r.W/100, r.H/62.5)

	p.Fill(r, titleNight, 0)
	// The ground warms as the light comes up.
	p.FillGradient(r, ui.LinearGradient{Angle: 0, Stops: []ui.GradientStop{
		{Color: dim(titleEarth, 1, 0.9*f.light*fade), At: 0},
		{Color: titleNight.Alpha(0), At: 0.7},
	}}, 0)
	// The dawn: low at first, rising to behind Ducter's feet.
	gy := float32(1.18-0.50*f.light) * r.H
	gr := float32(24+30*f.light+6*f.bloom) / 100
	a1 := (0.85*f.light + 0.6*f.bloom) * fade
	a2 := (0.34*f.light + 0.3*f.bloom) * fade
	ellipseGlow(p, r, r.X+r.W/2, r.Y+gy, gr*1.25*r.W, gr*r.H, []ui.GradientStop{
		{Color: dim(titleDawn, 1, a1), At: 0},
		{Color: dim(titleEmber, 1, a2), At: 0.38},
		{Color: dim(titleUmber, 1, 0.25*f.light*fade), At: 0.70},
		{Color: titleNight.Alpha(0), At: 1},
	})

	// Ducter, standing with its feet at 67% of the height.
	hero := theme.Hero()
	dw := min(24*u, 256)
	if hero != nil {
		bw, bh := hero.Size()
		dh := dw * float32(bh) / float32(bw)
		feet := r.Y + 0.67*r.H
		at := ui.Rect{X: r.X + (r.W-dw)/2, Y: feet - dh, W: dw, H: dh}
		// Its shadow on the floor, as lit as the floor is.
		ellipseGlow(p, r, r.X+r.W/2, feet+0.4*u, 15*u, 2*u, []ui.GradientStop{
			{Color: ui.RGBA(0, 0, 0, float32(0.55*f.show*f.light*fade)), At: 0},
			{Color: ui.RGBA(0, 0, 0, 0), At: 1},
		})
		show := f.show * fade
		p.Transform(ui.Translation(0, float32(f.lift)*u), 0, 0, func() {
			p.Transform(ui.Scaling(float32(f.sx), float32(f.sy)), at.X+at.W/2, at.Y+at.H, func() {
				p.ImageRegion(hero, ui.Rect{}, at, ui.ImageOptions{Tint: dim(ui.RGB(255, 255, 255), f.lit, show)})
				drawTitleLids(p, at, f.lids, f.lit, show)
			})
		})
	}

	// The name, and under it the prompt.
	if f.word > 0.001 {
		word := ui.Span{Text: "Ducter", Font: a.T.Display, Size: 7.4 * u, Weight: 800, Color: dim(titleCream, 1, f.word*fade)}
		w, _ := p.MeasureText(0, word)
		p.RichText(r.X+(r.W-w)/2, r.Y+0.71*r.H+float32(f.wordY)*u, 0, word)
	}
	if f.prompt > 0.001 {
		line := ui.Span{Text: a.L.T("title.prompt"), Font: a.T.Body, Size: max(1.75*u, 13), Weight: 500, Color: dim(titleCreamDim, 1, f.prompt*fade)}
		w, _ := p.MeasureText(0, line)
		p.RichText(r.X+(r.W-w)/2, r.Y+0.835*r.H, 0, line)
	}

	// Leaving: the light fills the window and becomes the paper the setup
	// card stands on.
	tl := &a.title
	if !tl.leaveAt.IsZero() {
		k := clamp01(float64(a.Now().Sub(tl.leaveAt)) / float64(a.titleLeaveDur()))
		// The dawn grows past the edges first (warm, never grey), then
		// the paper comes.
		g := float32(smooth01(k / 0.7))
		ellipseGlow(p, r, r.X+r.W/2, r.Y+0.68*r.H, (0.7+1.6*g)*r.W, (0.55+1.3*g)*r.H, []ui.GradientStop{
			{Color: dim(titleDawn, 1, float64(g)), At: 0},
			{Color: dim(a.T.Bg, 1, float64(g)), At: 0.5},
			{Color: dim(titleEmber, 1, 0.6*float64(g)), At: 1},
		})
		p.Fill(r, a.T.Bg.Alpha(float32(smooth01((k-0.35)/0.65))), 0)
		p.AnimationFrame()
		return
	}
	switch {
	case tl.at != 0:
	case rm:
		if t := a.titleT(); t < 0.4 {
			p.AnimationFrame()
		}
	case tl.start.IsZero():
		// Waiting for the window to be active (titleTick).
	case t >= titleEyes-0.1 && t < titleEyes+1 || t < titleLightFrom:
		p.AnimationFrame() // the eyes open: the display's rate
	case t < titlePrompt+titlePromptIn:
		p.AnimationFrameRate(idleFPS * 2)
	default:
		p.AnimationFrameRate(idleFPS) // it only breathes and blinks now
	}
}

// drawTitleLids draws the eyelids over the eyes, shut by k (1 shut), with
// the closed eye's line riding the lid's lower edge and fading as it lifts.
func drawTitleLids(p *ui.Painter, at ui.Rect, k, lit, show float64) {
	if k <= 0.005 {
		return
	}
	for _, l := range theme.FaceLids {
		box := ui.Rect{X: at.X + l.X*at.W, Y: at.Y + l.Y*at.H, W: l.W * at.W, H: l.H * at.H * float32(k)}
		var m ui.Path
		ellipse(&m, box.X+box.W/2, box.Y+box.H/2, box.W/2, box.H/2)
		p.FillPathGradient(&m, ui.LinearGradient{From: dim(l.From, lit, show), To: dim(l.To, lit, show), Angle: 90})

		// The line: the prototype's lash (a 100×40 drawing, 12.4% of the
		// art wide), its top at 66% of the lid's height.
		la := smooth01((k - 0.5) / 0.5)
		if la < 0.01 {
			continue
		}
		s := 0.124 * at.W / 100
		x0 := at.X + (l.X-0.008)*at.W
		y0 := at.Y + (l.Y+l.H*float32(k)*0.66-0.026)*at.H + (0.07*at.H-40*s)/2
		var lash ui.Path
		lash.MoveTo(x0+8*s, y0+8*s).QuadTo(x0+50*s, y0+40*s, x0+92*s, y0+8*s).Cap(ui.RoundCap)
		p.StrokePath(&lash, 9*s, dim(titleLash, lit, show*la))
	}
}
