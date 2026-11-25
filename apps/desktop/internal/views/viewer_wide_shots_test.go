package views

import (
	"image"
	"image/png"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D567's fixtures: a competitive-analysis report with a 9-column pricing
// table, long URLs and wide code blocks; a 200-column CSV; a long code file;
// a long PDF (apps/web/demo-files, shared with the web demo).
func wideFiles(t *testing.T, h *fakeHome, zh bool) []protocol.MediaRef {
	t.Helper()
	read := func(name string) []byte {
		b, err := os.ReadFile(filepath.Join("..", "..", "..", "web", "demo-files", name))
		if err != nil {
			t.Fatal(err)
		}
		return b
	}
	report, name := read("compare.en.md"), "mem-compare.md"
	if zh {
		report, name = read("compare.zh.md"), "Mem 对比.md"
	}
	code, err := os.ReadFile("fileview.go")
	if err != nil {
		t.Fatal(err)
	}
	return []protocol.MediaRef{
		h.fileRef(report, "text/markdown", name),
		h.fileRef(read("eval-nightly.csv"), "text/csv", "eval-nightly.csv"),
		h.fileRef(code, "text/plain", "fileview.go"),
		h.fileRef(researchPDFTimes(8), "application/pdf", "research.pdf"),
	}
}

func wideApp(t *testing.T, lang i18n.Lang) (*App, []protocol.MediaRef) {
	app, _, h := mediaApp(t, lang)
	zh := lang == i18n.ZH
	refs := wideFiles(t, h, zh)
	say := "I read the five pricing pages and put what lines up into one table; the rest is under it."
	if zh {
		say = "五家的定价页我都读了，能对上的放进了一张表，对不上的写在表下面。"
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		mev(1, 5*time.Minute, "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: map[bool]string{true: "看看 Nowledge Mem 在记忆这一类里站在哪儿", false: "Where does Nowledge Mem stand among memory layers?"}[zh]}),
		mev(2, 5*time.Minute, protocol.TaskStream("t_file"), protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t_file", Title: map[bool]string{true: "Mem 对比", false: "Mem compared"}[zh], Harness: "claude-code", Place: protocol.Place{Kind: "none"}}),
		mev(3, time.Minute, "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: say, Media: refs}),
	}})
	return app, refs
}

// Shots (D75: outside git):
//
//	DUCTER_WIDE_SHOTS=../../../../.shots/viewer-wide/mac/after go test ./internal/views -run ViewerWideShots
func TestViewerWideShots(t *testing.T) {
	dir := os.Getenv("DUCTER_WIDE_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_WIDE_SHOTS not set")
	}
	os.MkdirAll(dir, 0o755)
	save := func(img image.Image, name string) {
		f, err := os.Create(filepath.Join(dir, name+".png"))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		png.Encode(f, img)
	}
	settle := func(tt *ui.Tester) {
		for k := 0; k < 6; k++ {
			tt.Advance(100 * time.Millisecond)
			tt.Frame()
		}
	}
	shot := func(tt *ui.Tester, name string) {
		settle(tt)
		save(tt.Image(), name)
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			for _, w := range []int{1000, 1150, 1400} {
				app, refs := wideApp(t, lang)
				tt := mediaTester(app, w, 860)
				tt.SetScale(2)
				if dark {
					tt.SetDark(true)
				}
				look := "light"
				if dark {
					look = "dark"
				}
				p := string(lang) + "-" + look + "-" + strconv.Itoa(w) + "-"
				shot(tt, p+"0-cards")
				if r, ok := tt.Find(refs[0].Name); ok {
					img := tt.Image()
					rc := image.Rect(int(r.X-60)*2, int(r.Y-135)*2, int(r.X+300)*2, int(r.Y+45)*2).Intersect(img.Bounds())
					save(img.SubImage(rc), p+"0b-glimpse-2x")
				}
				// The report, at its table.
				app.OpenFile(refs[0], ui.Rect{})
				settle(tt)
				head := map[i18n.Lang]string{i18n.ZH: "一眼看完", i18n.EN: "At a glance"}[lang]
				if r, ok := tt.Find(head); ok {
					tt.Scroll(float32(w)/2, r.Y+r.H, 0, r.Y-110)
				}
				shot(tt, p+"1-report-table")
				wideStates(tt, app, p, shot)
				app.fileView = nil
				tt.Frame()
				// The 200-column CSV, the long code file, the long PDF.
				for i, name := range []string{"2-csv", "3-code", "4-pdf"} {
					app.OpenFile(refs[i+1], ui.Rect{})
					shot(tt, p+name)
					if app.fileView != nil {
						app.fileView.closeFile()
					}
					app.fileView = nil
					tt.Frame()
				}
			}
		}
	}
}

// wideStates shoots the states past the report's first look: the table
// scrolled sideways (its first column staying), 2x crops of its edges, and
// the sheet filling the window.
func wideStates(tt *ui.Tester, app *App, p string, shot func(*ui.Tester, string)) {
	fv := app.fileView
	crop := func(name string, r ui.Rect) {
		img := tt.Image()
		scale := float32(2)
		rc := image.Rect(int(r.X*scale), int(r.Y*scale), int((r.X+r.W)*scale), int((r.Y+r.H)*scale)).Intersect(img.Bounds())
		f, err := os.Create(filepath.Join(os.Getenv("DUCTER_WIDE_SHOTS"), name+".png"))
		if err != nil {
			return
		}
		defer f.Close()
		png.Encode(f, img.SubImage(rc))
	}
	head := "产品"
	if _, ok := tt.Find(head); !ok {
		head = "Product"
	}
	if r, ok := tt.Find(head); ok {
		crop(p+"1b-table-edge-2x", ui.Rect{X: r.X + 700, Y: r.Y - 30, W: 460, H: 420})
	}
	for _, st := range fv.tables {
		st.scroll.X = st.scroll.MaxX / 2
	}
	shot(tt, p+"1c-table-scrolled")
	if r, ok := tt.Find(head); ok {
		crop(p+"1c2-table-start-edge-2x", ui.Rect{X: r.X - 40, Y: r.Y - 30, W: 460, H: 420})
	}
	tt.Key(ui.Cmd, ui.KeyEnter)
	shot(tt, p+"1e-fill")
	crop(p+"1f-fill-head-2x", ui.Rect{X: 0, Y: 0, W: 1400, H: 140})
	tt.Key(ui.Cmd, ui.KeyEnter)
	tt.Frame()
}
