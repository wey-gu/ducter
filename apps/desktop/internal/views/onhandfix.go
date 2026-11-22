package views

// D467 round 4: the real fix for each way a task gets stuck, said by the
// partner in one sentence with the button that does it, from what Ducter
// already knows: why it couldn't start (D395, D415), an agent signed out on
// its computer (D363's sign-in), a computer gone away (D157), the person's
// Mac without its two switches (D235), a phone (D238), a plain failure
// (D454). The brief says it; a card the brief has no room for says the
// same. The web does the same (apps/web/src/onhand-brief.tsx).

import (
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
	kind     string // cant | signin | offline | perm | phone | failed | stopped
	sentence string
	buttons  []fixButton
}

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
				return stuckFix{kind: "signin", sentence: a.L.T("onhand.brief.signin.pi", name, comp), buttons: []fixButton{drop}}
			}
			d, hn := *dv, h.Harness
			return stuckFix{kind: "signin", sentence: a.L.T("onhand.brief.signin", name, harnessName(hn), comp), buttons: []fixButton{
				{a.L.T("onhand.brief.signin.go"), btnSecondary, func() {
					a.agentSetupReq(&d, "login", protocol.AgentSetupReq{Harness: hn})
					a.OpenDevices()
				}}, drop}}
		}
	}
	// 3. Its computer went away (never one that said it would sleep: it wakes by itself).
	if comp, ok := strings.CutPrefix(task.Reason(), "device:unreachable:"); ok {
		s := a.L.T("onhand.brief.offline.unknown", name, comp)
		if dv := a.computerOf(comp); dv != nil && dv.LastSeen != "" {
			s = a.L.T("onhand.brief.offline", name, comp, a.agoLong(dv.LastSeen))
		}
		return stuckFix{kind: "offline", sentence: s, buttons: []fixButton{drop}}
	}
	// 4. The person's Mac without the two switches its apps need.
	if task.Card != nil && task.Card.Computing != nil {
		dev := task.Card.Computing.Device
		if dv := a.computerOf(dev); dv != nil {
			for _, ab := range dv.Abilities {
				if ab.ID == "computer" && ab.Perms != nil && (!ab.Perms.Accessibility || !ab.Perms.Screen) {
					return stuckFix{kind: "perm", sentence: a.L.T("onhand.brief.perm", name, a.computerName(dev)), buttons: []fixButton{
						{a.L.T("onhand.brief.perm.go"), btnSecondary, func() { a.computerGrant(dev) }}, drop}}
				}
			}
		}
	}
	// 5. A phone (round 2).
	if !failed && phoneTask(task) {
		return stuckFix{kind: "phone", sentence: a.L.T("onhand.brief.stopped.phone", name), buttons: []fixButton{
			goOn(a.L.T("onhand.brief.phone.go"), a.L.T("onhand.brief.phone.words")), drop}}
	}
	said := ""
	if r := task.Report(); r != nil {
		said = firstSentence(r.Summary, 60)
	}
	if said == "" {
		said = a.L.T("onhand.wait.unsaid")
	}
	// 6. A plain failure, or a stop with nothing more known.
	if failed {
		return stuckFix{kind: "failed", sentence: a.L.T("onhand.brief.failed", name, said), buttons: []fixButton{retry, why}}
	}
	return stuckFix{kind: "stopped", sentence: a.L.T("onhand.brief.stopped", name, said), buttons: []fixButton{
		goOn(a.L.T("onhand.quiet.go"), a.L.T("onhand.quiet.go")), drop}}
}

// clause is a fix's sentence without the task's name, for its own card.
func (f stuckFix) clause() string {
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
	ui.Row(c.Key(key)).Gap(t.S1).AlignItems(ui.Center).Shrink(0).Children(func() {
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

// limitLines are the waits on an agent's limit (D297), one line per agent:
// who, when it resets, that it carries on by itself, and its hand-off when
// another agent could take it now.
type limitLine struct {
	harness  string
	sentence string
	handTo   string
	waiters  []string
	tasks    []string
}

func (a *App) limitLines(b store.Board) []limitLine {
	var out []limitLine
	at := map[string]int{}
	for _, x := range b.Lanes[store.LaneWaiting] {
		w := a.S.WaiterFor(x.ID)
		if w == nil || w.Limit == nil {
			continue
		}
		i, ok := at[w.Limit.Harness]
		if !ok {
			i = len(out)
			at[w.Limit.Harness] = i
			out = append(out, limitLine{harness: w.Limit.Harness})
		}
		l := &out[i]
		l.waiters = append(l.waiters, w.WaiterID)
		l.tasks = append(l.tasks, x.ID)
		if w.Limit.HandTo != nil && l.handTo == "" {
			l.handTo = w.Limit.HandTo.Harness
		}
		when := a.soon(a.limitAt(w))
		if len(l.tasks) == 1 {
			l.sentence = a.L.T("onhand.brief.limit", a.briefTitle(x.Title()), harnessName(w.Limit.Harness), a.pad(when))
		} else {
			l.sentence = a.L.T("onhand.brief.limit.many", len(l.tasks), harnessName(w.Limit.Harness), a.pad(when))
		}
		l.sentence = strings.ReplaceAll(l.sentence, "  ", " ")
	}
	return out
}
