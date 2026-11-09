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
	"github.com/wey-gu/ducter/apps/desktop/internal/update"
	"github.com/wey-gu/ducter/apps/desktop/internal/views"
)

func main() {
	// Ducter.app: the developer override first (a scratch data folder and
	// port), so everything below sees it.
	exe, _ := os.Executable()
	bundle, inApp := local.FindBundle(exe)
	bid := ""
	if inApp {
		if bid = local.BundleID(bundle.App); bid == "" {
			bid = local.DefaultBundleID
		}
		// Per bundle id: a scratch build never reads the real app's file.
		if keys := local.LoadDevEnv(local.DevEnvPathFor(bid)); len(keys) > 0 {
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
			sup.Agent = &local.Agent{Label: local.AgentLabel(bid), BundleID: bid, CLI: bundle.CLI, DataDir: sup.DataDir, Dir: local.LaunchAgentsDir()}
		}
		host = &local.Host{
			Supervisor: sup,
			LoginPath:  login,
			Scratch:    filepath.Join(os.TempDir(), "ducter-fix"),
			After:      i18n.New(lang).T("setup.after"),
			App:        local.BundleID(bundle.App),
			AppPath:    bundle.App,
			Trash:      mygo.Shell.TrashItem,
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

	// Updates and Help (D71): the app updates itself whether its Ducter
	// is on this Mac or elsewhere.
	lc := &lifecycle{l: i18n.New(lang), host: host}
	if inApp {
		if in, err := update.ReadInfo(bundle.App); err == nil {
			lc.version = in.Version
		}
		lc.upd = newUpdater(bundle, bid, host, lc.showStatus)
	}
	mygo.App.OnQuit(lc.quit) // after the handlers above: Ducter's child has stopped

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
		}
		lc.win = win
		if host != nil || lc.upd != nil {
			lc.menu = appMenu(app, i18n.New(lang), win, lc)
			mygo.App.SetMenu(lc.menu)
		}
		lc.start()

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
func appMenu(app *views.App, l *i18n.Strings, win *mygo.Window, lc *lifecycle) *mygo.Menu {
	top := []*mygo.MenuItem{{Role: mygo.RoleAbout}}
	top = append(top, lc.appMenuItems()...)
	top = append(top, mygo.Separator())
	if lc.host != nil {
		top = append(top, &mygo.MenuItem{ID: "rest", Label: l.T("menu.rest"), Subtitle: l.T("menu.rest.sub"), Click: func(*mygo.MenuItem, *mygo.Window) {
			win.Update(func() {
				if app.Resting() {
					app.Wake()
				} else {
					app.Rest()
				}
				win.Show()
			})
		}}, mygo.Separator())
	}
	menu := mygo.NewMenu([]*mygo.MenuItem{
		{Role: mygo.RoleAppMenu, Submenu: append(top,
			&mygo.MenuItem{Role: mygo.RoleServices},
			mygo.Separator(),
			&mygo.MenuItem{Role: mygo.RoleHide},
			&mygo.MenuItem{Role: mygo.RoleHideOthers},
			&mygo.MenuItem{Role: mygo.RoleUnhide},
			mygo.Separator(),
			&mygo.MenuItem{Role: mygo.RoleQuit},
		)},
		{Role: mygo.RoleFileMenu},
		{Role: mygo.RoleEditMenu},
		{Role: mygo.RoleViewMenu},
		{Role: mygo.RoleWindowMenu},
		lc.helpMenu(),
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
