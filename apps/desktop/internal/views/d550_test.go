package views

import (
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// d550Rounds are rounds newest first, every 45 minutes from now: q a quiet
// round, s one that spoke (told), a one that asked, c one whose
// review_report marked a PR changed, f a failed one, e a change to the Keep.
func d550Rounds(shape string) []protocol.KeepRound {
	now := time.Now()
	var out []protocol.KeepRound
	for i, ch := range shape {
		r := protocol.KeepRound{At: now.Add(time.Duration(-i) * 45 * time.Minute).UTC().Format(time.RFC3339Nano), Woke: "time", Spoke: "silent", State: "done", TaskID: "t_loop"}
		switch ch {
		case 's':
			r.Spoke = "told"
		case 'a':
			r.Spoke = "asked"
		case 'c':
			r.Changed = true
		case 'f':
			r.State = "failed"
		case 'e':
			r.Woke, r.Edit = "edit", &protocol.KeepEditLine{By: "you", Edits: []protocol.KeepEdit{{Field: "every", From: "45", To: "60"}}}
		}
		out = append(out, r)
	}
	return out
}

// shapeOf is the rounds as drawn: r a round, Fn a fold of n.
func shapeOf(fs []keepFold) string {
	var b strings.Builder
	for _, f := range fs {
		if f.round != nil {
			b.WriteByte('r')
		} else {
			b.WriteString("F")
			b.WriteByte(byte('0' + len(f.fold)))
		}
	}
	return b.String()
}

// D550: every run of two or more quiet rounds folds, anywhere in the list;
// the newest round, a lone quiet round and every round that spoke, asked,
// changed, failed or was a change stand as they are.
func TestFoldKeepRounds(t *testing.T) {
	for _, c := range []struct{ name, in, want string }{
		{"three quiet rounds fold to one row", "sqqq", "rF3"},
		{"a spoken round between makes two folds", "aqqqsqq", "rF3rF2"},
		{"the newest round is never folded", "qqqq", "rF3"},
		{"a lone quiet round is no fold", "sqs", "rrr"},
		{"asked, changed, failed and a change break a run", "sqqaqqcqqfqqeqq", "rF2rF2rF2rF2rF2"},
		{"a change first: the newest round under it still stands", "eqqq", "rrF2"},
	} {
		if got := shapeOf(foldKeepRounds(d550Rounds(c.in))); got != c.want {
			t.Errorf("%s: %s drew %s, want %s", c.name, c.in, got, c.want)
		}
	}
	f := foldKeepRounds(d550Rounds("sqqq"))[1]
	if f.to != f.fold[0].At || f.from != f.fold[2].At {
		t.Errorf("the span runs from the oldest to the newest: %s..%s", f.from, f.to)
	}
}

// D550 on the page: the fold is one row with its count and span, a click
// opens its rounds in place under it, another folds them again.
func TestKeepQuietFoldOpens(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app := loopApp(t, lang, 0)
		page := app.S.KeepPages["kp_review"]
		page.Rounds = d550Rounds("aqqqsqq")
		app.Route = RouteOnHand
		app.openKeep("kp_review")
		tt := ui.NewTesterWith(app.View, 1150, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		for i := 0; i < 4; i++ {
			tt.Frame()
		}
		from, to := keepSpan(lang, page.Rounds[3].At, page.Rounds[1].At, app.Now())
		three := app.L.T("loop.quiet", 3, from, to)
		if !hasText(tt, app.L.T("keep.round.asked")) {
			t.Fatalf("%s: no page: %q", lang, tt.Texts())
		}
		silent := func() int {
			n := 0
			for _, s := range tt.Texts() {
				if s == app.L.T("keep.round.silent") {
					n++
				}
			}
			return n
		}
		if n := silent(); n != 0 {
			t.Errorf("%s: %d quiet rounds drawn folded", lang, n)
		}
		if err := tt.Click(three); err != nil {
			t.Fatalf("%s: the fold of three: %v (%q)", lang, err, tt.Texts())
		}
		tt.Frame()
		tt.Frame()
		if n := silent(); n != 3 {
			t.Errorf("%s: opened, %d quiet rounds drawn, want 3", lang, n)
		}
		if err := tt.Click(three); err != nil {
			t.Fatalf("%s: %v", lang, err)
		}
		tt.Frame()
		tt.Frame()
		if n := silent(); n != 0 {
			t.Errorf("%s: closed again, %d quiet rounds drawn", lang, n)
		}
	}
}
