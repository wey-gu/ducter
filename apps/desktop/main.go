// Ducter's desktop client: MyGo native UI (no webview) over the main
// process's WebSocket: $DUCTER_URL (with $DUCTER_TOKEN), else the
// connection saved by "Connect to your Ducter" (internal/remote), else
// ws://127.0.0.1:${DUCTER_PORT:-7777}/ws.
//
//	go run ./cmd/mockserver   # a scripted backend, for development
//	go run .
package main

import (
	"context"
	"errors"
	"log"
	"os"
	"path/filepath"
	"runtime/debug"
	"time"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/hints"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/local"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/remote"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
	"github.com/wey-gu/ducter/apps/desktop/internal/views"
)

// version and commit are set by scripts/make-app.sh (-ldflags -X).
var version, commit string

func main() {
	// Ducter.app: the developer override first (a scratch data folder and
	// port), so everything below sees it.
	exe, _ := os.Executable()
	bundle, inApp := local.FindBundle(exe)
	if inApp {
		if keys := local.LoadDevEnv(local.DevEnvPath()); len(keys) > 0 {
			log.Printf("ducter: dev.env sets %v", keys)
		}
	}
	theme.LoadFonts()
	s := store.New()
	system := i18n.Detect(mygo.App.PreferredLanguages())
	lang := system
	local0 := hints.Open(hints.DataDir())
	// Settings › Language pins the window's language (DUCTER_LOCALE still wins).
	if l := local0.Lang(); (l == "zh" || l == "en") && !i18n.Fixed() {
		lang = i18n.Lang(l)
	}
	app := views.New(s, theme.Pebble(), i18n.New(lang))
	app.LocaleFixed = i18n.Fixed() || lang != system
	app.Local = local0
	app.SystemLang = system
	app.Version, app.Commit = buildVersion()
	app.OpenExternal = local.OpenURL
	if os.Getenv("DUCTER_UPDATES") == "1" {
		// The updater isn't in this build yet: the check opens the releases.
		app.CheckUpdates = func() { _ = local.OpenURL("https://github.com/wey-gu/ducter/releases") }
	}

	// The app runs the Ducter of this Mac itself, unless the window is
	// pointed somewhere else (DUCTER_URL, or a saved remote connection).
	var host *local.Host
	if url, _ := target(); inApp && url == client.DefaultURL() && os.Getenv("DUCTER_URL") == "" {
		login := local.FixPath() // Finder gives apps only the system folders
		local.ClearQuarantine(bundle.CLI)
		sup := &local.Supervisor{CLI: bundle.CLI, DataDir: hints.DataDir(), Port: local.Port(), Locale: string(lang)}
		// The keep-running decision: Ducter keeps working when the window closes or the app
		// quits, as a LaunchAgent. Not from the disk image or a
		// translocated copy, whose path goes away: then it is the app's
		// child and stops with it.
		if local.Settled(bundle.CLI) {
			bid := local.BundleID(bundle.App)
			if bid == "" {
				bid = "co.nowledge.ducter"
			}
			sup.Agent = &local.Agent{Label: local.AgentLabel(bid), BundleID: bid, CLI: bundle.CLI, DataDir: sup.DataDir, Dir: local.LaunchAgentsDir()}
		}
		host = &local.Host{
			Supervisor: sup,
			LoginPath:  login,
			Scratch:    filepath.Join(os.TempDir(), "ducter-fix"),
			After:      i18n.New(lang).T("setup.after"),
			App:        local.BundleID(bundle.App),
		}
		app.Backend = host
		// A child Ducter (no LaunchAgent) stops with the app; a background
		// one keeps working after Cmd-Q, and one found running is left alone.
		mygo.App.OnWillQuit(func(*mygo.QuitEvent) { host.Stop(8 * time.Second) })
		mygo.App.OnQuit(func() {
			host.Jobs.StopAll() // an installer or a sign-in still waiting
			host.Stop(8 * time.Second)
		})
	}

	mygo.App.WhenReady(func() {
		win := mygo.NewWindow(mygo.WindowOptions{
			Title:     "Ducter",
			Width:     1280,
			Height:    860,
			MinWidth:  760,
			MinHeight: 580,
			// No title bar strip: the content runs to the top and each zoom
			// level's own bar (views.ChromeH) is the title region, with the
			// traffic lights centered on it. The title stays for Mission
			// Control, the Dock and assistive technology.
			TitleBarStyle:        mygo.TitleBarHidden,
			TrafficLightPosition: &mygo.Point{X: int(views.TrafficLights.X), Y: int(views.TrafficLights.Y)},
			TitleBarHeight:       views.ChromeH,
			Content:              ui.View(app.View),
		})
		app.Win = win
		app.Desktop = desktop{win}

		// The keep-running decision: closing the window hides it (Ducter keeps working); the Dock
		// icon, or opening the app again, brings it back as it was. Only a
		// quit really closes it.
		quitting := false
		mygo.App.OnBeforeQuit(func(*mygo.QuitEvent) { quitting = true })
		win.OnClose(func(e *mygo.CloseEvent) {
			if quitting {
				return
			}
			e.PreventDefault()
			win.Hide()
		})
		mygo.App.OnActivate(func(visible bool) {
			if !visible || !win.IsVisible() {
				win.Show()
				win.Focus()
			}
		})
		// The Dock badge: what waits for the person, nothing else.
		var tray *trayMenu
		badge := -1
		updateBadge := func() {
			if n := app.WaitingCount(); n != badge {
				// Something new waits and the person isn't looking: a
				// notification, if they said yes to them (views/asks.go).
				if n > badge && badge >= 0 && !(win.IsVisible() && win.IsFocused()) {
					if title, body := app.NeedsYouNotice(n); title != "" {
						go func() { _ = (desktop{win}).Notify(title, body) }()
					}
				}
				badge = n
				mygo.App.SetBadgeCount(n)
			}
			tray.refresh(false)
		}
		// The menu bar, in the window's language; rebuilt when it changes.
		mygo.App.SetMenu(appMenu(app, app.L, win, host != nil))
		tray = newTray(app, win)
		app.OnLanguage = func(l *i18n.Strings) {
			mygo.App.SetMenu(appMenu(app, l, win, host != nil))
			if app.Resting() && app.OnResting != nil {
				app.OnResting(true)
			}
			tray.refresh(true)
		}

		// The store lives on the UI thread; the client's goroutine hands
		// each frame over with Update. Cursor is read there too.
		cursor := func() int64 {
			var cur int64
			mygo.RunOnMain(func() { cur = s.Cursor })
			return cur
		}
		url, token := target()
		var c *client.Client
		c = client.New(client.Options{
			URL:    url,
			Token:  token,
			Locale: string(lang),
			Cursor: cursor,
			OnFrame: func(f protocol.ServerFrame) {
				win.Update(func() {
					app.Receive(f)
					updateBadge()
				})
			},
			OnStatus: func(st client.Status, err error) {
				win.Update(func() {
					app.Status = st
					if st == client.Disconnected {
						app.Failed = true
					}
					if err != nil {
						app.StatusErr = err.Error()
					}
					if errors.Is(err, client.ErrUnauthorized) {
						app.Unauthorized = true
					}
				})
			},
		})
		app.Send = c.Send
		app.URL = c.URL()
		app.RetryNow = c.RetryNow
		app.NextAttempt = c.NextAttempt
		app.Pair = func(base, code string) error {
			saved, err := remote.Pair(context.Background(), base, code, remote.DeviceName())
			if err != nil {
				return err
			}
			if p, perr := remote.Path(); perr == nil {
				if err := remote.Save(p, saved); err != nil {
					log.Printf("ducter: could not save the connection: %v", err)
				}
			}
			c.Retarget(saved.URL, saved.Token)
			return nil
		}
		app.StartLocal() // no-op without a Backend
		go c.Run(context.Background())
	})
	if err := mygo.App.Run(); err != nil {
		log.Fatal(err)
	}
}

// appMenu is the menu bar (D71). The app menu: About, Settings… (⌘,),
// Stop Ducter (the rare full stop: every task stops, and it stays off, at
// login too, until woken; it turns into Wake Ducter while resting), Quit.
// View: the four places (⌘1–⌘4). Help: the docs and Report a problem.
// ours: this app runs the Ducter of this Mac (Stop Ducter only then).
func appMenu(app *views.App, l *i18n.Strings, win *mygo.Window, ours bool) *mygo.Menu {
	show := func(fn func()) func(*mygo.MenuItem, *mygo.Window) {
		return func(*mygo.MenuItem, *mygo.Window) {
			win.Update(func() {
				fn()
				win.Show()
				win.Focus()
			})
		}
	}
	appItems := []*mygo.MenuItem{
		{Label: l.T("menu.about"), Click: show(app.OpenSettings)},
		mygo.Separator(),
		{ID: "settings", Label: l.T("menu.settings"), Accelerator: "CmdOrCtrl+,", Click: show(app.OpenSettings)},
		mygo.Separator(),
	}
	if ours {
		appItems = append(appItems,
			&mygo.MenuItem{ID: "rest", Label: l.T("menu.rest"), Subtitle: l.T("menu.rest.sub"), Click: show(func() {
				if app.Resting() {
					app.Wake()
				} else {
					app.Rest()
				}
			})},
			mygo.Separator())
	}
	appItems = append(appItems,
		&mygo.MenuItem{Role: mygo.RoleServices},
		mygo.Separator(),
		&mygo.MenuItem{Role: mygo.RoleHide},
		&mygo.MenuItem{Role: mygo.RoleHideOthers},
		&mygo.MenuItem{Role: mygo.RoleUnhide},
		mygo.Separator(),
		&mygo.MenuItem{Role: mygo.RoleQuit},
	)
	menu := mygo.NewMenu([]*mygo.MenuItem{
		{Role: mygo.RoleAppMenu, Submenu: appItems},
		{Role: mygo.RoleEditMenu},
		{Label: l.T("menu.view"), Submenu: []*mygo.MenuItem{
			{Label: l.T("menu.view.conversation"), Accelerator: "CmdOrCtrl+1", Click: show(func() { app.Route = views.RouteConversation })},
			{Label: l.T("menu.view.onhand"), Accelerator: "CmdOrCtrl+2", Click: show(func() { app.Route = views.RouteOnHand })},
			{Label: l.T("menu.view.devices"), Accelerator: "CmdOrCtrl+3", Click: show(app.OpenDevices)},
			{Label: l.T("menu.view.partner"), Accelerator: "CmdOrCtrl+4", Click: show(app.OpenPartner)},
			mygo.Separator(),
			{Role: mygo.RoleToggleFullScreen},
		}},
		{Role: mygo.RoleWindowMenu},
		{Role: mygo.RoleHelp, Label: l.T("menu.help"), Submenu: []*mygo.MenuItem{
			{Label: l.T("menu.help.docs"), Click: func(*mygo.MenuItem, *mygo.Window) { _ = local.OpenURL(views.DocsURL) }},
			{Label: l.T("menu.help.report"), Click: func(*mygo.MenuItem, *mygo.Window) { _ = local.OpenURL(views.ReportURL) }},
		}},
	})
	// The item says what it will do: stop, or wake while resting.
	app.OnResting = func(resting bool) {
		if item := menu.ItemByID("rest"); item != nil {
			if resting {
				item.SetLabel(l.T("menu.wake"))
				item.SetSubtitle("")
			} else {
				item.SetLabel(l.T("menu.rest"))
				item.SetSubtitle(l.T("menu.rest.sub"))
			}
		}
	}
	return menu
}

// trayMenu is the menu bar extra (D71): the clay partner as a template
// icon; its menu is what needs you, each with Go and Hold, then Open
// Ducter. It is the "handheld" moment: answering without the window.
type trayMenu struct {
	app  *views.App
	win  *mygo.Window
	tray *mygo.Tray
	sig  string
}

func newTray(app *views.App, win *mygo.Window) *trayMenu {
	tm := &trayMenu{app: app, win: win}
	t, err := mygo.NewTray(mygo.TrayOptions{ID: "ducter", Icon: theme.TrayIcon(), IconIsTemplate: true, ToolTip: "Ducter"})
	if err != nil {
		log.Printf("ducter: no menu bar extra: %v", err)
		return tm
	}
	tm.tray = t
	tm.refresh(true)
	return tm
}

// refresh rebuilds the menu when what it shows changed (or force). UI
// thread.
func (tm *trayMenu) refresh(force bool) {
	if tm == nil || tm.tray == nil {
		return
	}
	app, l := tm.app, tm.app.L
	sig := app.TraySignature()
	if !force && sig == tm.sig {
		return
	}
	tm.sig = sig
	open := func(fn func()) func(*mygo.MenuItem, *mygo.Window) {
		return func(*mygo.MenuItem, *mygo.Window) {
			tm.win.Update(func() {
				if fn != nil {
					fn()
				}
				tm.win.Show()
				tm.win.Focus()
				mygo.App.Focus()
			})
		}
	}
	ds := app.TrayDecisions(6)
	var items []*mygo.MenuItem
	if len(ds) == 0 {
		items = append(items, &mygo.MenuItem{Label: l.T("tray.none"), Disabled: true})
	} else {
		items = append(items, &mygo.MenuItem{Label: l.T("tray.needs", app.WaitingCount()), Disabled: true})
		for _, d := range ds {
			id := d.ID
			decide := func(opt string) func(*mygo.MenuItem, *mygo.Window) {
				return func(*mygo.MenuItem, *mygo.Window) {
					tm.win.Update(func() { app.Decide(id, opt, ""); tm.refresh(true) })
				}
			}
			goLabel := l.T("decision.go")
			if d.GoLabel != "" {
				goLabel = l.T("tray.go", d.GoLabel)
			}
			items = append(items, &mygo.MenuItem{Label: d.Question, Subtitle: d.Task, Submenu: []*mygo.MenuItem{
				{Label: goLabel, Click: decide("go")},
				{Label: l.T("tray.hold"), Click: decide("hold")},
				mygo.Separator(),
				{Label: l.T("tray.reply"), Click: open(func() { app.Route = views.RouteConversation })},
			}})
		}
	}
	items = append(items,
		mygo.Separator(),
		&mygo.MenuItem{Label: l.T("tray.open"), Click: open(nil)},
		&mygo.MenuItem{Label: l.T("menu.settings"), Click: open(app.OpenSettings)},
		mygo.Separator(),
		&mygo.MenuItem{Role: mygo.RoleQuit},
	)
	tm.tray.SetMenu(mygo.NewMenu(items))
	tm.tray.SetToolTip(l.T("face.idle", app.S.PersonaName))
}

// buildVersion is this build's version and commit: from the app's link
// flags, else what Go recorded of the checkout.
func buildVersion() (string, string) {
	v, c := version, commit
	if bi, ok := debug.ReadBuildInfo(); ok && c == "" {
		for _, s := range bi.Settings {
			if s.Key == "vcs.revision" && len(s.Value) >= 7 {
				c = s.Value[:7]
			}
		}
	}
	return v, c
}

// target is the server to dial and its device token: DUCTER_URL (and
// DUCTER_TOKEN) win; then the saved connection; then the local default.
func target() (string, string) {
	if u := os.Getenv("DUCTER_URL"); u != "" {
		token := os.Getenv("DUCTER_TOKEN")
		if p, err := remote.Path(); err == nil && token == "" {
			if s, _ := remote.Load(p); s != nil && s.URL == u {
				token = s.Token
			}
		}
		return u, token
	}
	if p, err := remote.Path(); err == nil {
		if s, err := remote.Load(p); err == nil && s != nil && s.URL != "" {
			return s.URL, s.Token
		}
	}
	return client.DefaultURL(), ""
}

// desktop is the window app's hands on macOS for the views.
type desktop struct{ win *mygo.Window }

// Focus brings Ducter's window back to the front.
func (d desktop) Focus() {
	d.win.Show()
	d.win.Focus()
	mygo.App.Focus()
}

// Notify shows a notification; the first one is when macOS asks.
func (d desktop) Notify(title, body string) error {
	if !mygo.NotificationsSupported() {
		return errors.New("notifications need the app bundle")
	}
	err := mygo.NewNotification(mygo.NotificationOptions{Title: title, Body: body, Group: "ducter"}).Show()
	if errors.Is(err, mygo.ErrNotificationsDenied) {
		return views.ErrNotificationsDenied
	}
	return err
}
