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

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// addFolderState is the sheet: open, the computer chosen (a device id,
// "local" for the home) and the way (choose | clone | new).
type addFolderState struct {
	open   bool
	device string
	way    string
}

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
	}
}

// afComputers are the computers a folder can be added on: the reachable
// ones first, then those too old to look through (greyed, they say so).
func (a *App) afComputers() (ok, old []protocol.DeviceView) {
	return a.reachable("", false), a.reachable("", true)
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
		// 1. The computer: named only when there is a choice.
		if len(ok)+len(old) > 1 {
			ui.Column(c.Key("af-computer")).Gap(t.S2).Children(func() {
				uiText(c, a.L.T("addfolder.computer")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Role(ui.RoleHeading)
				ui.Row(c.Key("af-computers")).Gap(t.S2).Wrap().Role(ui.RoleRadioGroup).Label(a.L.T("addfolder.computer")).Children(func() {
					for _, d := range ok {
						d := d
						if a.choice(c, "af-c:"+d.ID, d.Name, d.ID == af.device, "") {
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
		// 2. The way: choose (the default), clone, new.
		ui.Row(c.Key("af-ways")).Gap(t.S2).Wrap().Role(ui.RoleRadioGroup).Label(title).Children(func() {
			for _, way := range []string{"choose", "clone", "new"} {
				if a.choice(c, "af-w:"+way, a.L.T("addfolder.way."+way), af.way == way, "") {
					a.afWay(way)
				}
			}
		})
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
