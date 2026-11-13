package views

// D220: the workbench's 手机 / Phone page on the Mac, as on the web
// (apps/web/src/workbench.tsx PhonePage, sim.tsx): Ducter's phone while
// the task uses it (the live view, drawn in the page, D217), and an iOS
// Simulator booted on the task's computer when that is the task's business:
// its screen, live (a frame every ~¼ s through `wb` sim_frame while the
// page is shown), and a rail of what simctl has (research/64): Home, dark
// or light, text size, open a link, a screenshot into the task's composer
// (D206). View only: simctl can't tap, and the page says so.

import (
	"bytes"
	"encoding/base64"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"math"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// simGap is the wait after a frame lands before the next is asked for.
const simGap = 90 * time.Millisecond

type benchSim struct {
	bmp      *ui.Bitmap
	w, h     int
	asking   bool
	next     time.Time
	err      string
	off      bool
	menu     string // "" | "text" | "link"
	link     string
	busy     string
	shotNote string
}

func (b *benchTask) simOf(udid string) *benchSim {
	if b.sim == nil {
		b.sim = map[string]*benchSim{}
	}
	s := b.sim[udid]
	if s == nil {
		s = &benchSim{}
		b.sim[udid] = s
	}
	return s
}

// dataImage decodes a data: URL's picture.
func dataImage(u string) (image.Image, []byte, error) {
	raw, err := base64.StdEncoding.DecodeString(u[strings.IndexByte(u, ',')+1:])
	if err != nil {
		return nil, nil, err
	}
	img, _, err := image.Decode(bytes.NewReader(raw))
	return img, raw, err
}

// benchSims asks which simulators are this task's business (an older
// computer, one away, or no Xcode: none, nothing said).
func (a *App) benchSims(task *store.Task) {
	b := a.benchOf(task.ID)
	b.simsAt = a.Now()
	a.wbAsk(task.ID, protocol.WbRequest{Op: "sims"}, func(ans *protocol.WbAnswer, _, _ string) {
		if ans != nil {
			b.sims = ans.Sims
		}
	})
}

// benchPhoneKeys are the screens the Phone page has: "phone" (Ducter's)
// while the task uses it, then each simulator's udid.
func (a *App) benchPhoneKeys(task *store.Task) []string {
	var keys []string
	if !finished(task) && a.S.Phoning(task.ID) != "" {
		keys = append(keys, "phone")
	}
	for _, s := range a.benchOf(task.ID).sims {
		keys = append(keys, s.Udid)
	}
	return keys
}

func (a *App) benchPhone(c *ui.Context, task *store.Task, b *benchTask) {
	t := a.T
	keys := a.benchPhoneKeys(task)
	if len(keys) == 0 {
		return
	}
	on := keys[0]
	if contains(keys, b.screen) {
		on = b.screen
	}
	both := len(keys) > 1 && a.Local.ScreensBoth()
	if len(keys) > 1 {
		ui.Row(c.Key("screens")).Gap(t.S1).Padding(t.S1).Radius(t.RadiusMD).Background(t.SurfaceSunken).Role(ui.RoleRadioGroup).
			Label(a.L.T("wb.screens")).Children(func() {
			for _, k := range keys {
				label := a.L.T("wb.phone.ducter")
				for _, s := range b.sims {
					if s.Udid == k {
						label = s.Name
					}
				}
				if a.choice(c, "screen:"+k, label, k == on && !both, "") {
					b.screen = k
					a.Local.SetScreensBoth(false)
				}
			}
			// D244: the two screens side by side, instead of a choice.
			if a.choice(c, "screen:both", a.L.T("wb.screens.both"), both, "") {
				a.Local.SetScreensBoth(true)
			}
		})
	}
	screen := func(k string) {
		if k == "phone" {
			a.benchDucterPhone(c, task)
			return
		}
		for i := range b.sims {
			if b.sims[i].Udid == k {
				a.benchSimView(c, task, b, &b.sims[i])
			}
		}
	}
	if !both {
		screen(on)
		return
	}
	full := a.bench.colW
	colW := (full - 2*t.S4 - t.S3*float32(len(keys)-1)) / float32(len(keys))
	ui.Row(c.Key("screens-both")).Gap(t.S3).AlignItems(ui.Start).Children(func() {
		for _, k := range keys {
			ui.Column(c.Key("both:" + k)).Width(colW).Shrink(0).Gap(t.S2).Children(func() {
				a.bench.colW = colW
				screen(k)
			})
		}
	})
	a.bench.colW = full
}

// benchDucterPhone draws the live view of Ducter's phone watching the task,
// in the page (phoneView leaves it to the page this frame).
func (a *App) benchDucterPhone(c *ui.Context, task *store.Task) {
	pv := a.S.Phone.View
	if pv == nil || pv.Mode != "watch" || pv.TaskID != task.ID {
		if pv == nil {
			a.OpenPhone(a.S.Phoning(task.ID), task.ID, "", "watch")
		}
		a.benchNote(c, a.L.T("phoneuse.opening"))
		c.After(300 * time.Millisecond)
		return
	}
	a.pu.inBench = task.ID
	mine := pv.Mine()
	var doing *protocol.LiveDoing
	if !mine && pv.Doing != nil && a.Now().Sub(pv.DoingAt) < liveDoingFor {
		doing = pv.Doing
	}
	ui.Column(c.Key("bench-phone")).Height(float32(a.winH - ChromeH - 130)).Radius(a.T.RadiusLG).Clip().Background(a.T.Surface).Children(func() {
		a.phoneBody(c, pv, mine, doing, a.L.T("phoneuse.title"), float32(a.winH-ChromeH-300))
	})
}

func (a *App) benchSimView(c *ui.Context, task *store.Task, b *benchTask, sim *protocol.WbSim) {
	t := a.T
	s := b.simOf(sim.Udid)
	id, udid := task.ID, sim.Udid
	// Frames while this page is shown and the window is in sight.
	if !s.asking && !c.WindowHidden() && !a.Now().Before(s.next) {
		s.asking = true
		edge := int(float32(a.winH-ChromeH-220) * 2)
		a.wbAsk(id, protocol.WbRequest{Op: "sim_frame", Udid: udid, Edge: min(1600, max(480, edge))}, func(ans *protocol.WbAnswer, code, refusal string) {
			s.asking = false
			if ans == nil {
				s.off = code == "missing"
				s.err = refusal
				s.next = a.Now().Add(2 * time.Second)
				return
			}
			if img, _, err := dataImage(ans.Image); err == nil {
				if s.bmp == nil {
					s.bmp = ui.NewBitmap(img)
				} else {
					s.bmp.Update(img)
				}
				s.w, s.h, s.err, s.off = ans.W, ans.H, "", false
			}
			s.next = a.Now().Add(simGap)
		})
	}
	c.After(simGap + 10*time.Millisecond)
	where := a.taskComputerName(task)
	ui.Text(c, strings.Join([]string{sim.Name, sim.OS, a.L.T("wb.sim.on", where)}, " · ")).FontSize(t.XS).TextColor(t.InkMuted)
	ui.Row(c.Key("sim-main")).Gap(t.S3).AlignItems(ui.Center).Children(func() {
		ui.Row(c).Grow(1).MinWidth(0).Justify(ui.Center).Children(func() {
			if s.bmp == nil || s.off {
				line := a.L.T("wb.sim.loading")
				if s.off {
					line = a.L.T("wb.sim.off")
				} else if s.err != "" {
					line = s.err
				}
				ui.Text(c, line).FontSize(t.SM).TextColor(t.InkMuted)
				return
			}
			ph := float32(a.winH - ChromeH - 230)
			pw := ph * float32(max(1, s.w)) / float32(max(1, s.h))
			if pw > a.bench.colW-110 {
				pw = a.bench.colW - 110
				ph = pw * float32(max(1, s.h)) / float32(max(1, s.w))
			}
			// An iPhone's own corners, in proportion; a hairline ring like the web's.
			ui.Box(c.Key("sim-ring")).Padding(5).Radius(pw*0.09+5).Background(t.Surface).Border(1, t.Line2).Children(func() {
				ui.Image(c.Key("sim-screen"), s.bmp).Size(pw, ph).Radius(pw * 0.09).Label(sim.Name)
			})
		})
		// The rail: drawn marks, never characters (D73).
		ui.Column(c.Key("sim-rail")).Gap(t.S1).Padding(6).Radius(999).Background(t.SurfaceSunken).Border(1, t.Line).
			Role(ui.RoleToolbar).Label(a.L.T("wb.sim.rail")).Children(func() {
			dark := sim.Appearance == "dark"
			look := "wb.sim.dark"
			if dark {
				look = "wb.sim.light"
			}
			if a.iconButton(c, a.L.T("wb.sim.home"), t.ControlSM, btnText, drawSimMark("home", false)) {
				a.simAct(id, b, sim, "home", "")
			}
			if a.iconButton(c, a.L.T(look), t.ControlSM, btnText, drawSimMark("look", dark)) {
				v := "dark"
				if dark {
					v = "light"
				}
				a.simAct(id, b, sim, "appearance", v)
			}
			kind := btnText
			if s.menu == "text" {
				kind = btnSecondary
			}
			if a.iconButton(c, a.L.T("wb.sim.text"), t.ControlSM, kind, drawSimMark("text", false)) {
				s.menu = toggleStr(s.menu, "text")
			}
			kind = btnText
			if s.menu == "link" {
				kind = btnSecondary
			}
			if a.iconButton(c, a.L.T("wb.sim.link"), t.ControlSM, kind, drawSimMark("link", false)) {
				s.menu = toggleStr(s.menu, "link")
			}
			if a.iconButton(c, a.L.T("wb.sim.shot"), t.ControlSM, btnText, drawSimMark("shot", false)) {
				a.simAct(id, b, sim, "shot", "")
			}
		})
	})
	switch s.menu {
	case "text":
		ui.Row(c.Key("sim-text")).Gap(t.S1).Padding(t.S1).Radius(t.RadiusMD).Background(t.SurfaceSunken).Role(ui.RoleRadioGroup).
			Label(a.L.T("wb.sim.text")).Children(func() {
			for _, k := range []string{"small", "default", "large", "xlarge"} {
				if a.choice(c, "simtext:"+k, a.L.T("wb.sim.text."+k), sim.Text == k, "") {
					a.simAct(id, b, sim, "text", k)
					s.menu = ""
				}
			}
		})
	case "link":
		ui.Row(c.Key("sim-link")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			go1 := func() {
				v := strings.TrimSpace(s.link)
				if !simLinkOK(v) {
					a.benchToast(a.L.T("wb.sim.link.bad"))
					return
				}
				a.simAct(id, b, sim, "url", v)
				s.link, s.menu = "", ""
			}
			ui.TextInput(c.Key("sim-link-in"), &s.link).Placeholder(a.L.T("wb.sim.link.hint")).Label(a.L.T("wb.sim.link")).
				FontSize(t.SM).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.Surface).Border(1, t.Line).Grow(1).OnSubmit(go1)
			if a.button(c, a.L.T("wb.sim.link.go"), btnSecondary, t.ControlSM, t.BgDeep) {
				go1()
			}
		})
	}
	ui.Text(c, a.L.T("wb.sim.viewonly", where)).FontSize(t.XS).TextColor(t.InkMuted).Wrap()
}

func toggleStr(cur, v string) string {
	if cur == v {
		return ""
	}
	return v
}

// simLinkOK is simLinkOk (protocol/workbench.ts): a scheme and something
// after it, never file:, at most 2048 characters.
func simLinkOK(u string) bool {
	if len(u) == 0 || len(u) > 2048 || strings.ContainsAny(u, " \t\n") {
		return false
	}
	i := strings.Index(u, ":")
	if i < 1 || i > 31 || i == len(u)-1 {
		return false
	}
	for j, r := range u[:i] {
		ok := r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || j > 0 && (r >= '0' && r <= '9' || r == '+' || r == '.' || r == '-')
		if !ok {
			return false
		}
	}
	return !strings.EqualFold(u[:i], "file")
}

// simAct runs one control; a screenshot goes into the task's composer.
func (a *App) simAct(taskID string, b *benchTask, sim *protocol.WbSim, act, value string) {
	s := b.simOf(sim.Udid)
	s.busy = act
	udid, name := sim.Udid, sim.Name
	a.wbAsk(taskID, protocol.WbRequest{Op: "sim_act", Udid: udid, Act: act, Value: value}, func(ans *protocol.WbAnswer, _, refusal string) {
		s.busy = ""
		if ans == nil {
			a.benchToast(refusal)
			return
		}
		if ans.Sim != nil {
			for i := range b.sims {
				if b.sims[i].Udid == udid {
					b.sims[i] = *ans.Sim
				}
			}
		}
		if act == "shot" && ans.Image != "" {
			if _, raw, err := dataImage(ans.Image); err == nil {
				stamp := a.Now().Format("2006-01-02-15-04-05")
				a.AddPicture("task:"+taskID, raw, strings.ReplaceAll(name, " ", "-")+"-"+stamp+".png")
				a.benchToast(a.L.T("wb.sim.shot.done"))
			}
		}
	})
}

// drawSimMark draws the rail's marks: home (a house), look (half a disc),
// text (a large and a small A in strokes), link (two links), shot (a camera).
func drawSimMark(k string, dark bool) func(fg ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(fg ui.Color) func(p *ui.Painter, r ui.Rect) {
		return func(p *ui.Painter, r ui.Rect) {
			// A 20-unit box centred in r, like the web's 20×20 viewBox.
			ox, oy := r.X+r.W/2-10, r.Y+r.H/2-10
			P := func(x, y float32) (float32, float32) { return ox + x, oy + y }
			var m ui.Path
			m.Cap(ui.RoundCap).Join(ui.RoundJoin)
			switch k {
			case "home":
				m.MoveTo(P(3.5, 9.2))
				m.LineTo(P(10, 3.8))
				m.LineTo(P(16.5, 9.2))
				m.MoveTo(P(5.3, 8))
				m.LineTo(P(5.3, 16.3))
				m.LineTo(P(14.7, 16.3))
				m.LineTo(P(14.7, 8))
			case "look":
				cx, cy := P(10, 10)
				m.Circle(cx, cy, 6.3)
				p.StrokePath(&m, 1.7, fg)
				var h ui.Path
				x0, y0 := P(10, 3.7)
				h.MoveTo(x0, y0)
				for i := 0; i <= 16; i++ {
					a := float64(i) / 16 * 3.14159265
					sgn := float32(1)
					if !dark {
						sgn = -1
					}
					h.LineTo(cx+sgn*6.3*float32(math.Sin(a)), cy-6.3*float32(math.Cos(a)))
				}
				h.Close()
				p.FillPath(&h, fg)
				return
			case "text":
				m.MoveTo(P(2.8, 15.5))
				m.LineTo(P(6.6, 5))
				m.LineTo(P(10.4, 15.5))
				m.MoveTo(P(4.1, 12))
				m.LineTo(P(9.1, 12))
				m.MoveTo(P(11.6, 15.5))
				m.LineTo(P(14.2, 8.7))
				m.LineTo(P(16.8, 15.5))
				m.MoveTo(P(12.5, 13.2))
				m.LineTo(P(15.9, 13.2))
			case "link":
				roundRect(&m, ox+2.6, oy+8.2, 9, 5, 2.5)
				roundRect(&m, ox+8.4, oy+6.8, 9, 5, 2.5)
			case "shot":
				roundRect(&m, ox+3, oy+5.6, 14, 10.4, 2)
				m.MoveTo(P(7.2, 5.6))
				m.LineTo(P(8.4, 3.9))
				m.LineTo(P(11.6, 3.9))
				m.LineTo(P(12.8, 5.6))
				cx, cy := P(10, 10.6)
				m.Circle(cx, cy, 2.7)
			}
			p.StrokePath(&m, 1.7, fg)
		}
	}
}
