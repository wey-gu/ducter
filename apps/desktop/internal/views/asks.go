package views

import (
	"errors"
	"math"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/local"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// The gentle asks after the first result: one at a time, never at launch,
// each with 稍后 / Later that keeps it away for days and asks once more at
// most. Order: notifications (Ducter keeps working with the window
// closed, so this is how it reaches you), then the phone, on a later
// result. The "ducter in Terminal" offer waits while one shows.

const (
	askNotify = "notify"
	askPhone  = "phone"
	askMem    = "mem"
)

type askState struct {
	// shown is the ask on screen this session ("" none); answered: the
	// asks put away this session.
	shown    string
	answered map[string]bool
	// result is what happened after yes ("ok", "denied", "noaddress").
	result string
	// answeredAt is when the last ask was answered: the next waits for a
	// result after it.
	answeredAt time.Time
	busy       bool
	pairAsked  bool
	clients    int // paired clients when the code was asked for
}

// askLine shows the one ask that may show now (false if none).
func (a *App) askLine(c *ui.Context) bool {
	if a.Backend == nil || a.Local == nil || !a.S.Welcomed {
		return false
	}
	s := &a.asks
	if s.shown == "" {
		s.shown = a.nextAsk()
		if s.shown == "" {
			return false
		}
	}
	t := a.T
	ui.Row(c).Justify(ui.Center).Padding(0, 24).Children(func() {
		card := ui.Column(c.Key("ask:"+s.shown)).Grow(1).MaxWidth(convWidth).Gap(10).Padding(12, 16, 12, 12).
			Radius(t.RadiusLG).Background(t.Surface).Role(ui.RoleStatus)
		a.enter(c, card)
		card.Children(func() {
			switch s.shown {
			case askNotify:
				a.notifyAsk(c)
			case askPhone:
				a.phoneAsk(c)
			}
		})
	})
	return true
}

// nextAsk picks the one ask that may show now.
func (a *App) nextAsk() string {
	s := &a.asks
	if a.firstDone != nil && !a.firstDone.at.IsZero() {
		return "" // the first-result line has the stage
	}
	if !a.Local.FirstResultSeen() || a.doneAt.IsZero() {
		return "" // nothing has come back yet in this session: no asks at launch
	}
	if !s.answeredAt.IsZero() && !a.doneAt.After(s.answeredAt) {
		return "" // one ask per result
	}
	now := a.Now()
	if a.Desktop != nil && !s.answered[askNotify] && a.Local.MayAsk(askNotify, now, AskAgainAfter) {
		return askNotify
	}
	if !s.answered[askPhone] && a.Local.MayAsk(askPhone, now, AskAgainAfter) {
		return askPhone
	}
	return ""
}

func (a *App) answer(name, answer string) {
	s := &a.asks
	a.Local.Answer(name, answer, a.Now())
	if s.answered == nil {
		s.answered = map[string]bool{}
	}
	s.answered[name] = true
	s.shown, s.result, s.answeredAt = "", "", a.Now()
}

func (a *App) askRow(c *ui.Context, p theme.Presence, title, body string, actions func()) {
	t := a.T
	ui.Row(c).Gap(12).AlignItems(ui.Center).Children(func() {
		if bmp := theme.Art(p, 96); bmp != nil {
			ui.Image(c, bmp).Size(48, 48).Shrink(0)
		}
		ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
			ui.Text(c, title).FontSize(t.MD).FontWeight(700).LineHeight(1.4)
			if body != "" {
				ui.Text(c, body).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.45)
			}
		})
		actions()
	})
}

// notifyAsk: "Tell you with a notification when I need you?" Yes shows one
// right away, which is when macOS asks; its answer comes back here.
func (a *App) notifyAsk(c *ui.Context) {
	t := a.T
	s := &a.asks
	name := a.personaName()
	switch s.result {
	case "ok":
		a.askRow(c, theme.Done, a.L.T("notify.ok"), "", func() {
			if a.button(c, a.L.T("cli.ok"), btnSecondary, 40, t.Surface) {
				a.answer(askNotify, "yes")
			}
		})
	case "denied":
		a.askRow(c, theme.Idle, a.L.T("notify.denied"), a.L.T("notify.denied.body"), func() {
			if a.button(c, a.L.T("ask.later"), btnText, 40, t.Surface) {
				a.answer(askNotify, "later")
			}
			if a.button(c, a.L.T("notify.open"), btnPrimary, 40, t.Surface) {
				_ = a.Backend.OpenSettings(local.NotificationsFor(a.Backend.BundleID()))
				a.answer(askNotify, "yes") // they know where it is now; don't ask again
			}
		})
	default:
		a.askRow(c, theme.NeedsYou, a.L.T("notify.ask"), a.L.T("notify.ask.body"), func() {
			if a.button(c, a.L.T("ask.later"), btnText, 40, t.Surface) {
				a.answer(askNotify, "later")
			}
			if a.button(c, a.L.T("notify.yes"), btnPrimary, 40, t.Surface) && !s.busy {
				s.busy = true
				var err error
				a.async(func() { err = a.Desktop.Notify(a.L.T("notify.test.title", name), a.L.T("notify.test.body")) }, func() {
					s.busy = false
					switch {
					case err == nil:
						s.result = "ok"
					case errors.Is(err, ErrNotificationsDenied):
						s.result = "denied"
					default:
						s.result = "ok" // not a refusal; nothing to fix
					}
				})
			}
		})
	}
}

// phoneAsk: "Find me on your phone too": the pairing QR in place, and an
// honest line when the phone can't reach this Mac.
func (a *App) phoneAsk(c *ui.Context) {
	t := a.T
	s := &a.asks
	if !s.pairAsked {
		a.askRow(c, theme.Idle, a.L.T("phone.ask"), a.L.T("phone.ask.body"), func() {
			if a.button(c, a.L.T("ask.later"), btnText, 40, t.Surface) {
				a.answer(askPhone, "later")
			}
			if a.button(c, a.L.T("phone.show"), btnPrimary, 40, t.Surface) {
				s.pairAsked = true
				if a.S.Reach != nil {
					s.clients = len(a.S.Reach.Clients)
				}
				a.S.PairCode = nil
				a.send(protocol.PairCodeReq{T: "pair_code"})
			}
		})
		return
	}
	pc := a.S.PairCode
	if pc == nil {
		ui.Text(c, a.L.T("devices.loading")).FontSize(t.SM).TextColor(t.InkMuted)
		return
	}
	done := func() {
		if a.button(c, a.L.T("cli.ok"), btnSecondary, 40, t.Surface) {
			a.answer(askPhone, "yes")
		}
	}
	if pc.Address == "" || len(pc.QR) == 0 {
		a.askRow(c, theme.Idle, a.L.T("phone.noaddress"), a.L.T("phone.noaddress.body"), done)
		return
	}
	paired := a.S.Reach != nil && len(a.S.Reach.Clients) > s.clients
	ui.Row(c).Gap(16).AlignItems(ui.Center).Children(func() {
		qrBox(c, pc.QR, 132, t.Ink, t.Surface)
		ui.Column(c).Grow(1).MinWidth(0).Gap(6).Children(func() {
			if paired {
				ui.Text(c, a.L.T("phone.paired")).FontSize(t.MD).FontWeight(700)
				return
			}
			ui.Text(c, a.L.T("phone.scan")).FontSize(t.MD).FontWeight(700).LineHeight(1.4)
			ui.Text(c, a.L.T("pair.code")+" · "+pc.Code).Font(t.Mono).FontSize(t.SM).TextColor(t.InkSoft).Selectable()
			if exp := store.ParseTime(pc.ExpiresAt); !exp.IsZero() {
				left := exp.Sub(a.Now())
				if left > 0 {
					ui.Text(c, a.L.T("pair.once", int(math.Ceil(left.Minutes())))).FontSize(t.XS).TextColor(t.InkMuted)
					c.After(min(left, time.Minute))
				}
			}
			ui.Text(c, a.L.T("pair.waiting")).FontSize(t.SM).TextColor(t.InkMuted)
		})
		done()
	})
}

// NeedsYouNotice is the notification for something new waiting, when the
// person said yes to notifications ("" when not to send).
func (a *App) NeedsYouNotice(n int) (title, body string) {
	if a.Local == nil || a.Local.Asked(askNotify).Answer != "yes" || n <= 0 {
		return "", ""
	}
	// The Partner page's switch and quiet hours hold for this Mac too (D71).
	if st := a.S.Settings; st != nil && (!st.Notify || InQuiet(a.Now(), st.Quiet)) {
		return "", ""
	}
	return a.L.T("notify.needs", a.personaName()), a.L.T("notify.needs.body", n)
}

// InQuiet reports whether at falls in the quiet hours (in their zone; an
// overnight range like 23:00–08:00 wraps midnight), as core's inQuiet.
func InQuiet(at time.Time, q *protocol.QuietHours) bool {
	if q == nil || q.Start == q.End {
		return false
	}
	loc, err := time.LoadLocation(q.TZ)
	if err != nil {
		loc = time.Local
	}
	l := at.In(loc)
	now := l.Hour()*60 + l.Minute()
	mins := func(s string) int {
		tm, err := time.Parse("15:04", s)
		if err != nil {
			return -1
		}
		return tm.Hour()*60 + tm.Minute()
	}
	s, e := mins(q.Start), mins(q.End)
	if s < 0 || e < 0 {
		return false
	}
	if s < e {
		return now >= s && now < e
	}
	return now >= s || now < e
}
