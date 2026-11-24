package views

// D309: 伙伴们 / Your partners (design/personas.md), the same as the web's
// (apps/web/src/partners.tsx). With one partner nothing here shows. D497:
// with more, each partner is the clay figure in its own clay (theme.LookClay),
// D513: the others are in the list of partners at the conversation's left
// (partners_list.go), and a click on one (or ⌥⌘1–⌥⌘4) shows its conversation. Settings
// › 伙伴 lists them, changes a look and adds one (a name, what it looks
// after and a colour). D486: what each looks after shows under its name, a
// partner's name and that line change in place, and another partner is
// removed in two clicks (its conversation stays).

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
	about   string
	look    string
	focused bool
	cid     string
	// D486: the row being changed (its name and line), or asked about removing.
	editing   string
	editName  string
	editAbout string
	removing  string
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

// shownLook is the shown partner's look, "" with one partner (D497: the
// figure is then the art as drawn, whatever look the default was given).
func (a *App) shownLook() string {
	if p := a.shownPartner(); p != nil {
		return p.Look
	}
	return ""
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

// ChatLabel (D516) is the name the shown partner leads with in a chat app
// the Mac carries (iMessage): "" for the default, or with one partner.
func (a *App) ChatLabel() string {
	if p := a.shownPartner(); p != nil && p.ID != protocol.DefaultPartner {
		return p.Name
	}
	return ""
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
// D517: it is the count of needsYou's items, the same On hand draws under 等你.
func (a *App) needsAcross(b store.Board) int {
	return len(a.needsYouIn(b, true))
}

// taskPartner is whose a task is: its card's partner, else the default's.
func (a *App) taskPartner(t *store.Task) string {
	if t != nil && t.Card != nil && a.partnerByID(t.Card.Persona) != nil {
		return t.Card.Persona
	}
	return protocol.DefaultPartner
}

// barBoard is the board the bar's counts line speaks for (D497): with more
// than one partner, the shown partner's own tasks, since the line sits
// under its name and every other partner's own number is on its face
// beside it; with one, all of it. The person's one count (D309) stays on
// the Dock badge, the menu bar and On hand.
func (a *App) barBoard() store.Board {
	b := a.S.Board()
	if !a.manyPartners() {
		return b
	}
	shown := a.shownPartnerID()
	out := store.Board{Counts: b.Counts}
	for i, lane := range b.Lanes {
		for _, t := range lane {
			if a.taskPartner(t) == shown {
				out.Lanes[i] = append(out.Lanes[i], t)
			}
		}
	}
	return out
}

// barNeeds is the needs-you count the bar's line says: with more than one
// partner the shown one's own (its tasks and its conversation's
// questions), else the person's one count.
func (a *App) barNeeds(b store.Board) int {
	if !a.manyPartners() {
		return a.needsAcross(b)
	}
	return needsOf(a.needsYou(), a.shownPartnerID())
}

// partnerNeeds is what waits on the person from one partner (D497, D517):
// its items of the person's one count (needsyou.go), so the rows add up to
// the Dock badge and On hand's head.
func (a *App) partnerNeeds(p protocol.PartnerInfo) int {
	return needsOf(a.needsYou(), p.ID)
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
	a.holdRail() // D517: the list keeps its numbers until the welcome
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

// stone is a partner's face: the clay figure in its own clay (D497; it
// was the face on a coloured disc, D309), still, standing on the box's
// bottom edge. The name "stone" stays for the code; nothing on screen says it.
func (a *App) stone(c *ui.Context, key, look string, size float32) ui.Element {
	box := ui.Box(c.Key("stone:"+key)).Size(size, size).AlignItems(ui.Center).Justify(ui.End).Shrink(0).AccessHidden(true)
	box.Draw(func(pt *ui.Painter, r ui.Rect) {
		bmp := theme.FaceAs(look, theme.Idle, size*2)
		if bmp == nil {
			return
		}
		at := fitIn(bmp, r)
		at.Y = r.Y + r.H - at.H
		pt.Image(bmp, at, ui.Contain)
	})
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
	a.doorCard(c, row, "a:"+x.DecisionID) // D535
	row.Children(func() {
		a.stone(c, "oask-"+x.DecisionID, p.Look, 32)
		ui.Column(c.Key("w")).Gap(2).Grow(1).Shrink(1).MinWidth(0).Children(func() {
			uiText(c, a.L.T("partners.asks.from", p.Name)).FontSize(t.XS).TextColor(t.InkSoft)
			uiText(c, x.Question).FontSize(14).TextColor(t.Ink).MaxLines(2)
		})
	})
	if row.Clicked() {
		a.SwitchPartner(x.Persona)
	}
}

// passedLine is the small line over the person's words that another
// partner passed on (D486): who passed them; a click shows that partner.
func (a *App) passedLine(c *ui.Context, key, from string) {
	t := a.T
	var p *protocol.PartnerInfo
	for i := range a.S.Partners {
		if a.S.Partners[i].ID == from {
			p = &a.S.Partners[i]
		}
	}
	words := a.L.T("partners.passed.gone")
	if p != nil {
		words = a.L.T("partners.passed", p.Name)
	}
	ui.Row(c.Key("passed:" + key)).Children(func() {
		ui.Spacer(c)
		b := ui.Row(c.Key("b")).Gap(6).AlignItems(ui.Center).Padding(2, t.S2).Radius(999).Background(t.Sunken).Label(words)
		if p != nil {
			b.Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable()
		}
		b.Children(func() {
			if p != nil {
				a.stone(c, "passed-"+key, p.Look, 14)
			}
			uiText(c, keepWords(autospace(words))).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).SingleLine()
		})
		if p != nil && b.Clicked() {
			a.SwitchPartner(p.ID)
		}
	})
}

// partnerKeys: ⌥⌘1–⌥⌘4 show the first to fourth partner (D497), in the
// order Settings lists them, the default first.
func (a *App) partnerKeys(c *ui.Context) {
	if !a.manyPartners() {
		return
	}
	for i, k := range []ui.Key{ui.Key1, ui.Key2, ui.Key3, ui.Key4} {
		if i < len(a.S.Partners) && c.Shortcut(ui.Cmd|ui.Alt, k) {
			a.SwitchPartner(a.S.Partners[i].ID)
			return
		}
	}
}

// lookPick is the five clays (D497: the figure in each, not a swatch), the
// chosen one ringed; it returns the one clicked or "".
func (a *App) lookPick(c *ui.Context, key, value string) string {
	t := a.T
	hit := ""
	ui.Row(c.Key("looks:" + key)).Gap(t.S2).Wrap().Role(ui.RoleRadioGroup).Label(a.L.T("partners.look")).Children(func() {
		for _, l := range protocol.PartnerLooks {
			on := l == value
			name := a.L.T("partners.look." + l)
			chip := ui.Box(c.Key("look:"+key+":"+l)).Size(34, 34).Radius(17).Padding(3).AlignItems(ui.Center).Justify(ui.Center).
				Cursor(ui.CursorPointer).Role(ui.RoleRadio).Label(name).Tooltip(name).AccessSelected(on).Focusable()
			if on {
				chip.Border(2, t.InkSoft).Background(t.Surface)
			} else if chip.Hovered() {
				chip.Background(t.SurfaceSunken)
			}
			chip.Children(func() { a.stone(c, "lk-"+key+"-"+l, l, 24) })
			if chip.Clicked() {
				hit = l
			}
		}
	})
	return hit
}

// partnersGroup is Settings › 伙伴's 伙伴们 / Your partners, on a home that
// offers more than one (the partners frame came). D500: with several it
// leads the pane (who is who); with one it is the pane's last group, after
// everything about the one there is (the fresh user meets it last).
func (a *App) partnersGroup(c *ui.Context, top bool) {
	if a.S.Partners == nil || top != a.manyPartners() {
		return
	}
	t := a.T
	ps := &a.partners
	shown := a.shownPartnerID()
	many := a.manyPartners()
	if ans := a.S.PartnerAnswer; ans != nil && ans.ClientID == ps.cid && ps.cid != "" && ans.WbError == "" && ps.adding {
		a.partner.toast, a.partner.toastAt, a.partner.toastTone = a.L.T("partners.added", strings.TrimSpace(ps.name)), a.Now(), noticeDone
		ps.adding, ps.name, ps.about, ps.cid = false, "", "", ""
	}
	note := a.L.T("partners.say")
	if many {
		note = a.L.T("partners.help")
	}
	a.group(c, "partners", a.L.T("partners.title"), note, func() {
		if many {
			for _, p := range a.S.Partners {
				a.sep(c)
				id, p := p.ID, p
				if ps.removing == id {
					ui.Row(c.Key("partner-removing:"+id)).Gap(t.S4).AlignItems(ui.Center).Padding(t.S3, t.S5).Role(ui.RoleGroup).Label(a.L.T("partners.remove.ask", p.Name)).Children(func() {
						a.stone(c, "row-"+id, p.Look, 40)
						ui.Column(c).Grow(1).MinWidth(0).Gap(t.S1).Children(func() {
							uiText(c, a.L.T("partners.remove.ask", p.Name)).FontSize(t.MD).FontWeight(700).TextColor(t.Ink)
							uiText(c, a.L.T("partners.remove.what", a.defaultName())).FontSize(t.SM).TextColor(t.InkMuted)
						})
						if a.button(c, a.L.T("partners.remove.keep"), btnText, t.ControlSM, t.Surface) {
							ps.removing = ""
						}
						if a.button(c, a.L.T("partners.remove.go"), btnSecondary, t.ControlSM, t.Surface) {
							ps.removing = ""
							a.send(protocol.PartnerRemove{T: "partner_remove", ID: id, ClientID: fmt.Sprintf("pr-%d", time.Now().UnixNano())})
						}
					})
					continue
				}
				save := func() {
					patch := protocol.PartnerSet{T: "partner_set", ID: id}
					changed := false
					if n := strings.TrimSpace(ps.editName); n != "" && n != p.Name {
						if id == protocol.DefaultPartner {
							a.SetSettings(protocol.SettingsPatch{Name: &n})
						} else {
							patch.Name, changed = n, true
						}
					}
					if ab := strings.TrimSpace(ps.editAbout); ab != p.About {
						patch.About, changed = &ab, true
					}
					if changed {
						a.send(patch)
					}
					ps.editing = ""
				}
				// D513: three lines, as on the web: who it is, its colours, then
				// its actions, the last two under its name. One line gave the
				// buttons the width and squeezed the words on a phone.
				ui.Column(c.Key("partner-row:"+id)).Gap(t.S2).Padding(t.S3, t.S5).Children(func() {
					ui.Row(c).Gap(t.S3).AlignItems(ui.Center).MinWidth(0).Children(func() {
						a.stone(c, "row-"+id, p.Look, 40)
						ui.Column(c).Grow(1).MinWidth(0).Gap(t.S1).Children(func() {
							if ps.editing == id {
								// D536: the shared field, both at the control height (the line used
								// to be a small font in a 260-wide box that cut its words off).
								a.lineField(c, "partner-name:"+id, a.L.T("partners.rename"), &ps.editName, "", true, save)
								a.lineField(c, "partner-about:"+id, a.L.T("partners.about"), &ps.editAbout, a.L.T("partners.about.placeholder"), false, save)
							} else {
								uiText(c, p.Name).FontSize(t.MD).FontWeight(700).TextColor(t.Ink).SingleLine()
								if p.About != "" {
									uiText(c, a.L.T("partners.about.shown", p.About)).FontSize(t.SM).TextColor(t.InkSoft).MaxLines(2)
								}
								a.thinksLine(c, p)
							}
							if p.ID == shown {
								uiText(c, a.L.T("partners.talking")).FontSize(t.SM).TextColor(t.InkMuted)
							}
						})
					})
					ui.Column(c).Padding(0, 0, 0, 52).Children(func() {
						if l := a.lookPick(c, id, p.Look); l != "" && l != p.Look {
							a.send(protocol.PartnerSet{T: "partner_set", ID: id, Look: l})
						}
					})
					if ps.editing == id {
						a.thinksPick(c, p)
					}
					ui.Row(c).Gap(t.S2).Wrap().AlignItems(ui.Center).Padding(0, 0, 0, 52).Children(func() {
						if ps.editing == id {
							if a.button(c, a.L.T("partners.rename.save"), btnPrimary, t.ControlSM, t.Surface) {
								save()
							}
							return
						}
						if p.ID != shown && a.button(c, a.L.T("partners.switch", p.Name), btnSecondary, t.ControlSM, t.Surface) {
							a.SwitchPartner(id)
						}
						if a.button(c, a.L.T("partners.change"), btnText, t.ControlSM, t.Surface) {
							ps.editing, ps.editName, ps.editAbout, ps.removing = id, p.Name, p.About, ""
						}
						if id != protocol.DefaultPartner && a.button(c, a.L.T("partners.remove"), btnText, t.ControlSM, t.Surface) {
							ps.removing, ps.editing = id, ""
						}
					})
				})
			}
		}
		if len(a.S.Partners) >= 4 {
			return
		}
		if !ps.adding {
			// D500: the shared add row (a ＋, the title, one line of what for), as on the web.
			if a.addRow(c, "partner-add", a.L.T("partners.add"), a.L.T("partners.add.help")) {
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
			return
		}
		add := func() {
			if strings.TrimSpace(ps.name) == "" {
				return
			}
			ps.cid = fmt.Sprintf("pa-%d", time.Now().UnixNano())
			a.send(protocol.PartnerAdd{T: "partner_add", Name: ps.name, Look: ps.look, About: strings.TrimSpace(ps.about), ClientID: ps.cid})
		}
		a.sep(c)
		ui.Column(c.Key("partner-add")).Gap(t.S3).Padding(t.S4, t.S5).Children(func() {
			ui.Row(c).Gap(t.S4).AlignItems(ui.Center).Children(func() {
				a.stone(c, "add", ps.look, 48)
				ui.Column(c).Grow(1).Gap(t.S1).Children(func() {
					uiText(c, a.L.T("partners.add.name")).FontSize(t.SM).TextColor(t.InkMuted)
					in := a.lineField(c, "partner-add", a.L.T("partners.add.name"), &ps.name, a.L.T("partners.add.placeholder"), false, add)
					if !ps.focused {
						in.Focus()
						ps.focused = true
					}
				})
			})
			uiText(c, a.L.T("partners.about")).FontSize(t.SM).TextColor(t.InkMuted)
			a.lineField(c, "partner-add-about", a.L.T("partners.about"), &ps.about, a.L.T("partners.about.placeholder"), false, add)
			uiText(c, a.L.T("partners.look")).FontSize(t.SM).TextColor(t.InkMuted)
			if l := a.lookPick(c, "add", ps.look); l != "" {
				ps.look = l
			}
			if ans := a.S.PartnerAnswer; ans != nil && ans.ClientID == ps.cid && ans.WbError != "" {
				uiText(c, a.L.T("partners.error."+ans.WbError)).FontSize(t.SM).TextColor(t.Failed.Ink).Role(ui.RoleAlert)
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
