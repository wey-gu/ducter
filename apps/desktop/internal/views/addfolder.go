package views

// D455: 添加文件夹 / Add a folder, from On hand's project column. One
// sheet: the computer first (the home, each reachable worker, this Mac
// when it is one of them), the one the latest work was on already
// chosen; then the folder there, three ways: 选已有的文件夹 / Choose a
// folder (that computer's own folders, listed by that computer through
// Ducter: its recent projects first, type to narrow or type a path, each
// repo with its origin; this Mac also offers macOS's picker), 从 Git
// 地址克隆 / Clone from a Git address (cloned on that computer, D204),
// 新建文件夹 / New folder (D272). The ways are the New task card's own
// panels (newtaskfind.go, newtaskclone.go, newtaskadd.go); added, the
// sheet closes and On hand shows that project, with where it lives under
// its name.

import (
	"sort"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// addFolderState is the sheet: open, the computer chosen (a device id,
// "local" for the home) and the way (choose | clone | new).
type addFolderState struct {
	open   bool
	device string
	way    string
	// arrived (D457) is the project just added from the sheet and when:
	// its row in On hand's column arrives with a ring that fades.
	arrived   string
	arrivedAt time.Time
}

// arrivalFor is how far the project's arrival has gone (0..1), and
// whether it is still under way.
func (a *App) arrivalFor(name string) (float32, bool) {
	af := &a.addf
	if af.arrived == "" || !strings.EqualFold(af.arrived, name) {
		return 1, false
	}
	p := float32(a.Now().Sub(af.arrivedAt)) / float32(arriveFor)
	if p >= 1 || p < 0 {
		return 1, false
	}
	return p, true
}

// arriveFor is how long a just-added project's ring takes to fade.
const arriveFor = 1800 * time.Millisecond

// OpenAddFolder opens the sheet on the computer the latest work was on.
func (a *App) OpenAddFolder() {
	nt := &a.nt
	nt.browse, nt.clone, nt.newf, nt.add, nt.login = nil, nil, nil, nil, nil
	nt.err, nt.adding = "", ""
	a.addf = addFolderState{open: true, device: a.afDefault()}
	// The recent places on each computer and where each one's Ducter folder is.
	a.send(protocol.TaskNewOptions{T: "task_new_options"})
	a.afWay("choose")
}

// closeAddFolder closes the sheet and drops its panels.
func (a *App) closeAddFolder() {
	nt := &a.nt
	a.addf.open = false
	nt.browse, nt.clone, nt.newf, nt.add, nt.login = nil, nil, nil, nil, nil
	nt.err = ""
}

// afPlaced: a folder was added (chosen, cloned or made) while the sheet
// was open: it closes, and On hand shows that project.
func (a *App) afPlaced(p protocol.PlaceChoice) {
	if !a.addf.open {
		return
	}
	a.closeAddFolder()
	if p.Name != "" {
		a.Local.SetLens(p.Name)
		a.addf.arrived, a.addf.arrivedAt = p.Name, a.Now()
	}
}

// afComputers are the computers a folder can be added on: the reachable
// ones first, then those too old to look through (greyed, they say so).
func (a *App) afComputers() (ok, old []protocol.DeviceView) {
	ok = a.reachable("", false)
	// D457: home first, then as the home lists them.
	sort.SliceStable(ok, func(i, j int) bool { return ok[i].Home && !ok[j].Home })
	return ok, a.reachable("", true)
}

// afStateWord is a computer's one word in the sheet: the home says Ducter
// runs there; the others are awake or asleep.
func (a *App) afStateWord(d protocol.DeviceView) string {
	if d.Home {
		return a.L.T("addfolder.dev.home", a.personaName())
	}
	if d.State == protocol.DeviceAsleep {
		return a.L.T("device.state.asleep")
	}
	return a.L.T("device.state.awake")
}

// afTile is one computer in the sheet (D457): its drawn device, its name
// and its state word; the chosen one raised on an ink ledge, the others
// pressed into the sheet. It reports a click.
func (a *App) afTile(c *ui.Context, d protocol.DeviceView, on bool) bool {
	t := a.T
	word := a.afStateWord(d)
	b := ui.Row(c.Key("af-c:"+d.ID)).Grow(1).Basis(0).MinWidth(0).MinHeight(60).Padding(6, t.S3, 6, 6).Gap(t.S2).
		Radius(t.RadiusMD).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleRadio).
		Label(spoken(a.L, d.Name, word)).AccessSelected(on).Focusable()
	switch {
	case on:
		b.Background(t.Surface).Border(1.5, t.Ink).Shadow(0, 3, 0, 0, t.Ink)
	case b.Hovered():
		b.Background(t.Sunken.Mix(t.Ink, 0.04))
	default:
		b.Background(t.Sunken)
	}
	b.Children(func() {
		if bmp := theme.Clay(deviceArt(&d)); bmp != nil {
			iw, ih := ui.ImageSize(bmp)
			w, h := float32(44), float32(44)
			if iw > 0 && ih > 0 {
				if iw > ih {
					h = 44 * ih / iw
				} else {
					w = 44 * iw / ih
				}
			}
			ui.Box(c.Key("art")).Size(44, 44).Shrink(0).AlignItems(ui.Center).Justify(ui.Center).Children(func() {
				ui.Image(c, bmp).Size(w, h).AccessHidden(true)
			})
		}
		ui.Column(c).Grow(1).MinWidth(0).Gap(1).AccessHidden(true).Children(func() {
			ink := t.InkSoft
			if on {
				ink = t.Ink
			}
			uiText(c, d.Name).FontSize(t.SM).FontWeight(700).TextColor(ink).SingleLine()
			uiText(c, word).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
		})
	})
	return b.Clicked() && !on
}

// afDefault is the computer the latest task with a folder was on, if it
// can take a folder now; else the home.
func (a *App) afDefault() string {
	ok, _ := a.afComputers()
	can := map[string]bool{}
	for _, d := range ok {
		can[d.ID] = true
	}
	var tasks []*store.Task
	for _, x := range a.S.Tasks {
		if pl := x.Place(); (pl.Kind == "repo" || pl.Kind == "folder") && x.Card != nil {
			tasks = append(tasks, x)
		}
	}
	sort.Slice(tasks, func(i, j int) bool { return tasks[i].Card.UpdatedAt > tasks[j].Card.UpdatedAt })
	for _, x := range tasks {
		if id := a.placeComputer(x.Place()); can[id] {
			return id
		}
	}
	for _, d := range ok {
		if d.Home {
			return d.ID
		}
	}
	if len(ok) > 0 {
		return ok[0].ID
	}
	return "local"
}

// afWay opens one way on the chosen computer.
func (a *App) afWay(way string) {
	nt := &a.nt
	af := &a.addf
	af.way = way
	nt.browse, nt.clone, nt.newf, nt.add, nt.login = nil, nil, nil, nil, nil
	nt.err = ""
	switch way {
	case "clone":
		a.openClone(af.device, "")
	case "new":
		nt.newf = &ntNew{device: af.device, focus: true}
	default:
		a.startBrowse(af.device, "")
	}
}

// addFolderSheet is the sheet, while open.
func (a *App) addFolderSheet(c *ui.Context) {
	af := &a.addf
	if !af.open {
		return
	}
	nt := &a.nt
	t := a.T
	w, h := c.Size()
	if w <= 0 {
		w, h = 1040, 760
	}
	title := a.L.T("addfolder.title")
	open := true
	ui.DialogBase(c, &open, func(back, panel ui.Element) {
		back.Background(t.Scrim)
		panel.Width(min(w-2*t.S6, 600)).MaxHeight(sheetBack(c, back, h)).Padding(t.S5+4, t.S6, t.S5, t.S6).Gap(t.S4).Radius(t.RadiusXL).
			Background(t.Surface).Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Label(title)
		a.enter(c, panel)
		a.heading(c, title, t.XL)
		ok, old := a.afComputers()
		// 1. The computer: named only when there is a choice; each its own
		// small clay (D457), home first.
		if len(ok)+len(old) > 1 {
			ui.Column(c.Key("af-computer")).Gap(t.S2).Children(func() {
				uiText(c, a.L.T("addfolder.computer")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Role(ui.RoleHeading)
				ui.Row(c.Key("af-computers")).Gap(t.S2).Role(ui.RoleRadioGroup).Label(a.L.T("addfolder.computer")).Children(func() {
					for _, d := range ok {
						if a.afTile(c, d, d.ID == af.device) {
							af.device = d.ID
							a.afWay(af.way)
						}
					}
				})
				for _, d := range old {
					uiText(c.Key("af-old:"+d.ID), a.L.T("newtask.old", d.Name)).FontSize(t.XS).TextColor(t.InkMuted)
				}
			})
		}
		// 2. The way: choose (the default), clone, new: one segmented track (D457).
		ways := []string{"choose", "clone", "new"}
		sel := 0
		labels := make([]string, len(ways))
		for i, way := range ways {
			labels[i] = a.L.T("addfolder.way." + way)
			if af.way == way {
				sel = i
			}
		}
		if i := a.choices(c, "af-ways", title, labels, sel); i >= 0 {
			a.afWay(ways[i])
		}
		// 3. The folder, in that way, on that computer.
		ui.Column(c.Key("af-body")).Gap(2).MinHeight(0).Shrink(1).Children(func() {
			switch {
			case nt.login != nil:
				a.loginPanel(c, nt.login, "af-gh")
			case nt.newf != nil:
				a.newFolderField(c)
			case nt.clone != nil:
				a.cloneField(c)
			case nt.browse != nil:
				a.folderBrowser(c)
			}
			if nt.err != "" {
				uiText(c.Key("af-err"), nt.err).FontSize(t.XS).TextColor(t.Failed.Ink).Padding(t.S1, t.S3)
			}
		})
	})
	if !open {
		a.closeAddFolder()
	}
}

// panelBack is a panel's quiet action: on the New task card 返回 / Back
// to the ways to add a folder there; in On hand's sheet (D455), whose
// ways sit above it, 取消 / Cancel.
func (a *App) panelBack(c *ui.Context, device string, drop func()) {
	t := a.T
	if a.addf.open {
		if a.button(c, a.L.T("addfolder.cancel"), btnText, t.ControlSM, t.Surface) {
			a.closeAddFolder()
		}
		return
	}
	if a.button(c, a.L.T("newtask.find.back"), btnText, t.ControlSM, t.Surface) {
		drop()
		a.nt.add = &ntAdd{device: device}
	}
}
