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
	lang := i18n.Detect(mygo.App.PreferredLanguages())
	app := views.New(s, theme.Pebble(), i18n.New(lang))
	app.LocaleFixed = i18n.Fixed()
	app.Local = hints.Open(hints.DataDir())

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
		}
		app.Backend = host
		// A child Ducter (no LaunchAgent) stops with the app; a background
		// one keeps working after Cmd-Q, and one found running is left alone.
		mygo.App.OnWillQuit(func(*mygo.QuitEvent) { host.Stop(8 * time.Second) })
		mygo.App.OnQuit(func() { host.Stop(8 * time.Second) })
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
		badge := -1
		updateBadge := func() {
			if n := app.WaitingCount(); n != badge {
				badge = n
				mygo.App.SetBadgeCount(n)
			}
		}
		if host != nil {
			mygo.App.SetMenu(appMenu(app, i18n.New(lang), win))
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

// appMenu is the standard menu bar with one addition in the app menu:
// Stop Ducter, the rare full stop (every task stops; it stays off, at
// login too, until woken). It turns into Wake Ducter while resting.
func appMenu(app *views.App, l *i18n.Strings, win *mygo.Window) *mygo.Menu {
	menu := mygo.NewMenu([]*mygo.MenuItem{
		{Role: mygo.RoleAppMenu, Submenu: []*mygo.MenuItem{
			{Role: mygo.RoleAbout},
			mygo.Separator(),
			{ID: "rest", Label: l.T("menu.rest"), Subtitle: l.T("menu.rest.sub"), Click: func(*mygo.MenuItem, *mygo.Window) {
				win.Update(func() {
					if app.Resting() {
						app.Wake()
					} else {
						app.Rest()
					}
					win.Show()
				})
			}},
			mygo.Separator(),
			{Role: mygo.RoleServices},
			mygo.Separator(),
			{Role: mygo.RoleHide},
			{Role: mygo.RoleHideOthers},
			{Role: mygo.RoleUnhide},
			mygo.Separator(),
			{Role: mygo.RoleQuit},
		}},
		{Role: mygo.RoleFileMenu},
		{Role: mygo.RoleEditMenu},
		{Role: mygo.RoleViewMenu},
		{Role: mygo.RoleWindowMenu},
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
