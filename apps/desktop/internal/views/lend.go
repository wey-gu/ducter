package views

import (
	"math"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D347: 借一台电脑来干活 / Lend a computer. One sheet over the window, opened
// from Your devices, Settings › Where it runs, or the partner's card: which
// kind of computer, then the one line to paste there (it installs Ducter,
// joins with a fresh code and keeps the worker running), a calm wait until
// it is here, and its name, system and signed-in agents once it is, with a
// rename. What goes wrong is said in one sentence with one next step. The
// partner says nothing about any of it.

type lendState struct {
	open bool
	kind string // "" (the question), "mac", "linux"
	// asked: when the code was asked for (a fresh code is asked again when
	// an address appears, for a home that had none).
	asked     time.Time
	askedFor  string
	agentOpen bool
	helpOpen  bool
	copiedKey string
	copiedAt  time.Time
	// errsAt: how many error frames had come when the code was asked for, so
	// only a later "lend_code: …" one counts as the answer.
	errsAt int
}

// lendWait is how long 正在拿一个码… waits for the home before it says it
// didn't answer: never an endless wait (research/127: the Mac dropped the
// lend frame, and the sheet sat there forever).
const lendWait = 8 * time.Second

// openLend opens the sheet at its question.
func (a *App) openLend() {
	a.lend = lendState{open: true}
	a.S.Lend = nil
}

// askLend asks the home for a fresh code and line.
func (a *App) askLend() {
	a.lend.asked, a.lend.askedFor = a.Now(), a.reachAddress()
	a.lend.helpOpen = false
	a.lend.errsAt = len(a.S.Errors)
	a.S.Lend = nil
	a.send(protocol.LendCodeReq{T: "lend_code"})
}

// lendPhase is where the sheet is, read from the lend frame and the clock.
func lendPhase(l *protocol.ServerFrame, now time.Time) string {
	switch {
	case l == nil:
		return "loading"
	case l.State == "here":
		return "here"
	case l.State == "joined":
		return "joined"
	case l.Address == "" || l.LendLine == "":
		return "noaddress"
	}
	if exp := store.ParseTime(l.ExpiresAt); !exp.IsZero() && !now.Before(exp) {
		return "expired"
	}
	return "waiting"
}

// lendFailed is why no code came: "error" (the home answered the lend_code
// with an error frame), "timeout" (no answer within lendWait), or "".
func (a *App) lendFailed(now time.Time) string {
	if a.S.Lend != nil {
		return ""
	}
	if a.lend.errsAt <= len(a.S.Errors) {
		for _, e := range a.S.Errors[a.lend.errsAt:] {
			if strings.HasPrefix(e, "lend_code:") {
				return "error"
			}
		}
	}
	if !a.lend.asked.IsZero() && now.Sub(a.lend.asked) >= lendWait {
		return "timeout"
	}
	return ""
}

// lendOS is a platform's system in words (linux-x64 → Linux), and its
// architecture as its own fact (D291: never joined into one string).
func (a *App) lendOS(platform string) (string, string) {
	os, arch, _ := strings.Cut(strings.ToLower(platform), "-")
	switch os {
	case "linux":
		return a.L.T("lend.os.linux"), arch
	case "darwin":
		return a.L.T("lend.os.mac"), arch
	}
	return platform, ""
}

func (a *App) lendHomeName() string {
	if h := a.homeDevice(); h != nil {
		return a.deviceNameIn(h)
	}
	return a.personaName()
}

// lendEntry is the way in on Your devices: a clay button next to Connect a
// phone or computer, and (why) the one line that says what it is for.
func (a *App) lendEntry(c *ui.Context, why bool) {
	t := a.T
	ui.Column(c.Key("lend-entry")).Gap(t.S1).Children(func() {
		if a.buttonFor(c, "+ "+a.L.T("lend.entry"), a.L.T("lend.entry"), btnSecondary, t.ControlMD, t.Bg) {
			a.openLend()
		}
		if why {
			ui.Text(c, a.L.T("lend.entry.why")).FontSize(t.XS).LineHeight(1.45).TextColor(t.InkMuted).Margin(0, t.S1, 0, t.S1)
		}
	})
}

// lendEmpty is the devices list's line while the home is the only computer.
func (a *App) lendEmpty(c *ui.Context) {
	if a.onlyHome() {
		t := a.T
		ui.Text(c.Key("lend-empty"), a.L.T("lend.empty")).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft).Margin(t.S1, t.S2, 0, t.S2)
	}
}

// onlyHome: no other computer and no phone or window is connected yet.
func (a *App) onlyHome() bool {
	for i := range a.S.Devices {
		if !a.S.Devices[i].Home {
			return false
		}
	}
	return a.S.Reach == nil || len(a.S.Reach.Clients) == 0
}

// lendCard is the partner's 借一台电脑来干活 card (a rich lend block).
func (a *App) lendCard(c *ui.Context, at richAt) {
	t := a.T
	a.richCard(c, at.key, a.L.T("lend.card")).Children(func() {
		a.richTitle(c, a.L.T("lend.card"))
		ui.Text(c, a.L.T("lend.entry.why")).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft)
		ui.Row(c).Children(func() {
			if a.button(c, a.L.T("lend.card.go"), btnPrimary, t.ControlMD, t.Surface) {
				a.openLend()
			}
		})
	})
}

// lendCopy is a line to copy: the text, selectable, and its own Copy button.
func (a *App) lendCopy(c *ui.Context, key, text string, mono bool) {
	t := a.T
	box := ui.Row(c.Key("lend-copy:"+key)).Gap(t.S3).Padding(t.S2, t.S2, t.S2, t.S3).Radius(t.RadiusSM).Background(t.Sunken).AlignItems(ui.Center)
	box.Children(func() {
		tx := ui.Text(c, text).FontSize(t.SM).LineHeight(1.45).TextColor(t.Ink).Grow(1).Basis(0).MinWidth(0).Selectable()
		if mono {
			tx.Font(t.Mono).FontSize(t.XS)
		}
		label := a.L.T("lend.copy")
		if a.lend.copiedKey == key {
			if since := a.Now().Sub(a.lend.copiedAt); since < 2*time.Second {
				label = a.L.T("lend.copied")
				c.After(2*time.Second - since)
			}
		}
		if a.buttonFor(c, label, a.L.T("lend.copy"), btnSecondary, t.ControlMD, t.Sunken) {
			c.WriteClipboard(text)
			a.lend.copiedKey, a.lend.copiedAt = key, a.Now()
		}
	})
}

// lendFold is a 44-point row that opens and closes what is under it.
func (a *App) lendFold(c *ui.Context, key, label string, open *bool) {
	t := a.T
	b := ui.Row(c.Key("lend-fold:" + key)).Gap(t.S2).MinHeight(t.ControlMD).AlignItems(ui.Center).Cursor(ui.CursorPointer).
		Role(ui.RoleButton).Label(label).Focusable()
	b.Children(func() {
		ink := t.InkSoft
		if b.Hovered() {
			ink = t.Ink
		}
		ui.Text(c, label).FontSize(t.SM).FontWeight(700).TextColor(ink)
		a.glyph(c, 12, drawChevron(ink, *open))
	})
	if b.Clicked() {
		*open = !*open
	}
}

// lendDots is the wait's live mark: three dots that breathe in turn.
func (a *App) lendDots(c *ui.Context) {
	t := a.T
	still := c.Preferences().ReduceMotion
	now := c.Now()
	ui.Box(c.Key("lend-dots")).Size(30, 10).Shrink(0).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
		for i := 0; i < 3; i++ {
			k := float32(0.55)
			if !still {
				ph := float64(now.UnixMilli())/1000*2*math.Pi/1.4 - float64(i)*0.9
				k = 0.35 + 0.65*float32(0.5+0.5*math.Sin(ph))
			}
			p.Fill(ui.Rect{X: r.X + float32(i)*11, Y: r.Y + 1, W: 8, H: 8}, t.Working.Ink.Alpha(k), 4)
		}
	})
	if !still {
		c.After(50 * time.Millisecond)
	}
}

// lendSheet draws the sheet while it is open.
func (a *App) lendSheet(c *ui.Context) {
	if !a.lend.open {
		return
	}
	t := a.T
	w, h := c.Size()
	if w <= 0 {
		w, h = 1040, 760
	}
	open := true
	ui.DialogBase(c, &open, func(back, panel ui.Element) {
		back.Background(t.Scrim)
		panel.Width(min(w-2*t.S6, 560)).MaxHeight(h-2*t.S6).Radius(t.RadiusXL).
			Background(t.Surface).Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Label(a.L.T("lend.title"))
		a.enter(c, panel)
		ui.Scroll(c.Key("lend-scroll")).Grow(1).MinHeight(0).Children(func() {
			ui.Column(c).Padding(t.S5, t.S6, t.S5, t.S6).Gap(t.S3).Children(func() {
				ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
					a.heading(c, a.L.T("lend.title"), t.XL).Grow(1).MinWidth(0)
					if a.button(c, a.L.T("lend.close"), btnText, t.ControlMD, t.Surface) {
						a.lend.open = false
					}
				})
				a.lendBody(c)
			})
		})
	})
	if !open {
		a.lend.open = false
	}
}

func (a *App) lendBody(c *ui.Context) {
	t := a.T
	if a.lend.kind == "" {
		ui.Text(c, a.L.T("lend.question")).FontSize(t.MD).FontWeight(700).TextColor(t.Ink)
		for _, k := range []string{"linux", "mac"} {
			k := k
			ui.Column(c.Key("lend-kind:" + k)).Children(func() {
				if a.button(c, a.L.T("lend.kind."+k), btnSecondary, t.ControlLG, t.Surface) {
					a.lend.kind = k
					a.askLend()
				}
			})
		}
		return
	}
	l := a.S.Lend
	phase := lendPhase(l, a.Now())
	// A home that had no address and has one now: a fresh code carries it.
	if phase == "noaddress" && a.reachAddress() != "" && a.lend.askedFor != a.reachAddress() {
		a.askLend()
		phase = "loading"
	}
	home := a.lendHomeName()
	switch phase {
	case "loading":
		if why := a.lendFailed(a.Now()); why != "" {
			a.reasonLine(c, a.L.T("lend.fail."+why, home))
			ui.Row(c).Children(func() {
				if a.button(c, a.L.T("lend.retry"), btnPrimary, t.ControlMD, t.Surface) {
					a.askLend()
				}
			})
			break
		}
		ui.Text(c, a.L.T("lend.loading")).FontSize(t.SM).TextColor(t.InkMuted)
		// Drawn again when the wait is over, to say so.
		if left := lendWait - a.Now().Sub(a.lend.asked); left > 0 {
			c.After(left + 50*time.Millisecond)
		}
	case "noaddress":
		a.infoText(c, a.L.T("lend.noaddress", home))
		if hd := a.homeDevice(); hd != nil && hd.State == protocol.DeviceAwake {
			ui.Row(c).Children(func() {
				if any := a.anywhere(); any != nil && any.State == "off" {
					if a.button(c, a.L.T("anywhere.turnOnLong"), btnPrimary, t.ControlMD, t.Surface) {
						a.send(protocol.AbilityReq{T: "ability", Device: hd.ID, Ability: protocol.AbilityRemote, On: true})
					}
				} else if a.button(c, a.L.T("anywhere.setup"), btnPrimary, t.ControlMD, t.Surface) {
					a.lend.open = false
					a.beginAnywhere()
				}
			})
		}
	case "expired":
		a.reasonLine(c, a.L.T("lend.expired"))
		ui.Row(c).Children(func() {
			if a.button(c, a.L.T("lend.newcode"), btnPrimary, t.ControlMD, t.Surface) {
				a.askLend()
			}
		})
	case "waiting":
		a.lendWaiting(c, l, home)
	case "joined":
		ui.Row(c.Key("lend-joined")).Gap(t.S3).AlignItems(ui.Center).MinHeight(t.ControlMD).Children(func() {
			a.lendDots(c)
			ui.Text(c, a.L.T("lend.joined")).FontSize(t.MD).FontWeight(700).TextColor(t.Ink)
		})
	case "here":
		a.lendHere(c, l)
		return
	}
	if phase != "joined" {
		ui.Row(c).Children(func() {
			if a.button(c, a.L.T("lend.kind.other"), btnText, t.ControlMD, t.Surface) {
				a.lend.kind = ""
			}
		})
	}
}

func (a *App) lendWaiting(c *ui.Context, l *protocol.ServerFrame, home string) {
	t := a.T
	if a.lend.kind == "mac" {
		ui.Text(c, a.L.T("lend.mac.app", home, a.L.T("work.mac.title", a.personaName()))).FontSize(t.SM).LineHeight(1.55).TextColor(t.InkSoft)
		ui.Text(c, a.L.T("lend.mac.paste")).FontSize(t.SM).FontWeight(700).LineHeight(1.5).TextColor(t.Ink)
	} else {
		ui.Text(c, a.L.T("lend.linux.paste")).FontSize(t.SM).FontWeight(700).LineHeight(1.5).TextColor(t.Ink)
	}
	a.lendCopy(c, "line", l.LendLine, true)
	ui.Text(c, a.L.T("lend.does")).FontSize(t.XS).LineHeight(1.5).TextColor(t.InkMuted)
	if left := store.ParseTime(l.ExpiresAt).Sub(a.Now()); left > 0 {
		ui.Text(c.Key("lend-left"), a.L.T("lend.left", int(math.Ceil(left.Minutes())))).FontSize(t.XS).LineHeight(1.5).TextColor(t.InkMuted)
		c.After(min(left, time.Minute))
	}
	if l.SameNetwork {
		ui.Text(c.Key("lend-samenet"), a.L.T("lend.samenet", home)).FontSize(t.SM).LineHeight(1.5).TextColor(t.Ink)
	}
	a.lendFold(c, "agent", a.L.T("lend.agent"), &a.lend.agentOpen)
	if a.lend.agentOpen {
		ui.Text(c, a.L.T("lend.agent.how")).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft)
		a.lendCopy(c, "agent", a.L.T("lend.agent.ask", l.LendLine), false)
	}
	ui.Row(c.Key("lend-wait")).Gap(t.S3).AlignItems(ui.Center).MinHeight(t.ControlMD).Children(func() {
		a.lendDots(c)
		ui.Text(c, a.L.T("lend.waiting")).FontSize(t.MD).FontWeight(700).TextColor(t.Ink)
	})
	a.lendFold(c, "help", a.L.T("lend.help"), &a.lend.helpOpen)
	if a.lend.helpOpen {
		item := func(key, what, do string, more func()) {
			ui.Column(c.Key("lend-help:"+key)).Gap(t.S1).Padding(t.S2, 0).Children(func() {
				ui.Text(c, what).FontSize(t.SM).FontWeight(800).TextColor(t.Ink)
				ui.Text(c, do).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft)
				if more != nil {
					more()
				}
			})
		}
		item("expired", a.L.T("lend.help.expired"), a.L.T("lend.help.expired.do"), func() {
			ui.Row(c).Children(func() {
				if a.button(c, a.L.T("lend.newcode"), btnSecondary, t.ControlMD, t.Surface) {
					a.askLend()
				}
			})
		})
		item("reach", a.L.T("lend.help.reach", home), a.L.T("lend.help.reach.do", l.Address), func() {
			if l.Check != "" {
				a.lendCopy(c, "check", l.Check, true)
			}
		})
		item("curl", a.L.T("lend.help.curl"), a.L.T("lend.help.curl.do"), nil)
		item("arch", a.L.T("lend.help.arch"), a.L.T("lend.help.arch.do"), nil)
	}
}

// lendHere: the computer arrived. Its name (renamable in place), its
// system, and the agents signed in there, each its own coin.
func (a *App) lendHere(c *ui.Context, l *protocol.ServerFrame) {
	t := a.T
	var dv *protocol.DeviceView
	for i := range a.S.Devices {
		if a.S.Devices[i].ID == l.Device {
			dv = &a.S.Devices[i]
		}
	}
	name := l.Name
	if dv != nil {
		name = a.deviceName(dv)
	}
	ui.Text(c.Key("lend-here"), a.L.T("lend.here", name)).FontSize(t.MD).FontWeight(800).TextColor(t.Working.Ink)
	real := name
	if dv != nil {
		real = dv.Name
	}
	ui.Row(c).Justify(ui.Center).Children(func() { a.cardName(c, l.Device, name, real, true) })
	if dv != nil {
		osName, arch := a.lendOS(dv.Platform)
		if osName != "" {
			ui.Row(c.Key("lend-os")).Gap(t.S3).AlignItems(ui.Center).Children(func() {
				ui.Text(c, a.L.T("lend.os")).FontSize(t.SM).TextColor(t.InkMuted).Width(120).Shrink(0)
				ui.Text(c, osName).FontSize(t.SM).FontWeight(700).TextColor(t.Ink)
				if arch != "" {
					ui.Text(c, arch).FontSize(t.SM).TextColor(t.InkMuted)
				}
			})
		}
		var in []protocol.DeviceHarness
		for _, h := range dv.Harnesses {
			if h.LoggedIn {
				in = append(in, h)
			}
		}
		ui.Text(c, a.L.T("lend.agents")).FontSize(t.SM).TextColor(t.InkMuted)
		if len(in) == 0 {
			a.infoText(c, a.L.T("lend.agents.none"))
		} else {
			ui.Row(c.Key("lend-agents")).Gap(t.S2).Wrap().Children(func() {
				for _, h := range in {
					h := h
					ui.Row(c.Key("lend-agent:"+h.Harness)).Gap(t.S2).Padding(t.S1, t.S3, t.S1, t.S1).MinHeight(t.ControlMD).Radius(t.RadiusLG).
						Background(t.Sunken).AlignItems(ui.Center).Children(func() {
						a.coinBox(c, "lend:"+h.Harness, h.Harness, 32, false, coinStill)
						ui.Text(c, harnessName(h.Harness)).FontSize(t.SM).FontWeight(700).TextColor(t.Ink)
					})
				}
			})
		}
	}
	ui.Row(c).Justify(ui.End).Children(func() {
		if a.button(c, a.L.T("lend.done"), btnPrimary, t.ControlMD, t.Surface) {
			a.lend.open = false
		}
	})
}
