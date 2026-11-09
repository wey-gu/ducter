package views

import (
	"fmt"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// 开一件事 / New task (D128, design/new-task.md): the user opens a task with
// their own words. A card over the page with three rows: 在哪儿做 / Where
// (place chips, recent first; the chosen repo's chip names its base branch,
// pickable), 谁来做 / Who does it (the agents' coins, the best fit chosen
// with its reason), 做什么 / What (their words, given as they are). Start
// sends task_new and opens the new task; Esc there returns to where the
// user was.

// newTaskState is the card's own state.
type newTaskState struct {
	open bool
	// words are what the user typed; kept when the card closes without
	// starting, so a slip of Esc loses nothing.
	words string
	// placeKey is the chosen place ("" = the first offered, noneKey = no
	// particular place); prefill is a place to offer even when the server
	// doesn't list it (a task's own, ⌘N inside it).
	placeKey string
	prefill  *protocol.Place
	// branch is the picked base branch ("" = the repo's default);
	// branchOpen shows the branch list.
	branch     string
	branchOpen bool
	// pick is the agent the user chose (candKey); "" = the top candidate.
	pick string
	// sending is the clientId of the task_new in flight; err the line under
	// Start when it didn't open.
	sending string
	err     string
	// errEmpty: err is the empty-words line (it goes once there are words).
	errEmpty bool
	focus    bool
	seq      int
}

// returnTo is where Esc goes from a task the user just opened (New task,
// or `ducter open`): where they were.
type returnTo struct {
	task  string // the task opened
	route Route
	from  string // the task they were in, if any
}

const noneKey = "none"

func placeKey(p protocol.Place) string {
	if p.Kind != "repo" {
		return noneKey
	}
	d := p.Device
	if d == "" {
		d = "local"
	}
	return d + " " + strings.TrimRight(p.RepoPath, "/")
}

// OpenNewTask opens the New task card; at, when set, is the place it
// starts at (a group's "+", ⌘N inside a task).
func (a *App) OpenNewTask(at *protocol.Place) {
	nt := &a.nt
	if nt.open && at == nil {
		nt.focus = true
		return
	}
	words := nt.words
	*nt = newTaskState{open: true, words: words, focus: true, seq: nt.seq}
	var ask *protocol.Place
	if at != nil && at.Kind == "none" {
		nt.placeKey = noneKey
	}
	if at != nil && at.Kind == "repo" {
		p := protocol.Place{Kind: "repo", Device: at.Device, RepoPath: at.RepoPath}
		nt.prefill, nt.placeKey, ask = &p, placeKey(p), &p
		if at.BaseBranch != "" {
			nt.branch = at.BaseBranch
		}
	}
	a.send(protocol.TaskNewOptions{T: "task_new_options", Place: ask})
}

// NewTaskShortcut is ⌘N: inside an opened task, the card starts at that
// task's place; anywhere else, at the most recent one.
func (a *App) NewTaskShortcut() {
	if !a.S.Welcomed {
		return
	}
	if a.Route == RouteTask {
		if task := a.S.Task(a.TaskID); task != nil {
			p := task.Place()
			a.OpenNewTask(&p)
			return
		}
	}
	a.OpenNewTask(nil)
}

// newTaskPlaces are the places the card offers: the server's, with a
// prefilled place first when it isn't among them.
func (a *App) newTaskPlaces() []protocol.PlaceChoice {
	nt := &a.nt
	var places []protocol.PlaceChoice
	if o := a.S.NewTaskOptions; o != nil {
		places = o.Places
	}
	if nt.prefill != nil {
		k := placeKey(*nt.prefill)
		found := false
		for _, p := range places {
			if placeKey(p.Place) == k {
				found = true
			}
		}
		if !found {
			places = append([]protocol.PlaceChoice{{Place: *nt.prefill, Name: lastPath(nt.prefill.RepoPath)}}, places...)
		}
	}
	if len(places) == 0 || places[len(places)-1].Place.Kind != "none" {
		places = append(places, protocol.PlaceChoice{Place: protocol.Place{Kind: "none"}})
	}
	return places
}

// chosenPlace is the place the card starts the task at.
func (a *App) chosenPlace(places []protocol.PlaceChoice) protocol.PlaceChoice {
	if a.nt.placeKey != "" {
		for _, p := range places {
			if placeKey(p.Place) == a.nt.placeKey {
				return p
			}
		}
	}
	return places[0]
}

// topCandidate is the best fit that can take it, or nil.
func topCandidate(cands []protocol.Candidate) *protocol.Candidate {
	for i := range cands {
		if cands[i].Blocked == "" {
			return &cands[i]
		}
	}
	return nil
}

// chosenCandidate is who does it: the user's pick, else the top one.
func (a *App) chosenCandidate(cands []protocol.Candidate) (cd *protocol.Candidate, picked bool) {
	top := topCandidate(cands)
	if a.nt.pick != "" {
		for i := range cands {
			if candKey(cands[i]) == a.nt.pick && cands[i].Blocked == "" {
				return &cands[i], top == nil || candKey(*top) != a.nt.pick
			}
		}
	}
	return top, false
}

// StartNewTask sends what the card holds. It reports whether it went.
func (a *App) StartNewTask() bool {
	nt := &a.nt
	if nt.sending != "" {
		return false
	}
	words := strings.TrimSpace(nt.words)
	if words == "" {
		nt.err, nt.errEmpty = a.L.T("newtask.err.empty"), true
		nt.focus = true
		return false
	}
	if !a.S.Welcomed || a.Status != client.Connected {
		nt.err = a.L.T("newtask.err.conn")
		return false
	}
	f := protocol.TaskNew{T: "task_new", Words: words}
	place := a.chosenPlace(a.newTaskPlaces())
	if place.Place.Kind == "repo" {
		p := protocol.Place{Kind: "repo", Device: place.Place.Device, RepoPath: place.Place.RepoPath}
		if nt.branch != "" && nt.branch != place.DefaultBranch {
			p.BaseBranch = nt.branch
		}
		f.Place = &p
	}
	var cands []protocol.Candidate
	if o := a.S.NewTaskOptions; o != nil {
		cands = o.Candidates
	}
	if cd, picked := a.chosenCandidate(cands); cd != nil && picked {
		f.Harness, f.Model = cd.Harness, cd.Model
	}
	a.nextClient++
	nt.sending = fmt.Sprintf("n%d-%d", a.Now().UnixMilli(), a.nextClient)
	f.ClientID = nt.sending
	nt.err, nt.errEmpty = "", false
	a.send(f)
	return true
}

// drainNewTask takes the server's answers: an opened task closes the card
// and shows that task; a refusal stays on the card, in one line.
func (a *App) drainNewTask() {
	nt := &a.nt
	res := a.S.NewTaskResults
	a.S.NewTaskResults = nil
	for _, r := range res {
		if r.ClientID != nt.sending || nt.sending == "" {
			continue
		}
		nt.sending = ""
		if r.OK && r.TaskID != "" {
			nt.open, nt.words, nt.err = false, "", ""
			nt.seq++
			a.openFromElsewhere(r.TaskID)
			continue
		}
		nt.err, nt.errEmpty = a.newTaskError(r.Reason, r.Message), false
	}
	for _, id := range a.S.OpenRequests {
		a.openFromElsewhere(id)
		if a.Desktop != nil {
			a.Desktop.Focus()
		}
	}
	a.S.OpenRequests = nil
}

// openFromElsewhere opens a task the user didn't tap on this screen (the
// one they just started, or `ducter open`), remembering where they were.
func (a *App) openFromElsewhere(id string) {
	back := &returnTo{task: id, route: a.Route}
	if a.Route == RouteTask {
		back.from = a.TaskID
	}
	if a.Route == RouteTask && a.TaskID == id {
		back = a.back
	}
	a.OpenTask(id)
	a.back = back
}

func (a *App) newTaskError(reason, message string) string {
	switch reason {
	case "empty", "no_agent", "not_repo", "offline":
		return a.L.T("newtask.err." + reason)
	}
	if message == "" {
		return a.L.T("newtask.err.unknown")
	}
	return a.L.T("newtask.err.failed", strings.TrimRight(message, ". "))
}

// newTaskCard is the card over the page, while open.
func (a *App) newTaskCard(c *ui.Context) {
	nt := &a.nt
	a.drainNewTask()
	if !nt.open {
		return
	}
	// "Say what it should do first" holds only while there are no words.
	if nt.errEmpty && strings.TrimSpace(nt.words) != "" {
		nt.err, nt.errEmpty = "", false
	}
	t := a.T
	w, h := c.Size()
	if w <= 0 {
		w, h = 1040, 760
	}
	width := min(w-2*t.S6, 660)
	ui.DialogBase(c, &nt.open, func(back, panel ui.Element) {
		back.Background(t.Scrim)
		panel.Width(width).MaxHeight(h-2*t.S6).Padding(t.S5+4, t.S6, t.S5, t.S6).Gap(t.S5).Radius(t.RadiusXL).
			Background(t.Surface).Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Label(a.L.T("newtask.title"))
		a.enter(c, panel)
		a.heading(c, a.L.T("newtask.title"), t.XL)
		places := a.newTaskPlaces()
		place := a.chosenPlace(places)
		a.newTaskRow(c, "where", a.L.T("newtask.where"), func() { a.placeChips(c, places, place) })
		a.newTaskRow(c, "who", a.L.T("newtask.who"), func() { a.whoChips(c) })
		a.newTaskRow(c, "what", a.L.T("newtask.what"), func() { a.wordsField(c) })
		a.newTaskFoot(c)
	})
	if !nt.open {
		nt.branchOpen = false
	}
}

// newTaskRow is one row of the card: its name in a quiet column, then
// what it holds.
func (a *App) newTaskRow(c *ui.Context, key, label string, body func()) {
	t := a.T
	ui.Row(c.Key("nt-row:" + key)).Gap(t.S4).AlignItems(ui.Start).Children(func() {
		ui.Text(c, label).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).Width(88).Shrink(0).Padding(t.S2, 0, 0, 0).SingleLine()
		ui.Column(c).Grow(1).MinWidth(0).Gap(t.S2).Children(body)
	})
}

// chip is one choice of the card: flat, the chosen one white with an ink
// hairline, the rest on the sunken tint.
func (a *App) chip(c *ui.Context, key, label string, on, off bool) ui.Element {
	t := a.T
	e := ui.Row(c.Key(key)).Height(t.ControlSM).Padding(0, t.S3+2).Gap(t.S2).Radius(t.RadiusSM).AlignItems(ui.Center).Shrink(0).
		Role(ui.RoleRadio).Label(label).AccessSelected(on)
	switch {
	case off:
		e.Background(t.SurfaceSunken).Opacity(0.55)
	case on:
		e.Background(t.Surface).InsetShadow(0, 0, 0, 1.5, t.Ink).Cursor(ui.CursorPointer).Focusable()
	case e.Pressed():
		e.Background(t.Line).Cursor(ui.CursorPointer).Focusable()
	case e.Hovered():
		e.Background(t.SurfaceSunken.Mix(t.Line, 0.5)).Cursor(ui.CursorPointer).Focusable()
	default:
		e.Background(t.SurfaceSunken).Cursor(ui.CursorPointer).Focusable()
	}
	return e
}

// placeChips is 在哪儿做 / Where: the repos, most recent first, then No
// particular place; the chosen repo's chip says its base branch, and a
// click on it opens the branches.
func (a *App) placeChips(c *ui.Context, places []protocol.PlaceChoice, chosen protocol.PlaceChoice) {
	t := a.T
	nt := &a.nt
	ck := placeKey(chosen.Place)
	ui.Row(c.Key("nt-places")).Gap(t.S2).Wrap().Role(ui.RoleRadioGroup).Label(a.L.T("newtask.where")).Children(func() {
		for _, p := range places {
			k := placeKey(p.Place)
			on := k == ck
			name := p.Name
			if p.Place.Kind != "repo" {
				name = a.L.T("newtask.nowhere")
			} else if name == "" {
				name = lastPath(p.Place.RepoPath)
			}
			branch := ""
			if on && p.Place.Kind == "repo" {
				branch = firstNonEmpty(nt.branch, p.DefaultBranch)
			}
			label := name
			if branch != "" {
				label += " · " + branch
			}
			e := a.chip(c, "nt-place:"+k, label, on, false)
			if p.Place.Kind == "repo" {
				e.Tooltip(p.Place.RepoPath)
			}
			e.Children(func() {
				ui.Text(c, name).FontSize(t.SM).FontWeight(700).TextColor(map[bool]ui.Color{true: t.Ink, false: t.InkSoft}[on]).SingleLine().AccessHidden(true)
				if branch != "" {
					ui.Text(c, "·").FontSize(t.SM).TextColor(t.Faint).AccessHidden(true)
					ui.Text(c, branch).Font(t.Mono).FontSize(t.XS).TextColor(t.InkSoft).SingleLine().MaxWidth(180).AccessHidden(true)
					if len(p.Branches) > 1 {
						ui.Box(c).Size(10, 10).Shrink(0).Draw(drawCaret(t.InkMuted)).AccessHidden(true)
					}
				}
			})
			if e.Clicked() {
				switch {
				case !on:
					nt.placeKey, nt.branch, nt.branchOpen = k, "", false
					pl := p.Place
					var ask *protocol.Place
					if pl.Kind == "repo" {
						ask = &pl
					}
					a.send(protocol.TaskNewOptions{T: "task_new_options", Place: ask})
				case branch != "" && len(p.Branches) > 1:
					nt.branchOpen = !nt.branchOpen
				}
			}
			if on && branch != "" && len(p.Branches) > 1 {
				a.branchList(c, e, p, branch)
			}
		}
	})
}

// branchList is the chosen repo's branches, most recently committed first,
// its default one marked: what the task starts from.
func (a *App) branchList(c *ui.Context, anchor ui.Element, p protocol.PlaceChoice, current string) {
	t := a.T
	nt := &a.nt
	ui.PopoverBase(c, anchor, &nt.branchOpen, func(panel ui.Element) {
		panel.Margin(t.S2, 0, 0, 0).Width(300).Padding(t.S2).Radius(t.RadiusMD).Background(t.Surface).
			Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Border(1, t.LineSoft).Label(a.L.T("newtask.branch.title"))
		ui.Text(c, a.L.T("newtask.branch.title")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Padding(t.S2, t.S3, t.S1, t.S3)
		ui.Scroll(c.Key("nt-branches")).MaxHeight(300).Children(func() {
			ui.Column(c).Gap(2).Role(ui.RoleRadioGroup).Children(func() {
				for _, b := range p.Branches {
					on := b == current
					row := ui.Row(c.Key("nt-branch:"+b)).Height(t.ControlSM-4).Padding(0, t.S3).Gap(t.S2).Radius(t.RadiusSM).AlignItems(ui.Center).
						Cursor(ui.CursorPointer).Role(ui.RoleRadio).Label(b).AccessSelected(on).Focusable()
					switch {
					case on:
						row.Background(t.SurfaceSunken)
					case row.Hovered():
						row.Background(t.SurfaceSunken.Mix(t.Surface, 0.5))
					}
					row.Children(func() {
						ui.Text(c, b).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.Ink).SingleLine().Grow(1).MinWidth(0).AccessHidden(true)
						if b == p.DefaultBranch {
							ui.Text(c, a.L.T("newtask.branch.default")).FontSize(t.XS).TextColor(t.InkMuted).Shrink(0).AccessHidden(true)
						}
						if on {
							a.glyph(c, 14, drawCheck(t.Ink))
						}
					})
					if row.Clicked() {
						nt.branch, nt.branchOpen = b, false
						if b == p.DefaultBranch {
							nt.branch = ""
						}
					}
				}
			})
		})
	})
}

// whoChips is 谁来做 / Who does it: the agents' coins, best first; the best
// fit is chosen, with its reason under the row; one the user picks says
// so; one that can't take it is greyed with why on hover.
func (a *App) whoChips(c *ui.Context) {
	t := a.T
	nt := &a.nt
	o := a.S.NewTaskOptions
	if o == nil {
		ui.Text(c, a.L.T("newtask.loading")).FontSize(t.SM).TextColor(t.InkMuted).Padding(t.S2, 0, 0, 0)
		return
	}
	cands := o.Candidates
	chosen, picked := a.chosenCandidate(cands)
	if chosen == nil {
		ui.Text(c, a.L.T("newtask.nobody")).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft).Padding(t.S2, 0, 0, 0)
		return
	}
	ui.Row(c.Key("nt-who")).Gap(t.S2).Wrap().Role(ui.RoleRadioGroup).Label(a.L.T("newtask.who")).Children(func() {
		for i := range cands {
			cd := cands[i]
			k := candKey(cd)
			off := cd.Blocked != ""
			on := !off && k == candKey(*chosen)
			name := a.candName(cd)
			e := a.chip(c, "nt-cand:"+k, name, on, off).Padding(0, t.S3+2, 0, t.S1+2)
			if off {
				e.Tooltip(a.candReason(cd))
			}
			e.Children(func() {
				if bmp := theme.Clay(tokenArt(cd.Harness)); bmp != nil {
					img := ui.Image(c, bmp).Size(26, 26).Shrink(0).AccessHidden(true)
					if off {
						img.Grayscale()
					}
				}
				ui.Text(c, name).FontSize(t.SM).FontWeight(700).TextColor(map[bool]ui.Color{true: t.Ink, false: t.InkSoft}[on]).SingleLine().AccessHidden(true)
			})
			if !off && e.Clicked() {
				nt.pick = k
				if top := topCandidate(cands); top != nil && candKey(*top) == k {
					nt.pick = ""
				}
			}
		}
	})
	why := a.candReason(*chosen)
	if picked {
		why = a.L.T("newtask.picked", a.candName(*chosen))
	}
	if why != "" {
		ui.Text(c.Key("nt-why"), why).FontSize(t.SM).TextColor(t.InkMuted).SingleLine().Tooltip(why)
	}
}

// wordsField is 做什么 / What: the user's words, given to the task as
// they are. Return breaks the line; ⌘Return starts.
func (a *App) wordsField(c *ui.Context) {
	t := a.T
	nt := &a.nt
	ta := ui.TextArea(c.Key(fmt.Sprintf("nt-words:%d", nt.seq)), &nt.words).Lines(4, 10).MinHeight(0).
		Placeholder(a.L.T("newtask.placeholder")).Label(a.L.T("newtask.what")).
		Background(t.Bg).Border(1, t.LineSoft).Radius(t.RadiusMD).Padding(t.S3, t.S4).FontSize(t.Bubble).LineHeight(a.leading(1.5)).
		OnTextKey(func(k ui.TextKey) bool {
			if k.Key == ui.KeyEnter && k.Mods&ui.Cmd != 0 {
				nt.words = k.Text()
				a.StartNewTask()
				return true
			}
			return false
		})
	if ta.Changed() {
		nt.err, nt.errEmpty = "", false
	}
	if nt.focus {
		ta.Focus()
		nt.focus = false
	}
	ui.Text(c, a.L.T("newtask.verbatim")).FontSize(t.XS).TextColor(t.InkMuted)
}

// newTaskFoot is what didn't work, in one line, then Cancel and Start.
func (a *App) newTaskFoot(c *ui.Context) {
	t := a.T
	nt := &a.nt
	ui.Row(c.Key("nt-foot")).Gap(t.S3).AlignItems(ui.Center).Padding(t.S1, 0, 0, 0).Children(func() {
		if nt.err != "" {
			ui.Text(c.Key("nt-err"), nt.err).FontSize(t.SM).LineHeight(1.45).TextColor(t.Failed.Ink).Grow(1).MinWidth(0).MaxLines(2).Role(ui.RoleStatus)
		} else {
			ui.Spacer(c)
		}
		if nt.sending != "" {
			ui.Spinner(c).Size(16, 16)
			ui.Text(c, a.L.T("newtask.starting")).FontSize(t.MD).FontWeight(700).TextColor(t.InkMuted).Shrink(0)
			return
		}
		if a.button(c, a.L.T("newtask.cancel"), btnText, t.ControlMD, t.Surface) {
			nt.open, nt.err, nt.errEmpty = false, "", false
		}
		ui.Text(c, "⌘↩").FontSize(t.XS).TextColor(t.Faint).Shrink(0).AccessHidden(true)
		if a.buttonFor(c, a.L.T("newtask.start"), a.L.T("newtask.title"), btnPrimary, t.ControlMD, t.Surface) {
			a.StartNewTask()
		}
	})
}

// drawCaret is a small down caret: the chip opens a list.
func drawCaret(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		w := r.W
		cx, cy := r.X+w/2, r.Y+r.H/2
		var m ui.Path
		m.MoveTo(cx-w*0.38, cy-w*0.16)
		m.LineTo(cx, cy+w*0.22)
		m.LineTo(cx+w*0.38, cy-w*0.16)
		p.StrokePath(&m, 1.6, col)
	}
}
