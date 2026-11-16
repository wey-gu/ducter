package main

import (
	"context"
	"os"
	"path/filepath"
	"runtime"

	"github.com/egoist/mygo"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/imessage"
	"github.com/wey-gu/ducter/apps/desktop/internal/media"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/views"
)

// startIMessage wires this Mac's iMessage bridge (D277) to the app and its
// connection to the home: the person's words in iMessage go to the home as
// theirs (via "imessage"), and what answers them comes back. It reads
// nothing until the person connects it in Settings › Notifications, and
// never on anything but a Mac. DUCTER_IMESSAGE=off leaves it out.
func startIMessage(app *views.App, win *mygo.Window, c *client.Client) *imessage.Bridge {
	if runtime.GOOS != "darwin" || os.Getenv("DUCTER_IMESSAGE") == "off" {
		return nil
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		return nil
	}
	onMain := func(fn func()) { mygo.RunOnMain(fn) }
	b := imessage.New(imessage.Options{
		Store:     imessage.SQLiteStore{Path: imessage.DefaultDB()},
		Sender:    imessage.OsaSender{},
		StatePath: filepath.Join(dir, "Ducter", "imessage.json"),
		Relay: func(text, clientID string, ids []string) error {
			return c.Send(protocol.Send{T: "send", Text: text, ClientID: clientID, Media: ids, Via: "imessage"})
		},
		Decide: func(id, option string) error {
			return c.Send(protocol.Decide{T: "decide", DecisionID: id, Option: option})
		},
		Report:  func(s protocol.ChannelStatus) { _ = c.Send(s) },
		Changed: func() { win.Update(func() {}) },
		Upload: func(path, mime string) (string, error) {
			data, err := os.ReadFile(path)
			if err != nil {
				return "", err
			}
			url, token := c.Target()
			home := media.Home{Base: media.HTTPBase(url), Token: token}
			var ref protocol.MediaRef
			if p, perr := media.Prepare(data); perr == nil {
				ref, err = home.Upload(context.Background(), p, filepath.Base(path), nil)
			} else {
				ref, err = home.UploadFile(context.Background(), data, filepath.Base(path), nil) // HEIC and the like, as they are
			}
			return ref.ID, err
		},
		Name: func() (n string) { onMain(func() { n = app.S.PersonaName }); return },
		Lang: func() (l string) { onMain(func() { l = string(app.L.Lang) }); return },
		Quiet: func() (q *protocol.QuietHours) {
			onMain(func() {
				if st := app.S.Settings; st != nil {
					q = st.Quiet
				}
			})
			return
		},
		Foreground: func() (f bool) { onMain(func() { f = win.IsVisible() && win.IsFocused() }); return },
	})
	app.IMessage = b
	go b.Run(context.Background())
	return b
}
