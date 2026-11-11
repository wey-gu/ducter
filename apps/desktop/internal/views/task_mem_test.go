package views

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// The author's run (D152): Codex connecting Nowledge Mem on a Linux server
// home, the brief carrying a connect token. The events are
// packages/protocol/fixtures/transcript.json's, moved to end `ago` before now.
func memTask(t *testing.T, lang i18n.Lang, scenario string) (*App, *ui.Tester) {
	t.Helper()
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/transcript.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Name   string              `json:"name"`
		Events []protocol.LogEvent `json:"events"`
	}
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	pick := map[string]int{"done": 0, "running": 1, "yourturn": 1, "failed": 2}[scenario]
	evs := cases[pick].Events
	app, _ := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	app.Receive(protocol.ServerFrame{T: "settings", Settings: &protocol.Settings{Name: "小鸭", Language: string(lang), Memory: true, Notify: true, DefaultAfterMin: 30}, Mem: &protocol.MemView{State: "connected"}})
	end, _ := time.Parse(time.RFC3339Nano, evs[len(evs)-1].TS)
	shift := time.Now().Add(-20 * time.Second).Sub(end)
	seq := evs[len(evs)-1].Seq
	at := func(ago time.Duration) string { return time.Now().Add(-ago).UTC().Format(time.RFC3339Nano) }
	for i := range evs {
		ts, _ := time.Parse(time.RFC3339Nano, evs[i].TS)
		evs[i].TS = ts.Add(shift).UTC().Format(time.RFC3339Nano)
	}
	id := strings.TrimPrefix(evs[0].Stream, "task:")
	add := func(origin protocol.Origin, kind string, body any) {
		seq++
		evs = append(evs, protocol.NewEvent(seq, at(10*time.Second), "default", evs[0].Stream, origin, kind, body))
	}
	state := map[string]protocol.Attention{"done": protocol.Done, "running": protocol.Working, "yourturn": protocol.NeedsYou, "failed": protocol.Failed}[scenario]
	if scenario == "yourturn" {
		add(protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "assistant", Text: "nmem is connected. Before I touch `~/.codex/config.toml`: do you want Mem as a Codex plugin or as an MCP server? This Codex may not have the plugin command."})
	}
	if scenario == "failed" {
		add(protocol.OriginTask, protocol.KindReport, protocol.Report{TaskID: id, State: "failed", Summary: "Couldn't commit: the turn failed when the stream dropped. The fix is in src/cart.ts and the tests pass."})
	}
	add(protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: state, Residency: "warm"})
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	tt := ui.NewTesterWith(app.View, 1280, 1700, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	app.OpenTask(id)
	app.Receive(protocol.ServerFrame{T: "task_history", TaskID: id, Events: evs})
	tt.Frame()
	tt.Frame()
	return app, tt
}

// The opened task, as the author saw it: the key never shows, what you
// asked is a quiet card, the agent's words are the readable layer, probes
// that find nothing are not errors.
func TestOpenedTaskMem(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, sc := range []string{"running", "done", "failed", "yourturn"} {
			_, tt := memTask(t, lang, sc)
			all := texts(tt)
			if strings.Contains(all, "8fK2pQx7") {
				t.Errorf("%s %s: the connect token shows", lang, sc)
			}
			shotTo(t, tt, "task-mem-"+sc+"-desktop-"+string(lang))
		}
	}
}

// D210: a run of looks folds into one line ("看了 1 个文件，搜了 4 次") that
// opens on a click; the probes in it say "not there" in plain words, never
// 出错; every other step is its own line, a real failure red with its
// error line in place.
func TestOpenedTaskMemStretches(t *testing.T) {
	want := map[i18n.Lang][]string{
		i18n.ZH: {"没找到 nmem", "没全找到：python3 pip3 uv", "还没有 .nowledge-mem/config.json", "请求 cloud.nowledge.co", "隐藏了一段密钥", "你交给它的事"},
		i18n.EN: {"No nmem here", "Not all found: python3 pip3 uv", "No .nowledge-mem/config.json yet", "Requested cloud.nowledge.co", "A key is hidden", "What you asked"},
	}
	fold := map[i18n.Lang]string{i18n.ZH: "看了 1 个文件，搜了 4 次", i18n.EN: "Read 1 file, 4 searches"}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		_, tt := memTask(t, lang, "done")
		all := texts(tt)
		folded := map[i18n.Lang]string{i18n.ZH: "没找到 nmem", i18n.EN: "No nmem here"}[lang]
		if strings.Contains(all, folded) {
			t.Errorf("%s: the looks aren't folded", lang)
		}
		// The plugin step that really failed is its own line, in the agent's words, with its error.
		for _, w := range []string{"Install the Mem plugin into Codex", "error: unknown command 'plugin' for 'codex'"} {
			if !strings.Contains(all, w) {
				t.Errorf("%s: no %q: %q", lang, w, all)
			}
		}
		if err := tt.Click(fold[lang]); err != nil {
			t.Fatal(err)
		}
		tt.Advance(time.Second)
		tt.Frame()
		all = texts(tt)
		for _, w := range want[lang] {
			if !strings.Contains(all, w) {
				t.Errorf("%s: no %q once opened: %q", lang, w, all)
			}
		}
		// Only the plugin step says 出错; no probe does.
		if n := strings.Count(all, map[i18n.Lang]string{i18n.ZH: "出错", i18n.EN: "Error"}[lang]); n != 1 {
			t.Errorf("%s: %d error marks, want 1 (the plugin step only)", lang, n)
		}
		shotTo(t, tt, "task-mem-done-open-desktop-"+string(lang))
	}
}

// openStretches opens every folded stretch of a task, as clicks would.
func openStretches(app *App, id string) {
	for _, b := range app.blocks(app.S.Task(id)) {
		if b.K == "steps" {
			for _, l := range b.Lines {
				if l.K == "looks" {
					app.open[fmt.Sprintf("looks:%s:%d", id, l.Seq)] = true
				}
			}
		}
	}
}
