package views

import (
	"math"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D161 (design/ui-devices-card.md): every device card is a character
// sheet. Who: the device's clay big on its own little ground, its name
// under it, renamed in place. How it is: one status line in words. What it
// carries: its AI agents as a row of coins, each one's detail opening in
// place. What it can do: its abilities as toggle chips, each with an ⓘ.
// Then one quiet line of how it is connected (its ⋯ opens the connections
// in place), Ducter's own version only when there is an update, and one
// 断开这台 {device} at the very bottom. Nothing floats over the card.

// sheetState is the character sheet's own state, kept across frames.
type sheetState struct {
	coin      string               // "device|harness" whose detail is open ("device|+": the socket)
	via       string               // the card whose connections are open
	info      string               // "card|chip" whose ⓘ note is open
	stopAsk   string               // the device whose 替 {home} 做事 chip asked before stopping
	stopAfter string               // the device that stops doing tasks once its tasks finish
	log       bool                 // 看日志 asked: the log's path shows
	squish    map[string]time.Time // a chip's key → when it was toggled
	pop       map[string]time.Time // a coin's key → when its update landed
	phase     map[string]string    // a coin's key → its update phase, last frame
}

const (
	sheetW      = 380 // the card's width beside the stage (the prototype's)
	heroH       = 168
	heroArt     = 150
	heroArtTall = 92 // a phone's clay is tall
	coinTileW   = 76
	coinTileGap = 2
	coinSize    = 52
	chipH       = 40
	chipArt     = 30
)

// deviceDetail is the chosen island's card beside the stage (D161).
func (a *App) deviceDetail(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	d := a.devState()
	a.drainDeviceResults()
	a.watchAgentUpdates()
	card := ui.Column(c.Key("device-card")).Shrink(0).Radius(t.RadiusLG).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).
		Padding(t.S2, t.S5, t.S4+2, t.S5).Gap(0)
	if d.selClient != "" && a.S.Reach != nil {
		for i := range a.S.Reach.Clients {
			cl := &a.S.Reach.Clients[i]
			if cl.ID != d.selClient || a.fold().hidden[cl.ID] {
				continue
			}
			card.Role(ui.RoleGroup).Label(a.clientName(cl) + ", " + a.clientKind(cl)).Children(func() { a.clientCard(c, cl) })
			return
		}
		d.selClient = ""
	}
	if dv == nil {
		return
	}
	name := a.deviceName(dv)
	card.Role(ui.RoleGroup).Label(name + ", " + a.kindLine(dv)).Children(func() {
		// D155: every device renames in place, the home too; the title says "this Mac"
		// for the Mac this app runs Ducter on, and the field edits its real name.
		a.sheetHero(c, "dev:"+dv.ID, deviceArt(dv), deviceIdle(dv), dv.State == protocol.DeviceUnreachable)
		a.sheetName(c, dv.ID, name, dv.Name, true)
		line, ink, strong := a.sheetStatus(dv)
		a.statusLine(c, line, ink, strong)
		// D157: a laptop doing tasks, with another computer to carry them: one tap before closing it.
		if dv.Kind == "laptop" && dv.State == protocol.DeviceAwake && a.runningOn(dv) > 0 && a.manyComputers() {
			ui.Row(c).Justify(ui.Center).Margin(0, 0, t.S3, 0).Children(func() { a.closingRow(c, dv) })
		}
		a.coinTray(c, dv)
		a.chipRow(c, "dev:"+dv.ID, dv, nil)
		if !dv.Home {
			a.viaLine(c, "dev:"+dv.ID, deviceComputer(dv), nil)
		}
		a.ducterLine(c, dv)
		if !dv.Home {
			a.sheetFoot(c, dv.ID, name, name, "device.disconnect.means")
		}
	})
}

// clientCard is a phone's (or a window's, or a lone command line's) sheet:
// the same shape, without coins.
func (a *App) clientCard(c *ui.Context, cl *protocol.ReachClient) {
	t := a.T
	name := a.clientName(cl)
	computer := clientComputer(cl)
	art := clientArt(cl)
	kind := idleStill
	if cl.Connected {
		kind = idleFloat
	}
	a.sheetHero(c, "cl:"+cl.ID, art, kind, false)
	a.sheetName(c, cl.ID, name, cl.Name, true)
	line, _ := a.clientState(cl)
	if computer != "" && !isCLI(cl) && a.isThisMac(computer) {
		line = a.L.T("card.status.this")
	}
	a.statusLine(c, line, t.InkMuted, false)
	a.chipRow(c, "cl:"+cl.ID, nil, cl)
	a.handsetCard(c, cl)
	a.viaLine(c, "cl:"+cl.ID, computer, cl)
	if isCLI(cl) {
		a.sheetFoot(c, cl.ID, name, a.L.T("device.cli.name", computer), "device.disconnect.means.cli")
		return
	}
	a.sheetFoot(c, cl.ID, name, name, "device.disconnect.means.client")
}

// ---------- who ----------

// sheetHero is the device's clay, big, standing on a soft sunken oval; it
// moves as D77 allows (awake floats, asleep breathes under its blanket),
// and one that can't be reached is a little grey in mist.
func (a *App) sheetHero(c *ui.Context, key, art string, kind idleKind, grey bool) {
	t := a.T
	w := float32(heroArt)
	if art == "phone" {
		w = heroArtTall
	}
	bmp := theme.Clay(art)
	phase := phaseOf(key)
	hero := ui.Column(c.Key("hero:" + key)).Height(heroH).AlignItems(ui.Center).Justify(ui.End).AccessHidden(true)
	hero.Draw(func(p *ui.Painter, r ui.Rect) {
		softEllipse(p, ui.Rect{X: r.X + r.W/2 - 100, Y: r.Y + r.H - 40, W: 200, H: 36}, t.Line)
	})
	hero.Children(func() {
		box := ui.Box(c.Key("hero-art:"+key)).Size(w, heroH-24).Margin(0, 0, 14, 0)
		if grey {
			box.Grayscale().Opacity(0.7)
		}
		box.Draw(func(p *ui.Painter, r ui.Rect) {
			at := fitIn(bmp, r)
			at.Y = r.Y + r.H - at.H // it stands on the ground
			clayArt(p, at, bmp, kind, phase, nil)
		})
		if grey {
			ui.Box(c.Key("hero-mist:" + key)).Absolute().Left(0).Top(0).WidthPercent(100).Height(heroH).Draw(func(p *ui.Painter, r ui.Rect) {
				softEllipse(p, ui.Rect{X: r.X + r.W*0.2, Y: r.Y + r.H*0.3, W: r.W * 0.6, H: r.H * 0.6}, t.Isles.Mist.Alpha(0.85))
			})
		}
	})
}

// sheetName is the name under the clay, centered, renamed by clicking it.
func (a *App) sheetName(c *ui.Context, id, name, real string, renamable bool) {
	ui.Row(c.Key("sheet-name:"+id)).Justify(ui.Center).Margin(2, 0, 0, 0).Children(func() {
		a.cardName(c, id, name, real, renamable)
	})
}

// sheetStatus is the one status line under a device's name (§3.2): the
// role or the state, never the kind and never how it connects.
func (a *App) sheetStatus(dv *protocol.DeviceView) (string, ui.Color, bool) {
	t := a.T
	switch dv.State {
	case protocol.DeviceUnreachable:
		if ago := a.agoLong(dv.LastSeen); ago != "" {
			return a.L.T("card.status.unreachable", ago), t.Failed.Ink, true
		}
		return a.L.T("card.status.unreachable.none"), t.Failed.Ink, true
	case protocol.DeviceAsleep:
		return a.L.T("device.state.asleep"), t.Asleep.Ink, true
	}
	n := a.runningOn(dv)
	if dv.Home {
		who := a.S.PersonaName
		switch {
		case n == 1:
			return a.L.T("card.status.home.working.one", who), t.InkMuted, false
		case n > 1:
			return a.L.T("card.status.home.working", who, n), t.InkMuted, false
		}
		return a.L.T("card.status.home", who), t.InkMuted, false
	}
	if dv.Kind == "phone" {
		return a.L.T("device.client.now"), t.InkMuted, false
	}
	home := a.workHome()
	switch {
	case n == 1:
		return a.L.T("card.status.working.one", home), t.Working.Ink, true
	case n > 1:
		return a.L.T("card.status.working", home, n), t.Working.Ink, true
	}
	return a.L.T("card.status.does", home), t.InkMuted, false
}

func (a *App) statusLine(c *ui.Context, line string, ink ui.Color, strong bool) {
	t := a.T
	w := 500
	if strong {
		w = 700
	}
	ui.Text(c, line).FontSize(t.MD).FontWeight(w).TextColor(ink).TextAlign(ui.Center).LineHeight(1.5).Margin(2, 0, t.S4, 0)
}

// ---------- what it carries: the coins ----------

// coinKey names one agent on one device.
func coinKey(device, harness string) string { return device + "|" + harness }

// manageAccount: this app runs Ducter on that device, so an account can be
// signed in or out from here (D148).
func (a *App) manageAccount(dv *protocol.DeviceView, h protocol.DeviceHarness) bool {
	return a.Backend != nil && dv.Home && dv.State == protocol.DeviceAwake && accountCheck(h.Harness) != ""
}

// watchAgentUpdates notices an agent update landing, so its coin pops once
// (§7) wherever the card is.
func (a *App) watchAgentUpdates() {
	s := &a.devState().card.sheet
	if s.phase == nil {
		s.phase, s.pop, s.squish = map[string]string{}, map[string]time.Time{}, map[string]time.Time{}
	}
	for i := range a.S.Devices {
		dv := &a.S.Devices[i]
		for _, h := range dv.Harnesses {
			k := coinKey(dv.ID, h.Harness)
			ph := ""
			if h.Update != nil {
				ph = h.Update.Phase
			}
			prev, seen := s.phase[k]
			if seen && ph == "done" && prev != "done" && prev != "" && prev != "failed" {
				s.pop[k] = a.Now()
			}
			s.phase[k] = ph
		}
	}
}

// coinTray is the loadout: the agents on that device as coins on a sunken
// tray, their names under them, grey when signed out, one quiet dot when
// an update exists; a dashed socket ends the row when an agent isn't on it
// yet. A tapped coin's detail opens under the tray.
func (a *App) coinTray(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	s := &a.devState().card.sheet
	var shown []protocol.DeviceHarness
	missing := 0
	for _, h := range dv.Harnesses {
		if h.Installed {
			shown = append(shown, h)
		} else {
			missing++
		}
	}
	socket := missing > 0
	n := len(shown)
	if socket {
		n++
	}
	if n == 0 {
		return
	}
	open := ""
	if strings.HasPrefix(s.coin, dv.ID+"|") {
		open = strings.TrimPrefix(s.coin, dv.ID+"|")
	}
	ui.Row(c.Key("tray:"+dv.ID)).Gap(coinTileGap).Justify(ui.Center).Wrap().Padding(t.S3, t.S2, t.S2, t.S2).Radius(18).Background(t.Sunken).
		Role(ui.RoleGroup).Label(a.L.T("devices.accounts", a.deviceNameIn(dv))).Children(func() {
		for _, h := range shown {
			a.coinTile(c, dv, h, open == h.Harness)
		}
		if socket {
			a.socketTile(c, dv, open == "+")
		}
	})
	switch {
	case open == "+" && socket:
		a.socketDetail(c, dv, n-1, n)
	case open != "":
		for i, h := range shown {
			if h.Harness == open {
				a.coinDetail(c, dv, h, i, n)
			}
		}
	}
}

// coinTile is one coin in the tray, with its name under it.
func (a *App) coinTile(c *ui.Context, dv *protocol.DeviceView, h protocol.DeviceHarness, sel bool) {
	t := a.T
	d := a.devState()
	s := &d.card.sheet
	name := harnessName(h.Harness)
	off := !h.LoggedIn || dv.State != protocol.DeviceAwake
	dot := agentBehind(&h)
	label := name + " · " + a.deviceNameIn(dv)
	if !h.LoggedIn {
		label += " · " + a.L.T("coin.signed_out")
	}
	if dot {
		label += " · " + a.L.T("agentv.available", h.Latest)
	}
	key := coinKey(dv.ID, h.Harness)
	tile := ui.Column(c.Key("coin:"+key)).Width(coinTileW).AlignItems(ui.Center).Gap(2).Padding(t.S1, 0, 2, 0).Radius(14).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(label).Focusable().AccessSelected(sel)
	ring := t.Sunken
	switch {
	case sel:
		tile.Background(t.Surface).Shadow(0, 2, 0, 0, t.Line2)
		ring = t.Surface
	case tile.Hovered():
		tile.Background(t.Surface.Alpha(0.55))
	}
	popAt := s.pop[key]
	running := h.Update.Running()
	phase := phaseOf(key)
	tile.Children(func() {
		art := ui.Box(c.Key("coin-art:"+key)).Size(coinSize, coinSize).AccessHidden(true)
		if tile.Pressed() && !c.Preferences().ReduceMotion {
			art.Translate(0, 2)
		}
		art.Draw(func(p *ui.Painter, r ui.Rect) {
			still := p.Preferences().ReduceMotion
			el := p.Now().Sub(popAt)
			if !popAt.IsZero() && el < 520*time.Millisecond && !still {
				// The update landed: the coin pops (1 → 1.16 → 1) with one little wiggle.
				f := float32(el) / float32(420*time.Millisecond)
				k := float32(1)
				if f < 1 {
					k = 1 + 0.16*float32(math.Sin(math.Pi*float64(f)))*(1-0.35*f)
				}
				g := float64(el) / float64(520*time.Millisecond)
				deg := float32(8 * math.Sin(2*math.Pi*g) * (1 - g))
				p.Transform(ui.Scaling(k, k), r.X+r.W/2, r.Y+r.H/2, func() {
					p.Transform(ui.Rotation(deg), r.X+r.W/2, r.Y+r.H*0.9, func() { drawCoin(p, r, h.Harness, off, coinStill, phase) })
				})
				p.AnimationFrame()
			} else {
				drawCoin(p, r, h.Harness, off, coinStill, phase)
			}
			if dot && !running {
				// One static accent dot (D148/D156), never pulsing.
				var m ui.Path
				m.Circle(r.X+r.W-7, r.Y+7, 8.5)
				p.FillPath(&m, ring)
				var n ui.Path
				n.Circle(r.X+r.W-7, r.Y+7, 6)
				p.FillPath(&n, t.Accent)
			}
			if running && !sel {
				// An update the user started, with the detail closed: a thin accent ring turns round the rim.
				f0 := float32(0)
				if !still {
					f0 = float32(cycle(p.Now(), 1100*time.Millisecond, 0))
					idleFrame(p)
				}
				arc(p, r.X+r.W/2, r.Y+r.H/2, r.W/2+1.5, f0, f0+0.28, 2.5, t.Accent)
			}
		})
		col, w := t.InkSoft, 700
		if !h.LoggedIn {
			col, w = t.InkMuted, 600
		}
		ui.Text(c, name).FontSize(t.XS).FontWeight(w).TextColor(col).SingleLine().AccessHidden(true)
	})
	if tile.Clicked() {
		if sel {
			s.coin, d.lit = "", ""
		} else {
			s.coin = key
			if h.LoggedIn {
				d.lit, d.litAt = h.Harness, a.Now() // every island it's signed in on lifts
			}
		}
	}
}

// socketTile is the dashed coin-sized socket at the row's end: 再登录一个.
func (a *App) socketTile(c *ui.Context, dv *protocol.DeviceView, sel bool) {
	t := a.T
	s := &a.devState().card.sheet
	label := a.L.T("coin.socket")
	tile := ui.Column(c.Key("coin-socket:"+dv.ID)).Width(coinTileW).AlignItems(ui.Center).Gap(2).Padding(t.S1, 0, 2, 0).Radius(14).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(label).Focusable().AccessSelected(sel)
	if sel {
		tile.Background(t.Surface).Shadow(0, 2, 0, 0, t.Line2)
	} else if tile.Hovered() {
		tile.Background(t.Surface.Alpha(0.55))
	}
	tile.Children(func() {
		ui.Box(c.Key("socket-art")).Size(coinSize, coinSize).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
			var bg ui.Path
			bg.Circle(r.X+r.W/2, r.Y+r.H/2, r.W/2-2)
			p.FillPath(&bg, t.Surface.Alpha(0.4))
			var m ui.Path
			m.Circle(r.X+r.W/2, r.Y+r.H/2, r.W/2-2)
			m.Dash(0, 5, 4)
			p.StrokePath(&m, 2, t.Line2)
			var plus ui.Path
			cx, cy := r.X+r.W/2, r.Y+r.H/2
			plus.MoveTo(cx-7, cy).LineTo(cx+7, cy).MoveTo(cx, cy-7).LineTo(cx, cy+7)
			plus.Cap(ui.RoundCap)
			p.StrokePath(&plus, 2.5, t.InkMuted)
		})
		ui.Text(c, label).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted).SingleLine().AccessHidden(true)
	})
	if tile.Clicked() {
		if sel {
			s.coin = ""
		} else {
			s.coin = coinKey(dv.ID, "+")
		}
	}
}

// detailBox is the in-place detail under the tray, its notch pointing at
// the coin (idx of n tiles).
func (a *App) detailBox(c *ui.Context, key, label string, idx, n int, body func()) {
	t := a.T
	box := ui.Column(c.Key("coin-detail:"+key)).Gap(t.S1).Margin(10, 0, 0, 0).Padding(t.S3+2, t.S4).Radius(t.RadiusMD).Background(t.Surface).
		InsetShadow(0, 0, 0, 1, t.Line).Shadow(0, 2, 0, 0, t.Line).Role(ui.RoleGroup).Label(label)
	box.Draw(func(p *ui.Painter, r ui.Rect) {
		total := float32(n)*coinTileW + float32(n-1)*coinTileGap
		x := r.X + (r.W-total)/2 + float32(idx)*(coinTileW+coinTileGap) + coinTileW/2
		var m ui.Path
		m.MoveTo(x-8, r.Y+1).LineTo(x, r.Y-7).LineTo(x+8, r.Y+1).Close()
		p.FillPath(&m, t.Surface)
		var e ui.Path
		e.MoveTo(x-8, r.Y).LineTo(x, r.Y-8).LineTo(x+8, r.Y)
		p.StrokePath(&e, 1, t.Line)
	})
	a.enter(c, box)
	box.Children(body)
}

// coinLines are extra quiet lines in a coin's detail, under who shares its
// account and above the update, each from one fact about that agent on
// that device; "" says nothing. A feature adds its line here (D169: its
// Nowledge Mem line, memplugin.go).
var coinLines []func(a *App, dv *protocol.DeviceView, h protocol.DeviceHarness) string

// coinActions draw what a coinLines line offers to do, right under the
// lines, with shared controls only (D169: 装上 Nowledge Mem and its in-place
// ask). Nothing to do: they draw nothing.
var coinActions []func(a *App, c *ui.Context, dv *protocol.DeviceView, h protocol.DeviceHarness)

// coinHow is how a copy was installed, in words, for the version line.
func (a *App) coinHow(h protocol.DeviceHarness) string {
	switch h.How {
	case "npm", "brew", "installer":
		return a.L.T("coin.how." + h.How)
	case "app":
		return a.L.T("agentv.how.app", agentAppName(h.Harness))
	case "ducter":
		return a.L.T("agentv.how.ducter")
	}
	return ""
}

// sharedWith names the other devices the same account is signed in on.
func (a *App) sharedWith(dv *protocol.DeviceView, harness string) string {
	var names []string
	for _, o := range a.signedIn(harness) {
		if o.ID != dv.ID {
			names = append(names, a.deviceNameIn(o))
		}
	}
	return strings.Join(names, a.L.T("card.via.and"))
}

// coinDetail is one agent's detail, in place: its name and model, its
// version and how it was installed, the honest "not checked" line once,
// the update with its steps, 用它做事, who shares the account, sign out.
func (a *App) coinDetail(c *ui.Context, dv *protocol.DeviceView, h protocol.DeviceHarness, idx, n int) {
	t := a.T
	d := a.devState()
	name := harnessName(h.Harness)
	manage := a.manageAccount(dv, h)
	a.detailBox(c, coinKey(dv.ID, h.Harness), name, idx, n, func() {
		if !h.LoggedIn {
			ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Wrap().Children(func() {
				ui.Text(c, name).FontSize(t.MD).FontWeight(800)
				ui.Text(c, a.L.T("coin.signed_out")).FontSize(t.SM).TextColor(t.InkMuted)
			})
			ui.Text(c, a.L.T("coin.signin.why", a.deviceNameIn(dv))).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5)
			if manage {
				ui.Row(c).Justify(ui.End).Margin(t.S1, 0, 0, 0).Children(func() {
					if a.buttonFor(c, a.L.T("token.signin"), name, btnPrimary, t.ControlSM, t.Surface) {
						d.account = h.Harness
					}
				})
			} else {
				ui.Text(c, a.L.T("coin.there", a.deviceNameIn(dv))).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5)
			}
			return
		}
		title := name
		if dv.Home && a.brain().Harness == h.Harness {
			if m := modelLabel(&h, a.brain().Model); m != "" {
				title += " · " + m
			}
		}
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Wrap().Children(func() {
			ui.Text(c, title).FontSize(t.MD).FontWeight(800)
			if m := a.BrainMark(dv, h.Harness); m != "" {
				ui.Text(c, m).FontSize(t.SM).TextColor(t.InkMuted)
			}
		})
		if h.Version != "" {
			line := a.L.T("agentv.version", h.Version)
			if how := a.coinHow(h); how != "" {
				line = a.L.T("coin.version", h.Version, how)
			}
			ui.Text(c, line).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.5).Selectable()
		}
		if h.How == "unknown" {
			ui.Text(c, a.L.T("agentv.how.unknown")).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5)
		}
		if h.Standing == "newer" || h.Standing == "older" {
			ui.Text(c, a.L.T("agentv.unverified")).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5)
		}
		if who := a.sharedWith(dv, h.Harness); who != "" && h.Allowance != nil && h.Allowance.SharedBy > 1 {
			ui.Text(c, a.L.T("coin.shared", who)).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5)
		}
		// The slot for more per-agent lines (the next is its 记忆 / memory line, from a protocol field).
		for _, line := range coinLines {
			if s := line(a, dv, h); s != "" {
				ui.Text(c, s).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5)
			}
		}
		for _, act := range coinActions {
			act(a, c, dv, h)
		}
		a.agentUpdate(c, dv, h)
		if st := a.S.Settings; st != nil {
			on := a.taskReady(h)
			if v, ch := a.switchRow(c, "tasks:"+dv.ID+":"+h.Harness, a.L.T("loadout.acct.tasks"), "", on); ch {
				if st.TaskAccounts == nil {
					st.TaskAccounts = map[string]protocol.TaskAccount{}
				}
				st.TaskAccounts[h.Harness] = protocol.TaskAccount{Enabled: v}
				a.SetSettings(protocol.SettingsPatch{TaskAccounts: map[string]protocol.TaskAccount{h.Harness: {Enabled: v}}})
			}
		}
		if manage {
			ui.Row(c).Justify(ui.End).Children(func() {
				if a.buttonFor(c, a.L.T("token.signout"), name, btnText, t.ControlSM, t.Surface) {
					d.account = h.Harness
				}
			})
		} else {
			ui.Text(c, a.L.T("coin.there", a.deviceNameIn(dv))).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.5)
		}
	})
}

// socketDetail lists the agents not on that device yet; where this app runs
// Ducter, each installs from here.
func (a *App) socketDetail(c *ui.Context, dv *protocol.DeviceView, idx, n int) {
	t := a.T
	d := a.devState()
	a.detailBox(c, coinKey(dv.ID, "+"), a.L.T("coin.socket"), idx, n, func() {
		ui.Text(c, a.L.T("coin.socket.there", a.deviceNameIn(dv))).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5)
		for _, h := range dv.Harnesses {
			if h.Installed {
				continue
			}
			name := harnessName(h.Harness)
			ui.Row(c.Key("missing:" + h.Harness)).Gap(t.S3).AlignItems(ui.Center).MinHeight(t.ControlSM).Children(func() {
				a.coinBox(c, "missing:"+dv.ID, h.Harness, 28, true, coinStill)
				ui.Text(c, name).FontSize(t.MD).FontWeight(700).Grow(1).MinWidth(0)
				if a.manageAccount(dv, h) && a.buttonFor(c, a.L.T("token.install"), name, btnSecondary, t.ControlSM, t.Surface) {
					d.account = h.Harness
				}
			})
		}
		if !(a.Backend != nil && dv.Home) {
			ui.Text(c, a.L.T("coin.there", a.deviceNameIn(dv))).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.5)
		}
	})
}

// agentUpdate is the update part of a coin's detail (D156): 有新版本 and
// 更新, the steps in words while it runs, 好了 or why not after.
func (a *App) agentUpdate(c *ui.Context, dv *protocol.DeviceView, h protocol.DeviceHarness) {
	t := a.T
	d := a.devState()
	u := h.Update
	failedButBehind := u != nil && u.Phase == "failed" && h.Available
	behindNow := agentBehind(&h)
	line := a.agentPhase(u)
	ans := d.card.agent
	mine := ans != nil && ans.Device == dv.ID && ans.Harness == h.Harness
	if !behindNow && !failedButBehind && line == "" && !mine {
		return
	}
	if u.Running() {
		c.After(500e6)
	}
	ui.Column(c.Key("agent-upd:"+dv.ID+h.Harness)).Gap(t.S1).Margin(t.S2, 0, t.S1, 0).Padding(t.S2+2, t.S3).Radius(t.RadiusSM).Background(t.Bg).Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(func() {
				switch {
				case line != "":
					ink := t.Ink
					switch u.Phase {
					case "done":
						ink = t.Done.Ink
					case "failed":
						ink = t.Failed.Ink
					}
					ui.Text(c, line).FontSize(t.MD).FontWeight(700).TextColor(ink).LineHeight(1.4)
					if u.Phase == "failed" && u.Reason != "" {
						ui.Text(c, a.agentWhy(u.Reason)).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.4)
					}
				case behindNow:
					ui.Text(c, a.L.T("agentv.available", h.Latest)).FontSize(t.MD).FontWeight(700).LineHeight(1.4)
				}
				if (behindNow || failedButBehind) && h.LatestVerified != nil && !*h.LatestVerified {
					ui.Text(c, a.L.T("agentv.latest.unverified", h.Latest)).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.4)
				}
			})
			if (behindNow || failedButBehind) && dv.State == protocol.DeviceAwake {
				label := a.L.T("agentv.button")
				if failedButBehind {
					label = a.L.T("agentv.retry")
				}
				if a.buttonFor(c, label, harnessName(h.Harness), btnPrimary, t.ControlSM, t.Bg) {
					d.card.agent = nil
					a.send(protocol.AgentUpdateReq{T: "agent_update", Device: dv.ID, Harness: h.Harness})
				}
			}
		})
		if (behindNow || failedButBehind) && dv.State != protocol.DeviceAwake {
			ui.Text(c, a.L.T("agentv.away", a.deviceNameIn(dv))).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.4)
		}
		if mine {
			ui.Text(c, a.agentWhy(ans.Reason)).FontSize(t.XS).FontWeight(600).TextColor(t.InkSoft).LineHeight(1.4)
		}
	})
}

// ---------- what it can do: the chips ----------

type chipLook int

const (
	chipOn chipLook = iota
	chipOff
	chipAdd
	chipFail
	chipLater     // D199: still to come: a ghost that only explains itself
	chipElsewhere // D237: the home has it through another computer: points there
)

// chipSpec is one ability chip: its words and clay, how it looks, what a
// tap does, and its ⓘ note. state words a failed chip's trouble when it
// isn't "didn't start" (打电话: 需要重新登录).
type chipSpec struct {
	id, label, art string
	look           chipLook
	state          string
	where          string // chipElsewhere: 在 MacBook Pro M3 上
	busy           bool
	tap            func(art ui.Rect)
	info           func() // the ⓘ note's body; nil: none
}

// chipRow is the device's abilities as toggle chips (§3.4), then, under
// the row, the one line a chip asks with, a failure, or an ⓘ note.
func (a *App) chipRow(c *ui.Context, card string, dv *protocol.DeviceView, cl *protocol.ReachClient) {
	t := a.T
	s := &a.devState().card.sheet
	specs := a.chipSpecs(c, card, dv, cl)
	if len(specs) == 0 {
		return
	}
	ui.Row(c.Key("chips:"+card)).Gap(t.S2).Wrap().Justify(ui.Center).Margin(t.S4-2, 0, 0, 0).Children(func() {
		for _, sp := range specs {
			a.abilityChip(c, card, sp)
		}
	})
	a.chipNotes(c, card, dv, cl)
	if s.info != "" && strings.HasPrefix(s.info, card+"|") {
		id := strings.TrimPrefix(s.info, card+"|")
		for _, sp := range specs {
			if sp.id == id && sp.info != nil {
				ui.Column(c.Key("chip-info:"+s.info)).Gap(t.S2).Margin(10, 0, 0, 0).Padding(t.S2+2, t.S3).Radius(t.RadiusSM).Background(t.Bg).
					Role(ui.RoleGroup).Label(sp.label).Children(sp.info)
			}
		}
	}
}

// infoText is an ⓘ note's sentence.
func (a *App) infoText(c *ui.Context, s string) {
	t := a.T
	ui.Text(c, s).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(a.leading(1.55))
}

// chipSpecs are the chips a device gets, in order: 替 {home} 做事 first on
// this Mac when it can do tasks for a home elsewhere, then 上网 · 用电脑 ·
// 从外面连 as that device has them; on the home 打电话 (D199); 用手机 on a
// Mac that can have it, the home or a worker (D234); then the home's
// abilities still to come as ghosts (用电脑 · 用手机, 以后会有). The same
// rules as the web's chipsFor (apps/web/src/sheet.ts). D237: an ability the
// home doesn't have itself but another computer has on (or is installing)
// points there instead (用手机 · 在 MacBook Pro M3 上; a tap opens that
// card); 用电脑 on a home with no screen shows nothing unless another has it.
func (a *App) chipSpecs(c *ui.Context, card string, dv *protocol.DeviceView, cl *protocol.ReachClient) []chipSpec {
	var out []chipSpec
	computer := ""
	switch {
	case dv != nil && !dv.Home:
		computer = deviceComputer(dv)
	case cl != nil:
		computer = clientComputer(cl)
	}
	if computer != "" && a.isThisMac(computer) && a.canWork() {
		out = append(out, a.workerChip(c, card, dv))
	}
	if dv == nil {
		return out
	}
	var ghosts []chipSpec
	for _, id := range []string{protocol.AbilityWeb, protocol.AbilityComputer, protocol.AbilityRemote, protocol.AbilityCall, protocol.AbilityPhone} {
		ab := dv.Ability(id)
		switch {
		case ab == nil:
		case ab.State == protocol.AbilityLater:
			if !dv.Home {
				break
			}
			if there := a.holders(dv, id); len(there) > 0 {
				ghosts = append(ghosts, a.elsewhereSpec(c, card, id, there))
			} else if !(id == protocol.AbilityComputer && headless(dv)) {
				ghosts = append(ghosts, a.laterSpec(c, card, id))
			}
		case id == protocol.AbilityCall:
			if dv.Home {
				out = append(out, a.callSpec(c, card, ab))
			}
		case id == protocol.AbilityPhone:
			// D217: Ducter's own phone on a Mac (+ opens the install sheet);
			// D234: on a worker Mac too, installed and run there.
			out = append(out, a.phoneSpec(c, card, dv, ab))
		case id == protocol.AbilityComputer:
			// D235: 用电脑 on a Mac: + adds it, then macOS's two switches.
			out = append(out, a.computerSpec(c, card, dv, ab))
		default:
			out = append(out, a.abilitySpec(c, card, dv, ab))
		}
	}
	return append(out, ghosts...)
}

// toggleChipInfo opens or closes a chip's ⓘ note.
func (a *App) toggleChipInfo(card, id string) {
	s := &a.devState().card.sheet
	if s.info == card+"|"+id {
		s.info = ""
	} else {
		s.info = card + "|" + id
	}
}

// headless: a home with no screen of its own (a server, a Linux home), where
// 用电脑 never comes (D237).
func headless(dv *protocol.DeviceView) bool {
	return dv.Kind == "server" || strings.HasPrefix(strings.ToLower(dv.Platform), "linux")
}

// hasAbility: the device has it on, is installing it, or (用电脑) added it
// and waits for macOS's two switches (D237).
func hasAbility(dv *protocol.DeviceView, id string) bool {
	ab := dv.Ability(id)
	if ab == nil {
		return false
	}
	return ab.State == protocol.AbilityOn || ab.Setup == "installing" ||
		(id == protocol.AbilityComputer && ab.State == protocol.AbilityUnavailable && ab.Reason == "computer_permissions")
}

// holders are the other computers that have an ability, awake ones first
// (D237). The same rule as the web's holders (apps/web/src/sheet.ts).
func (a *App) holders(dv *protocol.DeviceView, id string) []*protocol.DeviceView {
	var awake, rest []*protocol.DeviceView
	for i := range a.S.Devices {
		d := &a.S.Devices[i]
		if d.ID == dv.ID || d.Home || d.Kind == "phone" || !hasAbility(d, id) {
			continue
		}
		if d.State == protocol.DeviceAwake {
			awake = append(awake, d)
		} else {
			rest = append(rest, d)
		}
	}
	return append(awake, rest...)
}

// elsewhereSpec is an ability the home has through another computer
// (D237): the full clay, where it lives, and a tap opens that computer's
// card; its ⓘ says the work goes there.
func (a *App) elsewhereSpec(c *ui.Context, card, id string, there []*protocol.DeviceView) chipSpec {
	first := there[0]
	where := a.L.T("chip.elsewhere", first.Name)
	if len(there) > 1 {
		where = a.L.T("chip.elsewhere.more", first.Name, len(there)-1)
	}
	to, name := first.ID, first.Name
	return chipSpec{id: id, label: a.L.T("chip." + id), art: abilityArt(id), look: chipElsewhere, where: where,
		tap: func(ui.Rect) {
			d := a.devState()
			d.sel, d.selClient, d.removing = to, "", ""
			d.card.sheet.info = ""
		},
		info: func() { a.infoText(c, a.L.T("ability."+id+".elsewhere", name)) }}
}

// laterSpec is an ability still to come (D199): its desaturated clay and
// 以后会有, so the home shows what is coming; a tap only explains it.
func (a *App) laterSpec(c *ui.Context, card, id string) chipSpec {
	return chipSpec{id: id, label: a.L.T("chip." + id), art: abilityLaterArt(id), look: chipLater,
		tap: func(ui.Rect) { a.toggleChipInfo(card, id) },
		info: func() {
			key := "ability." + id + ".about"
			if id == protocol.AbilityPhone {
				key = "ability.phone.later" // D217: on an Apple Silicon Mac it is a real chip
			}
			if id == protocol.AbilityComputer {
				key = "ability.computer.later" // D235: on a Mac it is a real chip
			}
			a.infoText(c, a.L.T(key))
		}}
}

// callSpec is 打电话 on the home (D199): on while a calling connection is
// there, and a tap opens its phone card in Accounts; + starts the same
// Tuwa sign-in as the offer there; its sign-in gone, it says so and the
// card signs in again.
func (a *App) callSpec(c *ui.Context, card string, ab *protocol.DeviceAbility) chipSpec {
	sp := chipSpec{id: protocol.AbilityCall, label: a.L.T("chip.call"), art: abilityArt(protocol.AbilityCall)}
	where := "ability.call.where"
	switch {
	case ab.State == protocol.AbilityOn && ab.Reason == "signed_out":
		sp.look, sp.state, where = chipFail, a.L.T("chip.call.signed_out"), "ability.call.signed_out"
		sp.tap = func(ui.Rect) { a.openCalls(false) }
	case ab.State == protocol.AbilityOn:
		sp.look = chipOn
		sp.tap = func(ui.Rect) { a.openCalls(false) }
	default:
		sp.look = chipAdd
		sp.tap = func(ui.Rect) { a.openCalls(true) }
	}
	sp.info = func() {
		a.infoText(c, a.L.T("ability.call.about"))
		a.reasonLine(c, a.L.T(where))
	}
	return sp
}

// openCalls goes where calls are kept (D199): Settings › Accounts, with
// the phone card or the offer; add starts the offer's own Tuwa sign-in
// there (never a second flow).
func (a *App) openCalls(add bool) {
	p := a.ph()
	a.openTab(TabAccounts)
	if add && !p.connecting && a.phoneConn() == nil && !(a.S.SignIn != nil && a.S.SignIn.State == "waiting") {
		p.connecting = true
		a.send(protocol.ConnectionAdd{T: "connection_add", URL: protocol.TuwaMCP})
	}
}

// workerChip is D155's switch as the first chip: 替 {home} 做事.
func (a *App) workerChip(c *ui.Context, card string, dv *protocol.DeviceView) chipSpec {
	s := &a.devState().card.sheet
	w := &a.work
	on, _ := a.workOn()
	home := a.workHome()
	art := "server_awake"
	if h := a.homeDevice(); h != nil {
		art = deviceArt(h)
	}
	sp := chipSpec{id: "worker", label: a.L.T("chip.worker", home), art: art, look: chipOff, busy: w.busy != ""}
	switch {
	case w.busy == "on":
		sp.look = chipOn
	case w.busy == "off":
		sp.look = chipOff
	case w.failed != "":
		sp.look = chipFail
	case on:
		sp.look = chipOn
	}
	sp.info = func() {
		// The old helper, behind ⓘ (D161 (4)).
		text := a.L.T("work.mac.note.off", home)
		if on {
			text += " " + a.L.T("where.first_line")
		}
		a.infoText(c, text)
	}
	sp.tap = func(ui.Rect) {
		if w.busy != "" {
			return
		}
		s.log = false
		if dv != nil && s.stopAfter == dv.ID {
			s.stopAfter = "" // tapped again: keep doing tasks
			return
		}
		if on {
			if dv != nil && a.runningOn(dv) > 0 {
				s.stopAsk = dv.ID
				return
			}
			a.setWork(false)
			return
		}
		a.setWork(true)
	}
	return sp
}

// abilitySpec is one ability's chip on a device.
func (a *App) abilitySpec(c *ui.Context, card string, dv *protocol.DeviceView, ab *protocol.DeviceAbility) chipSpec {
	t := a.T
	d := a.devState()
	s := &d.card.sheet
	id := ab.ID
	sp := chipSpec{id: id, label: a.L.T("chip." + id), art: abilityArt(id)}
	on := a.abilityOn(dv, id)
	_, refused := d.refused[dv.ID+"/"+id]
	toggleInfo := func() {
		if s.info == card+"|"+id {
			s.info = ""
		} else {
			s.info = card + "|" + id
		}
	}
	about := "ability." + id + ".about"
	if id == protocol.AbilityWeb && ab.Where == protocol.WhereChrome {
		about = "ability.web.about.chrome"
	}
	if id == protocol.AbilityWeb && ab.Where == protocol.WhereDucter {
		about = "ability.web.about.ducter"
	}
	sp.info = func() { a.infoText(c, a.L.T(about)) }
	switch {
	case id == protocol.AbilityWeb && ab.Where == protocol.WhereDucter && ab.State == protocol.AbilityUnavailable && ab.Reason != "env_off":
		sp.look = chipFail // the trouble shows under the row
		sp.tap = func(ui.Rect) { toggleInfo() }
	case refused:
		sp.look = chipFail
		sp.tap = func(r ui.Rect) {
			if a.canAdd(dv, id) {
				a.startEquip(dv, id, r, false)
			}
		}
	case id == protocol.AbilityRemote && dv.Home && (a.anywhere() == nil || a.anywhere().State == "failed" || a.anywhere().State == "setup" || a.anywhere().State == "off") && !(on && a.anywhere() == nil):
		// D228: off, being set up, or it didn't open: the ⓘ holds what it
		// needs and 让 Ducter 帮我设好, the setup's steps, or why and 再试一次.
		any := a.anywhere()
		switch {
		case any != nil && (any.State == "failed" || anywhereSetupFailed(any)):
			sp.look = chipFail
		case any != nil:
			sp.look = chipOff
			sp.busy = any.State == "setup"
		default:
			sp.look = chipAdd
		}
		sp.tap = func(ui.Rect) { toggleInfo() }
		sp.info = func() {
			a.infoText(c, a.L.T(about))
			a.anywhereInfo(c, dv)
		}
	case on && id == protocol.AbilityRemote:
		// Its ⓘ holds the address and how it is reached (D228), who is
		// connected, 再连一台, and (for Ducter's tunnel) 关掉.
		sp.look = chipOn
		sp.busy = dv.Home && a.anywhere() != nil && a.anywhere().State == "starting"
		sp.tap = func(ui.Rect) { toggleInfo() }
		sp.info = func() {
			a.infoText(c, a.L.T(about))
			if dv.Home {
				a.anywhereInfo(c, dv)
			}
			a.reachList(c)
			ui.Row(c).Children(func() {
				if a.button(c, a.L.T("chip.remote.again"), btnSecondary, t.ControlSM, t.Bg) {
					a.openPair()
				}
			})
			if dv.Home {
				a.anywhereOff(c, dv)
			}
		}
	case on:
		sp.look = chipOn
		sp.busy = id == protocol.AbilityWeb && ab.Setup == "installing"
		sp.tap = func(ui.Rect) {
			if dv.State == protocol.DeviceAwake && !sp.busy {
				a.removeAbility(dv, id)
			}
		}
		if id == protocol.AbilityWeb && ab.Where == protocol.WhereDucter {
			sp.info = func() {
				a.infoText(c, a.L.T(about))
				a.tryRow(c, dv) // D154: 试一下
				a.sitesList(c)  // D151: the sites signed in to
			}
		}
	case id == protocol.AbilityWeb && a.webNeedsSetup(dv) && dv.State == protocol.DeviceAwake:
		sp.look = chipAdd
		sp.tap = func(ui.Rect) { a.openWebSetup() }
	case a.canAdd(dv, id):
		sp.look = chipAdd
		sp.tap = func(r ui.Rect) {
			if id == protocol.AbilityWeb && ab.Where == protocol.WhereDucter {
				a.send(protocol.AbilityReq{T: "ability", Device: dv.ID, Ability: id, On: true})
				return
			}
			a.startEquip(dv, id, r, false)
		}
	default:
		// It can't be added now: the chip is flat, and a tap says why.
		sp.look = chipOff
		sp.tap = func(ui.Rect) { toggleInfo() }
		sp.info = func() {
			a.infoText(c, a.L.T(about))
			if ab.State == protocol.AbilityUnavailable {
				a.unavailable(c, ab)
			} else if dv.State != protocol.DeviceAwake {
				a.reasonLine(c, a.L.T("ability.reason.asleep"))
			}
		}
	}
	return sp
}

// abilityChip draws one chip: the ability's clay at 30 and its words; on,
// a white chip on a 2-point clay base; off, a flat sunken chip with the
// clay desaturated; one that can be added, dashed. It sinks 2 points as it
// is pressed and squishes when it changes (§7). An ⓘ shows on hover.
func (a *App) abilityChip(c *ui.Context, card string, sp chipSpec) {
	t := a.T
	d := a.devState()
	s := &d.card.sheet
	key := card + "|" + sp.id
	label := sp.label
	if sp.look == chipAdd {
		label = "+ " + label
	}
	acc := label
	switch sp.look {
	case chipOn:
		acc += " · " + a.L.T("chip.state.on")
	case chipOff:
		acc += " · " + a.L.T("chip.state.off")
	case chipFail:
		acc += " · " + firstNonEmpty(sp.state, a.L.T("chip.failed"))
	case chipLater:
		acc += " · " + a.L.T("chip.state.later")
	case chipElsewhere:
		acc += " · " + sp.where
	}
	chip := ui.Row(c.Key("chip:" + key)).Height(chipH).Gap(6).Radius(t.ButtonRadius[1]).AlignItems(ui.Center).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(acc).Focusable().AccessSelected(sp.look == chipOn).Shrink(0)
	if sp.look == chipAdd {
		chip.Padding(0, t.S3+2, 0, t.S3)
	} else {
		chip.Padding(0, t.S3+2, 0, 6)
	}
	fg := t.Ink
	switch sp.look {
	case chipOn:
		chip.Background(t.Surface).InsetShadow(0, 0, 0, 1, t.Line2)
	case chipOff:
		chip.Background(t.Sunken)
		fg = t.InkMuted
	case chipAdd:
		fg = t.InkMuted
		chip.Draw(func(p *ui.Painter, r ui.Rect) {
			var m ui.Path
			roundRect(&m, r.X+0.75, r.Y+0.75, r.W-1.5, r.H-1.5, t.ButtonRadius[1])
			m.Dash(0, 5, 4)
			p.StrokePath(&m, 1.5, t.Line2)
		})
	case chipFail:
		chip.Background(t.Failed.Surface)
		fg = t.Failed.Ink
	case chipLater:
		// No base to sink into: it isn't a switch yet.
		chip.Background(t.Sunken).Opacity(0.8)
		fg = t.InkMuted
	case chipElsewhere:
		// Flat on the page with a hairline: not a switch here, a way there.
		chip.InsetShadow(0, 0, 0, 1.2, t.Line)
		if chip.Pressed() {
			chip.Background(t.Sunken)
		}
	}
	if sp.busy {
		chip.Opacity(0.7)
	}
	still := c.Preferences().ReduceMotion
	// The press: it sinks into its base (70 ms).
	sink := float32(0)
	if chip.Pressed() && sp.look != chipLater && sp.look != chipElsewhere {
		sink = 2
	}
	if !still {
		sink = chip.AnimateTo("sink", sink, ui.Animation{Duration: t.PressDur})
	}
	base := float32(0)
	switch sp.look {
	case chipOn:
		base = 3
	case chipOff:
		base = 2
	case chipFail:
		base = 3
	}
	if l := base - sink; l > 0.01 {
		ledge := t.Line2
		switch sp.look {
		case chipOff:
			ledge = t.Line
		case chipFail:
			ledge = t.Failed.Ledge
		}
		chip.Shadow(0, l, 0, 0, ledge)
	}
	sx, sy := float32(1), float32(1)
	if at, ok := s.squish[key]; ok && !still {
		if el := a.Now().Sub(at); el < 300*time.Millisecond {
			f := float64(el) / float64(300*time.Millisecond)
			k := float32(math.Cos(f*math.Pi*1.6) * math.Pow(1-f, 1.4))
			sx, sy = 1+0.06*k, 1-0.06*k
			c.After(16 * time.Millisecond)
		}
	}
	if sink > 0.01 || sx != 1 {
		chip.TransformOrigin(0.5, 1).Translate(0, sink).Scale(sx, sy)
	}
	hover := chip.Hovered() || s.info == key
	var artR ui.Rect
	infoHit := false
	chip.Children(func() {
		if sp.look != chipAdd {
			bmp := theme.Clay(sp.art)
			box := ui.Box(c.Key("chip-art:"+key)).Size(chipArt, chipArt).AccessHidden(true)
			if sp.look == chipOff {
				box.Grayscale().Opacity(0.55)
			}
			hop := float32(0)
			if at, ok := s.squish[key]; ok && sp.look == chipOn && !still {
				if el := a.Now().Sub(at); el < 300*time.Millisecond {
					hop = -3 * float32(math.Sin(math.Pi*float64(el)/float64(300*time.Millisecond)))
				}
			}
			if hop != 0 {
				box.Translate(0, hop)
			}
			box.Draw(func(p *ui.Painter, r ui.Rect) {
				if bmp != nil {
					p.Image(bmp, fitIn(bmp, r), ui.Contain)
				}
			})
			artR = box.Bounds()
		}
		ui.Text(c, label).FontSize(14).FontWeight(700).TextColor(fg).SingleLine().AccessHidden(true)
		if sp.look == chipLater {
			ui.Text(c, a.L.T("chip.state.later")).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted).SingleLine().AccessHidden(true)
		}
		if sp.look == chipElsewhere {
			ui.Text(c, sp.where).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted).SingleLine().MaxWidth(150).AccessHidden(true)
			ink := t.InkMuted
			ui.Box(c.Key("chip-go:"+key)).Size(6, 10).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
				var m ui.Path
				m.MoveTo(r.X+1, r.Y+1.5).LineTo(r.X+r.W-1, r.Y+r.H/2).LineTo(r.X+1, r.Y+r.H-1.5)
				p.StrokePath(&m, 1.6, ink)
			})
		}
		if sp.info != nil {
			// ⓘ sits on the chip's corner, shown on hover, so nothing moves.
			i := ui.Box(c.Key("chip-i:"+key)).Absolute().Right(-6).Top(-7).Size(18, 18).Radius(9).Background(t.Surface).
				InsetShadow(0, 0, 0, 1.2, t.Faint).Role(ui.RoleButton).Label(a.L.T("chip.info") + " · " + sp.label).Cursor(ui.CursorPointer)
			if !hover {
				i.Opacity(0)
			}
			i.Children(func() {
				ui.Text(c, "i").FontSize(11).FontWeight(700).TextColor(t.InkMuted).TextAlign(ui.Center).LineHeight(18 / 11.0).AccessHidden(true)
			})
			if i.Clicked() {
				infoHit = true
				if s.info == key {
					s.info = ""
				} else {
					s.info = key
				}
			}
		}
	})
	if chip.Clicked() && !infoHit && sp.tap != nil {
		if sp.look != chipLater && sp.look != chipElsewhere {
			s.squish[key] = a.Now()
		}
		sp.tap(artR)
		c.Invalidate()
	}
}

// roundRect adds a rounded rectangle to m.
func roundRect(m *ui.Path, x, y, w, h, r float32) {
	r = min(r, w/2, h/2)
	m.MoveTo(x+r, y).LineTo(x+w-r, y).QuadTo(x+w, y, x+w, y+r).LineTo(x+w, y+h-r).QuadTo(x+w, y+h, x+w-r, y+h).
		LineTo(x+r, y+h).QuadTo(x, y+h, x, y+h-r).LineTo(x, y+r).QuadTo(x, y, x+r, y).Close()
}

// chipNotes are the lines under the chips that something needs: turning
// 替 {home} 做事 off with tasks running asks with the safe default; a
// failure says why, the log's path only after 看日志; Ducter's browser in
// the way; a refusal.
func (a *App) chipNotes(c *ui.Context, card string, dv *protocol.DeviceView, cl *protocol.ReachClient) {
	t := a.T
	d := a.devState()
	s := &d.card.sheet
	note := func(key string, tint bool, body func()) {
		n := ui.Column(c.Key("chip-note:"+card+key)).Gap(t.S2).Margin(10, 0, 0, 0).Padding(t.S2+2, t.S3).Radius(t.RadiusSM).Background(t.Bg)
		if tint {
			n.Background(t.Failed.Surface)
		}
		a.enter(c, n)
		n.Children(body)
	}
	if dv != nil && s.stopAsk == dv.ID {
		n := a.runningOn(dv)
		note("stop", false, func() {
			a.infoText(c, a.L.T("chip.stop.ask", a.deviceNameIn(dv), n))
			ui.Row(c).Gap(t.S2).Justify(ui.End).Children(func() {
				if a.button(c, a.L.T("chip.stop.now"), btnText, t.ControlSM, t.Bg) {
					s.stopAsk = ""
					a.setWork(false)
				}
				if a.button(c, a.L.T("chip.stop.after"), btnPrimary, t.ControlSM, t.Bg) {
					s.stopAsk, s.stopAfter = "", dv.ID
				}
			})
		})
	}
	if dv != nil && s.stopAfter == dv.ID {
		note("after", false, func() { a.infoText(c, a.L.T("chip.stop.pending")) })
	}
	thisMac := false
	switch {
	case dv != nil && !dv.Home:
		thisMac = a.isThisMac(deviceComputer(dv))
	case cl != nil:
		thisMac = a.isThisMac(clientComputer(cl))
	}
	if thisMac && a.canWork() {
		w := &a.work
		switch {
		case w.busy == "on":
			note("busy", false, func() { a.infoText(c, a.L.T("work.mac.starting")) })
		case w.busy == "off":
			note("busy", false, func() { a.infoText(c, a.L.T("work.mac.stopping")) })
		case w.failed != "":
			note("failed", true, func() {
				ui.Row(c).Gap(t.S1).AlignItems(ui.Center).Wrap().Children(func() {
					ui.Text(c, w.failed).FontSize(t.SM).FontWeight(700).TextColor(t.Failed.Ink).LineHeight(1.5)
					ui.Text(c, "·").FontSize(t.SM).TextColor(t.Failed.Ink)
					if a.quietButton(c, "worker-log", a.L.T("chip.log"), "", true, 0) {
						s.log = !s.log
					}
				})
				if s.log {
					ui.Text(c, a.MacWorker.Log()).Font(t.Mono).FontSize(t.XS).TextColor(t.InkSoft).Selectable()
				}
			})
		}
	}
	if dv == nil {
		return
	}
	if ab := dv.Ability(protocol.AbilityWeb); ab != nil && ab.Where == protocol.WhereDucter {
		switch {
		case ab.Setup == "installing":
			note("web-installing", false, func() { a.infoText(c, a.L.T("web.installing")) })
		case ab.State == protocol.AbilityUnavailable && ab.Reason != "env_off":
			note("web-trouble", false, func() { a.ducterBrowserTrouble(c, dv, ab) })
		}
	}
	a.phoneNotes(c, card, dv, note) // D217
	a.computerNotes(c, dv, note)    // D235
	for _, id := range []string{protocol.AbilityWeb, protocol.AbilityComputer, protocol.AbilityRemote} {
		if r, ok := d.refused[dv.ID+"/"+id]; ok {
			note("refused-"+id, true, func() {
				ui.Text(c, a.L.T("chip.failed")+"："+a.reasonText(r.Reason)).FontSize(t.SM).FontWeight(700).TextColor(t.Failed.Ink).LineHeight(1.5)
			})
		}
	}
}

// watchStopAfter turns 替 {home} 做事 off once the device's tasks are done
// (做完再停), wherever the window is.
func (a *App) watchStopAfter() {
	s := &a.devState().card.sheet
	if s.stopAfter == "" || a.MacWorker == nil {
		return
	}
	dv := a.S.Device(s.stopAfter)
	if dv == nil {
		s.stopAfter = ""
		return
	}
	if a.runningOn(dv) == 0 && a.work.busy == "" {
		s.stopAfter = ""
		a.setWork(false)
	}
}

// ---------- how it's connected ----------

// connWay is how a connection reaches Ducter: app, cli, safari or browser.
func connWay(cl *protocol.ReachClient) string {
	p := strings.ToLower(cl.Platform)
	switch {
	case isCLI(cl):
		return "cli"
	case strings.Contains(p, "ios") || strings.Contains(p, "iphone"):
		if strings.Contains(p, "safari") || strings.Contains(p, "web") {
			return "safari"
		}
		return "app"
	case strings.Contains(p, "android"):
		if androidApp(cl) {
			return "app"
		}
		return "browser"
	case strings.HasPrefix(p, "darwin") || strings.Contains(p, "mac"):
		return "app"
	}
	return "browser"
}

// viaLine is one quiet line of how the computer is connected, with one ⋯
// that opens the connections in place, each with its own 断开.
func (a *App) viaLine(c *ui.Context, card, computer string, self *protocol.ReachClient) {
	t := a.T
	d := a.devState()
	s := &d.card.sheet
	var list []*protocol.ReachClient
	if self != nil {
		list = append(list, self)
	}
	list = append(list, a.fold().members[card]...)
	if len(list) == 0 {
		return
	}
	var ways []string
	seen := map[string]bool{}
	for _, cl := range list {
		w := connWay(cl)
		if !seen[w] {
			seen[w] = true
			ways = append(ways, a.L.T("card.via."+w))
		}
	}
	text := a.L.T("card.via", strings.Join(ways, a.L.T("card.via.and")))
	open := s.via == card
	ui.Row(c.Key("via:"+card)).Gap(6).Justify(ui.Center).AlignItems(ui.Center).Margin(t.S4, 0, 0, 0).Children(func() {
		ui.Text(c, text).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.5)
		if a.moreButton(c, "via-more:"+card, a.L.T("card.via.more"), open) {
			if open {
				s.via = ""
			} else {
				s.via = card
			}
		}
	})
	if !open {
		return
	}
	box := ui.Column(c.Key("conns:"+card)).Margin(t.S2, 0, 0, 0).Radius(t.RadiusSM).Background(t.Bg).Clip()
	a.enter(c, box)
	box.Children(func() {
		for i, cl := range list {
			id := cl.ID
			way := connWay(cl)
			nm := a.L.T("card.conn." + way)
			confirmName, means := a.L.T("device.app.name", computer), "device.disconnect.means.client"
			switch {
			case way == "cli":
				confirmName, means = a.L.T("device.cli.name", computer), "device.disconnect.means.cli"
			case computer == "":
				confirmName = a.clientName(cl)
			}
			if i > 0 {
				ui.Box(c).Height(1).Background(t.LineSoft)
			}
			if d.card.cutting == id {
				ui.Column(c.Key("conn-cut:"+id)).Padding(0, t.S1).Children(func() { a.disconnectConfirm(c, id, confirmName, means) })
				continue
			}
			when, _ := a.clientState(cl)
			ui.Row(c.Key("conn:"+id)).Gap(t.S2).AlignItems(ui.Center).Padding(t.S1, t.S3).MinHeight(t.ControlSM).Children(func() {
				ui.Text(c, nm).FontSize(t.SM).FontWeight(800).SingleLine()
				ui.Text(c, when).FontSize(t.SM).TextColor(t.InkMuted).SingleLine().Grow(1).MinWidth(0)
				if a.dangerText(c, "conn-cut-btn:"+id, a.L.T("device.disconnect"), confirmName) {
					d.card.cutting, d.card.cutFailed = id, ""
				}
			})
		}
	})
}

// ---------- the foot ----------

// ducterLine is Ducter's own version, only when it says something (D161
// (5)): an update, its steps, or how it ended.
func (a *App) ducterLine(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	d := a.devState()
	u := dv.Update
	ans := d.card.answer
	mine := ans != nil && ans.Device == dv.ID
	if u == nil || (!behind(dv) && u.Phase == "" && !mine) {
		return
	}
	if u.Running() {
		c.After(500e6)
	}
	// This Mac's own copy updates with this app (the home it runs, or the
	// worker it runs, D172); a worker whose app is current only needs a restart
	// (updateAction says so).
	canTap := (u.How == "self" && dv.State == protocol.DeviceAwake) || (u.How == "app" && a.appOnThisMac(dv) && a.helperBehind(dv) == "")
	offer := behind(dv) || (u.Phase == "failed" && u.Available)
	ui.Column(c.Key("version:"+dv.ID)).Gap(t.S1).Margin(t.S3+2, 0, 0, 0).Padding(t.S2+2, t.S3).Radius(t.RadiusSM).Background(t.Bg).Children(func() {
		ui.Row(c).Gap(t.S2 + 2).AlignItems(ui.Center).Children(func() {
			text, ink := "", t.Ink
			if line := a.phaseLine(u); line != "" {
				text, ink = line, t.InkSoft
				switch u.Phase {
				case "done":
					ink = t.Done.Ink
				case "failed":
					ink = t.Failed.Ink
				}
			} else if behind(dv) {
				text = a.L.T("card.ducter.update", u.Latest)
			}
			ui.Text(c, text).FontSize(t.SM).FontWeight(700).TextColor(ink).LineHeight(1.45).Grow(1).MinWidth(0)
			if offer && canTap {
				label := a.L.T("devup.button")
				if u.Phase == "failed" {
					label = a.L.T("devup.retry")
				}
				if a.buttonFor(c, label, dv.Name, btnSecondary, t.ControlSM, t.Bg) {
					if u.How == "app" {
						a.updateThisMac()
					} else {
						d.card.answer, d.card.asked = nil, dv.ID
						a.send(protocol.DeviceUpdateReq{T: "device_update", Device: dv.ID})
					}
				}
			}
		})
		if u.Phase == "failed" && u.Reason != "" {
			ui.Text(c, a.updateReason(u.Reason)).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.45)
		}
		if u.Phase == "downloading" && u.Progress > 0 {
			a.progressBar(c, u.Progress)
		}
		// Each line is whole and short (the release keeps it so): it wraps, never cut.
		for _, n := range a.notesIf(behind(dv) && u.How == "self", u) {
			ui.Text(c, n).FontSize(t.XS).LineHeight(1.45).TextColor(t.InkMuted)
		}
		if offer && !canTap {
			a.updateAction(c, dv) // where the update happens instead, in one line
		}
		if mine {
			a.reasonLine(c, a.updateReason(ans.Reason))
		}
	})
}

// sheetFoot is the card's very bottom: a hairline, then 断开这台 {device}
// as the destructive text button, confirmed in place.
func (a *App) sheetFoot(c *ui.Context, id, name, confirmName, means string) {
	t := a.T
	d := a.devState()
	ui.Box(c.Key("cutline:"+id)).Height(1).Background(t.LineSoft).Margin(t.S4, 0, t.S2, 0)
	if d.card.cutting == id {
		a.disconnectConfirm(c, id, confirmName, means)
		return
	}
	ui.Row(c).Children(func() {
		if a.dangerText(c, "cut:"+id, a.L.T("card.disconnect.device", name), "") {
			d.card.cutting, d.card.cutFailed = id, ""
		}
	})
}
