package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"sync"
	"time"

	"github.com/egoist/mygo"

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
	// A developer's switch (DUCTER_OPEN_APP=<id>): open that app once the app has connected.
	if id := os.Getenv("DUCTER_OPEN_APP"); appIDRe.MatchString(id) {
		mygo.App.WhenReady(func() {
			go func() {
				time.Sleep(5 * time.Second)
				app.OpenAppWindow(id, "")
			}()
		})
	}
	var mu sync.Mutex
	open := map[string]*mygo.Window{}
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
		w := mygo.NewWindow(mygo.WindowOptions{
			Title:           name,
			Width:           520,
			Height:          820,
			MinWidth:        360,
			MinHeight:       480,
			URL:             "ducter-app://" + id + "/",
			BackgroundColor: "light-dark(#FFF6EA, #17120E)",
			StateKey:        "app-" + id,
			Page:            mygo.PageOptions{Untrusted: true},
		})
		open[id] = w
		// A developer's look (DUCTER_APP_SHOT_DIR): the page as it drew, a few seconds in.
		if dir := os.Getenv("DUCTER_APP_SHOT_DIR"); dir != "" {
			go func() {
				time.Sleep(4 * time.Second)
				if png, err := w.CapturePage(); err == nil {
					_ = os.WriteFile(filepath.Join(dir, "mac-app-window-"+id+".png"), png, 0o644)
				}
				// The bridge both ways: a key written, an ask, and its answer back in the page.
				if os.Getenv("DUCTER_APP_PROBE") != "" {
					_, _ = w.Page().Eval(`ducter.set("probe", 1); ducter.ask("probe from the Mac window").then(t => { document.title = "answered: " + t; })`)
					time.Sleep(4 * time.Second)
					if v, err := w.Page().Eval(`document.title`); err == nil {
						_ = os.WriteFile(filepath.Join(dir, "mac-app-probe-"+id+".txt"), []byte(fmt.Sprint(v)), 0o644)
					}
				}
			}()
		}
		w.OnClosed(func() {
			mu.Lock()
			delete(open, id)
			mu.Unlock()
		})
	}
}
