package views

// An opened task as blocks (D152): what you asked, the agent's own voice
// (what it said, the progress it saved) as the readable layer, each
// stretch of steps between two things it said folded under one gist line,
// the stretch under way live. The Go port of
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
}

// Gist is what a stretch of steps was, for its one line.
type Gist struct {
	Kind   string `json:"kind"` // look | edit | browse | run | think
	Steps  int    `json:"steps"`
	Files  int    `json:"files"`
	App    string `json:"app,omitempty"`
	Errors int    `json:"errors"`
}

// Block is one thing in the transcript. K is brief, voice, steps, you,
// partner, report or note.
type Block struct {
	K     string    `json:"k"`
	Seq   int64     `json:"seq"`
	Text  string    `json:"text,omitempty"`
	By    string    `json:"by,omitempty"`    // brief: you | partner
	Saved bool      `json:"saved,omitempty"` // voice: progress it saved
	Rows  []StepRow `json:"rows,omitempty"`
	Gist  *Gist     `json:"gist,omitempty"`
	Live  bool      `json:"live,omitempty"`
	Go    *string   `json:"go,omitempty"`    // you: their Go relayed, its label
	State string    `json:"state,omitempty"` // report
	Bad   bool      `json:"bad,omitempty"`   // note: a turn or delivery that failed
}

var (
	quietSystemRe  = regexp.MustCompile(`(?i)^(session started|turn completed|turn complete|turn ended|turn aborted|looking at |compaction )`)
	failedSystemRe = regexp.MustCompile(`(?i)^(turn failed|delivery failed|failed to|event stream error)`)
	spaceRe        = regexp.MustCompile(`\s+`)
)

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

func gistOf(rows []StepRow) *Gist {
	g := &Gist{Kind: "run"}
	files := map[string]bool{}
	steps, look, browse := 0, true, false
	for _, r := range rows {
		if r.Outcome == "error" {
			g.Errors++
		}
		if r.Step == nil {
			continue
		}
		steps++
		g.Steps += r.N
		if r.Step.Kind == "edited" && r.Step.Act != "mkdir" {
			files[r.Step.Target] = true
		}
		if r.Step.App != "" {
			g.App = r.Step.App
		}
		if !looks(r.Step) {
			look = false
		}
		if r.Step.Kind == "browsed" || r.Step.Kind == "computer" {
			browse = true
		}
	}
	g.Files = len(files)
	switch {
	case steps == 0:
		g.Kind = "think"
	case g.Files > 0:
		g.Kind = "edit"
	case look:
		g.Kind = "look"
	case browse:
		g.Kind = "browse"
	}
	return g
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
			out = append(out, Block{K: "brief", Seq: ev.Seq, Text: redact.Text(strings.TrimSpace(b.Brief)), By: by})
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
			out = append(out, Block{K: "report", Seq: ev.Seq, State: b.State, Text: redact.Text(b.Summary)})
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
				row := StepRow{Seq: ev.Seq, Step: &st, N: 1, Outcome: outcome, Output: redact.Text(clipLines(strings.TrimRight(b.Tool.Output, " \t\r\n"), 40))}
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
				if text == "" || quietSystemRe.MatchString(text) {
					continue
				}
				out = append(out, Block{K: "note", Seq: ev.Seq, Text: redact.Text(text), Bad: failedSystemRe.MatchString(text)})
			case text == "":
			case b.Role == "user":
				if b.From == "runner" || b.From == "" && (strings.HasPrefix(text, `Start the task "`) || strings.HasPrefix(text, "<brief>")) {
					continue // the runner's kickoff, not something anyone said
				}
				if b.From == "partner" || ev.Origin == protocol.OriginPartner {
					out = append(out, Block{K: "partner", Seq: ev.Seq, Text: redact.Text(text)})
					continue
				}
				blk := Block{K: "you", Seq: ev.Seq, Text: redact.Text(text)}
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
			out[i].Gist = gistOf(out[i].Rows)
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
