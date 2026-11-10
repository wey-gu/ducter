package views

import (
	"context"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
	"github.com/wey-gu/ducter/apps/desktop/internal/update"
)

// appUpdateSection is the update block of Settings › Updates and about (D72):
// this version and where the next one stands, Check now, Restart to update
// a ready one, and install on quit. The About tab places it first, then
// D148's updateSection (every computer's version, devupdate.go): each is a
// self-contained slot.
func (a *App) appUpdateSection(c *ui.Context) {
	t := a.T
	u := a.Updates
	if u == nil {
		return // the version is in the About card
	}
	ss := &a.settings
	st := u.Status()
	line, why := a.L.T("settings.update.version", firstNonEmpty(st.Current, a.versionText())), ""
	switch st.State {
	case update.Idle:
		if st.Installed != "" {
			line = a.L.T("update.installed", st.Installed)
		}
	case update.UpToDate:
		line = a.L.T("update.uptodate", st.Current)
	case update.Checking:
		line = a.L.T("menu.update.checking")
	case update.Downloading:
		line = a.L.T("menu.update.downloading", st.Version)
	case update.Ready:
		line, why = a.L.T("update.line.ready", st.Version), a.L.T("update.ready.body")
	case update.Available:
		line, why = a.L.T("update.line.available", st.Version), a.L.T("update.reason."+string(st.Reason))
	case update.Failed:
		line, why = a.L.T("update.failed"), a.L.T("update.reason."+string(st.Reason))
	case update.NoFeed:
		line, why = a.L.T("update.nofeed"), a.L.T("update.nofeed.body")
	}
	busy := ss.updating || st.State == update.Checking || st.State == update.Downloading
	if busy {
		c.After(500 * time.Millisecond)
	}
	if st.State == update.Ready && st.Reason == update.ReasonOwner {
		why = a.L.T("update.reason.owner")
	}
	if !(why != "" && st.Reason != update.ReasonNone || st.State == update.Ready || st.State == update.NoFeed) {
		why = ""
	}
	help := why
	if !st.CheckedAt.IsZero() {
		checked := a.L.T("update.checked", a.agoLong(st.CheckedAt.UTC().Format(time.RFC3339)))
		if help == "" {
			help = checked
		} else {
			help += " " + checked
		}
	}
	a.group(c, "update", a.L.T("settings.update.title"), "", func() {
		a.row(c, "update", line, help, func() {
			if busy {
				a.sideStatus(c, a.L.T("settings.data.checking"), sideMuted)
				return
			}
			if a.button(c, a.L.T("update.checknow"), btnSecondary, t.ControlMD, t.Surface) {
				ss.updating = true
				a.async(func() { u.CheckNow(context.Background()) }, func() { ss.updating = false })
			}
		})
		if v, ch := a.toggleRow(c, "oninquit", a.L.T("update.oninquit"), a.L.T("settings.update.auto.help"), st.InstallOnQuit); ch {
			u.SetInstallOnQuit(v)
		}
		switch {
		case st.State == update.Ready && a.RestartToUpdate != nil:
			a.actions(c, "update", nil, func() {
				if a.button(c, a.L.T("update.restart"), btnPrimary, t.ControlMD, t.Surface) {
					a.RestartToUpdate()
				}
			})
		case st.State == update.Available && st.Page != "":
			a.actions(c, "update", nil, func() {
				if a.button(c, a.L.T("update.download"), btnPrimary, t.ControlMD, t.Surface) {
					a.openLink(st.Page)
				}
			})
		}
	})
}

// puttingInView is the window between Restart to update and the relaunch:
// the clay partner at work and one calm line, while the copy is checked
// again; then the window goes away at once (lifecycle.go, runRestart).
// Nothing in it can be clicked: there is nothing to decide.
func (a *App) puttingInView(c *ui.Context) {
	t := a.T
	v := ""
	if a.Updates != nil {
		v = a.Updates.Status().Version
	}
	a.bareChrome(c)
	ui.Column(c).Grow(1).MinHeight(0).Justify(ui.Center).AlignItems(ui.Center).Padding(8, 32, 8+ChromeH, 32).Children(func() {
		card := ui.Column(c.Key("putting")).Width(600).MaxWidthPercent(100).Padding(t.S6, t.S7, t.S6, t.S7).Gap(t.S4).
			Radius(t.RadiusXL).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color)
		a.enter(c, card)
		card.Children(func() {
			a.setupWaiting(c, theme.Working, a.L.T("update.putting"), a.L.T("update.putting.body", v))
		})
	})
}

// UpdateFailed is Restart to update when the copy failed its check: back
// from the putting-in screen to Settings' update card, which says why.
func (a *App) UpdateFailed() {
	a.PuttingIn = false
	a.openTab(TabAbout)
}

// sayInstalled says once, quietly, which version the last swap put in.
func (a *App) sayInstalled(c *ui.Context) {
	if a.installedSaid || a.Updates == nil {
		return
	}
	a.installedSaid = true
	if v := a.Updates.Status().Installed; v != "" {
		c.Toast(a.L.T("update.installed", v))
	}
}
