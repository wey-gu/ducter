package views

import (
	"regexp"
	"strconv"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// 设置 › 自动填充 / Settings › Autofill (D191, design/autofill.md §6): the
// owner's saved sign-ins, cards and details, and where each was used. A
// secret goes to the home once (saved_put) and never comes back: a sign-in
// shows its site and user name, a card its last four, a private detail
// only that it is kept. Editing replaces; nothing reveals. Also the
// 付款 / Pay card with its security-code field, and the first-use OK.

type autofillState struct {
	askedAt time.Time
	// editing: "" none, "signin:new", "signin:<id>", "card:new", "card:<id>", "details".
	editing string
	sure    bool // 删掉 asked once
	// The form's fields (secrets live here only until Save, then are cleared).
	site, user, password string
	name, number, exp    string
	details              map[string]string
	cvc                  map[string]string // decisionId -> the code typed on its pay card
	// D233: a key form's variable; a key card's pasted key and its choice
	// (只这一次), by decisionId, until its Go.
	keyEnv  string
	keyVal  map[string]string
	keyOnce map[string]bool
	sentAt  time.Time
}

var expRe = regexp.MustCompile(`^\s*(\d{1,2})\s*/\s*(\d{2,4})\s*$`)

func (a *App) savedFrame() *protocol.ServerFrame { return a.S.Saved }

// autofillPanel is the Autofill section.
func (a *App) autofillPanel(c *ui.Context) {
	t := a.T
	s := &a.af
	if s.askedAt.IsZero() || a.Now().Sub(s.askedAt) > time.Minute {
		s.askedAt = a.Now()
		a.send(protocol.SavedReq{T: "saved"})
	}
	a.panelHead(c, TabAutofill, a.L.T("af.lede"))
	f := a.savedFrame()
	if f == nil {
		ui.Text(c, a.L.T("conn.connecting")).FontSize(t.SM).TextColor(t.InkMuted)
		return
	}
	// A save answered: close the form, drop what was typed.
	if !s.sentAt.IsZero() && f.OK && f.Reason == "" {
		s.sentAt, s.editing = time.Time{}, ""
		a.clearForm()
	}
	var signins, cards []protocol.SavedView
	for _, x := range f.SavedItems {
		if x.Kind == "signin" {
			signins = append(signins, x)
		} else {
			cards = append(cards, x)
		}
	}
	a.group(c, "af-signins", a.L.T("af.signins"), "", func() {
		for _, x := range signins {
			if s.editing == "signin:"+x.ID {
				a.afForm(c, "signin", &x)
				continue
			}
			a.afRow(c, "signin:"+x.ID, x.Label, x.Username+" · "+a.afUsed(x.UsedAt), "••••••", func() { a.afEdit("signin", &x) })
		}
		if s.editing == "signin:new" {
			a.afForm(c, "signin", nil)
		} else {
			a.afRow(c, "signin:add", "+  "+a.L.T("af.signin.add"), a.L.T("af.signin.why"), "", func() { a.afEdit("signin", nil) })
		}
	})
	a.group(c, "af-cards", a.L.T("af.cards"), "", func() {
		for _, x := range cards {
			if s.editing == "card:"+x.ID {
				a.afForm(c, "card", &x)
				continue
			}
			a.afRow(c, "card:"+x.ID, x.Label, x.Name+" · "+x.Exp+" · "+a.afUsed(x.UsedAt), "", func() { a.afEdit("card", &x) })
		}
		if s.editing == "card:new" {
			a.afForm(c, "card", nil)
		} else {
			a.afRow(c, "card:add", "+  "+a.L.T("af.card.add"), a.L.T("af.card.why"), "", func() { a.afEdit("card", nil) })
		}
	})
	a.group(c, "af-details", a.L.T("af.details"), a.L.T("af.d.note"), func() {
		if s.editing == "details" {
			a.afDetails(c, f.SavedDetails)
			return
		}
		read, kept := "", ""
		n := 0
		for _, d := range f.SavedDetails {
			if !d.Kept {
				continue
			}
			n++
			if d.Value != "" {
				if read != "" {
					read += " · "
				}
				read += d.Value
			} else {
				if kept != "" {
					kept += " · "
				}
				kept += a.L.T("af.d." + d.Key)
			}
		}
		title, help := a.L.T("af.d.add"), a.L.T("af.d.why")
		if n > 0 {
			title, help = read, kept
			if title == "" {
				title = a.L.T("af.d.kept", n)
			}
		}
		a.afRow(c, "details", title, help, "", func() {
			s.editing, s.sure = "details", false
			s.details = map[string]string{}
			for _, d := range f.SavedDetails {
				s.details[d.Key] = d.Value
			}
		})
	})
	a.keysGroup(c, f)
	ui.Column(c.Key("af-uses")).Gap(t.S2).Children(func() {
		a.heading(c, a.L.T("af.uses"), t.XL)
		if len(f.Uses) == 0 {
			ui.Text(c, a.L.T("af.uses.none")).FontSize(t.SM).TextColor(t.InkMuted)
			return
		}
		for i, u := range f.Uses {
			if i >= 30 {
				break
			}
			a.afUse(c, i, u)
		}
	})
	where := "af.kept.file"
	if f.KeptIn == "keychain" {
		where = "af.kept.keychain"
	}
	ui.Text(c, a.L.T(where, a.homeName())).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(a.leading(1.5))
}

func (a *App) afUsed(at string) string {
	if at == "" {
		return a.L.T("af.unused")
	}
	return a.L.T("af.used", a.agoLong(at))
}

func (a *App) afRow(c *ui.Context, key, title, help, mark string, open func()) {
	t := a.T
	a.sep(c)
	r := ui.Row(c.Key("af-row:"+key)).Gap(t.S4).Padding(t.S4, t.S5).MinHeight(64).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(title).Focusable()
	if r.Hovered() {
		r.Background(t.SurfaceSunken)
	}
	r.Children(func() {
		ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).Children(func() {
			ui.Text(c, title).FontSize(t.MD).FontWeight(700).SingleLine()
			if help != "" {
				ui.Text(c, help).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(a.leading(1.5))
			}
		})
		if mark != "" {
			ui.Text(c, mark).FontSize(t.SM).TextColor(t.InkMuted).AccessHidden(true)
		}
	})
	if r.Clicked() {
		open()
	}
}

func (a *App) clearForm() {
	s := &a.af
	s.site, s.user, s.password, s.name, s.number, s.exp = "", "", "", "", "", ""
	s.keyEnv = ""
	s.details = nil
}

func (a *App) afEdit(kind string, x *protocol.SavedView) {
	s := &a.af
	a.clearForm()
	s.sure, s.sentAt = false, time.Time{}
	if x == nil {
		s.editing = kind + ":new"
		return
	}
	s.editing = kind + ":" + x.ID
	s.site, s.user, s.name, s.exp = x.Site, x.Username, x.Name, x.Exp
}

func (a *App) afInput(c *ui.Context, key, label string, v *string, placeholder string, secret bool) {
	t := a.T
	ui.Column(c.Key("af-field:" + key)).Gap(t.S1).Children(func() {
		ui.Text(c, label).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		in := ui.TextInput(c.Key("af-input:"+key), v).Placeholder(placeholder).Label(label).
			FontSize(t.MD).Padding(t.S3, t.S4).Radius(t.RadiusSM).Background(t.SurfaceSunken).Border(1, t.LineSoft)
		if secret {
			in.Password()
		}
	})
}

// afForm adds or changes one sign-in or card.
func (a *App) afForm(c *ui.Context, kind string, x *protocol.SavedView) {
	t := a.T
	s := &a.af
	a.sep(c)
	keep := ""
	if x != nil {
		keep = a.L.T("af.keep")
	}
	ui.Column(c.Key("af-form:"+kind)).Gap(t.S3).Padding(t.S4, t.S5).Children(func() {
		var ok bool
		var put protocol.SavedInput
		if kind == "signin" {
			a.afInput(c, "site", a.L.T("af.signin.site"), &s.site, "github.com", false)
			a.afInput(c, "user", a.L.T("af.signin.user"), &s.user, "", false)
			a.afInput(c, "password", a.L.T("af.signin.password"), &s.password, keep, true)
			ok = s.site != "" && s.user != "" && (x != nil || s.password != "")
			put = protocol.SavedInput{Kind: "signin", Site: s.site, Username: s.user, Password: s.password}
		} else {
			ph := "4242 4242 4242 4242"
			if x != nil {
				ph = "•••• " + x.Last4 + " · " + keep
			}
			a.afInput(c, "number", a.L.T("af.card.number"), &s.number, ph, false)
			a.afInput(c, "exp", a.L.T("af.card.exp"), &s.exp, "08/29", false)
			a.afInput(c, "name", a.L.T("af.card.name"), &s.name, "", false)
			ui.Text(c, a.L.T("af.card.nocvc")).FontSize(t.SM).TextColor(t.InkMuted)
			m := expRe.FindStringSubmatch(s.exp)
			ok = m != nil && s.name != "" && (x != nil || s.number != "")
			if m != nil {
				mm, _ := strconv.Atoi(m[1])
				yy, _ := strconv.Atoi(m[2])
				put = protocol.SavedInput{Kind: "card", Name: s.name, Number: s.number, ExpMonth: mm, ExpYear: yy}
			}
		}
		if x != nil {
			put.ID = x.ID
		}
		if f := a.savedFrame(); f != nil && !s.sentAt.IsZero() && f.Reason != "" {
			ui.Text(c, a.L.T("af.err."+f.Reason)+" ("+f.Message+")").FontSize(t.SM).TextColor(t.Failed.Ink)
		}
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			if x != nil {
				if s.sure {
					if a.buttonFor(c, a.L.T("af.remove.go"), x.Label, btnSecondary, t.ControlSM, t.Surface) {
						a.send(protocol.SavedRemove{T: "saved_remove", ID: x.ID})
						s.sentAt = a.Now()
					}
				} else if a.buttonFor(c, a.L.T("af.remove"), x.Label, btnText, t.ControlSM, t.Surface) {
					s.sure = true
				}
			}
			ui.Box(c).Grow(1)
			if a.button(c, a.L.T("af.cancel"), btnSecondary, t.ControlSM, t.Surface) {
				s.editing = ""
				a.clearForm()
			}
			if a.button(c, a.L.T("af.save"), btnPrimary, t.ControlSM, t.Surface) && ok {
				a.send(protocol.SavedPut{T: "saved_put", Item: put})
				s.sentAt = a.Now()
			}
		})
	})
}

// afDetails is 你的资料 / Your details: a private field shows only that it is kept and stays unless typed over.
func (a *App) afDetails(c *ui.Context, details []protocol.DetailView) {
	t := a.T
	s := &a.af
	a.sep(c)
	of := map[string]protocol.DetailView{}
	for _, d := range details {
		of[d.Key] = d
	}
	ui.Column(c.Key("af-details-form")).Gap(t.S3).Padding(t.S4, t.S5).Children(func() {
		for _, k := range protocol.DetailOrder {
			v := s.details[k]
			ph := a.L.T("af.d." + k + ".eg")
			if protocol.DetailFill[k] && of[k].Kept {
				ph = of[k].Hint
				if ph == "" {
					ph = "••••"
				}
				ph += " · " + a.L.T("af.keep")
			}
			a.afInput(c, "d:"+k, a.L.T("af.d."+k), &v, ph, false)
			s.details[k] = v
		}
		ui.Row(c).Gap(t.S3).Children(func() {
			ui.Box(c).Grow(1)
			if a.button(c, a.L.T("af.cancel"), btnSecondary, t.ControlSM, t.Surface) {
				s.editing = ""
				a.clearForm()
			}
			if a.button(c, a.L.T("af.save"), btnPrimary, t.ControlSM, t.Surface) {
				values := map[string]string{}
				for _, k := range protocol.DetailOrder {
					v := s.details[k]
					if protocol.DetailFill[k] {
						if v != "" {
							values[k] = v
						}
					} else if v != of[k].Value {
						values[k] = v
					}
				}
				a.send(protocol.SavedPut{T: "saved_put", Item: protocol.SavedInput{Kind: "detail", Values: values}})
				s.sentAt = a.Now()
			}
		})
	})
}

func (a *App) afUse(c *ui.Context, i int, u protocol.SavedUse) {
	t := a.T
	var what string
	switch u.What {
	case "approved":
		what = a.L.T("af.use.approved", u.Amount, u.Label)
	case "declined":
		what = a.L.T("af.use.declined", u.Label)
	case "ok":
		what = a.L.T("af.use.ok", u.Label)
	case "given": // D233: a key, given to the task named under it
		what = a.L.T("af.use.given", u.Label)
		if u.Once {
			what = a.L.T("af.use.given.once", u.Label)
		}
	case "refused":
		what = a.L.T("af.use.refused", u.Label)
	default:
		what = a.L.T("af.use.filled", u.Label)
	}
	if u.Site != "" {
		what += " · " + u.Site
	}
	ink := t.Ink
	if u.What == "declined" || u.What == "refused" {
		ink = t.InkMuted
	}
	ui.Row(c.Key("af-use:"+strconv.Itoa(i))).Gap(t.S3).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.SurfaceSunken).AlignItems(ui.Center).Children(func() {
		ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
			ui.Text(c, what).FontSize(t.SM).FontWeight(700).TextColor(ink)
			if u.Task != "" {
				ui.Text(c, a.L.T("af.use.task", u.Task)).FontSize(t.XS).TextColor(t.InkMuted)
			}
		})
		ui.Text(c, a.agoLong(u.At)).FontSize(t.XS).TextColor(t.InkMuted)
	})
}

// payButtons is 付款 / Pay on a decision: merchant, amount, card, the
// security code, then 先不付 / Not now and 付 {amount}. No default.
func (a *App) payButtons(c *ui.Context, d *store.DecisionState, st decisionStyle) {
	t := a.T
	p := d.Pay
	amount := p.Currency + " " + p.Amount
	ui.Column(c.Key("pay:" + d.DecisionID)).Gap(t.S2).Padding(t.S3).Radius(t.RadiusSM).Background(t.SurfaceSunken).Children(func() {
		fact := func(k, v string) {
			ui.Row(c).Gap(t.S3).Children(func() {
				ui.Text(c, a.L.T(k)).FontSize(t.SM).TextColor(t.InkMuted).Width(72)
				ui.Text(c, v).FontSize(t.SM).FontWeight(700).Grow(1).MinWidth(0)
			})
		}
		ui.Text(c, amount).FontSize(t.XL).FontWeight(800)
		if p.What != "" {
			fact("pay.what", p.What)
		}
		where := p.Site
		if p.FirstHere {
			where += " · " + a.L.T("pay.first")
		}
		fact("pay.where", where)
		fact("pay.card", p.Card)
	})
	if d.Resolved != nil || d.Pending != "" {
		msg := a.L.T("pay.resolved.hold")
		if (d.Resolved != nil && d.Resolved.Option == "go") || d.Pending == "go" {
			msg = a.L.T("pay.resolved", amount)
		}
		ui.Text(c, msg).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		return
	}
	if a.af.cvc == nil {
		a.af.cvc = map[string]string{}
	}
	code := a.af.cvc[d.DecisionID]
	if p.NeedsCvc {
		a.afInput(c, "cvc:"+d.DecisionID, a.L.T("pay.cvc", p.Last4), &code, "", true)
		a.af.cvc[d.DecisionID] = code
	}
	ui.Text(c, a.L.T("pay.why")).FontSize(t.XS).TextColor(t.InkMuted)
	ready := !p.NeedsCvc || regexp.MustCompile(`^\d{3,4}$`).MatchString(code)
	ui.Row(c.Key("pay-go:" + d.DecisionID)).Gap(t.S3).AlignItems(ui.Center).Children(func() {
		if a.buttonFor(c, a.L.T("pay.hold"), p.Site, btnSecondary, st.height, st.quietBg) {
			a.Decide(d.DecisionID, "hold", "")
		}
		if a.buttonFor(c, a.L.T("pay.go", amount), p.Site, btnPrimary, st.height, st.quietBg) && ready {
			if d := a.S.Decisions[d.DecisionID]; d != nil {
				d.Pending, d.AnsweredAt = "go", a.Now()
			}
			a.markRead()
			a.send(protocol.DecidePay{T: "decide", DecisionID: d.DecisionID, Option: "go", Cvc: code})
			delete(a.af.cvc, d.DecisionID)
		}
	})
}

// fillButtons is the first-use OK on a decision.
func (a *App) fillButtons(c *ui.Context, d *store.DecisionState, st decisionStyle) {
	t := a.T
	f := d.Fill
	why := "fill.why.detail"
	if f.Kind == "signin" {
		why = "fill.why.signin"
	}
	ui.Text(c, a.L.T(why)).FontSize(t.SM).TextColor(t.InkMuted)
	if d.Resolved != nil || d.Pending != "" {
		msg := a.L.T("fill.resolved.hold")
		if (d.Resolved != nil && d.Resolved.Option == "go") || d.Pending == "go" {
			msg = a.L.T("fill.resolved")
		}
		ui.Text(c, msg).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		return
	}
	ui.Row(c.Key("fill-go:" + d.DecisionID)).Gap(t.S3).AlignItems(ui.Center).Children(func() {
		if a.buttonFor(c, a.L.T("fill.hold"), f.Site, btnSecondary, st.height, st.quietBg) {
			a.Decide(d.DecisionID, "hold", "")
		}
		if a.buttonFor(c, a.L.T("fill.go"), f.Site, btnPrimary, st.height, st.quietBg) {
			a.Decide(d.DecisionID, "go", "")
		}
	})
}
