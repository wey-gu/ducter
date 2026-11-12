package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D165/D166: the accounts card as a character sheet, the proactive chips,
// and the notes the partner says by itself, on the Mac.

const me = "wey@work.example.com"

func acctLook() *protocol.SourceLook {
	ago := time.Now().Add(-2 * time.Minute).UTC().Format(time.RFC3339)
	return &protocol.SourceLook{Watching: true, ReadToday: 214, WorthToday: 1, BudgetPct: 3, Apps: []protocol.AppWatch{
		{Service: "gmail", Title: "Gmail", Account: me, Watch: true, LastReadAt: ago},
		{Service: "gmail", Title: "Gmail", Account: "wey@home.example.com", Watch: true, LastReadAt: ago},
		{Service: "googlecalendar", Title: "Google Calendar", Account: me, Watch: true, LastReadAt: ago},
		{Service: "discord", Title: "Discord", Account: "wey", Watch: true},
		{Service: "github", Title: "GitHub", Account: "wey", Watch: false},
	}}
}

func acctFrames(app *App, proactive string) {
	f := settingsFrame()
	f.Settings.Proactive = proactive
	app.Receive(f)
	look := acctLook()
	if proactive == "" || proactive == "off" {
		look.Watching, look.ReadToday, look.WorthToday = false, 0, 0 // nothing watches before the answer
	}
	app.Receive(protocol.ServerFrame{T: "connections", Oo: &protocol.OoDetect{Installed: true, Account: true}, Connections: []protocol.ConnectionView{
		{ID: "c1", Name: "oo", Source: "oo", Via: "oo", State: "ok", Look: look},
		{ID: "c2", Name: "家里的 OpenConnector", Source: "self", Via: "manual", State: "unreachable", Apps: []protocol.OoApp{{Service: "gmail", Title: "Gmail", Accounts: []string{"lab@example.com"}}}},
	}})
}

func TestAccountsCardSheet(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	acctFrames(app, "three")
	app.openTab(TabAccounts)
	tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	for _, want := range []string{"自己发现了事，怎么告诉你", "每天最多 3 件", "oo 里的账号", "在留意", "经过 oo · 邮件、日程、消息和 GitHub 通知会经过 OOMOL 的服务器", i18n.New(i18n.ZH).T("card.stop", "oo 里的账号"), "连不上", "添加", "日历", "Discord"} {
		if !tt.HasText(want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	// Tap a tile: its detail opens in place.
	app.cards().tile["c1"] = "discord:wey"
	tt.Frame()
	for _, want := range []string{"只看 @你 和私信", "自己留意", "不让 Ducter 看这个", "要退出登录，去 oo 里"} {
		if !tt.HasText(want) {
			t.Errorf("tile detail: no %q", want)
		}
	}
	// The chips change the setting.
	*sent = nil
	tt.Click("只说急的")
	tt.Frame()
	found := false
	for _, f := range *sent {
		if s, ok := f.(protocol.SettingsSet); ok && s.Patch.Proactive == "urgent" {
			found = true
		}
	}
	if !found {
		t.Errorf("the chip didn't set proactive: %#v", *sent)
	}
	// The one destructive asks in place first.
	app.cards().stopping = "c1"
	tt.Frame()
	if !tt.HasText("停用以后，它就看不到这些账号了；记下的事还在「记得什么」里，可以忘掉。") {
		t.Errorf("stop doesn't ask first")
	}
}

func morningEvents() []protocol.LogEvent {
	note := protocol.Finds{NoteID: "n1", Rung: "morning", Opening: "早。", LeftOut: "没说的：12 封通知和收据，看标题就知道；1 封像推销，没理它。", Finds: []protocol.FindView{
		{FindID: "f1", Kind: "deadline", Text: "ducter.dev 11/16 到期（$10.44）。自动续费那张卡已经过期了。", DecisionID: "d1", GoLabel: "打开续费页", How: []protocol.FindHow{{What: "Cloudflare · Your domain ducter.dev renews on November 16", At: "2026-10-17T01:12:00Z"}}},
		{FindID: "f2", Kind: "mismatch", Text: "11/21 的 CA929 晚上 21:40 到成田，新宿的酒店却是 11/22 才入住，那晚还没地方住。", DecisionID: "d2", GoLabel: "看看能不能提前", How: []protocol.FindHow{{What: "Air China · Itinerary: CA929", At: "2026-11-02T12:01:00Z"}, {What: "Shinjuku Granbell · Reservation confirmed", At: "2026-11-03T03:40:00Z"}}},
		{FindID: "f3", Kind: "waiting_on_you", Text: "Lina 4 天前问你「#2141 什么时候能 review」，今天又问了一次。", DecisionID: "d3", GoLabel: "先帮我读一遍", How: []protocol.FindHow{{What: "Lina Wu · #2141 review?", At: "2026-11-06T02:05:00Z"}}},
	}}
	evs := []protocol.LogEvent{ev("channel", protocol.KindUserMsg, protocol.UserMsg{Text: "帮我把周报草稿理一下"}), ev("channel", protocol.KindAIMsg, protocol.AIMsg{Text: "理好了，放在「做好的」里。"})}
	for i, f := range note.Finds {
		evs = append(evs, ev("channel", protocol.KindDecision, protocol.Decision{DecisionID: f.DecisionID, Question: f.Text, GoLabel: f.GoLabel, DefaultOption: "hold", FindID: f.FindID}))
		_ = i
	}
	evs = append(evs, ev("channel", protocol.KindFinds, note))
	return evs
}

func TestMorningNoteInTheConversation(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	app.Receive(protocol.ServerFrame{T: "events", Events: morningEvents()})
	tt := ui.NewTesterWith(app.View, 1100, 1200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	for _, want := range []string{"快到期 · 要花钱", "好，打开续费页", "先等等", "怎么知道的", "有用", "这类不用告诉我", "两件事对不上"} {
		if !tt.HasText(want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	// D173: restraint. What was left out is the partner's to say when asked, and nothing on
	// screen says how much was read.
	for _, s := range tt.Texts() {
		if strings.Contains(s, "没说的") || readCount.MatchString(s) {
			t.Errorf("the note shows %q", s)
		}
	}
	// A find's step is inside its note: never also a card of its own.
	n := 0
	for _, s := range tt.Texts() {
		if strings.Contains(s, "自动续费那张卡已经过期了") && !strings.Contains(s, " · ") {
			n++
		}
	}
	if n != 1 {
		t.Errorf("the find shows %d times", n)
	}
	if err := tt.Click("好，打开续费页"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if d := app.S.Decisions["d1"]; d == nil || d.Pending != "go" {
		t.Errorf("Go didn't answer the find's decision: %#v", d)
	}
	// 有用 goes to the server as the find's reaction.
	*sent = nil
	if err := tt.Click("有用 · Lina 4 天前问你「#2141 什么时候能 review」，今天又问了一次。"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if len(*sent) != 1 || (*sent)[0] != (protocol.FindReact{T: "find_react", FindID: "f3", Reaction: "useful"}) {
		t.Errorf("有用 sent %#v", *sent)
	}
}

// D173: a quiet morning is nothing at all: no message and no header line.
func TestQuietMorningShowsNothing(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		ev("channel", protocol.KindUserMsg, protocol.UserMsg{Text: "帮我把周报草稿理一下"}),
	}})
	before := app.summary(app.S.Board())
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		ev("channel", protocol.KindFinds, protocol.Finds{NoteID: "q", Rung: "morning", Quiet: true, Finds: []protocol.FindView{}, LeftOut: "没说的：3 封通知和收据"}),
	}})
	if n := len(app.S.Channel); n != 1 {
		t.Errorf("a quiet morning became a message: %d entries", n)
	}
	if after := app.summary(app.S.Board()); after != before {
		t.Errorf("a quiet morning changed the header: %q -> %q", before, after)
	}
}

// Shots for review (D75: outside git):
//
//	DUCTER_ACCOUNTS_SHOTS=../../../../.shots/accounts-built go test ./internal/views -run AccountsShots
func TestAccountsShots(t *testing.T) {
	dir := os.Getenv("DUCTER_ACCOUNTS_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_ACCOUNTS_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	shot := func(app *App, name string, w, h int) {
		tt := ui.NewTesterWith(app.View, w, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		tt.Frame()
		tt.Advance(time.Second)
		tt.Frame()
		f, err := os.Create(filepath.Join(dir, name+".png"))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, tt.Image()); err != nil {
			t.Fatal(err)
		}
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		l := "zh"
		if lang == i18n.EN {
			l = "en"
		}
		// The page: chips, two sources, Gmail · work's detail open, 看了哪些 open.
		app, _ := iaApp(t, lang)
		app.Status = client.Connected
		acctFrames(app, "three")
		app.Receive(protocol.ServerFrame{T: "connection_reads", ID: "c1", Reads: []protocol.ReadLine{
			{At: time.Now().Add(-1 * time.Minute).UTC().Format(time.RFC3339), Service: "gmail", Account: me, Items: 23, What: "new"},
			{At: time.Now().Add(-2 * time.Minute).UTC().Format(time.RFC3339), Service: "googlecalendar", Account: me, Items: 5, What: "events"},
			{At: time.Now().Add(-3 * time.Minute).UTC().Format(time.RFC3339), Service: "discord", Account: "wey", Items: 3, What: "mentions"},
		}})
		app.openTab(TabAccounts)
		app.cards().tile["c1"] = "gmail:" + me
		app.cards().reads = "c1"
		shot(app, fmt.Sprintf("mac-01-page-%s", l), 1280, 1500)
		// Default: five lines, nothing open; then the stop asking in place.
		app2, _ := iaApp(t, lang)
		app2.Status = client.Connected
		acctFrames(app2, "")
		app2.openTab(TabAccounts)
		shot(app2, fmt.Sprintf("mac-02-default-never-answered-%s", l), 1280, 1100)
		app2.cards().stopping = "c1"
		shot(app2, fmt.Sprintf("mac-03-stop-asks-%s", l), 1280, 1100)
		// The morning note in the conversation.
		app3, _ := iaApp(t, lang)
		app3.Status = client.Connected
		evs := morningEvents()
		if lang == i18n.EN {
			evs = morningEventsEN()
		}
		app3.Receive(protocol.ServerFrame{T: "events", Events: evs})
		app3.open["how:f2"] = true
		shot(app3, fmt.Sprintf("mac-04-morning-note-%s", l), 1100, 1100)
		// The first account: the offer, then the answer and the one question.
		app4, _ := iaApp(t, lang)
		app4.Status = client.Connected
		f := settingsFrame()
		app4.Receive(f)
		app4.Receive(protocol.ServerFrame{T: "events", Events: firstEvents(lang == i18n.EN)})
		shot(app4, fmt.Sprintf("mac-05-first-account-%s", l), 1100, 1100)
	}
}

func morningEventsEN() []protocol.LogEvent {
	evs := morningEvents()
	en := protocol.Finds{NoteID: "n1", Rung: "morning", Opening: "Morning.", LeftOut: "Left out: 12 notices and receipts the subject says all of; 1 looked like marketing.", Finds: []protocol.FindView{
		{FindID: "f1", Kind: "deadline", Text: "ducter.dev is due 11/16 ($10.44). The card on file has expired.", DecisionID: "d1", GoLabel: "Open the renewal page", How: []protocol.FindHow{{What: "Cloudflare · Your domain ducter.dev renews on November 16", At: "2026-10-17T01:12:00Z"}}},
		{FindID: "f2", Kind: "mismatch", Text: "CA929 lands at Narita at 21:40 on 11/21, but the Shinjuku hotel starts 11/22: nowhere to stay that night.", DecisionID: "d2", GoLabel: "See if it can start earlier", How: []protocol.FindHow{{What: "Air China · Itinerary: CA929", At: "2026-11-02T12:01:00Z"}, {What: "Shinjuku Granbell · Reservation confirmed", At: "2026-11-03T03:40:00Z"}}},
		{FindID: "f3", Kind: "waiting_on_you", Text: "Lina asked you \"when can you review #2141\" 4 days ago, and asked again.", DecisionID: "d3", GoLabel: "Read it for me first", How: []protocol.FindHow{{What: "Lina Wu · #2141 review?", At: "2026-11-06T02:05:00Z"}}},
	}}
	out := []protocol.LogEvent{ev("channel", protocol.KindUserMsg, protocol.UserMsg{Text: "Tidy up the weekly report draft"}), ev("channel", protocol.KindAIMsg, protocol.AIMsg{Text: "Done; it is in Finished."})}
	for _, f := range en.Finds {
		out = append(out, ev("channel", protocol.KindDecision, protocol.Decision{DecisionID: f.DecisionID, Question: f.Text, GoLabel: f.GoLabel, DefaultOption: "hold", FindID: f.FindID}))
	}
	_ = evs
	return append(out, ev("channel", protocol.KindFinds, en))
}

func firstEvents(en bool) []protocol.LogEvent {
	offer := "已经能看你的 Gmail、日历、GitHub、Discord 了。要不要我现在看一眼最近两周，挑出要你管的？"
	answer := "有 1 件要你管："
	find := "Lina 4 天前问你「#2141 什么时候能 review」，今天又问了一次。"
	label := "先帮我读一遍"
	if en {
		offer = "I can read your Gmail, calendar, GitHub and Discord now. Want me to look through the last two weeks for anything that needs you?"
		answer = "One thing needs you:"
		find = "Lina asked you \"when can you review #2141\" 4 days ago, and asked again."
		label = "Read it for me first"
	}
	return []protocol.LogEvent{
		ev("channel", protocol.KindFinds, protocol.Finds{NoteID: "o", Rung: "first", Opening: offer, Ask: "first_look", Finds: []protocol.FindView{}}),
		ev("channel", protocol.KindFinds, protocol.Finds{NoteID: "o2", Rung: "first", Opening: offer, Ask: "first_look", Revises: "o", Answered: "yes", Finds: []protocol.FindView{}}),
		ev("channel", protocol.KindDecision, protocol.Decision{DecisionID: "d9", Question: find, GoLabel: label, DefaultOption: "hold", FindID: "f9"}),
		ev("channel", protocol.KindFinds, protocol.Finds{NoteID: "a", Rung: "first", Opening: answer, Ask: "cadence", Finds: []protocol.FindView{{FindID: "f9", Kind: "waiting_on_you", Text: find, DecisionID: "d9", GoLabel: label, How: []protocol.FindHow{{What: "Lina Wu · Re: #2141 review?", At: "2026-11-09T22:40:00Z"}}}}}),
	}
}

// readCount is how much was read, said anywhere (D173 forbids it on screen).
var readCount = regexp.MustCompile(`看了[^。；]*\d|\d+\s*封信|(?i)\bread \d+|\d+ emails|有 \d+ 件值得`)

// D192: a tile's account says whose it is in a few letters, and two
// tiles of one app never read the same.
func TestShortAccount(t *testing.T) {
	for _, tc := range []struct {
		acc  string
		sibs []string
		want string
	}{
		{"w@nowledge-labs.ai", []string{"w@nowledge-labs.ai", "weyl.gu@gmail.com"}, "nowledge-labs"},
		{"weyl.gu@gmail.com", []string{"w@nowledge-labs.ai", "weyl.gu@gmail.com"}, "weyl.gu"},
		{"wey@work.example.com", []string{"wey@work.example.com", "wey@home.example.com"}, "work"},
		{"wey@acme.com", []string{"wey@acme.com", "lab@acme.com"}, "wey"},
		{"wey@gmail.com", []string{"wey@gmail.com", "wey@googlemail.com"}, "wey@gmail.com"},
		{"Nowledge Labs, Inc", []string{"Nowledge Labs, Inc", "nowledge-community"}, "Nowledge Labs, Inc"},
	} {
		if got := shortAccount(tc.acc, tc.sibs); got != tc.want {
			t.Errorf("shortAccount(%q) = %q, want %q", tc.acc, got, tc.want)
		}
	}
}

// D226: 今天看了什么 under the switch on Settings › 通知: the reading
// problem shows without opening; the counts and the held reasons behind
// the button, in the phone's words.
func TestQuietDayUnderTheSwitch(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	acctFrames(app, "urgent")
	app.Receive(protocol.ServerFrame{T: "proactive_day", Day: &protocol.ProactiveDay{
		Day: "2026-11-12", Looked: protocol.DayLooked{Mail: 152, Events: 3}, Skipped: protocol.DaySkipped{Notices: 12},
		Said: 0, Held: []protocol.DayHeld{{Reason: "not_urgent", N: 2}},
		Problem: &protocol.ReadProblem{Why: "not_installed", Agent: "Claude Code", Since: "2026-11-12T01:00:00Z", Waiting: 40},
		PushOff: true,
	}})
	app.openTab(TabNotify)
	tt := ui.NewTesterWith(app.View, 1280, 1600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	if !tt.HasText("没法细读你的信：这台电脑上没装 Claude Code，现在只看得到标题。") {
		t.Fatalf("no problem line in %q", tt.Texts())
	}
	if tt.HasText("看了 152 封信、3 个日程") {
		t.Fatal("the counts show before the button is pressed")
	}
	got := strings.Join(app.dayLines(app.S.Day), "\n")
	for _, want := range []string{"看了 152 封信、3 个日程", "12 封通知和收据，看标题就知道", "跟你说了 0 件", "2 件不急，没说（你选了只说急的）", "手机和浏览器都没开通知：说了也只在 Ducter 里看得到"} {
		if !strings.Contains(got, want) {
			t.Errorf("no %q in %q", want, got)
		}
	}
	// The day is asked as Notifications opens, so the problem line shows
	// without a tap on the button.
	asked := false
	for _, f := range *sent {
		if r, ok := f.(protocol.ProactiveDayReq); ok && r.T == "proactive_day" {
			asked = true
		}
	}
	if !asked {
		t.Error("Notifications opened without asking for the day")
	}
	// Opened: the groups in order, the rules' leftovers softer.
	groups := app.dayGroups(app.S.Day)
	if len(groups) != 4 || groups[0][0].text != "看了 152 封信、3 个日程" || !groups[0][1].soft || groups[1][len(groups[1])-1].text != "跟你说了 0 件" || groups[2][0].text != "2 件不急，没说（你选了只说急的）" {
		t.Errorf("groups %+v", groups)
	}
}

// D226 on the Mac, each state in zh and en:
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../../../.shots/quietday/mac go test ./internal/views -run QuietDayShots
func TestQuietDayShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	morning := time.Date(2026, 11, 13, 8, 30, 0, 0, time.Local).UTC().Format(time.RFC3339)
	base := protocol.ProactiveDay{Day: "2026-11-12", Looked: protocol.DayLooked{Mail: 152, Events: 3}, Skipped: protocol.DaySkipped{Notices: 41, Promo: 18}}
	states := map[string]func(d *protocol.ProactiveDay){
		"closed": func(d *protocol.ProactiveDay) { d.Held = []protocol.DayHeld{{Reason: "not_urgent", N: 2}} },
		"problem": func(d *protocol.ProactiveDay) {
			d.Held = []protocol.DayHeld{{Reason: "not_urgent", N: 2}}
			d.Problem = &protocol.ReadProblem{Why: "not_installed", Agent: "Claude Code", Since: "2026-11-12T01:00:00Z", Waiting: 40}
		},
		"counts": func(d *protocol.ProactiveDay) {
			d.Looked.Mentions, d.Skipped.Muted, d.Read, d.Noted, d.Said = 7, 4, 23, 5, 1
		},
		"held": func(d *protocol.ProactiveDay) {
			d.Read, d.Noted, d.Said, d.NextNote = 23, 5, 3, morning
			for _, r := range []string{"not_urgent", "for_morning", "below_bar", "cap", "muted", "budget", "night"} {
				d.Held = append(d.Held, protocol.DayHeld{Reason: r, N: 1})
			}
		},
		"pushoff": func(d *protocol.ProactiveDay) { d.Read, d.Noted, d.Said, d.PushOff = 12, 2, 1, true },
		"catching": func(d *protocol.ProactiveDay) {
			d.Looked, d.Skipped, d.CatchingUp = protocol.DayLooked{}, protocol.DaySkipped{}, true
		},
	}
	dir := shotsDir(t)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for name, set := range states {
			app, _ := iaApp(t, lang)
			app.Status = client.Connected
			acctFrames(app, "urgent")
			d := base
			set(&d)
			app.Receive(protocol.ServerFrame{T: "proactive_day", Day: &d})
			app.openTab(TabNotify)
			tt := ui.NewTesterWith(app.View, 1100, 1300, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.Frame()
			if name != "closed" && name != "problem" {
				if err := tt.Click(app.L.T("day.title")); err != nil {
					t.Fatal(err)
				}
			}
			tt.Advance(time.Second)
			tt.Frame()
			f, err := os.Create(filepath.Join(dir, "mac-"+string(lang)+"-"+name+".png"))
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
