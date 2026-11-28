package views

// D652: the Memory page's 改 and 忘掉, after the fix: the row waits for Nowledge Mem, a refusal
// is one line in the failed ink with why and the row as it was, and a success is the said line.
// Pictures for .shots/memfix/after (Mac 1150, zh/en, light/dark):
//
//	DUCTER_MEMFIX_SHOTS=/path/to/.shots/memfix/after/mac go test ./internal/views -run TestMemFixAfterShots
import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

func TestMemFixAfterShots(t *testing.T) {
	dir := os.Getenv("DUCTER_MEMFIX_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_MEMFIX_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	type scene struct {
		name string
		set  func(app *App, lang i18n.Lang)
	}
	scenes := []scene{
		{"row-open", func(app *App, lang i18n.Lang) { app.memPage.open = memAbout(lang)[0].ID }},
		{"forget-tapped", func(app *App, lang i18n.Lang) {
			item := memAbout(lang)[0]
			app.memPage.open = item.ID
			app.memForget(item.ID, item.Title)
		}},
		{"forget-refused", func(app *App, lang i18n.Lang) {
			item := memAbout(lang)[0]
			app.memPage.open = item.ID
			app.memForget(item.ID, item.Title)
			app.Receive(protocol.ServerFrame{T: "mem_done", MemDone: &protocol.MemDone{ID: item.ID, Op: "forget", OK: false, Why: "signed_out"}})
		}},
		{"fix-tapped", func(app *App, lang i18n.Lang) {
			item := memAbout(lang)[1]
			app.memPage.open = item.ID
			app.memFix(item.ID, "Chat in Chinese", item.Kind)
		}},
		{"fix-refused", func(app *App, lang i18n.Lang) {
			item := memAbout(lang)[1]
			app.memPage.open = item.ID
			app.memFix(item.ID, "Chat in Chinese", item.Kind)
			app.Receive(protocol.ServerFrame{T: "mem_done", MemDone: &protocol.MemDone{ID: item.ID, Op: "fix", OK: false, Why: "unreachable"}})
		}},
		{"fix-done", func(app *App, lang i18n.Lang) {
			item := memAbout(lang)[1]
			app.memPage.open = item.ID
			app.memFix(item.ID, "Chat in Chinese", item.Kind)
			app.Receive(protocol.ServerFrame{T: "mem_done", MemDone: &protocol.MemDone{ID: item.ID, Op: "fix", OK: true, Title: "Chat in Chinese", NewID: "m_fixed"}})
			// The fresh settings frame the home pushes: the row is the replacement, under its new id.
			for i := range app.S.Mem.Glance.About {
				if app.S.Mem.Glance.About[i].ID == item.ID {
					app.S.Mem.Glance.About[i].ID, app.S.Mem.Glance.About[i].Title = "m_fixed", "Chat in Chinese"
				}
			}
			app.memPage.open = "m_fixed"
		}},
		{"forget-done", func(app *App, lang i18n.Lang) {
			item := memAbout(lang)[0]
			app.memPage.open = item.ID
			app.memForget(item.ID, item.Title)
			app.Receive(protocol.ServerFrame{T: "mem_done", MemDone: &protocol.MemDone{ID: item.ID, Op: "forget", OK: true, Title: item.Title}})
			// The fresh settings frame the home pushes: the row leaves.
			kept := app.S.Mem.Glance.About[:0]
			for _, it := range app.S.Mem.Glance.About {
				if it.ID != item.ID {
					kept = append(kept, it)
				}
			}
			app.S.Mem.Glance.About, app.memPage.open = kept, ""
		}},
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			for _, sc := range scenes {
				app, _ := memApp(t, lang, "on")
				app.openTab(TabMemory)
				sc.set(app, lang)
				tt := ui.NewTesterWith(app.View, 1150, 2600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetScale(2)
				tt.SetDark(dark)
				for i := 0; i < 10; i++ {
					tt.Advance(150 * 1000 * 1000)
					tt.Frame()
				}
				theme := "light"
				if dark {
					theme = "dark"
				}
				f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-1150-%s-%s.png", sc.name, theme, lang)))
				if err != nil {
					t.Fatal(err)
				}
				if err := png.Encode(f, tt.Image()); err != nil {
					t.Fatal(err)
				}
				f.Close()
			}
		}
	}
}
