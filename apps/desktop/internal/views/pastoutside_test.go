package views

import (
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D299: 也在这台电脑上 / Also on this computer on the Mac: the sessions the
// person ran in their own agents under Past tasks' own cards; Continue makes
// one a task and opens it; ⋯ hides an agent's sessions; the transcript of
// the task opens with the session's earlier turns under one hairline.

func outsideItems(lang i18n.Lang) []protocol.OutsideItem {
	at := func(d time.Duration) string { return pastNow.Add(-d).UTC().Format(time.RFC3339) }
	zh := lang == i18n.ZH
	w := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	return []protocol.OutsideItem{
		{Agent: "claude-code", ID: "942ecde2-b387-45c2-bbc6-75da83748a7f", Title: w("Raft 快照的竞争", "Raft snapshot race"), Ask: w("TestRaftSnapshot 为什么偶尔失败？", "Why is TestRaftSnapshot flaky?"), Project: "hawdb", Cwd: "~/src/hawdb", Branch: "fix/raft-snapshot", StartedAt: at(26 * time.Hour), UpdatedAt: at(25 * time.Hour), Kind: "fix"},
		{Agent: "codex", ID: "01a1e522-a9c6-7d53-9d33-0dfcdf329f76", Title: w("查一下 release 构建为什么慢", "Find out why the release build is slow"), Project: "hawdb", Cwd: "~/workbench/hawdb/kyoto", Branch: "perf/lto", StartedAt: at(50 * time.Hour), UpdatedAt: at(49 * time.Hour), Kind: "look"},
		{Agent: "pi", ID: "01a1e523-706a-722e-8264-627a362842f1", Title: w("0.9 的版本说明", "Release notes for 0.9"), Ask: w("写 0.9 的版本说明", "Write the release notes for 0.9"), Project: "mem", Cwd: "~/src/mem", StartedAt: at(9 * 24 * time.Hour), UpdatedAt: at(9 * 24 * time.Hour), Kind: "ship"},
		{Agent: "claude-code", ID: "0d0d0d0d-0000-4000-8000-00000000dead", Title: w("试试旧的解析器", "Try the old parser"), Project: "old-thing", Cwd: "~/src/old-thing", StartedAt: at(30 * 24 * time.Hour), UpdatedAt: at(30 * 24 * time.Hour), Kind: "build", Gone: true},
	}
}

func outsideResult(items []protocol.PastItem, out []protocol.OutsideItem, id string) protocol.ServerFrame {
	f := pastResult(items, id)
	f.Past.Outside = out
	f.Past.Sources = []protocol.OutsideSource{{Agent: "claude-code", N: 2}, {Agent: "codex", N: 1}, {Agent: "pi", N: 1}}
	return f
}

func TestOutsideFramesDecode(t *testing.T) {
	f, err := protocol.DecodeServerFrame([]byte(`{"t":"past_result","id":"q1","items":[],"total":0,"facets":{"projects":[],"harnesses":[],"tags":[]},"suggestions":[],"outside":[{"agent":"codex","id":"01a1","title":"Find out why the build is slow","project":"hawdb","cwd":"~/src/hawdb","branch":"perf/lto","startedAt":"2026-11-15T10:00:00Z","updatedAt":"2026-11-15T12:00:00Z","kind":"look","hit":{"field":"branch","text":"perf/lto"},"gone":true}],"sources":[{"agent":"codex","n":1,"hidden":false},{"agent":"pi","n":0,"hidden":true}]}`))
	if err != nil || f.Past == nil || len(f.Past.Outside) != 1 || f.Past.Outside[0].Hit.Field != "branch" || !f.Past.Outside[0].Gone || !f.Past.Sources[1].Hidden {
		t.Fatalf("past_result with outside: %#v %v", f.Past, err)
	}
	a, err := protocol.DecodeServerFrame([]byte(`{"t":"outside_adopted","agent":"codex","id":"01a1","ok":true,"taskId":"tsk9"}`))
	if err != nil || a.Past == nil || !a.Past.OK || a.Past.TaskID != "tsk9" || a.Past.Agent != "codex" || a.Past.ID != "01a1" {
		t.Fatalf("outside_adopted %#v %v", a.Past, err)
	}
	h, err := protocol.DecodeServerFrame([]byte(`{"t":"outside_hidden","agent":"pi","hidden":true}`))
	if err != nil || h.Past == nil || !h.Past.Hidden || h.Past.Agent != "pi" {
		t.Fatalf("outside_hidden %#v %v", h.Past, err)
	}
}

func TestOutsideSection(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent := pastApp(t, lang)
		L := app.L
		app.OpenPast("")
		q, _ := lastPast[protocol.PastReq](*sent)
		out := outsideItems(lang)
		app.Receive(outsideResult(pastItems(pastSeeds())[:3], out, q.ID))
		tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		for _, s := range []string{L.T("past.out.title"), L.T("past.out.sub"), out[0].Title, out[0].Ask, "fix/raft-snapshot", "Codex", L.T("past.out.gone")} {
			if !tt.HasText(s) {
				t.Fatalf("%s: no %q: %q", lang, s, tt.Texts())
			}
		}
		// Continue: the home is asked; its answer opens the task, and Esc comes back.
		app.outsideContinue(&out[0], "")
		c, ok := lastPast[protocol.OutsideContinue](*sent)
		if !ok || c.Agent != "claude-code" || c.ID != out[0].ID || c.Harness != "" {
			t.Fatalf("%s: continue %#v", lang, c)
		}
		app.Receive(protocol.ServerFrame{T: "outside_adopted", Past: &protocol.PastFrame{T: "outside_adopted", Agent: "claude-code", ID: out[0].ID, OK: true, TaskID: "t_wal"}})
		if app.Route != RouteTask || app.back == nil || app.back.route != RoutePast {
			t.Fatalf("%s: the task didn't open: %v", lang, app.Route)
		}
		// Another agent; a refusal is said in the section.
		app.OpenPast("")
		app.Receive(outsideResult(pastItems(pastSeeds())[:3], out, ""))
		app.outsideContinue(&out[1], "claude-code")
		if c, _ = lastPast[protocol.OutsideContinue](*sent); c.Harness != "claude-code" || c.Agent != "codex" {
			t.Fatalf("%s: another agent %#v", lang, c)
		}
		app.Receive(protocol.ServerFrame{T: "outside_adopted", Past: &protocol.PastFrame{T: "outside_adopted", Agent: "codex", ID: out[1].ID, OK: false, Message: "Its folder ~/x isn't there any more."}})
		tt.Frame()
		if !tt.HasText("Its folder ~/x isn't there any more.") {
			t.Fatalf("%s: the refusal isn't said: %q", lang, tt.Texts())
		}
		// A gone folder never asks the home.
		n := len(*sent)
		app.outsideContinue(&out[3], "")
		if len(*sent) != n || app.past.outMsg != L.T("past.out.gone.why", out[3].Cwd) {
			t.Fatalf("%s: a gone folder: %q", lang, app.past.outMsg)
		}
		// Hidden for good: the cards go, and the line says so with Show again.
		app.Receive(protocol.ServerFrame{T: "outside_hidden", Past: &protocol.PastFrame{T: "outside_hidden", Agent: "claude-code", Hidden: true}})
		tt.Frame()
		if tt.HasText(out[0].Title) || !tt.HasText(L.T("past.out.hidden", "Claude Code")) || !tt.HasText(L.T("past.out.show")) {
			t.Fatalf("%s: hidden (title %v, line %v, show %v) %q", lang, tt.HasText(out[0].Title), tt.HasText(L.T("past.out.hidden", "Claude Code")), tt.HasText(L.T("past.out.show")), tt.Texts())
		}
		click(t, tt, L.T("past.out.show"))
		if h, _ := lastPast[protocol.OutsideHide](*sent); h.Agent != "claude-code" || h.Hidden {
			t.Fatalf("%s: show again %#v", lang, h)
		}
	}
}

func TestOutsideEarlierLine(t *testing.T) {
	for lang, want := range map[i18n.Lang]string{i18n.ZH: "11 月 12 日在 Claude Code 里开始的", i18n.EN: "Began in Claude Code on Nov 12"} {
		app, _ := pastApp(t, lang)
		b, ok := noteBlock(app, `{"outside":{"agent":"claude-code","at":"2026-11-12T09:00:00+08:00","turns":4},"sessionId":"942e","harness":"claude-code"}`, 5)
		if !ok || b.Say != "earlier" {
			t.Fatalf("%s: not an earlier note %#v", lang, b)
		}
		if got := app.earlierLine(&b); got != want {
			t.Errorf("%s: %q, want %q", lang, got, want)
		}
	}
	if say, _, _ := toldOf("The user picked this session up again in Ducter; it is a Ducter task now.", "ducter"); say != "adopted" {
		t.Errorf("told %q", say)
	}
}

// The Mac's screens, zh and en:
//
//	DUCTER_OUTSIDE_SHOTS=1 DUCTER_SHOTS_DIR=<repo>/.shots/d299 go test ./internal/views -run OutsideShots
func TestOutsideShots(t *testing.T) {
	if os.Getenv("DUCTER_OUTSIDE_SHOTS") == "" {
		t.Skip("DUCTER_OUTSIDE_SHOTS=1 to write the shots")
	}
	dir := shotsDir(t)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := pastApp(t, lang)
		items := pastItems(pastSeeds())[:4]
		if lang == i18n.EN {
			items = pastEnglish(items)
		}
		tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetScale(2)
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		shot := func(name string, w, h int) {
			t.Helper()
			tt.SetSize(w, h)
			for i := 0; i < 4; i++ {
				tt.Frame()
				tt.Advance(200 * time.Millisecond)
			}
			f, err := os.Create(filepath.Join(dir, "mac-outside-"+name+"-"+string(lang)+".png"))
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			if err := png.Encode(f, tt.Image()); err != nil {
				t.Fatal(err)
			}
		}
		out := outsideItems(lang)
		app.OpenPast("")
		app.Receive(outsideResult(items, out, ""))
		app.past.focusField = false
		app.past.focus = outsideKey(&out[0])
		shot("browse", 1280, 1180)
		shot("browse-narrow", 900, 1180)
		// Words that match only a session from outside.
		app.past.focus = ""
		app.past.q = "lto"
		hit := out[1]
		hit.Hit = &protocol.PastHit{Field: "branch", Text: "perf/lto"}
		app.Receive(outsideResult(nil, []protocol.OutsideItem{hit}, ""))
		shot("search", 1280, 640)
		// Hidden for good.
		app.past.q = ""
		r := outsideResult(items, out[1:3], "")
		r.Past.Sources[0].Hidden = true
		app.Receive(r)
		shot("hidden", 1280, 1040)
	}
}
