package views

import (
	"fmt"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D511: 照看 / Looking after (design/standing-work.md §6), as the web's
// keep.tsx. A Keep on On hand is one sheet under 在照看的: its mark, its
// title, its facts each its own element (D291), its last change, when it
// wakes next at the right, and the tasks at work on it set in under it. What
// waits for the person stands in 等你 once; the sheet says how many. A tap
// opens the Keep's own page in the board's place (never Settings): its life,
// 你说的, 在等你, 手上的, 每一轮 (silent rounds folded), a talk box, and 怎么照看
// with 暂停 and 停下.

// keepState is the Keep whose page is open ("" the list) and the page's own
// state.
type keepState struct {
	open    string
	pause   bool
	stop    bool
	said    string
	askedAt time.Time
	sig     string
}

// openKeep opens a Keep's page in On hand's place and asks the home for it.
func (a *App) openKeep(id string) {
	a.oh.keep = keepState{open: id, askedAt: time.Now()}
	a.send(protocol.KeepReq{T: "keep", ID: id})
	a.Route = RouteOnHand
}

func (a *App) closeKeep() { a.oh.keep = keepState{} }

// keepMark is the mark (§8): a lantern, lit while on, dim when paused, out
// with a tick when done, out when stopped. A flat placeholder until the clay
// art is rated: the one place a Keep's mark is drawn, so the art (or the
// track) takes its place here alone.
func (a *App) keepMark(c *ui.Context, key, life string, size float32) {
	t := a.T
	out := life == "done" || life == "stopped"
	glow := float32(0)
	switch life {
	case "on":
		glow = 1
	case "paused":
		glow = 0.32
	}
	ui.Box(c.Key("kmark:"+key)).Size(size, size).Shrink(0).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
		s := size / 40
		x := func(v float32) float32 { return r.X + v*s }
		y := func(v float32) float32 { return r.Y + v*s }
		var h ui.Path
		h.MoveTo(x(15), y(7.5)).CubeTo(x(15), y(4.7), x(17.2), y(2.5), x(20), y(2.5)).CubeTo(x(22.8), y(2.5), x(25), y(4.7), x(25), y(7.5))
		p.StrokePath(&h, 2*s, t.InkMuted)
		var cp ui.Path
		cp.MoveTo(x(12.5), y(12)).LineTo(x(27.5), y(12)).LineTo(x(25.5), y(8)).LineTo(x(14.5), y(8)).Close()
		p.FillPath(&cp, t.InkSoft)
		body := ui.Rect{X: x(11), Y: y(12), W: 18 * s, H: 21 * s}
		fill := t.Waiting.Surface
		if out {
			fill = t.SurfaceSunken
		}
		p.Fill(body, fill, 5*s)
		p.Stroke(body, t.InkSoft, 5*s, 2*s)
		if glow > 0 {
			p.FillPath(oval(x(20), y(23), 8*s, 8*s), t.Waiting.Dot.Alpha(glow*0.55))
		}
		var fl ui.Path
		fl.MoveTo(x(17.5), y(25.5)).CubeTo(x(17.5), y(22.5), x(20), y(21.5), x(20), y(18.5)).CubeTo(x(21.6), y(20.5), x(22.5), y(22.1), x(22.5), y(24.5)).
			CubeTo(x(22.5), y(26), x(21.4), y(27), x(20), y(27)).CubeTo(x(18.6), y(27), x(17.5), y(26.6), x(17.5), y(25.5)).Close()
		switch {
		case out:
			p.FillPath(&fl, t.Faint.Alpha(0.5))
		case glow > 0:
			p.FillPath(&fl, t.Accent.Alpha(glow))
		}
		p.Fill(ui.Rect{X: x(10), Y: y(31.5), W: 20 * s, H: 3 * s}, t.InkSoft, 1.5*s)
		if life == "done" {
			p.FillPath(oval(x(31), y(31), 7*s, 7*s), t.Done.Dot)
			var tk ui.Path
			tk.MoveTo(x(27.8), y(31.2)).LineTo(x(30), y(33.3)).LineTo(x(34), y(29))
			p.StrokePath(&tk, 2*s, t.Done.Ink)
		}
	})
}

type keepFact struct {
	text  string
	needs bool
}

// keepFacts are a Keep's facts, each its own element: what it holds, what
// waits, its rhythm, a short goal.
func (a *App) keepFacts(k *protocol.KeepSheet) []keepFact {
	var out []keepFact
	work := 0
	allPR := len(k.Items) > 0
	for _, x := range k.Items {
		if x.At != "you" && x.At != "ready" {
			work++
		}
		if x.PR == "" {
			allPR = false
		}
	}
	switch {
	case k.Run == "perItem" && len(k.Items) > 0 && allPR:
		out = append(out, keepFact{text: a.L.T("keep.holds.pr", len(k.Items))})
	case k.Run == "perItem" && len(k.Items) > 0:
		out = append(out, keepFact{text: a.L.T("keep.holds", len(k.Items))})
	case k.Run == "fresh" && work > 1:
		out = append(out, keepFact{text: a.L.T("keep.holds", work)})
	}
	if k.Asks > 0 {
		out = append(out, keepFact{text: a.L.T("keep.asks", k.Asks), needs: true})
	}
	if k.EveryMs > 0 {
		out = append(out, keepFact{text: a.L.T("keep.every", a.duration(time.Duration(k.EveryMs)*time.Millisecond))})
	} else if k.Cadence != "" {
		out = append(out, keepFact{text: k.Cadence})
	}
	if k.Reviews != nil && k.Reviews.Waiting > 0 {
		out = append(out, keepFact{text: a.L.T("keep.reviews", k.Reviews.Waiting)})
	}
	if k.Until != "" && len([]rune(k.Until)) <= 24 {
		out = append(out, keepFact{text: k.Until})
	}
	return out
}

// keepLine is how it keeps time when it doesn't; else its last change (a
// Keep with an address says its items instead).
func (a *App) keepLine(k *protocol.KeepSheet) string {
	if k.Health != nil {
		return strings.Join(a.ongoingHealthLine(k.Health), "")
	}
	if k.Run == "perItem" || k.Line == nil {
		return ""
	}
	return a.L.T("keep.line", i18n.Clock(store.ParseTime(k.Line.At)), k.Line.Text)
}

// keepBeat is a Keep at its right edge: when it wakes next, or why it doesn't.
func (a *App) keepBeat(k *protocol.KeepSheet) string {
	switch {
	case k.Life == "done" || k.Life == "stopped":
		return a.L.T("keep.life." + k.Life)
	case k.Life == "paused" && k.PausedUntil != "":
		return a.L.T("keep.beat.pausedUntil", a.soon(store.ParseTime(k.PausedUntil)))
	case k.Life == "paused":
		return a.L.T("keep.beat.paused")
	case k.Running:
		return a.L.T("keep.beat.running")
	case k.NextAt != "":
		return a.L.T("keep.beat.next", a.soon(store.ParseTime(k.NextAt)))
	}
	for _, w := range k.Wakes {
		if w.Kind == "arrives" {
			return a.L.T("keep.beat.arrives")
		}
	}
	return ""
}

// keepHidden are the tasks On hand stands under their Keep (never in 在做 or
// 在等); one that waits for the person stays in 等你, its row naming the Keep.
func (a *App) keepHidden() map[string]bool {
	out := map[string]bool{}
	if a.S.OnHand == nil {
		return out
	}
	for _, k := range a.S.OnHand.Keeps {
		for _, id := range k.TaskIDs {
			task := a.S.Task(id)
			if task != nil && a.waitsForYou(task) {
				continue
			}
			out[id] = true
		}
	}
	return out
}

// waitsForYou is a task that stands in 等你: it asks, it failed, its wait
// stopped, or its PR can merge (the merge is the person's, D508).
func (a *App) waitsForYou(task *store.Task) bool {
	att := task.Attention()
	if att == protocol.NeedsYou {
		return true
	}
	// D517: a stop, a failure or a PR to merge, until the person has looked at it.
	if _, _, mending := mendingOf(task); mending || a.looked(task) {
		return false
	}
	if att == protocol.Failed || a.stoppedWait(task) {
		return true
	}
	if pr, _, stands := prRow(task); pr != nil && stands == "needs" {
		return true
	}
	return false
}

// keepSheet is one Keep under 在照看的: its head opens its page; its tasks at
// work nest under it (up to three).
func (a *App) keepSheet(c *ui.Context, k *protocol.KeepSheet, w float32) {
	t := a.T
	stacked := w < 560
	ui.Column(c.Key("keep:"+k.ID)).Width(w).Radius(16).Background(t.Surface).Clip().
		Shadow(0, 2, 0, 0, t.Line).Shadow(0, 6, 14, -10, t.Ink.Alpha(0.16)).Margin(2, 0, 6, 0).Children(func() {
		facts := a.keepFacts(k)
		beat := a.keepBeat(k)
		line := a.keepLine(k)
		row := ui.Row(c.Key("head")).Width(w).Gap(14).Padding(14, 16, 14, 16).MinHeight(64).AlignItems(ui.Start).
			Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(a.L.T("keep.open", k.Title)).Focusable()
		a.rowHover(c, row, groundNeutral(), false) // D519
		row.Children(func() {
			a.keepMark(c, k.ID, k.Life, 40)
			ui.Column(c.Key("tx")).Gap(3).Grow(1).Shrink(1).MinWidth(0).Children(func() {
				ink := t.Ink
				if k.Life == "paused" {
					ink = t.InkMuted
				}
				uiText(c.Key("title"), k.Title).FontSize(t.MD).FontWeight(700).LineHeight(a.leading(1.4)).TextColor(ink).MaxLines(2)
				if len(facts) > 0 {
					ui.Row(c.Key("facts")).Gap(t.S3).Wrap().Children(func() {
						for i, f := range facts {
							e := uiText(c.Key(fmt.Sprint("f", i)), f.text).FontSize(t.SM).LineHeight(1.45).TextColor(t.InkMuted)
							if f.needs {
								e.TextColor(t.NeedsYou.Ink).FontWeight(600)
							}
						}
					})
				}
				if line != "" {
					ink := t.InkSoft
					if k.Health != nil {
						ink = t.NeedsYou.Ink
					}
					uiText(c.Key("line"), keepWords(autospace(line))).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(ink).MaxLines(2)
				}
				if stacked && beat != "" {
					uiText(c.Key("beat"), beat).FontSize(t.SM).TextColor(t.InkMuted)
				}
			})
			if !stacked && beat != "" {
				uiText(c.Key("beat"), beat).FontSize(t.SM).TextColor(t.InkMuted).SingleLine().Shrink(0)
			}
		})
		if row.Clicked() {
			a.openKeep(k.ID)
		}
		if k.Run != "perItem" {
			return
		}
		var nested []protocol.KeepItem
		for _, x := range k.Items {
			if x.At != "you" && x.At != "ready" {
				nested = append(nested, x)
			}
		}
		if len(nested) == 0 {
			return
		}
		ui.Column(c.Key("held")).Width(w).Padding(0, 16, 8, 70).Children(func() {
			for i, x := range nested {
				if i == 3 {
					more := ui.Row(c.Key("more")).Padding(8, 0).Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Children(func() {
						uiText(c, a.L.T("keep.more", len(nested)-3)).FontSize(t.SM).TextColor(t.InkMuted)
					})
					if more.Clicked() {
						a.openKeep(k.ID)
					}
					break
				}
				x := x
				h := ui.Row(c.Key("h:"+x.TaskID)).Gap(10).Padding(8, 0).BorderWidth(1, 0, 0, 0).BorderColor(t.LineSoft).AlignItems(ui.Center).
					Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(x.Title).Focusable()
				h.Children(func() {
					a.keepDot(c, x.At, 8)
					ui.Row(c.Key("n")).Gap(6).Grow(1).Shrink(1).MinWidth(0).Children(func() {
						if n := keepPRNum(x.PR); n != "" && !strings.Contains(x.Title, n) {
							uiText(c.Key("pr"), n).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine().Shrink(0)
						}
						uiText(c.Key("t"), x.Title).FontSize(t.SM).TextColor(t.InkSoft).SingleLine().Shrink(1)
					})
					text, ink := a.keepItemWords(x)
					uiText(c.Key("s"), text).FontSize(t.SM).TextColor(ink).SingleLine().Shrink(0)
				})
				if h.Clicked() {
					a.OpenTask(x.TaskID)
				}
			}
		})
	})
}

func keepPRNum(pr string) string {
	if i := strings.LastIndex(pr, "#"); i >= 0 {
		return pr[i:]
	}
	return ""
}

func (a *App) keepDot(c *ui.Context, at string, size float32) {
	t := a.T
	col := t.Line2
	switch at {
	case "work":
		col = t.Working.Dot
	case "you":
		col = t.NeedsYou.Dot
	case "ready":
		col = t.Done.Dot
	}
	ui.Box(c.Key("dot")).Size(size, size).Radius(size / 2).Background(col).Shrink(0).AccessHidden(true)
}

// keepItemWords is where an item stands, in words, and its ink.
func (a *App) keepItemWords(x protocol.KeepItem) (string, ui.Color) {
	t := a.T
	switch {
	case x.At == "ready":
		return a.L.T("keep.item.ready"), t.Done.Ink
	case x.At == "you" && x.Yours != "":
		return x.Yours, t.NeedsYou.Ink
	case x.At == "you":
		return a.L.T("keep.item.you"), t.NeedsYou.Ink
	case x.Said != nil:
		return a.L.T("onhand.prs." + x.Said.Phase), t.Working.Ink
	case x.At == "work":
		return a.L.T("keep.item.work"), t.Working.Ink
	}
	return a.L.T("keep.item.rest"), t.InkMuted
}

// keepsSection is 在照看的 / Looking after on On hand.
func (a *App) keepsSection(c *ui.Context, ks []protocol.KeepSheet) {
	w := a.oh.listW
	if w <= 0 {
		w = onHandMeasure
	}
	a.listSection(c, "keeps", a.L.T("keep.section"), len(ks), func() {
		for i := range ks {
			a.keepSheet(c, &ks[i], w)
		}
	})
}

// keepRail lists the other Keeps beside an opened one (the rail beside an
// opened task, D244), from railFrom.
func (a *App) keepRail(c *ui.Context) {
	t := a.T
	ui.Column(c.Key("keep-rail")).Width(lensColW).Shrink(0).Gap(2).Padding(t.S5, t.S3, t.S5, t.S5).Children(func() {
		back := ui.Row(c.Key("back")).Padding(4, 4, 12, 4).Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Children(func() {
			uiText(c, "‹ "+a.L.T("keep.back")).FontSize(t.SM).FontWeight(600).TextColor(t.InkMuted)
		})
		if back.Clicked() {
			a.closeKeep()
		}
		uiText(c.Key("lbl"), a.L.T("keep.section")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Margin(0, 0, 6, 12)
		if a.S.OnHand == nil {
			return
		}
		for i := range a.S.OnHand.Keeps {
			k := &a.S.OnHand.Keeps[i]
			on := k.ID == a.oh.keep.open
			r := ui.Row(c.Key("k:"+k.ID)).Gap(10).Padding(10, 12).Radius(t.RadiusMD).AlignItems(ui.Center).
				Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(k.Title).Focusable()
			if on {
				r.Background(t.Surface).Shadow(0, 2, 0, 0, t.Line)
			}
			r.Children(func() {
				a.keepMark(c, k.ID, k.Life, 40)
				ui.Column(c.Key("tx")).Gap(1).Grow(1).Shrink(1).MinWidth(0).Children(func() {
					uiText(c.Key("t"), k.Title).FontSize(t.SM).FontWeight(600).TextColor(t.Ink).MaxLines(2)
					sub, ink := a.keepBeat(k), t.InkMuted
					if k.Asks > 0 {
						sub, ink = a.L.T("keep.asks", k.Asks), t.NeedsYou.Ink
					}
					uiText(c.Key("l"), sub).FontSize(t.XS).TextColor(ink)
				})
			})
			if r.Clicked() {
				a.openKeep(k.ID)
			}
		}
	})
}

func (a *App) keepSheetByID(id string) *protocol.KeepSheet {
	if a.S.OnHand == nil {
		return nil
	}
	for i := range a.S.OnHand.Keeps {
		if a.S.OnHand.Keeps[i].ID == id {
			return &a.S.OnHand.Keeps[i]
		}
	}
	return nil
}

// keepPage is a Keep's own page, in the board's place: a reading column and,
// from 1120, a side column of 320.
func (a *App) keepPage(c *ui.Context, w float32) {
	t := a.T
	ks := &a.oh.keep
	sheet := a.keepSheetByID(ks.open)
	k := a.S.KeepPages[ks.open]
	// The page follows On hand: asked again when its sheet changed.
	sig := ks.open
	if sheet != nil {
		sig = fmt.Sprintf("%s|%d|%d|%s|%v", ks.open, len(sheet.Items), sheet.Asks, sheet.Life, sheet.Line)
	}
	if sig != ks.sig || (k == nil && time.Since(ks.askedAt) > 1500*time.Millisecond) {
		ks.sig, ks.askedAt = sig, time.Now()
		a.send(protocol.KeepReq{T: "keep", ID: ks.open})
	}
	if k == nil {
		msg := a.L.T("keep.loading")
		if sheet == nil {
			msg = a.L.T("keep.gone")
		}
		uiText(c.Key("keep-loading"), msg).FontSize(t.MD).TextColor(t.InkMuted).Margin(t.S6, 0)
		return
	}
	wide := w >= 860
	mainW := w
	if wide {
		mainW = w - 320 - t.S6
	}
	body := func() {
		ui.Column(c.Key("keep-main")).Width(mainW).Shrink(1).MinWidth(0).Gap(4).Children(func() { a.keepMain(c, k, mainW) })
		ui.Column(c.Key("keep-side")).Width(min(w, 320)).Shrink(0).Gap(4).Children(func() {
			a.keepH2(c, "how", a.L.T("keep.how"))
			a.keepRules(c, k)
		})
	}
	if !wide {
		ui.Column(c.Key("keep-page")).Width(w).Gap(4).Children(func() {
			back := ui.Row(c.Key("back")).Padding(4, 4, 8, 4).Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Children(func() {
				uiText(c, "‹ "+a.L.T("keep.back")).FontSize(t.SM).FontWeight(600).TextColor(t.InkMuted)
			})
			if back.Clicked() {
				a.closeKeep()
			}
			body()
		})
		return
	}
	ui.Row(c.Key("keep-page")).Width(w).Gap(t.S6).AlignItems(ui.Start).Children(body)
}

func (a *App) keepH2(c *ui.Context, key, s string) {
	uiText(c.Key("h2:"+key), s).FontSize(a.T.XS).FontWeight(700).TextColor(a.T.InkMuted).Margin(22, 0, 8, 4)
}

func (a *App) keepCard(c *ui.Context, key string, w float32, body func()) {
	t := a.T
	ui.Column(c.Key("kcard:"+key)).Width(w).Radius(16).Background(t.Surface).Clip().
		Shadow(0, 2, 0, 0, t.Line).Shadow(0, 6, 14, -10, t.Ink.Alpha(0.16)).Children(body)
}

func (a *App) keepMain(c *ui.Context, k *protocol.KeepPage, w float32) {
	t := a.T
	ui.Row(c.Key("ph")).Gap(18).AlignItems(ui.Start).Margin(0, 0, 12, 0).Children(func() {
		a.keepMark(c, "page", k.Life, 64)
		ui.Column(c.Key("tx")).Gap(2).Grow(1).Shrink(1).MinWidth(0).Children(func() {
			uiText(c.Key("kick"), a.L.T("keep.kicker", a.S.PersonaName)).FontSize(t.SM).FontWeight(600).TextColor(t.InkMuted)
			uiText(c.Key("title"), k.Title).FontSize(t.XXL).FontWeight(800).TextColor(t.Ink).LineHeight(1.2).Margin(2, 0, 8, 0)
			ui.Row(c.Key("life")).Gap(8).Wrap().Children(func() {
				chip := func(key, s string, bg, ink ui.Color, bold bool) {
					e := uiText(c.Key("chip:"+key), s).FontSize(t.SM).TextColor(ink).Padding(3, 10).Radius(999).Background(bg)
					if bold {
						e.FontWeight(700)
					}
				}
				on := k.Life == "on"
				if on {
					chip("life", a.L.T("keep.life."+k.Life), t.Done.Surface, t.Done.Ink, true)
				} else {
					chip("life", a.L.T("keep.life."+k.Life), t.SurfaceSunken, t.InkSoft, false)
				}
				if k.Asks > 0 {
					chip("asks", a.L.T("keep.asks", k.Asks), t.NeedsYou.Surface, t.NeedsYou.Ink, true)
				}
				chip("since", a.L.T("keep.since", a.when(store.ParseTime(k.Since))), t.SurfaceSunken, t.InkSoft, false)
				if k.Run == "perItem" && k.Week > 0 {
					chip("week", a.L.T("keep.week", k.Week), t.SurfaceSunken, t.InkSoft, false)
				}
			})
		})
	})
	ui.Column(c.Key("said")).Width(w).Gap(2).Padding(12, 14).Radius(t.RadiusMD).Background(t.SurfaceSunken).Children(func() {
		uiText(c.Key("k"), a.L.T("keep.said")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
		uiText(c.Key("v"), keepWords(autospace(k.Said))).FontSize(t.SM).LineHeight(a.leading(1.6)).TextColor(t.InkSoft)
	})
	// 在等你: its tasks' questions, answered in place (the same card as in 等你).
	var asking []*store.Task
	for _, x := range k.Items {
		if task := a.S.Task(x.TaskID); task != nil && a.S.PendingDecision(task.ID) != nil {
			asking = append(asking, task)
		}
	}
	if len(asking) > 0 {
		a.keepH2(c, "waiting", a.L.T("keep.waiting"))
		prev := a.oh.listW
		a.oh.listW = w
		for _, task := range asking {
			a.needsCard(c.Key("ask:"+task.ID), task)
		}
		a.oh.listW = prev
	}
	hasPR := false
	for _, x := range k.Items {
		if x.PR != "" {
			hasPR = true
		}
	}
	if k.Run != "same" || hasPR {
		a.keepH2(c, "holding", a.L.T("keep.holding"))
		if len(k.Items) == 0 {
			uiText(c.Key("holding-none"), a.L.T("keep.holding.none")).FontSize(t.SM).TextColor(t.InkMuted).Padding(14, 16).Radius(16).Background(t.SurfaceSunken).Width(w)
		} else {
			a.keepCard(c, "items", w, func() { a.keepItems(c, k, w) })
		}
	}
	a.keepH2(c, "rounds", a.L.T("keep.rounds"))
	if len(k.Rounds) == 0 {
		uiText(c.Key("rounds-none"), a.L.T("keep.rounds.none")).FontSize(t.SM).TextColor(t.InkMuted).Padding(14, 16).Radius(16).Background(t.SurfaceSunken).Width(w)
	} else {
		a.keepCard(c, "rounds", w, func() { a.keepRounds(c, k, w) })
	}
	if k.Life == "on" || k.Life == "paused" {
		a.keepTalk(c, k, w)
	}
}

func (a *App) keepItems(c *ui.Context, k *protocol.KeepPage, w float32) {
	t := a.T
	for i, x := range k.Items {
		x := x
		r := ui.Row(c.Key("it:"+x.TaskID)).Width(w).Gap(12).Padding(14, 16).AlignItems(ui.Start)
		if i > 0 {
			r.BorderWidth(1, 0, 0, 0).BorderColor(t.LineSoft)
		}
		r.Children(func() {
			ui.Box(c.Key("dw")).Size(24, 20).Shrink(0).Padding(5, 0, 0, 6).Children(func() { a.keepDot(c, x.At, 12) })
			ui.Column(c.Key("b")).Gap(3).Grow(1).Shrink(1).MinWidth(0).Children(func() {
				ui.Row(c.Key("t")).Gap(6).Wrap().Children(func() {
					if n := keepPRNum(x.PR); n != "" && !strings.Contains(x.Title, n) {
						uiText(c.Key("pr"), n).FontSize(t.MD).FontWeight(700).TextColor(t.Ink)
					}
					uiText(c.Key("title"), x.Title).FontSize(t.MD).FontWeight(600).TextColor(t.Ink).LineHeight(a.leading(1.4)).Shrink(1)
				})
				text, ink := a.keepItemWords(x)
				uiText(c.Key("st"), keepWords(autospace(text))).FontSize(t.SM).TextColor(ink).LineHeight(a.leading(1.5))
				if x.Said != nil && x.Said.Checks != nil && x.Said.Checks.Total > 0 {
					ch := x.Said.Checks
					ui.Row(c.Key("checks")).Gap(3).Wrap().Margin(6, 0, 0, 0).AccessHidden(true).Children(func() {
						for j := 0; j < ch.Total && j < 24; j++ {
							col := t.Done.Dot
							if j >= ch.Passed+ch.Pending {
								col = t.Failed.Dot
							} else if j >= ch.Passed {
								col = t.Waiting.Dot
							}
							ui.Box(c.Key(fmt.Sprint("c", j))).Size(10, 10).Radius(3).Background(col)
						}
					})
				}
				if x.Said != nil && x.Said.Phase == "ready" && len(x.Said.By) > 0 {
					uiText(c.Key("by"), a.L.T("onhand.prs.approved", strings.Join(x.Said.By, a.L.T("onhand.prs.sep")))).FontSize(t.XS).TextColor(t.InkMuted)
				}
			})
			if a.buttonFor(c, a.L.T("keep.item.task"), x.Title, btnText, t.ControlSM, t.Surface) {
				a.OpenTask(x.TaskID)
			}
		})
	}
}

func (a *App) keepRoundWoke(r protocol.KeepRound, k *protocol.KeepPage) string {
	switch r.Woke {
	case "arrival":
		if r.WokeWhat != "" {
			return a.L.T("keep.woke.arrival", r.WokeWhat)
		}
		return a.L.T("keep.woke.arrival.bare")
	case "change":
		if r.WokeWhat != "" {
			return a.L.T("keep.woke.change", r.WokeWhat)
		}
		return a.L.T("keep.woke.change.bare")
	case "now":
		return a.L.T("keep.woke.now")
	case "first":
		return a.L.T("keep.woke.first")
	}
	if k.EveryMs > 0 {
		return a.L.T("keep.woke.every", a.duration(time.Duration(k.EveryMs)*time.Millisecond))
	}
	return a.L.T("keep.woke.time")
}

// keepRounds are its rounds, newest first; silent ones after the first four
// fold into one line with small pips.
func (a *App) keepRounds(c *ui.Context, k *protocol.KeepPage, w float32) {
	t := a.T
	shown, fold := 0, 0
	first := true
	line := func(key string) ui.Element {
		r := ui.Row(c.Key(key)).Width(w).Gap(12).Padding(11, 16).AlignItems(ui.Start)
		if !first {
			r.BorderWidth(1, 0, 0, 0).BorderColor(t.LineSoft)
		}
		first = false
		return r
	}
	for i, r := range k.Rounds {
		quiet := r.Spoke == "silent" && r.State != "running" && r.State != "failed"
		if quiet && shown >= 4 {
			fold++
			continue
		}
		shown++
		r := r
		at := store.ParseTime(r.At)
		row := line(fmt.Sprint("rd", i))
		if r.TaskID != "" {
			row.Cursor(ui.CursorPointer).Role(ui.RoleLink).Focusable()
		}
		row.Children(func() {
			uiText(c.Key("tm"), a.soon(at)).FontSize(t.SM).TextColor(t.InkMuted).Width(64).Shrink(0)
			ui.Column(c.Key("b")).Gap(2).Grow(1).Shrink(1).MinWidth(0).Children(func() {
				uiText(c.Key("why"), a.keepRoundWoke(r, k)).FontSize(t.XS).TextColor(t.InkMuted)
				if r.Did != "" {
					uiText(c.Key("did"), keepWords(autospace(r.Did))).FontSize(t.SM).TextColor(t.Ink).LineHeight(a.leading(1.5))
				}
			})
			out, ink, bold := a.L.T("keep.round."+r.Spoke), t.InkMuted, false
			switch {
			case r.State == "running":
				out = a.L.T("keep.round.running")
			case r.State == "failed":
				out, ink = a.L.T("keep.round.failed"), t.Failed.Ink
			case r.State == "skipped":
				out = a.L.T("keep.round.skipped")
			case r.Spoke == "asked":
				ink, bold = t.NeedsYou.Ink, true
			case r.Spoke == "told":
				ink, bold = t.InkSoft, true
			}
			e := uiText(c.Key("out"), out).FontSize(t.XS).TextColor(ink).SingleLine().Shrink(0)
			if bold {
				e.FontWeight(700)
			}
		})
		if r.TaskID != "" && row.Clicked() {
			a.OpenTask(r.TaskID)
		}
	}
	if fold > 0 {
		line("fold").AlignItems(ui.Center).Children(func() {
			ui.Row(c.Key("pips")).Gap(3).AccessHidden(true).Children(func() {
				for j := 0; j < fold && j < 6; j++ {
					ui.Box(c.Key(fmt.Sprint("p", j))).Size(6, 6).Radius(3).Background(t.Line2)
				}
			})
			uiText(c.Key("t"), a.L.T("keep.rounds.fold", fold)).FontSize(t.SM).TextColor(t.InkMuted)
		})
	}
}

// keepTalk is the talk box under the rounds: what is typed goes to the
// partner with the Keep attached (keep_change changes it).
func (a *App) keepTalk(c *ui.Context, k *protocol.KeepPage, w float32) {
	t := a.T
	example := a.L.T("keep.talk.at")
	switch {
	case k.Run == "perItem":
		example = a.L.T("keep.talk.helper")
	case k.EveryMs > 0:
		example = a.L.T("keep.talk.every")
	}
	ph := a.L.T("keep.talk", example)
	ui.Row(c.Key("talk")).Width(w).Gap(10).Margin(22, 0, 0, 0).Padding(8, 8, 8, 18).Radius(t.RadiusXL).Background(t.Surface).
		Shadow(0, 2, 0, 0, t.Line).AlignItems(ui.Center).Children(func() {
		in := ui.TextInput(c.Key("talk-in"), &a.oh.keep.said).Placeholder(ph).Label(ph).Grow(1).MinWidth(0).Height(t.ControlMD).FontSize(t.MD)
		send := a.buttonFor(c, a.L.T("keep.talk.send"), k.Title, btnAccent, t.ControlSM, t.Surface)
		if (send || in.Submitted()) && strings.TrimSpace(a.oh.keep.said) != "" {
			a.send(protocol.KeepSay{T: "send", Text: strings.TrimSpace(a.oh.keep.said), ClientID: fmt.Sprintf("m%dkeep", time.Now().UnixNano()), Keep: k.ID})
			a.oh.keep.said = ""
		}
	})
}

// keepRules is 怎么照看 / How it runs, with 暂停 ▾, 现在看一次 and 停下.
func (a *App) keepRules(c *ui.Context, k *protocol.KeepPage) {
	t := a.T
	w := float32(320)
	a.keepCard(c, "rules", w, func() {
		ui.Column(c.Key("rules")).Width(w).Padding(4, 16, 16, 16).Children(func() {
			type rule struct {
				k     string
				v     []string
				muted string
			}
			var wakes []string
			onlyArrives := true
			for _, x := range k.Wakes {
				switch x.Kind {
				case "arrives":
					wakes = append(wakes, a.L.T("keep.wake.arrives"))
				case "every":
					onlyArrives = false
					wakes = append(wakes, a.L.T("keep.every", a.duration(time.Duration(x.EveryMs)*time.Millisecond)))
				case "at":
					onlyArrives = false
					wakes = append(wakes, x.Words)
				default:
					if x.Words != "" {
						onlyArrives = false
						wakes = append(wakes, a.L.T("keep.wake.changes", x.Words))
					} else {
						wakes = append(wakes, a.L.T("keep.wake.changes.prs"))
					}
				}
			}
			speaks := k.Speaks
			if speaks == "" {
				speaks = a.L.T("keep.speaks.default")
			}
			rules := []rule{{"keep.rule.wakes", wakes, ""}}
			// Its end as given, or as the model read it from their words; nothing until it has (never a guess).
			switch {
			case k.Until != "":
				rules = append(rules, rule{"keep.rule.until", []string{k.Until}, ""})
			case k.NoEnd:
				rules = append(rules, rule{"keep.rule.until", []string{a.L.T("keep.until.none")}, ""})
			}
			rules = append(rules, rule{"keep.rule.speaks", []string{speaks}, a.L.T("keep.speaks.quiet")})
			if k.Limits != "" || k.Run == "perItem" {
				l := k.Limits
				if l == "" {
					l = a.L.T("keep.limits.helper")
				}
				rules = append(rules, rule{"keep.rule.limits", []string{l}, ""})
			}
			if k.Where != nil {
				var parts []string
				if k.Where.DeviceName != "" {
					parts = append(parts, k.Where.DeviceName)
				}
				if k.Where.Harness != "" {
					parts = append(parts, harnessName(k.Where.Harness))
				}
				sep := a.L.T("keep.where.sep")
				if len(parts) > 0 {
					rules = append(rules, rule{"keep.rule.where", []string{strings.Join(parts, sep)}, ""})
				}
			}
			if k.Address != nil {
				rules = append(rules, rule{"keep.rule.address", []string{a.L.T("keep.address.name", k.Address.Name)}, a.L.T("keep.address." + k.Address.Mem)})
			}
			for i, r := range rules {
				row := ui.Column(c.Key("ru:"+r.k)).Gap(2).Padding(12, 0)
				if i < len(rules)-1 {
					row.BorderWidth(0, 0, 1, 0).BorderColor(t.LineSoft)
				}
				row.Children(func() {
					uiText(c.Key("k"), a.L.T(r.k)).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
					for j, v := range r.v {
						uiText(c.Key(fmt.Sprint("v", j)), keepWords(autospace(v))).FontSize(t.SM).TextColor(t.Ink).LineHeight(a.leading(1.5))
					}
					if r.muted != "" {
						uiText(c.Key("m"), r.muted).FontSize(t.SM).TextColor(t.InkMuted)
					}
				})
			}
			if k.Life == "done" || k.Life == "stopped" {
				return
			}
			ks := &a.oh.keep
			ui.Row(c.Key("acts")).Gap(8).Wrap().Padding(14, 0, 0, 0).Children(func() {
				if k.Life == "paused" {
					if a.buttonFor(c, a.L.T("keep.resume"), k.Title, btnSecondary, t.ControlSM, t.Surface) {
						a.send(protocol.KeepAct{T: "keep_action", ID: k.ID, Action: "resume"})
					}
				} else if a.buttonFor(c, a.L.T("keep.pause"), k.Title, btnSecondary, t.ControlSM, t.Surface) {
					ks.pause, ks.stop = !ks.pause, false
				}
				if k.Life == "on" && !onlyArrives && a.buttonFor(c, a.L.T("keep.look"), k.Title, btnSecondary, t.ControlSM, t.Surface) {
					a.send(protocol.KeepAct{T: "keep_action", ID: k.ID, Action: "look_now"})
				}
				if a.buttonFor(c, a.L.T("keep.stop"), k.Title, btnSecondary, t.ControlSM, t.Surface) {
					ks.stop, ks.pause = !ks.stop, false
				}
			})
			if ks.pause {
				ui.Column(c.Key("pause-menu")).Gap(2).Padding(6).Margin(10, 0, 0, 0).Radius(t.RadiusMD).Background(t.SurfaceSunken).Children(func() {
					now := a.Now()
					morning := time.Date(now.Year(), now.Month(), now.Day()+1, 8, 0, 0, 0, now.Location())
					for _, p := range []struct {
						key   string
						until time.Time
					}{{"keep.pause.hour", now.Add(time.Hour)}, {"keep.pause.morning", morning}, {"keep.pause.week", now.Add(7 * 24 * time.Hour)}, {"keep.pause.resume", time.Time{}}} {
						if a.buttonFor(c, a.L.T(p.key), k.Title, btnText, t.ControlSM, t.SurfaceSunken) {
							f := protocol.KeepAct{T: "keep_action", ID: k.ID, Action: "pause"}
							if !p.until.IsZero() {
								f.Until = p.until.UTC().Format(time.RFC3339)
							}
							a.send(f)
							ks.pause = false
						}
					}
				})
			}
			if ks.stop {
				ui.Column(c.Key("stop-ask")).Gap(10).Padding(12).Margin(10, 0, 0, 0).Radius(t.RadiusMD).Background(t.SurfaceSunken).Children(func() {
					uiText(c.Key("q"), a.L.T("keep.stop.ask")).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.5))
					ui.Row(c.Key("acts")).Gap(8).Children(func() {
						if a.buttonFor(c, a.L.T("keep.stop.go"), k.Title, btnPrimary, t.ControlSM, t.SurfaceSunken) {
							a.send(protocol.KeepAct{T: "keep_action", ID: k.ID, Action: "stop"})
							ks.stop = false
						}
						if a.buttonFor(c, a.L.T("keep.stop.keep"), k.Title, btnSecondary, t.ControlSM, t.SurfaceSunken) {
							ks.stop = false
						}
					})
				})
			}
		})
	})
}
