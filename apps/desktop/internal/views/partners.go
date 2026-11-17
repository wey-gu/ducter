package views

// D309: 伙伴们 / Your partners (design/personas.md), the same as the web's
// (apps/web/src/partners.tsx). With one partner nothing here shows. With
// more, the conversation bar's face sits on its partner's own clay stone,
// the others sit beside the name as small stones (a dot when one has
// something waiting), and a click on one shows its conversation. Settings
// › 伙伴 lists them, changes a look and adds one (a name and a colour).

import (
	"fmt"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// partnersUI is the add form's own state.
type partnersUI struct {
	adding  bool
	name    string
	look    string
	focused bool
	cid     string
}

// manyPartners: more than one partner, so the bar shows whose this is.
func (a *App) manyPartners() bool { return len(a.S.Partners) > 1 }

// shownPartnerID is the partner this window shows.
func (a *App) shownPartnerID() string {
	if a.S.Persona != "" {
		return a.S.Persona
	}
	if p := a.Local.Partner(); p != "" {
		return p
	}
	return protocol.DefaultPartner
}

// shownPartner is the shown partner as the partners frame says it (nil with one).
func (a *App) shownPartner() *protocol.PartnerInfo {
	if !a.manyPartners() {
		return nil
	}
	id := a.shownPartnerID()
	for i := range a.S.Partners {
		if a.S.Partners[i].ID == id {
			return &a.S.Partners[i]
		}
	}
	return nil
}

// defaultName is the default partner's name (the one Settings › 伙伴
// renames), whoever is shown.
func (a *App) defaultName() string {
	for _, p := range a.S.Partners {
		if p.ID == protocol.DefaultPartner {
			return p.Name
		}
	}
	if st := a.S.Settings; st != nil && st.Name != "" {
		return st.Name
	}
	return a.S.PersonaName
}

// needsAcross is the one needs-you count across partners (D309): On hand
// is everyone's already, the shown conversation's questions are counted
// here, and every other partner's own questions join them.
func (a *App) needsAcross(b store.Board) int {
	return protocol.NeedsAcross(len(b.Lanes[store.LaneNeedsYou])+len(a.partnerDecisions()), a.S.Partners, a.shownPartnerID())
}

// SwitchPartner shows another partner's conversation: the window starts
// over on it with a new hello; the next launch and reconnects keep it.
func (a *App) SwitchPartner(id string) {
	if id == a.shownPartnerID() {
		return
	}
	name := ""
	for _, p := range a.S.Partners {
		if p.ID == id {
			name = p.Name
		}
	}
	if name == "" {
		return
	}
	partners := a.S.Partners
	a.Local.SetPartner(id)
	a.forgetShown()
	a.S.Partners, a.S.PersonaName = partners, name
	a.Route = RouteConversation
	persona := id
	if id == protocol.DefaultPartner {
		persona = ""
	}
	a.send(protocol.Hello{T: "hello", Persona: persona, Locale: string(a.L.Lang), TZ: localZone(), Client: "desktop"})
}

// PartnerFor is the persona a hello asks for (main.go's client reads it at
// each connect): "" for the default.
func (a *App) PartnerFor() string { return a.Local.Partner() }

// stone is a partner's look: its clay face on its own colour.
func (a *App) stone(c *ui.Context, key, look string, size float32) ui.Element {
	t := a.T
	bg, ok := t.Looks[look]
	if !ok {
		bg = t.Looks["sand"]
	}
	box := ui.Box(c.Key("stone:"+key)).Size(size, size).Radius(size/2).Background(bg).Border(1, t.LookRim).Clip().
		AlignItems(ui.Center).Justify(ui.End).Shrink(0)
	box.Children(func() { a.partnerFace(c, "stone-"+key, theme.Idle, size*0.8) })
	return box
}

// otherAsks (D312) is every other partner's own open questions, which On
// hand lists (the shown partner's are in its conversation).
func (a *App) otherAsks() []protocol.PartnerAsk {
	if !a.manyPartners() || a.S.OnHand == nil {
		return nil
	}
	shown := a.shownPartnerID()
	var out []protocol.PartnerAsk
	for _, x := range a.S.OnHand.Asks {
		if x.Persona == shown || a.partnerByID(x.Persona) == nil {
			continue
		}
		out = append(out, x)
	}
	return out
}

func (a *App) partnerByID(id string) *protocol.PartnerInfo {
	for i := range a.S.Partners {
		if a.S.Partners[i].ID == id {
			return &a.S.Partners[i]
		}
	}
	return nil
}

// partnerMark (D312) is whose a task is, on its On hand row or card, once
// there is more than one partner: its partner's small stone.
func (a *App) partnerMark(c *ui.Context, key, persona string) {
	if !a.manyPartners() {
		return
	}
	p := a.partnerByID(persona)
	if p == nil {
		p = a.partnerByID(protocol.DefaultPartner)
	}
	if p == nil {
		return
	}
	ui.Box(c.Key("mark:" + key)).Shrink(0).Role(ui.RoleImage).Label(p.Name).Tooltip(p.Name).Children(func() {
		a.stone(c, "mark-"+key, p.Look, 18)
	})
}

// otherAskRow (D312) is another partner's own question in On hand: a click
// shows that partner's conversation, where it is answered.
func (a *App) otherAskRow(c *ui.Context, x protocol.PartnerAsk) {
	t := a.T
	p := a.partnerByID(x.Persona)
	if p == nil {
		return
	}
	label := a.L.T("partners.switch", p.Name)
	row := ui.Row(c.Key("oask:"+x.DecisionID)).Gap(t.S3).Padding(t.S3, t.S4).Radius(t.RadiusMD).Background(t.Surface).Border(1, t.LookRim).
		AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(label).Tooltip(label).Focusable()
	if row.Hovered() {
		row.Background(t.Surface.Mix(t.Ink, 0.03))
	}
	row.Children(func() {
		a.stone(c, "oask-"+x.DecisionID, p.Look, 32)
		ui.Column(c.Key("w")).Gap(2).Grow(1).Shrink(1).MinWidth(0).Children(func() {
			ui.Text(c, a.L.T("partners.asks.from", p.Name)).FontSize(t.XS).TextColor(t.InkSoft)
			ui.Text(c, x.Question).FontSize(14).TextColor(t.Ink).MaxLines(2)
		})
	})
	if row.Clicked() {
		a.SwitchPartner(x.Persona)
	}
}

// partnerSwitch is the other partners beside the name in the bar.
func (a *App) partnerSwitch(c *ui.Context) {
	if !a.manyPartners() {
		return
	}
	t := a.T
	shown := a.shownPartnerID()
	ui.Row(c.Key("partner-switch")).Gap(t.S2).AlignItems(ui.Center).Shrink(0).Role(ui.RoleGroup).Label(a.L.T("partners.title")).Children(func() {
		for _, p := range a.S.Partners {
			if p.ID == shown {
				continue
			}
			label := a.L.T("partners.switch", p.Name)
			if p.Asks > 0 {
				label = a.L.T("partners.switch.asks", p.Name, p.Asks)
			}
			id := p.ID
			b := ui.Box(c.Key("pick:"+p.ID)).Padding(2, 2).Radius(18).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(label).Tooltip(label).Focusable()
			b.Children(func() {
				a.stone(c, "pick-"+p.ID, p.Look, 28)
				if p.Asks > 0 {
					ui.Box(c.Key("dot:"+p.ID)).Size(9, 9).Radius(4.5).Background(t.Accent).Border(2, t.Bg).Absolute().Top(1).Right(1).AccessHidden(true)
				}
			})
			if b.Clicked() {
				a.SwitchPartner(id)
			}
		}
	})
}

// lookPick is the five colours, the chosen one ringed; it returns the one clicked or "".
func (a *App) lookPick(c *ui.Context, key, value string) string {
	t := a.T
	hit := ""
	ui.Row(c.Key("looks:" + key)).Gap(t.S2).Wrap().Role(ui.RoleRadioGroup).Label(a.L.T("partners.look")).Children(func() {
		for _, l := range protocol.PartnerLooks {
			on := l == value
			name := a.L.T("partners.look." + l)
			chip := ui.Box(c.Key("look:"+key+":"+l)).Size(22, 22).Radius(11).Background(t.Looks[l]).Border(1, t.LookRim).
				Cursor(ui.CursorPointer).Role(ui.RoleRadio).Label(name).Tooltip(name).AccessSelected(on).Focusable()
			if on {
				chip.Border(2, t.InkSoft)
			}
			if chip.Clicked() {
				hit = l
			}
		}
	})
	return hit
}

// partnersGroup is Settings › 伙伴's 伙伴们 / Your partners, on a home that
// offers more than one (the partners frame came).
func (a *App) partnersGroup(c *ui.Context) {
	if a.S.Partners == nil {
		return
	}
	t := a.T
	ps := &a.partners
	shown := a.shownPartnerID()
	many := a.manyPartners()
	if ans := a.S.PartnerAnswer; ans != nil && ans.ClientID == ps.cid && ps.cid != "" && ans.WbError == "" && ps.adding {
		a.partner.toast, a.partner.toastAt, a.partner.toastTone = a.L.T("partners.added", strings.TrimSpace(ps.name)), a.Now(), noticeDone
		ps.adding, ps.name, ps.cid = false, "", ""
	}
	note := a.L.T("partners.preview")
	if many {
		note = a.L.T("partners.help") + "\n" + note
	}
	a.group(c, "partners", a.L.T("partners.title"), note, func() {
		if many {
			for _, p := range a.S.Partners {
				a.sep(c)
				id := p.ID
				ui.Row(c.Key("partner-row:"+p.ID)).Gap(t.S4).AlignItems(ui.Center).Padding(t.S3, t.S5).Children(func() {
					a.stone(c, "row-"+p.ID, p.Look, 40)
					ui.Column(c).Grow(1).MinWidth(0).Gap(t.S1).Children(func() {
						ui.Text(c, p.Name).FontSize(t.MD).FontWeight(700).TextColor(t.Ink).SingleLine()
						if p.ID == shown {
							ui.Text(c, a.L.T("partners.talking")).FontSize(t.SM).TextColor(t.InkMuted)
						}
						if l := a.lookPick(c, p.ID, p.Look); l != "" && l != p.Look {
							a.send(protocol.PartnerSet{T: "partner_set", ID: id, Look: l})
						}
					})
					if p.ID != shown && a.button(c, a.L.T("partners.switch", p.Name), btnSecondary, t.ControlSM, t.Surface) {
						a.SwitchPartner(id)
					}
				})
			}
		}
		if len(a.S.Partners) >= 4 {
			return
		}
		a.sep(c)
		if !ps.adding {
			ui.Row(c.Key("partner-add-row")).Padding(t.S3, t.S5).Children(func() {
				if a.button(c, a.L.T("partners.add"), btnText, t.ControlSM, t.Surface) {
					ps.adding, ps.name, ps.focused, ps.cid = true, "", false, ""
					taken := map[string]bool{}
					for _, p := range a.S.Partners {
						taken[p.Look] = true
					}
					ps.look = "sage"
					for _, l := range protocol.PartnerLooks[1:] {
						if !taken[l] {
							ps.look = l
							break
						}
					}
				}
			})
			return
		}
		add := func() {
			if strings.TrimSpace(ps.name) == "" {
				return
			}
			ps.cid = fmt.Sprintf("pa-%d", time.Now().UnixNano())
			a.send(protocol.PartnerAdd{T: "partner_add", Name: ps.name, Look: ps.look, ClientID: ps.cid})
		}
		ui.Column(c.Key("partner-add")).Gap(t.S3).Padding(t.S4, t.S5).Children(func() {
			ui.Row(c).Gap(t.S4).AlignItems(ui.Center).Children(func() {
				a.stone(c, "add", ps.look, 48)
				ui.Column(c).Grow(1).Gap(t.S1).Children(func() {
					ui.Text(c, a.L.T("partners.add.name")).FontSize(t.SM).TextColor(t.InkMuted)
					in := ui.TextInput(c.Key("input:partner-add"), &ps.name).Placeholder(a.L.T("partners.add.placeholder")).Label(a.L.T("partners.add.name")).
						FontSize(t.MD).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.Surface).Border(1, t.Line).Width(260).OnSubmit(add)
					if !ps.focused {
						in.Focus()
						ps.focused = true
					}
				})
			})
			ui.Text(c, a.L.T("partners.look")).FontSize(t.SM).TextColor(t.InkMuted)
			if l := a.lookPick(c, "add", ps.look); l != "" {
				ps.look = l
			}
			if ans := a.S.PartnerAnswer; ans != nil && ans.ClientID == ps.cid && ans.WbError != "" {
				ui.Text(c, a.L.T("partners.error."+ans.WbError)).FontSize(t.SM).TextColor(t.Failed.Ink).Role(ui.RoleAlert)
			}
			ui.Row(c).Gap(t.S2).Children(func() {
				if a.button(c, a.L.T("partners.add.cancel"), btnText, t.ControlMD, t.Surface) {
					ps.adding = false
				}
				if a.button(c, a.L.T("partners.add.go"), btnPrimary, t.ControlMD, t.Surface) {
					add()
				}
			})
		})
	})
}
