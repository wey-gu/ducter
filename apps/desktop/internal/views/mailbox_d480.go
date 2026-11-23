package views

import (
	"strconv"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D480, D489: an agent's answers reach it once its Nowledge Mem mailbox is open, offered in place under
// the agent's row (the web's HearBack in memory.tsx). Nowledge Mem's Bridge needs an explicit Space and
// never picks one silently, so the person's real Spaces are the choices: the suggested one (the Space
// the partner already listens in) said in the offer's one line, the others one quiet tap away; the
// person's one tap opens it there. Never a typed name.

// mailboxChoice is the choice open under one agent's row.
type mailboxChoice struct {
	Device, Harness string
	// Look is what that computer's Mem said (nil while it looks).
	Look *protocol.MailboxLook
	// Pick is the Space chosen so far (the suggested one first); More: the other Spaces shown.
	Pick string
	More bool
}

// chooseMailbox opens the choice under that agent's row and asks that computer's Mem (read only).
func (a *App) chooseMailbox(device, harness string) {
	a.mailboxChoosing = &mailboxChoice{Device: device, Harness: harness}
	a.send(protocol.MailboxLookReq{T: "mailbox_look", Device: device, Harness: harness})
}

// mailboxLooked is mailbox_look's answer, for the row still open (a later tap elsewhere wins).
func (a *App) mailboxLooked(f protocol.ServerFrame) {
	c := a.mailboxChoosing
	if c == nil || c.Device != f.Device || c.Harness != f.Harness || f.Look == nil {
		return
	}
	c.Look = f.Look
	if c.Pick == "" {
		c.Pick = f.Look.Recommend // never the first by default: Mem picks no Space, nor does Ducter
	}
}

// spaceName is a Space as the person reads it: Mem's personal and everyone Spaces in Ducter's words, a team's by its own name.
func (a *App) spaceName(s protocol.MailboxSpace) string {
	switch s.Kind {
	case "personal":
		return a.L.T("mailbox.space.personal")
	case "commons":
		return a.L.T("mailbox.space.everyone")
	}
	return s.Label
}

// spaceReaders is who can read a Space's mail, under its name (the partner's own Space says it listens there).
func (a *App) spaceReaders(s protocol.MailboxSpace) string {
	switch {
	case s.Partner:
		return a.L.T("mailbox.listens")
	case s.Kind == "personal":
		return a.L.T("mailbox.readers.you")
	case s.Readers > 0:
		return a.L.T("mailbox.readers", strconv.Itoa(s.Readers))
	}
	return ""
}

// spaceIn is where the answers will go, in one line: the Space and who can read it (D489).
func (a *App) spaceIn(s protocol.MailboxSpace) string {
	switch {
	case s.Kind == "personal":
		return a.L.T("mailbox.in.you", a.spaceName(s))
	case s.Readers > 0:
		return a.L.T("mailbox.in.some", a.spaceName(s), strconv.Itoa(s.Readers))
	}
	return a.L.T("mailbox.in", a.spaceName(s))
}

// hearBack is D489's offer under an agent whose answers can't reach it (D480's choice, one tap):
// where they will go (the Space Ducter suggests, read from that computer's own Mem, read only) and who
// can read it in one line, 让它收到回话 / Let it hear back (the tap is the Go, with that Space), and
// 换一个空间 / Another Space, quiet, for the real list. Mem never picks a Space; without a suggestion
// the list is open and the person picks first. Never a typed name.
func (a *App) hearBack(c *ui.Context, r reachRow) {
	t := a.T
	ch := a.mailboxChoosing
	mine := ch != nil && ch.Device == r.Device && ch.Harness == r.Harness
	where := r.DeviceName
	if where == "" {
		where = r.Device
	}
	line := func(s string, control func()) {
		ui.Row(c.Key("hear-line")).Gap(t.S3).Wrap().AlignItems(ui.Center).Children(func() {
			uiText(c, keepWords(autospace(s))).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkSoft).Grow(1).Basis(rowWordsMin).MinWidth(0)
			if control != nil {
				ui.Row(c).Shrink(0).Gap(t.S2).AlignItems(ui.Center).Children(control)
			}
		})
	}
	if !mine {
		line(a.L.T("mailbox.ask", where), func() {
			if a.buttonFor(c, a.L.T("peers.fix.hear"), r.Tool, btnSecondary, t.ControlSM, t.Surface) {
				a.chooseMailbox(r.Device, r.Harness)
			}
		})
		return
	}
	look := ch.Look
	if look == nil {
		line(a.L.T("mailbox.looking", where), nil)
		return
	}
	if look.State != "choose" || len(look.Spaces) == 0 {
		k := look.State
		if k == "choose" {
			k = "failed"
		}
		var again func()
		if k != "old" {
			again = func() {
				if a.buttonFor(c, a.L.T("mailbox.again"), r.Tool, btnText, t.ControlSM, t.Surface) {
					a.chooseMailbox(r.Device, r.Harness)
				}
			}
		}
		line(a.L.T("mailbox."+k, where), again)
		return
	}
	var rec, pick *protocol.MailboxSpace
	for i := range look.Spaces {
		if look.Spaces[i].ID == look.Recommend {
			rec = &look.Spaces[i]
		}
		if look.Spaces[i].ID == ch.Pick {
			pick = &look.Spaces[i]
		}
	}
	if pick == nil {
		pick = rec
	}
	offer := func() {
		if pick == nil {
			line(a.L.T("mailbox.pick"), nil)
			return
		}
		p := *pick
		line(a.spaceIn(p), func() {
			if a.buttonFor(c, a.L.T("peers.fix.hear"), r.Tool, btnSecondary, t.ControlSM, t.Surface) {
				a.openMailbox(r.Device, r.Harness, &protocol.MailboxSpaceRef{ID: p.ID, Label: p.Label})
			}
		})
	}
	if rec != nil && !ch.More {
		offer()
		// At the text's start edge, as the web's: a row keeps the quiet link its own width.
		ui.Row(c.Key("mb-more")).Children(func() {
			if a.buttonFor(c, a.L.T("mailbox.other"), r.Tool, btnText, t.ControlSM, t.Surface) {
				ch.More = true
			}
		})
		return
	}
	// Open, the list comes first and the offer follows it, saying the Space picked.
	defer offer()
	ui.Column(c.Key("mb-list")).Gap(2).Role(ui.RoleRadioGroup).Label(a.L.T("mailbox.title")).Children(func() {
		for _, s := range look.Spaces {
			s := s
			who := a.spaceReaders(s)
			label := a.spaceName(s)
			if who != "" {
				label += ", " + who
			}
			on := pick != nil && s.ID == pick.ID
			if a.menuRow(c, "mb:"+s.ID, label, on, false, func() {
				ui.Row(c).Grow(1).MinWidth(0).Gap(t.S2).AlignItems(ui.Center).Children(func() {
					uiText(c, a.spaceName(s)).FontSize(t.SM).FontWeight(600).TextColor(t.Ink).SingleLine()
					if rec != nil && s.ID == rec.ID {
						a.suggestedTag(c)
					}
				})
				if who != "" {
					uiText(c, who).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(0)
				}
			}) {
				ch.Pick = s.ID
			}
		}
	})
}
