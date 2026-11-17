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

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D329: the Noted line's 撤销 / Undo (no question asked), what it replaced and
// whether it waits for Nowledge Mem; Memory when the Mem app is closed; Mem in
// Update all. Pictures, zh and en, light and dark:
//
//	DUCTER_D329_SHOTS=/path/to/.shots/d329/mac go test ./internal/views -run D329

func d329Ev(seq int64, origin, kind string, body any) protocol.LogEvent {
	raw, _ := json.Marshal(body)
	return protocol.LogEvent{Seq: seq, TS: time.Now().UTC().Format(time.RFC3339Nano), Stream: "channel", Origin: protocol.Origin(origin), Kind: kind, Body: raw}
}

// d329Conversation: the person asked it to remember two things; one replaced
// an older memory, the other waits for Mem.
func d329Conversation(t *testing.T, lang i18n.Lang) (*App, *[]any) {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	zh := lang == i18n.ZH
	pick := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		d329Ev(1, "user", protocol.KindUserMsg, protocol.UserMsg{Text: pick("记住：周报改到周四下午发，还有我喜欢深色模式", "Remember: the weekly report goes out Thursday afternoon now, and I like dark mode")}),
		d329Ev(2, "partner", protocol.KindAIMsg, protocol.AIMsg{Text: pick("好，记住了。", "Got it."), ReplyTo: 1}),
		d329Ev(3, "partner", protocol.KindMemoryNoted, protocol.MemoryNoted{Title: pick("周报周四下午发", "Weekly report goes out Thursday afternoon"), MemoryID: "m-new", ReplyTo: 1, Replaced: &protocol.NotedReplaced{ID: "m-old", Title: pick("周报周五下午发", "Weekly report goes out Friday afternoon")}}),
		d329Ev(4, "partner", protocol.KindMemoryNoted, protocol.MemoryNoted{Title: pick("喜欢深色模式", "Likes dark mode"), ReplyTo: 1, Waiting: "k-1"}),
	}})
	f := settingsFrame()
	f.Mem.Waiting = []int64{4}
	app.Receive(f)
	if !app.detailsOpen("m2") {
		app.open = map[string]bool{"det:m2": true}
	}
	return app, sent
}

func d329Tester(app *App, w, h int, dark bool) *ui.Tester {
	tt := ui.NewTesterWith(app.View, w, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetDark(dark)
	for i := 0; i < 12; i++ {
		tt.Advance(150 * time.Millisecond)
		tt.Frame()
	}
	return tt
}

func d329Shot(t *testing.T, tt *ui.Tester, name string, dark bool, lang i18n.Lang) {
	t.Helper()
	dir := os.Getenv("DUCTER_D329_SHOTS")
	if dir == "" {
		return
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	theme := "light"
	if dark {
		theme = "dark"
	}
	f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%s-%s.png", name, theme, lang)))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, tt.Image()); err != nil {
		t.Fatal(err)
	}
}

func TestD329NotedLine(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			L := i18n.New(lang)
			app, sent := d329Conversation(t, lang)
			tt := d329Tester(app, 1100, 760, dark)
			zh := lang == i18n.ZH
			old := "Weekly report goes out Friday afternoon"
			if zh {
				old = "周报周五下午发"
			}
			for _, w := range []string{L.T("memory.replaced", old), L.T("memory.waiting"), L.T("memory.undo")} {
				if !tt.HasText(w) {
					t.Fatalf("%s: no %q in %q", lang, w, tt.Texts())
				}
			}
			if tt.HasText(L.T("partner.memory.forget")) {
				t.Errorf("%s: a fresh line offers Forget, not Undo", lang)
			}
			d329Shot(t, tt, "noted-fresh", dark, lang)
			// Undo: one tap, no question.
			if err := tt.Click(L.T("memory.undo")); err != nil {
				t.Fatal(err)
			}
			if u, ok := lastSent[protocol.MemoryUndo](*sent); !ok || u.T != "memory_undo" || u.Seq != 3 {
				t.Fatalf("%s: sent %#v", lang, *sent)
			}
			// Mem didn't answer: said in place; then it did: 不记了.
			f := settingsFrame()
			f.Mem.Waiting = []int64{4}
			f.Undid = &protocol.Undid{Seq: 3, OK: false}
			app.Receive(f)
			tt.Frame()
			if !tt.HasText(L.T("memory.undo.failed")) {
				t.Errorf("%s: no undo failure in %q", lang, tt.Texts())
			}
			d329Shot(t, tt, "noted-undo-failed", dark, lang)
			f = settingsFrame()
			f.Mem.Undone = []int64{3}
			f.Mem.Waiting = []int64{4}
			app.Receive(f)
			tt.Frame()
			title := "Weekly report goes out Thursday afternoon"
			if zh {
				title = "周报周四下午发"
			}
			if !tt.HasText(L.T("memory.undone", title)) || tt.HasText(L.T("memory.replaced", old)) {
				t.Errorf("%s: undone line: %q", lang, tt.Texts())
			}
			d329Shot(t, tt, "noted-undone", dark, lang)
			// The person spoke since: Forget, not Undo.
			app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{d329Ev(5, "user", protocol.KindUserMsg, protocol.UserMsg{Text: "ok"})}})
			tt.Frame()
			if app.S.LastUserSeq != 5 {
				t.Fatalf("last user seq %d", app.S.LastUserSeq)
			}
		}
	}
}

func TestD329NotedAfterTheyspoke(t *testing.T) {
	app, _ := d329Conversation(t, i18n.ZH)
	app.S.LastUserSeq = 9
	tt := d329Tester(app, 1100, 760, false)
	if tt.HasText("撤销") || !tt.HasText("忘掉") {
		t.Errorf("after the person spoke: %q", tt.Texts())
	}
}

func TestD329MemClosed(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			L := i18n.New(lang)
			app, sent := memApp(t, lang, "on")
			app.S.Bridge = &protocol.BridgeView{State: "mem_closed", Identity: "ducter", Home: "hel", Version: "0.10.118", CanOpen: true}
			app.openTab(TabMemory)
			tt := d329Tester(app, 1280, 1400, dark)
			for _, w := range []string{L.T("bridge.mem.closed"), L.T("bridge.mem.closed.open", "hel"), L.T("bridge.mem.open")} {
				if !tt.HasText(w) {
					t.Fatalf("%s: no %q in %q", lang, w, tt.Texts())
				}
			}
			d329Shot(t, tt, "memory-closed", dark, lang)
			if err := tt.Click(L.T("bridge.mem.open")); err != nil {
				t.Fatal(err)
			}
			if a, ok := lastSent[protocol.BridgeAction](*sent); !ok || a.T != "bridge_mem_open" {
				t.Fatalf("%s: sent %#v", lang, *sent)
			}
			// A home that can't open it: the line alone.
			app.S.Bridge = &protocol.BridgeView{State: "mem_closed", Identity: "ducter", Home: "hel"}
			tt.Frame()
			if !tt.HasText(L.T("bridge.mem.closed.there", "hel")) || hasExact(tt, L.T("bridge.mem.open")) {
				t.Errorf("%s: no way to open: %q", lang, tt.Texts())
			}
		}
	}
}

func TestD329UpdateAllMem(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			L := i18n.New(lang)
			at := time.Now().UTC().Format(time.RFC3339)
			items := append(uaItems()[:3], protocol.UpdateAllItem{Key: "mem:local", Kind: "mem", Device: "local", DeviceName: "hel", From: "0.10.118", To: "0.10.121", State: "queued", At: at})
			app, _, _ := uaApp(t, lang, &protocol.UpdateAllView{Offer: items}, false)
			tt := d329Tester(app, 1280, 1800, dark)
			if !tt.HasText(L.T("upall.item.mem", "hel")) || !tt.HasText("0.10.118 → 0.10.121") {
				t.Fatalf("%s: no Mem in %q", lang, tt.Texts())
			}
			d329Shot(t, tt, "update-all-mem", dark, lang)
			// Running, with no version Mem named; then done.
			run := items
			for i := range run[:3] {
				run[i].State = "done"
			}
			run[3].State, run[3].Phase, run[3].To = "running", "updating", ""
			app.Receive(protocol.ServerFrame{T: "devices", Devices: uaDevices(), UpdateAll: &protocol.UpdateAllView{Plan: &protocol.UpdateAllPlan{ID: "ua-1", By: "user", Items: run}}})
			tt.Frame()
			if !tt.HasText(L.T("upall.state.updating.bare")) || tt.HasText("0.10.118 → ") {
				t.Errorf("%s: running Mem: %q", lang, tt.Texts())
			}
			d329Shot(t, tt, "update-all-mem-running", dark, lang)
		}
	}
}

func hasExact(tt *ui.Tester, w string) bool {
	for _, x := range tt.Texts() {
		if x == w {
			return true
		}
	}
	return false
}
