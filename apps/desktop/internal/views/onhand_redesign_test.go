package views

import (
	"encoding/json"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D216: a row says what the task is on from the card alone (its latest
// step), before the Mac holds the task's events; Find narrows; j/k walk.
func TestOnHandRowsFromTheCard(t *testing.T) {
	app, _ := iaApp(t, i18n.EN)
	app.Status = client.Connected
	ev := protocol.NewEvent(9, time.Now().UTC().Format(time.RFC3339Nano), "default", protocol.TaskStream("t1"), protocol.OriginTask, protocol.KindTaskEvent,
		protocol.TaskEvent{TaskID: "t1", Role: "tool", Tool: &protocol.ToolCall{Name: "Bash", Input: json.RawMessage(`{"command":"bun test apps/web"}`)}})
	now := time.Now().UTC().Format(time.RFC3339)
	card := func(id, title, project string, att protocol.Attention) protocol.TaskCard {
		return protocol.TaskCard{TaskID: id, Title: title, Project: project, Harness: "claude-code", Attention: att, OpenedAt: now, UpdatedAt: now,
			Place: protocol.Place{Kind: "repo", Device: "local", RepoPath: "/r/" + project, Branch: "ducter/" + id, BaseBranch: "main"}}
	}
	c1 := card("t1", "Keyboard on On hand", "ducter", protocol.Working)
	c1.Latest = &ev
	c1.Changes = &protocol.DiffStat{Files: 2, Adds: 40, Dels: 3}
	c2 := card("t2", "Range scan benchmark", "hawdb", protocol.Done)
	c2.Integrated = &protocol.Integrated{Act: "open_pr", Ref: "https://github.com/o/r/pull/7"}
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{c1, c2}}})
	s := app.storyOf(app.S.Task("t1"))
	if s.mark != "ran" || !strings.Contains(s.words+" "+s.code, "bun test") {
		t.Fatalf("the working row's line from the card: %+v", s)
	}
	if integrated(app.S.Task("t2")) != "open_pr" {
		t.Fatalf("the draft PR is not on the row")
	}
	app.Route = RouteOnHand
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	if len(app.oh.order) != 2 {
		t.Fatalf("keys walk %v", app.oh.order)
	}
	app.moveFocus(1)
	app.moveFocus(1)
	if app.oh.focus != "t2" {
		t.Fatalf("j twice lands on %q", app.oh.focus)
	}
	if !app.findMatches(app.S.Task("t2"), "hawdb bench") || app.findMatches(app.S.Task("t1"), "hawdb") {
		t.Fatalf("Find matches every word, anywhere")
	}
	if l := app.switchList("bench"); len(l) != 1 || l[0].ID != "t2" {
		t.Fatalf("the switcher finds by title")
	}
}

// D216's shots: On hand on the Mac from a real demo core's frames
// (apps/web/demo-onhand.ts, dumped as <lang>.json into DUCTER_ONHAND_FRAMES).
func TestOnHandRedesignShots(t *testing.T) {
	dir := os.Getenv("DUCTER_ONHAND_FRAMES")
	if dir == "" {
		t.Skip("DUCTER_ONHAND_FRAMES=<dir> to write the shots")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		data, err := os.ReadFile(filepath.Join(dir, string(lang)+".json"))
		if err != nil {
			t.Fatal(err)
		}
		var frames []protocol.ServerFrame
		if err := json.Unmarshal(data, &frames); err != nil {
			t.Fatal(err)
		}
		app, _ := iaApp(t, lang)
		app.Status = client.Connected
		app.LocaleFixed = true
		for _, f := range frames {
			app.Receive(f)
		}
		app.Route = RouteOnHand
		tt := ui.NewTesterWith(app.View, 1440, 1000, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		shot := func(name string) {
			tt.Frame()
			tt.Frame()
			tt.Advance(time.Second)
			f, err := os.Create(filepath.Join(shotsDir(t), "onhand-"+name+"-"+string(lang)+".png"))
			if err != nil {
				t.Fatal(err)
			}
			if err := png.Encode(f, tt.Image()); err != nil {
				t.Fatal(err)
			}
			f.Close()
		}
		shot("mac")
		app.moveFocus(1)
		app.moveFocus(1)
		app.moveFocus(1)
		shot("mac-keys")
		app.Local.SetByProject(true)
		shot("mac-byproject")
		app.Local.SetByProject(false)
		app.OpenSwitcher()
		app.oh.swQuery = "compaction"
		shot("mac-switcher")
		app.oh.sw = false
		start := time.Now()
		for i := 0; i < 20; i++ {
			tt.Frame()
		}
		t.Logf("%s: %d tasks, %v a frame", lang, len(app.S.Tasks), time.Since(start)/20)
		_ = store.LaneDone
	}
}
