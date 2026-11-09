package views

import (
	"errors"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/local"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// The first run without a terminal (design/onboarding.md, "The app
// path"): Ducter.app installs and signs in the AI tools itself, with their
// official installers, shows progress, explains a failure with the one
// thing to do, and goes on by itself once a check turns green. The same
// calm, one-step-at-a-time card carries every macOS ask: CuaDriver's two
// switches (上网), notifications, running in the background.

// Desktop is what the window app does with macOS itself (nil in tests
// that don't care).
type Desktop interface {
	// Focus brings Ducter's window to the front (after a System Settings
	// detour).
	Focus()
	// Notify shows a notification; the first one makes macOS ask. It
	// returns ErrNotificationsDenied when they're off.
	Notify(title, body string) error
}

// ErrNotificationsDenied: the person turned Ducter's notifications off.
var ErrNotificationsDenied = errors.New("notifications are off")

// SigninRecheck is how often a sign-in in the browser is checked.
const SigninRecheck = 3 * time.Second

// ReadyFor is how long "All set" shows before Ducter wakes.
const ReadyFor = 1600 * time.Millisecond

// AskAgainAfter is how long a 稍后 / Later keeps an offer away.
const AskAgainAfter = 72 * time.Hour

// jobID names a check's background job.
func jobID(k local.Check) string { return k.ID + "." + k.Action }

// fixJob is the job running (or last run) for a check.
func (a *App) fixJob(k local.Check) *local.Job {
	if a.Backend == nil || k.Action == "" {
		return nil
	}
	return a.Backend.Job(jobID(k))
}

// signingIn reports whether a sign-in runs in the browser right now.
func (a *App) signingIn() bool {
	for _, k := range a.setup.report.Checks {
		if j := a.fixJob(k); j != nil && j.Running() && k.Action == "signin" {
			return true
		}
	}
	return false
}

// anyFixRunning reports whether a fix runs in the background now.
func (a *App) anyFixRunning() bool {
	for _, k := range a.setup.report.Checks {
		if j := a.fixJob(k); j != nil && j.Running() {
			return true
		}
	}
	return false
}

// runFix starts a check's fix in the background.
func (a *App) runFix(k local.Check) {
	if a.setup.jobErr == nil {
		a.setup.jobErr = map[string]string{}
	}
	delete(a.setup.jobErr, jobID(k))
	if _, err := a.Backend.Run(jobID(k), k.Fix); err != nil {
		a.setup.jobErr[jobID(k)] = err.Error()
	}
}

// settle notices a job that just ended: a good end checks the Mac again at
// once (the row turns green, or moves on to signing in).
func (a *App) settle(j *local.Job) {
	if j == nil || j.Running() {
		return
	}
	if a.setup.settled == nil {
		a.setup.settled = map[*local.Job]bool{}
	}
	if a.setup.settled[j] {
		return
	}
	a.setup.settled[j] = true
	// A failed sign-in may still have signed in (closed late): check the
	// Mac again, but only while Ducter isn't up (a check would start it).
	// Up and running, Devices asks for fresh sign-ins instead.
	if (j.OK() || j.Trouble() == "") && !a.S.Welcomed {
		a.check()
	}
}

// optionRows is the list of things the window can fix itself, one flat
// row each on one left edge: the name, ONE status line in plain words
// (replaced in place while it works), the action at the row's right. No
// dots, no pulsing: the clay character above carries the mood.
func (a *App) optionRows(c *ui.Context, rows []local.Check) {
	t := a.T
	ui.Column(c.Key("options")).Radius(t.RadiusLG).Background(t.SurfaceSunken).Children(func() {
		for i, k := range rows {
			if i > 0 {
				ui.Box(c).Height(1).Background(t.Line).Margin(0, t.S4)
			}
			a.optionRow(c, k, i == 0)
		}
	})
}

// rowState is where one fix stands.
type rowState int

const (
	rowIdle rowState = iota
	rowRunning
	rowFailed
	rowCanceled
)

func (a *App) rowState(k local.Check) (rowState, *local.Job) {
	j := a.fixJob(k)
	a.settle(j)
	switch {
	case j == nil || a.setup.retried[j]:
		return rowIdle, j
	case j.Running():
		return rowRunning, j
	case j.OK() || !a.setup.settled[j]:
		return rowIdle, j
	case j.Trouble() == "canceled":
		return rowCanceled, j
	}
	return rowFailed, j
}

// optionRow is one option: the name, its status, its action.
func (a *App) optionRow(c *ui.Context, k local.Check, first bool) {
	t := a.T
	st, j := a.rowState(k)
	ui.Column(c.Key("fix:"+k.ID)).Gap(t.S2).Padding(t.S4, t.S4).MinHeight(72).Justify(ui.Center).Children(func() {
		ui.Row(c).Gap(t.S4).AlignItems(ui.Center).Children(func() {
			ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
				ui.Text(c, k.Label).FontSize(t.LG).FontWeight(800)
				ui.Text(c, a.rowStatus(k, st, j)).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.45)
			})
			switch st {
			case rowRunning:
				if a.buttonFor(c, a.L.T("fix.cancel"), k.Label, btnText, t.ControlSM, t.SurfaceSunken) {
					j.Cancel()
				}
			case rowFailed:
				if a.buttonFor(c, a.L.T("fix.retry"), k.Label, btnSecondary, t.ControlMD, t.SurfaceSunken) {
					a.retry(k, j)
				}
			default:
				kind := btnSecondary
				if first {
					kind = btnPrimary
				}
				if a.buttonFor(c, a.fixLabel(k), k.Label, kind, t.ControlMD, t.SurfaceSunken) {
					if j != nil {
						a.retry(k, j)
					} else {
						a.runFix(k)
					}
				}
			}
		})
		switch {
		case st == rowRunning && k.Action == "signin":
			a.signinHelp(c, k, j)
		case st == rowFailed:
			if last := j.Last(); last != "" && j.Trouble() == "" {
				ui.Text(c, last).Font(t.Mono).FontSize(12).TextColor(t.InkMuted).SingleLine().Selectable()
			}
			if a.button(c, a.L.T("fix.terminal"), btnText, t.ControlSM, t.SurfaceSunken) {
				_ = a.Backend.RunInTerminal(k.ID, k.Fix)
			}
		}
	})
	if st == rowRunning {
		c.After(500 * time.Millisecond)
	}
}

// rowStatus is the row's one line: what it is now, in plain words.
func (a *App) rowStatus(k local.Check, st rowState, j *local.Job) string {
	switch st {
	case rowRunning:
		if k.Action == "signin" {
			return a.L.T("fix.signing")
		}
		return a.L.T("fix.installing.now", int(a.Now().Sub(j.Started).Seconds()))
	case rowCanceled:
		return a.L.T("fix.canceled.short")
	case rowFailed:
		switch j.Trouble() {
		case "offline":
			return a.L.T("fix.offline", k.Label)
		case "denied":
			return a.L.T("fix.denied", k.Label)
		}
		if k.Action == "signin" {
			return a.L.T("fix.signin.failed", k.Label)
		}
		return a.L.T("fix.failed.short", k.Label)
	}
	if e := a.setup.jobErr[jobID(k)]; e != "" {
		return a.L.T("fix.failed.start", e)
	}
	return k.Detail
}

func (a *App) retry(k local.Check, j *local.Job) {
	if a.setup.retried == nil {
		a.setup.retried = map[*local.Job]bool{}
	}
	a.setup.retried[j] = true
	a.runFix(k)
}

func (a *App) fixLabel(k local.Check) string {
	if k.Action == "signin" {
		return a.L.T("fix.signin.short")
	}
	return a.L.T("fix.install.short")
}

// signinHelp: the browser does the work. Two quiet ways out on the same
// left edge: the page again, and a code the page may show instead of
// returning.
func (a *App) signinHelp(c *ui.Context, k local.Check, j *local.Job) {
	t := a.T
	ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Margin(0, -10).Children(func() {
		if u := j.URL(); u != "" && a.button(c, a.L.T("fix.signing.open"), btnText, t.ControlSM, t.SurfaceSunken) {
			_ = a.Backend.OpenURL(u)
		}
		if a.button(c, a.L.T("fix.signing.code"), btnText, t.ControlSM, t.SurfaceSunken) {
			a.setup.codeOpen = !a.setup.codeOpen
		}
	})
	if !a.setup.codeOpen {
		return
	}
	send := func() {
		if strings.TrimSpace(a.setup.code) != "" {
			_ = j.Send(a.setup.code)
			a.setup.code, a.setup.codeOpen = "", false
		}
	}
	ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
		ui.TextInput(c.Key("input:code"), &a.setup.code).Placeholder(a.L.T("fix.signing.paste")).Label(a.L.T("fix.signing.code")).
			Font(t.Mono).FontSize(t.SM).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.Surface).Border(1, t.LineSoft).
			Height(t.ControlMD).Grow(1).MinWidth(0).OnSubmit(send)
		if a.button(c, a.L.T("fix.signing.send"), btnSecondary, t.ControlMD, t.SurfaceSunken) {
			send()
		}
	})
}

// setupOptions is the blocked card when everything that blocks can be
// fixed from the window: pick one, it installs and signs in, and the
// screen goes on by itself.
func (a *App) setupOptions(c *ui.Context, blocking []local.Check) {
	t := a.T
	face := theme.NeedsYou
	if a.anyFixRunning() {
		face = theme.Working
	}
	a.avatar(c, face, 100)
	a.heading(c, a.L.T("setup.blocked"), t.XXL)
	rows := blocking
	body := "setup.blocked.body"
	if k, ok := a.setup.report.Get("codex"); ok && !a.setup.report.HarnessReady && k.Status != "ok" && k.Action != "" && !k.Required {
		rows = append(append([]local.Check(nil), blocking...), k)
		body = "setup.pick.body"
	}
	ui.Text(c, a.L.T(body)).FontSize(t.MD).LineHeight(1.55).TextColor(t.InkSoft)
	a.optionRows(c, rows)
	ui.Text(c, a.L.T("setup.auto.app")).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5)
}

// setupReady is the short "All set" after the person fixed something: the
// done character, what is ready, then Ducter wakes by itself.
func (a *App) setupReady(c *ui.Context) {
	t := a.T
	a.avatar(c, theme.Done, 120)
	a.heading(c, a.L.T("setup.ready"), t.XXL)
	var ready []string
	for _, id := range []string{"claude", "codex"} {
		if k, ok := a.setup.report.Get(id); ok && k.Status == "ok" {
			ready = append(ready, k.Label)
		}
	}
	sep := " · "
	ui.Text(c, a.L.T("setup.ready.body", strings.Join(ready, sep), a.personaName())).FontSize(t.LG).LineHeight(1.55).TextColor(t.InkSoft)
	left := a.setup.readyAt.Add(ReadyFor).Sub(a.Now())
	if left > 0 {
		c.After(left)
		return
	}
	a.afterReady()
}

// afterReady goes on from "All set": the name, or wake Ducter.
func (a *App) afterReady() {
	if a.setup.phase != setupReady {
		return
	}
	if a.needsName(a.setup.report) {
		a.setup.phase = setupName
		return
	}
	a.launch()
}

// ---------- the background: Login Items ----------

// backgroundNote is the line under "Waking Ducter up…" the first time the
// agent loads: macOS answers it with its own notification; say what that
// is before it appears.
func (a *App) backgroundNote(c *ui.Context) {
	if !a.setup.bgFirst {
		return
	}
	t := a.T
	ui.Row(c).Gap(10).Padding(10, 14).Radius(t.RadiusSM).Background(t.SurfaceSunken).AlignItems(ui.Center).Children(func() {
		ui.Text(c, a.L.T("bg.note")).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.5).Grow(1).MinWidth(0)
	})
}

// backgroundLine: macOS isn't letting Ducter run in the background (Login
// Items › Allow in the Background is off), so it runs only while the app
// is open. One quiet card with the way back; it notices the switch by
// itself and moves Ducter to the background once nothing is running.
func (a *App) backgroundLine(c *ui.Context) bool {
	b := &a.setup.bg
	if a.Backend == nil || !a.S.Welcomed || b.closed || !a.Backend.BackgroundBlocked() && !b.allowed {
		return false
	}
	t := a.T
	now := a.Now()
	if !b.allowed && c.WindowActive() && now.Sub(b.checkedAt) > 2*time.Second && !b.busy {
		b.busy, b.checkedAt = true, now
		var ok bool
		a.async(func() { ok = a.Backend.BackgroundAllowed() }, func() {
			b.busy = false
			if ok {
				b.allowed = true
			}
		})
	}
	if !b.allowed {
		c.After(2 * time.Second)
	}
	if b.allowed && !b.moving && !a.anyWorking() {
		b.moving = true
		a.async(func() { a.Backend.StopChild() }, func() {
			a.setup.bgFirst = false
			a.launch()
		})
	}
	ui.Row(c).Justify(ui.Center).Padding(0, 24).Children(func() {
		card := ui.Column(c.Key("bgline")).Grow(1).MaxWidth(convWidth).Gap(8).Padding(12, 16).
			Radius(t.RadiusLG).Background(t.Surface).Role(ui.RoleStatus)
		a.enter(c, card)
		card.Children(func() {
			ui.Row(c).Gap(12).AlignItems(ui.Center).Children(func() {
				ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
					switch {
					case b.allowed && !b.moving:
						ui.Text(c, a.L.T("bg.allowed.wait")).FontSize(t.MD).FontWeight(700)
					case b.allowed:
						ui.Text(c, a.L.T("bg.allowed")).FontSize(t.MD).FontWeight(700)
					default:
						ui.Text(c, a.L.T("bg.off")).FontSize(t.MD).FontWeight(700)
						ui.Text(c, a.L.T("bg.off.body")).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.45)
					}
				})
				label := a.L.T("ask.later")
				if b.allowed {
					label = a.L.T("cli.ok")
				}
				if a.button(c, label, btnText, 40, t.Surface) {
					b.closed = true
				}
				if !b.allowed && a.button(c, a.L.T("bg.open"), btnPrimary, 40, t.Surface) {
					_ = a.Backend.OpenSettings(local.SettingsLoginItems)
				}
			})
		})
	})
	return true
}

// anyWorking reports whether a task is still being worked on.
func (a *App) anyWorking() bool {
	for _, tk := range a.S.Tasks {
		if !finished(tk) {
			return true
		}
	}
	return false
}

type bgState struct {
	closed, allowed, busy, moving bool
	checkedAt                     time.Time
}
