package views

import (
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

func trayWorking(app *App, n int) {
	var cards []protocol.TaskCard
	for i := range n {
		cards = append(cards, protocol.TaskCard{TaskID: fmt.Sprintf("t%d", i), Title: []string{"修 CI 里那个不稳定的测试", "整理本周的发票"}[i%2],
			Place: protocol.Place{Kind: "none", Device: "dev_mac"}, Harness: "claude-code", Attention: protocol.Working})
	}
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: cards}})
}

func trayDecision(app *App, seq int64, id, q, goLabel string) {
	ev := protocol.NewEvent(seq, "2026-11-17T09:00:00Z", "default", "channel", protocol.OriginPartner, protocol.KindDecision,
		protocol.Decision{DecisionID: id, Question: q, GoLabel: goLabel, DefaultOption: "go", Reversible: true})
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{ev}})
}

// D306: the mark is quiet, at work, or needs you, and never a number; the
// menu opens with On hand's one sentence.
func TestTrayStatesAndSentence(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	v := app.Tray(6)
	if v.State != theme.TrayQuiet || v.Say != app.L.T("onhand.say.none") {
		t.Fatalf("quiet: %+v", v)
	}
	trayWorking(app, 2)
	v = app.Tray(6)
	if v.State != theme.TrayWorking || v.Working != 2 || !strings.Contains(v.Say, "2") {
		t.Fatalf("working: %+v", v)
	}
	before := app.TraySignature()
	trayDecision(app, 1, "d1", "要把 ducter/fix-ci 变基到 main 上吗？", "变基")
	v = app.Tray(6)
	if v.State != theme.TrayNeedsYou || v.Needs != 1 || len(v.Decisions) != 1 {
		t.Fatalf("needs you: %+v", v)
	}
	if !strings.HasPrefix(v.Say, "有") {
		t.Errorf("the sentence should lead with what needs you: %q", v.Say)
	}
	if app.TraySignature() == before {
		t.Errorf("a new decision doesn't change the tray")
	}
	app.Decide("d1", "go", "")
	if app.Tray(6).State != theme.TrayWorking {
		t.Errorf("answered from the menu, the dot should go")
	}
}

// The setting is this Mac's, on by default; turning it off asks main.go to
// take the extra away.
func TestMenuBarSetting(t *testing.T) {
	app, _ := iaApp(t, i18n.EN)
	if !app.MenuBarOn() {
		t.Fatalf("the menu bar extra should show by default")
	}
	var got []bool
	app.ApplyMenuBar = func(on bool) { got = append(got, on) }
	app.SetMenuBar(false)
	app.SetMenuBar(true)
	if len(got) != 2 || got[0] || !got[1] {
		t.Fatalf("applied %v", got)
	}
	for _, k := range []string{"tray.task", "tray.hide", "settings.menubar", "settings.menubar.help"} {
		for _, l := range []i18n.Lang{i18n.ZH, i18n.EN} {
			if s := i18n.New(l).T(k); s == "" || s == k {
				t.Errorf("%s: %s missing", l, k)
			}
		}
	}
}

// TestTrayShots draws the menu bar extra as the person sees it: the mark in
// a menu bar strip and its menu under it, for each state, light and dark,
// zh and en. The menu is NSMenu on a real Mac; this is a faithful mock of
// its contents (todo: a native screenshot, K4).
//
//	DUCTER_TRAY_SHOTS=1 DUCTER_SHOTS_DIR=<repo>/.shots/d306 go test ./internal/views -run TrayShots
func TestTrayShots(t *testing.T) {
	if os.Getenv("DUCTER_TRAY_SHOTS") == "" {
		t.Skip("DUCTER_TRAY_SHOTS not set")
	}
	dir := shotsDir(t)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, state := range []string{"quiet", "working", "needs"} {
			app, _ := iaApp(t, lang)
			q, g := "Rebase ducter/fix-ci onto main?", "Rebase"
			q2, g2 := "Pay the 2026 domain renewal, $12?", "Pay"
			if lang == i18n.ZH {
				q, g = "要把 ducter/fix-ci 变基到 main 上吗？", "变基"
				q2, g2 = "续费 2026 年的域名，12 美元？", "付款"
			}
			switch state {
			case "working":
				trayWorking(app, 2)
			case "needs":
				trayWorking(app, 2)
				trayDecision(app, 1, "d1", q, g)
				trayDecision(app, 2, "d2", q2, g2)
			}
			v := app.Tray(6)
			for _, dark := range []bool{false, true} {
				name := fmt.Sprintf("mac-menubar-%s-%s-%s", state, map[bool]string{false: "light", true: "dark"}[dark], lang)
				tt := ui.NewTesterWith(func(c *ui.Context) { trayMock(c, app, v, dark) }, 420, 360, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.Frame()
				f, err := os.Create(filepath.Join(dir, name+".png"))
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

// trayMock is the menu bar strip with the mark, and the menu's items, as
// macOS draws them (system grey, 13 pt, disabled lines dimmed).
func trayMock(c *ui.Context, app *App, v TrayView, dark bool) {
	th := app.T
	bar, menu, ink, dim, sep := ui.Hex("#E9E6E1"), ui.Hex("#F4F3F1"), ui.Hex("#1D1D1F"), ui.Hex("#86868B"), ui.Hex("#D9D7D3")
	if dark {
		bar, menu, ink, dim, sep = ui.Hex("#2A2826"), ui.Hex("#323030"), ui.Hex("#F5F5F7"), ui.Hex("#8E8E93"), ui.Hex("#48464A")
	}
	png, template := theme.TrayIconFor(v.State, dark)
	if template && dark {
		// macOS tints a template white on a dark bar.
		png = invertTemplate(png)
	}
	src, _ := ui.DecodeImage(png)
	l := app.L
	ui.Column(c.Key("root")).Width(420).Height(360).Background(bar.Mix(menu, 0.4)).Children(func() {
		ui.Row(c.Key("bar")).Height(26).Padding(4).Gap(14).AlignItems(ui.Center).Justify(ui.End).Background(bar).Children(func() {
			ui.Image(c.Key("mark"), src).Width(18).Height(18)
			ui.Text(c, "17:42").FontSize(13).FontWeight(500).TextColor(ink)
		})
		ui.Row(c.Key("drop")).Justify(ui.End).Padding(0).Children(func() {
			ui.Column(c.Key("menu")).Width(330).Margin(4).Padding(5).Radius(8).Background(menu).Shadow(0, 6, 18, 0, ui.RGBA(0, 0, 0, 0.18)).Children(func() {
				item := func(key, label, sub string, disabled, arrow bool) {
					col := ink
					if disabled {
						col = dim
					}
					ui.Row(c.Key(key)).Padding(4).Gap(8).AlignItems(ui.Center).Children(func() {
						ui.Column(c).Grow(1).MinWidth(0).Children(func() {
							ui.Text(c, label).FontSize(13).TextColor(col).LineHeight(1.35)
							if sub != "" {
								ui.Text(c, sub).FontSize(11).TextColor(dim)
							}
						})
						if arrow {
							ui.Text(c, "›").FontSize(14).TextColor(dim)
						}
					})
				}
				line := func(key string) {
					ui.Column(c.Key(key)).Height(1).Margin(4).Background(sep).Children(func() {})
				}
				item("say", v.Say, "", true, false)
				if len(v.Decisions) > 0 {
					line("s0")
				}
				for _, d := range v.Decisions {
					item("d-"+d.ID, d.Question, d.Task, false, true)
				}
				line("s1")
				item("open", l.T("tray.open"), "", false, false)
				item("settings", l.T("menu.settings"), "", false, false)
				item("hide", l.T("tray.hide"), "", false, false)
				line("s2")
				item("quit", map[i18n.Lang]string{i18n.ZH: "退出 Ducter", i18n.EN: "Quit Ducter"}[l.Lang], "", false, false)
				_ = th
			})
		})
	})
}

// invertTemplate turns a black template white, as macOS does on a dark bar.
func invertTemplate(b []byte) []byte {
	img, err := png.Decode(strings.NewReader(string(b)))
	if err != nil {
		return b
	}
	out := imageNRGBA(img)
	for i := 0; i < len(out.Pix); i += 4 {
		out.Pix[i], out.Pix[i+1], out.Pix[i+2] = 255, 255, 255
	}
	var w strings.Builder
	_ = png.Encode(&w, out)
	return []byte(w.String())
}

func imageNRGBA(img image.Image) *image.NRGBA {
	out := image.NewNRGBA(img.Bounds())
	draw.Draw(out, out.Bounds(), img, img.Bounds().Min, draw.Src)
	return out
}
