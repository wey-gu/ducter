package views

import (
	"strconv"
	"time"

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
				uiText(c, autospace(n.Opening)).Selectable().FontSize(t.PartnerSize).LineHeight(leadingFor(n.Opening, 1.5)).TextColor(t.OnPartnerBubble)
			}
			for i, f := range n.Finds {
				if i > 0 || n.Opening != "" {
					ui.Box(c).Height(1).Background(t.LineSoft).Margin(t.S1, 0)
				}
				a.findBlock(c, f, e.Event.Seq)
			}
			a.noteAsk(c, n)
		})
		a.learnedLine(c, key, n) // D304: the week's offer, 这周记下的
		// D300: under the morning note, one quiet line to what was done for you.
		if n.Rung == "morning" && !n.Quiet {
			ui.Row(c.Key("did-line")).Padding(0, t.S4-2).Children(func() { a.didLink(c, "did-morning:"+key) })
		}
	})
}

func (a *App) findBlock(c *ui.Context, f protocol.FindView, seq int64) {
	t := a.T
	st := a.S.FindStates[f.FindID]
	// D236: each find can be replied to on its own; found, its own tint deepens.
	rt := &replyTo{seq: seq, findID: f.FindID, from: "partner", quote: f.Text}
	col := ui.Column(c.Key("find:" + f.FindID)).Gap(t.S1).Radius(t.RadiusSM)
	hov := col.Hovered() || a.rp.held == rt.key()
	if k := a.foundAt(c, seq, f.FindID); k > 0 {
		col.Background(t.PartnerBubble.Mix(t.Reply.FoundPartner, k))
	}
	col.Children(func() {
		uiText(c, a.L.T("kind."+f.Kind)).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted)
		// D256: the find's words, and its pebble outside the note card in the
		// gutter, resting on their last line; never on the card. The bridge
		// (transparent, from the card's edge to the pebble) keeps the hover
		// while the pointer crosses the card's inset.
		ui.Column(c.Key("words:" + f.FindID)).Children(func() {
			ft := uiText(c, autospace(f.Text)).Selectable().FontSize(t.PartnerSize).LineHeight(leadingFor(f.Text, 1.5)).TextColor(t.OnPartnerBubble)
			a.replyMenu(c, ft, rt, f.Text)
			out := t.S4 - 2 + a.pebbleGap()
			// Wide enough for the pebble with its word; it grows away from the card.
			reach := out + pebbleSize + 72
			ui.Row(c.Key("bridge:"+f.FindID)).Absolute().Right(-reach).Bottom(-2).Width(reach).Height(pebbleSize).Padding(0, 0, 0, out).
				Justify(ui.Start).AlignItems(ui.Center).AccessHidden(!hov).Children(func() {
				if hov {
					a.replyButton(c, rt, 1)
				}
			})
		})
		// D403: after 撤回 or a failed send, the find's Go is asked again under a new decision.
		did := f.DecisionID
		if x := a.S.FindAsks[f.FindID]; x != "" {
			did = x
		}
		send := a.S.FindSends[f.FindID]
		d := a.S.Decisions[did]
		drafted := f.Draft != nil && d != nil && (st == nil || st.State != "passed") && (send != nil || openAsk(d) || d.Pending == "go" || (d.Resolved != nil && d.Resolved.Option == "go"))
		if drafted {
			a.findDraft(c, f, d, send)
		}
		if d != nil && !drafted {
			switch {
			case st != nil && st.State == "passed":
				uiText(c, a.L.T("find.passed")).FontSize(t.SM).TextColor(t.InkMuted)
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
				uiText(c, a.L.T("find.going")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
			default:
				uiText(c, a.L.T("find.held")).FontSize(t.SM).TextColor(t.InkMuted)
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
				uiText(c, a.L.T("find.muted")).FontSize(t.SM).TextColor(t.InkSoft)
			case st != nil && st.State == "useful":
				uiText(c, a.L.T("find.thanked")).FontSize(t.SM).TextColor(t.InkSoft)
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
				// D388: each line is one source, in the order the find rests on
				// them: where it was read, what it is, what it says, its page.
				for i, h := range f.How {
					ui.Row(c.Key("h" + itoa(int64(i)))).Gap(t.S2).Children(func() {
						if h.Src != "" {
							uiText(c, a.L.T("find.src."+h.Src)).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).Shrink(0)
						}
						uiText(c, a.whenOf(h.At)).FontSize(t.SM).TextColor(t.InkMuted).Shrink(0)
						if h.From != "" {
							uiText(c, h.From).FontSize(t.SM).TextColor(t.InkMuted).Shrink(0).MaxWidth(160).SingleLine()
						}
						if h.URL != "" {
							if a.quietButton(c, "hl:"+f.FindID+itoa(int64(i)), h.What, "", false, 0) {
								c.OpenURL(h.URL)
							}
						} else {
							uiText(c, h.What).FontSize(t.SM).TextColor(t.InkSoft).Shrink(1).MinWidth(0).MaxLines(2)
						}
						if h.Says != "" {
							uiText(c, h.Says).FontSize(t.SM).TextColor(t.Ink).Grow(1).MinWidth(0).MaxLines(2)
						}
					})
				}
				if f.Unknown != "" {
					uiText(c, a.L.T("find.unknown", f.Unknown)).FontSize(t.SM).TextColor(t.InkMuted)
				}
				if f.Untouched != "" {
					uiText(c, f.Untouched).FontSize(t.SM).TextColor(t.InkMuted)
				}
			})
		}
	})
}

// noteAsk is the one question a note may carry, with the shared controls.
func (a *App) noteAsk(c *ui.Context, n *protocol.Finds) {
	t := a.T
	switch n.Ask {
	case "first_look", "keep_note", "note_again":
		yes, no := "first.go", "first.no"
		if n.Ask == "keep_note" {
			yes, no = "note.keep", "note.no_more"
		} else if n.Ask == "note_again" { // D250: the morning note offered back once
			yes, no = "note.again_yes", "note.again_no"
		}
		if n.Answered != "" {
			label := a.L.T(no)
			if n.Answered == "yes" {
				label = a.L.T(yes)
			}
			uiText(c, a.L.T("note.answered", label)).FontSize(t.SM).TextColor(t.InkMuted)
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
		uiText(c, autospace(a.L.T("first.ask"))).FontSize(t.PartnerSize).LineHeight(1.5).TextColor(t.OnPartnerBubble)
		if n.Answered != "" {
			uiText(c, a.L.T("first.chosen", a.L.T("proactive."+n.Answered))).FontSize(t.SM).TextColor(t.InkMuted)
			return
		}
		a.proactiveChips(c, "note-"+n.NoteID)
	}
}

// findDraft is a 在等你回 find's reply, already written (D403): who it goes
// to, the words in a sunken well (a field while its Go is open), what to
// check first, then 发出去 · 先等等; after Go, the 30-second line with 撤回,
// then 已发给 {name}.
func (a *App) findDraft(c *ui.Context, f protocol.FindView, d *store.DecisionState, send *protocol.FindState) {
	t := a.T
	dr := f.Draft
	key := "draft:" + f.FindID
	text, ok := a.replyDraft[key]
	if !ok {
		text = dr.Text
	}
	open := openAsk(d)
	ui.Column(c.Key(key)).Gap(t.S1 + 2).Children(func() {
		uiText(c, a.L.T("draft.to", dr.To)).FontSize(t.SM).TextColor(t.InkMuted)
		if open {
			ui.TextArea(c.Key("draft-text:"+f.FindID), &text).Lines(2, 16).Label(a.L.T("draft.edit", dr.To)).
				Background(t.Sunken).Border(1, t.LineSoft).Radius(t.RadiusSM).Padding(t.S2, t.S3).FontSize(t.PartnerSize).TextColor(t.Ink)
		} else {
			ui.Box(c.Key("draft-well:"+f.FindID)).Background(t.Sunken).Radius(t.RadiusSM).Padding(t.S2, t.S3).Children(func() {
				uiText(c, text).Selectable().FontSize(t.PartnerSize).LineHeight(leadingFor(text, 1.5)).TextColor(t.InkSoft)
			})
		}
		if open && dr.Check != "" {
			uiText(c, a.L.T("draft.check", dr.Check)).FontSize(t.SM).TextColor(t.InkMuted)
		}
		switch {
		case open:
			if send != nil && send.State == "send_failed" {
				k := "draft.failed"
				if send.Error == "no_send" {
					k = "draft.no_send"
				}
				uiText(c, a.L.T(k)).FontSize(t.SM).TextColor(t.InkMuted)
			}
			ui.Row(c.Key("draft-step:" + f.FindID)).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				label := f.GoLabel
				if label == "" {
					label = a.L.T("draft.send")
				}
				if a.buttonFor(c, a.L.T("decision.go.label", label), dr.To, btnSecondary, t.ControlSM, t.PartnerBubble) && text != "" {
					a.Decide(d.DecisionID, "go", text)
				}
				if a.buttonFor(c, a.holdLabel(d), "", btnText, t.ControlSM, t.PartnerBubble) {
					a.Decide(d.DecisionID, "hold", "")
				}
			})
		case send != nil && send.State == "sending":
			left := 0
			if at, err := time.Parse(time.RFC3339Nano, send.Until); err == nil {
				left = int((at.Sub(a.Now()) + time.Second - 1) / time.Second)
				if left < 0 {
					left = 0
				}
				c.After(time.Second)
			}
			ui.Row(c.Key("draft-undo:" + f.FindID)).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				uiText(c, a.L.T("draft.sending", strconv.Itoa(left))).FontSize(t.SM).TextColor(t.InkMuted)
				if a.buttonFor(c, a.L.T("draft.undo"), dr.To, btnText, t.ControlSM, t.PartnerBubble) {
					a.send(protocol.FindUndo{T: "find_undo", FindID: f.FindID})
				}
			})
		case send != nil && send.State == "sent":
			uiText(c, a.L.T("draft.sent", dr.To)).FontSize(t.SM).TextColor(t.InkMuted)
		}
	})
	a.replyDraft[key] = text
}
