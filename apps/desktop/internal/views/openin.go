package views

import (
	"os"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// Editor is an app on this Mac that 打开 / Open offers (D198: a code
// editor; D201: a terminal too): its name as the menu says it, the .app
// that opens a folder, and its bundle id.
type Editor struct {
	Name, App, Bundle string
}

// appleTerminal is macOS's own Terminal: named in the person's language
// (终端), and offered even when detection found none (it is always there).
const appleTerminal = "com.apple.Terminal"

// terminals are the terminals on this Mac, the one used last first (D201).
func (a *App) terminals() []Editor {
	if len(a.Terminals) == 0 {
		return []Editor{{Name: "Terminal", App: "terminal", Bundle: appleTerminal}}
	}
	return a.Terminals
}

// workFolder is a task's working copy: a repo task's worktree, a folder
// task's folder (D142); "" for a task with neither.
func workFolder(p protocol.Place) string {
	switch p.Kind {
	case "repo":
		return p.Worktree
	case "folder":
		return p.Path
	}
	return ""
}

// folderHere: the task's working copy is on this Mac (D198). Its place is
// the home's own and that home runs here, or its computer is this Mac's
// own worker (its device id in worker.json, else the computer it named,
// D187). A path on another computer is never opened here: it may name
// something else on this Mac.
func (a *App) folderHere(p protocol.Place) bool {
	if p.Device == "" || p.Device == "local" {
		return a.onThisMachine()
	}
	for i := range a.S.Devices {
		dv := &a.S.Devices[i]
		if !onDevice(p.Device, dv) {
			continue
		}
		if dv.Home {
			return a.onThisMachine()
		}
		return a.isThisMacDevice(dv)
	}
	return false
}

// openableFolder is the task's working copy when 打开 can open it: on this
// Mac, still there (an archived task's worktree is gone), and the app has
// hands to open it with.
func (a *App) openableFolder(task *store.Task) string {
	p := task.Place()
	path := workFolder(p)
	if a.OpenFolder == nil || path == "" || !a.folderHere(p) {
		return ""
	}
	if st, err := os.Stat(path); err != nil || !st.IsDir() {
		return ""
	}
	return path
}

// openIn is 打开 / Open in the opened task's header (D198): a quiet button
// whose menu shows the working copy in Finder, then opens it in each code
// editor installed here, then in each terminal (D201); in each group the
// one used last comes first.
func (a *App) openIn(c *ui.Context, task *store.Task) {
	t := a.T
	if a.openFailed != "" {
		c.Toast(a.L.T("task.open.failed", a.openFailed))
		a.openFailed = ""
	}
	path := a.openableFolder(task)
	if path == "" {
		return
	}
	h := a.controlHeight(t.ControlSM)
	b := ui.Row(c.Key("open-in")).Height(h).Padding(0, a.textPad(h)).Gap(t.S1 + 2).Radius(a.buttonRadius(h)).
		AlignItems(ui.Center).Cursor(ui.CursorPointer).Label(a.L.T("task.open.about")).Shrink(0)
	fg := a.buttonLook(c, b, btnText, h, t.Chrome)
	b.Children(func() {
		ui.Text(c, a.L.T("task.open")).FontSize(t.SM).FontWeight(700).TextColor(fg).SingleLine().AccessHidden(true)
		ui.Box(c).Size(10, 10).Shrink(0).Draw(drawCaret(fg)).AccessHidden(true)
	})
	b.Menu(func(m *ui.Menu) {
		if m.Item(a.L.T("task.open.finder")).Chosen() {
			a.openFolder("finder", path)
		}
		if len(a.Editors) > 0 {
			m.Separator()
		}
		for _, e := range a.Editors {
			if m.Item(a.L.T("task.open.editor", e.Name)).Chosen() {
				a.openFolder(e.App, path)
			}
		}
		m.Separator()
		for _, e := range a.terminals() {
			label := a.L.T("task.open.in", e.Name)
			if e.Bundle == appleTerminal {
				label = a.L.T("task.open.terminal")
			}
			if m.Item(label).Chosen() {
				a.openFolder(e.App, path)
			}
		}
	})
}

// openFolder hands the folder to macOS off the window's thread; a failure
// is said once, as a toast.
func (a *App) openFolder(with, path string) {
	fail := func(err error) {
		if err != nil {
			a.openFailed = strings.TrimSpace(err.Error())
		}
	}
	if a.Win == nil { // tests: inline
		fail(a.OpenFolder(with, path))
		return
	}
	go func() {
		err := a.OpenFolder(with, path)
		a.Win.Update(func() { fail(err) })
	}()
}

// workFolderLine is the working copy's path over its changes (D198): small,
// mono and selectable, so it can be copied into a terminal or an editor by
// hand, here or on the computer it is on. Under the home folder it reads
// ~/… (no user name on screen; a shell and Finder's Go to Folder take it).
func (a *App) workFolderLine(c *ui.Context, task *store.Task) {
	t := a.T
	path := workFolder(task.Place())
	if path == "" {
		return
	}
	shown := tildePath(path)
	ui.Text(c.Key("workfolder"), shown).Font(t.Mono).FontSize(t.MonoSM).TextColor(t.InkMuted).
		Selectable().MinWidth(0).Label(a.L.T("task.folder.about", shown))
}
