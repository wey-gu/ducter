package views

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
	"github.com/wey-gu/ducter/apps/desktop/internal/update"
)

// D71: the Partner page and Settings, the menu bar extra's contents.

func iaApp(t *testing.T, lang i18n.Lang) (*App, *[]any) {
	t.Helper()
	theme.LoadFonts()
	app := New(store.New(), theme.Pebble(), i18n.New(lang))
	var sent []any
	app.Send = func(f any) error { sent = append(sent, f); return nil }
	app.Receive(protocol.ServerFrame{T: "welcome", Persona: "default", PersonaName: "Ducter", HeadSeq: 0})
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{}})
	return app, &sent
}

func settingsFrame() protocol.ServerFrame {
	return protocol.ServerFrame{T: "settings",
		Settings: &protocol.Settings{Name: "小鸭", Language: "auto", Memory: true, Notify: true, DefaultAfterMin: 30},
		Mem:      &protocol.MemView{State: "connected", Noted: []protocol.Noted{{Seq: 7, Title: "测试统一用假时钟", At: "2026-11-09T08:00:00Z", MemoryID: "m1"}}},
	}
}

func TestPartnerPage(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Status = 2 // client.Connected
	app.OpenPartner()
	if len(*sent) == 0 {
		t.Fatalf("opening the Partner page sends nothing")
	}
	app.Receive(settingsFrame())
	if app.S.PersonaName != "小鸭" {
		t.Errorf("the settings frame's name is not shown: %q", app.S.PersonaName)
	}
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	for _, want := range []string{"小鸭", "怎么说话", "跟着你", "先问你", "付钱"} {
		if !hasText(tt, want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	// D257: what it remembers is its own tab, not a card on the partner's.
	if hasText(tt, "测试统一用假时钟") {
		t.Errorf("the noted lines are still on the partner's tab")
	}
	tt.Click("记忆")
	tt.Frame()
	for _, want := range []string{"小鸭记得你", "记住事情", "我知道的关于你", "测试统一用假时钟", "Nowledge Mem"} {
		if !hasText(tt, want) {
			t.Errorf("Memory: no %q in %q", want, tt.Texts())
		}
	}
	// When it comes to you is its own tab now (D150).
	tt.Click("通知")
	tt.Frame()
	if !hasText(tt, "什么时候找你") || !hasText(tt, "你没回的时候") {
		t.Errorf("no notifications tab: %q", tt.Texts())
	}
}

// D150: the brain shown is the one core runs, and the home is named.
func TestPartnerTabShowsTheBrainInUse(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.URL = "wss://hel.example.com/ws"
	f := settingsFrame()
	f.Mem.State = "missing"
	f.BrainNow = &protocol.BrainNow{Brain: protocol.Brain{Harness: "codex"}, Auto: true, Why: "only_codex"}
	app.Receive(f)
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{ID: "hel", Name: "hel", Kind: "server", Home: true, State: protocol.DeviceAwake,
		Harnesses: []protocol.DeviceHarness{{Harness: "claude-code"}, {Harness: "codex", Installed: true, LoggedIn: true, CanBePartner: true}}}}})
	app.OpenPartner()
	tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	for _, want := range []string{"我在 hel 上运行，用 Codex 想事情。", "现在每个任务都由 Codex 来做。"} {
		if !hasText(tt, want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	// D322: no tray on the pane, and no 自动选的 when there was nothing else to pick.
	for _, not := range []string{"自动选的：只有 Codex 登录了", "hel 上的 AI agent"} {
		if hasText(tt, not) {
			t.Errorf("%q still on the pane", not)
		}
	}
	if hasText(tt, "Claude Code · Opus") {
		t.Errorf("claims Claude Code: %q", tt.Texts())
	}
	// Mem not connected (D257, Memory): the way to get it, and no switch that says it remembers.
	app.openTab(TabMemory)
	tt.Frame()
	tt.Frame()
	// D664: the setup group says how far it is ("还差 3 步") and lists the steps, not a bare 还没连上.
	for _, want := range []string{"我们聊过的我都记着；连上 Nowledge Mem，你的偏好、定下的事就能一直记得，你别的 AI 也用得上。", "还差 3 步", "装上 Nowledge Mem", "了解 Nowledge Mem"} {
		if !hasText(tt, want) {
			t.Errorf("Memory: no %q in %q", want, tt.Texts())
		}
	}
	if hasText(tt, "记住事情") {
		t.Errorf("memory has its switch while Mem is missing")
	}
}

// D177: a home with only a DeepSeek key thinks with DeepSeek Harness, and the
// pane says only what is true (pi may be signed in too).
func TestPartnerTabDeepSeekFallback(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.URL = "wss://hel.example.com/ws"
	f := settingsFrame()
	f.BrainNow = &protocol.BrainNow{Brain: protocol.Brain{Harness: "deepseek-harness"}, Auto: true, Why: "only_signed_in"}
	app.Receive(f)
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{ID: "hel", Name: "hel", Kind: "server", Home: true, State: protocol.DeviceAwake,
		Harnesses: []protocol.DeviceHarness{{Harness: "claude-code"}, {Harness: "pi", Installed: true, LoggedIn: true, CanBePartner: true}, {Harness: "deepseek-harness", Installed: true, LoggedIn: true, CanBePartner: true}}}}})
	app.OpenPartner()
	tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	// D322: with pi signed in too, the switch is there; the 自动选的 lines are retired.
	for _, want := range []string{"我在 hel 上运行，用 DeepSeek Harness 想事情。", "换一个"} {
		if !hasText(tt, want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	if hasText(tt, "自动选的：只有 DeepSeek Harness 登录了") {
		t.Errorf("says only DeepSeek Harness is signed in while pi is too: %q", tt.Texts())
	}
}

// D141, D257: with the persona's Mem identity bound, Memory's Nowledge Mem
// card says the name its memories are kept under, in plain words.
func TestMemoryTabKeptUnder(t *testing.T) {
	for _, tc := range []struct {
		lang i18n.Lang
		want string
	}{
		{i18n.ZH, "在 Nowledge Mem 里叫「小鸭」，我记下的都用这个名字"},
		{i18n.EN, "“小鸭” in Nowledge Mem; everything I save carries that name"},
	} {
		app, _ := iaApp(t, tc.lang)
		f := settingsFrame()
		f.Mem.KeptUnder = "小鸭"
		app.Receive(f)
		app.openTab(TabMemory)
		tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		tt.Frame()
		if !hasText(tt, tc.want) {
			t.Errorf("%s: no %q in %q", tc.lang, tc.want, tt.Texts())
		}
	}
}

func TestMemoryTabEmptyHidesList(t *testing.T) {
	app, _ := iaApp(t, i18n.EN)
	f := settingsFrame()
	f.Mem.Noted = nil
	f.Mem.State = "missing"
	app.Receive(f)
	app.openTab(TabMemory)
	tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	if hasText(tt, "What it noted") {
		t.Errorf("an empty noted list still has its heading")
	}
	if !hasText(tt, "About Nowledge Mem") {
		t.Errorf("no way to get Mem when it is missing: %q", tt.Texts())
	}
}

func TestForgotToastNamesTheLine(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.Receive(settingsFrame())
	app.partner.forgetting = map[int64]string{7: "测试统一用假时钟"}
	f := settingsFrame()
	f.Mem.Noted = nil
	f.Forgot = &protocol.Forgot{Seq: 7, How: "hidden"}
	app.Receive(f)
	app.drainForgot()
	if !strings.Contains(app.partner.toast, "测试统一用假时钟") || !strings.Contains(app.partner.toast, "还在") {
		t.Errorf("hidden toast: %q", app.partner.toast)
	}
}

func TestSettingsPage(t *testing.T) {
	app, _ := iaApp(t, i18n.EN)
	app.Version, app.Commit = "0.3.0", "abc1234"
	app.OpenSettings()
	tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	for tab, wants := range map[string][]string{
		"Look and sound": {"Look", "Pebble", "Language", "Follow the system", "Sound"},
		"Where it runs":  {"Where it runs", "Your devices and AI accounts"},
		"About":          {"Version 0.3.0 (abc1234)", "Credits", "Docs"},
	} {
		tt.Click(tab)
		tt.Frame()
		tt.Frame()
		for _, want := range wants {
			if !hasText(tt, want) {
				t.Errorf("%s: no %q in %q", tab, want, tt.Texts())
			}
		}
	}
	// Updates hide until the app can check.
	if hasText(tt, "Check for updates") {
		t.Errorf("Check for updates shows without an updater")
	}
}

func TestInterfaceLanguage(t *testing.T) {
	app, _ := iaApp(t, i18n.EN)
	app.SystemLang = i18n.EN
	var told *i18n.Strings
	app.OnLanguage = func(l *i18n.Strings) { told = l }
	app.SetInterfaceLanguage("zh")
	if app.L.Lang != i18n.ZH || !app.LocaleFixed || told == nil || told.Lang != i18n.ZH {
		t.Fatalf("zh not applied: %v %v", app.L.Lang, app.LocaleFixed)
	}
	app.SetInterfaceLanguage("auto")
	if app.L.Lang != i18n.EN || app.LocaleFixed {
		t.Fatalf("auto didn't follow the system: %v %v", app.L.Lang, app.LocaleFixed)
	}
}

func TestSettingsPatchJSON(t *testing.T) {
	name := "小鸭"
	for _, tc := range []struct {
		p    protocol.SettingsPatch
		want string
	}{
		{protocol.SettingsPatch{Name: &name}, `{"name":"小鸭"}`},
		{protocol.SettingsPatch{ClearQuiet: true}, `{"quiet":null}`},
		{protocol.SettingsPatch{Language: "zh", Quiet: &protocol.QuietHours{Start: "23:00", End: "08:00", TZ: "UTC"}}, `{"language":"zh","quiet":{"start":"23:00","end":"08:00","tz":"UTC"}}`},
	} {
		b, err := json.Marshal(protocol.SettingsSet{T: "settings_set", Patch: tc.p})
		if err != nil {
			t.Fatal(err)
		}
		if want := `{"t":"settings_set","patch":` + tc.want + `}`; string(b) != want {
			t.Errorf("got %s want %s", b, want)
		}
	}
}

func TestQuietAndNotifyHoldTheMacsNotifications(t *testing.T) {
	q := &protocol.QuietHours{Start: "23:00", End: "08:00", TZ: "UTC"}
	at := func(h int) time.Time { return time.Date(2026, 11, 9, h, 30, 0, 0, time.UTC) }
	if !InQuiet(at(23), q) || !InQuiet(at(3), q) || InQuiet(at(12), q) {
		t.Errorf("overnight quiet hours wrong")
	}
	app, _ := iaApp(t, i18n.EN)
	app.Local.Answer(askNotify, "yes", time.Now())
	if title, _ := app.NeedsYouNotice(1); title == "" {
		t.Fatalf("no notice with notifications on")
	}
	f := settingsFrame()
	f.Settings.Notify = false
	app.Receive(f)
	if title, _ := app.NeedsYouNotice(1); title != "" {
		t.Errorf("a notice with notifications switched off")
	}
}

func TestTrayDecisions(t *testing.T) {
	app, _ := iaApp(t, i18n.EN)
	ev := protocol.NewEvent(1, "2026-11-09T20:00:00Z", "default", "channel", protocol.OriginPartner, protocol.KindDecision,
		protocol.Decision{DecisionID: "d1", Question: "Rebase ducter/fix-ci onto main?\nIt is 3 behind.", GoLabel: "Rebase", DefaultOption: "go", Reversible: true})
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{ev}})
	ds := app.TrayDecisions(6)
	if len(ds) != 1 || ds[0].GoLabel != "Rebase" || strings.Contains(ds[0].Question, "\n") {
		t.Fatalf("tray decisions: %+v", ds)
	}
	before := app.TraySignature()
	app.Decide("d1", "go", "")
	if app.TraySignature() == before {
		t.Errorf("answering doesn't change the tray")
	}
}

// D450: a Go from the menu bar is never blind to what another AI still found.
func TestTrayDecisionSaysWhatAnotherAILeft(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	ev := protocol.NewEvent(1, "2026-11-09T20:00:00Z", "default", "channel", protocol.OriginPartner, protocol.KindDecision,
		protocol.Decision{DecisionID: "d1", Question: "开一个 draft PR 吗？", GoLabel: "开 PR", DefaultOption: "hold",
			Look: &protocol.DecisionLook{By: "claude-code", Left: []string{"Windows 的 install.ps1 还是写死的路径", "第二条"}}})
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{ev}})
	ds := app.TrayDecisions(6)
	if len(ds) != 1 || ds[0].Look != "另一个 AI 看过：Windows 的 install.ps1 还是写死的路径" {
		t.Fatalf("tray decisions: %+v", ds)
	}
	if !strings.Contains(app.TraySignature(), ds[0].Look) {
		t.Errorf("the menu wouldn't redraw when what is left changes")
	}
}

type fakeUpdates struct {
	st    update.Status
	hints []string
}

func (f *fakeUpdates) Hint(_ context.Context, v string) bool {
	f.hints = append(f.hints, v)
	return true
}

func (f *fakeUpdates) Status() update.Status                  { return f.st }
func (f *fakeUpdates) CheckNow(context.Context) update.Status { return f.st }
func (f *fakeUpdates) SetInstallOnQuit(on bool)               { f.st.InstallOnQuit = on }

func TestSettingsUpdateReady(t *testing.T) {
	app, _ := iaApp(t, i18n.EN)
	app.Updates = &fakeUpdates{st: update.Status{State: update.Ready, Current: "0.3.0", Version: "0.3.1", InstallOnQuit: true}}
	restarted := false
	app.RestartToUpdate = func() { restarted = true }
	app.OpenUpdate()
	tt := ui.NewTesterWith(app.View, 1280, 1600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	for _, want := range []string{"Restart to use version 0.3.1", "Restart Now", "Update automatically when quitting"} {
		if !hasText(tt, want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	_ = restarted
}

// Every face in the Partner page's strip has a name in both languages (a
// missing key shows itself: "partner.face.waiting" was on screen).
func TestPartnerFaceNames(t *testing.T) {
	for lang, table := range i18n.Tables() {
		for _, p := range theme.Presences {
			if _, ok := table["partner.face."+facekey(p)]; !ok {
				t.Errorf("%s: no name for the %s face", lang, p)
			}
		}
	}
}
