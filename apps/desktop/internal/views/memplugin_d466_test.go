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

// D466: a newer Nowledge Mem plugin out (Mem's own `plugins check`), said
// from one version to the other, and several copies said by their versions;
// each with its one tap asked in place (更新, 理成一份), in the coin detail
// and as rows in Settings › 记忆's Nowledge Mem group.
//
//	DUCTER_SHOTS_DIR=$PWD/../../.shots/d466 go test ./internal/views -run D466

func TestMemPluginWordsD466(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := iaApp(t, lang)
		L := app.L
		line, act, _ := app.memPluginWords(&protocol.MemPluginView{State: "update", Version: "0.7.34", Available: "0.7.37"}, "claude-code")
		if line != L.T("memp.update.to", "0.7.34", "0.7.37") || act != L.T("memp.btn.update") {
			t.Fatalf("%s update: %q %q", lang, line, act)
		}
		line, act, _ = app.memPluginWords(&protocol.MemPluginView{State: "review", Why: "multiple", Versions: []string{"0.1.10", "0.1.53"}}, "codex")
		if line != L.T("memp.review.two", "0.1.10", "0.1.53") || act != L.T("memp.btn.tidy") {
			t.Fatalf("%s two: %q %q", lang, line, act)
		}
		if line, _, _ = app.memPluginWords(&protocol.MemPluginView{State: "update", TaskID: "t1"}, "codex"); line != L.T("memp.setting.update") {
			t.Fatalf("%s updating: %q", lang, line)
		}
		ask, means, ok := app.memAskWords(&protocol.MemPluginView{State: "update", Available: "0.7.37"}, "Claude Code", "hel", false)
		if ask != L.T("memp.ask.update", "Claude Code", "hel", "0.7.37") || means != L.T("memp.means.update", "Claude Code", "hel") || ok != L.T("memp.ok.update") {
			t.Fatalf("%s ask: %q %q %q", lang, ask, means, ok)
		}
		if _, _, ok = app.memAskWords(&protocol.MemPluginView{State: "review", Why: "multiple"}, "Codex", "hel", false); ok != L.T("memp.ok.tidy") {
			t.Fatalf("%s tidy: %q", lang, ok)
		}
	}
	if zh := i18n.New(i18n.ZH); zh.T("memp.update.to", "0.7.34", "0.7.37") != "Nowledge Mem 0.7.34，可更新到 0.7.37" {
		t.Fatalf("zh: %q", zh.T("memp.update.to", "0.7.34", "0.7.37"))
	}
}

func TestMemPluginRowsForD466(t *testing.T) {
	devs := []protocol.DeviceView{
		{ID: "mini", Name: "Mac mini", Harnesses: []protocol.DeviceHarness{{Harness: "claude-code", Installed: true, Mem: &protocol.MemPluginView{State: "update", Version: "0.7.30", Available: "0.7.37"}}}},
		{ID: "local", Name: "hel", Home: true, Harnesses: []protocol.DeviceHarness{
			{Harness: "claude-code", Installed: true, Mem: &protocol.MemPluginView{State: "installed", Version: "0.7.37"}},
			{Harness: "codex", Installed: true, Mem: &protocol.MemPluginView{State: "review", Why: "multiple", Versions: []string{"0.1.10", "0.1.53"}}},
			{Harness: "pi", Installed: true, Mem: &protocol.MemPluginView{State: "absent"}},
			{Harness: "deepseek-harness", Installed: true, Mem: &protocol.MemPluginView{State: "review", Why: "unclear"}},
			{Harness: "opencode", Mem: &protocol.MemPluginView{State: "update"}},
		}},
	}
	var got []string
	for _, r := range memPluginRowsFor(devs) {
		got = append(got, r.dv.ID+":"+r.h.Harness)
	}
	if fmt.Sprint(got) != "[local:codex mini:claude-code]" {
		t.Fatalf("rows: %v", got)
	}
}

// d466Home is the author's home today: Claude Code a version behind (made
// up for the row: his is at the newest), Codex in twice (as his is).
func d466Home() []protocol.DeviceHarness {
	return []protocol.DeviceHarness{
		{Harness: "claude-code", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "update", Version: "0.7.34", Available: "0.7.37"}},
		{Harness: "codex", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "review", Why: "multiple", Versions: []string{"0.1.10", "0.1.53"}}},
		{Harness: "pi", Installed: true, LoggedIn: true, Mem: &protocol.MemPluginView{State: "installed", Version: "0.8.14"}},
	}
}

func TestMemPluginPaneD466(t *testing.T) {
	dir := os.Getenv("DUCTER_SHOTS_DIR")
	if dir != "" {
		_ = os.MkdirAll(dir, 0o755)
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		app, sent := memApp(t, lang, "on")
		app.S.Mem.Health = &protocol.MemHealth{}
		app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{{ID: "local", Name: "hel", Kind: "laptop", Home: true, State: protocol.DeviceAwake, Harnesses: d466Home()}}})
		app.openTab(TabMemory)
		tt := ui.NewTesterWith(app.View, 1280, 2600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		frames := func() {
			for i := 0; i < 6; i++ {
				tt.Advance(150 * time.Millisecond)
				tt.Frame()
			}
		}
		shot := func(name string) {
			if dir == "" {
				return
			}
			f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-pane-%s-light-%s.png", name, lang)))
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			if err := png.Encode(f, tt.Image()); err != nil {
				t.Fatal(err)
			}
		}
		frames()
		where := app.deviceNameIn(app.S.Device("local"))
		for _, s := range []string{
			L.T("memp.row", "Claude Code", where), L.T("memp.update.to", "0.7.34", "0.7.37"),
			L.T("memp.row", "Codex", where), L.T("memp.review.two", "0.1.10", "0.1.53"),
		} {
			if _, ok := tt.Find(s); !ok {
				t.Fatalf("%s: no %q in %q", lang, s, tt.Texts())
			}
		}
		// pi at its newest has no row.
		if _, ok := tt.Find(L.T("memp.row", "pi", where)); ok {
			t.Fatalf("%s: a row for pi", lang)
		}
		shot("rows")
		// 更新 asks in place first, naming where it goes; only then is anything sent.
		if err := tt.Click(spoken(L, L.T("memp.btn.update"), spoken(L, "Claude Code", where, "Nowledge Mem"))); err != nil {
			t.Fatalf("%s: %v in %q", lang, err, tt.Texts())
		}
		frames()
		if _, ok := tt.Find(L.T("memp.ask.update", "Claude Code", where, "0.7.37")); !ok {
			t.Fatalf("%s: no ask in %q", lang, tt.Texts())
		}
		for _, f := range *sent {
			if _, ok := f.(protocol.MemPluginInstall); ok {
				t.Fatalf("%s: sent before the ask was answered", lang)
			}
		}
		shot("ask-update")
		if err := tt.Click(spoken(L, L.T("memp.ok.update"), spoken(L, "Claude Code", "Nowledge Mem"))); err != nil {
			t.Fatalf("%s: %v", lang, err)
		}
		frames()
		found := false
		for _, f := range *sent {
			if m, ok := f.(protocol.MemPluginInstall); ok && m.Device == "local" && m.Harness == "claude-code" {
				found = true
			}
		}
		if !found {
			t.Fatalf("%s: 更新 sent nothing", lang)
		}
		// 理成一份 asks in place too.
		if err := tt.Click(spoken(L, L.T("memp.btn.tidy"), spoken(L, "Codex", where, "Nowledge Mem"))); err != nil {
			t.Fatalf("%s: %v", lang, err)
		}
		frames()
		if _, ok := tt.Find(L.T("memp.ask.tidy", "Codex", where)); !ok {
			t.Fatalf("%s: no tidy ask in %q", lang, tt.Texts())
		}
		shot("ask-tidy")
	}
}

func TestMemPluginCoinD466(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		t.Run(string(lang), func(t *testing.T) {
			h := openDevices(t, lang, false)
			L := h.app.L
			h.hub.SetDevices(func(list []protocol.DeviceView, _ *protocol.Reach) []protocol.DeviceView {
				home := list[0]
				home.Name, home.Kind, home.Platform, home.Version = "hel", "server", "linux-x64", "0.0.7"
				home.Harnesses = d466Home()
				for i := range home.Harnesses {
					home.Harnesses[i].Version, home.Harnesses[i].How, home.Harnesses[i].Standing = "2.1.321", "installer", "verified"
				}
				return []protocol.DeviceView{home}
			})
			h.until("world", func() bool {
				d := h.app.S.Device("local")
				return d != nil && len(d.Harnesses) == 3 && d.Harnesses[0].Mem != nil
			})
			d := h.app.devState()
			d.sel = "local"
			d.card.sheet.coin = coinKey("local", "claude-code")
			h.settle(300 * time.Millisecond)
			if !hasText(h.tt, L.T("memp.update.to", "0.7.34", "0.7.37")) {
				t.Fatalf("claude coin: %q", h.tt.Texts())
			}
			h.shotAs(fmt.Sprintf("d466-mac-coin-update-light-%s", lang))
			h.click(spoken(L, L.T("memp.btn.update"), spoken(L, "Claude Code", "Nowledge Mem")))
			h.until("ask", func() bool { return hasText(h.tt, L.T("memp.means.update", "Claude Code", "hel")) })
			h.shotAs(fmt.Sprintf("d466-mac-coin-ask-light-%s", lang))
			d.card.sheet.coin = coinKey("local", "codex")
			h.settle(300 * time.Millisecond)
			if !hasText(h.tt, L.T("memp.review.two", "0.1.10", "0.1.53")) {
				t.Fatalf("codex coin: %q", h.tt.Texts())
			}
			h.shotAs(fmt.Sprintf("d466-mac-coin-two-light-%s", lang))
		})
	}
}
