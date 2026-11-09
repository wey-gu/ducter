package views

import (
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// The first five minutes, in the client: the empty conversation (D149),
// and one small celebration of the first result.

// words are the home's words in this window's language.
func (a *App) words(w protocol.Words) string {
	if a.L.Lang == i18n.ZH {
		return w.ZH
	}
	return w.EN
}

// dayPart names the part of the day an hour falls in, for the greeting.
func dayPart(h int) string {
	switch {
	case h >= 5 && h < 11:
		return "morning"
	case h >= 11 && h < 13:
		return "noon"
	case h >= 13 && h < 18:
		return "afternoon"
	case h >= 18 && h < 23:
		return "evening"
	}
	return "late"
}

// greeting is the partner saying hello in its own name, by this Mac's
// clock: "早上好呀，我是小鸭。" the first time, "早上好呀，小鸭在呢。" after.
func (a *App) greeting() string {
	visit := "first"
	if f := a.S.First; f != nil && f.Visit == "returning" {
		visit = "back"
	}
	return a.L.T("hello."+visit+"."+dayPart(a.Now().Hour()), a.S.PersonaName)
}

// canLine is what the partner can do for this person, one line (the home
// words it from what is connected); an older Ducter gets the plain one.
func (a *App) canLine() string {
	if f := a.S.First; f != nil && f.Line.ZH != "" {
		return a.words(f.Line)
	}
	return a.L.T("empty.conversation")
}

// sentences splits a short paragraph after its first sentence ("。" or
// ". "), so each shows on its own line; one sentence stays whole.
func sentences(s string) []string {
	for _, end := range []string{"。", ". "} {
		if i := strings.Index(s, end); i > 0 && i+len(end) < len(strings.TrimSpace(s)) {
			return []string{strings.TrimSpace(s[:i+len(end)]), strings.TrimSpace(s[i+len(end):])}
		}
	}
	return []string{s}
}

// suggestions are the starters of the empty conversation: 3–4, life
// first, from what the home knows (D149), else everyday ones.
func (a *App) suggestions() []string {
	var out []string
	if f := a.S.First; f != nil {
		for _, s := range f.Starters {
			if w := strings.TrimSpace(a.words(s.Words)); w != "" {
				out = append(out, w)
			}
		}
	}
	for i := 1; len(out) < 3; i++ {
		out = append(out, a.L.T(fmt.Sprintf("suggest.%d", i)))
	}
	return out
}

// helloFor is how long the partner's wave lasts when the empty
// conversation first appears.
const helloFor = 1600 * time.Millisecond

// helloPose is the partner's wave at d after it appeared (two rocks from
// its feet that settle, and a small hop), then its lean toward the
// composer while the person types (lean 0 … 1).
func helloPose(d time.Duration, lean float32) ui.Transform {
	tr := ui.Rotation(-5 * lean).Then(ui.Translation(4*lean, 2*lean))
	if d <= 0 || d >= helloFor {
		return tr
	}
	x := float64(d) / float64(helloFor)
	rock := float32(8 * math.Sin(2*math.Pi*2*x) * (1 - x))
	hop := float32(0)
	if x < 0.3 {
		hop = float32(-8 * math.Sin(math.Pi*x/0.3))
	}
	return ui.Rotation(rock).Then(ui.Translation(0, hop)).Then(tr)
}

// helloAvatar is the partner on the empty conversation: it breathes and
// blinks (D77), waves once when it first appears, and leans toward the
// composer while there are words in it. Under reduced motion it is still.
func (a *App) helloAvatar(c *ui.Context, size float32) {
	bmp := theme.Art(theme.Idle, size*2)
	if bmp == nil {
		a.avatar(c, theme.Idle, size)
		return
	}
	still := c.Preferences().ReduceMotion
	box := ui.Box(c.Key("hello-avatar")).Size(size, size).Role(ui.RoleImage).Label(a.L.T(presenceLabel[theme.Idle], a.S.PersonaName)).Shrink(0)
	born := ui.Local(box, "born", func() time.Time { return time.Time{} })
	lean := float32(0)
	if !still {
		target := float32(0)
		if strings.TrimSpace(a.draft) != "" {
			target = 1
		}
		lean = box.AnimateTo("lean", target, ui.Animation{Duration: 480 * time.Millisecond})
	}
	lids := squareBlink(size * 2)
	phase := phaseOf("hello-avatar")
	box.Draw(func(p *ui.Painter, r ui.Rect) {
		if still {
			clayArt(p, r, bmp, idleStill, phase, nil)
			return
		}
		if born.IsZero() {
			*born = p.Now()
		}
		d := p.Now().Sub(*born)
		p.Transform(helloPose(d, lean), r.X+r.W/2, r.Y+r.H, func() {
			clayArt(p, r, bmp, idleBreathe, phase, lids)
		})
		if d < helloFor {
			p.AnimationFrame()
		}
	})
}

// FirstResultFor is how long the first-result line stays.
const FirstResultFor = 14 * time.Second

// firstResult is the first task that ever came back done on this Mac.
type firstResult struct {
	taskID string
	at     time.Time
}

// noteFirstResult starts the celebration when a live task comes back done
// for the first time on this Mac: once, ever, never on replays.
func (a *App) noteFirstResult(st protocol.TaskState) {
	if a.firstDone != nil || a.Local.FirstResultSeen() {
		return
	}
	for id, t := range a.S.Tasks {
		if id != st.TaskID && t.Attention() == protocol.Done {
			return // the Log already holds a finished task: not the first
		}
	}
	a.firstDone = &firstResult{taskID: st.TaskID, at: a.Now()}
	a.Local.MarkFirstResultSeen(a.Now())
}

// firstResultLine is the celebration: the clay character holding up its
// finished pebble, one line, and Got it. It rises in once (still under
// reduced motion) and leaves by itself.
func (a *App) firstResultLine(c *ui.Context) {
	f := a.firstDone
	if f == nil || f.at.IsZero() {
		return
	}
	left := f.at.Add(FirstResultFor).Sub(a.Now())
	if left <= 0 {
		f.at = time.Time{}
		return
	}
	c.After(left)
	t := a.T
	a.aboveComposer(c, func() {
		row := a.notice(c, "firstresult", noticeDone, func() {
			if bmp := theme.Art(theme.Done, 112); bmp != nil {
				ui.Image(c, bmp).Size(40, 40).Margin(-4, 0).Shrink(0)
			} else {
				a.glyph(c, 24, drawCheck(t.Done.Ink))
			}
		}, func() {
			line := ui.Text(c, a.L.T("firstresult.line")).FontSize(t.SM).FontWeight(700).TextColor(t.Done.Ink).
				LineHeight(1.45).Cursor(ui.CursorPointer)
			if line.Clicked() && f.taskID != "" {
				a.OpenTask(f.taskID)
			}
		}, func() {
			if a.button(c, a.L.T("firstresult.ok"), btnText, t.ControlSM, t.Surface) {
				f.at = time.Time{}
			}
		})
		row.Label(a.L.T("firstresult.line"))
	})
}
