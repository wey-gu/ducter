package views

import (
	"encoding/json"
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D321: Settings › 记忆 as what it knows about you (the groups, a search
// answered, a row being fixed, a row asking to forget) and › 连上的 AI agent's
// 试试看 (waiting for the first hand-off, then that it worked), and the
// conversation's one-time note, zh and en, light and dark, at 1280 and 900,
// offline with the pretend Mem of memApp (never anyone's real memories):
//
//	DUCTER_D321_SHOTS=/path/to/.shots/d321/after/mac go test ./internal/views -run D321Shots
func TestD321Shots(t *testing.T) {
	dir := os.Getenv("DUCTER_D321_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_D321_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	devices := protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{
		{ID: "local", Name: "MacBook", Kind: "laptop", Home: true, State: protocol.DeviceAwake, Harnesses: []protocol.DeviceHarness{
			{Harness: "claude-code", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "installed"}},
			{Harness: "codex", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "absent"}},
		}},
	}}
	peerEvent := func(lang i18n.Lang, ago time.Duration) protocol.ServerFrame {
		text := "Fix the red Linux CI: the runner tests time out now and then on Linux. Only touch the runner tests."
		if lang == i18n.ZH {
			text = "把 Linux 上 CI 那个红修了：runner 的测试在 Linux 上偶发超时，只动 runner 的测试。"
		}
		body, _ := json.Marshal(protocol.BridgeMsg{Direction: "in", MessageID: "bm_first", From: "Claude Code", Agent: "Claude Code", Text: text})
		return protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{{Seq: 900, TS: time.Now().Add(-ago).UTC().Format(time.RFC3339), Stream: "channel", Origin: "peer", Kind: "bridge_msg", Body: body}}}
	}
	type scene struct {
		name string
		tab  string
		h    int
		set  func(app *App, lang i18n.Lang)
	}
	scenes := []scene{
		{"memory", TabMemory, 2600, nil},
		{"memory-open", TabMemory, 2600, func(app *App, lang i18n.Lang) { app.memPage.open = memAbout(lang)[1].ID }},
		{"memory-fix", TabMemory, 2600, func(app *App, lang i18n.Lang) {
			m := memAbout(lang)[0]
			app.memPage.open, app.memPage.mode, app.memPage.fixText = m.ID, "fix", m.Title
		}},
		{"memory-forget", TabMemory, 2600, func(app *App, lang i18n.Lang) {
			app.memPage.open, app.memPage.mode = memAbout(lang)[3].ID, "ask"
		}},
		{"memory-search", TabMemory, 1600, func(app *App, lang i18n.Lang) {
			q := "Weizhen"
			app.memPage.query, app.memPage.last, app.memPage.sent, app.S.MemQuery = q, q, q, q
			app.S.MemFound = &protocol.MemFound{Q: q, OK: true, Items: []protocol.MemItem{memAbout(lang)[5]}}
		}},
		{"memory-empty", TabMemory, 1800, func(app *App, lang i18n.Lang) {
			app.S.Mem.Glance = &protocol.MemGlance{Total: 3}
		}},
		{"peers-waiting", TabPeers, 2000, func(app *App, lang i18n.Lang) { app.Receive(devices) }},
		{"peers-first", TabPeers, 2000, func(app *App, lang i18n.Lang) {
			app.Receive(devices)
			app.Receive(peerEvent(lang, time.Minute))
		}},
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			for _, sc := range scenes {
				for _, w := range []int{1280, 900} {
					app, _ := memApp(t, lang, "on")
					if sc.set != nil {
						sc.set(app, lang)
					}
					app.openTab(sc.tab)
					tt := ui.NewTesterWith(app.View, w, sc.h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
					tt.SetDark(dark)
					// The window follows the system calmly (D302): let the blend land.
					for i := 0; i < 12; i++ {
						tt.Advance(150 * time.Millisecond)
						tt.Frame()
					}
					theme := "light"
					if dark {
						theme = "dark"
					}
					write := func(name string) {
						f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%d-%s-%s.png", name, w, theme, lang)))
						if err != nil {
							t.Fatal(err)
						}
						if err := png.Encode(f, tt.Image()); err != nil {
							t.Fatal(err)
						}
						f.Close()
					}
					write(sc.name)
					// The conversation under the first hand-off: its one-time note.
					if sc.name == "peers-first" && w == 1280 {
						app.Route = RouteConversation
						tt.SetSize(w, 900)
						for i := 0; i < 4; i++ {
							tt.Frame()
						}
						write("conversation-first-peer")
					}
				}
			}
		}
	}
}
