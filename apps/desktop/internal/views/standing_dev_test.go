package views

import (
	"fmt"
	"image"
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

// D596: the dev flow the author said once (「做好了 PR，研究实现设计验证好之后，交给 PR baby sitter」) is a
// row under 不用问我的 on Settings › Partner: what (开发做完、验证好，直接开 PR 交给帮手), where (在
// nowledge-co), their words, and 收回 sends standing_revoke. The first time it is used, one line in the
// conversation with the PR's link.
//
//	DUCTER_D596_SHOTS=$PWD/../../.shots/standing-dev go test ./internal/views -run TestD596
func TestD596StandingDevOnPartner(t *testing.T) {
	dir := os.Getenv("DUCTER_D596_SHOTS")
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
		words := map[i18n.Lang]string{
			i18n.ZH: "以后我让你做开发的工作，请都按照这个标准（不一定分配给谁），做好了 PR，研究实现设计验证好之后，交给 PR baby sitter 哈。",
			i18n.EN: "From now on, for any dev work I give you: once it's researched, built and verified, open the PR and hand it to my PR babysitter. No need to ask me first.",
		}[lang]
		app.Receive(protocol.ServerFrame{T: "rules", StandingList: []protocol.StandingView{{ID: "st_dev", Action: "pr_open", Orgs: []string{"nowledge-co"}, Text: words, CreatedAt: "2026-11-26T07:21:00Z"}}})
		frames()
		for _, want := range []string{L.T("standing.title"), L.T("standing.pr_open"), L.T("standing.where.owners", "nowledge-co"), L.T("standing.said", words)} {
			if !hasText(tt, want) {
				t.Fatalf("%s: no %q in %q", lang, want, tt.Texts())
			}
		}
		if dir != "" {
			_ = os.MkdirAll(dir, 0o755)
			for _, mode := range []string{"light", "dark"} {
				app.Local.SetAppearance(mode)
				tt.SetScale(2)
				frames()
				r, ok := tt.Find(L.T("standing.title"))
				if !ok {
					t.Fatalf("%s: the title isn't drawn", lang)
				}
				img := tt.Image()
				sub := img.SubImage(image.Rect(0, int((r.Y-140)*2), 1150*2, int((r.Y+230)*2)))
				d596Write(t, dir, fmt.Sprintf("mac-standing-1150-%s-%s-2x", lang, mode), sub)
				tt.SetScale(1)
			}
			app.Local.SetAppearance("system")
			frames()
		}
		n := len(*sent)
		if err := tt.Click(spoken(L, L.T("standing.revoke"), L.T("standing.pr_open"))); err != nil {
			t.Fatalf("%s: %v", lang, err)
		}
		frames()
		got := false
		for _, f := range (*sent)[n:] {
			if r, ok := f.(protocol.StandingRevoke); ok && r.T == "standing_revoke" && r.ID == "st_dev" {
				got = true
			}
		}
		if !got {
			t.Fatalf("%s: Take back sent no standing_revoke: %#v", lang, (*sent)[n:])
		}
	}
}

func TestD596FirstUseLine(t *testing.T) {
	dir := os.Getenv("DUCTER_D596_SHOTS")
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		w := func(zh, en string) string { return pastWord(lang, zh, en) }
		app, _ := pastApp(t, lang)
		pr := "https://github.com/nowledge-co/mem/pull/11391"
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			ev("channel", protocol.KindUserMsg, protocol.UserMsg{Text: w("以后我让你做开发的工作，请都按照这个标准（不一定分配给谁），做好了 PR，研究实现设计验证好之后，交给 PR baby sitter 哈。", "From now on, for any dev work I give you: once it's researched, built and verified, open the PR and hand it to my PR babysitter. No need to ask me first.")}),
			ev("channel", protocol.KindAIMsg, protocol.AIMsg{Text: w("好，以后开发的活验证好就直接开 PR，交给 PR baby sitter 跟进，不再问你。合并还是你来。想收回说一声。", "Got it: from now on verified dev work goes straight to a PR and your PR babysitter, without asking. Merging stays yours; say so to take it back.")}),
			ev("channel", protocol.KindAIMsg, protocol.AIMsg{Text: w("按你说的，「修 Mem #11390」验证好了，我直接推了分支、开了 PR：[#11391]("+pr+")，交给了 PR baby sitter，等它接手。以后照这样做，不再一一说；都在「替你做过的」里，想收回说一声。", "As you said, “Fix Mem #11390” is verified, so I pushed its branch and opened the PR: [#11391]("+pr+"), handed to PR babysitter, waiting for it to take it. From now on I'll do this without a word each time; it's all in Done for you, and you can take it back any time.")}),
		}})
		tt := ui.NewTesterWith(app.View, 1150, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		for i := 0; i < 4; i++ {
			tt.Frame()
			tt.Advance(200 * time.Millisecond)
		}
		if texts := strings.Join(tt.Texts(), " "); !strings.Contains(texts, "#11391") {
			t.Fatalf("%s: the first-use line's link isn't drawn: %q", lang, texts)
		}
		if dir == "" {
			continue
		}
		_ = os.MkdirAll(dir, 0o755)
		for _, mode := range []string{"light", "dark"} {
			app.Local.SetAppearance(mode)
			tt.SetScale(2)
			for i := 0; i < 3; i++ {
				tt.Frame()
				tt.Advance(200 * time.Millisecond)
			}
			d596Write(t, dir, fmt.Sprintf("mac-conv-1150-%s-%s", lang, mode), tt.Image())
			tt.SetScale(1)
		}
		app.Local.SetAppearance("system")
	}
}

func d596Write(t *testing.T, dir, name string, img image.Image) {
	t.Helper()
	f, err := os.Create(filepath.Join(dir, name+".png"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, img); err != nil {
		t.Fatal(err)
	}
}
