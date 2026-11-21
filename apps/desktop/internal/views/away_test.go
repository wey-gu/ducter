package views

import (
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D454: a stopped group (a part that didn't work out, the rest in line) is
// finished: ⋯ offers 再试一次 and 看看为什么; 移走 sends the frame, leaves
// the board at once, and 撤销 is the toast's.
func TestAwayStoppedGroup(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: groupFixture(true)})
	bgs := app.boardGroups(app.S.Board())
	if len(bgs) != 1 {
		t.Fatalf("groups: %d", len(bgs))
	}
	f := finishedGroup(bgs[0])
	if f == nil || !reflect.DeepEqual(f.failedIDs, []string{"t_sms"}) || f.openID != "t_sms" || !reflect.DeepEqual(f.taskIDs, []string{"t_form", "t_sms"}) {
		t.Fatalf("finished: %+v", f)
	}
	if got := finishedMenu(*f); !reflect.DeepEqual(got, []string{"retry", "why", "remove"}) {
		t.Fatalf("menu: %v", got)
	}
	// While a part works it isn't finished.
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: groupFixture(false)})
	if f := finishedGroup(app.boardGroups(app.S.Board())[0]); f != nil {
		t.Fatalf("a group at work counted as finished: %+v", f)
	}
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: groupFixture(true)})
	*sent = nil
	app.PutAway(nil, *f)
	if len(*sent) != 1 || !reflect.DeepEqual((*sent)[0], protocol.OnHandAway{T: "onhand_away", GroupID: "g1"}) {
		t.Fatalf("sent: %#v", *sent)
	}
	b := app.S.Board()
	if len(app.boardGroups(b)) != 0 {
		t.Fatal("the removed group is still on the board")
	}
	for _, l := range b.Lanes {
		for _, x := range l {
			if x.ID == "t_sms" || x.ID == "t_form" {
				t.Fatalf("a removed part is still on the board: %s", x.ID)
			}
		}
	}
	app.Retry(f.failedIDs)
	if p, ok := (*sent)[1].(protocol.PastContinue); !ok || p.TaskID != "t_sms" || p.Words != "再试一次" {
		t.Fatalf("retry sent: %#v", (*sent)[1])
	}
}

// D454: a task the home says was removed is left out; an old finished one
// the window only knows from the stream is never kept on On hand.
func TestAwayBoardFromHome(t *testing.T) {
	s := store.New()
	now := time.Now().UTC()
	card := func(id string, att protocol.Attention, at time.Time) protocol.TaskCard {
		return protocol.TaskCard{TaskID: id, Title: id, Attention: att, OpenedAt: at.Format(time.RFC3339), UpdatedAt: at.Format(time.RFC3339)}
	}
	old := card("old", protocol.Failed, now.Add(-72*time.Hour))
	a, b := card("a", protocol.Failed, now), card("b", protocol.Done, now)
	for _, c := range []protocol.TaskCard{a, b, old} {
		c := c
		s.Tasks[c.TaskID] = &store.Task{ID: c.TaskID, Card: &c}
	}
	s.OnHand = &protocol.OnHand{Tasks: []protocol.TaskCard{a, b}, Away: []string{"a"}}
	var ids []string
	for _, x := range s.Board().Lanes[store.LaneDone] {
		ids = append(ids, x.ID)
	}
	if !reflect.DeepEqual(ids, []string{"b"}) {
		t.Fatalf("done lane: %v", ids)
	}
}

// D454: a finished row says ⋯ and × on hover, in the person's words.
func TestAwayRowOnHover(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, _ := iaApp(t, lang)
		app.Status = client.Connected
		now := time.Now().UTC().Format(time.RFC3339)
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{{TaskID: "t1", Title: "Improve general setting page", Harness: "codex", Attention: protocol.Failed, OpenedAt: now, UpdatedAt: now}}}})
		app.Route = RouteOnHand
		tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		if f := finishedOf(app.S.Task("t1")); f == nil || !reflect.DeepEqual(finishedMenu(*f), []string{"retry", "why", "remove"}) {
			t.Fatalf("finished row: %+v", f)
		}
		words := app.L.T("away.remove.about", "Improve general setting page")
		if strings.Contains(words, "件") || strings.Contains(words, " · ") {
			t.Fatalf("counter or joiner in %q", words)
		}
	}
}
