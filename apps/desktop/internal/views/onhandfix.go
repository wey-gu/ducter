package views

// D467 round 4: the real fix for each way a task gets stuck, said by the
// partner in one sentence with the button that does it, from what Ducter
// already knows: why it couldn't start (D395, D415), an agent signed out on
// its computer (D363's sign-in), a computer gone away (D157), the person's
// Mac without its two switches (D235), a phone (D238), a plain failure
// (D454). The brief says it; a card the brief has no room for says the
// same. The web does the same (apps/web/src/onhand-brief.tsx).

import (
	"regexp"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// fixButton is one thing the person can do from the sentence.
type fixButton struct {
	label string
	kind  btnKind
	do    func()
}

// stuckFix is what the partner says about a stuck task, and its fixes.
type stuckFix struct {
	kind     string // cant | signin | offline | perm | phone | failed | unknown | stopped
	sentence string
	// line is the row's own line (D471), without the task's name; "" says
	// the sentence's clause.
	line    string
	buttons []fixButton
}

// phoneStopped: a phone task the home stopped lending to, told by its own
// report when its steps aren't held (D471).
var phoneStopped = regexp.MustCompile(`(?i)(手机|phone)[^。.\n]{0,24}(访问|借用|access)[^。.\n]{0,16}(停止|停了|stopped|revoked|ended)`)

// rawFailure: a failure whose words are a tool's or git's own output, said in
// the partner's voice instead (D471): a lock git left behind, or an error
// nobody recognised.
func rawFailure(reason string) string {
	switch {
	case strings.TrimSpace(reason) == "":
		return ""
	case strings.Contains(reason, "index.lock") || strings.Contains(strings.ToLower(reason), "another git process"):
		return "lock"
	case rawWords.MatchString(reason):
		return "unknown"
	}
	return ""
}

var rawWords = regexp.MustCompile(`(?i)^(fatal|error)[: ]|\n|git |exit (code|status)|Traceback|ENOENT|EACCES|[{}\[\]]`)

// stuckFix reads why a stopped or failed task is stuck, in the first kind
// that matches.
func (a *App) stuckFix(task *store.Task) stuckFix {
	att := task.Attention()
	failed := att == protocol.Failed
	name := a.briefTitle(task.Title())
	id := task.ID
	place := task.Place()
	retry := fixButton{a.L.T("away.retry"), btnSecondary, func() { a.Retry([]string{id}) }}
	why := fixButton{a.L.T("away.why"), btnText, func() { a.OpenTask(id) }}
	goOn := func(label, words string) fixButton {
		return fixButton{label, btnSecondary, func() {
			a.send(protocol.PastContinue{T: "past_continue", TaskID: id, Words: words})
		}}
	}
	drop := fixButton{a.L.T("onhand.quiet.drop"), btnText, func() { a.TaskAction(id, "drop") }}
	// 1. It couldn't start where it was to work: the task page's own fixes.
	if k := task.Cant(); failed && k != nil {
		// D472: the page's own fixes, the real one first (cant.go);
		// 看看为什么 stays on the page.
		f := stuckFix{kind: "cant", sentence: a.cantLine(k)}
		for _, x := range a.cantFixes(k) {
			if x.act == "why" {
				continue
			}
			x, k := x, k
			f.buttons = append(f.buttons, fixButton{x.label, btnSecondary, func() { a.doCantFix(id, k, x) }})
		}
		return f
	}
	// 2. Its agent is signed out on its computer.
	if dv := a.computerOf(place.Device); dv != nil {
		for _, h := range dv.Harnesses {
			if h.Harness != task.Harness() || !h.Installed || h.LoggedIn {
				continue
			}
			comp := a.computerName(place.Device)
			if h.Harness == "pi" {
				return stuckFix{kind: "signin", sentence: a.L.T("onhand.brief.signin.pi", name, comp), line: a.L.T("onhand.stuck.signin.pi", comp), buttons: []fixButton{drop}}
			}
			d, hn := *dv, h.Harness
			return stuckFix{kind: "signin", sentence: a.L.T("onhand.brief.signin", name, harnessName(hn), comp), line: a.L.T("onhand.stuck.signin", harnessName(hn), comp), buttons: []fixButton{
				{a.L.T("onhand.brief.signin.go"), btnSecondary, func() {
					a.agentSetupReq(&d, "login", protocol.AgentSetupReq{Harness: hn})
					a.OpenDevices()
				}}, drop}}
		}
	}
	// 3. Its computer went away (never one that said it would sleep: it wakes by itself).
	if comp, ok := strings.CutPrefix(task.Reason(), "device:unreachable:"); ok {
		s, l := a.L.T("onhand.brief.offline.unknown", name, comp), a.L.T("onhand.stuck.offline.unknown", comp)
		if dv := a.computerOf(comp); dv != nil && dv.LastSeen != "" {
			s, l = a.L.T("onhand.brief.offline", name, comp, a.agoLong(dv.LastSeen)), a.L.T("onhand.stuck.offline", comp, a.agoLong(dv.LastSeen))
		}
		return stuckFix{kind: "offline", sentence: s, line: l, buttons: []fixButton{drop}}
	}
	// 4. The person's Mac without the two switches its apps need.
	if task.Card != nil && task.Card.Computing != nil {
		dev := task.Card.Computing.Device
		if dv := a.computerOf(dev); dv != nil {
			for _, ab := range dv.Abilities {
				if ab.ID == "computer" && ab.Perms != nil && (!ab.Perms.Accessibility || !ab.Perms.Screen) {
					return stuckFix{kind: "perm", sentence: a.L.T("onhand.brief.perm", name, a.computerName(dev)), line: a.L.T("onhand.stuck.perm", a.computerName(dev)), buttons: []fixButton{
						{a.L.T("onhand.brief.perm.go"), btnSecondary, func() { a.computerGrant(dev) }}, drop}}
				}
			}
		}
	}
	// 5. A phone (round 2; D471: or its own report says the phone was taken back).
	report := ""
	if r := task.Report(); r != nil {
		report = r.Summary
	}
	if !failed && (phoneTask(task) || phoneStopped.MatchString(report)) {
		return stuckFix{kind: "phone", sentence: a.L.T("onhand.brief.stopped.phone", name), line: a.L.T("onhand.stuck.phone"), buttons: []fixButton{
			goOn(a.L.T("onhand.brief.phone.go"), a.L.T("onhand.brief.phone.words")), drop}}
	}
	said := firstSentence(report, 60)
	// 6. A plain failure: its report's words; never a tool's raw output (D471).
	if failed && said == "" {
		key := "onhand.stuck.unknown"
		if rawFailure(task.Reason()) == "lock" {
			key = "onhand.stuck.lock"
		}
		return stuckFix{kind: "unknown", sentence: a.L.T("onhand.brief.failed", name, a.L.T(key)), line: a.L.T(key), buttons: []fixButton{
			{a.L.T("away.why"), btnSecondary, func() { a.OpenTask(id) }}, {a.L.T("away.retry"), btnText, func() { a.Retry([]string{id}) }}}}
	}
	if failed {
		return stuckFix{kind: "failed", sentence: a.L.T("onhand.brief.failed", name, said), line: a.L.T("onhand.stuck.failed", said), buttons: []fixButton{retry, why}}
	}
	// 7. A stop with nothing more known: what it last said is its own words (the peek's).
	// D471 round 2: said as the partner: what it knows from its last words, and the honest next step.
	line, pr := a.lastWords(report)
	words := a.L.T("onhand.quiet.go")
	if pr != "" {
		words = a.L.T("onhand.stuck.pr_ci.words", pr)
	}
	return stuckFix{kind: "stopped", sentence: a.L.T("onhand.brief.stopped", name, a.L.T("onhand.wait.unsaid")), line: line, buttons: []fixButton{
		goOn(a.L.T("onhand.quiet.go"), words), drop}}
}

var (
	prNum   = regexp.MustCompile(`(?i)\bPR\s*#(\d+)`)
	ciWords = regexp.MustCompile(`(?i)\bCI\b|checks?\b|流水线|检查`)
)

// lastWords is what a stopped task last said, in the partner's words
// (D471 round 2): a PR it opened that waited on CI, a PR it opened, else its
// last words quoted short, else that it left none.
func (a *App) lastWords(summary string) (line, pr string) {
	if m := prNum.FindStringSubmatch(summary); m != nil {
		if ciWords.MatchString(summary) {
			return a.L.T("onhand.stuck.pr_ci", m[1]), m[1]
		}
		return a.L.T("onhand.stuck.pr", m[1]), m[1]
	}
	if first := firstSentence(summary, 200); first != "" && rawFailure(first) == "" {
		return a.L.T("onhand.stuck.said", sayName(first, 40)), ""
	}
	return a.L.T("onhand.stuck.stopped"), ""
}

// clause is a fix's sentence without the task's name, for its own card.
func (f stuckFix) clause() string {
	if f.line != "" {
		return f.line
	}
	s := f.sentence
	for _, close := range []string{"」", "” "} {
		if i := strings.Index(s, close); i >= 0 && i < len(s)/2+8 {
			out := strings.TrimLeft(s[i+len(close):], "：: ")
			if out != "" && out[0] >= 'a' && out[0] <= 'z' {
				out = strings.ToUpper(out[:1]) + out[1:] // it starts the card's line
			}
			return out
		}
	}
	return s
}

// fixButtons draws a fix's buttons, at most one primary look.
func (a *App) fixButtons(c *ui.Context, key string, f stuckFix, bg ui.Color, acted *bool) {
	t := a.T
	ui.Row(c.Key(key)).Gap(t.S1).Wrap().AlignItems(ui.Center).Shrink(1).MinWidth(0).Children(func() { // D471: a second fix wraps under the first
		for _, b := range f.buttons {
			if a.button(c, b.label, b.kind, t.ControlSM, bg) {
				if acted != nil {
					*acted = true
				}
				b.do()
			}
		}
	})
}
