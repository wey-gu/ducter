package views

import (
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D550: a Keep's page folds every run of quiet rounds, anywhere in its
// list, into one row. A round is quiet from its structured outcome only,
// never its words (principle 21; the rule D544 folds an opened round task
// by): its rhythm or its clock woke it (not a watched change, work handed
// to it, the person's Look now or its first look), it ended done (not
// running, failed or skipped), it said nothing (not told, not asked) and it
// changed nothing (no review_report marked a PR changed). A change to the
// Keep (D533) is never quiet. The web's quietRound and
// foldRounds (packages/protocol/src/keeps.ts) say the same.

func keepRoundQuiet(r protocol.KeepRound) bool {
	return r.Woke == "time" && r.Spoke == "silent" && r.State == "done" && !r.Changed && r.Edit == nil
}

// keepFold is one row of the rounds as drawn: a round, or a run of two or
// more quiet rounds (newest first) with the oldest's and the newest's time.
type keepFold struct {
	round    *protocol.KeepRound
	idx      int
	fold     []protocol.KeepRound
	idxs     []int // the fold's rounds' places in the list
	from, to string
}

// foldKeepRounds is the rounds as drawn, newest first. The newest round is
// never folded; a lone quiet round stands as itself.
func foldKeepRounds(rounds []protocol.KeepRound) []keepFold {
	var out []keepFold
	newest := -1
	for i, r := range rounds {
		if r.Woke != "edit" {
			newest = i
			break
		}
	}
	var run []int
	closeRun := func() {
		if len(run) >= 2 {
			f := keepFold{from: rounds[run[len(run)-1]].At, to: rounds[run[0]].At}
			for _, j := range run {
				f.fold = append(f.fold, rounds[j])
				f.idxs = append(f.idxs, j)
			}
			out = append(out, f)
		} else {
			for _, j := range run {
				out = append(out, keepFold{round: &rounds[j], idx: j})
			}
		}
		run = nil
	}
	for i := range rounds {
		if i != newest && keepRoundQuiet(rounds[i]) {
			run = append(run, i)
			continue
		}
		closeRun()
		out = append(out, keepFold{round: &rounds[i], idx: i})
	}
	closeRun()
	return out
}

// keepSpan is a quiet run's span, each end its clock with its day when not
// today (the end's only when the day changed): 20:55 到 22:25, 昨天 16:39 到
// 21:09, 昨天 23:24 到 0:54.
func keepSpan(l i18n.Lang, from, to string, now time.Time) (string, string) {
	a, b, n := store.ParseTime(from).Local(), store.ParseTime(to).Local(), now.Local()
	same := func(x, y time.Time) bool { return x.YearDay() == y.YearDay() && x.Year() == y.Year() }
	at := func(x time.Time) string {
		if same(x, n) {
			return i18n.Clock(x)
		}
		return i18n.Day(l, x, now) + " " + i18n.Clock(x)
	}
	if same(a, b) {
		return at(a), i18n.Clock(b)
	}
	return at(a), at(b)
}
