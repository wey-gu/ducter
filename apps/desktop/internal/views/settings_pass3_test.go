package views

import (
	"bufio"
	"encoding/json"
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D399: the third Settings pass. Every pane at the author's real counts (apps/web/demo-settings-real.ts:
// six Codex models, seven accounts, 557 to-dos, nine devices, long names), at 1000 and 1400, zh and en.
//
// The live run shoots each pane and keeps the frames it got as the fixture the geometry test replays:
//
//	DUCTER_PORT=7951 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh bun apps/web/demo-settings-real.ts
//	DUCTER_SHELL_URL=ws://127.0.0.1:7951/ws DUCTER_SHELL_LANG=zh DUCTER_SHOTS_DIR=<.shots/settings-pass3/after> \
//	  DUCTER_RECORD=1 go test ./internal/views -run SettingsPass3Shots
func TestSettingsPass3Shots(t *testing.T) {
	url := os.Getenv("DUCTER_SHELL_URL")
	if url == "" {
		t.Skip("DUCTER_SHELL_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	dir := shotsDir(t)
	var kept []protocol.ServerFrame
	h := dial(t, url, lang)
	if os.Getenv("DUCTER_RECORD") != "" {
		h.rec = func(f protocol.ServerFrame) { kept = append(kept, f) }
	}
	h.until("welcome", func() bool { return h.app.S.Welcomed && h.app.S.OnHand != nil })
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	paper := "light"
	if os.Getenv("DUCTER_SHOTS_DARK") != "" {
		h.tt.SetDark(true)
		paper = "dark"
	}
	settle := func() {
		for i := 0; i < 8; i++ {
			// D424: a little real time too, so a pane that asks the home (chat apps, passwords & cards) has its answer.
			start := time.Now()
			h.until("frames", func() bool { return time.Since(start) > 60*time.Millisecond })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	for _, tab := range settingsTabs {
		h.app.openTab(tab)
		h.until("settings", func() bool { return h.app.S.Settings != nil })
		settle() // a pane that asks (to-do sources, passwords & cards) has its answer before the first shot
		for _, w := range []int{1000, 1400} {
			h.tt.SetSize(w, pass3Height(tab))
			settle()
			name := fmt.Sprintf("mac-%d-%s-%s-%s", w, paper, lang, tab)
			f, err := os.Create(filepath.Join(dir, name+".png"))
			if err != nil {
				t.Fatal(err)
			}
			_ = png.Encode(f, h.tt.Image())
			f.Close()
			if bad := paneGeometry(h.tt, float32(w)); len(bad) > 0 {
				_ = os.WriteFile(filepath.Join(dir, name+".geo.txt"), []byte(strings.Join(bad, "\n")), 0o644)
				t.Logf("%s: %d geometry findings", name, len(bad))
			}
		}
	}
	if os.Getenv("DUCTER_RECORD") != "" {
		f, err := os.Create(filepath.Join("testdata", "settings-real-"+string(lang)+".jsonl"))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		w := bufio.NewWriter(f)
		for _, fr := range kept {
			if !pass3Keep(fr.T) {
				continue
			}
			b, err := pass3Wire(fr)
			if err != nil {
				t.Fatal(err)
			}
			b = pass3Scratch.ReplaceAll(b, []byte("/home/wey")) // never this Mac's own folders
			w.Write(b)
			w.WriteByte('\n')
		}
		w.Flush()
	}
}

// pass3Wire is a frame as the core sent it. Most frames round-trip through
// ServerFrame's own tags; the to-do sources' frame is decoded on its own
// (json:"-"), so its view is written back under the wire's names.
func pass3Wire(fr protocol.ServerFrame) ([]byte, error) {
	if fr.T == "sources" && fr.Sources != nil && fr.Sources.View != nil {
		b, err := json.Marshal(fr.Sources.View)
		if err != nil {
			return nil, err
		}
		return append([]byte(`{"t":"sources",`), b[1:]...), nil
	}
	return json.Marshal(fr)
}

// pass3Scratch is the demo's scratch folder on this Mac, written as a home folder in the fixture.
var pass3Scratch = regexp.MustCompile(`(/private)?/(var/folders|tmp)/[^"]*?/ducter-demo-settings-[A-Za-z0-9]+`)

// pass3Keep: the frames Settings reads; the conversation's events stay out of the fixture.
func pass3Keep(kind string) bool {
	switch kind {
	case "events", "pong", "typing", "decisions", "task", "tasks", "past", "made", "did":
		return false
	}
	return true
}

func pass3Height(tab string) int {
	switch tab {
	case TabPartner, TabAccounts, TabTodos:
		return 2600
	case TabMemory, TabAutofill, TabLook, TabChats:
		return 2000
	}
	return 1400
}

// paneGeometry: what a person would see as broken, read off the frame's text boxes. A text out
// of the window, a text squeezed to a glyph a line, two texts drawn over each other.
func paneGeometry(tt *ui.Tester, w float32) []string {
	type box struct {
		s string
		r ui.Rect
	}
	var boxes []box
	seen := map[string]bool{}
	var bad []string
	for _, s := range tt.Texts() {
		if strings.TrimSpace(s) == "" || seen[s] {
			continue
		}
		seen[s] = true
		r, ok := tt.Find(s)
		if !ok || r.W <= 0 || r.H <= 0 {
			continue
		}
		if r.X < -1 || r.X+r.W > w+1 {
			bad = append(bad, fmt.Sprintf("off screen: %q %+v", s, r))
		}
		if utf8.RuneCountInString(s) > 3 && r.W < 36 && r.H > 44 {
			bad = append(bad, fmt.Sprintf("squeezed: %q %+v", s, r))
		}
		boxes = append(boxes, box{s, r})
	}
	in := func(a, b ui.Rect) bool { // a inside b
		return a.X >= b.X-1 && a.Y >= b.Y-1 && a.X+a.W <= b.X+b.W+1 && a.Y+a.H <= b.Y+b.H+1
	}
	for i := range boxes {
		for j := i + 1; j < len(boxes); j++ {
			a, b := boxes[i].r, boxes[j].r
			if in(a, b) || in(b, a) {
				continue // a label over its own control, or a word inside its row
			}
			ix := min(a.X+a.W, b.X+b.W) - max(a.X, b.X)
			iy := min(a.Y+a.H, b.Y+b.H) - max(a.Y, b.Y)
			if ix > 4 && iy > 4 {
				bad = append(bad, fmt.Sprintf("overlap: %q %+v with %q %+v", boxes[i].s, a, boxes[j].s, b))
			}
		}
	}
	return bad
}

// pass3Marks: one thing per pane that only the real shape has, so the fixture can't go thin unseen.
var pass3Marks = map[string]string{
	TabPartner:  "GPT-6.2-Sol", // D445: Codex's six are one pill; the chosen one shows
	TabAccounts: "Nowledge Community",
	TabTodos:    "wey-gu",
	TabChats:    "@weys_ducter_bot",
	TabAutofill: "CLOUDFLARE_API_TOKEN",
	TabAbout:    "haswell",
}

// pass3App: the app after the recorded frames of the author's real shape.
func pass3App(t *testing.T, lang i18n.Lang) *App {
	t.Helper()
	f, err := os.Open(filepath.Join("testdata", "settings-real-"+string(lang)+".jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	app, _ := iaApp(t, lang)
	app.LocaleFixed = true
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 1<<20), 16<<20)
	for sc.Scan() {
		fr, err := protocol.DecodeServerFrame(sc.Bytes())
		if err != nil {
			t.Fatalf("fixture: %v", err)
		}
		app.Receive(fr)
	}
	return app
}

// TestSettingsRealShapeFits (D399): every Settings pane, with the author's real counts and long
// names, in both languages at 1000 and 1400: nothing off screen, squeezed or drawn over another.
func TestSettingsRealShapeFits(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, tab := range settingsTabs {
			for _, w := range []int{1000, 1400} {
				app := pass3App(t, lang)
				app.openTab(tab)
				tt := ui.NewTesterWith(app.View, w, pass3Height(tab), ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				for i := 0; i < 4; i++ {
					tt.Frame()
					tt.Advance(200 * time.Millisecond)
				}
				if want, ok := pass3Marks[tab]; ok && !tt.HasText(want) {
					t.Fatalf("%s %s %d: the real shape isn't on the pane (no %q): %q", lang, tab, w, want, tt.Texts())
				}
				for _, b := range paneGeometry(tt, float32(w)) {
					t.Errorf("%s %s %d: %s", lang, tab, w, b)
				}
			}
		}
	}
}
