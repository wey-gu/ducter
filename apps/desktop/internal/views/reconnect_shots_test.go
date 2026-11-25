package views

import (
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D520's states as the person meets them, for review: a home elsewhere
// (hel) restarting (正在重新连上 hel…), a long outage (the notice), the
// launch card while hel hasn't answered, and the true revoke (the connect
// card, its line and the address kept). Mac 1000 and 1400, zh and en,
// light and dark:
//
//	DUCTER_RECONNECT_SHOTS=$PWD/../../../../.shots/reconnect go test ./internal/views -run ReconnectShots
func TestReconnectShots(t *testing.T) {
	dir := os.Getenv("DUCTER_RECONNECT_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_RECONNECT_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	shoot := func(tt *ui.Tester, name string) {
		t.Helper()
		tt.Advance(time.Second)
		tt.Frame()
		f, err := os.Create(filepath.Join(dir, name+".png"))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, tt.Image()); err != nil {
			t.Fatal(err)
		}
	}
	hel := protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{
		{ID: "local", Name: "hel", Kind: "server", Home: true, AlwaysOn: true, State: protocol.DeviceAwake},
		{ID: "b4mac", Name: "MacBook Pro", Kind: "laptop", State: protocol.DeviceAwake},
	}}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		h := newHarness(t, lang)
		a := h.app
		a.Receive(hel)
		a.URL = "wss://hel.siwei.info/ws"
		a.RetryNow = func() {}
		a.Pair = func(string, string) error { return nil }
		now := time.Now()
		a.Now = func() time.Time { return now }
		a.NextAttempt = func() time.Time { return now.Add(4 * time.Second) }
		for _, dark := range []bool{false, true} {
			for _, w := range []int{1000, 1400} {
				hgt := 760
				if w == 1400 {
					hgt = 900
				}
				h.tt.SetSize(w, hgt)
				h.tt.SetDark(dark)
				sz := "-" + string(lang) + "-" + itoa(int64(w))
				if dark {
					sz += "-dark"
				}
				a.Linked(client.Connected, nil)
				a.Route = RouteConversation
				h.tt.Frame()
				shoot(h.tt, "0-connected"+sz)

				a.Linked(client.Disconnected, client.ErrRefused)
				a.Linked(client.Connecting, nil)
				h.tt.Frame()
				if !hasText(h.tt, a.L.T("conn.reconnecting", "hel")) {
					t.Errorf("%s: no quiet line: %q", sz, h.tt.Texts())
				}
				shoot(h.tt, "1-reconnecting"+sz)

				now = now.Add(LongOutage + 15*time.Second)
				a.Linked(client.Disconnected, client.ErrRefused)
				h.tt.Frame()
				if !hasText(h.tt, a.L.T("conn.lost.title", "hel")) {
					t.Errorf("%s: no long-outage notice: %q", sz, h.tt.Texts())
				}
				shoot(h.tt, "2-long-outage"+sz)

				a.Linked(client.Disconnected, &client.GoneError{Reason: "revoked"})
				h.tt.Frame()
				shoot(h.tt, "3-revoked"+sz)
				a.Linked(client.Connected, nil)
				a.conn.open = false

				// A launch while hel hasn't answered: nothing of the conversation here yet.
				fresh := New(store.New(), theme.Pebble(), i18n.New(lang))
				fresh.URL, fresh.Now = a.URL, a.Now
				fresh.RetryNow, fresh.NextAttempt, fresh.Pair = a.RetryNow, a.NextAttempt, a.Pair
				ft := ui.NewTesterWith(fresh.View, w, hgt, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				ft.SetDark(dark)
				fresh.Linked(client.Disconnected, client.ErrRefused)
				ft.Frame()
				shoot(ft, "4-launch-reaching"+sz)
				now = now.Add(LongOutage)
				ft.Frame()
				shoot(ft, "5-launch-lost"+sz)
			}
		}
	}
}
