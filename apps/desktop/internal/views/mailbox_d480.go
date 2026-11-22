package views

import (
	"strconv"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D480: 打开它的信箱 / Open its mailbox, in place under the agent's link row (the web's
// MailboxChoice in memory.tsx). Nowledge Mem's Bridge needs an explicit Space and never picks one
// silently, so the person's real Spaces are the choices, the suggested one (the Space the partner
// already listens in) chosen and said why in one line, the others one tap away; one tap opens it.
// Never a typed name. When the agent's computer talks to another Mem server than the partner's, the
// fix for that instead (no Space would help).

// mailboxChoice is the choice open under one agent's row.
type mailboxChoice struct {
	Device, Harness string
	// Look is what that computer's Mem said (nil while it looks).
	Look *protocol.MailboxLook
	// Pick is the Space chosen so far (the suggested one first); More: the other Spaces shown.
	Pick string
	More bool
	// Link is the connect prompt pasted for the same-Mem fix (never sent anywhere else).
	Link string
}

// apartOf is the rows whose computer talks to another Mem server than the partner's.
func apartOf(rows []reachRow) []reachRow {
	var out []reachRow
	for _, r := range rows {
		if r.Theirs != "" && r.Ours != "" {
			out = append(out, r)
		}
	}
	return out
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
		c.Pick = f.Look.Recommend
		if c.Pick == "" && len(f.Look.Spaces) > 0 {
			c.Pick = f.Look.Spaces[0].ID
		}
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

// mailboxChoice draws the choice under the row, set in from the coin like its why line.
func (a *App) mailboxChoice(c *ui.Context, r reachRow, where string) {
	t := a.T
	ch := a.mailboxChoosing
	look := ch.Look
	sheet := ui.Column(c.Key("mb-choice")).Gap(t.S2).Padding(t.S3, t.S3).Radius(t.RadiusSM).Background(t.Bg).Border(1, t.LineSoft).
		Margin(0, 0, 0, 96+t.S3).Role(ui.RoleGroup).Label(a.L.T("mailbox.title"))
	lede := func(s string) {
		uiText(c, keepWords(autospace(s))).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkSoft)
	}
	not := func() {
		if a.buttonFor(c, a.L.T("mailbox.not"), r.Tool, btnText, t.ControlSM, t.Bg) {
			a.mailboxChoosing = nil
		}
	}
	sheet.Children(func() {
		switch {
		case look == nil:
			lede(a.L.T("mailbox.looking", where))
		case look.State == "apart" && look.Theirs != "" && look.Ours != "":
			uiText(c, a.L.T("mailbox.same.title")).FontSize(t.SM).FontWeight(700).TextColor(t.Ink)
			lede(a.L.T("mailbox.same.how", where, look.Ours))
			lede(a.L.T("mailbox.same.then", where, look.Ours, look.Theirs))
			v := ch.Link
			ui.TextArea(c.Key("mb-link"), &v).Lines(2, 4).Placeholder(a.L.T("wmem.signin.ph")).Label(a.L.T("wmem.signin.link")).
				FontSize(t.SM).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.SurfaceSunken).Border(1, t.LineSoft)
			ch.Link = v
			ui.Row(c.Key("mb-acts")).Gap(t.S2).Wrap().AlignItems(ui.Center).Children(func() {
				if a.buttonFor(c, a.L.T("mailbox.same.go"), where, btnPrimary, t.ControlSM, t.Bg) && strings.TrimSpace(v) != "" {
					a.wm.answer = nil
					a.send(protocol.MemSetupReq{T: "mem_setup", Device: r.Device, Action: "connect", Link: strings.TrimSpace(v)})
					a.mailboxChoosing = nil
				}
				not()
			})
		case look.State != "choose" || len(look.Spaces) == 0:
			k := look.State
			if k == "choose" {
				k = "failed"
			}
			lede(a.L.T("mailbox."+k, where))
			ui.Row(c.Key("mb-acts")).Gap(t.S2).Wrap().AlignItems(ui.Center).Children(func() {
				if k != "old" && a.buttonFor(c, a.L.T("mailbox.again"), r.Tool, btnSecondary, t.ControlSM, t.Bg) {
					a.chooseMailbox(r.Device, r.Harness)
				}
				not()
			})
		default:
			a.mailboxSpaces(c, r, ch, look)
		}
	})
}

// mailboxSpaces is the question, the partner's reason for the suggested Space, the Spaces as radio
// rows (the suggested one and the chosen one, the rest one tap away), and one tap to open it there.
func (a *App) mailboxSpaces(c *ui.Context, r reachRow, ch *mailboxChoice, look *protocol.MailboxLook) {
	t := a.T
	var rec *protocol.MailboxSpace
	for i := range look.Spaces {
		if look.Spaces[i].ID == look.Recommend {
			rec = &look.Spaces[i]
		}
	}
	pick := look.Spaces[0]
	if rec != nil {
		pick = *rec
	}
	for _, s := range look.Spaces {
		if s.ID == ch.Pick {
			pick = s
		}
	}
	uiText(c, a.L.T("mailbox.title")).FontSize(t.SM).FontWeight(700).TextColor(t.Ink)
	if rec != nil {
		k := "mailbox.why.personal"
		if rec.Partner {
			k = "mailbox.why.partner"
		}
		uiText(c, keepWords(autospace(a.L.T(k, a.spaceName(*rec))))).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkSoft)
	}
	shown := 0
	ui.Column(c.Key("mb-list")).Gap(2).Role(ui.RoleRadioGroup).Label(a.L.T("mailbox.title")).Children(func() {
		for _, s := range look.Spaces {
			if !ch.More && rec != nil && s.ID != rec.ID && s.ID != pick.ID {
				continue
			}
			shown++
			s := s
			who := a.spaceReaders(s)
			label := a.spaceName(s)
			if who != "" {
				label += ", " + who
			}
			if a.menuRow(c, "mb:"+s.ID, label, s.ID == pick.ID, false, func() {
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
	if rec != nil && !ch.More && shown < len(look.Spaces) {
		// At the list's start edge, as the web's: a row keeps the text button its own width.
		ui.Row(c.Key("mb-more")).Children(func() {
			if a.buttonFor(c, a.L.T("mailbox.more"), r.Tool, btnText, t.ControlSM, t.Bg) {
				ch.More = true
			}
		})
	}
	ui.Row(c.Key("mb-acts")).Gap(t.S2).Wrap().AlignItems(ui.Center).Padding(t.S1, 0, 0, 0).Children(func() {
		if a.buttonFor(c, a.L.T("mailbox.go", a.spaceName(pick)), r.Tool, btnPrimary, t.ControlSM, t.Bg) {
			a.openMailbox(r.Device, r.Harness, &protocol.MailboxSpaceRef{ID: pick.ID, Label: pick.Label})
		}
		if a.buttonFor(c, a.L.T("mailbox.not"), r.Tool, btnText, t.ControlSM, t.Bg) {
			a.mailboxChoosing = nil
		}
	})
}
