package views

// D674 (research/247 Brief B): the shadow gets a verdict. Once a week
// the morning note's foot (D482's row) carries one quiet link, 这周我注意到
// {n} 处没跟你说 / {n} things I noticed this week and didn't say, until the
// next morning; it opens, under the note like 这周记下的, 我注意到、没说的 /
// Noticed, not said: what each thing would have said, the facts it joined
// (where each was read, its header, who it came from) and the day, with
// 应该早说 / 不该说 / 这类以后都别标. The home keeps each verdict once and
// decides from them alone what may be said next time; nothing is sent from
// here. The web's: apps/web/src/shadow-review.tsx.

import (
	"strconv"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// shadowState is the open review and what this app answered in it.
type shadowState struct {
	open     string // the note's key whose review is open
	got      map[string]string
	changing map[string]bool
	// order keeps the rows where they were while the card is open: an
	// answered row never jumps away under the pointer.
	order map[string]int
}

// shadowOffered reports whether the note's review line still shows (it
// fades at the next morning).
func (a *App) shadowOffered(n *protocol.Finds) bool {
	o := n.ShadowReview
	if o == nil || o.Count < 1 {
		return false
	}
	until, err := time.Parse(time.RFC3339Nano, o.Until)
	return err == nil && a.Now().Before(until)
}

// shadowLink is the note foot's link; it opens or closes the card.
func (a *App) shadowLink(c *ui.Context, key string, n *protocol.Finds) {
	label := a.L.T("shadow.link.one")
	if n.ShadowReview.Count > 1 {
		label = a.L.T("shadow.link", strconv.Itoa(n.ShadowReview.Count))
	}
	open := a.shadow.open == key
	chev := 1
	if open {
		chev = 2
	}
	if a.quietButton(c, key+":shadow-open", label, "", false, chev) {
		if open {
			a.shadow.open = ""
		} else {
			a.openShadow(key)
		}
	}
}

func (a *App) openShadow(key string) {
	a.shadow = shadowState{open: key, got: map[string]string{}, changing: map[string]bool{}, order: map[string]int{}}
	a.S.Shadow.Review, a.S.Shadow.Error = nil, ""
	a.send(protocol.ShadowReviewReq{T: "shadow_review"})
}

func (a *App) answerShadow(it protocol.ShadowItem, verdict string) {
	a.shadow.got[it.ID] = verdict
	delete(a.shadow.changing, it.ID)
	a.send(protocol.ShadowLabelReq{T: "shadow_label", FindingID: it.ID, Verdict: verdict})
}

// shadowRows are the home's items in the order they were first shown.
func (a *App) shadowRows() []protocol.ShadowItem {
	r := a.S.Shadow.Review
	if r == nil {
		return nil
	}
	ss := &a.shadow
	if ss.order == nil {
		ss.order = map[string]int{}
	}
	for _, it := range r.Items {
		if _, ok := ss.order[it.ID]; !ok {
			ss.order[it.ID] = len(ss.order)
		}
	}
	out := make([]protocol.ShadowItem, len(r.Items))
	copy(out, r.Items)
	for i := 1; i < len(out); i++ {
		for j := i; j > 0 && ss.order[out[j].ID] < ss.order[out[j-1].ID]; j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

// shadowSettled is the answer a row shows: given here just now, else the
// home's; "stopped" when another row stopped its kind.
func (a *App) shadowSettled(it protocol.ShadowItem, rows []protocol.ShadowItem) string {
	if a.shadow.changing[it.ID] {
		return ""
	}
	if g := a.shadow.got[it.ID]; g != "" {
		return g
	}
	if it.Verdict == "no" && it.Stopped {
		return "stop"
	}
	if it.Verdict != "" {
		return it.Verdict
	}
	if it.Stopped {
		return "stopped"
	}
	for _, o := range rows {
		if a.shadow.got[o.ID] == "stop" && o.Sort == it.Sort {
			return "stopped"
		}
	}
	return ""
}

func (a *App) shadowCard(c *ui.Context, key string) {
	t := a.T
	card := ui.Column(c.Key(key+":shadow-card")).Gap(t.S3).Padding(t.S4, t.S5).Radius(t.RadiusLG).Background(t.Surface).
		Shadow(0, t.Raised.Y, 0, 0, t.Raised.Color).Role(ui.RoleDialog).Label(a.L.T("shadow.title"))
	card.Children(func() {
		a.heading(c, a.L.T("shadow.title"), t.LG).TextColor(t.Ink)
		a.note(c, a.L.T("shadow.lede"))
		st := a.S.Shadow
		rows := a.shadowRows()
		switch {
		case st.Review == nil && st.Error != "":
			a.note(c, a.L.T("shadow.error"))
			if a.buttonFor(c, a.L.T("shadow.retry"), "", btnSecondary, t.ControlSM, t.Surface) {
				a.openShadow(key)
			}
			return
		case st.Review == nil:
			a.note(c, a.L.T("shadow.loading"))
			return
		case len(rows) == 0:
			a.note(c, a.L.T("shadow.none"))
			return
		}
		for i, it := range rows {
			if i > 0 {
				ui.Box(c).Height(1).Background(t.LineSoft)
			}
			a.shadowRow(c, it, rows)
		}
	})
}

func (a *App) shadowRow(c *ui.Context, it protocol.ShadowItem, rows []protocol.ShadowItem) {
	t := a.T
	key := "shadow:" + it.ID
	s := a.shadowSettled(it, rows)
	ink := t.Ink
	if s != "" {
		ink = t.InkSoft
	}
	ui.Column(c.Key(key)).Gap(t.S2).Padding(t.S2, 0).Children(func() {
		uiText(c, autospace(it.Text)).FontSize(t.MD).LineHeight(a.leading(1.45)).TextColor(ink)
		if it.Next != "" && s == "" {
			uiText(c, a.L.T("shadow.next", it.Next)).FontSize(t.SM).LineHeight(a.leading(1.45)).TextColor(t.InkSoft)
		}
		if len(it.Facts) > 0 {
			ui.Column(c).Gap(t.S1).Padding(t.S2, t.S3).Radius(t.RadiusMD).Background(t.SurfaceSunken).Children(func() {
				for _, f := range it.Facts {
					ui.Row(c).Gap(t.S3).AlignItems(ui.Start).MinWidth(0).Children(func() {
						uiText(c, a.L.T("find.src."+f.Src)).FontSize(t.XS).Bold().TextColor(t.InkMuted).MinWidth(44).Shrink(0)
						ui.Box(c).Grow(1).MinWidth(0).Children(func() {
							a.facts(c, t.SM, t.InkSoft, f.Label, f.From)
						})
					})
				}
			})
		}
		when := ""
		if at, err := time.Parse(time.RFC3339Nano, it.At); err == nil {
			when = a.day(at.Local())
		}
		said := ""
		if it.Said {
			said = a.L.T("shadow.said")
		}
		// The day on its own line; the answers on one row, right-aligned, never wrapping one away.
		a.facts(c, t.SM, t.InkMuted, when, said)
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			ui.Box(c).Grow(1)
			if s != "" {
				word := "shadow.got." + s
				if s == "stopped" {
					word = "shadow.stopped"
				}
				a.markIn(c, drawCheck, t.Done.Ink, a.L.T(word), t.Done.Ink)
				if s != "stopped" && a.quietButton(c, key+":change", a.L.T("shadow.change"), it.Text, false, 0) {
					a.shadow.changing[it.ID] = true
				}
				return
			}
			if a.quietButton(c, key+":stop", a.L.T("shadow.stop"), it.Text, false, 0) {
				a.answerShadow(it, "stop")
			}
			if a.quietButton(c, key+":no", a.L.T("shadow.no"), it.Text, true, 0) {
				a.answerShadow(it, "no")
			}
			if a.buttonFor(c, a.L.T("shadow.yes"), it.Text, btnSecondary, t.ControlSM, t.Surface) {
				a.answerShadow(it, "yes")
			}
		})
	})
}
