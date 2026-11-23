package views

// D467 (round 2): On hand as a partner that reports. At its head the
// partner's brief in its own voice: what came back since you looked, the one
// thing it needs with the real fix inline, and what comes back next; no
// count strip. Work in motion shows it: a working task's trail (its own
// steps placed on its elapsed time, the head breathing at now), a group's
// parts as a track, the waits on one light time axis to when they return.
// A result carries what it made (a PR to open). At a wide window the peek
// beside the list sits in on the focused task. The web draws the same
// (apps/web/src/onhand.tsx).

import (
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

const (
	// peekW is the peek beside the list, from peekFrom points wide.
	peekW    = 360
	peekFrom = 1280
)

// ---------- the brief ----------

// phoneTask: a task that worked on a phone (its card says so, or one of its
// steps was a phone tool).
func phoneTask(task *store.Task) bool {
	if task.Card != nil && (task.Card.Handset != nil || task.Card.Phoning != nil) {
		return true
	}
	isPhone := func(ev *protocol.LogEvent) bool {
		if ev == nil || ev.Kind != protocol.KindTaskEvent {
			return false
		}
		var b protocol.TaskEvent
		return ev.Decode(&b) == nil && b.Tool != nil && strings.HasPrefix(b.Tool.Name, "phone_")
	}
	if task.Card != nil && isPhone(task.Card.Latest) {
		return true
	}
	for i := len(task.Events) - 1; i >= 0 && i >= len(task.Events)-40; i-- {
		if isPhone(&task.Events[i]) {
			return true
		}
	}
	return false
}

// briefTitle is a task named inside a sentence (D471): its title whole when
// it fits 28 columns (a Han character counts two), else cut at a word's end,
// never inside a word; the whole on hover.
func (a *App) briefTitle(title string) string {
	return sayName(title, 28)
}

// firstSentence is a report's first sentence, at most n runes.
func firstSentence(s string, n int) string {
	s = strings.TrimSpace(strings.SplitN(strings.TrimSpace(s), "\n", 2)[0])
	for _, stop := range []string{"。", "；", "! ", ". "} {
		if i := strings.Index(s, stop); i > 0 {
			s = s[:i]
		}
	}
	s = strings.TrimRight(s, "。.；; ")
	if r := []rune(s); len(r) > n {
		s = string(r[:n-1]) + "…"
	}
	return s
}

// brief is the partner at the head of the board: its figure and its one
// sentence, and nothing more (D471). Every task is said once, by its own row
// below; D467's lines under the lead named tasks the rows named again, and
// the two disagreed on the author's real board.
func (a *App) brief(c *ui.Context, b store.Board, lens string, n [4]int) {
	t := a.T
	a.oh.briefed = nil
	ui.Row(c.Key("oh-brief")).Gap(t.S5).AlignItems(ui.Center).Padding(t.S2, 0, t.S3, 0).Children(func() {
		a.avatar(c, moodOf(n), 72)
		uiText(c.Key("say"), keepWords(autospace(a.headLine(b, lens, n)))).Font(t.Display).FontSize(t.XL + 2).FontWeight(700).LineHeight(1.3).TextColor(t.Ink).
			Grow(1).Shrink(1).MinWidth(0)
	})
}

// ---------- outcomes ----------

var prNumber = regexp.MustCompile(`(?i)(?:PR\s*)?#(\d+)`)

// outcomeOf is what a finished task made that can be opened: a PR (its
// number and link), from its report's evidence, its merge or draft PR, or
// a PR named in its result.
func outcomeOf(task *store.Task) (label, url string) {
	if r := task.Report(); r != nil {
		for _, e := range r.Evidence {
			if i := strings.Index(e.Ref, "/pull/"); i > 0 {
				n := strings.TrimRight(e.Ref[i+6:], "/")
				if j := strings.IndexAny(n, "/#?"); j > 0 {
					n = n[:j]
				}
				return "#" + n, e.Ref
			}
		}
	}
	if task.Card != nil && task.Card.Integrated != nil && strings.Contains(task.Card.Integrated.Ref, "/pull/") {
		ref := task.Card.Integrated.Ref
		return "#" + ref[strings.LastIndex(ref, "/")+1:], ref
	}
	if r := task.Report(); r != nil && task.Place().Kind == "repo" && strings.Contains(r.Summary, "PR") {
		if m := prNumber.FindStringSubmatch(r.Summary); m != nil {
			return "#" + m[1], ""
		}
	}
	return "", ""
}

// outcomeChip is a result's PR as a small object to open (D467), quiet.
func (a *App) outcomeChip(c *ui.Context, key string, task *store.Task) bool {
	t := a.T
	label, url := outcomeOf(task)
	if label == "" {
		return false
	}
	chip := ui.Row(c.Key(key)).Gap(5).Height(22).Padding(0, t.S2).Radius(11).AlignItems(ui.Center).Background(t.SurfaceSunken).
		Shrink(0).Cursor(ui.CursorPointer).Role(ui.RoleLink).Label("PR " + label).Focusable().Tooltip(url)
	if chip.Hovered() {
		chip.Background(t.Sunken)
	}
	chip.Children(func() {
		if src := theme.Brand("github"); src != nil {
			ui.Image(c.Key("mark"), src).Size(12, 12).AccessHidden(true)
		}
		uiText(c.Key("n"), label).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).FontFeatures("tnum")
	})
	if chip.Clicked() {
		if url != "" {
			c.OpenURL(url)
		} else {
			a.OpenTask(task.ID)
		}
	}
	return true
}

// ---------- motion ----------

// groupTrack is a group's parts as one track (D467): done, at work
// (breathing), needing you, didn't work, in line.
func (a *App) groupTrack(c *ui.Context, bg boardGroup) {
	t := a.T
	if len(bg.rows) < 2 {
		return
	}
	rest := a.aliveResting(c)
	ui.Row(c.Key("track")).Gap(3).Height(6).AccessHidden(true).Children(func() {
		for i, r := range bg.rows {
			k := groupMark(r)
			col := t.Line
			switch k {
			case "done":
				col = t.Done.Dot
			case "working":
				col = t.Working.Dot
			case "needs":
				col = t.NeedsYou.Dot
			case "failed", "dropped":
				col = t.Failed.Dot
			}
			seg := ui.Box(c.Key(fmt.Sprint("s", i))).Grow(1).Basis(0).Height(6).Radius(3)
			if k == "working" {
				seg.Draw(func(p *ui.Painter, rc ui.Rect) {
					a := float32(1)
					if !p.Preferences().ReduceMotion && !rest {
						a = 0.5 + 0.5*float32(0.5-0.5*math.Cos(2*math.Pi*cycle(p.Now(), 1600*time.Millisecond, 0.3)))
						idleFrame(p)
					}
					var d ui.Path
					d.MoveTo(rc.X+3, rc.Y+rc.H/2).LineTo(rc.X+rc.W-3, rc.Y+rc.H/2).Cap(ui.RoundCap)
					p.StrokePath(&d, rc.H, col.Alpha(a))
				})
			} else {
				seg.Background(col)
			}
		}
	})
}

// waitCardWords is a waiting card's line that doesn't say its title again: when
// what it waits for is already the title's words, the report's first line,
// else its waiter's look, else nothing.
func (a *App) waitCardWords(task *store.Task, words string) string {
	core := strings.TrimSpace(words)
	for _, p := range []string{"等 ", "等", "Waiting until ", "Waiting for ", "until "} {
		core = strings.TrimPrefix(core, p)
	}
	if core == "" || !strings.Contains(strings.ToLower(task.Title()), strings.ToLower(core)) {
		return words
	}
	if r := task.Report(); r != nil {
		if l := strings.TrimSpace(strings.SplitN(strings.TrimSpace(r.Summary), "\n", 2)[0]); l != "" {
			return l
		}
	}
	if w := a.S.WaiterFor(task.ID); w != nil {
		return a.waitCaption(w)
	}
	return ""
}

// ---------- the peek ----------

// peekTask is the task the peek sits in on: the keys' focus, else the first
// in the walk.
func (a *App) peekTask() *store.Task {
	// D471: only a focus the keys moved to on this board holds the peek; one
	// kept from a task opened earlier doesn't.
	if a.oh.focus != "" && a.oh.focus == a.oh.walked {
		if x := a.S.Task(a.oh.focus); x != nil {
			return x
		}
	}
	// Unfocused, it sits in on the work under way first: that is what moves.
	for _, x := range a.S.Board().Lanes[store.LaneWorking] {
		if a.oh.lens == "" || lensOf(x) == a.oh.lens {
			return x
		}
	}
	for _, id := range a.oh.order {
		if x := a.S.Task(id); x != nil {
			return x
		}
	}
	return nil
}

// peek is the conductor's sit-in beside the list (D467): what the focused
// task is doing right now, its last few steps, and the way into it.
func (a *App) peek(c *ui.Context) {
	t := a.T
	task := a.peekTask()
	if task == nil {
		return
	}
	a.ensureHistory(task.ID)
	att := task.Attention()
	s := a.storyOf(task)
	card := ui.Column(c.Key("peek")).Width(peekW).Shrink(0).Gap(t.S3).Padding(16, 18, 16, 18).Radius(16).Background(t.Surface).
		Role(ui.RoleGroup).Label(task.Title())
	card.Shadow(0, 2, 0, 0, t.Line).Shadow(0, 6, 14, -10, t.Ink.Alpha(0.16))
	card.Children(func() {
		ui.Row(c.Key("head")).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			a.stateMark(c, task, a.stoppedWait(task))
			ui.Column(c.Key("tx")).Gap(2).Grow(1).Shrink(1).MinWidth(0).Children(func() {
				uiText(c.Key("title"), keepWords(autospace(shortTitle(task.Title())))).FontSize(t.MD + 1).FontWeight(700).TextColor(t.Ink).MaxLines(3).Tooltip(task.Title())
				ui.Row(c.Key("meta")).Gap(t.S2).Wrap().Children(func() {
					a.beat(c, task, att, false)
					for _, m := range a.whereMeta(task) {
						uiText(c.Key("m:"+m), m).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
					}
				})
			})
		})
		ink := t.InkSoft
		if s.tone == "failed" {
			ink = t.Failed.Ink
		}
		now := keepWords(autospace(s.words))
		if s.code != "" {
			now += "  " + s.code
		}
		// D471: what stopped says why in the partner's words; what the task
		// itself last said follows under its own label, whole.
		stuck := a.stoppedWait(task) || att == protocol.Failed
		if stuck {
			now, ink = keepWords(autospace(a.stuckFix(task).clause())), t.NeedsYou.Ink
		}
		uiText(c.Key("now"), now).FontSize(t.SM).LineHeight(1.5).TextColor(ink).MaxLines(4).Tooltip(s.words)
		if r := task.Report(); stuck && r != nil && strings.TrimSpace(r.Summary) != "" {
			uiText(c.Key("said-h"), a.L.T("onhand.peek.said")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
			uiText(c.Key("said"), keepWords(autospace(strings.TrimSpace(r.Summary)))).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft).MaxLines(5)
		}
		if finishedAtt(att) {
			a.outcomeChip(c, "chip", task)
		}
		// D467 round 4: its picture, from the views Ducter already has: the
		// phone's last frame this Mac held (D248), and the way into the live
		// browser (D190) or the phone (D217, D238); no stream of its own.
		if u := task.Card; u != nil && (u.Phoning != nil || u.Handset != nil) {
			dev := a.phoneFor(task.ID)
			if a.pu.bmp != nil && a.pu.heldDev == dev {
				w, h := a.pu.bmp.Size()
				pw := float32(peekW - 36)
				ph := pw * float32(h) / float32(max(1, w))
				if ph > 360 {
					pw, ph = pw*360/ph, 360
				}
				uiText(c.Key("last-h"), a.L.T("onhand.peek.last")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
				ui.Image(c.Key("last"), a.pu.bmp).Size(pw, ph).Radius(12).AlignSelf(ui.Center).Label(a.L.T("onhand.peek.last"))
			}
			ui.Row(c.Key("watch")).Children(func() {
				if a.button(c, a.L.T("onhand.peek.phone"), btnSecondary, t.ControlSM, t.Surface) {
					a.OpenPhone(dev, task.ID, "", "watch")
				}
			})
		} else if u != nil && u.Browsing != nil {
			ui.Row(c.Key("watch")).Children(func() {
				if a.button(c, a.L.T("wb.browser.watch"), btnSecondary, t.ControlSM, t.Surface) {
					a.OpenWatch(task.ID)
				}
			})
		}
		// D498: the last few steps in sentences (D152): its own words, one gist
		// for steps without words; a step that didn't work is a quiet line
		// with the transcript's small cross, never the failed ink.
		ss := a.saidOf(task, time.Time{})
		if len(ss) > 6 {
			ss = ss[len(ss)-6:]
		}
		if len(ss) > 0 {
			uiText(c.Key("steps-h"), a.L.T("onhand.peek.steps")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Padding(t.S2, 0, 0, 0)
			ui.Column(c.Key("steps")).Gap(6).Children(func() {
				for i, st := range ss {
					ui.Row(c.Key(fmt.Sprint("e", st.seq))).Gap(t.S2).AlignItems(ui.Center).MinWidth(0).Children(func() {
						draw := stepGlyph(st.k)
						switch {
						case st.bad:
							draw = drawCross
						case st.k == "voice":
							draw = stepGlyph("thought")
						}
						a.glyph(c, 14, draw(t.InkMuted))
						col := t.InkSoft
						if i == len(ss)-1 {
							col = t.Ink
						}
						uiText(c.Key("w"), keepWords(autospace(st.words))).FontSize(t.SM).TextColor(col).MaxLines(2).Shrink(1).MinWidth(0).Tooltip(st.words)
					})
				}
			})
		}
		ui.Row(c.Key("foot")).Padding(t.S2, 0, 0, 0).Children(func() {
			if a.button(c, a.L.T("onhand.peek.open"), btnSecondary, t.ControlSM, t.Surface) {
				a.OpenTask(task.ID)
			}
		})
	})
}
