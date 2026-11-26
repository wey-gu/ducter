package views

// D611: where each computer's Ducter folder lives. One shared rule row (D592's editRow): the
// computer's real path in mono, the whole row the button. Open, it offers macOS's own name
// (~/Ducter when the folder is a lowercase ~/ducter), 选一个位置… (this Mac's own folder picker;
// a path field for another computer), and 在访达中显示 for this Mac. A move with tasks working
// there lists their titles and waits; a finished move leaves one plain line. DUCTER_FOLDER is
// read-only: the row says so and doesn't open.

import (
	"fmt"
	"os"
	"path"
	"runtime"
	"strings"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

type folderRowState struct {
	open  bool
	busy  bool
	cid   string
	err   string
	done  string
	tasks []protocol.FolderTask
	typed string
	focus bool
}

func (a *App) folderState(device string) *folderRowState {
	if a.settings.folders == nil {
		a.settings.folders = map[string]*folderRowState{}
	}
	st := a.settings.folders[device]
	if st == nil {
		st = &folderRowState{}
		a.settings.folders[device] = st
	}
	return st
}

// folderMove asks the home to move that computer's Ducter folder. One at a time per computer.
func (a *App) folderMove(device, to string) {
	st := a.folderState(device)
	if st.busy {
		return
	}
	to = strings.TrimSpace(to)
	if to == "" {
		st.err, st.tasks, st.done = a.L.T("settings.folder.err.invalid"), nil, ""
		return
	}
	a.nextClient++
	st.cid = fmt.Sprintf("fd%d-%d", a.Now().UnixMilli(), a.nextClient)
	st.busy, st.err, st.tasks, st.done = true, "", nil, ""
	a.send(protocol.FolderChangeReq{T: "folder_change", Path: to, Device: a.deviceArg(device), ClientID: st.cid})
}

// drainFolder takes the folder_change answer in flight, if it is this row's.
func (a *App) drainFolder() {
	f := a.S.FolderChange
	if f == nil {
		return
	}
	a.S.FolderChange = nil
	for _, st := range a.settings.folders {
		if st.cid == "" || st.cid != f.ClientID {
			continue
		}
		st.cid, st.busy = "", false
		if !f.OK {
			st.done = ""
			if f.Reason == "tasks_running" {
				st.tasks = f.FolderTasks
				st.err = ""
				st.open = true
				return
			}
			st.tasks = nil
			st.err = a.folderWhy(f)
			return
		}
		st.tasks, st.err = nil, ""
		if f.Path != "" {
			st.done = a.L.T("settings.folder.done", tildePath(f.Path), f.Projects, f.Worktrees)
			st.typed = f.Path
		}
		st.open = false
		return
	}
}

// folderWhy is a refused move in the person's words.
func (a *App) folderWhy(f *protocol.ServerFrame) string {
	switch f.Reason {
	case "env":
		return a.L.T("settings.folder.env")
	case "exists":
		return a.L.T("settings.folder.err.exists")
	case "inside":
		return a.L.T("settings.folder.err.inside")
	case "data":
		return a.L.T("settings.folder.err.data")
	case "cross_device":
		return a.L.T("settings.folder.err.cross")
	case "offline":
		return a.L.T("settings.folder.err.offline")
	case "old":
		return a.L.T("settings.folder.err.old")
	case "invalid", "not_dir":
		return a.L.T("settings.folder.err.invalid")
	case "busy":
		return a.L.T("settings.folder.err.busy")
	}
	if f.Message != "" {
		return a.L.T("settings.folder.err.failed", strings.TrimRight(f.Message, ". 。"))
	}
	return a.L.T("settings.folder.err.failed", "")
}

// folderRow is one computer's Ducter folder row. last: no hairline under it.
func (a *App) folderRuleRow(c *ui.Context, dv *protocol.DeviceView, last bool) {
	a.drainFolder()
	st := a.folderState(dv.ID)
	if dv.Folder == nil {
		// A Ducter too old to say where its folder is: no row rather than a guessed path.
		return
	}
	env := dv.Folder.Why == "env"
	values := []string{tildePath(dv.Folder.Path)}
	muted := ""
	if env {
		muted = a.L.T("settings.folder.env")
	}
	if st.done != "" {
		muted = st.done
	}
	if st.busy {
		values = []string{a.L.T("settings.folder.moving")}
		muted = ""
	}
	o := editRowOpts{
		key:         "folder:" + dv.ID,
		label:       a.L.T("settings.folder.row"),
		values:      values,
		muted:       muted,
		can:         !env && !st.busy,
		open:        st.open && !env,
		saving:      st.busy,
		saveLabel:   a.L.T("settings.folder.move"),
		savingLabel: a.L.T("settings.folder.moving"),
		mono:        !st.busy,
		last:        last,
		about:       tildePath(dv.Folder.Path),
		onSave:      func() { a.folderMove(dv.ID, st.typed) },
		onOpen: func() {
			st.open = true
			st.err, st.tasks = "", nil
			st.typed = dv.Folder.Path
			st.focus = true
		},
		onCancel: func() {
			if !st.busy {
				st.open = false
				st.err, st.tasks = "", nil
			}
		},
		editor: func() { a.folderEditor(c, dv, st) },
	}
	a.editRow(c, o)
}

// folderEditor is the open row's choices.
func (a *App) folderEditor(c *ui.Context, dv *protocol.DeviceView, st *folderRowState) {
	t := a.T
	if st.busy {
		ui.Row(c.Key("fd-busy")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			ui.Spinner(c).Size(12, 12)
			uiText(c, a.L.T("settings.folder.moving")).FontSize(t.SM).TextColor(t.InkMuted).Role(ui.RoleStatus)
		})
		return
	}
	if len(st.tasks) > 0 {
		ui.Column(c.Key("fd-tasks")).Gap(t.S1).Children(func() {
			for i, task := range st.tasks {
				uiText(c.Key(fmt.Sprint("ft", i)), "「"+task.Title+"」").FontSize(t.SM).TextColor(t.Ink).LineHeight(a.leading(1.45))
			}
			uiText(c.Key("wait"), a.L.T("settings.folder.wait")).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(a.leading(1.45)).Role(ui.RoleStatus)
		})
	}
	if st.err != "" {
		uiText(c.Key("fd-err"), st.err).FontSize(t.SM).TextColor(t.Failed.Ink).LineHeight(a.leading(1.45)).Role(ui.RoleStatus)
	}
	ui.Row(c.Key("fd-choices")).Gap(t.S4).Wrap().AlignItems(ui.Center).Children(func() {
		if base := path.Base(strings.TrimRight(dv.Folder.Path, "/")); isMacComputer(dv) && strings.EqualFold(base, "ducter") && base != "Ducter" {
			if a.quietLink(c, "fd-to-mac:"+dv.ID, a.L.T("settings.folder.toMac"), a.L.T("settings.folder.toMac")) {
				a.folderMove(dv.ID, "~/Ducter")
			}
		}
		if a.canPickFolder(dv) {
			if a.quietLink(c, "fd-pick:"+dv.ID, a.L.T("settings.folder.choose"), a.L.T("settings.folder.choose")) {
				a.pickFolderFor(dv.ID)
			}
		}
	})
	if !a.canPickFolder(dv) {
		ui.Column(c.Key("fd-path-box")).Gap(t.S1).Margin(t.S2, 0, 0, 0).Children(func() {
			uiText(c.Key("fd-path-label"), a.L.T("settings.folder.path")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
			in := ui.TextInput(c.Key("fd-path"), &st.typed).Placeholder(a.L.T("settings.folder.path.placeholder")).Label(a.L.T("settings.folder.path")).
				Height(t.ControlMD).Padding(0, t.S3).Radius(t.RadiusMD).Background(t.Bg).Border(1, t.LineSoft).
				Font(t.Mono).FontSize(t.MonoSM).OnSubmit(func() { a.folderMove(dv.ID, st.typed) })
			if st.focus {
				in.Focus()
				st.focus = false
			}
		})
	}
	if dv.Folder.Why != "env" && a.isThisMacDevice(dv) {
		ui.Row(c.Key("fd-show-row")).Margin(t.S2, 0, 0, 0).Children(func() {
			if a.quietLink(c, "fd-show:"+dv.ID, a.L.T("settings.folder.show"), a.L.T("settings.folder.show")) {
				a.openFolder("finder", expandTilde(dv.Folder.Path))
			}
		})
	}
}

// canPickFolder: this Mac can hand over one of its own folders for that computer (the home here,
// or this Mac as that home's worker).
func (a *App) canPickFolder(dv *protocol.DeviceView) bool {
	if a.PickFolder == nil {
		return false
	}
	mode, id := a.folderAdd()
	if mode == "here" && dv.Home {
		return true
	}
	return mode == "worker" && !dv.Home && dv.ID == id
}

func (a *App) pickFolderFor(device string) {
	if a.PickFolder == nil {
		return
	}
	done := func(path string, err error) {
		if err != nil || strings.TrimSpace(path) == "" {
			return
		}
		a.folderMove(device, path)
	}
	if a.Win == nil { // tests: inline
		done(a.PickFolder(a.L.T("settings.folder.pick.title"), a.L.T("settings.folder.pick.button")))
		return
	}
	go func() {
		p, err := a.PickFolder(a.L.T("settings.folder.pick.title"), a.L.T("settings.folder.pick.button"))
		a.Win.Update(func() { done(p, err) })
	}()
}

// openFolderRow shows that computer's folder row: Where it runs for the home, its card in Your
// devices for a worker, with its editor open. The New task clone field's 会放在 line uses it.
func (a *App) openFolderRow(device string) {
	if d := a.computerOf(device); d != nil && !d.Home {
		a.OpenDevices()
		a.dev.sel = d.ID
	} else {
		a.openTab(TabRun)
	}
	st := a.folderState(device)
	st.open = true
	st.err, st.tasks, st.done = "", nil, ""
	st.focus = true
	if d := a.computerOf(device); d != nil && d.Folder != nil {
		st.typed = d.Folder.Path
	}
}

func expandTilde(p string) string {
	if p == "~" {
		if home, err := os.UserHomeDir(); err == nil {
			return home
		}
		return p
	}
	if strings.HasPrefix(p, "~/") {
		if home, err := os.UserHomeDir(); err == nil {
			return home + p[1:]
		}
	}
	return p
}

// isMacComputer: that computer is a Mac, where ~/Ducter is the name that fits its other folders.
// A home with no platform said (an older hello) is a Mac when this window runs on one.
func isMacComputer(dv *protocol.DeviceView) bool {
	p := strings.ToLower(dv.Platform)
	if strings.Contains(p, "darwin") || strings.Contains(p, "mac") {
		return true
	}
	return p == "" && dv.Home && runtime.GOOS == "darwin"
}
