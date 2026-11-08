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

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/hints"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/remote"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
	"github.com/wey-gu/ducter/apps/desktop/internal/views"
)

func main() {
	theme.LoadFonts()
	s := store.New()
	lang := i18n.Detect(mygo.App.PreferredLanguages())
	app := views.New(s, theme.Pebble(), i18n.New(lang))
	app.LocaleFixed = i18n.Fixed()
	app.Local = hints.Open(hints.DataDir())

	mygo.App.WhenReady(func() {
		win := mygo.NewWindow(mygo.WindowOptions{
			Title:     "Ducter",
			Width:     1280,
			Height:    860,
			MinWidth:  760,
			MinHeight: 560,
			Content:   ui.View(app.View),
		})
		app.Win = win

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
				win.Update(func() { app.Receive(f) })
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
		go c.Run(context.Background())
	})
	if err := mygo.App.Run(); err != nil {
		log.Fatal(err)
	}
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
