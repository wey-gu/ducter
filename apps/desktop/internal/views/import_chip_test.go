package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

func TestImportedCardWords(t *testing.T) {
	app, _ := pastApp(t, i18n.ZH)
	if got, _ := app.pastEndWord(&protocol.PastItem{Attention: protocol.Done, Imported: &protocol.PastImported{App: "Lody"}}); got != "" {
		t.Errorf("a known app's card also says %q; the app is the fact", got)
	}
	if got, _ := app.pastEndWord(&protocol.PastItem{Attention: protocol.Done, Imported: &protocol.PastImported{}}); got != app.L.T("past.end.imported") {
		t.Errorf("an unknown app's card says %q, want %q", got, app.L.T("past.end.imported"))
	}
}

// D651: an imported thread whose source named no agent gives no empty chip; the filter row's
// gaps stay the row's own, and a single real agent is not shown as a chip by itself.
func TestImportFacetsHaveNoEmptyHarness(t *testing.T) {
	wanted := map[string]bool{"t_imp_wal": true, "t_imp_kyoto": true, "t_imp_old": true}
	var picked []protocol.PastItem
	for _, it := range pastItems(pastSeeds()) {
		if wanted[it.TaskID] {
			picked = append(picked, it)
		}
	}
	res := pastResult(picked, "")
	for _, h := range res.Past.Facets.Harnesses {
		if h.Harness == "" {
			t.Fatal("an empty harness facet would be an empty chip in Past's filter row")
		}
	}
	if len(res.Past.Facets.Harnesses) != 1 || res.Past.Facets.Harnesses[0].Harness != "codex" {
		t.Errorf("harness facets %#v, want only codex", res.Past.Facets.Harnesses)
	}
}
