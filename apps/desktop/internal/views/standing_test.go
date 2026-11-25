package views

import (
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D413: 不用问我的 / Without asking is the third list in 要不要先问's card on
// Settings › Partner: what, where and the person's own words, each its own
// line, and 收回 / Take back sends standing_revoke. Nothing before the first.
//
//	DUCTER_D413_SHOTS=$PWD/../../.shots/standing-permission go test ./internal/views -run TestD413
func TestD413StandingOnPartner(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		var two d322Case
		for _, k := range d322Cases() {
			if k.name == "two-agents" {
				two = k
			}
		}
		app, sent := d322App(t, lang, two)
		tt := ui.NewTesterWith(app.View, 1280, 4200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		frames := func() {
			for i := 0; i < 3; i++ {
				tt.Frame()
				tt.Advance(200 * time.Millisecond)
			}
		}
		frames()
		if hasText(tt, L.T("standing.title")) {
			t.Fatalf("%s: the list shows before anything was said", lang)
		}
		words := map[i18n.Lang]string{i18n.ZH: "review 做好了直接发别和我确认", i18n.EN: "Just post the reviews when they're done, don't ask me"}[lang]
		app.Receive(protocol.ServerFrame{T: "rules", StandingList: []protocol.StandingView{{ID: "st_1", Action: "pr_review", Orgs: []string{"nowledge-co"}, Text: words, CreatedAt: "2026-11-19T14:44:04Z"}}})
		frames()
		for _, want := range []string{L.T("standing.title"), L.T("standing.pr_review"), L.T("standing.where.orgs", "nowledge-co"), L.T("standing.said", words)} {
			if !hasText(tt, want) {
				t.Fatalf("%s: no %q in %q", lang, want, tt.Texts())
			}
		}
		if dir := os.Getenv("DUCTER_D413_SHOTS"); dir != "" {
			t.Setenv("DUCTER_SHOTS_DIR", dir)
			d302Both(t, app, tt, frames, "standing-partner", lang)
		}
		n := len(*sent)
		if err := tt.Click(spoken(L, L.T("standing.revoke"), L.T("standing.pr_review"))); err != nil {
			t.Fatalf("%s: %v", lang, err)
		}
		frames()
		got := false
		for _, f := range (*sent)[n:] {
			if r, ok := f.(protocol.StandingRevoke); ok && r.T == "standing_revoke" && r.ID == "st_1" {
				got = true
			}
		}
		if !got {
			t.Fatalf("%s: Take back sent no standing_revoke: %#v", lang, (*sent)[n:])
		}
		if !hasText(tt, L.T("standing.revoked")) {
			t.Fatalf("%s: no word after Take back in %q", lang, tt.Texts())
		}
	}
}

// D413: in the conversation, the round's card that waited reads 按你说的，直接发了
// (never "you didn't answer"), and the one line lists what went; the Ongoing
// line says how many were posted.
func TestD413StandingConversation(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		w := func(zh, en string) string { return pastWord(lang, zh, en) }
		L := i18n.New(lang)
		app, _ := pastApp(t, lang)
		card := reviewRoundCard(lang)
		card.Src.Items = card.Src.Items[:2]
		card.Question = w("2 个 PR 的评审写好了，发到 GitHub？", "2 PR reviews are written. Post them to GitHub?")
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			ev("channel", protocol.KindDecision, card),
			ev("channel", protocol.KindUserMsg, protocol.UserMsg{Text: w("review 做好了直接发别和我确认", "Just post the reviews when they're done, don't ask me.")}),
			ev("channel", protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: card.DecisionID, Option: "hold", By: "default", Settled: true, Posted: true}),
			ev("channel", protocol.KindAIMsg, protocol.AIMsg{Text: w("刚才等着的 2 份评审已经发到 GitHub：[mem#10287](https://github.com/nowledge-co/mem/pull/10287)、[mem#10473](https://github.com/nowledge-co/mem/pull/10473)", "The 2 reviews that were waiting are on GitHub now: [mem#10287](https://github.com/nowledge-co/mem/pull/10287), [mem#10473](https://github.com/nowledge-co/mem/pull/10473)")}),
			ev("channel", protocol.KindAIMsg, protocol.AIMsg{Text: w("好，以后评审写完直接发到 GitHub，不再问你。在「替你做过的」里都看得到，想收回说一声。", "Got it: from now on reviews go straight to GitHub without asking. Each one is in Done for you; say so to take it back.")}),
		}})
		tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		for i := 0; i < 4; i++ {
			tt.Frame()
			tt.Advance(200 * time.Millisecond)
		}
		texts := strings.Join(tt.Texts(), " ")
		if !strings.Contains(texts, L.T("standing.settled")) || strings.Contains(texts, L.T("decision.resolved.default")) {
			t.Errorf("%s: the settled card doesn't say it was posted as said: %q", lang, texts)
		}
		r := protocol.ReviewStanding{Waiting: 3, Again: 1, Same: 2, Posted: 1}
		if got := strings.Join(app.reviewLine(&r), " | "); !strings.Contains(got, L.T("og.rev.posted.1")) {
			t.Errorf("%s: the Ongoing line: %q", lang, got)
		}
		if dir := os.Getenv("DUCTER_D413_SHOTS"); dir != "" {
			tt.SetScale(2)
			for i := 0; i < 3; i++ {
				tt.Frame()
				tt.Advance(200 * time.Millisecond)
			}
			f, err := os.Create(filepath.Join(dir, "mac-conversation-"+string(lang)+".png"))
			if err != nil {
				t.Fatal(err)
			}
			if err := png.Encode(f, tt.Image()); err != nil {
				t.Fatal(err)
			}
			f.Close()
		}
	}
}
