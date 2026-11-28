package views

// D661 (research/245 §3.3): the Mac reads the snapshot's one derived state. These tests
// build an On hand snapshot with OnHand.Truth and the cards beside it, then check every surface
// this change touches: the strip's counts (all and each lens), a needs-you row's line, the raw
// report behind 它说, a task held under another row leaving the board, and the holder's facts.

import (
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// snapshotCard is one task card of the snapshot, with core's derived state on it.
func snapshotCard(id string, att protocol.Attention, projectKey string) protocol.TaskCard {
	now := time.Now().UTC().Format(time.RFC3339)
	return protocol.TaskCard{
		TaskID: id, Persona: "default", Title: "任务 " + id,
		ProjectKey: projectKey,
		Place:      protocol.Place{Kind: "none"},
		Harness:    "codex", Attention: att, OpenedAt: now, UpdatedAt: now,
	}
}

// truthItem is one row of the snapshot's truth, with the facts the Mac reads.
func truthItem(state protocol.TruthState, projectKey, waitsFor string, taskID string) protocol.TruthItem {
	it := protocol.TruthItem{TaskTruth: protocol.TaskTruth{State: state, WaitsFor: waitsFor}, TaskID: taskID, ProjectKey: projectKey}
	return it
}

// snapshotApp applies one On hand snapshot, with its one truth, to a fresh app.
func snapshotApp(t *testing.T, lang i18n.Lang, cards []protocol.TaskCard, truth *protocol.OnHandTruth) *App {
	t.Helper()
	app, _ := iaApp(t, lang)
	app.LocaleFixed = true
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: cards, Truth: truth}})
	return app
}

// snapshotTruth is the truth every count test stands on: two needs-you tasks, a partner's own
// question and another partner's ask; a call and a task at work; a task and a task-less wait
// waiting; one done today and one yesterday; one failed.
func snapshotTruth() *protocol.OnHandTruth {
	return &protocol.OnHandTruth{
		NeedsYou: []protocol.TruthItem{
			truthItem(protocol.TruthNeedsYou, "proj-a", "「#42」可以合并了，等你到 GitHub 上合并。", "pr-ready"),
			truthItem(protocol.TruthNeedsYou, "", "现在发出去吗？", "ask-me"),
			{TaskTruth: protocol.TaskTruth{State: protocol.TruthNeedsYou, WaitsFor: "选哪一个？"}, DecisionID: "dec1", Persona: "default", Line: "选哪一个？"},
			{TaskTruth: protocol.TaskTruth{State: protocol.TruthNeedsYou, WaitsFor: "小玛问你。"}, AskID: "ask-p2", Persona: "p2"},
		},
		Working: []protocol.TruthItem{
			truthItem(protocol.TruthWorking, "proj-a", "", "work"),
			{TaskTruth: protocol.TaskTruth{State: protocol.TruthWorking}, CallID: "call1", Persona: "default"},
			{TaskTruth: protocol.TaskTruth{State: protocol.TruthWorking}, TaskID: "setup", ProjectGroup: "computer"},
		},
		Waiting: []protocol.TruthItem{
			truthItem(protocol.TruthWaiting, "", "", "wait"),
			{TaskTruth: protocol.TaskTruth{State: protocol.TruthWaiting, Wait: &protocol.TruthWait{Name: "在等 CI。"}}, WaiterID: "w1"},
		},
		Stopped: []protocol.TruthItem{
			truthItem(protocol.TruthStopped, "", "", "stop"),
		},
		Done: []protocol.TruthItem{
			{TaskTruth: protocol.TaskTruth{State: protocol.TruthDone}, TaskID: "done-today", ProjectKey: "proj-a", DoneToday: true},
			{TaskTruth: protocol.TaskTruth{State: protocol.TruthDone}, TaskID: "done-yesterday", ProjectKey: "proj-a", DoneToday: false},
		},
		Failed: []protocol.TruthItem{
			truthItem(protocol.TruthFailed, "", "", "failed"),
		},
	}
}

// snapshotCards are the cards that go with snapshotTruth, plus one held under another row's PR.
// Each card carries core's own Truth too, the way the snapshot sends it.
func snapshotCards() []protocol.TaskCard {
	cards := []protocol.TaskCard{
		decorate(snapshotCard("pr-ready", protocol.NeedsYou, "proj-a"), protocol.TruthNeedsYou, "「#42」可以合并了，等你到 GitHub 上合并。"),
		decorate(snapshotCard("ask-me", protocol.NeedsYou, ""), protocol.TruthNeedsYou, "现在发出去吗？"),
		decorate(snapshotCard("work", protocol.Working, "proj-a"), protocol.TruthWorking, ""),
		setupCard(),
		decorate(snapshotCard("wait", protocol.Blocked, ""), protocol.TruthWaiting, ""),
		decorate(snapshotCard("stop", protocol.Blocked, ""), protocol.TruthStopped, ""),
		decorate(snapshotCard("done-today", protocol.Done, "proj-a"), protocol.TruthDone, ""),
		decorate(snapshotCard("done-yesterday", protocol.Done, "proj-a"), protocol.TruthDone, ""),
		decorate(snapshotCard("failed", protocol.Failed, ""), protocol.TruthFailed, ""),
	}
	// A PR appears once, under its holder: this card is the copy that leaves the board.
	held := decorate(snapshotCard("held", protocol.Blocked, "proj-a"), protocol.TruthWaiting, "")
	held.HeldUnder = &protocol.HeldUnder{Ref: "proj-a#42", TaskID: "pr-ready"}
	cards = append(cards, held)
	return cards
}

// decorate puts core's derived state on the card itself, as the snapshot does.
func decorate(card protocol.TaskCard, state protocol.TruthState, waitsFor string) protocol.TaskCard {
	card.Truth = &protocol.TaskTruth{State: state, WaitsFor: waitsFor}
	return card
}

// setupCard is a keyless computer set-up: its truth row is the 电脑上的事 lens by ProjectGroup.
func setupCard() protocol.TaskCard {
	card := decorate(snapshotCard("setup", protocol.Working, ""), protocol.TruthWorking, "")
	card.ProjectGroup = "computer"
	return card
}

func TestTruthSnapshotCounts(t *testing.T) {
	app := snapshotApp(t, i18n.ZH, snapshotCards(), snapshotTruth())
	on := snapshotTruth()

	// The strip's four counts are the truth's own lists: needs you, working, waiting, done today.
	all := app.stateCounts(app.S.Board(), "")
	want := [4]int{len(on.NeedsYou), len(on.Working), len(on.Waiting), 1}
	if all != want {
		t.Fatalf("all: strip %v, truth %v", all, want)
	}
	// A project's lens counts the items core stamped with its key.
	if got, want := app.stateCounts(app.S.Board(), "proj-a"), [4]int{1, 1, 0, 1}; got != want {
		t.Fatalf("proj-a: strip %v, want %v", got, want)
	}
	// 不在项目里 / Not in a project is the items core stamped no key and no computer group: the
	// two needs-you tasks' one (a decision and another partner's ask have no task), the call at
	// work, and both waits.
	if got, want := app.stateCounts(app.S.Board(), lensOther), [4]int{3, 1, 2, 0}; got != want {
		t.Fatalf("not in a project: strip %v, want %v", got, want)
	}
	// 电脑上的事 / On your computers is core's computer group alone.
	if got, want := app.stateCounts(app.S.Board(), lensComputers), [4]int{0, 1, 0, 0}; got != want {
		t.Fatalf("on your computers: strip %v, want %v", got, want)
	}
}

func TestTruthSnapshotNeedsYouRow(t *testing.T) {
	app := snapshotApp(t, i18n.ZH, snapshotCards(), snapshotTruth())
	task := app.S.Task("pr-ready")
	if task == nil {
		t.Fatal("the card is not in the store")
	}
	if att := task.Attention(); att != protocol.NeedsYou {
		t.Fatalf("the truth says needs_you; the task reads %q", att)
	}
	if s := app.storyOf(task); s.words != "「#42」可以合并了，等你到 GitHub 上合并。" || s.said {
		t.Fatalf("the needs-you row does not show its waitsFor: %+v", s)
	}
	items := app.needsYouIn(app.S.Board(), false)
	found := false
	for _, it := range items {
		if it.task != nil && it.task.ID == "pr-ready" {
			found = true
		}
	}
	if !found {
		t.Fatalf("the needs-you count does not hold the truth's row: %+v", items)
	}
}

func TestTruthSnapshotRawReportSaid(t *testing.T) {
	card := decorate(snapshotCard("raw", protocol.Done, "proj-a"), protocol.TruthDone, "")
	card.LastReport = &protocol.Report{Summary: "我把这一版整理好了。\n还有两处等你定。"}
	truth := &protocol.OnHandTruth{Done: []protocol.TruthItem{{TaskTruth: protocol.TaskTruth{State: protocol.TruthDone}, TaskID: "raw", ProjectKey: "proj-a", DoneToday: true}}}

	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app := snapshotApp(t, lang, []protocol.TaskCard{card}, truth)
		s := app.storyOf(app.S.Task("raw"))
		want := app.L.T("onhand.said", "我把这一版整理好了。")
		if s.words != want || !s.said {
			t.Fatalf("%s: the raw report is not said behind 它说: %+v, want %q", lang, s, want)
		}
	}

	// A gist replaces the raw words outright: the person-language line is the row's.
	gistCard := decorate(snapshotCard("gist", protocol.Done, "proj-a"), protocol.TruthDone, "")
	gistCard.LastReport = &protocol.Report{Summary: "raw long words"}
	gistCard.Gist = &protocol.TaskGist{Text: "这一版我理好了。", At: time.Now().UTC().Format(time.RFC3339), ReportSeq: 4}
	gistTruth := &protocol.OnHandTruth{Done: []protocol.TruthItem{{TaskTruth: protocol.TaskTruth{State: protocol.TruthDone}, TaskID: "gist", ProjectKey: "proj-a", DoneToday: true}}}
	app := snapshotApp(t, i18n.ZH, []protocol.TaskCard{gistCard}, gistTruth)
	if s := app.storyOf(app.S.Task("gist")); s.words != "这一版我理好了。" || s.said {
		t.Fatalf("the gist is not the row's line: %+v", s)
	}
}

func TestTruthSnapshotHeldUnderOffBoard(t *testing.T) {
	app := snapshotApp(t, i18n.ZH, snapshotCards(), snapshotTruth())
	if app.S.Task("held") == nil {
		t.Fatal("the held card is not in the store")
	}
	for _, lane := range app.S.Board().Lanes {
		for _, x := range lane {
			if x.ID == "held" {
				t.Fatalf("a card held under another row is on the board: %q", x.ID)
			}
		}
	}
}

func TestTruthSnapshotHolderAttrs(t *testing.T) {
	card := decorate(snapshotCard("holder", protocol.Working, "proj-a"), protocol.TruthWorking, "")
	card.Holders = []protocol.TruthAttr{
		{Role: "author", TaskID: "author", Harness: "antigravity", Device: "MacBook"},
		{Role: "review", Keep: "hel"},
		{Role: "handoff", To: "小玛"},
	}
	truth := &protocol.OnHandTruth{Working: []protocol.TruthItem{{TaskTruth: protocol.TaskTruth{State: protocol.TruthWorking}, TaskID: "holder", ProjectKey: "proj-a"}}}

	zh := snapshotApp(t, i18n.ZH, []protocol.TaskCard{card}, truth)
	got := zh.whereMeta(zh.S.Task("holder"))
	want := []string{"作者：MacBook 上的 Antigravity", "复审：hel", "交给：小玛"}
	if len(got) != len(want) {
		t.Fatalf("zh: holder facts %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("zh: holder facts %v, want %v", got, want)
		}
	}

	en := snapshotApp(t, i18n.EN, []protocol.TaskCard{card}, truth)
	got = en.whereMeta(en.S.Task("holder"))
	want = []string{"By Antigravity on MacBook", "Review: hel", "Handed to 小玛"}
	if len(got) != len(want) {
		t.Fatalf("en: holder facts %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("en: holder facts %v, want %v", got, want)
		}
	}
}

func TestTruthSnapshotWordsZHAndEN(t *testing.T) {
	zh, _ := iaApp(t, i18n.ZH)
	en, _ := iaApp(t, i18n.EN)
	words := []struct {
		key string
		arg string
		zh  string
		en  string
	}{
		{"onhand.said", "报告", "它说：报告", "It said: 报告"},
		{"onhand.holder.author", "小玛", "作者：小玛", "By 小玛"},
		{"onhand.holder.review", "hel", "复审：hel", "Review: hel"},
		{"onhand.holder.handoff", "小玛", "交给：小玛", "Handed to 小玛"},
	}
	for _, w := range words {
		if got := zh.L.T(w.key, w.arg); got != w.zh {
			t.Errorf("zh %s: %q, want %q", w.key, got, w.zh)
		}
		if got := en.L.T(w.key, w.arg); got != w.en {
			t.Errorf("en %s: %q, want %q", w.key, got, w.en)
		}
	}
	// The computer-and-agent join is said in each language's own order.
	if got, want := zh.L.T("onhand.holder.on", "MacBook", "Antigravity"), "MacBook 上的 Antigravity"; got != want {
		t.Errorf("zh holder.on: %q, want %q", got, want)
	}
	if got, want := en.L.T("onhand.holder.on", "MacBook", "Antigravity"), "Antigravity on MacBook"; got != want {
		t.Errorf("en holder.on: %q, want %q", got, want)
	}
}

// D661 turn 2: a stopped task that now needs the person stands where its row can offer Continue /
// Put down, and its line is the fact (how long, and that it did not say), never a bare question.
func TestTruthStoppedNeedsRow(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.LocaleFixed = true
	card := snapshotCard("stopped-needs", protocol.NeedsYou, "")
	card.UpdatedAt = time.Now().Add(-40 * time.Minute).UTC().Format(time.RFC3339)
	card.Truth = &protocol.TaskTruth{State: protocol.TruthNeedsYou, Needs: "stopped", WaitsFor: "它停了 40 分钟，没说在等什么。"}
	truth := &protocol.OnHandTruth{NeedsYou: []protocol.TruthItem{{TaskTruth: *card.Truth, TaskID: "stopped-needs"}}}
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{card}, Truth: truth}})
	task := app.S.Task("stopped-needs")
	if task.Attention() != protocol.Blocked {
		t.Fatalf("attention %q, want Blocked", task.Attention())
	}
	if !app.stoppedWait(task) {
		t.Fatal("a needs-you stopped task must be a stopped row")
	}
	if got := app.storyOf(task).words; got != "它停了 40 分钟，没说在等什么。" {
		t.Fatalf("line %q", got)
	}
	if got := app.stateCounts(app.S.Board(), "")[0]; got != 1 {
		t.Fatalf("needs-you count %d, want 1", got)
	}
	if got := app.headLine(app.S.Board(), "", app.stateCounts(app.S.Board(), "")); got != app.L.T("onhand.line.stopped.one") {
		t.Fatalf("head %q", got)
	}
}
