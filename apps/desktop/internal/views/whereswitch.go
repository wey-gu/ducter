package views

import (
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D157 (design/where.md §6.2): 换谁来做 / Switch who does it, with two or
// more computers, is who and where together. On the desktop a strip of the
// Devices islands (the computers that run tasks, each with its agents'
// coins standing on it, the task's parcel on the island where it runs; a
// tap on a coin picks that agent there), then the literal list grouped by
// computer, one reason per row, greyed rows with why.

// candKeyOn is a row's key with its computer (one agent on two computers is two rows).
func candKeyOn(cd protocol.Candidate) string { return cd.Device + "|" + candKey(cd) }

// whereRows: the candidates carry computers (two or more run tasks).
func whereRows(cands []protocol.Candidate) bool {
	for _, c := range cands {
		if c.Device != "" {
			return true
		}
	}
	return false
}

// whereCandReason is a row's reason when what stops it is the computer.
func (a *App) whereCandReason(cd protocol.Candidate) string {
	name := cd.DeviceName
	switch cd.Blocked {
	case "no_chrome":
		return a.L.T("switch.cant.chrome", name)
	case "no_browser":
		return a.L.T("switch.cant.web", name)
	case "no_app":
		return a.L.T("switch.cant.app")
	case "elsewhere":
		return a.L.T("switch.cant.folder")
	}
	if cd.Blocked == "" && cd.Waits != "" {
		if cd.Waits == "asleep" {
			return a.L.T("switch.waits")
		}
		return a.L.T("switch.waits.away")
	}
	return ""
}

// computerState is a group header's state words: 醒着 · 一直醒着.
func (a *App) computerState(dv *protocol.DeviceView) string {
	if dv == nil {
		return ""
	}
	parts := []string{}
	switch dv.State {
	case protocol.DeviceAsleep:
		parts = append(parts, a.L.T("switch.computer.asleep"))
	case protocol.DeviceUnreachable:
		parts = append(parts, a.L.T("switch.computer.away"))
	default:
		parts = append(parts, a.L.T("switch.computer.awake"))
	}
	if dv.AlwaysOn {
		parts = append(parts, a.L.T("switch.computer.on"))
	}
	return strings.Join(parts, " · ")
}

// groupCands keeps the candidates' order and groups them by computer, the
// task's own computer first.
func groupCands(cands []protocol.Candidate) (order []string, by map[string][]int) {
	by = map[string][]int{}
	for i, c := range cands {
		if _, ok := by[c.Device]; !ok {
			order = append(order, c.Device)
		}
		by[c.Device] = append(by[c.Device], i)
	}
	return order, by
}

// islandStrip is the computers as small islands, each with its agents'
// coins; the task's parcel sits on the island where it runs. A coin picks
// that agent there (its best row). Desktop only (the phone has the list).
func (a *App) islandStrip(c *ui.Context, task *store.Task, cands []protocol.Candidate, pick *string) {
	t := a.T
	cur := ""
	for _, cd := range cands {
		if cd.Current {
			cur = cd.Device
		}
	}
	comps := a.computers()
	// Home in the middle, as on the stage.
	ordered := make([]protocol.DeviceView, 0, len(comps))
	var home *protocol.DeviceView
	for i := range comps {
		if comps[i].Home {
			home = &comps[i]
		} else {
			ordered = append(ordered, comps[i])
		}
	}
	if home != nil {
		mid := len(ordered) / 2
		ordered = append(ordered[:mid], append([]protocol.DeviceView{*home}, ordered[mid:]...)...)
	}
	strip := ui.Row(c.Key("isle-strip")).Gap(t.S5).Justify(ui.Center).AlignItems(ui.End).Padding(t.S3, t.S3).
		Radius(t.RadiusMD).Background(t.Isles.Sea).AccessHidden(true)
	strip.Children(func() {
		for i := range ordered {
			dv := &ordered[i]
			ui.Column(c.Key("strip:" + dv.ID)).Gap(t.S1).AlignItems(ui.Center).Children(func() {
				w, h := float32(132), float32(84)
				here := dv.ID == cur
				ui.Box(c.Key("strip-isle:"+dv.ID)).Size(w, h).Draw(func(p *ui.Painter, r ui.Rect) {
					art, _, seat := islandArt(dv.Home)
					if bmp := theme.Clay(art); bmp != nil {
						softEllipse(p, ui.Rect{X: r.X + 6, Y: r.Y + r.H*0.62, W: r.W - 4, H: r.H * 0.42}, ui.RGBA(30, 80, 86, 0.16))
						p.ImageRegion(bmp, ui.Rect{}, ui.Rect{X: r.X, Y: r.Y + r.H*0.12, W: r.W, H: r.H * 0.88}, ui.ImageOptions{})
					}
					dart := deviceArt(dv)
					ds, aspect := deviceSize(dart, dv.Home)
					dw := r.W * ds * 0.62
					dh := dw * aspect
					foot := r.Y + r.H*0.12 + r.H*0.88*seat
					if bmp := theme.Clay(dart); bmp != nil {
						opt := ui.ImageOptions{}
						if dv.State == protocol.DeviceUnreachable {
							opt.Tint = ui.RGBA(255, 255, 255, 0.55)
						}
						p.ImageRegion(bmp, ui.Rect{}, ui.Rect{X: r.X + r.W/2 - dw/2 - 10, Y: foot - dh, W: dw, H: dh}, opt)
					}
					// The task's parcel on the island where it runs (D81's parcel, at the stage's size).
					if here {
						paintParcel(p, ui.Rect{X: r.X + r.W/2 + dw/2 - 6, Y: foot - 17, W: 20, H: 16}, 1.2, t.Isles)
					}
				})
				ui.Row(c).Gap(4).AlignItems(ui.Center).Children(func() {
					seen := map[string]bool{}
					for j := range cands {
						cd := cands[j]
						if cd.Device != dv.ID || cd.Blocked != "" || seen[cd.Harness] {
							continue
						}
						seen[cd.Harness] = true
						if bmp := theme.Clay(coinArt(cd.Harness, false)); bmp != nil {
							coin := ui.Box(c.Key("strip-coin:"+dv.ID+cd.Harness)).Size(28, 28).Cursor(ui.CursorPointer)
							coin.Children(func() { ui.Image(c, bmp).Size(28, 28) })
							if cd.Waits != "" {
								coin.Opacity(0.6)
							}
							coin.Tooltip(a.candName(cd))
							if coin.Clicked() && !cd.Current {
								*pick = candKeyOn(cd)
							}
						}
					}
				})
				col := t.Ink
				if dv.State != protocol.DeviceAwake {
					col = t.InkMuted
				}
				ui.Text(c, dv.Name).FontSize(t.SM).FontWeight(800).TextColor(col)
			})
		}
	})
}

// moveLines is what moving to another computer does, above Go: from its
// saved progress (the branch pushed first), a sign-in there, and, when it
// widens access, the user's Chrome said plainly.
func (a *App) moveLines(c *ui.Context, task *store.Task, chosen protocol.Candidate) {
	t := a.T
	explain := a.L.T("switch.move.plain")
	if task.Place().Kind == "repo" {
		explain = a.L.T("switch.move.explain")
	}
	ui.Text(c.Key("move-explain"), explain).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.45)
	if chosen.NeedsSignIn {
		ui.Text(c.Key("move-signin"), a.L.T("switch.move.signin")).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.45)
	}
	if chosen.Widens {
		ui.Text(c.Key("move-widens"), a.L.T("switch.move.widens")).FontSize(t.SM).FontWeight(800).TextColor(t.Ink).LineHeight(1.45)
	}
}

// paintParcel is D81's clay parcel (the stage's own drawing).
func paintParcel(p *ui.Painter, box ui.Rect, k float32, is theme.IslesTokens) {
	p.Fill(ui.Rect{X: box.X + 1.5*k, Y: box.Y + 2.5*k, W: box.W, H: box.H}, ui.RGBA(120, 72, 30, 0.22), 3*k)
	p.Fill(box, is.ParcelEdge, 3*k)
	p.Fill(ui.Rect{X: box.X + 1.2*k, Y: box.Y + 1.2*k, W: box.W - 2.4*k, H: box.H - 2.4*k}, is.Parcel, 2.4*k)
	p.Fill(ui.Rect{X: box.X + box.W/2 - 1*k, Y: box.Y + 1.2*k, W: 2 * k, H: box.H - 2.4*k}, is.ParcelEdge.Alpha(0.55), 0)
}
