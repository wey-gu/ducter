package views

// What an edit changed, from the edit tool's own input (D210): the lines
// it took out and put in, shown under an edit's row. The Go port of
// packages/protocol/src/editdiff.ts; both pass fixtures/transcript.json.

import (
	"encoding/json"
	"regexp"
	"strings"
)

const (
	diffMax     = 60 // lines carried with a row; the rest is a count
	diffContext = 2  // unchanged lines kept around an old/new edit
)

// EditDiff is an edit's lines ("+…", "-…", " …", "@@" between hunks).
type EditDiff struct {
	Lines          []string
	Added, Removed int
	More           int
}

var (
	editFileRe  = regexp.MustCompile(`^\*\*\* (?:Update|Add|Delete) File: (.+)$`)
	patchLikeRe = regexp.MustCompile(`(?m)^\*\*\* Begin Patch|^@@|^\+\+\+ `)
)

func splitLines(s string) []string {
	if s == "" {
		return nil
	}
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.TrimSuffix(s, "\n")
	return strings.Split(s, "\n")
}

// linesDiff is old → new as one hunk, the common head and tail trimmed
// to diffContext lines of context.
func linesDiff(a, b string) []string {
	A, B := splitLines(a), splitLines(b)
	p := 0
	for p < len(A) && p < len(B) && A[p] == B[p] {
		p++
	}
	s := 0
	for s < len(A)-p && s < len(B)-p && A[len(A)-1-s] == B[len(B)-1-s] {
		s++
	}
	var out []string
	for _, l := range A[max(0, p-diffContext):p] {
		out = append(out, " "+l)
	}
	for _, l := range A[p : len(A)-s] {
		out = append(out, "-"+l)
	}
	for _, l := range B[p : len(B)-s] {
		out = append(out, "+"+l)
	}
	for _, l := range A[len(A)-s : min(len(A), len(A)-s+diffContext)] {
		out = append(out, " "+l)
	}
	return out
}

func patchLines(patch, path string) []string {
	var out []string
	if path != "" {
		out = append(out, "@@ "+path)
	}
	files := 0
	for _, l := range splitLines(patch) {
		if editFileRe.MatchString(l) {
			files++
		}
	}
	for _, l := range splitLines(patch) {
		if m := editFileRe.FindStringSubmatch(l); m != nil {
			if files > 1 {
				out = append(out, "@@ "+strings.TrimSpace(m[1]))
			}
			continue
		}
		switch {
		case strings.HasPrefix(l, "***"), strings.HasPrefix(l, "+++"), strings.HasPrefix(l, "---"), strings.HasPrefix(l, "diff "), strings.HasPrefix(l, "index "):
		case strings.HasPrefix(l, "@@"):
			if len(out) > 0 && !strings.HasPrefix(out[len(out)-1], "@@") {
				out = append(out, "@@")
			}
		case strings.HasPrefix(l, "+"), strings.HasPrefix(l, "-"), strings.HasPrefix(l, " "):
			out = append(out, l)
		case l == "":
			out = append(out, " ")
		}
	}
	return out
}

// editDiff is an edit call's lines, or nil when its input says nothing
// about what changed.
func editDiff(raw json.RawMessage) *EditDiff {
	var v any
	if json.Unmarshal(raw, &v) != nil {
		return nil
	}
	var lines []string
	o, _ := v.(map[string]any)
	str := func(m map[string]any, keys ...string) (string, bool) {
		for _, k := range keys {
			if s, ok := m[k].(string); ok {
				return s, true
			}
		}
		return "", false
	}
	if s, ok := v.(string); ok {
		if patchLikeRe.MatchString(s) {
			lines = patchLines(s, "")
		}
	} else if _, okOld := str(o, "old_string", "old_str"); okOld || func() bool { _, ok := str(o, "new_string", "new_str"); return ok }() {
		a, _ := str(o, "old_string", "old_str")
		b, _ := str(o, "new_string", "new_str")
		lines = linesDiff(a, b)
	} else if edits, ok := o["edits"].([]any); ok {
		for _, e := range edits {
			x, _ := e.(map[string]any)
			a, _ := str(x, "old_string", "old_str", "oldText")
			b, _ := str(x, "new_string", "new_str", "newText")
			d := linesDiff(a, b)
			if len(d) == 0 {
				continue
			}
			if len(lines) > 0 {
				lines = append(lines, "@@")
			}
			lines = append(lines, d...)
		}
	} else if c, ok := str(o, "content", "file_text"); ok {
		for _, l := range splitLines(c) {
			lines = append(lines, "+"+l)
		}
	} else if changes, ok := o["changes"].([]any); ok {
		var cs []map[string]any
		for _, c := range changes {
			if m, ok := c.(map[string]any); ok {
				if _, ok := str(m, "diff", "unified_diff"); ok {
					cs = append(cs, m)
				}
			}
		}
		for _, c := range cs {
			d, _ := str(c, "diff", "unified_diff")
			path := ""
			if p, ok := c["path"].(string); ok && len(cs) > 1 {
				path = p
			}
			lines = append(lines, patchLines(d, path)...)
		}
	} else {
		for _, k := range []string{"patch", "input", "diff"} {
			if s, ok := o[k].(string); ok && patchLikeRe.MatchString(s) {
				lines = patchLines(s, "")
				break
			}
		}
	}
	d := &EditDiff{}
	for _, l := range lines {
		switch {
		case strings.HasPrefix(l, "+"):
			d.Added++
		case strings.HasPrefix(l, "-"):
			d.Removed++
		}
	}
	if d.Added+d.Removed == 0 {
		return nil
	}
	if len(lines) > diffMax {
		d.More = len(lines) - diffMax
		lines = lines[:diffMax]
	}
	d.Lines = lines
	return d
}
