package views

// D530: an opened task's steps as the rows it draws: a turn's work under
// one quiet head ("12 步，3 条消息"), one row per step, a run of file reads
// as one row with their chips, a service's tool said by the service and
// what it did. The Go port of packages/protocol/src/stepview.ts; both pass
// packages/protocol/fixtures/stepview.json.

import (
	"regexp"
	"strings"
)

// Item is one row a stretch draws: a step (K "row"), or a run of file
// reads as one row with their files (K "files").
type Item struct {
	K    string    `json:"k"`
	Row  *StepRow  `json:"row,omitempty"`
	Seq  int64     `json:"seq,omitempty"`
	Rows []StepRow `json:"rows,omitempty"`
}

func fileRead(r *StepRow) bool {
	return r.Step != nil && r.Step.Kind == "read" && r.Step.Act == "" && r.Step.Target != "" && r.Outcome == "ok"
}

// itemsOf is a stretch's lines as rows, two or more file reads in a row as one.
func itemsOf(lines []Line) []Item {
	var out []Item
	var run []StepRow
	flush := func() {
		if len(run) >= 2 {
			out = append(out, Item{K: "files", Seq: run[0].Seq, Rows: run})
		} else {
			for i := range run {
				r := run[i]
				out = append(out, Item{K: "row", Row: &r})
			}
		}
		run = nil
	}
	for li := range lines {
		l := &lines[li]
		rows := l.Rows
		if l.K == "row" && l.Row != nil {
			rows = []StepRow{*l.Row}
		}
		for i := range rows {
			r := rows[i]
			if fileRead(&r) {
				run = append(run, r)
				continue
			}
			flush()
			out = append(out, Item{K: "row", Row: &r})
		}
	}
	flush()
	return out
}

// Work is what a turn's work holds: its steps (thinking is none), the
// words it said along the way, and how many failed.
type Work struct {
	Steps    int `json:"steps"`
	Messages int `json:"messages"`
	Failed   int `json:"failed"`
}

func workOf(blocks []Block) Work {
	var w Work
	for bi := range blocks {
		b := &blocks[bi]
		if b.K == "voice" {
			w.Messages++
		}
		if b.K != "steps" {
			continue
		}
		for li := range b.Lines {
			l := &b.Lines[li]
			rows := l.Rows
			if l.K == "row" && l.Row != nil {
				rows = []StepRow{*l.Row}
			}
			for _, r := range rows {
				if r.Step == nil {
					continue
				}
				w.Steps += r.N
				if r.Outcome == "error" {
					w.Failed++
				}
			}
		}
	}
	return w
}

var toolActs = []struct {
	re  *regexp.Regexp
	act string
}{
	{regexp.MustCompile(`^(get|read|fetch|view|show|retrieve|download|describe|load|open)$`), "read"},
	{regexp.MustCompile(`^(list|browse|enumerate)$`), "list"},
	{regexp.MustCompile(`^(search|find|query|lookup|grep)$`), "search"},
	{regexp.MustCompile(`^(create|add|new|insert|make)$`), "create"},
	{regexp.MustCompile(`^(update|edit|set|patch|modify|rename|move|merge|change|write|save|upsert)$`), "update"},
	{regexp.MustCompile(`^(delete|remove|close|archive|drop|clear)$`), "delete"},
	{regexp.MustCompile(`^(send|reply|comment|notify|publish|post|share|message)$`), "send"},
	{regexp.MustCompile(`^(run|execute|exec|invoke|call|trigger|start)$`), "run"},
}

var (
	camelRe        = regexp.MustCompile(`([a-z0-9])([A-Z])`)
	toolWordRe     = regexp.MustCompile(`[\s_.-]+`)
	heredocRe      = regexp.MustCompile(`<<-?\s*['"]?\w+['"]?`)
	extRe          = regexp.MustCompile(`\.([A-Za-z0-9]+)$`)
	chipPictureExt = regexp.MustCompile(`^(png|jpe?g|gif|webp|svg|heic|ico|bmp|avif)$`)
	chipTextExt    = regexp.MustCompile(`^(md|mdx|txt|rst|adoc|org)$`)
	chipDataExt    = regexp.MustCompile(`^(json|ya?ml|toml|csv|tsv|xml|lock|sql|ini|env|plist)$`)
)

// toolAct is a service's tool name as what it did and on what: get pull
// request → read, "pull request"; a name with no known verb is used whole.
func toolAct(name string) (string, string) {
	var words []string
	for _, w := range toolWordRe.Split(camelRe.ReplaceAllString(name, "$1 $2"), -1) {
		if w != "" {
			words = append(words, strings.ToLower(w))
		}
	}
	act := ""
	if len(words) > 0 {
		for _, x := range toolActs {
			if x.re.MatchString(words[0]) {
				act = x.act
				break
			}
		}
	}
	if act == "" {
		return "use", strings.Join(words, " ")
	}
	if len(words) < 2 {
		return act, ""
	}
	return act, strings.Join(words[1:], " ")
}

// chipText is a command or pattern cut for its chip: its first line, a
// heredoc's body left out, at most max characters cut at a word's end.
func chipText(s string, max int) string {
	t := strings.TrimSpace(s)
	line := strings.TrimSpace(strings.SplitN(s, "\n", 2)[0])
	cut := line != t
	if m := heredocRe.FindStringIndex(line); m != nil {
		line = line[:m[1]]
		cut = true
	}
	cs := []rune(line)
	if len(cs) > max {
		floor := float64(max) * 0.6
		i := max
		for float64(i) > floor && cs[i] != ' ' {
			i--
		}
		if float64(i) <= floor {
			i = max
		}
		line = strings.TrimRight(string(cs[:i]), " ")
		cut = true
	}
	if cut {
		return line + "…"
	}
	return line
}

// chipFileKind is the kind a file chip draws: code, text, picture, data, file.
func chipFileKind(path string) string {
	m := extRe.FindStringSubmatch(path)
	if m == nil {
		return "file"
	}
	ext := strings.ToLower(m[1])
	switch {
	case chipPictureExt.MatchString(ext):
		return "picture"
	case chipTextExt.MatchString(ext):
		return "text"
	case chipDataExt.MatchString(ext):
		return "data"
	}
	return "code"
}

// chipFileName is a path's last part: what a file chip says.
func chipFileName(path string) string {
	p := strings.TrimRight(path, "/")
	if i := strings.LastIndex(p, "/"); i >= 0 {
		return p[i+1:]
	}
	return p
}
