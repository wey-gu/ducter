package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"sync"
	"time"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/appdock"
	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/views"
)

// D405: 小应用 / Apps on the Mac. Each app the partner made opens in its own
// window: a web view whose page is someone else's (mygo's Untrusted: no Go
// methods, no other origin, no window, no download) on the app's own
// scheme, ducter-app://<id>/. The page is the document the home composed,
// under the same policy as on the web (nothing loads from outside the file;
// it talks only to its own scheme): it posts what it writes or asks to
// /bridge and long-polls /events for what changed elsewhere, both carried by
// the app's socket to the home (views.AppBridge).

// appCSP mirrors packages/protocol/src/apps.ts appCsp("fetch").
const appCSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'"

var appIDRe = regexp.MustCompile(`^a[0-9a-f]{1,15}$`)

// The apps' open windows, by app id.
var (
	appWinMu   sync.Mutex
	appWinOpen = map[string]*mygo.Window{}
)

// appWindowID is the app whose window w is, or "" (D603: the menu bar's
// 修改这个小应用… ⌘L acts on the app window in front).
func appWindowID(w *mygo.Window) string {
	if w == nil {
		return ""
	}
	appWinMu.Lock()
	defer appWinMu.Unlock()
	for id, x := range appWinOpen {
		if x == w {
			return id
		}
	}
	return ""
}

// installApps serves the apps' scheme and opens their windows. It runs
// before any window is made (a scheme must be registered first).
func installApps(app *views.App) {
	b := app.Bridge()
	_ = mygo.Protocol.HandleFunc("ducter-app", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Host
		if !appIDRe.MatchString(id) {
			http.Error(w, "no such app", http.StatusNotFound)
			return
		}
		h := w.Header()
		h.Set("Content-Security-Policy", appCSP)
		h.Set("Cache-Control", "no-store")
		h.Set("X-Content-Type-Options", "nosniff")
		switch {
		case r.Method == http.MethodGet && (r.URL.Path == "/" || r.URL.Path == ""):
			open, ok := b.Open(id, mygo.Theme.IsDark())
			if !ok {
				http.Error(w, "this app is gone", http.StatusNotFound)
				return
			}
			h.Set("Content-Type", "text/html; charset=utf-8")
			_, _ = io.WriteString(w, open.Doc)
		case r.Method == http.MethodPost && r.URL.Path == "/bridge":
			body, _ := io.ReadAll(io.LimitReader(r.Body, 600_000))
			b.Post(id, body)
			w.WriteHeader(http.StatusNoContent)
		case r.Method == http.MethodGet && r.URL.Path == "/events":
			after, _ := strconv.Atoi(r.URL.Query().Get("after"))
			evs, next := b.Events(id, after, 25*time.Second)
			if evs == nil {
				evs = []json.RawMessage{}
			}
			h.Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"events": evs, "after": next})
		default:
			http.Error(w, "not found", http.StatusNotFound)
		}
	})
	installDock(app)
	// D446: an open app follows a live switch of the Mac's appearance (or
	// of Ducter's own Look setting), as its first frame did.
	mygo.Theme.OnUpdated(func() { b.Theme(mygo.Theme.IsDark()) })
	// A developer's switch (DUCTER_OPEN_APP=<id>): open that app once the app has connected.
	if id := os.Getenv("DUCTER_OPEN_APP"); appIDRe.MatchString(id) {
		mygo.App.WhenReady(func() {
			go func() {
				time.Sleep(5 * time.Second)
				app.OpenAppWindow(id, "")
			}()
		})
	}
	mu, open := &appWinMu, appWinOpen
	app.OpenAppWindow = func(id, name string) {
		mu.Lock()
		defer mu.Unlock()
		if w := open[id]; w != nil && !w.IsDestroyed() {
			w.Show()
			w.Focus()
			return
		}
		if name == "" {
			name = "Ducter"
		}
		// D410: native UI around the app: its head (改回去, 「⋯」), the
		// partner's first line, 改好了, and the foot's 让{name}改…; the app
		// itself in an untrusted web view on its own scheme, as before.
		aw := app.NewAppWin(id)
		w := mygo.NewWindow(mygo.WindowOptions{
			Title: name,
			// D562: room for the kit's whole page (560 at most) inside the stage's margins.
			Width:                600,
			Height:               860,
			MinWidth:             380,
			MinHeight:            520,
			TitleBarStyle:        mygo.TitleBarHidden,
			TrafficLightPosition: &mygo.Point{X: 20, Y: int((views.AppWinHeadH - 14) / 2)},
			TitleBarHeight:       views.AppWinHeadH,
			BackgroundColor:      "light-dark(#FFF6EA, #17120E)",
			StateKey:             "app-" + id,
			Content:              ui.View(app.AppWinView(aw)),
		})
		web, err := w.NewWebView(mygo.WebViewOptions{
			URL:             "ducter-app://" + id + "/",
			Page:            mygo.PageOptions{Untrusted: true},
			BackgroundColor: "light-dark(#FFF6EA, #17120E)",
		})
		if err != nil {
			log.Printf("ducter: the app's page: %v", err)
		} else {
			aw.Web = web
			aw.Reload = func() { web.Page().Reload() }
		}
		aw.Invalidate = w.Invalidate
		w.Invalidate()
		open[id] = w
		// A developer's look (DUCTER_APP_SHOT_DIR): the page as it drew, a few seconds in.
		if dir := os.Getenv("DUCTER_APP_SHOT_DIR"); dir != "" {
			go func() {
				time.Sleep(4 * time.Second)
				// The whole window (head, page, foot), and the page alone.
				if png, err := w.CapturePage(); err == nil {
					_ = os.WriteFile(filepath.Join(dir, "mac-app-window-"+id+".png"), png, 0o644)
				}
				if web != nil {
					if png, err := web.CapturePage(); err == nil {
						_ = os.WriteFile(filepath.Join(dir, "mac-app-page-"+id+".png"), png, 0o644)
					}
				}
				// The bridge both ways: a key written, an ask, and its answer back in the page.
				if os.Getenv("DUCTER_APP_PROBE") != "" && web != nil {
					_, _ = web.Page().Eval(`ducter.set("probe", 1); ducter.ask("probe from the Mac window").then(t => { document.title = "answered: " + t; })`)
					time.Sleep(4 * time.Second)
					if v, err := web.Page().Eval(`document.title`); err == nil {
						_ = os.WriteFile(filepath.Join(dir, "mac-app-probe-"+id+".txt"), []byte(fmt.Sprint(v)), 0o644)
					}
				}
			}()
		}
		w.OnClosed(func() {
			mu.Lock()
			delete(open, id)
			mu.Unlock()
			app.Win.Update(func() { app.CloseAppWin(id) })
		})
	}
}

// D562: 放到程序坞 / Keep in the Dock. An app kept there is a tiny bundle in
// ~/Applications/Ducter Apps (DUCTER_APP_STUBS_DIR elsewhere, and then the
// person's Dock is never touched) whose one line opens ducter://app/<id> in
// this Ducter; that link opens the app's own window, once the home is there.
func installDock(app *views.App) {
	dir := appdock.DefaultDir()
	var dock appdock.Dock = &appdock.MacDock{}
	if os.Getenv("DUCTER_APP_STUBS_DIR") != "" {
		dock = nil
	}
	hc := &http.Client{Timeout: 20 * time.Second}
	app.Dock = &appdock.Stubs{
		Dir:      dir,
		BundleID: ownBundleID(),
		Dock:     dock,
		Register: appdock.RegisterBundle,
		Fetch: func(path string) ([]byte, error) {
			res, err := hc.Get(app.Media.Home().URL(path))
			if err != nil {
				return nil, err
			}
			defer res.Body.Close()
			if res.StatusCode != http.StatusOK {
				return nil, fmt.Errorf("the home said %s", res.Status)
			}
			return io.ReadAll(io.LimitReader(res.Body, 4<<20))
		},
	}
	mygo.App.OnOpenURL(func(u string) {
		m := appLinkRe.FindStringSubmatch(u)
		if m == nil {
			return
		}
		openWhenConnected(app, m[1], 60)
	})
}

var appLinkRe = regexp.MustCompile(`^ducter://app/(a[0-9a-f]{1,15})/?$`)

// openWhenConnected opens the app's window once the home is connected (a
// link from the Dock can start Ducter itself), trying for about tries/2 s.
func openWhenConnected(app *views.App, id string, tries int) {
	app.Win.Update(func() {
		if app.Status == client.Connected && len(app.S.Apps) > 0 {
			app.OpenApp(id)
			return
		}
		if tries <= 0 {
			app.OpenApp(id)
			return
		}
		time.AfterFunc(500*time.Millisecond, func() { openWhenConnected(app, id, tries-1) })
	})
}

var bundleIDRe = regexp.MustCompile(`<key>CFBundleIdentifier</key>\s*<string>([^<]+)</string>`)

// ownBundleID is this Ducter's bundle id (a test build has its own), read
// from its Info.plist; a development run uses the release's.
func ownBundleID() string {
	if exe, err := os.Executable(); err == nil {
		if b, err := os.ReadFile(filepath.Join(filepath.Dir(exe), "..", "Info.plist")); err == nil {
			if m := bundleIDRe.FindSubmatch(b); m != nil {
				return string(m[1])
			}
		}
	}
	return "co.nowledge.ducter"
}
