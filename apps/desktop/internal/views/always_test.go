package views

import (
	"fmt"
	"image"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D601: a Go card whose step a standing permission can cover carries
// 以后这类直接做 / Always do this beside Go (secondary; Go stays the lead).
// Its tap sends decide with always; GQ4's offer leads the card in one line;
// Settings › 不用问我的 says a tapped row as a tap with its day.
//
//	DUCTER_D601_SHOTS=$PWD/../../../../.shots/always-do go test ./internal/views -run TestD601
func d601Words(lang i18n.Lang) (q, said, goLabel string) {
	if lang == i18n.ZH {
		return "在 PR #10932 评论 /test pull-mem-playwright-e2e 重跑这项 E2E？", "#10932 的 E2E 偶发失败了一次（别的检查都过了）。要我在 PR 下评论 /test 重跑这一项吗？", "重跑 E2E"
	}
	return "Comment /test pull-mem-playwright-e2e on PR #10932 to rerun the E2E check?", "The E2E check on #10932 failed once, a flake; everything else passed. Shall I comment /test on the PR to rerun just that one?", "Rerun E2E"
}

func d601App(t *testing.T, lang i18n.Lang, often bool) (*App, *[]any, *ui.Tester) {
	noRelayWait(t)
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	q, said, goLabel := d601Words(lang)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	user := map[i18n.Lang]string{i18n.ZH: "盯一下 mem 那个 PR，推进到能合并", i18n.EN: "Keep an eye on that mem PR and get it to mergeable"}[lang]
	title := map[i18n.Lang]string{i18n.ZH: "把 PR #10932 推到能合并", i18n.EN: "Get PR #10932 to mergeable"}[lang]
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(1, now, "default", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: user}),
		protocol.NewEvent(2, now, "default", protocol.TaskStream("t1"), protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t1", Title: title, Harness: "codex", Place: protocol.Place{Kind: "repo", Device: "local", RepoPath: "/Users/demo/dev/mem", Branch: "ducter/fix-10932"}}),
		protocol.NewEvent(3, now, "default", "channel", protocol.OriginSystem, protocol.KindDecision, protocol.Decision{DecisionID: "d1", TaskID: "t1", Question: q, GoLabel: goLabel, DefaultOption: "go", Reversible: true, DefaultAt: time.Now().Add(25 * time.Minute).UTC().Format(time.RFC3339), Always: &protocol.AlwaysAsk{Action: "ci_rerun", Where: []string{"nowledge-co"}, Often: often}}),
		protocol.NewEvent(4, now, "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: said, DecisionID: "d1"}),
	}})
	tt := ui.NewTesterWith(app.View, 1150, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	for i := 0; i < 4; i++ {
		tt.Frame()
		tt.Advance(200 * time.Millisecond)
	}
	return app, sent, tt
}

func d601Shots(t *testing.T, app *App, tt *ui.Tester, name, anchor string) {
	dir := os.Getenv("DUCTER_D601_SHOTS")
	if dir == "" {
		return
	}
	_ = os.MkdirAll(dir, 0o755)
	for _, mode := range []string{"light", "dark"} {
		app.Local.SetAppearance(mode)
		tt.SetScale(2)
		for i := 0; i < 3; i++ {
			tt.Frame()
			tt.Advance(200 * time.Millisecond)
		}
		img := tt.Image()
		d596Write(t, dir, fmt.Sprintf("mac-%s-1150-%s", name, mode), img)
		if r, ok := tt.Find(anchor); ok {
			b := img.Bounds()
			y0, y1 := max(0, int((r.Y-170)*2)), min(b.Max.Y, int((r.Y+110)*2))
			x0, x1 := max(0, int((r.X-330)*2)), min(b.Max.X, int((r.X+560)*2))
			d596Write(t, dir, fmt.Sprintf("mac-%s-1150-%s-crop-2x", name, mode), img.SubImage(image.Rect(x0, y0, x1, y1)))
		}
		tt.SetScale(1)
	}
	app.Local.SetAppearance("system")
}

func TestD601AlwaysBesideGo(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		app, sent, tt := d601App(t, lang, false)
		_, _, goLabel := d601Words(lang)
		all := strings.Join(tt.Texts(), " ")
		if !strings.Contains(all, L.T("always.do")) || !strings.Contains(all, goLabel) {
			t.Fatalf("%s: the card has no Always do this beside its Go: %q", lang, all)
		}
		if strings.Contains(all, L.T("always.often")) {
			t.Fatalf("%s: GQ4's offer before two Go's", lang)
		}
		d601Shots(t, app, tt, "card-"+string(lang), L.T("always.do"))
		n := len(*sent)
		if err := tt.Click(L.T("always.do")); err != nil {
			t.Fatalf("%s: %v", lang, err)
		}
		tt.Frame()
		got := false
		for _, f := range (*sent)[n:] {
			if d, ok := f.(protocol.Decide); ok && d.DecisionID == "d1" && d.Option == "go" && d.Always {
				got = true
			}
		}
		if !got {
			t.Fatalf("%s: the tap sent no decide with always: %#v", lang, (*sent)[n:])
		}
		// Answered with the tap: the card says so.
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			protocol.NewEvent(5, time.Now().UTC().Format(time.RFC3339Nano), "default", "channel", protocol.OriginUser, protocol.KindDecisionResolved, protocol.DecisionResolved{DecisionID: "d1", Option: "go", By: "user", Always: true}),
		}})
		tt.Frame()
		if all := strings.Join(tt.Texts(), " "); !strings.Contains(all, L.T("always.resolved", goLabel)) {
			t.Fatalf("%s: the answered card doesn't say the tap: %q", lang, all)
		}
	}
}

func TestD601OfferAfterTwoGoes(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		app, _, tt := d601App(t, lang, true)
		all := strings.Join(tt.Texts(), " ")
		if !strings.Contains(all, L.T("always.often")) || !strings.Contains(all, L.T("always.do")) {
			t.Fatalf("%s: GQ4's offer doesn't lead the card: %q", lang, all)
		}
		d601Shots(t, app, tt, "offer-"+string(lang), L.T("always.do"))
	}
}

func TestD601SettingsRowSaysTheTap(t *testing.T) {
	dir := os.Getenv("DUCTER_D601_SHOTS")
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		var two d322Case
		for _, k := range d322Cases() {
			if k.name == "two-agents" {
				two = k
			}
		}
		app, sent := d322App(t, lang, two)
		tt := ui.NewTesterWith(app.View, 1150, 4200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		frames := func() {
			for i := 0; i < 3; i++ {
				tt.Frame()
				tt.Advance(200 * time.Millisecond)
			}
		}
		frames()
		label := L.T("always.do")
		app.Receive(protocol.ServerFrame{T: "rules", StandingList: []protocol.StandingView{{ID: "st_tap", Action: "ci_rerun", Orgs: []string{"nowledge-co"}, Text: label, By: "tap", CreatedAt: time.Now().UTC().Format(time.RFC3339)}}})
		frames()
		for _, want := range []string{L.T("standing.ci_rerun"), L.T("standing.tapped", label), L.T("standing.where.owners", "nowledge-co")} {
			if !hasText(tt, want) {
				t.Fatalf("%s: no %q in %q", lang, want, tt.Texts())
			}
		}
		if hasText(tt, L.T("standing.said", label)) {
			t.Fatalf("%s: a tap is said as their words", lang)
		}
		if dir != "" {
			_ = os.MkdirAll(dir, 0o755)
			for _, mode := range []string{"light", "dark"} {
				app.Local.SetAppearance(mode)
				tt.SetScale(2)
				frames()
				r, _ := tt.Find(L.T("standing.title"))
				img := tt.Image()
				sub := img.SubImage(image.Rect(0, int((r.Y-60)*2), 1150*2, int((r.Y+170)*2)))
				d596Write(t, dir, fmt.Sprintf("mac-settings-1150-%s-%s-2x", lang, mode), sub)
				tt.SetScale(1)
			}
			app.Local.SetAppearance("system")
			frames()
		}
		n := len(*sent)
		if err := tt.Click(spoken(L, L.T("standing.revoke"), L.T("standing.ci_rerun"))); err != nil {
			t.Fatalf("%s: %v", lang, err)
		}
		frames()
		got := false
		for _, f := range (*sent)[n:] {
			if r, ok := f.(protocol.StandingRevoke); ok && r.ID == "st_tap" {
				got = true
			}
		}
		if !got {
			t.Fatalf("%s: Take back sent nothing", lang)
		}
	}
}
