package views

// D518: signing an agent in on a server home from the Mac app (hel,
// 2026-11-24): the tray's tiles hold their names with room on both sides,
// the sign-in is two steps and a live line, and 登录好了 is said only once
// the agent itself says signed in, with the row and its tile ready at once.

import (
	"image"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

var helNow = time.Date(2026, 11, 24, 6, 41, 0, 0, time.UTC)

// helW is the window's width the card is drawn at (the shots draw 1000 and 1400).
var helW = 1400

// helH is the window's height: at 1000 the card sits under the stage, so the window is taller to show it.
func helH() int {
	if helW < 1200 {
		return 1700
	}
	return 900
}

// helHome is the author's server home as the Mac app showed it: Claude Code
// installed by Ducter, Codex and Antigravity signed in.
func helHome(claude protocol.DeviceHarness) protocol.DeviceView {
	claude.Harness, claude.Installed, claude.Version, claude.How = "claude-code", true, "2.1.331", "ducter"
	return protocol.DeviceView{ID: "local", Name: "Hetzner Server", Kind: "server", Home: true, State: protocol.DeviceAwake, Platform: "linux-x64", Harnesses: []protocol.DeviceHarness{
		claude,
		{Harness: "codex", Installed: true, LoggedIn: true, Version: "0.172.0", How: "installer", CanBePartner: true},
		{Harness: "antigravity", Installed: true, LoggedIn: true, Version: "1.5.16", How: "installer"},
		{Harness: "pi", Installable: true},
	}}
}

const claudeURL = "https://claude.com/cai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=user%3Ainference&state=q2"

func helApp(t *testing.T, lang i18n.Lang, dark bool, claude protocol.DeviceHarness) (*App, *ui.Tester, *[]any) {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.Now = func() time.Time { return helNow }
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{helHome(claude)}})
	app.Route = RouteDevices
	tt := ui.NewTesterWith(app.View, helW, helH(), ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.SetDark(dark)
	app.devState().sel = "local"
	app.devState().card.sheet.coin = coinKey("local", "claude-code")
	tt.Frame()
	tt.Frame()
	return app, tt, sent
}

// The tile fix: every name in the tray, in both languages, sits inside its
// tile with at least coinTilePadX on each side, the selected one too.
func TestCoinTileHoldsItsName(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, tt, _ := helApp(t, lang, false, protocol.DeviceHarness{})
		var widths map[string]float32
		mt := ui.NewTester(func(c *ui.Context) {
			widths = map[string]float32{}
			for _, h := range []string{"claude-code", "codex", "antigravity"} {
				w, _ := c.MeasureText(0, ui.Span{Text: harnessName(h), Size: app.T.XS, Weight: 700})
				widths[harnessName(h)] = w
			}
			w, _ := c.MeasureText(0, ui.Span{Text: app.L.T("coin.socket"), Size: app.T.XS, Weight: 600})
			widths[app.L.T("coin.socket")] = w
		}, 200, 100)
		mt.Frame()
		found := 0
		for _, ai := range tt.AccessAll() {
			if ai.Role != ui.RoleButton {
				continue
			}
			for name, w := range widths {
				if ai.Name != name && !strings.HasPrefix(ai.Name, name+app.L.T("spoken.sep")) && !strings.HasPrefix(ai.Name, name+"，") && !strings.HasPrefix(ai.Name, name+", ") {
					continue
				}
				if ai.Bounds.W < coinTileW-1 || ai.Bounds.W > coinTileMaxW+1 {
					continue // not a tray tile
				}
				found++
				if w > coinTileMaxW-2*coinTilePadX {
					continue // a name that long takes two lines inside the tile (D398)
				}
				if room := (ai.Bounds.W - w) / 2; room < coinTilePadX-3 {
					t.Errorf("%s %q: %.1f of room each side in a %.1f tile, want ≥ %d", lang, name, room, ai.Bounds.W, coinTilePadX)
				}
				// The name as drawn: inside the tile, never touching either edge.
				if r, ok := tt.Find(name); ok && r.W < ai.Bounds.W && r.Y >= ai.Bounds.Y && r.Y < ai.Bounds.Y+ai.Bounds.H {
					if l, rr := r.X-ai.Bounds.X, ai.Bounds.X+ai.Bounds.W-(r.X+r.W); l < coinTilePadX-1 || rr < coinTilePadX-1 {
						t.Errorf("%s %q drawn %.1f from the left edge and %.1f from the right of its tile, want ≥ %d", lang, name, l, rr, coinTilePadX)
					}
				}
			}
		}
		if found < 4 {
			t.Fatalf("%s: found %d tray tiles, want 4 (Claude Code, Codex, Antigravity, the socket)", lang, found)
		}
	}
	// Claude Code at the old fixed width had no room at all.
	if coinTileFor(70) != 70+2*coinTilePadX || coinTileFor(20) != coinTileW || coinTileFor(200) != coinTileMaxW {
		t.Fatalf("coinTileFor: %v %v %v", coinTileFor(70), coinTileFor(20), coinTileFor(200))
	}
	if x := notchX([]float32{100, 76, 80}, 0); x != -(100+76+80+2*coinTileGap)/2+50 {
		t.Fatalf("notchX: %v", x)
	}
}

// The flow as the person sees it on the Mac: two steps, a live line, 确认登录
// sends the code, each ending in its own words, and done is ready at once.
func TestServerSignInFlow(t *testing.T) {
	until := helNow.Add(15 * time.Minute).UnixMilli()
	app, tt, sent := helApp(t, i18n.ZH, false, protocol.DeviceHarness{Login: &protocol.AgentLoginState{State: "waiting", URL: claudeURL, Paste: true, Until: until}})
	for _, s := range []string{"打开链接，用 Claude 账号登录：", "把页面给你的码粘贴到这里：", "等你在页面上登录…", "还剩 15 分钟", "确认登录", "打开链接", "不登录了", "正在登录"} {
		if !tt.HasText(s) {
			t.Errorf("waiting: no %q", s)
		}
	}
	if tt.HasText("登录好了") {
		t.Fatal("waiting says 登录好了")
	}
	app.ag.code = map[string]string{coinKey("local", "claude-code"): "  abc#def  "}
	tt.Frame()
	if err := tt.Click(spoken(app.L, "确认登录", "Claude Code")); err != nil {
		t.Fatal(err)
	}
	var code string
	for _, r := range setupSent(*sent) {
		if r.Action == "code" {
			code = r.Code
		}
	}
	if !strings.Contains(code, "abc#def") {
		t.Fatalf("确认登录 sent %q", code)
	}
	clock := helNow
	app.Now = func() time.Time { return clock }
	set := func(l *protocol.AgentLoginState, loggedIn bool) {
		app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{helHome(protocol.DeviceHarness{LoggedIn: loggedIn, Login: l})}})
		tt.Frame()
		clock = clock.Add(2 * time.Second) // past the alive line's dwell, so its new words show
		tt.Advance(2 * time.Second)
		tt.Frame()
		tt.Frame()
	}
	set(&protocol.AgentLoginState{State: "checking", URL: claudeURL, Paste: true, Until: until}, false)
	if !tt.HasText("正在和 Claude Code 确认…") {
		t.Error("checking: no live line")
	}
	set(&protocol.AgentLoginState{State: "waiting", URL: claudeURL, Paste: true, Until: until, Reason: "wrong_code"}, false)
	if !tt.HasText("那个码不对，或者过期了。") {
		t.Error("wrong code: not said")
	}
	for reason, want := range map[string]string{"not_seen": "Claude Code 说登录完了，但它自己查还是未登录。", "no_answer": "粘贴的码一分半钟没有回应，停了。"} {
		set(&protocol.AgentLoginState{State: "failed", Reason: reason}, false)
		if !tt.HasText(want) || !tt.HasText("再试一次") {
			t.Errorf("%s: not said with 再试一次", reason)
		}
	}
	set(&protocol.AgentLoginState{State: "expired"}, false)
	if !tt.HasText("登录等太久，停了。") || !tt.HasText("再试一次") {
		t.Error("expired: not said with 再试一次")
	}
	// Done: the agent's own check said signed in. The tile reads signed in at once.
	set(&protocol.AgentLoginState{State: "done"}, true)
	for _, ai := range tt.AccessAll() {
		if ai.Role == ui.RoleButton && strings.HasPrefix(ai.Name, "Claude Code") && strings.Contains(ai.Name, "未登录") {
			t.Fatalf("done: the tile still says 未登录 (%q)", ai.Name)
		}
	}
	if tt.HasText("未登录") {
		t.Error("done: 未登录 still shows")
	}
}

// DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../.shots/signin-server go test ./internal/views -run SignInServerShots
func TestSignInServerShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	dir := shotsDir(t)
	until := helNow.Add(15 * time.Minute).UnixMilli()
	states := []struct {
		name     string
		l        *protocol.AgentLoginState
		loggedIn bool
		closed   bool
	}{
		{"00-tiles", nil, false, true},
		{"01-signin", nil, false, false},
		{"02-starting", &protocol.AgentLoginState{State: "starting", Until: until}, false, false},
		{"03-waiting", &protocol.AgentLoginState{State: "waiting", URL: claudeURL, Paste: true, Until: until}, false, false},
		{"04-checking", &protocol.AgentLoginState{State: "checking", URL: claudeURL, Paste: true, Until: until}, false, false},
		{"05-wrong-code", &protocol.AgentLoginState{State: "waiting", URL: claudeURL, Paste: true, Until: until, Reason: "wrong_code"}, false, false},
		{"06-not-seen", &protocol.AgentLoginState{State: "failed", Reason: "not_seen"}, false, false},
		{"07-no-answer", &protocol.AgentLoginState{State: "failed", Reason: "no_answer"}, false, false},
		{"08-expired", &protocol.AgentLoginState{State: "expired"}, false, false},
		{"09-done", &protocol.AgentLoginState{State: "done"}, true, false},
	}
	defer func() { helW = 1400 }()
	for _, w := range []int{1000, 1400} {
		helW = w
		for _, dark := range []bool{false, true} {
			mode := "light"
			if dark {
				mode = "dark"
			}
			for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
				for _, s := range states {
					app, tt, _ := helApp(t, lang, dark, protocol.DeviceHarness{LoggedIn: s.loggedIn, Login: s.l})
					if s.closed {
						app.devState().card.sheet.coin = ""
					}
					tt.Frame()
					app.Now = func() time.Time { return helNow.Add(2 * time.Second) } // the alive line's words in
					tt.Advance(2 * time.Second)
					tt.Frame()
					tt.Frame()
					img := tt.Image()
					name := filepath.Join(dir, "mac-"+strconv.Itoa(w)+"-"+string(lang)+"-"+mode+"-"+s.name)
					writePNG(t, name+".png", img)
					// 2x crops of the tray's edges: each tile, its name and its neighbours.
					if s.name == "00-tiles" || s.name == "03-waiting" {
						for _, ai := range tt.AccessAll() {
							if ai.Role == ui.RoleButton && strings.HasPrefix(ai.Name, "Claude Code") && ai.Bounds.W >= coinTileW-1 && ai.Bounds.W < coinTileMaxW+1 {
								b := ai.Bounds
								sx, sy := float32(img.Bounds().Dx())/float32(w), float32(img.Bounds().Dy())/float32(helH())
								rect := image.Rect(int((b.X-12)*sx), int((b.Y-12)*sy), int((b.X+3*b.W+24)*sx), int((b.Y+b.H+12)*sy))
								if sub := img.SubImage(rect); !sub.Bounds().Empty() {
									writePNG(t, name+"-tray-crop.png", scale2(sub))
								} else {
									t.Logf("no crop: %v of %v, tile %+v", rect, img.Bounds(), b)
								}
								break
							}
						}
					}
				}
			}
		}
	}
}

// scale2 is img at twice its size, each pixel a 2×2 block (a crop to look at edges by).
func scale2(img image.Image) image.Image {
	b := img.Bounds()
	out := image.NewRGBA(image.Rect(0, 0, b.Dx()*2, b.Dy()*2))
	for y := 0; y < b.Dy()*2; y++ {
		for x := 0; x < b.Dx()*2; x++ {
			out.Set(x, y, img.At(b.Min.X+x/2, b.Min.Y+y/2))
		}
	}
	return out
}
