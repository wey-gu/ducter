package views

import (
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

// The devices pass: the author's own set (a home on Hetzner Server, a
// MacBook and haswell doing tasks for it, an iPhone, an iPad and a Pixel
// Fold lent to tasks), every window width the Mac app takes.

var passNow = time.Date(2026, 11, 19, 10, 0, 0, 0, time.UTC)

func passAgents(names ...string) []protocol.DeviceHarness {
	var out []protocol.DeviceHarness
	for _, n := range names {
		out = append(out, protocol.DeviceHarness{Harness: n, Installed: true, LoggedIn: true})
	}
	return out
}

func passFrame() protocol.ServerFrame {
	sealed := &protocol.DeviceVia{Kind: "domain", Sealed: true}
	return protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{
		{ID: "local", Name: "Hetzner Server", Kind: "server", Home: true, State: protocol.DeviceAwake, AlwaysOn: true, Platform: "linux-x64",
			Harnesses: passAgents("codex", "claude-code"),
			Abilities: []protocol.DeviceAbility{
				{ID: "web", State: "on", Where: "ducter"}, {ID: "remote", State: "on"}, {ID: "call", State: "off"},
				{ID: "computer", State: "later"}, {ID: "phone", State: "later"},
			}},
		{ID: "mac", Name: "Wey's MacBook Pro", Kind: "laptop", State: protocol.DeviceAwake, Platform: "darwin-arm64", Via: sealed,
			Harnesses: passAgents("claude-code", "codex", "pi", "deepseek-harness"),
			Abilities: []protocol.DeviceAbility{{ID: "web", State: "on", Where: "chrome"}, {ID: "computer", State: "on"}, {ID: "phone", State: "off"}}},
		{ID: "haswell", Name: "haswell", Kind: "server", State: protocol.DeviceAwake, AlwaysOn: true, Platform: "linux-x64", Via: sealed,
			Harnesses: passAgents("claude-code", "codex"),
			Abilities: []protocol.DeviceAbility{{ID: "web", State: "on", Where: "ducter"}}},
	}, Reach: &protocol.Reach{
		Ways: []protocol.ReachWay{{Kind: "domain", URL: "https://ducter.example.dev", Primary: true, State: "up"}},
		Clients: []protocol.ReachClient{
			{ID: "iph", Name: "iPhone", Platform: "ios-app", Connected: true, Via: sealed},
			{ID: "ipad", Name: "iPad", Platform: "ios-app", Shape: "tablet", LastSeen: passNow.Add(-2 * time.Hour).Format(time.RFC3339)},
			{ID: "pix", Name: "Pixel Fold", Platform: "android-app", Shape: "foldable", Connected: true, Via: sealed,
				Handset: &protocol.HandsetView{Added: true, Able: true, Linked: true}},
		}}}
}

func passApp(t *testing.T, lang i18n.Lang, w, h float32, dark bool) (*App, *ui.Tester) {
	t.Helper()
	app, _ := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	app.URL = "wss://ducter.example.dev/ws"
	app.Now = func() time.Time { return passNow }
	app.Receive(passFrame())
	app.Receive(protocol.ServerFrame{T: "connections", Connections: []protocol.ConnectionView{
		{ID: "c1", Name: "GitHub", Source: "github", State: "ok"},
		{ID: "c2", Name: "Gmail", Source: "gmail", State: "ok"},
	}})
	app.Route = RouteDevices
	tt := ui.NewTesterWith(app.View, int(w), int(h), ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.SetDark(dark)
	tt.Frame()
	return app, tt
}

// DUCTER_SHOTS=1 DUCTER_SHOTS_PHASE=before DUCTER_SHOTS_DIR=$PWD/../../../../.shots/devices-pass go test ./internal/views -run DevicesPassShots
func TestDevicesPassShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	phase := os.Getenv("DUCTER_SHOTS_PHASE")
	if phase == "" {
		phase = "after"
	}
	dir := shotsDir(t)
	type pick struct {
		name      string
		sel, cl   string
		widthOnly float32
	}
	picks := []pick{
		{"home", "local", "", 0}, {"macbook", "mac", "", 0}, {"haswell", "haswell", "", 1400},
		{"iphone", "", "iph", 1400}, {"ipad", "", "ipad", 1400}, {"pixel", "", "pix", 0},
	}
	sizes := []struct{ w, h float32 }{{1000, 1400}, {1400, 1100}, {1700, 1100}}
	for _, dark := range []bool{false, true} {
		mode := "light"
		if dark {
			mode = "dark"
		}
		for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
			for _, sz := range sizes {
				if dark && sz.w != 1400 {
					continue
				}
				app, tt := passApp(t, lang, sz.w, sz.h, dark)
				for _, p := range picks {
					if p.widthOnly != 0 && p.widthOnly != sz.w {
						continue
					}
					app.devState().sel, app.devState().selClient = p.sel, p.cl
					lendFrame(tt)
					lendFrame(tt)
					name := phase + "-" + p.name + "-" + itoa(int64(sz.w)) + "-" + string(lang) + "-" + mode + ".png"
					f, err := os.Create(filepath.Join(dir, name))
					if err != nil {
						t.Fatal(err)
					}
					if err := png.Encode(f, tt.Image()); err != nil {
						t.Fatal(err)
					}
					f.Close()
				}
				// The phone's other moments (after only: they didn't exist before).
				if phase != "after" || sz.w != 1400 {
					continue
				}
				pix := func() *protocol.ReachClient { return &app.S.Reach.Clients[2] }
				sheet := &app.devState().card.sheet
				moments := []struct {
					name string
					set  func()
				}{
					{"pixel-lock", func() { sheet.lockSteps = "pix" }},
					{"pixel-fold", func() { sheet.lockSteps, sheet.fold = "", "cl:pix" }},
					{"pixel-off-ask", func() { sheet.fold, sheet.handOff = "", "pix" }},
					{"pixel-lent", func() {
						sheet.handOff = ""
						title := "用手机 Chrome 查看今天上海天气"
						if lang == i18n.EN {
							title = "Check today's Shanghai weather in Chrome on my phone"
						}
						pix().Handset.Using = &protocol.HandsetUsing{TaskID: "t_wx", Title: title}
					}},
					{"pixel-paused", func() { pix().Handset.Using.Paused = "locked" }},
					{"pixel-away", func() { pix().Handset.Using, pix().Handset.Linked = nil, false }},
					{"pixel-notadded", func() { pix().Handset.Linked, pix().Handset.Added = true, false; sheet.info = "cl:pix|handset" }},
				}
				app.devState().sel, app.devState().selClient = "", "pix"
				for _, m := range moments {
					m.set()
					lendFrame(tt)
					lendFrame(tt)
					f, err := os.Create(filepath.Join(dir, phase+"-"+m.name+"-1400-"+string(lang)+"-"+mode+".png"))
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
}
