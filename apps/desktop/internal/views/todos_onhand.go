package views

import (
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D357: 你的待办 / Your to-dos on On hand (design/on-hand.md, task-sources.md
// §6). The person's to-dos in their own apps, in the board's own language:
// a group after 今天做完, only while a source is on, named by its one source
// (GitHub 上标给你的 / Assigned to you on GitHub) or 你的待办 when there are
// several. At most three stand as cards, chosen by the home to save
// attention (a PR waiting for review, an assigned one that mentions the
// person, a line due soon, the newest); the rest fold under 还有 n 件 / n
// more, which opens in place: Find, chips on a sunk track, low cards, a
// page at a time. 交给{name} / Hand to {name} opens a task bound to it the
// way New task's pick does; the card then moves into the board with its chip.

// todoFold is the fold's state on this Mac: open or not, what narrows it,
// the pages read so far.
type todoFold struct {
	open         bool
	q, sentQ     string
	source       string
	where        string
	whereSet     bool
	tag          string
	review       bool
	page         int
	items        []protocol.SourceItem
	more         bool
	wheres, tags []string
	loading      bool
	limited      bool
	failed       bool
	cid          string
	scroll       bool
	typedAt      time.Time
	askedOn      *store.Store
	handing      map[string]string // ref → clientId
	handFailed   map[string]string // ref → why
}

// askFold asks the home for a page of the fold.
func (a *App) askFold(page int) {
	f := &a.todos.fold
	a.nextClient++
	f.cid = fmt.Sprintf("fold%d-%d", page, a.nextClient)
	f.loading = true
	f.sentQ = f.q
	if page == 1 {
		f.items = nil
	}
	req := protocol.SourceItemsReq{T: "source_items", Page: page, ClientID: f.cid, Query: strings.TrimSpace(f.q), ID: f.source, Tag: f.tag, Review: f.review}
	if f.whereSet {
		w := f.where
		req.Where = &w
	}
	a.send(req)
}

// takeFold reads the home's answer to the fold's latest ask (an older one
// never lands), and the answers to hand-overs.
func (a *App) takeFold() {
	f := &a.todos.fold
	if r := a.S.SourceItems[f.cid]; r != nil && f.loading {
		page := max(r.Page, 1)
		if page == 1 {
			f.items = nil
		}
		seen := map[string]bool{}
		for _, x := range f.items {
			seen[x.Ref] = true
		}
		for _, x := range r.Items {
			if !seen[x.Ref] {
				f.items = append(f.items, x)
			}
		}
		f.page, f.more, f.loading, f.limited = page, r.More, false, r.Limited
		f.failed = len(r.Errors) > 0 && len(r.Items) == 0
		if page == 1 {
			f.wheres, f.tags = r.Wheres, r.Tags
		}
		delete(a.S.SourceItems, f.cid)
	}
	if len(f.handing) == 0 {
		return
	}
	keep := a.S.NewTaskResults[:0:0]
	for _, r := range a.S.NewTaskResults {
		ref := ""
		if r.T == "task_new_result" {
			for k, v := range f.handing {
				if v == r.ClientID {
					ref = k
				}
			}
		}
		if ref == "" {
			keep = append(keep, r)
			continue
		}
		delete(f.handing, ref)
		if !r.OK {
			why := a.L.T("newtask.err.failed")
			switch r.Reason {
			case "no_agent", "offline", "not_repo", "ducter_data":
				why = a.L.T("newtask.err." + r.Reason)
			default:
				if r.Message != "" {
					why = r.Message
				}
			}
			f.handFailed[ref] = why
		}
	}
	a.S.NewTaskResults = keep
}

// handOver is 交给{name} / Hand to {name}: New task's path with the to-do
// and no place (the home finds the repository's folder); one with a live
// task opens that task.
func (a *App) handOver(it protocol.SourceItem) {
	if it.TaskID != "" {
		a.OpenTask(it.TaskID)
		return
	}
	f := &a.todos.fold
	if f.handing == nil {
		f.handing = map[string]string{}
	}
	if f.handFailed == nil {
		f.handFailed = map[string]string{}
	}
	a.nextClient++
	cid := fmt.Sprintf("hand-%d", a.nextClient)
	f.handing[it.Ref] = cid
	delete(f.handFailed, it.Ref)
	ref := it.SourceItemRef
	ref.URL = it.URL
	a.send(protocol.TaskNew{T: "task_new", Words: it.Title, Item: &ref, Handed: true, ClientID: cid})
}

// SeeTodos opens On hand at the to-dos (Settings' counts): the fold open,
// the review list when that was tapped.
func (a *App) SeeTodos(source string, review bool) {
	f := &a.todos.fold
	f.open, f.q, f.where, f.whereSet, f.tag, f.review, f.scroll = true, "", "", false, "", review, true
	f.source = ""
	if v := a.S.Sources; v != nil && len(v.Sources) > 1 {
		f.source = source
	}
	a.askFold(1)
	a.Route = RouteOnHand
}

// todoGroupName is the group's name: its one source's, else 你的待办.
func (a *App) todoGroupName(sources []protocol.SourceView) string {
	if len(sources) != 1 {
		return a.L.T("onhand.todos.all")
	}
	if s := sources[0]; s.Kind == "obsidian" {
		return a.L.T("onhand.todos.vault", s.Name)
	}
	return a.L.T("onhand.todos.github")
}

// todoCounts is what the group counts: the open ones in every source that
// read (none before a look), the PRs waiting for review, and how many fold.
func todoCounts(sources []protocol.SourceView, glance []protocol.SourceGlance) (open int, atLeast bool, review, rest int) {
	for _, s := range sources {
		if s.State != "ok" || s.CheckedAt == "" {
			continue
		}
		open += s.Open
		review += s.Review
		atLeast = atLeast || s.AtLeast
	}
	shown := 0
	for _, g := range glance {
		if !g.Review {
			shown++
		}
	}
	return open, atLeast, review, max(0, open-shown)
}

// askTodos asks the home for the to-do sources once per state.
func (a *App) askTodos() {
	f := &a.todos.fold
	if f.askedOn != a.S && a.S.Welcomed {
		f.askedOn = a.S
		a.send(protocol.SourcesReq{T: "sources"})
	}
}

// todosToShow is whether the to-dos have anything for the board: then On
// hand is never 手头没事 (the Mac walk of 0.0.98: no task running and 571
// to-dos sorted, the partner said they were all on hand, and the board said
// nothing was, since it asked for the to-dos only once it had tasks).
func (a *App) todosToShow() bool {
	v := a.S.Sources
	if v == nil || len(v.Sources) == 0 {
		return false
	}
	_, _, review, rest := todoCounts(v.Sources, v.Glance)
	return len(v.Glance) > 0 || rest > 0 || review > 0 || (v.Pile != nil && (v.Pile.Open > 0 || v.Pile.ClearedToday > 0))
}

// todoGroup is the group on the board, under all or its source's lens.
func (a *App) todoGroup(c *ui.Context, lens string) {
	t := a.T
	f := &a.todos.fold
	a.askTodos()
	a.takeFold()
	v := a.S.Sources
	if v == nil || len(v.Sources) == 0 {
		return
	}
	if lens != "" && !isSourceLens(lens) {
		return
	}
	var sources []protocol.SourceView
	for _, s := range v.Sources {
		if lens == "" || srcLensPrefix+s.ID == lens {
			sources = append(sources, s)
		}
	}
	if len(sources) == 0 {
		return
	}
	var glance []protocol.SourceGlance
	for _, g := range v.Glance {
		if slices.ContainsFunc(sources, func(s protocol.SourceView) bool { return s.ID == g.Source }) {
			glance = append(glance, g)
		}
	}
	open, atLeast, review, rest := todoCounts(sources, glance)
	// D359: the pile at the group's head (every source's: under all, or a lone source's lens).
	var pile *protocol.PileView
	if v.Pile != nil && (lens == "" || len(v.Sources) == 1) {
		pile = v.Pile
	}
	// Silence: nothing open, nothing to review, nothing to show (a cleared day still shows its line).
	if len(glance) == 0 && rest == 0 && review == 0 && !f.open && (pile == nil || (pile.Open == 0 && pile.ClearedToday == 0)) {
		return
	}
	name := a.todoGroupName(sources)
	n := ""
	if open > 0 && pile == nil {
		n = fmt.Sprint(open)
		if atLeast {
			n += "+"
		}
	}
	sec := ui.Column(c.Key("sec:todos")).Gap(t.S1).Role(ui.RoleGroup).Label(name)
	if f.scroll {
		f.scroll = false
		sec.ScrollIntoView()
	}
	sec.Children(func() {
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).MinHeight(28).Padding(0, t.S3+2).Children(func() {
			// Several sources: their marks before the name (one names itself).
			if len(sources) > 1 {
				kinds := []string{}
				for _, s := range sources {
					if !slices.Contains(kinds, s.Kind) {
						kinds = append(kinds, s.Kind)
					}
				}
				for _, k := range kinds {
					if src := theme.Brand(k); src != nil {
						ui.Image(c, src).Size(18, 18).Shrink(0).AccessHidden(true)
					}
				}
			}
			ui.Text(c, name).Font(t.Display).FontSize(t.LG).FontWeight(700).TextColor(t.Ink)
			if n != "" {
				ui.Text(c, n).Font(t.Display).FontSize(t.LG).FontWeight(600).TextColor(t.InkMuted).FontFeatures("tnum")
			}
		})
		if pile != nil {
			a.pileBlock(c, pile)
		}
		if len(glance) > 0 {
			w := a.oh.listW
			if w <= 0 {
				w = onHandMeasure
			}
			cw := w
			if w >= 2*cardMin+cardGap {
				cw = (w - cardGap) / 2
			}
			ui.Row(c.Key("todo-cards")).Wrap().Gap(cardGap).AlignItems(ui.Stretch).Padding(2, 0, 6, 0).Children(func() {
				for i := range glance {
					a.todoCard(c.Key("g:"+glance[i].Ref), glance[i], cw)
				}
			})
		}
		if rest > 0 || review > 0 || f.open {
			if a.foldLine(c, "todos", a.L.T("onhand.todos.more", rest), f.open) {
				f.open = !f.open
				if f.open && len(f.items) == 0 {
					a.askFold(1)
				}
			}
		}
		if f.open {
			shown := make([]string, 0, len(glance))
			for _, g := range glance {
				shown = append(shown, g.Ref)
			}
			a.todoFoldBody(c, sources, shown)
		}
	})
}

// todoWhy is why a to-do stands here: waiting for review, mentions you, due.
func (a *App) todoWhy(it protocol.SourceItem, why string) (string, ui.Color) {
	t := a.T
	switch {
	case it.Review || why == "review":
		return a.L.T("onhand.todos.why.review"), t.NeedsYou.Ink
	case why == "mentioned":
		return a.L.T("onhand.todos.why.mentioned"), t.Working.Ink
	case it.Due != "":
		return a.L.T("todos.pick.due", it.Due), t.Waiting.Ink
	}
	return "", t.InkSoft
}

// todoFacts is a to-do's second line, each its own element (D291): why it
// stands here, its chip, who asked (a review), two labels.
func (a *App) todoFacts(c *ui.Context, key string, it protocol.SourceItem, why string) {
	t := a.T
	if w, ink := a.todoWhy(it, why); w != "" {
		ui.Text(c.Key("why"), w).FontSize(t.SM).FontWeight(600).TextColor(ink).SingleLine().Shrink(0)
	}
	a.todoChip(c, key, it.SourceItemRef)
	if it.Review && it.Author != "" {
		ui.Text(c.Key("by"), a.L.T("onhand.todos.by", it.Author)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(1).MinWidth(0)
	}
	for i, l := range it.Labels {
		if i == 2 {
			break
		}
		ui.Row(c.Key("label:"+l)).Height(20).Padding(0, t.S2).Radius(10).AlignItems(ui.Center).Background(t.SurfaceSunken).Shrink(1).MinWidth(0).Children(func() {
			ui.Text(c, l).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
		})
	}
}

// todoAct is the to-do's one action: 交给{name}, its task when one is on
// it, or (a review request) open it in its app. 44 tall.
func (a *App) todoAct(c *ui.Context, it protocol.SourceItem, kind btnKind) {
	t := a.T
	app := protocol.SourceKindName(it.Kind)
	f := &a.todos.fold
	switch {
	case it.Review:
		if a.buttonFor(c, a.L.T("todos.chip.open", app), it.Title, btnSecondary, t.ControlMD, t.Surface) && it.URL != "" {
			c.OpenURL(it.URL)
		}
	case it.TaskID != "":
		if a.buttonFor(c, a.L.T("onhand.todos.doing"), it.Title, btnText, t.ControlMD, t.Surface) {
			a.OpenTask(it.TaskID)
		}
	case f.handing[it.Ref] != "":
		ui.Text(c.Key("handing"), a.L.T("onhand.todos.handing", a.personaName())).FontSize(t.SM).FontWeight(600).TextColor(t.InkMuted).SingleLine().Shrink(0)
	default:
		if a.buttonFor(c, a.L.T("onhand.todos.hand", a.personaName()), it.Title, kind, t.ControlMD, t.Surface) {
			a.handOver(it)
		}
	}
}

// todoCard is one of the few as a card of the board: the app's mark where a
// task has its agent's coin, the title in up to two lines, why, the chip,
// and at the foot when it changed and its action. The card opens it in its app.
func (a *App) todoCard(c *ui.Context, g protocol.SourceGlance, w float32) {
	t := a.T
	it := g.SourceItem
	app := protocol.SourceKindName(it.Kind)
	card := ui.Column(c).Width(w).Gap(t.S2).Padding(14, 16, 10, 16).Radius(20).Background(t.Surface).Role(ui.RoleGroup).Label(it.Title)
	hover := card.Hovered()
	still := c.Preferences().ReduceMotion
	lift := card.AnimateTo("lift", map[bool]float32{true: 1, false: 0}[hover], ui.Animation{Duration: 120 * time.Millisecond, NonMotion: still})
	card.Shadow(0, 2+2*lift, 0, 0, t.Line).Shadow(0, 8+6*lift, 18+8*lift, -12, t.Ink.Alpha(0.22+0.08*lift))
	if !still && lift > 0 {
		card.Translate(0, -2*lift)
	}
	card.Children(func() {
		top := ui.Column(c.Key("open")).Gap(t.S2).Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(spoken(a.L, it.Title, a.L.T("todos.chip.open", app))).Focusable().Tooltip(it.Title)
		top.Children(func() {
			ui.Row(c.Key("c1")).Gap(10).AlignItems(ui.Center).Children(func() {
				a.todoMark(c, it.Kind, 28)
				ui.Text(c, keepWords(autospace(it.Title))).FontSize(t.MD).FontWeight(600).LineHeight(1.35).TextColor(t.Ink).MaxLines(2).Grow(1).Shrink(1).MinWidth(0)
			})
			ui.Row(c.Key("c2")).Wrap().Gap(t.S2 + 2).AlignItems(ui.Center).Children(func() { a.todoFacts(c, "glance:"+it.Ref, it, g.Why) })
		})
		if top.Clicked() && it.URL != "" {
			c.OpenURL(it.URL)
		}
		a.pileReadLine(c, g) // D359: 我看过了
		ui.Box(c.Key("room")).Grow(1)
		ui.Row(c.Key("c3")).Gap(10).AlignItems(ui.Center).MinHeight(t.ControlMD).Children(func() {
			if why := a.todos.fold.handFailed[it.Ref]; why != "" {
				ui.Text(c.Key("failed"), why).FontSize(t.XS).TextColor(t.Failed.Ink).Grow(1).Shrink(1).MinWidth(0).Role(ui.RoleStatus)
			} else if it.UpdatedAt != "" {
				ui.Text(c.Key("updated"), a.L.T("onhand.todos.updated", a.agoLong(it.UpdatedAt))).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
			}
			ui.Spacer(c)
			a.todoAct(c, it, btnSecondary)
		})
	})
}

// todoMark is the app's own mark on a sunk round, where a task has its coin.
func (a *App) todoMark(c *ui.Context, kind string, size float32) {
	t := a.T
	ui.Box(c.Key("mark")).Size(size, size).Radius(size / 2).Background(t.SurfaceSunken).AlignItems(ui.Center).Justify(ui.Center).Shrink(0).AccessHidden(true).Children(func() {
		if src := theme.Brand(kind); src != nil {
			s := size * 0.68
			ui.Image(c, src).Size(s, s)
		}
	})
}

// todoFoldBody is the fold opened in place: Find, the chips, the low cards,
// and 再看 n 件.
func (a *App) todoFoldBody(c *ui.Context, sources []protocol.SourceView, shown []string) {
	t := a.T
	f := &a.todos.fold
	ui.Column(c.Key("todo-fold")).Gap(t.S3).Padding(t.S1, 0, t.S2, 0).Children(func() {
		ui.Row(c.Key("todo-find")).Height(t.ControlMD).Gap(t.S2).Padding(0, t.S3+2).AlignItems(ui.Center).Radius(t.RadiusSM).Background(t.Sunken).Children(func() {
			a.glyph(c, 16, drawLens(t.InkMuted))
			in := ui.TextInput(c.Key("todo-find-in"), &f.q).Placeholder(a.L.T("onhand.todos.find")).Label(a.L.T("onhand.todos.find")).
				FontSize(t.MD).Grow(1).Background(ui.Color{}).Border(0, ui.Color{})
			if in.Changed() {
				f.typedAt = time.Now()
				time.AfterFunc(420*time.Millisecond, c.Invalidate)
			}
			if in.Submitted() && f.q != f.sentQ {
				a.askFold(1)
			}
		})
		// Typed and paused: ask (the home's search is kept a while; GitHub's rate limit is spared).
		if f.q != f.sentQ && !f.typedAt.IsZero() && time.Since(f.typedAt) >= 400*time.Millisecond {
			a.askFold(1)
		}
		a.todoChips(c, sources)
		if f.limited {
			ui.Text(c.Key("limited"), a.L.T("onhand.todos.limited")).FontSize(t.SM).TextColor(t.Failed.Ink).Role(ui.RoleStatus)
		} else if f.failed {
			app := "GitHub"
			if len(sources) == 1 {
				app = protocol.SourceKindName(sources[0].Kind)
			}
			ui.Text(c.Key("failed"), a.L.T("todos.read.failed", app)).FontSize(t.SM).TextColor(t.Failed.Ink).Role(ui.RoleStatus)
		}
		plain := !f.whereSet && f.tag == "" && !f.review && strings.TrimSpace(f.q) == ""
		rows := f.items
		if plain {
			rows = nil
			for _, x := range f.items {
				if !slices.Contains(shown, x.Ref) {
					rows = append(rows, x)
				}
			}
		}
		if len(rows) > 0 {
			ui.Column(c.Key("todo-rows")).Gap(8).Padding(2, 0, 6, 0).Role(ui.RoleList).Children(func() {
				for i := range rows {
					a.todoRow(c.Key("r:"+rows[i].Ref), rows[i])
				}
			})
		}
		switch {
		case f.loading:
			ui.Text(c.Key("loading"), a.L.T("todos.looking")).FontSize(t.SM).TextColor(t.InkMuted)
		case len(rows) == 0 && !f.limited && !f.failed:
			ui.Text(c.Key("none"), a.L.T("onhand.todos.none")).FontSize(t.SM).TextColor(t.InkMuted)
		case f.more:
			ui.Row(c.Key("page")).Justify(ui.Center).Children(func() {
				if a.button(c, a.L.T("onhand.todos.page", protocol.BrowsePage), btnText, t.ControlMD, t.Bg) {
					a.askFold(f.page + 1)
				}
			})
		}
	})
}

// todoChips are the fold's choices on a sunk track (past's chips): all,
// each source when there are several, the review list, the repositories or
// folders, a vault's tags.
func (a *App) todoChips(c *ui.Context, sources []protocol.SourceView) {
	t := a.T
	f := &a.todos.fold
	type chip struct {
		key, label, mark string
		on               bool
		pick             func()
	}
	reset := func() { f.where, f.whereSet, f.tag, f.review = "", false, "", false }
	plain := !f.whereSet && f.tag == "" && !f.review
	chips := []chip{{"all", a.L.T("onhand.todos.chip.all"), "", plain && f.source == "", func() { reset(); f.source = "" }}}
	if len(sources) > 1 {
		for _, s := range sources {
			chips = append(chips, chip{"src:" + s.ID, sourceName(s), s.Kind, plain && f.source == s.ID, func() { reset(); f.source = s.ID }})
		}
	}
	gh, vault, review := false, false, 0
	for _, s := range sources {
		if f.source != "" && s.ID != f.source {
			continue
		}
		gh = gh || s.Kind == "github"
		vault = vault || s.Kind == "obsidian"
		review += s.Review
	}
	if gh && review > 0 {
		chips = append(chips, chip{"review", a.L.T("onhand.todos.chip.review", review), "", f.review, func() { on := !f.review; reset(); f.review = on }})
	}
	for _, w := range f.wheres {
		label := w
		switch {
		case w == "":
			label = a.L.T("onhand.todos.chip.top")
		case gh && !vault:
			if i := strings.Index(w, "/"); i >= 0 {
				label = w[i+1:]
			}
		}
		chips = append(chips, chip{"w:" + w, label, "", f.whereSet && f.where == w, func() {
			on := !(f.whereSet && f.where == w)
			reset()
			f.where, f.whereSet = w, on
		}})
	}
	if vault {
		for _, g := range f.tags {
			chips = append(chips, chip{"t:" + g, "#" + g, "", f.tag == g, func() {
				on := f.tag != g
				reset()
				if on {
					f.tag = g
				}
			}})
		}
	}
	const pad = float32(4)
	ui.Row(c.Key("todo-chips-row")).Children(func() {
		ui.ScrollHorizontal(c.Key("todo-chips-scroll")).Shrink(1).MinWidth(0).Children(func() {
			ui.Row(c.Key("todo-chips")).Padding(pad).Gap(2).Radius(t.RadiusSM).AlignItems(ui.Center).Background(t.SurfaceSunken).
				InsetShadow(0, 1.5, 2, 0, t.Line).Role(ui.RoleTabList).Label(a.L.T("onhand.todos.filters")).Children(func() {
				for _, ch := range chips {
					b := ui.Row(c.Key("chip:"+ch.key)).Height(36).Padding(0, t.S3).Gap(t.S1 + 1).Radius(t.RadiusSM - pad).AlignItems(ui.Center).
						Cursor(ui.CursorPointer).Role(ui.RoleTab).Label(ch.label).AccessSelected(ch.on).Focusable().Shrink(0)
					fg := t.InkSoft
					switch {
					case ch.on:
						a.knob(b)
						fg = t.Ink
					case b.Hovered():
						b.Background(t.SurfaceSunken.Mix(t.Surface, 0.5))
						fg = t.Ink
					}
					b.Children(func() {
						if src := theme.Brand(ch.mark); ch.mark != "" && src != nil {
							ui.Image(c, src).Size(14, 14).Shrink(0).AccessHidden(true)
						}
						wt := 500
						if ch.on {
							wt = 700
						}
						ui.Text(c, ch.label).FontSize(t.SM).FontWeight(wt).TextColor(fg).SingleLine().AccessHidden(true)
					})
					if b.Clicked() {
						ch.pick()
						a.askFold(1)
					}
				}
			})
		})
	})
}

// todoRow is a to-do in the fold as a low card: the mark, the title on one
// line, why, its chip, when it changed, and its action at once.
func (a *App) todoRow(c *ui.Context, it protocol.SourceItem) {
	t := a.T
	app := protocol.SourceKindName(it.Kind)
	card := ui.Row(c).Gap(12).Padding(8, 12, 8, 14).MinHeight(rowH).Radius(16).AlignItems(ui.Center).Background(t.Surface)
	hover := card.Hovered()
	still := c.Preferences().ReduceMotion
	lift := card.AnimateTo("lift", map[bool]float32{true: 1, false: 0}[hover], ui.Animation{Duration: 120 * time.Millisecond, NonMotion: still})
	card.Shadow(0, 2+lift, 0, 0, t.Line).Shadow(0, 6+4*lift, 14+6*lift, -10, t.Ink.Alpha(0.16+0.06*lift))
	if !still && lift > 0 {
		card.Translate(0, -lift)
	}
	card.Children(func() {
		main := ui.Row(c.Key("open")).Gap(12).Grow(1).Shrink(1).MinWidth(0).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleLink).
			Label(spoken(a.L, it.Title, a.L.T("todos.chip.open", app))).Focusable().Tooltip(it.Title)
		main.Children(func() {
			a.todoMark(c, it.Kind, 22)
			ui.Column(c.Key("tx")).Gap(3).Grow(1).Shrink(1).MinWidth(0).Children(func() {
				ui.Text(c.Key("t"), keepWords(autospace(it.Title))).FontSize(14).FontWeight(600).TextColor(t.Ink).SingleLine().Shrink(1).MinWidth(0)
				ui.Row(c.Key("l2")).Gap(t.S3).AlignItems(ui.Center).Children(func() {
					a.todoFacts(c, "row:"+it.Ref, it, "")
					if why := a.todos.fold.handFailed[it.Ref]; why != "" {
						ui.Text(c.Key("failed"), why).FontSize(t.XS).TextColor(t.Failed.Ink).SingleLine().Shrink(1).MinWidth(0)
					} else if it.UpdatedAt != "" {
						ui.Text(c.Key("since"), a.L.T("onhand.todos.updated", a.agoLong(it.UpdatedAt))).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(0)
					}
				})
			})
		})
		if main.Clicked() && it.URL != "" {
			c.OpenURL(it.URL)
		}
		ui.Row(c.Key("acts")).Shrink(0).Children(func() { a.todoAct(c, it, btnText) })
	})
}
