package views

import (
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// 设置 › 密码和银行卡 / Settings › Passwords & cards (Autofill in code) (D191, design/autofill.md §6): the
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
	// missing is the field Save was tapped without (the Mac walk of
	// 0.0.98: a Save that did nothing, silently), said under the form.
	missing string
}

// firstMissing is the label key of the first field that is missing, given
// as pairs of (missing, key), or "".
func firstMissing(pairs ...any) string {
	for i := 0; i+1 < len(pairs); i += 2 {
		if pairs[i].(bool) {
			return pairs[i+1].(string)
		}
	}
	return ""
}

// afMissing answers a Save that can't go yet: the first field still
// missing (need, its label's key), named in the failed ink, until it is
// filled.
func (a *App) afMissing(c *ui.Context, need string) {
	s := &a.af
	if need == "" {
		s.missing = ""
	}
	if s.missing == "" {
		return
	}
	s.missing = need
	uiText(c, a.L.T("af.fill", a.L.T(need))).FontSize(a.T.SM).FontWeight(600).TextColor(a.T.Failed.Ink).Role(ui.RoleStatus)
}

// expRe reads a card's expiry as people type it (D404): 08/29, 08-29, 08 29,
// or 0829 with no separator at all; the core checks the month and the year.
var expRe = regexp.MustCompile(`^\s*(\d{1,2})\s*[/\-.\s]\s*(\d{2}|\d{4})\s*$|^\s*(\d{1,2})(\d{2})\s*$`)

// parseExp is expRe's month and year, or false (D404).
func parseExp(s string) (int, int, bool) {
	m := expRe.FindStringSubmatch(s)
	if m == nil {
		return 0, 0, false
	}
	a, b := m[1], m[2]
	if a == "" {
		a, b = m[3], m[4]
	}
	mm, _ := strconv.Atoi(a)
	yy, _ := strconv.Atoi(b)
	return mm, yy, mm >= 1 && mm <= 12
}

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
	if f != nil {
		// D399: where it is all kept is true of the whole pane: under the lede, not under the last card.
		where := "af.kept.file"
		if f.KeptIn == "keychain" {
			where = "af.kept.keychain"
		}
		a.ledeNote(c, "af-kept", a.L.T("af.kept.short", a.homeName()))
		a.ledeHow(c, "af-kept", a.L.T("af.kept.short", a.homeName()), a.L.T(where))
	}
	if f == nil {
		a.paneWait(c, "autofill", a.L.T("conn.connecting"))
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
			a.afRow(c, "signin:"+x.ID, a.afMonogram(c, "signin:"+x.ID, firstNonEmpty(x.Label, x.Site)), x.Label, x.Username, a.afUsed(x.UsedAt), "••••••", func() { a.afEdit("signin", &x) }) // D291, D618: the web's dots
		}
		if s.editing == "signin:new" {
			a.afForm(c, "signin", nil)
		} else {
			if a.addRow(c, "signin", a.L.T("af.signin.add"), a.L.T("af.signin.why")) { // D289: D273's add row
				a.afEdit("signin", nil)
			}
		}
	})
	a.group(c, "af-cards", a.L.T("af.cards"), "", func() {
		for _, x := range cards {
			if s.editing == "card:"+x.ID {
				a.afForm(c, "card", &x)
				continue
			}
			a.afRow(c, "card:"+x.ID, a.afCardTile(c, "card:"+x.ID, x), x.Label, a.afCardLine(x), a.afUsed(x.UsedAt), "", func() { a.afEdit("card", &x) }) // D291
		}
		if s.editing == "card:new" {
			a.afForm(c, "card", nil)
		} else {
			if a.addRow(c, "card", a.L.T("af.card.add"), a.L.T("af.card.why")) {
				a.afEdit("card", nil)
			}
		}
	})
	a.groupHow(c, "af-details", a.L.T("af.details"), a.L.T("af.d.note"), a.L.T("af.d.how"), func() {
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
					read += a.L.T("acct.sep") // D291: a list, said as one
				}
				v := d.Value
				if d.Key == "phone" {
					// D589: a phone number is one word: it never breaks at its spaces (+86 / 138…).
					v = strings.ReplaceAll(v, " ", "\u00a0")
				}
				read += v
			} else {
				if kept != "" {
					kept += a.L.T("acct.sep")
				}
				kept += a.L.T("af.d." + d.Key)
			}
		}
		title, help := a.L.T("af.d.add"), a.L.T("af.d.why")
		if n > 0 {
			title, help = read, kept
			if kept != "" {
				help = a.L.T("af.d.also", kept)
			}
			if title == "" {
				title = a.L.T("af.d.kept", n)
			}
		}
		a.afRow(c, "details", a.afPebble(c, "details", drawPersonMark), title, help, "", "", func() {
			s.editing, s.sure = "details", false
			s.details = map[string]string{}
			for _, d := range f.SavedDetails {
				s.details[d.Key] = d.Value
			}
		})
	})
	a.keysGroup(c, f)
	// D289: the uses are a section like the others; none yet is its header's note.
	if len(f.Uses) == 0 {
		a.sectionHead(c, a.L.T("af.uses"), a.L.T("af.uses.none"))
	} else {
		a.group(c, "af-uses", a.L.T("af.uses"), "", func() {
			a.sep(c)
			ui.Column(c.Key("af-uses")).Gap(t.S2).Padding(t.S4, t.S5).Children(func() {
				for i, u := range f.Uses {
					if i >= 30 {
						break
					}
					a.afUse(c, i, u)
				}
			})
		})
	}
}

// afCardLine: whose card and until when; which one is its tile's last four (D475, as the web's).
func (a *App) afCardLine(x protocol.SavedView) string {
	return a.L.T("af.card.line", x.Name, x.Exp)
}

func (a *App) afUsed(at string) string {
	if at == "" {
		return "" // D399: a row speaks only when it differs; never used is every new row's state
	}
	return a.L.T("af.used", a.agoLong(at))
}

// afRow is one saved thing (D296): its mark in the tile column, so its
// words start on the text edge with the add row's under it; when it was
// last used at the right edge; the whole row opens it.
func (a *App) afRow(c *ui.Context, key string, tile func(), title, help, mark, state string, open func()) {
	t := a.T
	a.sep(c)
	r := ui.Row(c.Key("af-row:"+key)).Gap(t.S3).Padding(t.S4, t.S5).MinHeight(64).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(title).Focusable()
	switch {
	case r.Pressed():
		r.Background(t.Ink.Alpha(0.06))
	case r.Hovered():
		r.Background(t.Ink.Alpha(0.03))
	}
	r.Children(func() {
		a.tileCol(c, tile)
		ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).Children(func() {
			uiText(c, title).FontSize(t.MD).FontWeight(700).SingleLine()
			if help != "" {
				uiText(c, help).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(a.leading(1.5))
			}
		})
		if mark != "" || state != "" {
			ui.Row(c.Key("af-marks:" + key)).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				if mark != "" {
					uiText(c, mark).FontSize(t.SM).TextColor(t.InkMuted).AccessHidden(true)
				}
				if state != "" {
					uiText(c, state).FontSize(t.SM).TextColor(t.InkMuted).AccessHidden(true)
				}
			})
		}
	})
	if r.Clicked() {
		open()
	}
}

// D475: a saved thing is drawn as itself, as on the web: a sign-in is its name's first letter (D500: the
// name beside it, so 铁路 12306 is 铁, never 1 from 12306.cn) on a
// clay pebble, a card a small card in its network's tone with its last four, details and keys their
// mark on the same pebble. Every tile keeps the 40 column, so the words keep one text edge.
func (a *App) afPebble(c *ui.Context, key string, glyph func(ui.Color) func(p *ui.Painter, r ui.Rect)) func() {
	t := a.T
	return func() {
		ui.Row(c.Key("af-pebble:"+key)).Size(40, 40).Radius(20).Background(t.SurfaceSunken).Shadow(0, 2, 0, 0, t.Line).
			Justify(ui.Center).AlignItems(ui.Center).AccessHidden(true).Children(func() {
			a.glyph(c, 20, glyph(t.InkSoft))
		})
	}
}

func (a *App) afMonogram(c *ui.Context, key, site string) func() {
	t := a.T
	letter := "?"
	for _, r := range strings.TrimPrefix(strings.TrimPrefix(site, "https://"), "www.") {
		letter = strings.ToUpper(string(r))
		break
	}
	return func() {
		ui.Row(c.Key("af-pebble:"+key)).Size(40, 40).Radius(20).Background(t.SurfaceSunken).Shadow(0, 2, 0, 0, t.Line).
			Justify(ui.Center).AlignItems(ui.Center).AccessHidden(true).Children(func() {
			uiText(c, letter).Font(t.Display).FontSize(t.LG).FontWeight(800).TextColor(t.InkSoft)
		})
	}
}

// afCardTone is a card's tone by its network, the web's .af-card colours.
func (a *App) afCardTone(brand string) theme.StateColors {
	t := a.T
	switch brand {
	case "mastercard", "jcb":
		return t.NeedsYou
	case "amex", "discover":
		return t.Done
	case "unionpay":
		return t.Failed
	}
	return t.Working
}

func (a *App) afCardTile(c *ui.Context, key string, x protocol.SavedView) func() {
	t := a.T
	tone := a.afCardTone(x.Brand)
	return func() {
		ui.Column(c.Key("af-card:"+key)).Size(40, 28).Radius(6).Background(tone.Surface).Shadow(0, 2, 0, 0, tone.Ledge).
			Padding(2, 4).Justify(ui.End).AlignItems(ui.End).AccessHidden(true).Children(func() {
			if x.Last4 != "" {
				uiText(c, x.Last4).Font(t.Mono).FontSize(t.XS - 1).FontWeight(700).TextColor(tone.Ink).SingleLine()
			}
		})
	}
}

func (a *App) clearForm() {
	s := &a.af
	s.site, s.user, s.password, s.name, s.number, s.exp = "", "", "", "", "", ""
	s.keyEnv, s.missing = "", ""
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
	// An expiry takes its slash as it is typed (D404, D408): 0829 and 829
	// read 08/29 at once, as on the web, not only once saved.
	was, shaped := *v, false
	if key == "exp" {
		if s := shapeExp(*v); s != *v {
			*v, shaped = s, true
		}
	}
	ui.Column(c.Key("af-field:" + key)).Gap(t.S1).Children(func() {
		uiText(c, label).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		in := ui.TextInput(c.Key("af-input:"+key), v).Placeholder(placeholder).Label(label).
			FontSize(t.MD).Padding(t.S3, t.S4).Radius(t.RadiusSM).Background(t.SurfaceSunken).Border(1, t.LineSoft)
		if secret {
			in.Password()
		}
		if shaped {
			// The caret stays after the digit it was after: the end, as typed.
			// (829's month gains its leading 0, a digit before them all.)
			_, at := in.TextAnchorCaret()
			n := digitsBefore(was, at)
			if n > 0 {
				n += digitsBefore(*v, len([]rune(*v))) - digitsBefore(was, len([]rune(was)))
			}
			n = caretAfterDigits(*v, n)
			in.SetTextSelection(n, n)
		}
	})
}

var expDigits = regexp.MustCompile(`^\d{3,4}$`)

// shapeExp puts an expiry's slash in once its digits can only mean one
// month and year (D404, the web's shapeExp): four digits (0829 → 08/29),
// or three starting 2 to 9, a one-digit month (829 → 08/29). Anything
// else stays as typed; parseExp still reads it on Save.
func shapeExp(s string) string {
	if !expDigits.MatchString(s) {
		return s
	}
	if len(s) == 4 {
		return s[:2] + "/" + s[2:]
	}
	if s[0] >= '2' {
		return "0" + s[:1] + "/" + s[1:]
	}
	return s
}

// digitsBefore counts the digits before rune at of s.
func digitsBefore(s string, at int) int {
	n := 0
	for i, r := range []rune(s) {
		if i >= at {
			break
		}
		if r >= '0' && r <= '9' {
			n++
		}
	}
	return n
}

// caretAfterDigits is the rune offset in s just after its nth digit (0:
// the start), the end when s has fewer.
func caretAfterDigits(s string, n int) int {
	rs := []rune(s)
	if n == 0 {
		return 0
	}
	seen := 0
	for i, r := range rs {
		if r >= '0' && r <= '9' {
			seen++
			if seen == n {
				return i + 1
			}
		}
	}
	return len(rs)
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
		var need string
		var put protocol.SavedInput
		if kind == "signin" {
			a.afInput(c, "site", a.L.T("af.signin.site"), &s.site, "github.com", false)
			a.afInput(c, "user", a.L.T("af.signin.user"), &s.user, "", false)
			a.afInput(c, "password", a.L.T("af.signin.password"), &s.password, keep, true)
			ok = s.site != "" && s.user != "" && (x != nil || s.password != "")
			need = firstMissing(s.site == "", "af.signin.site", s.user == "", "af.signin.user", x == nil && s.password == "", "af.signin.password")
			put = protocol.SavedInput{Kind: "signin", Site: s.site, Username: s.user, Password: s.password}
		} else {
			ph := "4242 4242 4242 4242"
			if x != nil {
				ph = a.L.T("af.keep.with", "•••• "+x.Last4) // D296: a phrase
			}
			a.afInput(c, "number", a.L.T("af.card.number"), &s.number, ph, false)
			a.afInput(c, "exp", a.L.T("af.card.exp"), &s.exp, "08/29", false)
			a.afInput(c, "name", a.L.T("af.card.name"), &s.name, "", false)
			uiText(c, a.L.T("af.card.nocvc")).FontSize(t.SM).TextColor(t.InkMuted)
			mm, yy, good := parseExp(s.exp)
			ok = good && s.name != "" && (x != nil || s.number != "")
			need = firstMissing(x == nil && s.number == "", "af.card.number", !good, "af.card.exp", s.name == "", "af.card.name")
			if good {
				put = protocol.SavedInput{Kind: "card", Name: s.name, Number: s.number, ExpMonth: mm, ExpYear: yy}
			}
		}
		if x != nil {
			put.ID = x.ID
		}
		if f := a.savedFrame(); f != nil && !s.sentAt.IsZero() && f.Reason != "" {
			uiText(c, a.L.T("af.err."+f.Reason)+" ("+f.Message+")").FontSize(t.SM).TextColor(t.Failed.Ink)
		}
		a.afMissing(c, need)
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			if a.button(c, a.L.T("af.save"), btnPrimary, t.ControlSM, t.Surface) {
				if !ok {
					s.missing = need
				} else {
					a.send(protocol.SavedPut{T: "saved_put", Item: put})
					s.sentAt = a.Now()
				}
			}
			if a.button(c, a.L.T("af.cancel"), btnSecondary, t.ControlSM, t.Surface) {
				s.editing = ""
				a.clearForm()
			}
			ui.Box(c).Grow(1)
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
				ph = a.L.T("af.keep.with", ph)
			}
			a.afInput(c, "d:"+k, a.L.T("af.d."+k), &v, ph, false)
			s.details[k] = v
		}
		ui.Row(c).Gap(t.S3).Children(func() {
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
			if a.button(c, a.L.T("af.cancel"), btnSecondary, t.ControlSM, t.Surface) {
				s.editing = ""
				a.clearForm()
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
	ink := t.Ink
	if u.What == "declined" || u.What == "refused" {
		ink = t.InkMuted
	}
	// D289: a line of the group, not a card in it; D291: the site its own element.
	ui.Row(c.Key("af-use:"+strconv.Itoa(i))).Gap(t.S3).Padding(t.S1, 0).AlignItems(ui.Center).Children(func() {
		ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
			uiText(c, what).FontSize(t.SM).FontWeight(700).TextColor(ink)
			if u.Site != "" {
				uiText(c, u.Site).FontSize(t.XS).TextColor(t.InkMuted)
			}
			if u.Task != "" {
				uiText(c, a.L.T("af.use.task", u.Task)).FontSize(t.XS).TextColor(t.InkMuted)
			}
		})
		uiText(c, a.agoLong(u.At)).FontSize(t.XS).TextColor(t.InkMuted)
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
				uiText(c, a.L.T(k)).FontSize(t.SM).TextColor(t.InkMuted).Width(72)
				uiText(c, v).FontSize(t.SM).FontWeight(700).Grow(1).MinWidth(0)
			})
		}
		uiText(c, amount).FontSize(t.XL).FontWeight(800)
		if p.What != "" {
			fact("pay.what", p.What)
		}
		fact("pay.where", p.Site)
		if p.FirstHere {
			// D296: its own line under the merchant, never joined to it.
			ui.Row(c).Gap(t.S3).Children(func() {
				ui.Box(c).Width(72).Shrink(0)
				uiText(c, a.L.T("pay.first")).FontSize(t.SM).FontWeight(600).TextColor(t.InkSoft).Grow(1).MinWidth(0)
			})
		}
		fact("pay.card", p.Card)
	})
	if d.Resolved != nil || d.Pending != "" {
		msg := a.L.T("pay.resolved.hold")
		if (d.Resolved != nil && d.Resolved.Option == "go") || d.Pending == "go" {
			msg = a.L.T("pay.resolved", amount)
		}
		uiText(c, msg).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
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
	uiText(c, a.L.T("pay.why")).FontSize(t.XS).TextColor(t.InkMuted)
	ready := !p.NeedsCvc || regexp.MustCompile(`^\d{3,4}$`).MatchString(code)
	ui.Row(c.Key("pay-go:" + d.DecisionID)).Gap(t.S3).AlignItems(ui.Center).Children(func() {
		if a.buttonFor(c, a.L.T("pay.go", amount), p.Site, btnPrimary, st.height, st.quietBg) && ready {
			if d := a.S.Decisions[d.DecisionID]; d != nil {
				d.Pending, d.AnsweredAt = "go", a.Now()
				a.decideSent = append(a.decideSent, d.DecisionID)
			}
			a.markRead()
			a.send(protocol.DecidePay{T: "decide", DecisionID: d.DecisionID, Option: "go", Cvc: code})
			delete(a.af.cvc, d.DecisionID)
		}
		if a.buttonFor(c, a.L.T("pay.hold"), p.Site, btnSecondary, st.height, st.quietBg) {
			a.Decide(d.DecisionID, "hold", "")
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
	uiText(c, a.L.T(why)).FontSize(t.SM).TextColor(t.InkMuted)
	if d.Resolved != nil || d.Pending != "" {
		msg := a.L.T("fill.resolved.hold")
		if (d.Resolved != nil && d.Resolved.Option == "go") || d.Pending == "go" {
			msg = a.L.T("fill.resolved")
		}
		uiText(c, msg).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		return
	}
	ui.Row(c.Key("fill-go:" + d.DecisionID)).Gap(t.S3).AlignItems(ui.Center).Children(func() {
		if a.buttonFor(c, a.L.T("fill.go"), f.Site, btnPrimary, st.height, st.quietBg) {
			a.Decide(d.DecisionID, "go", "")
		}
		if a.buttonFor(c, a.L.T("fill.hold"), f.Site, btnSecondary, st.height, st.quietBg) {
			a.Decide(d.DecisionID, "hold", "")
		}
	})
}
