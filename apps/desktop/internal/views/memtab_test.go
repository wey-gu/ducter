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
)

// D257: where the memory stands, the one update worth saying, the rail's
// line, when 你的其他 AI shows, and the noted lines by when. The same cases
// as the web's (apps/web/test/memory.test.ts).
func TestMemRules(t *testing.T) {
	conn := &protocol.MemView{State: "connected"}
	for _, c := range []struct {
		on   bool
		mem  *protocol.MemView
		b    *protocol.BridgeView
		want string
	}{
		{false, conn, nil, "off"},
		{true, nil, nil, "missing"},
		{true, conn, nil, "on"},
		{true, &protocol.MemView{State: "missing"}, &protocol.BridgeView{State: "install_mem"}, "install"},
		{true, nil, &protocol.BridgeView{State: "signing_in"}, "signing_in"},
		{true, nil, &protocol.BridgeView{State: "update_mem"}, "on"},
		{true, nil, &protocol.BridgeView{State: "local_mem"}, "on"},
	} {
		if got := memPhase(c.on, c.mem, c.b); got != c.want {
			t.Errorf("memPhase(%v, %v, %v) = %q, want %q", c.on, c.mem, c.b, got, c.want)
		}
	}
	for _, c := range []struct {
		b     *protocol.BridgeView
		kind  string
		badge string
	}{
		{nil, "", ""},
		{&protocol.BridgeView{State: "connected"}, "", ""},
		{&protocol.BridgeView{State: "update_mem", Version: "0.10.116", CanRun: true}, "needed", "mem.badge.needed"},
		{&protocol.BridgeView{State: "connected", Version: "0.10.118", Newer: ptr("0.10.121"), Upkeep: &protocol.BridgeUpkeep{Kind: "update"}}, "newer", "mem.badge.newer"},
		{&protocol.BridgeView{State: "connected", Newer: ptr("")}, "app", "mem.badge.newer"},
		{&protocol.BridgeView{State: "ready", Upkeep: &protocol.BridgeUpkeep{Kind: "move"}}, "move", ""},
		{&protocol.BridgeView{State: "updating"}, "updating", ""},
		{&protocol.BridgeView{State: "ready", Done: "updated"}, "done", ""},
	} {
		u := memUpdate(c.b)
		kind := ""
		if u != nil {
			kind = u.Kind
		}
		if kind != c.kind || memBadge(u) != c.badge {
			t.Errorf("memUpdate(%+v) = %q/%q, want %q/%q", c.b, kind, memBadge(u), c.kind, c.badge)
		}
	}
	none := &protocol.Peers{Reach: "own", Trusted: []string{}, Muted: []string{}}
	if peersShown(none, nil, false) || peersShown(none, &protocol.BridgeView{State: "install_mem"}, false) || peersShown(none, &protocol.BridgeView{State: "sign_in"}, false) {
		t.Errorf("你的其他 AI shows before Mem is in")
	}
	if !peersShown(none, &protocol.BridgeView{State: "ready"}, false) || !peersShown(none, &protocol.BridgeView{State: "update_mem"}, false) || !peersShown(none, nil, true) {
		t.Errorf("你的其他 AI hidden once it means something")
	}
	now := time.Date(2026, 11, 14, 15, 0, 0, 0, time.Local)
	at := func(d time.Duration) string { return now.Add(-d).UTC().Format(time.RFC3339) }
	gs := groupNoted([]protocol.Noted{{Seq: 6, At: at(time.Hour)}, {Seq: 5, At: at(10 * time.Hour)}, {Seq: 4, At: at(26 * time.Hour)}, {Seq: 3, At: at(6 * 24 * time.Hour)}, {Seq: 2, At: at(9 * 24 * time.Hour)}, {Seq: 1, At: "?"}}, now)
	got := ""
	for _, g := range gs {
		got += fmt.Sprintf("%s:%d ", g.When, len(g.Items))
	}
	if got != "today:2 week:2 earlier:2 " {
		t.Errorf("groupNoted = %q", got)
	}
}

// The Memory tab: the partner and its sentence, Mem's newer version as one
// highlighted card with its one tap, the noted lines by when (Forget sends
// its frame), Nowledge Mem's own card, and the rail's line.
func TestMemoryTab(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent := memApp(t, lang, "newer")
		app.openTab(TabMemory)
		tt := ui.NewTesterWith(app.View, 1280, 2400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		tt.Frame()
		L := app.L
		for _, w := range []string{L.T("mem.hero.on", app.personaName()), L.T("mem.update.newer", "0.10.121"), L.T("mem.update.newer.body", "hel", "0.10.118"), L.T("mem.badge.newer"),
			L.T("mem.when.today"), L.T("mem.when.week"), L.T("mem.when.earlier"), L.T("mem.notes.all"), L.T("mem.app.on"), L.T("mem.app.where", "hel")} {
			if !tt.HasText(w) {
				t.Fatalf("%s: no %q in %q", lang, w, tt.Texts())
			}
		}
		n := len(*sent)
		if err := tt.Click(L.T("bridge.mem.update.go")); err != nil {
			t.Fatal(err)
		}
		if len(*sent) != n+1 || (*sent)[n].(protocol.BridgeAction).T != "bridge_mem_install" {
			t.Fatalf("更新 sent %v", (*sent)[n:])
		}
		tt.Frame()
		if !tt.HasText(L.T("bridge.mem.updating", "hel")) {
			t.Fatalf("no updating line after the tap: %q", tt.Texts())
		}
		n = len(*sent)
		if err := tt.Click(L.T("partner.memory.forget") + " · " + memNotes(lang)[0]); err != nil {
			t.Fatal(err)
		}
		if len(*sent) != n+1 || (*sent)[n].(protocol.MemoryForget).T != "memory_forget" {
			t.Fatalf("忘掉 sent %v", (*sent)[n:])
		}
	}
}

func memNotes(lang i18n.Lang) []string {
	if lang == i18n.ZH {
		return []string{"开会别排在中午 12 点到 1 点", "周报每周五下午发，发给整个组", "测试统一用假时钟，不用真的 sleep", "Weizhen 负责 HawDB 的代码审查", "HawDB 的发布说明用英文写", "家里的网是电信，路由器在书房"}
	}
	return []string{"No meetings between 12 and 1", "The weekly report goes out Friday afternoon, to the whole team", "Tests use the fake clock, never a real sleep", "Weizhen reviews HawDB's code", "HawDB release notes are written in English", "Home internet is on China Telecom; the router is in the study"}
}

// memApp is the app with a settings frame in one of the demo's states
// (apps/web/demo-memory.ts): newer, on, empty, off, fresh, sign_in, old.
func memApp(t *testing.T, lang i18n.Lang, state string) (*App, *[]any) {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.Status = 2
	f := settingsFrame()
	f.Settings.Peers = &protocol.Peers{Reach: "own", Trusted: []string{}, Muted: []string{}}
	now := time.Now()
	backs := []time.Duration{40 * time.Minute, 3 * time.Hour, 26 * time.Hour, 50 * time.Hour, 4 * 24 * time.Hour, 9 * 24 * time.Hour}
	f.Mem.Noted = nil
	for i, title := range memNotes(lang) {
		at := now.Add(-backs[i])
		// The first two are "today" whatever the hour (CI runs past midnight: 00:34 minus 40 minutes is yesterday).
		if midnight := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()); i < 2 && at.Before(midnight) {
			at = midnight.Add(time.Duration(2-i) * time.Second)
		}
		f.Mem.Noted = append(f.Mem.Noted, protocol.Noted{Seq: int64(10 - i), Title: title, At: at.UTC().Format(time.RFC3339), MemoryID: fmt.Sprint("m", i)})
	}
	f.Mem.KeptUnder = "小鸭"
	if lang == i18n.EN {
		f.Mem.KeptUnder = "Duckie"
	}
	space := &protocol.BridgeSpace{ID: "6f1c0d2e-8b4a-4d1e-9c3f-2a7b5e0d9c11", Label: "Only me"}
	switch state {
	case "newer":
		f.Bridge = &protocol.BridgeView{State: "connected", Identity: "ducter", Space: space, Home: "hel", Version: "0.10.118", Newer: ptr("0.10.121"), Upkeep: &protocol.BridgeUpkeep{Kind: "update"}}
	case "on":
		f.Bridge = &protocol.BridgeView{State: "connected", Identity: "ducter", Space: space, Home: "hel", Version: "0.10.121"}
	case "empty":
		f.Mem.Noted = nil
		f.Bridge = &protocol.BridgeView{State: "connected", Identity: "ducter", Space: space, Home: "hel", Version: "0.10.121"}
	case "off":
		f.Settings.Memory = false
		f.Mem.State = "off"
	case "fresh":
		f.Mem.Noted, f.Mem.KeptUnder, f.Mem.State = nil, "", "missing"
		f.Bridge = &protocol.BridgeView{State: "install_mem", Identity: "ducter", Home: "hel", CanRun: true}
	case "sign_in":
		f.Mem.Noted, f.Mem.KeptUnder, f.Mem.State = nil, "", "missing"
		f.Bridge = &protocol.BridgeView{State: "sign_in", Identity: "ducter", Home: "hel", Version: "0.10.121"}
	case "old":
		f.Bridge = &protocol.BridgeView{State: "update_mem", Identity: "ducter", Home: "hel", Version: "0.10.116", CanRun: true}
	}
	if lang == i18n.EN {
		f.Settings.Name = "Duckie"
	}
	app.Receive(f)
	return app, sent
}

// Pictures of Memory and Your other AI agents in each state, zh and en:
//
//	DUCTER_MEM_SHOTS=/path/to/.shots/mem-settings go test ./internal/views -run MemShots
func TestMemShots(t *testing.T) {
	dir := os.Getenv("DUCTER_MEM_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_MEM_SHOTS not set")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, st := range []string{"newer", "on", "empty", "off", "fresh", "sign_in", "old"} {
			for _, tab := range []string{TabMemory, TabPeers, TabPartner} {
				if tab != TabMemory && st != "newer" && !(tab == TabPeers && st == "old") {
					continue
				}
				app, _ := memApp(t, lang, st)
				app.openTab(tab)
				tt := ui.NewTesterWith(app.View, 1280, 1640, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.Frame()
				tt.Frame()
				tt.Frame()
				f, err := os.Create(filepath.Join(dir, fmt.Sprintf("after-mac-%s-%s-%s.png", tab, st, lang)))
				if err != nil {
					t.Fatal(err)
				}
				if err := png.Encode(f, tt.Image()); err != nil {
					t.Fatal(err)
				}
				f.Close()
			}
		}
	}
}
