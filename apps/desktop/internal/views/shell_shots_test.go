package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D262: every place in one shell, pictured against a seeded demo core
// (apps/web/demo.ts), so the Mac and the web can be laid side by side:
//
//	DUCTER_PORT=7811 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7811/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=../../../../.shots/shell/mac \
//	  go test ./internal/views -run ShellShots
func TestShellShots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	dir := shotsDir(t)
	h := newLive(t, url, lang)
	h.app.LocaleFixed = true
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	shot := func(name string, w, hgt int) {
		t.Helper()
		h.tt.SetSize(w, hgt)
		for i := 0; i < 8; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%s.png", name, lang)))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, h.tt.Image()); err != nil {
			t.Fatal(err)
		}
	}
	s := h.app.S
	h.until("the result", func() bool { return s.Task("t_flaky") != nil && len(s.Channel) > 0 })
	shot("conversation", 1280, 820)
	shot("conversation-narrow", 900, 700)
	h.app.Route = RouteOnHand
	shot("onhand", 1280, 820)
	shot("onhand-narrow", 900, 700)
	h.app.OpenTask("t_flaky")
	h.until("history", func() bool { return s.Task("t_flaky").HistoryLoaded })
	shot("task", 1280, 820)
	shot("task-narrow", 900, 700)
	// D268: a long run through a service, its next turn under way, from its end and its head.
	if s.Task("t_conduct") != nil {
		h.app.OpenTask("t_conduct")
		h.until("history", func() bool { return s.Task("t_conduct").HistoryLoaded })
		shot("conduct", 1280, 900)
		shot("conduct-wide", 1680, 1000)
		scrollTaskTo(h.app, "t_conduct", 0)
		shot("conduct-top", 1280, 900)
		// Its finished turn opened, each run of steps opened.
		for _, tu := range turnsOf(h.app.blocks(s.Task("t_conduct"))) {
			h.app.open[fmt.Sprintf("turn:t_conduct:%d", tu.Seq)] = true
		}
		shot("conduct-open", 1280, 900)
		scrollTaskTo(h.app, "t_conduct", 0.5)
		shot("conduct-mid", 1280, 900)
		openStretches(h.app, "t_conduct")
		scrollTaskTo(h.app, "t_conduct", 0.5)
		shot("conduct-groups", 1280, 1100)
	}
	// D279: a review loop resting on its own wait: its state says when it
	// comes back, the watch card's ring and looks, its row and its end line.
	if s.Task("t_loop") != nil {
		h.app.OpenTask("t_loop")
		h.until("history", func() bool { return s.Task("t_loop").HistoryLoaded })
		shot("loop-end", 1280, 900)
		scrollTaskTo(h.app, "t_loop", 0)
		shot("loop-head", 1280, 900)
		shot("loop-head-narrow", 900, 760)
		h.app.Route = RouteOnHand
		shot("loop-onhand", 1280, 1100)
	}
	h.app.OpenDevices()
	h.until("devices", func() bool { return len(s.Devices) > 0 })
	shot("devices", 1280, 820)
	for _, tab := range []string{TabPartner, TabMemory, TabNotify, TabAccounts, TabAbout} {
		h.app.openTab(tab)
		shot("settings-"+tab, 1280, 820)
	}
	h.app.Route = RouteConversation
	h.app.OpenNewTask(nil)
	shot("newtask", 1280, 820)
}

// D289: every Settings pane at 1280 and 900, full length, against the demo
// core, with realistic accounts laid over it (an OOMOL connection with mail,
// calendars and chats, Tuwa connected, calls from your own number on a
// server home, D278), the way the author's Mac showed them:
//
//	DUCTER_PORT=7871 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7871/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=../../../../.shots/d289/after \
//	  go test ./internal/views -run SettingsLiveShots
func TestSettingsLiveShots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	dir := shotsDir(t)
	h := newLive(t, url, lang)
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	settle := func() {
		for i := 0; i < 8; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	seed := func() {
		f, err := protocol.DecodeServerFrame([]byte(accountsSeed))
		if err != nil {
			t.Fatal(err)
		}
		h.app.Receive(f)
		if st := h.app.S.Settings; st != nil {
			st.Proactive, st.ProactiveBy = "three", "user"
			st.Peers = &protocol.Peers{Reach: "only_me", Trusted: []string{"Claude Code"}}
		}
	}
	shot := func(name string, w, hgt int) {
		t.Helper()
		h.tt.SetSize(w, hgt)
		settle()
		seed()
		settle()
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%d-%s.png", name, w, lang)))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, h.tt.Image()); err != nil {
			t.Fatal(err)
		}
	}
	h.until("settings", func() bool { return true })
	for _, tab := range []string{TabPartner, TabMemory, TabPeers, TabNotify, TabAccounts, TabChats, TabAutofill, TabLook, TabRun, TabAbout} {
		h.app.openTab(tab)
		h.until("settings", func() bool { return h.app.S.Settings != nil })
		hgt := 1500
		if tab == TabAccounts || tab == TabPartner {
			hgt = 2300
		}
		shot("settings-"+tab, 1280, hgt)
		shot("settings-"+tab, 900, hgt+400)
	}
}

// accountsSeed is the author's Accounts page in one connections frame.
const accountsSeed = `{"t":"connections",
 "connections":[
  {"id":"c_oomol","name":"OOMOL","url":"https://connector.oomol.com","source":"oomol","addedAt":"2026-11-02T09:00:00Z","via":"manual","state":"ok",
   "apps":[{"service":"gmail","title":"Gmail","accounts":["weyl@nowledge-labs.ai","weyl.gu@gmail.com"]},{"service":"discordbot","title":"Discord bot","accounts":[]},{"service":"slack","title":"Slack","accounts":["nowledge-labs"]},{"service":"wecombot","title":"WeCom bot","accounts":[]},{"service":"slackbot","title":"Slack bot","accounts":[]},{"service":"googlecalendar","title":"Google Calendar","accounts":["weyl.gu@gmail.com","weyl@nowledge-labs.ai"]}],
   "look":{"watching":true,"readToday":42,"worthToday":3,"budgetPct":18,"apps":[
    {"service":"gmail","title":"Gmail","account":"weyl@nowledge-labs.ai","watch":true,"excluded":false,"lastReadAt":"2026-11-16T09:40:00Z"},
    {"service":"gmail","title":"Gmail","account":"weyl.gu@gmail.com","watch":true,"excluded":false,"lastReadAt":"2026-11-16T09:40:00Z"},
    {"service":"discordbot","title":"Discord bot","watch":true,"excluded":false},
    {"service":"slack","title":"Slack","account":"nowledge-labs","watch":true,"excluded":false},
    {"service":"wecombot","title":"WeCom bot","watch":false,"excluded":true},
    {"service":"slackbot","title":"Slack bot","watch":false,"excluded":false},
    {"service":"googlecalendar","title":"Google Calendar","account":"weyl.gu@gmail.com","watch":true,"excluded":false},
    {"service":"googlecalendar","title":"Google Calendar","account":"weyl@nowledge-labs.ai","watch":true,"excluded":false}]}},
  {"id":"c_tuwa","name":"Tuwa","url":"https://api.tuwa.ai/mcp","source":"mcp","addedAt":"2026-11-10T09:00:00Z","via":"manual","state":"ok","signIn":true,
   "phone":{"provider":"Tuwa","capUsd":10,"spentTodayUsd":0,"calls":0,"voice":{"enrolled":true,"on":false},"doNotCall":0,"rails":{"cap":true,"sampling":true,"shared":true}}}],
 "oo":{"installed":false,"account":false},
 "ownPhone":{"where":"hel","station":false,"os":"linux","adb":false,"headset":"unknown","audio":{"inputs":[],"outputs":[],"tool":false},"voice":{"engine":"","key":false,"model":"","perMinUsd":0},"test":{"state":"never"},"ready":false,"prefer":false,"today":0,"perDay":0}}`
