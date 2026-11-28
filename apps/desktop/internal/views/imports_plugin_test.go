package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D668 (research/246 §3.6, §3.10, §3.11): an added plugin's row on the Mac. It says 你加的
// / Added by you, who made it and its repository as their own lines, and 没有人替你检查过 /
// Nobody has checked it for you outside the curated list. Its consent card names each declared
// path; 更新 sends the update request; an update that widens the list opens the card again.

func pluginImportFrame(over ...func(*protocol.ImportSourceRow)) protocol.ServerFrame {
	row := protocol.ImportSourceRow{
		ID:         "fixture-reader",
		App:        "Fixture Notes",
		Kind:       "plugin",
		State:      "ready",
		Added:      true,
		Repo:       "https://example.test/fixture.git",
		Author:     "Ducter tests",
		Reads:      []string{"./threads.json", "~/Library/Notes/**/*.sqlite*"},
		Unreviewed: true,
	}
	for _, f := range over {
		f(&row)
	}
	return protocol.ServerFrame{T: "imports", Imports: &protocol.ImportsFrame{Sources: []protocol.ImportSourceRow{row}}}
}

func TestPluginImportRow(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent, tt := importApp(t, lang)
		L := app.L
		app.openTab(TabImport)
		app.Receive(pluginImportFrame(func(r *protocol.ImportSourceRow) { r.Update = &protocol.ImportUpdate{Version: "0.2.0"} }))
		tt.Frame()
		for _, want := range []string{L.T("imports.added"), L.T("imports.author", "Ducter tests"), "https://example.test/fixture.git", L.T("imports.unreviewed"), L.T("imports.state.plugin")} {
			if !hasText(tt, want) {
				t.Errorf("%s: no %q in %q", lang, want, tt.Texts())
			}
		}
		if hasText(tt, "你加的 https://example.test/fixture.git") {
			t.Error("added and the repository were joined")
		}
		// 更新 sends the request; nothing changes before the home answers.
		sep := "，"
		if lang == i18n.EN {
			sep = ", "
		}
		if err := tt.Click(L.T("imports.update") + sep + "Fixture Notes"); err != nil {
			t.Fatalf("%s: %v in %q", lang, err, tt.Texts())
		}
		if f, ok := lastSent[protocol.ImportUpdateReq](*sent); !ok || f.ID != "fixture-reader" {
			t.Fatalf("%s: update sends %+v", lang, f)
		}
	}
}

func TestPluginConsentNamesEveryPath(t *testing.T) {
	app, _, tt := importApp(t, i18n.ZH)
	L := app.L
	app.openTab(TabImport)
	app.Receive(pluginImportFrame())
	tt.Frame()
	if err := tt.Click(L.T("imports.bring") + "，Fixture Notes"); err != nil {
		t.Fatalf("%v in %q", err, tt.Texts())
	}
	tt.Frame()
	for _, want := range []string{L.T("imports.consent.title"), "./threads.json", "~/Library/Notes/**/*.sqlite*", L.T("imports.consent.nonet"), L.T("imports.consent.past"), L.T("imports.consent.made.plugin", "Ducter tests")} {
		if !hasText(tt, want) {
			t.Errorf("the plugin consent card doesn't say %q in %q", want, tt.Texts())
		}
	}
	// The signed-in lody sentence belongs to the built-in source only.
	if hasText(tt, L.T("imports.consent.command")) {
		t.Error("a plugin's card borrowed the lody command sentence")
	}
}

func TestPluginReviewedAndUpdate(t *testing.T) {
	app, _, tt := importApp(t, i18n.ZH)
	L := app.L
	app.openTab(TabImport)
	app.Receive(pluginImportFrame(func(r *protocol.ImportSourceRow) {
		r.Unreviewed = false
		r.Reviewed = true
		r.Update = &protocol.ImportUpdate{Version: "0.2.0"}
	}))
	tt.Frame()
	if !hasText(tt, L.T("imports.reviewed")) {
		t.Errorf("a curated version doesn't say Ducter checked it: %q", tt.Texts())
	}
	if hasText(tt, L.T("imports.unreviewed")) {
		t.Error("a curated version says nobody checked it")
	}
	if !hasText(tt, L.T("imports.state.update", "0.2.0")) {
		t.Errorf("no update line: %q", tt.Texts())
	}
}

func TestPluginUpdateWideningOpensConsent(t *testing.T) {
	app, _, tt := importApp(t, i18n.ZH)
	app.openTab(TabImport)
	app.Receive(pluginImportFrame())
	tt.Frame()
	app.Receive(protocol.ServerFrame{T: "import_answer", Imports: &protocol.ImportsFrame{ID: "fixture-reader", Op: "update", OK: true, NeedsConsent: true, Widened: true}})
	tt.Frame()
	if app.imports.consent != "fixture-reader" {
		t.Fatalf("the widened update didn't open the consent card: %+v", app.imports)
	}
	if !hasText(tt, app.L.T("imports.consent.title")) {
		t.Errorf("no consent card after a widened update: %q", tt.Texts())
	}
}
