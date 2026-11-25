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
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D302: every place light and dark, Mac 1280.
//
//	DUCTER_PORT=7902 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo.ts
//	DUCTER_D302_URL=ws://127.0.0.1:7902/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<repo>/.shots/d302 \
//	  go test ./internal/views -run D302 -v
//
// The demo core gives the conversation, On hand, the tasks (transcript,
// steps, a loop's locator), Devices, Settings and the New task card; the
// fixtures give Past tasks, Done for you, the context ring's card and the
// picture viewer (DUCTER_D302_FIXTURES=1, no core needed).

func d302Write(t *testing.T, tt *ui.Tester, name string) {
	t.Helper()
	f, err := os.Create(filepath.Join(shotsDir(t), name+".png"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, tt.Image()); err != nil {
		t.Fatal(err)
	}
}

// d302Both shoots the place as it is now in light and in dark.
func d302Both(t *testing.T, app *App, tt *ui.Tester, settle func(), name string, lang i18n.Lang) {
	t.Helper()
	for _, mode := range []string{"light", "dark"} {
		app.Local.SetAppearance(mode)
		settle()
		d302Write(t, tt, fmt.Sprintf("mac-%s-%s-%s", name, mode, lang))
	}
	app.Local.SetAppearance("system")
}

func TestD302LiveShots(t *testing.T) {
	url := os.Getenv("DUCTER_D302_URL")
	if url == "" {
		t.Skip("DUCTER_D302_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	h := newLive(t, url, lang)
	h.app.LocaleFixed = true
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	s := h.app.S
	settle := func() {
		for i := 0; i < 8; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	both := func(name string, w, hgt int) {
		t.Helper()
		h.tt.SetSize(w, hgt)
		d302Both(t, h.app, h.tt, settle, name, lang)
	}
	h.until("the result", func() bool { return s.Task("t_flaky") != nil && len(s.Channel) > 0 })
	both("conversation", 1280, 820)
	h.app.Route = RouteOnHand
	both("onhand", 1280, 900)
	for _, id := range []string{"t_flaky", "t_rebase", "t_conduct", "t_loop"} {
		if s.Task(id) == nil {
			continue
		}
		h.app.OpenTask(id)
		h.until("history", func() bool { return s.Task(id).HistoryLoaded })
		both("task-"+id, 1280, 900)
		if id == "t_conduct" {
			for _, tu := range turnsOf(h.app.blocks(s.Task(id))) {
				h.app.open[fmt.Sprintf("turn:%s:%d", id, tu.Seq)] = true
			}
			openStretches(h.app, id)
			scrollTaskTo(h.app, id, 0.5)
			both("task-"+id+"-steps", 1280, 1000)
		}
		if id == "t_loop" {
			scrollTaskTo(h.app, id, 0.5)
			settle()
			if hoverLocator(h.app, h.tt) {
				both("task-"+id+"-locator", 1280, 900)
			}
		}
	}
	h.app.OpenDevices()
	h.until("devices", func() bool { return len(s.Devices) > 0 })
	both("devices", 1280, 900)
	for _, tab := range settingsTabs {
		h.app.openTab(tab)
		hgt := 1500
		if tab == TabAccounts || tab == TabPartner {
			hgt = 2200
		}
		both("settings-"+tab, 1280, hgt)
	}
	h.app.Route = RouteConversation
	h.app.OpenNewTask(nil)
	both("newtask", 1280, 820)
	h.app.nt.open = false

	// Following the system: macOS turns dark, the window follows, calmly.
	h.app.Route = RouteConversation
	h.tt.SetSize(1280, 820)
	h.tt.SetDark(false)
	settle()
	h.tt.SetDark(true)
	h.tt.Frame()
	d302Write(t, h.tt, "mac-follow-system-start-"+string(lang))
	settle()
	d302Write(t, h.tt, "mac-follow-system-dark-"+string(lang))
	if !h.app.T.Dark {
		t.Fatal("the window did not follow macOS into dark")
	}
}

func TestD302FixtureShots(t *testing.T) {
	if os.Getenv("DUCTER_D302_FIXTURES") == "" {
		t.Skip("DUCTER_D302_FIXTURES=1 to write the shots")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		// Past tasks and Done for you.
		app, _ := pastApp(t, lang)
		tt := ui.NewTesterWith(app.View, 1280, 820, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		settle := func() {
			for i := 0; i < 4; i++ {
				tt.Frame()
				tt.Advance(200 * time.Millisecond)
			}
		}
		items := pastItems(pastSeeds())
		if lang == i18n.EN {
			items = pastEnglish(items)
		}
		app.OpenPast("")
		app.Receive(pastResult(items, ""))
		app.past.focusField = false
		d302Both(t, app, tt, settle, "past", lang)
		if it := app.pastItem("t_kyoto"); it != nil {
			app.openMarks(it, false)
			app.past.focus = "t_kyoto"
			tt.SetSize(1280, 900)
			d302Both(t, app, tt, settle, "past-marks", lang)
			app.closeMarks()
			app.past.focus = ""
		}
		all := didDayItems(lang)
		app.OpenDid()
		app.did.focusField = false
		app.Receive(didResult(all, all, ""))
		tt.SetSize(1280, 1200)
		d302Both(t, app, tt, settle, "did", lang)

		// The context ring's card in an opened task.
		app2, _, tt2 := newTaskApp(t, lang)
		ctxUI.askedU, ctxUI.memo = map[string]time.Time{}, map[*store.Task]meterMemo{}
		app2.OpenTask("t_newtask")
		tt2.Frame()
		at := time.Now().UTC().Format(time.RFC3339Nano)
		ts := protocol.TaskStream("t_newtask")
		ev := func(seq int64, te protocol.TaskEvent) protocol.LogEvent {
			te.TaskID = "t_newtask"
			return protocol.NewEvent(seq, at, "default", ts, protocol.OriginTask, protocol.KindTaskEvent, te)
		}
		app2.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			ev(800, protocol.TaskEvent{Role: "system", Raw: []byte(`{"kind":"context","contextTokens":150000,"contextWindow":200000,"compactAt":160000}`)}),
			ev(803, protocol.TaskEvent{Role: "system", Text: "turn completed", Usage: &protocol.Usage{InputTokens: 310000, OutputTokens: 4200, CacheRead: 280000, ContextTokens: 96500, ContextWindow: 200000, CompactAt: 160000, Turn: &protocol.TurnTokens{Input: 310000, Output: 4200, Cached: 280000}}, Raw: []byte(`{"turnEnd":true,"kind":"turn_ended"}`)}),
		}})
		tt2.SetSize(1280, 820)
		tt2.Frame()
		click(t, tt2, app2.L.T("ctx.ring", "48%"))
		settle2 := func() {
			for i := 0; i < 4; i++ {
				tt2.Frame()
				tt2.Advance(200 * time.Millisecond)
			}
		}
		d302Both(t, app2, tt2, settle2, "context-ring", lang)
		ctxUI.open = false

		// The picture viewer and a file card.
		app3, _, fh := mediaApp(t, lang)
		pick := func(z, e string) string {
			if lang == i18n.ZH {
				return z
			}
			return e
		}
		cat := fh.ref(t, generated(), "t_cat")
		pdf := fh.put([]byte("%PDF-1.7 report"), "", pick("箱根相册.pdf", "Hakone album.pdf"))
		pdf.Bytes, pdf.From = 3_565_158, &protocol.MediaFrom{TaskID: "t_cat"}
		app3.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			mev(1, 6*time.Minute, "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: pick("画一张在窗边晒太阳睡觉的橘猫", "Draw a ginger cat asleep in the sun by a window")}),
			mev(2, 6*time.Minute, "channel", protocol.OriginPartner, protocol.KindAck, protocol.Ack{JobID: "j1", Text: pick("好，我去画，画好了给你看。", "On it: drawing it now; I'll show you when it's done."), ReplyTo: 1}),
			mev(3, 6*time.Minute, protocol.TaskStream("t_cat"), protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t_cat", Title: pick("画橘猫", "Draw a ginger cat"), Harness: "codex", Place: protocol.Place{Kind: "none"}}),
			mev(4, time.Minute, "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: pick("画好了：窗边打盹的橘猫，还顺手排了一份相册。", "Done: a ginger cat dozing on a sunny sill, and the album laid out too."), ReplyTo: 1, Media: []protocol.MediaRef{cat, pdf}}),
		}})
		tt3 := mediaTester(app3, 1280, 820)
		settle3 := func() {
			for i := 0; i < 4; i++ {
				tt3.Frame()
				tt3.Advance(250 * time.Millisecond)
			}
		}
		d302Both(t, app3, tt3, settle3, "media-cards", lang)
		app3.OpenViewer("conv", cat.ID)
		d302Both(t, app3, tt3, settle3, "media-viewer", lang)
	}
}

// The appearance follows Settings first and macOS otherwise, live, with a
// cross-fade that never lingers; at once under Reduce Motion.
func TestAppearanceFollows(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	light := theme.Pebble()
	tt := ui.NewTester(app.View, 900, 600)
	tt.Frame()
	if app.T.Dark || app.T.Bg != light.Bg {
		t.Fatal("starts light under a light macOS")
	}
	tt.SetDark(true)
	tt.Frame()
	tt.Advance(150 * time.Millisecond)
	tt.Frame()
	if app.T.Bg == light.Bg || app.T.Bg == theme.PebbleDark().Bg {
		t.Fatalf("the move to dark is a cross-fade, not a cut: %v", app.T.Bg)
	}
	tt.Advance(time.Second)
	tt.Frame()
	if !app.T.Dark || app.T.Bg != theme.PebbleDark().Bg {
		t.Fatalf("settles in dark: %v", app.T.Bg)
	}
	// Settings pins light over a dark macOS.
	app.SetAppearance("light")
	tt.Advance(time.Second)
	tt.Frame()
	if app.T.Dark {
		t.Fatal("Light in Settings wins over a dark macOS")
	}
	app.SetAppearance("system")
	tt.Advance(time.Second)
	tt.Frame()
	if !app.T.Dark {
		t.Fatal("Follow the system goes back to macOS's dark")
	}

	// Reduce Motion: at once.
	app2, _ := iaApp(t, i18n.EN)
	tt2 := ui.NewTesterWith(app2.View, 900, 600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt2.Frame()
	tt2.SetDark(true)
	tt2.Frame()
	if !app2.T.Dark || app2.T.Bg != theme.PebbleDark().Bg {
		t.Fatal("under Reduce Motion the change is at once")
	}
	// Settings › Look and sound has the three choices.
	app2.openTab(TabLook)
	tt2.Frame()
	for _, s := range []string{"Light and dark", "Follow the system", "Light", "Dark"} {
		if !hasText(tt2, s) {
			t.Fatalf("no %q in Look and sound: %q", s, tt2.Texts())
		}
	}
	click(t, tt2, "Light")
	tt2.Frame()
	if app2.T.Dark || app2.Local.Appearance() != "light" {
		t.Fatal("choosing Light turns the window light")
	}
}
