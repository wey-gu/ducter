package views

import (
	"fmt"
	"image"
	"image/color"
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

// D396: words first. The scenes of the hand-over sheet opened from the do
// row: empty (the question, the suggestions, one by one), a sentence found
// (the set ticked, the note heard and moved to the right), nothing found,
// no model, one by one, and a computer with a long name.

func wordsSaid(lang i18n.Lang) string {
	return todoWords(lang)("关于 memory distill 的，先别动数据库迁移，验证都去 haswell 上跑", "the memory distill ones, but leave the database migrations alone and check on haswell")
}

func wordsNote(lang i18n.Lang) string {
	return todoWords(lang)("先别动数据库迁移，验证都去 haswell 上跑", "leave the database migrations alone and check on haswell")
}

func longWhere(lang i18n.Lang) *protocol.HandHow {
	how := memHow(lang)
	how.Where = protocol.HandWhere{Device: "w-hetzner", Name: "Hetzner Server fsn1-cx52 (Falkenstein)", Why: "repo", Said: "nowledge-co/mem", HasRepo: true}
	how.Wheres = append(how.Wheres, how.Where)
	return how
}

// wordsApp opens the sheet from the do row; scene: empty | found | none | nomodel | browse.
func wordsApp(t *testing.T, lang i18n.Lang, w, h int, scene string) (*App, *[]any, *ui.Tester) {
	app, sent, tt := todoApp(t, lang, w, h)
	app.S.PersonaName = todoWords(lang)("小鸭", "Duckie")
	app.Receive(pileFrameSubjects(lang))
	app.Route = RouteOnHand
	todoFrames(tt, 2)
	app.openHandDo()
	f, _ := lastSent[protocol.PileFindReq](*sent)
	w2 := todoWords(lang)
	suggest := []string{w2("记忆提炼", "Distillation"), w2("网页界面", "Web UI"), w2("文档", "Docs"), w2("登录", "Sign-in"), w2("离线模式", "Offline mode")}
	app.Receive(protocol.ServerFrame{T: "pile_find_result", Sources: &protocol.SourcesFrame{ClientID: f.ClientID, PileOp: "find", Found: &protocol.FindSummary{}, Suggest: suggest}})
	todoFrames(tt, 2)
	how := func() {
		todoFrames(tt, 2)
		tt.Advance(time.Second)
		todoFrames(tt, 2)
		if hr, ok := lastSent[protocol.PileHowReq](*sent); ok {
			// As core answers (D395's order): a computer the note names wins; else the one with the clone.
			hw := longWhere(lang)
			if strings.Contains(hr.Note, "haswell") {
				hw.Where = protocol.HandWhere{Device: "w-haswell", Name: "haswell", Why: "note", Said: "haswell", HasRepo: true}
			}
			if len(hr.Refs) < 2 {
				hw.Shape, hw.Shapes = "", nil
			}
			app.Receive(protocol.ServerFrame{T: "pile_how_result", Sources: &protocol.SourcesFrame{ClientID: hr.ClientID, PileOp: "how", How: hw}})
		}
		todoFrames(tt, 3)
	}
	switch scene {
	case "empty":
		how()
		return app, sent, tt
	case "browse":
		app.handBrowse(true)
		r, _ := lastSent[protocol.PileItemsReq](*sent)
		app.Receive(pileItemsFrame(lang, r.ClientID, "do"))
		how()
		return app, sent, tt
	}
	words := wordsSaid(lang)
	if scene == "none" {
		words = todoWords(lang)("支付宝的退款", "Alipay refunds")
	}
	app.ho.query, app.ho.queryAt = words, app.Now().Add(-time.Second)
	todoFrames(tt, 2)
	r, ok := lastSent[protocol.PileFindReq](*sent)
	if !ok || r.Words == "" {
		t.Fatalf("no find by words: %+v", *sent)
	}
	subj := w2("记忆提炼", "Distillation")
	switch scene {
	case "none":
		app.Receive(protocol.ServerFrame{T: "pile_find_result", Sources: &protocol.SourcesFrame{ClientID: r.ClientID, PileOp: "find", Found: &protocol.FindSummary{Subject: words}, Said: &protocol.FindSaid{About: words, By: "model"}, Suggest: suggest}})
	default:
		items, ticked := memFound(lang)
		found := &protocol.FindSummary{N: len(items), Subject: subj, InTitle: 7, ByLabel: 1, ByMeaning: 1}
		said := &protocol.FindSaid{About: "memory distill", Note: wordsNote(lang), By: "model"}
		if scene == "nomodel" {
			items, ticked = items[:6], ticked[:5]
			found = &protocol.FindSummary{N: 6, Subject: "memory distill", InTitle: 6, NoMeaning: "no_model"}
			said.By = "code"
		}
		app.Receive(protocol.ServerFrame{T: "pile_find_result", Sources: &protocol.SourcesFrame{ClientID: r.ClientID, PileOp: "find", Found: found, FoundItems: items, Ticked: ticked, Subject: subj, Said: said, Suggest: suggest}})
	}
	how()
	return app, sent, tt
}

// The do row opens on the words; a sentence finds the set ticked and puts
// the note it heard on the right; the person's own note is never replaced.
func TestHandWordsFirst(t *testing.T) {
	app, sent, tt := wordsApp(t, i18n.ZH, 1000, 720, "found")
	all := strings.Join(tt.Texts(), " | ")
	for _, want := range []string{"想交给小鸭哪些？", "找的是", "memory distill", "给小鸭的话已写进右边", "找到 9 个讲「记忆提炼」的", "在哪儿做", "haswell", "你写了 haswell", "先出个方案", "交给小鸭这 6 个"} {
		if !strings.Contains(all, want) {
			t.Fatalf("missing %q in %s", want, all)
		}
	}
	if app.ho.note != wordsNote(i18n.ZH) || len(app.ho.handTicked()) != 6 {
		t.Fatalf("note %q, ticked %d", app.ho.note, len(app.ho.handTicked()))
	}
	// The note heard in the words goes to core's where with the set (so the computer it names wins).
	if hr, _ := lastSent[protocol.PileHowReq](*sent); hr.Note != wordsNote(i18n.ZH) || len(hr.Refs) != 6 {
		t.Fatalf("pile_how: %+v", hr)
	}
	// The note shows once: in the right column's field, not again as a chip on the left.
	if n := strings.Count(all, wordsNote(i18n.ZH)); n > 1 {
		t.Fatalf("the note shown %d times: %s", n, all)
	}
	// With nothing said, a long computer name is whole (wrapped), its reason under it.
	_, _, te := wordsApp(t, i18n.ZH, 1000, 720, "empty")
	if e := strings.Join(te.Texts(), " | "); !strings.Contains(e, "Hetzner Server fsn1-cx52 (Falkenstein)") || !strings.Contains(e, "nowledge-co/mem 在这台上") {
		t.Fatalf("the long where: %s", e)
	}
	// Their own note stays when the words change.
	app.ho.note = "我自己的话"
	app.ho.query, app.ho.queryAt = "登录", app.Now().Add(-time.Second)
	todoFrames(tt, 2)
	r, _ := lastSent[protocol.PileFindReq](*sent)
	app.Receive(protocol.ServerFrame{T: "pile_find_result", Sources: &protocol.SourcesFrame{ClientID: r.ClientID, PileOp: "find", Found: &protocol.FindSummary{}, Said: &protocol.FindSaid{About: "登录", Note: "别的", By: "code"}}})
	todoFrames(tt, 2)
	if app.ho.note != "我自己的话" {
		t.Fatalf("the person's note was replaced: %q", app.ho.note)
	}
	// Go carries the note and the subject.
	app.ho.query, app.ho.queryAt = wordsSaid(i18n.ZH), app.Now().Add(-time.Second)
	app.ho.note = ""
	todoFrames(tt, 2)
	r, _ = lastSent[protocol.PileFindReq](*sent)
	items, ticked := memFound(i18n.ZH)
	app.Receive(protocol.ServerFrame{T: "pile_find_result", Sources: &protocol.SourcesFrame{ClientID: r.ClientID, PileOp: "find", Found: &protocol.FindSummary{N: len(items), Subject: "记忆提炼", ByMeaning: 1}, FoundItems: items, Ticked: ticked, Subject: "记忆提炼", Said: &protocol.FindSaid{About: "memory distill", Note: wordsNote(i18n.ZH), By: "code"}}})
	todoFrames(tt, 2)
	app.handGo()
	g, _ := lastSent[protocol.PileHandReq](*sent)
	if g.Note != wordsNote(i18n.ZH) || g.Subject != "记忆提炼" || !g.BySubject || len(g.Refs) != 6 {
		t.Fatalf("pile_hand: %+v", g)
	}
}

// Every sheet keeps below the title bar: its top never comes within the
// bar that holds the traffic lights, at any window height.
func TestSheetsKeepBelowTheTitleBar(t *testing.T) {
	for _, h := range []int{620, 720, 860} {
		app, _, tt := wordsApp(t, i18n.EN, 1000, h, "found")
		r, ok := tt.Find(app.L.T("hand.title", "Duckie"))
		if !ok {
			t.Fatalf("no title at %d", h)
		}
		if r.Y < ChromeH {
			t.Fatalf("the sheet's title at y=%.0f is under the title bar (window %d tall)", r.Y, h)
		}
		// ⌘K (D391's palette) too.
		app.ho.open = false
		app.oh.sw = true
		todoFrames(tt, 3)
		p, ok := tt.Find(app.L.T("pal.placeholder"))
		if !ok {
			t.Fatalf("no palette at %d: %v", h, tt.Texts())
		}
		if p.Y < ChromeH {
			t.Fatalf("the palette's field at y=%.0f is under the title bar (window %d tall)", p.Y, h)
		}
	}
}

// The hand-over sheet's pictures for review (D75: outside git), with the
// window's traffic lights painted where macOS puts them:
//
//	DUCTER_HANDWORDS_SHOTS=<repo>/.shots/handover-words go test ./internal/views -run HandoverWordsShots
func TestHandoverWordsShots(t *testing.T) {
	dir := os.Getenv("DUCTER_HANDWORDS_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_HANDWORDS_SHOTS not set")
	}
	prefix := os.Getenv("DUCTER_HANDWORDS_PREFIX")
	if prefix == "" {
		prefix = "after-mac"
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	save := func(tt *ui.Tester, name string, lang i18n.Lang, dark bool, w int) {
		paper := "light"
		if dark {
			paper = "dark"
		}
		todoFrames(tt, 6)
		f, err := os.Create(filepath.Join(dir, fmt.Sprintf("%s-%s-%d-%s-%s.png", prefix, name, w, strings.ToLower(string(lang)), paper)))
		if err != nil {
			t.Fatal(err)
		}
		if err := png.Encode(f, withLights(tt.Image())); err != nil {
			t.Fatal(err)
		}
		f.Close()
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			for _, w := range []int{1000, 1400} {
				h := 720
				if w > 1000 {
					h = 900
				}
				for _, scene := range []string{"empty", "found", "none", "nomodel", "browse"} {
					if (scene == "none" || scene == "nomodel" || scene == "browse") && (dark || w > 1000) && lang == i18n.EN {
						continue
					}
					app, _, tt := wordsApp(t, lang, w, h, scene)
					tt.SetDark(dark)
					tt.SetScale(2)
					save(tt, scene, lang, dark, w)
					if scene == "found" {
						// The pointer on 在哪儿做 / Where: its highlight inside the group's corners.
						if r, ok := tt.Find(app.L.T("hand.where")); ok {
							tt.Move(r.X+r.W/2, r.Y+r.H/2)
						}
						save(tt, "found-hover", lang, dark, w)
					}
				}
			}
			// Narrow: the words, then the note and how.
			app, _, tt := wordsApp(t, lang, 760, 900, "found")
			tt.SetDark(dark)
			tt.SetScale(2)
			save(tt, "narrow-what", lang, dark, 760)
			app.ho.step = 1
			save(tt, "narrow-how", lang, dark, 760)
		}
	}
}

// withLights paints the three window controls where macOS draws them
// (TrafficLights, 12pt dots 20pt apart) on a 2x shot.
func withLights(src image.Image) image.Image {
	b := src.Bounds()
	img := image.NewRGBA(b)
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			img.Set(x, y, src.At(x, y))
		}
	}
	const scale float32 = 2
	cols := []color.RGBA{{255, 95, 87, 255}, {254, 188, 46, 255}, {40, 200, 64, 255}}
	for i, c := range cols {
		cx := (TrafficLights.X + 6 + float32(i)*20) * scale
		cy := (TrafficLights.Y + 6) * scale
		r := float32(6 * scale)
		for y := int(cy - r - 1); y <= int(cy+r+1); y++ {
			for x := int(cx - r - 1); x <= int(cx+r+1); x++ {
				dx, dy := float32(x)-cx, float32(y)-cy
				if dx*dx+dy*dy <= r*r {
					img.Set(x, y, c)
				}
			}
		}
	}
	return img
}
