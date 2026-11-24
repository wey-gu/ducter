package views

import (
	"errors"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/remote"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D520: a paired Mac leaves its pairing only on the home's own signed word.
// Every other loss (a home restarting behind its proxy, a Mac waking, a
// network change, a long outage) keeps the saved connection and the
// window as it was: a quiet line first, then, after LongOutage, a notice
// that says what is wrong, with Try now.

// linkState is the window's link to its home, as the person meets it.
type linkState int

const (
	linkUp   linkState = iota // connected, or still in a launch's quiet first moment
	linkBack                  // lost a moment ago: the header says it is reconnecting
	linkLost                  // lost for LongOutage: a notice says what is wrong
	linkGone                  // the home said this Mac is disconnected: the connect card
)

// LongOutage is how long a lost link is only said quietly.
var LongOutage = 30 * time.Second

// Linked is the client's status, applied on the UI thread (main's
// OnStatus, and the tests' fake homes): the one place that decides whether
// the connect card shows.
func (a *App) Linked(st client.Status, err error) {
	a.Status = st
	switch st {
	case client.Connecting:
		a.linkTry = a.Now()
	case client.Connected:
		a.Unauthorized, a.goneWhy = false, ""
		a.downAt = time.Time{}
	case client.Disconnected:
		a.Failed = true
		if a.downAt.IsZero() {
			a.downAt = a.Now()
		}
	}
	if err != nil {
		a.StatusErr = err.Error()
	}
	if errors.Is(err, client.ErrUnauthorized) {
		a.Unauthorized = true
		var g *client.GoneError
		if errors.As(err, &g) {
			a.goneWhy = g.Reason
		}
		// The card comes back with the address it had: only the code is new.
		if a.conn.address == "" && a.URL != "" {
			a.conn.address = remote.BaseOf(a.URL)
		}
	}
}

// link is the link's state now.
func (a *App) link() linkState {
	switch {
	case a.Unauthorized:
		return linkGone
	case a.downAt.IsZero() || a.Status == client.Connected:
		return linkUp
	case a.Now().Sub(a.downAt) >= LongOutage:
		return linkLost
	}
	return linkBack
}

// linkHome names the home in the link's words: its own name when it is
// elsewhere ("hel"), else Ducter.
func (a *App) linkHome() string {
	if h := a.homeElsewhere(); h != "" {
		return h
	}
	return "Ducter"
}

// linkRemote: the home is on another computer (the connect card is a way
// back from a long outage there).
func (a *App) linkRemote() bool {
	return a.URL != "" && !isLocalURL(a.URL) && a.Backend == nil
}

// linkWords is the header's line while the link is down ("" while up).
func (a *App) linkWords() string {
	switch a.link() {
	case linkBack:
		return a.L.T("conn.reconnecting", a.linkHome())
	case linkLost:
		return a.L.T("conn.offline", a.linkHome())
	}
	return ""
}

// linkTick redraws when a quiet loss becomes a long one, so the plain
// words come on their own.
func (a *App) linkTick(c *ui.Context) {
	if a.link() == linkBack {
		c.After(LongOutage - a.Now().Sub(a.downAt) + 10*time.Millisecond)
	}
}

// linkLostNotice is the long outage said plainly above the composer: what
// is wrong, where to look, when it tries again, Try now; for a home
// elsewhere, a quiet way to the connect card too.
func (a *App) linkLostNotice(c *ui.Context) bool {
	if a.link() != linkLost {
		return false
	}
	t := a.T
	a.aboveComposer(c, func() { a.linkLostBody(c, t.Surface) })
	return true
}

func (a *App) linkLostBody(c *ui.Context, on ui.Color) {
	t := a.T
	home := a.linkHome()
	title, body := a.L.T("conn.lost.title.local"), a.L.T("conn.lost.body.local")
	if a.linkRemote() {
		title, body = a.L.T("conn.lost.title", home), a.L.T("conn.lost.body", home)
	}
	a.notice(c, "link-lost", noticeInfo, func() {
		ui.Box(c.Key("link-peb")).Size(18, 18).Shrink(0).AccessHidden(true).Draw(drawPebble(t.InkMuted, a.linkTry, false))
		if !c.Preferences().ReduceMotion && a.Now().Sub(a.linkTry) < pebbleBeat {
			c.After(pebbleBeat - a.Now().Sub(a.linkTry))
		}
	}, func() {
		uiText(c, title).FontSize(t.SM).FontWeight(700).LineHeight(1.45).TextColor(t.Ink)
		uiText(c, body).FontSize(t.SM).LineHeight(1.45).TextColor(t.InkSoft)
		uiText(c.Key("link-next"), a.retryLine(c)).FontSize(t.XS).TextColor(t.InkMuted)
	}, func() {
		if a.linkRemote() && a.Pair != nil && a.button(c, a.L.T("conn.lost.again"), btnText, t.ControlSM, on) {
			a.openConnect()
			if a.conn.address == "" {
				a.conn.address = remote.BaseOf(a.URL)
			}
		}
		if a.RetryNow != nil && a.button(c, a.L.T("firstrun.retry"), btnSecondary, t.ControlSM, on) {
			a.RetryNow()
		}
	})
}

// goneLine is the connect card's one line when the home said this Mac is
// disconnected, in its words: disconnected there, or no longer known.
func (a *App) goneLine() string {
	home := a.homeElsewhere()
	if home == "" {
		home = hostOf(a.URL) // a tunnel to loopback: the address is all there is
	}
	if a.goneWhy == string(remote.StandingRevoked) {
		return a.L.T("connect.revoked", home)
	}
	return a.L.T("connect.unknown", home)
}

// reachingHome is a launch's card while the home elsewhere hasn't answered
// yet (nothing of the conversation is on this Mac to show meanwhile): it
// says it is reaching the home, then, after LongOutage, what is wrong. Never
// `ducter up` (that home isn't this Mac's to start) and never the connect
// card unless asked.
func (a *App) reachingHome(c *ui.Context) {
	t := a.T
	a.bareChrome(c)
	home := a.linkHome()
	lost := a.link() == linkLost
	a.linkTick(c)
	ui.Column(c).Grow(1).MinHeight(0).Justify(ui.Center).AlignItems(ui.Center).Padding(8, 32, 8+ChromeH, 32).Children(func() {
		card := ui.Column(c.Key("reaching")).Width(560).MaxWidthPercent(100).Padding(t.S6, t.S7, t.S6, t.S7).Gap(t.S4).
			Radius(t.RadiusXL).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Role(ui.RoleStatus)
		a.enter(c, card)
		card.Children(func() {
			a.avatar(c, theme.Idle, 88)
			if lost {
				a.heading(c, a.L.T("conn.lost.title", home), t.XXL)
				uiText(c, a.L.T("conn.lost.body", home)).FontSize(t.LG).LineHeight(1.55).TextColor(t.InkSoft)
			} else {
				a.heading(c, a.L.T("conn.reaching", home), t.XXL)
				uiText(c, a.L.T("conn.reaching.body")).FontSize(t.LG).LineHeight(1.55).TextColor(t.InkSoft)
			}
			ui.Box(c).Height(1).Background(t.LineSoft).Margin(4, 0)
			ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
				ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
					uiText(c, a.retryLine(c)).FontSize(t.MD).FontWeight(700)
					uiText(c, a.L.T("firstrun.where", remote.BaseOf(a.URL))).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkMuted).SingleLine()
				})
				if a.RetryNow != nil && a.button(c, a.L.T("firstrun.retry"), btnSecondary, t.ControlMD, t.Surface) {
					a.RetryNow()
				}
			})
			if lost && a.Pair != nil { // never offered over a moment's blip
				ui.Box(c).Height(1).Background(t.LineSoft).Margin(4, 0)
				if a.button(c, a.L.T("conn.lost.again"), btnText, t.ControlMD, t.Surface) {
					a.openConnect()
					if a.conn.address == "" {
						a.conn.address = remote.BaseOf(a.URL)
					}
				}
			}
		})
	})
}
