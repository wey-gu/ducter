package views

import (
	"image"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// memKeepApp is fileApp's conversation with Nowledge Mem connected and signed in.
func memKeepApp(t *testing.T, lang i18n.Lang) (*App, *[]any, []protocol.MediaRef) {
	app, _, refs := fileApp(t, lang)
	sent := &[]any{}
	app.Send = func(f any) error { *sent = append(*sent, f); return nil }
	app.S.Settings = &protocol.Settings{Name: "Ducter", Memory: true}
	app.S.Mem = &protocol.MemView{State: "connected"}
	return app, sent, refs
}

// D566: Save to Nowledge Mem under a file card Ducter made: only while Mem
// is there to take it; a tap asks the home once; the answer turns it to In
// Nowledge Mem or says why not, in Mem's words, with the one fix.
func TestMemKeepCard(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent, refs := memKeepApp(t, lang)
		L := app.L
		tt := mediaTester(app, 1150, 900)
		if !hasText(tt, L.T("memfile.save")) {
			t.Fatalf("%s: no Save to Nowledge Mem under the cards: %q", lang, tt.Texts())
		}
		// Signed out (Mem's doctor says so): no action at all.
		app.S.Mem.Health = &protocol.MemHealth{Issue: "signed_out"}
		tt.Frame()
		if hasText(tt, L.T("memfile.save")) {
			t.Fatalf("%s: Save to Nowledge Mem shown while Mem's sign-in has lapsed", lang)
		}
		app.S.Mem.Health = nil
		tt.Frame()
		app.keepInMem(refs[0])
		app.keepInMem(refs[0]) // a second tap while saving sends nothing more
		n := 0
		for _, f := range *sent {
			if r, ok := f.(protocol.MemFileSaveReq); ok && r.Media == refs[0].ID {
				n++
			}
		}
		if n != 1 {
			t.Fatalf("%s: %d mem_file_save frames, want 1", lang, n)
		}
		tt.Frame()
		if !hasText(tt, L.T("memfile.saving")) {
			t.Fatalf("%s: no saving line: %q", lang, tt.Texts())
		}
		app.Receive(protocol.ServerFrame{T: "mem_file_save", MemFile: &protocol.MemFileAnswer{Media: refs[0].ID, OK: true, Saved: &protocol.MemFileSaved{URI: "nowledgemem://source/src_1", Rev: 1, Web: "https://cloud.nowledge.co/app"}}})
		tt.Frame()
		if !hasText(tt, L.T("memfile.saved")) {
			t.Fatalf("%s: not In Nowledge Mem after the answer: %q", lang, tt.Texts())
		}
		// A refusal says Mem's reason and offers the fix.
		app.Receive(protocol.ServerFrame{T: "mem_file_save", MemFile: &protocol.MemFileAnswer{Media: refs[1].ID, Why: "signed_out"}})
		tt.Frame()
		if !hasText(tt, L.T("memfile.failed", L.T("memfile.why.signed_out"))) || !hasText(tt, L.T("memfile.signin")) {
			t.Fatalf("%s: the refusal isn't said with its fix: %q", lang, tt.Texts())
		}
	}
}

// The Settings row: off by default, on sends memFiles; a trouble line says why.
func TestMemFilesRow(t *testing.T) {
	app, sent := memApp(t, i18n.ZH, "on")
	app.S.Mem.FileTrouble = &protocol.MemFileTrouble{Name: "周报.pdf", Why: "unreachable"}
	app.openTab(TabMemory)
	tt := ui.NewTesterWith(app.View, 1150, 2400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	if !hasText(tt, app.L.T("memfile.row")) || !hasText(tt, app.L.T("memfile.row.line")) {
		t.Fatalf("no row: %q", tt.Texts())
	}
	app.S.Settings.MemFiles = true
	tt.Frame()
	if !hasText(tt, app.L.T("memfile.trouble", "周报.pdf", app.L.T("memfile.why.unreachable"))) {
		t.Fatalf("no trouble line: %q", tt.Texts())
	}
	_ = sent
}

// Shots: DUCTER_MEMKEEP_SHOTS=<dir> go test ./internal/views -run TestMemKeepShots
func TestMemKeepShots(t *testing.T) {
	dir := os.Getenv("DUCTER_MEMKEEP_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_MEMKEEP_SHOTS not set")
	}
	os.Setenv("DUCTER_MEDIA_SHOTS", dir) // 2x
	defer os.Unsetenv("DUCTER_MEDIA_SHOTS")
	os.MkdirAll(dir, 0o755)
	memAppHere = func() bool { return true }
	save := func(img image.Image, name string) {
		f, err := os.Create(filepath.Join(dir, name+".png"))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		png.Encode(f, img)
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			theme := map[bool]string{false: "light", true: "dark"}[dark]
			for _, state := range []string{"1-can", "2-saving", "3-saved", "4-failed", "4b-failed-words"} {
				app, _, refs := memKeepApp(t, lang)
				L := app.L
				switch state {
				case "2-saving":
					app.keepInMem(refs[0])
				case "3-saved":
					app.S.Mem.Files = map[string]protocol.MemFileSaved{refs[0].ID: {URI: "nowledgemem://source/src_1", Rev: 1}}
				case "4-failed":
					app.memKeep = map[string]*memKeepNow{refs[0].ID: {why: "unreachable", msg: "error sending request: connection refused (os error 61)"}}
				case "4b-failed-words":
					app.memKeep = map[string]*memKeepNow{refs[0].ID: {why: "no_space", msg: "Pass --space (or --parent) to choose where the folder goes."}}
					app.open = map[string]bool{"mkraw:" + refs[0].ID: true}
				}
				tt := mediaTester(app, 1150, 1100)
				tt.SetDark(dark)
				tt.Advance(time.Second)
				tt.Frame()
				name := "mac-" + string(lang) + "-" + state + "-1150-" + theme
				save(tt.Image(), name)
				// 2x crop: the first card and its line.
				want := map[string]string{"1-can": L.T("memfile.save"), "2-saving": L.T("memfile.saving"), "3-saved": L.T("memfile.saved"), "4-failed": L.T("memfile.failed", L.T("memfile.why.unreachable")), "4b-failed-words": L.T("memfile.failed", L.T("memfile.why.no_space"))}[state]
				line, ok := tt.Find(want)
				head, ok2 := tt.Find("investigation.md")
				if !ok || !ok2 {
					t.Fatalf("%s: %q or the card not found: %q", name, want, strings.Join(tt.Texts(), " | "))
				}
				s := float32(2)
				r := image.Rect(int((line.X-40)*s), int((head.Y-150)*s), int((line.X+cardWidth+40)*s), int((line.Y+line.H+40)*s))
				save(tt.Image().SubImage(r), name+"-crop")
			}
			// D572: the viewer's foot bar in each state, with a 2x crop of the bar.
			for _, vs := range []string{"a-idle", "b-saving", "c-saved", "d-failed", "e-failed-words", "f-signed-out"} {
				app, _, refs := memKeepApp(t, lang)
				switch vs {
				case "b-saving":
					app.memKeep = map[string]*memKeepNow{refs[0].ID: {saving: true}}
				case "c-saved":
					app.S.Mem.Files = map[string]protocol.MemFileSaved{refs[0].ID: {URI: "nowledgemem://source/src_1", Rev: 1}}
				case "d-failed":
					app.memKeep = map[string]*memKeepNow{refs[0].ID: {why: "no_space", msg: "Pass --space (or --parent) to choose where the folder goes."}}
				case "e-failed-words":
					app.memKeep = map[string]*memKeepNow{refs[0].ID: {why: "no_space", msg: "Pass --space (or --parent) to choose where the folder goes."}}
					app.open = map[string]bool{"mkraw:" + refs[0].ID: true}
				case "f-signed-out":
					app.memKeep = map[string]*memKeepNow{refs[0].ID: {why: "signed_out", msg: "/sources returned 401: Invalid or missing API key."}}
				}
				tt := mediaTester(app, 1150, 860)
				tt.SetDark(dark)
				app.OpenFile(refs[0], ui.Rect{})
				tt.Advance(time.Second)
				tt.Frame()
				tt.Frame()
				name := "mac-" + string(lang) + "-5" + vs + "-viewer-1150-" + theme
				save(tt.Image(), name)
				if sv, ok := tt.Find(app.L.T("file.save")); ok {
					s := float32(2)
					r := image.Rect(int(135*s), int((sv.Y-120)*s), int(1015*s), int((sv.Y+sv.H+22)*s))
					save(tt.Image().SubImage(r), name+"-crop")
				}
			}
			// Settings › Memory, the row.
			ma, _ := memApp(t, lang, "on")
			ma.openTab(TabMemory)
			mt := ui.NewTesterWith(ma.View, 1150, 2600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			mt.SetScale(2)
			mt.SetDark(dark)
			for i := 0; i < 12; i++ {
				mt.Advance(150 * time.Millisecond)
				mt.Frame()
			}
			save(mt.Image(), "mac-"+string(lang)+"-6-settings-1150-"+theme)
			if row, ok := mt.Find(ma.L.T("memfile.row")); ok {
				r := image.Rect(int((row.X-120)*2), int((row.Y-40)*2), int((row.X+760)*2), int((row.Y+100)*2))
				save(mt.Image().SubImage(r), "mac-"+string(lang)+"-6-settings-1150-"+theme+"-crop")
			}
		}
	}
}

// D572: the viewer's foot bar keeps one aligned row (来自… | 拷贝 | 存一份 |
// 存到 Nowledge Mem); a failure is its own line above it, in plain words with
// its fix, and Mem's own sentence only behind 原话 / Its words.
func TestMemKeepViewerFailure(t *testing.T) {
	const raw = "Pass --space (or --parent) to choose where the folder goes."
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _, refs := memKeepApp(t, lang)
		L := app.L
		tt := mediaTester(app, 1150, 860)
		app.OpenFile(refs[0], ui.Rect{})
		tt.Advance(time.Second)
		tt.Frame()
		mem := spoken(L, L.T("memfile.save"), refs[0].Name)
		pos := func(s string) ui.Rect {
			r, ok := tt.Find(s)
			if !ok {
				t.Fatalf("%s: %q not in the viewer: %q", lang, s, tt.Texts())
			}
			return r
		}
		saveIdle := pos(L.T("file.save"))
		// Save to Nowledge Mem under the card and in the bar share a name; the bar's is the last one drawn.
		app.memKeep = map[string]*memKeepNow{refs[0].ID: {why: "gone"}} // the card shows its line, not a button
		tt.Frame()
		memIdle := pos(mem)
		app.memKeep = nil
		tt.Frame()
		mid := func(r ui.Rect) float32 { return r.Y + r.H/2 }
		if saveIdle.X+saveIdle.W > memIdle.X {
			t.Fatalf("%s: Save to Nowledge Mem isn't last in the bar: %v %v", lang, saveIdle, memIdle)
		}
		if d := mid(memIdle) - mid(saveIdle); d > 1 || d < -1 {
			t.Fatalf("%s: the bar's buttons don't share one line: %v vs %v", lang, memIdle, saveIdle)
		}
		app.Receive(protocol.ServerFrame{T: "mem_file_save", MemFile: &protocol.MemFileAnswer{Media: refs[0].ID, Why: "no_space", Message: raw}})
		tt.Frame()
		tt.Frame()
		words := L.T("memfile.failed", L.T("memfile.why.no_space"))
		if n := strings.Count(strings.Join(tt.Texts(), "\n"), words); n != 2 { // under the card, and above the viewer's bar
			t.Fatalf("%s: the failure is said %d times, want the card's and the viewer's: %q", lang, n, tt.Texts())
		}
		if hasText(tt, raw) {
			t.Fatalf("%s: Mem's raw sentence is shown without asking", lang)
		}
		// The bar didn't move: the same buttons at the same places.
		if r := pos(L.T("file.save")); r != saveIdle {
			t.Fatalf("%s: Save a copy moved when the failure showed: %v -> %v", lang, saveIdle, r)
		}
		if r := pos(mem); r != memIdle {
			t.Fatalf("%s: Save to Nowledge Mem moved when the failure showed: %v -> %v", lang, memIdle, r)
		}
		// Its words, on demand.
		app.open = map[string]bool{"mkraw:" + refs[0].ID: true}
		tt.Frame()
		if !hasText(tt, raw) {
			t.Fatalf("%s: 原话 doesn't show Mem's sentence: %q", lang, tt.Texts())
		}
		if strings.Contains(words, raw) {
			t.Fatalf("%s: Mem's words in the line itself", lang)
		}
	}
}

// D572: the failed state is in the needs-you ink, never the failed red; the
// card's line has its words, its fix and 原话.
func TestMemKeepTroubleInk(t *testing.T) {
	app, _, refs := memKeepApp(t, i18n.ZH)
	app.memKeep = map[string]*memKeepNow{refs[0].ID: {why: "unreachable", msg: "error sending request: connection refused"}}
	src, err := os.ReadFile("memkeep.go")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(src), "Failed.Ink") {
		t.Fatal("memkeep.go still paints a failure in the failed ink")
	}
	tt := mediaTester(app, 1150, 900)
	if !hasText(tt, app.L.T("memfile.failed", app.L.T("memfile.why.unreachable"))) || !hasText(tt, app.L.T("memfile.retry")) || !hasText(tt, app.L.T("memfile.raw")) {
		t.Fatalf("the card's failed line lacks its words, fix or 原话: %q", tt.Texts())
	}
}
