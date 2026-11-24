package views

import (
	"encoding/json"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D544: a task in rounds repeats the same round that changed nothing (its
// review loop's 「没有新的请求，9 个都没变」 nine times in a row). Consecutive
// rounds that changed nothing fold into one quiet row in the opened task, as
// the Keep's page folds them. A round is quiet from its structured outcome
// only, never its words (principle 21): it ended on a done report, or (a
// loop's rounds report progress) at the next wake with only progress
// reports; nothing was said to it (only a wake started it); no question,
// failure or block; and its review_report marked no PR changed. A run is two
// or more such rounds in a row; the latest finished round is never folded.
// Keys name each round: its wake's seq, or without one its report's. The
// web's quietRuns (packages/protocol/src/transcript.ts) says the same.

type quietRun struct {
	keys     []int64
	times    []string
	from, to string
}

func quietRuns(events []protocol.LogEvent) []quietRun {
	var out []quietRun
	var run *quietRun
	briefed := false
	var wake, reported *protocol.LogEvent
	loud := false
	var last int64
	closeRun := func() {
		if run != nil && len(run.keys) >= 2 {
			out = append(out, *run)
		}
		run = nil
	}
	finish := func(quiet bool, key int64, ts string) {
		last = key
		if !quiet {
			closeRun()
		} else {
			if run == nil {
				run = &quietRun{from: ts, to: ts}
			}
			run.keys = append(run.keys, key)
			run.times = append(run.times, ts)
			run.to = ts
		}
		wake, reported, loud = nil, nil, false
	}
	for i := range events {
		ev := &events[i]
		body, _ := ev.Typed()
		if to, ok := body.(*protocol.TaskOpen); ok {
			if strings.TrimSpace(to.Brief) != "" {
				briefed = true
			}
			continue
		}
		if p, ok := promptOf(ev, briefed); ok {
			if p.K == "wake" {
				if wake != nil && reported != nil {
					finish(!loud, wake.Seq, reported.TS)
				} else if wake != nil {
					closeRun()
				}
				wake = ev
				continue
			}
			loud = true
		}
		switch b := body.(type) {
		case *protocol.TaskEvent:
			if b.Tool != nil && (b.Tool.Name == "review_report" || strings.HasSuffix(b.Tool.Name, "__review_report")) {
				var in struct {
					PRs []struct {
						Changed bool `json:"changed"`
					} `json:"prs"`
				}
				if json.Unmarshal(b.Tool.Input, &in) == nil {
					for _, x := range in.PRs {
						if x.Changed {
							loud = true
						}
					}
				}
			}
		case *protocol.Report:
			if b.State == "progress" {
				reported = ev
				continue
			}
			key := ev.Seq
			if wake != nil {
				key = wake.Seq
			}
			finish(b.State == "done" && !loud, key, ev.TS)
		}
	}
	if run != nil && len(run.keys) > 0 && run.keys[len(run.keys)-1] == last {
		run.keys = run.keys[:len(run.keys)-1]
		run.times = run.times[:len(run.times)-1]
		if n := len(run.times); n > 0 {
			run.to = run.times[n-1]
		}
	}
	closeRun()
	return out
}

// quietMember is one folded round: its run's id (the first key), whether it
// is the run's first, and the run's count and span.
type quietMember struct {
	id       int64
	first    bool
	n        int
	from, to string
}

var quietCache = map[*store.Task]struct {
	n int
	m map[int64]quietMember
}{}

// quietOpen are the runs opened by a click, by task and first key.
var quietOpen = map[string]bool{}

func quietOf(task *store.Task) map[int64]quietMember {
	if c, ok := quietCache[task]; ok && c.n == len(task.Events) {
		return c.m
	}
	m := map[int64]quietMember{}
	for _, r := range quietRuns(task.Events) {
		for i, k := range r.keys {
			m[k] = quietMember{id: r.keys[0], first: i == 0, n: len(r.keys), from: r.from, to: r.to}
		}
	}
	quietCache[task] = struct {
		n int
		m map[int64]quietMember
	}{len(task.Events), m}
	return m
}

func quietKey(task *store.Task, id int64) string { return task.ID + ":" + itoa64(id) }

func itoa64(n int64) string {
	b, _ := json.Marshal(n)
	return string(b)
}

// quietFold is the run's one row: the shared work head (D530), opening it.
func (a *App) quietFold(c *ui.Context, task *store.Task, q quietMember) {
	key := quietKey(task, q.id)
	open := quietOpen[key]
	words := a.L.T("loop.quiet", q.n, clock(q.from), clock(q.to))
	if a.workHead(c, "quiet:"+itoa64(q.id), words, 0, false, open) {
		quietOpen[key] = !open
	}
}

// foldQuietBody is a turn's blocks with its quiet rounds (one turn holding
// many) folded: each round's blocks up to its report go, the run's first
// leaves its fold row (a block of kind "qfold") in their place.
func foldQuietBody(task *store.Task, body []Block) []Block {
	q := quietOf(task)
	if len(q) == 0 {
		return body
	}
	var out, unit []Block
	for _, b := range body {
		unit = append(unit, b)
		if b.K != "report" {
			continue
		}
		m, ok := q[b.Seq]
		if !ok {
			out = append(out, unit...)
		} else {
			if m.first {
				out = append(out, Block{K: "qfold", Seq: b.Seq})
			}
			if quietOpen[quietKey(task, m.id)] {
				out = append(out, unit...)
			}
		}
		unit = nil
	}
	return append(out, unit...)
}
