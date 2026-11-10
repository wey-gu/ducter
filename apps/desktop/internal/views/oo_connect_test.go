package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D122: with the user's oo signed in, connecting accounts is one tap on the
// Partner page: what Ducter will read, where the mail passes, one button.

var ooApps = []protocol.OoApp{
	{Service: "gmail", Title: "Gmail", Accounts: []string{"wei@work.example", "wei@home.example"}},
	{Service: "slack", Title: "Slack", Accounts: []string{"Nowledge Labs"}},
	{Service: "discordbot", Title: "Discord bot", Accounts: []string{"wey"}},
}

func ooFrame(oo protocol.OoDetect, conns ...protocol.ConnectionView) protocol.ServerFrame {
	return protocol.ServerFrame{T: "connections", Connections: conns, Oo: &oo}
}

func TestOoOfferIsTheDefault(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Receive(settingsFrame())
	app.Receive(ooFrame(protocol.OoDetect{Installed: true, Account: true, Apps: ooApps}))
	app.Route, app.settings.tab = RouteSettings, TabAccounts
	tt := ui.NewTesterWith(app.View, 1280, 2200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	for _, want := range []string{"你在 oo 里的账号", "Gmail", "wei@work.example · wei@home.example", "Slack", "用这些账号", "你的邮件和登录凭据会经过 OOMOL 的服务器。", "用地址和钥匙加一个"} {
		if !tt.HasText(want) {
			t.Errorf("no %q", want)
		}
	}
	if tt.HasText("加一个") && !tt.HasText("用地址和钥匙加一个") {
		t.Errorf("the address-and-key form should step back behind a quiet link")
	}
	n := len(*sent)
	tt.Click("用这些账号")
	tt.Frame()
	if len(*sent) != n+1 {
		t.Fatalf("the tap sends one frame, got %d", len(*sent)-n)
	}
	if f, ok := (*sent)[n].(protocol.ConnectionOo); !ok || f.T != "connection_oo" {
		t.Errorf("the tap sends connection_oo, got %#v", (*sent)[n])
	}
	tt.Click("正在加上…")
	tt.Frame()
	if len(*sent) != n+1 {
		t.Errorf("a second tap while adding sends nothing")
	}

	// Added: the row says what it reads; the offer is gone.
	app.Receive(ooFrame(protocol.OoDetect{Installed: true, Account: true, Apps: ooApps},
		protocol.ConnectionView{ID: "conn_1", Name: "oo", URL: "oo:", Source: "oo", Via: "oo", State: "ok", Apps: ooApps}))
	tt.Frame()
	tt.Frame()
	for _, want := range []string{"oo 里的账号", "Gmail (2) · Slack · Discord bot", "经过 oo · 邮件和登录经过 OOMOL 的服务器", "加一个"} {
		if !tt.HasText(want) {
			t.Errorf("after adding: no %q", want)
		}
	}
	if tt.HasText("用这些账号") {
		t.Errorf("the offer stays after adding")
	}
}

func TestOoOfferLoadingAndEmpty(t *testing.T) {
	app, _ := iaApp(t, i18n.EN)
	app.Receive(settingsFrame())
	app.Receive(ooFrame(protocol.OoDetect{Installed: true, Account: true}))
	app.Route, app.settings.tab = RouteSettings, TabAccounts
	tt := ui.NewTesterWith(app.View, 1280, 2200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	if !tt.HasText("Looking at what's in oo…") || tt.HasText("Use these accounts") {
		t.Errorf("before oo answers: a loading line and no button")
	}
	app.Receive(ooFrame(protocol.OoDetect{Installed: true, Account: true, Apps: []protocol.OoApp{}}))
	tt.Frame()
	if !tt.HasText("No accounts in oo yet. Add Gmail and the rest in oo, then come back and tap once.") {
		t.Errorf("an oo with no accounts says so")
	}
}

// TestOoConnectShots writes the one tap's pictures (zh/en, offer / loading / added / the manual fold) for review:
//
//	DUCTER_OO_SHOTS=../../../../.shots/oo-connect go test ./internal/views -run OoConnectShots
func TestOoConnectShots(t *testing.T) {
	dir := os.Getenv("DUCTER_OO_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_OO_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	type scene struct {
		name  string
		frame protocol.ServerFrame
		setup func(a *App)
	}
	added := protocol.ConnectionView{ID: "conn_1", Name: "oo", URL: "oo:", Source: "oo", Via: "oo", State: "ok", Apps: ooApps}
	scenes := []scene{
		{"offer", ooFrame(protocol.OoDetect{Installed: true, Account: true, Apps: ooApps}), nil},
		{"loading", ooFrame(protocol.OoDetect{Installed: true, Account: true}), nil},
		{"manual", ooFrame(protocol.OoDetect{Installed: true, Account: true, Apps: ooApps}), func(a *App) {
			a.partner.acctAdding, a.partner.acctURL = true, hostedConnector
		}},
		{"added", ooFrame(protocol.OoDetect{Installed: true, Account: true, Apps: ooApps}, added), nil},
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, s := range scenes {
			app, _ := iaApp(t, lang)
			app.Receive(settingsFrame())
			app.Receive(s.frame)
			app.Route, app.settings.tab = RouteSettings, TabAccounts
			if s.setup != nil {
				s.setup(app)
			}
			tt := ui.NewTesterWith(app.View, 1280, 1800, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			tt.Frame()
			tt.Frame()
			tt.Advance(time.Second)
			f, err := os.Create(filepath.Join(dir, fmt.Sprintf("oo-%s-%s.png", s.name, lang)))
			if err != nil {
				t.Fatal(err)
			}
			if err := png.Encode(f, tt.Image()); err != nil {
				t.Fatal(err)
			}
			f.Close()
		}
	}
}

// Removing accounts is never one tap: Remove asks in the row, and only the
// second Remove sends. The added line names the oo kind as people see it.
func TestAccountRemoveAsksFirst(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Receive(settingsFrame())
	added := protocol.ConnectionView{ID: "conn_1", Name: "oo", URL: "oo:", Source: "oo", Via: "oo", State: "ok", Apps: ooApps}
	app.Receive(ooFrame(protocol.OoDetect{Installed: true, Account: true, Apps: ooApps}, added))
	app.Route, app.settings.tab = RouteSettings, TabAccounts
	tt := ui.NewTesterWith(app.View, 1280, 2200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	n := len(*sent)
	tt.Click("移除")
	tt.Frame()
	if len(*sent) != n {
		t.Fatalf("the first Remove sends nothing, sent %d", len(*sent)-n)
	}
	if !tt.HasText("移除 oo 里的账号？Ducter 就看不到这些账号了。") || !tt.HasText("算了") {
		t.Fatalf("the row asks first; texts: %v", tt.Texts())
	}
	tt.Click("算了")
	tt.Frame()
	if tt.HasText("算了") || len(*sent) != n {
		t.Fatalf("Keep it closes the ask and sends nothing")
	}
	tt.Click("移除")
	tt.Frame()
	tt.Click("移除")
	tt.Frame()
	if len(*sent) != n+1 {
		t.Fatalf("the second Remove sends one frame, got %d", len(*sent)-n)
	}
	if f, ok := (*sent)[n].(protocol.ConnectionRemove); !ok || f.ID != "conn_1" {
		t.Errorf("sends connection_remove for conn_1, got %#v", (*sent)[n])
	}
	// The added line says "Accounts in oo", never the record name "oo".
	app.Receive(protocol.ServerFrame{T: "connection_result", OK: true, ID: "conn_1", Readable: ooApps})
	tt.Frame()
	if !tt.HasText("加上了 oo 里的账号，现在能看：Gmail、Slack、Discord bot") {
		t.Errorf("the added line names oo as people see it; texts: %v", tt.Texts())
	}
}
