package views

import (
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/mock"
	"github.com/wey-gu/ducter/apps/desktop/internal/remote"
)

// "My Ducter is on another machine": the first-run card opens the connect
// card; a wrong code says so in plain words; the right one pairs, the
// client moves to the new address, and the conversation takes over.
func TestConnectToRemoteDucter(t *testing.T) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	dead := l.Addr().String()
	l.Close()
	h := dial(t, "ws://"+dead+"/ws", i18n.ZH)

	hub := mock.NewHub(40)
	mux := http.NewServeMux()
	mux.Handle("/ws", hub.Handler())
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	var tries []string
	h.app.Pair = func(base, code string) error {
		tries = append(tries, base+" "+code)
		if code != "K7QM-4XPA" {
			return remote.ErrBadCode
		}
		h.c.Retarget("ws"+strings.TrimPrefix(srv.URL, "http")+"/ws", "dvc.test.token")
		return nil
	}
	h.until("a failed attempt", func() bool { return h.app.Failed })
	h.click("我的 Ducter 在另一台机器上")
	for _, want := range []string{"连接到你的 Ducter", PairCommand, "地址", "配对码", "连上"} {
		if !h.tt.HasText(want) {
			t.Errorf("connect card lacks %q: %q", want, h.tt.Texts())
		}
	}
	h.shot("connect")

	h.app.conn.address = "https://ducter.example.com"
	h.app.conn.code = "AAAA-AAAA"
	h.click("连上")
	if !h.tt.HasText("这个码不对，或者已经过期了。在那台机器上再运行一次 ducter pair。") {
		t.Errorf("no bad-code line: %q", h.tt.Texts())
	}
	h.shot("connect-badcode")

	// The whole link `ducter pair` prints carries the code; the code field may be empty.
	h.app.conn.address = "https://ducter.example.com/pair#c=k7qm4xpa"
	h.app.conn.code = ""
	h.click("连上")
	h.until("welcome from the paired server", func() bool { return h.app.S.Welcomed && h.app.S.OnHand != nil })
	if want := []string{"https://ducter.example.com AAAA-AAAA", "https://ducter.example.com K7QM-4XPA"}; strings.Join(tries, "|") != strings.Join(want, "|") {
		t.Errorf("tries %q", tries)
	}
	if h.tt.HasText("连接到你的 Ducter") || !h.tt.HasText("手头") {
		t.Errorf("still on the connect card: %q", h.tt.Texts())
	}
}

// A device that was disconnected on the server lands on the connect card
// with one line saying so, and no way back to a dead end.
func TestRevokedDeviceSeesConnectCard(t *testing.T) {
	h := dial(t, "ws://127.0.0.1:1/ws", i18n.EN)
	h.app.Pair = func(string, string) error { return nil }
	h.app.Unauthorized = true
	h.tt.Frame()
	for _, want := range []string{"Connect to your Ducter", "This Mac was disconnected from your Ducter. Pair it again to come back."} {
		if !h.tt.HasText(want) {
			t.Errorf("lacks %q: %q", want, h.tt.Texts())
		}
	}
	if h.tt.HasText("Back") {
		t.Error("a revoked device has nowhere to go back to")
	}
	h.shot("connect-revoked")
}
