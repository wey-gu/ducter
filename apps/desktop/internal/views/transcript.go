package views

// An opened task as turns (D210, after D152): each opens with what someone
// said to the agent (the brief, your words, the partner's) and holds the
// agent's answer in order: its words, and its steps as compact lines (a run
// of looks folded into one, an edit with its diff, a failure with its
// error line). The Go port of
// packages/protocol/src/transcript.ts; both pass fixtures/transcript.json.
// Every text has its keys hidden (internal/redact): the home already hides
// them in what it sends; this is the second wall.

import (
	"encoding/json"
	"regexp"
	"strings"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/redact"
)

// StepRow is one line of a stretch: a step (n times in a row) or thinking.
type StepRow struct {
	Seq     int64  `json:"seq"`
	Step    *Step  `json:"step,omitempty"`
	Thought string `json:"thought,omitempty"`
	N       int    `json:"n"`
	Outcome string `json:"outcome"` // ok | error | missing (a probe that found nothing)
	Command string `json:"command,omitempty"`
	Output  string `json:"output,omitempty"`
	// Hint is a real failure's telling line (D210).
	Hint string `json:"hint,omitempty"`
	// Diff is an edit's lines (editdiff.go); DiffMore past them.
	Diff     []string `json:"diff,omitempty"`
	DiffMore int      `json:"diffMore,omitempty"`
	Added    int      `json:"added,omitempty"`
	Removed  int      `json:"removed,omitempty"`
}

// Line is a line of a stretch (D210): one step (K "row"), or a run of two
// or more looks folded into one (K "looks").
type Line struct {
	K        string    `json:"k"`
	Row      *StepRow  `json:"row,omitempty"`
	Seq      int64     `json:"seq,omitempty"`
	Rows     []StepRow `json:"rows,omitempty"`
	Reads    *int      `json:"reads,omitempty"`
	Searches *int      `json:"searches,omitempty"`
}

// Turn is what someone said to the agent, then everything up to the next
// thing said to it (D210).
type Turn struct {
	Seq    int64   `json:"seq"`
	Prompt *Block  `json:"prompt,omitempty"`
	Body   []Block `json:"body"`
}

// Block is one thing in the transcript. K is brief, voice, steps, you,
// partner, report or note.
type Block struct {
	K     string    `json:"k"`
	Seq   int64     `json:"seq"`
	Text  string    `json:"text,omitempty"`
	By    string    `json:"by,omitempty"`    // brief: you | partner
	Saved bool      `json:"saved,omitempty"` // voice: progress it saved
	Rows  []StepRow `json:"-"`
	Lines []Line    `json:"lines,omitempty"`
	Live  bool      `json:"live,omitempty"`
	Go    *string   `json:"go,omitempty"`    // you: their Go relayed, its label
	State string    `json:"state,omitempty"` // report
	Bad   bool      `json:"bad,omitempty"`   // note: something failed
	// Say is what a note says, worded from note.<say> (D207); Name fills it in.
	Say  string `json:"say,omitempty"`
	Name string `json:"name,omitempty"`
	// Media (D206): you: the pictures sent with it; report: what it showed.
	Media []protocol.MediaRef `json:"media,omitempty"`
}

var (
	spaceRe       = regexp.MustCompile(`\s+`)
	disconnectRe  = regexp.MustCompile(`^(.+?) disconnected`)
	isBackRe      = regexp.MustCompile(`^(.+?) is back`)
	waitingForRe  = regexp.MustCompile(`^waiting for (.+?):`)
	deliveryRe    = regexp.MustCompile(`(?i)^delivery failed`)
	startFailRe   = regexp.MustCompile(`(?i)^failed to start`)
	resumeFailRe  = regexp.MustCompile(`(?i)^(failed to resume|could not switch|Claude in Chrome isn't connected, and)`)
	sessionFailRe = regexp.MustCompile(`(?i)^(turn failed|event stream error|nudge failed|failed to)`)
)

// noteOf is a system line as a note, or ok=false when it says nothing to a
// person (D207): the runner's own lines are worded by the clients from
// note.<say>, never shown in the English they were logged in. The port of
// noteOf in packages/protocol/src/transcript.ts.
func noteOf(text string, raw json.RawMessage) (Block, bool) {
	var r map[string]any
	_ = json.Unmarshal(raw, &r)
	obj := func(k string) map[string]any { m, _ := r[k].(map[string]any); return m }
	str := func(v any) string { s, _ := v.(string); return strings.TrimSpace(s) }
	from := func(re *regexp.Regexp) string {
		if m := re.FindStringSubmatch(text); m != nil {
			return strings.TrimSpace(m[1])
		}
		return ""
	}
	truthy := func(v any) bool { return v != nil && v != false && v != "" && v != 0.0 }
	or := func(a, b string) string {
		if a != "" {
			return a
		}
		return b
	}
	_, hasDevice := r["device"]
	switch {
	case truthy(r["stall"]):
		return Block{Say: "stalled"}, true
	case truthy(r["fresh"]):
		return Block{Say: "fresh"}, true
	case truthy(r["effortDropped"]):
		return Block{Say: "effort_dropped", Name: str(r["effortDropped"])}, true
	case obj("browser") != nil && truthy(obj("browser")["guard"]):
		return Block{Say: "guard"}, true
	case obj("browser") != nil && obj("browser")["driver"] == "cua":
		return Block{Say: "to_own_browser"}, true
	case obj("switched") != nil || obj("moved") != nil:
		to := ""
		if sw := obj("switched"); sw != nil && str(sw["to"]) != "" {
			to = harnessName(str(sw["to"]))
		} else if mv := obj("moved"); mv != nil {
			to = str(mv["to"])
		}
		return Block{Say: "moved", Name: to}, true
	case hasDevice && r["offline"] == true:
		return Block{Say: "offline", Name: or(str(r["name"]), from(disconnectRe))}, true
	case hasDevice && r["offline"] == false:
		return Block{Say: "back", Name: or(str(r["name"]), from(isBackRe))}, true
	case r["waits"] == "asleep" || r["waits"] == "unreachable":
		return Block{Say: "waiting_device", Name: or(str(r["name"]), from(waitingForRe))}, true
	case deliveryRe.MatchString(text):
		return Block{Say: "error_delivery", Bad: true}, true
	case startFailRe.MatchString(text):
		return Block{Say: "error_start", Bad: true}, true
	case resumeFailRe.MatchString(text):
		return Block{Say: "error_resume", Bad: true}, true
	case sessionFailRe.MatchString(text):
		return Block{Say: "error", Bad: true}, true
	}
	return Block{}, false
}

func normSpace(s string) string { return strings.TrimSpace(spaceRe.ReplaceAllString(s, " ")) }

// looks: a step that only looks (reading, searching, a probe, a request).
func looks(s *Step) bool {
	return s.Kind == "read" || s.Kind == "searched" || s.Probe || s.Kind == "browsed" && (s.Act == "request" || s.Act == "fetch")
}

func shellCommand(raw json.RawMessage) string {
	var v any
	if json.Unmarshal(raw, &v) != nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	o, _ := v.(map[string]any)
	for _, k := range []string{"command", "cmd", "script", "code"} {
		switch x := o[k].(type) {
		case string:
			if strings.TrimSpace(x) != "" {
				return strings.TrimSpace(x)
			}
		case []any:
			parts := make([]string, 0, len(x))
			for _, p := range x {
				s, ok := p.(string)
				if !ok {
					parts = nil
					break
				}
				parts = append(parts, s)
			}
			if parts != nil {
				return strings.Join(parts, " ")
			}
		}
	}
	return ""
}

func clipLines(s string, n int) string {
	ls := strings.Split(s, "\n")
	if len(ls) > n {
		ls = ls[:n]
	}
	return strings.Join(ls, "\n")
}

var (
	failWordRe = regexp.MustCompile(`(?i)error|fail|✗|exception|fatal|denied|not found|cannot|panic`)
	noFailRe   = regexp.MustCompile(`(?i)\b0 (fail|error)`)
)

// failLine is a failure's telling line: the first that names an error,
// else the last that says anything.
func failLine(output string) string {
	var ls []string
	for _, l := range strings.Split(output, "\n") {
		if l = strings.TrimSpace(l); l != "" {
			ls = append(ls, l)
		}
	}
	l := ""
	for _, x := range ls {
		if failWordRe.MatchString(x) && !noFailRe.MatchString(x) {
			l = x
			break
		}
	}
	if l == "" && len(ls) > 0 {
		l = ls[len(ls)-1]
	}
	if r := []rune(l); len(r) > 160 {
		l = string(r[:159]) + "…"
	}
	return l
}

// linesOf is a stretch's rows as lines: two or more looks in a row fold
// into one (D210).
func linesOf(rows []StepRow) []Line {
	var out []Line
	var run []StepRow
	flush := func() {
		if len(run) >= 2 {
			reads, all := 0, 0
			for _, r := range run {
				all += r.N
				if r.Step.Kind == "read" {
					reads += r.N
				}
			}
			searches := all - reads
			out = append(out, Line{K: "looks", Seq: run[0].Seq, Rows: run, Reads: &reads, Searches: &searches})
		} else {
			for i := range run {
				r := run[i]
				out = append(out, Line{K: "row", Row: &r})
			}
		}
		run = nil
	}
	for i := range rows {
		r := rows[i]
		if r.Step != nil && looks(r.Step) && r.Outcome != "error" {
			run = append(run, r)
			continue
		}
		flush()
		out = append(out, Line{K: "row", Row: &r})
	}
	flush()
	return out
}

// turnsOf is blocks as turns: a brief, your words or the partner's open one.
func turnsOf(blocks []Block) []Turn {
	var out []Turn
	for i := range blocks {
		b := blocks[i]
		switch b.K {
		case "brief", "you", "partner":
			out = append(out, Turn{Seq: b.Seq, Prompt: &b, Body: []Block{}})
			continue
		}
		if len(out) == 0 {
			out = append(out, Turn{Seq: b.Seq, Body: []Block{}})
		}
		out[len(out)-1].Body = append(out[len(out)-1].Body, b)
	}
	return out
}

// blocksOf is a task's events as blocks; working: its last stretch is live.
func blocksOf(harness string, events []protocol.LogEvent, working bool) []Block {
	var out []Block
	last := int64(-1)
	for _, ev := range events {
		if ev.Kind == protocol.KindReport {
			last = ev.Seq
		}
	}
	app, briefed := "", false
	stretch := func() *Block {
		if n := len(out); n > 0 && out[n-1].K == "steps" {
			return &out[n-1]
		}
		return nil
	}
	addRow := func(seq int64, row StepRow) {
		s := stretch()
		if s == nil {
			out = append(out, Block{K: "steps", Seq: seq})
			s = &out[len(out)-1]
		}
		s.Rows = append(s.Rows, row)
	}
	for _, ev := range events {
		body, _ := ev.Typed()
		switch b := body.(type) {
		case *protocol.TaskOpen:
			if briefed || strings.TrimSpace(b.Brief) == "" {
				continue
			}
			briefed = true
			by := "partner"
			if b.Origin == "you" {
				by = "you"
			}
			out = append(out, Block{K: "brief", Seq: ev.Seq, Text: redact.Text(strings.TrimSpace(b.Brief)), By: by, Media: b.Media})
		case *protocol.Checkpoint:
			text := redact.Text(strings.TrimSpace(b.Text))
			if text == "" {
				continue
			}
			// Saved what it just said: the same words once, marked saved.
			said := -1
			for i := len(out) - 1; i >= 0; i-- {
				if out[i].K != "steps" {
					said = i
					break
				}
			}
			if said >= 0 && out[said].K == "voice" && normSpace(out[said].Text) == normSpace(text) {
				out[said].Saved = true
			} else {
				out = append(out, Block{K: "voice", Seq: ev.Seq, Text: text, Saved: true})
			}
		case *protocol.Report:
			if ev.Seq == last {
				continue
			}
			out = append(out, Block{K: "report", Seq: ev.Seq, State: b.State, Text: redact.Text(b.Summary), Media: b.Media})
		case *protocol.TaskEvent:
			if len(b.Thinking) > 0 {
				addRow(ev.Seq, StepRow{Seq: ev.Seq, Thought: redact.Text(strings.Join(b.Thinking, " · ")), N: 1, Outcome: "ok"})
				continue
			}
			if b.Tool != nil {
				st := stepOf(harness, b.Tool)
				if st.Hidden {
					continue
				}
				if st.Kind == "browsed" || st.Kind == "computer" {
					if st.App == "" {
						st.App = app
					} else {
						app = st.App
					}
				}
				st.Target, st.Says = redact.Text(st.Target), redact.Text(st.Says)
				outcome := "ok"
				if b.Tool.OK != nil && !*b.Tool.OK {
					outcome = "error"
					if st.Probe {
						outcome = "missing"
					}
				}
				if s := stretch(); s != nil && outcome == "ok" {
					if p := &s.Rows[len(s.Rows)-1]; p.Step != nil && p.Outcome == "ok" && *p.Step == st {
						p.N++
						continue
					}
				}
				full := strings.TrimRight(b.Tool.Output, " \t\r\n")
				row := StepRow{Seq: ev.Seq, Step: &st, N: 1, Outcome: outcome, Output: redact.Text(clipLines(full, 40))}
				if outcome == "error" {
					row.Hint = redact.Text(failLine(full))
				}
				if st.Kind == "edited" && st.Act != "mkdir" {
					if d := editDiff(b.Tool.Input); d != nil {
						for _, l := range d.Lines {
							row.Diff = append(row.Diff, redact.Text(l))
						}
						row.DiffMore, row.Added, row.Removed = d.More, d.Added, d.Removed
					}
				}
				switch st.Kind {
				case "ran", "searched", "read", "browsed":
					row.Command = redact.Text(shellCommand(b.Tool.Input))
				}
				addRow(ev.Seq, row)
				continue
			}
			text := strings.TrimSpace(b.Text)
			switch {
			case b.Role == "system":
				if n, ok := noteOf(text, b.Raw); ok {
					n.K, n.Seq, n.Text = "note", ev.Seq, redact.Text(text)
					out = append(out, n)
				}
			case text == "" && len(b.Media) == 0:
			case b.Role == "user":
				if b.From == "runner" || b.From == "" && (strings.HasPrefix(text, `Start the task "`) || strings.HasPrefix(text, "<brief>")) {
					continue // the runner's kickoff, not something anyone said
				}
				if b.From == "partner" || ev.Origin == protocol.OriginPartner {
					out = append(out, Block{K: "partner", Seq: ev.Seq, Text: redact.Text(text), Media: b.Media})
					continue
				}
				blk := Block{K: "you", Seq: ev.Seq, Text: redact.Text(text), Media: b.Media}
				if label, ok := goRelay(text); ok {
					blk.Go = &label
				}
				out = append(out, blk)
			case b.Role == "assistant":
				out = append(out, Block{K: "voice", Seq: ev.Seq, Text: redact.Text(text)})
			}
		}
	}
	for i := range out {
		if out[i].K == "steps" {
			out[i].Lines = linesOf(out[i].Rows)
		}
	}
	if n := len(out); working && n > 0 && out[n-1].K == "steps" {
		out[n-1].Live = true
	}
	return out
}

// latestVoice is the agent's latest words, first line, since its last report.
func latestVoice(blocks []Block) string {
	for i := len(blocks) - 1; i >= 0; i-- {
		switch blocks[i].K {
		case "report":
			return ""
		case "voice":
			return strings.SplitN(blocks[i].Text, "\n", 2)[0]
		}
	}
	return ""
}
