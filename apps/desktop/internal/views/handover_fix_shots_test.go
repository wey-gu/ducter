package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D415 (hel, 2026-11-20): 通用设置 failed on another git's index.lock and
// showed 没能开始 with a bare path. Every start failure says why; a lock git
// left offers 清掉旧的再试 (clear_lock), with what it does said under it.
func TestCantStartBusyOffersClearLock(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, tt := tinycart(t, lang, 3*time.Minute)
		var sent []any
		app.Send = func(f any) error { sent = append(sent, f); return nil }
		busyTask(app)
		app.OpenTask("t_fix")
		tt.Frame()
		tt.Frame()
		L := i18n.New(lang)
		all := texts(tt)
		for _, want := range []string{L.T("cant.busy", "Macbook Pro M3", "nowledge-mem"), L.T("cant.busy.hint"), L.T("cant.clear_lock"), L.T("task.action.retry")} {
			if !strings.Contains(all, want) {
				t.Fatalf("%s: missing %q in %q", lang, want, all)
			}
		}
		if strings.Contains(all, "index.lock") {
			t.Errorf("%s: the lock's path is shown: %q", lang, all)
		}
		if err := tt.Click(L.T("cant.clear_lock")); err != nil {
			t.Fatalf("%s: %v", lang, err)
		}
		tt.Frame()
		var got *protocol.TaskAction
		for _, f := range sent {
			if a, ok := f.(protocol.TaskAction); ok {
				got = &a
			}
		}
		if got == nil || got.Action != "clear_lock" || got.TaskID != "t_fix" {
			t.Fatalf("%s: the tap sent %+v", lang, got)
		}
	}
}

func busyTask(app *App) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	cant := &protocol.CantStart{Why: "busy", Computer: "Macbook Pro M3", What: "nowledge-mem", ClearLock: true}
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(950, now, "default", protocol.TaskStream("t_fix"), protocol.OriginSystem, protocol.KindTaskState,
			protocol.TaskState{TaskID: "t_fix", Attention: protocol.Failed, Residency: "archived", Reason: "没能开始：Macbook Pro M3 上 nowledge-mem 的仓库一直被另一个 git 占着", Cant: cant}),
	}})
}

// DUCTER_SHOTS_DIR=$PWD/../../.shots/handover-fix go test ./internal/views -run HandoverFixShots
func TestHandoverFixShots(t *testing.T) {
	dir := os.Getenv("DUCTER_SHOTS_DIR")
	if dir == "" {
		t.Skip("DUCTER_SHOTS_DIR not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	save := func(tt *ui.Tester, name string) {
		todoFrames(tt, 6)
		f, err := os.Create(filepath.Join(dir, name))
		if err != nil {
			t.Fatal(err)
		}
		if err := png.Encode(f, withLights(tt.Image())); err != nil {
			t.Fatal(err)
		}
		f.Close()
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		suffix := ""
		if lang == i18n.EN {
			suffix = "-en"
		}
		// The pile with the person's own subject first and + 新的分类.
		app, _, tt := todoApp(t, lang, 1400, 1100)
		app.S.PersonaName = todoWords(lang)("小鸭", "Duckie")
		app.Receive(ownPile(lang))
		app.Route = RouteOnHand
		tt.SetScale(2)
		save(tt, fmt.Sprintf("mac-after-subjects%s.png", suffix))
		// A chip's sheet: rename, remove, 移出, 归到分类….
		app2, _, tt2 := handApp(t, lang, 1400, 1000, "")
		_ = app2
		tt2.SetScale(2)
		save(tt2, fmt.Sprintf("mac-after-subject-sheet%s.png", suffix))
		// The task that couldn't start: busy, with its hint and 清掉旧的再试.
		app3, _ := tinycart(t, lang, 3*time.Minute)
		busyTask(app3)
		app3.OpenTask("t_fix")
		st := ui.NewTesterWith(app3.View, 1100, 760, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		st.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		st.SetScale(2)
		st.Frame()
		save(st, fmt.Sprintf("mac-after-cant%s.png", suffix))
	}
}
