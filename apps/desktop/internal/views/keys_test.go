package views

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D233: the key card on the Mac: what and why, the masked field, Save and
// continue sends the key with the Go (once when chosen), and the key never
// stays in the app or on screen; Settings › Autofill lists the keys and the
// switch without a value.

func keyCardApp(t *testing.T) (*App, *[]any, *ui.Tester) {
	app, sent := iaApp(t, i18n.EN)
	app.Status = client.Connected
	d := protocol.Decision{DecisionID: "d1", TaskID: "t1", Question: "Deploy the blog needs a key: DigitalOcean deploy token (DO_TOKEN)", GoLabel: "Save and continue", DefaultOption: "hold",
		Key: &protocol.KeyAsk{Env: "DO_TOKEN", Name: "DigitalOcean deploy token", Why: "to push the new build", File: "/tmp/t1.env"}}
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		ev(protocol.TaskStream("t1"), protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t1", Title: "Deploy the blog", Harness: "codex", Place: protocol.Place{Kind: "none"}}),
		chEv(2, protocol.OriginSystem, protocol.KindDecision, d),
	}})
	sd := app.S.Decisions["d1"]
	if sd == nil || sd.Key == nil {
		t.Fatalf("no key decision in the store: %#v", sd)
	}
	tt := ui.NewTesterWith(func(c *ui.Context) {
		ui.Column(c).Padding(24).Gap(12).Children(func() { a := app; a.keyButtons(c, sd, decisionStyle{height: a.T.ControlMD, quietBg: a.T.Surface}) })
	}, 520, 620, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	return app, sent, tt
}

func TestKeyCardSendsTheKeyWithGo(t *testing.T) {
	app, sent, tt := keyCardApp(t)
	if q := app.questionOf(app.S.Decisions["d1"]); q != "Deploy the blog needs a key" {
		t.Errorf("question %q", q)
	}
	for _, want := range []string{"DigitalOcean deploy token", "DO_TOKEN", "to push the new build", "Paste the key here", "Remember it", "Just this once", "Save and continue", "Don't give"} {
		if !hasText(tt, want) {
			t.Errorf("missing %q in %q", want, tt.Texts())
		}
	}
	// Empty: Go does nothing.
	if err := tt.Click("Save and continue"); err != nil {
		t.Fatal(err)
	}
	if _, ok := lastSent[protocol.DecideKey](*sent); ok {
		t.Fatal("sent without a key")
	}
	app.af.keyVal["d1"] = "dop_v1_secretsecretsecret"
	if err := tt.Click("Just this once"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if err := tt.Click("Give it and continue"); err != nil {
		t.Fatal(err)
	}
	k, ok := lastSent[protocol.DecideKey](*sent)
	if !ok || k.Key != "dop_v1_secretsecretsecret" || !k.Once || k.Option != "go" || k.DecisionID != "d1" {
		t.Fatalf("Go sent %#v", *sent)
	}
	if _, kept := app.af.keyVal["d1"]; kept {
		t.Error("the key stayed in the app after Go")
	}
	tt.Frame()
	if strings.Contains(fmt.Sprint(tt.Texts()), "secretsecret") {
		t.Error("the key is drawn")
	}
	if !hasText(tt, "Given to Deploy the blog") {
		t.Errorf("no receipt: %q", tt.Texts())
	}
	// The menu bar opens the window for it; it never offers Go.
	app.S.Decisions["d1"].Pending = ""
	for _, d := range app.TrayDecisions(6) {
		if d.ID == "d1" && !d.InWindow {
			t.Error("the menu offers Go on a key card")
		}
	}
}

// D233: the conversation draws a task's key ask as the key card, the same as
// the task page and On hand, never a generic Go that carries no key (the home
// refuses it, which left the card answered here and open nowhere).
func TestKeyAskInConversation(t *testing.T) {
	app, sent, tt := keyConversationApp(t)
	for _, want := range []string{"Paste the key here", "DigitalOcean deploy token", "DO_TOKEN", "to push the new build", "Remember it", "Just this once", "Save and continue", "Don't give"} {
		if !hasText(tt, want) {
			t.Errorf("missing %q in %q", want, tt.Texts())
		}
	}
	before := len(*sent)
	if err := tt.Click("Save and continue"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if _, ok := lastSent[protocol.Decide]((*sent)[before:]); ok {
		t.Fatalf("a plain Go went for a key ask: %#v", (*sent)[before:])
	}
	if _, ok := lastSent[protocol.DecideKey]((*sent)[before:]); ok {
		t.Fatal("sent a key without a value")
	}
	if d := app.S.Decisions["d1"]; d.Pending != "" {
		t.Errorf("the ask is marked answered though nothing went: %q", d.Pending)
	}
}

// A decide the home refuses answers nothing: the key card comes back with its
// field, instead of staying locally answered and open nowhere.
func TestRefusedKeyGoPutsTheCardBack(t *testing.T) {
	app, sent, tt := keyConversationApp(t)
	app.af.keyVal["d1"] = "dop_v1_secretsecretsecret"
	tt.Frame()
	if err := tt.Click("Save and continue"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if _, ok := lastSent[protocol.DecideKey](*sent); !ok {
		t.Fatal("the key Go sent nothing")
	}
	if d := app.S.Decisions["d1"]; d.Pending != "go" {
		t.Fatalf("the ask is not waiting on the home: %q", d.Pending)
	}
	app.Receive(protocol.ServerFrame{T: "error", Message: "decide: paste the key first"})
	tt.Frame()
	if d := app.S.Decisions["d1"]; d.Pending != "" {
		t.Errorf("a refused decide left the ask answered: %q", d.Pending)
	}
	if !hasText(tt, "Paste the key here") {
		t.Errorf("the key field did not come back: %q", tt.Texts())
	}
}

func keyConversationApp(t *testing.T) (*App, *[]any, *ui.Tester) {
	t.Helper()
	app, sent := iaApp(t, i18n.EN)
	app.Status = client.Connected
	now := time.Now().UTC().Format(time.RFC3339Nano)
	d := protocol.Decision{DecisionID: "d1", TaskID: "t1", Question: "Deploy the blog needs a key: DigitalOcean deploy token (DO_TOKEN)", GoLabel: "Save and continue", DefaultOption: "hold",
		Key: &protocol.KeyAsk{Env: "DO_TOKEN", Name: "DigitalOcean deploy token", Why: "to push the new build", File: "/tmp/t1.env"}}
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(1, now, "default", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: "Deploy the blog"}),
		protocol.NewEvent(2, now, "default", protocol.TaskStream("t1"), protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t1", Title: "Deploy the blog", Harness: "codex", Place: protocol.Place{Kind: "none"}}),
		protocol.NewEvent(3, now, "default", "channel", protocol.OriginSystem, protocol.KindDecision, d),
		protocol.NewEvent(4, now, "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: "Deploying needs a DigitalOcean token; paste it here and I'll carry on.", DecisionID: "d1"}),
	}})
	tt := ui.NewTesterWith(app.View, 1100, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	return app, sent, tt
}

func TestKeysInSettings(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	f := savedFrameFor(i18n.ZH)
	f.SavedKeys = []protocol.KeyView{{ID: "k1", Kind: "key", Handle: "key:DO_TOKEN", Env: "DO_TOKEN", Name: "DigitalOcean 部署密钥", Hint: "dop_v1_••••••", AddedAt: "2026-11-12T08:00:00Z"}}
	f.Uses = append([]protocol.SavedUse{{At: "2026-11-12T08:10:00Z", Handle: "key:DO_TOKEN", Label: "DigitalOcean 部署密钥", What: "given", TaskID: "t1", Task: "部署博客", Once: true}}, f.Uses...)
	app.Receive(f)
	app.openTab(TabAutofill)
	tt := ui.NewTesterWith(app.View, 1280, 2200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	tt.Frame()
	for _, want := range []string{"密钥", "让任务向你要密钥", "DigitalOcean 部署密钥", "DO_TOKEN", "添加密钥", "把 DigitalOcean 部署密钥交给了任务，只这一次"} {
		if !hasText(tt, want) {
			t.Errorf("missing %q in %q", want, tt.Texts())
		}
	}
	// The Mac walk of 0.0.98: Save with the variable name left empty said
	// nothing and sent nothing; now it names what is missing.
	if err := tt.Click("添加密钥"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	app.af.name, app.af.password = "Hetzner 的 API 令牌", "demo-hetzner-not-a-token"
	tt.Frame()
	if err := tt.Click("保存"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if !hasText(tt, "「变量名」还没填好。") {
		t.Errorf("a Save that can't go says nothing: %q", tt.Texts())
	}
	app.af.keyEnv = "HCLOUD_TOKEN"
	tt.Frame()
	if hasText(tt, "「变量名」还没填好。") {
		t.Error("the line stays once the field is filled")
	}
}
