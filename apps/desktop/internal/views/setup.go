package views

import (
	"os"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/hints"
	"github.com/wey-gu/ducter/apps/desktop/internal/local"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// Ducter.app's own first run: no terminal. The app checks the Mac
// (`ducter doctor --json`), shows only what blocks with one action each,
// asks the name once, then runs `ducter up --no-desktop` as its child for
// as long as the app is open.

// Backend is the Ducter this app runs on this Mac. Nil when the window
// only connects (opened by `ducter up`, or to a Ducter elsewhere).
type Backend interface {
	// Healthy reports whether a Ducter already answers on the port.
	Healthy() bool
	Doctor() (local.Report, error)
	// Start runs Ducter as the app's child; Exited closes when it stops.
	Start() error
	Exited() <-chan struct{}
	// Stopping is true once the app asked it to stop (quitting).
	Stopping() bool
	ExitReason() string
	LogPath() string
	DataDir() string
	// RunInTerminal opens Terminal on one fix command.
	RunInTerminal(id, cmd string) error
	OpenURL(u string) error
	// The one-time offer of `ducter` in Terminal.
	CLIState() local.CLIState
	LinkCLI() error
	// CLIOnPath reports whether ~/.local/bin is on a new Terminal's PATH.
	CLIOnPath() bool
}

type setupPhase int

const (
	setupIdle     setupPhase = iota // nothing to do: connected, or not ours
	setupChecking                   // doctor runs
	setupBlocked                    // something required is missing
	setupName                       // the one optional question
	setupStarting                   // ducter up runs; waiting for it to answer
	setupFailed                     // it didn't start, or stopped
)

// RecheckEvery is how often a blocked Mac is checked again by itself.
const RecheckEvery = 10 * time.Second

type setupState struct {
	phase     setupPhase
	report    local.Report
	err       string
	name      string
	busy      bool // a check is running
	checkedAt time.Time
	wasActive bool
	ran       map[string]time.Time // fixes opened in Terminal
	everUp    bool                 // the child answered once (a later exit is "stopped")
	autoTried bool
	// nameFocused: the name field took the keyboard once.
	nameFocused bool
	cli         cliOffer
}

// async runs work off the UI thread and done on it; inline in tests.
func (a *App) async(work func(), done func()) {
	if a.Win == nil {
		work()
		done()
		return
	}
	go func() {
		work()
		a.Win.Update(done)
	}()
}

// StartLocal begins the app's first run: attach to a Ducter already
// running, else check the Mac and start one.
func (a *App) StartLocal() {
	if a.Backend == nil {
		return
	}
	a.setup.phase = setupChecking
	var up bool
	a.async(func() { up = a.Backend.Healthy() }, func() {
		if up {
			a.setup.phase = setupIdle // someone's Ducter is already here; just connect
			if a.RetryNow != nil {
				a.RetryNow()
			}
			return
		}
		a.check()
	})
}

// check runs doctor and moves on: blocked, the name, or start.
func (a *App) check() {
	if a.setup.busy {
		return
	}
	a.setup.busy = true
	var r local.Report
	var err error
	a.async(func() { r, err = a.Backend.Doctor() }, func() {
		a.setup.busy = false
		a.setup.checkedAt = a.Now()
		if err != nil {
			a.setup.phase, a.setup.err = setupFailed, err.Error()
			return
		}
		a.setup.report = r
		switch {
		case !r.OK:
			a.setup.phase = setupBlocked
		case a.needsName(r):
			a.setup.phase = setupName
		default:
			a.launch()
		}
	})
}

// needsName: the name is asked once, and not when Nowledge Mem holds the
// identity (it has a name already), as `ducter up` does in a terminal.
func (a *App) needsName(r local.Report) bool {
	if os.Getenv("DUCTER_PERSONA_NAME") != "" || r.Has("nmem") {
		return false
	}
	_, asked := hints.ReadPersona(a.Backend.DataDir())
	return !asked
}

// personaName is the name before the server says it.
func (a *App) personaName() string {
	if a.S.Welcomed && a.S.PersonaName != "" {
		return a.S.PersonaName
	}
	if n := os.Getenv("DUCTER_PERSONA_NAME"); n != "" {
		return n
	}
	if a.Backend != nil {
		if p, _ := hints.ReadPersona(a.Backend.DataDir()); p.Name != "" {
			return p.Name
		}
	}
	return "Ducter"
}

// SaveName answers the name question ("" keeps Ducter) and starts.
func (a *App) SaveName(raw string) {
	name := hints.CleanName(raw)
	if strings.EqualFold(name, "ducter") {
		name = ""
	}
	_ = hints.WritePersona(a.Backend.DataDir(), hints.Persona{Name: name, AskedAt: a.Now().UTC().Format(time.RFC3339)})
	a.launch()
}

// launch starts Ducter and watches it: connect as soon as it answers;
// say so if it stops without being asked to.
func (a *App) launch() {
	a.setup.phase, a.setup.err = setupStarting, ""
	var err error
	a.async(func() { err = a.Backend.Start() }, func() {
		if err != nil {
			a.setup.phase, a.setup.err = setupFailed, err.Error()
			return
		}
		if a.Win == nil {
			return // tests drive the rest
		}
		exited := a.Backend.Exited()
		go func() {
			for i := 0; i < 600; i++ { // up to a minute
				select {
				case <-exited:
					return
				default:
				}
				if a.Backend.Healthy() {
					a.Win.Update(func() {
						a.setup.everUp = true
						if a.RetryNow != nil {
							a.RetryNow()
						}
					})
					return
				}
				time.Sleep(100 * time.Millisecond)
			}
		}()
		go func() {
			<-exited
			a.Win.Update(func() { a.childExited() })
		}()
	})
}

// childExited: Ducter stopped. Quitting is quiet; anything else shows.
func (a *App) childExited() {
	if a.Backend.Stopping() {
		return
	}
	a.setup.phase = setupFailed
	a.setup.err = a.Backend.ExitReason()
}

// setupActive reports whether the setup card is what the window shows.
func (a *App) setupActive() bool {
	if a.Backend == nil {
		return false
	}
	if a.setup.phase == setupFailed {
		return true
	}
	if a.S.Welcomed {
		return false
	}
	if a.setup.phase == setupIdle && a.Failed && !a.setup.autoTried {
		// The Ducter that was here at launch went away before saying
		// welcome: run our own.
		a.setup.autoTried = true
		a.StartLocal()
	}
	return a.setup.phase != setupIdle
}

// setupView is the card of the app's first run.
func (a *App) setupView(c *ui.Context) {
	t := a.T
	a.watchActive(c)
	a.bareChrome(c)
	ui.Column(c).Grow(1).MinHeight(0).Justify(ui.Center).AlignItems(ui.Center).Padding(8, 32, 8+ChromeH, 32).Children(func() {
		card := ui.Column(c.Key("setup")).Width(600).MaxWidthPercent(100).Padding(36, 40, 32, 40).Gap(16).
			Radius(t.RadiusXL).Background(t.Surface).Shadow(0, t.PressCard.Offset, 0, 0, t.PressCard.Color)
		a.enter(c, card)
		card.Children(func() {
			switch a.setup.phase {
			case setupChecking:
				a.setupWaiting(c, theme.Napping, a.L.T("setup.checking"), a.L.T("setup.checking.body"))
			case setupStarting:
				name := a.personaName()
				a.setupWaiting(c, theme.Working, a.L.T("setup.starting", name), a.L.T("setup.starting.body", name))
			case setupBlocked:
				a.setupBlocked(c)
			case setupName:
				a.setupName(c)
			case setupFailed:
				a.setupFailed(c)
			}
		})
	})
}

func (a *App) setupWaiting(c *ui.Context, p theme.Presence, title, body string) {
	t := a.T
	a.avatar(c, p, 120)
	ui.Row(c).Gap(12).AlignItems(ui.Center).Children(func() {
		ui.Text(c, title).FontSize(28).FontWeight(800).LetterSpacing(-0.4).Grow(1).MinWidth(0)
		a.retryPulse(c)
	})
	ui.Text(c, body).FontSize(t.LG).LineHeight(1.55).TextColor(t.InkSoft)
}

// watchActive checks a blocked Mac again when the person comes back to
// the window (from Terminal, most likely), and every RecheckEvery.
func (a *App) watchActive(c *ui.Context) {
	active := c.WindowActive()
	back := active && !a.setup.wasActive
	a.setup.wasActive = active
	if a.setup.phase != setupBlocked || a.setup.busy {
		return
	}
	if back && a.Now().Sub(a.setup.checkedAt) > 2*time.Second {
		a.check()
		return
	}
	if left := a.setup.checkedAt.Add(RecheckEvery).Sub(a.Now()); left > 0 {
		c.After(left)
	} else {
		a.check()
	}
}

func (a *App) setupBlocked(c *ui.Context) {
	t := a.T
	blocking := a.setup.report.Blocking()
	a.avatar(c, theme.NeedsYou, 100)
	title := a.L.T("setup.blocked")
	if len(blocking) > 1 {
		title = a.L.T("setup.blocked.many", len(blocking))
	}
	ui.Text(c, title).FontSize(28).FontWeight(800).LetterSpacing(-0.4)
	ui.Text(c, a.L.T("setup.blocked.body")).FontSize(t.LG).LineHeight(1.55).TextColor(t.InkSoft)
	for _, k := range blocking {
		k := k
		ui.Column(c.Key("fix:"+k.ID)).Gap(10).Padding(16, 18).Radius(t.RadiusLG).Background(t.SurfaceSunken).Children(func() {
			ui.Row(c).Gap(10).AlignItems(ui.Center).Children(func() {
				ui.Box(c).Size(10, 10).Radius(5).Background(t.NeedsYou.Dot).Shrink(0)
				ui.Text(c, k.Label).FontSize(t.MD).FontWeight(800)
				ui.Text(c, k.Detail).FontSize(t.MD).TextColor(t.InkSoft).Grow(1).MinWidth(0)
			})
			if k.Fix == "" {
				return
			}
			if strings.HasPrefix(k.Fix, "http") {
				if a.button(c, a.L.T("setup.open"), btnSecondary, 40, t.SurfaceSunken) {
					_ = a.Backend.OpenURL(k.Fix)
				}
				return
			}
			a.commandBoxSized(c, k.Fix, 14)
			ui.Row(c).Gap(10).AlignItems(ui.Center).Children(func() {
				label := a.L.T("setup.run")
				if at, ok := a.setup.ran[k.ID]; ok && a.Now().Sub(at) < 4*time.Second {
					label = a.L.T("setup.ran")
					c.After(4*time.Second - a.Now().Sub(at))
				}
				if a.button(c, label, btnPrimary, 44, t.SurfaceSunken) {
					if a.setup.ran == nil {
						a.setup.ran = map[string]time.Time{}
					}
					a.setup.ran[k.ID] = a.Now()
					_ = a.Backend.RunInTerminal(k.ID, k.Fix)
				}
			})
		})
	}
	if later := a.setup.report.Later(); len(later) > 0 {
		names := make([]string, len(later))
		for i, k := range later {
			names[i] = k.Label
		}
		sep := ", "
		if a.L.Lang == "zh" {
			sep = "、"
		}
		ui.Text(c, a.L.T("setup.later", strings.Join(names, sep))).FontSize(t.SM).TextColor(t.InkMuted)
	}
	ui.Box(c).Height(1).Background(t.LineSoft).Margin(4, 0)
	ui.Row(c).Gap(12).AlignItems(ui.Center).Children(func() {
		ui.Text(c, a.L.T("setup.auto")).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5).Grow(1).MinWidth(0)
		label := a.L.T("setup.recheck")
		if a.setup.busy {
			label = a.L.T("setup.rechecking")
		}
		if a.button(c, label, btnSecondary, 44, t.Surface) && !a.setup.busy {
			a.check()
		}
	})
}

func (a *App) setupName(c *ui.Context) {
	t := a.T
	a.avatar(c, theme.Idle, 120)
	ui.Text(c, a.L.T("setup.name.title", "Ducter")).FontSize(28).FontWeight(800).LetterSpacing(-0.4)
	ui.Text(c, a.L.T("setup.name.body")).FontSize(t.LG).LineHeight(1.55).TextColor(t.InkSoft)
	submit := func() { a.SaveName(a.setup.name) }
	in := ui.TextInput(c.Key("input:name"), &a.setup.name).Placeholder("Ducter").Label(a.L.T("setup.name.body")).
		FontSize(18).Padding(12, 16).Radius(t.RadiusSM).Background(t.SurfaceSunken).Border(1, t.LineSoft).
		OnSubmit(submit)
	if !a.setup.nameFocused {
		in.Focus()
		a.setup.nameFocused = true
	}
	ui.Row(c).Gap(12).AlignItems(ui.Center).Margin(4, 0, 0, 0).Children(func() {
		if a.button(c, a.L.T("setup.name.ok"), btnPrimary, 50, t.Surface) {
			submit()
		}
		if a.button(c, a.L.T("setup.name.keep", "Ducter"), btnText, 50, t.Surface) {
			a.SaveName("")
		}
	})
}

func (a *App) setupFailed(c *ui.Context) {
	t := a.T
	a.avatar(c, theme.Napping, 100)
	key := "setup.failed"
	if a.setup.everUp {
		key = "setup.stopped"
	}
	ui.Text(c, a.L.T(key, a.personaName())).FontSize(28).FontWeight(800).LetterSpacing(-0.4)
	if a.setup.err != "" {
		ui.Text(c, a.L.T("setup.failed.body")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		ui.Text(c, a.setup.err).Font(t.Mono).FontSize(12).LineHeight(1.5).TextColor(t.InkSoft).
			Padding(12, 14).Radius(t.RadiusSM).Background(t.SurfaceSunken).Selectable()
	}
	ui.Text(c, a.L.T("setup.failed.log", tildeHome(a.Backend.LogPath()))).FontSize(t.SM).TextColor(t.InkMuted).Selectable()
	if a.button(c, a.L.T("setup.retry"), btnPrimary, 50, t.Surface) {
		a.setup.everUp = false
		a.StartLocal()
	}
}

// tildeHome shows a path under the home folder as ~/…
func tildeHome(p string) string {
	if home, err := os.UserHomeDir(); err == nil && home != "" && strings.HasPrefix(p, home+"/") {
		return "~" + p[len(home):]
	}
	return p
}

// ---------- the one-time offer of `ducter` in Terminal ----------

type cliOffer struct {
	shown  bool   // decided to show it this session
	closed bool   // answered and put away, this session
	result string // "", "done", "path", "other", or an error
}

// cliOfferLine asks once, after the partner has answered for the first
// time (the person has seen it work): put `ducter` on PATH too?
func (a *App) cliOfferLine(c *ui.Context) {
	if a.Backend == nil || a.firstDone != nil && !a.firstDone.at.IsZero() {
		return
	}
	o := &a.setup.cli
	if o.closed {
		return
	}
	if !o.shown {
		if a.Local.CLIOffer() != "" || !a.partnerSpoke() || a.Backend.CLIState() != local.CLINone {
			return
		}
		o.shown = true
	}
	t := a.T
	glyph := func() { a.glyphTile(c, 28, t.Surface, drawPrompt(t.InkSoft)) }
	a.aboveComposer(c, func() {
		switch o.result {
		case "":
			a.notice(c, "clioffer", noticeInfo, glyph, func() {
				ui.Text(c, a.L.T("cli.offer")).FontSize(t.SM).FontWeight(700)
				ui.Text(c, a.L.T("cli.offer.body")).FontSize(t.XS).LineHeight(1.45).TextColor(t.InkMuted)
			}, func() {
				if a.button(c, a.L.T("cli.offer.no"), btnText, t.ControlSM, t.Surface) {
					a.Local.SetCLIOffer("declined")
					o.closed = true
				}
				if a.button(c, a.L.T("cli.offer.yes"), btnPrimary, t.ControlSM, t.Surface) {
					a.linkCLI()
					// Done is said once, in passing; only what still
					// needs the person (a line to run, an error) stays.
					switch o.result {
					case "done":
						c.Toast(a.L.T("cli.done"))
						o.closed = true
					case "other":
						c.Toast(a.L.T("cli.other"))
						o.closed = true
					}
				}
			})
		case "path":
			a.notice(c, "clioffer", noticeInfo, glyph, func() {
				ui.Text(c, a.L.T("cli.done.path")).FontSize(t.SM).LineHeight(1.45).TextColor(t.InkSoft)
			}, func() {
				if a.button(c, a.L.T("cli.ok"), btnText, t.ControlSM, t.Surface) {
					o.closed = true
				}
			})
			ui.Box(c).Height(t.S2)
			a.commandBoxSized(c, local.PathLine(local.LinkDir()), t.SM)
			ui.Box(c).Height(t.S2)
		default:
			a.notice(c, "clioffer", noticeAlert, glyph, func() {
				ui.Text(c, a.L.T("cli.failed", o.result)).FontSize(t.SM).LineHeight(1.45).TextColor(t.Failed.Ink)
			}, func() {
				if a.button(c, a.L.T("cli.ok"), btnText, t.ControlSM, t.Surface) {
					o.closed = true
				}
			})
		}
	})
}

// linkCLI answers yes: link ~/.local/bin/ducter to this app's CLI.
func (a *App) linkCLI() {
	o := &a.setup.cli
	err := a.Backend.LinkCLI()
	switch {
	case err == local.ErrNotLinked:
		o.result = "other"
	case err != nil:
		o.result = err.Error()
		return // not remembered: it can be offered again next time
	case a.Backend.CLIOnPath():
		o.result = "done"
	default:
		o.result = "path"
	}
	a.Local.SetCLIOffer("linked")
}

// partnerSpoke reports whether the conversation holds a partner message.
func (a *App) partnerSpoke() bool {
	for _, e := range a.S.Channel {
		if e.AI != nil || e.Job != nil && e.Job.Ack != nil {
			return true
		}
	}
	return false
}
