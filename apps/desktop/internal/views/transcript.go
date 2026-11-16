package views

// An opened task as turns (D210, after D152): each opens with what someone
// said to the agent (the brief, your words, the partner's) and holds the
// agent's answer in order: its words, and between them its steps, a run of
// them as one summary line (D268), a failure, a subagent and thinking each
// its own. The Go port of
// packages/protocol/src/transcript.ts; both pass fixtures/transcript.json.
// Every text has its keys hidden (internal/redact): the home already hides
// them in what it sends; this is the second wall.

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

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
	// Hint is a real failure in words (D268): the service's message
	// unwrapped from its JSON, else the telling line; Code the HTTP status.
	Hint string `json:"hint,omitempty"`
	Code int    `json:"code,omitempty"`
	// Ms is how long it took (thinking, a subagent), from the event before.
	Ms *int64 `json:"ms,omitempty"`
	// Diff is an edit's lines (editdiff.go); DiffMore past them.
	Diff     []string `json:"diff,omitempty"`
	DiffMore int      `json:"diffMore,omitempty"`
	Added    int      `json:"added,omitempty"`
	Removed  int      `json:"removed,omitempty"`
}

// Line is a line of a stretch (D268): one step (K "row"), or a run of two
// or more steps as one summary line (K "group"), its tally in priority
// order (edits, commands, then the rest by count).
type Line struct {
	K     string    `json:"k"`
	Row   *StepRow  `json:"row,omitempty"`
	Seq   int64     `json:"seq,omitempty"`
	Rows  []StepRow `json:"rows,omitempty"`
	N     int       `json:"n,omitempty"`
	Tally []Tally   `json:"tally,omitempty"`
}

// Tally is one kind of step in a group: how many, and a service's name.
type Tally struct {
	Kind string `json:"kind"` // edited ran used read searched web browsed computer waited other
	N    int    `json:"n"`
	Name string `json:"name,omitempty"`
}

// PlanItem is an item of the agent's plan, as its harness last wrote it.
type PlanItem struct {
	Text  string `json:"text"`
	State string `json:"state"` // todo | doing | done
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
	Label *string   `json:"label,omitempty"` // go (D284): the label of the Go relayed ("" its plain Go)
	State string    `json:"state,omitempty"` // report
	Bad   bool      `json:"bad,omitempty"`   // note: something failed
	// Say is what a note says, worded from note.<say> (D207); Name fills it in.
	Say  string `json:"say,omitempty"`
	Name string `json:"name,omitempty"`
	// Media (D206): you: the pictures sent with it; report: what it showed.
	Media []protocol.MediaRef `json:"media,omitempty"`
	// Items is a plan's (D268).
	Items []PlanItem `json:"items,omitempty"`
	// Timer is a wake's (D271): its wait was for a time. A wake's Text is
	// the wait's reason.
	Timer bool `json:"timer,omitempty"`
}

// The words core's work.ts sends a task when its own wait ends (D271),
// timers first.
var wakes = []struct {
	re    *regexp.Regexp
	timer bool
}{
	{regexp.MustCompile(`^到时间了：「([\s\S]+?)」。接着做。$`), true},
	{regexp.MustCompile(`^It's time: "([\s\S]+?)"\. Carry on\.$`), true},
	{regexp.MustCompile(`^等到了：「([\s\S]+?)」(?:（[^（）]*）)?。接着做。$`), false},
	{regexp.MustCompile(`^The wait is over: "([\s\S]+?)"(?: \([^()]*\))?\. Carry on\.$`), false},
}

// wakeOf is a wake as Ducter sends it (D271): the wait's reason and
// whether it was a timer; ok=false for anything else.
func wakeOf(text string) (reason string, timer, ok bool) {
	text = strings.TrimSpace(text)
	for _, w := range wakes {
		if m := w.re.FindStringSubmatch(text); m != nil {
			return strings.TrimSpace(m[1]), w.timer, true
		}
	}
	return "", false, false
}

// Ducter's own words to a task (D271), logged before they carried from
// "ducter" (as from the user).
var tolds = []struct {
	re  *regexp.Regexp
	say string
}{
	{regexp.MustCompile(`^You may use (.+?) now: the user's own phone`), "lent"},
	{regexp.MustCompile(`^(?:Ducter's (?:browser|phone) is yours again|The user handed Ducter's browser back)`), "returned"},
	{regexp.MustCompile(`^(.+?) (?:is back\. If the work still needs it|answers again and is still lent to you)`), "returned"},
	{regexp.MustCompile(`^The user (?:said no to lending you their phone|said not now to using their own phone)`), "declined"},
	{regexp.MustCompile(`^The user pressed 停下 / Stop`), "stopped"},
	{regexp.MustCompile(`^The user reopened this task\.`), "reopened"},
	// D280: a loan of the person's own phone ended: taken back, given back
	// (or the task finished), or lost.
	{regexp.MustCompile(`^Your loan of (.+?) ended: (?:the user |Android's switch for Ducter went off)`), "taken_back"},
	{regexp.MustCompile(`^Your loan of (.+?) ended: (?:you gave it back|the task finished)`), "given_back"},
	{regexp.MustCompile(`^Your loan of (.+?) ended: `), "loan_lost"},
	// D284: Ducter's words about the person's phone logged as from the user
	// before D271/D280, and any other line that names the person as "the
	// user": a person never calls themself that to their own agent.
	{regexp.MustCompile(`^The user stopped you using their phone`), "stopped"},
	{regexp.MustCompile(`^(?:Recording .+?'s screen now|The recording (?:of .+?'s screen didn't start|is saved|stopped early)|.+?'s screen (?:is on again and it is still lent to you|went off by itself \(a screen timeout))`), "other"},
	{regexp.MustCompile(`^The user\b`), "other"},
}

// toldOf is what Ducter told the agent (D271), from a user-role line:
// from "ducter" always is; an older line from the user is when its words
// are one of Ducter's own. ok=false for the person's words.
func toldOf(text, from string) (say, name string, ok bool) {
	text = strings.TrimSpace(text)
	for _, x := range tolds {
		if m := x.re.FindStringSubmatch(text); m != nil {
			if len(m) > 1 {
				name = strings.TrimSpace(m[1])
			}
			return x.say, name, true
		}
	}
	if from == "ducter" {
		return "other", "", true
	}
	return "", "", false
}

// inTurn reports whether the agent is in a turn now (D271): it did or
// heard something since its last turn ended, or no turn has ended yet. A
// task resting on a wait after its turn ended is not. The port of inTurn
// in packages/protocol/src/transcript.ts.
func inTurn(events []protocol.LogEvent) bool {
	for i := len(events) - 1; i >= 0; i-- {
		if events[i].Kind != protocol.KindTaskEvent {
			continue
		}
		body, _ := events[i].Typed()
		te, ok := body.(*protocol.TaskEvent)
		if !ok {
			continue
		}
		if te.Role == "system" {
			var r map[string]any
			_ = json.Unmarshal(te.Raw, &r)
			if r["turnEnd"] == true || r["kind"] == "turn_ended" {
				return false
			}
			continue
		}
		return true
	}
	for i := range events {
		if events[i].Kind == protocol.KindTaskOpen {
			return true
		}
	}
	return false
}

var (
	spaceRe       = regexp.MustCompile(`\s+`)
	disconnectRe  = regexp.MustCompile(`^(.+?) disconnected`)
	isBackRe      = regexp.MustCompile(`^(.+?) is back`)
	waitingForRe  = regexp.MustCompile(`^waiting for (.+?):`)
	retryRe       = regexp.MustCompile(`^retry (\d+)`)
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
	// D268: a divider for a compaction or an interruption; a retry only while it is the latest thing.
	case r["kind"] == "compaction_ended" && r["outcome"] != "failed":
		return Block{Say: "compacted"}, true
	case r["kind"] == "turn_ended" && r["outcome"] == "aborted":
		return Block{Say: "interrupted"}, true
	case r["kind"] == "retry":
		return Block{Say: "retry", Name: from(retryRe)}, true
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
	// The last line that says something; a stack frame ("at f (x.js:8)")
	// says nothing to a person (D268).
	for i := len(ls) - 1; l == "" && i >= 0; i-- {
		if !strings.HasPrefix(ls[i], "at ") && !strings.HasPrefix(ls[i], "at\t") {
			l = ls[i]
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

var (
	trivialRe    = regexp.MustCompile(`(?i)^(action completed|completed|ok|done|success|succeeded|true|null|\{\}|\[\])?[.!]?$`)
	statusCodeRe = regexp.MustCompile(`(?i)\b(?:HTTP|status|error|code)\b[^\d\n]{0,12}([1-5]\d\d)\b`)
	threeDigits  = regexp.MustCompile(`^\d{3}$`)
	trailColonRe = regexp.MustCompile(`[:：]\s*$`)
)

// trivialOutput is output that says nothing ("Action completed."): its step
// has nothing to open (D268).
func trivialOutput(s string) bool { return trivialRe.MatchString(strings.TrimSpace(s)) }

// failOf is a failure in words (D268): the message inside a service's JSON
// and the HTTP status it names.
func failOf(output string) (string, int) {
	raw := strings.TrimSpace(output)
	hint, code := "", 0
	status := func(v any) int {
		n := 0
		switch x := v.(type) {
		case float64:
			n = int(x)
		case string:
			if threeDigits.MatchString(x) {
				fmt.Sscan(x, &n)
			}
		}
		if n >= 100 && n < 600 {
			return n
		}
		return 0
	}
	s := func(v any) string { x, _ := v.(string); return strings.TrimSpace(x) }
	j, k := strings.Index(raw, "{"), strings.LastIndex(raw, "}")
	if j >= 0 && k > j {
		var o map[string]any
		if json.Unmarshal([]byte(raw[j:k+1]), &o) == nil && o != nil {
			e, _ := o["error"].(map[string]any)
			for _, h := range []string{s(o["message"]), s(e["message"]), s(o["error"]), s(o["detail"])} {
				if h != "" {
					hint = h
					break
				}
			}
			for _, c := range []int{status(o["status"]), status(e["code"]), status(o["code"]), status(e["status"])} {
				if c != 0 {
					code = c
					break
				}
			}
			if hint == "" {
				hint = trailColonRe.ReplaceAllString(failLine(raw[:j]), "")
			}
		}
	}
	if hint == "" {
		hint = failLine(raw)
	}
	if code == 0 {
		if m := statusCodeRe.FindStringSubmatch(raw); m != nil {
			fmt.Sscan(m[1], &code)
		}
	}
	if r := []rune(hint); len(r) > 160 {
		hint = string(r[:159]) + "…"
	}
	return hint, code
}

var knownServices = map[string]string{
	"github": "GitHub", "gitlab": "GitLab", "linear": "Linear", "slack": "Slack", "notion": "Notion", "figma": "Figma", "sentry": "Sentry",
	"jira": "Jira", "stripe": "Stripe", "vercel": "Vercel", "supabase": "Supabase", "nowledge-mem": "Nowledge Mem", "gmail": "Gmail",
}

var (
	claudeAIRe = regexp.MustCompile(`(?i)^claude_ai_`)
	pluginRe   = regexp.MustCompile(`(?i)^plugin_[^_]+_`)
	wordSepRe  = regexp.MustCompile(`[-_.\s]+`)
)

// serviceName is a connected service's name as a person says it: github →
// GitHub, claude_ai_Gmail → Gmail.
func serviceName(server string) string {
	s := pluginRe.ReplaceAllString(claudeAIRe.ReplaceAllString(server, ""), "")
	if k, ok := knownServices[strings.ToLower(s)]; ok {
		return k
	}
	var words []string
	for _, w := range wordSepRe.Split(s, -1) {
		if w != "" {
			words = append(words, strings.ToUpper(w[:1])+w[1:])
		}
	}
	return strings.Join(words, " ")
}

var tallyOrder = []string{"edited", "ran", "used", "read", "searched", "web", "browsed", "computer", "waited", "other"}

func indexOf(list []string, s string) int {
	for i, x := range list {
		if x == s {
			return i
		}
	}
	return -1
}

// tallyOf is what a run of steps did, by kind: edits first, then commands,
// then the rest, most first.
func tallyOf(rows []StepRow) []Tally {
	var out []Tally
	at := map[string]int{}
	for _, r := range rows {
		st := r.Step
		kind, name := "other", ""
		switch st.Kind {
		case "edited", "ran", "read", "browsed", "computer", "waited":
			kind = st.Kind
		case "searched":
			kind = "searched"
			if st.Act == "web" {
				kind = "web"
			}
		case "other":
			if st.Via != "" {
				kind, name = "used", serviceName(st.Via)
			}
		}
		key := kind + ":" + name
		if i, ok := at[key]; ok {
			out[i].N += r.N
			continue
		}
		at[key] = len(out)
		out = append(out, Tally{Kind: kind, N: r.N, Name: name})
	}
	rank := func(t Tally) int {
		switch t.Kind {
		case "edited":
			return 0
		case "ran":
			return 1
		}
		return 2
	}
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i], out[j]
		if rank(a) != rank(b) {
			return rank(a) < rank(b)
		}
		if rank(a) == 2 && a.N != b.N {
			return a.N > b.N
		}
		return indexOf(tallyOrder, a.Kind) < indexOf(tallyOrder, b.Kind)
	})
	return out
}

// alone is a row that stands on its own line: thinking, a failure, a
// subagent (D268).
func alone(r *StepRow) bool {
	return r.Step == nil || r.Outcome == "error" || r.Step.Kind == "delegated" || r.Step.Kind == "background"
}

// linesOf is a stretch's rows as lines (D268): a run of two or more steps
// is one summary line.
func linesOf(rows []StepRow) []Line {
	var out []Line
	var run []StepRow
	flush := func() {
		n := 0
		for _, r := range run {
			n += r.N
		}
		if n >= 2 {
			out = append(out, Line{K: "group", Seq: run[0].Seq, Rows: run, N: n, Tally: tallyOf(run)})
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
		if alone(&r) {
			flush()
			out = append(out, Line{K: "row", Row: &r})
			continue
		}
		run = append(run, r)
	}
	flush()
	return out
}

var (
	planDoneRe  = regexp.MustCompile(`complete|done`)
	planDoingRe = regexp.MustCompile(`progress|doing|active|running`)
)

// planOf is a harness's plan (Claude Code's TodoWrite, Codex's update_plan)
// as items, or nil.
func planOf(name string, input json.RawMessage) []PlanItem {
	_, tool := splitTool(name)
	key := ""
	switch tool {
	case "TodoWrite", "todo_write", "todowrite":
		key = "todos"
	case "update_plan":
		key = "plan"
	default:
		return nil
	}
	var o map[string]any
	if len(input) == 0 || json.Unmarshal(input, &o) != nil {
		return nil
	}
	list, ok := o[key].([]any)
	if !ok {
		return nil
	}
	s := func(v any) string { x, _ := v.(string); return strings.TrimSpace(x) }
	var items []PlanItem
	for _, x := range list {
		e, _ := x.(map[string]any)
		text := ""
		for _, k := range []string{"content", "step", "text", "title"} {
			if text = s(e[k]); text != "" {
				break
			}
		}
		if text == "" {
			continue
		}
		st, state := strings.ToLower(s(e["status"])), "todo"
		switch {
		case planDoneRe.MatchString(st):
			state = "done"
		case planDoingRe.MatchString(st):
			state = "doing"
		}
		items = append(items, PlanItem{Text: redact.Text(text), State: state})
	}
	return items
}

// lastSeq is the seq of the last event a block holds (a stretch's last
// step): how long a turn took (D268).
func lastSeq(b *Block) int64 {
	s := b.Seq
	for _, l := range b.Lines {
		if l.Row != nil && l.Row.Seq > s {
			s = l.Row.Seq
		}
		for _, r := range l.Rows {
			if r.Seq > s {
				s = r.Seq
			}
		}
	}
	return s
}

func isRetry(b *Block) bool { return b != nil && b.K == "note" && b.Say == "retry" }

// turnsOf is blocks as turns: a brief, your words or the partner's open one.
func turnsOf(blocks []Block) []Turn {
	var out []Turn
	for i := range blocks {
		b := blocks[i]
		switch b.K {
		case "brief", "you", "partner", "wake", "told", "go":
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
	plan := -1
	// How long since the event before (thinking ends when what follows
	// begins; a subagent's call is logged when it ends).
	var prevAt time.Time
	for _, ev := range events {
		at, perr := time.Parse(time.RFC3339Nano, ev.TS)
		var took *int64
		if perr == nil && !prevAt.IsZero() && !at.Before(prevAt) {
			ms := at.Sub(prevAt).Milliseconds()
			took = &ms
		}
		if perr == nil {
			prevAt = at
		} else {
			prevAt = time.Time{}
		}
		body, _ := ev.Typed()
		// A retry is said only while it is the latest thing: whatever comes next takes its place.
		if n := len(out); n > 0 && isRetry(&out[n-1]) {
			quiet := false
			if te, ok := body.(*protocol.TaskEvent); ok && te.Role == "system" {
				_, said := noteOf(strings.TrimSpace(te.Text), te.Raw)
				quiet = !said
			}
			if !quiet {
				out = out[:n-1]
				if plan >= len(out) {
					plan = -1
				}
			}
		}
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
				addRow(ev.Seq, StepRow{Seq: ev.Seq, Thought: redact.Text(strings.Join(b.Thinking, " · ")), N: 1, Outcome: "ok", Ms: took})
				continue
			}
			if b.Tool != nil {
				// D268: the agent's plan, one per task, its latest items where it first wrote it.
				if items := planOf(b.Tool.Name, b.Tool.Input); len(items) > 0 {
					if plan >= 0 {
						out[plan].Items = items
					} else {
						plan = len(out)
						out = append(out, Block{K: "plan", Seq: ev.Seq, Items: items})
					}
					continue
				}
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
				row := StepRow{Seq: ev.Seq, Step: &st, N: 1, Outcome: outcome}
				if !trivialOutput(full) {
					row.Output = redact.Text(clipLines(full, 40))
				}
				if outcome == "error" {
					h, code := failOf(full)
					row.Hint, row.Code = redact.Text(h), code
				}
				if st.Kind == "delegated" {
					row.Ms = took
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
				// D266: the harness's own background work, started and ended, as a step of the stretch.
				if st, failed, ok := backgroundStep(b.Raw); ok {
					st.Target = redact.Text(st.Target)
					outcome := "ok"
					if failed {
						outcome = "error"
					}
					addRow(ev.Seq, StepRow{Seq: ev.Seq, Step: &st, N: 1, Outcome: outcome})
					continue
				}
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
					// D271: a wake of its own wait reads as a hairline, never the partner's card.
					if reason, timer, ok := wakeOf(text); ok {
						out = append(out, Block{K: "wake", Seq: ev.Seq, Text: redact.Text(reason), Timer: timer})
						continue
					}
					out = append(out, Block{K: "partner", Seq: ev.Seq, Text: redact.Text(text), Media: b.Media})
					continue
				}
				// D284: the person's Go on a card, as Ducter relays it, is a quiet chip.
				if label, ok := goRelay(text); ok {
					label = redact.Text(label)
					out = append(out, Block{K: "go", Seq: ev.Seq, Label: &label, Text: redact.Text(text)})
					continue
				}
				// D271: what Ducter itself told it is never the person's bubble.
				if say, name, ok := toldOf(text, b.From); ok {
					out = append(out, Block{K: "told", Seq: ev.Seq, Say: say, Name: redact.Text(name), Text: redact.Text(text)})
					continue
				}
				out = append(out, Block{K: "you", Seq: ev.Seq, Text: redact.Text(text), Media: b.Media})
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
	// A retry says itself only as the latest thing; the stretch before it is still the live one.
	tail := len(out) - 1
	if tail >= 0 && isRetry(&out[tail]) {
		tail--
	}
	if working && tail >= 0 && out[tail].K == "steps" {
		out[tail].Live = true
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
