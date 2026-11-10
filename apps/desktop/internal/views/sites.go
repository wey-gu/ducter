package views

import (
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// Devices › 上网 on a server (D151): what's in the way of Ducter's own
// browser (the one command, or why the install failed, with Try again),
// and once it is on, 已登录的网站 / Signed-in sites with 退出 / Sign out
// per site and 全部清掉 / Clear all.

type sitesState struct {
	askedAt  time.Time
	clearing bool // 全部清掉 asked; the confirm line shows
}

// ducterBrowserTrouble says why Ducter's browser isn't ready here, and the
// way on: a command to run (libraries), or another try.
func (a *App) ducterBrowserTrouble(c *ui.Context, dv *protocol.DeviceView, ab *protocol.DeviceAbility) {
	t := a.T
	switch ab.Reason {
	case "browser_deps":
		a.reasonLine(c, a.L.T("ability.reason.browser_deps"))
		a.commandBoxSized(c, ab.Detail, 12)
	default:
		a.reasonLine(c, a.L.T("ability.reason.browser_failed", ab.Detail))
	}
	if dv.State == protocol.DeviceAwake && a.buttonFor(c, a.L.T("ability.retry"), a.L.T("ability.web"), btnSecondary, t.ControlMD, t.Surface) {
		a.send(protocol.AbilityReq{T: "ability", Device: dv.ID, Ability: protocol.AbilityWeb, On: true})
	}
}

// tryRow is 试一下 / Try it (D154): one tap opens the live view on a
// harmless page, so the user sees Ducter's own browser working.
func (a *App) tryRow(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	if dv.State != protocol.DeviceAwake {
		return
	}
	ui.Row(c.Key("try:" + dv.ID)).Gap(t.S3).AlignItems(ui.Center).Children(func() {
		ui.Text(c, a.L.T("web.try.about")).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.5).Grow(1).MinWidth(0)
		if a.buttonFor(c, a.L.T("web.try"), a.L.T("ability.web"), btnSecondary, t.ControlSM, t.Surface) {
			a.OpenTry()
		}
	})
}

// sitesList is 已登录的网站 / Signed-in sites: asked for when it shows
// (and again after a minute), each row with 退出 / Sign out.
func (a *App) sitesList(c *ui.Context) {
	t := a.T
	s := &a.sites
	if s.askedAt.IsZero() || a.Now().Sub(s.askedAt) > time.Minute {
		s.askedAt = a.Now()
		a.send(protocol.BrowserSitesReq{T: "browser_sites"})
	}
	f := a.S.BrowserSites
	ui.Column(c.Key("sites")).Gap(t.S2).Children(func() {
		ui.Text(c, a.L.T("sites.title")).FontSize(t.XS).FontWeight(800).LetterSpacing(1.2).TextColor(t.InkMuted)
		if f == nil || len(f.Sites) == 0 {
			ui.Text(c, a.L.T("sites.none")).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5)
			return
		}
		for _, site := range f.Sites {
			a.siteRow(c, site)
		}
		if s.clearing {
			ui.Text(c, a.L.T("sites.clear.ask")).FontSize(t.SM).TextColor(t.Ink).LineHeight(1.5)
			ui.Row(c).Gap(t.S3).Children(func() {
				if a.button(c, a.L.T("sites.keep"), btnSecondary, t.ControlSM, t.Surface) {
					s.clearing = false
				}
				if a.buttonFor(c, a.L.T("sites.clear.go"), a.L.T("sites.title"), btnPrimary, t.ControlSM, t.Surface) {
					s.clearing = false
					a.send(protocol.BrowserSitesReq{T: "browser_sites_clear"})
				}
			})
		} else if a.buttonFor(c, a.L.T("sites.clear"), a.L.T("sites.title"), btnText, t.ControlSM, t.Surface) {
			s.clearing = true
		}
	})
}

func (a *App) siteRow(c *ui.Context, site protocol.SiteView) {
	t := a.T
	line := a.L.T("sites.gone")
	if site.Cookies > 0 {
		line = a.L.T("sites.when", a.agoLong(site.SignedInAt))
	}
	ui.Row(c.Key("site:"+site.Site)).Gap(t.S3).AlignItems(ui.Center).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.SurfaceSunken).Children(func() {
		ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
			ui.Text(c, site.Site).FontSize(t.SM).FontWeight(700).SingleLine()
			ui.Text(c, line).FontSize(t.XS).TextColor(t.InkMuted)
		})
		if a.buttonFor(c, a.L.T("sites.signout"), site.Site, btnText, t.ControlSM, t.SurfaceSunken) {
			a.send(protocol.BrowserSitesReq{T: "browser_site_signout", Site: site.Site})
		}
	})
}
