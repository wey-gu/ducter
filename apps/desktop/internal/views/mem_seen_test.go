package views

// D617 (D590's leftover): the opened task shows what memory brought into its first turn,
// under 「你交给它的事」: one muted line that unfolds into the memories' titles, each opens
// Settings › 记忆 on it, and 这条不对 asks the partner to correct it by naming the memory's id.
// Nothing shows when nothing was brought in. The web draws the same (apps/web/test/mem-seen.test.tsx).

import (
	"encoding/json"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/hints"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

const memSeenJSON = `{"memory":"recall","recalled":[{"id":"mem_a1","title":"测试统一用假时钟","space":"personal-1","via":"preferences"},{"id":"mem_b2","title":"Weekly report goes to the product group","space":"team-7","via":"search"}]}`

// memSeenApp opens one task whose first turn was given two memories (or none).
func memSeenApp(t *testing.T, lang i18n.Lang, withRecalled, dark bool) (*App, *ui.Tester, *[]any) {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	app.Receive(protocol.ServerFrame{T: "settings", Settings: &protocol.Settings{Name: "小鸭", Language: string(lang), Memory: true, Notify: true, DefaultAfterMin: 30}, Mem: &protocol.MemView{State: "connected"}})
	const id = "t_mem"
	now := time.Now().UTC().Format(time.RFC3339Nano)
	evs := []protocol.LogEvent{
		protocol.NewEvent(1, now, "default", protocol.TaskStream(id), protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: "Fix the flaky test", Harness: "claude-code", Place: protocol.Place{Kind: "none"}, Brief: "Make the scheduler test stable."}),
	}
	if withRecalled {
		evs = append(evs, protocol.NewEvent(2, now, "default", protocol.TaskStream(id), protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "system", From: "runner", Text: "recalled 2 from memory for the brief", Raw: json.RawMessage(memSeenJSON)}))
	}
	evs = append(evs, protocol.NewEvent(3, now, "default", protocol.TaskStream(id), protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: protocol.Done, Residency: "warm"}))
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	app.OpenTask(id)
	app.Receive(protocol.ServerFrame{T: "task_history", TaskID: id, Events: evs})
	app.Local = hints.Open(t.TempDir())
	app.Local.SetAppearance(map[bool]string{false: "light", true: "dark"}[dark])
	app.T = theme.Pebble()
	if dark {
		app.T = theme.PebbleDark()
	}
	tt := ui.NewTesterWith(app.View, 1150, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetDark(dark)
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	tt.Frame()
	return app, tt, sent
}

func TestMemSeenUnderTheBrief(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		app, tt, sent := memSeenApp(t, lang, true, false)
		line := L.T("task.recalled.line", "2")
		if !hasText(tt, line) {
			t.Fatalf("%s: no %q in %q", lang, line, tt.Texts())
		}
		// Nothing is unfolded until the line is tapped.
		if hasText(tt, "测试统一用假时钟") {
			t.Errorf("%s: a title shows before the unfold", lang)
		}
		// Geometry at 1150: the line and every title stay on the page, the head and the rows
		// share one text edge, and the action is one right column past the titles.
		headRect, ok := tt.Find(line)
		if !ok || headRect.X+headRect.W > 1150 {
			t.Errorf("%s: the line runs past 1150: %#v", lang, headRect)
		}
		if err := tt.Click(line); err != nil {
			t.Fatalf("%s: clicking the line: %v", lang, err)
		}
		tt.Frame()
		for _, title := range []string{"测试统一用假时钟", "Weekly report goes to the product group"} {
			if !hasText(tt, title) {
				t.Fatalf("%s: no %q once unfolded: %q", lang, title, tt.Texts())
			}
			if r, ok := tt.Find(title); !ok || r.X+r.W > 1150 {
				t.Errorf("%s: %q runs past 1150: %#v", lang, title, r)
			}
		}
		wrong, ok := tt.Find(L.T("task.recalled.wrong"))
		if !ok || wrong.X+wrong.W > 1150 {
			t.Errorf("%s: the action runs past 1150: %#v", lang, wrong)
		}
		for _, title := range []string{"测试统一用假时钟", "Weekly report goes to the product group"} {
			r, ok := tt.Find(title)
			if !ok {
				t.Fatalf("%s: no %q for geometry", lang, title)
			}
			if r.X < headRect.X-1 || r.X > headRect.X+1 {
				t.Errorf("%s: %q starts at %.1f, the head at %.1f", lang, title, r.X, headRect.X)
			}
			if r.X+r.W > wrong.X+1 {
				t.Errorf("%s: %q runs into the action at %.1f", lang, title, wrong.X)
			}
		}
		// 这条不对 asks the partner, naming the memory's id.
		*sent = nil
		if err := tt.Click(L.T("task.recalled.wrong")); err != nil {
			t.Fatalf("%s: clicking This is wrong: %v", lang, err)
		}
		var got *protocol.Send
		for _, f := range *sent {
			if s, ok := f.(protocol.Send); ok {
				got = &s
			}
		}
		if got == nil {
			t.Fatalf("%s: no message to the partner; sent %#v", lang, *sent)
		}
		if !strings.Contains(got.Text, "mem_a1") || !strings.Contains(got.Text, "测试统一用假时钟") {
			t.Errorf("%s: the message doesn't name the memory: %q", lang, got.Text)
		}
		if app.Route != RouteConversation {
			t.Errorf("%s: the tap didn't go to the conversation: route %v", lang, app.Route)
		}
	}
}

func TestMemSeenNothingWhenNone(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		_, tt, _ := memSeenApp(t, lang, false, false)
		if hasText(tt, L.T("task.recalled.line", "0")) {
			t.Errorf("%s: a line shows with nothing brought in", lang)
		}
		if hasText(tt, L.T("task.recalled.wrong")) {
			t.Errorf("%s: This is wrong shows with nothing brought in", lang)
		}
	}
}

// Shots: GOFMT, the Mac at 1150 and 2x, zh, light and dark, folded and unfolded.
//
//	DUCTER_MEM_SEEN_SHOTS=$PWD/../../../../.shots/mem-seen/mac go test ./internal/views -run MemSeenShots
func TestMemSeenShots(t *testing.T) {
	dir := os.Getenv("DUCTER_MEM_SEEN_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_MEM_SEEN_SHOTS not set")
	}
	_ = os.MkdirAll(dir, 0o755)
	save := func(img image.Image, name string) {
		f, err := os.Create(filepath.Join(dir, name+".png"))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, img); err != nil {
			t.Fatal(err)
		}
	}
	L := i18n.New(i18n.ZH)
	for _, dark := range []bool{false, true} {
		theme := map[bool]string{false: "light", true: "dark"}[dark]
		_, tt, _ := memSeenApp(t, i18n.ZH, true, dark)
		tt.SetDark(dark)
		tt.SetScale(2)
		tt.Frame()
		save(tt.Image(), "mac-recalled-zh-1150-"+theme)
		if err := tt.Click(L.T("task.recalled.line", "2")); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		save(tt.Image(), "mac-recalled-zh-1150-"+theme+"-open")
		if r, ok := tt.Find(L.T("task.recalled.line", "2")); ok {
			z := float32(tt.Image().Bounds().Dx()) / 1150
			save(cropShot(tt.Image(), image.Rect(int((r.X-16)*z), int((r.Y-16)*z), int((r.X+620)*z), int((r.Y+150)*z))), "mac-recalled-zh-1150-"+theme+"-crop")
		}
	}
}
