package views

import (
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

func chEv(seq int64, origin protocol.Origin, kind string, body any) protocol.LogEvent {
	return protocol.NewEvent(seq, time.Now().UTC().Format(time.RFC3339), "default", "channel", origin, kind, body)
}

// While the user waits (D104): the partner's line shows the moment the
// message goes, follows each step, and is gone when the reply lands.
func TestPresenceWhileWaiting(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	app.Now = tt.Now
	tt.Frame()
	app.SendMessage("帮我看下 #1592 的 CI")
	tt.Frame()
	if !hasText(tt, "在想…") {
		t.Fatalf("no 在想… right after sending: %q", tt.Texts())
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{chEv(1, protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: "帮我看下 #1592 的 CI", ClientID: app.pending[0].clientID})}})
	now := time.Now().UTC().Format(time.RFC3339)
	app.Receive(protocol.ServerFrame{T: "activity", Activity: &protocol.PartnerActivity{Step: "recalling", Since: now, StepSince: now}})
	tt.Frame()
	// D425: the line holds for its dwell, then the step replaces it.
	tt.Advance(aliveDwell)
	tt.Frame()
	if !hasText(tt, "在翻之前聊过的…") || hasText(tt, "在想…") {
		t.Fatalf("the step didn't replace the line: %q", tt.Texts())
	}
	if hasText(tt, "在想…") || hasText(tt, "log_search") {
		t.Errorf("a tool name or a stale line shows: %q", tt.Texts())
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{chEv(2, protocol.OriginPartner, protocol.KindAck, protocol.Ack{JobID: "j1", Text: "好，我去查。", ReplyTo: 1})}})
	app.Receive(protocol.ServerFrame{T: "activity"})
	tt.Frame()
	if hasText(tt, "在翻之前聊过的…") || !hasText(tt, "好，我去查。") {
		t.Errorf("the line stays after the reply: %q", tt.Texts())
	}
}

// D380: a quick web look keeps its line under the words that named it,
// after that turn ended, until the answer lands.
func TestPresenceWhileWebLook(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		chEv(1, protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: "明天上海会下雨吗？"}),
		chEv(2, protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: "我看一下明天上海的天气。", ReplyTo: 1}),
	}})
	now := time.Now().UTC().Format(time.RFC3339)
	app.Receive(protocol.ServerFrame{T: "activity", Activity: &protocol.PartnerActivity{Step: "web", Since: now, StepSince: now}})
	tt.Frame()
	if !hasText(tt, "在网上查…") || !hasText(tt, "我看一下明天上海的天气。") {
		t.Fatalf("no 在网上查… under the line that named the look: %q", tt.Texts())
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{chEv(4, protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: "明天上海有小雨（中国天气网）。", ReplyTo: 1})}})
	app.Receive(protocol.ServerFrame{T: "activity"})
	tt.Frame()
	if hasText(tt, "在网上查…") || !hasText(tt, "明天上海有小雨（中国天气网）。") {
		t.Errorf("the line stays after the answer: %q", tt.Texts())
	}
}

// DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../../../.shots/light-lookup go test ./internal/views -run WebLookShots
func TestWebLookShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	dir := shotsDir(t)
	words := map[i18n.Lang][3]string{
		i18n.ZH: {"明天上海会下雨吗？", "我看一下明天上海的天气。", "明天上海有小雨，之后转阴，9 到 13 度，记得带伞（中国天气网）。"},
		i18n.EN: {"Will it rain in Shanghai tomorrow?", "Checking tomorrow's Shanghai forecast.", "Light rain in Shanghai tomorrow, then cloudy, 9 to 13 °C; take an umbrella (China Weather)."},
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, stage := range []string{"looking", "done"} {
			for _, dark := range []bool{false, true} {
				app, _ := iaApp(t, lang)
				w := words[lang]
				evs := []protocol.LogEvent{
					chEv(1, protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: w[0]}),
					chEv(2, protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: w[1], ReplyTo: 1}),
				}
				if stage == "done" {
					evs = append(evs, chEv(4, protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: w[2], ReplyTo: 1}))
				}
				app.Receive(protocol.ServerFrame{T: "events", Events: evs})
				if stage == "looking" {
					now := time.Now().UTC().Format(time.RFC3339)
					app.Receive(protocol.ServerFrame{T: "activity", Activity: &protocol.PartnerActivity{Step: "web", Since: now, StepSince: now}})
				}
				tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetDark(dark)
				tt.Frame()
				tt.Frame()
				mode := "light"
				if dark {
					mode = "dark"
				}
				f, err := os.Create(filepath.Join(dir, "mac-"+stage+"-1280-"+string(lang)+"-"+mode+".png"))
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

// A turn that ends without a word (the partner asked instead) ends the
// waiting line too.
func TestPresenceEndsWithSilentTurn(t *testing.T) {
	app, _ := iaApp(t, i18n.EN)
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{chEv(1, protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: "hi"})}})
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if !hasText(tt, "Thinking…") {
		t.Fatalf("no Thinking… for an unanswered message: %q", tt.Texts())
	}
	app.Receive(protocol.ServerFrame{T: "activity"})
	tt.Frame()
	if hasText(tt, "Thinking…") {
		t.Errorf("Thinking… stays after the turn ended: %q", tt.Texts())
	}
}

// The living message, quiet (D104): no card heading, the ask due soonest
// carries the buttons; D586: the others wait behind the line over the
// composer, never a count of their own here, and 「n 个都按默认」 stays; a
// failure is one sentence; work under way is not listed.
func TestLivingQuiet(t *testing.T) {
	noRelayWait(t)
	app, _ := iaApp(t, i18n.EN)
	soon := time.Now().Add(10 * time.Minute).UTC().Format(time.RFC3339)
	later := time.Now().Add(30 * time.Minute).UTC().Format(time.RFC3339)
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		chEv(1, protocol.OriginPartner, protocol.KindDecision, protocol.Decision{DecisionID: "d1", TaskID: "t1", Question: "Change the 3 calls now?", GoLabel: "change them", DefaultOption: "go", DefaultAt: later, Reversible: true}),
		chEv(2, protocol.OriginPartner, protocol.KindDecision, protocol.Decision{DecisionID: "d2", TaskID: "t2", Question: "Rebase it?", GoLabel: "rebase", DefaultOption: "go", DefaultAt: soon, Reversible: true}),
		chEv(3, protocol.OriginPartner, protocol.KindLivingMsg, protocol.LivingMsg{Items: []protocol.LivingItem{
			{TaskID: "t1", Kind: "decision", Title: "Upgrade OAR", Text: "Change the 3 calls now?", DecisionID: "d1"},
			{TaskID: "t2", Kind: "decision", Title: "Bring fix-ci up to date", Text: "Rebase it?", DecisionID: "d2"},
			{TaskID: "t3", Kind: "failed", Title: "Bump tokio to 1.41", Text: "4 places don't build."},
			{TaskID: "t4", Kind: "progress", Title: "Review this week's PRs", Text: "Read 2"},
		}}),
	}})
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	for _, want := range []string{"Rebase it?", "Rebase", "Go on all 2 defaults", "Bump tokio to 1.41 didn't work: 4 places don't build."} {
		if !hasText(tt, want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	for _, not := range []string{"Change the 3 calls now?", "Review this week's PRs · Read 2", "2 need you", "1 more waiting on you"} {
		if hasText(tt, not) {
			t.Errorf("%q shows by default: %q", not, tt.Texts())
		}
	}
	// Details shown by default (Settings) brings back the status lines.
	app.Local.SetDetailsShown(true)
	defer app.Local.SetDetailsShown(false)
	tt.Frame()
	if !hasText(tt, "Review this week's PRs") || !hasText(tt, "Read 2") {
		t.Errorf("Details shown doesn't list work under way: %q", tt.Texts())
	}
}

// A living message with nothing to show (only work under way, hidden by
// default) draws nothing: never a bare "While you were away" divider, which
// the author saw twice in a row with nothing under it. One with a failure
// still says it, with the divider when it came while the person was away.
func TestLivingWithNothingToShowDrawsNothing(t *testing.T) {
	noRelayWait(t)
	app, _ := iaApp(t, i18n.EN)
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		chEv(1, protocol.OriginPartner, protocol.KindLivingMsg, protocol.LivingMsg{Items: []protocol.LivingItem{
			{TaskID: "t4", Kind: "progress", Title: "Review this week's PRs", Text: "Read 2"},
			{TaskID: "t5", Kind: "blocked", Title: "Deploy the docs", Text: "Waiting on the CI"},
		}}),
	}})
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	if hasText(tt, app.L.T("living.away")) {
		t.Fatalf("a bare divider with nothing under it: %q", tt.Texts())
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		chEv(2, protocol.OriginPartner, protocol.KindLivingMsg, protocol.LivingMsg{Items: []protocol.LivingItem{
			{TaskID: "t3", Kind: "failed", Title: "Bump tokio to 1.41", Text: "4 places don't build."},
		}}),
	}})
	tt.Frame()
	tt.Frame()
	if !hasText(tt, "Bump tokio to 1.41 didn't work: 4 places don't build.") {
		t.Fatalf("a failure isn't said: %q", tt.Texts())
	}
}
