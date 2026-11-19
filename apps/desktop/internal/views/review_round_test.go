package views

import (
	"fmt"
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

// D394: a review that runs every 45 minutes (research/158) on the Mac: the Ongoing card's
// standing line, the round's one card, and a draft opened as its PR's pre-read.

func memPR(n int, title string) protocol.SourceItemRef {
	return protocol.SourceItemRef{Source: "src_gh", Kind: "github", Ref: fmt.Sprintf("nowledge-co/mem#%d", n), Label: fmt.Sprintf("#%d", n), Where: "nowledge-co/mem",
		Title: title, URL: fmt.Sprintf("https://github.com/nowledge-co/mem/pull/%d", n), PR: true}
}

func TestReviewStandingLine(t *testing.T) {
	for _, tc := range []struct {
		lang i18n.Lang
		r    protocol.ReviewStanding
		want string
	}{
		{i18n.ZH, protocol.ReviewStanding{Waiting: 8, Again: 3, Same: 5, Drafted: 3}, "8 个请求在等你：3 个有新提交已复审，5 个没变 | 3 份评审还没发"},
		{i18n.ZH, protocol.ReviewStanding{Waiting: 8, Same: 8}, "8 个请求在等你，都没变"},
		{i18n.ZH, protocol.ReviewStanding{}, "没有请求在等你"},
		{i18n.EN, protocol.ReviewStanding{Waiting: 8, Again: 3, Same: 5, Drafted: 1}, "8 requests wait on you: 3 had new commits and are reviewed again, 5 unchanged | 1 drafted review not posted yet"},
		{i18n.EN, protocol.ReviewStanding{Waiting: 1, Same: 1}, "1 request waits on you, unchanged"},
	} {
		app, _ := pastApp(t, tc.lang)
		r := tc.r
		if got := strings.Join(app.reviewLine(&r), " | "); got != tc.want { // D291: separate facts
			t.Errorf("%s %+v: %q, want %q", tc.lang, tc.r, got, tc.want)
		}
	}
}

func reviewRoundCard(lang i18n.Lang) protocol.Decision {
	w := func(zh, en string) string { return pastWord(lang, zh, en) }
	items := []protocol.SourceAskItem{
		{Item: memPR(10287, "Distill memories in batches of 50")},
		{Item: memPR(10473, "Keep the pinned message when the window trims")},
		{Item: memPR(10419, "Recall across spaces the token can read")},
	}
	return protocol.Decision{DecisionID: "d_round", Question: w("3 个 PR 的评审写好了，发到 GitHub？", "3 PR reviews are written. Post them to GitHub?"),
		GoLabel: w("发到 GitHub", "Post to GitHub"), HoldLabel: w("先不发", "Not now"), DefaultOption: "hold",
		Src: &protocol.SourceAsk{Kind: "reviews", Item: items[0].Item, TaskID: "t_review", Items: items}}
}

func TestReviewRoundCardOpensDrafts(t *testing.T) {
	app, sent := pastApp(t, i18n.ZH)
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		ev("channel", protocol.KindUserMsg, protocol.UserMsg{Text: "每 45 分钟帮我看一下 nowledge-co 里请我 review 的 PR"}),
		ev("channel", protocol.KindDecision, reviewRoundCard(i18n.ZH)),
	}})
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	for i := 0; i < 3; i++ {
		tt.Frame()
	}
	texts := strings.Join(tt.Texts(), " ")
	for _, want := range []string{"3 个 PR 的评审写好了，发到 GitHub？", "Recall across spaces the token can read", "看草稿", "说好之前，什么都不会发到 GitHub"} {
		if !strings.Contains(texts, want) {
			t.Errorf("the round card lacks %q: %q", want, texts)
		}
	}
	app.openPreRead("nowledge-co/mem#10473")
	found := false
	for _, m := range *sent {
		if r, ok := m.(protocol.PreReadReq); ok && r.Ref == "nowledge-co/mem#10473" {
			found = true
		}
	}
	if !found {
		t.Errorf("Read draft didn't ask for the pre-read: %#v", *sent)
	}
}

// Shots for review (D75: outside git):
//
//	DUCTER_SHOTS_DIR=../../../../.shots/routine-review DUCTER_REVIEW_SHOTS=1 go test ./internal/views -run ReviewRoundShots
func TestReviewRoundShots(t *testing.T) {
	if os.Getenv("DUCTER_REVIEW_SHOTS") == "" {
		t.Skip("DUCTER_REVIEW_SHOTS=1 to write the shots")
	}
	dir := shotsDir(t)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		w := func(zh, en string) string { return pastWord(lang, zh, en) }
		app, _ := pastApp(t, lang)
		tt := ui.NewTesterWith(app.View, 1280, 820, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetScale(2)
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		shot := func(name string, wd, h int) {
			t.Helper()
			tt.SetSize(wd, h)
			for i := 0; i < 4; i++ {
				tt.Frame()
				tt.Advance(200 * time.Millisecond)
			}
			f, err := os.Create(filepath.Join(dir, "mac-"+name+"-"+string(lang)+".png"))
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			if err := png.Encode(f, tt.Image()); err != nil {
				t.Fatal(err)
			}
		}
		// Ongoing: the review task's card with where its requests stand.
		items := ongoingFixture(lang)
		items[1].Title = w("看 nowledge-co 里请我 review 的 PR", "Review my requests in nowledge-co")
		items[1].Runs = ongoingRunsOf(45*time.Minute, w("8 个请求在等你", "8 requests wait on you"), "looked", "looked", "looked", "looked", "met", "looked", "looked", "looked", "looked", "looked", "looked", "met")
		items[1].Reviews = &protocol.ReviewStanding{Waiting: 8, Again: 3, Same: 5, Drafted: 3, At: ogAt(-time.Minute)}
		app.OpenOngoing()
		app.Receive(ongoingFrame(items))
		shot("ongoing", 1280, 820)
		// The round's one card in the conversation.
		app.Route = RouteConversation
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			ev("channel", protocol.KindUserMsg, protocol.UserMsg{Text: w("每 45 分钟帮我看一下 nowledge-co 里请我 review 的 PR，按 mem 的 review skill 来审。", "Every 45 minutes, look at the PRs in nowledge-co that want my review, and review them with mem's review skill.")}),
			ev("channel", protocol.KindAIMsg, protocol.AIMsg{Text: w("好，每 45 分钟去看一轮，审好的先给你过目再发。", "On it: a round every 45 minutes, and you see each review before it goes out.")}),
			ev("channel", protocol.KindDecision, reviewRoundCard(lang)),
		}})
		shot("round-card", 1280, 820)
		// A draft, opened from the card: the PR's pre-read sheet.
		app.openPreRead("nowledge-co/mem#10287")
		app.pile.reading = false
		app.pile.read = &protocol.PreRead{PreReadSummary: protocol.PreReadSummary{Problems: 2, Suggestions: 1, At: ogAt(-time.Minute), State: "drafted"},
			Ref: "nowledge-co/mem#10287", Title: "Distill memories in batches of 50", URL: "https://github.com/nowledge-co/mem/pull/10287", Gist: w("把记忆提炼改成每 50 条一批", "Distills memories 50 at a time"),
			Notes: []protocol.PreReadNote{
				{Kind: "problem", Path: "src/distill/batch.rs", Line: 64, Text: "`batch_size` is read from the config before it is checked, so 0 loops forever."},
				{Kind: "problem", Path: "src/distill/batch.rs", Line: 112, Text: "A failed batch is retried with the same 50; one bad memory stops the rest."},
				{Kind: "suggestion", Path: "src/distill/batch.rs", Line: 30, Text: "A test for an empty batch would keep this honest."},
			}}
		shot("draft", 1280, 820)
	}
}
