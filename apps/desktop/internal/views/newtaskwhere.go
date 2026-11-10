package views

import (
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D157 (design/where.md §6.3): New task's computer appears only when there
// is a real choice: No folder with two or more computers, or a repo that is
// on two. It is a part of the Where chip ("不用文件夹 · hel ▾"), opening 在哪台
// 电脑上做 / On which computer. Who lists the agents on that computer, then
// the ones that live only on another, tagged 在 {device} 上; picking one
// moves the computer part with it.

// ntSuggested is the computer the ranking puts first for this place: where
// the best agent that can start now is; else the home.
func (a *App) ntSuggested(cands []protocol.Candidate) string {
	for _, cd := range cands {
		if cd.Blocked == "" && cd.Waits == "" && cd.Device != "" {
			return cd.Device
		}
	}
	for _, d := range a.computers() {
		if d.Home {
			return d.ID
		}
	}
	return ""
}

// ntComputer is the computer the card starts the task on (a device id).
func (a *App) ntComputer(cands []protocol.Candidate) string {
	if a.nt.computer != "" && a.computerOf(a.nt.computer) != nil {
		return a.nt.computer
	}
	return a.ntSuggested(cands)
}

// ntWho is who the card offers on the chosen computer, then an agent that
// lives only on another computer (its best row), with the computer it is on.
func ntWho(cands []protocol.Candidate, comp string) (rows []protocol.Candidate, elsewhere map[string]bool) {
	elsewhere = map[string]bool{}
	here := map[string]bool{}
	for _, cd := range cands {
		if cd.Device == comp {
			rows = append(rows, cd)
			here[cd.Harness] = true
		}
	}
	for _, cd := range cands {
		if cd.Device == comp || here[cd.Harness] || cd.Blocked != "" {
			continue
		}
		here[cd.Harness] = true
		rows = append(rows, cd)
		elsewhere[candKeyOn(cd)] = true
	}
	return rows, elsewhere
}

// computerSetsApart is what sets a computer apart, in a few words.
func (a *App) computerSetsApart(d *protocol.DeviceView) string {
	switch d.State {
	case protocol.DeviceAsleep:
		return a.L.T("newtask.computer.asleep")
	case protocol.DeviceUnreachable:
		return a.L.T("newtask.computer.away")
	}
	if d.AlwaysOn {
		return a.L.T("newtask.computer.always_on")
	}
	for _, ab := range d.Abilities {
		if ab.ID == protocol.AbilityWeb && ab.Where == protocol.WhereChrome {
			return a.L.T("newtask.computer.mac")
		}
	}
	return ""
}

// computerList is 在哪台电脑上做 / On which computer: one row per computer
// with its picture, its name, what sets it apart, the suggested one marked;
// one that can't be reached greyed.
func (a *App) computerList(c *ui.Context, anchor ui.Element, cands []protocol.Candidate, only map[string]bool) {
	t := a.T
	nt := &a.nt
	cur := a.ntComputer(cands)
	sug := a.ntSuggested(cands)
	ui.PopoverBase(c, anchor, &nt.computerOpen, func(panel ui.Element) {
		panel.Margin(t.S2, 0, 0, 0).Width(330).Padding(t.S2).Radius(t.RadiusMD).Background(t.Surface).
			Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Border(1, t.LineSoft).Label(a.L.T("newtask.computer"))
		ui.Text(c, a.L.T("newtask.computer")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Padding(t.S2, t.S3, t.S1, t.S3)
		ui.Column(c).Gap(2).Role(ui.RoleRadioGroup).Children(func() {
			for _, d := range a.computers() {
				d := d
				if only != nil && !only[d.ID] {
					continue
				}
				on := d.ID == cur
				away := d.State == protocol.DeviceUnreachable
				row := ui.Row(c.Key("nt-comp:"+d.ID)).Padding(t.S2, t.S3).Gap(t.S3).Radius(t.RadiusSM).AlignItems(ui.Center).
					Role(ui.RoleRadio).Label(d.Name).AccessSelected(on)
				switch {
				case away:
					row.Opacity(0.5)
				case on:
					row.Background(t.SurfaceSunken).Cursor(ui.CursorPointer).Focusable()
				case row.Hovered():
					row.Background(t.SurfaceSunken.Mix(t.Surface, 0.5)).Cursor(ui.CursorPointer).Focusable()
				default:
					row.Cursor(ui.CursorPointer).Focusable()
				}
				row.Children(func() {
					if bmp := theme.Clay(deviceArt(&d)); bmp != nil {
						ui.Image(c, bmp).Size(40, 32).Shrink(0).AccessHidden(true)
					}
					ui.Column(c).Grow(1).MinWidth(0).Gap(1).AccessHidden(true).Children(func() {
						ui.Text(c, d.Name).FontSize(t.SM).FontWeight(800).TextColor(t.Ink).SingleLine()
						if s := a.computerSetsApart(&d); s != "" {
							ui.Text(c, s).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
						}
					})
					if d.ID == sug {
						ui.Row(c).Padding(t.S1, t.S1+3).Radius(6).Background(t.Highlight).Shrink(0).AccessHidden(true).Children(func() {
							ui.Text(c, a.L.T("newtask.suggested")).FontSize(t.XS).FontWeight(700).TextColor(t.HighlightInk).SingleLine()
						})
					}
					if on {
						a.glyph(c, 14, drawCheck(t.Ink))
					}
				})
				if !away && row.Clicked() {
					nt.computer, nt.computerOpen, nt.pick = d.ID, false, ""
					if d.ID == sug {
						nt.computer = ""
					}
				}
			}
		})
	})
}

// ntDevice is the place's device for the chosen computer ("local" for the home).
func (a *App) ntDevice(id string) string {
	if d := a.computerOf(id); d != nil && !d.Home {
		return d.Name
	}
	return "local"
}
