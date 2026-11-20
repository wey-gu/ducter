package views

import (
	"math"
	"regexp"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// The waiting line, alive (D425): the clay partner where its words will
// land acts out the step it is on, a small loop of its own per step, beside
// one present-tense line in the person's terms that changes with a short
// cross-fade and a small rise, never faster than the dwell. The model is
// packages/protocol/src/alive.ts; both clients check fixtures/alive.json.
// The figure is a slot: any row that waits (a task at work with its coin,
// one of several asks under a message) uses aliveLine with its own figure.

// aliveMotion is how the figure moves for a step.
type aliveMotion string

const (
	aliveThink  aliveMotion = "think"  // a slow sway with a blink
	aliveGlance aliveMotion = "glance" // to one side, then the other
	aliveRead   aliveMotion = "read"   // the book pose, a nod as a page turns
	aliveLean   aliveMotion = "lean"   // leans in and back
	aliveLook   aliveMotion = "look"   // looks about, a little lift
	aliveSettle aliveMotion = "settle" // past aliveSettleAfter: breathing only
	aliveStill  aliveMotion = "still"  // reduced motion, resting
)

const (
	aliveDwell       = 1400 * time.Millisecond
	aliveSlow        = 15 * time.Second
	aliveLong        = 45 * time.Second
	aliveSettleAfter = 45 * time.Second
	aliveRest        = 90 * time.Second
	aliveAboutCols   = 34 // a wide character (Chinese) takes two
	// aliveSay is a new line's entrance (the web's --t-say).
	aliveSay = 240 * time.Millisecond
)

var aliveMotions = map[string]aliveMotion{
	"thinking": aliveThink, "planning": aliveThink,
	"recalling": aliveGlance, "looking": aliveGlance,
	"checking_task": aliveRead, "result": aliveRead, "relay": aliveRead,
	"opening_task": aliveLean, "messaging_task": aliveLean,
	"web": aliveLook,
}

// aliveMotionFor is the motion for a step at d into it; still wins.
func aliveMotionFor(step string, d time.Duration, still bool) aliveMotion {
	if still {
		return aliveStill
	}
	if d >= aliveSettleAfter {
		return aliveSettle
	}
	if m, ok := aliveMotions[step]; ok {
		return m
	}
	return aliveThink
}

// aliveFaceFor is the pose a step wears: the reading pose while it reads,
// else the idle face (whose eyes blink).
func aliveFaceFor(step string) theme.Presence {
	if aliveMotions[step] == aliveRead {
		return theme.Working
	}
	return theme.Idle
}

var (
	aliveSpace = regexp.MustCompile(`\s+`)
	aliveEnd   = regexp.MustCompile(`[。.？?！!]+$`)
)

// aliveCols is the columns a character takes: two for a wide one (CJK,
// kana, Hangul, full-width forms), else one.
func aliveCols(r rune) int {
	switch {
	case r >= 0x1100 && r <= 0x115F, r >= 0x2E80 && r <= 0xA4CF, r >= 0xAC00 && r <= 0xD7A3,
		r >= 0xF900 && r <= 0xFAFF, r >= 0xFE30 && r <= 0xFE4F, r >= 0xFF00 && r <= 0xFF60, r >= 0xFFE0 && r <= 0xFFE6:
		return 2
	}
	return 1
}

// clipAbout folds whitespace, drops end punctuation and cuts the object on
// a character with "…" to aliveAboutCols columns.
func clipAbout(s string) string {
	t := aliveEnd.ReplaceAllString(strings.TrimSpace(aliveSpace.ReplaceAllString(s, " ")), "")
	w := 0
	for _, r := range t {
		w += aliveCols(r)
	}
	if w <= aliveAboutCols {
		return t
	}
	var b strings.Builder
	w = 0
	for _, r := range t {
		if w+aliveCols(r) > aliveAboutCols-1 {
			break
		}
		b.WriteRune(r)
		w += aliveCols(r)
	}
	return strings.TrimRight(b.String(), " ") + "…"
}

// aliveWords is the line's i18n key and its one argument for a step as the
// server sends it.
func aliveWords(step, about, source string) (key, arg string) {
	about = strings.TrimSpace(about)
	switch step {
	case "checking_task", "messaging_task", "opening_task", "web":
		if about != "" {
			return "activity." + step + ".about", clipAbout(about)
		}
	case "looking":
		if source != "" {
			return "activity.looking." + source, ""
		}
	}
	return "activity." + step, ""
}

// aliveSubFor is the reassurance under the line at d into one step.
func aliveSubFor(d time.Duration) string {
	switch {
	case d >= aliveLong:
		return "activity.long"
	case d >= aliveSlow:
		return "activity.slow"
	}
	return ""
}

// aliveCadence is what the line shows at now, given what it shows (since
// shownAt) and the line wanted; wait is how long until the wanted one may.
func aliveCadence(shown string, shownAt time.Time, wanted string, now time.Time) (line string, changed bool, wait time.Duration) {
	if shown == "" || shown == wanted {
		return wanted, shown != wanted, 0
	}
	if left := shownAt.Add(aliveDwell).Sub(now); left > 0 {
		return shown, false, left
	}
	return wanted, true, 0
}

// aliveKey is one keyframe: at f of the loop, a shift (points) and a turn
// (degrees), with a squash in y.
type aliveKey struct{ f, x, y, deg, sy float64 }

// aliveLoops are the web's @keyframes alive-* (app.css), point for point.
var aliveLoops = map[aliveMotion]struct {
	period time.Duration
	keys   []aliveKey
}{
	aliveThink:  {2800 * time.Millisecond, []aliveKey{{0, 0, 0, 0, 1}, {0.30, 0, -1, -3, 1}, {0.70, 0, -0.5, 2.5, 1}, {1, 0, 0, 0, 1}}},
	aliveGlance: {3600 * time.Millisecond, []aliveKey{{0, 0, 0, 0, 1}, {0.12, -1.5, 0, -5, 1}, {0.36, -1.5, 0, -5, 1}, {0.50, 0, 0, 0, 1}, {0.62, 1.5, 0, 4, 1}, {0.86, 1.5, 0, 4, 1}, {1, 0, 0, 0, 1}}},
	aliveRead:   {2200 * time.Millisecond, []aliveKey{{0, 0, 0, 0, 1}, {0.58, 0, 0, 0, 1}, {0.68, 0, 1.5, 2.5, 0.98}, {0.84, 0, 0, 0, 1}, {1, 0, 0, 0, 1}}},
	aliveLean:   {2400 * time.Millisecond, []aliveKey{{0, 0, 0, 0, 1}, {0.32, 2, 0, 6, 1}, {0.52, 2, 0, 6, 1}, {1, 0, 0, 0, 1}}},
	aliveLook:   {3200 * time.Millisecond, []aliveKey{{0, 0, 0, 0, 1}, {0.20, 0, -2, -6, 1}, {0.40, 0, 0, 0, 1}, {0.60, 0, -2, 6, 1}, {0.80, 0, 0, 0, 1}, {1, 0, 0, 0, 1}}},
}

// alivePose is the figure's transform at now for a motion, about its feet
// (the bottom centre); none for settle and still.
func alivePose(m aliveMotion, now time.Time, phase float64) (ui.Transform, bool) {
	loop, ok := aliveLoops[m]
	if !ok {
		return ui.Transform{}, false
	}
	f := cycle(now, loop.period, phase)
	for i := 1; i < len(loop.keys); i++ {
		if f > loop.keys[i].f {
			continue
		}
		a, b := loop.keys[i-1], loop.keys[i]
		s := 0.0
		if b.f > a.f {
			s = (f - a.f) / (b.f - a.f)
		}
		s = 0.5 - 0.5*math.Cos(math.Pi*s) // ease-in-out between keys
		lerp := func(p, q float64) float32 { return float32(p + (q-p)*s) }
		// As CSS's translate() rotate() scale(): the squash first, then the turn, then the shift.
		return ui.Scaling(1, lerp(a.sy, b.sy)).Then(ui.Rotation(lerp(a.deg, b.deg))).Then(ui.Translation(lerp(a.x, b.x), lerp(a.y, b.y))), true
	}
	return ui.Transform{}, false
}

// aliveFigure is the clay partner in face, w points wide, moving by m: the
// loop about its feet, and inside it the breath (and the idle face's
// blink). Still draws the pose and nothing else.
func (a *App) aliveFigure(c *ui.Context, key string, face theme.Presence, m aliveMotion, w float32) ui.Element {
	bmp := theme.Face(face, w*2)
	idle := theme.Face(theme.Idle, w*2)
	h := w
	if idle != nil {
		iw, ih := idle.Size()
		h = w * float32(ih) / float32(iw)
	}
	phase := phaseOf(key)
	box := ui.Box(c.Key("alive:"+key)).Size(w, h).Shrink(0).AccessHidden(true)
	box.Draw(func(pt *ui.Painter, r ui.Rect) {
		if bmp == nil {
			return
		}
		at := fitIn(bmp, r)
		at.Y = r.Y + r.H - at.H
		var lids *blinkArt
		if face == theme.Idle && m != aliveStill {
			lids = faceBlink(w * 2)
		}
		breath := idleBreathe
		if m == aliveStill {
			breath = idleStill
		}
		draw := func() { clayArt(pt, at, bmp, breath, phase, lids) }
		if tr, ok := alivePose(m, pt.Now(), phase); ok && !pt.Preferences().ReduceMotion {
			pt.Transform(tr, at.X+at.W/2, at.Y+at.H, draw)
			idleFrame(pt)
			return
		}
		draw()
	})
	return box
}

// aliveShown is a line on screen and since when, per waiting row.
type aliveShown struct {
	line string
	at   time.Time
	// still: a row's first line, there without an entrance.
	still bool
}

// aliveHeld is words held for the dwell under key, and how far the shown
// line's entrance has come (0 … 1, eased out): for a row whose words come
// and go like the waiting line's (a working task's card on On hand).
func (a *App) aliveHeld(c *ui.Context, key, words string) (string, float32) {
	now := a.Now()
	if a.aliveShown == nil {
		a.aliveShown = map[string]aliveShown{}
	}
	s := a.aliveShown[key]
	line, changed, wait := aliveCadence(s.line, s.at, words, now)
	if changed {
		// The first line of a row is simply there; later ones come in.
		s = aliveShown{line: line, at: now, still: s.line == ""}
		a.aliveShown[key] = s
	}
	if wait > 0 {
		c.After(wait)
	}
	k := float32(1)
	if el := now.Sub(s.at); el < aliveSay && !s.still {
		k = float32(el) / float32(aliveSay)
		k = 1 - (1-k)*(1-k)*(1-k)
		c.After(time.Second / 60)
	}
	return line, k
}

// aliveLine is one alive line: figure, then the words (held at least the
// dwell), and an optional second, smaller line. A new line comes in with a
// cross-fade and a 3-point rise (a fade only under reduced motion).
func (a *App) aliveLine(c *ui.Context, key, words, sub string, figure func()) {
	t := a.T
	now := a.Now()
	if a.aliveShown == nil {
		a.aliveShown = map[string]aliveShown{}
	}
	s := a.aliveShown[key]
	line, changed, wait := aliveCadence(s.line, s.at, words, now)
	if changed {
		s = aliveShown{line: line, at: now}
		a.aliveShown[key] = s
	}
	if wait > 0 {
		c.After(wait)
	}
	still := c.Preferences().ReduceMotion
	row := ui.Row(c.Key("alive-row:" + key)).Gap(t.S3).AlignItems(ui.Center).MinHeight(40).Role(ui.RoleStatus).Label(line)
	row.Children(func() {
		figure()
		col := ui.Column(c.Key("alive-words:" + key)).Gap(1).MinWidth(0)
		col.Children(func() {
			w := ui.Box(c.Key("say:" + key + ":" + line))
			// The entrance plays once per line: from the moment it was shown.
			k := float32(1)
			if el := now.Sub(s.at); el < aliveSay {
				k = float32(el) / float32(aliveSay)
				k = 1 - (1-k)*(1-k)*(1-k) // ease out
				c.After(time.Second / 60)
			}
			w.Opacity(k)
			if !still {
				w.Translate(0, 3*(1-k))
			}
			w.Children(func() { uiText(c, line).FontSize(t.MD).TextColor(t.InkMuted) })
			if sub != "" {
				uiText(c.Key("sub:"+key), sub).FontSize(t.SM).TextColor(t.InkMuted)
			}
		})
	})
}

// aliveResting is whether the figure holds still for rest: the window has
// not been the active one for aliveRest (a Mac app's nearest sign that the
// person is away; a hidden window draws no frames at all).
func (a *App) aliveResting(c *ui.Context) bool {
	now := a.Now()
	if c.WindowActive() || a.aliveActiveAt.IsZero() {
		a.aliveActiveAt = now
	}
	left := a.aliveActiveAt.Add(aliveRest).Sub(now)
	if left > 0 {
		c.After(left)
		return false
	}
	return true
}
