package views

import (
	"math"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// What the partner thinks with, and who does the tasks (D89,
// design/ai-loadout.md). On the Partner page (D322): one story on the
// settings grid, what it thinks with, who does the tasks, and adding
// another AI; the tray of the home's AI agents lives on Devices. On a
// task: who is doing it and why, and 换谁来做 / Switch who does it.

type loadoutState struct {
	// choosing: 换一个 was pressed; the agents it could think with are listed.
	choosing bool
	// pending is a brain sent and not yet confirmed; pendingFrom the
	// settings frame it was sent against (a newer one is the server's word).
	pending     *protocol.Brain
	pendingFrom *protocol.Settings
	// switchFor is the task whose 换谁来做 is open; pick the chosen row;
	// switching the "harness/model" sent; switchMsg its outcome.
	switchFor string
	pick      string
	switching string
	switchMsg string
	switchOK  bool
	switchAt  time.Time
}

// brain is what the partner thinks with: a switch just made, else the
// server's setting, else Ducter's default (Claude Code · Opus).
func (a *App) brain() protocol.Brain {
	lo := &a.lo
	if lo.pending != nil {
		if a.S.Settings != lo.pendingFrom {
			lo.pending = nil // the server has spoken
		} else {
			return *lo.pending
		}
	}
	// D150: what it actually thinks with, as the home says (core's
	// Codex-only fallback included), before the setting.
	if bn := a.S.BrainNow; bn != nil && bn.Harness != "" {
		return bn.Brain
	}
	if st := a.S.Settings; st != nil && st.Brain != nil && st.Brain.Harness != "" {
		return *st.Brain
	}
	return protocol.Brain{Harness: "claude-code", Model: "opus"}
}

// brainHeld is D435's hold on its own agent as the home says it; nil when
// there is none.
func (a *App) brainHeld() *protocol.BrainHeld {
	if bn := a.S.BrainNow; bn != nil {
		return bn.Held
	}
	return nil
}

// heldAt is when it answers on its own agent again: "20:53" today, else
// with its day ("明天 9:00"); "" with no time known.
func (a *App) heldAt(h *protocol.BrainHeld) string {
	at := store.ParseTime(h.Until)
	if !h.ResetKnown || at.IsZero() {
		return ""
	}
	if at.Local().YearDay() == a.Now().Local().YearDay() && at.Local().Year() == a.Now().Local().Year() {
		return i18n.Clock(at)
	}
	return a.when(at)
}

// brainHeldLine is the one line under what it thinks with while its own agent
// is held (D435): who answers meanwhile and until when, or that messages
// wait and are answered then.
func (a *App) brainHeldLine(h *protocol.BrainHeld) string {
	at := a.heldAt(h)
	// D449: a free key's cap: the provider by name, its own reset and
	// the paid way, never a guessed hour.
	if h.Free != "" && at != "" && h.Why != "error" {
		name := protocol.FreeTierName(h.Free)
		switch {
		case h.Why == "rate_limited":
			return a.L.T("loadout.brain.wait.free.minute", name, at)
		case h.Waits:
			return a.L.T("loadout.brain.wait.free", name, at, a.L.T("loadout.free.more."+h.Free))
		}
		return a.L.T("loadout.brain.held.free", name, at)
	}
	if h.Waits {
		switch {
		case h.Why == "quota" && at != "":
			return a.L.T("loadout.brain.wait.quota", at)
		case h.Why == "quota":
			return a.L.T("loadout.brain.wait.quota.soon")
		case h.Why == "rate_limited":
			return a.L.T("loadout.brain.wait.throttle")
		}
		return a.L.T("loadout.brain.wait.error")
	}
	from := harnessName(h.From)
	switch {
	case h.Why == "quota" && at != "":
		return a.L.T("loadout.brain.held.quota", from, at)
	case h.Why == "quota":
		return a.L.T("loadout.brain.held.quota.soon", from)
	case h.Why == "rate_limited":
		return a.L.T("loadout.brain.held.throttle", from)
	}
	return a.L.T("loadout.brain.held.error", from)
}

// budgetLine is Settings › Partner's line on a free key (D449): about
// how many are left today, or when the provider's day is back.
func (a *App) budgetLine(b *protocol.FreeBudget) string {
	name := protocol.FreeTierName(b.Provider)
	if b.Out {
		return a.L.T("loadout.budget.out", name, a.heldAt(&protocol.BrainHeld{Until: b.ResetsAt, ResetKnown: true}))
	}
	if b.Left != nil {
		return a.L.T("loadout.budget.left", name, strconv.Itoa(*b.Left))
	}
	return a.L.T("loadout.budget.page", name)
}

// BrainMark is the one mark on Devices (D89): on the Mac Ducter runs on,
// the AI agent it thinks with says so ("Ducter 想事情用"); "" otherwise.
// The Devices stage calls it for each token.
func (a *App) BrainMark(dv *protocol.DeviceView, harness string) string {
	if dv == nil || !dv.Home || a.brain().Harness != harness {
		return ""
	}
	return a.L.T("loadout.mark", a.S.PersonaName)
}

// BrainBadge draws the mark as an icon only, so it fits any token: the
// clay partner's face in a small round badge at the bottom-right of the
// parent (a coin), with the words as its tooltip and accessible name. Put
// it inside the coin's box; it draws nothing for other tokens.
func (a *App) BrainBadge(c *ui.Context, dv *protocol.DeviceView, harness string) {
	t := a.T
	m := a.BrainMark(dv, harness)
	if m == "" {
		return
	}
	ui.Box(c.Key("brain-badge")).Absolute().Right(-6).Bottom(-6).Size(26, 26).Radius(13).Background(t.Surface).
		Shadow(0, 2, 0, 0, t.Line2).Role(ui.RoleImage).Label(m).Tooltip(m).Children(func() {
		if bmp := theme.Face(theme.Idle, 48); bmp != nil {
			ui.Image(c, bmp).Size(20, 20).Absolute().Left(3).Top(3).AccessHidden(true)
		}
	})
}

// homeName names the computer Ducter runs on inside a sentence: "this
// Mac", or the home's own name ("hel") when it lives elsewhere.
func (a *App) homeName() string {
	if home := a.homeDevice(); home != nil {
		return a.deviceNameIn(home)
	}
	if a.onThisMac() {
		return a.L.T("device.local.inline")
	}
	return hostOf(a.URL)
}

// trayHarnesses are the home's AI agents, as Devices reports them.
func (a *App) trayHarnesses() []protocol.DeviceHarness {
	if home := a.homeDevice(); home != nil {
		return home.Harnesses
	}
	return nil
}

func (a *App) trayHarness(id string) *protocol.DeviceHarness {
	hs := a.trayHarnesses()
	for i := range hs {
		if hs[i].Harness == id {
			return &hs[i]
		}
	}
	return nil
}

// taskReady: signed in and switched on for tasks.
func (a *App) taskReady(h protocol.DeviceHarness) bool {
	if !h.Installed || !h.LoggedIn {
		return false
	}
	if st := a.S.Settings; st != nil {
		if ta, ok := st.TaskAccounts[h.Harness]; ok && !ta.Enabled {
			return false
		}
	}
	return true
}

type modelChoice struct {
	id    string
	label string
	fast  bool
	// known: the tier table names it (smart or fast); def: the agent's own
	// default (D390).
	known bool
	def   bool
}

// brainModels are the models offered for what the partner thinks with: the
// home's word (settings.brainNow, D150) for the agent in use; else what the
// agent lists.
func (a *App) brainModels(b protocol.Brain, h *protocol.DeviceHarness) []modelChoice {
	if bn := a.S.BrainNow; bn != nil && bn.Harness == b.Harness {
		out := make([]modelChoice, 0, len(bn.Models))
		for _, m := range bn.Models {
			out = append(out, modelChoice{id: m.ID, label: m.Label, fast: m.Kind == "fast", known: m.Kind != "", def: m.Default})
		}
		return out
	}
	return modelChoices(h)
}

// modelChoices are the models offered for the partner on an AI agent:
// what it lists, else the two Ducter knows for Claude Code. Each is said
// in two plain words: smartest, or faster replies.
func modelChoices(h *protocol.DeviceHarness) []modelChoice {
	if h == nil {
		return nil
	}
	fast := func(id string) bool {
		s := strings.ToLower(id)
		return strings.Contains(s, "sonnet") || strings.Contains(s, "haiku") || strings.Contains(s, "mini") || strings.Contains(s, "luna") || strings.Contains(s, "flash")
	}
	if len(h.Models) > 0 {
		out := make([]modelChoice, 0, len(h.Models))
		for i, m := range h.Models {
			label := m.Label
			if label == "" {
				label = m.ID
			}
			out = append(out, modelChoice{id: m.ID, label: label, fast: i > 0 && fast(m.ID) || fast(m.ID), known: true})
		}
		return out
	}
	if h.Harness == "claude-code" {
		return []modelChoice{{id: "opus", label: "Opus", known: true}, {id: "sonnet", label: "Sonnet", fast: true, known: true}}
	}
	return nil
}

func modelLabel(h *protocol.DeviceHarness, id string) string {
	for _, m := range modelChoices(h) {
		if m.id == id {
			return m.label
		}
	}
	return prettyModel(id)
}

// prettyModel is a model's name in words when no list says it: Claude
// Code's aliases capitalised ("Opus"), an OpenAI id in its own casing
// ("gpt-6.2-sol" is "GPT-6.2-Sol", as Codex lists it); anything else as is.
func prettyModel(id string) string {
	switch id {
	case "opus", "sonnet", "haiku":
		return strings.ToUpper(id[:1]) + id[1:]
	}
	if !strings.HasPrefix(id, "gpt-") {
		return id
	}
	parts := strings.Split(id, "-")
	parts[0] = "GPT"
	for i := 1; i < len(parts); i++ {
		if p := parts[i]; p != "" && p[0] >= 'a' && p[0] <= 'z' {
			parts[i] = strings.ToUpper(p[:1]) + p[1:]
		}
	}
	return strings.Join(parts, "-")
}

// modelWord is a task's model in the words its agent lists it with: the
// agent's own list on the computer the task runs on (the New task lists,
// then that computer's account), then the home's, then prettyModel.
func (a *App) modelWord(harness, device, id string) string {
	if id == "" {
		return ""
	}
	if o := a.S.NewTaskOptions; o != nil {
		label := ""
		for _, row := range o.Models {
			if row.Harness != harness {
				continue
			}
			for _, m := range row.Models {
				if m.ID == id && m.Label != "" && (label == "" || row.Device == device) {
					label = m.Label
				}
			}
		}
		if label != "" {
			return label
		}
	}
	if d := a.computerOf(device); d != nil {
		for i := range d.Harnesses {
			if h := &d.Harnesses[i]; h.Harness == harness {
				for _, m := range h.Models {
					if m.ID == id && m.Label != "" {
						return m.Label
					}
				}
			}
		}
	}
	return modelLabel(a.trayHarness(harness), id)
}

func pct(f float64) int { return int(f*100 + 0.5) }

// brainLine: "Claude Code 的 Opus" / "Claude Code with Opus" (D296: a
// phrase, never "Claude Code · Opus").
func (a *App) brainLine(b protocol.Brain) string {
	if m := modelLabel(a.trayHarness(b.Harness), b.Model); m != "" {
		return a.L.T("loadout.brain.with", harnessName(b.Harness), m)
	}
	return harnessName(b.Harness)
}

// tokenStatus is a tray token's one line under its name.
func (a *App) tokenStatus(h protocol.DeviceHarness) string {
	switch {
	case !h.Installed:
		return a.L.T("loadout.missing")
	case h.Harness == "pi" && !h.LoggedIn:
		return a.L.T("loadout.pi")
	case !h.LoggedIn:
		return a.L.T("loadout.signed_out")
	case h.Allowance != nil:
		if h.Harness == a.brain().Harness && h.Allowance.Left <= protocol.PartnerReserve {
			return a.L.T("loadout.left.reserve", pct(h.Allowance.Left), a.S.PersonaName)
		}
		return a.L.T("loadout.left", pct(h.Allowance.Left))
	}
	return a.L.T("loadout.signed_in")
}

// arc strokes a ring from fraction f0 to f1 of a turn, clockwise from the
// top, with round ends.
func arc(p *ui.Painter, cx, cy, r, f0, f1, w float32, col ui.Color) {
	if f1-f0 <= 0.002 {
		return
	}
	var m ui.Path
	n := max(2, int((f1-f0)*96))
	for i := 0; i <= n; i++ {
		f := f0 + (f1-f0)*float32(i)/float32(n)
		ang := float64(f)*2*math.Pi - math.Pi/2
		x, y := cx+r*float32(math.Cos(ang)), cy+r*float32(math.Sin(ang))
		if i == 0 {
			m.MoveTo(x, y)
		} else {
			m.LineTo(x, y)
		}
	}
	p.StrokePath(&m, w, col)
}

// ---------- Settings › Partner, one story (D322) ----------
//
// The partner (the header), then what it thinks with (one row), who does
// the tasks (one row per signed-in AI agent, how Ducter chooses, the
// override in a task), one place to add another AI (sign in an agent or
// paste a key, with what it gains), then when a limit runs out. Coins at the
// tile size, on D289's grid; the tray stays on Devices.

// readyAgents are the home's AI agents that can do tasks now: installed and
// signed in.
func (a *App) readyAgents() []protocol.DeviceHarness {
	var out []protocol.DeviceHarness
	for _, h := range a.trayHarnesses() {
		if h.Installed && h.LoggedIn {
			out = append(out, h)
		}
	}
	return out
}

// noBrain: the home said what it has, and nothing on it can think.
func (a *App) noBrain() bool {
	hs := a.trayHarnesses()
	if len(hs) == 0 {
		return false
	}
	for _, h := range hs {
		if h.Installed && h.LoggedIn && h.CanBePartner {
			return false
		}
	}
	return true
}

// brainOthers are the signed-in agents it could think with instead.
func (a *App) brainOthers(b protocol.Brain) []protocol.DeviceHarness {
	var out []protocol.DeviceHarness
	for _, h := range a.readyAgents() {
		if h.CanBePartner && h.Harness != b.Harness {
			out = append(out, h)
		}
	}
	return out
}

// agentTile is an AI agent's coin at the tile size; off: not there yet.
func (a *App) agentTile(c *ui.Context, harness string, off bool) func() {
	return a.clayTile(c, coinArt(harness, off), off && !coinKnown(harness))
}

// limitWords is an agent's limit as one phrase, or "" when it says none.
func (a *App) limitWords(h *protocol.DeviceHarness, brain bool) string {
	if h == nil || h.Allowance == nil {
		return ""
	}
	al := h.Allowance
	if brain && al.Left <= protocol.PartnerReserve {
		return a.L.T("loadout.left.reserve", pct(al.Left), a.S.PersonaName)
	}
	if at := store.ParseTime(al.ResetsAt); !at.IsZero() {
		return a.L.T("loadout.left.back", pct(al.Left), a.when(at))
	}
	return a.L.T("loadout.left", pct(al.Left))
}

// thinksGroup is 想事情用 / What it thinks with: one row, the agent and how
// it thinks; 换一个 / Switch when another signed-in agent could, the model
// when it has more than one, and the reassurance only where a switch is
// possible.
func (a *App) thinksGroup(c *ui.Context) {
	t := a.T
	lo := &a.lo
	title := a.L.T("loadout.brain.title")
	if a.noBrain() {
		a.group(c, "brain", title, "", func() {
			a.headRow(c, "brain", nil, a.L.T("loadout.brain.none"), a.L.T("loadout.brain.none.line"), sideMuted, nil)
		})
		return
	}
	b := a.brain()
	h := a.trayHarness(b.Harness)
	others := a.brainOthers(b)
	models := a.brainModels(b, h)
	var lines []string
	// D435: its own agent held comes first, said plainly.
	held := a.brainHeld()
	if held != nil {
		lines = append(lines, a.brainHeldLine(held))
	}
	if len(models) == 0 {
		lines = append(lines, a.L.T("loadout.model.default.line"))
	}
	if st, bn := a.S.Settings, a.S.BrainNow; held == nil && st != nil && st.Brain != nil && st.Brain.Harness != "" && st.Brain.Harness != b.Harness && lo.pending == nil && bn != nil && !bn.Auto {
		// D150/D177: the person chose another, and it can't think now
		// (Auto: they never chose; the setting is only Ducter's default).
		lines = append(lines, a.L.T("loadout.brain.fallback", harnessName(st.Brain.Harness)))
	}
	if bn := a.S.BrainNow; bn != nil && bn.Budget != nil {
		// D449: on a free key, the day's readout and that results aren't
		// looked over again, instead of "paid per use".
		if held == nil || held.Free == "" {
			lines = append(lines, a.budgetLine(bn.Budget))
		}
		lines = append(lines, a.L.T("loadout.budget.look"))
	} else if h != nil && h.Billing == "usage" {
		lines = append(lines, a.L.T("loadout.brain.key"))
	} else if l := a.limitWords(h, true); l != "" && (held == nil || !held.Waits) {
		if h.Allowance.Left > protocol.PartnerReserve {
			l = a.L.T("loadout.left.kept", pct(h.Allowance.Left), a.S.PersonaName)
		}
		lines = append(lines, l)
	}
	a.group(c, "brain", title, "", func() {
		a.headRow(c, "brain", a.agentTile(c, b.Harness, false), harnessName(b.Harness), strings.Join(lines, "\n"), sideMuted, func() {
			switch {
			case lo.choosing:
				if a.button(c, a.L.T("loadout.cancel"), btnSecondary, t.ControlSM, t.Surface) {
					lo.choosing = false
				}
			case len(others) > 0:
				if a.buttonFor(c, a.L.T("loadout.switch"), title, btnSecondary, t.ControlSM, t.Surface) {
					lo.choosing = true
				}
			}
		})
		if lo.choosing {
			for _, o := range others {
				o := o
				name := harnessName(o.Harness)
				line := a.limitWords(&o, false)
				if o.Billing == "usage" {
					line = a.L.T("loadout.acct.paid.short")
				}
				a.tileRow(c, "brain-to:"+o.Harness, a.agentTile(c, o.Harness, false), name, line, func() {
					if a.buttonFor(c, a.L.T("loadout.use"), name, btnSecondary, t.ControlSM, t.Surface) {
						nb := protocol.Brain{Harness: o.Harness}
						if ms := modelChoices(&o); len(ms) > 0 {
							nb.Model = ms[0].id
						}
						lo.choosing = false
						a.setBrain(nb)
						a.say("brain", a.L.T("said.brain", name))
					}
				})
			}
		}
		if len(models) > 1 && !lo.choosing {
			sel := brainModelIndex(models, b.Model)
			labels := make([]string, len(models))
			for i, m := range models {
				labels[i] = m.label
			}
			pick := func() {
				if i := a.choices(c, "brain-model", a.L.T("loadout.brain.model"), labels, sel); i >= 0 && i != sel {
					a.setBrain(protocol.Brain{Harness: b.Harness, Model: models[i].id})
					a.say("brain", a.L.T("said.brain", a.L.T("loadout.brain.with", harnessName(b.Harness), models[i].label)))
				}
			}
			if len(models) <= 3 {
				a.tileRow(c, "brain-model", nil, a.L.T("loadout.brain.model"), a.brainModelLine(models[sel], b.Harness), pick)
			} else {
				// D445: more models than fit beside the title (Codex lists six): one pill at
				// the row's right edge opening them, as the reply language does, never a tray
				// wrapping onto a second line with one model alone on it.
				a.tileRow(c, "brain-model", nil, a.L.T("loadout.brain.model"), a.brainModelLine(models[sel], b.Harness), func() {
					if i := a.modelPill(c, labels, sel, &a.partner.modelOpen); i >= 0 {
						a.setBrain(protocol.Brain{Harness: b.Harness, Model: models[i].id})
						a.say("brain", a.L.T("said.brain", a.L.T("loadout.brain.with", harnessName(b.Harness), models[i].label)))
					}
				})
			}
		}
		if len(others) > 0 || len(models) > 1 {
			a.footRow(c, "brain", a.L.T("loadout.brain.keep"), nil)
		}
	})
	a.saidLine(c, "brain")
}

// brainModelIndex is the model in use among the choices: the one named;
// none named, the agent's own default (D390: Codex's live list says which);
// else the first.
func brainModelIndex(models []modelChoice, model string) int {
	def := -1
	for i, m := range models {
		if m.id == model && model != "" {
			return i
		}
		if m.def && def < 0 {
			def = i
		}
	}
	if def >= 0 {
		return def
	}
	return 0
}

// brainModelLine says a model in a few words: smartest or faster where
// the tier table knows it; the agent's own default said as that; else
// nothing (D390: never guessed from a live list's order).
func (a *App) brainModelLine(m modelChoice, harness string) string {
	switch {
	case m.known && m.fast:
		return a.L.T("loadout.model.line.fast", m.label)
	case m.known:
		return a.L.T("loadout.model.line.smart", m.label)
	case m.def:
		return a.L.T("loadout.model.line.default", m.label, harnessName(harness))
	}
	return ""
}

func (a *App) setBrain(b protocol.Brain) {
	lo := &a.lo
	lo.pending, lo.pendingFrom = &b, a.S.Settings
	a.SetSettings(protocol.SettingsPatch{Brain: &b})
}

// tasksGroup is 做事的 / Who does the tasks: one row per signed-in AI agent
// with how it stands, how Ducter chooses in one sentence, the person's
// rules, and that a task can switch on its own.
func (a *App) tasksGroup(c *ui.Context) {
	name := a.S.PersonaName
	ready := a.readyAgents()
	title := a.L.T("loadout.tasks.title")
	if len(ready) == 0 {
		return // 想事情用 already says nothing can; adding one is the next group
	}
	note := a.L.T("loadout.tasks.how", name)
	if len(ready) == 1 {
		note = a.L.T("loadout.tasks.only", harnessName(ready[0].Harness))
	}
	b := a.brain()
	if len(ready) == 1 && ready[0].Harness == b.Harness && len(a.S.Rules) == 0 && len(a.S.RuleDefaults) == 0 {
		// The one agent is the one it thinks with, already shown above: one line, no repeat.
		a.sectionHead(c, title, note)
		return
	}
	a.group(c, "tasks", title, note, func() {
		for _, h := range ready {
			h := h
			agent := harnessName(h.Harness)
			var lines []string
			if bn := a.S.BrainNow; h.Harness == "pi" && bn != nil && bn.Budget != nil {
				// D449: pi on the free key: its day is shared with the partner.
				lines = append(lines, a.L.T("loadout.acct.free.short"))
			} else if h.Billing == "usage" {
				lines = append(lines, a.L.T("loadout.acct.paid.short"))
			} else if l := a.limitWords(&h, h.Harness == b.Harness); l != "" {
				lines = append(lines, l)
				if h.Allowance.SharedBy > 1 {
					lines = append(lines, a.L.T("loadout.acct.shared", h.Allowance.SharedBy))
				}
			}
			if h.Harness == b.Harness && h.CanBePartner {
				lines = append(lines, a.L.T("loadout.acct.thinks"))
			}
			var control func()
			if len(ready) > 1 {
				on := a.taskReady(h)
				control = func() {
					v := on
					if a.switchControl(c, "tasks:"+h.Harness, a.L.T("loadout.acct.tasks")+", "+agent, &v) {
						if a.S.Settings != nil {
							if a.S.Settings.TaskAccounts == nil {
								a.S.Settings.TaskAccounts = map[string]protocol.TaskAccount{}
							}
							a.S.Settings.TaskAccounts[h.Harness] = protocol.TaskAccount{Enabled: v}
						}
						a.SetSettings(protocol.SettingsPatch{TaskAccounts: map[string]protocol.TaskAccount{h.Harness: {Enabled: v}}})
						if v {
							a.say("tasks", a.L.T("said.tasks.on", agent))
						} else {
							a.say("tasks", a.L.T("said.tasks.off", agent))
						}
					}
				}
			}
			a.tileRow(c, "agent:"+h.Harness, a.agentTile(c, h.Harness, false), agent, strings.Join(lines, "\n"), control)
		}
		if len(ready) < 2 && len(a.S.Rules) == 0 && len(a.S.RuleDefaults) == 0 {
			return
		}
		for _, r := range a.S.Rules {
			r := r
			line := a.L.T("loadout.rule.line")
			if r.Never {
				line = a.L.T("loadout.rule.line.never") // D372
			}
			// D372: the rule's agent on the coin column (dimmed for a never-rule), one compact row.
			var tile func()
			if r.Harness != "" {
				tile = a.agentTile(c, r.Harness, r.Never)
			}
			words := a.ruleWords(r.Text)
			a.tileRow(c, "rule:"+r.ID, tile, words, line, func() {
				if a.quietDanger(c, "rule:"+r.ID, a.L.T("loadout.rule.remove"), words) {
					a.send(protocol.RuleRemove{T: "rule_remove", ID: r.ID})
					a.say("tasks", a.L.T("loadout.rule.removed", words))
				}
			})
		}
		// D372: the built-in default per kind of work, in literal words.
		rest := ""
		for _, d := range a.S.RuleDefaults {
			if d.Work == "rest" {
				rest = a.whoName(d.Harness, d.Model)
			}
		}
		// A rule about errands (to an agent, or never one) speaks for them.
		errandRule := false
		for _, r := range a.S.Rules {
			for _, k := range r.Kinds {
				errandRule = errandRule || k == "errand"
			}
		}
		for _, d := range a.S.RuleDefaults {
			if d.Work == "errand" && errandRule {
				continue
			}
			// D507: New tasks start naming an agent speaks for the built-in default.
			if st := a.S.Settings; st != nil && st.NewTasks != nil && st.NewTasks.Agent != "" {
				continue
			}
			if d.Work == "errand" {
				a.tileRow(c, "default:errand", a.agentTile(c, d.Harness, false), a.L.T("loadout.default.errand", a.whoName(d.Harness, d.Model)), a.L.T("loadout.default.errand.line", a.padEnd(rest)), nil)
			} else {
				a.tileRow(c, "default:rest", a.agentTile(c, d.Harness, false), a.L.T("loadout.default.rest", a.whoName(d.Harness, d.Model)), a.L.T("loadout.default.rest.line"), nil)
			}
		}
		if a.addRow(c, "rule", a.L.T("loadout.rule.add", name), a.L.T("loadout.rule.add.line")) {
			a.Route = RouteConversation
			a.draft = a.L.T("loadout.rule.prefill")
			a.focusComposer = true
		}
		a.footRow(c, "tasks", a.L.T("loadout.tasks.override"), nil)
	})
	a.saidLine(c, "tasks")
}

// taskComputers are the computers that run tasks (D507): the home and the
// computers doing tasks for it, from the devices frame.
func (a *App) taskComputers() []protocol.DeviceView {
	var out []protocol.DeviceView
	for _, d := range a.S.Devices {
		if d.Kind != "phone" && (d.Home || len(d.Harnesses) > 0) {
			out = append(out, d)
		}
	}
	return out
}

// taskAgents are the AI agents signed in where tasks run, each once (the
// home's alone with one computer).
func (a *App) taskAgents() []string {
	comps := a.taskComputers()
	hs := a.readyAgents()
	if len(comps) > 1 {
		hs = nil
		for _, d := range comps {
			hs = append(hs, d.Harnesses...)
		}
	}
	seen := map[string]bool{}
	var out []string
	for _, h := range hs {
		if h.Installed && h.LoggedIn && !seen[h.Harness] {
			seen[h.Harness] = true
			out = append(out, h.Harness)
		}
	}
	return out
}

// newTasksGroup is 新任务默认 / New tasks start (D507): where every new task
// starts and who does it, set once, shown only where there is a choice (two
// computers, two agents). 自动 / Automatic is Ducter's own pick. The partner's
// new_tasks tool writes the same setting from the person's words.
func (a *App) newTasksGroup(c *ui.Context) {
	st := a.S.Settings
	if st == nil {
		return
	}
	comps := a.taskComputers()
	agents := a.taskAgents()
	var nt protocol.NewTasks
	if st.NewTasks != nil {
		nt = *st.NewTasks
	}
	idOf := func(d protocol.DeviceView) string {
		if d.Home {
			return "local"
		}
		return d.ID
	}
	whereSel, whoSel := 0, 0
	whereLabels := []string{a.L.T("newtasks.auto")}
	for i, d := range comps {
		whereLabels = append(whereLabels, d.Name)
		if nt.Where != "" && idOf(d) == nt.Where {
			whereSel = i + 1
		}
	}
	whoLabels := []string{a.L.T("newtasks.auto")}
	for i, h := range agents {
		whoLabels = append(whoLabels, harnessName(h))
		if nt.Agent == h {
			whoSel = i + 1
		}
	}
	showWhere := len(comps) > 1 || whereSel > 0
	showWho := len(agents) > 1 || whoSel > 0
	if !showWhere && !showWho {
		return
	}
	name := a.S.PersonaName
	set := func(n protocol.NewTasks) {
		v := n
		a.S.Settings.NewTasks = &v
		a.SetSettings(protocol.SettingsPatch{NewTasks: &v})
	}
	a.group(c, "newtasks", a.L.T("newtasks.title"), "", func() {
		if showWhere {
			line := a.L.T("newtasks.where.auto")
			if whereSel > 0 {
				line = a.L.T("newtasks.where.on", comps[whereSel-1].Name)
			}
			a.tileRow(c, "newtasks:where", nil, a.L.T("newtasks.where"), line, func() {
				if i := a.choices(c, "newtasks-where", a.L.T("newtasks.where"), whereLabels, whereSel); i >= 0 && i != whereSel {
					n := nt
					n.Where = ""
					said := a.L.T("said.newtasks.where.auto", name)
					if i > 0 {
						n.Where = idOf(comps[i-1])
						said = a.L.T("said.newtasks.where", comps[i-1].Name)
					}
					set(n)
					a.say("newtasks", said)
				}
			})
		}
		if showWho {
			line := a.L.T("newtasks.who.auto")
			var tile func()
			if whoSel > 0 {
				line = a.L.T("newtasks.who.on", harnessName(agents[whoSel-1]))
				tile = a.agentTile(c, agents[whoSel-1], false)
			}
			a.tileRow(c, "newtasks:who", tile, a.L.T("newtasks.who"), line, func() {
				if i := a.choices(c, "newtasks-who", a.L.T("newtasks.who"), whoLabels, whoSel); i >= 0 && i != whoSel {
					n := nt
					n.Agent = ""
					said := a.L.T("said.newtasks.who.auto", name)
					if i > 0 {
						n.Agent = agents[i-1]
						said = a.L.T("said.newtasks.who", harnessName(agents[i-1]))
					}
					set(n)
					a.say("newtasks", said)
				}
			})
		}
		a.footRow(c, "newtasks", a.L.T("newtasks.foot"), nil)
	})
	a.saidLine(c, "newtasks")
}

// addGroup is 再添一个 AI agent / Add another AI agent, said once: the
// subscription agents not signed in yet (each with its way to Devices) and a
// pasted key, under one line of what another one would give.
func (a *App) addGroup(c *ui.Context) {
	t := a.T
	k := &a.kp
	name := a.S.PersonaName
	hs := a.trayHarnesses()
	if len(hs) == 0 && a.S.Settings == nil {
		return
	}
	note, title := a.L.T("loadout.add.more", name), a.L.T("loadout.add.title")
	switch len(a.readyAgents()) {
	case 0:
		// Nothing to add "another" to yet: the first one is just "an AI agent".
		note, title = a.L.T("loadout.add.none", name), a.L.T("loadout.add.title.first")
	case 1:
		note = a.L.T("loadout.add.one", name)
	}
	a.group(c, "add", title, note, func() {
		for _, h := range hs {
			h := h
			if h.LoggedIn || (h.Harness != "claude-code" && h.Harness != "codex") {
				continue
			}
			agent := harnessName(h.Harness)
			line, label := a.L.T("loadout.add.install"), a.L.T("loadout.add.install.go")
			if h.Installed {
				line, label = a.L.T("loadout.add.signin", a.homeName()), a.L.T("loadout.add.signin.go")
			}
			a.tileRow(c, "add:"+h.Harness, a.agentTile(c, h.Harness, true), agent, line, func() {
				if a.buttonFor(c, label, agent, btnSecondary, t.ControlSM, t.Surface) {
					a.OpenDevices()
					if accountCheck(h.Harness) != "" {
						a.devState().account = h.Harness
					}
				}
			})
		}
		key := a.markTile(c, "key", drawKeyMark(t.InkSoft))
		if !k.setOpen["settings"] {
			a.tileRow(c, "apikey", key, a.L.T("key.settings.row"), a.L.T("key.paste.instead.note"), func() {
				if a.button(c, a.L.T("key.paste.check.open"), btnSecondary, t.ControlSM, t.Surface) {
					a.openKeyRow("settings")
				}
			})
			return
		}
		a.tileRow(c, "apikey", key, a.L.T("key.settings.row"), "", func() {
			if a.button(c, a.L.T("key.paste.back"), btnSecondary, t.ControlSM, t.Surface) {
				k.setOpen["settings"] = false
			}
		})
		a.textBlock(c, "apikey-card", func() {
			a.keyCardIn(c, func(key string) {
				a.sendKey(key)
				k.from = "settings"
			}, "settings")
		})
	})
}

// drawKeyMark is a key drawn to fill a 40 tile: a ring and a bit.
func drawKeyMark(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		m.Circle(cx-5, cy, 5)
		m.MoveTo(cx, cy)
		m.LineTo(cx+11, cy)
		m.MoveTo(cx+7, cy)
		m.LineTo(cx+7, cy+4.5)
		m.MoveTo(cx+10.5, cy)
		m.LineTo(cx+10.5, cy+3.5)
		p.StrokePath(&m, 2.2, col)
	}
}

// ---------- on a task: who is doing it, why, and switching ----------

// whoLine is who does a task, in words ("Codex · gpt-5"), and why when it
// isn't Ducter's plain pick.
func (a *App) whoLine(task *store.Task) (who, why string) {
	who = a.bodyLine(task)
	w := task.Who()
	if w == nil {
		return who, ""
	}
	// D507: New tasks start named the agent (or one that couldn't take it here).
	if w.Why.RuleID == "new_tasks" {
		if w.Why.Kind == "rule" {
			return who, a.L.T("who.why.newtasks")
		}
		return who, a.L.T("who.why.newtasks.away", harnessName(w.Why.From))
	}
	switch w.Why.Kind {
	case "rule":
		if w.Why.Text != "" {
			why = a.L.T("who.why.rule", w.Why.Text)
		}
	case "said": // D379
		if w.Why.Text != "" {
			why = a.L.T("who.why.said", w.Why.Text)
		}
	case "limit", "unavailable":
		if w.Why.RuleID != "" {
			why = a.L.T("who.why.limit.rule", harnessName(w.Why.From))
		} else if w.Why.From != "" {
			why = a.L.T("who.why."+w.Why.Kind, harnessName(w.Why.From))
		}
	case "you":
		why = a.L.T("who.why.you")
	case "kind": // D372
		why = a.L.T("who.why.kind")
	case "retry":
		if w.Why.From != "" {
			k := "who.why.retry"
			if w.Why.Stalled {
				k = "who.why.retry.stalled"
			}
			why = a.L.T(k, a.padEnd(a.whoName(w.Why.From, w.Why.FromModel)))
		}
	}
	return who, why
}

// padEnd is a name before Chinese words: a space only after a Latin end
// ("Codex 留给", "（Opus）留给"; D372).
func (a *App) padEnd(s string) string {
	if !a.L.Han() || s == "" || s[len(s)-1] >= 0x80 {
		return s
	}
	return s + " "
}

// whoName is an agent and its model inside a sentence ("Claude Code（Sonnet）"),
// never joined by a dot (D291).
// ruleWords is a rule as the partner wrote it ("后端的事 → Codex") with its
// arrow said in words (D500: no text arrows on screen): 后端的事：Codex.
func (a *App) ruleWords(text string) string {
	sep := a.L.T("loadout.rule.arrow")
	parts := strings.Split(text, "→")
	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
	}
	return strings.Join(parts, sep)
}

func (a *App) whoName(h, m string) string {
	if m == "" {
		return harnessName(h)
	}
	return a.L.T("who.name", harnessName(h), a.modelWord(h, "", m))
}

// canSwitch: the task can still move to another AI agent.
func canSwitch(task *store.Task) bool {
	switch task.Attention() {
	case protocol.Dropped, protocol.Superseded:
		return false
	}
	return task.Harness() != ""
}

// openSwitch opens 换谁来做 / Switch who does it for a task, asking who
// could do it.
func (a *App) openSwitch(id string) {
	lo := &a.lo
	if lo.switchFor == id {
		lo.switchFor = ""
		return
	}
	lo.switchFor, lo.pick, lo.switchMsg = id, "", ""
	a.send(protocol.CandidatesReq{T: "candidates", TaskID: id})
	// D282: and the agents' own model lists, for the in-place model and effort rows.
	a.send(protocol.TaskNewOptions{T: "task_new_options"})
}

// tuneInPlace is the model and effort of the agent doing the task, changed
// in place (D282): a pick goes at once, and the agent's own session carries
// on with it from its next turn. Only where the agent lists its own models.
func (a *App) tuneInPlace(c *ui.Context, task *store.Task, device string) {
	models, model, effort, ok := a.liveTune(task, device)
	if !ok {
		return
	}
	h := task.Harness()
	a.switchTuneRows(c, h, models, model, effort, func(m, e string) {
		a.send(protocol.TaskSwitch{T: "task_switch", TaskID: task.ID, Harness: h, Model: m, Effort: e})
	})
}

// liveTune is the doing agent's own live model list on that computer (D282,
// D352), the model it is on (always in the list, even past the row's first
// few) and the effort it runs at (its own, else the model's default). ok is
// false where the agent lists no models of its own: nothing to switch in place.
func (a *App) liveTune(task *store.Task, device string) (models []protocol.ModelChoice, model *protocol.ModelChoice, effort string, ok bool) {
	if a.S.NewTaskOptions == nil {
		return nil, nil, "", false
	}
	h := task.Harness()
	var row *protocol.AgentModels
	for i := range a.S.NewTaskOptions.Models {
		m := &a.S.NewTaskOptions.Models[i]
		if m.Harness == h && (row == nil || m.Device == device) {
			row = m
		}
	}
	if row == nil || len(row.Models) == 0 || row.From != "live" {
		return nil, nil, "", false
	}
	// D352: the model it's on is always a chip, even one past the row's first few.
	models = row.Models
	if now := task.Model(); now != "" && !slices.ContainsFunc(models, func(m protocol.ModelChoice) bool { return m.ID == now }) {
		models = append(slices.Clone(models), protocol.ModelChoice{ID: now, Label: a.modelWord(h, task.Place().Device, now)})
	}
	for i := range models {
		if m := &models[i]; (task.Model() != "" && m.ID == task.Model()) || (task.Model() == "" && m.Default) {
			model = m
		}
	}
	effort = task.Effort()
	if effort == "" && model != nil {
		effort = model.DefaultEffort
	}
	return models, model, effort, true
}

// switchTuneRows is 换谁来做's in-place Model and Effort rows of chips.
func (a *App) switchTuneRows(c *ui.Context, h string, models []protocol.ModelChoice, model *protocol.ModelChoice, effort string, pick func(m, e string)) {
	t := a.T
	line := func(key, name string, body func()) {
		ui.Row(c.Key(key)).Gap(t.S2).AlignItems(ui.Start).Children(func() {
			uiText(c, name).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Width(64).Shrink(0).Padding(6, 0, 0, 0).SingleLine()
			ui.Row(c).Grow(1).MinWidth(0).Gap(t.S1 + 2).Wrap().AlignItems(ui.Center).Role(ui.RoleRadioGroup).Label(name).Children(body)
		})
	}
	ui.Column(c.Key("switch-tune")).Gap(t.S1 + 2).Children(func() {
		line("sw-models", a.L.T("newtask.model"), func() {
			for _, m := range models {
				on := model != nil && m.ID == model.ID
				if a.choice(c, "sw-model:"+m.ID, m.Label, on, "") && !on {
					pick(m.ID, "")
				}
			}
		})
		if model != nil && len(model.Efforts) > 0 {
			line("sw-efforts", a.L.T("newtask.effort"), func() {
				for _, e := range model.Efforts {
					tag := ""
					if e == model.DefaultEffort {
						tag = "default"
					}
					if a.choice(c, "sw-effort:"+e, a.effortWord(e), e == effort, tag) && e != effort {
						pick(model.ID, e)
					}
				}
			})
		}
		a.note(c, a.L.T("switch.tune.note", harnessName(h)))
	})
}

func candKey(cd protocol.Candidate) string { return cd.Harness + "/" + cd.Model }

// candName is "Claude Code 的 Opus" / "Claude Code with Opus" (D296: a phrase).
func (a *App) candName(cd protocol.Candidate) string {
	if cd.Model != "" {
		return a.L.T("loadout.brain.with", harnessName(cd.Harness), a.modelWord(cd.Harness, cd.Device, cd.Model))
	}
	return harnessName(cd.Harness)
}

// candReason is a row's why, then its limit.
func (a *App) candReason(cd protocol.Candidate) string {
	parts := []string{}
	switch cd.Blocked {
	case "":
	case "reserve":
		parts = append(parts, a.L.T("cand.reserve", a.S.PersonaName))
		if at := store.ParseTime(cd.ResetsAt); !at.IsZero() {
			parts = append(parts, a.L.T("cand.resets", a.when(at)))
		}
		return strings.Join(parts, a.L.T("phrase.sep"))
	default:
		return a.L.T("cand." + cd.Blocked)
	}
	switch cd.Reason.Kind {
	case "rule":
		parts = append(parts, a.L.T("cand.rule"))
	case "fit":
		parts = append(parts, a.L.T("cand.fit"))
	case "fast":
		parts = append(parts, a.L.T("cand.fast"))
	}
	if cd.Left != nil {
		parts = append(parts, a.L.T("cand.left", pct(*cd.Left)))
	}
	if cd.Billing == "usage" {
		parts = append(parts, a.L.T("cand.paid"))
	}
	// D296: one phrase, its facts in a sentence, never joined with a dot.
	return strings.Join(parts, a.L.T("phrase.sep"))
}

// drainSwitch takes the server's answer to a switch.
func (a *App) drainSwitch() {
	lo := &a.lo
	res := a.S.SwitchResults
	a.S.SwitchResults = nil
	for _, r := range res {
		if r.TaskID != lo.switchFor && lo.switchFor != "" {
			continue
		}
		to := lo.switching
		lo.switching = ""
		if r.OK && to == "" {
			// D354: a model or effort in place, nothing named as switching: its
			// own quiet line says it, never "Continued on" with no one.
			continue
		}
		lo.switchAt = a.Now()
		lo.switchOK = r.OK
		if r.OK {
			lo.switchMsg = a.L.T("who.done", to)
			lo.switchFor = ""
		} else {
			lo.switchMsg = a.L.T("who.failed", r.Message)
		}
	}
}

// switchSheet is 换谁来做 / Switch who does it: who does it now, the top
// three others with why and the limit each, the ones that can't greyed
// with why, and 换到 X 接着做 / Continue on X.
func (a *App) switchSheet(c *ui.Context, task *store.Task) {
	t := a.T
	lo := &a.lo
	a.drainSwitch()
	if lo.switchMsg != "" && a.Now().Sub(lo.switchAt) < 6*time.Second && (lo.switchFor == "" || lo.switchFor == task.ID) {
		c.After(6*time.Second - a.Now().Sub(lo.switchAt))
		tone := noticeDone
		if !lo.switchOK {
			tone = noticeAlert
		}
		a.notice(c, "switch-said", tone, func() {
			if lo.switchOK {
				a.glyph(c, 22, drawCheck(t.Done.Ink))
			}
		}, func() {
			uiText(c, lo.switchMsg).FontSize(t.SM).FontWeight(700).MaxLines(2)
		}, nil)
	}
	if lo.switchFor != task.ID {
		return
	}
	cands, asked := a.S.Candidates[task.ID]
	running := task.Attention() == protocol.Working || task.Attention() == protocol.Queued
	sheet := ui.Column(c.Key("switch-sheet")).Gap(t.S3).Padding(t.S4, t.S5).Radius(t.RadiusLG).Background(t.Surface).
		Shadow(0, t.Raised.Y, 0, 0, t.Raised.Color).Role(ui.RoleDialog).Label(a.L.T("who.switch"))
	a.enter(c, sheet)
	sheet.Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(func() {
				a.heading(c, a.L.T("who.switch"), t.LG)
				// D161 (6): with two or more computers the sheet says it covers where too.
				if a.manyComputers() {
					uiText(c, a.L.T("switch.sub")).FontSize(t.SM).TextColor(t.InkMuted)
				}
			})
			if a.button(c, a.L.T("loadout.cancel"), btnText, t.ControlSM, t.Surface) {
				lo.switchFor = ""
			}
		})
		// D282: the same agent, another model or effort, in place.
		curDev := ""
		for _, cd := range cands {
			if cd.Current {
				curDev = cd.Device
			}
		}
		a.tuneInPlace(c, task, curDev)
		if running {
			a.note(c, a.L.T("who.switch.note"))
		} else {
			a.note(c, a.L.T("who.switch.note.idle"))
		}
		if !asked {
			a.note(c, a.L.T("who.loading"))
			return
		}
		free := 0
		var chosen *protocol.Candidate
		// D157: two or more computers: who and where together (where.md §6.2).
		multi := whereRows(cands)
		if multi {
			a.islandStrip(c, task, cands, &lo.pick)
		}
		ui.Column(c).Gap(t.S2).Children(func() {
			order, by := groupCands(cands)
			if !multi {
				order, by = []string{""}, map[string][]int{"": nil}
				for i := range cands {
					by[""] = append(by[""], i)
				}
			}
			for _, dev := range order {
				if multi {
					dv := a.computerOf(dev)
					name := dev
					if dv != nil {
						name = dv.Name
					}
					// D161 (9): a group head is the device's mini card: its clay, its name, its state.
					ui.Row(c.Key("grp:"+dev)).Gap(t.S2).Padding(t.S2, t.S2, 0, t.S1).AlignItems(ui.Center).Children(func() {
						if dv != nil {
							a.deviceClay(c, "grp:"+dev, dv).Size(36, 28).Shrink(0)
						}
						uiText(c, name).FontSize(t.MD).FontWeight(800).TextColor(t.Ink)
						if s := a.computerState(dv); s != "" {
							ink := t.InkMuted
							if dv != nil && dv.State == protocol.DeviceAsleep {
								ink = t.Asleep.Ink
							}
							uiText(c, s).FontSize(t.SM).TextColor(ink) // its own element (D296)
						}
					})
				}
				for _, i := range by[dev] {
					cd := cands[i]
					key := candKey(cd)
					if multi {
						key = candKeyOn(cd)
					}
					off := cd.Blocked != ""
					if !off && !cd.Current {
						free++
					}
					on := lo.pick == key && !off && !cd.Current
					if on {
						chosen = &cands[i]
					}
					name := a.candName(cd)
					reason := a.candReason(cd)
					if r := a.whereCandReason(cd); r != "" {
						reason = r
					}
					if a.candRow(c, key, cd.Harness, name, reason, off, cd.Current, on) {
						lo.pick = key
					}
				}
			}
		})
		if free == 0 {
			a.note(c, a.L.T("cand.none"))
			return
		}
		if chosen == nil {
			return
		}
		// D157: another computer: what moving does, then 换到 {device} 上接着做.
		cur := ""
		for _, cd := range cands {
			if cd.Current {
				cur = cd.Device
			}
		}
		moving := multi && chosen.Device != "" && chosen.Device != cur
		if moving {
			a.moveLines(c, task, *chosen)
		}
		ui.Row(c).Children(func() {
			label := a.L.T("who.go", a.candName(*chosen))
			if moving {
				label = a.L.T("switch.move.go", chosen.DeviceName)
			}
			if lo.switching != "" {
				uiText(c, label+"…").FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted)
				return
			}
			if a.buttonFor(c, label, task.Title(), btnPrimary, t.ControlMD, t.Surface) {
				lo.switching = a.candName(*chosen)
				sw := protocol.TaskSwitch{T: "task_switch", TaskID: task.ID, Harness: chosen.Harness, Model: chosen.Model}
				if moving {
					sw.Device = chosen.Device
				}
				a.send(sw)
			}
		})
	})
}

// whoSentence is who does a task and why, as one sentence for Details:
// "Codex is doing it, because Claude Code's limit is low."
func (a *App) whoSentence(task *store.Task) string {
	who := a.bodyLine(task)
	if who == "" {
		return ""
	}
	w := task.Who()
	if w == nil {
		return a.L.T("who.sentence", who)
	}
	if w.Why.RuleID == "new_tasks" { // D507
		if w.Why.Kind == "rule" {
			return a.L.T("who.sentence.newtasks", who)
		}
		return a.L.T("who.sentence.newtasks.away", who, harnessName(w.Why.From))
	}
	switch w.Why.Kind {
	case "rule":
		if w.Why.Text != "" {
			return a.L.T("who.sentence.rule", who, w.Why.Text)
		}
	case "said": // D379
		if w.Why.Text != "" {
			return a.L.T("who.sentence.said", who, w.Why.Text)
		}
	case "limit", "unavailable":
		if w.Why.RuleID != "" {
			return a.L.T("who.sentence.limit.rule", who, harnessName(w.Why.From))
		}
		if w.Why.From != "" {
			return a.L.T("who.sentence."+w.Why.Kind, who, harnessName(w.Why.From))
		}
	case "you":
		return a.L.T("who.sentence.you", who)
	case "default":
		return a.L.T("who.sentence.default", who, a.S.PersonaName)
	case "kind": // D372
		if w.Why.Keeps != nil {
			return a.L.T("who.sentence.kind", who, a.padEnd(a.whoName(w.Why.Keeps.Harness, w.Why.Keeps.Model)))
		}
	case "retry":
		if w.Why.From != "" {
			k := "who.sentence.retry"
			if w.Why.Stalled {
				k = "who.sentence.retry.stalled"
			}
			return a.L.T(k, who, a.padEnd(a.whoName(w.Why.From, w.Why.FromModel)))
		}
	}
	return a.L.T("who.sentence", who)
}
