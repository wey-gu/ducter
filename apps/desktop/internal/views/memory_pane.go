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
		// D563, D664: while a step of the setup isn't done (Mem signed out, out of reach, too old),
		// the setup comes first, its fix under the line that says it; never a page below.
		first := !a.memSetupNow(false).Done
		if first {
			a.memLink(c, b)
		}
		a.memHead(c, st)
		a.memAbout(c)
		a.memCheck(c)
		a.memRules(c)
		a.memTools(c)
		if !first {
			a.memLink(c, b)
		}
	case "off":
		a.memHead(c, st)
	case "closed":
		// D646, D664: the closed app is the setup's first step, with its one way to open it; what
		// Mem holds waits until it answers again.
		a.memSetup(c, "mem-app", false, nil, nil, nil)
		a.memHead(c, st)
	default:
		a.memFirst(c, b)
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
	ruleOff             string // D465: the rule asked to turn off, in place
	checkOpen           bool   // D569: Mem's asks opened from their one quiet row
	// D652: 改 / 忘掉 wait for Mem; a refusal leaves the row as it was with why.
	busy      string // the memory being changed
	busyOp    string // fix | forget
	busyTitle string // what the partner's said line will name
	failed    string // the memory Mem didn't take
	failedOp  string
	failedWhy string
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

// openMemory (D617) opens Settings › 记忆 on one memory a task's
// recalled line names. Mem has no per-memory deep link (research/136 G6), so
// the inventory row opens when it is there; else the search finds it by its
// title.
func (a *App) openMemory(id, title string) {
	if id == "" {
		a.openTab(TabMemory)
		return
	}
	known := false
	if m := a.S.Mem; m != nil && m.Glance != nil {
		for _, it := range m.Glance.About {
			if it.ID == id {
				known = true
				break
			}
		}
	}
	a.memPage.open = id
	if !known && title != "" {
		a.memPage.query, a.memPage.last = title, title
		a.memFind(title)
	}
	a.openTab(TabMemory)
}

// memForget forgets one memory by Mem's id (D321). D652: the row waits for Mem's answer; on a
// success the partner's word follows (mem_done), on a refusal the row is as it was with one line.
func (a *App) memForget(id, title string) {
	ps := &a.memPage
	ps.busy, ps.busyOp, ps.busyTitle = id, "forget", title
	ps.failed = ""
	a.send(protocol.MemForget{T: "mem_forget", ID: id})
}

// memFix fixes one memory's words by Mem's id (D321). D652: the corrected words are a new
// memory that supersedes this one (Mem's id changes); the row waits for Mem's answer.
func (a *App) memFix(id, title, kind string) {
	words := strings.Join(strings.Fields(title), " ")
	if words == "" {
		return
	}
	ps := &a.memPage
	ps.busy, ps.busyOp, ps.busyTitle = id, "fix", words
	ps.failed = ""
	a.send(protocol.MemFix{T: "mem_fix", ID: id, Title: words, Kind: kind})
}

// memDone settles a 改 or 忘掉 on Settings › 记忆 after Nowledge Mem answered (D652): the said
// line only on a success, one line in the failed ink and the row as it was otherwise.
func (a *App) memDone(f *protocol.MemDone) {
	if f == nil {
		return
	}
	ps := &a.memPage
	title := ps.busyTitle
	ps.busy, ps.busyOp, ps.busyTitle = "", "", ""
	if f.OK {
		ps.failed = ""
		// A fix is a new memory: a search result shows the corrected one, under its new id; a
		// forgotten one leaves the search too, now that Mem did it.
		if got := a.S.MemFound; got != nil {
			if f.Op == "forget" {
				kept := got.Items[:0]
				for _, it := range got.Items {
					if it.ID != f.ID {
						kept = append(kept, it)
					}
				}
				got.Items = kept
			} else if f.Op == "fix" && f.NewID != "" {
				for i := range got.Items {
					if got.Items[i].ID == f.ID {
						got.Items[i].ID = f.NewID
						if f.Title != "" {
							got.Items[i].Title = f.Title
						}
					}
				}
			}
		}
		key := "said.mem.fix"
		if f.Op == "forget" {
			key = "said.mem.forget"
		}
		if f.Title != "" {
			title = f.Title
		}
		a.say("mem-about", a.L.T(key, title))
		return
	}
	ps.failed, ps.failedOp = f.ID, f.Op
	ps.failedWhy = f.Why
	if ps.failedWhy == "" {
		ps.failedWhy = "refused"
	}
}

// memRow is one memory, tapped open in place: where it came from as its
// line, the age at the right; open, 改 (its words, written to Mem) and 忘掉
// (asks first).
// memBare (D582): a list with no other tool's row has no tile column.
func memBare(ms []protocol.MemItem) bool {
	for _, m := range ms {
		if m.By == "tool" && m.From != "" {
			return false
		}
	}
	return true
}

func (a *App) memRow(c *ui.Context, m protocol.MemItem, bare bool) {
	t := a.T
	ps := &a.memPage
	open := ps.open == m.ID
	if open && ps.mode == "ask" && ps.busy != m.ID {
		keep, goOn := a.confirmRow(c, "memi:"+m.ID, a.L.T("mem.item.forget.ask", m.Title), a.L.T("mem.forget.keep"), a.L.T("partner.memory.forget"), m.Title)
		if keep {
			ps.mode = ""
		}
		if goOn {
			ps.mode = ""
			a.memForget(m.ID, m.Title)
		}
		return
	}
	if open && ps.mode == "fix" && ps.busy != m.ID {
		save := func() {
			ps.mode = ""
			a.memFix(m.ID, ps.fixText, m.Kind)
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
	// D459: a row speaks only when it differs (D399). What the person told it is the
	// usual source, said once in the section's note; a row says where it came from
	// only when it came from somewhere else (another AI tool, Mem itself), and only
	// another tool's row carries a mark (its coin), never a dot on every row.
	var tile func()
	if m.By == "tool" && m.From != "" {
		tile = a.toolTile(c, m.From)
	}
	line := ""
	if m.By != "said" {
		key, args := bySource(m)
		line = a.L.T(key, args...)
	}
	var age func()
	if s := a.agoLong(m.At); s != "" {
		age = func() { uiText(c, s).FontSize(t.SM).FontWeight(600).TextColor(t.InkMuted).SingleLine() }
	}
	if a.openRowOn(c, "memi:"+m.ID, tile, bare, autospace(m.Title), line, t.InkMuted, open, age) {
		if open {
			ps.open = ""
		} else {
			ps.open, ps.mode = m.ID, ""
		}
	}
	if open {
		// D652: the row waits for Nowledge Mem; a refusal is one line in the failed ink,
		// under the row as it was, and the actions stay for a retry.
		if ps.busy == m.ID {
			a.footRow(c, "memi-busy:"+m.ID, "", func() {
				a.busyButton(c, a.L.T("mem.done.wait"), m.Title, t.ControlSM, t.Surface)
			})
		} else {
			if ps.failed == m.ID {
				why := ps.failedWhy
				if why == "" {
					why = "refused"
				}
				a.textBlock(c, "memi-failed:"+m.ID, func() {
					uiText(c, a.L.T("mem.done.failed."+ps.failedOp, a.L.T("mem.done.why."+why))).FontSize(t.SM).TextColor(t.Failed.Ink).LineHeight(a.leading(1.5))
				})
			}
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
	// D459: a forget or a fix is answered once, in the partner's word, under what it changed.
	defer a.saidLine(c, "mem-about")
	ui.Column(c.Key("mem-about")).Gap(t.S2).Children(func() {
		a.sectionHead(c, a.L.T("mem.about.title"), a.L.T("mem.about.note", a.personaName()))
		// D444: what it knows, said back in its own words: the question goes
		// to the conversation's composer (never sent for the person).
		if len(aboutGroups(items)) > 0 && a.S.MemQuery == "" {
			ui.Row(c.Key("mem-ask")).Padding(0, t.S4+t.S2).Children(func() {
				if a.quietButton(c, "mem-ask", a.L.T("mem.about.ask", a.personaName()), "", false, 1) {
					a.askAboutMe()
				}
			})
		}
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
					a.memRow(c, x, memBare(f.Items))
				}
			}
		})
		return
	}
	groups := aboutGroups(items)
	if len(groups) == 0 {
		// D646: with Mem out of reach or signed out and nothing cached, the head says Mem is out
		// of reach (D590's line), never 「我还不太了解你」: an empty page must not read as forgetting.
		why := ""
		if b := a.S.Bridge; b != nil {
			why = a.failedWhy(b.Detail)
		}
		if v := memStateOf(m, a.S.Bridge, a.memHome(), why); v != nil && (v.State == "unreachable" || v.State == "signed_out") {
			a.group(c, "mem-none", "", "", func() {
				a.tileRow(c, "mem-none", a.pebbleTile(c), a.memWord(v.Title), a.memWord(v.Line), nil)
			})
			return
		}
		a.group(c, "mem-none", "", "", func() {
			a.tileRow(c, "mem-none", a.pebbleTile(c), a.L.T("mem.about.empty"), a.L.T("mem.hero.empty.body"), nil)
		})
		return
	}
	for _, g := range groups {
		g := g
		// D459: a lone 别的 / Other is not a kind worth naming.
		title := a.L.T("mem.kind." + g.Kind)
		if len(groups) == 1 && g.Kind == "other" {
			title = ""
		}
		a.group(c, "mem-kind:"+g.Kind, title, "", func() {
			for _, x := range g.Items {
				a.memRow(c, x, memBare(g.Items))
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
	art := map[string]string{"Claude Code": "coin_claude_code", "Claude": "coin_claude_code", "Codex": "coin_codex", "ChatGPT": "coin_codex", "pi": "coin_pi", "Antigravity": "coin_antigravity"}[from]
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
			uiText(c, strings.ToUpper(string(r))).Font(t.Display).FontSize(t.MD).FontWeight(800).TextColor(t.InkSoft).LineHeight(1)
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

// memLink is Nowledge Mem itself (D664: the one setup group): its steps until all are done, then
// one calm line; where it's kept and its name there while the steps are folded (open, the steps say
// them), how much it holds, the one update worth a tap, and the raw facts behind 详情.
func (a *App) memLink(c *ui.Context, b *protocol.BridgeView) {
	m := a.S.Mem
	a.memSetup(c, "mem-app", false, nil, func(stepsShown bool) {
		a.memPluginOffer(c)
		if w := a.memWhere(b); w != "" && !stepsShown {
			a.tileRow(c, "mem-where", nil, a.L.T("mem.app.kept.title"), w, nil)
		}
		if m != nil && m.KeptUnder != "" && !stepsShown {
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
		// D566, D582: after how much Mem holds, as on the web.
		a.memFilesRow(c)
		// D459: one story with 和你的其他 agent 通信: the same Mem is how the person's other
		// agents reach the partner, said here once with the way over.
		for _, tab := range a.visibleTabs() {
			if tab == TabPeers {
				a.tileRow(c, "mem-peers", nil, a.L.T("mem.peers.row", a.personaName()), "", func() {
					if a.quietLink(c, "mem-peers", a.L.T("mem.peers.go"), a.L.T("mem.peers.go")) {
						a.openTab(TabPeers)
					}
				})
			}
		}
		// D664: an update Mem needs before it works is the setup's first step, not a row here.
		if u := memUpdate(b); u != nil && u.Kind != "needed" && u.Kind != "updating" {
			a.memUpdateRow(c, u, b)
		}
		// D466: an agent's Nowledge Mem with a newer version out, or in more
		// than once: one row each, asked in place (memplugin.go).
		a.memPluginRows(c)
		if a.memDetails {
			a.textBlock(c, "mem-details", func() { a.memFacts(c, b) })
		}
	}, func() {
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
	a.saidLine(c, "memfiles")
}

// memFilesRow is 做好的文件也存进 Nowledge Mem / Also keep files I make in
// Nowledge Mem (D566, off by default): a finished task's reports and
// documents go to Mem's 「Ducter」 folder by themselves. The last one that
// didn't go says so here once, in plain words (D572), until the next one is kept.
func (a *App) memFilesRow(c *ui.Context) {
	st := a.S.Settings
	if st == nil {
		return
	}
	help := a.L.T("memfile.row.line")
	if m := a.S.Mem; m != nil && m.FileTrouble != nil && st.MemFiles {
		tr := m.FileTrouble
		help = a.L.T("memfile.trouble", tr.Name, a.keepWhy(tr.Why))
	}
	// D582: a row of the group's own shape (the text edge its siblings keep), not a
	// toggleRow, which sat 52 left of every other row in the card.
	v, ch := st.MemFiles, false
	a.tileRow(c, "memfiles", nil, a.L.T("memfile.row"), help, func() {
		ch = a.switchControl(c, "memfiles", a.L.T("memfile.row"), &v)
	})
	if ch {
		st.MemFiles = v
		a.SetSettings(protocol.SettingsPatch{MemFiles: &v})
		if v {
			a.say("memfiles", a.L.T("said.memfiles.on"))
		} else {
			a.say("memfiles", a.L.T("said.memfiles.off"))
		}
	}
}

// memPluginOffer is D554's offer under the setup: agents on the home without Mem's plugin, with
// 接上 by Mem's own command (busy while it runs), never Mem itself in the failed ink. D664: Mem's
// own trouble (signed out, out of reach, too old) is a step of the setup, with its one action.
func (a *App) memPluginOffer(c *ui.Context) {
	t := a.T
	var health *protocol.MemHealth
	if a.S.Mem != nil {
		health = a.S.Mem.Health
	}
	var home *protocol.DeviceView
	for i := range a.S.Devices {
		if a.S.Devices[i].Home {
			home = &a.S.Devices[i]
		}
	}
	var hs []protocol.DeviceHarness
	if home != nil {
		hs = home.Harnesses
	}
	h := memHealthLook(health, a.S.Bridge, hs)
	if h.Look != "ok" || len(h.Agents) == 0 {
		return
	}
	who := a.memAgentsWords(h.Agents)
	about := spoken(a.L, who, "Nowledge Mem")
	sub := a.L.T("mem.health.plugin.why")
	if len(h.Agents) == 1 {
		sub = a.L.T("mem.health.plugin.why.one") // D556: 它 for one agent, 它们 for two
	}
	var ctl func()
	if h.Busy {
		sub = a.L.T("mem.health.plugin.busy", who)
		c.After(500e6)
		ctl = func() { a.busyButton(c, a.L.T("mem.health.plugin.going"), about, t.ControlSM, t.Surface) }
	} else if home != nil {
		ctl = func() {
			if a.buttonFor(c, a.L.T("mem.health.plugin.go"), about, btnSecondary, t.ControlSM, t.Surface) {
				for _, x := range h.Agents {
					a.installMem(home.ID, x)
				}
			}
		}
	}
	a.tileRow(c, "mem-plugin", nil, a.L.T("mem.health.plugin", who), keepClauses(sub), ctl) // D556: never 「上。」 alone
}

// memFacts is the literal facts for support, selectable, in mono.
func (a *App) memFacts(c *ui.Context, b *protocol.BridgeView) {
	t := a.T
	line := func(k, v string) {
		if v == "" {
			return
		}
		ui.Row(c).Gap(t.S3).AlignItems(ui.Baseline).Children(func() {
			uiText(c, a.L.T(k)).FontSize(t.SM).TextColor(t.InkMuted).Width(96).Shrink(0)
			uiText(c, v).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkSoft).Selectable().MinWidth(0).Shrink(1)
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

// memFirst is Memory before Mem is there (D664: the one setup group): what Nowledge Mem is, then
// its steps, the local app's way as its note.
func (a *App) memFirst(c *ui.Context, b *protocol.BridgeView) {
	t := a.T
	home := a.memHome()
	a.memSetup(c, "mem-setup", false, func() {
		// D552: what Nowledge Mem is, before any step, in every phase.
		a.tileRow(c, "mem-what", nil, a.L.T("mem.app.learn"), a.L.T("mem.app.what"), func() {
			if a.button(c, a.L.T("mem.app.open"), btnSecondary, t.ControlSM, t.Surface) {
				a.openLink(memSite)
			}
		})
	}, nil, func() {
		where := home
		if where == "" {
			where = a.L.T("mem.setup.local.here")
		}
		a.footRow(c, "mem-local", a.L.T("mem.setup.local", where), nil)
	})
	_ = b
}

// askAboutMe goes back to the conversation with 你都记得我些什么？ in the
// composer (D444); the person sends it, and the partner answers from Mem.
func (a *App) askAboutMe() {
	a.Route = RouteConversation
	a.draft = a.L.T("mem.about.ask.words")
	a.focusComposer = true
}
