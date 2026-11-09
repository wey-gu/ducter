package views

import (
	"math"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/local"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// 你的设备和本事 / Your devices and abilities (D43, D50, D51, D53): a zoom
// level of its own. Left, the devices; middle, the chosen device on its
// pedestal with Ducter sitting on it (only where Ducter lives), the
// ability slots around it and the AI accounts signed in on it below;
// right, the abilities that can be added. Adding one is a sticker peel:
// it lifts, arcs over, snaps into its slot, the device squashes, Ducter
// smiles, and one line says what the device can do now. The line comes
// only once the server says the ability is on.

// gridAbilities are the abilities shown on the right, in order.
var gridAbilities = []string{protocol.AbilityWeb, protocol.AbilityComputer, protocol.AbilityRemote, protocol.AbilityPhone, protocol.AbilityCall}

// abilityDrag is what an ability tile drags onto the stage.
type abilityDrag struct{ id string }

type devicesState struct {
	sel      string // the device shown; "" = where Ducter lives
	ability  string // the ability in the detail card
	removing string // the ability whose 取下 is being confirmed
	fx       *equipFx
	// optimistic: abilities the server said yes to, until its next
	// devices frame shows them on.
	optimistic map[string]time.Time
	// refused holds why an ability couldn't be added, by ability.
	refused  map[string]protocol.ServerFrame
	line     string
	lineAt   time.Time
	doneAt   time.Time // Ducter's done face
	squash   time.Time // the device's squash
	sparkAt  time.Time // the sparkles round the slot
	sparkAt0 ui.Rect
	pair     pairState
	rename   renameState
	tiles    map[string]ui.Rect // the ability art in the grid, last frame
	slots    map[string]ui.Rect // the slots' wells, last frame
	hover    string             // the tile under the pointer
	// account is the AI account whose sheet is open (sign in, sign out).
	account string
	// lit is the AI account tapped on the stage: every island it's
	// signed in on is lifted, since litAt.
	lit   string
	litAt time.Time
	// selClient is the phone (or window elsewhere) chosen, instead of a device.
	selClient string
	// The scene's framing, easing from viewFrom to viewTo since viewAt.
	viewFrom, viewTo view
	viewAt           time.Time
	// labels are the words in the scene, last frame (no two may overlap).
	labels map[string]ui.Rect
	// slotOf is where each island stands round home: kept while it is there.
	slotOf map[string]int
	// signH is the pairing sign's height, last frame (its post reaches down
	// from it to the water).
	signH float32
	// refreshed: the sign-in jobs whose end already asked for fresh devices.
	refreshed map[*local.Job]bool
}

// renameState is 改名字 / Rename on another computer's card (D84).
type renameState struct {
	device  string // the device being renamed; "" = none
	draft   string
	focused bool
	failed  string // why the server said no (rename_result reason)
}

type equipFx struct {
	ability, device string
	start           time.Time
	from, to        ui.Rect
	dropped         bool // came by drag: no peel
	snapped         bool
	back            bool // refused: on its way back
	result          *protocol.ServerFrame
}

// OpenDevices shows Your devices and abilities, asking the server for them
// (and to keep them fresh while this socket lives).
func (a *App) OpenDevices() {
	a.Route = RouteDevices
	a.send(protocol.DevicesReq{T: "devices"})
}

func (a *App) devState() *devicesState {
	d := &a.dev
	if d.optimistic == nil {
		d.optimistic = map[string]time.Time{}
		d.refused = map[string]protocol.ServerFrame{}
		d.tiles = map[string]ui.Rect{}
		d.slots = map[string]ui.Rect{}
	}
	return d
}

// shownDevice is the device on the stage: the one chosen, else home.
func (a *App) shownDevice() *protocol.DeviceView {
	d := a.devState()
	if d.sel != "" {
		if dv := a.S.Device(d.sel); dv != nil {
			return dv
		}
	}
	for i := range a.S.Devices {
		if a.S.Devices[i].Home {
			return &a.S.Devices[i]
		}
	}
	if len(a.S.Devices) > 0 {
		return &a.S.Devices[0]
	}
	return nil
}

// deviceName names a device for people: the one Ducter lives on is "this
// Mac" when this app runs on it.
func (a *App) deviceName(d *protocol.DeviceView) string {
	if d.Home && a.onThisMac() && (d.Kind == "laptop" || d.Kind == "mini") {
		return a.L.T("device.local")
	}
	return d.Name
}

// deviceNameIn names a device inside a sentence ("this Mac").
func (a *App) deviceNameIn(d *protocol.DeviceView) string {
	if d.Home && a.onThisMac() && (d.Kind == "laptop" || d.Kind == "mini") {
		return a.L.T("device.local.inline")
	}
	return d.Name
}

// onThisMac: the Ducter this window talks to runs on this machine.
func (a *App) onThisMac() bool {
	if a.Backend != nil {
		return true
	}
	u := a.URL
	return u == "" || strings.Contains(u, "://127.0.0.1") || strings.Contains(u, "://localhost") || strings.Contains(u, "://[::1]")
}

// abilityOn: the server says it's on, or said yes a moment ago.
func (a *App) abilityOn(d *protocol.DeviceView, id string) bool {
	if ab := d.Ability(id); ab != nil && ab.State == protocol.AbilityOn {
		return true
	}
	at, ok := a.devState().optimistic[d.ID+"/"+id]
	return ok && a.Now().Sub(at) < 4*time.Second
}

// shownOn: on, and not still flying into its slot (the slot fills when
// the sticker lands, not when the server answers).
func (a *App) shownOn(d *protocol.DeviceView, id string) bool {
	if fx := a.devState().fx; fx != nil && !fx.back && fx.device == d.ID && fx.ability == id {
		return false
	}
	return a.abilityOn(d, id)
}

// canAdd: the ability can be added to the device now.
func (a *App) canAdd(d *protocol.DeviceView, id string) bool {
	ab := d.Ability(id)
	return ab != nil && ab.State == protocol.AbilityOff && d.State == protocol.DeviceAwake && !a.abilityOn(d, id)
}

// ---------- the screen ----------

func (a *App) devicesView(c *ui.Context) {
	t := a.T
	d := a.devState()
	a.drainAbilityResults()
	w, _ := c.Size()
	narrow := w > 0 && w < 1180
	dev := a.shownDevice()
	if d.ability == "" {
		d.ability = protocol.AbilityWeb
	}

	a.chrome(c, "devices", func() {
		a.crumb(c, a.L.T("nav.conversation"), RouteConversation)
		a.chromeTitle(c, a.L.T("devices.title"))
	}, nil)
	var root ui.Element
	if narrow {
		root = ui.Scroll(c.Key("devices-narrow")).Grow(1)
	} else {
		root = ui.Column(c.Key("devices")).Grow(1).MinHeight(0)
	}
	root.Children(func() {
		ui.Column(c).Grow(1).MinHeight(0).Gap(t.S4).Padding(t.S5, t.S6, t.S5, t.S6).Children(func() {
			a.devicesHeader(c, dev)
			switch {
			case len(a.S.Devices) == 0:
				a.devicesWaiting(c)
			case narrow:
				ui.Row(c).Gap(t.S3).Wrap().AlignItems(ui.Center).Children(func() { a.deviceCards(c, 230); a.connectEntry(c) })
				ui.Column(c).Height(560).Children(func() { a.stage(c, dev) })
				ui.Row(c).Gap(t.S4).AlignItems(ui.Start).Children(func() {
					ui.Column(c).Grow(1).Basis(0).Gap(t.S3).Children(func() { a.deviceDetail(c, dev) })
					ui.Column(c).Grow(1).Basis(0).Gap(t.S3).Children(func() {
						if d.selClient == "" {
							a.abilityGrid(c, dev, 3)
							a.abilityDetail(c, dev)
						}
					})
				})
			default:
				ui.Row(c).Grow(1).MinHeight(0).Gap(t.S4).AlignItems(ui.Stretch).Children(func() {
					ui.Column(c).Width(260).Shrink(0).Gap(t.S3).Children(func() {
						ui.Text(c, a.L.T("devices.list")).FontSize(t.XS).FontWeight(800).LetterSpacing(1.2).TextColor(t.InkMuted)
						a.deviceCards(c, 0)
						a.connectEntry(c)
					})
					ui.Column(c).Grow(1).MinWidth(0).Children(func() { a.stage(c, dev) })
					ui.Scroll(c.Key("abilities")).Width(300).Shrink(0).Children(func() {
						ui.Column(c).Gap(t.S3).Padding(0, 0, t.S2, 0).Children(func() {
							a.deviceDetail(c, dev)
							if d.selClient == "" {
								a.abilityGrid(c, dev, 2)
								a.abilityDetail(c, dev)
							}
						})
					})
				})
			}
		})
	})
	a.flyer(c)
}

func (a *App) devicesHeader(c *ui.Context, dev *protocol.DeviceView) {
	t := a.T
	if home := a.homeDevice(); home != nil {
		ui.Text(c, a.L.T("devices.subtitle", a.S.PersonaName, a.deviceNameIn(home))).FontSize(t.MD).TextColor(t.InkMuted)
	}
	if a.Status != client.Connected && len(a.S.Devices) > 0 {
		if home := a.homeDevice(); home != nil {
			ui.Row(c.Key("devices-offline")).Gap(t.S3).Padding(t.S3, t.S4).Radius(t.RadiusSM).Background(t.Away.Surface).AlignItems(ui.Center).Children(func() {
				ui.Text(c, a.L.T("devices.offline", a.deviceNameIn(home))).FontSize(t.SM).FontWeight(700).TextColor(t.Away.Ink)
			})
		}
	}
}

func (a *App) homeDevice() *protocol.DeviceView {
	for i := range a.S.Devices {
		if a.S.Devices[i].Home {
			return &a.S.Devices[i]
		}
	}
	return nil
}

// devicesWaiting: nothing from the server yet, or a server too old to say.
func (a *App) devicesWaiting(c *ui.Context) {
	t := a.T
	msg := a.L.T("devices.loading")
	for _, e := range a.S.Errors {
		if strings.HasPrefix(e, "devices:") {
			msg = a.L.T("devices.unsupported")
		}
	}
	ui.Column(c.Key("devices-wait")).Grow(1).Justify(ui.Center).AlignItems(ui.Center).Gap(t.S3).Children(func() {
		a.avatar(c, theme.Idle, 140)
		ui.Text(c, msg).FontSize(t.LG).TextColor(t.InkSoft)
	})
}

// ---------- device cards ----------

func (a *App) deviceCards(c *ui.Context, width float32) {
	t := a.T
	shown := a.shownDevice()
	d := a.devState()
	for i := range a.S.Devices {
		dv := &a.S.Devices[i]
		sel := shown != nil && shown.ID == dv.ID && d.selClient == ""
		name := a.deviceName(dv)
		chip, sc := a.deviceChip(dv)
		_ = chip
		card := ui.Row(c.Key("dev:" + dv.ID)).Gap(t.S3).Padding(t.S3).Radius(t.RadiusLG).Background(t.Surface).AlignItems(ui.Center).
			Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(name + " · " + chip).AccessSelected(sel)
		if width > 0 {
			card.Width(width)
		}
		a.selectable(c, card, sel)
		card.Children(func() {
			ui.Box(c).Size(72, 72).Radius(t.RadiusMD).Background(t.Clay).Padding(t.S2).Shrink(0).Children(func() {
				a.deviceClay(c, "card:"+dv.ID, dv).Grow(1)
			})
			ui.Column(c).Gap(t.S1).Grow(1).MinWidth(0).Children(func() {
				ui.Text(c, name).FontSize(t.Bubble).FontWeight(800).SingleLine()
				// Shown, not explained (D43): the clay says awake or asleep,
				// Ducter on the stage says where it lives. Words only for
				// what is unusual, plainly, in the state's ink; no pill.
				// Another computer always says what it is (D84).
				if !dv.Home {
					a.otherComputerLine(c, dv, sc)
				} else if line, ink := a.deviceLine(dv, sc); line != "" {
					ui.Text(c, line).FontSize(t.XS).FontWeight(700).TextColor(ink).LineHeight(1.4).MaxLines(2)
				}
			})
		})
		if card.Clicked() {
			d.sel, d.selClient = dv.ID, ""
			d.removing = ""
		}
		if sel && !dv.Home {
			a.renameRow(c, dv, width)
		}
	}
	if a.S.Reach == nil {
		return
	}
	// The phones (and windows elsewhere) that reach Ducter.
	for i := range a.S.Reach.Clients {
		cl := &a.S.Reach.Clients[i]
		sel := d.selClient == cl.ID
		line := a.clientLine(cl)
		card := ui.Row(c.Key("cl:" + cl.ID)).Gap(t.S3).Padding(t.S3).Radius(t.RadiusLG).Background(t.Surface).AlignItems(ui.Center).
			Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(cl.Name + " · " + line).AccessSelected(sel)
		if width > 0 {
			card.Width(width)
		}
		a.selectable(c, card, sel)
		card.Children(func() {
			ui.Box(c).Size(72, 72).Radius(t.RadiusMD).Background(t.Clay).Padding(t.S2).Shrink(0).Children(func() {
				a.clientClay(c, "card:"+cl.ID, cl, clientArt(cl)).Grow(1)
			})
			ui.Column(c).Gap(t.S1).Grow(1).MinWidth(0).Children(func() {
				ui.Text(c, cl.Name).FontSize(t.Bubble).FontWeight(800).SingleLine()
				ui.Text(c, line).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).LineHeight(1.4).MaxLines(2)
			})
		})
		if card.Clicked() {
			d.selClient, d.removing = cl.ID, ""
		}
	}
}

// otherComputerLine is the subtitle of a computer that isn't the one
// Ducter lives on: 另一台电脑 · 替 Ducter 做事, the second half replaced by
// its state, in the state's ink, when something is wrong (D84).
func (a *App) otherComputerLine(c *ui.Context, dv *protocol.DeviceView, sc theme.StateColors) {
	t := a.T
	if dv.State != protocol.DeviceAsleep && dv.State != protocol.DeviceUnreachable {
		line, _ := a.deviceLine(dv, sc)
		ui.Text(c, line).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).LineHeight(1.4).MaxLines(2)
		return
	}
	state, _ := a.deviceChip(dv)
	ui.Row(c).Gap(t.S1).Wrap().Children(func() {
		ui.Text(c, a.L.T("device.other")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).LineHeight(1.4)
		ui.Text(c, "·").FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).LineHeight(1.4)
		ui.Text(c, state).FontSize(t.XS).FontWeight(700).TextColor(sc.Ink).LineHeight(1.4).MaxLines(2)
	})
}

// renameRow is 改名字 / Rename under the chosen computer's card: one tap,
// then the name is a field in place (as on Partner, D71).
func (a *App) renameRow(c *ui.Context, dv *protocol.DeviceView, width float32) {
	t := a.T
	r := &a.devState().rename
	if res := a.S.Renamed; res != nil {
		a.S.Renamed = nil
		if res.OK {
			r.device, r.failed = "", ""
		} else if res.Device == r.device {
			r.failed = res.Reason
		}
	}
	row := ui.Row(c.Key("rename:" + dv.ID)).Gap(t.S2).AlignItems(ui.Center).Wrap()
	if width > 0 {
		row.Width(width)
	}
	if r.device != dv.ID {
		row.Children(func() {
			if a.button(c, a.L.T("device.rename"), btnText, t.ControlSM, t.Bg) {
				*r = renameState{device: dv.ID, draft: dv.Name}
			}
		})
		return
	}
	save := func() {
		name := strings.TrimSpace(r.draft)
		if name == "" || name == dv.Name {
			r.device = ""
			return
		}
		r.failed = ""
		a.send(protocol.RenameDeviceReq{T: "rename_device", Device: dv.ID, Name: name})
	}
	row.Children(func() {
		in := ui.TextInput(c.Key("input:device-name:"+dv.ID), &r.draft).Placeholder(dv.Name).Label(a.L.T("device.rename")).
			FontSize(t.MD).FontWeight(700).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.Surface).Border(1, t.Line).
			Grow(1).MinWidth(140).OnSubmit(save)
		if !r.focused {
			in.Focus()
			r.focused = true
		}
		if a.button(c, a.L.T("device.rename.cancel"), btnText, t.ControlSM, t.Bg) {
			r.device = ""
		}
		if a.button(c, a.L.T("device.rename.ok"), btnPrimary, t.ControlSM, t.Bg) {
			save()
		}
	})
	switch r.failed {
	case "":
	case "name_taken":
		a.reasonLine(c, a.L.T("device.rename.name_taken", strings.TrimSpace(r.draft)))
	default:
		a.reasonLine(c, a.L.T("device.rename."+r.failed))
	}
}

// connectEntry is the way to add a device: a phone or another computer
// connects with a one-time code (D54). The code shows in the scene, on a
// sign at the end of a jetty from home (D81, pairing.go).
func (a *App) connectEntry(c *ui.Context) {
	t := a.T
	if a.button(c, a.L.T("devices.connect"), btnSecondary, t.ControlSM, t.Bg) {
		a.devState().account = ""
		a.openPair()
	}
}

// deviceChip is a device's state in words, with its colors.
func (a *App) deviceChip(dv *protocol.DeviceView) (string, theme.StateColors) {
	t := a.T
	switch dv.State {
	case protocol.DeviceAsleep:
		return a.L.T("device.state.asleep"), t.Asleep
	case protocol.DeviceUnreachable:
		if ago := a.agoLong(dv.LastSeen); ago != "" {
			return a.L.T("device.state.unreachable", ago), t.Away
		}
		return a.L.T("device.state.unreachable.never"), t.Away
	}
	if dv.Home {
		return a.L.T("device.home", a.S.PersonaName), t.Awake
	}
	return a.L.T("device.state.awake"), t.Awake
}

// deviceLine is the one quiet line under a device's name: why it is
// asleep or can't be reached; for the home device, that Ducter lives
// there; for another computer, what it is and that it does tasks for
// Ducter, or how many it is doing (research/33 §7b).
func (a *App) deviceLine(dv *protocol.DeviceView, sc theme.StateColors) (string, ui.Color) {
	switch {
	case dv.State == protocol.DeviceAsleep || dv.State == protocol.DeviceUnreachable:
		text, _ := a.deviceChip(dv)
		return text, sc.Ink
	case dv.Home:
		return a.L.T("device.home.line", a.S.PersonaName), a.T.InkMuted
	case dv.Kind == "phone":
		return a.L.T("device.client.line", a.S.PersonaName), a.T.InkMuted
	}
	// Another computer says what it is, and what it does or is doing (D84).
	switch n := a.runningOn(dv); n {
	case 0:
		return a.L.T("device.other") + " · " + a.L.T("device.other.does", a.S.PersonaName), a.T.InkMuted
	case 1:
		return a.L.T("device.other") + " · " + a.L.T("device.other.working.one"), a.T.InkMuted
	default:
		return a.L.T("device.other") + " · " + a.L.T("device.other.working", n), a.T.InkMuted
	}
}

// selectable styles a card that can be chosen (a device, an ability): a
// container on Raised that lifts on hover; chosen, a 2-point ink hairline.
// Never a ledge: cards are not buttons.
func (a *App) selectable(c *ui.Context, card ui.Element, sel bool) {
	t := a.T
	card.Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color)
	if sel {
		card.Border(2, t.Ink)
	} else {
		card.Border(2, t.Surface)
		a.lift(c, card, 2)
	}
}

// agoLong is a past time in words, with days.
func (a *App) agoLong(ts string) string {
	at := store.ParseTime(ts)
	if at.IsZero() {
		return ""
	}
	if d := a.Now().Sub(at); d >= 36*time.Hour {
		return a.L.T("time.ago.day", int(d.Hours()/24+0.5))
	}
	return a.ago(ts)
}

// deviceArt is the clay asset of a device in its state.
func deviceArt(d *protocol.DeviceView) string {
	if d.State == protocol.DeviceUnreachable {
		return "device_unreachable"
	}
	kind := d.Kind
	switch kind {
	case "phone":
		return "phone"
	case "mini", "server", "laptop":
	default:
		kind = "laptop"
	}
	if d.State == protocol.DeviceAsleep {
		return kind + "_asleep"
	}
	return kind + "_awake"
}

func abilityArt(id string) string {
	switch id {
	case protocol.AbilityWeb:
		return "ab_web"
	case protocol.AbilityComputer:
		return "ab_computer"
	case protocol.AbilityRemote:
		return "ab_remote"
	case protocol.AbilityPhone:
		return "ab_phone_locked"
	}
	return "ab_call_locked"
}

// ---------- the stage ----------

// squashAt is the device's squash at progress q: wider and shorter, then
// a little taller, then still.
func squashAt(q float32) (float32, float32) {
	keys := [][3]float32{{0, 1, 1}, {0.3, 1.03, 0.95}, {0.65, 0.99, 1.03}, {1, 1, 1}}
	for i := 1; i < len(keys); i++ {
		if q <= keys[i][0] {
			f := (q - keys[i-1][0]) / (keys[i][0] - keys[i-1][0])
			f = ui.EaseOut(f)
			return keys[i-1][1] + (keys[i][1]-keys[i-1][1])*f, keys[i-1][2] + (keys[i][2]-keys[i-1][2])*f
		}
	}
	return 1, 1
}

// ellipse adds an ellipse to a path (four cubic quarters).
func ellipse(m *ui.Path, cx, cy, rx, ry float32) {
	const k = 0.5523
	m.MoveTo(cx+rx, cy)
	m.CubeTo(cx+rx, cy+k*ry, cx+k*rx, cy+ry, cx, cy+ry)
	m.CubeTo(cx-k*rx, cy+ry, cx-rx, cy+k*ry, cx-rx, cy)
	m.CubeTo(cx-rx, cy-k*ry, cx-k*rx, cy-ry, cx, cy-ry)
	m.CubeTo(cx+k*rx, cy-ry, cx+rx, cy-k*ry, cx+rx, cy)
	m.Close()
}

// stageLine is the one line at the top of the stage when something just
// changed (an ability added or removed). Why a device is quiet is said
// under its island and in its card, not here.
func (a *App) stageLine(c *ui.Context, dv *protocol.DeviceView, sw float32) {
	t := a.T
	d := a.devState()
	if d.line == "" || a.Now().Sub(d.lineAt) >= 8*time.Second {
		return
	}
	text, sc, check := d.line, t.Awake, true
	c.After(8*time.Second - a.Now().Sub(d.lineAt))
	line := ui.Row(c.Key("line:" + text)).Absolute().Top(18).Left(16).Width(sw - 32).Justify(ui.Center)
	line.Children(func() {
		pill := ui.Row(c.Key("pill")).Gap(t.S3).Padding(t.S3, t.S4).Radius(t.RadiusMD).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).
			AlignItems(ui.Center).Role(ui.RoleStatus).Label(text).MaxWidthPercent(100)
		a.enter(c, pill)
		pill.Children(func() {
			if check {
				a.glyph(c, 20, drawCheck(sc.Ink))
			}
			ui.Text(c, text).FontSize(t.MD).FontWeight(800).TextColor(t.Ink).MaxLines(2)
		})
	})
}

// ---------- the ability grid and detail ----------

func (a *App) abilityGrid(c *ui.Context, dv *protocol.DeviceView, cols int) {
	t := a.T
	d := a.devState()
	ui.Text(c, a.L.T("devices.grid")).FontSize(t.XS).FontWeight(800).LetterSpacing(1.2).TextColor(t.InkMuted)
	hovered := ""
	ui.Grid(c).Columns(cols).Gap(t.S3).Children(func() {
		for _, id := range gridAbilities {
			ab := (*protocol.DeviceAbility)(nil)
			if dv != nil {
				ab = dv.Ability(id)
			}
			name := a.L.T("ability." + id)
			sub := ""
			addable := dv != nil && a.canAdd(dv, id)
			switch {
			case dv != nil && a.shownOn(dv, id):
				sub = a.L.T("ability.on.at", a.deviceNameIn(dv))
			case ab == nil && dv != nil && !dv.Home:
				sub = a.L.T("ability.unavailable")
			case ab == nil || ab.State == protocol.AbilityLater:
				sub = a.L.T("ability.later")
			case ab.State == protocol.AbilityUnavailable:
				sub = a.L.T("ability.unavailable")
			}
			if id == protocol.AbilityWeb && dv != nil && a.webNeedsSetup(dv) {
				sub = a.L.T("web.tile")
			}
			if id == protocol.AbilityRemote && dv != nil && a.abilityOn(dv, id) && a.S.Reach != nil && len(a.S.Reach.Clients) > 0 {
				sub = a.L.T("pair.connected") + " · " + a.S.Reach.Clients[len(a.S.Reach.Clients)-1].Name
			}
			label := name
			if sub != "" {
				label += " · " + sub
			} else if addable {
				label += " · " + a.L.T("ability.add", a.deviceNameIn(dv))
			}
			tile := ui.Column(c.Key("ab:"+id)).Radius(t.RadiusLG).Background(t.Surface).Padding(t.S2, t.S2, t.S3, t.S2).Gap(2).AlignItems(ui.Center).
				Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(label).Focusable().AccessSelected(d.ability == id)
			a.selectable(c, tile, d.ability == id)
			locked := ab == nil || ab.State == protocol.AbilityLater
			if locked {
				tile.Opacity(0.72)
			}
			if addable {
				tile.Drag(abilityDrag{id})
				if tile.Hovered() || tile.Dragging() {
					hovered = id
				}
			}
			flying := d.fx != nil && d.fx.ability == id
			tile.Children(func() {
				well := ui.Box(c.Key("well")).WidthPercent(100).Height(84).Radius(t.RadiusMD).Background(t.Clay).Padding(t.S2)
				well.Children(func() {
					if bmp := theme.Clay(abilityArt(id)); bmp != nil {
						im := ui.Image(c, bmp).Grow(1).AccessHidden(true)
						if flying {
							im.Opacity(0)
						}
					}
				})
				d.tiles[id] = well.Bounds()
				ui.Text(c, name).FontSize(t.SM).FontWeight(800).TextAlign(ui.Center).Margin(4, 0, 0, 0)
				if sub != "" {
					ui.Text(c, sub).FontSize(t.XS).TextColor(t.InkMuted).TextAlign(ui.Center).MaxLines(2)
				}
			})
			if tile.Clicked() {
				d.ability, d.removing = id, ""
				if id == protocol.AbilityWeb && dv != nil && a.webNeedsSetup(dv) {
					a.openWebSetup()
				}
				if addable {
					a.startEquip(dv, id, d.tiles[id], false)
				}
			}
			if dv != nil && a.abilityOn(dv, id) && id == protocol.AbilityWeb && dv.State == protocol.DeviceAwake {
				tile.ContextMenu(func(m *ui.Menu) {
					if m.Item(a.L.T("ability.remove")).Chosen() {
						d.ability, d.removing = id, id
					}
				})
			}
		}
	})
	if d.fx == nil {
		d.hover = hovered
	}
}

func (a *App) abilityDetail(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	d := a.devState()
	if dv == nil {
		return
	}
	id := d.ability
	ab := dv.Ability(id)
	name := a.L.T("ability." + id)
	card := ui.Column(c.Key("detail:"+id)).Radius(t.RadiusLG).Background(t.Surface).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Padding(t.S4).Gap(t.S3).
		Role(ui.RoleGroup).Label(name)
	card.Children(func() {
		a.heading(c, name, t.XL)
		on := a.shownOn(dv, id)
		if !(on && d.removing == id) {
			ui.Text(c, a.L.T("ability."+id+".about")).FontSize(t.MD).LineHeight(1.6).TextColor(t.InkSoft)
		}
		if id == protocol.AbilityWeb && a.webSetupOwned(dv) {
			a.pollCua(c, false) // the two switches may be off even when the server says on
		}
		switch {
		case ab == nil && !dv.Home && id != protocol.AbilityRemote:
			a.reasonLine(c, a.L.T("ability.later"))
		case ab == nil || ab.State == protocol.AbilityLater:
			a.reasonLine(c, a.L.T("ability.later"))
		case id == protocol.AbilityWeb && a.webNeedsSetup(dv) && dv.State == protocol.DeviceAwake:
			a.webSetupEntry(c, dv)
		case ab.State == protocol.AbilityUnavailable:
			a.unavailable(c, ab)
		case on && id == protocol.AbilityRemote:
			a.reachList(c)
			if a.button(c, a.L.T("pair.again"), btnSecondary, t.ControlMD, t.Bg) {
				a.openPair()
			}
		case on && d.removing == id:
			ui.Text(c, a.L.T("ability.remove."+id, a.deviceNameIn(dv))).FontSize(t.MD).LineHeight(1.55).TextColor(t.Ink)
			ui.Row(c).Gap(t.S3).Children(func() {
				if a.button(c, a.L.T("ability.remove.keep"), btnSecondary, t.ControlMD, t.Bg) {
					d.removing = ""
				}
				if a.buttonFor(c, a.L.T("ability.remove"), name, btnPrimary, t.ControlMD, t.Surface) {
					a.removeAbility(dv, id)
				}
			})
		case on:
			ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				a.glyph(c, 18, drawCheck(t.Awake.Ink))
				ui.Text(c, a.L.T("ability.on.at", a.deviceNameIn(dv))).FontSize(t.SM).FontWeight(700).Grow(1).MinWidth(0)
				if dv.State == protocol.DeviceAwake && a.buttonFor(c, a.L.T("ability.remove"), name, btnText, t.ControlSM, t.Surface) {
					d.removing = id
				}
			})
		case dv.State != protocol.DeviceAwake:
			a.reasonLine(c, a.L.T("ability.reason.asleep"))
		case id == protocol.AbilityRemote && d.pair.open:
			ui.Text(c, a.L.T("pair.waiting")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		default:
			if r, ok := d.refused[dv.ID+"/"+id]; ok {
				a.reasonLine(c, a.reasonText(r.Reason))
			}
			if a.buttonFor(c, a.L.T("ability.add", a.deviceNameIn(dv)), name, btnPrimary, t.ControlLG, t.Surface) {
				a.startEquip(dv, id, d.tiles[id], false)
			}
			ui.Text(c, a.L.T("devices.empty.hint", a.deviceNameIn(dv))).FontSize(t.XS).TextColor(t.InkMuted).TextAlign(ui.Center)
		}
	})
}

func (a *App) reasonLine(c *ui.Context, text string) {
	t := a.T
	ui.Row(c).Gap(t.S2).Padding(t.S3, t.S3).Radius(t.RadiusSM).Background(t.SurfaceSunken).AlignItems(ui.Center).Children(func() {
		ui.Text(c, text).FontSize(t.SM).FontWeight(600).TextColor(t.InkSoft).LineHeight(1.5)
	})
}

func (a *App) reasonText(reason string) string {
	switch reason {
	case "cua_missing", "cua_old", "env_off", "failed":
		return a.L.T("ability.reason." + reason)
	case "home_only":
		return a.L.T("ability.reason.home_only", a.S.PersonaName)
	}
	return a.L.T("ability.reason.failed")
}

// unavailable says why an ability can't be added, with the one thing to do.
func (a *App) unavailable(c *ui.Context, ab *protocol.DeviceAbility) {
	t := a.T
	a.reasonLine(c, a.reasonText(ab.Reason))
	switch ab.Reason {
	case "cua_old":
		a.commandBoxSized(c, "cua-driver update --apply", 13)
	case "cua_missing":
		if a.button(c, a.L.T("ability.fix.install"), btnSecondary, t.ControlMD, t.Bg) {
			a.openLink("https://github.com/trycua/cua")
		}
	}
}

// openLink opens a URL in the browser (through the Backend when the app
// runs Ducter, else nothing in tests).
func (a *App) openLink(u string) {
	switch {
	case a.Backend != nil:
		_ = a.Backend.OpenURL(u)
	case a.OpenExternal != nil:
		_ = a.OpenExternal(u)
	}
}

// reachList: the devices that can reach Ducter from elsewhere.
func (a *App) reachList(c *ui.Context) {
	t := a.T
	if a.S.Reach == nil {
		return
	}
	ui.Column(c).Gap(t.S2).Children(func() {
		for _, cl := range a.S.Reach.Clients {
			line := a.L.T("reach.client.online", cl.Name)
			if !cl.Connected {
				line = cl.Name
				if ago := a.agoLong(cl.LastSeen); ago != "" {
					line = a.L.T("reach.client.seen", cl.Name, ago)
				}
			}
			// The words say it (online / seen 2 h ago); no status dot.
			ui.Text(c.Key("cl:"+cl.ID), line).FontSize(t.SM).FontWeight(700).SingleLine()
		}
		ui.Text(c, a.L.T("ability.remote.how")).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.5)
	})
}

// ---------- adding and removing ----------

// startEquip adds an ability: the request goes out at once; the sticker
// flies meanwhile, and the line comes only once the server said yes.
// 远程打开 isn't a switch: it opens the pairing code instead, and flies
// when a device actually connects.
func (a *App) startEquip(dv *protocol.DeviceView, id string, from ui.Rect, dropped bool) {
	d := a.devState()
	if dv == nil || d.fx != nil {
		return
	}
	d.ability, d.removing = id, ""
	delete(d.refused, dv.ID+"/"+id)
	if id == protocol.AbilityRemote {
		a.openPair()
		return
	}
	a.send(protocol.AbilityReq{T: "ability", Device: dv.ID, Ability: id, On: true})
	a.flyIn(dv.ID, id, from, dropped)
}

// flyIn starts the sticker's flight from a rectangle to the ability's slot.
func (a *App) flyIn(device, id string, from ui.Rect, dropped bool) {
	d := a.devState()
	to := d.slots[id]
	if from.W == 0 {
		from = to
	}
	d.fx = &equipFx{ability: id, device: device, start: a.Now(), from: from, to: to, dropped: dropped}
}

func (a *App) removeAbility(dv *protocol.DeviceView, id string) {
	d := a.devState()
	d.removing = ""
	delete(d.optimistic, dv.ID+"/"+id)
	a.send(protocol.AbilityReq{T: "ability", Device: dv.ID, Ability: id, On: false})
}

// drainAbilityResults takes the server's answers: a yes lands the
// sticker (or says it was removed); a no sends it back with the reason.
func (a *App) drainAbilityResults() {
	d := a.devState()
	res := a.S.AbilityResults
	a.S.AbilityResults = nil
	for i := range res {
		r := res[i]
		dv := a.S.Device(r.Device)
		name := r.Device
		if dv != nil {
			name = a.deviceName(dv)
		}
		key := r.Device + "/" + r.Ability
		if fx := d.fx; fx != nil && fx.device == r.Device && fx.ability == r.Ability && r.On {
			fx.result = &r
		}
		switch {
		case r.OK && r.On:
			d.optimistic[key] = a.Now()
			if d.fx == nil {
				a.landed(name, r.Ability)
			}
		case r.OK && !r.On:
			d.line, d.lineAt = a.L.T("ability.removed."+r.Ability, name), a.Now()
		default:
			d.refused[key] = r
		}
	}
	// A device that paired while the code was showing: 远程打开 is on.
	if d.pair.open && a.S.Reach != nil && len(a.S.Reach.Clients) > d.pair.clients {
		a.joined("cl:" + a.S.Reach.Clients[len(a.S.Reach.Clients)-1].ID)
		if home := a.homeDevice(); home != nil {
			d.ability = protocol.AbilityRemote
			d.optimistic[home.ID+"/"+protocol.AbilityRemote] = a.Now()
			d.fx = &equipFx{ability: protocol.AbilityRemote, device: home.ID, start: a.Now(), from: d.tiles[protocol.AbilityRemote], to: d.slots[protocol.AbilityRemote],
				result: &protocol.ServerFrame{T: "ability_result", OK: true, On: true}}
		}
	}
}

// landed: the ability is on; say so in one line.
func (a *App) landed(device, id string) {
	d := a.devState()
	d.line, d.lineAt = a.L.T("ability."+id+".done", device), a.Now()
}

// ---------- the flight ----------

// flyer draws the sticker in flight, over everything, in window DIPs.
func (a *App) flyer(c *ui.Context) {
	t := a.T
	d := a.devState()
	fx := d.fx
	if fx == nil {
		return
	}
	now := a.Now()
	still := c.Preferences().ReduceMotion
	dur := t.Equip.Flight
	if fx.dropped {
		dur = dur * 55 / 100
	}
	if still {
		dur = t.Equip.Fade
	}
	if fx.back {
		dur = 420 * time.Millisecond
	}
	if to := d.slots[fx.ability]; to.W > 0 && !fx.back {
		fx.to = to
	}
	q := float32(now.Sub(fx.start)) / float32(dur)
	snapAt := t.Equip.Snap
	if fx.dropped {
		snapAt = 0.45
	}
	if !fx.back && !fx.snapped && (q >= snapAt || still) {
		fx.snapped = true
		if fx.result == nil || fx.result.OK {
			d.squash, d.doneAt = now, now
			d.sparkAt, d.sparkAt0 = now, fx.to
		}
	}
	if q >= 1 {
		switch {
		case fx.back:
			d.fx = nil
			return
		case fx.result == nil && now.Sub(fx.start) < 6*time.Second:
			q = 1 // waiting for the server, the sticker rests in the slot
		case fx.result == nil || !fx.result.OK:
			// Refused (or no answer): it goes back where it came from.
			if fx.result == nil {
				d.refused[fx.device+"/"+fx.ability] = protocol.ServerFrame{Reason: "failed"}
			}
			d.doneAt = time.Time{}
			fx.back, fx.start, fx.from, fx.to = true, now, fx.to, fx.from
			c.Invalidate()
			return
		default:
			dev := a.S.Device(fx.device)
			name := fx.device
			if dev != nil {
				name = a.deviceName(dev)
			}
			d.fx = nil
			a.landed(name, fx.ability)
			return
		}
	}
	c.After(16 * time.Millisecond)
	x, y, s, rot, sy := a.flightPose(fx, min(max(q, 0), 1), still)
	size := fx.from.W
	bmp := theme.Clay(abilityArt(fx.ability))
	if bmp == nil || size == 0 {
		return
	}
	ui.Box(c.Key("flyer")).Absolute().Left(x-size/2).Top(y-size/2).Size(size, size).ZIndex(1000).PassThrough().
		Scale(s, s*sy).Rotate(rot).AccessHidden(true).Children(func() {
		ui.Image(c, bmp).Grow(1)
	})
}

// flightPose is the sticker's center, scale, turn and vertical squash at
// progress q: peel (lift, tilt), arc over, overshoot into the slot, settle
// (research/26 timings). Reduced motion moves it straight.
func (a *App) flightPose(fx *equipFx, q float32, still bool) (x, y, s, rot, sy float32) {
	ax, ay := fx.from.X+fx.from.W/2, fx.from.Y+fx.from.H/2
	bx, by := fx.to.X+fx.to.W/2, fx.to.Y+fx.to.H/2
	sc := float32(1)
	if fx.from.W > 0 {
		sc = fx.to.W / fx.from.W
	}
	lerp := func(a, b, f float32) float32 { return a + (b-a)*f }
	if still || fx.back {
		f := ui.EaseInOut(q)
		return lerp(ax, bx, f), lerp(ay, by, f), lerp(1, sc, f), 0, 1
	}
	dx, dy := bx-ax, by-ay
	type key struct{ q, x, y, s, rot, sy float32 }
	var keys []key
	if fx.dropped {
		keys = []key{
			{0, 0, 0, 1.05, 4, 1},
			{0.45, dx, dy, sc * 0.88, 0, 1},
			{0.6, dx, dy, sc * 1.12, 0, 1},
			{1, dx, dy, sc, 0, 1},
		}
	} else {
		keys = []key{
			{0, 0, 0, 1, 0, 1},
			{0.14, 0, -20, 1.1, -9, 0.9}, // peeled: lifted, tilted, foreshortened
			{0.5, dx * 0.55, dy*0.55 - 120, (1 + sc) / 2, 7, 1},
			{0.62, dx, dy, sc * 0.88, 0, 1},
			{0.69, dx, dy, sc * 1.12, 0, 1},
			{1, dx, dy, sc, 0, 1},
		}
	}
	for i := 1; i < len(keys); i++ {
		k0, k1 := keys[i-1], keys[i]
		if q <= k1.q {
			f := (q - k0.q) / (k1.q - k0.q)
			switch i {
			case 1:
				f = ui.CubicBezier(0.2, 0.8, 0.3, 1)(f)
			case 2:
				f = ui.CubicBezier(0.3, 0.1, 0.3, 1)(f)
			case 3:
				f = ui.CubicBezier(0.6, 0, 0.9, 0.4)(f)
			default:
				f = ui.CubicBezier(0.34, 1.8, 0.5, 1)(f)
			}
			return ax + lerp(k0.x, k1.x, f), ay + lerp(k0.y, k1.y, f), lerp(k0.s, k1.s, f), lerp(k0.rot, k1.rot, f), lerp(k0.sy, k1.sy, f)
		}
	}
	return bx, by, sc, 0, 1
}

// sparkles: a small burst of stars round the slot as the sticker lands.
func (a *App) sparkles(c *ui.Context) {
	t := a.T
	d := a.devState()
	if d.sparkAt.IsZero() || c.Preferences().ReduceMotion {
		return
	}
	el := a.Now().Sub(d.sparkAt)
	const life = 640 * time.Millisecond
	if el >= life {
		d.sparkAt = time.Time{}
		return
	}
	c.After(16 * time.Millisecond)
	q := float32(el) / float32(life)
	r := d.sparkAt0
	cols := []ui.Color{t.Accent, t.Waiting.Dot, t.Working.Dot, t.Awake.Dot}
	ui.Box(c.Key("sparkles")).Absolute().Left(0).Top(0).Size(1, 1).ZIndex(999).PassThrough().AccessHidden(true).
		DrawOver(func(p *ui.Painter, _ ui.Rect) {
			cx, cy := r.X+r.W/2, r.Y+r.H/2
			e := ui.EaseOut(q)
			for i := 0; i < 18; i++ {
				ang := float64(i) / 18 * 2 * math.Pi
				dist := float32(56+float32((i*37)%46)) * e
				x := cx + float32(math.Cos(ang))*dist
				y := cy + float32(math.Sin(ang))*dist - 12*e
				size := 7 * (1.2 - 0.9*q)
				star(p, x, y, size, cols[i%4].Alpha(1-q))
			}
		})
}

func star(p *ui.Painter, x, y, r float32, col ui.Color) {
	var m ui.Path
	m.MoveTo(x, y-r)
	m.LineTo(x+0.26*r, y-0.32*r)
	m.LineTo(x+r, y)
	m.LineTo(x+0.26*r, y+0.32*r)
	m.LineTo(x, y+r)
	m.LineTo(x-0.26*r, y+0.32*r)
	m.LineTo(x-r, y)
	m.LineTo(x-0.26*r, y-0.32*r)
	m.Close()
	p.FillPath(&m, col)
}

// ---------- AI accounts: sign in, install, sign out (D71) ----------

// accountCheck is the doctor's check id of a harness ("" if none).
func accountCheck(h string) string {
	switch h {
	case "claude-code":
		return "claude"
	case "codex":
		return "codex"
	}
	return ""
}

// accountCommands are the official commands: install, sign in, sign out.
func accountCommands(h string) (install, signin, signout string) {
	switch h {
	case "claude-code":
		return "curl -fsSL https://claude.ai/install.sh | bash", "claude auth login", "claude auth logout"
	case "codex":
		return "curl -fsSL https://chatgpt.com/codex/install.sh | sh", "codex login", "codex logout"
	}
	return "", "", ""
}

// accountSheet is one AI account on this Mac: the first run's own row to
// install or sign in (the same jobs, the same words), or, signed in, the
// way out. Its end asks for fresh devices, so the card says what is true.
func (a *App) accountSheet(c *ui.Context, dv *protocol.DeviceView, sw, sh float32) {
	t := a.T
	d := a.devState()
	var h *protocol.DeviceHarness
	for i := range dv.Harnesses {
		if dv.Harnesses[i].Harness == d.account {
			h = &dv.Harnesses[i]
		}
	}
	if h == nil || a.Backend == nil {
		d.account = ""
		return
	}
	name := harnessName(h.Harness)
	id := accountCheck(h.Harness)
	install, signin, signout := accountCommands(h.Harness)
	k := local.Check{ID: id, Label: name, Status: "missing"}
	switch {
	case !h.Installed:
		k.Action, k.Fix, k.Detail = "install", install, a.L.T("token.missing")
	case !h.LoggedIn:
		k.Action, k.Fix, k.Detail = "signin", signin, a.L.T("token.signed_out")
	}
	// Any job of this account that just ended: probe the sign-ins again.
	for _, act := range []string{"install", "signin", "signout"} {
		if j := a.Backend.Job(id + "." + act); j != nil {
			if j.Running() {
				c.After(500e6)
				continue
			}
			if d.refreshed == nil {
				d.refreshed = map[*local.Job]bool{}
			}
			if !d.refreshed[j] {
				d.refreshed[j] = true
				a.send(protocol.DevicesReq{T: "devices", Refresh: true})
			}
		}
	}
	w := min(sw-48, 440)
	sheet := ui.Column(c.Key("account")).Absolute().Left((sw-w)/2).Top(40).Width(w).MaxHeight(sh-80).
		Padding(t.S5, t.S5).Gap(t.S3).Radius(t.RadiusXL).Background(t.Surface).Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).ZIndex(10).
		Role(ui.RoleDialog).Label(name)
	a.enter(c, sheet)
	sheet.Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			art := "token_ink"
			if h.Harness == "claude-code" {
				art = "token_orange"
			}
			if bmp := theme.Clay(art); bmp != nil {
				ui.Image(c, bmp).Size(44, 44).Shrink(0).AccessHidden(true)
			}
			a.heading(c, name, t.XL).Grow(1).MinWidth(0)
			if a.button(c, a.L.T("pair.close"), btnSecondary, t.ControlSM, t.Surface) {
				d.account = ""
			}
		})
		if k.Action != "" {
			ui.Column(c).Radius(t.RadiusLG).Background(t.SurfaceSunken).Children(func() { a.optionRow(c, k, true) })
			return
		}
		status := a.L.T("token.signed_in")
		if h.Allowance != nil {
			status += " · " + a.L.T("token.allowance", int(h.Allowance.Left*100+0.5))
		}
		ui.Text(c, status).FontSize(t.MD).FontWeight(700)
		j := a.Backend.Job(id + ".signout")
		switch {
		case j != nil && j.Running():
			ui.Text(c, a.L.T("token.signingout")).FontSize(t.SM).TextColor(t.InkMuted)
		default:
			if j != nil && !j.OK() && d.refreshed[j] {
				a.reasonLine(c, a.L.T("token.failed"))
			}
			ui.Text(c, a.L.T("token.signout.sure", name)).FontSize(t.SM).TextColor(t.InkSoft)
			if a.buttonFor(c, a.L.T("token.signout"), name, btnSecondary, t.ControlMD, t.Surface) {
				_, _ = a.Backend.Run(id+".signout", signout)
			}
		}
	})
}

// deviceIdle is how a device's clay moves while nothing happens (D77): an
// awake one floats, a cloud machine (a server) drifts, a sleeping one's
// blanket rises and falls, and one that can't be reached is still.
func deviceIdle(dv *protocol.DeviceView) idleKind {
	switch dv.State {
	case protocol.DeviceAwake:
		if dv.Kind == "server" {
			return idleDrift
		}
		return idleFloat
	case protocol.DeviceAsleep:
		return idleBlanket
	}
	return idleStill
}

// deviceClay is a device's clay art, moving by its state, a little grey
// when it can't be reached. Each drawing has its own phase (key).
func (a *App) deviceClay(c *ui.Context, key string, dv *protocol.DeviceView) ui.Element {
	bmp := theme.Clay(deviceArt(dv))
	kind, phase := deviceIdle(dv), phaseOf(key)
	box := ui.Box(c.Key("clay:" + key)).AccessHidden(true)
	if dv.State == protocol.DeviceUnreachable {
		box.Grayscale().Opacity(0.8)
	}
	return box.Draw(func(p *ui.Painter, r ui.Rect) {
		at := fitIn(bmp, r)
		clayArt(p, at, bmp, kind, phase, nil)
	})
}
