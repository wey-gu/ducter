package views

import (
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D475: every pane's head says what is true there now; a source that can't be reached says so once,
// on its first row with 再试一次, its rows quiet; Notifications' preview follows 发现了就说. The web's
// apps/web/test/d475.test.ts checks the same.

func TestPaneHeadsSayTheStateD475(t *testing.T) {
	app, _ := homeApp(t, i18n.ZH, false)
	st := app.S.Settings
	st.Notify, st.Quiet = true, &protocol.QuietHours{Start: "23:00", End: "08:00"}
	if got := app.paneSay(TabNotify, ""); got != "有事要你定，我就发通知；免打扰的时段里不吵你。" {
		t.Fatalf("notify, quiet: %q", got)
	}
	st.Quiet = nil
	if got := app.paneSay(TabNotify, ""); got != "有事要你定，我就发通知给你。" {
		t.Fatalf("notify: %q", got)
	}
	st.Notify = false
	if got := app.paneSay(TabNotify, ""); got != "通知关着：要你定的事，我放在「任务」里等你。" {
		t.Fatalf("notify off: %q", got)
	}

	if got := app.paneSay(TabTodos, ""); got != app.L.T("say.todos") {
		t.Fatalf("todos before a read: %q", got)
	}
	app.S.Sources = &protocol.SourcesView{Sources: []protocol.SourceView{
		{ID: "s1", Kind: "github", State: "ok", CheckedAt: "2026-11-22T08:00:00Z", Open: 558},
		{ID: "s2", Kind: "obsidian", State: "ok", CheckedAt: "2026-11-22T08:00:00Z", Open: 3},
		{ID: "s3", Kind: "obsidian", State: "ok", Open: 9}, // never read: never counted
	}}
	if got := app.paneSay(TabTodos, ""); got != "GitHub 有 558 个没做完，Obsidian 有 3 个没做完；哪个想交给我，说一声就行。" {
		t.Fatalf("todos: %q", got)
	}

	app.S.Saved = &protocol.ServerFrame{T: "saved", SavedItems: []protocol.SavedView{{Kind: "signin"}, {Kind: "signin"}, {Kind: "card"}}, SavedKeys: []protocol.KeyView{{ID: "k"}}}
	if got := app.paneSay(TabAutofill, ""); got != "我替你锁着 2 组登录信息、1 张卡、1 个密钥；填的时候我看不见，付款都先问你。" {
		t.Fatalf("autofill: %q", got)
	}
}

func TestSourceDownSaidOnceD475(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, tt := homeApp(t, lang, true) // OOMOL unreachable
		if got := app.paneSay(TabAccounts, ""); got != "" {
			t.Fatalf("%s: the head still speaks over a source down: %q", lang, got)
		}
		cv := app.S.Connections[0]
		for _, w := range tilesOf(cv) {
			if s, _ := app.serviceState(cv, w); s != "" {
				t.Fatalf("%s: a row says %q under a source that is down", lang, s)
			}
		}
		app.openTab(TabAccounts)
		for i := 0; i < 6; i++ {
			tt.Advance(150 * time.Millisecond)
			tt.Frame()
		}
		if _, ok := tt.Find(app.L.T("acct.retry")); !ok {
			t.Fatalf("%s: no %q on the source's row", lang, app.L.T("acct.retry"))
		}
		if err := tt.Click(app.L.T("acct.retry")); err != nil {
			t.Fatalf("%s: %v", lang, err)
		}
		tt.Frame()
		if w := app.settings.said["src:"+cv.ID]; w.text != app.L.T("said.retry", connName(app, cv)) {
			t.Fatalf("%s: said after Try again: %q", lang, w.text)
		}
	}
}
