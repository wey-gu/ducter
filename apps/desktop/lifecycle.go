package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/netproxy"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/local"
	"github.com/wey-gu/ducter/apps/desktop/internal/update"
	"github.com/wey-gu/ducter/apps/desktop/internal/views"
)

// DocsURL is where Help › Ducter Docs goes.
const DocsURL = "https://ducter.ai/docs"

// lifecycle is the app's updater and its Help menu (D72).
type lifecycle struct {
	l       *i18n.Strings
	upd     *update.Updater // nil: this copy doesn't update (not a bundle)
	host    *local.Host     // nil: the window shows a Ducter elsewhere
	version string
	menu    *mygo.Menu
	win     *mygo.Window
	// screen is the window's side of Restart to update (main.go).
	screen     restartScreen
	restarting atomic.Bool
	// openUpdate shows Settings' update card (views.App.OpenUpdate).
	openUpdate func()
	// asks answers an update asked from elsewhere (D187: the phone's 更新
	// on this Mac's card), through the data folder this app's Ducter shares.
	asks *update.Asks
}

// changed is the updater's OnChange: the menu line, and app.json for the
// Ducter on this Mac (D187).
func (lc *lifecycle) changed(st update.Status) {
	lc.showStatus(st)
	if a := lc.asks; a != nil {
		a.Beat()
	}
}

// newUpdater sets up updates for the bundle. Not from a disk image or a
// translocated copy (they say so in Status); a test serves its own feed
// with DUCTER_UPDATE_FEED (http only from this Mac) and may accept a
// signed but not notarized build with DUCTER_UPDATE_SKIP_GATEKEEPER=1.
func newUpdater(bundle local.Bundle, bid string, host *local.Host, prompt string, onChange func(update.Status)) *update.Updater {
	cfg := update.Config{
		App:       bundle.App,
		Feed:      os.Getenv("DUCTER_UPDATE_FEED"),
		Dir:       filepath.Join(local.SupportDir(bid), "updates"),
		HTTP:      &http.Client{Transport: netproxy.Transport(), Timeout: 15 * time.Minute},
		Check:     update.Codesign{SkipGatekeeper: os.Getenv("DUCTER_UPDATE_SKIP_GATEKEEPER") == "1"},
		Authorize: update.AuthorizeOwner(prompt),
		Logf:      log.Printf,
		// The menu line follows the state.
		OnChange: onChange,
	}
	if host != nil && host.Agent != nil {
		cfg.AgentLabel, cfg.AgentPlist = host.Agent.Label, host.Agent.PlistPath()
	}
	// D167: this Mac's worker (D155) runs the bundled helper too, also when
	// the app talks to a Ducter elsewhere (no host): restart it after a swap.
	if bid != "" {
		wl := local.WorkerLabel(bid)
		cfg.WorkerLabel, cfg.WorkerPlist = wl, filepath.Join(local.LaunchAgentsDir(), wl+".plist")
	}
	u, err := update.New(cfg)
	if err != nil {
		log.Printf("ducter: no updates: %v", err)
		return nil
	}
	return u
}

// appMenuItems are the lifecycle rows of the app menu: one update line,
// which opens Settings' update card (one flow, one place for its progress
// and Restart to update).
func (lc *lifecycle) appMenuItems() []*mygo.MenuItem {
	if lc.upd == nil {
		return nil
	}
	return []*mygo.MenuItem{{ID: "update", Label: lc.l.T("menu.update.check"), Click: func(*mygo.MenuItem, *mygo.Window) {
		if lc.openUpdate != nil {
			lc.openUpdate()
		}
	}}}
}

// helpMenu is Help: the docs, and Report a problem….
func (lc *lifecycle) helpMenu() *mygo.MenuItem {
	items := []*mygo.MenuItem{
		{Label: lc.l.T("menu.help.docs"), Click: func(*mygo.MenuItem, *mygo.Window) { _ = local.OpenURL(DocsURL) }},
	}
	if lc.host != nil {
		items = append(items, mygo.Separator(), &mygo.MenuItem{Label: lc.l.T("menu.help.report"), Click: func(*mygo.MenuItem, *mygo.Window) { go lc.reportProblem() }})
	}
	return &mygo.MenuItem{Role: mygo.RoleHelp, Label: lc.l.T("menu.help"), Submenu: items}
}

// showStatus puts the update's state on the menu line: the quiet place.
func (lc *lifecycle) showStatus(st update.Status) {
	if lc.menu == nil {
		return
	}
	it := lc.menu.ItemByID("update")
	if it == nil {
		return
	}
	label, sub, enabled := lc.l.T("menu.update.check"), "", true
	switch st.State {
	case update.Checking:
		label, enabled = lc.l.T("menu.update.checking"), false
	case update.Downloading:
		label, enabled = lc.l.T("menu.update.downloading", st.Version), false
	case update.Ready:
		label, sub = lc.l.T("menu.update.ready", st.Version), lc.l.T("menu.update.ready.sub")
	case update.Available:
		label = lc.l.T("menu.update.available", st.Version)
	}
	it.SetLabel(label)
	it.SetSubtitle(sub)
	it.SetEnabled(enabled)
}

// restartToUpdate quits into the ready update (Settings' Restart Now, a
// device card's Update): see runRestart. The swap runs once the app is gone
// and opens the new version (not mygo's Relaunch, which would open the old
// bundle before the swap). Main thread (a click).
func (lc *lifecycle) restartToUpdate() {
	if lc.restarting.Swap(true) {
		return // already on its way
	}
	go func() {
		if !runRestart(lc.upd, lc.screen, restartCalm) {
			lc.restarting.Store(false)
		}
	}()
}

// restartCalm is how long the window at least says it is putting the new
// version in: long enough to read, never a flash.
const restartCalm = 700 * time.Millisecond

// restarter is the updater as Restart to update uses it.
type restarter interface {
	PrepareRestart() error
	Begin(relaunch bool) (bool, error)
}

// restartScreen is the window's side of Restart to update. Every call
// returns once the main thread has done it.
type restartScreen interface {
	// Putting shows (or takes back) "Putting the new version in, back in
	// a moment".
	Putting(on bool)
	// Failed shows Settings' update card, which says why.
	Failed()
	// Leave orders every window out at once and quits: nothing blank or
	// frozen is left on screen while the app exits.
	Leave()
}

// runRestart is Restart to update, off the main thread, in this order:
// the password when an administrator installed the app (cancelled: the app
// stays as it was, Settings says why); then the window says it is putting
// the new version in while the copy is checked again and the swap starts
// (the slow part, here and not in the quit); then the windows go and the
// app quits. A copy that fails its check leaves the app open on Settings'
// update card. It reports whether the app is quitting.
func runRestart(u restarter, s restartScreen, calm time.Duration) bool {
	if err := u.PrepareRestart(); err != nil {
		log.Printf("ducter: update not installed: %v", err)
		return false
	}
	s.Putting(true)
	shown := time.Now()
	started, err := u.Begin(true)
	if err != nil || !started {
		if err == nil {
			err = fmt.Errorf("no update is ready")
		}
		log.Printf("ducter: update not installed: %v", err)
		s.Putting(false)
		s.Failed()
		return false
	}
	if d := calm - time.Since(shown); d > 0 {
		time.Sleep(d)
	}
	s.Leave()
	return true
}

// windowScreen is restartScreen on the app's window.
type windowScreen struct {
	app *views.App
	win *mygo.Window
}

// update runs fn on the main thread with a new frame after, and waits.
func (s windowScreen) update(fn func()) {
	done := make(chan struct{})
	s.win.Update(func() {
		defer close(done)
		fn()
	})
	<-done
}

func (s windowScreen) Putting(on bool) { s.update(func() { s.app.PuttingIn = on }) }
func (s windowScreen) Failed()         { s.update(s.app.UpdateFailed) }

func (s windowScreen) Leave() {
	mygo.RunOnMain(func() {
		for _, w := range mygo.Windows() {
			w.Hide()
		}
		flushWindows()
	})
	mygo.App.Quit()
}

// quit runs as the app quits: a ready update goes in once it has exited
// (after Restart to update, Begin has already started it). The windows are
// gone by now (flushWindows), so a check it still runs is out of sight.
func (lc *lifecycle) quit() {
	if lc.upd == nil {
		return
	}
	if lc.asks != nil {
		lc.asks.Gone() // closed reads as closed at once, not 45 s later (D187)
	}
	if started, err := lc.upd.Quit(false); err != nil {
		log.Printf("ducter: update not installed: %v", err)
	} else if started {
		log.Printf("ducter: the update installs once the app has quit")
	}
}

// reportProblem: ask (with the conversation off by default), collect with
// `ducter report`, show what would be attached, then save the .zip to the
// Desktop and open a prefilled GitHub issue. Nothing is uploaded.
func (lc *lifecycle) reportProblem() {
	l := lc.l
	r, err := mygo.Dialog.Message(mygo.MessageOptions{
		Parent: lc.win, Type: mygo.MessageInfo,
		Title: l.T("report.title"), Detail: l.T("report.body"),
		Buttons:       []string{l.T("report.collect"), l.T("report.cancel")},
		CheckboxLabel: l.T("report.conversation"),
	})
	if err != nil || r.Button != 0 {
		return
	}
	withConv := r.CheckboxChecked
	d, err := lc.host.Diagnostics(withConv, lc.version)
	if err != nil {
		_, _ = mygo.Dialog.Message(mygo.MessageOptions{Parent: lc.win, Type: mygo.MessageWarning, Title: l.T("report.failed", err.Error()), Buttons: []string{l.T("update.ok")}})
		return
	}
	defer os.RemoveAll(d.Dir)
	var files []string
	for _, f := range d.Files {
		files = append(files, fmt.Sprintf("%s  %s", f.Name, humanBytes(f.Bytes)))
	}
	conv := l.T("report.review.without")
	if withConv {
		conv = l.T("report.review.with")
	}
	detail := l.T("report.review.body", strings.Join(files, "\n"), conv)
	if v := strings.TrimSpace(d.Read("versions.txt")); v != "" {
		detail += "\n\n" + v
	}
	for {
		r, err := mygo.Dialog.Message(mygo.MessageOptions{
			Parent: lc.win, Type: mygo.MessageInfo, Title: l.T("report.review"), Detail: detail,
			Buttons: []string{l.T("report.save"), l.T("report.show"), l.T("report.cancel")},
		})
		if err != nil || r.Button == 2 || r.Button < 0 {
			return
		}
		if r.Button == 1 && len(d.Files) > 0 {
			mygo.Shell.ShowItemInFolder(filepath.Join(d.Dir, d.Files[0].Name))
			continue
		}
		zip, err := local.SaveZip(d, local.DesktopDir(), time.Now())
		if err != nil {
			_, _ = mygo.Dialog.Message(mygo.MessageOptions{Parent: lc.win, Type: mygo.MessageWarning, Title: l.T("report.failed", err.Error()), Buttons: []string{l.T("update.ok")}})
			return
		}
		mygo.Shell.ShowItemInFolder(zip)
		if d.IssueURL != "" {
			_ = local.OpenURL(d.IssueURL)
		}
		return
	}
}

func humanBytes(n int64) string {
	switch {
	case n < 1024:
		return fmt.Sprintf("%d B", n)
	case n < 1<<20:
		return fmt.Sprintf("%.1f KB", float64(n)/1024)
	}
	return fmt.Sprintf("%.1f MB", float64(n)/(1<<20))
}

// start: check 30 s after launch (not while the window is first drawn),
// then daily.
func (lc *lifecycle) start() {
	if lc.upd == nil {
		return
	}
	lc.showStatus(lc.upd.Status())
	lc.upd.Start(context.Background(), 30*time.Second)
	if lc.asks != nil {
		go lc.asks.Run(context.Background())
	}
}
