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

// The tasks the author tried v0.0.1 with (D127): Codex preparing App Store
// Connect (Chrome driven by its computer tool, a step that went wrong, saved
// progress, an ask answered with Go) and a code fix on Claude Code (ran,
// read, edited, the tests). Realistic words, both languages.
type ascFixture struct {
	app *App
	tt  *ui.Tester
	n   int64
}

func (f *ascFixture) at(ago time.Duration, stream string, origin protocol.Origin, kind string, body any) protocol.LogEvent {
	f.n++
	return protocol.NewEvent(f.n, time.Now().Add(-ago).UTC().Format(time.RFC3339Nano), "default", stream, origin, kind, body)
}

func appStoreTask(t *testing.T, lang i18n.Lang, answered bool) *ascFixture {
	t.Helper()
	app, _ := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	f := &ascFixture{app: app}
	zh := lang == i18n.ZH
	w := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	ok, no := true, false
	raw := func(v any) json.RawMessage { b, _ := json.Marshal(v); return b }
	id, ts := "t_asc", protocol.TaskStream("t_asc")
	title := w("准备 Ducter iOS 在 App Store Connect 上的上架资料（截图、描述、隐私问卷）", "Prepare Ducter iOS in App Store Connect (screenshots, description, privacy)")
	brief := w("把 Ducter iOS 0.0.1 在 App Store Connect 上的资料准备好：截图、描述、关键词和隐私问卷。要登录的时候停下来问我，不要提交审核。",
		"Get Ducter iOS 0.0.1 ready in App Store Connect: screenshots, description, keywords and the privacy questionnaire. Stop and ask me when it needs a sign-in; don't submit for review.")
	place := protocol.Place{Kind: "repo", Device: "local", RepoPath: "/Users/someone/dev/ducter", Branch: "ducter/app-store-connect", BaseBranch: "main"}
	tool := func(ago time.Duration, name string, input any, good *bool, out string) protocol.LogEvent {
		var in json.RawMessage
		if s, isStr := input.(string); isStr {
			in = raw(s)
		} else {
			in = raw(input)
		}
		return f.at(ago, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "tool", Tool: &protocol.ToolCall{Name: name, Input: in, OK: good, Output: out}})
	}
	say := func(ago time.Duration, text string) protocol.LogEvent {
		return f.at(ago, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "assistant", Text: text})
	}
	think := func(ago time.Duration, heads ...string) protocol.LogEvent {
		return f.at(ago, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "assistant", Thinking: heads})
	}
	m := time.Minute
	evs := []protocol.LogEvent{
		f.at(31*m, "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: w("帮我把 iOS 版在 App Store Connect 上的资料准备好，先别提交审核", "Get the iOS app ready in App Store Connect, but don't submit it for review yet")}),
		f.at(31*m, ts, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: title, Harness: "codex", Model: "gpt-5.5", Place: place, Brief: brief}),
		f.at(31*m, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "user", From: "runner", Text: "<brief>\n" + brief + "\n</brief>\n\nStart the task \"" + title + "\" now, following your task brief."}),
		f.at(31*m, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "system", From: "runner", Text: "session started"}),
		think(30*m, "Planning the App Store Connect prep"),
		say(30*m, w("先看看仓库里已有的元数据和截图，再去 App Store Connect。", "First a look at the metadata and screenshots already in the repo, then App Store Connect.")),
		tool(30*m, "commandExecution", "/bin/zsh -lc 'ls -la fastlane/metadata'", &ok, "en-US\nzh-Hans\nscreenshots"),
		tool(29*m, "commandExecution", "/bin/zsh -lc 'sed -n 1,80p fastlane/metadata/zh-Hans/description.txt'", &ok, "Ducter 是你自己部署的个人 AI……"),
		tool(29*m, "commandExecution", `/bin/zsh -lc "rg -n \"CFBundleShortVersionString\" apps/ios"`, &ok, "apps/ios/Info.plist:21: <string>0.0.1</string>"),
		tool(28*m, "commandExecution", `/bin/zsh -lc "set -a; source .env; set +a; xcrun altool --list-apps --apiKey $ASC_KEY_ID"`, &ok, "Ducter (app.ducter.ios)"),
		f.at(27*m, ts, protocol.OriginTask, protocol.KindCheckpoint, protocol.Checkpoint{TaskID: id, Text: w("描述和关键词的草稿写好了（中英两份）", "Description and keywords drafted, in Chinese and English")}),
		think(26*m, "Opening App Store Connect in Chrome"),
		tool(26*m, "mcp__computer__js", map[string]string{"code": "await app.launch('Google Chrome')"}, &ok, "ok"),
		tool(25*m, "mcp__computer__js", map[string]string{"code": "await app.pressKey('super+t'); await app.typeText('appstoreconnect.apple.com\\n');"}, &no,
			"The user changed '/Applications/Google Chrome.app'. Re-query the window state before acting, then try again.\n    at assertFresh (computer.js:88)"),
		tool(25*m, "mcp__computer__js", map[string]string{"code": "await page.goto('https://appstoreconnect.apple.com/login')"}, &ok, "navigated"),
		tool(24*m, "mcp__computer__js", map[string]string{"code": "const s = await app.screenshot()"}, &ok, "[image image/png]"),
		tool(24*m, "mcp__computer__js", map[string]string{"code": "const s = await app.screenshot()"}, &ok, "[image image/png]"),
		tool(24*m, "mcp__computer__js", map[string]any{"completion_summary": "Login page open."}, &ok, "Completion summary received."),
		tool(24*m, "mcp__ducter__checkpoint", map[string]string{"text": "x"}, &ok, ""),
		say(23*m, w("App Store Connect 停在 Apple ID 登录这一步。账号和密码我不碰，等你登录。", "App Store Connect is at the Apple ID sign-in. I won't touch your account or password; I'll wait for you to sign in.")),
		tool(23*m, "mcp__ducter__report_to_main", map[string]string{"state": "needs_input"}, &ok, ""),
		f.at(23*m, ts, protocol.OriginTask, protocol.KindReport, protocol.Report{TaskID: id, State: "needs_input",
			Summary: w("App Store Connect 要登录。Chrome 已经打开在登录页，描述、关键词和截图都准备好了，登录后我接着填，不会提交审核。",
				"App Store Connect needs a sign-in. Chrome is open at the login page; the description, keywords and screenshots are ready, and I'll fill them in after you sign in. Nothing gets submitted for review."),
			Questions: []protocol.Question{{ID: "q1", Text: w("在 Chrome 里登录一下 App Store Connect？登好了我接着填资料。", "Could you sign in to App Store Connect in Chrome? I'll carry on filling it in once you have."), Blocking: true, Default: w("等待你完成登录后继续。", "Wait for you to sign in, then continue."), Reversible: true}}}),
		f.at(23*m, "channel", protocol.OriginSystem, protocol.KindDecision, protocol.Decision{DecisionID: "d_asc", TaskID: id,
			Question: w("在 Chrome 里登录一下 App Store Connect？登好了我接着填资料。", "Could you sign in to App Store Connect in Chrome? I'll carry on filling it in once you have."),
			GoLabel:  w("等待你完成登录后继续。", "Wait for you to sign in, then continue."), DefaultOption: "go", Reversible: true,
			DefaultAt: time.Now().Add(7 * m).UTC().Format(time.RFC3339)}),
		f.at(23*m, ts, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: protocol.NeedsYou}),
	}
	if answered {
		evs = append(evs,
			f.at(12*m, "channel", protocol.OriginUser, protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: "d_asc", Option: "go", By: "user"}),
			f.at(12*m, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "user", From: "user", Text: "User says Go: " + w("等待你完成登录后继续。", "Wait for you to sign in, then continue.") + "."}),
			f.at(12*m, ts, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: protocol.Working}),
			think(11*m, "Checking the sign-in", "Filling in the app information"),
			tool(11*m, "mcp__computer__js", map[string]string{"code": "await page.goto('https://appstoreconnect.apple.com/apps/6739/distribution/ios/version/inflight')"}, &ok, "navigated"),
			say(10*m, w("登录好了。先填中文描述和关键词。", "Signed in. The Chinese description and keywords first.")),
			tool(10*m, "mcp__computer__js", map[string]string{"code": "await page.click('#description'); await page.fill('#description', desc)"}, &ok, "ok"),
			tool(9*m, "mcp__computer__js", map[string]string{"code": "await page.click('#keywords'); await page.fill('#keywords', kw)"}, &ok, "ok"),
			tool(8*m, "commandExecution", "/bin/zsh -lc 'python3 scripts/ios/shots.py --device iphone-6.9 --out build/shots'", &ok, "6 screenshots"),
			tool(6*m, "mcp__computer__js", map[string]string{"code": "await app.screenshot()"}, &ok, "[image image/png]"),
			f.at(5*m, ts, protocol.OriginTask, protocol.KindCheckpoint, protocol.Checkpoint{TaskID: id, Text: w("中文描述、关键词填好了；在传 6.9 寸截图", "Chinese description and keywords in; uploading the 6.9-inch screenshots")}),
			say(4*m, w("中文资料填好了，现在传 6.9 寸的 6 张截图，然后做隐私问卷。", "The Chinese text is in. Uploading the six 6.9-inch screenshots now, then the privacy questionnaire.")),
			tool(3*m, "mcp__computer__js", map[string]string{"code": "await page.setInputFiles('input[type=file]', files)"}, &ok, "ok"),
		)
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	tt := ui.NewTesterWith(app.View, 1280, 1700, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	tt.Frame()
	f.tt = tt
	return f
}

// A code task on Claude Code, done: words between Ran / Read / Edited lines.
func (f *ascFixture) addCodeTask(lang i18n.Lang) {
	zh := lang == i18n.ZH
	w := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	ok := true
	raw := func(v any) json.RawMessage { b, _ := json.Marshal(v); return b }
	id, ts := "t_flaky", protocol.TaskStream("t_flaky")
	m := time.Minute
	tool := func(ago time.Duration, name string, input any, out string) protocol.LogEvent {
		return f.at(ago, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "tool", Tool: &protocol.ToolCall{Name: name, Input: raw(input), OK: &ok, Output: out}})
	}
	say := func(ago time.Duration, text string) protocol.LogEvent {
		return f.at(ago, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "assistant", Text: text})
	}
	title := w("修 compaction 偶发失败的测试", "Fix the flaky compaction test")
	f.app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		f.at(58*m, ts, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: title, Harness: "claude-code", Model: "opus", Project: "HawDB",
			Place: protocol.Place{Kind: "repo", Device: "local", RepoPath: "/Users/someone/dev/hawdb", Branch: "ducter/compaction-fix", BaseBranch: "main"},
			Brief: w("HawDB 里 compaction 那个偶发失败的测试，找到原因修好，跑 50 遍确认。", "Find why the compaction test in HawDB fails now and then, fix it, and run it 50 times to confirm.")}),
		say(57*m, w("先跑 50 遍看失败率。", "Running it 50 times first to see how often it fails.")),
		tool(57*m, "Bash", map[string]string{"command": "cd ~/dev/hawdb && cargo test -p hawdb-storage compaction -- --test-threads=1"}, "test result: FAILED. 47 passed; 3 failed"),
		tool(55*m, "Read", map[string]string{"file_path": "/Users/someone/dev/hawdb/crates/storage/tests/compaction.rs"}, ""),
		tool(55*m, "Grep", map[string]string{"pattern": "sleep\\(Duration::from_millis", "path": "crates"}, "crates/storage/tests/compaction.rs:88"),
		tool(54*m, "Read", map[string]string{"file_path": "/Users/someone/dev/hawdb/crates/storage/src/flush.rs"}, ""),
		say(53*m, w("失败的 3 次都是 flush 还没写完测试就去读了：测试里写死了等 200ms。改成等 flush 完成的信号。", "All 3 failures read before the flush finished: the test sleeps a fixed 200 ms. Switching it to wait for the flush signal.")),
		tool(52*m, "Edit", map[string]string{"file_path": "/Users/someone/dev/hawdb/crates/storage/tests/compaction.rs"}, ""),
		tool(51*m, "Edit", map[string]string{"file_path": "/Users/someone/dev/hawdb/crates/storage/src/flush.rs"}, ""),
		tool(49*m, "Bash", map[string]string{"command": "for i in $(seq 50); do cargo test -p hawdb-storage compaction -q || break; done"}, "50/50 ok"),
		tool(47*m, "Bash", map[string]string{"command": "cargo clippy -p hawdb-storage -- -D warnings"}, "ok"),
		tool(46*m, "Bash", map[string]string{"command": "git commit -am 'compaction test: wait for the flush signal'"}, "[ducter/compaction-fix a1c9e07]"),
		f.at(45*m, ts, protocol.OriginTask, protocol.KindReport, protocol.Report{TaskID: id, State: "done",
			Summary:  w("修好了：测试写死等 200ms，flush 慢的时候就读早了。改成等 flush 完成的信号，跑了 50 遍全过。", "Fixed: the test slept a fixed 200 ms and read too early when a flush was slow. It now waits for the flush signal; 50 runs in a row pass."),
			Evidence: []protocol.EvidenceRef{{Kind: "test", Label: w("50 遍全过", "50/50 pass"), Ref: "cargo test"}, {Kind: "diff", Label: w("改了 2 个文件", "2 files changed"), Ref: "a1c9e07"}}}),
		f.at(45*m, ts, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: protocol.Done}),
		f.at(45*m, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "system", Text: "turn completed", Usage: &protocol.Usage{InputTokens: 820_000, CacheRead: 310_000, OutputTokens: 42_000}}),
	}})
	f.tt.Frame()
	f.tt.Frame()
}

func shotTo(t *testing.T, tt *ui.Tester, name string) {
	t.Helper()
	dir := os.Getenv("DUCTER_TRANSCRIPT_SHOTS")
	if dir == "" {
		return
	}
	tt.Move(4, 1690) // no hover left over from a click
	tt.Advance(time.Second)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	fh, err := os.Create(filepath.Join(dir, name+".png"))
	if err != nil {
		t.Fatal(err)
	}
	defer fh.Close()
	if err := png.Encode(fh, tt.Image()); err != nil {
		t.Fatal(err)
	}
}

// On hand's ask, at one glance: the short title, one question, the default
// as a ring and one caption, a short Go; no status paragraph, no meta line,
// no strip repeating it.
func TestOnHandAskAtOneGlance(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		f := appStoreTask(t, lang, false)
		f.addCodeTask(lang)
		f.app.Route = RouteOnHand
		f.tt.Frame()
		f.tt.Frame()
		all := texts(f.tt)
		for _, not := range []string{"Chrome 已经打开在登录页", "Chrome is open at the login page", "Codex · ", "接下来什么时候需要你", "When you'll be needed next", "等待你完成登录后继续。", "Wait for you to sign in, then continue. "} {
			if strings.Contains(all, not) {
				t.Errorf("%s: %q shows on the ask's card: %q", lang, not, all)
			}
		}
		goWord := map[i18n.Lang]string{i18n.ZH: "好", i18n.EN: "Go"}[lang]
		if count(f.tt, goWord) != 1 {
			t.Errorf("%s: the Go button isn't the short %q: %q", lang, goWord, all)
		}
		shotTo(t, f.tt, "onhand-ask-desktop-"+string(lang))
	}
}

// The opened task reads as a compact transcript: verbs and summaries, no
// raw JSON, no tool names, no internal relay text, no turn dividers, no
// empty Changes; who and how long at the bottom.
func TestOpenedTaskTranscript(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		f := appStoreTask(t, lang, true)
		f.app.OpenTask("t_asc")
		openStretches(f.app, "t_asc")
		f.tt.Frame()
		f.tt.Frame()
		all := texts(f.tt)
		for _, not := range []string{`{"code"`, "commandExecution", "completion_summary", "Completion summary received", "User says Go", "先做到这儿", "Stopped here for now", "还没有改动", "No changes yet", "/Users/someone", "mcp__", "js "} {
			if strings.Contains(all, not) {
				t.Errorf("%s: %q shows in the opened task", lang, not)
			}
		}
		want := map[i18n.Lang][]string{
			i18n.ZH: {"思考", "运行", "读取", "搜索", "出错", "xcrun altool", "在 Chrome 里打开 appstoreconnect.apple.com/login", "在 Chrome 里按 ⌘T", "好", "Codex · gpt-5.5", "在做", "Ducter 交给它的事", "保存了进度"},
			i18n.EN: {"Thinking", "Ran", "Read", "Searched", "Error", "xcrun altool", "Opened appstoreconnect.apple.com/login in Chrome", "Pressed ⌘T in Chrome", "Go", "Codex · gpt-5.5", "Working", "What Ducter asked", "Progress saved"},
		}[lang]
		for _, w := range want {
			if !strings.Contains(all, w) {
				t.Errorf("%s: no %q in the opened task: %q", lang, w, all)
			}
		}
		shotTo(t, f.tt, "task-asc-desktop-"+string(lang))
		// The error opens onto what it printed.
		if err := f.tt.Click(map[i18n.Lang]string{i18n.ZH: "在 Chrome 里按 ⌘T", i18n.EN: "Pressed ⌘T in Chrome"}[lang]); err != nil {
			t.Fatal(err)
		}
		f.tt.Frame()
		if !strings.Contains(texts(f.tt), "Re-query the window state") {
			t.Errorf("%s: the error's raw text doesn't open", lang)
		}
		shotTo(t, f.tt, "task-asc-error-open-desktop-"+string(lang))

		f.addCodeTask(lang)
		f.app.OpenTask("t_flaky")
		openStretches(f.app, "t_flaky")
		f.tt.Frame()
		f.tt.Frame()
		all = texts(f.tt)
		for _, w := range []string{"cargo test", "tests/compaction.rs", "src/flush.rs", "cargo clippy", "git commit", "Claude Code · Opus"} {
			if !strings.Contains(all, w) {
				t.Errorf("%s: no %q in the code task: %q", lang, w, all)
			}
		}
		shotTo(t, f.tt, "task-code-desktop-"+string(lang))
	}
}
