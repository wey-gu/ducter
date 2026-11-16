package views

// D284: a long task's stream for the opened-task perf test: the Go port of
// packages/protocol/fixtures/longtask.ts (the same events and sizes).

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

const longLine = "  const rows = await store.page({ taskId, beforeSeq, limit: 200 }); // the newest window first\n"

// longSource is real text for tool outputs (Ducter's own sources), so the
// frames compress as a real task's do, not as a repeated line would.
var longSource = func() string {
	var b strings.Builder
	for _, f := range []string{"transcript.ts", "index.ts", "steps.ts", "redact.ts", "harness-facts.ts", "workbench.ts"} {
		data, _ := os.ReadFile("../../../../packages/protocol/src/" + f)
		b.Write(data)
	}
	return b.String()
}()

func longOut(i, n int) string {
	src := longSource
	if len(src) < 4*n {
		s := fmt.Sprintf("%d: ", i) + longLine
		return strings.Repeat(s, n/len(s)+1)[:n]
	}
	at := (i * 7919) % (len(src) - n)
	return strings.ToValidUTF8(src[at:at+n], "")
}

// longTask is n events of one task, seqs from 1000, 7 s apart.
func longTask(n int, id string) []protocol.LogEvent {
	stream := "task:" + id
	seq := int64(1000)
	at, _ := time.Parse(time.RFC3339, "2026-11-16T00:00:00Z")
	var evs []protocol.LogEvent
	add := func(origin protocol.Origin, kind string, body any) {
		at = at.Add(7 * time.Second)
		evs = append(evs, protocol.NewEvent(seq, at.UTC().Format("2006-01-02T15:04:05.000Z"), "default", stream, origin, kind, body))
		seq++
	}
	add(protocol.OriginPartner, protocol.KindTaskOpen, map[string]any{"taskId": id, "title": "Review the open PRs every 45 minutes", "project": "ducter", "place": map[string]any{"kind": "repo", "repoPath": "/Users/weyl/dev/ducter"}, "harness": "claude-code", "model": "claude-opus-5-5", "brief": "Every 45 minutes, review the open PRs on wey-gu/ducter: read each new diff, run its tests, and leave a review. Tell me only when one needs me.", "origin": "partner"})
	add(protocol.OriginSystem, protocol.KindTaskState, map[string]any{"taskId": id, "attention": "working", "residency": "hot"})
	te := func(m map[string]any) map[string]any { m["taskId"] = id; return m }
	for k := 0; len(evs) < n; k++ {
		if k > 0 {
			if k%7 == 0 {
				add(protocol.OriginUser, protocol.KindTaskEvent, te(map[string]any{"role": "user", "from": "user", "text": fmt.Sprintf("PR #%d looks risky, look at the migration twice", 200+k)}))
			} else {
				add(protocol.OriginPartner, protocol.KindTaskEvent, te(map[string]any{"role": "user", "from": "partner", "text": "等到了：「下一轮审查时间到」。接着做。"}))
			}
		}
		add(protocol.OriginTask, protocol.KindTaskEvent, te(map[string]any{"role": "assistant", "thinking": []string{"Which PRs changed since the last round", "What the tests cover"}}))
		for s := 0; s < 20 && len(evs) < n; s++ {
			i := k*100 + s
			switch {
			case s%5 == 4:
				add(protocol.OriginTask, protocol.KindTaskEvent, te(map[string]any{"role": "tool", "tool": map[string]any{"name": "Edit", "input": map[string]any{"file_path": fmt.Sprintf("/Users/weyl/dev/ducter/packages/core/src/f%d.ts", i), "old_string": longOut(i, 700), "new_string": longOut(i+1, 760)}, "ok": true}}))
			case s%5 == 3:
				add(protocol.OriginTask, protocol.KindTaskEvent, te(map[string]any{"role": "tool", "tool": map[string]any{"name": "Bash", "input": map[string]any{"command": fmt.Sprintf("bun test packages/core/test/f%d.test.ts", i), "description": "Run the tests"}, "output": longOut(i, 2048), "ok": s%15 != 3}}))
			default:
				add(protocol.OriginTask, protocol.KindTaskEvent, te(map[string]any{"role": "tool", "tool": map[string]any{"name": "Read", "input": map[string]any{"file_path": fmt.Sprintf("/Users/weyl/dev/ducter/packages/core/src/f%d.ts", i)}, "output": longOut(i, 2048), "ok": true}}))
			}
		}
		add(protocol.OriginTask, protocol.KindTaskEvent, te(map[string]any{"role": "assistant", "text": fmt.Sprintf("Round %d: reviewed %d PRs. #%d is fine to merge; #%d needs a rebase after the protocol change, I left a review saying so.", k+1, k%4+1, 200+k, 201+k)}))
		add(protocol.OriginTask, protocol.KindTaskEvent, te(map[string]any{"role": "system", "raw": map[string]any{"turnEnd": true}}))
	}
	return evs[:n]
}
