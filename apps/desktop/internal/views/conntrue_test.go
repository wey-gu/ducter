package views

import (
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D666 (research/247 Brief D): a connection says what is true. One readiness table for calls,
// one kind → name table for chat apps, and Import's head and Try again.
func conntruePhoneFrame(state string) protocol.ServerFrame {
	pv := &protocol.PhoneView{Provider: "Tuwa", CapUSD: 10, SpentTodayUSD: 1.6, Calls: 1}
	pv.Rails = &struct {
		Cap      bool `json:"cap"`
		Sampling bool `json:"sampling"`
		Shared   bool `json:"shared"`
	}{true, true, false}
	return protocol.ServerFrame{T: "connections", Connections: []protocol.ConnectionView{
		{ID: "c2", Name: "Tuwa", URL: protocol.TuwaMCP, Source: "mcp", Via: "manual", State: state, SignIn: true, Phone: pv},
	}, Oo: &protocol.OoDetect{Installed: false}}
}

func TestPhoneCardReadinessTable(t *testing.T) {
	for _, tc := range []struct {
		state string
		line  string
		today bool
		act   string
	}{
		{"ok", "phone.card.ready", true, ""},
		{"unauthorized", "phone.card.signed_out", false, "phone.signin.reauth"},
		{"unreachable", "phone.card.down", false, "acct.retry"},
		{"unknown", "phone.card.checking", false, ""},
	} {
		t.Run(tc.state, func(t *testing.T) {
			app, sent := iaApp(t, i18n.ZH)
			L := app.L
			app.Receive(settingsFrame())
			app.Receive(conntruePhoneFrame(tc.state))
			app.openTab(TabAccounts)
			tt := ui.NewTesterWith(app.View, 1000, 1200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.Frame()
			line := L.T(tc.line)
			if tc.line != "phone.card.ready" {
				line = L.T(tc.line, "Tuwa")
			}
			if !hasText(tt, line) {
				t.Fatalf("%s: no %q in %q", tc.state, line, tt.Texts())
			}
			today := L.T("phone.card.today.one", money(1.6))
			if got := hasText(tt, today); got != tc.today {
				t.Fatalf("%s: today's count shown %v, want %v; %q", tc.state, got, tc.today, tt.Texts())
			}
			if tc.act == "" {
				if hasText(tt, L.T("acct.retry")) || hasText(tt, L.T("phone.signin.reauth")) {
					t.Fatalf("%s: a ready card carries an action: %q", tc.state, tt.Texts())
				}
				return
			}
			act := L.T(tc.act)
			if err := tt.Click(spoken(L, act, "Tuwa")); err != nil {
				t.Fatalf("%s: %v in %q", tc.state, err, tt.Texts())
			}
			tt.Frame()
			if len(*sent) == 0 {
				t.Fatalf("%s: %s sent nothing", tc.state, act)
			}
			switch tc.act {
			case "phone.signin.reauth":
				if _, ok := (*sent)[len(*sent)-1].(protocol.ConnectionReauth); !ok {
					t.Fatalf("%s: sent %#v", tc.state, (*sent)[len(*sent)-1])
				}
			case "acct.retry":
				if _, ok := (*sent)[len(*sent)-1].(protocol.ConnectionsReq); !ok {
					t.Fatalf("%s: sent %#v", tc.state, (*sent)[len(*sent)-1])
				}
			}
		})
	}
}

func TestChatKindNamesAreOneTable(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	L := app.L
	for _, kind := range []string{"wechat", "telegram", "slack", "feishu"} {
		if got := app.chatName(kind); got == "" {
			t.Fatalf("chatName(%q) is empty", kind)
		}
	}
	app.S.Channels = &protocol.ServerFrame{T: "channels", Channels: []protocol.ChannelView{
		{Kind: "telegram", State: "linked"},
		{Kind: "feishu", State: "linked"},
		{Kind: "slack", State: "off"},
	}}
	for _, got := range []string{app.chatsSay(), app.homeReach(), app.paneSay(TabChats, "")} {
		if !strings.Contains(got, L.T("chats.feishu")) || strings.Contains(got, "Slack") {
			t.Fatalf("a linked Feishu / Lark is missing from %q", got)
		}
	}
	app.S.Channels = nil
	if got := app.chatsSay(); got != L.T("say.chats") {
		t.Fatalf("no frame: %q", got)
	}
}

func TestImportHeadIsTheStateAndEveryProblemHasTryAgain(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	L := app.L
	app.Receive(protocol.ServerFrame{T: "imports", Imports: &protocol.ImportsFrame{Sources: []protocol.ImportSourceRow{
		{ID: "lody", App: "Lody", State: "signed_out", Problem: "signed_out"},
	}}})
	// The head says what was brought in, never what the pane is for.
	if got, want := app.paneSay(TabImport, L.T("imports.lede")), app.importsSay(); got != want || got == L.T("imports.lede") {
		t.Fatalf("Import head: %q, want the state %q", got, want)
	}
	app.openTab(TabImport)
	tt := ui.NewTesterWith(app.View, 1000, 1200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if !hasText(tt, L.T("imports.problem.signed_out")) {
		t.Fatalf("the signed-out row: %q", tt.Texts())
	}
	if err := tt.Click(spoken(L, L.T("imports.retry"), "Lody")); err != nil {
		t.Fatalf("no Try again on a signed-out source: %v in %q", err, tt.Texts())
	}
	tt.Frame()
	if len(*sent) == 0 {
		t.Fatal("Try again sent nothing")
	}
	if _, ok := (*sent)[len(*sent)-1].(protocol.ImportsReq); !ok {
		t.Fatalf("Try again sent %#v", (*sent)[len(*sent)-1])
	}
	// A removal is a line under the sources, with its own status.
	app.imports.notice = L.T("imports.removed")
	for i := 0; i < 3; i++ {
		tt.Frame()
		tt.Advance(60 * time.Millisecond)
	}
	if !hasText(tt, L.T("imports.removed")) {
		t.Fatalf("no removal line: %q", tt.Texts())
	}
}
