package mock

import (
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D341, 待办来源 / To-do sources: GitHub signed in as lin-dev (3 open, 1
// being done, take set after two) and the Obsidian vault Life; Obsidian
// also lists Work notes. Choices, adds and removes are answered ok and
// change nothing; the pick lists the same five open to-dos for any query.

func mockSources() map[string]any {
	at := time.Now().Add(-26 * time.Hour).UTC().Format(time.RFC3339)
	return map[string]any{"t": "sources",
		"sources": []protocol.SourceView{
			{ID: "src_gh", Kind: "github", Name: "lin-dev", State: "ok", WhenNew: "take", WhenDone: "ask", Open: 3, Taken: 1,
				Standing: &protocol.SourceStandings{Take: &protocol.SourceStanding{At: at, After: 2}}, CheckedAt: at},
			{ID: "src_life", Kind: "obsidian", Name: "Life", State: "ok", Path: "/Users/lin/Documents/Life", WhenNew: "quiet", WhenDone: "tick", Open: 5, Taken: 1, CheckedAt: at},
		},
		"found": protocol.SourcesFound{
			GitHub: &protocol.SourcesFoundGitHub{State: "ok", Login: "lin-dev", Computer: "Lin's MacBook Pro"},
			Vaults: []protocol.FoundVault{{Name: "Life", Path: "/Users/lin/Documents/Life"}, {Name: "Work notes", Path: "/Users/lin/Documents/Work notes"}},
		},
	}
}

func mockSourceItems(en bool) []protocol.SourceItem {
	w := func(z, e string) string {
		if en {
			return e
		}
		return z
	}
	gh := func(n, title string) protocol.SourceItemRef {
		return protocol.SourceItemRef{Source: "src_gh", Kind: "github", Ref: "acme/web#" + n, Label: "#" + n, Where: "acme/web", Title: title, URL: "https://github.com/acme/web/issues/" + n}
	}
	life := func(note, key, title string) protocol.SourceItemRef {
		return protocol.SourceItemRef{Source: "src_life", Kind: "obsidian", Ref: note + ".md::" + key, Label: note, Where: note + ".md", Title: title, URL: "obsidian://open?vault=Life&file=" + note + ".md"}
	}
	return []protocol.SourceItem{
		{SourceItemRef: gh("12", w("设置页不跟随深色模式", "Settings page ignores dark mode")), State: "open"},
		{SourceItemRef: gh("15", w("导出 CSV 时日期列是空的", "The date column is empty in CSV exports")), State: "open", Labels: []string{"bug"}},
		{SourceItemRef: gh("21", w("把图片上传换成分片上传", "Switch image uploads to chunked uploads")), State: "open"},
		{SourceItemRef: life(w("杂事", "Errands"), "^dentist", w("约牙医洗牙", "Book a dentist cleaning")), State: "open", Due: "2026-11-28"},
		{SourceItemRef: life(w("家", "Home"), "^filter", w("换净水器滤芯", "Replace the water filter")), State: "open"},
	}
}

// handleSources answers the D341 frames; false for others.
func (h *hub) handleSources(c *conn, f protocol.ClientFrame) bool {
	switch f.T {
	case "sources":
		c.send(mockSources())
	case "source_items":
		h.mu.Lock()
		en := h.en
		h.mu.Unlock()
		c.send(map[string]any{"t": "source_items_result", "clientId": f.ClientID, "items": mockSourceItems(en)})
	case "source_add", "source_set", "source_remove":
		op := map[string]string{"source_add": "add", "source_set": "set", "source_remove": "remove"}[f.T]
		c.send(map[string]any{"t": "source_result", "op": op, "ok": true, "id": f.ID})
		c.send(mockSources())
	default:
		return false
	}
	return true
}
