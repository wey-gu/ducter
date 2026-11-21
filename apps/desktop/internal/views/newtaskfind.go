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
	// filter (D455) is what is typed over the list: a name to narrow it
	// to, or a path; focus puts the caret there on the next frame.
	filter string
	focus  bool
}

// startBrowse asks for a folder's subfolders on that computer ("" path:
// its home folder).
func (a *App) startBrowse(device, path string) {
	a.startBrowseKeep(device, path, "")
}

// startBrowseKeep is startBrowse keeping what is typed (a path being
// typed lists each folder it passes through, D455).
func (a *App) startBrowseKeep(device, path, filter string) {
	nt := &a.nt
	a.nextClient++
	cid := fmt.Sprintf("b%d-%d", a.Now().UnixMilli(), a.nextClient)
	nt.browse = &ntBrowse{device: device, cid: cid, filter: filter, focus: true}
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

// browseNeedle reads what is typed over the browser (D455): a path (it
// starts with / or ~) is the folder to list, ending in what to narrow it
// to; anything else narrows the folder shown. dir is "" when the folder
// shown is the one to narrow.
func browseNeedle(typed, shown, home string) (dir, needle string) {
	s := strings.TrimSpace(typed)
	if !strings.HasPrefix(s, "/") && !strings.HasPrefix(s, "~") {
		return "", s
	}
	if s == "~" {
		s = "~/"
	}
	if strings.HasPrefix(s, "~/") && home != "" {
		s = strings.TrimRight(home, "/") + s[1:]
	}
	i := strings.LastIndex(s, "/")
	dir, needle = s[:i], s[i+1:]
	if dir == "" {
		dir = "/"
	}
	if strings.TrimRight(dir, "/") == strings.TrimRight(shown, "/") {
		dir = ""
	}
	return dir, needle
}

// matches: the name holds the needle (any case).
func matches(name, needle string) bool {
	return needle == "" || strings.Contains(strings.ToLower(name), strings.ToLower(needle))
}

// recentOn are the folders tasks used and projects added or found on
// that computer (the New task options), most recent first (D455).
func (a *App) recentOn(device string) []protocol.PlaceChoice {
	var out []protocol.PlaceChoice
	if o := a.S.NewTaskOptions; o != nil {
		for _, p := range o.Places {
			if (p.Place.Kind == "repo" || p.Place.Kind == "folder") && a.placeComputer(p.Place) == a.placeComputer(protocol.Place{Kind: p.Place.Kind, Device: device}) {
				out = append(out, p)
			}
		}
	}
	return out
}

// folderBrowser is the place list while it looks through a computer:
// a field to narrow it or type a path (D455), its recent folders first,
// then the folder's own subfolders, each repo with its origin.
func (a *App) folderBrowser(c *ui.Context) {
	t := a.T
	nt := &a.nt
	b := nt.browse
	r := b.res
	line := func(key, s string, col ui.Color) {
		uiText(c.Key(key), s).FontSize(t.XS).TextColor(col).Padding(t.S1, t.S3)
	}
	home, shown := "", ""
	if r != nil && r.OK {
		home, shown = r.HomeDir, r.Path
	}
	in := ui.TextInput(c.Key("nt-find-in"), &b.filter).Placeholder(a.L.T("addfolder.filter")).Label(a.L.T("addfolder.filter")).
		Height(t.ControlMD).Padding(0, t.S3).Radius(t.RadiusMD).Background(t.Bg).Border(1, t.LineSoft).
		Font(t.Mono).FontSize(t.MonoSM).Margin(t.S1, t.S2, t.S1, t.S2).OnSubmit(func() { a.browseSubmit() })
	dir, needle := browseNeedle(b.filter, shown, home)
	if in.Changed() && dir != "" && r != nil {
		a.startBrowseKeep(b.device, dir, b.filter)
		b = nt.browse
	}
	if b.focus {
		in.Focus()
		b.focus = false
	}
	var shownFolders []protocol.BrowseFolder
	if r != nil && r.OK {
		for _, f := range r.Folders {
			if matches(f.Name, needle) {
				shownFolders = append(shownFolders, f)
			}
		}
	}
	ui.Row(c.Key("nt-find-head")).Gap(t.S2).AlignItems(ui.Center).Padding(0, t.S3, t.S1, t.S3).Children(func() {
		if r != nil && r.OK && r.Path != "" {
			ui.Column(c.Key("nt-find-at")).Grow(1).MinWidth(0).Gap(1).Children(func() {
				uiText(c.Key("nt-find-path"), browsePath(r.Path, r.HomeDir)).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkSoft).SingleLine()
				// D455: a repo says its origin where it is opened.
				if r.InRepo != nil && r.InRepo.Root == r.Path && r.InRepo.Remote != "" {
					uiText(c.Key("nt-find-remote"), r.InRepo.Remote).Font(t.Mono).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
				}
			})
		} else {
			ui.Box(c).Grow(1)
		}
		// This Mac's own folders can also be picked with macOS's picker.
		if d := a.computerOf(b.device); d != nil && a.pickerHere(*d) {
			if a.quietButton(c, "nt-finder", a.L.T("addfolder.finder"), "", false, 0) {
				a.addFolder()
			}
		}
	})
	// The roots this computer allows, when it set more than its home folder.
	if r != nil && r.OK && len(r.Roots) > 1 {
		ui.Row(c.Key("nt-roots")).Gap(t.S2).Wrap().Padding(0, t.S2, t.S1, t.S2).Children(func() {
			for _, root := range r.Roots {
				root := root
				on := r.Path == root || strings.HasPrefix(r.Path, strings.TrimRight(root, "/")+"/")
				if a.choice(c, "nt-root:"+root, browsePath(root, r.HomeDir), on, "") {
					a.startBrowse(b.device, root)
				}
			}
		})
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
		// D455: where the recent work on this computer is, first, at the start.
		if r.Path == r.HomeDir || (len(r.Roots) > 0 && r.Parent == "") {
			var recent []protocol.PlaceChoice
			for _, p := range a.recentOn(b.device) {
				if matches(p.Name, needle) && len(recent) < 5 {
					recent = append(recent, p)
				}
			}
			if len(recent) > 0 {
				uiText(c.Key("nt-recent-h"), a.L.T("addfolder.recent")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Padding(t.S2, t.S3, t.S1, t.S3).Role(ui.RoleHeading)
				for _, p := range recent {
					p := p
					path := placePath(p.Place)
					if a.menuRow(c, "nt-recent:"+path, p.Name, false, false, func() {
						a.folderRowBody(c, p.Name, p.Remote, browsePath(path, r.HomeDir), p.Place.Kind == "repo")
					}) {
						a.startBrowse(b.device, path)
					}
				}
				ui.Box(c.Key("nt-recent-rule")).Height(1).Background(t.LineSoft).Margin(t.S1, t.S2)
			}
		}
		if r.Parent != "" && needle == "" {
			parent := r.Parent
			if a.menuRow(c, "nt-find-up", a.L.T("newtask.find.up"), false, false, func() {
				a.glyph(c, 14, drawUp(t.InkMuted))
				uiText(c, a.L.T("newtask.find.up")).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine()
			}) {
				a.startBrowse(b.device, parent)
			}
		}
		for _, f := range shownFolders {
			f := f
			if a.menuRow(c, "nt-find:"+f.Path, f.Name, false, false, func() {
				a.folderRowBody(c, f.Name, f.Remote, "", f.Repo)
			}) {
				a.startBrowse(b.device, f.Path)
			}
		}
		switch {
		case len(r.Folders) == 0:
			line("nt-find-none", a.L.T("newtask.find.none"), t.InkMuted)
		case len(shownFolders) == 0:
			line("nt-find-nomatch", a.L.T("addfolder.nomatch", needle), t.InkMuted)
		}
		if r.More {
			line("nt-find-more", a.L.T("newtask.find.more", strconv.Itoa(len(r.Folders))), t.InkMuted)
		}
		// Inside a repo: adding adds the whole repo (D186), said before the tap.
		if r.InRepo != nil && r.InRepo.Root != r.Path {
			line("nt-find-inrepo", a.L.T("addfolder.inrepo", r.InRepo.Name), t.InkMuted)
		}
	}
	a.panelFoot(c, "nt-find-foot", func() {
		a.panelBack(c, b.device, func() { nt.browse = nil })
	}, func() {
		switch {
		case nt.adding != "":
			uiText(c, a.L.T("newtask.find.adding")).FontSize(t.SM).TextColor(t.InkMuted)
		case r != nil && r.OK && r.Path != r.HomeDir:
			label := a.L.T("newtask.find.use")
			if a.addf.open {
				name := lastPath(r.Path)
				if r.InRepo != nil {
					name = r.InRepo.Name
				}
				label = a.L.T("addfolder.add", name)
			}
			if a.buttonFor(c, label, browsePath(r.Path, r.HomeDir), btnPrimary, t.ControlSM, t.Surface) {
				a.useBrowsed()
			}
		}
	})
}

// browseSubmit is Return in the browser's field: with one folder left,
// it goes into it.
func (a *App) browseSubmit() {
	b := a.nt.browse
	if b == nil || b.res == nil || !b.res.OK {
		return
	}
	_, needle := browseNeedle(b.filter, b.res.Path, b.res.HomeDir)
	var only *protocol.BrowseFolder
	for i, f := range b.res.Folders {
		if matches(f.Name, needle) {
			if only != nil {
				return
			}
			only = &b.res.Folders[i]
		}
	}
	if only != nil {
		a.startBrowse(b.device, only.Path)
	}
}

// folderRowBody is one folder in the browser: the branch glyph for a
// repo, its name, and under it its origin (D455) or where it is.
func (a *App) folderRowBody(c *ui.Context, name, remote, where string, repo bool) {
	t := a.T
	if repo {
		a.glyph(c, 14, drawBranch(t.InkMuted))
	} else {
		a.glyph(c, 16, drawFolder(t.InkMuted))
	}
	ui.Column(c).Grow(1).MinWidth(0).Gap(1).Children(func() {
		uiText(c, name).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine()
		if remote != "" {
			uiText(c, remote).Font(t.Mono).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
		} else if where != "" {
			uiText(c, where).Font(t.Mono).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
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
