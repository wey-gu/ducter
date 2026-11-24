package views

import (
	"encoding/json"
	"fmt"
	"image"
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

// D525: the opened task's steps, redrawn. Two real-shaped runs: an
// Antigravity (agy) task walking Mem's screens, still running (its own MCP
// naming, run_command, read_file with Path, invoke_subagent), and a Claude
// Code fix, finished, with a failed step, a subagent, three reads in a row
// and an edit. DUCTER_TRANSCRIPT_V2_SHOTS=<dir> writes the shots.

type v2Fixture struct {
	ascFixture
	zh bool
}

func (f *v2Fixture) w(z, e string) string {
	if f.zh {
		return z
	}
	return e
}

func (f *v2Fixture) tool(id string, ago time.Duration, name string, input any, ok bool, out string) protocol.LogEvent {
	raw, _ := json.Marshal(input)
	return f.at(ago, protocol.TaskStream(id), protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "tool", Tool: &protocol.ToolCall{Name: name, Input: raw, OK: &ok, Output: out}})
}

func (f *v2Fixture) say(id string, ago time.Duration, text string) protocol.LogEvent {
	return f.at(ago, protocol.TaskStream(id), protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "assistant", Text: text})
}

func (f *v2Fixture) think(id string, ago time.Duration, heads ...string) protocol.LogEvent {
	return f.at(ago, protocol.TaskStream(id), protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "assistant", Thinking: heads})
}

func (f *v2Fixture) you(id string, ago time.Duration, text string) protocol.LogEvent {
	return f.at(ago, protocol.TaskStream(id), protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "user", From: "user", Text: text})
}

func (f *v2Fixture) state(id string, ago time.Duration, att protocol.Attention) protocol.LogEvent {
	return f.at(ago, protocol.TaskStream(id), protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: att})
}

// agyTask is the author's own run: agy walking Mem's screens on the server,
// one turn done and a second under way.
func (f *v2Fixture) agyTask() []protocol.LogEvent {
	id, ts := "t_agy", protocol.TaskStream("t_agy")
	s := time.Second
	wt := "/root/ducter/worktrees/mem/用-agy-走查-mem-的界面和交互-11105"
	title := f.w("用 agy 走查 Mem 的界面和交互", "Walk Mem's screens and interactions with agy")
	brief := f.w("用 agy 把 Mem 桌面版的界面和交互走一遍：设置、搜索、记忆详情。看最近合进去的 PR 有没有把哪里弄坏，列出问题，先别改代码。",
		"Walk Mem's desktop screens and interactions with agy: Settings, Search, a memory's details. Check whether the recently merged PRs broke anything, list the problems, and don't change code yet.")
	cmd := func(ago time.Duration, line, summary, out string, ok bool) protocol.LogEvent {
		return f.tool(id, ago, "run_command", map[string]any{"CommandLine": line, "Cwd": wt, "toolSummary": summary}, ok, out)
	}
	read := func(ago time.Duration, p string) protocol.LogEvent {
		return f.tool(id, ago, "read_file", map[string]any{"Path": wt + "/" + p}, true, "")
	}
	return []protocol.LogEvent{
		f.at(420*s, ts, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: title, Harness: "antigravity", Model: "gemini-3.8-pro", Project: "Mem",
			Place: protocol.Place{Kind: "repo", Device: "local", RepoPath: "/root/ducter/repos/mem", Worktree: wt, Branch: "ducter/agy-mem-ui-walk", BaseBranch: "main"}, Brief: brief}),
		f.state(id, 420*s, protocol.Working),
		f.think(id, 410*s, f.w("先弄清最近合进去了什么", "Find out what was merged lately")),
		f.tool(id, 405*s, "mcp_ducter_log_read", map[string]any{"fromSeq": 0}, true, "{}"),
		f.tool(id, 400*s, "read_file", map[string]any{"Path": wt + "/README.md"}, true, ""),
		cmd(395*s, "gh auth status", "Check the GitHub CLI is signed in", "Logged in to github.com account nowledge-bot", true),
		f.tool(id, 390*s, "mcp_ducter_log_read", map[string]any{"fromSeq": 12}, true, "{}"),
		read(385*s, "apps/desktop/src/settings/SettingsPage.tsx"),
		read(383*s, "apps/desktop/src/search/SearchView.tsx"),
		cmd(370*s, "git fetch origin", "", "", true),
		cmd(360*s, "gh pr list --state merged --limit 10", "List the last merged PRs", "#1412 Search: keep the query on back\n#1409 Settings: one switch per row", true),
		cmd(352*s, "git show --stat 4f2a9c1", "", "apps/desktop/src/search/SearchView.tsx | 48 ++--", true),
		f.say(id, 345*s, f.w("最近合进去 10 个 PR，跟界面有关的是 #1412（搜索返回时保留关键词）和 #1409（设置页每行一个开关）。我分三路去走：设置、搜索、记忆详情。",
			"Ten PRs went in lately; the two that touch the screens are #1412 (Search keeps the query on back) and #1409 (Settings: one switch per row). I'll walk three paths at once: Settings, Search and a memory's details.")),
		f.tool(id, 340*s, "invoke_subagent", map[string]any{"Description": f.w("走查设置页：每个开关点一遍", "Walk Settings: try every switch"), "Prompt": "..."}, true, "done"),
		f.tool(id, 300*s, "invoke_subagent", map[string]any{"Description": f.w("走查搜索：输入、返回、再进", "Walk Search: type, go back, come in again"), "Prompt": "..."}, true, "done"),
		f.tool(id, 262*s, "invoke_subagent", map[string]any{"Description": f.w("走查记忆详情：打开、编辑、关掉", "Walk a memory's details: open, edit, close"), "Prompt": "..."}, true, "done"),
		f.say(id, 250*s, f.w("三路都走完了。设置页没问题；搜索返回后关键词在，但结果列表回到了顶上；记忆详情里编辑后按 Esc 会丢改动，没有提示。",
			"All three walked. Settings is fine; Search keeps the query on back but the results jump to the top; in a memory's details, Esc after an edit drops the change without asking.")),
		f.at(249*s, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "system", Text: "turn completed"}),
		f.you(id, 200*s, f.w("Esc 丢改动那个，看看是哪个 PR 弄的", "The Esc one: find which PR did it")),
		f.think(id, 195*s, f.w("找出 Esc 处理是谁改的", "Find who changed the Esc handling")),
		cmd(190*s, "git log --oneline -S onEscape -- apps/desktop/src/memory", "Find commits that touched onEscape", "9b1d2e0 Memory: close on Esc", true),
		read(184*s, "apps/desktop/src/memory/MemoryDetail.tsx"),
		read(182*s, "apps/desktop/src/memory/useEditBuffer.ts"),
		read(181*s, "apps/desktop/src/hooks/useKeys.ts"),
		f.tool(id, 170*s, "grep_search", map[string]any{"Query": "onEscape", "SearchPath": wt + "/apps/desktop/src"}, true, "MemoryDetail.tsx:88"),
		cmd(160*s, "gh pr view 1398 --json title,mergedAt", "", "{\"title\":\"Memory: close on Esc\"}", true),
		cmd(150*s, "bun test apps/desktop/src/memory", "Run the memory view's tests", "error: Cannot find module '@mem/ui-kit' from MemoryDetail.test.tsx", false),
		f.tool(id, 140*s, "invoke_subagent", map[string]any{"Description": f.w("在桌面版里重现 Esc 丢改动", "Reproduce the Esc data loss in the desktop app"), "Prompt": "..."}, true, ""),
	}
}

// claudeTask is a finished Claude Code fix with a failed step and a subagent.
func (f *v2Fixture) claudeTask() []protocol.LogEvent {
	id, ts := "t_cc", protocol.TaskStream("t_cc")
	s := time.Second
	root := "/Users/someone/dev/hawdb"
	title := f.w("修 compaction 偶发失败的测试", "Fix the flaky compaction test")
	brief := f.w("HawDB 里 compaction 那个偶发失败的测试，找到原因修好，跑 50 遍确认。", "Find why the compaction test in HawDB fails now and then, fix it, and run it 50 times to confirm.")
	bash := func(ago time.Duration, c, d, out string, ok bool) protocol.LogEvent {
		return f.tool(id, ago, "Bash", map[string]any{"command": c, "description": d}, ok, out)
	}
	return []protocol.LogEvent{
		f.at(600*s, ts, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: title, Harness: "claude-code", Model: "opus", Project: "HawDB",
			Place: protocol.Place{Kind: "repo", Device: "local", RepoPath: root, Branch: "ducter/compaction-fix", BaseBranch: "main"}, Brief: brief}),
		f.state(id, 600*s, protocol.Working),
		f.say(id, 595*s, f.w("先跑 50 遍看失败率。", "Running it 50 times first to see how often it fails.")),
		bash(590*s, "cd ~/dev/hawdb && for i in $(seq 50); do cargo test -p hawdb-storage compaction -q || break; done", "Run the compaction test 50 times", "test result: FAILED. 47 passed; 3 failed", false),
		f.tool(id, 560*s, "Read", map[string]any{"file_path": root + "/crates/storage/tests/compaction.rs"}, true, ""),
		f.tool(id, 558*s, "Read", map[string]any{"file_path": root + "/crates/storage/src/flush.rs"}, true, ""),
		f.tool(id, 556*s, "Read", map[string]any{"file_path": root + "/crates/storage/src/memtable.rs"}, true, ""),
		f.tool(id, 550*s, "Grep", map[string]any{"pattern": "sleep\\(Duration::from_millis", "path": "crates"}, true, "crates/storage/tests/compaction.rs:88"),
		f.think(id, 540*s, f.w("测试写死了等 200ms，flush 慢的时候就读早了", "The test sleeps a fixed 200 ms and reads too early when a flush is slow"), f.w("改成等 flush 的完成信号", "Wait on the flush's done signal instead")),
		f.tool(id, 470*s, "Agent", map[string]any{"description": f.w("查别的测试里有没有同样写死的等待", "Look for the same fixed sleep in other tests"), "prompt": "..."}, true, "2 more found"),
		f.tool(id, 465*s, "mcp__github__get_pull_request", map[string]any{"owner": "nowledge-co", "repo": "hawdb", "pull_number": 612}, true, "{}"),
		f.say(id, 460*s, f.w("失败的 3 次都是 flush 还没写完测试就去读了。改成等 flush 完成的信号，另外两个测试也有同样的写法，一起改。",
			"All 3 failures read before the flush finished. Switching to wait for the flush signal; two other tests do the same, so those too.")),
		f.tool(id, 450*s, "Edit", map[string]any{"file_path": root + "/crates/storage/tests/compaction.rs", "old_string": "thread::sleep(Duration::from_millis(200));", "new_string": "flush.wait_done();"}, true, ""),
		f.tool(id, 445*s, "Edit", map[string]any{"file_path": root + "/crates/storage/src/flush.rs", "old_string": "pub fn start(&self) {", "new_string": "pub fn start(&self) {\n        self.done.reset();"}, true, ""),
		f.tool(id, 430*s, "WebSearch", map[string]any{"query": "rust condvar wait_timeout spurious wakeup"}, true, ""),
		bash(380*s, "for i in $(seq 50); do cargo test -p hawdb-storage compaction -q || break; done", "Run it 50 times again", "50/50 ok", true),
		bash(340*s, "cargo clippy -p hawdb-storage -- -D warnings", "", "ok", true),
		bash(330*s, "git commit -am 'compaction test: wait for the flush signal'", "", "[ducter/compaction-fix a1c9e07]", true),
		f.say(id, 325*s, f.w("修好了：改成等 flush 完成的信号，连跑 50 遍全过，clippy 干净，提交在 ducter/compaction-fix。",
			"Fixed: it now waits for the flush signal; 50 runs in a row pass, clippy is clean, and it's committed on ducter/compaction-fix.")),
		f.at(324*s, ts, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: id, Role: "system", Text: "turn completed"}),
		f.state(id, 320*s, protocol.Done),
	}
}

func TestTranscriptV2Shots(t *testing.T) {
	dir := os.Getenv("DUCTER_TRANSCRIPT_V2_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_TRANSCRIPT_V2_SHOTS=<dir> to write the shots")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	prefix := os.Getenv("DUCTER_TRANSCRIPT_V2_PREFIX") // before / after
	if prefix == "" {
		prefix = "after"
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			for _, w := range []int{1150, 1400} {
				app, _ := iaApp(t, lang)
				app.Status = client.Connected
				app.LocaleFixed = true
				f := &v2Fixture{ascFixture: ascFixture{app: app}, zh: lang == i18n.ZH}
				evs := append(f.agyTask(), f.claudeTask()...)
				app.Receive(protocol.ServerFrame{T: "events", Events: evs})
				tt := ui.NewTesterWith(app.View, w, 1000, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				tt.SetDark(dark)
				theme := "light"
				if dark {
					theme = "dark"
				}
				shot := func(name string) {
					tt.Move(4, 990)
					tt.Frame()
					tt.Frame()
					tt.Advance(time.Second)
					tt.Frame()
					p := filepath.Join(dir, fmt.Sprintf("%s-mac-%s-%d-%s-%s.png", prefix, name, w, lang, theme))
					fh, err := os.Create(p)
					if err != nil {
						t.Fatal(err)
					}
					if err := png.Encode(fh, tt.Image()); err != nil {
						t.Fatal(err)
					}
					fh.Close()
				}
				crop := func(name string, r image.Rectangle) {
					if w != 1400 {
						return
					}
					tt.SetScale(2)
					tt.Frame()
					tt.Frame()
					img := tt.Image()
					sub := img.SubImage(image.Rect(r.Min.X*2, r.Min.Y*2, r.Max.X*2, r.Max.Y*2))
					fh, err := os.Create(filepath.Join(dir, fmt.Sprintf("%s-mac-%s-crop2x-%s-%s.png", prefix, name, lang, theme)))
					if err != nil {
						t.Fatal(err)
					}
					_ = png.Encode(fh, sub)
					fh.Close()
					tt.SetScale(1)
					tt.Frame()
				}
				app.OpenTask("t_agy")
				tt.Frame()
				tt.Frame()
				scrollTaskTo(app, "t_agy", 1)
				shot("live")
				crop("live", image.Rect(520, 490, 1190, 830))
				app.OpenTask("t_cc")
				tt.Frame()
				tt.Frame()
				shot("done")
				// Opened: the finished run's work.
				for _, x := range tt.Texts() {
					if strings.Contains(x, f.w("步", "steps")) || strings.HasPrefix(x, f.w("做了", "Worked for")) {
						_ = tt.Click(x)
						break
					}
				}
				tt.Frame()
				shot("done-open")
				crop("done-open", image.Rect(520, 320, 1190, 620))
			}
		}
	}
}
