package views

import (
	"testing"
	"time"

	"github.com/egoist/mygo/i18n"
	"github.com/egoist/mygo/ui"

	di18n "github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D445: Notifications shows the notification itself, and it follows the
// pane's choices at once: the default wait in its last line, quiet hours
// under it, notifications off sinks it and says where the ask waits.
func TestNotifyPreviewFollowsTheChoices(t *testing.T) {
	app, sent := iaApp(t, di18n.ZH)
	f := settingsFrame()
	f.Settings.Quiet = &protocol.QuietHours{Start: "23:00", End: "08:00", TZ: "Asia/Shanghai"}
	app.Receive(f)
	app.openTab(TabNotify)
	tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	for _, want := range []string{"CI 有两种修法，先试改动小的那个？", "30 分钟内没回，我就先试它。", "23:00 到 08:00 不响，到点一起告诉你。"} {
		if !tt.HasText(want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	if err := tt.Click("1 小时"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if !tt.HasText("1 小时内没回，我就先试它。") {
		t.Errorf("the preview didn't follow the default wait: %q", tt.Texts())
	}
	app.S.Settings.Quiet = nil
	tt.Frame()
	if !tt.HasText("随时会响。") {
		t.Errorf("quiet hours off, the preview still says them: %q", tt.Texts())
	}
	app.S.Settings.Notify = false
	tt.Frame()
	if !tt.HasText("不弹出来：它在「手头的事」里等你。") {
		t.Errorf("notifications off, the preview doesn't say where it waits: %q", tt.Texts())
	}
	_ = sent
}

// D445: the quiet hours are 24-hour pills in every region, a Mac set to a
// 12-hour region included (it said 11:00 PM in Chinese); a pick is sent.
func TestQuietHoursAre24HourPills(t *testing.T) {
	for _, lang := range []di18n.Lang{di18n.ZH, di18n.EN} {
		app, sent := iaApp(t, lang)
		f := settingsFrame()
		f.Settings.Quiet = &protocol.QuietHours{Start: "23:00", End: "08:00", TZ: "Asia/Shanghai"}
		app.Receive(f)
		app.openTab(TabNotify)
		tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetRegion(i18n.Region{Locale: "en-US", HourCycle: 12})
		tt.Frame()
		tt.Frame()
		if tt.HasText("PM") || tt.HasText("下午") {
			t.Fatalf("%s: a 12-hour time in %q", lang, tt.Texts())
		}
		if !tt.HasText("23:00") || !tt.HasText("08:00") {
			t.Fatalf("%s: no 23:00 and 08:00 in %q", lang, tt.Texts())
		}
		if err := tt.Click("23:00"); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		tt.Frame()
		*sent = nil
		if err := tt.Click("22:30"); err != nil {
			t.Fatalf("%s: no 22:30 in the open list: %v", lang, err)
		}
		tt.Frame()
		got := ""
		for _, x := range *sent {
			if s, ok := x.(protocol.SettingsSet); ok && s.Patch.Quiet != nil {
				got = s.Patch.Quiet.Start + "-" + s.Patch.Quiet.End
			}
		}
		if got != "22:30-08:00" {
			t.Errorf("%s: picked 22:30, sent %q", lang, got)
		}
	}
}

// D445: Replies in shows the partner's voice in the language picked.
func TestRepliesInShowsTheVoice(t *testing.T) {
	app, _ := iaApp(t, di18n.ZH)
	f := settingsFrame()
	f.Settings.Language = "ja"
	app.Receive(f)
	app.OpenPartner()
	tt := ui.NewTesterWith(app.View, 1280, 2600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	if !tt.HasText("はい、明日の 9:00 にお知らせします。") {
		t.Errorf("no Japanese sample under Replies in: %q", tt.Texts())
	}
	app.S.Settings.Language = "auto"
	tt.Frame()
	if !tt.HasText("好，明天 9:00 叫你。") {
		t.Errorf("Follow me shows no sample in the window's language: %q", tt.Texts())
	}
}

// D445 (D432's leftover): a pane still reading breathes, as the web's does,
// and holds still under reduced motion.
func TestPaneWaitBreathes(t *testing.T) {
	t0 := time.UnixMilli(1_700_000_000_000 - 1_700_000_000_000%1600)
	if waitBreath(t0) != 0 {
		t.Errorf("a breath starts at the sunken tint: %v", waitBreath(t0))
	}
	if m := waitBreath(t0.Add(800 * time.Millisecond)); m < 0.6 {
		t.Errorf("mid-breath the square should near the surface: %v", m)
	}
}
