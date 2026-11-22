package views

import (
	"strings"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D471: On hand on the author's real board. Names are said whole (a source's
// cut title untrailed, never cut inside a word); a raw tool line is never
// shown, a lock and an unknown error are said in the partner's words; a
// project whose tasks never started there is no project yet; the peek
// follows only the keys. The web checks the same (apps/web/test/d471.test.ts).
func TestD471Names(t *testing.T) {
	for in, want := range map[string]string{
		"Reconcile the orbit plugin's tail offsets with the…":  "Reconcile the orbit plugin's tail offsets",
		"A half-finished tag merge leaves no record of the…":   "A half-finished tag merge leaves no record",
		"tile_merge_response_tests fail intermittently under…": "tile_merge_response_tests fail intermittently",
		"为 Studio Mac 上的 Pi 安装 Lumen 插件并确认能读到记忆":               "为 Studio Mac 上的 Pi 安装 Lumen 插件并确认能读到记忆",
		"Fix the typo": "Fix the typo",
	} {
		if got := shortTitle(in); got != want {
			t.Errorf("shortTitle(%q) = %q, want %q", in, got, want)
		}
	}
	if got := sayName("Record the Ducter site on the phone and post it to X", 28); got != "Record the Ducter site on…" {
		t.Errorf("a Latin name is cut at a word's end: %q", got)
	}
	if got := sayName("A half-finished tag merge leaves no record of the…", 28); strings.Contains(got, "half-finished…") || strings.HasSuffix(strings.TrimSuffix(got, "…"), " ") {
		t.Errorf("never a fragment: %q", got)
	}
	if got := sayName("用手机把 Ducter 官网录一段屏发到 X", 28); got != "用手机把 Ducter 官网录一段…" {
		t.Errorf("a Han name is cut at a character: %q", got)
	}
	if peekWords("cp review-report-round235.json review/") != "" || peekWords("运行测试") != "运行测试" {
		t.Error("the peek says a step's words, never a cut command")
	}
}

// D471 round 2: a stop said as the partner; a repair under way stands at
// work; the same failed start again is one line with its tries.
func TestD471Round2(t *testing.T) {
	if !prNum.MatchString("up for review as PR #4420. CI is still running.") || !ciWords.MatchString("CI is still running") {
		t.Error("a PR waiting on CI is read from the task's own words")
	}
	failed := &store.Task{Card: &protocol.TaskCard{Attention: protocol.Failed, Mending: &protocol.Mending{Cls: "start", How: "clone_here", Name: "Studio Mac"}}}
	if how, name, ok := mendingOf(failed); !ok || how != "clone_here" || name != "Studio Mac" {
		t.Errorf("a repair under way: %q %q %v", how, name, ok)
	}
	if _, _, ok := mendingOf(&store.Task{Card: &protocol.TaskCard{Attention: protocol.Failed}}); ok {
		t.Error("a failure with no repair is the person's")
	}
	cant := &protocol.CantStart{Why: "no_folder", Computer: "Home Server", What: "lumen"}
	out := collapseStarts([]Block{
		{K: "note", Seq: 1, Say: "error_start", Cant: cant},
		{K: "note", Seq: 2, Say: "mend_reopen"},
		{K: "note", Seq: 3, Say: "error_start", Cant: cant},
		{K: "note", Seq: 4, Say: "error_start", Cant: cant},
	})
	if len(out) != 2 || out[1].Seq != 4 || out[1].Tries != 3 {
		t.Errorf("one line with three tries: %+v", out)
	}
}

func TestD471Stuck(t *testing.T) {
	if rawFailure("git worktree add failed: Preparing worktree\nfatal: Unable to create '/x/.git/worktrees/y/index.lock': File exists.") != "lock" {
		t.Error("a lock git left behind is named")
	}
	if rawFailure("fatal: not a git repository") != "unknown" || rawFailure("") != "" {
		t.Error("a raw error is unknown; nothing is nothing")
	}
	if !phoneStopped.MatchString("又试了一次，手机那边还是说这个任务的手机访问被停止了，没法接着操作。") {
		t.Error("a phone taken back, from the task's own report")
	}
	failed := func(cant *protocol.CantStart) *store.Task {
		return &store.Task{Card: &protocol.TaskCard{Attention: protocol.Failed, Cant: cant}}
	}
	if !neverStarted([]*store.Task{failed(&protocol.CantStart{Why: "no_repo"})}) {
		t.Error("a project whose one task never started there is no project yet")
	}
	if neverStarted([]*store.Task{failed(&protocol.CantStart{Why: "no_repo"}), failed(nil)}) || neverStarted(nil) {
		t.Error("a project with a task that started stays")
	}
}
