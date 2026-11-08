package views

import (
	"errors"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/theme"

	"github.com/wey-gu/ducter/apps/desktop/internal/remote"
)

// PairCommand is what prints a pairing code on the machine running Ducter.
const PairCommand = "ducter pair"

// connectState is the "Connect to your Ducter" card: an address and a
// one-time pairing code, traded for a device token (D54).
type connectState struct {
	open          bool
	address, code string
	busy          bool
	err           string
}

// openConnect shows the connect card, prefilled with what a pasted link held.
func (a *App) openConnect() {
	a.conn.open = true
	a.conn.err = ""
}

// submitConnect pairs off the UI thread; Pair (set by main) saves the
// token and points the client at the new address.
func (a *App) submitConnect() {
	if a.conn.busy || a.Pair == nil {
		return
	}
	base, code, err := remote.Parse(a.conn.address, a.conn.code)
	if err != nil {
		a.conn.err = a.connectError(err, a.conn.address)
		return
	}
	if code != "" {
		a.conn.code = code
	}
	a.conn.busy, a.conn.err = true, ""
	done := func(err error) {
		a.conn.busy = false
		if err != nil {
			a.conn.err = a.connectError(err, base)
			return
		}
		a.conn = connectState{}
		a.Unauthorized = false
		a.Failed = false
		a.URL = remote.WSURL(base)
	}
	if a.Win == nil { // tests: inline
		done(a.Pair(base, code))
		return
	}
	go func() {
		err := a.Pair(base, code)
		a.Win.Update(func() { done(err) })
	}()
}

func (a *App) connectError(err error, where string) string {
	host := where
	if i := strings.Index(host, "://"); i >= 0 {
		host = host[i+3:]
	}
	switch {
	case errors.Is(err, remote.ErrBadCode):
		return a.L.T("connect.err.code")
	case errors.Is(err, remote.ErrLocked):
		return a.L.T("connect.err.locked")
	case errors.Is(err, remote.ErrNoCode):
		return a.L.T("connect.err.nocode")
	case errors.Is(err, remote.ErrBadAddress):
		return a.L.T("connect.err.address")
	case errors.Is(err, remote.ErrNotDucter):
		return a.L.T("connect.err.notducter", host)
	default:
		return a.L.T("connect.err.unreachable", host)
	}
}

// connect is the card itself: calm, one step, the literal words.
func (a *App) connect(c *ui.Context) {
	t := a.T
	ui.Column(c).Grow(1).Justify(ui.Center).AlignItems(ui.Center).Padding(32).Children(func() {
		card := ui.Column(c.Key("connect")).Width(560).MaxWidthPercent(100).Padding(36, 40, 32, 40).Gap(16).
			Radius(t.RadiusXL).Background(t.Surface).Shadow(0, t.PressCard.Offset, 0, 0, t.PressCard.Color)
		a.enter(c, card)
		card.Children(func() {
			a.avatar(c, theme.Idle, 88)
			ui.Text(c, a.L.T("connect.title")).FontSize(28).FontWeight(800).LetterSpacing(-0.4)
			if a.Unauthorized {
				ui.Text(c, a.L.T("connect.revoked")).FontSize(t.MD).LineHeight(1.5).TextColor(t.NeedsYou.Ink)
			}
			ui.Text(c, a.L.T("connect.body")).FontSize(t.LG).LineHeight(1.55).TextColor(t.InkSoft)
			a.commandBox(c, PairCommand)

			a.field(c, "address", a.L.T("connect.address"), &a.conn.address, a.L.T("connect.address.placeholder"), "")
			a.field(c, "code", a.L.T("connect.code"), &a.conn.code, a.L.T("connect.code.placeholder"), a.L.T("connect.code.hint"))

			if a.conn.err != "" {
				ui.Text(c, a.conn.err).FontSize(t.MD).LineHeight(1.5).TextColor(t.NeedsYou.Ink).Role(ui.RoleAlert)
			}
			ui.Row(c).Gap(12).AlignItems(ui.Center).Margin(6, 0, 0, 0).Children(func() {
				label := a.L.T("connect.go")
				if a.conn.busy {
					label = a.L.T("connect.busy")
				}
				if a.button(c, label, btnPrimary, 50, t.Bg) {
					a.submitConnect()
				}
				if !a.Unauthorized && a.button(c, a.L.T("connect.back"), btnText, 50, t.Surface) {
					a.conn.open = false
				}
				if a.conn.busy {
					a.retryPulse(c)
				}
			})
			ui.Text(c, a.L.T("connect.safe")).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5)
		})
	})
}

// field is one labelled single-line input on the connect card.
func (a *App) field(c *ui.Context, key, label string, value *string, placeholder, hint string) {
	t := a.T
	ui.Column(c.Key("field:" + key)).Gap(6).Children(func() {
		ui.Text(c, label).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		ui.TextInput(c.Key("input:"+key), value).Placeholder(placeholder).Label(label).
			Font(t.Mono).FontSize(16).Padding(12, 16).Radius(t.RadiusSM).
			Background(t.SurfaceSunken).Border(1, t.LineSoft).
			OnSubmit(a.submitConnect)
		if hint != "" {
			ui.Text(c, hint).FontSize(t.XS).TextColor(t.InkMuted)
		}
	})
}
