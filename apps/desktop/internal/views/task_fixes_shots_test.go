package views

import (
	"encoding/json"
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

// The author's task on a hel home (2026-11-11, D207), as its Log had it:
// Codex looking into a phone call that only played its greeting, a stretch
// of shell commands (one curl among them), a message sent while it was
// idle, then the runner's stall line. DUCTER_TASK_SHOTS=1 writes the
// opened task in zh and en to the shots folder (task-fixes-{zh,en}.png).
func TestTaskFixesShots(t *testing.T) {
	if os.Getenv("DUCTER_TASK_SHOTS") == "" {
		t.Skip("DUCTER_TASK_SHOTS=1 to write the shots")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := iaApp(t, lang)
		app.Status = client.Connected
		app.LocaleFixed = true
		now := time.Now()
		n := int64(0)
		at := func(ago time.Duration, origin protocol.Origin, kind string, body any) protocol.LogEvent {
			n++
			return protocol.NewEvent(n, now.Add(-ago).UTC().Format(time.RFC3339Nano), "default", protocol.TaskStream("t_hel"), origin, kind, body)
		}
		ok, no := true, false
		in := func(v any) json.RawMessage { b, _ := json.Marshal(v); return b }
		sh := func(ago time.Duration, cmd, out string, good *bool) protocol.LogEvent {
			return at(ago, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "t_hel", Role: "tool", Tool: &protocol.ToolCall{Name: "exec_command", Input: in(map[string]string{"cmd": "/bin/bash -lc '" + cmd + "'"}), OK: good, Output: out}})
		}
		sys := func(ago time.Duration, text, raw string) protocol.LogEvent {
			return at(ago, protocol.OriginSystem, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "t_hel", Role: "system", From: "runner", Text: text, Raw: json.RawMessage(raw)})
		}
		title := "排查电话只播放开场白的问题"
		brief := "用户原话：“电话接通后只播了开场白就没声音了，帮我查查是哪里的问题。”\n\n要做的：找到为什么通话只播开场白，说清原因；先别改配置。"
		// Sent from this Mac while it was idle: the home's "sent" ack, then its echo in the Log.
		app.S.AddSend("t_hel", "顺便看一下 Tuwa 那边的回调", "c1").At = now.Add(-2 * time.Minute)
		app.Receive(protocol.ServerFrame{T: "sent", TaskID: "t_hel", Delivered: "prompted"})
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			at(6*time.Minute, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t_hel", Title: title, Harness: "codex", Place: protocol.Place{Kind: "none", Device: "hel"}, Brief: brief}),
			sys(6*time.Minute, "recalled 2 from memory for the brief", `{"memory":"recall"}`),
			at(5*time.Minute, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "t_hel", Role: "assistant", Text: "先看看通话服务的日志和健康状态。"}),
			sh(5*time.Minute, "pwd", "", &no),
			sh(5*time.Minute, "curl -fsS http://127.0.0.1:7777/health", `{"ok":true}`, &ok),
			sh(4*time.Minute, "journalctl -u ducter -n 80", "…", &ok),
			sh(4*time.Minute, "grep -n greeting /var/log/ducter/phone.log", "", &ok),
			at(3*time.Minute, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "t_hel", Role: "assistant", Text: "开场白之后没有收到对方的语音流，像是转写那一步没接上。"}),
			at(2*time.Minute, protocol.OriginUser, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "t_hel", Role: "user", From: "user", Text: "顺便看一下 Tuwa 那边的回调", ClientID: "c1"}),
			at(time.Minute, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "t_hel", Role: "system", Text: "no report after one nudge; leaving the task idle (stall rule)", Raw: json.RawMessage(`{"stall":true}`)}),
			at(time.Minute, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: "t_hel", Attention: protocol.Working}),
		}})
		app.OpenTask("t_hel")
		tt := ui.NewTesterWith(app.View, 1100, 1250, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		for _, b := range app.blocks(app.S.Task("t_hel")) {
			if b.K == "steps" {
				app.open["stretch:t_hel:"+itoa(b.Seq)] = true
			}
		}
		tt.Frame()
		tt.Frame()
		tt.Advance(time.Second)
		f, err := os.Create(filepath.Join(shotsDir(t), "task-fixes-"+string(lang)+".png"))
		if err != nil {
			t.Fatal(err)
		}
		if err := png.Encode(f, tt.Image()); err != nil {
			t.Fatal(err)
		}
		f.Close()
	}
}
