package views

import (
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

// D347: 加一台做事的电脑 / Add a computer for tasks on the Mac: the entries, the
// question, the line, the wait, and the computer once it is here.

var lendNow = time.Date(2026, 11, 18, 9, 0, 0, 0, time.UTC)

const lendLineText = "curl -fsSL https://ducter.ai/install.sh | sh -s -- worker https://hel.example.com --code K7QM-4XPA"

func lendHome() protocol.DeviceView {
	return protocol.DeviceView{ID: "local", Name: "hel", Kind: "server", Home: true, State: protocol.DeviceAwake, Platform: "linux-x64"}
}

func lendNas(agents ...string) protocol.DeviceView {
	d := protocol.DeviceView{ID: "a1b2c3d4e5", Name: "nas", Kind: "server", State: protocol.DeviceAwake, Platform: "linux-arm64"}
	for _, h := range []string{"claude-code", "codex"} {
		in := false
		for _, x := range agents {
			in = in || x == h
		}
		d.Harnesses = append(d.Harnesses, protocol.DeviceHarness{Harness: h, Installed: true, LoggedIn: in})
	}
	return d
}

func lendWaitingFrame(sameNet bool) protocol.ServerFrame {
	addr := "https://hel.example.com"
	line := lendLineText
	if sameNet {
		addr = "http://192.168.1.20:7777"
		line = strings.Replace(line, "https://hel.example.com", addr, 1)
	}
	return protocol.ServerFrame{T: "lend", Code: "K7QM-4XPA", ExpiresAt: lendNow.Add(10 * time.Minute).Format(time.RFC3339), State: "waiting",
		Address: addr, SameNetwork: sameNet, LendLine: line, Check: "curl -sS -m 10 " + addr + "/health"}
}

func lendApp(t *testing.T, lang i18n.Lang, w, h int, devices ...protocol.DeviceView) (*App, *ui.Tester, *[]any) {
	return lendAt(t, lang, w, h, func(app *App) { app.Route = RouteDevices }, devices...)
}

// lendAt is lendApp on another page, set before the first frame (the clock
// is held still, so a page change after it would never finish moving).
func lendAt(t *testing.T, lang i18n.Lang, w, h int, at func(*App), devices ...protocol.DeviceView) (*App, *ui.Tester, *[]any) {
	app, sent := iaApp(t, lang)
	app.Now = func() time.Time { return lendNow }
	app.Receive(protocol.ServerFrame{T: "devices", Devices: append([]protocol.DeviceView{lendHome()}, devices...)})
	at(app)
	tt := ui.NewTesterWith(app.View, w, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	return app, tt, sent
}

func lendFrame(tt *ui.Tester) {
	tt.Advance(time.Second)
	tt.Frame()
}

func TestLendEntriesAndCopy(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		_, tt, _ := lendApp(t, lang, 1440, 900)
		// D358: one way in, a row in the list's shape; no pill for each flow.
		for _, k := range []string{"add.row", "add.row.sub"} {
			if !hasText(tt, L.T(k)) {
				t.Errorf("%s: devices has no %s (%q): %q", lang, k, L.T(k), tt.Texts())
			}
		}
		for _, k := range []string{"devices.connect", "lend.entry.why"} {
			if hasText(tt, L.T(k)) {
				t.Errorf("%s: devices still shows %s", lang, k)
			}
		}
		if hasText(tt, "+ "+L.T("lend.entry")) {
			t.Errorf("%s: the old + %s pill is back", lang, L.T("lend.entry"))
		}
	}
	// Every lend key is in both languages, and no text is joined with " · " (D291).
	zh, en := i18n.New(i18n.ZH), i18n.New(i18n.EN)
	for _, k := range []string{"add.row", "add.row.sub", "add.title", "add.question", "add.talk", "add.talk.sub", "add.work", "add.work.sub",
		"lend.kind.linux.sub", "lend.kind.mac.sub", "lend.step.copy", "lend.step.paste.linux", "lend.step.paste.mac", "lend.step.joins", "lend.loading",
		"lend.entry", "lend.entry.why", "lend.question", "lend.kind.mac", "lend.kind.linux", "lend.mac.app", "lend.linux.paste",
		"lend.does", "lend.left", "lend.samenet", "lend.agent", "lend.agent.ask", "lend.waiting", "lend.joined", "lend.here", "lend.agents.none",
		"lend.noaddress", "lend.expired", "lend.newcode", "lend.help", "lend.help.reach.do", "lend.help.curl.do", "lend.help.arch.do", "lend.card.go", "lend.fail.timeout", "lend.fail.error", "lend.retry"} {
		for _, L := range []*i18n.Strings{zh, en} {
			s := L.T(k)
			if s == "" || s == k || strings.Contains(s, " · ") {
				t.Errorf("%s: %q", k, s)
			}
		}
	}
}

func TestLendFlow(t *testing.T) {
	app, tt, sent := lendApp(t, i18n.ZH, 1440, 900)
	// D358: 加一台设备 asks what it's for, then the lend flow.
	if err := tt.Click("加一台设备"); err != nil {
		t.Fatal(err)
	}
	lendFrame(tt)
	if !hasText(tt, "用来做什么？") || !hasText(tt, "用它和 Ducter 说话") {
		t.Fatalf("no what-for question: %q", tt.Texts())
	}
	if err := tt.Click("让 Ducter 在上面做事"); err != nil {
		t.Fatal(err)
	}
	lendFrame(tt)
	if !hasText(tt, "是哪种电脑？") {
		t.Fatalf("no question: %q", tt.Texts())
	}
	if err := tt.Click("一台 Linux 服务器"); err != nil {
		t.Fatal(err)
	}
	lendFrame(tt)
	if f, ok := (*sent)[len(*sent)-1].(protocol.LendCodeReq); !ok || f.T != "lend_code" {
		t.Fatalf("asked nothing: %#v", (*sent)[len(*sent)-1])
	}
	app.Receive(lendWaitingFrame(false))
	lendFrame(tt)
	// research/165: the kind's step is titled by the kind, never the question's words again.
	if !hasText(tt, "加一台 Linux 服务器") || hasText(tt, "加一台做事的电脑") {
		t.Errorf("the line's title: %q", tt.Texts())
	}
	for _, w := range []string{lendLineText, "复制这一行", "粘到它的终端里", "它会自己连上来", "这个码还能用 10 分钟，只能用一次。", "在等它连上…", "让你的 AI agent 来装", "没连上？"} {
		if !hasText(tt, w) {
			t.Errorf("waiting: no %q in %q", w, tt.Texts())
		}
	}
	if hasText(tt, "它要和 hel 在同一个网络里，比如家里同一个 Wi-Fi。") {
		t.Errorf("a public address isn't same-network")
	}
	// The fold: what goes wrong, each with its next step; the check line to copy.
	if err := tt.Click("没连上？"); err != nil {
		t.Fatal(err)
	}
	lendFrame(tt)
	for _, w := range []string{"码过期了", "那台电脑连不到 hel", "curl -sS -m 10 https://hel.example.com/health", "没有 curl", "这种电脑还不支持"} {
		if !hasText(tt, w) {
			t.Errorf("help: no %q", w)
		}
	}
	// Another window's lend never takes this sheet over.
	app.Receive(protocol.ServerFrame{T: "lend", Code: "ZZZZ-ZZZZ", State: "joined", Device: "x", Name: "other"})
	if app.S.Lend.Code != "K7QM-4XPA" {
		t.Fatalf("another code took over: %#v", app.S.Lend)
	}
	// Joined (no line in the frame: it keeps the one it had), then here.
	app.Receive(protocol.ServerFrame{T: "lend", Code: "K7QM-4XPA", ExpiresAt: lendWaitingFrame(false).ExpiresAt, State: "joined", Device: "a1b2c3d4e5", Name: "nas"})
	lendFrame(tt)
	if !hasText(tt, "连上了，正在开好…") || app.S.Lend.LendLine != lendLineText {
		t.Fatalf("joined: %q", tt.Texts())
	}
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{lendHome(), lendNas("claude-code")}})
	app.Receive(protocol.ServerFrame{T: "lend", Code: "K7QM-4XPA", State: "here", Device: "a1b2c3d4e5", Name: "nas"})
	lendFrame(tt)
	// D363: one signed in: 可以干活了, and the one that isn't offers 登录 right there.
	for _, w := range []string{"nas 来了", "Linux", "arm64", "nas 可以干活了", "Claude Code", "可以用了", "Codex", "登录", "完成"} {
		if !hasText(tt, w) {
			t.Errorf("here: no %q in %q", w, tt.Texts())
		}
	}
	if err := tt.Click("完成"); err != nil {
		t.Fatal(err)
	}
	lendFrame(tt)
	if app.lend.open {
		t.Fatal("Done didn't close the sheet")
	}
}

func TestLendExpiredAndNoAddress(t *testing.T) {
	app, tt, sent := lendApp(t, i18n.EN, 1440, 900)
	app.openLend()
	app.lend.kind = "linux"
	app.askLend()
	app.Receive(lendWaitingFrame(true))
	lendFrame(tt)
	if !hasText(tt, "It has to be on the same network as hel, like the same home Wi-Fi.") {
		t.Errorf("same network not said: %q", tt.Texts())
	}
	app.Now = func() time.Time { return lendNow.Add(11 * time.Minute) }
	lendFrame(tt)
	if !hasText(tt, "This code expired.") {
		t.Fatalf("expired: %q", tt.Texts())
	}
	n := len(*sent)
	if err := tt.Click("New code"); err != nil {
		t.Fatal(err)
	}
	if len(*sent) != n+1 {
		t.Fatalf("New code asked nothing")
	}
	if _, ok := (*sent)[n].(protocol.LendCodeReq); !ok {
		t.Fatalf("New code sent %#v", (*sent)[n])
	}
	app.Receive(protocol.ServerFrame{T: "lend", Code: "AAAA-BBBB", ExpiresAt: lendNow.Add(30 * time.Minute).Format(time.RFC3339), State: "waiting"})
	lendFrame(tt)
	if !hasText(tt, "Nothing outside reaches hel yet, so that computer can't either. Turn on From outside first.") {
		t.Fatalf("no address: %q", tt.Texts())
	}
}

func TestLendRichCardAndSettings(t *testing.T) {
	app, tt, _ := lendAt(t, i18n.ZH, 1280, 900, func(app *App) { lendAI(app); app.Route = RouteConversation })
	if hasText(tt, "+ 加一台做事的电脑") {
		t.Fatal("not the conversation")
	}
	if err := tt.Click("加一台电脑"); err != nil {
		t.Fatalf("no card button: %v %q", err, tt.Texts())
	}
	lendFrame(tt)
	if !app.lend.open || !hasText(tt, "是哪种电脑？") {
		t.Fatal("the card didn't open the sheet")
	}
	app, tt, _ = lendAt(t, i18n.ZH, 1280, 1400, func(app *App) { app.openTab(TabRun) })
	if hasText(tt, "+ 加一台做事的电脑") || !hasText(tt, "加一台做事的电脑") || !hasText(tt, "让任务在那台电脑上跑，比如家里的服务器。") {
		t.Fatalf("settings: %q", tt.Texts())
	}
	if err := tt.Click("加一台做事的电脑"); err != nil {
		t.Fatal(err)
	}
	lendFrame(tt)
	if !app.lend.open {
		t.Fatal("the settings row didn't open the sheet")
	}
}

// lendAI puts the partner's answer with the lend card in the conversation
// (the fixture's text and block, packages/protocol/fixtures/rich.json).
func lendAI(app *App) {
	app.Status = client.Connected
	ts := lendNow.Format(time.RFC3339Nano)
	plain := "加一台做事的电脑：你的设备 › 加一台设备。"
	evs := []protocol.LogEvent{
		protocol.NewEvent(1, ts, "default", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: "把我局域网的服务器加进来"}),
		protocol.NewEvent(2, ts, "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: "可以，把它加进来就行，跟着这张卡片走：\n\n" + plain, UI: []protocol.RichUI{{Type: "lend", Plain: plain}}, ReplyTo: 1}),
	}
	app.Receive(protocol.ServerFrame{T: "welcome", Persona: "default", PersonaName: "Ducter", HeadSeq: 2})
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
}

// DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../../../.shots/lend-computer go test ./internal/views -run LendShots
func TestLendShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	dir := shotsDir(t)
	save := func(tt *ui.Tester, name string) {
		lendFrame(tt)
		f, err := os.Create(filepath.Join(dir, name))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, tt.Image()); err != nil {
			t.Fatal(err)
		}
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		p := "mac-" + string(lang) + "-"
		app, tt, _ := lendApp(t, lang, 1440, 900)
		save(tt, p+"01-devices-entry.png")
		app.openLend()
		save(tt, p+"02-question.png")
		app.lend.kind = "linux"
		app.askLend()
		app.Receive(lendWaitingFrame(false))
		save(tt, p+"03-linux-line.png")
		app.lend.agentOpen = true
		save(tt, p+"04-agent-open.png")
		app.lend.agentOpen, app.lend.helpOpen = false, true
		save(tt, p+"05-didnt-connect.png")
		app.lend.helpOpen = false
		app.lend.kind = "mac"
		save(tt, p+"06-mac.png")
		app.Receive(protocol.ServerFrame{T: "lend", Code: "K7QM-4XPA", State: "joined", Device: "a1b2c3d4e5", Name: "nas"})
		save(tt, p+"07-joined.png")
		app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{lendHome(), lendNas("claude-code", "codex")}})
		app.Receive(protocol.ServerFrame{T: "lend", Code: "K7QM-4XPA", State: "here", Device: "a1b2c3d4e5", Name: "nas"})
		save(tt, p+"08-here.png")
		app.lend.kind = "linux"
		app.Receive(lendWaitingFrame(true))
		app.S.Lend = nil
		app.Receive(lendWaitingFrame(true))
		app.Now = func() time.Time { return lendNow.Add(11 * time.Minute) }
		save(tt, p+"09-expired.png")
		app.Now = func() time.Time { return lendNow }
		save(tt, p+"10-same-network.png")
		app.S.Lend = nil
		app.Receive(protocol.ServerFrame{T: "lend", Code: "AAAA-BBBB", ExpiresAt: lendNow.Add(10 * time.Minute).Format(time.RFC3339), State: "waiting"})
		save(tt, p+"11-no-address.png")
		_, tt, _ = lendAt(t, lang, 1280, 1400, func(app *App) { app.openTab(TabRun) })
		save(tt, p+"12-settings-run.png")
		_, tt, _ = lendAt(t, lang, 1280, 900, func(app *App) { lendAI(app); app.Route = RouteConversation })
		save(tt, p+"13-partner-card.png")
	}
}

// The author on 0.0.76 against hel: 正在拿一个码… forever. The core's lend frame,
// as JSON off the socket, must reach the sheet (DecodeServerFrame dropped it);
// and with no answer, or an error, the sheet says so within lendWait with
// Try again, never an endless wait (research/127).
func TestLendCodeArrivesOffTheWireOrSaysWhy(t *testing.T) {
	app, tt, sent := lendApp(t, i18n.EN, 1440, 900)
	if err := tt.Click("Add a device"); err != nil {
		t.Fatal(err)
	}
	lendFrame(tt)
	if err := tt.Click("For Ducter to do tasks on"); err != nil {
		t.Fatal(err)
	}
	lendFrame(tt)
	if err := tt.Click("A Linux server"); err != nil {
		t.Fatal(err)
	}
	lendFrame(tt)
	wire := `{"t":"lend","code":"K7QM-4XPA","expiresAt":"` + lendNow.Add(10*time.Minute).Format(time.RFC3339) + `","state":"waiting","address":"https://hel.example.com","line":"` + lendLineText + `","check":"curl -sS -m 10 https://hel.example.com/health"}`
	f, err := protocol.DecodeServerFrame([]byte(wire))
	if err != nil {
		t.Fatalf("the lend frame is dropped: %v", err)
	}
	app.Receive(f)
	lendFrame(tt)
	if !hasText(tt, lendLineText) {
		t.Fatalf("the line never showed: %q", tt.Texts())
	}

	// No answer: the loading line, then after lendWait the reason and Try again.
	app.askLend()
	lendFrame(tt)
	if !hasText(tt, "Your line is almost ready…") {
		t.Fatalf("not loading: %q", tt.Texts())
	}
	at := lendNow
	app.Now = func() time.Time { return at }
	at = lendNow.Add(lendWait + time.Second)
	lendFrame(tt)
	if !hasText(tt, "hel didn't answer, so there's no code yet.") || hasText(tt, "Your line is almost ready…") {
		t.Fatalf("still waiting after %s: %q", lendWait, tt.Texts())
	}
	n := len(*sent)
	if err := tt.Click("Try again"); err != nil {
		t.Fatal(err)
	}
	lendFrame(tt)
	if _, ok := (*sent)[len(*sent)-1].(protocol.LendCodeReq); !ok || len(*sent) == n {
		t.Fatalf("Try again asked nothing: %#v", (*sent)[len(*sent)-1])
	}

	// The home answers with an error: said at once.
	app.Receive(protocol.ServerFrame{T: "error", Message: "lend_code: lending is not available"})
	lendFrame(tt)
	if !hasText(tt, "hel couldn't make a code.") {
		t.Fatalf("an error isn't said: %q", tt.Texts())
	}
	// An older error frame doesn't fail a fresh ask.
	app.askLend()
	lendFrame(tt)
	if !hasText(tt, "Your line is almost ready…") {
		t.Fatalf("a fresh ask isn't loading: %q", tt.Texts())
	}
}
