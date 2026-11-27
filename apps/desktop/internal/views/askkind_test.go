package views

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D642: the card marks are the web's (packages/protocol fixtures/ask-kind-glyphs.json), every
// one parses, and the kind is read from fields the home already sends.
func TestAskKindGlyphsMatchTheFixture(t *testing.T) {
	raw, err := os.ReadFile("../../../../packages/protocol/fixtures/ask-kind-glyphs.json")
	if err != nil {
		t.Fatal(err)
	}
	var fx struct {
		Stroke float32           `json:"stroke"`
		Glyphs map[string]string `json:"glyphs"`
	}
	if err := json.Unmarshal(raw, &fx); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(fx.Glyphs, askKindGlyphs) {
		t.Error("askKindGlyphs differs from fixtures/ask-kind-glyphs.json")
	}
	if fx.Stroke != askKindStroke {
		t.Errorf("stroke %v, want %v", fx.Stroke, askKindStroke)
	}
	for k := range askKindGlyphs {
		if askKindPath(k) == nil {
			t.Errorf("%s does not parse", k)
		}
	}
	if askKindPath("nothing") == nil {
		t.Error("an unknown kind should fall back to the ask mark")
	}
}

func TestAskKindIsReadFromTheCard(t *testing.T) {
	for _, tc := range []struct {
		d    *store.DecisionState
		want string
	}{
		{&store.DecisionState{Decision: protocol.Decision{Cal: &protocol.CalChange{Kind: "create"}}}, ""},
		{&store.DecisionState{Decision: protocol.Decision{Call: &protocol.CallAsk{Kind: "go"}}}, "call"},
		{&store.DecisionState{Decision: protocol.Decision{Pay: &protocol.PayAsk{}}}, "pay"},
		{&store.DecisionState{Decision: protocol.Decision{Checkout: &protocol.CheckoutAsk{}}}, "cart"},
		{&store.DecisionState{Decision: protocol.Decision{Draft: &protocol.DecisionDraft{First: "hi"}}}, "draft"},
		{&store.DecisionState{Decision: protocol.Decision{SignIn: &protocol.SignInAsk{Site: "GitHub"}}}, "signin"},
		{&store.DecisionState{Decision: protocol.Decision{Key: &protocol.KeyAsk{}}}, "key"},
		{&store.DecisionState{Decision: protocol.Decision{Fill: &protocol.FillAsk{}}}, "key"},
		{&store.DecisionState{Decision: protocol.Decision{Offer: true}}, "offer"},
		{&store.DecisionState{Decision: protocol.Decision{FindID: "f1"}}, "ask"},
		{&store.DecisionState{Decision: protocol.Decision{Phone: &protocol.PhoneAsk{}}}, "phone"},
		{&store.DecisionState{Decision: protocol.Decision{MemPlugin: &protocol.MemPluginAsk{}}}, "plugin"},
		{&store.DecisionState{Decision: protocol.Decision{RoutineID: "r1"}}, "reminder"},
		{&store.DecisionState{Decision: protocol.Decision{Loop: &protocol.LoopAsk{TaskID: "t1"}}}, "reminder"},
		{&store.DecisionState{Decision: protocol.Decision{Sender: &protocol.SenderAsk{From: "x"}}}, "message"},
		{&store.DecisionState{Decision: protocol.Decision{Src: &protocol.SourceAsk{Kind: "write", Item: protocol.SourceItemRef{Kind: "github"}}}}, "comment"},
		{&store.DecisionState{Decision: protocol.Decision{Src: &protocol.SourceAsk{Kind: "write", Close: true, Item: protocol.SourceItemRef{Kind: "github"}}}}, "close"},
		{&store.DecisionState{Decision: protocol.Decision{Src: &protocol.SourceAsk{Kind: "review", Item: protocol.SourceItemRef{Kind: "github", PR: true}}}}, "pr"},
		{&store.DecisionState{Decision: protocol.Decision{Src: &protocol.SourceAsk{Kind: "write", Item: protocol.SourceItemRef{Kind: "obsidian"}}}}, "todo"},
		{&store.DecisionState{Decision: protocol.Decision{Question: "Send this file to Sam?", GoLabel: "Send"}}, "file"},
		{&store.DecisionState{Decision: protocol.Decision{Question: "Send an email to Sam?", GoLabel: "Send"}}, "mail"},
		{&store.DecisionState{Decision: protocol.Decision{Question: "Send a message to Sam?", GoLabel: "Send"}}, "message"},
		{&store.DecisionState{Decision: protocol.Decision{Question: "Call the dentist?", GoLabel: "Call"}}, "call"},
		{&store.DecisionState{Decision: protocol.Decision{Question: "Pay ¥480 to Kong Coffee?", GoLabel: "Pay"}}, "pay"},
		{&store.DecisionState{Decision: protocol.Decision{Question: "Check out the order at Kong Coffee?", GoLabel: "Checkout"}}, "cart"},
		{&store.DecisionState{Decision: protocol.Decision{Question: "Draft a reply to Lina?", GoLabel: "Draft"}}, "draft"},
		{&store.DecisionState{Decision: protocol.Decision{Question: "Close the issue?", GoLabel: "Close"}}, "close"},
		{&store.DecisionState{Decision: protocol.Decision{Question: "Post the review on #11389?", GoLabel: "Post"}}, "pr"},
		{&store.DecisionState{Decision: protocol.Decision{Question: "Wake me at 08:30?", GoLabel: "Wake"}}, "reminder"},
		{&store.DecisionState{Decision: protocol.Decision{Question: "Sign in to GitHub?", GoLabel: "Sign in"}}, "signin"},
		{&store.DecisionState{Decision: protocol.Decision{Question: "Can you check the figures?"}}, "ask"},
		{&store.DecisionState{Decision: protocol.Decision{Question: "Can you check the PR?", GoLabel: "Check"}}, "ask"},
		{&store.DecisionState{Decision: protocol.Decision{Question: "Can you check the payment?", GoLabel: "Check"}}, "ask"},
	} {
		if got := askKind(tc.d); got != tc.want {
			t.Errorf("askKind(%+v) = %q, want %q", tc.d.Decision, got, tc.want)
		}
	}
}

// D642: the calendar's own words, both languages: the short ask never repeats the title, and
// the other side is a place, not 对方.
func TestCalCardWords(t *testing.T) {
	zh, _ := iaApp(t, i18n.ZH)
	en, _ := iaApp(t, i18n.EN)
	create := &protocol.CalChange{Kind: "create", Title: "和 Lina 对一下 HawDB 发布"}
	move := &protocol.CalChange{Kind: "move", Title: "x"}
	cancel := &protocol.CalChange{Kind: "cancel", Title: "x"}
	for _, tc := range []struct {
		app  *App
		c    *protocol.CalChange
		want string
	}{
		{zh, create, "加到日历？"},
		{en, create, "Add to your calendar?"},
		{zh, move, "改到新的时间？"},
		{en, cancel, "Cancel this event?"},
	} {
		if got := tc.app.calAsk(tc.c); got != tc.want {
			t.Errorf("calAsk(%s) = %q, want %q", tc.c.Kind, got, tc.want)
		}
	}
}
