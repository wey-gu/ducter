package views

import (
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D295: Settings › 记忆 / Memory on the settings grid (D289). It shows the
// value first: the partner remembers you (how much is new this week, the
// switch, the week's check one tap away). D321: then what it knows about
// you, by Mem's own kinds (how you like things, what you decided, what it
// knows), each row fixable or forgettable in place, its source as a quiet
// line, a search above; the other AI tools on the same Mem as counts, never
// their working notes; then Nowledge Mem itself in human words (where it's
// kept, its name there, how much it holds; raw ids behind 详情).
// Before Mem is there: a small empty state and the setup as steps. The
// web's is apps/web/src/memory.tsx; the rules are mem-view.ts / memory.go.

func (a *App) memoryPanel(c *ui.Context) {
	a.panelHead(c, TabMemory, a.L.T("settings.lede.memory", a.personaName()))
	if a.loadingLine(c) {
		return
	}
	st := a.S.Settings
	b := a.S.Bridge
	phase := memPhase(st.Memory, a.S.Mem, b)
	a.partnerToast(c)
	switch phase {
	case "on":
		a.memHead(c, st)
		a.memAbout(c)
		a.memTools(c)
		a.memLink(c, b)
	case "off":
		a.memHead(c, st)
	case "closed":
		a.memHead(c, st)
		a.memClosed(c, b)
	default:
		a.memFirst(c, phase, b)
	}
}

// memWeek counts what it noted in the last 7 days.
func memWeek(noted []protocol.Noted, now time.Time) int {
	n := 0
	for _, g := range groupNoted(noted, now) {
		if g.When != "earlier" {
			n += len(g.Items)
		}
	}
	return n
}

// notebookTile is Memory's mark in the tile column.
func (a *App) notebookTile(c *ui.Context) func() {
	return func() { a.glyph(c, 40, a.drawNotebook()) }
}

// memHead is the first group: the partner remembers you, what's new this
// week, the switch; its note says what the switch does.
func (a *App) memHead(c *ui.Context, st *protocol.Settings) {
	name := a.personaName()
	a.group(c, "mem-head", "", "", func() {
		title, line, tone := a.L.T("mem.hero.on", name), a.L.T("mem.week.none"), sideMuted
		if !st.Memory {
			title, line = a.L.T("mem.hero.off", name), a.L.T("mem.off.line")
		} else if m := a.S.Mem; m != nil {
			if n := memWeek(m.Noted, a.Now()); n > 0 {
				line, tone = a.L.T("mem.week.count", strconv.Itoa(n)), sideDone
			}
		}
		a.headRow(c, "mem", a.notebookTile(c), title, line, tone, func() {
			v := st.Memory
			// D348: held off by how the home was started: shown, still, and the note says why.
			if st.MemoryPinned && !st.Memory {
				ui.Switch(c.Key("sw:memory"), &v).Label(a.L.T("partner.memory.switch")).Disabled(true)
			} else if a.switchControl(c, "memory", a.L.T("partner.memory.switch"), &v) {
				st.Memory = v
				a.SetSettings(protocol.SettingsPatch{Memory: &v})
			}
		})
		note := a.L.T("mem.switch.note")
		if st.MemoryPinned && !st.Memory {
			note = a.L.T("mem.pinned")
		} else if !st.Memory {
			note = a.L.T("partner.memory.off")
		}
		// D321: the week's check (D304) one tap away, opening under the group.
		var check func()
		if st.Memory && a.S.Mem != nil && memWeek(a.S.Mem.Noted, a.Now()) > 0 {
			check = func() {
				if a.quietButton(c, "mem-check", a.L.T("mem.head.check"), "", false, 1) {
					if a.recall.learned == memLearnedKey {
						a.recall.learned = ""
					} else {
						a.openLearned(memLearnedKey)
					}
				}
			}
		}
		a.footRow(c, "mem-head", note, check)
	})
	if a.recall.learned == memLearnedKey {
		a.learnedCard(c, memLearnedKey)
	}
}

// memLearnedKey is where 这周记下的 opens when asked from Settings › 记忆.
const memLearnedKey = "settings-memory"

// memPageState is Settings › 记忆's own state (D321): the row opened in
// place and how (fix, ask), the words being fixed, the search, the copied slab.
type memPageState struct {
	open, mode, fixText string
	query, last, sent   string
	typedAt             time.Time
	copied              string
	copiedAt            time.Time
}

// memFind sends the search's words to Mem now ("" clears it).
func (a *App) memFind(q string) {
	q = strings.Join(strings.Fields(q), " ")
	ps := &a.memPage
	ps.sent = q
	a.S.MemQuery = q
	if q == "" {
		a.S.MemFound = nil
		return
	}
	a.send(protocol.MemFind{T: "mem_find", Q: q})
}

// memForget forgets one memory by Mem's id: it leaves the page at once.
func (a *App) memForget(id string) {
	drop := func(xs []protocol.MemItem) []protocol.MemItem {
		var out []protocol.MemItem
		for _, x := range xs {
			if x.ID != id {
				out = append(out, x)
			}
		}
		return out
	}
	if m := a.S.Mem; m != nil && m.Glance != nil {
		m.Glance.About = drop(m.Glance.About)
	}
	if f := a.S.MemFound; f != nil {
		f.Items = drop(f.Items)
	}
	a.send(protocol.MemForget{T: "mem_forget", ID: id})
}

// memFix fixes one memory's words by Mem's id: the page shows them at once.
func (a *App) memFix(id, title string) {
	words := strings.Join(strings.Fields(title), " ")
	if words == "" {
		return
	}
	fix := func(xs []protocol.MemItem) {
		for i := range xs {
			if xs[i].ID == id {
				xs[i].Title = words
			}
		}
	}
	if m := a.S.Mem; m != nil && m.Glance != nil {
		fix(m.Glance.About)
	}
	if f := a.S.MemFound; f != nil {
		fix(f.Items)
	}
	a.send(protocol.MemFix{T: "mem_fix", ID: id, Title: words})
}

// memRow is one memory, tapped open in place: where it came from as its
// line, the age at the right; open, 改 (its words, written to Mem) and 忘掉
// (asks first).
func (a *App) memRow(c *ui.Context, m protocol.MemItem) {
	t := a.T
	ps := &a.memPage
	open := ps.open == m.ID
	if open && ps.mode == "ask" {
		keep, goOn := a.confirmRow(c, "memi:"+m.ID, a.L.T("mem.item.forget.ask", m.Title), a.L.T("mem.forget.keep"), a.L.T("partner.memory.forget"), m.Title)
		if keep {
			ps.mode = ""
		}
		if goOn {
			ps.open, ps.mode = "", ""
			a.memForget(m.ID)
		}
		return
	}
	if open && ps.mode == "fix" {
		save := func() {
			ps.open, ps.mode = "", ""
			a.memFix(m.ID, ps.fixText)
		}
		a.textBlock(c, "memfix:"+m.ID, func() {
			ui.TextInput(c.Key("memfix-in:"+m.ID), &ps.fixText).Label(a.L.T("learned.fix")).
				FontSize(t.MD).Padding(t.S2, t.S3).Radius(t.RadiusSM).
				Background(t.Bg).Border(1, t.LineSoft).OnSubmit(save)
			ui.Row(c).Gap(t.S2).Justify(ui.End).AlignItems(ui.Center).Children(func() {
				if a.quietButton(c, "memfix-cancel:"+m.ID, a.L.T("learned.cancel"), m.Title, false, 0) {
					ps.mode = ""
				}
				if a.buttonFor(c, a.L.T("learned.save"), m.Title, btnSecondary, t.ControlSM, t.Surface) && strings.TrimSpace(ps.fixText) != "" {
					save()
				}
			})
		})
		return
	}
	tile := a.pebbleTile(c)
	if m.By == "tool" && m.From != "" {
		tile = a.toolTile(c, m.From)
	}
	key, args := bySource(m)
	var age func()
	if s := a.agoLong(m.At); s != "" {
		age = func() { ui.Text(c, s).FontSize(t.SM).FontWeight(600).TextColor(t.InkMuted).SingleLine() }
	}
	if a.openRow(c, "memi:"+m.ID, tile, autospace(m.Title), a.L.T(key, args...), t.InkMuted, open, age) {
		if open {
			ps.open = ""
		} else {
			ps.open, ps.mode = m.ID, ""
		}
	}
	if open {
		a.footRow(c, "memi-acts:"+m.ID, a.L.T("mem.item.wrong"), func() {
			if a.quietButton(c, "memi-fix:"+m.ID, a.L.T("learned.fix"), m.Title, false, 0) {
				ps.mode, ps.fixText = "fix", m.Title
			}
			if a.quietDanger(c, "memi-forget:"+m.ID, a.L.T("partner.memory.forget"), m.Title) {
				ps.mode = "ask"
			}
		})
	}
}

// memSearch is the search on the paper above the groups: the words go to
// Mem a moment after the last key, or at once on Return.
func (a *App) memSearch(c *ui.Context) {
	t := a.T
	ps := &a.memPage
	now := a.Now()
	if ps.query != ps.last {
		ps.last, ps.typedAt = ps.query, now
	}
	if q := strings.Join(strings.Fields(ps.query), " "); q != ps.sent {
		if left := 350*time.Millisecond - now.Sub(ps.typedAt); left > 0 {
			c.After(left)
		} else {
			a.memFind(q)
		}
	}
	ui.Row(c.Key("mem-find")).Gap(t.S2).Padding(0, t.S2, 0, t.S3).MinHeight(44).AlignItems(ui.Center).
		Radius(t.RadiusMD).Background(t.Surface).Border(1, t.LineSoft).Shadow(0, 2, 0, 0, t.Line).Children(func() {
		a.glyph(c, 16, drawMagnifier(t.InkMuted))
		ui.TextInput(c.Key("mem-find-in"), &ps.query).Placeholder(a.L.T("mem.find.placeholder")).Label(a.L.T("mem.find.label")).
			Background(ui.Transparent).Border(0, ui.Transparent).Padding(t.S2, 0).FontSize(t.MD).Grow(1).MinWidth(0).OnSubmit(func() { a.memFind(ps.query) })
		if ps.query != "" && a.quietButton(c, "mem-find-clear", a.L.T("mem.find.clear"), "", false, 0) {
			ps.query, ps.last = "", ""
			a.memFind("")
		}
	})
}

// drawMagnifier is a drawn magnifier (never a font's glyph).
func drawMagnifier(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 16
		cx, cy := r.X+7*s, r.Y+7*s
		p.Stroke(ui.Rect{X: cx - 4.6*s, Y: cy - 4.6*s, W: 9.2 * s, H: 9.2 * s}, col, 4.6*s, 1.8*s)
		p.Line(r.X+10.6*s, r.Y+10.6*s, r.X+13.8*s, r.Y+13.8*s, 1.8*s, col)
	}
}

// memAbout is what it knows about the person (D321), by Mem's own kinds,
// each row correctable in place, a search above them. Before Mem's glance
// arrives, the lines it noted in the conversation stand in.
func (a *App) memAbout(c *ui.Context) {
	t := a.T
	m := a.S.Mem
	var items []protocol.MemItem
	if m != nil && m.Glance != nil {
		items = m.Glance.About
	} else if m != nil {
		for _, n := range m.Noted {
			if n.MemoryID != "" {
				items = append(items, protocol.MemItem{ID: n.MemoryID, Title: n.Title, Kind: "other", By: "said", At: n.At})
			}
		}
	}
	ui.Column(c.Key("mem-about")).Gap(t.S2).Children(func() {
		a.sectionHead(c, a.L.T("mem.about.title"), a.L.T("mem.about.note", a.personaName()))
		ui.Column(c).Padding(0, 0).Children(func() { a.memSearch(c) })
	})
	if q := a.S.MemQuery; q != "" {
		a.group(c, "mem-found", "", "", func() {
			f := a.S.MemFound
			switch {
			case f == nil:
				a.tileRow(c, "mem-finding", nil, a.L.T("mem.find.title"), "…", nil)
			case !f.OK:
				a.tileRow(c, "mem-find-failed", a.pebbleTile(c), a.L.T("mem.find.failed"), "", nil)
			case len(f.Items) == 0:
				a.tileRow(c, "mem-find-none", a.pebbleTile(c), a.L.T("mem.find.none", q), "", nil)
			default:
				for _, x := range f.Items {
					a.memRow(c, x)
				}
			}
		})
		return
	}
	groups := aboutGroups(items)
	if len(groups) == 0 {
		a.group(c, "mem-none", "", "", func() {
			a.tileRow(c, "mem-none", a.pebbleTile(c), a.L.T("mem.about.empty"), a.L.T("mem.hero.empty.body"), nil)
		})
		return
	}
	for _, g := range groups {
		g := g
		a.group(c, "mem-kind:"+g.Kind, a.L.T("mem.kind."+g.Kind), "", func() {
			for _, x := range g.Items {
				a.memRow(c, x)
			}
		})
	}
}

// memTools is the person's other AI tools on the same Mem (D321): who, and
// how many working notes this week; never their titles.
func (a *App) memTools(c *ui.Context) {
	m := a.S.Mem
	if m == nil || m.Glance == nil || len(m.Glance.Tools) == 0 {
		return
	}
	a.group(c, "mem-tools", a.L.T("mem.tools.title"), "", func() {
		for _, x := range m.Glance.Tools {
			key := "mem.tools.count"
			if x.More {
				key = "mem.tools.more"
			}
			a.tileRow(c, "tool:"+x.From, a.toolTile(c, x.From), x.From, a.L.T(key, strconv.Itoa(x.Count)), nil)
		}
		a.footRow(c, "mem-tools", a.L.T("mem.tools.note", a.personaName()), nil)
	})
}

// pebbleTile is a noted line's mark: a small accent clay pebble on its ledge.
func (a *App) pebbleTile(c *ui.Context) func() {
	t := a.T
	return func() {
		ui.Box(c).Size(10, 12).Shrink(0).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
			p.Fill(ui.Rect{X: r.X, Y: r.Y + 2, W: 10, H: 10}, t.PressAccent.Color, 5)
			p.Fill(ui.Rect{X: r.X, Y: r.Y, W: 10, H: 10}, t.Accent, 5)
		})
	}
}

// groupThousands is 1284 → "1,284".
func groupThousands(n int) string {
	s := strconv.Itoa(n)
	for i := len(s) - 3; i > 0; i -= 3 {
		s = s[:i] + "," + s[i:]
	}
	return s
}

// toolTile is another AI tool's mark: its clay coin when Ducter has one
// (Claude the app is Anthropic's starburst, ChatGPT OpenAI's knot), else
// its own mark on the white clay tile (D314), else its first letter on a
// sunken pebble.
func (a *App) toolTile(c *ui.Context, from string) func() {
	art := map[string]string{"Claude Code": "coin_claude_code", "Claude": "coin_claude_code", "Codex": "coin_codex", "ChatGPT": "coin_codex", "pi": "coin_pi"}[from]
	if art != "" && theme.Clay(art) != nil {
		return a.clayTile(c, art, false)
	}
	if b := toolBrand(from); b != "" {
		return a.brandTile(c, b, false)
	}
	t := a.T
	return func() {
		r, _ := utf8.DecodeRuneInString(from)
		ui.Row(c.Key("tool-tile:"+from)).Size(36, 36).Shrink(0).Radius(18).Background(t.Sunken).Shadow(0, 2, 0, 0, t.Line2).
			Justify(ui.Center).AlignItems(ui.Center).AccessHidden(true).Children(func() {
			ui.Text(c, strings.ToUpper(string(r))).Font(t.Display).FontSize(t.MD).FontWeight(800).TextColor(t.InkSoft).LineHeight(1)
		})
	}
}

// memTile is Nowledge Mem's own mark, its app icon (D314; it replaced
// the letter N); faded while Mem isn't set up.
func (a *App) memTile(c *ui.Context, faded bool) func() {
	return a.brandTile(c, "nowledge_mem", faded)
}

// memWhere is where the memories are kept, in the person's words.
func (a *App) memWhere(b *protocol.BridgeView) string {
	home := a.memHome()
	if b != nil {
		switch {
		case b.Where == "cloud":
			return a.L.T("mem.app.kept.cloud")
		case b.Where == "local" || b.State == "local_mem":
			return a.L.T("mem.app.kept.local", home)
		case b.Where == "server":
			return a.L.T("mem.app.kept.server")
		}
	}
	if home != "" {
		return a.L.T("mem.app.where", home)
	}
	return ""
}

// memLink is Nowledge Mem itself: connected, where it's kept, its name
// there, the one update worth a tap, and the raw facts behind 详情.
func (a *App) memLink(c *ui.Context, b *protocol.BridgeView) {
	t := a.T
	m := a.S.Mem
	a.group(c, "mem-app", "", "", func() {
		a.headRow(c, "mem-app", a.memTile(c, false), "Nowledge Mem", a.L.T("mem.app.on"), sideDone, nil)
		if w := a.memWhere(b); w != "" {
			a.tileRow(c, "mem-where", nil, a.L.T("mem.app.kept.title"), w, nil)
		}
		if m != nil && m.KeptUnder != "" {
			a.tileRow(c, "mem-name", nil, a.L.T("mem.app.name.title"), a.L.T("mem.app.name.line", m.KeptUnder), nil)
		}
		// D321: how much Mem holds, and the door to all of it.
		all := a.L.T("mem.all.note")
		if m != nil && m.Glance != nil && m.Glance.Total > 0 {
			all = a.L.T("mem.all.count", groupThousands(m.Glance.Total))
		}
		a.tileRow(c, "mem-all", nil, all, "", func() {
			if a.quietLink(c, "mem-all", a.L.T("mem.all.open"), a.L.T("mem.all.open")) {
				a.openLink(memSite)
			}
		})
		if u := memUpdate(b); u != nil {
			a.memUpdateRow(c, u, b)
		}
		if a.memDetails {
			a.textBlock(c, "mem-details", func() { a.memFacts(c, b) })
		}
		note := ""
		if b != nil && b.Version != "" {
			note = a.L.T("mem.app.version", b.Version)
		}
		a.footRow(c, "mem-app", note, func() {
			if a.quietButton(c, "mem-details", a.L.T("mem.details"), "Nowledge Mem", a.memDetails, 0) {
				a.memDetails = !a.memDetails
			}
		})
	})
	_ = t
}

// memFacts is the literal facts for support, selectable, in mono.
func (a *App) memFacts(c *ui.Context, b *protocol.BridgeView) {
	t := a.T
	line := func(k, v string) {
		if v == "" {
			return
		}
		ui.Row(c).Gap(t.S3).AlignItems(ui.Baseline).Children(func() {
			ui.Text(c, a.L.T(k)).FontSize(t.SM).TextColor(t.InkMuted).Width(96).Shrink(0)
			ui.Text(c, v).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkSoft).Selectable().MinWidth(0).Shrink(1)
		})
	}
	if b == nil {
		return
	}
	line("mem.details.home", a.memHome())
	line("mem.details.version", b.Version)
	line("mem.details.identity", b.Identity)
	if b.Space != nil {
		line("mem.details.space", b.Space.Label)
		line("mem.details.spaceid", b.Space.ID)
	}
}

// memUpdateRow is the one thing about Mem's own version worth saying, as a
// row: a step running, one just done, an update with its tap.
func (a *App) memUpdateRow(c *ui.Context, u *memUpd, b *protocol.BridgeView) {
	t := a.T
	home := a.memHome()
	var title, line string
	var control func()
	tap := func(label string, kind btnKind) func() {
		return func() {
			if a.buttonFor(c, label, home, kind, t.ControlSM, t.Surface) && b != nil {
				b.State = "updating"
				if u.Kind == "move" {
					b.Upkeep = &protocol.BridgeUpkeep{Kind: "move"}
				}
				a.send(protocol.BridgeAction{T: "bridge_mem_install"})
			}
		}
	}
	retry := func(def string) string {
		if u.Detail != "" {
			return a.L.T("bridge.retry")
		}
		return def
	}
	switch u.Kind {
	case "updating":
		title = a.L.T("bridge.mem.updating", home)
		if u.Move {
			title = a.L.T("bridge.mem.moving", home)
		}
	case "done":
		title = a.L.T("bridge.mem.done."+u.Done, home)
	case "needed":
		title = a.L.T("mem.update.needed")
		switch {
		case u.CanRun && u.Move:
			line = a.L.T("bridge.mem.update.move", home, u.Version, memMin)
		case u.CanRun:
			line = a.L.T("bridge.mem.update", home, u.Version, memMin)
		case u.App:
			line = a.L.T("bridge.update", home)
		default:
			line = a.L.T("bridge.mem.update.other", home, u.Version, memMin)
		}
		if u.CanRun {
			control = tap(retry(a.L.T("bridge.mem.update.go")), btnPrimary)
		}
	case "move":
		title, line = a.L.T("bridge.mem.upkeep.move", home), a.L.T("bridge.mem.upkeep.move.how")
		control = tap(retry(a.L.T("bridge.mem.upkeep.move.go")), btnSecondary)
	default: // newer, app
		title = a.L.T("mem.update.newer.any")
		if u.Newer != "" {
			title = a.L.T("mem.update.newer", u.Newer)
		}
		switch {
		case u.Kind == "app":
			line = a.L.T("mem.update.app.body", home)
		case u.Version != "":
			line = a.L.T("mem.update.newer.body", home, u.Version)
		default:
			line = a.L.T("mem.update.newer.body.any")
		}
		if u.Kind == "newer" {
			control = tap(retry(a.L.T("bridge.mem.update.go")), btnPrimary)
		}
	}
	if u.Detail != "" {
		line = strings.TrimSpace(line + "\n" + a.memFailed(false, home, u.Detail, u.Kept))
	}
	tile := a.glyphTile(c, 18, drawUp(t.Accent))
	if u.Kind == "done" {
		tile = a.glyphTile(c, 18, drawCheck(t.Done.Ink))
	}
	a.tileRow(c, "mem-update", tile, title, line, control)
}

// memClosed is D329's one line when the Nowledge Mem app on the home is
// closed: what it means, and the way to open it when the home can.
func (a *App) memClosed(c *ui.Context, b *protocol.BridgeView) {
	t := a.T
	home := a.memHome()
	a.group(c, "mem-closed", "", "", func() {
		line := a.L.T("bridge.mem.closed.there", home)
		var control func()
		if b != nil && b.CanOpen {
			line = a.L.T("bridge.mem.closed.open", home)
			control = func() {
				if a.buttonFor(c, a.L.T("bridge.mem.open"), home, btnSecondary, t.ControlSM, t.Surface) {
					a.send(protocol.BridgeAction{T: "bridge_mem_open"})
				}
			}
		}
		a.headRow(c, "mem-closed", a.memTile(c, true), a.L.T("bridge.mem.closed"), line, sideMuted, control)
	})
}

// memFirst is Memory before Mem is there: a small empty state on the paper
// (the partner with its notebook, what it would give), then the setup as
// one group of steps, the local app's way as its note.
func (a *App) memFirst(c *ui.Context, phase string, b *protocol.BridgeView) {
	t := a.T
	name := a.personaName()
	home := a.memHome()
	face := theme.Idle
	switch phase {
	case "installing", "signing_in":
		face = theme.Working
	case "sign_in":
		face = theme.Waiting
	}
	ui.Column(c.Key("mem-first")).AlignItems(ui.Center).Gap(t.S2).Padding(t.S4, t.S6, t.S2, t.S6).Children(func() {
		a.avatar(c, face, 96)
		a.heading(c, a.L.T("mem.first.title", name), t.XL)
		ui.Text(c, a.L.T("mem.first.body")).FontSize(t.MD).LineHeight(a.leading(1.6)).TextColor(t.InkSoft).TextAlign(ui.Center).MaxWidth(520)
	})
	line := map[string]string{
		"missing":    a.L.T("mem.setup.missing"),
		"install":    a.L.T("mem.setup.install", home),
		"installing": a.L.T("mem.setup.installing"),
		"sign_in":    a.L.T("mem.setup.signin"),
		"signing_in": a.L.T("mem.setup.signing"),
	}[phase]
	a.group(c, "mem-setup", "", "", func() {
		a.headRow(c, "mem-setup", a.memTile(c, true), "Nowledge Mem", line, sideMuted, nil)
		if phase == "missing" {
			a.tileRow(c, "mem-what", nil, a.L.T("mem.app.learn"), a.L.T("mem.app.what"), func() {
				if a.button(c, a.L.T("mem.app.open"), btnSecondary, t.ControlSM, t.Surface) {
					a.openLink(memSite)
				}
			})
			a.footRow(c, "mem-local", a.L.T("mem.setup.local", name), nil)
			return
		}
		a.memSteps(c, phase, b)
		a.footRow(c, "mem-local", a.L.T("mem.setup.local", name), nil)
	})
}

// memSteps is Nowledge Mem's two steps on the home, each one tap in place
// (D225): put it in, then sign in with a one-time link. Memory's first page
// and 和你的其他 agent 通信's (D332) walk the same steps.
func (a *App) memSteps(c *ui.Context, phase string, b *protocol.BridgeView) {
	t := a.T
	home := a.memHome()
	installed := phase == "sign_in" || phase == "signing_in"
	a.chatBody(c, "mem-steps", func() {
		// 1. Install.
		if installed {
			a.chatStep(c, 1, a.L.T("mem.step.done"), nil)
		} else {
			a.chatStep(c, 1, a.L.T("mem.step.install"), func() {
				busy := phase == "installing"
				help := a.L.T("bridge.mem.install", home)
				switch {
				case busy:
					help = a.L.T("bridge.mem.installing", home)
				case b != nil && !b.CanRun:
					help = a.L.T("bridge.mem.install.need", home) + "\n" + a.L.T("bridge.mem.install.need.how")
				}
				if b != nil && b.Detail != "" && !busy {
					help += "\n" + a.memFailed(true, home, b.Detail, b.Kept)
				}
				a.note(c, help)
				if busy {
					return
				}
				label, kind := a.L.T("bridge.mem.install.go"), btnPrimary
				if b == nil || !b.CanRun {
					label, kind = a.L.T("bridge.retry"), btnSecondary
				}
				ui.Row(c).Children(func() {
					if a.buttonFor(c, label, home, kind, t.ControlSM, t.Surface) && b != nil {
						b.State = "installing"
						a.send(protocol.BridgeAction{T: "bridge_mem_install"})
					}
				})
			})
		}
		// 2. Sign in.
		a.chatStep(c, 2, a.L.T("mem.step.signin"), func() {
			if !installed {
				return
			}
			busy := phase == "signing_in"
			help := a.L.T("bridge.mem.signin", home)
			if b != nil {
				if b.Done != "" {
					help = a.L.T("bridge.mem.done."+b.Done, home) + "\n" + help
				}
				switch b.SignIn {
				case "used":
					help += "\n" + a.L.T("bridge.mem.signin.used")
				case "bad":
					help += "\n" + a.L.T("bridge.mem.signin.bad")
				case "failed":
					help += "\n" + a.L.T("bridge.mem.signin.failed", b.Detail)
				}
			}
			a.note(c, help)
			ui.Row(c).Gap(t.S2).AlignItems(ui.End).Children(func() {
				ui.Column(c).Grow(1).MinWidth(0).Children(func() {
					a.field(c, "bridge-link", a.L.T("bridge.mem.signin.link"), &a.bridgeLink, "https://…?nmem_connect=…", "")
				})
				label := a.L.T("bridge.mem.signin.go")
				if busy {
					label = a.L.T("bridge.mem.signin.busy")
				}
				if a.buttonFor(c, label, home, btnPrimary, t.ControlMD, t.Surface) && !busy && strings.TrimSpace(a.bridgeLink) != "" && b != nil {
					b.State = "signing_in"
					a.send(protocol.BridgeMemSignIn{T: "bridge_mem_sign_in", Link: strings.TrimSpace(a.bridgeLink)})
					a.bridgeLink = ""
				}
			})
		})
	})
}
