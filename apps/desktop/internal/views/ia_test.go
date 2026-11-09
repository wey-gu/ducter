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
	for _, want := range []string{"小鸭", "怎么说话", "跟着我", "什么时候找你", "记得什么", "测试统一用假时钟", "先问你", "付钱：永远是你来付"} {
		if !tt.HasText(want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
}

func TestPartnerPageEmptyMemoryHidesList(t *testing.T) {
	app, _ := iaApp(t, i18n.EN)
	f := settingsFrame()
	f.Mem.Noted = nil
	f.Mem.State = "missing"
	app.Receive(f)
	app.Route = RoutePartner
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	if tt.HasText("Noted lately") {
		t.Errorf("an empty noted list still has its heading")
	}
	if !tt.HasText("Get Nowledge Mem") {
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
	tt.Frame()
	for _, want := range []string{"Look", "Pebble", "Language", "Follow the system", "When you close the window", "About", "Version 0.3.0 (abc1234)"} {
		if !tt.HasText(want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	// Updates hide until the app can check.
	if tt.HasText("Check for updates") {
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

type fakeUpdates struct{ st update.Status }

func (f *fakeUpdates) Status() update.Status                  { return f.st }
func (f *fakeUpdates) CheckNow(context.Context) update.Status { return f.st }
func (f *fakeUpdates) SetInstallOnQuit(on bool)               { f.st.InstallOnQuit = on }

func TestSettingsUpdateReady(t *testing.T) {
	app, _ := iaApp(t, i18n.EN)
	app.Updates = &fakeUpdates{st: update.Status{State: update.Ready, Current: "0.3.0", Version: "0.3.1", InstallOnQuit: true}}
	restarted := false
	app.RestartToUpdate = func() { restarted = true }
	app.OpenSettings()
	tt := ui.NewTesterWith(app.View, 1280, 1600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	for _, want := range []string{"Update 0.3.1 ready · restart to finish", "Restart Now", "Update automatically when quitting"} {
		if !tt.HasText(want) {
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
