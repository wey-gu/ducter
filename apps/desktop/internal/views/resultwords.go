package views

import (
	"encoding/json"
	"regexp"
	"strconv"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/say"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// What a result says in words, not plumbing: a reproduction is not a
// passed check, Ducter's own tools are not something the task did, the
// changes are one "2 files changed" item, a PR that can't be opened says
// why on the task, and a finished task waits for the partner's own words.

var (
	reproAfter = regexp.MustCompile(`(?i)\bafter\b|修好后|改完|之后`)
	reproSure  = regexp.MustCompile(`(?i)\b(before|repro\w*|reproduc\w*)\b|修之前|修复前|改之前|复现`)
	reproFail  = regexp.MustCompile(`(?i)\b(fails|failing|failed|broken)\b|失败|报错|没过`)
	reproPass  = regexp.MustCompile(`(?i)\bpass|通过|全过`)
	countsFile = regexp.MustCompile(`(?i)\d+\s*(files?\b|个文件)`)
	countsNum  = regexp.MustCompile(`(?i)(\d+)\s*(?:files?\b|个文件)`)
	noRemoteRe = regexp.MustCompile(`(?i)no (origin )?remote`)
	plumbingRe = regexp.MustCompile(`^mcp__ducter[\w-]*__`)
)

// isRepro reports whether a check is a reproduction (the run before the
// fix, failed on purpose): it gets a quiet ×, never a ✓. A report carries
// no pass or fail per check, so its label says it.
func isRepro(e protocol.EvidenceRef) bool {
	if e.Kind != "test" && e.Kind != "ci" && e.Kind != "log" {
		return false
	}
	l := e.Label
	if reproAfter.MatchString(l) {
		return false
	}
	if reproSure.MatchString(l) {
		return true
	}
	return reproFail.MatchString(l) && !reproPass.MatchString(l)
}

// isPlumbing reports whether a tool is one of Ducter's own (its reports,
// saved progress, reading the Log): never shown as something the task did,
// and a call to one that went wrong is Ducter's to fix, not the person's.
func isPlumbing(name string) bool {
	switch name {
	case "report_to_main", "checkpoint", "log_search", "log_read":
		return true
	}
	return plumbingRe.MatchString(name)
}

// editedFiles counts the files the task's edits touched, from its stream.
func editedFiles(task *store.Task) int {
	files := map[string]bool{}
	for _, ev := range task.Events {
		if ev.Kind != protocol.KindTaskEvent {
			continue
		}
		body, _ := ev.Typed()
		b, _ := body.(*protocol.TaskEvent)
		if b == nil || b.Tool == nil || (b.Tool.OK != nil && !*b.Tool.OK) {
			continue
		}
		switch b.Tool.Name {
		case "Edit", "Write", "MultiEdit", "NotebookEdit":
		default:
			continue
		}
		var in map[string]any
		_ = json.Unmarshal(b.Tool.Input, &in)
		for _, k := range []string{"file_path", "path", "notebook_path"} {
			if p, _ := in[k].(string); p != "" {
				files[p] = true
				break
			}
		}
	}
	return len(files)
}

// changesWords is the changes as one item: "2 files changed" (D73). A label
// that already counts them stands; else the diff read for the opened task,
// the task's edits, or the files it named; "See changes" when nothing
// counts them (a bare "commit" or a hash says nothing to a person).
// tongue is the reader's language for package say ("zh" or "en").
func (a *App) tongue() string {
	if a.L.Lang == i18n.ZH {
		return "zh"
	}
	return "en"
}

// proofLabel is an evidence label as this reader sees it (D154).
func (a *App) proofLabel(ev protocol.EvidenceRef) string {
	return say.ProofLabel(ev.Kind, ev.Label, ev.Ref, a.tongue())
}

func (a *App) changesWords(task *store.Task, changed []protocol.EvidenceRef) string {
	files := 0
	for _, e := range changed {
		if e.Kind == "diff" && countsFile.MatchString(e.Label) {
			if say.InTongue(e.Label, a.tongue()) {
				return e.Label
			}
			// D154: the task's count, said in the reader's language.
			if k, err := strconv.Atoi(countsNum.FindStringSubmatch(e.Label)[1]); err == nil && k > 0 {
				if k == 1 {
					return a.L.T("result.files.one")
				}
				return a.L.T("result.files", k)
			}
		}
		if e.Kind == "file" {
			files++
		}
	}
	n := 0
	if p := a.diffs[task.ID]; p != nil && len(p.files) > 0 {
		n = len(p.files)
	} else if n = editedFiles(task); n == 0 {
		n = files
	}
	switch {
	case n == 1:
		return a.L.T("result.files.one")
	case n > 1:
		return a.L.T("result.files", n)
	}
	return a.L.T("result.changes")
}

// noRemote reports that the repo has nowhere to push to, so Open draft PR
// isn't offered.
func noRemote(task *store.Task) bool {
	f := task.Acted
	return f != nil && !f.OK && f.Action == "open_pr" && noRemoteRe.MatchString(f.Message)
}

// prFailure is why the last Open draft PR didn't work, in words, or "". It
// stays on the task until the next try or result, not a passing toast.
func (a *App) prFailure(task *store.Task) string {
	f := task.Acted
	if f == nil || f.OK || f.Action != "open_pr" || task.Acting != "" {
		return ""
	}
	if noRemote(task) {
		return a.L.T("result.pr.noremote")
	}
	return a.L.T("result.pr.failed", f.Message)
}

// wordsWait is how long the partner usually needs to say a finished task
// in its own words (measured 30–75 s), with room to spare.
const wordsWait = 120 * time.Second

// wordsDueIn is how long until a finished task's line may stand in for the
// partner's words (D124): until then its place shows the waiting presence.
// Zero once it is late, when not known, or when offline.
func (a *App) wordsDueIn(task *store.Task) time.Duration {
	if a.Status != client.Connected {
		return 0
	}
	var at time.Time
	for i := len(task.Events) - 1; i >= 0 && at.IsZero(); i-- {
		ev := task.Events[i]
		if ev.Kind != protocol.KindReport {
			continue
		}
		body, _ := ev.Typed()
		if r, _ := body.(*protocol.Report); r != nil && (r.State == "done" || r.State == "failed") {
			at = store.ParseTime(ev.TS)
		}
	}
	if c := task.Card; at.IsZero() && c != nil && c.LastReport != nil && (c.LastReport.State == "done" || c.LastReport.State == "failed") {
		at = store.ParseTime(c.UpdatedAt)
	}
	if at.IsZero() {
		return 0
	}
	return max(0, wordsWait-a.Now().Sub(at))
}
