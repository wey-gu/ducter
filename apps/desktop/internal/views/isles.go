package views

import (
	"math"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// The Isles stage (D81, research/33): every device on stage as a clay
// island on a calm clay sea. The Mac where Ducter lives is the big
// island in the middle with Ducter on it; the others stand round it, far
// ones smaller and higher. Bridges leave home only (every device connects
// only to the main). Parcels cross a bridge only while a task really runs
// on that device. Asleep is calm; can't reach is the island in a soft
// mist with one line of words, never a slack or broken bridge. AI
// accounts stand on the island they're signed in on; tapping one lifts
// every island it's signed in on. A device joins in the scene: a jetty
// grows from home with the code on a sign (pairing.go), then the new
// island rises and the device drops onto it.

// The scene is laid out in a 760 × 560 design space and scaled to fit.
const sceneW, sceneH = 760, 560

// isleSlots are the islands round home, in the order they fill: back
// right, back left, front right, front left, far left, far right. cx is
// the island's middle, top its top edge, w its width (far ones smaller).
var isleSlots = [6]struct{ cx, top, w float32 }{
	{640, 176, 170}, {120, 186, 170}, {700, 440, 170}, {60, 440, 170}, {262, 40, 140}, {490, 36, 140},
}

// The home island.
var homeIsle = struct{ cx, top, w float32 }{380, 300, 340}

// dockSize is an ability's clay token in front of its island (design
// points; about 110 to 150 on screen), and the gap between two.
const dockSize, dockGap = 150, 26

// isle is one island: a device (dv) or a client that reaches Ducter (cl).
type isle struct {
	key  string
	dv   *protocol.DeviceView
	cl   *protocol.ReachClient
	home bool
	slot int // -1 home; 0… round it
	// In design space: the island's box, where the device stands, the
	// device's box.
	is   ui.Rect
	seat float32
	dev  ui.Rect
	art  string // the device's clay
	// ducter is where Ducter sits, beside the device on the home island.
	ducter ui.Rect
	// dock are the abilities shown at full size in front of the island
	// (on, or a place to fill), in dockR.
	dock  []string
	dockR ui.Rect
}

// islandArt is the island's clay and where a device's foot sits on it,
// as a fraction of its height.
func islandArt(home bool) (string, float32, float32) {
	if home {
		return "island_big", 614.0 / 1280, 0.5
	}
	return "island_small", 754.0 / 1280, 0.47
}

// deviceSize is a device's clay width as a share of its island's, and the
// art's aspect (height / width).
func deviceSize(art string, home bool) (float32, float32) {
	switch art {
	case "laptop_awake":
		if home {
			return 0.54, 491.0 / 640
		}
		return 0.7, 491.0 / 640
	case "laptop_asleep":
		if home {
			return 0.56, 419.0 / 640
		}
		return 0.7, 419.0 / 640
	case "mini_awake":
		if home {
			return 0.42, 638.0 / 574
		}
		return 0.56, 638.0 / 574
	case "mini_asleep":
		if home {
			return 0.52, 443.0 / 640
		}
		return 0.7, 443.0 / 640
	case "server_awake":
		return 0.7, 511.0 / 640
	case "server_asleep":
		return 0.64, 436.0 / 562
	case "device_unreachable":
		return 0.66, 546.0 / 640
	case "phone":
		return 0.3, 640.0 / 416
	}
	return 0.7, 0.77
}

// clientArt is a client's clay: a phone, or a computer for an app window.
func clientArt(cl *protocol.ReachClient) string {
	p := strings.ToLower(cl.Platform)
	if p == "" || strings.Contains(p, "ios") || strings.Contains(p, "iphone") || strings.Contains(p, "android") || strings.Contains(p, "web") {
		return "phone"
	}
	if cl.Connected {
		return "laptop_awake"
	}
	return "laptop_asleep"
}

// isles lays the scene out: home first, then the others round it
// (devices that run tasks, then the phones and windows that reach
// Ducter), at most six.
func (a *App) isles() []isle {
	var out []isle
	var others []isle
	for i := range a.S.Devices {
		dv := &a.S.Devices[i]
		if dv.Home && len(out) == 0 {
			out = append(out, isle{key: "dev:" + dv.ID, dv: dv, home: true, slot: -1, art: deviceArt(dv)})
			continue
		}
		others = append(others, isle{key: "dev:" + dv.ID, dv: dv, art: deviceArt(dv)})
	}
	if a.S.Reach != nil {
		for i := range a.S.Reach.Clients {
			cl := &a.S.Reach.Clients[i]
			others = append(others, isle{key: "cl:" + cl.ID, cl: cl, art: clientArt(cl)})
		}
	}
	if len(out) == 0 && len(others) > 0 { // no home reported: the first stands in the middle
		others[0].home, others[0].slot = true, -1
		out, others = append(out, others[0]), others[1:]
	}
	// An island keeps its spot while it is there: one that joins takes the
	// first free spot (where the jetty pointed), and nothing else moves.
	d := a.devState()
	if d.slotOf == nil {
		d.slotOf = map[string]int{}
	}
	here := map[string]bool{}
	var taken [len(isleSlots)]bool
	for _, o := range others {
		here[o.key] = true
	}
	for k := range d.slotOf {
		if !here[k] {
			delete(d.slotOf, k)
		}
	}
	for i := range others {
		if sl, ok := d.slotOf[others[i].key]; ok && !taken[sl] {
			others[i].slot, taken[sl] = sl, true
		} else {
			others[i].slot = -1
		}
	}
	for i := range others {
		if others[i].slot >= 0 {
			continue
		}
		for sl := range taken {
			if !taken[sl] {
				others[i].slot, taken[sl] = sl, true
				d.slotOf[others[i].key] = sl
				break
			}
		}
	}
	for _, o := range others {
		if o.slot >= 0 {
			out = append(out, o)
		}
	}
	// The front islands' words reach down to about here: the dock goes
	// below them so nothing stands on it.
	front := float32(0)
	for i := range out {
		placeIsle(&out[i])
		if sl := out[i].slot; sl == 2 || sl == 3 {
			front = max(front, out[i].is.Y+out[i].is.H+64)
		}
	}
	for i := range out {
		if out[i].home && out[i].dv != nil {
			out[i].dock = a.dockAbilities(out[i].dv)
			placeDock(&out[i])
			if out[i].dockR.W > 0 && out[i].dockR.Y < front {
				out[i].dockR.Y = front
			}
		}
	}
	return out
}

// placeIsle puts an island and its device in design space.
func placeIsle(s *isle) {
	cx, top, w := homeIsle.cx, homeIsle.top, homeIsle.w
	if !s.home {
		sl := isleSlots[s.slot]
		cx, top, w = sl.cx, sl.top, sl.w
		if s.cl != nil {
			w *= 0.82 // a phone stands on an islet
		}
	}
	_, aspect, seat := islandArt(s.home)
	h := w * aspect
	s.is = ui.Rect{X: cx - w/2, Y: top, W: w, H: h}
	s.seat = top + seat*h
	share, da := deviceSize(s.art, s.home)
	if s.cl != nil && s.art == "phone" {
		share = 0.34
	}
	dw := w * share
	dh := dw * da
	dcx := cx
	if s.home {
		dcx = cx + 0.11*w // the device a little right; Ducter sits on its left
		const size = 128
		feetX, feetY := cx-0.27*w, s.seat+0.12*h
		s.ducter = ui.Rect{X: feetX - size/2, Y: feetY - 0.8*size, W: size, H: size}
	}
	s.dev = ui.Rect{X: dcx - dw/2, Y: s.seat - dh, W: dw, H: dh}
}

// placeDock lays an island's dock out: a row of ability tokens on the
// water in front of it, under its name.
func placeDock(s *isle) {
	n := float32(len(s.dock))
	if n == 0 {
		s.dockR = ui.Rect{}
		return
	}
	w := n*dockSize + (n-1)*dockGap
	s.dockR = ui.Rect{X: s.is.X + s.is.W/2 - w/2, Y: s.is.Y + s.is.H + 44, W: w, H: dockSize + 30}
}

// dockAbilities are the abilities a device shows at full size: those that
// are on and those that can be added (or need a fix first). The ones that
// come later stay in the list beside the stage.
func (a *App) dockAbilities(dv *protocol.DeviceView) []string {
	var out []string
	for _, ab := range dv.Abilities {
		if ab.State == protocol.AbilityLater || (ab.State == protocol.AbilityUnavailable && ab.Reason == "home_only") {
			continue
		}
		out = append(out, ab.ID)
		if len(out) == 4 {
			break
		}
	}
	return out
}

// newIsle is the empty spot a joining device will rise in (the first
// free one), or nil when every spot is taken.
func newIsle(all []isle) *isle {
	var taken [len(isleSlots)]bool
	for _, s := range all {
		if s.slot >= 0 {
			taken[s.slot] = true
		}
	}
	for sl := range taken {
		if !taken[sl] {
			s := isle{key: "new", slot: sl, art: "server_awake"}
			placeIsle(&s)
			return &s
		}
	}
	return nil
}

// view maps design space onto the stage: scale k, then offset.
type view struct{ k, ox, oy float32 }

func (v view) x(x float32) float32 { return v.ox + x*v.k }
func (v view) y(y float32) float32 { return v.oy + y*v.k }
func (v view) r(r ui.Rect) ui.Rect {
	return ui.Rect{X: v.x(r.X), Y: v.y(r.Y), W: r.W * v.k, H: r.H * v.k}
}

// sceneView fits what is on stage (the islands, what stands on them, the
// words under them, and the spot a device is joining at) into the stage:
// one device is shown large, six fill it. Never larger than 1.35.
func sceneView(area ui.Rect, all []isle, spot *isle) view {
	sw, sh := area.W, area.H
	bx0, by0, bx1, by1 := float32(1e9), float32(1e9), float32(-1e9), float32(-1e9)
	add := func(s *isle) {
		top := s.dev.Y
		if s.home {
			top = min(top, s.ducter.Y)
		}
		bx0, bx1 = min(bx0, s.is.X-0.1*s.is.W), max(bx1, s.is.X+1.1*s.is.W)
		by0, by1 = min(by0, top), max(by1, s.is.Y+s.is.H+44)
		if s.dockR.W > 0 {
			bx0, bx1 = min(bx0, s.dockR.X), max(bx1, s.dockR.X+s.dockR.W)
			by1 = max(by1, s.dockR.Y+s.dockR.H)
		}
	}
	for i := range all {
		add(&all[i])
	}
	if spot != nil {
		add(spot)
	}
	if bx1 < bx0 {
		bx0, by0, bx1, by1 = 0, 0, sceneW, sceneH
	}
	const pad = 28
	bx0, by0, bx1, by1 = bx0-pad, by0-pad, bx1+pad, by1+pad
	bw, bh := bx1-bx0, by1-by0
	k := min(sw/bw, sh/bh, 1.35)
	return view{k: k, ox: area.X + (sw-bw*k)/2 - bx0*k, oy: area.Y + (sh-bh*k)/2 - by0*k}
}

// easeView moves the scene's framing to v over 420 ms (a device joining
// or the code going out changes what has to fit), at once when still.
func (a *App) easeView(v view, now time.Time, still bool) view {
	d := a.devState()
	if d.viewAt.IsZero() || still {
		d.viewFrom, d.viewTo, d.viewAt = v, v, now
		return v
	}
	if abs32(v.k-d.viewTo.k) > 0.002 || abs32(v.ox-d.viewTo.ox) > 0.5 || abs32(v.oy-d.viewTo.oy) > 0.5 {
		d.viewFrom, d.viewTo, d.viewAt = a.viewNow(now), v, now
	}
	return a.viewNow(now)
}

func (a *App) viewNow(now time.Time) view {
	d := a.devState()
	q := min(float32(now.Sub(d.viewAt))/float32(420*time.Millisecond), 1)
	f := ui.EaseInOut(q)
	l := func(x, y float32) float32 { return x + (y-x)*f }
	return view{k: l(d.viewFrom.k, d.viewTo.k), ox: l(d.viewFrom.ox, d.viewTo.ox), oy: l(d.viewFrom.oy, d.viewTo.oy)}
}

func abs32(x float32) float32 {
	if x < 0 {
		return -x
	}
	return x
}

// runningOn is how many tasks are working on a device now.
func (a *App) runningOn(dv *protocol.DeviceView) int {
	if dv == nil || a.S.OnHand == nil {
		return 0
	}
	n := 0
	for _, tc := range a.S.OnHand.Tasks {
		if tc.Attention != protocol.Working {
			continue
		}
		if d := tc.Place.Device; d != "" && (d == dv.ID || d == dv.Name) {
			n++
		}
	}
	return n
}

// taskWorking: a task is working somewhere.
func (a *App) taskWorking() bool {
	if a.S.OnHand == nil {
		return false
	}
	for _, tc := range a.S.OnHand.Tasks {
		if tc.Attention == protocol.Working {
			return true
		}
	}
	return false
}

// signedIn is where an AI account is signed in: the devices, in order.
func (a *App) signedIn(harness string) []*protocol.DeviceView {
	var out []*protocol.DeviceView
	for i := range a.S.Devices {
		for _, h := range a.S.Devices[i].Harnesses {
			if h.Harness == harness && h.Installed && h.LoggedIn {
				out = append(out, &a.S.Devices[i])
			}
		}
	}
	return out
}

// isleName and isleLine are the words under an island: its name, and one
// line only for what is unusual (D69): asleep, can't reach, a task
// running there, a phone not seen lately. What each device is for is
// said in its card.
func (a *App) isleName(s *isle) string {
	if s.dv != nil {
		return a.deviceName(s.dv)
	}
	return s.cl.Name
}

func (a *App) isleLine(s *isle) (string, ui.Color) {
	t := a.T
	if s.cl != nil {
		if !s.cl.Connected {
			if ago := a.agoLong(s.cl.LastSeen); ago != "" {
				return a.L.T("device.last_seen", ago), t.InkSoft
			}
		}
		return "", t.InkSoft
	}
	switch s.dv.State {
	case protocol.DeviceAsleep:
		text, _ := a.deviceChip(s.dv)
		return text, t.Asleep.Ink
	case protocol.DeviceUnreachable:
		text, _ := a.deviceChip(s.dv)
		return text, t.Away.Ink
	}
	switch n := a.runningOn(s.dv); {
	case s.home || n == 0:
		return "", t.InkSoft
	case n == 1:
		return a.L.T("isles.working.one"), t.InkSoft
	default:
		return a.L.T("isles.working", n), t.InkSoft
	}
}

// clientLine says what a phone (or a window elsewhere) is for.
func (a *App) clientLine(cl *protocol.ReachClient) string {
	if !cl.Connected {
		if ago := a.agoLong(cl.LastSeen); ago != "" {
			return a.L.T("device.client.seen", a.S.PersonaName, ago)
		}
	}
	return a.L.T("device.client.line", a.S.PersonaName)
}

// homePose is Ducter's face on its island.
func (a *App) homePose(home *protocol.DeviceView, now time.Time) theme.Presence {
	d := a.devState()
	switch {
	case home != nil && home.State == protocol.DeviceAsleep:
		return theme.Napping
	case !d.doneAt.IsZero() && now.Sub(d.doneAt) < a.T.Equip.DoneFace:
		return theme.Done
	case a.taskWorking():
		return theme.Working
	}
	return theme.Idle
}

// ---------- the stage ----------

func (a *App) stage(c *ui.Context, dv *protocol.DeviceView) {
	t := a.T
	d := a.devState()
	if dv == nil {
		return
	}
	now := a.Now()
	still := c.Preferences().ReduceMotion
	stage := ui.Box(c.Key("stage")).Grow(1).MinHeight(420).Radius(36).Background(t.Isles.Sea).Clip().
		Role(ui.RoleGroup).Label(a.L.T("isles.label"))
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
		sw, sh = 620, 560
	}
	all := a.isles()
	var home *isle
	for i := range all {
		if all[i].home {
			home = &all[i]
		}
	}
	// The spot a device is joining at, while the code is out.
	var spot *isle
	if d.pair.open {
		spot = newIsle(all)
		a.noticeJoin(all)
	}
	target := sceneView(ui.Rect{W: sw, H: sh}, all, spot)
	if spot != nil {
		target = a.makeRoomForSign(target, all, spot, sw, sh)
	}
	v := a.easeView(target, now, still)
	if d.viewTo != v {
		c.After(16 * time.Millisecond)
	}
	lift := a.liftOf(all, now, still, c)
	d.labels = map[string]ui.Rect{}

	stage.Draw(func(p *ui.Painter, r ui.Rect) {
		a.paintSea(p, r, v, skyTop(all), still)
		if home == nil {
			return
		}
		for i := range all {
			s := &all[i]
			if s.home {
				continue
			}
			rise := a.riseOf(s, now, still)
			if rise.island <= 0.02 {
				continue
			}
			a.paintBridge(p, r, v, home, s, lift[home.key], lift[s.key]+rise.dy, 1, now, still)
		}
		if spot != nil {
			grow := float32(1)
			if !still {
				grow = min(float32(now.Sub(d.pair.asked))/float32(520*time.Millisecond), 1)
				if grow < 1 {
					p.AnimationFrame()
				}
			}
			a.paintWaterRing(p, r, v, spot, grow)
			if at, foot := a.signAt(v, spot, sw, sh); foot.Y > 0 {
				// The sign's post, from the water down to the sign.
				x := r.X + foot.X - 4*v.k
				top, bot := r.Y+foot.Y, r.Y+at.Y+8
				p.Fill(ui.Rect{X: x + 3*v.k, Y: top + 4*v.k, W: 8 * v.k, H: bot - top}, ui.RGBA(30, 80, 86, 0.16), 4*v.k)
				p.Fill(ui.Rect{X: x, Y: top, W: 8 * v.k, H: (bot - top) * grow}, a.T.Isles.Plank, 4*v.k)
			}
			a.paintBridge(p, r, v, home, spot, lift[home.key], 0, 0.72*ui.EaseOut(grow), now, still)
		}
	})
	stage.Children(func() {
		// Back to front, so a near island stands over a far one.
		order := make([]int, len(all))
		for i := range order {
			order[i] = i
		}
		for i := 1; i < len(order); i++ {
			for j := i; j > 0 && all[order[j]].is.Y < all[order[j-1]].is.Y; j-- {
				order[j], order[j-1] = order[j-1], order[j]
			}
		}
		for _, i := range order {
			a.island(c, v, &all[i], dv, lift[all[i].key], now, still, sw)
		}
		if spot != nil {
			a.pairSign(c, v, spot, all, sw, sh)
		}
		a.stageLine(c, dv, sw)
		if d.account != "" {
			a.accountSheet(c, dv, sw, sh)
		} else if a.web.open && a.webSetupOwned(dv) {
			a.webSheet(c, dv, sw, sh)
		}
	})
	a.sparkles(c)
}

// liftOf is how far each island is lifted: every island the tapped AI
// account is signed in on rises a little (research/28).
func (a *App) liftOf(all []isle, now time.Time, still bool, c *ui.Context) map[string]float32 {
	d := a.devState()
	out := map[string]float32{}
	if d.lit == "" {
		return out
	}
	q := float32(1)
	if !still {
		q = min(float32(now.Sub(d.litAt))/float32(320*time.Millisecond), 1)
		if q < 1 {
			c.After(16 * time.Millisecond)
		}
		q = ui.CubicBezier(0.34, 1.56, 0.64, 1)(q)
	}
	for _, s := range all {
		if s.dv == nil {
			continue
		}
		for _, h := range s.dv.Harnesses {
			if h.Harness == d.lit && h.LoggedIn {
				out[s.key] = 10 * q
			}
		}
	}
	return out
}

// rise is how far along a joining island is: the island comes up out of
// the water, then the device drops onto it.
type rise struct {
	island, dy float32 // the island's opacity and how far below it still is (design)
	drop       float32 // the device: how far above it still is (design); 0 = landed
	landed     time.Time
}

const riseDur = 1100 * time.Millisecond

func (a *App) riseOf(s *isle, now time.Time, still bool) rise {
	d := a.devState()
	if still || d.pair.joined != s.key || d.pair.joinedAt.IsZero() {
		return rise{island: 1}
	}
	el := now.Sub(d.pair.joinedAt)
	if el >= riseDur+a.T.Equip.Squash {
		return rise{island: 1}
	}
	q := float32(el) / float32(riseDur)
	up := ui.EaseOut(min(q/0.5, 1))
	r := rise{island: up, dy: 34 * (1 - up)}
	fall := min(max((q-0.45)/0.4, 0), 1)
	r.drop = -90 * (1 - fall*fall)
	if fall >= 1 {
		r.drop = 0
		r.landed = d.pair.joinedAt.Add(time.Duration(0.85 * float64(riseDur)))
	}
	return r
}

// noticeJoin: a device that wasn't there when the code went out has
// joined. The code card goes; its island rises where the jetty pointed.
func (a *App) noticeJoin(all []isle) {
	d := a.devState()
	if d.pair.known == nil {
		return
	}
	// One that left while the code was out counts as new if it comes back.
	here := map[string]bool{}
	for _, s := range all {
		here[s.key] = true
	}
	for k := range d.pair.known {
		if !here[k] {
			delete(d.pair.known, k)
		}
	}
	for _, s := range all {
		if !d.pair.known[s.key] {
			a.joined(s.key)
			return
		}
	}
}

// joined starts a device's arrival: the code card closes, its island
// rises and the device drops on (equip motion).
func (a *App) joined(key string) {
	d := a.devState()
	d.pair.open, d.pair.known = false, nil
	d.pair.joined, d.pair.joinedAt = key, a.Now()
	if strings.HasPrefix(key, "dev:") {
		d.sel, d.selClient = strings.TrimPrefix(key, "dev:"), ""
	}
}

// ---------- painting the scene ----------

// paintSea is the place: a sky with soft clouds over a hazy horizon, a
// clay sea that deepens toward you with slow light on it, one light from
// the top left. The clouds and the light on the water drift slowly (the
// scene may breathe, D77); reduced motion holds them still.
func (a *App) paintSea(p *ui.Painter, r ui.Rect, v view, top float32, still bool) {
	is := a.T.Isles
	horizon := min(max(v.y(top)-10, r.H*0.12), r.H*0.26)
	h := r.H
	at := func(y float32) float32 { return min(max(y/h, 0), 1) }
	p.FillGradient(r, ui.LinearGradient{Angle: 180, Stops: []ui.GradientStop{
		{Color: is.SkyTop, At: 0},
		{Color: is.Sky, At: at(horizon * 0.7)},
		{Color: is.Haze, At: at(horizon - 2)},
		{Color: is.SeaFar, At: at(horizon + 6)},
		{Color: is.Sea, At: at(horizon + (h-horizon)*0.45)},
		{Color: is.SeaNear, At: 1},
	}}, 36)
	now := p.Now()
	drift := func(period time.Duration, phase float64) float32 {
		if still {
			return 0
		}
		return float32(math.Sin(2 * math.Pi * cycle(now, period, phase)))
	}
	// Soft clouds over the horizon, slowly drifting.
	for i, cl := range [][4]float32{{0.12, 0.45, 1.0, 0.1}, {0.42, 0.25, 0.75, 0.6}, {0.74, 0.5, 1.15, 0.35}, {0.93, 0.2, 0.7, 0.8}} {
		cw := r.W * 0.2 * cl[2]
		cx := r.X + r.W*cl[0] + drift(70*time.Second, float64(cl[3]))*16
		cy := r.Y + horizon*cl[1] + 6
		for j, b := range [][3]float32{{-0.32, 0.1, 0.45}, {-0.05, -0.12, 0.6}, {0.25, 0.02, 0.5}, {0, 0.18, 0.9}} {
			bw := cw * b[2]
			softEllipse(p, ui.Rect{X: cx + cw*b[0] - bw/2, Y: cy + cw*b[1]*0.4 - bw*0.22, W: bw, H: bw * 0.44}, is.Cloud.Alpha(0.85-0.08*float32((i+j)%3)))
		}
	}
	// Haze on the horizon.
	softEllipse(p, ui.Rect{X: r.X - r.W*0.1, Y: r.Y + horizon - 14, W: r.W * 1.2, H: 30}, is.Haze.Alpha(0.9))
	// The light from the top left on the water.
	softEllipse(p, ui.Rect{X: r.X, Y: r.Y + horizon, W: r.W * 0.62, H: r.H * 0.5}, is.Glint.Alpha(0.36))
	// Slow light on the water: long soft glints that drift and fade.
	for i := 0; i < 14; i++ {
		f := float32(i)
		gx := float32(math.Mod(float64(f*0.381+0.07), 1))
		gy := float32(math.Mod(float64(f*0.617+0.13), 1))
		y := r.Y + horizon + 18 + gy*(r.H-horizon-30)
		depth := (y - r.Y - horizon) / (r.H - horizon) // far small, near large
		w := (26 + 46*depth) * max(v.k, 0.7)
		x := r.X + gx*r.W + drift(19*time.Second, float64(f)*0.13)*10*(0.4+depth)
		alpha := 0.16 + 0.1*drift(11*time.Second, float64(f)*0.29)
		if still {
			alpha = 0.16
		}
		softEllipse(p, ui.Rect{X: x - w/2, Y: y - w*0.07, W: w, H: w * 0.14}, is.Glint.Alpha(alpha))
	}
	// Darker away from the light.
	p.FillRadialGradient(r, ui.RadialGradient{Center: ui.Point{X: 0.22, Y: 0.18}, Stops: []ui.GradientStop{
		{Color: is.SeaNear.Alpha(0), At: 0.55},
		{Color: ui.RGBA(30, 90, 96, 0.16), At: 1},
	}}, 36)
	if !still {
		p.AnimationFrameRate(12) // slow drift: a few frames a second is smooth
	}
}

// skyTop is where the farthest island stands: the horizon sits just
// above it.
func skyTop(all []isle) float32 {
	top := float32(sceneH)
	for _, s := range all {
		if !s.home {
			top = min(top, s.dev.Y)
		}
	}
	if top == sceneH {
		return 150
	}
	return top
}

// softEllipse fills an ellipse that fades out from its middle.
func softEllipse(p *ui.Painter, r ui.Rect, col ui.Color) {
	if r.W <= 0 || r.H <= 0 {
		return
	}
	cx, cy := r.X+r.W/2, r.Y+r.H/2
	rad := r.W / 2
	p.Transform(ui.Scaling(1, r.H/r.W), cx, cy, func() {
		p.FillRadialGradient(ui.Rect{X: cx - rad, Y: cy - rad, W: 2 * rad, H: 2 * rad}, ui.RadialGradient{Radius: rad, Stops: []ui.GradientStop{
			{Color: col, At: 0},
			{Color: col.Alpha(0.6), At: 0.55},
			{Color: col.Alpha(0), At: 1},
		}}, rad)
	})
}

// rimPoint is where a bridge meets an island: on its rim, facing the
// other end.
func rimPoint(s *isle, toward ui.Point, dy float32) ui.Point {
	cx, cy := s.is.X+s.is.W/2, s.is.Y+s.is.H*0.42+dy
	rx, ry := s.is.W*0.4, s.is.H*0.3
	ang := math.Atan2(float64((toward.Y-cy)/ry), float64((toward.X-cx)/rx))
	return ui.Point{X: cx + float32(math.Cos(ang))*rx, Y: cy + float32(math.Sin(ang))*ry}
}

// curve is a bridge's cubic, sampled by length.
type curve struct {
	pts  [33]ui.Point
	lens [33]float32
}

func newCurve(p0, p1, p2, p3 ui.Point) *curve {
	c := &curve{}
	for i := range c.pts {
		s := float32(i) / float32(len(c.pts)-1)
		u := 1 - s
		c.pts[i] = ui.Point{
			X: u*u*u*p0.X + 3*u*u*s*p1.X + 3*u*s*s*p2.X + s*s*s*p3.X,
			Y: u*u*u*p0.Y + 3*u*u*s*p1.Y + 3*u*s*s*p2.Y + s*s*s*p3.Y,
		}
		if i > 0 {
			c.lens[i] = c.lens[i-1] + float32(math.Hypot(float64(c.pts[i].X-c.pts[i-1].X), float64(c.pts[i].Y-c.pts[i-1].Y)))
		}
	}
	return c
}

func (c *curve) length() float32 { return c.lens[len(c.lens)-1] }

// at is the point at distance l along the curve and its unit tangent.
func (c *curve) at(l float32) (ui.Point, ui.Point) {
	for i := 1; i < len(c.pts); i++ {
		if l <= c.lens[i] || i == len(c.pts)-1 {
			seg := c.lens[i] - c.lens[i-1]
			f := float32(0)
			if seg > 0 {
				f = (l - c.lens[i-1]) / seg
			}
			a, b := c.pts[i-1], c.pts[i]
			dx, dy := b.X-a.X, b.Y-a.Y
			n := float32(math.Hypot(float64(dx), float64(dy)))
			if n == 0 {
				n = 1
			}
			return ui.Point{X: a.X + dx*f, Y: a.Y + dy*f}, ui.Point{X: dx / n, Y: dy / n}
		}
	}
	return c.pts[0], ui.Point{X: 1}
}

// paintBridge is a plank-and-rope bridge from home to an island (part of
// one: a jetty), in stage coordinates. Parcels cross it while a task
// runs there; can't reach turns it pale; asleep relaxes it a little.
func (a *App) paintBridge(p *ui.Painter, r ui.Rect, v view, home, s *isle, liftHome, liftS, part float32, now time.Time, still bool) {
	is := a.T.Isles
	k := v.k
	hc := ui.Point{X: s.is.X + s.is.W/2, Y: s.is.Y + s.is.H*0.42}
	a0 := rimPoint(home, hc, -liftHome)
	b0 := rimPoint(s, ui.Point{X: home.is.X + home.is.W/2, Y: home.is.Y + home.is.H*0.42}, -liftS)
	pt := func(q ui.Point) ui.Point { return ui.Point{X: r.X + v.x(q.X), Y: r.Y + v.y(q.Y)} }
	A, B := pt(a0), pt(b0)
	if part < 1 {
		B = ui.Point{X: A.X + (B.X-A.X)*part, Y: A.Y + (B.Y-A.Y)*part}
	}
	pale, relaxed := false, false
	if s.dv != nil {
		pale = s.dv.State == protocol.DeviceUnreachable
		relaxed = s.dv.State == protocol.DeviceAsleep
	} else if s.cl != nil {
		pale = !s.cl.Connected
	}
	if home.dv != nil && home.dv.State == protocol.DeviceAsleep {
		relaxed = true
	}
	dx, dy := B.X-A.X, B.Y-A.Y
	ln := float32(math.Hypot(float64(dx), float64(dy)))
	if ln < 4 {
		return
	}
	nx, ny := -dy/ln, dx/ln
	bow, sag := 6*k, 6*k
	if relaxed {
		bow, sag = 12*k, 12*k
	}
	if part < 1 {
		bow, sag = 0, 3*k
	}
	cv := newCurve(A,
		ui.Point{X: A.X + dx*0.3 + nx*bow, Y: A.Y + dy*0.3 + ny*bow + sag},
		ui.Point{X: A.X + dx*0.7 + nx*bow*0.6, Y: A.Y + dy*0.7 + ny*bow*0.6 + sag},
		B)
	L := cv.length()
	bw := max(17*k, 11) // the bridge's width across
	// Its shadow on the water, down and to the right of the light.
	var sh ui.Path
	for i, q := range cv.pts {
		if i == 0 {
			sh.MoveTo(q.X+4*k, q.Y+10*k)
		} else {
			sh.LineTo(q.X+4*k, q.Y+10*k)
		}
	}
	shAlpha := float32(0.16)
	if pale {
		shAlpha = 0.06
	}
	p.StrokePath(&sh, bw+4*k, ui.RGBA(30, 80, 86, shAlpha))
	// Planks, each a short clay slab across the bridge, a darker edge below.
	plank, edge, rope := is.Plank, is.PlankDark, is.Rope.Alpha(0.85)
	if pale {
		plank, edge, rope = is.PlankPale, is.PlankPale, is.Rope.Alpha(0.22)
	}
	step := max(8*k, 5.5)
	thick := step * 0.7
	for l := step / 2; l < L-step/4; l += step {
		c0, tg := cv.at(l)
		n := ui.Point{X: -tg.Y, Y: tg.X}
		slab := func(off float32, col ui.Color) {
			var m ui.Path
			hx, hy := tg.X*thick/2, tg.Y*thick/2
			wx, wy := n.X*bw/2, n.Y*bw/2
			m.MoveTo(c0.X-hx-wx, c0.Y-hy-wy+off)
			m.LineTo(c0.X+hx-wx, c0.Y+hy-wy+off)
			m.LineTo(c0.X+hx+wx, c0.Y+hy+wy+off)
			m.LineTo(c0.X-hx+wx, c0.Y-hy+wy+off)
			m.Close()
			p.FillPath(&m, col)
		}
		slab(2*k, edge.Alpha(0.8))
		slab(0, plank)
	}
	// Two ropes, one each side.
	for _, side := range []float32{-0.55, 0.55} {
		var m ui.Path
		for i := 0; i <= 24; i++ {
			q, tg := cv.at(L * float32(i) / 24)
			x, y := q.X-tg.Y*bw*side, q.Y+tg.X*bw*side-3*k
			if i == 0 {
				m.MoveTo(x, y)
			} else {
				m.LineTo(x, y)
			}
		}
		p.StrokePath(&m, max(2.2*k, 1.5), rope)
	}
	if part < 1 || s.dv == nil || pale {
		return
	}
	// Parcels: only while a task really runs there, at a steady pace.
	if a.runningOn(s.dv) == 0 || (home.dv != nil && home.dv.State != protocol.DeviceAwake) {
		return
	}
	speed := is.ParcelSpeed * k
	for i := 0; i < 3; i++ {
		f := (float32(i) + 1) / 4
		if !still {
			f = float32(math.Mod(float64(now.UnixMilli())/1000*float64(speed/L)+float64(i)/3, 1))
		}
		q, _ := cv.at(min(max(f*L, 10*k), L-10*k))
		pw, ph := bw*0.95, bw*0.78
		box := ui.Rect{X: q.X - pw/2, Y: q.Y - ph - 1*k, W: pw, H: ph}
		p.Fill(ui.Rect{X: box.X + 1.5*k, Y: box.Y + 2.5*k, W: box.W, H: box.H}, ui.RGBA(120, 72, 30, 0.22), 3*k)
		p.Fill(box, is.ParcelEdge, 3*k)
		p.Fill(ui.Rect{X: box.X + 1.2*k, Y: box.Y + 1.2*k, W: box.W - 2.4*k, H: box.H - 2.4*k}, is.Parcel, 2.4*k)
		p.Fill(ui.Rect{X: box.X + box.W/2 - 1*k, Y: box.Y + 1.2*k, W: 2 * k, H: box.H - 2.4*k}, is.ParcelEdge.Alpha(0.55), 0)
	}
	if !still {
		p.AnimationFrameRate(idleFPS)
	}
}

// paintWaterRing is the still water where a joining device will rise.
func (a *App) paintWaterRing(p *ui.Painter, r ui.Rect, v view, s *isle, grow float32) {
	is := a.T.Isles
	g := 0.5 + 0.5*ui.EaseOut(grow)
	cx, cy := r.X+v.x(s.is.X+s.is.W/2), r.Y+v.y(s.is.Y+s.is.H*0.5)
	rx, ry := s.is.W*0.42*v.k*g, s.is.H*0.32*v.k*g
	softEllipse(p, ui.Rect{X: cx - rx*1.3, Y: cy - ry*1.3, W: rx * 2.6, H: ry * 2.6}, is.Foam.Alpha(0.3*grow))
	var m ui.Path
	ellipse(&m, cx, cy, rx, ry)
	p.StrokePath(&m, 9*v.k, is.Foam.Alpha(0.22*grow))
	p.StrokePath(&m, 3*v.k, is.Foam.Alpha(0.75*grow))
}

// ---------- an island ----------

func (a *App) island(c *ui.Context, v view, s *isle, shown *protocol.DeviceView, lift float32, now time.Time, still bool, sw float32) {
	t := a.T
	d := a.devState()
	rs := a.riseOf(s, now, still)
	if rs.island < 1 || rs.drop != 0 || !rs.landed.IsZero() {
		c.After(16 * time.Millisecond)
	}
	dy := -lift + rs.dy
	sel := (s.dv != nil && shown != nil && s.dv.ID == shown.ID && d.selClient == "") || (s.cl != nil && d.selClient == s.cl.ID)
	name := a.isleName(s)
	away := s.dv != nil && s.dv.State == protocol.DeviceUnreachable
	ir := v.r(s.is)
	ir.Y += dy * v.k
	// The island: its foam, its shadow on the water, the clay.
	isl := ui.Box(c.Key("isle:"+s.key)).Absolute().Left(ir.X-ir.W*0.12).Top(ir.Y).Size(ir.W*1.24, ir.H*1.3).
		Role(ui.RoleButton).Label(name).Cursor(ui.CursorPointer).AccessSelected(sel)
	isl.Draw(func(p *ui.Painter, rr ui.Rect) {
		is := t.Isles
		box := ui.Rect{X: rr.X + ir.W*0.12, Y: rr.Y, W: ir.W, H: ir.H}
		art, _, _ := islandArt(s.home)
		bmp := theme.Clay(art)
		// Its shadow in the water, down and right of the light; a calm
		// reflection under it; a ring of foam where it meets the water.
		softEllipse(p, ui.Rect{X: box.X + box.W*0.04, Y: box.Y + box.H*0.6, W: box.W * 1.06, H: box.H * 0.62}, ui.RGBA(30, 80, 86, 0.16*rs.island))
		if bmp != nil {
			ref := ui.Rect{X: box.X, Y: box.Y + box.H*0.78, W: box.W, H: box.H * 0.42}
			p.ImageRegion(bmp, ui.Rect{}, ref, ui.ImageOptions{FlipY: true, Tint: ui.RGBA(255, 255, 255, 0.14*rs.island)})
		}
		foam := float32(0.5)
		if sel {
			foam = 0.85
		}
		cx, cy := box.X+box.W/2, box.Y+box.H*0.87
		softEllipse(p, ui.Rect{X: cx - box.W*0.6, Y: cy - box.H*0.3, W: box.W * 1.2, H: box.H * 0.6}, is.Foam.Alpha(0.35*foam*rs.island))
		var ring ui.Path
		ellipse(&ring, cx, cy, box.W*0.39, box.H*0.075)
		p.StrokePath(&ring, max(5*v.k, 3), is.Foam.Alpha(0.3*foam*rs.island))
		p.StrokePath(&ring, max(1.6*v.k, 1.2), is.Foam.Alpha(0.75*foam*rs.island))
		if bmp != nil {
			p.ImageRegion(bmp, ui.Rect{}, box, ui.ImageOptions{Tint: ui.RGBA(255, 255, 255, rs.island)})
		}
	})
	if isl.Clicked() {
		a.selectIsle(s)
	}
	// The device standing on it.
	dr := v.r(s.dev)
	dr.Y += (dy + rs.drop) * v.k
	var devEl ui.Element
	if s.dv != nil {
		devEl = a.deviceClay(c, "isle:"+s.key, s.dv)
	} else {
		devEl = a.clientClay(c, "isle:"+s.key, s.cl, s.art)
	}
	devEl.Absolute().Left(dr.X).Top(dr.Y).Size(dr.W, dr.H).TransformOrigin(0.5, 1).PassThrough()
	// The device's clay (inside its transparent margin) must not cover
	// another island's words. Measured like the words (last frame, window
	// space), so every label in the map comes from one layout.
	if b := devEl.Bounds(); b.W > 0 {
		d.labels["art:"+s.key] = ui.Rect{X: b.X + b.W*0.14, Y: b.Y + b.H*0.1, W: b.W * 0.72, H: b.H * 0.75}
	}
	if rs.island < 1 {
		devEl.Opacity(rs.island)
	}
	squash := time.Time{}
	if s.dv != nil && shown != nil && s.dv.ID == shown.ID {
		squash = d.squash
	}
	if !rs.landed.IsZero() {
		squash = rs.landed
	}
	if !squash.IsZero() && !still {
		if el := now.Sub(squash); el >= 0 && el < t.Equip.Squash {
			sx, sy := squashAt(float32(el) / float32(t.Equip.Squash))
			devEl.Scale(sx, sy)
			c.After(16 * time.Millisecond)
		}
	}
	if !rs.landed.IsZero() && d.sparkAt.Before(rs.landed) && now.After(rs.landed) {
		d.sparkAt, d.sparkAt0 = now, devEl.Bounds()
	}
	// Ducter, on the device where it lives.
	right, bottom := ir.X, ir.Y+ir.H
	if s.home && s.dv != nil {
		dk := v.r(s.ducter)
		dk.Y += dy * v.k
		a.homeDucter(c, s, dk)
		right = dk.X + dk.W*0.78
	}
	// Abilities: at full size in front of home (the dock); on another
	// island, stuck to its rim.
	if s.dv != nil && len(s.dock) > 0 {
		// laid out below, under the island's name
	} else if s.dv != nil {
		right = max(right, a.badges(c, v, s, ir, sel))
	}
	// The connections (D96) stand on home's right rim as small clay mailboxes.
	maxX := ir.X + ir.W*1.02
	if s.home {
		maxX = a.mailboxes(c, v, s, ir)
	}
	// AI accounts standing on the island, in front of the device.
	if s.dv != nil {
		bottom = max(bottom, a.isleTokens(c, v, s, ir, right+6, maxX-4))
	}
	// Can't reach: a soft mist over it (never a broken bridge).
	if away {
		ui.Box(c.Key("mist:"+s.key)).Absolute().Left(ir.X-ir.W*0.2).Top(dr.Y-ir.H*0.5).Size(ir.W*1.4, ir.Y+ir.H*1.05-(dr.Y-ir.H*0.5)).PassThrough().AccessHidden(true).
			Draw(func(p *ui.Painter, rr ui.Rect) {
				softEllipse(p, rr, t.Isles.Mist.Alpha(0.9))
			})
	}
	// Its name, and a line only when there is something to say.
	line, ink := a.isleLine(s)
	nw := float32(220)
	cx := ir.X + ir.W/2
	left := min(max(cx-nw/2, 4), sw-nw-4)
	nc := ui.Column(c.Key("name:" + s.key)).Absolute().Left(left).Top(bottom + 4).Width(nw).AlignItems(ui.Center).PassThrough().AccessHidden(true)
	if rs.island < 1 {
		nc.Opacity(rs.island)
	}
	nc.Children(func() {
		tag := a.sceneTag(c, sel)
		tag.Children(func() {
			d.labels["name:"+s.key] = ui.Text(c, name).FontSize(t.SM).FontWeight(800).TextColor(t.Ink).SingleLine().TextAlign(ui.Center).Bounds()
			if line != "" {
				if ink == t.InkMuted {
					ink = t.InkSoft
				}
				d.labels["line:"+s.key] = ui.Text(c, line).FontSize(t.XS).FontWeight(700).TextColor(ink).SingleLine().TextAlign(ui.Center).Bounds()
			}
		})
		d.labels["tag:"+s.key] = tag.Bounds()
	})
	if s.dv != nil && len(s.dock) > 0 {
		// Under the name, never on it: the name's tag grows when the
		// accounts take two rows.
		minY := bottom + 4 + 34
		if h := nc.Bounds().H; h > 0 {
			minY = bottom + 4 + h
		}
		a.dockRow(c, v, s, dy, sel, now, still, minY+10)
	}
}

// sceneTag is a word in the scene on its own small clay tag: a cream
// card on a 2-point base, like the brand's cards, so words never sit bare
// on the 3D. The chosen island's tag has the ink hairline of a chosen card.
func (a *App) sceneTag(c *ui.Context, sel bool) ui.Element {
	t := a.T
	tag := ui.Column(c.Key("tag")).AlignItems(ui.Center).Padding(3, 10, 4, 10).Radius(10).Background(t.Surface).
		Shadow(0, 2, 0, 0, t.Line)
	if sel {
		tag.Border(1.5, t.Ink)
	}
	return tag
}

// mailboxes are the user's connections, each a small clay mailbox on the
// home island's right rim (at most three; the Partner page lists them all).
func (a *App) mailboxes(c *ui.Context, v view, s *isle, ir ui.Rect) float32 {
	d := a.devState()
	cs := a.HomeMailboxes()
	w := max(26*v.k, 20)
	h := w * 84 / 52
	left := ir.X + ir.W*1.02
	for i, cv := range cs {
		if i == 3 {
			break
		}
		x := ir.X + ir.W*0.9 - float32(i)*w*1.1
		left = x
		y := ir.Y + ir.H*(0.5+0.06*float32(i)) - h
		box := ui.Box(c.Key("mail:"+cv.ID)).Absolute().Left(x).Top(y).Size(w, h).Role(ui.RoleImage).Label(cv.Name)
		box.Draw(func(p *ui.Painter, r ui.Rect) {
			softEllipse(p, ui.Rect{X: r.X + r.W*0.1, Y: r.Y + r.H*0.9, W: r.W * 0.9, H: r.H * 0.14}, ui.RGBA(60, 50, 20, 0.3))
			a.drawMailbox(cv.Source)(p, r)
		})
		d.labels["mail:"+cv.ID] = box.Bounds()
	}
	return left
}

// selectIsle chooses an island: its device's card and abilities on the
// right; a phone shows what it is for.
func (a *App) selectIsle(s *isle) {
	d := a.devState()
	d.removing = ""
	if s.dv != nil {
		d.sel, d.selClient = s.dv.ID, ""
		return
	}
	d.selClient = s.cl.ID
}

// clientClay is a phone's (or a window's) clay: it floats while it is
// connected, and is still while it is away.
func (a *App) clientClay(c *ui.Context, key string, cl *protocol.ReachClient, art string) ui.Element {
	bmp := theme.Clay(art)
	kind := idleStill
	if cl.Connected {
		kind = idleFloat
	}
	phase := phaseOf(key)
	return ui.Box(c.Key("clay:" + key)).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
		clayArt(p, fitIn(bmp, r), bmp, kind, phase, nil)
	})
}

// homeDucter is Ducter sitting on the grass beside the device where it
// lives, with its contact shadow.
func (a *App) homeDucter(c *ui.Context, s *isle, at ui.Rect) {
	pose := a.homePose(s.dv, a.Now())
	bmp := theme.Art(pose, 360)
	if bmp == nil {
		bmp = theme.Art(pose, 160)
	}
	if bmp == nil {
		return
	}
	feet := map[theme.Presence]float32{theme.Idle: 0.795, theme.Done: 0.855, theme.Napping: 0.86}[pose]
	if feet == 0 {
		feet = 0.8
	}
	// at was laid out for feet at 0.8 of the square; each pose's feet sit
	// a little differently.
	at.Y += (0.8 - feet) * at.H
	var lids *blinkArt
	if pose == theme.Idle {
		lids = squareBlink(360) // the size bmp was picked at
	}
	ui.Box(c.Key("ducter-shadow")).Absolute().Left(at.X+at.W*0.18).Top(at.Y+at.H*(feet-0.06)).Size(at.W*0.66, at.H*0.14).PassThrough().AccessHidden(true).
		Draw(func(p *ui.Painter, r ui.Rect) {
			softEllipse(p, r, ui.RGBA(60, 50, 20, 0.34))
		})
	ui.Box(c.Key("ducter")).Absolute().Left(at.X).Top(at.Y).Size(at.W, at.H).PassThrough().
		Role(ui.RoleImage).Label(a.S.PersonaName).Draw(func(p *ui.Painter, rr ui.Rect) {
		clayArt(p, rr, bmp, idleBreathe, phaseOf("stage-ducter"), lids)
	})
}

// dockRow are the abilities of the chosen device at full size, on the
// water in front of its island: one that is on is its clay token, gently
// bobbing; one that can be added is an empty well to fill (tap it, or
// drag the ability onto the stage). The equip flies into its well.
func (a *App) dockRow(c *ui.Context, v view, s *isle, dy float32, sel bool, now time.Time, still bool, minY float32) {
	t := a.T
	d := a.devState()
	size := min(max(dockSize*v.k, 92), 140)
	gap := max(dockGap*v.k, 14)
	// Each takes the room of its token or of its name, whichever is wider.
	widths := make([]float32, len(s.dock))
	total := float32(0)
	for i, id := range s.dock {
		lw, _ := c.MeasureText(0, ui.Span{Text: a.L.T("ability." + id), Size: t.SM, Weight: 800})
		widths[i] = max(size, lw+28)
		total += widths[i]
	}
	total += float32(len(s.dock)-1) * gap
	x := v.x(s.dockR.X+s.dockR.W/2) - total/2
	y0 := max(v.y(s.dockR.Y+dy), minY)
	for i, id := range s.dock {
		slotW := widths[i]
		x += slotW + gap
		ab := s.dv.Ability(id)
		on := a.shownOn(s.dv, id)
		flying := d.fx != nil && d.fx.ability == id && d.fx.device == s.dv.ID && !d.fx.back
		addable := !on && !flying && a.canAdd(s.dv, id)
		name := a.L.T("ability." + id)
		label := a.L.T("ability.slot", name)
		switch {
		case on:
			label = a.L.T("ability.slot.on", name)
		case ab != nil && ab.State == protocol.AbilityUnavailable:
			label = a.L.T("ability.slot.unavailable", name)
		}
		left := x - gap - slotW
		col := ui.Column(c.Key("dock:" + id)).Absolute().Left(left).Top(y0).Width(slotW).AlignItems(ui.Center).Gap(4).
			Role(ui.RoleButton).Label(label).Cursor(ui.CursorPointer)
		if s.dv.State != protocol.DeviceAwake {
			col.Opacity(0.75)
		}
		target := flying || (addable && (d.ability == id || d.hover == id))
		col.Children(func() {
			well := ui.Box(c.Key("well")).Size(size, size)
			art := "slot_empty"
			if on {
				art = abilityArt(id)
			}
			bmp := theme.Clay(art)
			// An empty slot shows, faintly, what goes in it.
			var ghost *ui.Bitmap
			if !on && !flying {
				ghost = theme.Clay(abilityLaterArt(id))
			}
			kind := idleStill
			if on {
				kind = idleFloat
			}
			phase := phaseOf("dock:" + id)
			well.Draw(func(p *ui.Painter, r ui.Rect) {
				// Its shadow on the water.
				softEllipse(p, ui.Rect{X: r.X + r.W*0.14, Y: r.Y + r.H*0.8, W: r.W * 0.8, H: r.H * 0.2}, ui.RGBA(30, 80, 86, 0.22))
				if bmp != nil {
					clayArt(p, fitIn(bmp, r), bmp, kind, phase, nil)
				}
				if ghost != nil {
					g := fitIn(ghost, ui.Rect{X: r.X + r.W*0.24, Y: r.Y + r.H*0.12, W: r.W * 0.52, H: r.H * 0.52})
					p.ImageRegion(ghost, ui.Rect{}, g, ui.ImageOptions{Tint: ui.RGBA(255, 255, 255, 0.7)})
				}
				if target {
					grow := float32(6)
					if flying {
						grow = 14
					}
					if d.hover == id && !flying {
						var halo ui.Path
						halo.Circle(r.X+r.W/2, r.Y+r.H/2, r.W/2+grow)
						p.FillPath(&halo, t.Accent.Alpha(0.14))
					}
					p.StrokeDashed(ui.Rect{X: r.X - grow/2, Y: r.Y - grow/2, W: r.W + grow, H: r.H + grow}, t.Accent, (r.W+grow)/2, 3)
				}
			})
			if sel {
				d.slots[id] = well.Bounds()
			}
			if wb := well.Bounds(); wb.W > 0 {
				d.labels["dockwell:"+id] = wb
			}
			tag := a.sceneTag(c, false)
			if !on {
				tag.Opacity(0.85)
			}
			tag.Children(func() {
				ink := t.Ink
				if !on {
					ink = t.InkSoft
				}
				ui.Text(c, name).FontSize(t.SM).FontWeight(800).TextColor(ink).SingleLine().AccessHidden(true)
			})
			d.labels["dock:"+id] = tag.Bounds()
		})
		if on && s.dv.State == protocol.DeviceAwake && id == protocol.AbilityWeb {
			col.ContextMenu(func(m *ui.Menu) {
				if m.Item(a.L.T("ability.remove")).Chosen() {
					a.selectIsle(s)
					d.ability, d.removing = id, id
				}
			})
		}
		if col.Clicked() {
			a.selectIsle(s)
			d.ability = id
			if addable {
				a.startEquip(s.dv, id, d.tiles[id], false)
			}
		}
	}
}

// badges are the abilities on a device, stuck to its island's left rim,
// two a row toward the front. It returns their right edge.
func (a *App) badges(c *ui.Context, v view, s *isle, ir ui.Rect, sel bool) float32 {
	t := a.T
	d := a.devState()
	size := max(34*v.k, 26)
	var on []string
	for _, ab := range s.dv.Abilities {
		if a.shownOn(s.dv, ab.ID) {
			on = append(on, ab.ID)
		}
	}
	spot := func(i int) ui.Rect {
		row, col := i/2, i%2
		x := ir.X + ir.W*0.03 + float32(col)*size*0.98 + float32(row)*size*0.18
		y := ir.Y + ir.H*0.4 - size*0.55 + float32(row)*size*0.78
		return ui.Rect{X: x, Y: y, W: size, H: size}
	}
	right := ir.X
	shown := len(on)
	if sel && (d.hover != "" || (d.fx != nil && !d.fx.back && d.fx.device == s.dv.ID)) {
		shown++
	}
	for i := 0; i < min(shown, 6); i++ {
		right = max(right, spot(i).X+size)
	}
	for i, id := range on {
		if i >= 6 {
			break
		}
		at := spot(i)
		name := a.L.T("ability." + id)
		bd := ui.Box(c.Key("badge:"+s.key+":"+id)).Absolute().Left(at.X).Top(at.Y).Size(at.W, at.H).
			Role(ui.RoleButton).Label(a.L.T("ability.slot.on", name)).Cursor(ui.CursorPointer)
		bmp := theme.Clay(abilityArt(id))
		bd.Draw(func(p *ui.Painter, r ui.Rect) {
			softEllipse(p, ui.Rect{X: r.X + r.W*0.1, Y: r.Y + r.H*0.7, W: r.W * 0.95, H: r.H * 0.36}, ui.RGBA(110, 66, 28, 0.3))
			if bmp != nil {
				p.Image(bmp, r, ui.Contain)
			}
		})
		if sel {
			d.slots[id] = bd.Bounds()
		}
		if bd.Clicked() {
			a.selectIsle(s)
			d.ability, d.removing = id, ""
		}
		if id == protocol.AbilityWeb && s.dv.State == protocol.DeviceAwake {
			bd.ContextMenu(func(m *ui.Menu) {
				if m.Item(a.L.T("ability.remove")).Chosen() {
					a.selectIsle(s)
					d.ability, d.removing = id, id
				}
			})
		}
	}
	if !sel || len(on) >= 6 {
		return right
	}
	// The next free spot: where an ability being added lands. It shows
	// only while one is held over the stage, hovered, or in flight.
	at := spot(len(on))
	next := ui.Box(c.Key("badge-next:"+s.key)).Absolute().Left(at.X).Top(at.Y).Size(at.W, at.H).PassThrough().AccessHidden(true)
	flying := d.fx != nil && !d.fx.back && d.fx.device == s.dv.ID
	if d.hover != "" || flying {
		grow := float32(4)
		if flying {
			grow = 10
		}
		next.Draw(func(p *ui.Painter, r ui.Rect) {
			if d.hover != "" && !flying {
				var halo ui.Path
				halo.Circle(r.X+r.W/2, r.Y+r.H/2, r.W/2+grow)
				p.FillPath(&halo, t.Accent.Alpha(0.14))
			}
			p.StrokeDashed(ui.Rect{X: r.X - grow/2, Y: r.Y - grow/2, W: r.W + grow, H: r.H + grow}, t.Accent, (r.W+grow)/2, 2.5)
		})
	}
	for _, ab := range s.dv.Abilities {
		if !a.shownOn(s.dv, ab.ID) {
			d.slots[ab.ID] = next.Bounds()
		}
	}
	if flying {
		d.slots[d.fx.ability] = next.Bounds()
	}
	return right
}

// isleTokens are the AI accounts signed in on a device, standing on its
// island's front right with their names under them, in rows that never
// overlap. Tapping one lifts every island it's signed in on.
func (a *App) isleTokens(c *ui.Context, v view, s *isle, ir ui.Rect, minX, maxX float32) float32 {
	t := a.T
	d := a.devState()
	var hs []protocol.DeviceHarness
	for _, h := range s.dv.Harnesses {
		if h.Installed && h.LoggedIn {
			hs = append(hs, h)
		}
	}
	if len(hs) == 0 {
		return ir.Y + ir.H
	}
	art := max(30*v.k, 24)
	const gap, labelH = float32(6), float32(24)
	widths := make([]float32, len(hs))
	for i, h := range hs {
		lw, _ := c.MeasureText(0, ui.Span{Text: harnessName(h.Harness), Size: t.XS, Weight: 800})
		widths[i] = max(art, lw+18)
	}
	// Rows that fit between the badges and the island's right rim, each
	// centered in front of the device.
	lo, hi := max(minX, ir.X+ir.W*0.02), min(ir.X+ir.W*1.02, maxX)
	var rows [][]int
	var rowW []float32
	for i := range hs {
		n := len(rows)
		if n == 0 || rowW[n-1]+gap+widths[i] > hi-lo {
			rows, rowW = append(rows, []int{i}), append(rowW, widths[i])
			continue
		}
		rows[n-1], rowW[n-1] = append(rows[n-1], i), rowW[n-1]+gap+widths[i]
	}
	y := ir.Y + ir.H*0.36 - art*0.15
	bottom := ir.Y + ir.H
	at := map[int]ui.Point{}
	for r, row := range rows {
		x := min(max(ir.X+ir.W/2-rowW[r]/2, lo), hi-rowW[r])
		for _, i := range row {
			at[i] = ui.Point{X: x, Y: y + float32(r)*(art+labelH-2)}
			x += widths[i] + gap
		}
		bottom = max(bottom, y+float32(r)*(art+labelH-2)+art+labelH)
	}
	for i, h := range hs {
		w := widths[i]
		x, y := at[i].X, at[i].Y
		lit := d.lit == h.Harness
		name := harnessName(h.Harness)
		tok := ui.Column(c.Key("tok:" + s.key + ":" + h.Harness)).Absolute().Left(x).Top(y).Width(w).AlignItems(ui.Center).
			Role(ui.RoleButton).Label(name).Cursor(ui.CursorPointer).AccessSelected(lit)
		bmp := theme.Clay(coinArt(h.Harness, art, !h.Installed || !h.LoggedIn))
		tok.Children(func() {
			ui.Box(c.Key("art")).Size(art, art).Draw(func(p *ui.Painter, r ui.Rect) {
				softEllipse(p, ui.Rect{X: r.X + r.W*0.12, Y: r.Y + r.H*0.72, W: r.W * 0.92, H: r.H * 0.36}, ui.RGBA(110, 66, 28, 0.3))
				if bmp != nil {
					p.Image(bmp, r, ui.Contain)
				}
				if lit {
					var m ui.Path
					m.Circle(r.X+r.W/2, r.Y+r.H/2, r.W/2+3)
					p.StrokePath(&m, 2, t.Ink)
				}
			}).Children(func() {
				if s.dv != nil {
					a.BrainBadge(c, s.dv, h.Harness) // D89: the token Ducter thinks with
				}
			})
			tag := ui.Row(c.Key("tag")).Padding(1, 6, 2, 6).Radius(8).Background(t.Surface).Shadow(0, 1.5, 0, 0, t.Line).Margin(-3, 0, 0, 0)
			tag.Children(func() {
				ui.Text(c, name).FontSize(t.XS).FontWeight(800).TextColor(t.Ink).SingleLine()
			})
			d.labels["tok:"+s.key+":"+h.Harness] = tag.Bounds()
		})
		if tok.Clicked() {
			a.selectIsle(s)
			if d.lit == h.Harness {
				d.lit = ""
			} else {
				d.lit, d.litAt = h.Harness, a.Now()
			}
		}
	}
	return bottom
}

// accountArt is an AI account's clay coin on a Devices card. The accounts
// come from the server (data, not a fixed list): a known agent has its own
// coin, any other the generic token.
func accountArt(h string) string {
	return coinArt(h, coinPrintMin, false)
}
