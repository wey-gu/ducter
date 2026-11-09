package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/netproxy"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/local"
	"github.com/wey-gu/ducter/apps/desktop/internal/update"
)

// DocsURL is where Help › Ducter Docs goes.
const DocsURL = "https://ducter.ai/docs"

// lifecycle is the app's updater and its Help menu (D72).
type lifecycle struct {
	l        *i18n.Strings
	upd      *update.Updater // nil: this copy doesn't update (not a bundle)
	host     *local.Host     // nil: the window shows a Ducter elsewhere
	version  string
	menu     *mygo.Menu
	relaunch bool
	win      *mygo.Window
}

// newUpdater sets up updates for the bundle. Not from a disk image or a
// translocated copy (they say so in Status); a test serves its own feed
// with DUCTER_UPDATE_FEED (http only from this Mac) and may accept a
// signed but not notarized build with DUCTER_UPDATE_SKIP_GATEKEEPER=1.
func newUpdater(bundle local.Bundle, bid string, host *local.Host, onChange func(update.Status)) *update.Updater {
	cfg := update.Config{
		App:   bundle.App,
		Feed:  os.Getenv("DUCTER_UPDATE_FEED"),
		Dir:   filepath.Join(local.SupportDir(bid), "updates"),
		HTTP:  &http.Client{Transport: netproxy.Transport(), Timeout: 15 * time.Minute},
		Check: update.Codesign{SkipGatekeeper: os.Getenv("DUCTER_UPDATE_SKIP_GATEKEEPER") == "1"},
		Logf:  log.Printf,
		// The menu line follows the state.
		OnChange: onChange,
	}
	if host != nil && host.Agent != nil {
		cfg.AgentLabel, cfg.AgentPlist = host.Agent.Label, host.Agent.PlistPath()
	}
	u, err := update.New(cfg)
	if err != nil {
		log.Printf("ducter: no updates: %v", err)
		return nil
	}
	return u
}

// appMenuItems are the lifecycle rows of the app menu: one update line.
func (lc *lifecycle) appMenuItems() []*mygo.MenuItem {
	if lc.upd == nil {
		return nil
	}
	return []*mygo.MenuItem{{ID: "update", Label: lc.l.T("menu.update.check"), Click: func(*mygo.MenuItem, *mygo.Window) { go lc.updateClicked() }}}
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

// updateClicked: restart into a ready update, open the page of one this
// copy can't install, or check now and say what came of it (the person
// asked, so a dialog answers).
func (lc *lifecycle) updateClicked() {
	st := lc.upd.Status()
	switch st.State {
	case update.Ready:
		lc.restartToUpdate()
		return
	case update.Available:
		if st.Page != "" {
			_ = local.OpenURL(st.Page)
		}
		return
	}
	st = lc.upd.CheckNow(context.Background())
	msg := mygo.MessageOptions{Parent: lc.win, Type: mygo.MessageInfo, Buttons: []string{lc.l.T("update.ok")}}
	switch st.State {
	case update.UpToDate:
		msg.Title = lc.l.T("update.uptodate", st.Current)
	case update.NoFeed:
		msg.Title, msg.Detail = lc.l.T("update.nofeed"), lc.l.T("update.nofeed.body")
	case update.Ready:
		msg.Title, msg.Detail = lc.l.T("menu.update.ready", st.Version), lc.l.T("update.ready.body")
		msg.Buttons = []string{lc.l.T("update.restart"), lc.l.T("update.later")}
	case update.Available:
		msg.Title, msg.Detail = lc.l.T("menu.update.available", st.Version), lc.l.T("update.reason."+string(st.Reason))
		msg.Buttons = []string{lc.l.T("update.download"), lc.l.T("update.later")}
	case update.Failed:
		msg.Type, msg.Title, msg.Detail = mygo.MessageWarning, lc.l.T("update.failed"), lc.l.T("update.reason."+string(st.Reason))
	default:
		return
	}
	r, err := mygo.Dialog.Message(msg)
	if err != nil || r.Button != 0 {
		return
	}
	switch st.State {
	case update.Ready:
		lc.restartToUpdate()
	case update.Available:
		if st.Page != "" {
			_ = local.OpenURL(st.Page)
		}
	}
}

// restartToUpdate quits; the swap runs once the app is gone and opens the
// new version (not mygo's Relaunch, which would open the old bundle before
// the swap).
func (lc *lifecycle) restartToUpdate() {
	lc.relaunch = true
	mygo.App.Quit()
}

// quit runs as the app quits: a ready update goes in once it has exited.
func (lc *lifecycle) quit() {
	if lc.upd == nil {
		return
	}
	if started, err := lc.upd.Quit(lc.relaunch); err != nil {
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
}
