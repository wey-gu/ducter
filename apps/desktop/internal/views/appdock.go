package views

import (
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/appdock"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D562: 放到程序坞 / Keep in the Dock. An app kept there opens like the rest
// of the Mac's apps: its own icon in the Dock, found in Spotlight, straight
// into its own window (appdock: a tiny bundle that opens ducter://app/<id>).
// What is kept is the bundles themselves (appdock.Stubs.List), so the 「⋯」
// says the truth of this Mac.

// AppDock is the Mac's apps kept in the Dock (main.go: appdock.Stubs); nil
// where there is none (tests that don't need it).
type AppDock interface {
	List() map[string]appdock.Kept
	Keep(m protocol.AppMeta) (string, error)
	Drop(id string) error
	Follow(apps []protocol.AppMeta)
}

// OpenApp opens one of the person's apps in its own window (a link,
// ducter://app/<id>, from the Dock or Spotlight).
func (a *App) OpenApp(id string) { a.openApp(id) }

// appDocked: the app is kept in this Mac's Dock (read once a frame at most).
func (a *App) appDocked(id string) bool {
	if a.Dock == nil {
		return false
	}
	if a.docked == nil {
		a.docked = map[string]bool{}
		for k := range a.Dock.List() {
			a.docked[k] = true
		}
	}
	return a.docked[id]
}

// dockMenu is the 「⋯」's Dock item: 放到程序坞, or 从程序坞拿掉 once it is there.
func (a *App) dockMenu(mn *ui.Menu, m *protocol.AppMeta) {
	if a.Dock == nil || m.Home == "" {
		return
	}
	if a.appDocked(m.ID) {
		if mn.Item(a.L.T("apps.m.undock")).Chosen() {
			a.dockRun(*m, false)
		}
		return
	}
	if mn.Item(a.L.T("apps.m.dock")).Chosen() {
		a.dockRun(*m, true)
	}
}

// dockRun keeps or drops the app off the frame (its icon comes from the
// home), then says what happened.
func (a *App) dockRun(m protocol.AppMeta, keep bool) {
	d := a.Dock
	done := func(said string) {
		a.docked = nil
		a.toast(said)
	}
	work := func() {
		var err error
		if keep {
			_, err = d.Keep(m)
		} else {
			err = d.Drop(m.ID)
		}
		said := a.L.T("app.dock.done", m.Name)
		switch {
		case err != nil:
			said = a.L.T("app.dock.fail", err.Error())
		case !keep:
			said = a.L.T("app.dock.undone", m.Name)
		}
		if a.Win != nil {
			a.Win.Update(func() { done(said) })
		} else {
			done(said)
		}
	}
	if a.Win != nil {
		go work()
	} else {
		work()
	}
}

// dockFollow brings the apps kept in the Dock up to the list just come: a
// rename or a new mark follows (off the frame).
func (a *App) dockFollow() {
	a.docked = nil
	if a.Dock == nil || len(a.S.Apps) == 0 {
		return
	}
	apps := append([]protocol.AppMeta(nil), a.S.Apps...)
	if a.Win != nil {
		go a.Dock.Follow(apps)
	}
}
