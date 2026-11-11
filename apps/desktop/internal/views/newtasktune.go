package views

import (
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/hints"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D202 (design/new-task.md "Model and effort", "An agent on another
// computer"): 谁来做 / Who does it lists every agent on every computer, one
// row each. An agent on another computer than the folder's is "在 {computer}
// 上"; picking it switches to that repo's copy there (found by its origin,
// else by the folder's exact name when neither knows one), or opens the
// folder list on that computer's places with the agent waiting for one.
// Under the chosen agent, its 模型 / Model row (its own live list, Ducter's
// suggestion tagged 推荐) and 思考深度 / Effort row (that model's levels, its
// own default tagged 默认; none when it takes none). Picks are remembered per
// agent on this Mac.

// asAgentKey is an agent key from what was remembered (before D202 a
// candidate key, with the model after a "/").
func asAgentKey(k string) string {
	if i := strings.Index(k, "/"); i >= 0 {
		return k[:i]
	}
	return k
}

// firstPerAgent keeps the best row of each agent on each computer.
func firstPerAgent(cands []protocol.Candidate) []protocol.Candidate {
	seen := map[string]bool{}
	var out []protocol.Candidate
	for _, cd := range cands {
		k := ntKey(cd)
		if seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, cd)
	}
	return out
}

// placeComputer is the computer a folder place is on (a device id); ""
// for no folder.
func (a *App) placeComputer(p protocol.Place) string {
	if p.Kind != "repo" && p.Kind != "folder" {
		return ""
	}
	if d := a.computerOf(p.Device); d != nil {
		return d.ID
	}
	if p.Device == "" {
		return "local"
	}
	return p.Device
}

// sameRepo: two places are one repo on two computers: by origin when
// either knows one (both must, and match), else by the folder's exact name.
func sameRepo(x, y protocol.PlaceChoice) bool {
	if x.Place.Kind != "repo" || y.Place.Kind != "repo" {
		return false
	}
	if x.Remote != "" || y.Remote != "" {
		return x.Remote != "" && x.Remote == y.Remote
	}
	b := lastPath(strings.TrimRight(x.Place.RepoPath, "/"))
	return b != "" && b == lastPath(strings.TrimRight(y.Place.RepoPath, "/"))
}

// ntCopyOn is the chosen repo's copy on that computer, among the places.
func (a *App) ntCopyOn(device string, chosen protocol.PlaceChoice) *protocol.PlaceChoice {
	for _, p := range a.newTaskPlaces() {
		if a.placeComputer(p.Place) == device && sameRepo(p, chosen) {
			p := p
			return &p
		}
	}
	return nil
}

// tune is one agent's Model and Effort rows as the card shows them.
type tune struct {
	models    []protocol.ModelChoice
	model     *protocol.ModelChoice
	suggested *protocol.ModelChoice
	efforts   []string
	effort    string // "" = the model's own default (sent as nothing)
}

func hasString(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

// ntTune is the chosen model and effort of an agent: the one picked on
// this card, else the one remembered for it, else Ducter's suggestion and
// the model's own default effort.
func (a *App) ntTune(cd *protocol.Candidate) tune {
	if cd == nil || a.S.NewTaskOptions == nil {
		return tune{}
	}
	var row *protocol.AgentModels
	for i := range a.S.NewTaskOptions.Models {
		m := &a.S.NewTaskOptions.Models[i]
		if m.Harness == cd.Harness && m.Device == cd.Device {
			row = m
		}
	}
	if row == nil || len(row.Models) == 0 {
		return tune{}
	}
	kept := a.Local.NewTaskTune(cd.Harness)
	by := func(id string) *protocol.ModelChoice {
		for i := range row.Models {
			if id != "" && row.Models[i].ID == id {
				return &row.Models[i]
			}
		}
		return nil
	}
	tu := tune{models: row.Models}
	for i := range row.Models {
		if row.Models[i].Suggested {
			tu.suggested = &row.Models[i]
		}
	}
	tu.model = by(a.nt.model)
	if tu.model == nil {
		tu.model = by(kept.Model)
	}
	if tu.model == nil {
		tu.model = tu.suggested
	}
	if tu.model == nil {
		for i := range row.Models {
			if row.Models[i].Default {
				tu.model = &row.Models[i]
			}
		}
	}
	if tu.model == nil {
		return tu
	}
	tu.efforts = tu.model.Efforts
	dflt := ""
	if hasString(tu.efforts, tu.model.DefaultEffort) {
		dflt = tu.model.DefaultEffort
	}
	switch {
	case a.nt.effort == "default":
		tu.effort = dflt
	case a.nt.effort != "" && hasString(tu.efforts, a.nt.effort):
		tu.effort = a.nt.effort
	case kept.Effort != "" && hasString(tu.efforts, kept.Effort):
		tu.effort = kept.Effort
	default:
		tu.effort = dflt
	}
	return tu
}

// pickTune makes v the model (part "model") or the effort ("default": the
// model's own) and remembers both for this agent.
func (a *App) pickTune(cd protocol.Candidate, part, v string) {
	if part == "model" {
		a.nt.model, a.nt.effort = v, ""
	} else {
		a.nt.effort = v
	}
	tu := a.ntTune(&cd)
	k := hints.Tune{}
	if tu.model != nil {
		k.Model = tu.model.ID
		if tu.effort != tu.model.DefaultEffort {
			k.Effort = tu.effort
		}
	}
	a.Local.SetNewTaskTune(cd.Harness, k)
}

// effortWord is an effort level in the user's words (低 / Low …); one
// Ducter has no word for, as the agent says it.
func (a *App) effortWord(e string) string {
	k := "effort." + e
	if w := a.L.T(k); w != k {
		return w
	}
	return e
}

// whoLabel is who does it as the pill says it: "Claude Code · Opus 5.5 · 高".
func (a *App) whoLabel(cd protocol.Candidate) string {
	tu := a.ntTune(&cd)
	if len(tu.models) == 0 {
		return a.candName(cd)
	}
	parts := []string{harnessName(cd.Harness)}
	if tu.model != nil {
		parts = append(parts, tu.model.Label)
	}
	if tu.effort != "" {
		parts = append(parts, a.effortWord(tu.effort))
	}
	return strings.Join(parts, " · ")
}

// tuneIsDefault: the agent's model and effort are Ducter's suggestion and
// the model's own default (the pill's 推荐 then holds for all of it).
func (a *App) tuneIsDefault(cd protocol.Candidate) bool {
	model, effort, _ := a.ntSendTune(&cd)
	return model == "" && effort == ""
}

// ntSendTune is what the frame carries: the model and effort only when they
// differ from the suggestion and the model's own default.
func (a *App) ntSendTune(cd *protocol.Candidate) (model, effort string, has bool) {
	tu := a.ntTune(cd)
	if tu.model != nil && (tu.suggested == nil || tu.model.ID != tu.suggested.ID) {
		model = tu.model.ID
	}
	if tu.effort != "" && (tu.model == nil || tu.effort != tu.model.DefaultEffort) {
		effort = tu.effort
	}
	return model, effort, len(tu.models) > 0
}

// pickAgent is an agent picked in Who. One on another computer brings its
// computer along: No folder moves there; a repo switches to its copy there
// (with the same branch when that copy has it); else the folder list opens
// on that computer's places, the agent waiting for one.
func (a *App) pickAgent(cd protocol.Candidate, top *protocol.Candidate, away bool) {
	nt := &a.nt
	nt.whoOpen = false
	nt.model, nt.effort = "", ""
	k := ntKey(cd)
	remember := func(key string) {
		nt.pick = key
		a.Local.SetNewTaskWho(key)
	}
	if !away || cd.Device == "" {
		if top != nil && ntKey(*top) == k {
			remember("")
		} else {
			remember(k)
		}
		return
	}
	chosen := a.chosenPlace(a.newTaskPlaces())
	if chosen.Place.Kind == "none" {
		nt.computer = cd.Device
		remember(k)
		return
	}
	if cp := a.ntCopyOn(cd.Device, chosen); cp != nil {
		branch := firstNonEmpty(nt.branch, chosen.DefaultBranch)
		remember(k)
		a.pickPlace(*cp)
		if branch != "" && branch != cp.DefaultBranch && hasString(cp.Branches, branch) {
			nt.branch = branch
		}
		return
	}
	nt.pending, nt.placeOnly = k, cd.Device
	nt.shut("place")
	nt.placeOpen = true
}

// tuneRows are the Model and Effort rows under the chosen agent in Who.
func (a *App) tuneRows(c *ui.Context, cd protocol.Candidate) {
	tu := a.ntTune(&cd)
	if len(tu.models) == 0 {
		return
	}
	t := a.T
	// One row each: its name in a column of its own, the choices wrapping beside it.
	line := func(key, name string, body func()) {
		ui.Row(c.Key(key)).Gap(t.S2).AlignItems(ui.Start).Children(func() {
			ui.Text(c, name).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Width(64).Shrink(0).Padding(6, 0, 0, 0).SingleLine()
			ui.Row(c).Grow(1).MinWidth(0).Gap(t.S1 + 2).Wrap().AlignItems(ui.Center).Role(ui.RoleRadioGroup).Label(name).Children(body)
		})
	}
	ui.Column(c.Key("nt-tune")).Gap(t.S1+2).Padding(t.S1, t.S3, t.S2, 50).Children(func() {
		line("nt-models", a.L.T("newtask.model"), func() {
			for _, m := range tu.models {
				tag := ""
				if m.Suggested {
					tag = "suggested"
				}
				if a.choice(c, "nt-model:"+m.ID, m.Label, tu.model != nil && m.ID == tu.model.ID, tag) {
					a.pickTune(cd, "model", m.ID)
				}
			}
		})
		if len(tu.efforts) == 0 {
			return
		}
		line("nt-efforts", a.L.T("newtask.effort"), func() {
			if tu.model.DefaultEffort == "" && a.choice(c, "nt-effort:default", a.L.T("newtask.effort.default"), tu.effort == "", "") {
				a.pickTune(cd, "effort", "default")
			}
			for _, e := range tu.efforts {
				tag, v := "", e
				if e == tu.model.DefaultEffort {
					tag, v = "default", "default"
				}
				if a.choice(c, "nt-effort:"+e, a.effortWord(e), e == tu.effort, tag) {
					a.pickTune(cd, "effort", v)
				}
			}
		})
	})
}
