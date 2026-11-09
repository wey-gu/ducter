package views

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/hints"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// The first five minutes, without a server: a welcome on an empty Log,
// then (for the first result) a task that finishes live.
//
//	DUCTER_SHOTS=1 go test ./internal/views -run Welcome   # writes .shots/desktop/firstrun-*.png

// The repos `ducter up` found on a sample Mac (names only).
const hintsJSON = `{"version":1,"generatedAt":"2026-11-09T01:20:00Z","repoCount":91,"repos":[
 {"name":"ducter","path":"~/dev/ducter","touchedAt":"2026-11-09T01:14:42Z"},
 {"name":"website","path":"~/dev/website","touchedAt":"2026-11-08T09:23:38Z"},
 {"name":"notes","path":"~/dev/notes","touchedAt":"2026-10-28T12:11:58Z"}]}`

func newWelcome(t *testing.T, lang i18n.Lang, dir string, reduce bool) *harness {
	t.Helper()
	theme.LoadFonts()
	app := New(store.New(), theme.Pebble(), i18n.New(lang))
	app.Local = hints.Open(dir)
	h := &harness{t: t, app: app}
	h.tt = ui.NewTesterWith(app.View, 1280, 860, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: reduce}})
	app.Receive(protocol.ServerFrame{T: "welcome", Persona: "default", PersonaName: "Ducter", HeadSeq: 0})
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{}})
	h.tt.Frame()
	return h
}

func hintsDir(t *testing.T, body string) string {
	dir := t.TempDir()
	if body != "" {
		if err := os.WriteFile(filepath.Join(dir, hints.HintsFile), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

// The first screens the home sends (D149), as core/src/first-screen.ts
// words them for a brand-new person, a developer, and someone returning
// to a result.
func w(zh, en string) protocol.Words { return protocol.Words{ZH: zh, EN: en} }

var (
	firstNew = &protocol.FirstScreen{Visit: "first",
		Line: w("查点东西、记件事、到点提醒你，说一句就行。需要你的时候，我再来问你。", "Ask me to look something up, keep track of things or remind you on time. I'll come to you only when it needs you."),
		Starters: []protocol.Starter{
			{ID: "everyday:reminder", Kind: "everyday", Words: w("周五下午提醒我交水电费", "Remind me on Friday afternoon to pay the utility bill")},
			{ID: "everyday:mail", Kind: "everyday", Words: w("帮我回封邮件，把周五的会推到下周", "Reply to an email and move Friday's meeting to next week")},
			{ID: "everyday:trip", Kind: "everyday", Words: w("周末带家人去近郊，哪儿好玩？", "Somewhere nearby for the family this weekend?")},
			{ID: "everyday:folder", Kind: "everyday", Words: w("把下载文件夹里的旧文件理一理", "Tidy up the old files in my Downloads folder")},
		}}
	firstDev = &protocol.FirstScreen{Visit: "returning",
		Line: w("邮件、电脑上的文件、代码，都可以交给我。需要你的时候，我再来问你。", "Email, files on your computer and code: hand them to me. I'll come to you only when it needs you."),
		Starters: []protocol.Starter{
			{ID: "mail", Kind: "mail", Words: w("这周没回的邮件，挑要紧的说说", "Which unanswered emails this week matter?")},
			{ID: "everyday:reminder", Kind: "everyday", Words: w("周五下午提醒我交水电费", "Remind me on Friday afternoon to pay the utility bill")},
			{ID: "everyday:trip", Kind: "everyday", Words: w("周末带家人去近郊，哪儿好玩？", "Somewhere nearby for the family this weekend?")},
			{ID: "code:ducter", Kind: "code", Words: w("说说 ducter 这周都改了些什么", "What changed in ducter this week?")},
		}}
	firstNews = &protocol.FirstScreen{Visit: "returning",
		Line: w("邮件、日程、电脑上的文件，都可以交给我。需要你的时候，我再来问你。", "Email, your calendar and files on your computer: hand them to me. I'll come to you only when it needs you."),
		News: &protocol.FirstNews{Kind: "done", TaskID: "t-invoices", Words: w("「整理十月的发票」做好了，结果在这儿。", `“Sort October's invoices” is done. The result's here.`)},
		Starters: []protocol.Starter{
			{ID: "calendar", Kind: "calendar", Words: w("明天我都有什么安排？", "What's on my calendar tomorrow?")},
			{ID: "mem:杭州", Kind: "memory", Words: w("接着弄上次的「下周三去杭州出差」", `Pick up “Hangzhou trip next Wednesday” from last time`)},
			{ID: "mail", Kind: "mail", Words: w("这周没回的邮件，挑要紧的说说", "Which unanswered emails this week matter?")},
			{ID: "everyday:reminder", Kind: "everyday", Words: w("周五下午提醒我交水电费", "Remind me on Friday afternoon to pay the utility bill")},
		}}
)

// morning is 9:30 on this Mac's clock, for a stable greeting.
func morning() time.Time { return time.Date(2026, 11, 10, 9, 30, 0, 0, time.Local) }

func firstScreen(t *testing.T, lang i18n.Lang, name string, f *protocol.FirstScreen, reduce bool) *harness {
	t.Helper()
	h := newWelcome(t, lang, hintsDir(t, ""), reduce)
	h.app.Now = morning
	h.app.Receive(protocol.ServerFrame{T: "welcome", Persona: "default", PersonaName: name, HeadSeq: 0})
	if f != nil {
		h.app.Receive(protocol.ServerFrame{T: "first_screen", First: f})
	}
	h.tt.Frame()
	return h
}

func TestFirstScreenGreetsInThePartnersName(t *testing.T) {
	for _, c := range []struct {
		lang       i18n.Lang
		f          *protocol.FirstScreen
		hi, line   string
		composer   string
		noDevLinks bool
	}{
		{i18n.ZH, firstNew, "早上好呀，我是小鸭。", "查点东西、记件事、到点提醒你，说一句就行。需要你的时候，我再来问你。", "跟小鸭说", true},
		{i18n.ZH, firstDev, "早上好呀，小鸭在呢。", "邮件、电脑上的文件、代码，都可以交给我。需要你的时候，我再来问你。", "跟小鸭说", true},
		{i18n.EN, firstNew, "Good morning, I'm 小鸭.", "Ask me to look something up, keep track of things or remind you on time. I'll come to you only when it needs you.", "Talk to 小鸭", true},
	} {
		h := firstScreen(t, c.lang, "小鸭", c.f, true)
		h.has(append(sentences(autospace(c.line)), c.hi, c.composer)...)
		for _, s := range c.f.Starters {
			h.has(autospace(h.app.words(s.Words)))
		}
		texts := strings.Join(h.tt.Texts(), "\n")
		// No paths, no word on how the starters were made, no second way to Devices.
		for _, bad := range []string{"~/", "代码库", "repos on this Mac", "看看你的设备", "See your devices"} {
			if strings.Contains(texts, bad) {
				t.Errorf("%s: shows %q", c.lang, bad)
			}
		}
	}
	// Before the home's words arrive (or from an older Ducter): everyday ones.
	h := firstScreen(t, i18n.ZH, "Ducter", nil, true)
	h.has("早上好呀，我是 Ducter。", "你能帮我做些什么？举三个例子", "明早 9 点提醒我回邮件")
}

func TestFirstScreenGreetingFollowsTheClock(t *testing.T) {
	h := firstScreen(t, i18n.ZH, "小鸭", firstNew, true)
	for hour, want := range map[int]string{7: "早上好呀，我是小鸭。", 12: "中午好呀，我是小鸭。", 15: "下午好呀，我是小鸭。", 20: "晚上好呀，我是小鸭。", 1: "这么晚还没睡呀？我是小鸭。"} {
		h.app.Now = func() time.Time { return time.Date(2026, 11, 10, hour, 0, 0, 0, time.Local) }
		if got := h.app.greeting(); got != want {
			t.Errorf("%d h: %q, want %q", hour, got, want)
		}
	}
}

func TestFirstScreenStarterFillsTheComposer(t *testing.T) {
	h := firstScreen(t, i18n.ZH, "小鸭", firstDev, true)
	want := "说说 ducter 这周都改了些什么"
	h.click(autospace(want))
	if h.app.draft != want || len(h.app.pending) != 0 {
		t.Errorf("draft %q, pending %d", h.app.draft, len(h.app.pending))
	}
}

func TestFirstScreenNewsOpensTheResult(t *testing.T) {
	h := firstScreen(t, i18n.ZH, "小鸭", firstNews, true)
	h.has("早上好呀，小鸭在呢。", autospace("「整理十月的发票」做好了，结果在这儿。"))
	if h.tt.HasText(autospace(h.app.words(firstNews.Line))) {
		t.Error("the news replaces the line, not both")
	}
	h.click("去看看")
	if h.app.Route != RouteTask || h.app.TaskID != "t-invoices" {
		t.Errorf("route %v task %q", h.app.Route, h.app.TaskID)
	}
	// News without a task (a wait that didn't come true) opens On hand.
	n := *firstNews
	n.News = &protocol.FirstNews{Kind: "missed", Words: w("「PR #9950 的检查都过」没等到。要接着等吗？", `“PR #9950's checks pass” didn't happen. Keep waiting?`)}
	h = firstScreen(t, i18n.ZH, "小鸭", &n, true)
	h.click("去看看")
	if h.app.Route != RouteOnHand {
		t.Errorf("route %v", h.app.Route)
	}
}

func TestFirstScreenPartnerLeansTowardTheComposer(t *testing.T) {
	if tr := helloPose(helloFor, 0); tr != (ui.Rotation(0).Then(ui.Translation(0, 0))) {
		t.Errorf("at rest after the wave: %+v", tr)
	}
	if helloPose(400*time.Millisecond, 0) == helloPose(helloFor, 0) {
		t.Error("no wave on first appearance")
	}
	if helloPose(helloFor, 1) == helloPose(helloFor, 0) {
		t.Error("no lean while typing")
	}
}

// The first screen at full size, zh and en: a brand-new person, a
// developer, someone returning to a result, and the partner leaning in
// while they type.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../.shots/first-screen go test ./internal/views -run FirstScreenShots
func TestFirstScreenShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for name, f := range map[string]*protocol.FirstScreen{"new": firstNew, "developer": firstDev, "returning-news": firstNews} {
			h := firstScreen(t, lang, "小鸭", f, true)
			h.shot(fmt.Sprintf("desktop-%s-%s", name, lang))
		}
		h := firstScreen(t, lang, "小鸭", firstNew, false)
		h.tt.Advance(3 * time.Second)
		h.app.draft = h.app.words(firstNew.Starters[1].Words)
		h.tt.Frame()
		h.tt.Advance(time.Second)
		h.shot(fmt.Sprintf("desktop-typing-%s", lang))
	}
}

var seq int64

func ev(stream, kind string, body any) protocol.LogEvent {
	seq++
	return protocol.NewEvent(seq, time.Now().UTC().Format(time.RFC3339Nano), "default", stream, protocol.OriginSystem, kind, body)
}

func finish(h *harness, id, title string) {
	h.app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		ev(protocol.TaskStream(id), protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: title, Harness: "claude-code",
			Place: protocol.Place{Kind: "repo", Device: "local", RepoPath: "~/dev/ducter"}}),
		ev(protocol.TaskStream(id), protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: protocol.Done}),
	}})
	h.tt.Frame()
}

func TestTheFirstResultIsCelebratedOnce(t *testing.T) {
	dir := hintsDir(t, hintsJSON)
	h := newWelcome(t, i18n.ZH, dir, false)
	line := "第一件事做完了。以后做完的事都会这样告诉你，也会说我是怎么确认的。"
	finish(h, "t1", "修好 ducter 里没过的测试")
	if !h.tt.HasText(line) {
		t.Fatalf("no first-result line: %q", h.tt.Texts())
	}
	h.shot("firstrun-first-result")
	// It leaves by itself.
	h.app.Now = func() time.Time { return time.Now().Add(FirstResultFor + time.Second) }
	h.tt.Frame()
	if h.tt.HasText(line) {
		t.Error("still shown after FirstResultFor")
	}
	h.app.Now = time.Now
	// The second result is just a result.
	finish(h, "t2", "说说 website 这周改了什么")
	if h.tt.HasText(line) {
		t.Error("celebrated a second time")
	}
	// And a new launch on the same Mac remembers.
	again := newWelcome(t, i18n.ZH, dir, true)
	finish(again, "t3", "再来一件")
	if again.tt.HasText(line) {
		t.Error("celebrated again after a relaunch")
	}
}

func TestReplayedResultsAreNotTheFirst(t *testing.T) {
	// An existing Log (a user upgrading): its done tasks replay; nothing glows.
	h := newWelcome(t, i18n.EN, hintsDir(t, ""), true)
	h.app.S.HeadSeq = 1000 // everything below came before this window
	finish(h, "old", "an old task")
	if h.tt.HasText("Your first task is done. Everything I finish comes back to you like this, with proof.") {
		t.Error("celebrated a replay")
	}
	h.app.S.HeadSeq = 0
	seq = 2000
	finish(h, "new", "a new task")
	if h.tt.HasText("Your first task is done. Everything I finish comes back to you like this, with proof.") {
		t.Error("celebrated although the Log already held a finished task")
	}
}

// The first five minutes against a real Ducter on an empty data folder:
// the greeting with this Mac's starters, one real message, and the first
// result's celebration.
//
//	DUCTER_FIRSTRUN_URL=ws://127.0.0.1:7795/ws DUCTER_DATA_DIR=<the up's data dir> \
//	DUCTER_FIRSTRUN_SEND="..." DUCTER_SHOTS=1 go test ./internal/views -run LiveFirstFive -v -timeout 30m
func TestLiveFirstFiveMinutes(t *testing.T) {
	url := os.Getenv("DUCTER_FIRSTRUN_URL")
	if url == "" {
		t.Skip("DUCTER_FIRSTRUN_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_LOCALE") == "en" {
		lang = i18n.EN
	}
	h := newLive(t, url, lang)
	h.app.Local = hints.Open(hints.DataDir())
	h.wait = 25 * time.Minute
	if len(h.app.rows()) != 0 {
		t.Fatalf("the Log isn't empty; start ducter up on a fresh data dir")
	}
	start := time.Now()
	h.tt.Frame()
	h.shot("firstrun-live-empty")
	t.Logf("starters: %q", h.app.suggestions())
	send := os.Getenv("DUCTER_FIRSTRUN_SEND")
	if send == "" {
		return
	}
	h.app.SendMessage(send)
	h.until("the partner's first words", func() bool {
		for _, e := range h.app.S.Channel {
			if e.AI != nil || e.Job != nil {
				return true
			}
		}
		return false
	})
	t.Logf("first words after %s", time.Since(start).Round(time.Second))
	h.shot("firstrun-live-ack")
	h.until("the first result", func() bool { return h.app.firstDone != nil })
	t.Logf("first result after %s", time.Since(start).Round(time.Second))
	h.shot("firstrun-live-first-result")
	h.until("the partner's result message", func() bool {
		n := 0
		for _, e := range h.app.S.Channel {
			if e.AI != nil {
				n++
			}
		}
		return n >= 2 || (n >= 1 && time.Since(h.app.firstDone.at) > 40*time.Second)
	})
	t.Logf("result message after %s", time.Since(start).Round(time.Second))
	h.shot("firstrun-live-result-message")
	for _, e := range h.app.S.Channel {
		if e.AI != nil {
			fmt.Printf("AI: %s\n", e.AI.Text)
		}
		if e.Job != nil && e.Job.Ack != nil {
			fmt.Printf("ACK: %s\n", e.Job.Ack.Text)
		}
	}
}
