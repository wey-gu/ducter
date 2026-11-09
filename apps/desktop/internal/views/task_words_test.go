package views

import (
	"encoding/json"
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

// The fresh-user fix (tinycart), as the QA run saw it: the runner's kickoff
// in the stream, Ducter's own tools (one that failed its schema), a
// reproduction then a passing run, a bare "commit", a repo with no remote.
func tinycart(t *testing.T, lang i18n.Lang, reportAgo time.Duration) (*App, *ui.Tester) {
	t.Helper()
	app, _ := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	now := time.Now()
	n := int64(0)
	at := func(ago time.Duration, stream string, origin protocol.Origin, kind string, body any) protocol.LogEvent {
		n++
		return protocol.NewEvent(n, now.Add(-ago).UTC().Format(time.RFC3339Nano), "default", stream, origin, kind, body)
	}
	ok, no := true, false
	in := func(v any) json.RawMessage { b, _ := json.Marshal(v); return b }
	id, ts := "t_fix", protocol.TaskStream("t_fix")
	title := "Fix failing tests in tinycart"
	brief := "The user says the tests in ~/dev/tinycart fail. Find the cause, fix it, and run the full suite to confirm. Commit on the task branch; don't push."
	place := protocol.Place{Kind: "repo", Device: "local", RepoPath: "~/dev/tinycart", Branch: "ducter/fix-failing-tests-in-tinycart", BaseBranch: "main"}
	start := reportAgo + 90*time.Second
	tool := func(name string, input any, good *bool, out string) protocol.LogEvent {
		return at(start-30*time.Second, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "tool", Tool: &protocol.ToolCall{Name: name, Input: in(input), OK: good, Output: out}})
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		at(start, "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: "The tests in ~/dev/tinycart are failing. Find the bug, fix it, and tell me when it's done."}),
		at(start, "channel", protocol.OriginPartner, protocol.KindAck, protocol.Ack{JobID: "j1", Text: "On it: finding why the tinycart tests fail and fixing it; I'll tell you when it's done.", ReplyTo: 1}),
		at(start, ts, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: title, Harness: "claude-code", Place: place, Brief: brief}),
		at(start, "channel", protocol.OriginPartner, protocol.KindJobStatus, protocol.JobStatus{JobID: "j1", Text: "Working", State: "running", TaskID: id}),
		at(start, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "user", From: "runner", Text: "<brief>\n" + brief + "\n</brief>\n\nStart the task \"" + title + "\" now, following your task brief. Report via report_to_main when done, blocked, or needing a decision."}),
		at(start, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "assistant", Text: "Running the suite first to see what fails."}),
		tool("Bash", map[string]string{"command": "bun test"}, &ok, "2 fail, 1 pass"),
		tool("mcp__ducter__checkpoint", map[string]string{"note": "repro"}, &no, `MCP error -32602: Invalid arguments for tool checkpoint: [{"code":"invalid_type","expected":"string","path":["text"]}]`),
		tool("Read", map[string]string{"file_path": "src/cart.ts"}, &ok, ""),
		tool("Edit", map[string]string{"file_path": "src/cart.ts"}, &ok, ""),
		tool("Bash", map[string]string{"command": "bun test"}, &ok, "3 pass"),
		tool("mcp__ducter__report_to_main", map[string]string{"state": "done"}, &ok, ""),
		at(reportAgo, ts, protocol.OriginTask, protocol.KindReport, protocol.Report{TaskID: id, State: "done",
			Summary: "Fixed: total() in cart.ts skipped the first cart item because its loop started at index 1. Changed it to start at 0. The full suite now passes (3/3). Committed on ducter/fix-failing-tests-in-tinycart as b6726b1; not merged or pushed.",
			Evidence: []protocol.EvidenceRef{
				{Kind: "test", Label: "bun test before fix", Ref: "2 fail, 1 pass"},
				{Kind: "test", Label: "bun test after fix", Ref: "3 pass"},
				{Kind: "diff", Label: "commit", Ref: "b6726b1"},
			}}),
		at(reportAgo, ts, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: protocol.Done}),
		at(reportAgo, "channel", protocol.OriginPartner, protocol.KindJobStatus, protocol.JobStatus{JobID: "j1", Text: "Done", State: "done", TaskID: id}),
		at(reportAgo, "channel", protocol.OriginSystem, protocol.KindLivingMsg, protocol.LivingMsg{Items: []protocol.LivingItem{{TaskID: id, Kind: "done", Title: title, Text: "Fixed: total() in cart.ts skipped the first cart item because its loop started at index 1."}}}),
	}})
	tt := ui.NewTesterWith(app.View, 1280, 1500, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	tt.Frame()
	return app, tt
}

func texts(tt *ui.Tester) string { return strings.Join(tt.Texts(), "\n") }

// count counts the texts that are exactly s (an accessibility label repeats it with more words).
func count(tt *ui.Tester, s string) int {
	n := 0
	for _, x := range tt.Texts() {
		if x == s {
			n++
		}
	}
	return n
}

func writeShot(t *testing.T, tt *ui.Tester, name string) {
	t.Helper()
	tt.Advance(time.Second)
	f, err := os.Create(filepath.Join(shotsDir(t), name+".png"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, tt.Image()); err != nil {
		t.Fatal(err)
	}
}

// The opened task: the brief once, in words; no kickoff, no tags, no
// Ducter tools or their errors; the reproduction without a ✓; the changes
// as "1 file changed".
func TestTaskSaysWordsNotPlumbing(t *testing.T) {
	app, tt := tinycart(t, i18n.EN, 3*time.Minute)
	app.OpenTask("t_fix")
	tt.Frame()
	tt.Frame()
	all := texts(tt)
	if strings.Count(all, "The user says the tests in ~/dev/tinycart fail.") != 1 {
		t.Errorf("the brief doesn't show exactly once: %q", all)
	}
	for _, not := range []string{"<brief>", "report_to_main", "Start the task", "checkpoint", "MCP error", "invalid_type", "commit"} {
		if strings.Contains(all, not) {
			t.Errorf("%q shows in the opened task: %q", not, all)
		}
	}
	for _, want := range []string{"bun test before fix", "bun test after fix", "1 file changed", "bun test", "src/cart.ts"} {
		if !strings.Contains(all, want) {
			t.Errorf("no %q in the opened task: %q", want, all)
		}
	}
	writeShot(t, tt, "task-ui-desktop-task-en")
	if err := tt.Click("Open draft PR"); err != nil {
		t.Fatal(err)
	}
	app.Receive(protocol.ServerFrame{T: "action_result", TaskID: "t_fix", Action: "open_pr", OK: false, Message: "This repo has no origin remote to push to."})
	tt.Frame()
	tt.Frame()
	all = texts(tt)
	if !strings.Contains(all, "This repo has no remote to push to") || strings.Contains(all, "Open draft PR") {
		t.Errorf("after a PR with no remote: want the reason and no Open draft PR: %q", all)
	}
	tt.Advance(10 * time.Second)
	tt.Frame()
	if !strings.Contains(texts(tt), "This repo has no remote to push to") {
		t.Errorf("the reason went away")
	}
	writeShot(t, tt, "task-ui-desktop-pr-noremote-en")
}

// While the partner puts the result into words, its place shows the
// waiting presence, not a template; the action row shows once, on the
// newest message about the task.
func TestResultWaitsForThePartnersWords(t *testing.T) {
	_, tt := tinycart(t, i18n.EN, 5*time.Second)
	all := texts(tt)
	if !strings.Contains(all, "Looking over what it came back with…") || strings.Contains(all, "is done:") {
		t.Errorf("a fresh result shows the template, not the waiting line: %q", all)
	}
	if count(tt, "Merge into main") != 0 {
		t.Errorf("the ack carries the action row while the words are coming: %q", all)
	}
	writeShot(t, tt, "task-ui-desktop-waiting-en")

	_, late := tinycart(t, i18n.EN, 3*time.Minute)
	if !strings.Contains(texts(late), "Fix failing tests in tinycart is done:") {
		t.Errorf("a late result doesn't fall back to its line: %q", texts(late))
	}
	if n := count(late, "Merge into main"); n != 1 {
		t.Errorf("Merge into main shows %d times, want once: %q", n, texts(late))
	}
	writeShot(t, late, "task-ui-desktop-late-line-en")
}

func TestResultRowOnceAfterTheRewrite(t *testing.T) {
	app, tt := tinycart(t, i18n.ZH, 3*time.Minute)
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(100, time.Now().UTC().Format(time.RFC3339Nano), "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: "修好了：购物车总价漏算了第一件商品，因为循环从下标 1 开始，我改成了从 0 开始。测试现在全过。", ReplyTo: 1}),
	}})
	tt.Frame()
	tt.Frame()
	if n := count(tt, "合进 main"); n != 1 {
		t.Errorf("合进 main shows %d times, want once: %q", n, texts(tt))
	}
	if err := tt.Click("看细节"); err == nil {
		tt.Frame()
	}
	all := texts(tt)
	if !strings.Contains(all, "改了 1 个文件") || strings.Contains(all, "commit") {
		t.Errorf("Details don't say the changes in words: %q", all)
	}
	writeShot(t, tt, "task-ui-desktop-details-zh")
}
