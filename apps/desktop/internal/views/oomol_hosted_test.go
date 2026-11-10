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

// D158: adding OOMOL Hosted with a key. Each outcome says what it is, and a
// refusal never wears the done look.

func hostedForm(t *testing.T, lang i18n.Lang) (*App, *[]any, *ui.Tester, *[]string) {
	t.Helper()
	app, sent := iaApp(t, lang)
	var opened []string
	app.OpenExternal = func(u string) error { opened = append(opened, u); return nil }
	app.Receive(settingsFrame())
	app.Receive(ooFrame(protocol.OoDetect{Installed: false}))
	app.Route, app.settings.tab = RouteSettings, TabAccounts
	tt := ui.NewTesterWith(app.View, 1280, 2200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Click(app.L.T("acct.add"))
	tt.Frame()
	tt.Frame()
	return app, sent, tt, &opened
}

func lastAdd(sent *[]any) (protocol.ConnectionAdd, bool) {
	for i := len(*sent) - 1; i >= 0; i-- {
		if f, ok := (*sent)[i].(protocol.ConnectionAdd); ok {
			return f, true
		}
	}
	return protocol.ConnectionAdd{}, false
}

func TestOomolHostedForm(t *testing.T) {
	app, sent, tt, opened := hostedForm(t, i18n.ZH)
	for _, want := range []string{"在 OOMOL 登录，把 Gmail、Discord 这些账号连上。", "去 OOMOL 连账号", "在 OOMOL 控制台新建一把钥匙。", "去拿钥匙", "钥匙", "显示"} {
		if !tt.HasText(want) {
			t.Errorf("no %q", want)
		}
	}
	if tt.HasText("地址") {
		t.Errorf("OOMOL Hosted has one address: no address field")
	}
	if tt.HasText("Access") || tt.HasText("Create Token") {
		t.Errorf("the hosted steps still name OpenConnector's Access page")
	}
	tt.Click("去拿钥匙")
	tt.Click("去 OOMOL 连账号")
	if len(*opened) != 2 || (*opened)[0] != "https://console.oomol.com/api-key" || (*opened)[1] != "https://console.oomol.com/app-connections" {
		t.Errorf("the links open %v", *opened)
	}

	// Empty key: nothing is sent, and the field says so.
	n := len(*sent)
	tt.Click("检查并加上")
	tt.Frame()
	if len(*sent) != n {
		t.Errorf("an empty key was sent")
	}
	if !tt.HasText("先把钥匙填上。") {
		t.Errorf("no inline line for the empty key")
	}

	// A pasted key with a space and a line break: trimmed, sent to the hosted address.
	app.partner.acctToken = "  api_abc123 \n"
	tt.Frame()
	if tt.HasText("先把钥匙填上。") {
		t.Errorf("the empty-key line stays once a key is typed")
	}
	tt.Click("检查并加上")
	tt.Frame()
	f, ok := lastAdd(sent)
	if !ok || f.URL != hostedConnector || f.Token != "api_abc123" {
		t.Fatalf("sent %#v", f)
	}
	if app.partner.acctToken != "" {
		t.Errorf("the key is kept in the app after it was sent")
	}
}

func TestOomolHostedOutcomes(t *testing.T) {
	refusals := map[string]string{
		"unauthorized": "钥匙不对或已失效，换一把新的。",
		"not_mcp":      "这个地址上没有 Ducter 能用的账号服务，看看地址对不对。",
		"unreachable":  "连不上这个地址。看看网络，过一会儿再试。",
	}
	for reason, want := range refusals {
		app, _, tt, _ := hostedForm(t, i18n.ZH)
		app.partner.acctWaiting = true
		app.Receive(protocol.ServerFrame{T: "connection_result", OK: false, Reason: reason})
		tt.Frame()
		tt.Frame()
		if !tt.HasText(want) {
			t.Errorf("%s: no %q", reason, want)
		}
		if app.partner.toast != "" {
			t.Errorf("%s: a refusal went to the done-look toast", reason)
		}
		if (reason == "unauthorized") != (tt.HasText("去拿钥匙") && app.partner.acctErr == "unauthorized") {
			t.Errorf("%s: Get a key beside the refusal is only for a refused key", reason)
		}
	}

	// With no form open (the oo tap), a refusal is a toast in the failed look.
	app, _ := iaApp(t, i18n.ZH)
	app.Receive(protocol.ServerFrame{T: "connection_result", OK: false, Reason: "unreachable"})
	app.drainConnResult()
	if app.partner.toastTone != noticeAlert {
		t.Errorf("a refusal toast has tone %d, want alert", app.partner.toastTone)
	}

	// Added, with what it can now read.
	conn := protocol.ConnectionView{ID: "conn_1", Name: "OOMOL", URL: "https://connector.oomol.com/v1/mcp", Source: "oomol", Via: "manual", State: "ok",
		Apps: []protocol.OoApp{{Service: "gmail", Title: "Gmail", Accounts: []string{"wei@work.example"}}, {Service: "discord", Title: "Discord", Accounts: []string{"wey"}}}}
	app, _, tt, _ := hostedForm(t, i18n.ZH)
	app.Receive(ooFrame(protocol.OoDetect{}, conn))
	app.Receive(protocol.ServerFrame{T: "connection_result", OK: true, ID: "conn_1", Readable: conn.Apps})
	tt.Frame()
	tt.Frame()
	if !tt.HasText("加上了 OOMOL，现在能看：Gmail、Discord") || app.partner.toastTone != noticeDone {
		t.Errorf("added: the done line lists what it reads (tone %d)", app.partner.toastTone)
	}
	if app.partner.acctAdding {
		t.Errorf("the form stays open after adding")
	}

	// Connected, but nothing connected in OOMOL yet: not the done look, and a way to fix it.
	empty := conn
	empty.Apps = []protocol.OoApp{}
	app, _, tt, opened := hostedForm(t, i18n.EN)
	app.Receive(ooFrame(protocol.OoDetect{}, empty))
	app.Receive(protocol.ServerFrame{T: "connection_result", OK: true, ID: "conn_1", Readable: []protocol.OoApp{}})
	tt.Frame()
	tt.Frame()
	// D166: the card's status line says so, with the way to fix it under it.
	if app.partner.toastTone != noticeInfo || !tt.HasText("No accounts connected there yet · connect one") {
		t.Errorf("connected but empty: tone %d", app.partner.toastTone)
	}
	tt.Click("Connect accounts in OOMOL")
	if len(*opened) != 1 || (*opened)[0] != oomolAccounts {
		t.Errorf("the row's link opens %v", *opened)
	}
}

// TestOomolHostedShots writes each outcome (zh/en) for review:
//
//	DUCTER_OOMOL_SHOTS=../../../../.shots/oomol go test ./internal/views -run OomolHostedShots
func TestOomolHostedShots(t *testing.T) {
	dir := os.Getenv("DUCTER_OOMOL_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_OOMOL_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	apps := []protocol.OoApp{{Service: "gmail", Title: "Gmail", Accounts: []string{"wei@work.example"}}, {Service: "discord", Title: "Discord", Accounts: []string{"wey"}}}
	conn := protocol.ConnectionView{ID: "conn_1", Name: "OOMOL", URL: "https://connector.oomol.com/v1/mcp", Source: "oomol", Via: "manual", State: "ok", Apps: apps}
	empty := conn
	empty.Apps = []protocol.OoApp{}
	type scene struct {
		name string
		run  func(app *App, tt *ui.Tester)
	}
	refuse := func(reason string) func(app *App, tt *ui.Tester) {
		return func(app *App, tt *ui.Tester) {
			app.Receive(protocol.ServerFrame{T: "connection_result", OK: false, Reason: reason})
		}
	}
	scenes := []scene{
		{"form", func(app *App, tt *ui.Tester) {}},
		{"no-key", func(app *App, tt *ui.Tester) { tt.Click(app.L.T("acct.check")) }},
		{"unauthorized", refuse("unauthorized")},
		{"not-mcp", refuse("not_mcp")},
		{"unreachable", refuse("unreachable")},
		{"added", func(app *App, tt *ui.Tester) {
			app.Receive(ooFrame(protocol.OoDetect{}, conn))
			app.Receive(protocol.ServerFrame{T: "connection_result", OK: true, ID: "conn_1", Readable: apps})
		}},
		{"empty", func(app *App, tt *ui.Tester) {
			app.Receive(ooFrame(protocol.OoDetect{}, empty))
			app.Receive(protocol.ServerFrame{T: "connection_result", OK: true, ID: "conn_1", Readable: []protocol.OoApp{}})
		}},
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, s := range scenes {
			app, _ := iaApp(t, lang)
			app.Receive(settingsFrame())
			app.Receive(ooFrame(protocol.OoDetect{}))
			app.Route, app.settings.tab = RouteSettings, TabAccounts
			tt := ui.NewTesterWith(app.View, 1280, 1500, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			tt.Frame()
			tt.Click(app.L.T("acct.add"))
			tt.Frame()
			s.run(app, tt)
			tt.Frame()
			tt.Frame()
			tt.Advance(time.Second)
			f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%s.png", s.name, lang)))
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
