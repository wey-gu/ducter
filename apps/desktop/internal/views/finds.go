package views

import (
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// A note the partner said by itself (D165, design/connectors.md §6): one
// partner message. Its opening line says what it looked at; then up to
// three finds, each its kind in small letters, at most two sentences, its
// one next step (好，<action> · 先等等, never run without Go), and one row
// with 怎么知道的 › (the evidence, in place) and 有用 · 这类不用告诉我;
// then the 没说的 line. A note may carry one ask: 好，看一眼 · 先不用, the
// proactive chips themselves, or 要 · 不用了. Only shared controls.

func (a *App) findsEntry(c *ui.Context, e *store.Entry) {
	t := a.T
	n := e.Finds
	key := "note:" + itoa(e.FirstSeq)
	ui.Column(c.Key(key)).Gap(t.S1).Children(func() {
		a.partnerBubble(c, a.takeJoin(), func() {
			if n.Opening != "" {
				ui.Text(c, autospace(n.Opening)).Selectable().FontSize(t.PartnerSize).LineHeight(leadingFor(n.Opening, 1.5)).TextColor(t.OnPartnerBubble)
			}
			for i, f := range n.Finds {
				if i > 0 || n.Opening != "" {
					ui.Box(c).Height(1).Background(t.LineSoft).Margin(t.S1, 0)
				}
				a.findBlock(c, f)
			}
			if n.LeftOut != "" {
				ui.Box(c).Height(1).Background(t.LineSoft).Margin(t.S1, 0)
				ui.Text(c, autospace(n.LeftOut)).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5)
			}
			a.noteAsk(c, n)
		})
	})
}

func (a *App) findBlock(c *ui.Context, f protocol.FindView) {
	t := a.T
	st := a.S.FindStates[f.FindID]
	ui.Column(c.Key("find:" + f.FindID)).Gap(t.S1).Children(func() {
		ui.Text(c, a.L.T("kind."+f.Kind)).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted)
		ui.Text(c, autospace(f.Text)).Selectable().FontSize(t.PartnerSize).LineHeight(leadingFor(f.Text, 1.5)).TextColor(t.OnPartnerBubble)
		if d := a.S.Decisions[f.DecisionID]; d != nil {
			switch {
			case st != nil && st.State == "passed":
				ui.Text(c, a.L.T("find.passed")).FontSize(t.SM).TextColor(t.InkMuted)
			case openAsk(d):
				ui.Row(c.Key("step:" + f.FindID)).Gap(t.S2).AlignItems(ui.Center).Children(func() {
					if a.buttonFor(c, a.L.T("decision.go.label", f.GoLabel), "", btnSecondary, t.ControlSM, t.PartnerBubble) {
						a.Decide(d.DecisionID, "go", "")
					}
					if a.buttonFor(c, a.holdLabel(d), "", btnText, t.ControlSM, t.PartnerBubble) {
						a.Decide(d.DecisionID, "hold", "")
					}
				})
			case st != nil && st.State == "go":
				ui.Text(c, a.L.T("find.going")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
			default:
				ui.Text(c, a.L.T("find.held")).FontSize(t.SM).TextColor(t.InkMuted)
			}
		}
		open := a.open["how:"+f.FindID]
		ui.Row(c.Key("react:" + f.FindID)).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			if a.quietButton(c, "how:"+f.FindID, a.L.T("find.how"), "", false, map[bool]int{false: 1, true: 2}[open]) {
				a.open["how:"+f.FindID] = !open
			}
			ui.Box(c).Grow(1)
			switch {
			case st != nil && st.State == "muted":
				ui.Text(c, a.L.T("find.muted")).FontSize(t.SM).TextColor(t.InkSoft)
			case st != nil && st.State == "useful":
				ui.Text(c, a.L.T("find.thanked")).FontSize(t.SM).TextColor(t.InkSoft)
			default:
				if a.quietButton(c, "useful:"+f.FindID, a.L.T("find.useful"), f.Text, false, 0) {
					a.send(protocol.FindReact{T: "find_react", FindID: f.FindID, Reaction: "useful"})
				}
				if a.quietButton(c, "mute:"+f.FindID, a.L.T("find.mute"), f.Text, false, 0) {
					a.send(protocol.FindReact{T: "find_react", FindID: f.FindID, Reaction: "mute"})
				}
			}
		})
		if open {
			ui.Column(c.Key("howlist:" + f.FindID)).Gap(2).Children(func() {
				for i, h := range f.How {
					ui.Row(c.Key("h" + itoa(int64(i)))).Gap(t.S2).Children(func() {
						ui.Text(c, a.whenOf(h.At)).FontSize(t.SM).TextColor(t.InkMuted).Shrink(0)
						ui.Text(c, h.What).FontSize(t.SM).TextColor(t.InkSoft).Grow(1).MinWidth(0).MaxLines(2)
					})
				}
			})
		}
	})
}

// noteAsk is the one question a note may carry, with the shared controls.
func (a *App) noteAsk(c *ui.Context, n *protocol.Finds) {
	t := a.T
	switch n.Ask {
	case "first_look", "keep_note":
		yes, no := "first.go", "first.no"
		if n.Ask == "keep_note" {
			yes, no = "note.keep", "note.no_more"
		}
		if n.Answered != "" {
			label := a.L.T(no)
			if n.Answered == "yes" {
				label = a.L.T(yes)
			}
			ui.Text(c, a.L.T("note.answered", label)).FontSize(t.SM).TextColor(t.InkMuted)
			return
		}
		ui.Row(c.Key("ask:" + n.NoteID)).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			if a.buttonFor(c, a.L.T(yes), n.Opening, btnSecondary, t.ControlSM, t.PartnerBubble) {
				a.send(protocol.ProactiveAnswer{T: "proactive_answer", NoteID: n.NoteID, Ask: n.Ask, Yes: true})
			}
			if a.buttonFor(c, a.L.T(no), n.Opening, btnText, t.ControlSM, t.PartnerBubble) {
				a.send(protocol.ProactiveAnswer{T: "proactive_answer", NoteID: n.NoteID, Ask: n.Ask, Yes: false})
			}
		})
	case "cadence":
		ui.Box(c).Height(1).Background(t.LineSoft).Margin(t.S1, 0)
		ui.Text(c, autospace(a.L.T("first.ask"))).FontSize(t.PartnerSize).LineHeight(1.5).TextColor(t.OnPartnerBubble)
		if n.Answered != "" {
			ui.Text(c, a.L.T("first.chosen", a.L.T("proactive."+n.Answered))).FontSize(t.SM).TextColor(t.InkMuted)
			return
		}
		a.proactiveChips(c, "note-"+n.NoteID)
	}
}
