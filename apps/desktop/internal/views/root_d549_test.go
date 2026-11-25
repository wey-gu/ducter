package views

import (
	"encoding/json"
	"image"
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

// D549 (hel, 2026-11-24): Ducter runs as root there, and Claude Code won't
// run as root. Its row on the computer's card says so with why and no
// button, its tile is greyed, and the task that tried it says why in the
// conversation, On hand and its own page, with 换谁来做 as the fix and no
// 再试一次. Fakes only: frames, no core, no agent.

var rootTrouble = &protocol.AgentTrouble{Kind: "root"}

const rootSaid = "--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons"

func rootCant() protocol.CantStart {
	return protocol.CantStart{Why: "refuses_root", Computer: "Hetzner Server", What: "Claude Code", Device: "local", Harness: "claude-code", Detail: rootSaid}
}

// rootTask is the Update task that tried Claude Code on hel, failed as the
// runner writes it, with its living line in the conversation.
func rootTask(t *testing.T, lang i18n.Lang, dark bool, w, h int) (*App, *ui.Tester) {
	t.Helper()
	app, _ := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{helHome(protocol.DeviceHarness{LoggedIn: true, Trouble: rootTrouble})}})
	k := rootCant()
	now := time.Now()
	at := func(ago time.Duration) string { return now.Add(-ago).UTC().Format(time.RFC3339Nano) }
	id, ts := "kwhtu5a7", protocol.TaskStream("kwhtu5a7")
	title := "更新 Claude Code 的 Mem 插件"
	ask, ack := "把 Claude Code 的 Mem 插件更新一下", "好，我让 Claude Code 去更新。"
	if lang == i18n.EN {
		title, ask, ack = "Update the Mem plugin for Claude Code", "Update the Mem plugin for Claude Code", "Sure, I'll have Claude Code update it."
	}
	place := protocol.Place{Kind: "none"}
	raw, _ := json.Marshal(map[string]any{"cant": k})
	line := app.cantLine(&k)
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(1, at(2*time.Minute), "default", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: ask}),
		protocol.NewEvent(2, at(2*time.Minute), "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: ack}),
		protocol.NewEvent(3, at(time.Minute), "default", ts, protocol.OriginSystem, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: title, Harness: "claude-code", Place: place, Brief: "Update the Nowledge Mem plugin for Claude Code."}),
		protocol.NewEvent(4, at(50*time.Second), "default", ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "system", From: "runner", Text: "failed to start: Claude Code exited as it started: " + rootSaid, Raw: raw}),
		protocol.NewEvent(5, at(50*time.Second), "default", ts, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: protocol.Failed, Residency: "archived", Reason: line, Cant: &k}),
		protocol.NewEvent(6, at(40*time.Second), "default", "channel", protocol.OriginPartner, protocol.KindLivingMsg, protocol.LivingMsg{Items: []protocol.LivingItem{{TaskID: id, Kind: "failed", Title: title, Text: line}}}),
	}})
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{
		{TaskID: id, Title: title, Place: place, Harness: "claude-code", Attention: protocol.Failed, Residency: "archived", Reason: line, Cant: &k, OpenedAt: at(time.Minute), UpdatedAt: at(50 * time.Second)},
	}}})
	tt := ui.NewTesterWith(app.View, w, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.SetDark(dark)
	tt.Frame()
	tt.Frame()
	return app, tt
}

func TestD549AgentRowWontRunAsRoot(t *testing.T) {
	defer func() { helW = 1400 }()
	helW = 1150
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		_, tt, _ := helApp(t, lang, false, protocol.DeviceHarness{LoggedIn: true, Trouble: rootTrouble})
		word, why := "不肯以 root 身份运行", "为了安全不肯这样跑"
		if lang == i18n.EN {
			word, why = "Won't run as root", "for safety Claude Code won't run that way"
		}
		if !hasText(tt, word) || !hasText(tt, why) {
			t.Errorf("%s: the row doesn't say %q with why", lang, word)
		}
		for _, no := range []string{"登录", "Sign in", "用它做事", "Use it for tasks"} {
			for _, ai := range tt.AccessAll() {
				if ai.Role == ui.RoleButton && ai.Name == no {
					t.Errorf("%s: a %q button on a row that can't run", lang, no)
				}
			}
		}
	}
}

func TestD549CardSaysWhyWithTheSwitchNeverRetry(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, tt := rootTask(t, lang, false, 1150, 900)
		app.OpenTask("kwhtu5a7")
		tt.Frame()
		tt.Frame()
		line, sw, retry := "没能开始：Claude Code 不肯在 Hetzner Server 上以 root 身份运行", "换谁来做", "再试一次"
		if lang == i18n.EN {
			line, sw, retry = "Couldn't start: Claude Code won't run as root on Hetzner Server", "Switch who does it", "Try again"
		}
		if !hasText(tt, line) || !hasText(tt, rootSaid) {
			t.Errorf("%s: the page doesn't say %q with Claude Code's own line", lang, line)
		}
		if strings.Contains(strings.Join(tt.Texts(), "\n"), "exited as it started") {
			t.Errorf("%s: Ducter's English lead is shown before the agent's line", lang)
		}
		if !hasText(tt, sw) {
			t.Errorf("%s: no %q fix", lang, sw)
		}
		// Once, and in order: the title, the meta line, then the failure block.
		n, lineY, tagY := 0, float32(-1), float32(-1)
		tag := app.tagLabel(protocol.Failed)
		for _, ai := range tt.AccessAll() {
			if (ai.Role == ui.RoleButton || ai.Role == ui.RoleLink) && strings.HasPrefix(ai.Name, sw) {
				n++
			}
			if strings.HasPrefix(ai.Name, line) && lineY < 0 {
				lineY = ai.Bounds.Y
			}
			if ai.Name == tag && tagY < 0 {
				tagY = ai.Bounds.Y
			}
		}
		if n != 1 {
			t.Errorf("%s: %q shows %d times, want once", lang, sw, n)
		}
		if lineY < 0 || tagY < 0 || lineY <= tagY {
			t.Errorf("%s: the failure block (y %v) isn't under the meta line (y %v)", lang, lineY, tagY)
		}
		for _, ai := range tt.AccessAll() {
			if ai.Role == ui.RoleButton && ai.Name == retry {
				t.Errorf("%s: %q on a cause that holds", lang, retry)
			}
		}
	}
}

// DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=…/.shots/root go test ./internal/views -run D549Shots
func TestD549Shots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	dir := shotsDir(t)
	const w, h = 1150, 900
	defer func() { helW = 1400 }()
	helW = w
	for _, v := range []struct {
		lang i18n.Lang
		dark bool
		mode string
	}{{i18n.ZH, false, "light"}, {i18n.EN, true, "dark"}} {
		pre := filepath.Join(dir, "mac-"+"1150-"+string(v.lang)+"-"+v.mode)
		// 1. The computer's card: the tray and Claude Code's row.
		_, tt, _ := helApp(t, v.lang, v.dark, protocol.DeviceHarness{LoggedIn: true, Trouble: rootTrouble})
		tt.Frame()
		img := tt.Image()
		writePNG(t, pre+"-4-agent-row.png", img)
		rowCrop(t, tt, img, w, helH(), "Claude Code", pre+"-4-agent-row-crop.png")
		// 2. The conversation, On hand and the opened task.
		app, ct := rootTask(t, v.lang, v.dark, w, h)
		app.Route = RouteConversation
		ct.Frame()
		ct.Advance(time.Second)
		ct.Frame()
		writePNG(t, pre+"-1-conversation.png", ct.Image())
		app.Route = RouteOnHand
		ct.Frame()
		ct.Advance(time.Second)
		ct.Frame()
		writePNG(t, pre+"-2-onhand.png", ct.Image())
		app.OpenTask("kwhtu5a7")
		ct.Frame()
		ct.Advance(time.Second)
		ct.Frame()
		ti := ct.Image()
		writePNG(t, pre+"-3-task.png", ti)
		textCrop(t, ct, ti, w, h, app.cantLine(&[]protocol.CantStart{rootCant()}[0]), pre+"-3-task-cant-crop.png")
	}
}

// rowCrop writes a 2x crop around the first element named name (its row on the card).
func rowCrop(t *testing.T, tt *ui.Tester, img image.Image, w, h int, name, path string) {
	t.Helper()
	for _, ai := range tt.AccessAll() {
		if ai.Name == name && ai.Bounds.W > 0 && ai.Role != ui.RoleButton {
			cropAround(t, img, w, h, ai.Bounds.X-60, ai.Bounds.Y-24, 620, 200, path)
			return
		}
	}
	t.Logf("no %q to crop", name)
}

func textCrop(t *testing.T, tt *ui.Tester, img image.Image, w, h int, text, path string) {
	t.Helper()
	for _, ai := range tt.AccessAll() {
		if strings.HasPrefix(ai.Name, text) && ai.Bounds.W > 0 {
			cropAround(t, img, w, h, ai.Bounds.X-16, ai.Bounds.Y-16, 720, 260, path)
			return
		}
	}
	t.Logf("no %q to crop", text)
}

func cropAround(t *testing.T, img image.Image, w, h int, x, y, cw, ch float32, path string) {
	sx, sy := float32(img.Bounds().Dx())/float32(w), float32(img.Bounds().Dy())/float32(h)
	if x < 0 {
		x = 0
	}
	if y < 0 {
		y = 0
	}
	rect := image.Rect(int(x*sx), int(y*sy), int((x+cw)*sx), int((y+ch)*sy)).Intersect(img.Bounds())
	sub := img.(interface {
		SubImage(image.Rectangle) image.Image
	}).SubImage(rect)
	writePNG(t, path, scale2(sub))
}
