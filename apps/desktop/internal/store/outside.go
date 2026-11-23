package store

import (
	"encoding/json"
	"fmt"
	"slices"
	"sort"
	"strings"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// OutsideAct is one thing a task sent out of its place, as seen in its
// transcript (D496: by the command's grammar, store/outward.go): the same
// act on the same thing is one row with a count, a PR's edits are one row
// with every field changed. It is detected, not gated (G-safety G5: "Seen
// in the transcript"); the commands stay for a hover.
type OutsideAct struct {
	Seq      int64
	Act      OutwardAct
	Count    int
	Commands []string // each command's first line
}

// IsOutside reports whether a shell command sent something out of the task's place.
func IsOutside(cmd string) bool { return len(OutwardOf(cmd, "")) > 0 }

// Outside lists what the task's transcript shows it did outside, oldest
// first. It knows only the events loaded (HistoryLoaded says whether that
// is all of them).
func (t *Task) Outside() []OutsideAct {
	// Kept until the events change: a frame asks for it, and decoding every
	// event each frame held a long task's page (D290 paints more frames).
	key := outsideKey{n: len(t.Events)}
	if key.n > 0 {
		key.first, key.last = t.Events[0].Seq, t.Events[key.n-1].Seq
	}
	if t.outsideOK && t.outsideAt == key {
		return t.outside
	}
	out := t.outsideScan()
	t.outside, t.outsideAt, t.outsideOK = out, key, true
	return out
}

type outsideKey struct {
	n           int
	first, last int64
}

func (t *Task) outsideScan() []OutsideAct {
	var out []OutsideAct
	at := map[string]int{}
	for _, ev := range t.Events {
		if ev.Kind != protocol.KindTaskEvent {
			continue
		}
		var b protocol.TaskEvent
		if ev.Decode(&b) != nil || b.Tool == nil || b.Tool.OK != nil && !*b.Tool.OK {
			continue
		}
		cmd := commandOf(b.Tool)
		if cmd == "" {
			continue
		}
		line := firstLine(cmd)
		for _, act := range OutwardOf(cmd, b.Tool.Output) {
			// A push that names no branch pushed the task's own.
			if act.Kind == "push" && act.Target == "" {
				act.Target = t.Place().Branch
			}
			key := fmt.Sprintf("%s|%d|%s|%s", act.Kind, act.N, act.Target, act.Review)
			i, ok := at[key]
			if !ok {
				act.Fields = append([]string(nil), act.Fields...)
				at[key] = len(out)
				out = append(out, OutsideAct{Seq: ev.Seq, Act: act, Count: 1, Commands: []string{line}})
				continue
			}
			row := &out[i]
			if act.Kind == "pr_edit" || act.Kind == "issue_edit" {
				for _, f := range act.Fields {
					if !slices.Contains(row.Act.Fields, f) {
						row.Act.Fields = append(row.Act.Fields, f)
					}
				}
			} else {
				row.Count++
			}
			if !slices.Contains(row.Commands, line) {
				row.Commands = append(row.Commands, line)
			}
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
		// A harness that hands its input over as JSON text (seen on hel, 2026-11-21).
		if strings.HasPrefix(strings.TrimSpace(s), "{") && json.Unmarshal([]byte(s), &in) == nil {
			for _, k := range []string{"command", "cmd"} {
				if v, ok := in[k].(string); ok {
					return v
				}
			}
		}
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
