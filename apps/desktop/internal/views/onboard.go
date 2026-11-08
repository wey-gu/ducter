package views

import (
	"errors"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/local"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// The first run without a terminal (docs/design/onboarding.md, "The app
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
	if j.OK() || j.Trouble() == "" {
		a.check() // a failed sign-in may still have signed in (closed late)
	}
}

// fixRow is one blocking check the app can fix itself: its state, its one
// button, its progress, and what went wrong.
func (a *App) fixRow(c *ui.Context, k local.Check, quiet bool) {
	t := a.T
	j := a.fixJob(k)
	a.settle(j)
	running := j != nil && j.Running()
	failed := j != nil && !running && !j.OK() && a.setup.settled[j] && !a.setup.retried[j]
	bg := t.SurfaceSunken
	if quiet {
		bg = t.Bg
	}
	ui.Column(c.Key("fix:"+k.ID)).Gap(10).Padding(16, 18).Radius(t.RadiusLG).Background(bg).Children(func() {
		ui.Row(c).Gap(10).AlignItems(ui.Center).Children(func() {
			switch {
			case running:
				a.pebble(c, t.Working.Dot, 12, 10)
			case failed:
				ui.Box(c).Size(10, 10).Radius(5).Background(t.Failed.Dot).Shrink(0)
			default:
				ui.Box(c).Size(10, 10).Radius(5).Background(t.NeedsYou.Dot).Shrink(0)
			}
			ui.Text(c, k.Label).FontSize(t.MD).FontWeight(800)
			ui.Text(c, k.Detail).FontSize(t.MD).TextColor(t.InkSoft).Grow(1).MinWidth(0)
		})
		switch {
		case running && k.Action == "signin":
			a.signinProgress(c, k, j)
		case running:
			a.jobProgress(c, k, j, a.L.T("fix.installing", k.Label), a.L.T("fix.installing.body"))
		case failed:
			a.jobFailed(c, k, j)
		default:
			if e := a.setup.jobErr[jobID(k)]; e != "" {
				a.reasonLine(c, a.L.T("fix.failed.start", e))
			}
			ui.Row(c).Gap(6).AlignItems(ui.Center).Children(func() {
				kind := btnPrimary
				if quiet {
					kind = btnQuiet
				}
				if a.buttonFor(c, a.fixLabel(k), k.Label, kind, 44, bg) {
					a.runFix(k)
				}
				ui.Box(c).Grow(1)
				if a.button(c, a.L.T("fix.terminal"), btnText, 36, bg) {
					_ = a.Backend.RunInTerminal(k.ID, k.Fix)
				}
			})
		}
	})
	if running {
		c.After(250 * time.Millisecond)
	}
}

func (a *App) fixLabel(k local.Check) string {
	name := k.Label
	if k.ID == "claude" && k.Action == "signin" {
		name = "Claude" // the account people sign in to
	}
	return a.L.T("fix."+k.Action, name)
}

// jobProgress: what runs, its last line, how long so far, Cancel.
func (a *App) jobProgress(c *ui.Context, k local.Check, j *local.Job, title, body string) {
	t := a.T
	ui.Row(c).Gap(12).AlignItems(ui.Center).Children(func() {
		a.retryPulse(c)
		ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
			ui.Text(c, title).FontSize(t.MD).FontWeight(700)
			ui.Text(c, body).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.45)
		})
		secs := int(a.Now().Sub(j.Started).Seconds())
		ui.Text(c, a.L.T("fix.elapsed", secs)).FontSize(t.SM).TextColor(t.InkMuted).Shrink(0)
	})
	if last := j.Last(); last != "" {
		ui.Text(c, last).Font(t.Mono).FontSize(11.5).TextColor(t.InkMuted).SingleLine().Padding(0, 2)
	}
	ui.Row(c).Children(func() {
		ui.Box(c).Grow(1)
		if a.buttonFor(c, a.L.T("fix.cancel"), k.Label, btnText, 32, t.SurfaceSunken) {
			j.Cancel()
		}
	})
}

// signinProgress: the browser does the work; the window waits, offers the
// page again, and takes a code the page may show instead of returning.
func (a *App) signinProgress(c *ui.Context, k local.Check, j *local.Job) {
	t := a.T
	ui.Row(c).Gap(12).AlignItems(ui.Center).Children(func() {
		a.retryPulse(c)
		ui.Text(c, a.L.T("fix.signing")).FontSize(t.MD).FontWeight(700).Grow(1).MinWidth(0).LineHeight(1.45)
	})
	ui.Row(c).Gap(4).AlignItems(ui.Center).Wrap().Children(func() {
		if u := j.URL(); u != "" && a.button(c, a.L.T("fix.signing.open"), btnText, 32, t.SurfaceSunken) {
			_ = a.Backend.OpenURL(u)
		}
		if a.button(c, a.L.T("fix.signing.code"), btnText, 32, t.SurfaceSunken) {
			a.setup.codeOpen = !a.setup.codeOpen
		}
		ui.Box(c).Grow(1)
		if a.buttonFor(c, a.L.T("fix.cancel"), k.Label, btnText, 32, t.SurfaceSunken) {
			j.Cancel()
		}
	})
	if a.setup.codeOpen {
		send := func() {
			if strings.TrimSpace(a.setup.code) != "" {
				_ = j.Send(a.setup.code)
				a.setup.code, a.setup.codeOpen = "", false
			}
		}
		ui.Row(c).Gap(10).AlignItems(ui.Center).Children(func() {
			ui.TextInput(c.Key("input:code"), &a.setup.code).Placeholder(a.L.T("fix.signing.paste")).Label(a.L.T("fix.signing.code")).
				Font(t.Mono).FontSize(14).Padding(10, 14).Radius(t.RadiusSM).Background(t.Surface).Border(1, t.LineSoft).
				Grow(1).MinWidth(0).OnSubmit(send)
			if a.button(c, a.L.T("fix.signing.send"), btnQuiet, 40, t.SurfaceSunken) {
				send()
			}
		})
	}
}

// jobFailed says what went wrong in words, the last lines for the curious,
// and the one thing to do.
func (a *App) jobFailed(c *ui.Context, k local.Check, j *local.Job) {
	t := a.T
	key := "fix.failed"
	switch j.Trouble() {
	case "offline":
		key = "fix.offline"
	case "denied":
		key = "fix.denied"
	case "canceled":
		key = "fix.canceled"
	default:
		if k.Action == "signin" {
			key = "fix.signin.failed"
		}
	}
	a.reasonLine(c, a.L.T(key, k.Label))
	if j.Trouble() != "canceled" {
		if tail := j.Tail(3); len(tail) > 0 {
			ui.Text(c, strings.Join(tail, "\n")).Font(t.Mono).FontSize(11.5).LineHeight(1.45).TextColor(t.InkMuted).
				Padding(10, 12).Radius(t.RadiusSM).Background(t.Surface).Selectable().MaxLines(3)
		}
	}
	ui.Row(c).Gap(6).AlignItems(ui.Center).Children(func() {
		if a.buttonFor(c, a.L.T("fix.retry"), k.Label, btnPrimary, 44, t.SurfaceSunken) {
			if a.setup.retried == nil {
				a.setup.retried = map[*local.Job]bool{}
			}
			a.setup.retried[j] = true
			a.runFix(k)
		}
		ui.Box(c).Grow(1)
		if a.button(c, a.L.T("fix.terminal"), btnText, 36, t.SurfaceSunken) {
			_ = a.Backend.RunInTerminal(k.ID, k.Fix)
		}
	})
}

// setupReady is the short "All set" after the person fixed something: the
// done character, what is ready, then Ducter wakes by itself.
func (a *App) setupReady(c *ui.Context) {
	t := a.T
	a.avatar(c, theme.Done, 120)
	ui.Text(c, a.L.T("setup.ready")).FontSize(28).FontWeight(800).LetterSpacing(-0.4)
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

// alternative is the other AI tool, offered quietly under the one that
// blocks ("Or: Codex").
func (a *App) alternative(c *ui.Context) {
	if a.setup.report.HarnessReady {
		return
	}
	k, ok := a.setup.report.Get("codex")
	if !ok || k.Status == "ok" || k.Action == "" || k.Required {
		return
	}
	t := a.T
	ui.Text(c, a.L.T("setup.or")).FontSize(t.XS).FontWeight(800).LetterSpacing(0.5).TextColor(t.InkMuted).Margin(2, 4, -6, 4)
	a.fixRow(c, k, true)
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
		ui.Box(c).Size(8, 8).Radius(4).Background(t.Waiting.Dot).Shrink(0)
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
				if !b.allowed && a.button(c, a.L.T("bg.open"), btnPrimary, 40, t.Surface) {
					_ = a.Backend.OpenSettings(local.SettingsLoginItems)
				}
				label := a.L.T("ask.later")
				if b.allowed {
					label = a.L.T("cli.ok")
				}
				if a.button(c, label, btnText, 40, t.Surface) {
					b.closed = true
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
