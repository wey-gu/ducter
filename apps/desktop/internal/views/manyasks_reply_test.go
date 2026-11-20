package views

import (
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

// D430: 回复这一条 / Reply to this one. Hovering a line under the person's
// message shows the reply pebble in the gutter left of the card (never on
// it); the pebble replies to that line (its index goes with the reply, so
// core routes it to that line's task), and the row's own click still opens
// the task.
func TestManyAsksReplyToOneLine(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		k := manyAsksCase(lang)
		app := manyAsksApp(t, lang, k.lines, true)
		tt := ui.NewTesterWith(app.View, 1100, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		tt.Frame()
		word := app.L.T("asks.reply")
		if tt.HasText(word) {
			t.Fatalf("%s: a line's pebble shows without a hover", lang)
		}
		r, ok := tt.Find(k.lines[3].Words)
		if !ok {
			t.Fatalf("%s: no line %q", lang, k.lines[3].Words)
		}
		tt.Move(r.X+r.W/2, r.Y+r.H/2)
		tt.Frame()
		tt.Frame()
		p, ok := tt.Find(word)
		if !ok {
			t.Fatalf("%s: hovering a line shows no %q: %q", lang, word, tt.Texts())
		}
		// In the gutter left of the card, on the line's bottom: never on the words.
		if p.X+p.W > r.X-4 {
			t.Errorf("%s: the pebble %+v sits on the line %+v", lang, p, r)
		}
		if p.Y+p.H < r.Y || p.Y > r.Y+r.H+12 {
			t.Errorf("%s: the pebble %+v isn't beside its line %+v", lang, p, r)
		}
		// Onto the pebble (the hover holds across the gutter), then click it.
		tt.Move(p.X+p.W/2, p.Y+p.H/2)
		tt.Frame()
		tt.Frame()
		if err := tt.Click(word); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		rp := app.rp.replying
		if rp == nil || !rp.line || rp.ask != 3 || rp.seq != 1 || rp.quote != k.lines[3].Words {
			t.Fatalf("%s: the pebble didn't reply to line 4: %+v", lang, rp)
		}
		if w := rp.want(); w.Ask == nil || *w.Ask != 3 {
			t.Fatalf("%s: the reply doesn't name the line: %+v", lang, w)
		}
		if app.Route != RouteConversation {
			t.Errorf("%s: replying opened the task (route %v)", lang, app.Route)
		}
		// The composer's imprint quotes the line's words.
		if !tt.HasText("“" + k.lines[3].Words + "”") {
			t.Errorf("%s: the composer doesn't show the line it replies to: %q", lang, tt.Texts())
		}
		app.CancelReply()
		tt.Move(5, 5)
		tt.Frame()
	}
}

// D430: On hand's group card names each part by the person's own words (the
// line it does) and counts in the conversation's words, never with 件.
func TestGroupCardNamesPartsByTheirLines(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	app.LocaleFixed = true
	now := time.Now().UTC().Format(time.RFC3339)
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: groupFixture(false)})
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(1, now, "default", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: "登录页换新输入框，接上短信验证码，再补个端到端测试"}),
		protocol.NewEvent(2, now, "default", "channel", protocol.OriginSystem, protocol.KindAsks, protocol.Asks{MsgSeq: 1, Lines: []protocol.AskLine{
			{Words: "登录页换新输入框", TaskID: "t_form", State: protocol.AskDone},
			{Words: "接上短信验证码", TaskID: "t_sms", State: protocol.AskWorking},
			{Words: "补个端到端测试", Held: "h1", State: protocol.AskWorking},
		}}),
	}})
	app.Route = RouteOnHand
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	all := strings.Join(tt.Texts(), " | ")
	for _, want := range []string{"登录页换新输入框", "接上短信验证码", "补个端到端测试", "好了 1 个，还有 2 个"} {
		if !strings.Contains(all, want) {
			t.Fatalf("missing %q in %s", want, all)
		}
	}
	for _, not := range []string{"件里做完", "补登录页的端到端测试"} {
		if strings.Contains(all, not) {
			t.Fatalf("the card shows %q: %s", not, all)
		}
	}
	if os.Getenv("DUCTER_SHOTS") != "" {
		for _, dark := range []bool{false, true} {
			tt.SetDark(dark)
			tt.Frame()
			f, err := os.Create(filepath.Join(shotsDir(t), "mac-onhand-group-zh-"+map[bool]string{false: "light", true: "dark"}[dark]+".png"))
			if err != nil {
				t.Fatal(err)
			}
			_ = png.Encode(f, tt.Image())
			f.Close()
		}
	}
}

// DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../.shots/many-asks-2 go test ./internal/views -run ManyAsksReplyShots
func TestManyAsksReplyShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	dir := shotsDir(t)
	for _, dark := range []bool{false, true} {
		mode := map[bool]string{false: "light", true: "dark"}[dark]
		for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
			k := manyAsksCase(lang)
			for _, step := range []string{"pebble", "composer"} {
				app := manyAsksApp(t, lang, k.lines, true)
				tt := ui.NewTesterWith(app.View, 1100, 760, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				tt.SetDark(dark)
				tt.Frame()
				tt.Frame()
				r, _ := tt.Find(k.lines[3].Words)
				tt.Move(r.X+r.W/2, r.Y+r.H/2)
				tt.Frame()
				tt.Frame()
				p, _ := tt.Find(app.L.T("asks.reply"))
				tt.Move(p.X+p.W/2, p.Y+p.H/2)
				tt.Frame()
				tt.Frame()
				if step == "composer" {
					_ = tt.Click(app.L.T("asks.reply"))
					tt.Move(5, 5)
				}
				for i := 0; i < 4; i++ {
					tt.Advance(200 * time.Millisecond)
					tt.Frame()
				}
				f, err := os.Create(filepath.Join(dir, "mac-reply-"+step+"-"+string(lang)+"-"+mode+".png"))
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
}
