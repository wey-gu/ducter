package views

import (
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D348: held words with nothing running say they go with the next message,
// never "after this turn" (research/124 F8).
func TestD348HeldIdle(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		app, tt, _ := d325Task(t, lang, "claude-code", true)
		if !tt.HasText(L.T("held.head")) {
			t.Fatalf("%s: working, the head isn't %q: %q", lang, L.T("held.head"), tt.Texts())
		}
		task := app.S.Task("k1")
		card := *task.Card
		card.Attention = protocol.NeedsYou
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{card}}})
		tt.Frame()
		tt.Frame()
		if !tt.HasText(L.T("held.head.idle")) || tt.HasText(L.T("held.head")) {
			t.Errorf("%s: stopped, the head says %q", lang, tt.Texts())
		}
	}
}

// D348: memory held off by the home's start (DUCTER_MEMORY=off): the page
// shows the switch, still, and says why and how to change it.
func TestD348MemoryPinned(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent := iaApp(t, lang)
		app.Status = 2
		app.Receive(protocol.ServerFrame{T: "settings", Settings: &protocol.Settings{Name: "小鸭", Language: "auto", Memory: false, MemoryPinned: true, Notify: true, DefaultAfterMin: 30}})
		tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		app.openTab(TabMemory)
		todoFrames(tt, 3)
		if !tt.HasText(app.L.T("mem.pinned")) || tt.HasText(app.L.T("partner.memory.off")) {
			t.Fatalf("%s: no reason given: %q", lang, tt.Texts())
		}
		if _, ok := tt.Find(app.L.T("partner.memory.switch")); !ok {
			t.Fatalf("%s: no switch", lang)
		}
		_ = tt.Click(app.L.T("partner.memory.switch"))
		tt.Frame()
		for _, f := range *sent {
			if p, ok := f.(protocol.SettingsSet); ok && p.Patch.Memory != nil {
				t.Errorf("%s: a held-off switch sent %+v", lang, p)
			}
		}
	}
}

// D348: Settings › 待办来源: a GitHub source's repositories and a vault's
// folder and tag are fields; Return saves them as source_set.
func TestD348TodoFilters(t *testing.T) {
	app, sent, tt := todoApp(t, i18n.ZH, 1280, 1900)
	app.openTab(TabTodos)
	todoFrames(tt, 4)
	for _, w := range []string{"只看这些仓库", "写 主人/仓库，几个就用逗号隔开", "看哪个文件夹", "只看带这个标签的"} {
		if !tt.HasText(w) {
			t.Errorf("no %q in %q", w, tt.Texts())
		}
	}
	if err := tt.Click("只看这些仓库，GitHub"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	tt.Type("acme/web，acme/api  https://github.com/acme/web.git")
	tt.Frame()
	tt.Key(0, ui.KeyEnter)
	tt.Frame()
	f, ok := lastSent[protocol.SourceSetReq](*sent)
	if !ok || f.ID != "src_gh" || len(f.Repos) != 2 || f.Repos[0] != "acme/web" || f.Repos[1] != "acme/api" {
		t.Fatalf("repos sent %+v", f)
	}
	if err := tt.Click("只看带这个标签的，Life"); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	tt.Type("#ducter")
	tt.Frame()
	tt.Key(0, ui.KeyEnter)
	tt.Frame()
	f, ok = lastSent[protocol.SourceSetReq](*sent)
	if !ok || f.ID != "src_life" || f.Label == nil || *f.Label != "#ducter" || f.Folder != nil || f.Repos != nil {
		t.Fatalf("tag sent %+v", f)
	}
	if got := reposOf(" , "); got == nil || len(got) != 0 {
		t.Errorf("an empty field must clear the repositories, got %#v", got)
	}
}
