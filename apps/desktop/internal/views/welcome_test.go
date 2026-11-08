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
//	DUCTER_SHOTS=1 go test ./internal/views -run Welcome   # writes docs/firstrun-*.png

// The repos `ducter up` found on the author's Mac (names only).
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

func TestWelcomeStartersAreAboutThisMac(t *testing.T) {
	for _, c := range []struct {
		lang i18n.Lang
		want []string
		shot string
	}{
		{i18n.ZH, []string{"你好，我是 Ducter。", "看看 ~/dev/ducter 最近有哪些测试没过，修好了告诉我", "说说 ~/dev/website 这周都改了些什么", "~/dev/notes 里有哪些没收尾的分支？帮我理一理", "91 个代码库"}, "firstrun-empty-zh"},
		{i18n.EN, []string{"Hi, I'm Ducter.", "Find the failing tests in ~/dev/ducter, fix them, and tell me", "What changed in ~/dev/website this week?", "91 repos"}, "firstrun-empty-en"},
	} {
		h := newWelcome(t, c.lang, hintsDir(t, hintsJSON), true)
		for _, w := range c.want {
			if !h.tt.HasText(w) && !strings.Contains(strings.Join(h.tt.Texts(), "\n"), w) {
				t.Errorf("%s: lacks %q in %q", c.lang, w, h.tt.Texts())
			}
		}
		h.shot(c.shot)
		// A starter fills the composer; it never sends by itself.
		h.click(h.app.suggestions()[0])
		if h.app.draft != h.app.suggestions()[0] || len(h.app.pending) != 0 {
			t.Errorf("%s: draft %q, pending %d", c.lang, h.app.draft, len(h.app.pending))
		}
	}
}

func TestWelcomeWithoutReposIsEveryday(t *testing.T) {
	h := newWelcome(t, i18n.ZH, hintsDir(t, `{"version":1,"repoCount":0,"repos":[]}`), true)
	for _, w := range []string{"你能帮我做些什么？举三个例子", "帮我把这周要做的事理一理", "明早 9 点提醒我回邮件"} {
		if !h.tt.HasText(w) {
			t.Errorf("lacks %q in %q", w, h.tt.Texts())
		}
	}
	if strings.Contains(strings.Join(h.tt.Texts(), "\n"), "代码库") {
		t.Errorf("talks about repos with none found: %q", h.tt.Texts())
	}
	h.shot("firstrun-empty-fresh")
	// One repo: one starter about it, two everyday ones.
	one := newWelcome(t, i18n.EN, hintsDir(t, `{"version":1,"repoCount":1,"repos":[{"name":"blog","path":"~/code/blog"}]}`), true)
	got := one.app.suggestions()
	if len(got) != 3 || got[0] != "Find the failing tests in ~/code/blog, fix them, and tell me" || got[1] != "What can you do for me? Give me three examples" {
		t.Errorf("suggestions %q", got)
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
	line := "第一件事做完了。以后做完的事，我都会这样带着证据交回给你。"
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
