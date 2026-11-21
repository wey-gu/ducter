package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D454: the sheet shows every match: one already handed over sits in its own
// group with its state and the way to its task (never a tick); a name one edit
// from one login is said with its undo; one fact alone is said back on the
// line; a row's reason that only repeats a chip is left off; the count is
// said once (Go names it).
func TestHandSheetD454(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent, tt := handApp(t, lang, 1400, 1000, "")
		w := todoWords(lang)
		items, _ := memFound(lang)
		chip := w("100gle 分给你的", "assigned by 100gle")
		for i := range items {
			items[i].Because = chip
		}
		h := &app.ho
		h.fromChip, h.subject = false, ""
		h.items = items[:2]
		h.found = &protocol.FindSummary{N: 2, Handed: 1}
		h.heard = &protocol.FindSaid{By: "code", Facets: []protocol.FindFacet{{Key: "person:100gle:assigned", Kind: "person", Text: chip, Said: "100gler", By: "code"}}, Guessed: []protocol.FindGuess{{Said: "100gler", Login: "100gle"}}}
		var hi protocol.HandedItem
		hi.FoundItem = items[2]
		hi.Handed.TaskID, hi.Handed.State = "t_general", "failed"
		h.handed = []protocol.HandedItem{hi}
		h.ticked = map[string]bool{items[0].Item.Ref: true, items[1].Item.Ref: true}
		todoFrames(tt, 3)
		// DUCTER_D454_SHOTS=<dir>: the sheet as drawn, light and dark.
		if dir := os.Getenv("DUCTER_D454_SHOTS"); dir != "" {
			_ = os.MkdirAll(dir, 0o755)
			for _, dark := range []bool{false, true} {
				tt.SetDark(dark)
				tt.SetScale(2)
				todoFrames(tt, 6)
				f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-sheet-%s-%s.png", lang, map[bool]string{false: "light", true: "dark"}[dark])))
				if err != nil {
					t.Fatal(err)
				}
				if err := png.Encode(f, withLights(tt.Image())); err != nil {
					t.Fatal(err)
				}
				f.Close()
			}
			tt.SetDark(false)
			todoFrames(tt, 3)
		}
		all := strings.Join(tt.Texts(), " | ")
		for _, want := range []string{w("100gle 分给你的，有 2 个", "2 assigned by 100gle"), w("1 个已经交出去了", "1 already handed over"), w("已经交出去的", "Already handed over"), w("没成", "Didn't work"), w("看看为什么", "See why"), w("按 100gle 找的", "Found by 100gle"), w("不是 100gle", "Not 100gle"), items[2].Item.Title, "#412"} {
			if !strings.Contains(all, want) {
				t.Fatalf("%s: missing %q in %s", lang, want, all)
			}
		}
		alone := 0 // the chip itself; never once more per row
		for _, x := range tt.Texts() {
			if x == chip {
				alone++
			}
		}
		if alone != 1 {
			t.Fatalf("%s: the chip's words repeated on rows (%d): %s", lang, alone, all)
		}
		if strings.Contains(all, "acme/mem#") {
			t.Fatalf("%s: the repository said on every row though all are in one: %s", lang, all)
		}
		if strings.Contains(all, w("勾了 2 个", "2 ticked")) {
			t.Fatalf("%s: the count said twice (the foot and Go): %s", lang, all)
		}
		if strings.Contains(all, " · ") {
			t.Fatalf("dot-joined text (D291): %s", all)
		}
		// 不是 100gle finds again with the guess dropped.
		if err := tt.Click(w("不是 100gle", "Not 100gle")); err != nil {
			t.Fatalf("%s: %v", lang, err)
		}
		todoFrames(tt, 2)
		tt.Advance(time.Second)
		todoFrames(tt, 2)
		r, ok := lastSent[protocol.PileFindReq](*sent)
		if !ok || !containsStr(r.Drop, "guess:100gler") {
			t.Fatalf("%s: the guess wasn't dropped: %+v", lang, r)
		}
	}
}

func containsStr(xs []string, s string) bool {
	for _, x := range xs {
		if x == s {
			return true
		}
	}
	return false
}
