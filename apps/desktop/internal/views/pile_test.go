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

// D359: the pile on the Mac: the clay and the count at the head of the
// to-dos group, the sort's groups as rows, a review request's 我看过了, and the
// sheets (hand over six, look over the closable ones).

func pileFrame(lang i18n.Lang, open, cleared, running, waiting int) protocol.ServerFrame {
	f := todoGlanceFrame(lang)
	v := f.Sources.View
	v.Sources[0].Open = open
	v.Pile = &protocol.PileView{Open: open, ClearedToday: cleared, SortedAt: time.Now().Add(-2 * time.Minute).UTC().Format(time.RFC3339), Read: open,
		Groups: map[string]int{"do": 51 - running - waiting, "decide": 25, "close": 28 - cleared, "later": 454},
		Queue:  protocol.PileQueue{Running: running, Waiting: waiting, Cap: protocol.PileCap}}
	v.Glance[0].Read = &protocol.PreReadSummary{Problems: 2, Suggestions: 1, At: time.Now().UTC().Format(time.RFC3339), State: "drafted"}
	return f
}

func pileItemsFrame(lang i18n.Lang, cid, group string) protocol.ServerFrame {
	w := todoWords(lang)
	var items []protocol.PileItem
	titles := []string{"Footer links overflow on small phones", "Typo on the pricing page: \"recieve\"", "Docs: the install page still says Node 18", "Missing alt text on the team photos", "Wrong icon for the share action on Android", "Flaky test: session expiry off by one second", "404 link to the runbook in the alert template"}
	for i, title := range titles {
		n := 1100 + i
		it := protocol.PileItem{Item: protocol.SourceItem{SourceItemRef: protocol.SourceItemRef{Source: "src_gh", Kind: "github", Ref: fmt.Sprintf("acme/web#%d", n), Label: fmt.Sprintf("#%d", n), Where: "acme/web", Title: title}, State: "open"}, Group: group, Why: w("说得清楚，改动小", "Clear, and a small change"), Size: "small"}
		if group == "close" {
			it.Why = w("快一年没人动，也没说要做什么", "Idle for most of a year, no clear ask")
			it.Comment = "Closing this for now: no activity in a long while and no clear next step. Reopen it if it still matters."
			it.Size = ""
		}
		items = append(items, it)
	}
	return protocol.ServerFrame{T: "pile_items_result", Sources: &protocol.SourcesFrame{ClientID: cid, Group: group, PileItems: items}}
}

func TestPileFramesDecode(t *testing.T) {
	f, err := protocol.DecodeServerFrame([]byte(`{"t":"sources","sources":[],"found":{"vaults":[]},"pile":{"open":557,"clearedToday":4,"read":557,"unread":0,"groups":{"do":41,"decide":23,"close":18,"later":475},"queue":{"running":3,"waiting":3,"cap":3}},"glance":[{"source":"s","kind":"github","ref":"a/b#1","label":"#1","title":"x","state":"open","why":"review","read":{"problems":2,"suggestions":1,"at":"t","state":"drafted"}}]}`))
	if err != nil || f.Sources.View.Pile.Open != 557 || f.Sources.View.Pile.Groups["close"] != 18 || f.Sources.View.Pile.Queue.Waiting != 3 || f.Sources.View.Glance[0].Read.Problems != 2 {
		t.Fatalf("%v %+v", err, f.Sources)
	}
	f, err = protocol.DecodeServerFrame([]byte(`{"t":"pile_items_result","clientId":"p1","group":"close","items":[{"item":{"source":"s","kind":"github","ref":"a/b#2","label":"#2","title":"y","state":"open"},"group":"close","why":"old","comment":"Closing."}]}`))
	if err != nil || f.Sources.ClientID != "p1" || f.Sources.Group != "close" || len(f.Sources.PileItems) != 1 || f.Sources.PileItems[0].Comment != "Closing." {
		t.Fatalf("%v %+v", err, f.Sources)
	}
	f, err = protocol.DecodeServerFrame([]byte(`{"t":"pile_result","clientId":"p2","op":"close","ok":true,"done":17,"failed":1}`))
	if err != nil || f.Sources.PileOp != "close" || f.Sources.Done != 17 || f.Sources.Failed != 1 {
		t.Fatalf("%v %+v", err, f.Sources)
	}
}

func TestPileArtBuckets(t *testing.T) {
	for n, want := range map[int]string{0: "clear", 1: "small", 19: "small", 20: "mid", 99: "mid", 100: "big", 557: "big"} {
		if got := pileArt(n); got != want {
			t.Fatalf("%d: %s, want %s", n, got, want)
		}
	}
}

func TestPileSheetHandsOverTheTicked(t *testing.T) {
	app, sent, tt := todoApp(t, i18n.ZH, 1280, 1000)
	app.Receive(pileFrame(i18n.ZH, 557, 0, 0, 0))
	app.Route = RouteOnHand
	todoFrames(tt, 3)
	app.openPile("do")
	r, ok := lastSent[protocol.PileItemsReq](*sent)
	if !ok || r.Group != "do" {
		t.Fatalf("no pile_items: %+v", *sent)
	}
	app.Receive(pileItemsFrame(i18n.ZH, r.ClientID, "do"))
	todoFrames(tt, 3)
	if len(app.pile.picked) != protocol.PileHandDefault {
		t.Fatalf("picked %d", len(app.pile.picked))
	}
}

// Pictures: DUCTER_SHOTS_DIR=/Users/weyl/dev/ducter/.shots/todo-flow go test ./internal/views -run PileShots
func TestPileShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS_DIR") == "" {
		t.Skip("DUCTER_SHOTS_DIR not set")
	}
	dir := shotsDir(t)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			paper := ""
			if dark {
				paper = "-dark"
			}
			for _, step := range []string{"pile", "after-close", "hand-sheet", "close-sheet"} {
				app, sent, tt := todoApp(t, lang, 1280, 1300)
				tt.SetDark(dark)
				switch step {
				case "after-close":
					app.Receive(pileFrame(lang, 557, 0, 0, 0))
					app.Route = RouteOnHand
					todoFrames(tt, 2)
					app.Receive(pileFrame(lang, 530, 27, 3, 3))
				default:
					app.Receive(pileFrame(lang, 557, 0, 0, 0))
					app.Route = RouteOnHand
				}
				todoFrames(tt, 3)
				if step == "hand-sheet" || step == "close-sheet" {
					g := map[string]string{"hand-sheet": "do", "close-sheet": "close"}[step]
					app.openPile(g)
					r, _ := lastSent[protocol.PileItemsReq](*sent)
					app.Receive(pileItemsFrame(lang, r.ClientID, g))
					if g == "close" {
						app.pile.kept["acme/web#1100"] = true
					}
				}
				todoFrames(tt, 8)
				f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%s%s.png", step, strings.ToLower(string(lang)), paper)))
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
