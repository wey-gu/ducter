package views

// A step in words (D152, D210): one sentence (the agent's own words for
// it when the harness carries them, its command beside them in mono), a
// probe that found nothing in neutral words. The turns are drawn in
// taskturns.go; transcript.go builds them, steps.go names the steps; keys
// are hidden in both.

import (
	"fmt"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/redact"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// goRelay is the label of a Go the user gave, from the text Ducter relays
// to the task ("User says Go: …."), or false.
func goRelay(text string) (string, bool) {
	rest, ok := strings.CutPrefix(text, "User says Go: ")
	if !ok {
		return "", false
	}
	return strings.TrimRight(strings.TrimSpace(rest), ".。"), true
}

// noteLine is a note in words: note.<say>, its name filled in (a
// computer it didn't name is said plainly; an effort in its own word).
func (a *App) noteLine(b *Block) string {
	name := b.Name
	switch b.Say {
	case "effort_dropped":
		if name != "" {
			name = a.effortWord(name)
		}
	case "offline", "back", "waiting_device":
		if name == "" {
			name = a.L.T("note.computer")
		}
	}
	key := "note." + b.Say
	if !strings.Contains(a.L.T(key), "%") {
		return a.L.T(key)
	}
	return a.L.T(key, name)
}

// tsOf is when the event with seq happened.
func (a *App) tsOf(task *store.Task, seq int64) string {
	for _, ev := range task.Events {
		if ev.Seq == seq {
			return ev.TS
		}
	}
	return ""
}

// rowWords is a step's sentence and, apart, the code it names (in mono):
// the agent's own words when its harness gave them; "没找到 nmem" for a
// probe that found nothing; "运行 nmem doctor" for a command.
func (a *App) rowWords(r *StepRow) (string, string) {
	if r.Step == nil {
		return a.L.T("step.label.thought") + " · " + r.Thought, ""
	}
	st := *r.Step
	if r.Outcome == "missing" {
		base := "step." + st.Kind
		if st.Act != "" {
			base += "." + st.Act
		}
		k := base + ".missing"
		if st.Act == "cmd" && strings.Contains(st.Target, " ") {
			k += ".some"
		}
		if v := a.L.T(k, st.Target); !strings.HasPrefix(v, "step.") {
			return v, ""
		}
		return a.L.T("step.missing"), st.Target
	}
	if st.Says != "" {
		// D210: its own words, and beside them what it ran.
		return st.Says, firstLine(unwrapShell(r.Command))
	}
	if codeLike(st) {
		return a.L.T("step.label." + st.Kind), st.Target
	}
	return a.capFirst(a.stepWords(st)), ""
}

// capFirst starts an English step on a capital: a step is its own line (D210).
func (a *App) capFirst(s string) string {
	if a.L.Lang == i18n.ZH || s == "" {
		return s
	}
	r := []rune(s)
	return strings.ToUpper(string(r[0])) + string(r[1:])
}

// stepWords is a step's summary in words: "在 Chrome 里打开 appstoreconnect.apple.com".
func (a *App) stepWords(st Step) string {
	key := "step." + st.Kind
	if st.Act != "" {
		key += "." + st.Act
	}
	if st.Kind == "edited" && st.More > 0 {
		return a.L.T("step.edited.more", st.Target, st.More)
	}
	tr := func(k string) (string, bool) {
		v := a.L.T(k)
		if v == k {
			return "", false
		}
		if strings.Contains(v, "%[") {
			v = a.L.T(k, st.Target, st.App)
		}
		return v, true
	}
	if st.App != "" {
		if v, ok := tr(key + ".app"); ok {
			return v
		}
	}
	if st.Target == "" {
		if v, ok := tr(key + ".bare"); ok {
			return v
		}
	}
	// A template that needs a target it hasn't got falls back to the bare target.
	if v, ok := tr(key); ok && (st.Target != "" || !strings.Contains(a.L.T(key), "%[1]")) {
		return v
	}
	if st.Target == "" {
		return a.L.T("step.label." + st.Kind)
	}
	return st.Target
}

// codeLike reports whether a step's summary is a code token (a command, a
// path, a pattern): it reads in mono on the inline code tint.
func codeLike(st Step) bool {
	switch st.Kind {
	case "ran", "read", "edited", "searched":
		return st.Target != "" && st.Act == ""
	}
	return false
}

// stepGlyph is a step's drawn mark, in muted ink, never on a tile (D73).
func stepGlyph(kind string) func(ui.Color) func(*ui.Painter, ui.Rect) {
	switch kind {
	case "ran":
		return drawPrompt
	case "read":
		return drawPage
	case "edited":
		return drawPencil
	case "searched":
		return drawLens
	case "browsed":
		return drawGlobe
	case "computer":
		return drawScreen
	case "waited":
		return drawClock
	case "delegated":
		return drawArrow
	}
	return drawDot
}

// shortGo is the Go button's words (D127): the action when it is a short
// verb ("好，继续" / "Continue"), else plain 好 / Go: never a sentence.
func (a *App) shortGo(label string) string {
	l := strings.TrimSpace(strings.TrimRight(strings.TrimSpace(label), ".。!！"))
	if l == "" || !shortVerb(l) {
		return a.L.T("decision.go")
	}
	if a.L.Lang != i18n.ZH {
		r := []rune(l)
		r[0] = []rune(strings.ToUpper(string(r[0])))[0]
		l = string(r)
	}
	return a.L.T("decision.go.label", l)
}

// shortVerb reports whether a Go label is short enough for a button: at
// most 6 Chinese characters, or 3 English words, and no sentence in it.
func shortVerb(l string) bool {
	if strings.ContainsAny(l, "，,；;：:。") {
		return false
	}
	han, words := 0, len(strings.Fields(l))
	for _, r := range l {
		if r >= 0x2E80 {
			han++
		}
	}
	if han > 0 {
		return han <= 6 && words <= 2
	}
	return words <= 3
}

// elapsed is a running time as a clock reads it: 4:05, 1:02:09.
func elapsed(d time.Duration) string {
	s := int(max(0, d.Seconds()))
	if s >= 3600 {
		return fmt.Sprintf("%d:%02d:%02d", s/3600, s/60%60, s%60)
	}
	return fmt.Sprintf("%d:%02d", s/60, s%60)
}

// lastAt is when the task last did anything.
func lastAt(task *store.Task) time.Time {
	for i := len(task.Events) - 1; i >= 0; i-- {
		if at := store.ParseTime(task.Events[i].TS); !at.IsZero() {
			return at
		}
	}
	return time.Time{}
}

// yourTurn: it waits on you with nothing to answer (its turn ended on a
// question in its own words, or a wait ran out): say so, never a mystery.
func (a *App) yourTurn(task *store.Task) bool {
	return task.Attention() == protocol.NeedsYou && a.S.PendingDecision(task.ID) == nil
}

// taskClock is the task's one clock (D152): how long since it started,
// ticking until it finishes; once finished, how long it took.
func (a *App) taskClock(c *ui.Context, task *store.Task) string {
	started := store.ParseTime(task.OpenedAt)
	if started.IsZero() {
		return ""
	}
	if finished(task) {
		if end := lastAt(task); end.After(started) {
			return a.L.T("task.footer.took", a.duration(end.Sub(started)))
		}
		return ""
	}
	c.After(time.Second)
	return elapsed(a.Now().Sub(started))
}

// whereLine is where it runs, in a few words: the repo and its branch, the
// folder, or the machine when it isn't this one; nothing for no place.
func (a *App) whereLine(p protocol.Place) string {
	parts := []string{}
	switch p.Kind {
	case "repo":
		if r := lastPath(p.RepoPath); r != "" {
			parts = append(parts, r)
		}
		if p.Branch != "" {
			parts = append(parts, p.Branch)
		}
	case "folder":
		if f := lastPath(p.Path); f != "" {
			parts = append(parts, f)
		}
	case "browser":
		// The persona's own profile goes unsaid (it isn't a model or a place a person picked).
		if p.Profile != "" && p.Profile != "default" {
			parts = append(parts, p.Profile)
		}
	}
	// D157: with two or more computers the computer is said apart (taskWhere),
	// on every task; with one, only a device that isn't this one.
	if p.Device != "" && p.Device != "local" && !a.manyComputers() {
		parts = append(parts, a.L.T("task.where.on", p.Device))
	}
	return strings.Join(parts, " · ")
}

// taskWho is the meta line's second half: who does it (the agent and the
// model in words; no coin at this size, D213), where, and Switch who does
// it as a small action.
func (a *App) taskWho(c *ui.Context, task *store.Task) {
	t := a.T
	who := a.bodyLine(task)
	where := a.whereLine(task.Place())
	if on, _ := a.taskWhere(task); who == "" && where == "" && on == "" {
		return
	}
	ui.Row(c.Key("who")).Gap(t.S1).AlignItems(ui.Center).MinWidth(0).Shrink(1).Children(func() {
		ui.Text(c, "·").FontSize(t.SM).TextColor(t.InkMuted)
		line := strings.Join(nonEmpty(who, where), " · ")
		tx := ui.Text(c, line).FontSize(t.SM).TextColor(t.InkMuted).MinWidth(0).Shrink(1)
		p := task.Place()
		if s := firstNonEmpty(p.RepoPath, p.Path); s != "" {
			tx.Tooltip(s)
		}
		// D157: which computer, and what it uses there; why on hover.
		if on, why := a.taskWhere(task); on != "" {
			ui.Text(c, "·").FontSize(t.SM).TextColor(t.InkMuted)
			wt := ui.Text(c.Key("where"), on).FontSize(t.SM).TextColor(t.InkMuted).MinWidth(0).Shrink(1)
			if why != "" {
				wt.Tooltip(why)
			}
		}
		if canSwitch(task) && a.quietLink(c.Key("sw"), "who:"+task.ID, a.L.T("who.switch"), a.L.T("who.switch")) {
			a.openSwitch(task.ID)
		}
	})
}

// outsideActs is what went out of the machine (D?): its commands, quiet.
func (a *App) outsideActs(c *ui.Context, task *store.Task) {
	t := a.T
	acts := task.Outside()
	if !task.HistoryLoaded || len(acts) == 0 {
		return
	}
	ui.Column(c.Key("outside")).Gap(t.S1).MaxWidth(readMeasure).Children(func() {
		ui.Text(c, a.L.T("outside.title")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted)
		for _, act := range acts {
			ui.Text(c.Key(act.Seq), redact.Text(act.Command)).Font(t.Mono).FontSize(t.MonoSM).LineHeight(1.45).TextColor(t.InkSoft).Selectable().MaxLines(3)
		}
	})
}
