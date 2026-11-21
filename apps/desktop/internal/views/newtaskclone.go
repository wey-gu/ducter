package views

// D204: 从 Git 地址加… / Add from a Git address… on any computer of the
// home: the address, where it goes there (that computer's Ducter folder,
// its real path), 克隆 / Clone; that computer runs git clone with its own
// sign-in, the home adds the project there and the card starts there
// (picking the agent that waited for a folder there, D202). A computer
// whose Ducter is too old to do it says to update it instead.

import (
	"fmt"
	"strings"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// ntClone is the address field in the place list: the computer it clones
// on (a device id), the address, the clientId of the clone in flight, and
// the line saying why it didn't happen.
type ntClone struct {
	device, address, cid, err string
	focus                     bool
	// access: it failed for access to a GitHub repository (D272: the
	// sign-in is offered, and the clone goes again once signed in).
	access bool
}

// ntFolder is what that computer said of its Ducter folder on the last
// options: its path, or that it is too old to say (nil: not heard).
func (a *App) ntFolder(device string) *protocol.DucterFolderView {
	dev := a.deviceArg(device)
	if dev == "" {
		dev = "local"
	}
	if o := a.S.NewTaskOptions; o != nil {
		for i := range o.DucterFolders {
			if o.DucterFolders[i].Device == dev {
				return &o.DucterFolders[i]
			}
		}
	}
	return nil
}

// isOld: that computer's Ducter can't look through or clone there yet.
func (a *App) isOld(device string) bool {
	f := a.ntFolder(device)
	return f != nil && f.Old
}

// reachable are the home and its reachable workers (only `only` while
// an agent waits for a folder there); old says which kind: those too old
// to look and clone, or the others.
func (a *App) reachable(only string, old bool) []protocol.DeviceView {
	var out []protocol.DeviceView
	for _, d := range a.computers() {
		if only != "" && d.ID != only {
			continue
		}
		if !d.Home && d.State == "unreachable" {
			continue
		}
		if a.isOld(d.ID) != old {
			continue
		}
		out = append(out, d)
	}
	if len(out) == 0 && only == "" && !old && len(a.computers()) == 0 {
		// One computer and Devices not heard yet: the home itself.
		out = append(out, protocol.DeviceView{ID: "local", Name: a.workHome(), Home: true})
	}
	return out
}

// oldRows say, greyed, which computer needs an update before it can look
// or clone there (never a row that does nothing without saying why).
func (a *App) oldRows(c *ui.Context, only string) {
	t := a.T
	for _, d := range a.reachable(only, true) {
		label := a.L.T("newtask.old.row", d.Name)
		a.menuRow(c, "nt-old:"+d.ID, spoken(a.L, label, a.L.T("newtask.old.why")), false, true, func() {
			a.glyph(c, 16, drawPlus(t.InkSoft))
			ui.Column(c).Grow(1).MinWidth(0).Gap(1).Children(func() {
				uiText(c, label).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).SingleLine()
				uiText(c, a.L.T("newtask.old.why")).FontSize(t.XS).TextColor(t.InkMuted)
			})
		})
	}
}

// startClone sends the address to that computer.
func (a *App) startClone() {
	k := a.nt.clone
	if k == nil || k.cid != "" || strings.TrimSpace(k.address) == "" {
		return
	}
	a.nextClient++
	k.cid = fmt.Sprintf("k%d-%d", a.Now().UnixMilli(), a.nextClient)
	k.err = ""
	a.send(protocol.ProjectClone{T: "project_clone", Address: strings.TrimSpace(k.address), Device: a.deviceArg(k.device), ClientID: k.cid})
}

// resendClone asks again for a clone in flight on a new socket (the home
// answers the same clone, by its id).
func (a *App) resendClone() {
	if k := a.nt.clone; k != nil && k.cid != "" {
		a.send(protocol.ProjectClone{T: "project_clone", Address: strings.TrimSpace(k.address), Device: a.deviceArg(k.device), ClientID: k.cid})
	}
}

// cloneWhy is why a clone (or a look) on that computer didn't happen, in
// the user's words.
func (a *App) cloneWhy(reason, message, name string) string {
	switch reason {
	case "invalid", "timeout":
		return a.L.T("newtask.clone.err." + reason)
	case "not_found", "no_access", "network":
		return a.L.T("newtask.clone.err."+reason, name)
	case "offline":
		return a.L.T("newtask.find.offline", name)
	case "old":
		return a.L.T("newtask.old", name)
	}
	return a.L.T("newtask.clone.err.failed", strings.TrimRight(message, ". 。"))
}

// cloneDone takes the answer to the clone in flight: the place, or why.
func (a *App) cloneDone(r protocol.ServerFrame) {
	nt := &a.nt
	k := nt.clone
	if k == nil || k.cid == "" || r.ClientID != k.cid {
		return
	}
	k.cid = ""
	if !r.OK || r.Place == nil {
		name := a.computerName(k.device)
		k.err = a.cloneWhy(r.Reason, r.Message, name)
		// D272: no access to a GitHub repository and no GitHub sign-in there:
		// say so, and offer the sign-in (the clone goes again after it).
		k.access = (r.Reason == "no_access" || r.Reason == "not_found") && githubish(k.address)
		if s := a.ghState(k.device); k.access && (s == nil || s.State != "signed_in") {
			k.err = a.L.T("newtask.clone.err.no_access.gh", name)
			a.askGitHub(k.device)
		}
		return
	}
	nt.clone = nil
	a.pickPlace(*r.Place)
	pl := r.Place.Place
	nt.prefill = &pl
	a.afPlaced(*r.Place) // D455
}

// cloneField is the place list while it takes a Git address.
func (a *App) cloneField(c *ui.Context) {
	t := a.T
	k := a.nt.clone
	name := a.computerName(k.device)
	into := "~/ducter/projects"
	if f := a.ntFolder(k.device); f != nil && f.Path != "" {
		into = tildePath(strings.TrimRight(f.Path, "/") + "/projects")
	}
	busy := k.cid != ""
	in := ui.TextInput(c.Key("nt-clone-in"), &k.address).Placeholder(a.L.T("newtask.clone.placeholder")).Label(a.L.T("newtask.clone.title", name)).
		Height(t.ControlMD).Padding(0, t.S3).Radius(t.RadiusMD).Background(t.Bg).Border(1, t.LineSoft).
		Font(t.Mono).FontSize(t.MonoSM).ReadOnly(busy).Margin(t.S1, t.S2, 0, t.S2).OnSubmit(func() { a.startClone() })
	if in.Changed() {
		k.err, k.access = "", false
		a.nt.ghDone = ""
	}
	if k.focus {
		in.Focus()
		k.focus = false
	}
	uiText(c.Key("nt-clone-where"), a.L.T("newtask.clone.where", into, name)).FontSize(t.XS).TextColor(t.InkMuted).Padding(t.S1, t.S3)
	a.githubLine(c, k)
	if busy {
		ui.Row(c.Key("nt-clone-busy")).Gap(t.S2).AlignItems(ui.Center).Padding(t.S1, t.S3).Children(func() {
			ui.Spinner(c).Size(12, 12)
			uiText(c, a.L.T("newtask.clone.busy")).FontSize(t.XS).TextColor(t.InkMuted)
		})
	}
	if k.err != "" {
		uiText(c.Key("nt-clone-err"), k.err).FontSize(t.XS).TextColor(t.Failed.Ink).Padding(t.S1, t.S3)
		if s := a.ghState(k.device); k.access && !busy && (s == nil || s.State == "signed_out") {
			a.signInButton(c, k.device)
		}
	}
	a.panelFoot(c, "nt-clone-foot", func() {
		if !busy {
			a.panelBack(c, k.device, func() { a.nt.clone = nil })
		}
	}, func() {
		label := a.L.T("newtask.clone.go")
		if busy {
			label = a.L.T("newtask.clone.going")
		}
		if a.buttonFor(c, label, a.L.T("newtask.clone.title", name), btnPrimary, t.ControlSM, t.Surface) && !busy {
			a.startClone()
		}
	})
}
