package views

// D645 (research/245 §3.7, phase 1): the head and the counts read the same state as the rows.
// A task told to wait for the person is needs_you in the count and in the head line (never 没有待你
// 处理的，我在做); a GitHub-blind card says so after its 30 minutes, with the fix.

import (
	"strings"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

func truthBoard(t *testing.T, cards ...protocol.TaskCard) *App {
	app, _ := iaApp(t, i18n.ZH)
	app.LocaleFixed = true
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: cards}})
	return app
}

func truthCard(id string, a protocol.Attention) protocol.TaskCard {
	now := time.Now().UTC().Format(time.RFC3339)
	return protocol.TaskCard{TaskID: id, Title: "任务 " + id, Place: protocol.Place{Kind: "none"}, Harness: "codex", Attention: a, OpenedAt: now, UpdatedAt: now}
}

func TestTruthHeadCountsTheWaitingTask(t *testing.T) {
	app := truthBoard(t, truthCard("zqcpawnf", protocol.NeedsYou), truthCard("ci", protocol.Working))
	b := app.S.Board()
	n := app.stateCounts(b, "")
	if n[0] != 1 || n[1] != 1 {
		t.Fatalf("strip %v: want 1 needs you, 1 working", n)
	}
	if got := app.headLine(b, "", n); got != app.L.T("onhand.say.needs.one") {
		t.Fatalf("the head does not count the waiting task: %q", got)
	}
	// The turn is over: the same task is what waits on the person, and the head never says 我在做.
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{truthCard("zqcpawnf", protocol.NeedsYou)}}})
	b = app.S.Board()
	n = app.stateCounts(b, "")
	if got := app.headLine(b, "", n); got != app.L.T("onhand.say.needs.one") {
		t.Fatalf("the head is not true to the card: %q", got)
	}
}

func TestTruthGitHubBlindRowSaysSoWithTheFix(t *testing.T) {
	card := truthCard("loop", protocol.Blocked)
	card.GitHubBlind = &protocol.GitHubBlind{Since: time.Now().Add(-31 * time.Minute).UTC().Format(time.RFC3339), Device: "haswell", Home: "hel"}
	app := truthBoard(t, card)
	s := app.storyOf(app.S.Task("loop"))
	if !strings.Contains(s.words, "看不到 GitHub") || !strings.Contains(s.words, "haswell") {
		t.Fatalf("the blind row does not say so with the fix: %q", s.words)
	}
	fresh := truthCard("loop2", protocol.Blocked)
	fresh.GitHubBlind = &protocol.GitHubBlind{Since: time.Now().Add(-5 * time.Minute).UTC().Format(time.RFC3339), Device: "haswell", Home: "hel"}
	app2 := truthBoard(t, fresh)
	if got := app2.storyOf(app2.S.Task("loop2")).words; strings.Contains(got, "看不到 GitHub") {
		t.Fatalf("the blind row speaks before its quiet: %q", got)
	}
}
