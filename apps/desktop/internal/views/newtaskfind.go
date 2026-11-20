package views

// D203: 找一个文件夹… / Find a folder… on another computer of the home (a
// server home, another worker): its folders one level at a time from its
// home folder (~), repos first with the branch glyph; 用这个文件夹 / Use
// this folder adds it there as a project (D186, D197) and makes it the
// card's place (and picks the agent that waited for a folder there, D202).
// D272: it is 选 {computer} 上已有的文件夹 / Choose a folder on {computer}
// in the add panel (newtaskadd.go); for this Mac that row opens macOS's
// own folder picker instead.

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// ntBrowse is the folder browser in the place list: the computer (a
// device id), the clientId of the ask in flight, and its answer.
type ntBrowse struct {
	device string
	cid    string
	res    *protocol.ServerFrame
}

// startBrowse asks for a folder's subfolders on that computer ("" path:
// its home folder).
func (a *App) startBrowse(device, path string) {
	nt := &a.nt
	a.nextClient++
	cid := fmt.Sprintf("b%d-%d", a.Now().UnixMilli(), a.nextClient)
	nt.browse = &ntBrowse{device: device, cid: cid}
	nt.err, nt.errEmpty = "", false
	a.send(protocol.FolderBrowse{T: "folder_browse", Device: a.deviceArg(device), Path: path, ClientID: cid})
}

// deviceArg is the device a frame names for that computer: "" for the
// home, else its id.
func (a *App) deviceArg(device string) string {
	if d := a.computerOf(device); d != nil {
		if d.Home {
			return ""
		}
		return d.ID
	}
	if device == "local" {
		return ""
	}
	return device
}

// drainBrowse takes the answer to the ask in flight (a late one is dropped).
func (a *App) drainBrowse() {
	f := a.S.FolderBrowse
	if f == nil {
		return
	}
	a.S.FolderBrowse = nil
	if b := a.nt.browse; b != nil && f.ClientID == b.cid {
		b.res = f
	}
}

// useBrowsed adds the folder looked at as a project on that computer.
func (a *App) useBrowsed() {
	nt := &a.nt
	b := nt.browse
	if b == nil || b.res == nil || !b.res.OK || b.res.Path == "" || nt.adding != "" {
		return
	}
	a.nextClient++
	nt.adding = fmt.Sprintf("p%d-%d", a.Now().UnixMilli(), a.nextClient)
	nt.err, nt.errEmpty = "", false
	a.send(protocol.ProjectAdd{T: "project_add", Path: b.res.Path, Device: a.deviceArg(b.device), ClientID: nt.adding})
}

// browsePath is a path there as ~/… from that computer's own home folder.
func browsePath(p, home string) string {
	if home != "" && (p == home || strings.HasPrefix(p, strings.TrimRight(home, "/")+"/")) {
		return "~" + p[len(strings.TrimRight(home, "/")):]
	}
	return tildePath(p)
}

// browseName is the name of the computer being looked through.
func (a *App) browseName() string {
	if b := a.nt.browse; b != nil {
		return a.computerName(b.device)
	}
	return ""
}

// folderBrowser is the place list while it looks through a computer.
func (a *App) folderBrowser(c *ui.Context) {
	t := a.T
	nt := &a.nt
	b := nt.browse
	r := b.res
	line := func(key, s string, col ui.Color) {
		uiText(c.Key(key), s).FontSize(t.XS).TextColor(col).Padding(t.S1, t.S3)
	}
	if r != nil && r.OK && r.Path != "" {
		uiText(c.Key("nt-find-path"), browsePath(r.Path, r.HomeDir)).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkSoft).SingleLine().Padding(0, t.S3, t.S1, t.S3)
	}
	switch {
	case r == nil:
		line("nt-find-wait", a.L.T("newtask.find.loading"), t.InkMuted)
	case !r.OK:
		why := firstNonEmpty(r.Message, a.L.T("newtask.err.unknown"))
		switch r.Reason {
		case "offline":
			why = a.L.T("newtask.find.offline", a.browseName())
		case "outside":
			why = a.L.T("newtask.find.outside")
		case "not_found":
			why = a.L.T("newtask.find.missing")
		case "old":
			why = a.L.T("newtask.old", a.browseName())
		}
		line("nt-find-err", why, t.Failed.Ink)
	}
	if r != nil && r.OK {
		if r.Parent != "" {
			parent := r.Parent
			if a.menuRow(c, "nt-find-up", a.L.T("newtask.find.up"), false, false, func() {
				a.glyph(c, 14, drawUp(t.InkMuted))
				uiText(c, a.L.T("newtask.find.up")).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine()
			}) {
				a.startBrowse(b.device, parent)
			}
		}
		for _, f := range r.Folders {
			f := f
			if a.menuRow(c, "nt-find:"+f.Path, f.Name, false, false, func() {
				if f.Repo {
					a.glyph(c, 14, drawBranch(t.InkMuted))
				} else {
					a.glyph(c, 16, drawFolder(t.InkMuted))
				}
				uiText(c, f.Name).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine()
			}) {
				a.startBrowse(b.device, f.Path)
			}
		}
		if len(r.Folders) == 0 {
			line("nt-find-none", a.L.T("newtask.find.none"), t.InkMuted)
		}
		if r.More {
			line("nt-find-more", a.L.T("newtask.find.more", strconv.Itoa(len(r.Folders))), t.InkMuted)
		}
	}
	a.panelFoot(c, "nt-find-foot", func() {
		if a.button(c, a.L.T("newtask.find.back"), btnText, t.ControlSM, t.Surface) {
			nt.browse = nil
			nt.add = &ntAdd{device: b.device} // D272: back to the ways to add a folder there
		}
	}, func() {
		switch {
		case nt.adding != "":
			uiText(c, a.L.T("newtask.find.adding")).FontSize(t.SM).TextColor(t.InkMuted)
		case r != nil && r.OK && r.Path != r.HomeDir:
			if a.buttonFor(c, a.L.T("newtask.find.use"), browsePath(r.Path, r.HomeDir), btnPrimary, t.ControlSM, t.Surface) {
				a.useBrowsed()
			}
		}
	})
}

// drawUp is an arrow up: the folder above.
func drawUp(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 14
		x, y := r.X, r.Y
		var m ui.Path
		m.MoveTo(x+7*s, y+11.5*s)
		m.LineTo(x+7*s, y+3*s)
		m.MoveTo(x+3.5*s, y+6.5*s)
		m.LineTo(x+7*s, y+3*s)
		m.LineTo(x+10.5*s, y+6.5*s)
		p.StrokePath(&m, 1.6, col)
	}
}
