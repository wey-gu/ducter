package store

import (
	"encoding/json"
	"regexp"
	"sort"
	"strings"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// OutsideAct is something a task did outside its place, as seen in its
// transcript: a push, a PR, a publish, a deploy, a write request, a
// remote shell. It is detected, not gated (G-safety G5: "Seen in the
// transcript").
type OutsideAct struct {
	Seq     int64
	Command string // the command's first line
}

var outsideRE = []*regexp.Regexp{
	regexp.MustCompile(`\bgit\s+push\b`),
	regexp.MustCompile(`\bgh\s+(pr|issue|release)\s+(create|merge|comment|edit|close|reopen|review|delete|upload)\b`),
	regexp.MustCompile(`\bgh\s+api\b.*(-X|--method)\s*(POST|PUT|PATCH|DELETE)`),
	regexp.MustCompile(`\bnpm\s+publish\b|\bbun\s+publish\b|\bpnpm\s+publish\b|\bcargo\s+publish\b`),
	regexp.MustCompile(`\bdocker\s+push\b`),
	regexp.MustCompile(`\bwrangler\s+(deploy|publish|pages\s+deploy)\b`),
	regexp.MustCompile(`\bcurl\b.*(-X\s*(POST|PUT|PATCH|DELETE)|--request\s+(POST|PUT|PATCH|DELETE)|\s-d\s|--data\b|-F\s|--form\b)`),
	regexp.MustCompile(`(^|[\s;&|])(ssh|scp)\s`),
	regexp.MustCompile(`\brsync\b.*\s[\w.-]+@?[\w.-]+:`),
}

// IsOutside reports whether a shell command acts outside the task's place.
func IsOutside(cmd string) bool {
	for _, re := range outsideRE {
		if re.MatchString(cmd) {
			return true
		}
	}
	return false
}

// Outside lists what the task's transcript shows it did outside, oldest
// first. It knows only the events loaded (HistoryLoaded says whether that
// is all of them).
func (t *Task) Outside() []OutsideAct {
	var out []OutsideAct
	for _, ev := range t.Events {
		if ev.Kind != protocol.KindTaskEvent {
			continue
		}
		var b protocol.TaskEvent
		if ev.Decode(&b) != nil || b.Tool == nil || b.Tool.OK != nil && !*b.Tool.OK {
			continue
		}
		cmd := commandOf(b.Tool)
		if cmd != "" && IsOutside(cmd) {
			out = append(out, OutsideAct{Seq: ev.Seq, Command: firstLine(cmd)})
		}
	}
	return out
}

func commandOf(tool *protocol.ToolCall) string {
	var in map[string]any
	if json.Unmarshal(tool.Input, &in) == nil {
		for _, k := range []string{"command", "cmd"} {
			if v, ok := in[k].(string); ok {
				return v
			}
		}
		return ""
	}
	var s string
	if json.Unmarshal(tool.Input, &s) == nil && strings.EqualFold(tool.Name, "bash") {
		return s
	}
	return ""
}

func firstLine(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		s = s[:i] + " …"
	}
	if len(s) > 100 {
		s = s[:100] + "…"
	}
	return s
}

// evidenceRank orders evidence machine-checked first (I-results I2).
var evidenceRank = map[string]int{"test": 0, "ci": 1, "diff": 2, "file": 3, "log": 4, "url": 5}

// SortEvidence returns the evidence in the order results show it.
func SortEvidence(evs []protocol.EvidenceRef) []protocol.EvidenceRef {
	out := append([]protocol.EvidenceRef(nil), evs...)
	rank := func(k string) int {
		if r, ok := evidenceRank[k]; ok {
			return r
		}
		return 9
	}
	sort.SliceStable(out, func(i, j int) bool { return rank(out[i].Kind) < rank(out[j].Kind) })
	return out
}

// MachineChecked reports whether evidence of this kind was checked by a
// machine rather than read by a model.
func MachineChecked(kind string) bool {
	switch kind {
	case "test", "ci", "diff", "file":
		return true
	}
	return false
}
