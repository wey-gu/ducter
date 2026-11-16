package views

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/hints"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D303: rich answers in the conversation, from the same fixture the web's
// model passes (packages/protocol/fixtures/rich.json): the home's text and
// blocks for the replies the demo seeds.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=<repo>/.shots/d303 go test ./internal/views -run Rich

type richReply struct {
	Name string            `json:"name"`
	User string            `json:"user"`
	Lang string            `json:"lang"`
	Text string            `json:"text"`
	UI   []protocol.RichUI `json:"ui"`
}

var richOrder = map[i18n.Lang][]string{
	i18n.ZH: {"compare-zh", "ci-zh", "release-zh", "which-repo-zh"},
	i18n.EN: {"compare-en", "week-en", "release-en", "which-meeting-en"},
}

func richReplies(t *testing.T, lang i18n.Lang) []richReply {
	t.Helper()
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/rich.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Parse []richReply `json:"parse"`
	}
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatal(err)
	}
	var out []richReply
	for _, name := range richOrder[lang] {
		for _, p := range f.Parse {
			if p.Name == name {
				out = append(out, p)
			}
		}
	}
	if len(out) != 4 {
		t.Fatalf("%s: %d replies in the fixture", lang, len(out))
	}
	return out
}

func richApp(t *testing.T, lang i18n.Lang) (*App, *[]any) {
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	app.Local = hints.Open(t.TempDir())
	ts := time.Now().UTC().Format(time.RFC3339Nano)
	var evs []protocol.LogEvent
	seq := int64(1)
	for _, r := range richReplies(t, lang) {
		evs = append(evs, protocol.NewEvent(seq, ts, "default", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: r.User}))
		evs = append(evs, protocol.NewEvent(seq+1, ts, "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: r.Text, UI: r.UI, ReplyTo: seq}))
		seq += 2
	}
	app.Receive(protocol.ServerFrame{T: "welcome", Persona: "default", PersonaName: "Ducter", HeadSeq: seq - 1})
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	return app, sent
}

func TestRichAnswersDrawTheirBlocks(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent := richApp(t, lang)
		tt := ui.NewTesterWith(app.View, 1280, 2200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetScale(2)
		tt.Frame()
		tt.Frame()
		all := strings.Join(tt.Texts(), "\n")
		want := map[i18n.Lang][]string{
			i18n.ZH: {"Mac mini M4", "¥4,499", "起售价", "HawDB CI 每天平均时长", "26.4 分钟", "周四", "重跑整套伙伴测评", "报一下进度", "hawdb", "foo"},
			i18n.EN: {"Mac mini M4", "$599", "Tasks finished", "Friday was the busiest with 9", "Fri", "Tag v0.0.62", "Send progress", "The dentist", "HawDB weekly"},
		}[lang]
		for _, s := range want {
			if !strings.Contains(all, s) {
				t.Errorf("%s: lacks %q", lang, s)
			}
		}
		// The plain text stands in only where a block can't be drawn.
		for _, s := range []string{"- ducter", "- The dentist", "：Mac mini M4 ¥4,499", "From: Mac mini M4 $599"} {
			if strings.Contains(all, s) {
				t.Errorf("%s: the plain form %q shows beside its block", lang, s)
			}
		}
		// A tick stays on this Mac.
		item := map[i18n.Lang]string{i18n.ZH: "重跑整套伙伴测评", i18n.EN: "Rerun the full partner eval"}[lang]
		if err := tt.Click(autospace(item)); err != nil {
			t.Fatalf("%s: %v", lang, err)
		}
		tt.Frame()
		key := fmt.Sprintf("%d.%d", 6, 0)
		if got := app.Local.Ticks(key); len(got) != 1 || got[0] != 0 {
			t.Errorf("%s: ticks %v", lang, got)
		}
		for _, f := range *sent {
			if _, ok := f.(protocol.Send); ok {
				t.Fatalf("%s: a tick sent %v", lang, f)
			}
		}
		// Send progress says what's ticked and what isn't.
		if err := tt.Click(app.L.T("rich.tell")); err != nil {
			t.Fatalf("%s: %v", lang, err)
		}
		tt.Frame()
		told := map[i18n.Lang]string{i18n.ZH: "勾好了：重跑整套伙伴测评。还没：在 TestFlight 里看一眼 iPhone 版、打 v0.0.62 的 tag、更新发布说明。", i18n.EN: "Done: Rerun the full partner eval. Not yet: Check the iPhone build in TestFlight, Tag v0.0.62, Update the release notes page."}[lang]
		if s, ok := (*sent)[len(*sent)-1].(protocol.Send); !ok || s.Text != told {
			t.Errorf("%s: progress sent %#v", lang, (*sent)[len(*sent)-1])
		}
	}
}

func TestRichChoiceSendsItsWords(t *testing.T) {
	app, sent := richApp(t, i18n.EN)
	tt := ui.NewTesterWith(app.View, 1280, 2200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if err := tt.Click("HawDB weekly"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	s, ok := (*sent)[len(*sent)-1].(protocol.Send)
	if !ok || s.Text != "HawDB weekly" || len(s.Media) > 0 || s.Reply != nil {
		t.Fatalf("sent %#v", (*sent)[len(*sent)-1])
	}
	// Once the person has answered, the choices stay as a record and can't be tapped again.
	ts := time.Now().UTC().Format(time.RFC3339Nano)
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{protocol.NewEvent(9, ts, "default", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: "HawDB weekly", ClientID: s.ClientID})}})
	tt.Frame()
	n := len(*sent)
	_ = tt.Click("The dentist")
	tt.Frame()
	for _, f := range (*sent)[n:] {
		if _, ok := f.(protocol.Send); ok {
			t.Fatalf("a past choice sent %#v", f)
		}
	}
}

func TestRichShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := richApp(t, lang)
		app.Local.SetTicks("6.0", []int{1})
		for _, size := range [][2]int{{1280, 1900}, {720, 2500}} {
			tt := ui.NewTesterWith(app.View, size[0], size[1], ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetScale(2)
			for _, mode := range []string{"light", "dark"} {
				app.Local.SetAppearance(mode)
				for i := 0; i < 4; i++ {
					tt.Frame()
					tt.Advance(400 * time.Millisecond)
				}
				w := "wide"
				if size[0] < 1000 {
					w = "narrow"
				}
				shotTester(t, tt, fmt.Sprintf("mac-%s-%s-%s", w, lang, mode))
			}
			app.Local.SetAppearance("system")
		}
	}
}
