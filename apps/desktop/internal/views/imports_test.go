package views

import (
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D655 (research/246 §3.10, §3.11): 导入 / Import on the Mac. The pane subscribes as it
// opens; a row says its state; 带进来 opens the consent card, all literal, and its 带进来 asks the
// home; a removal says what will be hidden first; the encrypted, signed-out and missing states say
// why in plain words; and Past tasks carries the one line once.

func importFrame(over ...func(*protocol.ImportSourceRow)) protocol.ServerFrame {
	row := protocol.ImportSourceRow{ID: "lody", App: "Lody", State: "ready", Consented: false}
	total := 3
	row.Total = &total
	for _, f := range over {
		f(&row)
	}
	return protocol.ServerFrame{T: "imports", Imports: &protocol.ImportsFrame{Sources: []protocol.ImportSourceRow{row}}}
}

func importApp(t *testing.T, lang i18n.Lang) (*App, *[]any, *ui.Tester) {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.Status = 1 // connected
	app.LocaleFixed = true
	app.Now = func() time.Time { return pastNow }
	tt := ui.NewTesterWith(app.View, 1280, 1500, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	return app, sent, tt
}

func TestImportFramesDecode(t *testing.T) {
	f, err := protocol.DecodeServerFrame([]byte(`{"t":"imports","sources":[{"id":"lody","app":"Lody","state":"ready","total":12,"imported":3,"consented":true,"fresh":9,"last":{"at":"2026-11-28T10:00:00Z","threads":2,"oldest":"2026-10-02","skipped":1}}],"offer":{"id":"lody","app":"Lody","total":12}}`))
	if err != nil || f.Imports == nil || len(f.Imports.Sources) != 1 || *f.Imports.Sources[0].Total != 12 || f.Imports.Sources[0].Imported != 3 || f.Imports.Sources[0].Last.Skipped != 1 || f.Imports.Offer == nil || *f.Imports.Offer.Total != 12 {
		t.Fatalf("imports: %#v %v", f.Imports, err)
	}
	a, err := protocol.DecodeServerFrame([]byte(`{"t":"import_answer","id":"lody","op":"run","ok":true,"threads":2,"messages":9,"skipped":1}`))
	if err != nil || a.Imports == nil || a.Imports.Op != "run" || a.Imports.Threads != 2 || a.Imports.Messages != 9 {
		t.Fatalf("import_answer: %#v %v", a.Imports, err)
	}
}

func TestImportsPane(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent, tt := importApp(t, lang)
		L := app.L
		app.openTab(TabImport)
		if _, ok := lastSent[protocol.ImportsReq](*sent); !ok {
			t.Fatal("opening the pane doesn't subscribe to the imports")
		}
		app.Receive(importFrame())
		tt.Frame()
		for _, want := range []string{L.T("settings.tab.import"), L.T("imports.lede"), "Lody", L.T("imports.state.total", "3"), L.T("imports.bring")} {
			if !hasText(tt, want) {
				t.Errorf("%s: no %q in %q", lang, want, tt.Texts())
			}
		}
		if hasText(tt, "3 段对话 · 带进来") {
			t.Error("two facts joined with a dot")
		}
		// 带进来 opens the consent card: the read list, the signed-in command, read only, who made
		// it, and only then its two buttons.
		sep := "，"
		if lang == i18n.EN {
			sep = ", "
		}
		if err := tt.Click(L.T("imports.bring") + sep + "Lody"); err != nil {
			t.Fatalf("%s: %v in %q", lang, err, tt.Texts())
		}
		tt.Frame()
		for _, want := range []string{L.T("imports.consent.title"), L.T("imports.consent.path"), L.T("imports.consent.command"), L.T("imports.consent.past"), L.T("imports.consent.made"), L.T("imports.consent.once")} {
			if !hasText(tt, want) {
				t.Errorf("%s: the consent card doesn't say %q in %q", lang, want, tt.Texts())
			}
		}
		if _, ok := lastSent[protocol.ImportConsentReq](*sent); ok {
			t.Fatal("the consent was taken without its 带进来")
		}
		if err := tt.Click(L.T("imports.consent.go") + sep + L.T("imports.consent.path")); err != nil {
			t.Fatalf("%s: %v in %q", lang, err, tt.Texts())
		}
		if f, ok := lastSent[protocol.ImportConsentReq](*sent); !ok || f.ID != "lody" {
			t.Fatalf("%s: consent sends %+v", lang, f)
		}
		// The run's answer and the row: one quiet line where it started.
		app.Receive(importFrame(func(r *protocol.ImportSourceRow) {
			r.Consented = true
			r.Imported = 2
			r.ImportedDay = "2026-11-28"
			zero := 0
			r.Fresh = &zero
			r.Last = &protocol.ImportLast{At: "2026-11-28T10:00:00Z", Threads: 2, Oldest: "2026-10-02", Skipped: 1}
		}))
		tt.Frame()
		if !hasText(tt, L.T("imports.last", "2", app.importDay("2026-10-02"))) {
			t.Errorf("%s: no quiet line after the run: %q", lang, tt.Texts())
		}
		if !hasText(tt, L.T("imports.last.skipped", "1")) {
			t.Errorf("%s: the skipped line is missing: %q", lang, tt.Texts())
		}
	}
}

func TestImportRemovalAsksWhatItHides(t *testing.T) {
	app, sent, tt := importApp(t, i18n.ZH)
	L := app.L
	app.openTab(TabImport)
	app.Receive(importFrame(func(r *protocol.ImportSourceRow) {
		r.Consented = true
		r.Imported = 2
	}))
	app.imports.remove = "lody" // the ⋯ menu opened it
	tt.Frame()
	if !hasText(tt, L.T("imports.remove.ask", "2")) {
		t.Fatalf("removal doesn't say what it hides: %q", tt.Texts())
	}
	if _, ok := lastSent[protocol.ImportRemoveReq](*sent); ok {
		t.Fatal("removal went before it was confirmed")
	}
	if err := tt.Click(L.T("imports.remove.no")); err != nil {
		t.Fatalf("%v in %q", err, tt.Texts())
	}
	if _, ok := lastSent[protocol.ImportRemoveReq](*sent); ok {
		t.Fatal("先不 removed the source")
	}
	app.imports.remove = "lody"
	tt.Frame()
	if err := tt.Click(L.T("imports.remove.yes") + "，Lody"); err != nil {
		t.Fatalf("%v in %q", err, tt.Texts())
	}
	if f, ok := lastSent[protocol.ImportRemoveReq](*sent); !ok || f.ID != "lody" {
		t.Fatalf("removal sends %+v", f)
	}
}

func TestImportProblemsInPlainWords(t *testing.T) {
	app, _, tt := importApp(t, i18n.ZH)
	L := app.L
	app.openTab(TabImport)
	for _, c := range []struct {
		state   string
		problem string
		want    string
	}{
		{"missing", "no_lody", L.T("imports.problem.no_lody")},
		{"signed_out", "signed_out", L.T("imports.problem.signed_out")},
		{"needs_authorization", "needs_authorization", L.T("imports.problem.needs_authorization")},
	} {
		app.Receive(importFrame(func(r *protocol.ImportSourceRow) {
			r.State, r.Problem = c.state, c.problem
			r.Total = nil
		}))
		tt.Frame()
		if !hasText(tt, c.want) {
			t.Errorf("%s: no %q in %q", c.state, c.want, tt.Texts())
		}
	}
}

func TestPastImportOffer(t *testing.T) {
	app, sent := pastApp(t, i18n.ZH)
	L := app.L
	app.Receive(importFrame(func(r *protocol.ImportSourceRow) {
		total := 2
		r.Total = &total
	}))
	app.S.Imports.Offer = &protocol.ImportOffer{ID: "lody", App: "Lody", Total: func() *int { n := 2; return &n }()}
	app.OpenPast("")
	if _, ok := lastSent[protocol.ImportsReq](*sent); !ok {
		t.Fatal("Past tasks doesn't ask about the offer")
	}
	q, _ := lastPast[protocol.PastReq](*sent)
	app.Receive(pastResult(nil, q.ID))
	tt := ui.NewTesterWith(app.View, 1280, 1200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	if !hasText(tt, L.T("imports.offer", "2")) {
		t.Fatalf("no offer in %q", tt.Texts())
	}
	if _, ok := lastSent[protocol.ImportOfferReq](*sent); !ok {
		t.Fatal("drawing the offer doesn't say it was seen")
	}
	if err := tt.Click(L.T("imports.offer.no") + "，Lody"); err != nil {
		t.Fatalf("%v in %q", err, tt.Texts())
	}
	if f, ok := lastSent[protocol.ImportOfferReq](*sent); !ok || f.Action != "decline" || f.ID != "lody" {
		t.Fatalf("先不 sends %+v", f)
	}
}
