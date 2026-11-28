package views

import (
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D655/D668/D670 (research/246 §3.10, §3.11): 导入 / Import on the Mac. The pane subscribes
// as it opens; a plugin row says its state; 带进来 opens the consent card, all literal, and its
// 带进来 asks the home; an unreviewed online reader must tick the second line first; the quiet
// Available list installs then opens the same card; a repository can be added; a removal says
// what will be hidden first.

func importFrame(over ...func(*protocol.ImportSourceRow)) protocol.ServerFrame {
	row := protocol.ImportSourceRow{
		ID:         "fixture-reader",
		App:        "Fixture Notes",
		Kind:       "plugin",
		State:      "ready",
		Consented:  false,
		Added:      true,
		Author:     "Ducter tests",
		Repo:       "https://example.test/fixture.git",
		SourceName: "fixture",
		Reads:      []string{"./threads.json", "~/Library/Notes/**/*.sqlite*"},
		Unreviewed: true,
	}
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
	f, err := protocol.DecodeServerFrame([]byte(`{"t":"imports","sources":[{"id":"fixture-reader","app":"Fixture Notes","kind":"plugin","state":"ready","imported":3,"consented":true,"added":true,"repo":"https://example.test/fixture.git","author":"Ducter tests","reads":["./threads.json"],"unreviewed":true,"online":true,"needsOnlineConsent":true,"uses":[{"command":"lody","online":true,"why":{"en":"online","zh":"会联网"}}],"icon":"data:image/png;base64,AA==","last":{"at":"2026-11-28T10:00:00Z","threads":2,"oldest":"2026-10-02","skipped":1}}],"repositories":[{"id":"official","url":"https://github.com/wey-gu/ducter-plugins","official":true,"state":"ready","plugins":2}],"available":[{"id":"lody","app":"Lody","name":"Lody","version":"0.1.0","commit":"aaaa1111","hash":"bbbb","source":"official","sourceUrl":"https://github.com/wey-gu/ducter-plugins","sourceName":"wey-gu/ducter-plugins","official":true,"reads":["~/.lody/**"],"uses":[],"online":false,"detected":true,"reviewed":true}]}`))
	if err != nil || f.Imports == nil || len(f.Imports.Sources) != 1 || f.Imports.Sources[0].Imported != 3 || f.Imports.Sources[0].Last.Skipped != 1 {
		t.Fatalf("imports: %#v %v", f.Imports, err)
	}
	if !f.Imports.Sources[0].Online || !f.Imports.Sources[0].NeedsOnlineConsent || len(f.Imports.Sources[0].Uses) != 1 || f.Imports.Sources[0].Uses[0].Why.Zh != "会联网" {
		t.Fatalf("plugin fields: %#v", f.Imports.Sources[0])
	}
	if len(f.Imports.Repositories) != 1 || !f.Imports.Repositories[0].Official || len(f.Imports.Available) != 1 || !f.Imports.Available[0].Detected || f.Imports.Available[0].SourceName != "wey-gu/ducter-plugins" {
		t.Fatalf("repositories and available: %#v", f.Imports)
	}
	a, err := protocol.DecodeServerFrame([]byte(`{"t":"import_answer","id":"fixture-reader","op":"run","ok":true,"threads":2,"messages":9,"skipped":1}`))
	if err != nil || a.Imports == nil || a.Imports.Op != "run" || a.Imports.Threads != 2 || a.Imports.Messages != 9 {
		t.Fatalf("import_answer: %#v %v", a.Imports, err)
	}
	u, err := protocol.DecodeServerFrame([]byte(`{"t":"import_answer","id":"fixture-reader","op":"update","ok":true,"needsConsent":true,"widened":true}`))
	if err != nil || u.Imports == nil || u.Imports.Op != "update" || !u.Imports.NeedsConsent || !u.Imports.Widened {
		t.Fatalf("update answer: %#v %v", u.Imports, err)
	}
	i, err := protocol.DecodeServerFrame([]byte(`{"t":"import_answer","id":"fixture-reader","op":"install","ok":true,"needsConsent":true}`))
	if err != nil || i.Imports == nil || i.Imports.Op != "install" || !i.Imports.NeedsConsent {
		t.Fatalf("install answer: %#v %v", i.Imports, err)
	}
	s, err := protocol.DecodeServerFrame([]byte(`{"t":"import_answer","id":"source","op":"source_add","ok":true,"sourceId":"src-abc"}`))
	if err != nil || s.Imports == nil || s.Imports.SourceID != "src-abc" {
		t.Fatalf("source answer: %#v %v", s.Imports, err)
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
		for _, want := range []string{L.T("settings.tab.import"), app.importsSay(), "Fixture Notes", L.T("imports.state.plugin"), L.T("imports.bring"), L.T("imports.added"), "fixture"} {
			if !hasText(tt, want) {
				t.Errorf("%s: no %q in %q", lang, want, tt.Texts())
			}
		}
		if hasText(tt, "装好了 · 带进来") || hasText(tt, "Installed · Bring them in") {
			t.Error("two facts joined with a dot")
		}
		// 带进来 opens the consent card: each declared path, no network, read only, who made it,
		// and only then its two buttons.
		sep := "，"
		if lang == i18n.EN {
			sep = ", "
		}
		if err := tt.Click(L.T("imports.bring") + sep + "Fixture Notes"); err != nil {
			t.Fatalf("%s: %v in %q", lang, err, tt.Texts())
		}
		tt.Frame()
		for _, want := range []string{L.T("imports.consent.title"), "./threads.json", "~/Library/Notes/**/*.sqlite*", L.T("imports.consent.nonet"), L.T("imports.consent.past"), L.T("imports.consent.made.plugin", "Ducter tests"), L.T("imports.consent.once")} {
			if !hasText(tt, want) {
				t.Errorf("%s: the consent card doesn't say %q in %q", lang, want, tt.Texts())
			}
		}
		if _, ok := lastSent[protocol.ImportConsentReq](*sent); ok {
			t.Fatal("the consent was taken without its 带进来")
		}
		if err := tt.Click(L.T("imports.consent.go") + sep + L.T("imports.consent.title")); err != nil {
			t.Fatalf("%s: %v in %q", lang, err, tt.Texts())
		}
		if f, ok := lastSent[protocol.ImportConsentReq](*sent); !ok || f.ID != "fixture-reader" {
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
		if !hasText(tt, L.T("imports.last.skipped.one")) {
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
	app.imports.remove = "fixture-reader" // the ⋯ menu opened it
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
	app.imports.remove = "fixture-reader"
	tt.Frame()
	if err := tt.Click(L.T("imports.remove.yes") + "，Fixture Notes"); err != nil {
		t.Fatalf("%v in %q", err, tt.Texts())
	}
	if f, ok := lastSent[protocol.ImportRemoveReq](*sent); !ok || f.ID != "fixture-reader" {
		t.Fatalf("removal sends %+v", f)
	}
}

func TestImportProblemsInPlainWords(t *testing.T) {
	app, _, tt := importApp(t, i18n.ZH)
	L := app.L
	app.openTab(TabImport)
	for _, c := range []struct {
		problem string
		want    string
	}{
		{"needs_newer", L.T("imports.problem.needs_newer")},
		{"sandbox_unavailable", L.T("imports.problem.sandbox_unavailable")},
		{"hash_mismatch", L.T("imports.problem.hash_mismatch")},
		{"broken", L.T("imports.problem.broken")},
	} {
		app.Receive(importFrame(func(r *protocol.ImportSourceRow) {
			r.State, r.Problem = "failed", c.problem
		}))
		tt.Frame()
		if !hasText(tt, c.want) {
			t.Errorf("%s: no %q in %q", c.problem, c.want, tt.Texts())
		}
	}
}

func TestImportOnlineNeedsTheSecondTick(t *testing.T) {
	app, sent, tt := importApp(t, i18n.ZH)
	L := app.L
	app.openTab(TabImport)
	app.Receive(importFrame(func(r *protocol.ImportSourceRow) {
		r.Online = true
		r.NeedsOnlineConsent = true
		r.Uses = []protocol.ImportUse{{Command: "lody", Online: true, Why: protocol.ImportWhy{En: "goes online", Zh: "会联网"}}}
	}))
	tt.Frame()
	sep := "，"
	if err := tt.Click(L.T("imports.bring") + sep + "Fixture Notes"); err != nil {
		t.Fatalf("%v in %q", err, tt.Texts())
	}
	tt.Frame()
	for _, want := range []string{L.T("imports.consent.title"), "lody", L.T("imports.consent.online.unreviewed")} {
		if !hasText(tt, want) {
			t.Errorf("the online card doesn't say %q in %q", want, tt.Texts())
		}
	}
	// The online fact is the use's own sentence; there is no separate bold 它会联网。 line.
	if hasText(tt, L.T("imports.consent.nonet")) {
		t.Errorf("the online card said it can't go online: %q", tt.Texts())
	}
	// Without the tick there is no 带进来 button on the card (the sentence "带进来的…" is not it).
	if hasText(tt, L.T("imports.consent.go")+"，"+L.T("imports.consent.title")) {
		t.Errorf("the online reader's card offered 带进来 before the second line: %q", tt.Texts())
	}
	app.imports.online["fixture-reader"] = true
	tt.Frame()
	if err := tt.Click(L.T("imports.consent.go") + sep + L.T("imports.consent.title")); err != nil {
		t.Fatalf("%v in %q", err, tt.Texts())
	}
	if f, ok := lastSent[protocol.ImportConsentReq](*sent); !ok || f.ID != "fixture-reader" || !f.Online {
		t.Fatalf("the online consent sends %+v", f)
	}
}

func TestImportAvailableAndRepositories(t *testing.T) {
	app, sent, tt := importApp(t, i18n.ZH)
	L := app.L
	app.openTab(TabImport)
	app.Receive(protocol.ServerFrame{T: "imports", Imports: &protocol.ImportsFrame{
		Repositories: []protocol.ImportRepository{
			{ID: "official", URL: "https://github.com/wey-gu/ducter-plugins", Official: true, State: "ready", Plugins: func() *int { n := 2; return &n }()},
			{ID: "src-abc", URL: "https://example.test/theirs", State: "ready", Plugins: func() *int { n := 1; return &n }()},
		},
		Available: []protocol.ImportAvailable{
			{ID: "lody", App: "Lody", Name: "Lody", Version: "0.1.0", Commit: "aaaa1111", Hash: "bbbb", Source: "official", SourceURL: "https://github.com/wey-gu/ducter-plugins", Official: true, Reads: []string{"~/.lody/**"}, Detected: true, Reviewed: true},
		},
	}})
	tt.Frame()
	for _, want := range []string{L.T("imports.avail.title"), "Lody", L.T("imports.avail.detected"), L.T("imports.avail.official"), L.T("imports.repo.title"), "https://example.test/theirs", L.T("imports.repo.count", "1")} {
		if !hasText(tt, want) {
			t.Errorf("no %q in %q", want, tt.Texts())
		}
	}
	if hasText(tt, "Lody · Fixture") {
		t.Error("two facts joined with a dot")
	}
	// Bring them in on Available installs, then the card opens when the installed row arrives.
	if err := tt.Click(L.T("imports.bring") + "，Lody"); err != nil {
		t.Fatalf("%v in %q", err, tt.Texts())
	}
	if f, ok := lastSent[protocol.ImportInstallReq](*sent); !ok || f.Source != "official" || f.ID != "lody" {
		t.Fatalf("install sends %+v", f)
	}
	app.Receive(protocol.ServerFrame{T: "import_answer", Imports: &protocol.ImportsFrame{ID: "lody", Op: "install", OK: true, NeedsConsent: true}})
	app.Receive(importFrame(func(r *protocol.ImportSourceRow) { r.ID, r.App = "lody", "Lody" }))
	tt.Frame()
	if app.imports.consent != "lody" {
		t.Fatalf("the install's consent card didn't open: %+v", app.imports)
	}

	// 加一个插件仓库: the form opens, and Add sends the URL.
	app.imports.addRepo = true
	app.imports.repoURL = "https://example.test/new"
	tt.Frame()
	if !hasText(tt, L.T("imports.repo.field")) {
		t.Errorf("no repository field: %q", tt.Texts())
	}
	if err := tt.Click(L.T("imports.repo.submit") + "，" + L.T("imports.repo.title")); err != nil {
		t.Fatalf("%v in %q", err, tt.Texts())
	}
	if f, ok := lastSent[protocol.ImportSourceAddReq](*sent); !ok || f.URL != "https://example.test/new" {
		t.Fatalf("source add sends %+v", f)
	}
}
