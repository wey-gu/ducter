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
	// path is the folder asked for; row the row the keys are on, plus
	// one (0: none); lastOk and lastHome where it last looked and that
	// computer's home folder (D457: a missing folder offers the way back).
	path             string
	row              int
	lastOk, lastHome string
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
	nb := &ntBrowse{device: device, cid: cid, filter: filter, focus: true, path: path}
	if b := nt.browse; b != nil && b.device == device {
		nb.lastOk, nb.lastHome = b.lastOk, b.lastHome
	}
	nt.browse = nb
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
		if f.OK && f.Path != "" {
			b.lastOk, b.lastHome = f.Path, f.HomeDir
		}
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
// D457: an instrument: where it is as a breadcrumb (each part a step
// back), the rows walked with ↑↓ and Return, ⌘↑ up a level, ⌘Return
// adds; a row says what it is (a repo's origin, when a recent one was
// last used, that it is already a project); a missing folder, a computer
// away or an empty folder each says the way on.
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
	// 1. Where it is: the breadcrumb, and a repo's origin where it is opened.
	ui.Row(c.Key("nt-find-head")).Gap(t.S3).AlignItems(ui.Center).Padding(0, t.S2, t.S1, t.S2).Children(func() {
		ui.Row(c.Key("nt-crumbs")).Grow(1).MinWidth(0).Gap(0).AlignItems(ui.Center).Label(a.L.T("addfolder.crumbs")).Children(func() {
			if r == nil || !r.OK || r.Path == "" {
				where := "~"
				if b.lastOk != "" {
					where = browsePath(b.lastOk, home)
				}
				uiText(c, where).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkMuted).SingleLine()
				return
			}
			cr := crumbsOf(r.Path, r.HomeDir)
			for i, k := range cr {
				k := k
				if i > 0 {
					uiText(c.Key(fmt.Sprint("sl", i)), "/").Font(t.Mono).FontSize(t.MonoSM).TextColor(t.Faint).Padding(0, 3).AccessHidden(true)
				}
				if i == len(cr)-1 {
					uiText(c.Key(fmt.Sprint("cr", i)), k.label).Font(t.Mono).FontSize(t.MonoSM).FontWeight(700).TextColor(t.Ink).SingleLine().Padding(2, 3)
					continue
				}
				cb := ui.Box(c.Key(fmt.Sprint("cr", i))).Padding(2, 4).Radius(t.RadiusXS).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(k.label).Focusable()
				col := t.InkMuted
				if cb.Hovered() {
					cb.Background(t.Sunken)
					col = t.Ink
				}
				cb.Children(func() {
					uiText(c, k.label).Font(t.Mono).FontSize(t.MonoSM).TextColor(col).SingleLine().AccessHidden(true)
				})
				if cb.Clicked() {
					a.startBrowse(b.device, k.path)
				}
			}
		})
		if r != nil && r.OK && r.InRepo != nil && r.InRepo.Root == r.Path && r.InRepo.Remote != "" {
			uiText(c.Key("nt-find-remote"), r.InRepo.Remote).Font(t.Mono).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(1).MinWidth(0)
		}
		// This Mac's own folders can also be picked with macOS's picker.
		if d := a.computerOf(b.device); d != nil && a.pickerHere(*d) {
			if a.quietButton(c, "nt-finder", a.L.T("addfolder.finder"), "", false, 0) {
				a.addFolder()
			}
		}
	})
	in := ui.TextInput(c.Key("nt-find-in"), &b.filter).Placeholder(a.L.T("addfolder.filter")).Label(a.L.T("addfolder.filter")).
		Height(t.ControlMD).Padding(0, t.S3).Radius(t.RadiusMD).Background(t.Bg).Border(1, t.LineSoft).
		Font(t.Mono).FontSize(t.MonoSM).Margin(t.S1, t.S2, t.S1, t.S2).OnSubmit(func() { a.browseSubmit() })
	dir, needle := browseNeedle(b.filter, shown, home)
	if in.Changed() {
		b.row = 0
		if dir != "" && r != nil {
			a.startBrowseKeep(b.device, dir, b.filter)
			b = nt.browse
		}
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
	rows := a.browseRows(b, needle, shownFolders)
	// The keys (D457): ↑↓ the rows, ⌘↑ up a level, ⌘Return adds.
	switch {
	case c.Shortcut(ui.Cmd, ui.KeyUp):
		if r != nil && r.OK && r.Parent != "" {
			a.startBrowse(b.device, r.Parent)
		}
	case c.Shortcut(ui.Cmd, ui.KeyEnter):
		if r != nil && r.OK && r.Path != r.HomeDir {
			a.useBrowsed()
		}
	case len(rows) > 0 && c.Shortcut(0, ui.KeyDown):
		b.row = b.row%len(rows) + 1
	case len(rows) > 0 && c.Shortcut(0, ui.KeyUp):
		if b.row <= 1 {
			b.row = len(rows)
		} else {
			b.row--
		}
	}
	if b.row > len(rows) {
		b.row = 0
	}
	switch {
	case r == nil:
		line("nt-find-wait", a.L.T("newtask.find.loading"), t.InkMuted)
	case !r.OK:
		a.browseTrouble(c, b, r)
	}
	if r != nil && r.OK {
		recent := 0
		for _, row := range rows {
			if row.recent {
				recent++
			}
		}
		for i, row := range rows {
			row := row
			if i == 0 && recent > 0 {
				uiText(c.Key("nt-recent-h"), a.L.T("addfolder.recent")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Padding(t.S2, t.S3, t.S1, t.S3).Role(ui.RoleHeading)
			}
			if i == recent && recent > 0 {
				ui.Box(c.Key("nt-recent-rule")).Height(1).Background(t.LineSoft).Margin(t.S1, t.S2)
			}
			if a.browseRow(c, row, b.row == i+1) {
				a.startBrowse(b.device, row.path)
			}
		}
		switch {
		case len(r.Folders) == 0 && r.Path == r.HomeDir:
			line("nt-find-none", a.L.T("newtask.find.none"), t.InkMuted)
		case len(r.Folders) == 0:
			line("nt-find-none", a.L.T("addfolder.empty"), t.InkSoft)
		case len(shownFolders) == 0:
			line("nt-find-nomatch", a.L.T("addfolder.nomatch", needle), t.InkSoft)
			if s := strings.TrimSpace(b.filter); !strings.HasPrefix(s, "/") && !strings.HasPrefix(s, "~") {
				line("nt-find-hint", a.L.T("addfolder.path.hint"), t.InkMuted)
			}
		}
		if r.More {
			line("nt-find-more", a.L.T("newtask.find.more", strconv.Itoa(len(r.Folders))), t.InkMuted)
		}
		// Inside a repo: adding adds the whole repo (D186), said before the tap.
		if r.InRepo != nil && r.InRepo.Root != r.Path {
			ui.Box(c.Key("nt-find-inrepo")).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.Waiting.Surface).Margin(t.S1, t.S1, 0, t.S1).Children(func() {
				uiText(c, a.L.T("addfolder.inrepo", r.InRepo.Name)).FontSize(t.XS).TextColor(t.Waiting.Ink)
			})
		}
	}
	a.panelFoot(c, "nt-find-foot", func() {
		a.browseKeys(c)
	}, func() {
		a.panelBack(c, b.device, func() { nt.browse = nil })
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
				// D457: what will happen, and on which computer when there is a choice.
				if ok, old := a.afComputers(); len(ok)+len(old) > 1 {
					label = a.L.T("addfolder.add.on", name, a.browseName())
				} else {
					label = a.L.T("addfolder.add", name)
				}
			}
			if a.buttonFor(c, label, browsePath(r.Path, r.HomeDir), btnPrimary, t.ControlSM, t.Surface) {
				a.useBrowsed()
			}
		case r != nil && r.OK && a.addf.open:
			uiText(c, a.L.T("addfolder.pick")).FontSize(t.XS).TextColor(t.InkMuted)
		}
	})
}

// browseRow is one row of the browser: what the keys or a click go into.
type browseRow struct {
	path, name, line, when  string
	repo, recent, up, added bool
}

// browseRows are the rows in order: the recent folders on this computer
// at the start, the step up, then the folder's own subfolders.
func (a *App) browseRows(b *ntBrowse, needle string, folders []protocol.BrowseFolder) []browseRow {
	r := b.res
	if r == nil || !r.OK {
		return nil
	}
	var rows []browseRow
	known := map[string]bool{}
	for _, p := range a.recentOn(b.device) {
		if !p.Found {
			known[placePath(p.Place)] = true
		}
	}
	if r.Path == r.HomeDir || (len(r.Roots) > 0 && r.Parent == "") {
		for _, p := range a.recentOn(b.device) {
			if matches(p.Name, needle) && len(rows) < 5 {
				path := placePath(p.Place)
				line := p.Remote
				if line == "" {
					line = browsePath(path, r.HomeDir)
				}
				rows = append(rows, browseRow{path: path, name: p.Name, line: line, when: a.ago(p.UsedAt), repo: p.Place.Kind == "repo", recent: true})
			}
		}
	}
	if r.Parent != "" && needle == "" {
		rows = append(rows, browseRow{path: r.Parent, name: a.L.T("newtask.find.up"), up: true})
	}
	for _, f := range folders {
		rows = append(rows, browseRow{path: f.Path, name: f.Name, line: f.Remote, repo: f.Repo, added: known[f.Path]})
	}
	return rows
}

// browseRow draws one row: its mark (a repo's in the accent's tint), its
// name over its origin or path, when it was last used or that it is
// already a project, and a chevron; at is the row the keys are on.
func (a *App) browseRow(c *ui.Context, row browseRow, at bool) bool {
	t := a.T
	key := "nt-find:" + row.path
	if row.recent {
		key = "nt-recent:" + row.path
	}
	el := ui.Row(c.Key(key)).MinHeight(44).Padding(5, t.S2, 5, 6).Gap(t.S3).Radius(t.RadiusSM).AlignItems(ui.Center).
		Role(ui.RoleButton).Label(row.name).Cursor(ui.CursorPointer).Focusable()
	if at || el.Hovered() {
		el.Background(t.Sunken)
	}
	el.Children(func() {
		mark := ui.Box(c.Key("mark")).Size(30, 30).Radius(t.RadiusXS).AlignItems(ui.Center).Justify(ui.Center).Shrink(0)
		switch {
		case row.up:
		case row.repo:
			mark.Background(t.Accent.Mix(t.Surface, 0.84))
		case at:
			mark.Background(t.Surface)
		default:
			mark.Background(t.Sunken)
		}
		mark.Children(func() {
			switch {
			case row.up:
				a.glyph(c, 14, drawUp(t.InkMuted))
			case row.repo:
				a.glyph(c, 14, drawBranch(t.PressAccent.Color))
			default:
				a.glyph(c, 16, drawFolder(t.InkMuted))
			}
		})
		ui.Column(c).Grow(1).MinWidth(0).Gap(1).AccessHidden(true).Children(func() {
			uiText(c, row.name).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine()
			if row.line != "" {
				uiText(c, row.line).Font(t.Mono).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
			}
		})
		if row.when != "" {
			uiText(c.Key("when"), row.when).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").Shrink(0)
		}
		if row.added {
			ui.Box(c.Key("tag")).Padding(2, t.S2).Radius(t.Pill).Background(t.Done.Surface).Shrink(0).Children(func() {
				uiText(c, a.L.T("addfolder.added")).FontSize(t.XS).FontWeight(600).TextColor(t.Done.Ink)
			})
		}
		if !row.up {
			col := t.Faint
			if at {
				col = t.Ink
			}
			a.glyph(c, 12, drawChevron(col, false))
		}
	})
	return el.Clicked()
}

// browseTrouble says why a folder can't be shown and the one way on: back
// to where it last looked, or over to the home when this one is away.
func (a *App) browseTrouble(c *ui.Context, b *ntBrowse, r *protocol.ServerFrame) {
	t := a.T
	name := a.browseName()
	why := firstNonEmpty(r.Message, a.L.T("newtask.err.unknown"))
	var act string
	var do func()
	switch r.Reason {
	case "offline", "old":
		why = a.L.T("newtask.find.offline", name)
		if r.Reason == "old" {
			why = a.L.T("newtask.old", name)
		}
		ok, _ := a.afComputers()
		for _, d := range ok {
			if d.Home && d.ID != b.device && a.addf.open {
				d := d
				act, do = a.L.T("addfolder.switch", d.Name), func() { a.addf.device = d.ID; a.afWay(a.addf.way) }
			}
		}
	case "outside":
		why = a.L.T("newtask.find.outside")
	case "not_found":
		why = a.L.T("newtask.find.missing")
		if b.path != "" {
			why = a.L.T("addfolder.missing", name, browsePath(b.path, b.lastHome))
		}
	}
	if r.Reason != "offline" && r.Reason != "old" && b.lastOk != "" {
		last := b.lastOk
		act, do = a.L.T("addfolder.back.to", browsePath(last, b.lastHome)), func() { a.startBrowse(b.device, last) }
	}
	ui.Column(c.Key("nt-find-err")).Gap(t.S2).Padding(t.S3).Radius(t.RadiusSM).Background(t.Failed.Surface).Margin(t.S1).AlignItems(ui.Start).Children(func() {
		uiText(c, why).FontSize(t.SM).FontWeight(600).TextColor(t.Failed.Ink)
		if act != "" && a.button(c, act, btnSecondary, t.ControlSM, t.Failed.Surface) {
			do()
		}
	})
}

// browseKeys are the browser's keys at the foot, drawn (a wide pointer's
// window only has a keyboard; the sheet says them once, quietly).
func (a *App) browseKeys(c *ui.Context) {
	t := a.T
	ui.Row(c.Key("nt-keys")).Gap(t.S3).AlignItems(ui.Center).Shrink(1).MinWidth(0).AccessHidden(true).Children(func() {
		for _, k := range []struct {
			caps []string
			word string
		}{
			{[]string{"↑", "↓"}, "addfolder.keys.move"},
			{[]string{"\r"}, "addfolder.keys.open"},
			{[]string{"⌘↑"}, "addfolder.keys.up"},
		} {
			ui.Row(c.Key("k:" + k.word)).Gap(3).AlignItems(ui.Center).Shrink(0).Children(func() {
				for _, cap := range k.caps {
					a.keycap(c, k.word+cap, cap)
				}
				uiText(c, a.L.T(k.word)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
			})
		}
	})
}

// crumb is one part of the browser's breadcrumb and where it goes.
type crumb struct{ label, path string }

// crumbsOf are a path's parts: ~ and what follows inside the home
// folder, else from /.
func crumbsOf(path, home string) []crumb {
	h := strings.TrimRight(home, "/")
	inHome := h != "" && (path == h || strings.HasPrefix(path, h+"/"))
	out := []crumb{{"/", "/"}}
	at, rest := "", path
	if inHome {
		out = []crumb{{"~", h}}
		at, rest = h, path[len(h):]
	}
	for _, part := range strings.Split(rest, "/") {
		if part == "" {
			continue
		}
		at += "/" + part
		out = append(out, crumb{part, at})
	}
	return out
}

// browseSubmit is Return in the browser's field: the row the keys are on,
// else, with one folder left, it goes into it.
func (a *App) browseSubmit() {
	b := a.nt.browse
	if b == nil || b.res == nil || !b.res.OK || a.nt.adding != "" {
		return
	}
	_, needle := browseNeedle(b.filter, b.res.Path, b.res.HomeDir)
	var shown []protocol.BrowseFolder
	for _, f := range b.res.Folders {
		if matches(f.Name, needle) {
			shown = append(shown, f)
		}
	}
	if rows := a.browseRows(b, needle, shown); b.row > 0 && b.row <= len(rows) {
		a.startBrowse(b.device, rows[b.row-1].path)
		return
	}
	if len(shown) == 1 {
		a.startBrowse(b.device, shown[0].Path)
	}
}

// folderRowBody is one folder in a list of them: the branch glyph for a
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
