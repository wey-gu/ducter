package views

import (
	"fmt"
	"image"
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
)

// D530's live line and the working composer, as the author saw them on a
// Codex task (GPT-6.2-Sol, low): the steps, a failed `cat` whose command
// came cut (no closing quote), the step under way, the context ring, a
// draft typed into the focused composer; then running → done in frames.
// DUCTER_LIVE_SHOTS=<dir> (and DUCTER_LIVE_PREFIX=before|after).

func (f *v2Fixture) codexLive() []protocol.LogEvent {
	id, ts := "t_live", protocol.TaskStream("t_live")
	s := time.Second
	root := "/Users/someone/dev/mem"
	bash := func(ago time.Duration, c, out string, ok bool) protocol.LogEvent {
		return f.tool(id, ago, "Bash", map[string]any{"command": c}, ok, out)
	}
	title := f.w("记忆详情里按 Esc 丢改动", "Esc drops an edit in a memory's details")
	return []protocol.LogEvent{
		f.at(300*s, ts, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: title, Harness: "codex", Model: "gpt-6.2-sol", Project: "Mem",
			Place: protocol.Place{Kind: "repo", Device: "local", RepoPath: root, Branch: "ducter/esc-keeps-edit", BaseBranch: "main"},
			Brief: f.w("记忆详情里编辑后按 Esc 会丢改动，找到原因修好，加一个测试。", "In a memory's details, Esc after an edit drops the change: find why, fix it, add a test.")}),
		f.state(id, 300*s, protocol.Working),
		f.think(id, 290*s, f.w("先看 Esc 是在哪里处理的", "First find where Esc is handled")),
		bash(280*s, "rg -n onEscape apps/desktop/src", "apps/desktop/src/memory/MemoryDetail.tsx:88", true),
		f.tool(id, 270*s, "Read", map[string]any{"file_path": root + "/apps/desktop/src/memory/MemoryDetail.tsx"}, true, ""),
		f.tool(id, 268*s, "Read", map[string]any{"file_path": root + "/apps/desktop/src/memory/useEditBuffer.ts"}, true, ""),
		bash(250*s, `bash -lc "cat apps/desktop/src/memory/MemoryDetail.test.tsx | sed -n '1,80p'`, "cat: apps/desktop/src/memory/MemoryDetail.test.tsx: No such file or directory", false),
		f.say(id, 240*s, f.w("Esc 直接关掉了详情，没有先问要不要保存。我先给它补一个测试。", "Esc closes the details straight away without asking to keep the edit. I'll add a test for it first.")),
		f.at(220*s, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "system", Raw: []byte(`{"kind":"context","contextTokens":61000,"contextWindow":272000}`)}),
		bash(41*s, "bun test apps/desktop/src/memory", "", true),
	}
}

func TestD530LiveShots(t *testing.T) {
	dir := os.Getenv("DUCTER_LIVE_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_LIVE_SHOTS=<dir> to write the shots")
	}
	prefix := os.Getenv("DUCTER_LIVE_PREFIX")
	if prefix == "" {
		prefix = "after"
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			for _, w := range []int{1150, 1400} {
				app, _ := iaApp(t, lang)
				app.Status = client.Connected
				app.LocaleFixed = true
				app.S.Welcomed = true
				f := &v2Fixture{ascFixture: ascFixture{app: app}, zh: lang == i18n.ZH}
				evs := f.codexLive()
				app.Receive(protocol.ServerFrame{T: "events", Events: evs})
				at := func(ago time.Duration) string { return time.Now().Add(-ago).UTC().Format(time.RFC3339Nano) }
				card := protocol.TaskCard{TaskID: "t_live", Persona: "default", Title: f.w("记忆详情里按 Esc 丢改动", "Esc drops an edit in a memory's details"), Harness: "codex",
					Model: "gpt-6.2-sol", Effort: "low", Attention: protocol.Working, Residency: "hot", OpenedAt: at(5 * time.Minute), UpdatedAt: at(time.Second)}
				app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{card}}})
				tt := ui.NewTesterWith(app.View, w, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				tt.SetDark(dark)
				app.Now = tt.Now
				theme := "light"
				if dark {
					theme = "dark"
				}
				app.OpenTask("t_live")
				tt.Frame()
				app.Receive(protocol.ServerFrame{T: "task_new_options", Models: codex062()})
				app.taskDrafts["t_live"] = f.w("顺便看看搜索页的 Esc", "Check Search's Esc too while you're there")
				app.focusComposer = true
				for i := 0; i < 4; i++ {
					tt.Frame()
					tt.Advance(200 * time.Millisecond)
				}
				scrollTaskTo(app, "t_live", 1)
				tt.Frame()
				tt.Frame()
				base := fmt.Sprintf("%s-mac-live-%d-%s-%s", prefix, w, lang, theme)
				write := func(name string, img image.Image) {
					fh, err := os.Create(filepath.Join(dir, name+".png"))
					if err != nil {
						t.Fatal(err)
					}
					_ = png.Encode(fh, img)
					fh.Close()
				}
				write(base, tt.Image())
				crop2x := func(name string, r ui.Rect, dx0, dy0, wd, ht float32) {
					tt.SetScale(2)
					tt.Frame()
					tt.Frame()
					img := tt.Image()
					x0, y0 := int((r.X+dx0)*2), int((r.Y+dy0)*2)
					write(name, img.SubImage(image.Rect(x0, y0, x0+int(wd*2), y0+int(ht*2))))
					tt.SetScale(1)
					tt.Frame()
				}
				// The composer and its foot row, from the hint under it (before: the old hint).
				for _, s := range []string{app.L.T("send.steer")} {
					if r, ok := tt.Find(s); ok {
						crop2x(base+"-composer-crop2x", ui.Rect{X: r.X - 180, Y: r.Y}, 0, -100, 720, 140)
						break
					}
				}
				// The live line (before: the bare state word; after: what it is doing).
				for _, x := range tt.Texts() {
					if strings.HasPrefix(x, app.L.T("foot.ran")) || x == app.stateLabel(protocol.Working) {
						if r, ok := tt.Find(x); ok && r.Y > 400 {
							crop2x(base+"-liveline-crop2x", r, -40, -150, 720, 210)
							break
						}
					}
				}
				// Running → done: the turn ends, the state follows, frames 0, 120, 300 ms after.
				if w == 1150 {
					app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
						f.say("t_live", 0, f.w("加了测试，Esc 现在先问要不要保留改动。", "Test added; Esc now asks whether to keep the edit.")),
						f.at(0, protocol.TaskStream("t_live"), protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "t_live", Role: "system", Text: "turn completed"}),
						f.state("t_live", 0, protocol.Done),
					}})
					card.Attention = protocol.Done
					app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{card}}})
					for i, ms := range []int{0, 120, 300} {
						if i > 0 {
							tt.Advance(time.Duration(ms-[]int{0, 120, 300}[i-1]) * time.Millisecond)
						}
						scrollTaskTo(app, "t_live", 1)
						tt.Frame()
						tt.Frame()
						write(fmt.Sprintf("%s-done-f%d", base, i), tt.Image())
					}
				}
			}
		}
	}
}
