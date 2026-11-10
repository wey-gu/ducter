package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D191: 设置 › 自动填充 on the Mac: what is saved without a secret, add a
// card (it goes once in saved_put), the 付款 / Pay card whose Go carries
// the security code, and Where it was used.

func savedFrameFor(lang i18n.Lang) protocol.ServerFrame {
	ago := func(d time.Duration) string { return time.Now().Add(-d).UTC().Format(time.RFC3339) }
	task := "Book the Kurashiki ryokan for Nov 20"
	if lang == i18n.ZH {
		task = "订仓敷的旅馆，11 月 20 号一晚"
	}
	return protocol.ServerFrame{T: "saved", KeptIn: "keychain",
		SavedItems: []protocol.SavedView{
			{ID: "s1", Handle: "signin:booking.com", Kind: "signin", Label: "booking.com", Site: "booking.com", Username: "wey@example.com", AddedAt: ago(48 * time.Hour), UsedAt: ago(20 * time.Minute)},
			{ID: "s2", Handle: "signin:github.com", Kind: "signin", Label: "github.com", Site: "github.com", Username: "wey-gu", AddedAt: ago(72 * time.Hour)},
			{ID: "c1", Handle: "card:visa-4242", Kind: "card", Label: "Visa ••4242", Brand: "visa", Last4: "4242", Exp: "08/29", Name: "Wey Gu", AddedAt: ago(48 * time.Hour), UsedAt: ago(18 * time.Minute)},
		},
		SavedDetails: []protocol.DetailView{
			{Key: "name", Handle: "me.name", Kept: true, Value: "Wey Gu"},
			{Key: "seat", Handle: "me.seat", Kept: true, Value: "Window"},
			{Key: "passport_number", Handle: "me.passport_number", Kept: true, Hint: "•••678"},
			{Key: "loyalty", Handle: "me.loyalty", Kept: true},
		},
		Uses: []protocol.SavedUse{
			{At: ago(18 * time.Minute), Handle: "card:visa-4242", Label: "Visa ••4242", Site: "ryokan-kurashiki.jp", What: "filled", TaskID: "t1", Task: task},
			{At: ago(19 * time.Minute), Handle: "card:visa-4242", Label: "Visa ••4242", Site: "ryokan-kurashiki.jp", What: "approved", TaskID: "t1", Task: task, Amount: "JPY 38,400"},
			{At: ago(20 * time.Minute), Handle: "signin:booking.com", Label: "booking.com (wey@example.com)", Site: "booking.com", What: "ok", TaskID: "t2", Task: task},
		},
	}
}

func autofillApp(t *testing.T, lang i18n.Lang, h int) (*App, *[]any, *ui.Tester) {
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	app.Receive(savedFrameFor(lang))
	app.openTab(TabAutofill)
	tt := ui.NewTesterWith(app.View, 1280, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	tt.Frame()
	return app, sent, tt
}

func TestAutofillPanel(t *testing.T) {
	_, sent, tt := autofillApp(t, i18n.EN, 1500)
	for _, want := range []string{"Autofill", "Sign-ins", "booking.com", "Visa ••4242", "Your details", "Where it was used", "You said Go to JPY 38,400 · Visa ••4242 · ryokan-kurashiki.jp"} {
		if !tt.HasText(want) {
			t.Errorf("missing %q in %q", want, tt.Texts())
		}
	}
	if _, ok := lastSent[protocol.SavedReq](*sent); !ok {
		t.Errorf("the panel didn't ask for the list: %#v", *sent)
	}
	// Add a card: the form, then one saved_put with the number.
	if err := tt.Click("+  Add a card"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if !tt.HasText("The security code isn't kept. You type it on the card that asks for each payment.") {
		t.Errorf("no CVC note: %q", tt.Texts())
	}
}

func TestPayCardSendsTheCodeWithGo(t *testing.T) {
	app, sent := iaApp(t, i18n.EN)
	app.Status = client.Connected
	d := protocol.Decision{DecisionID: "d1", TaskID: "t1", Question: "Pay JPY 38,400 at ryokan-kurashiki.jp with Visa ••4242?", GoLabel: "Pay", DefaultOption: "hold",
		Pay: &protocol.PayAsk{Site: "ryokan-kurashiki.jp", Amount: "38,400", Currency: "JPY", What: "1 night, Nov 20", Handle: "card:visa-4242", Card: "Visa ••4242", Last4: "4242", NeedsCvc: true, FirstHere: true}}
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		ev(protocol.TaskStream("t1"), protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t1", Title: "Book the ryokan", Harness: "codex", Place: protocol.Place{Kind: "browser", Device: "local", Profile: "default"}}),
		chEv(2, protocol.OriginSystem, protocol.KindDecision, d),
	}})
	sd := app.S.Decisions["d1"]
	if sd == nil || sd.Pay == nil {
		t.Fatalf("no pay decision in the store: %#v", sd)
	}
	tt := ui.NewTesterWith(func(c *ui.Context) {
		ui.Column(c).Padding(24).Gap(12).Children(func() { a := app; a.payButtons(c, sd, decisionStyle{height: a.T.ControlMD, quietBg: a.T.Surface}) })
	}, 520, 520, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	for _, want := range []string{"JPY 38,400", "ryokan-kurashiki.jp · First payment here", "Visa ••4242", "Security code of the card ending 4242"} {
		if !tt.HasText(want) {
			t.Errorf("missing %q in %q", want, tt.Texts())
		}
	}
	// Go without the code does nothing.
	if err := tt.Click("Pay JPY 38,400"); err != nil {
		t.Fatal(err)
	}
	if _, ok := lastSent[protocol.DecidePay](*sent); ok {
		t.Fatal("paid without a code")
	}
	app.af.cvc["d1"] = "737"
	tt.Frame()
	if err := tt.Click("Pay JPY 38,400"); err != nil {
		t.Fatal(err)
	}
	p, ok := lastSent[protocol.DecidePay](*sent)
	if !ok || p.Cvc != "737" || p.Option != "go" || p.DecisionID != "d1" {
		t.Fatalf("Go sent %#v", *sent)
	}
	if _, kept := app.af.cvc["d1"]; kept {
		t.Error("the code stayed in the app after Go")
	}
	if strings.Contains(fmt.Sprint(tt.Texts()), "737") {
		t.Error("the code is drawn")
	}
}

// DUCTER_AUTOFILL_SHOTS=<dir> go test ./internal/views -run AutofillShots
func TestAutofillShots(t *testing.T) {
	dir := os.Getenv("DUCTER_AUTOFILL_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_AUTOFILL_SHOTS not set")
	}
	_ = os.MkdirAll(dir, 0o755)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		_, _, tt := autofillApp(t, lang, 1500)
		tt.Advance(time.Second)
		tt.Frame()
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("desktop-autofill-%s.png", lang)))
		if err != nil {
			t.Fatal(err)
		}
		_ = png.Encode(f, tt.Image())
		f.Close()
	}
}
