package views

import (
	"math"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
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

// slotSpots are where the slots sit on the stage (centers, as fractions).
var slotSpots = [4][2]float32{{0.16, 0.27}, {0.84, 0.27}, {0.14, 0.58}, {0.86, 0.58}}

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
	tiles    map[string]ui.Rect // the ability art in the grid, last frame
	slots    map[string]ui.Rect // the slots' wells, last frame
	hover    string             // the tile under the pointer
}

type pairState struct {
	open    bool
	asked   time.Time
	clients int // paired clients when it opened
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
		ui.Column(c).Grow(1).MinHeight(0).Gap(18).Padding(20, 32, 24, 32).Children(func() {
			a.devicesHeader(c, dev)
			switch {
			case len(a.S.Devices) == 0:
				a.devicesWaiting(c)
			case narrow:
				ui.Row(c).Gap(12).Wrap().Children(func() { a.deviceCards(c, 230) })
				ui.Column(c).Height(560).Children(func() { a.stage(c, dev) })
				ui.Row(c).Gap(18).AlignItems(ui.Start).Children(func() {
					ui.Column(c).Grow(1).Basis(0).Gap(12).Children(func() { a.abilityGrid(c, dev, 3) })
					ui.Column(c).Grow(1).Basis(0).Children(func() { a.abilityDetail(c, dev) })
				})
			default:
				ui.Row(c).Grow(1).MinHeight(0).Gap(18).AlignItems(ui.Stretch).Children(func() {
					ui.Column(c).Width(260).Shrink(0).Gap(12).Children(func() {
						ui.Text(c, a.L.T("devices.list")).FontSize(t.XS).FontWeight(800).LetterSpacing(1.2).TextColor(t.InkMuted)
						a.deviceCards(c, 0)
					})
					ui.Column(c).Grow(1).MinWidth(0).Children(func() { a.stage(c, dev) })
					ui.Scroll(c.Key("abilities")).Width(300).Shrink(0).Children(func() {
						ui.Column(c).Gap(12).Padding(0, 0, 8, 0).Children(func() {
							a.abilityGrid(c, dev, 2)
							a.abilityDetail(c, dev)
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
			ui.Row(c.Key("devices-offline")).Gap(10).Padding(10, 16).Radius(t.RadiusSM).Background(t.Away.Surface).AlignItems(ui.Center).Children(func() {
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
	ui.Column(c.Key("devices-wait")).Grow(1).Justify(ui.Center).AlignItems(ui.Center).Gap(14).Children(func() {
		a.avatar(c, theme.Idle, 140)
		ui.Text(c, msg).FontSize(t.LG).TextColor(t.InkSoft)
	})
}

// ---------- device cards ----------

func (a *App) deviceCards(c *ui.Context, width float32) {
	t := a.T
	shown := a.shownDevice()
	for i := range a.S.Devices {
		dv := &a.S.Devices[i]
		sel := shown != nil && shown.ID == dv.ID
		name := a.deviceName(dv)
		chip, sc := a.deviceChip(dv)
		card := ui.Row(c.Key("dev:" + dv.ID)).Gap(12).Padding(10).Radius(22).Background(t.Surface).AlignItems(ui.Center).
			Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(name + " · " + chip).AccessSelected(sel)
		if width > 0 {
			card.Width(width)
		}
		if sel {
			card.Border(3, t.Ink).Shadow(0, 5, 0, 0, t.Ink)
		} else {
			a.press(c, card, t.PressCard)
			a.lift(c, card, 2)
		}
		card.Children(func() {
			ui.Box(c).Size(72, 72).Radius(16).Background(t.Clay).Padding(8).Shrink(0).Children(func() {
				if b := theme.Clay(deviceArt(dv)); b != nil {
					ui.Image(c, b).Grow(1).AccessHidden(true)
				}
			})
			ui.Column(c).Gap(4).Grow(1).MinWidth(0).Children(func() {
				ui.Text(c, name).FontSize(15).FontWeight(800).SingleLine()
				if dv.Home && name != dv.Name {
					ui.Text(c, dv.Name).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
				}
				a.stateChipText(c, chip, sc)
			})
		})
		if card.Clicked() {
			a.devState().sel = dv.ID
			a.devState().removing = ""
		}
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

func (a *App) stateChipText(c *ui.Context, text string, sc theme.StateColors) {
	ui.Row(c).Gap(6).Padding(3, 9).Radius(a.T.Pill).Background(sc.Surface).AlignItems(ui.Center).AlignSelf(ui.Start).MaxWidthPercent(100).Children(func() {
		ui.Box(c).Size(7, 7).Radius(4).Background(sc.Dot).Shrink(0)
		ui.Text(c, text).FontSize(a.T.XS).FontWeight(700).TextColor(sc.Ink).MaxLines(2)
	})
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

// rig is where things sit on the stage, in its own coordinates.
type rig struct {
	k                   float32
	ped, device, ducter ui.Rect
	tokensTop, sw, sh   float32
	duckerBottom        float32
}

func (a *App) layoutRig(sw, sh float32, dv *protocol.DeviceView, pose theme.Presence) rig {
	k := min(sw/620, sh/660, 1.2)
	k = max(k, 0.55)
	r := rig{k: k, sw: sw, sh: sh}
	r.tokensTop = sh - 20 - 66
	pw := 430 * k
	ph := pw * 405 / 640
	r.ped = ui.Rect{X: (sw - pw) / 2, Y: r.tokensTop - 26*k - ph, W: pw, H: ph}
	art := deviceArt(dv)
	dw, aspect := float32(300), float32(491.0/640)
	switch art {
	case "laptop_asleep":
		dw, aspect = 300, 419.0/640
	case "mini_awake":
		dw, aspect = 220, 638.0/574
	case "mini_asleep":
		dw, aspect = 280, 443.0/640
	case "server_awake":
		dw, aspect = 290, 511.0/640
	case "server_asleep":
		dw, aspect = 260, 436.0/562
	case "device_unreachable":
		dw, aspect = 290, 546.0/640
	case "phone":
		dw, aspect = 150, 640.0/416
	}
	dw *= k
	dh := dw * aspect
	bottom := r.ped.Y + 0.6*ph
	r.device = ui.Rect{X: (sw - dw) / 2, Y: bottom - dh, W: dw, H: dh}
	// Ducter's feet on the device's top edge; each pose's feet sit at a
	// different height of its square.
	s := 180 * k
	feet := map[theme.Presence]float32{theme.Idle: 0.795, theme.Done: 0.855, theme.Napping: 0.86}[pose]
	if feet == 0 {
		feet = 0.8
	}
	topInset := r.device.H * 0.025
	r.ducter = ui.Rect{X: sw/2 - s/2 + 4*k, Y: r.device.Y + topInset - feet*s + 9*k, W: s, H: s}
	return r
}

func (a *App) stage(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	d := a.devState()
	if dv == nil {
		return
	}
	now := a.Now()
	still := c.Preferences().ReduceMotion
	stage := ui.Box(c.Key("stage")).Grow(1).MinHeight(420).Radius(36).Background(t.Clay).Clip().
		Role(ui.RoleGroup).Label(a.deviceName(dv))
	if over, ok := ui.DragOver[abilityDrag](stage); ok && a.canAdd(dv, over.id) {
		d.hover = over.id
	}
	if got, ok := ui.Drop[abilityDrag](stage); ok && a.canAdd(dv, got.id) {
		x, y, _ := stage.PointerPosition()
		sb := stage.Bounds()
		size := float32(110)
		a.startEquip(dv, got.id, ui.Rect{X: sb.X + x - size/2, Y: sb.Y + y - size/2, W: size, H: size}, true)
	}
	b := stage.LayoutBounds()
	sw, sh := b.W, b.H
	if sw == 0 || sh == 0 {
		c.Invalidate()
		sw, sh = 620, 640
	}
	pose := theme.Idle
	switch {
	case dv.State == protocol.DeviceAsleep:
		pose = theme.Napping
	case !d.doneAt.IsZero() && now.Sub(d.doneAt) < t.Equip.DoneFace:
		pose = theme.Done
		c.After(t.Equip.DoneFace - now.Sub(d.doneAt))
	}
	r := a.layoutRig(sw, sh, dv, pose)
	dim := dv.State != protocol.DeviceAwake
	harnesses := dv.Harnesses

	stage.Draw(func(p *ui.Painter, rect ui.Rect) {
		// Soft contact shadow under the pedestal.
		cx := rect.X + r.ped.X + r.ped.W/2
		cy := rect.Y + r.ped.Y + r.ped.H*0.92
		for i := 0; i < 24; i++ {
			f := 1 - float32(i)/24
			var e ui.Path
			ellipse(&e, cx, cy, r.ped.W*0.47*f+6, r.ped.H*0.12*f+2)
			p.FillPath(&e, ui.RGBA(120, 72, 30, 0.012))
		}
		// Cords: a signed-in AI account is tied to this device.
		n := len(harnesses)
		for i, h := range harnesses {
			if !h.LoggedIn || dim { // a device that isn't awake: what it last said, untied
				continue
			}
			tx := rect.X + tokenCenter(sw, n, i, r.k)
			ty := rect.Y + r.tokensTop
			ex := cx + (float32(i)-float32(n-1)/2)*24*r.k
			ey := rect.Y + r.ped.Y + r.ped.H*0.88
			col := t.Accent
			if h.Harness != "claude-code" {
				col = t.Ink
			}
			dottedCurve(p, tx, ty, tx, ty-30*r.k, ex, ey+26*r.k, ex, ey, col.Alpha(0.8), 2.6*r.k)
		}
	})
	stage.Children(func() {
		// Pedestal, device, Ducter.
		img := func(key, name string, at ui.Rect) ui.Element {
			e := ui.Box(c.Key(key)).Absolute().Left(at.X).Top(at.Y).Size(at.W, at.H)
			e.Children(func() {
				if bmp := theme.Clay(name); bmp != nil {
					ui.Image(c, bmp).Grow(1).AccessHidden(true)
				}
			})
			return e
		}
		img("pedestal", "pedestal", r.ped)
		devEl := img("device:"+dv.ID, deviceArt(dv), r.device).Role(ui.RoleImage).Label(a.deviceName(dv)).TransformOrigin(0.5, 1)
		if !d.squash.IsZero() && !still {
			if el := now.Sub(d.squash); el < t.Equip.Squash {
				sx, sy := squashAt(float32(el) / float32(t.Equip.Squash))
				devEl.Scale(sx, sy)
				c.After(16 * time.Millisecond)
			}
		}
		if dv.Home {
			if bmp := theme.Art(pose, 360); bmp != nil {
				ui.Image(c.Key("ducter"), bmp).Absolute().Left(r.ducter.X).Top(r.ducter.Y).Size(r.ducter.W, r.ducter.H).
					Role(ui.RoleImage).Label(a.S.PersonaName)
			}
		}
		// Slots around the device.
		for i, id := range a.slotAbilities(dv) {
			if i >= len(slotSpots) {
				break
			}
			a.slot(c, dv, id, slotSpots[i][0]*sw, slotSpots[i][1]*sh, r.k, dim)
		}
		// AI accounts below.
		a.tokens(c, dv, r)
		// The line at the top: what changed, or why the device is quiet.
		a.stageLine(c, dv, sw)
		if d.pair.open {
			a.pairSheet(c, dv, sw, sh)
		}
	})
	a.sparkles(c)
}

// slotAbilities are the abilities a device shows slots for: the first
// four it has.
func (a *App) slotAbilities(dv *protocol.DeviceView) []string {
	var out []string
	for _, ab := range dv.Abilities {
		out = append(out, ab.ID)
	}
	if len(out) > 4 {
		out = out[:4]
	}
	return out
}

func tokenCenter(sw float32, n, i int, k float32) float32 {
	w := float32(250) * k
	gap := float32(22) * k
	total := float32(n)*w + float32(max(n-1, 0))*gap
	return (sw-total)/2 + float32(i)*(w+gap) + w/2
}

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

// dottedCurve paints dots along a cubic curve.
func dottedCurve(p *ui.Painter, x0, y0, x1, y1, x2, y2, x3, y3 float32, col ui.Color, r float32) {
	pt := func(s float32) (float32, float32) {
		u := 1 - s
		return u*u*u*x0 + 3*u*u*s*x1 + 3*u*s*s*x2 + s*s*s*x3, u*u*u*y0 + 3*u*u*s*y1 + 3*u*s*s*y2 + s*s*s*y3
	}
	length := float32(math.Hypot(float64(x3-x0), float64(y3-y0))) * 1.15
	n := int(length / (r * 3.2))
	for i := 0; i <= n; i++ {
		x, y := pt(float32(i) / float32(max(n, 1)))
		var m ui.Path
		m.Circle(x, y, r/2)
		p.FillPath(&m, col)
	}
}

func (a *App) slot(c *ui.Context, dv *protocol.DeviceView, id string, cx, cy, k float32, dim bool) {
	t := a.T
	d := a.devState()
	ab := dv.Ability(id)
	on := a.shownOn(dv, id)
	flying := d.fx != nil && d.fx.ability == id && d.fx.device == dv.ID && !d.fx.back
	well := max(76, 104*k)
	name := a.L.T("ability." + id)
	label := a.L.T("ability.slot", name)
	switch {
	case on:
		label = a.L.T("ability.slot.on", name)
	case ab != nil && ab.State == protocol.AbilityLater:
		label = a.L.T("ability.slot.later", name)
	case ab != nil && ab.State == protocol.AbilityUnavailable:
		label = a.L.T("ability.slot.unavailable", name)
	}
	addable := !on && !flying && a.canAdd(dv, id)
	target := flying || (addable && (d.ability == id || d.hover == id))
	col := ui.Column(c.Key("slot:" + id)).Absolute().Left(cx - 100).Top(cy - well/2).Width(200).AlignItems(ui.Center).Gap(6).
		Role(ui.RoleButton).Label(label).Cursor(ui.CursorPointer)
	if dim || (ab != nil && ab.State == protocol.AbilityLater) {
		col.Opacity(0.72)
	}
	col.Children(func() {
		w := ui.Box(c.Key("well")).Size(well, well)
		w.Children(func() {
			art := "slot_empty"
			if on || (ab != nil && ab.State == protocol.AbilityLater) {
				art = abilityArt(id)
			}
			if bmp := theme.Clay(art); bmp != nil {
				ui.Image(c, bmp).Grow(1).AccessHidden(true)
			}
			if target {
				// The dashed ring that says "this goes here"; it breathes
				// while an ability is held over the stage or hovered.
				live := (d.hover == id) && !c.Preferences().ReduceMotion
				ring := ui.Box(c.Key("ring")).Absolute().Left(-6).Top(-6).Size(well+12, well+12)
				ph := float32(0)
				if live {
					ph = float32(math.Sin(float64(c.Now().UnixMilli())/255)) * 0.5
					c.After(33 * time.Millisecond)
				}
				ring.Draw(func(p *ui.Painter, r ui.Rect) {
					grow := float32(0)
					if flying {
						grow = 14 // the slot opens for the sticker
					} else if d.hover == id {
						grow = 5 + 3*ph
						var halo ui.Path
						halo.Circle(r.X+r.W/2, r.Y+r.H/2, r.W/2+grow)
						p.FillPath(&halo, t.Accent.Alpha(0.12))
					}
					p.StrokeDashed(ui.Rect{X: r.X - grow/2, Y: r.Y - grow/2, W: r.W + grow, H: r.H + grow}, t.Accent, (r.W+grow)/2, 3)
				})
			}
		})
		d.slots[id] = w.Bounds()
		ui.Box(c).Padding(4, 10).Radius(t.Pill).Background(t.Surface).Shadow(0, 3, 0, 0, t.Line).Children(func() {
			ui.Text(c, label).FontSize(13).FontWeight(800).SingleLine()
		})
	})
	if on && dv.State == protocol.DeviceAwake && ab != nil && id == protocol.AbilityWeb {
		col.ContextMenu(func(m *ui.Menu) {
			if m.Item(a.L.T("ability.remove")).Chosen() {
				d.ability, d.removing = id, id
			}
		})
	}
	if col.Clicked() {
		d.ability = id
		if addable {
			a.startEquip(dv, id, d.tiles[id], false)
		}
	}
}

// tokens: the AI accounts on the device, as clay tokens with what the
// server knows (signed in or not; an allowance only if it was reported).
func (a *App) tokens(c *ui.Context, dv *protocol.DeviceView, r rig) {
	t := a.T
	n := len(dv.Harnesses)
	if n == 0 {
		return
	}
	k := r.k
	for i, h := range dv.Harnesses {
		status := a.L.T("token.signed_in")
		switch {
		case !h.Installed:
			status = a.L.T("token.missing")
		case !h.LoggedIn:
			status = a.L.T("token.signed_out")
		case h.Allowance != nil:
			status += " · " + a.L.T("token.allowance", int(h.Allowance.Left*100+0.5))
		}
		art := "token_ink"
		if h.Harness == "claude-code" {
			art = "token_orange"
		}
		w := 250 * k
		x := tokenCenter(r.sw, n, i, k) - w/2
		tok := ui.Row(c.Key("tok:"+h.Harness)).Absolute().Left(x).Top(r.tokensTop).Width(w).Height(66).Gap(10).
			Padding(6, 14, 6, 6).Radius(24).Background(t.Surface).Shadow(0, 4, 0, 0, t.Line).AlignItems(ui.Center).
			Role(ui.RoleGroup).Label(harnessName(h.Harness) + " · " + status)
		if !h.LoggedIn || dv.State != protocol.DeviceAwake {
			tok.Opacity(0.6)
		}
		tok.Children(func() {
			if bmp := theme.Clay(art); bmp != nil {
				ui.Image(c, bmp).Size(52, 52).Shrink(0).AccessHidden(true)
			}
			ui.Column(c).Gap(2).MinWidth(0).Children(func() {
				ui.Text(c, harnessName(h.Harness)).FontSize(14).FontWeight(800).SingleLine()
				ui.Text(c, status).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
			})
		})
	}
}

// stageLine is the one line at the top of the stage: what just changed,
// or why the device is quiet.
func (a *App) stageLine(c *ui.Context, dv *protocol.DeviceView, sw float32) {
	t := a.T
	d := a.devState()
	var text string
	var sc theme.StateColors
	check := false
	switch {
	case dv.State == protocol.DeviceAsleep:
		text, sc = a.L.T("device.asleep.line", a.deviceName(dv)), t.Asleep
	case dv.State == protocol.DeviceUnreachable:
		if ago := a.agoLong(dv.LastSeen); ago != "" {
			text = a.L.T("device.unreachable.line", a.deviceNameIn(dv), ago)
		} else {
			text = a.L.T("device.unreachable.line.never", a.deviceNameIn(dv))
		}
		sc = t.Away
	case d.line != "" && a.Now().Sub(d.lineAt) < 8*time.Second:
		text, sc, check = d.line, t.Awake, true
		c.After(8*time.Second - a.Now().Sub(d.lineAt))
	default:
		return
	}
	line := ui.Row(c.Key("line:" + text)).Absolute().Top(18).Left(16).Width(sw - 32).Justify(ui.Center)
	line.Children(func() {
		pill := ui.Row(c.Key("pill")).Gap(10).Padding(10, 16).Radius(18).Background(t.Surface).Shadow(0, 5, 0, 0, t.Line).
			AlignItems(ui.Center).Role(ui.RoleStatus).Label(text).MaxWidthPercent(100)
		a.enter(c, pill)
		pill.Children(func() {
			if check {
				ui.Box(c).Size(26, 26).Radius(9).Background(sc.Surface).Draw(drawCheck(sc.Dot)).Shrink(0)
			} else {
				ui.Box(c).Size(10, 10).Radius(5).Background(sc.Dot).Shrink(0)
			}
			ui.Text(c, text).FontSize(16).FontWeight(800).TextColor(t.Ink).MaxLines(2)
		})
	})
}

// ---------- the ability grid and detail ----------

func (a *App) abilityGrid(c *ui.Context, dv *protocol.DeviceView, cols int) {
	t := a.T
	d := a.devState()
	ui.Text(c, a.L.T("devices.grid")).FontSize(t.XS).FontWeight(800).LetterSpacing(1.2).TextColor(t.InkMuted)
	hovered := ""
	ui.Grid(c).Columns(cols).Gap(10).Children(func() {
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
			if id == protocol.AbilityRemote && dv != nil && a.abilityOn(dv, id) && a.S.Reach != nil && len(a.S.Reach.Clients) > 0 {
				sub = a.L.T("pair.connected") + " · " + a.S.Reach.Clients[len(a.S.Reach.Clients)-1].Name
			}
			label := name
			if sub != "" {
				label += " · " + sub
			} else if addable {
				label += " · " + a.L.T("ability.add", a.deviceNameIn(dv))
			}
			tile := ui.Column(c.Key("ab:"+id)).Radius(22).Background(t.Surface).Padding(8, 8, 10, 8).Gap(2).AlignItems(ui.Center).
				Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(label).Focusable().AccessSelected(d.ability == id)
			if d.ability == id {
				tile.Border(3, t.Ink).Shadow(0, 5, 0, 0, t.Ink)
			} else {
				a.press(c, tile, t.PressCard)
			}
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
				well := ui.Box(c.Key("well")).WidthPercent(100).Height(84).Radius(16).Background(t.Clay).Padding(8)
				well.Children(func() {
					if bmp := theme.Clay(abilityArt(id)); bmp != nil {
						im := ui.Image(c, bmp).Grow(1).AccessHidden(true)
						if flying {
							im.Opacity(0)
						}
					}
				})
				d.tiles[id] = well.Bounds()
				ui.Text(c, name).FontSize(14).FontWeight(800).TextAlign(ui.Center).Margin(4, 0, 0, 0)
				if sub != "" {
					ui.Text(c, sub).FontSize(11.5).TextColor(t.InkMuted).TextAlign(ui.Center).MaxLines(2)
				}
			})
			if tile.Clicked() {
				d.ability, d.removing = id, ""
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
	card := ui.Column(c.Key("detail:"+id)).Radius(24).Background(t.Surface).Shadow(0, 4, 0, 0, t.Line).Padding(16).Gap(10).
		Role(ui.RoleGroup).Label(name)
	card.Children(func() {
		ui.Text(c, name).FontSize(19).FontWeight(800)
		on := a.shownOn(dv, id)
		if !(on && d.removing == id) {
			ui.Text(c, a.L.T("ability."+id+".about")).FontSize(14).LineHeight(1.6).TextColor(t.InkSoft)
		}
		switch {
		case ab == nil && !dv.Home && id != protocol.AbilityRemote:
			a.reasonLine(c, a.L.T("ability.later"))
		case ab == nil || ab.State == protocol.AbilityLater:
			a.reasonLine(c, a.L.T("ability.later"))
		case ab.State == protocol.AbilityUnavailable:
			a.unavailable(c, ab)
		case on && id == protocol.AbilityRemote:
			a.reachList(c)
			if a.button(c, a.L.T("pair.again"), btnSecondary, 44, t.Bg) {
				a.openPair()
			}
		case on && d.removing == id:
			ui.Text(c, a.L.T("ability.remove."+id, a.deviceNameIn(dv))).FontSize(14).LineHeight(1.55).TextColor(t.Ink)
			ui.Row(c).Gap(10).Children(func() {
				if a.buttonFor(c, a.L.T("ability.remove"), name, btnPrimary, 44, t.Surface) {
					a.removeAbility(dv, id)
				}
				if a.button(c, a.L.T("ability.remove.keep"), btnSecondary, 44, t.Bg) {
					d.removing = ""
				}
			})
		case on:
			ui.Row(c).Gap(8).AlignItems(ui.Center).Children(func() {
				ui.Box(c).Size(22, 22).Radius(8).Background(t.Awake.Surface).Draw(drawCheck(t.Awake.Dot)).Shrink(0)
				ui.Text(c, a.L.T("ability.on.at", a.deviceNameIn(dv))).FontSize(t.SM).FontWeight(700).Grow(1).MinWidth(0)
				if dv.State == protocol.DeviceAwake && a.buttonFor(c, a.L.T("ability.remove"), name, btnText, 36, t.Surface) {
					d.removing = id
				}
			})
		case dv.State != protocol.DeviceAwake:
			a.reasonLine(c, a.L.T("ability.reason.asleep"))
		case id == protocol.AbilityRemote && d.pair.open:
			ui.Row(c).Gap(10).AlignItems(ui.Center).Children(func() {
				a.retryPulse(c)
				ui.Text(c, a.L.T("pair.waiting")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
			})
		default:
			if r, ok := d.refused[dv.ID+"/"+id]; ok {
				a.reasonLine(c, a.reasonText(r.Reason))
			}
			if a.buttonFor(c, a.L.T("ability.add", a.deviceNameIn(dv)), name, btnPrimary, 50, t.Surface) {
				a.startEquip(dv, id, d.tiles[id], false)
			}
			ui.Text(c, a.L.T("devices.empty.hint", a.deviceNameIn(dv))).FontSize(t.XS).TextColor(t.InkMuted).TextAlign(ui.Center)
		}
	})
}

func (a *App) reasonLine(c *ui.Context, text string) {
	t := a.T
	ui.Row(c).Gap(8).Padding(10, 12).Radius(14).Background(t.SurfaceSunken).AlignItems(ui.Center).Children(func() {
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
		if a.button(c, a.L.T("ability.fix.install"), btnSecondary, 40, t.Bg) {
			a.openLink("https://github.com/trycua/cua")
		}
	}
}

// openLink opens a URL in the browser (through the Backend when the app
// runs Ducter, else nothing in tests).
func (a *App) openLink(u string) {
	if a.Backend != nil {
		_ = a.Backend.OpenURL(u)
	}
}

// reachList: the devices that can reach Ducter from elsewhere.
func (a *App) reachList(c *ui.Context) {
	t := a.T
	if a.S.Reach == nil {
		return
	}
	ui.Column(c).Gap(6).Children(func() {
		for _, cl := range a.S.Reach.Clients {
			line := a.L.T("reach.client.online", cl.Name)
			if !cl.Connected {
				line = cl.Name
				if ago := a.agoLong(cl.LastSeen); ago != "" {
					line = a.L.T("reach.client.seen", cl.Name, ago)
				}
			}
			ui.Row(c.Key("cl:" + cl.ID)).Gap(8).AlignItems(ui.Center).Children(func() {
				sc := t.Away
				if cl.Connected {
					sc = t.Awake
				}
				ui.Box(c).Size(8, 8).Radius(4).Background(sc.Dot).Shrink(0)
				ui.Text(c, line).FontSize(t.SM).FontWeight(700).SingleLine()
			})
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
		d.pair.open = false
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

// ---------- 远程打开: the pairing code ----------

func (a *App) openPair() {
	d := a.devState()
	d.pair.open, d.pair.asked = true, a.Now()
	d.pair.clients = 0
	if a.S.Reach != nil {
		d.pair.clients = len(a.S.Reach.Clients)
	}
	a.S.PairCode = nil
	a.send(protocol.PairCodeReq{T: "pair_code"})
}

func (a *App) pairSheet(c *ui.Context, dv *protocol.DeviceView, sw, sh float32) {
	t := a.T
	d := a.devState()
	pc := a.S.PairCode
	w := min(sw-48, 420)
	sheet := ui.Column(c.Key("pair")).Absolute().Left((sw-w)/2).Top(40).Width(w).MaxHeight(sh-80).
		Padding(20, 22).Gap(12).Radius(26).Background(t.Surface).Shadow(0, 6, 0, 0, t.Line).ZIndex(10).
		Role(ui.RoleDialog).Label(a.L.T("pair.title"))
	a.enter(c, sheet)
	sheet.Children(func() {
		ui.Row(c).Gap(10).AlignItems(ui.Center).Children(func() {
			ui.Text(c, a.L.T("pair.title")).FontSize(t.LG).FontWeight(800).Grow(1).MinWidth(0)
			if a.button(c, a.L.T("pair.close"), btnText, 36, t.Surface) {
				d.pair.open = false
			}
		})
		if pc == nil {
			ui.Text(c, a.L.T("devices.loading")).FontSize(t.SM).TextColor(t.InkMuted)
			return
		}
		exp := store.ParseTime(pc.ExpiresAt)
		left := exp.Sub(a.Now())
		if !exp.IsZero() && left <= 0 {
			a.reasonLine(c, a.L.T("pair.expired"))
			if a.button(c, a.L.T("pair.again"), btnPrimary, 44, t.Surface) {
				a.openPair()
			}
			return
		}
		if left > 0 {
			c.After(min(left, time.Minute))
		}
		ui.Row(c).Gap(16).AlignItems(ui.Center).Children(func() {
			if len(pc.QR) > 0 {
				qrBox(c, pc.QR, 132, t.Ink, t.Surface)
			}
			ui.Column(c).Gap(6).Grow(1).MinWidth(0).Children(func() {
				ui.Text(c, a.L.T("pair.code")).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted)
				ui.Text(c, pc.Code).Font(t.Mono).FontSize(28).FontWeight(800).LetterSpacing(1).Selectable()
				mins := int(math.Ceil(left.Minutes()))
				ui.Text(c, a.L.T("pair.once", mins)).FontSize(t.XS).TextColor(t.InkMuted)
				if pc.Address != "" {
					ui.Text(c, a.L.T("pair.address")).FontSize(t.XS).FontWeight(800).TextColor(t.InkMuted).Margin(6, 0, 0, 0)
					ui.Text(c, pc.Address).Font(t.Mono).FontSize(t.SM).Selectable().MaxLines(2)
				}
			})
		})
		if pc.Address != "" {
			ui.Text(c, a.L.T("pair.scan")).FontSize(t.SM).LineHeight(1.55).TextColor(t.InkSoft)
		} else {
			a.reasonLine(c, a.L.T("pair.noaddress"))
		}
		ui.Row(c).Gap(10).AlignItems(ui.Center).Children(func() {
			a.retryPulse(c)
			ui.Text(c, a.L.T("pair.waiting")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		})
	})
}

// qrBox draws a QR code from rows of "1" and "0", with its quiet zone.
func qrBox(c *ui.Context, rows []string, size float32, ink, paper ui.Color) {
	n := len(rows)
	ui.Box(c).Size(size, size).Radius(12).Background(paper).Border(1.5, ink.Alpha(0.12)).Shrink(0).Role(ui.RoleImage).Label("QR").
		Draw(func(p *ui.Painter, r ui.Rect) {
			cell := (r.W - 16) / float32(n)
			ox, oy := r.X+8, r.Y+8
			for y, row := range rows {
				for x := 0; x < len(row); x++ {
					if row[x] == '1' {
						p.Fill(ui.Rect{X: ox + float32(x)*cell, Y: oy + float32(y)*cell, W: cell + 0.3, H: cell + 0.3}, ink, 0)
					}
				}
			}
		})
}
