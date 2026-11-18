package views

import (
	"math"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D347: 加一台做事的电脑 / Add a computer for tasks. One sheet over the window, opened
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
	// D358: add: the sheet is at 加一台设备's first step (what it is for);
	// fromAdd: it came from there, so back goes there.
	add, fromAdd bool
	// seen is the phase last drawn and when it began, for the clay's arrival.
	seen   string
	seenAt time.Time
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

// addDeviceRow is the one way to add a device on Your devices (D358): a row
// in the list's own shape, an empty clay slot where a device's clay would
// stand, the words, and what can come. It opens the sheet at its first
// step: what the device is for.
func (a *App) addDeviceRow(c *ui.Context, width float32) {
	t := a.T
	if a.listRow(c, "add-device", a.L.T("add.row"), a.L.T("add.row.sub"), t.InkMuted, false, false, width, func() {
		bmp := theme.Clay("slot_empty")
		ui.Box(c.Key("add-slot")).Size(36, 32).Shrink(0).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
			if bmp != nil {
				p.Image(bmp, fitIn(bmp, r), ui.Contain)
			}
			// The plus on the slot, drawn (never a typed glyph).
			// On the cream clay: a dark ink in both themes.
			ink := t.InkSoft
			if t.Dark {
				ink = t.Bg
			}
			cx, cy := r.X+r.W/2, r.Y+r.H*0.46
			p.Line(cx-5, cy, cx+5, cy, 2.2, ink)
			p.Line(cx, cy-5, cx, cy+5, 2.2, ink)
		})
	}) {
		a.openAdd()
	}
}

// openAdd opens the sheet at 加一台设备 / Add a device.
func (a *App) openAdd() {
	a.lend = lendState{open: true, add: true}
	a.S.Lend = nil
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

// lendCard is the partner's 加一台做事的电脑 card (a rich lend block).
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

// lendSheet draws the sheet while it is open: a back arrow when there is a
// step to go back to, the title, Close, then the step.
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
	title := a.L.T("lend.title")
	if a.lend.add {
		title = a.L.T("add.title")
	}
	ui.DialogBase(c, &open, func(back, panel ui.Element) {
		back.Background(t.Scrim)
		panel.Width(min(w-2*t.S6, 600)).MaxHeight(h-2*t.S6).Radius(t.RadiusXL).
			Background(t.Surface).Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Label(title)
		a.enter(c, panel)
		ui.Scroll(c.Key("lend-scroll")).Grow(1).MinHeight(0).Children(func() {
			ui.Column(c).Padding(t.S5, t.S6, t.S6, t.S6).Gap(t.S3).Children(func() {
				ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
					if back := a.lendBack(); back != "" {
						if a.iconButton(c, back, t.ControlMD, btnText, drawBack) {
							a.lendGoBack()
						}
					}
					a.heading(c, title, t.XL).Grow(1).MinWidth(0)
					if a.button(c, a.L.T("lend.close"), btnText, t.ControlMD, t.Surface) {
						a.lend.open = false
					}
				})
				if a.lend.add {
					a.addBody(c)
					return
				}
				a.lendBody(c)
			})
		})
	})
	if !open {
		a.lend.open = false
	}
}

// lendBack is the back arrow's name, or "" when the sheet is at its start.
func (a *App) lendBack() string {
	switch {
	case a.lend.add:
		return ""
	case a.lend.kind != "" && lendPhase(a.S.Lend, a.Now()) != "joined" && lendPhase(a.S.Lend, a.Now()) != "here":
		return a.L.T("lend.kind.other")
	case a.lend.kind == "" && a.lend.fromAdd:
		return a.L.T("add.back")
	}
	return ""
}

func (a *App) lendGoBack() {
	if a.lend.kind != "" {
		a.lend.kind, a.lend.agentOpen, a.lend.helpOpen = "", false, false
		return
	}
	a.lend.add = true
}

// addBody is 加一台设备's first step (D358): what the device is for, as two
// clay cards. To talk: a phone, a tablet or another computer, by the code
// on the sign in the scene (D81). To do tasks: a Mac or a server, by the
// one line (D347).
func (a *App) addBody(c *ui.Context) {
	t := a.T
	name := a.personaName()
	ui.Text(c, a.L.T("add.question")).FontSize(t.MD).FontWeight(700).TextColor(t.InkSoft)
	ui.Row(c.Key("add-cards")).Gap(t.S3).AlignItems(ui.Stretch).Children(func() {
		if a.clayCard(c, "talk", []string{"tablet", "phone"}, a.L.T("add.talk", name), a.L.T("add.talk.sub")) {
			a.lend.open = false
			a.devState().account = ""
			a.openPair()
		}
		if a.clayCard(c, "work", []string{"laptop_awake", "server_awake"}, a.L.T("add.work", name), a.L.T("add.work.sub")) {
			a.lend.add, a.lend.fromAdd = false, true
		}
	})
}

// clayCard is a big choice: the clay standing on its own light, the words
// under it. A card on Raised that lifts under the pointer (never a ledge).
func (a *App) clayCard(c *ui.Context, key string, arts []string, title, sub string) bool {
	t := a.T
	card := ui.Column(c.Key("claycard:"+key)).Grow(1).Basis(0).MinWidth(0).Gap(t.S2).Padding(t.S4, t.S4, t.S5, t.S4).
		Radius(t.RadiusLG).Background(t.Bg).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(title).Focusable()
	a.selectable(c, card, false)
	card.Children(func() {
		a.clayStage(c, "claycard:"+key, arts, 120, idleFloat, 1, false)
		ui.Text(c, title).FontSize(t.MD).FontWeight(800).TextColor(t.Ink).LineHeight(1.35)
		if sub != "" {
			ui.Text(c, sub).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft)
		}
	})
	return card.Clicked()
}

// clayStage draws one or two pieces of clay side by side on a soft ground
// shadow, moving by kind; pop (1 → more) swells it for an arrival; ring
// draws the calm ripple of a wait under it.
func (a *App) clayStage(c *ui.Context, key string, arts []string, height float32, kind idleKind, pop float32, ring bool) {
	t := a.T
	var bmps []*ui.Bitmap
	for _, n := range arts {
		if b := theme.Clay(n); b != nil {
			bmps = append(bmps, b)
		}
	}
	still := c.Preferences().ReduceMotion
	ui.Box(c.Key("stage:" + key)).Height(height).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
		gw := min(r.W*0.55, height*1.2)
		ground := ui.Rect{X: r.X + (r.W-gw)/2, Y: r.Y + r.H - 14, W: gw, H: 10}
		if ring && !still {
			// The wait: a ring that widens from under the clay and fades, again and again.
			k := float32(cycle(p.Now(), 2400*time.Millisecond, 0))
			rw := gw * (0.7 + 0.5*k)
			rr := ui.Rect{X: r.X + (r.W-rw)/2, Y: ground.Y + 6 - rw*0.09, W: rw, H: rw * 0.18}
			p.Stroke(rr, t.Working.Ink.Alpha(0.45*(1-k)), rr.H/2, 2)
		}
		p.Fill(ground, t.Ink.Alpha(0.06), 5)
		n := len(bmps)
		if n == 0 {
			return
		}
		cell := min(r.W/float32(n), height*1.25)
		x0 := r.X + (r.W-cell*float32(n))/2
		for i, b := range bmps {
			box := ui.Rect{X: x0 + float32(i)*cell, Y: r.Y + 4, W: cell, H: r.H - 14}
			if n > 1 {
				// Two pieces lean in: the first a little smaller and behind.
				s := float32(0.82)
				if i == n-1 {
					s = 1
				}
				box = ui.Rect{X: box.X + box.W*(1-s)/2 + float32(1-2*i)*cell*0.08, Y: box.Y + box.H*(1-s), W: box.W * s, H: box.H * s}
			}
			at := fitIn(b, box)
			draw := func() { clayArt(p, at, b, kind, phaseOf(key)+float64(i)*0.37, nil) }
			if pop != 1 {
				p.Transform(ui.Scaling(pop, pop), at.X+at.W/2, at.Y+at.H, draw)
			} else {
				draw()
			}
		}
		if ring && !still {
			p.After(50 * time.Millisecond)
		}
	})
}

// lendHero is the computer being lent, in clay, telling the wait without
// words: asleep under its blanket while nobody has run the line, a ripple
// under it while it is waited for, awake and swelling once as it joins,
// floating once it is here; greyed when the code ran out.
func (a *App) lendHero(c *ui.Context, phase string) {
	kind := "server"
	if a.lend.kind == "mac" {
		kind = "laptop"
	}
	if a.lend.seen != phase {
		a.lend.seen, a.lend.seenAt = phase, a.Now()
	}
	art, idle, ring, pop := kind+"_asleep", idleBlanket, false, float32(1)
	switch phase {
	case "waiting":
		ring = true
	case "joined", "here":
		art, idle = kind+"_awake", idleFloat
		if kind == "server" {
			idle = idleDrift
		}
		// One swell as it arrives: up and settle, 700 ms.
		if since := a.Now().Sub(a.lend.seenAt); phase == "joined" && since < 700*time.Millisecond && !c.Preferences().ReduceMotion {
			f := float64(since) / float64(700*time.Millisecond)
			pop = 1 + float32(0.14*math.Sin(math.Pi*f)*(1-f*0.4))
			c.After(16 * time.Millisecond)
		}
	case "expired", "noaddress":
		idle = idleStill
	}
	box := ui.Column(c.Key("lend-hero")).Padding(0, 0, 0, 0)
	if phase == "expired" || phase == "noaddress" {
		box.Grayscale().Opacity(0.7)
	}
	box.Children(func() { a.clayStage(c, "lend-hero:"+kind, []string{art}, 132, idle, pop, ring) })
}

// lendCaption is the one line under the clay: the state, its live dots.
func (a *App) lendCaption(c *ui.Context, key, text string, dots bool, ink ui.Color) {
	t := a.T
	ui.Row(c.Key("lend-cap:" + key)).Gap(t.S3).Justify(ui.Center).AlignItems(ui.Center).MinHeight(t.ControlSM).Role(ui.RoleStatus).Label(text).Children(func() {
		if dots {
			a.lendDots(c)
		}
		ui.Text(c, text).FontSize(t.MD).FontWeight(800).TextColor(ink).AccessHidden(true)
	})
}

func (a *App) lendBody(c *ui.Context) {
	t := a.T
	if a.lend.kind == "" {
		ui.Text(c, a.L.T("lend.question")).FontSize(t.MD).FontWeight(700).TextColor(t.InkSoft)
		ui.Row(c.Key("lend-kinds")).Gap(t.S3).AlignItems(ui.Stretch).Children(func() {
			for _, k := range []struct{ id, art string }{{"linux", "server_awake"}, {"mac", "laptop_awake"}} {
				if a.clayCard(c, "kind:"+k.id, []string{k.art}, a.L.T("lend.kind."+k.id), a.L.T("lend.kind."+k.id+".sub")) {
					a.lend.kind = k.id
					a.askLend()
				}
			}
		})
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
	if phase != "here" {
		a.lendHero(c, phase)
	}
	switch phase {
	case "loading":
		if why := a.lendFailed(a.Now()); why != "" {
			// D353's words, said under the clay as one sentence and one way on.
			ui.Text(c.Key("lend-failed"), a.L.T("lend.fail."+why, home)).FontSize(t.MD).FontWeight(700).LineHeight(1.5).TextColor(t.Ink).Role(ui.RoleAlert)
			ui.Row(c).Justify(ui.Center).Children(func() {
				if a.button(c, a.L.T("lend.retry"), btnPrimary, t.ControlMD, t.Surface) {
					a.askLend()
				}
			})
			break
		}
		a.lendCaption(c, "loading", a.L.T("lend.loading"), true, t.InkSoft)
		a.lendSteps(c)
		// The line's place, kept while it is made, so nothing jumps when it comes.
		ui.Box(c.Key("lend-line-wait")).Height(64).Radius(t.RadiusSM).Background(t.Sunken)
		// Drawn again when the wait is over, to say so.
		if left := lendWait - a.Now().Sub(a.lend.asked); left > 0 {
			c.After(left + 50*time.Millisecond)
		}
	case "noaddress":
		ui.Text(c.Key("lend-noaddress"), a.L.T("lend.noaddress", home)).FontSize(t.MD).FontWeight(700).LineHeight(1.5).TextColor(t.Ink)
		if hd := a.homeDevice(); hd != nil && hd.State == protocol.DeviceAwake {
			ui.Row(c).Justify(ui.Center).Children(func() {
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
		a.lendCaption(c, "expired", a.L.T("lend.expired"), false, t.Ink)
		ui.Row(c).Justify(ui.Center).Children(func() {
			if a.button(c, a.L.T("lend.newcode"), btnPrimary, t.ControlMD, t.Surface) {
				a.askLend()
			}
		})
	case "waiting":
		a.lendWaiting(c, l, home)
	case "joined":
		a.lendCaption(c, "joined", a.L.T("lend.joined"), true, t.Working.Ink)
	case "here":
		a.lendHere(c, l)
	}
}

// lendSteps is the short sequence: copy, paste there, it joins by itself.
func (a *App) lendSteps(c *ui.Context) {
	t := a.T
	where := "lend.step.paste." + a.lend.kind
	ui.Row(c.Key("lend-steps")).Gap(t.S2).AlignItems(ui.Start).Children(func() {
		for i, k := range []string{"lend.step.copy", where, "lend.step.joins"} {
			ui.Row(c.Key("lend-step:" + k)).Gap(t.S2).Grow(1).Basis(0).MinWidth(0).AlignItems(ui.Center).Children(func() {
				n := string(rune('1' + i))
				ui.Row(c).Size(26, 26).Shrink(0).Radius(13).Background(t.Sunken).Justify(ui.Center).AlignItems(ui.Center).AccessHidden(true).Children(func() {
					ui.Text(c, n).FontSize(t.SM).FontWeight(800).TextColor(t.InkSoft)
				})
				ui.Text(c, a.L.T(k)).FontSize(t.SM).FontWeight(700).LineHeight(1.35).TextColor(t.Ink).Grow(1).MinWidth(0)
			})
		}
	})
}

func (a *App) lendWaiting(c *ui.Context, l *protocol.ServerFrame, home string) {
	t := a.T
	a.lendCaption(c, "waiting", a.L.T("lend.waiting"), true, t.Working.Ink)
	if a.lend.kind == "mac" {
		ui.Text(c, a.L.T("lend.mac.app", home, a.L.T("work.mac.title", a.personaName()))).FontSize(t.SM).LineHeight(1.55).TextColor(t.InkSoft)
	}
	a.lendSteps(c)
	a.commandBoxSized(c, l.LendLine, t.SM)
	facts := ui.Column(c.Key("lend-facts")).Gap(t.S1)
	facts.Children(func() {
		if left := store.ParseTime(l.ExpiresAt).Sub(a.Now()); left > 0 {
			ui.Text(c.Key("lend-left"), a.L.T("lend.left", int(math.Ceil(left.Minutes())))).FontSize(t.XS).LineHeight(1.5).TextColor(t.InkMuted)
			c.After(min(left, time.Minute))
		}
		ui.Text(c, a.L.T("lend.does")).FontSize(t.XS).LineHeight(1.5).TextColor(t.InkMuted)
		if l.SameNetwork {
			ui.Text(c.Key("lend-samenet"), a.L.T("lend.samenet", home)).FontSize(t.SM).LineHeight(1.5).TextColor(t.Ink)
		}
	})
	a.lendFold(c, "agent", a.L.T("lend.agent"), &a.lend.agentOpen)
	if a.lend.agentOpen {
		ui.Text(c, a.L.T("lend.agent.how")).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkSoft)
		a.lendCopy(c, "agent", a.L.T("lend.agent.ask", l.LendLine), false)
	}
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
