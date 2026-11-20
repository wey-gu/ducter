package views

import (
	"fmt"
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

// D426: the author's two sentences on 0.1.1 (research/176), found as core
// finds them now: the reading's chips, 100gle's five with a reason each,
// the unsure one unticked; a name no one has; a chip removed.

const (
	author1 = "100gle 分配给我的 UI/UX 的问题走查的修改 task"
	author2 = "100gle 分配给我的那些他 UI 走查发现的问题"
)

// gleRows are 100gle's five (hel, 2026-11-20): number, title, sort group, why it is here.
var gleRows = []struct {
	n            int
	title, group string
	because      string
}{
	{10694, "Remove unnecessary words for user in advanced search", "do", "高级搜索里多余的说明"},
	{10691, "Remove unnecessary information for user in memory page", "decide", "记忆页里多余的信息"},
	{10688, "Improve about setting page", "later", "关于页的排版"},
	{10559, "Improve general setting page", "later", "通用设置页的排版"},
	{10482, "Improve memory space setting page", "later", "空间设置页的排版"},
}

func gleItem(n int, title, group, because, sure string) protocol.FoundItem {
	ref := fmt.Sprintf("nowledge-co/mem#%d", n)
	why := map[string]string{"do": "说得清楚，改动小", "decide": "有两种改法，要你挑", "later": "要先出设计稿"}[group]
	it := protocol.FoundItem{PileItem: protocol.PileItem{Item: protocol.SourceItem{SourceItemRef: protocol.SourceItemRef{Source: "src_gh", Kind: "github", Ref: ref, Label: fmt.Sprintf("#%d", n), Where: "nowledge-co/mem", Title: title, URL: "https://github.com/nowledge-co/mem/issues/" + fmt.Sprint(n)}, State: "open", Labels: []string{"UI/UX design", "component/ui"}, Author: "100gle"},
		Group: group, Why: why, Size: map[string]string{"do": "small"}[group]}, By: "meaning", Because: because, Sure: sure}
	if group == "decide" {
		it.Ask, it.Pick = "按哪种改？", "hand"
	}
	return it
}

func findReading(sentence string) (*protocol.FindSaid, []protocol.FoundItem, []string, *protocol.FindSummary) {
	facets := []protocol.FindFacet{{Key: "person:100gle:assigned", Kind: "person", Text: "100gle 分给你的", Said: "100gle", By: "code"}}
	about := "UI/UX 问题走查"
	if sentence == author2 {
		facets = append(facets, protocol.FindFacet{Key: "person:100gle:opened", Kind: "person", Text: "100gle 提的", Said: "他…发现", By: "code"})
		about = "UI 走查"
	}
	facets = append(facets, protocol.FindFacet{Key: "about", Kind: "about", Text: "关于 " + about, Said: about, By: "code"})
	var items []protocol.FoundItem
	var ticked []string
	maybe := 0
	for _, r := range gleRows {
		sure := "high"
		if sentence == author2 && r.n == 10691 {
			sure = "maybe" // as haiku read it on the eval: shown, not ticked
			maybe++
		} else {
			ticked = append(ticked, fmt.Sprintf("nowledge-co/mem#%d", r.n))
		}
		items = append(items, gleItem(r.n, r.title, r.group, r.because, sure))
	}
	within := 5
	return &protocol.FindSaid{About: about, By: "code", Facets: facets}, items, ticked, &protocol.FindSummary{N: 5, Subject: about, ByMeaning: 5, Within: &within, Maybe: maybe}
}

// findApp opens the sheet from the do row and says a sentence; scene: author1 | author2 | typo.
func findApp(t *testing.T, w, h int, scene string) (*App, *[]any, *ui.Tester) {
	app, sent, tt := todoApp(t, i18n.ZH, w, h)
	app.S.PersonaName = "小鸭"
	app.Receive(pileFrameSubjects(i18n.ZH))
	app.Route = RouteOnHand
	todoFrames(tt, 2)
	app.openHandDo()
	f, _ := lastSent[protocol.PileFindReq](*sent)
	app.Receive(protocol.ServerFrame{T: "pile_find_result", Sources: &protocol.SourcesFrame{ClientID: f.ClientID, PileOp: "find", Found: &protocol.FindSummary{}}})
	words := map[string]string{"author1": author1, "author2": author2, "typo": "100gel 提的"}[scene]
	app.ho.query, app.ho.queryAt = words, app.Now().Add(-time.Second)
	todoFrames(tt, 2)
	r, _ := lastSent[protocol.PileFindReq](*sent)
	if scene == "typo" {
		said := &protocol.FindSaid{By: "code", Unknown: []protocol.FindUnknown{{Said: "100gel", Closest: []string{"100gle"}}}}
		app.Receive(protocol.ServerFrame{T: "pile_find_result", Sources: &protocol.SourcesFrame{ClientID: r.ClientID, PileOp: "find", Found: &protocol.FindSummary{}, Said: said}})
	} else {
		said, items, ticked, found := findReading(words)
		app.Receive(protocol.ServerFrame{T: "pile_find_result", Sources: &protocol.SourcesFrame{ClientID: r.ClientID, PileOp: "find", Found: found, FoundItems: items, Ticked: ticked, Subject: found.Subject, Said: said}})
	}
	todoFrames(tt, 2)
	tt.Advance(time.Second)
	todoFrames(tt, 2)
	if hr, ok := lastSent[protocol.PileHowReq](*sent); ok {
		how := memHow(i18n.ZH)
		how.Repo = "nowledge-co/mem"
		how.Where = protocol.HandWhere{Device: "local", Name: "MacBook Pro", Why: "repo", Said: "nowledge-co/mem", HasRepo: true}
		if len(hr.Refs) < 2 {
			how.Shape, how.Shapes = "", nil
		}
		app.Receive(protocol.ServerFrame{T: "pile_how_result", Sources: &protocol.SourcesFrame{ClientID: hr.ClientID, PileOp: "how", How: how}})
	}
	todoFrames(tt, 3)
	return app, sent, tt
}

// The author's sentences read as chips; the five with their reasons; the
// unsure one unticked; a chip's click finds again without it; a name no one
// has is said, with the closest login, and nothing is ticked.
func TestHandFindReading(t *testing.T) {
	app, sent, tt := findApp(t, 1000, 720, "author2")
	all := strings.Join(tt.Texts(), " | ")
	for _, want := range []string{"找的是", "100gle 分给你的", "100gle 提的", "关于 UI 走查", "找到 5 件讲「UI 走查」的", "1 件不太确定，没勾", "高级搜索里多余的说明", "不太确定"} {
		if !strings.Contains(all, want) {
			t.Fatalf("missing %q in %s", want, all)
		}
	}
	if strings.Contains(all, "标签对得上") || len(app.ho.handTicked()) != 4 {
		t.Fatalf("ticked %d: %s", len(app.ho.handTicked()), all)
	}
	tt.Click(app.L.T("hand.chip.drop", "100gle 提的"))
	todoFrames(tt, 3)
	tt.Advance(time.Second)
	todoFrames(tt, 3)
	if f, _ := lastSent[protocol.PileFindReq](*sent); len(f.Drop) != 1 || f.Drop[0] != "person:100gle:opened" || f.Words != author2 {
		t.Fatalf("drop not sent: %+v", f)
	}
	_, _, tu := findApp(t, 1000, 720, "typo")
	u := strings.Join(tu.Texts(), " | ")
	for _, want := range []string{"这些待办里没有叫 100gel 的人", "100gle", "名字对上之前，一件都不勾"} {
		if !strings.Contains(u, want) {
			t.Fatalf("missing %q in %s", want, u)
		}
	}
	if strings.Contains(u, "没找到讲") {
		t.Fatalf("the empty line repeats the name: %s", u)
	}
}

// DUCTER_HANDFIND_SHOTS=<repo>/.shots/handover-find go test ./internal/views -run HandoverFindShots
func TestHandoverFindShots(t *testing.T) {
	dir := os.Getenv("DUCTER_HANDFIND_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_HANDFIND_SHOTS not set")
	}
	_ = os.MkdirAll(dir, 0o755)
	for _, dark := range []bool{false, true} {
		for _, scene := range []string{"author1", "author2", "typo"} {
			if dark && scene != "author2" {
				continue
			}
			_, _, tt := findApp(t, 1400, 900, scene)
			tt.SetDark(dark)
			tt.SetScale(2)
			todoFrames(tt, 6)
			paper := map[bool]string{false: "light", true: "dark"}[dark]
			f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-after-%s-1400-zh-%s.png", scene, paper)))
			if err != nil {
				t.Fatal(err)
			}
			if err := png.Encode(f, withLights(tt.Image())); err != nil {
				t.Fatal(err)
			}
			f.Close()
		}
	}
}
