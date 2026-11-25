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

// D395 (hel, 2026-11-19): the author's first hand-off failed at once and the
// task showed 没成 and a bare worktree path. A task that can't start where it
// was to work says why in plain words and offers what fixes it; a tap sends
// the fix (start on that computer's copy, clone it here), never the same retry.
func TestCantStartSaysWhyAndOffersTheFix(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, tt := tinycart(t, lang, 3*time.Minute)
		var sent []any
		app.Send = func(f any) error { sent = append(sent, f); return nil }
		now := time.Now().UTC().Format(time.RFC3339Nano)
		cant := &protocol.CantStart{Why: "no_repo", Computer: "Hetzner Server", What: "mem", Path: "/root/dev/mem", Elsewhere: &protocol.CantElsewhere{Device: "dev_mac", Name: "MacBook"}, CloneHere: true}
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			protocol.NewEvent(950, now, "default", protocol.TaskStream("t_fix"), protocol.OriginSystem, protocol.KindTaskState,
				protocol.TaskState{TaskID: "t_fix", Attention: protocol.Failed, Residency: "archived", Reason: "没能开始：Hetzner Server 上没有 mem 的代码", Cant: cant}),
		}})
		app.OpenTask("t_fix")
		tt.Frame()
		tt.Frame()
		L := i18n.New(lang)
		all := texts(tt)
		line := L.T("cant.no_repo", "Hetzner Server", "mem")
		want := map[i18n.Lang]string{i18n.ZH: "没能开始：Hetzner Server 上没有 mem 的代码", i18n.EN: "Couldn't start: Hetzner Server has no copy of mem"}[lang]
		if line != want || !strings.Contains(all, want) {
			t.Fatalf("%s: the cause isn't said as %q: %q", lang, want, all)
		}
		for _, label := range []string{L.T("cant.on", "MacBook"), L.T("cant.clone_to", "Hetzner Server")} {
			if !hasText(tt, label) {
				t.Errorf("%s: no %q in %q", lang, label, all)
			}
		}
		if hasText(tt, L.T("task.action.retry")) {
			t.Errorf("%s: 再试一次 offered beside a fix: %q", lang, all)
		}
		if strings.Contains(all, "/root/dev/mem") {
			t.Errorf("%s: the bare path is shown: %q", lang, all)
		}
		if dir := os.Getenv("DUCTER_CANT_SHOTS"); dir != "" {
			_ = os.MkdirAll(dir, 0o755)
			st := ui.NewTesterWith(app.View, 1100, 760, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			st.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			st.Frame()
			st.Frame()
			st.Advance(time.Second)
			if f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-cant-start-%s.png", lang))); err == nil {
				_ = png.Encode(f, st.Image())
				f.Close()
			}
		}
		if err := tt.Click(L.T("cant.on", "MacBook")); err != nil {
			t.Fatalf("%s: click: %v", lang, err)
		}
		tt.Frame()
		var got *protocol.TaskAction
		for _, f := range sent {
			if a, ok := f.(protocol.TaskAction); ok {
				got = &a
			}
		}
		if got == nil || got.Action != "start_at" || got.Device != "dev_mac" || got.TaskID != "t_fix" {
			t.Fatalf("%s: the tap sent %+v", lang, got)
		}
	}
}
