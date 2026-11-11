package views

import (
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/hints"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D202: the author's setup. The home is the server hel (Codex only); this
// Mac is its worker ("Macbook Pro M3") with Claude Code. A folder on hel
// still offers Claude Code, on the Mac; picking it switches to the repo's
// copy there, or opens the folder list on the Mac's places. Under the
// chosen agent, its Model and Effort rows; the frame carries them only
// when they differ from the defaults, and they are remembered per agent.

var (
	tuneHelRepo  = protocol.PlaceChoice{Place: protocol.Place{Kind: "repo", Device: "local", RepoPath: "/root/ducter"}, Name: "ducter", DefaultBranch: "main", Branches: []string{"main", "next"}, Remote: "github.com/wey-gu/ducter", Computer: "hel"}
	tuneMacRepo  = protocol.PlaceChoice{Place: protocol.Place{Kind: "repo", Device: "dev_mac", RepoPath: "/Users/weyl/dev/ducter"}, Name: "ducter", DefaultBranch: "main", Branches: []string{"main", "next"}, Remote: "github.com/wey-gu/ducter", Added: true, Computer: "Macbook Pro M3"}
	tuneMacNotes = protocol.PlaceChoice{Place: protocol.Place{Kind: "folder", Device: "dev_mac", Path: "/Users/weyl/notes"}, Name: "notes", Added: true, Computer: "Macbook Pro M3"}
	tuneNone     = protocol.PlaceChoice{Place: protocol.Place{Kind: "none"}}
	allEfforts   = []string{"low", "medium", "high", "xhigh", "max"}
)

func tuneCandsAtHel() []protocol.Candidate {
	return []protocol.Candidate{
		{Harness: "codex", Reason: protocol.CandidateReason{Kind: "fit"}, Device: "local", DeviceName: "hel"},
		{Harness: "claude-code", Model: "opus", Reason: protocol.CandidateReason{Kind: "fit"}, Blocked: "elsewhere", Device: "dev_mac", DeviceName: "Macbook Pro M3"},
		{Harness: "codex", Reason: protocol.CandidateReason{Kind: "fit"}, Blocked: "elsewhere", Device: "dev_mac", DeviceName: "Macbook Pro M3"},
		{Harness: "claude-code", Model: "opus", Reason: protocol.CandidateReason{Kind: "fit"}, Blocked: "not_installed", Device: "local", DeviceName: "hel"},
	}
}

func tuneCandsAtMac() []protocol.Candidate {
	return []protocol.Candidate{
		{Harness: "claude-code", Model: "opus", Reason: protocol.CandidateReason{Kind: "fit"}, Device: "dev_mac", DeviceName: "Macbook Pro M3"},
		{Harness: "claude-code", Model: "sonnet", Reason: protocol.CandidateReason{Kind: "fast"}, Device: "dev_mac", DeviceName: "Macbook Pro M3"},
		{Harness: "codex", Reason: protocol.CandidateReason{Kind: "fit"}, Device: "dev_mac", DeviceName: "Macbook Pro M3"},
	}
}

func tuneModels() []protocol.AgentModels {
	return []protocol.AgentModels{
		{Harness: "claude-code", Device: "dev_mac", From: "live", Models: []protocol.ModelChoice{
			{ID: "opus", Label: "Opus 5.5", Suggested: true, Efforts: allEfforts},
			{ID: "sonnet", Label: "Sonnet 5.5", Efforts: allEfforts},
			{ID: "haiku", Label: "Haiku 5.5", Efforts: allEfforts},
		}},
		{Harness: "codex", Device: "local", From: "live", Models: []protocol.ModelChoice{
			{ID: "gpt-6.1-terra", Label: "GPT-6.1 Terra", Suggested: true, Default: true, Efforts: append(allEfforts, "ultra"), DefaultEffort: "low"},
			{ID: "gpt-6-luna", Label: "GPT-6-Luna", Efforts: allEfforts, DefaultEffort: "medium"},
		}},
	}
}

func tuneApp(t *testing.T, lang i18n.Lang, places []protocol.PlaceChoice, cands []protocol.Candidate) (*App, *[]any) {
	t.Helper()
	app, sent, _ := tuneAppUI(t, lang, places, cands)
	return app, sent
}

func tuneAppUI(t *testing.T, lang i18n.Lang, places []protocol.PlaceChoice, cands []protocol.Candidate) (*App, *[]any, *ui.Tester) {
	t.Helper()
	app, sent, tt := newTaskApp(t, lang)
	app.Local = hints.Open(t.TempDir())
	app.Receive(protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{
		{ID: "local", Name: "hel", Kind: "server", Home: true, State: protocol.DeviceAwake},
		{ID: "dev_mac", Name: "Macbook Pro M3", Kind: "laptop", State: protocol.DeviceAwake, Platform: "darwin-arm64"},
	}})
	app.OpenNewTask(nil)
	app.Receive(protocol.ServerFrame{T: "task_new_options", Places: places, Candidates: cands, Models: tuneModels()})
	tt.Frame()
	return app, sent, tt
}

// The card drawn: Who on hel's folder lists Claude Code on the Mac; on the
// Mac's copy, the chosen agent shows its Model and Effort rows.
func TestNewTaskTuneDrawn(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _, tt := tuneAppUI(t, lang, []protocol.PlaceChoice{tuneHelRepo, tuneMacRepo, tuneNone}, tuneCandsAtHel())
		L := app.L
		app.nt.words = map[i18n.Lang]string{i18n.ZH: "把登录页的闪退修掉", i18n.EN: "Fix the login page crash"}[lang]
		cd, _ := app.chosenCandidate(app.S.NewTaskOptions.Candidates)
		click(t, tt, L.T("newtask.who")+" · "+app.whoLabel(*cd))
		for _, s := range []string{L.T("newtask.agent.elsewhere", "Macbook Pro M3"), L.T("newtask.agent.copy", "Macbook Pro M3", "ducter"), "GPT-6.1 Terra", L.T("newtask.effort")} {
			if !tt.HasText(s) {
				t.Errorf("%s: no %q: %q", lang, s, tt.Texts())
			}
		}
		newTaskShot(t, tt, "tune-hel-folder-"+string(lang))
		app.nt.whoOpen = false
		app.OpenNewTask(nil)
		app.Receive(protocol.ServerFrame{T: "task_new_options", Places: []protocol.PlaceChoice{tuneMacRepo, tuneHelRepo, tuneNone}, Candidates: tuneCandsAtMac(), Models: tuneModels()})
		tt.Frame()
		cd, _ = app.chosenCandidate(app.S.NewTaskOptions.Candidates)
		click(t, tt, L.T("newtask.who")+" · "+app.whoLabel(*cd))
		for _, s := range []string{L.T("newtask.model"), "Opus 5.5", "Sonnet 5.5", L.T("newtask.effort"), L.T("effort.xhigh")} {
			if !tt.HasText(s) {
				t.Errorf("%s: no %q under Claude Code: %q", lang, s, tt.Texts())
			}
		}
		click(t, tt, "Sonnet 5.5")
		click(t, tt, L.T("effort.high"))
		if got := app.whoLabel(*cd); got != "Claude Code · Sonnet 5.5 · "+L.T("effort.high") {
			t.Errorf("%s: picked by clicking: %q", lang, got)
		}
		newTaskShot(t, tt, "tune-mac-claude-"+string(lang))
	}
}

func TestNewTaskAgentOnAnotherComputer(t *testing.T) {
	app, sent := tuneApp(t, i18n.ZH, []protocol.PlaceChoice{tuneHelRepo, tuneMacRepo, tuneNone}, tuneCandsAtHel())
	rows, elsewhere := app.ntCands(app.S.NewTaskOptions.Candidates)
	if len(rows) != 2 || rows[0].Harness != "codex" || rows[1].Harness != "claude-code" || rows[1].Device != "dev_mac" || !elsewhere["dev_mac|claude-code"] {
		t.Fatalf("hel's folder: Codex on hel, then Claude Code on the Mac: %+v %v", rows, elsewhere)
	}
	if got := app.L.T("newtask.agent.elsewhere", rows[1].DeviceName); got != "在 Macbook Pro M3 上" {
		t.Errorf("the tag: %q", got)
	}
	if cd, picked := app.chosenCandidate(app.S.NewTaskOptions.Candidates); cd == nil || cd.Harness != "codex" || picked {
		t.Fatalf("Codex stays the suggestion: %+v %v", cd, picked)
	}
	if line := app.awayLine(rows[1], tuneHelRepo); line != "会换到 Macbook Pro M3 上的 ducter" {
		t.Errorf("its helper line: %q", line)
	}
	// Picking it: the Mac's copy of the same repo (same origin), the same branch.
	app.nt.branch = "next"
	top := topCandidate(rows)
	app.pickAgent(rows[1], top, true)
	if got := app.chosenPlace(app.newTaskPlaces()).Place; got.Device != "dev_mac" || got.RepoPath != "/Users/weyl/dev/ducter" {
		t.Fatalf("switched to the Mac's copy: %+v", got)
	}
	if app.nt.branch != "next" || app.nt.pick != "dev_mac|claude-code" {
		t.Errorf("branch %q, pick %q", app.nt.branch, app.nt.pick)
	}
	if o, ok := lastFrame[protocol.TaskNewOptions](sent); !ok || o.Place == nil || o.Place.Device != "dev_mac" {
		t.Errorf("asked who could at the Mac's copy: %+v", o)
	}
	app.Receive(protocol.ServerFrame{T: "task_new_options", Places: []protocol.PlaceChoice{tuneHelRepo, tuneMacRepo, tuneNone}, Candidates: tuneCandsAtMac(), Models: tuneModels()})
	cd, _ := app.chosenCandidate(app.S.NewTaskOptions.Candidates)
	if cd == nil || cd.Harness != "claude-code" || cd.Device != "dev_mac" {
		t.Fatalf("Claude Code on the Mac is who: %+v", cd)
	}
	app.nt.words = "修一下登录页"
	if !app.StartNewTask() {
		t.Fatal("didn't start")
	}
	f, _ := lastFrame[protocol.TaskNew](sent)
	if f.Place == nil || f.Place.Device != "dev_mac" || f.Place.BaseBranch != "next" || f.Model != "" || f.Effort != "" {
		t.Errorf("task_new: %+v", f)
	}
}

func TestNewTaskAgentNeedsAFolderThere(t *testing.T) {
	app, sent := tuneApp(t, i18n.EN, []protocol.PlaceChoice{tuneHelRepo, tuneMacNotes, tuneNone}, tuneCandsAtHel())
	rows, _ := app.ntCands(app.S.NewTaskOptions.Candidates)
	if line := app.awayLine(rows[1], tuneHelRepo); line != "The folder must be on Macbook Pro M3" {
		t.Errorf("no copy there: %q", line)
	}
	app.pickAgent(rows[1], topCandidate(rows), true)
	if !app.nt.placeOpen || app.nt.placeOnly != "dev_mac" || app.nt.pending != "dev_mac|claude-code" {
		t.Fatalf("the folder list on the Mac's places: %+v", app.nt)
	}
	app.pickPlace(tuneMacNotes)
	if app.nt.pick != "dev_mac|claude-code" || app.nt.placeOnly != "" {
		t.Errorf("a folder there picks it: %+v", app.nt)
	}
	if o, ok := lastFrame[protocol.TaskNewOptions](sent); !ok || o.Place == nil || o.Place.Path != "/Users/weyl/notes" {
		t.Errorf("asked at the Mac's folder: %+v", o)
	}
}

func TestSameRepo(t *testing.T) {
	a := protocol.PlaceChoice{Place: protocol.Place{Kind: "repo", RepoPath: "/root/ducter"}}
	b := protocol.PlaceChoice{Place: protocol.Place{Kind: "repo", RepoPath: "/Users/w/ducter/"}}
	if !sameRepo(a, b) {
		t.Error("no remotes known: the exact folder name matches")
	}
	a.Remote = "github.com/x/ducter"
	if sameRepo(a, b) {
		t.Error("one remote known, the other not: no match")
	}
	b.Remote = "github.com/y/ducter"
	if sameRepo(a, b) {
		t.Error("two remotes that differ: no match")
	}
}

func TestNewTaskModelAndEffort(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent := tuneApp(t, lang, []protocol.PlaceChoice{tuneMacRepo, tuneNone}, tuneCandsAtMac())
		cd, _ := app.chosenCandidate(app.S.NewTaskOptions.Candidates)
		tu := app.ntTune(cd)
		if tu.model == nil || tu.model.ID != "opus" || tu.effort != "" {
			t.Fatalf("%s: defaults: %+v", lang, tu)
		}
		app.pickTune(*cd, "model", "sonnet")
		app.pickTune(*cd, "effort", "high")
		want := map[i18n.Lang]string{i18n.ZH: "Claude Code · Sonnet 5.5 · 高", i18n.EN: "Claude Code · Sonnet 5.5 · High"}[lang]
		if got := app.whoLabel(*cd); got != want {
			t.Errorf("%s: the pill: %q", lang, got)
		}
		app.nt.words = "Think hard about the cache."
		app.StartNewTask()
		f, _ := lastFrame[protocol.TaskNew](sent)
		if f.Harness != "claude-code" || f.Model != "sonnet" || f.Effort != "high" {
			t.Errorf("%s: task_new: %+v", lang, f)
		}
		app.S.NewTaskResults = []protocol.ServerFrame{{T: "task_new_result", ClientID: f.ClientID, Reason: "offline"}}
		app.drainNewTask()
		// The next card remembers both for Claude Code.
		app.nt.open = false
		app.OpenNewTask(nil)
		app.Receive(protocol.ServerFrame{T: "task_new_options", Places: []protocol.PlaceChoice{tuneMacRepo, tuneNone}, Candidates: tuneCandsAtMac(), Models: tuneModels()})
		cd, _ = app.chosenCandidate(app.S.NewTaskOptions.Candidates)
		if tu := app.ntTune(cd); tu.model == nil || tu.model.ID != "sonnet" || tu.effort != "high" {
			t.Errorf("%s: remembered: %+v", lang, tu)
		}
		// Back to the model's own default effort.
		app.pickTune(*cd, "effort", "default")
		if tu := app.ntTune(cd); tu.effort != "" {
			t.Errorf("%s: default effort: %q", lang, tu.effort)
		}
	}
	// Codex lists its own default effort: that is the default, and isn't sent.
	app, sent := tuneApp(t, i18n.ZH, []protocol.PlaceChoice{tuneHelRepo, tuneNone}, tuneCandsAtHel()[:1])
	cd, _ := app.chosenCandidate(app.S.NewTaskOptions.Candidates)
	if tu := app.ntTune(cd); tu.model == nil || tu.model.ID != "gpt-6.1-terra" || tu.effort != "low" || app.whoLabel(*cd) != "Codex · GPT-6.1 Terra · 低" {
		t.Fatalf("Codex's defaults: %+v %q", tu, app.whoLabel(*cd))
	}
	app.nt.words = "x"
	app.StartNewTask()
	if f, _ := lastFrame[protocol.TaskNew](sent); f.Harness != "" || f.Effort != "" || f.Model != "" {
		t.Errorf("nothing extra for the defaults: %+v", f)
	}
}

func TestEffortWords(t *testing.T) {
	app, _, _ := newTaskApp(t, i18n.ZH)
	zh := []string{}
	for _, e := range []string{"low", "medium", "high", "xhigh", "max", "ultra", "turbo"} {
		zh = append(zh, app.effortWord(e))
	}
	if got := zh; got[0] != "低" || got[1] != "中" || got[2] != "高" || got[3] != "很高" || got[4] != "最高" || got[5] != "极限" || got[6] != "turbo" {
		t.Errorf("zh effort words: %q", got)
	}
}
