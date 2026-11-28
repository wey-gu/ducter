package views

// D304: the conversation side of Nowledge Mem. Under a reply a recall
// changed, one quiet line says where it came from (想起了你 11 月 10 日 说的 /
// Remembered from what you said on Nov 10); tapped, a small card shows the
// memory (title, who it is from, the date: each its own element, D291),
// with Forget (asking in place) and Open in Nowledge Mem. The week's first
// morning note offers 这周记下的 / What it learned this week: the week's noted
// lines, each confirmed, corrected (written back to Mem) or forgotten.
// Kept apart from conversation.go, which only calls recalledUnder.

import (
	"strconv"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// recallState is the open 想起了 card and 这周记下的.
type recallState struct {
	open      int64 // the recalled line whose card is open (its event's seq)
	asking    bool  // its Forget is asking in place
	learned   string
	forgetAsk int64 // a learned row's Forget is asking
	fixing    int64 // a learned row being corrected
	fixText   string
	confirmed map[int64]bool
	fixed     map[int64]string
	said      string // how the last correction went, shown in the card
}

// recallDate is a memory's day as a sentence carries it: "11 月 10 日" /
// "Nov 10", the year only when it isn't this one.
func recallDate(l i18n.Lang, date string, now time.Time) string {
	at, err := time.ParseInLocation("2006-01-02", date, now.Location())
	if err != nil {
		return ""
	}
	if at.Year() == now.Year() {
		return i18n.CalMD(l, at)
	}
	return i18n.Day(l, at, now)
}

// recallLineText is the quiet line's words for one recalled memory.
func recallLineText(L *i18n.Strings, r protocol.MemoryRecalled, now time.Time) string {
	d := recallDate(L.Lang, r.Date, now)
	if r.Thread && r.From != "" { // D433: a past conversation with another AI tool
		if d != "" {
			return L.T("recall.thread", r.From, d)
		}
		return L.T("recall.thread.any", r.From)
	}
	by := r.By
	if by != "said" && by != "tool" {
		by = "you"
	}
	if by == "tool" && r.From == "" {
		by = "you"
	}
	switch {
	case by == "tool" && d != "":
		return L.T("recall.tool", r.From, d)
	case by == "tool":
		return L.T("recall.tool.any", r.From)
	case d != "":
		return L.T("recall."+by, d)
	default:
		return L.T("recall." + by + ".any")
	}
}

// recallFrom is who the memory is from, as its own fact on the card.
func recallFrom(L *i18n.Strings, r protocol.MemoryRecalled) string {
	if r.Thread && r.From != "" {
		return L.T("recall.from.thread", r.From)
	}
	if r.By == "tool" && r.From != "" {
		return L.T("recall.from.tool", r.From)
	}
	if r.By == "said" {
		return L.T("recall.from.said")
	}
	return L.T("recall.from.you")
}

// recalledUnder is the 想起了 line under the message at seq, and its card
// when open. Nothing when no recall changed that message.
func (a *App) recalledUnder(c *ui.Context, seq int64) {
	r := a.S.RecalledFor(seq)
	if r == nil || a.forgotten[r.Seq] {
		return
	}
	t := a.T
	key := "recall:" + strconv.FormatInt(r.Seq, 10)
	a.underBubble(c, func() {
		open := a.recall.open == r.Seq
		chev := 1
		if open {
			chev = 2
		}
		if a.quietButton(c, key, recallLineText(a.L, r.MemoryRecalled, a.Now()), "", false, chev) {
			if open {
				a.recall.open = 0
			} else {
				a.recall.open, a.recall.asking = r.Seq, false
			}
		}
		if !open {
			return
		}
		card := ui.Column(c.Key(key+":card")).Gap(t.S2).Padding(t.S4, t.S5).Radius(t.RadiusLG).Background(t.Surface).
			Shadow(0, t.Raised.Y, 0, 0, t.Raised.Color).Role(ui.RoleDialog).Label(a.L.T("recall.title"))
		card.Children(func() { a.recallCard(c, key, r) })
	})
}

func (a *App) recallCard(c *ui.Context, key string, r *store.Recalled) {
	t := a.T
	uiText(c, a.L.T("recall.title")).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted)
	uiText(c, autospace(r.Title)).FontSize(t.MD).FontWeight(700).LineHeight(a.leading(1.4)).TextColor(t.Ink)
	// Who it is from and when: two facts, two elements (D291).
	ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Wrap().Children(func() {
		uiText(c, recallFrom(a.L, r.MemoryRecalled)).FontSize(t.SM).TextColor(t.InkSoft)
		if d := recallDate(a.L.Lang, r.Date, a.Now()); d != "" {
			uiText(c, d).FontSize(t.SM).TextColor(t.InkMuted)
		}
	})
	if r.Thread && r.From != "" {
		// D433: the conversation is the tool's: nothing to forget here, only where to read it.
		a.note(c, a.L.T("recall.thread.why"))
		if a.quietLink(c, key+":open", a.L.T("recall.open"), a.L.T("recall.open")) {
			c.OpenURL(memSite)
		}
		return
	}
	a.note(c, a.L.T("recall.why"))
	if a.recall.asking {
		ask := a.L.T("mem.forget.ask", r.Title)
		if r.By == "tool" && r.From != "" {
			ask = a.L.T("recall.forget.tool", r.Title, r.From)
		}
		uiText(c, ask).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.Ink)
		ui.Row(c).Gap(t.S1).AlignItems(ui.Center).Children(func() {
			if a.quietButton(c, key+":keep", a.L.T("mem.forget.keep"), r.Title, false, 0) {
				a.recall.asking = false
			}
			if a.dangerText(c, key+":go", a.L.T("partner.memory.forget"), r.Title) {
				a.recall.open, a.recall.asking = 0, false
				a.forgetNoted(r.Seq, r.Title)
			}
		})
		return
	}
	ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
		if a.dangerText(c, key+":forget", a.L.T("partner.memory.forget"), r.Title) {
			a.recall.asking = true
		}
		if a.quietLink(c, key+":open", a.L.T("recall.open"), a.L.T("recall.open")) {
			c.OpenURL(memSite)
		}
	})
}

// ---------- 这周记下的 / What it learned this week ----------

// learnedRows are the week's noted lines (the last 7 days), newest first,
// without the ones forgotten here.
func (a *App) learnedRows() []protocol.Noted {
	if a.S.Mem == nil {
		return nil
	}
	var out []protocol.Noted
	for _, g := range groupNoted(a.S.Mem.Noted, a.Now()) {
		if g.When == "earlier" {
			continue
		}
		for _, n := range g.Items {
			if !a.forgotten[n.Seq] {
				out = append(out, n)
			}
		}
	}
	return out
}

// noteFoot is the morning note's ways on, one quiet row under it (D482):
// D304's week of what it noted (the week's first note) and D300's Done for
// you (the morning's), each a quiet link with its chevron; the noted list
// opens under them.
func (a *App) noteFoot(c *ui.Context, key string, n *protocol.Finds) {
	learned := n.Learned != nil && n.Learned.Count > 0
	did := n.Rung == "morning" && !n.Quiet
	shadow := a.shadowOffered(n)
	if !learned && !did && !shadow {
		return
	}
	t := a.T
	open := a.recall.learned == key
	a.underBubble(c, func() {
		ui.Row(c.Key(key + ":foot")).Gap(t.S4).AlignItems(ui.Center).Wrap().Children(func() {
			if shadow {
				a.shadowLink(c, key, n)
			}
			if learned {
				label := a.L.T("learned.link.one")
				if n.Learned.Count > 1 {
					label = a.L.T("learned.link", strconv.Itoa(n.Learned.Count))
				}
				chev := 1
				if open {
					chev = 2
				}
				if a.quietButton(c, key+":learned-open", label, "", false, chev) {
					if open {
						a.recall.learned = ""
					} else {
						a.openLearned(key)
					}
				}
			}
			if did {
				a.didLink(c, "did-morning:"+key)
			}
		})
		if open {
			a.learnedCard(c, key)
		}
		if shadow && a.shadow.open == key {
			a.shadowCard(c, key)
		}
	})
}

// openLearned opens the list under the note, asking for the noted lines
// when this app has none yet.
func (a *App) openLearned(key string) {
	a.recall.learned, a.recall.fixing, a.recall.forgetAsk, a.recall.said = key, 0, 0, ""
	if a.S.Mem == nil {
		a.send(protocol.SettingsReq{T: "settings"})
	}
}

// drainCorrected turns the server's word on a correction into the card's line.
func (a *App) drainCorrected() {
	f := a.S.Corrected
	if f == nil {
		return
	}
	a.S.Corrected = nil
	if f.How == "mem" {
		a.recall.said = a.L.T("learned.fixed.mem")
	} else {
		a.recall.said = a.L.T("learned.fixed.here")
	}
}

func (a *App) learnedCard(c *ui.Context, key string) {
	t := a.T
	a.drainCorrected()
	card := ui.Column(c.Key(key+":learned-card")).Gap(t.S3).Padding(t.S4, t.S5).Radius(t.RadiusLG).Background(t.Surface).
		Shadow(0, t.Raised.Y, 0, 0, t.Raised.Color).Role(ui.RoleDialog).Label(a.L.T("learned.title"))
	card.Children(func() {
		a.heading(c, a.L.T("learned.title"), t.LG).TextColor(t.Ink)
		a.note(c, a.L.T("learned.lede"))
		if a.recall.said != "" {
			ui.Row(c).Gap(t.S1 + 2).AlignItems(ui.Center).Children(func() {
				a.glyph(c, 16, drawCheck(t.Done.Ink))
				uiText(c, a.recall.said).FontSize(t.SM).TextColor(t.InkSoft)
			})
		}
		rows := a.learnedRows()
		if len(rows) == 0 {
			a.note(c, a.L.T("learned.none"))
			return
		}
		for i, n := range rows {
			if i > 0 {
				ui.Box(c).Height(1).Background(t.LineSoft)
			}
			a.learnedRow(c, n)
		}
	})
}

func (a *App) learnedRow(c *ui.Context, n protocol.Noted) {
	t := a.T
	rs := &a.recall
	key := "learned:" + strconv.FormatInt(n.Seq, 10)
	title := n.Title
	if f, ok := rs.fixed[n.Seq]; ok {
		title = f
	}
	ui.Column(c.Key(key)).Gap(t.S2).Padding(t.S1, 0).Children(func() {
		switch {
		case rs.fixing == n.Seq:
			ui.TextInput(c.Key(key+":input"), &rs.fixText).Label(a.L.T("learned.fix")).
				FontSize(t.MD).Padding(t.S2, t.S3).Radius(t.RadiusSM).
				Background(t.SurfaceSunken).Border(1, t.LineSoft).
				OnSubmit(func() { a.saveFix(n.Seq) })
			ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				if a.buttonFor(c, a.L.T("learned.save"), title, btnSecondary, t.ControlSM, t.Surface) {
					a.saveFix(n.Seq)
				}
				if a.quietButton(c, key+":cancel", a.L.T("learned.cancel"), title, false, 0) {
					rs.fixing = 0
				}
			})
		case rs.forgetAsk == n.Seq:
			uiText(c, a.L.T("mem.forget.ask", title)).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.Ink)
			ui.Row(c).Gap(t.S1).AlignItems(ui.Center).Children(func() {
				if a.quietButton(c, key+":keep", a.L.T("mem.forget.keep"), title, false, 0) {
					rs.forgetAsk = 0
				}
				if a.dangerText(c, key+":go", a.L.T("partner.memory.forget"), title) {
					rs.forgetAsk = 0
					a.forgetNoted(n.Seq, title)
				}
			})
		default:
			uiText(c, autospace(title)).FontSize(t.MD).LineHeight(a.leading(1.45)).TextColor(t.Ink)
			ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Wrap().Children(func() {
				checked := n.Confirmed || rs.confirmed[n.Seq]
				fixed := n.Corrected || rs.fixed[n.Seq] != ""
				if fixed {
					uiText(c, a.L.T("learned.fixed")).FontSize(t.SM).TextColor(t.InkMuted)
				} else if checked {
					a.markIn(c, drawCheck, t.Done.Ink, a.L.T("learned.checked"), t.InkMuted)
				}
				ui.Box(c).Grow(1)
				if !checked && !fixed && a.quietButton(c, key+":right", a.L.T("learned.right"), title, true, 0) {
					a.confirmNoted(n.Seq)
				}
				if a.quietButton(c, key+":fix", a.L.T("learned.fix"), title, false, 0) {
					rs.fixing, rs.fixText, rs.forgetAsk = n.Seq, title, 0
				}
				if a.dangerText(c, key+":forget", a.L.T("partner.memory.forget"), title) {
					rs.forgetAsk, rs.fixing = n.Seq, 0
				}
			})
		}
	})
}

// recallEsc is Esc on the conversation: a question asking in place, then
// an edit, then the open card or list, one step at a time (it holds the
// keys whatever is focused, so a button that went away doesn't strand it).
func (a *App) recallEsc() bool {
	rs := &a.recall
	switch {
	case rs.asking:
		rs.asking = false
	case rs.forgetAsk != 0:
		rs.forgetAsk = 0
	case rs.fixing != 0:
		rs.fixing = 0
	case rs.open != 0:
		rs.open = 0
	case rs.learned != "":
		rs.learned, rs.said = "", ""
	default:
		return false
	}
	return true
}

// confirmNoted says a noted line is right.
func (a *App) confirmNoted(seq int64) {
	if a.recall.confirmed == nil {
		a.recall.confirmed = map[int64]bool{}
	}
	a.recall.confirmed[seq] = true
	a.send(protocol.MemoryConfirm{T: "memory_confirm", Seq: seq})
}

// saveFix sends the person's words for a noted line; they read so here at once.
func (a *App) saveFix(seq int64) {
	words := strings.Join(strings.Fields(a.recall.fixText), " ")
	a.recall.fixing = 0
	if words == "" {
		return
	}
	if a.recall.fixed == nil {
		a.recall.fixed = map[int64]string{}
	}
	a.recall.fixed[seq] = words
	a.send(protocol.MemoryCorrect{T: "memory_correct", Seq: seq, Title: words})
}
