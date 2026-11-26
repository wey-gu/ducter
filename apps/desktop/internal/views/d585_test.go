package views

import (
	"encoding/json"
	"fmt"
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

// D585: the person talking to a task in its own box, as a conductor does.
// Two tasks as the demo core and the real runner log them
// (apps/web/demo-d585.ts): a finished one asked a question afterwards, and
// one asked "what's our PR?" mid-turn that carried on to done. `before`
// adds what the runner did before D585 (its nudge and the agent's "I
// reported it" after the answer, the card left on Working).

func (f *v2Fixture) d585Done(before bool) []protocol.LogEvent {
	id, ts := "t_done", protocol.TaskStream("t_done")
	s := time.Second
	raw := func(v any) json.RawMessage { b, _ := json.Marshal(v); return b }
	evs := []protocol.LogEvent{
		f.at(300*s, ts, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: f.w("登录按钮在手机上太小", "Sign-in button too small on phones"), Harness: "claude-code", Model: "opus", Project: f.w("网页端", "Web app"),
			Place: protocol.Place{Kind: "none"}, Brief: f.w("登录按钮在手机上太小，点不中。改到至少 44 高，跑测试。", "The sign-in button is too small to hit on phones. Make it at least 44 tall and run the tests."), Origin: "you"}),
		f.state(id, 300*s, protocol.Working),
		f.tool(id, 295*s, "Read", map[string]any{"file_path": "apps/web/src/login.tsx"}, true, ""),
		f.tool(id, 294*s, "Read", map[string]any{"file_path": "apps/web/src/login.css"}, true, ""),
		f.tool(id, 290*s, "Edit", map[string]any{"file_path": "apps/web/src/login.css", "old_string": "  padding: 6px 12px;", "new_string": "  padding: 10px 16px;\n  min-height: 44px;"}, true, ""),
		f.tool(id, 280*s, "Bash", map[string]any{"command": "bun test apps/web/test/login.test.ts", "description": f.w("跑登录页的测试", "Run the sign-in page's tests")}, true, "12 pass"),
		f.say(id, 275*s, f.w("登录按钮的内边距改大了，高度至少 44，12 项测试都过了。", "The sign-in button has more padding and is at least 44 tall; all 12 tests pass.")),
		f.at(274*s, ts, protocol.OriginTask, protocol.KindReport, protocol.Report{TaskID: id, State: "done", Summary: f.w("登录按钮改好了：至少 44 高，12 项测试都通过。", "The sign-in button is fixed: at least 44 tall, all 12 tests pass.")}),
		f.at(273*s, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "system", Text: "turn completed", Raw: raw(map[string]any{"kind": "turn_ended", "outcome": "completed"})}),
		f.state(id, 273*s, protocol.Done),
		f.you(id, 120*s, f.w("这个改动会影响手机上的登录页吗？", "Will this change affect the sign-in page on phones?")),
		f.state(id, 120*s, protocol.Working),
		f.tool(id, 115*s, "Grep", map[string]any{"pattern": "LoginButton", "path": "apps/mobile"}, true, "apps/mobile/src/Login.tsx:14"),
		f.tool(id, 113*s, "Read", map[string]any{"file_path": "apps/mobile/src/Login.tsx"}, true, ""),
		f.say(id, 110*s, f.w("会影响一点。手机上的登录页用的是同一个按钮组件，所以也会变成至少 44 高。\n\n- 好处：手指更好点中，符合触控的最小尺寸。\n- 要留意：小屏（宽 320）上，按钮和“忘记密码”之间只剩 8 的间距，看起来有点挤。\n\n要不要我顺手把小屏上的间距也调一下？",
			"A little. The phone's sign-in page uses the same button, so it becomes at least 44 tall too.\n\n- Good: easier to hit, and it meets the touch minimum.\n- Watch: on a small screen (320 wide) only 8 points are left between the button and \"Forgot password\", which looks tight.\n\nShall I fix the spacing on small screens too?")),
		f.at(109*s, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "system", Text: "turn completed", Raw: raw(map[string]any{"kind": "turn_ended", "outcome": "completed"})}),
	}
	if !before {
		return append(evs, f.state(id, 109*s, protocol.Done))
	}
	return append(evs,
		f.at(108*s, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "user", From: "runner", Text: "Report status via report_to_main.", Raw: raw(map[string]any{"delivered": "turn"})}),
		f.at(105*s, ts, protocol.OriginTask, protocol.KindReport, protocol.Report{TaskID: id, State: "progress", Summary: f.w("已经在任务里回答了：会影响，手机上的登录按钮要再调。", "Answered in the task: yes, the phone's sign-in button needs another look.")}),
		f.tool(id, 105*s, "mcp__ducter__report_to_main", map[string]any{}, true, "Reported. Keep working."),
		f.say(id, 104*s, f.w("我已经通过 report_to_main 把这个回答报告给了小鸭。", "I reported this answer to Duckie via report_to_main.")),
		f.at(103*s, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "system", Text: "turn completed", Raw: raw(map[string]any{"kind": "turn_ended", "outcome": "completed"})}),
	)
}

func (f *v2Fixture) d585Steer() []protocol.LogEvent {
	id, ts := "t_steer", protocol.TaskStream("t_steer")
	s := time.Second
	raw := func(v any) json.RawMessage { b, _ := json.Marshal(v); return b }
	bash := func(ago time.Duration, c, d, out string) protocol.LogEvent {
		return f.tool(id, ago, "Bash", map[string]any{"command": c, "description": d}, true, out)
	}
	return []protocol.LogEvent{
		f.at(400*s, ts, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: f.w("修好 #11105：线程详情的工具和行菜单", "Fix #11105: thread details' tools and row menu"), Harness: "claude-code", Model: "opus", Project: "Mem",
			Place: protocol.Place{Kind: "none"}, Brief: f.w("修好 #11105，开 PR，贴前后截图。", "Fix #11105, open a PR, attach before and after shots."), Origin: "you"}),
		f.state(id, 400*s, protocol.Working),
		bash(395*s, "git fetch origin && git merge-base --is-ancestor origin/main HEAD", f.w("确认能干净合进 main", "Check it merges cleanly into main"), ""),
		f.tool(id, 390*s, "Read", map[string]any{"file_path": "src/thread/detail.tsx"}, true, ""),
		f.tool(id, 389*s, "Read", map[string]any{"file_path": "src/thread/row-menu.tsx"}, true, ""),
		f.tool(id, 388*s, "Read", map[string]any{"file_path": "src/thread/tools.ts"}, true, ""),
		f.at(380*s, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "user", From: "user", Text: f.w("这个工作，我们的 PR 是什么？", "For this work, what's our PR?"), Raw: raw(map[string]any{"delivered": "steer"})}),
		f.say(id, 370*s, f.w("PR 还没开。最后一轮检查发现工具解析有几处边界情况（here-string、引号里的 <<、CRLF），我先补上再推分支、开 PR。", "The PR isn't open yet. The last check found a few edge cases in the tool parser (here-strings, << in quotes, CRLF); I'm fixing them, then I push the branch and open the PR.")),
		f.tool(id, 360*s, "Edit", map[string]any{"file_path": "src/thread/tools.ts", "old_string": "const HERE = /<<(\\w+)/;", "new_string": "const HERE = /<<(?!<)-?\\s*['\"]?(\\w+)/;"}, true, ""),
		f.tool(id, 355*s, "Edit", map[string]any{"file_path": "src/thread/tools.ts", "old_string": "line.split('\\n')", "new_string": "line.split(/\\r?\\n/)"}, true, ""),
		bash(340*s, "bun test src/thread", f.w("跑线程的测试", "Run the thread tests"), "41 pass"),
		bash(320*s, "git push -u origin fix/11105-thread-detail && gh pr create --fill", f.w("推分支并开 PR", "Push the branch and open the PR"), "https://github.com/acme/mem/pull/11112"),
		f.say(id, 315*s, f.w("开好了：#11112，41 项测试都过了，截图也贴上了。", "Opened #11112: all 41 tests pass, and the screenshots are attached.")),
		f.at(314*s, ts, protocol.OriginTask, protocol.KindReport, protocol.Report{TaskID: id, State: "done", Summary: f.w("#11112 开好了，41 项测试通过。", "#11112 is open; 41 tests pass.")}),
		f.at(313*s, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "system", Text: "turn completed", Raw: raw(map[string]any{"kind": "turn_ended", "outcome": "completed"})}),
		f.state(id, 313*s, protocol.Done),
	}
}

func d585App(t *testing.T, lang i18n.Lang, before bool) (*App, *v2Fixture) {
	app, _ := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	f := &v2Fixture{ascFixture: ascFixture{app: app}, zh: lang == i18n.ZH}
	app.Receive(protocol.ServerFrame{T: "events", Events: append(f.d585Done(before), f.d585Steer()...)})
	return app, f
}

// The answer to the person's words is on screen with the turn folded: the
// steer's answer said before the work went on, and the finished task's.
func TestD585AnswerNeverFolded(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, f := d585App(t, lang, false)
		tt := ui.NewTesterWith(app.View, 1150, 1600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		app.OpenTask("t_steer")
		tt.Frame()
		tt.Frame()
		all := strings.Join(tt.Texts(), "\n")
		for _, want := range []string{f.w("PR 还没开", "The PR isn't open yet"), f.w("开好了：#11112", "Opened #11112")} {
			if !strings.Contains(all, want) {
				t.Fatalf("%s: %q not on screen with the turn folded:\n%s", lang, want, all)
			}
		}
		// The fold holds its steps only: no "messages" in its head.
		if strings.Contains(all, f.w("条消息", "message")) {
			t.Fatalf("%s: the fold of the person's turn still counts messages:\n%s", lang, all)
		}
		// Steps stay folded.
		if strings.Contains(all, "src/thread/tools.ts") {
			t.Fatalf("%s: a step shows while folded", lang)
		}
		app.OpenTask("t_done")
		tt.Frame()
		tt.Frame()
		all = strings.Join(tt.Texts(), "\n")
		if !strings.Contains(all, f.w("会影响一点", "A little.")) {
			t.Fatalf("%s: the answer to the question is not on screen:\n%s", lang, all)
		}
	}
}

// TestD585Shots: DUCTER_D585_SHOTS=<dir> (DUCTER_D585_PREFIX=before|after)
// writes the two tasks at 1150, zh and en, light and dark.
func TestD585Shots(t *testing.T) {
	dir := os.Getenv("DUCTER_D585_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_D585_SHOTS=<dir> to write the shots")
	}
	_ = os.MkdirAll(dir, 0o755)
	prefix := os.Getenv("DUCTER_D585_PREFIX")
	if prefix == "" {
		prefix = "after"
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			app, _ := d585App(t, lang, prefix == "before")
			tt := ui.NewTesterWith(app.View, 1150, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			tt.SetDark(dark)
			theme := map[bool]string{false: "light", true: "dark"}[dark]
			for _, id := range []string{"t_done", "t_steer"} {
				app.OpenTask(id)
				tt.Frame()
				tt.Frame()
				scrollTaskTo(app, id, 1)
				tt.Move(4, 890)
				tt.Frame()
				tt.Advance(time.Second)
				tt.Frame()
				fh, err := os.Create(filepath.Join(dir, fmt.Sprintf("%s-mac-%s-1150-%s-%s.png", prefix, id, lang, theme)))
				if err != nil {
					t.Fatal(err)
				}
				_ = png.Encode(fh, tt.Image())
				fh.Close()
			}
		}
	}
}
