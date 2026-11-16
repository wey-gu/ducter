package views

import (
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D300's Mac screens, zh and en:
//
//	DUCTER_DID_SHOTS=1 DUCTER_SHOTS_DIR=<repo>/.shots/d300 go test ./internal/views -run DidShots
//
// a full day at 1280×820 and 900×700, the empty day, a filter, a search
// with its one result, and On hand's end line.
func TestDidShots(t *testing.T) {
	if os.Getenv("DUCTER_DID_SHOTS") == "" {
		t.Skip("DUCTER_DID_SHOTS=1 to write the shots")
	}
	dir := shotsDir(t)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := pastApp(t, lang)
		tt := ui.NewTesterWith(app.View, 1280, 820, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetScale(2)
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		shot := func(name string, w, h int) {
			t.Helper()
			tt.SetSize(w, h)
			for i := 0; i < 4; i++ {
				tt.Frame()
				tt.Advance(200 * time.Millisecond)
			}
			f, err := os.Create(filepath.Join(dir, "mac-did-"+name+"-"+string(lang)+".png"))
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			if err := png.Encode(f, tt.Image()); err != nil {
				t.Fatal(err)
			}
		}
		all := didDayItems(lang)
		app.OpenDid()
		app.did.focusField = false
		app.Receive(didResult(all, all, ""))
		shot("day", 1280, 820)
		shot("day-narrow", 900, 700)
		shot("day-tall", 1280, 1900)
		// A filter: Changed.
		app.did.kind = "changed"
		app.Receive(didResult(didOfKind(all, "changed"), all, ""))
		shot("filter", 1280, 820)
		// The search "hotel" / "酒店".
		app.did.kind = ""
		app.did.q = pastWord(lang, "酒店", "hotel")
		app.Receive(didResult([]protocol.DidItem{all[5]}, all, ""))
		shot("search", 1280, 820)
		// Nothing found.
		app.did.q = "kyoto"
		app.Receive(didResult(nil, all, ""))
		shot("none", 1280, 820)
		// The empty day.
		app.did.q = ""
		quiet := didQuietItems(lang)
		app.Receive(didResult(quiet, quiet, ""))
		shot("empty", 1280, 820)
		shot("empty-narrow", 900, 700)
		// On hand: its quiet last line.
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{
			{TaskID: "t_on1", Title: pastWord(lang, "Compaction 调度的退避参数", "Back-off for the compaction scheduler"), Project: "hawdb", Harness: "claude-code", Attention: protocol.Working, OpenedAt: pastNow.Add(-20 * time.Minute).UTC().Format(time.RFC3339), UpdatedAt: pastNow.UTC().Format(time.RFC3339)},
		}}})
		app.Route = RouteOnHand
		shot("onhand-end", 1280, 820)
	}
}
