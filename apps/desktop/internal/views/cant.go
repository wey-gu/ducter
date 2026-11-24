package views

// D395, D415, D472: a task that couldn't start where it was to work. One
// source for its words and its fixes, so the opened task's page, each
// attempt in its steps and the brief on On hand say the same thing (the
// web: apps/web/src/cant.tsx).
//
// The real reason first, in the person's words, then the fix that is
// really the fix as the primary: the repository cloned onto that computer,
// a folder already on it chosen there (D455's sheet), another computer the
// work named, its agent installed or signed in there. 再试一次 is the only
// action only when nothing more is known.

import (
	"strings"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// cantLine (D415, D472) is the line, each why with the words it takes.
func (a *App) cantLine(k *protocol.CantStart) string {
	switch k.Why {
	case "away":
		return a.L.T("cant.away", k.Computer)
	case "other":
		if k.Computer == "" || k.What == "" {
			return a.L.T("cant.other_bare")
		}
		return a.L.T("cant.other", k.Computer, k.What)
	case "agent", "not_installed", "signed_out", "old", "refuses_root":
		what := k.What
		if what == "" {
			what = harnessName(k.Harness)
		}
		return a.L.T("cant."+k.Why, k.Computer, what)
	}
	return a.L.T("cant."+k.Why, k.Computer, k.What)
}

// cantClause is the line without its lead (没能开始：), for a row that
// already shows it failed.
func (a *App) cantClause(k *protocol.CantStart) string {
	l := a.cantLine(k)
	for _, sep := range []string{"：", ": "} {
		if i := strings.Index(l, sep); i > 0 {
			return strings.TrimSpace(l[i+len(sep):])
		}
	}
	return l
}

// cantFix is one fix: what it does and its label; the first is primary.
type cantFix struct {
	act    string // start_at | clone_here | clear_lock | reopen | pick | install | login | update | why
	label  string
	kind   btnKind
	device string
}

func placeWhy(why string) bool {
	return why == "no_repo" || why == "no_folder" || why == "clone_failed"
}

// cantFixes are the fixes, the real one first; 再试一次 only when it is
// honest to offer.
func (a *App) cantFixes(k *protocol.CantStart) []cantFix {
	var out []cantFix
	add := func(act, label, device string) { out = append(out, cantFix{act: act, label: label, device: device}) }
	agent := harnessName(k.Harness)
	if agent == "" {
		agent = k.What
	}
	place := placeWhy(k.Why)
	on := func() {
		if k.Elsewhere == nil {
			return
		}
		key := "cant.move"
		if place {
			key = "cant.on"
		}
		add("start_at", a.L.T(key, k.Elsewhere.Name), k.Elsewhere.Device)
	}
	switch {
	case place:
		if k.CloneHere {
			add("clone_here", a.L.T("cant.clone_to", k.Computer), "")
		}
		if k.PickHere {
			add("pick", a.L.T("cant.pick", k.Computer), "")
		}
		on()
	case k.Why == "busy":
		if k.ClearLock {
			add("clear_lock", a.L.T("cant.clear_lock"), "")
		}
		on()
	default:
		if k.Why == "not_installed" && k.Device != "" {
			add("install", a.L.T("cant.install", agent, k.Computer), "")
		}
		if k.Why == "signed_out" && k.Device != "" {
			add("login", a.L.T("cant.login", agent, k.Computer), "")
		}
		if k.Why == "old" {
			add("update", a.L.T("cant.update", k.Computer), "")
		}
		on()
		if k.CloneHere {
			add("clone_here", a.L.T("cant.clone_to", k.Computer), "")
		}
	}
	// D549: never for an agent that refuses root there: the same start fails the same way.
	if (len(out) == 0 || !place) && k.Why != "refuses_root" {
		add("reopen", a.L.T("task.action.retry"), "")
	}
	for i := range out {
		out[i].kind = btnSecondary
		if i == 0 {
			out[i].kind = btnPrimary
		}
	}
	if k.Why == "other" && k.More != "" {
		out = append(out, cantFix{act: "why", label: a.L.T("cant.why"), kind: btnText})
	}
	return out
}

// cantHint is what the primary fix does, muted under the reason.
func (a *App) cantHint(k *protocol.CantStart) string {
	switch {
	case k.Why == "busy":
		return a.L.T("cant.busy.hint")
	case placeWhy(k.Why) && k.CloneHere && k.PickHere:
		return a.L.T("cant.place.hint", k.What, k.Computer)
	case placeWhy(k.Why) && k.PickHere:
		return a.L.T("cant.pick.hint", k.Computer)
	case k.Why == "not_installed" || k.Why == "signed_out" || k.Why == "old" || k.Why == "refuses_root":
		return a.L.T("cant." + k.Why + ".hint")
	case (k.Why == "other" || k.Why == "away") && k.Elsewhere == nil:
		return a.L.T("cant.retry.hint")
	}
	return ""
}

// doCantFix does one fix (a tap on the page or in the brief).
func (a *App) doCantFix(id string, k *protocol.CantStart, f cantFix) {
	switch f.act {
	case "pick":
		a.openFolderFor(id, k.Device)
	case "install", "login":
		if dv := a.computerOf(k.Device); dv != nil {
			r := protocol.AgentSetupReq{Harness: k.Harness}
			if f.act == "install" {
				r = protocol.AgentSetupReq{Harnesses: []string{k.Harness}}
			}
			a.agentSetupReq(dv, f.act, r)
		}
		a.OpenDevices()
	case "update":
		a.OpenDevices()
	case "why":
		if a.cantOpen == nil {
			a.cantOpen = map[string]bool{}
		}
		a.cantOpen[id] = !a.cantOpen[id]
	default:
		a.CantAction(id, f.act, f.device)
	}
}

// openFolderFor (D472) opens D455's sheet on that computer: the folder
// chosen, cloned or made there is where the task starts.
func (a *App) openFolderFor(id, device string) {
	a.OpenAddFolder()
	if dv := a.computerOf(device); dv != nil {
		a.addf.device = dv.ID
	}
	a.addf.forTask = id
	a.afWay("choose")
}

// cantSend sends one can't-start action, once: a second within a moment
// (a double click, the brief and the page) is the same tap (D472; hel's
// two task_open in one second).
func (a *App) cantSend(f protocol.TaskAction) {
	now := a.Now()
	if a.cantSent == nil {
		a.cantSent = map[string]time.Time{}
	}
	if at, ok := a.cantSent[f.TaskID]; ok && now.Sub(at) < 2*time.Second {
		return
	}
	a.cantSent[f.TaskID] = now
	a.send(f)
}
