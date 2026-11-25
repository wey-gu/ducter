package views

import (
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

// D538: 关于这台 / About this computer on a device card. The author's fleet
// on 2026-11-24: hel is the home (a server, 7.6 GB, no swap, 1.0 GB free,
// stopped twice for memory that day) and haswell does tasks for it (64 GB,
// 41 GB free). The person said once that heavy verification goes to
// haswell, and that hel runs no browsers. Evidence, not source (D75):
//
//	DUCTER_ABOUT_SHOTS=$PWD/../../../../.shots/computer-notes go test ./internal/views -run AboutComputer
func aboutWorld() protocol.ServerFrame {
	f := func(v float64) *float64 { return &v }
	return protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{
		{ID: "local", Name: "hel", Kind: "server", Home: true, State: "awake", AlwaysOn: true, Platform: "linux-x64", Version: "0.1.42",
			Harnesses: []protocol.DeviceHarness{sheetHarness("codex", "0.172.0", "npm"), sheetHarness("antigravity", "1.5.16", "installer")},
			Abilities: []protocol.DeviceAbility{{ID: "web", State: "on", Where: "ducter"}},
			Resources: &protocol.DeviceResources{At: "2026-11-24T07:26:00Z", MemTotal: 7.6 * gib, MemFree: 1.0 * gib, Cores: 4, Load: f(4.4), SwapTotal: f(0), DiskFree: f(38 * gib), DiskTotal: f(75 * gib), OOM: []string{"2026-11-24T07:26:01Z", "2026-11-24T07:30:15Z"}}},
		{ID: "dev_haswell", Name: "haswell", Kind: "server", State: "awake", AlwaysOn: true, Platform: "linux-x64", Version: "0.1.42",
			Harnesses: []protocol.DeviceHarness{sheetHarness("codex", "0.172.0", "npm"), sheetHarness("claude-code", "2.1.331", "installer")},
			Abilities: []protocol.DeviceAbility{{ID: "web", State: "on", Where: "ducter"}},
			Resources: &protocol.DeviceResources{At: "2026-11-24T07:26:00Z", MemTotal: 64 * gib, MemFree: 41 * gib, Cores: 16, Load: f(2.1), DiskFree: f(312 * gib), DiskTotal: f(931 * gib)}},
	}}
}

func aboutRules(lang i18n.Lang) []protocol.RuleView {
	prefer, avoid := "haswell 内存大，验证、跑测试的活多放它", "hel 别跑浏览器"
	if lang == i18n.EN {
		prefer, avoid = "haswell has lots of memory, put verification and test runs there", "No browsers on hel"
	}
	return []protocol.RuleView{
		{ID: "rule_a1", Text: prefer, Device: "haswell", Where: &protocol.PlaceRule{Heavy: true, Mem: "ducter-placement-rule_a1"}, CreatedAt: "2026-11-24T08:00:00Z"},
		{ID: "rule_b2", Text: avoid, Device: "hel", Where: &protocol.PlaceRule{Avoid: true, Web: true}, CreatedAt: "2026-11-24T08:01:00Z"},
	}
}

func aboutApp(t *testing.T, lang i18n.Lang, sel string) *App {
	app, _ := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	app.URL = "wss://hel.example/ws"
	app.Receive(aboutWorld())
	app.Receive(protocol.ServerFrame{T: "settings", Settings: &protocol.Settings{Name: "Ducter", Language: "auto"}})
	app.Receive(protocol.ServerFrame{T: "rules", Rules: aboutRules(lang)})
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{}}})
	app.OpenDevices()
	app.devState().sel = sel
	app.devState().card.sheet.fold = aboutFoldK + sel
	return app
}

func TestAboutComputer(t *testing.T) {
	dir := os.Getenv("DUCTER_ABOUT_SHOTS")
	if dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		for _, dark := range []bool{false, true} {
			paper := "light"
			if dark {
				paper = "dark"
			}
			for _, w := range []int{1150, 1400} {
				for _, st := range []string{"haswell", "hel", "edit"} {
					sel := "dev_haswell"
					if st == "hel" {
						sel = "local"
					}
					app := aboutApp(t, lang, sel)
					if st == "edit" {
						app.about = aboutState{device: "dev_haswell", editing: "rule_a1", work: "heavy", asked: true}
					}
					tt := ui.NewTesterWith(app.View, w, 1100, ui.TesterOptions{})
					tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
					tt.SetDark(dark)
					tt.Frame()
					tt.Frame()
					tt.Advance(600 * time.Millisecond)
					tt.Frame()
					want := map[string][]string{
						"haswell": {L.T("about.title"), L.T("about.mem", "64 GB", "41 GB"), L.T("about.heavy", 8), L.T("about.cores.calm", 16), L.T("about.disk", "312 GB"), aboutRules(lang)[0].Text, L.T("about.rule.more", L.T("about.rule.w.heavy")), L.T("about.inmem"), L.T("about.add")},
						"hel":     {L.T("about.mem", "7.6 GB", "1.0 GB"), L.T("about.heavy.none"), L.T("about.cores.busy", 4), L.T("about.oom", 2), L.T("about.on"), aboutRules(lang)[1].Text, L.T("about.rule.less", L.T("about.rule.w.web"))},
						"edit":    {L.T("about.more"), L.T("about.less"), L.T("about.w.heavy"), L.T("about.w.web"), L.T("about.w.all"), L.T("about.keep"), L.T("about.cancel")},
					}[st]
					for _, s := range want {
						if !hasText(tt, s) {
							t.Fatalf("%s %s %d %s: missing %q in %q", lang, paper, w, st, s, tt.Texts())
						}
					}
					if dir == "" {
						continue
					}
					out, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%d-%s-%s-%s.png", w, lang, paper, st)))
					if err != nil {
						t.Fatal(err)
					}
					if err := png.Encode(out, tt.Image()); err != nil {
						t.Fatal(err)
					}
					out.Close()
				}
			}
		}
	}
	// 记下 sends the rule as changed; 移除 removes it.
	app := aboutApp(t, i18n.ZH, "dev_haswell")
	app.about = aboutState{device: "dev_haswell", editing: "rule_a1", work: "heavy", asked: true}
	tt := ui.NewTesterWith(app.View, 1150, 1100, ui.TesterOptions{})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	L := i18n.New(i18n.ZH)
	if err := tt.Click(L.T("about.less")); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if err := tt.Click(L.T("about.keep")); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if app.about.editing != "" {
		t.Fatalf("still editing after 记下: %+v", app.about)
	}
}
