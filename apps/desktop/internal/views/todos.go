package views

import (
	"fmt"
	"net/url"
	"slices"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// 设置 › 待办来源 / Settings › To-do sources (D341, design/task-sources.md):
// the person's to-dos in other apps (GitHub issues and PRs assigned to them,
// Obsidian Tasks lines in a vault on the home) that a task can be bound to.
// The outside app owns what the to-do is and whether it is open; Ducter owns
// how it gets done. One raised group per source (its own mark, what it
// reads, how many are open and being done, the two choices, a problem in
// the failed ink, a quiet Remove that asks in place); then what could be
// added without asking anything, and Jira, coming soon.
//
// Elsewhere the to-do shows as one small chip (the app's mark and its
// label): in the opened task's head with its state word beside it, in an
// On hand card's foot, in New task once picked; On hand's lens lists the
// sources that have tasks under the projects.

// TabTodos is 待办来源 / To-do sources.
const TabTodos = "todos"

// The rail's art for To-do sources (D348): its own clay, a note page with one
// box ticked in mint and one still open (design/art/assets/prompts/set_todos.md).
const todosArt = "set_todos"

type todosState struct {
	removing string          // the source whose Remove asks in place
	adding   map[string]bool // "github" or a vault's folder, while its add is in flight
	pathOpen bool            // 加上一个 Obsidian 库… is open
	path     string
	addErr   string // the last add's refusal, under the folder field
	// The New task card's pick (D341): the list is open, what is typed in
	// its field, what was last asked for, and its clientId.
	pickOpen  bool
	pickQuery string
	pickSent  string
	pickID    string
	pickSeq   int
	// D345: 连上 GitHub in flight (the shared sign-in panel, in place under
	// GitHub's row), and the account it just connected as (said once).
	// D348: a source filter being typed ("id:field" to its words), saved
	// on Return or when the field is left.
	drafts    map[string]string
	login     *ntLogin
	connected string
	// 再试一次 / Try again on a source whose look failed, until the home
	// says it is looking (or the look read).
	retrying map[string]bool
}

// todosInit takes the answers to add, set and remove, once.
func (a *App) todosInit() {
	s := &a.todos
	if s.adding == nil {
		s.adding = map[string]bool{}
	}
	if s.retrying == nil {
		s.retrying = map[string]bool{}
	}
	if v := a.S.Sources; v != nil {
		for _, src := range v.Sources {
			if src.Looking || src.State != "error" {
				delete(s.retrying, src.ID)
			}
		}
	}
	for _, r := range a.S.SourceResults {
		if r.Op != "add" {
			continue
		}
		s.adding = map[string]bool{}
		switch {
		case r.OK:
			s.pathOpen, s.path, s.addErr = false, "", ""
		case r.Reason == "exists":
			s.addErr = a.L.T("todos.add.exists")
		case r.Reason == "missing":
			s.addErr = a.L.T("todos.add.missing", a.todoHome())
		case r.Reason == "no_tool" || r.Reason == "signed_out":
			s.addErr = a.L.T("todos.state."+r.Reason, a.todoHome())
		default:
			s.addErr = a.L.T("todos.state.error")
		}
	}
	a.S.SourceResults = nil
}

// todoHome is the home computer by its own name, as the sentences about
// it say it (gh and the vaults are on the home, whichever computer this is):
// the name gh was found under, else the home's name in Devices.
func (a *App) todoHome() string {
	if v := a.S.Sources; v != nil && v.Found.GitHub != nil && v.Found.GitHub.Computer != "" {
		return v.Found.GitHub.Computer
	}
	if h := a.homeDevice(); h != nil && h.Name != "" {
		return h.Name
	}
	return a.homeComputer()
}

// sourceName is a source's name: GitHub, or the vault's name.
func sourceName(s protocol.SourceView) string {
	if s.Kind == "obsidian" && s.Name != "" {
		return s.Name
	}
	return protocol.SourceKindName(s.Kind)
}

func (a *App) todosPanel(c *ui.Context) {
	t := a.T
	a.todosInit()
	a.panelHead(c, TabTodos, a.L.T("todos.lede", a.personaName()))
	// Who owns what, one small line on the lede's edge, close under it.
	ui.Text(c.Key("todos-own"), a.L.T("todos.own", a.personaName())).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted).Margin(-t.S3, 0, 0, 0)
	v := a.S.Sources
	if v == nil {
		ui.Text(c, a.L.T("todos.pick.loading")).FontSize(t.MD).TextColor(t.InkMuted).Padding(0, t.S5)
		return
	}
	if len(v.Sources) == 0 {
		a.group(c, "todos-empty", "", "", func() {
			a.tileRow(c, "todos-empty", a.clayTile(c, todosArt, true), "", a.L.T("todos.empty"), nil)
		})
	}
	for _, s := range v.Sources {
		a.todoSourceGroup(c, s)
	}
	a.todoAddGroup(c, v)
}

// todoSourceGroup is one source's raised group.
func (a *App) todoSourceGroup(c *ui.Context, s protocol.SourceView) {
	t := a.T
	name := sourceName(s)
	a.group(c, "src:"+s.ID, "", "", func() {
		sub := a.L.T("todos.github.sub.none")
		switch {
		case s.Kind == "obsidian" && s.Folder != "":
			sub = a.L.T("todos.obsidian.sub", s.Folder)
		case s.Kind == "obsidian":
			sub = a.L.T("todos.obsidian.all")
		case s.Name != "":
			sub = a.L.T("todos.github.sub", s.Name)
		}
		if s.Kind == "github" && a.todos.connected != "" {
			sub = a.L.T("todos.connected", a.todos.connected)
		}
		a.headRow(c, "src:"+s.ID, a.brandTile(c, s.Kind, s.State != "ok"), name, sub, sideMuted, func() {
			// Counted only after a look that read the list: never a 0 it didn't read.
			if s.State != "ok" || s.CheckedAt == "" {
				return
			}
			// D291: each count its own small fact.
			open := a.L.T("todos.open", fmt.Sprint(s.Open))
			if s.Open == 1 {
				open = a.L.T("todos.open.one")
			}
			ui.Text(c.Key("open"), open).FontSize(t.SM).FontWeight(600).TextColor(t.InkSoft).FontFeatures("tnum").SingleLine()
			if s.Taken > 0 {
				ui.Text(c.Key("taken"), a.L.T("todos.taken", fmt.Sprint(s.Taken))).FontSize(t.SM).FontWeight(600).TextColor(t.Working.Ink).FontFeatures("tnum").SingleLine()
			}
		})
		if s.State != "ok" {
			a.todoProblem(c, s)
			if s.Kind == "github" && a.todos.login != nil {
				a.todoLoginBlock(c, "src-login:"+s.ID)
			}
		} else if s.CheckedAt == "" {
			a.textBlock(c, "src-reading:"+s.ID, func() {
				ui.Text(c, a.L.T("todos.looking")).FontSize(t.SM).TextColor(t.InkMuted)
			})
		}
		a.textBlock(c, "src-when:"+s.ID, func() { a.todoChoices(c, s) })
		a.textBlock(c, "src-filter:"+s.ID, func() { a.todoFilters(c, s) })
		if a.todos.removing == s.ID {
			keep, rm := a.confirmRow(c, "src-remove:"+s.ID, a.L.T("todos.remove.ask", name), a.L.T("todos.remove.no"), a.L.T("todos.remove.yes"), name)
			if keep {
				a.todos.removing = ""
			}
			if rm {
				a.todos.removing = ""
				a.send(protocol.SourceRemoveReq{T: "source_remove", ID: s.ID})
			}
			return
		}
		a.footRow(c, "src-end:"+s.ID, "", func() {
			if a.quietDanger(c, "src-remove:"+s.ID, a.L.T("todos.remove"), name) {
				a.todos.removing = s.ID
			}
		})
	})
}

// todoProblem is why a source doesn't read now, in the failed ink, and the
// way to set it right where there is one.
func (a *App) todoProblem(c *ui.Context, s protocol.SourceView) {
	t := a.T
	home := a.todoHome()
	line := a.L.T("todos.read.failed", protocol.SourceKindName(s.Kind))
	switch s.State {
	case "no_tool", "signed_out", "missing":
		line = a.L.T("todos.state."+s.State, home)
	}
	if s.State == "error" {
		// A failed look says so, why (gh's own words), and 再试一次 / Try again.
		a.textBlock(c, "src-problem:"+s.ID, func() {
			ui.Column(c).Gap(t.S2).Grow(1).Children(func() {
				ui.Text(c.Key("line"), line).FontSize(t.SM).FontWeight(600).LineHeight(a.leading(1.5)).TextColor(t.Failed.Ink).Role(ui.RoleStatus)
				if s.Error != "" {
					ui.Text(c.Key("why"), s.Error).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
				}
				ui.Row(c.Key("again")).Children(func() {
					if s.Looking || a.todos.retrying[s.ID] {
						ui.Text(c, a.L.T("todos.looking")).FontSize(t.SM).TextColor(t.InkMuted)
					} else if a.buttonFor(c, a.L.T("todos.retry"), protocol.SourceKindName(s.Kind), btnSecondary, t.ControlSM, t.Surface) {
						a.todos.retrying[s.ID] = true
						a.send(protocol.SourcesReq{T: "sources"})
					}
				})
			})
		})
		return
	}
	a.textBlock(c, "src-problem:"+s.ID, func() {
		tx := ui.Text(c, line).FontSize(t.SM).FontWeight(600).LineHeight(a.leading(1.5)).TextColor(t.Failed.Ink).Role(ui.RoleStatus)
		if s.Error != "" {
			tx.Tooltip(s.Error)
		}
		if (s.State == "no_tool" || s.State == "signed_out") && a.todos.login == nil {
			ui.Row(c).Children(func() {
				if a.buttonFor(c, a.L.T("todos.signin"), "GitHub", btnSecondary, t.ControlSM, t.Surface) {
					a.startTodoLogin()
				}
			})
		}
	})
}

// todoChoices are 新的来了 / When a new one comes and 做完以后 / When it's
// done, each a segmented choice (D76) under its small title; a standing go
// says how it came under its choice.
func (a *App) todoChoices(c *ui.Context, s protocol.SourceView) {
	t := a.T
	news := []string{"tell", "take", "quiet"}
	dones := []string{"ask", "comment", "close"}
	if s.Kind == "obsidian" {
		dones = []string{"tick", "ask", "leave"}
	}
	block := func(key, title string, vals []string, cur string, prefix string, standing string, pick func(v string)) {
		labels := make([]string, len(vals))
		for i, v := range vals {
			labels[i] = a.L.T(prefix + v)
		}
		ui.Column(c.Key(key)).Gap(t.S2).Children(func() {
			ui.Text(c, title).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).LineHeight(a.leading(1.4))
			if i := a.choices(c, key+":"+s.ID, title, labels, slices.Index(vals, cur)); i >= 0 {
				pick(vals[i])
			}
			if standing != "" {
				ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
					a.glyph(c, 14, drawCheck(t.Done.Ink))
					ui.Text(c, standing).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(a.leading(1.5))
				})
			}
		})
	}
	take, write := "", ""
	if st := s.Standing; st != nil {
		if st.Take != nil && s.WhenNew == "take" {
			take = a.L.T("todos.standing")
		}
		if st.Write != nil && s.WhenDone != "ask" && s.WhenDone != "leave" {
			write = a.L.T("todos.standing.write")
		}
	}
	block("new", a.L.T("todos.new"), news, s.WhenNew, "todos.new.", take, func(v string) {
		a.setSource(s.ID, func(x *protocol.SourceView) { x.WhenNew = v })
		a.send(protocol.SourceSetReq{T: "source_set", ID: s.ID, WhenNew: v})
	})
	block("done", a.L.T("todos.done"), dones, s.WhenDone, "todos.done.", write, func(v string) {
		a.setSource(s.ID, func(x *protocol.SourceView) { x.WhenDone = v })
		a.send(protocol.SourceSetReq{T: "source_set", ID: s.ID, WhenDone: v})
	})
}

// reposOf reads "acme/web, acme/api" as owner/repo names, split at commas
// or spaces of either width; never nil, so an empty field clears them (D348).
func reposOf(text string) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, r := range strings.FieldsFunc(text, func(r rune) bool { return strings.ContainsRune(" \t\n,，、;；", r) }) {
		r = strings.TrimSuffix(strings.TrimPrefix(strings.TrimPrefix(r, "https://github.com/"), "http://github.com/"), ".git")
		if r != "" && !seen[r] {
			seen[r] = true
			out = append(out, r)
		}
	}
	return out
}

// todoFilters is which part a source reads, set here (D348): GitHub's
// repositories; a vault's folder and tag. Each is a labelled field, saved on
// Return or when it is left.
func (a *App) todoFilters(c *ui.Context, s protocol.SourceView) {
	t := a.T
	name := s.Name
	if s.Kind == "github" {
		name = "GitHub"
	}
	if a.todos.drafts == nil {
		a.todos.drafts = map[string]string{}
	}
	field := func(key, label, placeholder, hint, cur string, save func(v string)) {
		k := s.ID + ":" + key
		v, editing := a.todos.drafts[k]
		if !editing {
			v = cur
		}
		ui.Column(c.Key("filter:" + k)).Gap(6).Grow(1).MinWidth(0).Children(func() {
			ui.Text(c, label).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).AccessHidden(true)
			in := ui.TextInput(c.Key("in:"+k), &v).Placeholder(placeholder).Label(label+"，"+name).
				FontSize(t.MD).Height(44).Padding(0, t.S3).Radius(t.RadiusSM).Background(t.Surface).MinWidth(0)
			focused := in.Focused()
			edge := t.Line2
			if focused {
				edge = t.InkSoft
			}
			in.Border(1, edge)
			if hint != "" {
				ui.Text(c, hint).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(a.leading(1.5))
			}
			if focused && !in.Submitted() {
				a.todos.drafts[k] = v
				return
			}
			if editing || in.Submitted() {
				delete(a.todos.drafts, k)
				if strings.TrimSpace(v) != strings.TrimSpace(cur) {
					save(v)
				}
			}
		})
	}
	ui.Row(c).Gap(t.S3).AlignItems(ui.Start).Children(func() {
		if s.Kind == "github" {
			field("repos", a.L.T("todos.repos"), a.L.T("todos.repos.all"), a.L.T("todos.repos.hint"), strings.Join(s.Repos, ", "), func(v string) {
				repos := reposOf(v)
				a.setSource(s.ID, func(x *protocol.SourceView) { x.Repos = repos })
				a.send(protocol.SourceSetReq{T: "source_set", ID: s.ID, Repos: repos})
			})
			return
		}
		field("folder", a.L.T("todos.folder"), a.L.T("todos.folder.all"), "", s.Folder, func(v string) {
			v = strings.Trim(strings.TrimSpace(v), "/\\")
			a.setSource(s.ID, func(x *protocol.SourceView) { x.Folder = v })
			a.send(protocol.SourceSetReq{T: "source_set", ID: s.ID, Folder: &v})
		})
		field("tag", a.L.T("todos.tag"), a.L.T("todos.tag.any"), "", s.Label, func(v string) {
			v = strings.TrimSpace(v)
			a.setSource(s.ID, func(x *protocol.SourceView) { x.Label = v })
			a.send(protocol.SourceSetReq{T: "source_set", ID: s.ID, Label: &v})
		})
	})
}

// setSource changes the source here at once; the home's sources frame then
// says what it kept.
func (a *App) setSource(id string, f func(*protocol.SourceView)) {
	if v := a.S.Sources; v != nil {
		for i := range v.Sources {
			if v.Sources[i].ID == id {
				f(&v.Sources[i])
			}
		}
	}
}

// todoAddGroup is 还能加上 / You can add: GitHub when the home's gh is
// signed in and none is added, each vault Obsidian lists on the home, a
// vault by its folder, and Jira, coming soon.
func (a *App) todoAddGroup(c *ui.Context, v *protocol.SourcesView) {
	t := a.T
	s := &a.todos
	hasGitHub := false
	paths := map[string]bool{}
	for _, x := range v.Sources {
		hasGitHub = hasGitHub || x.Kind == "github"
		if x.Path != "" {
			paths[strings.TrimRight(x.Path, "/")] = true
		}
	}
	addButton := func(key, about string, send func()) func() {
		return func() {
			label := a.L.T("todos.add")
			if s.adding[key] {
				ui.Spinner(c).Size(14, 14)
			}
			if a.buttonFor(c, label, about, btnSecondary, t.ControlSM, t.Surface) && !s.adding[key] {
				s.adding[key], s.addErr = true, ""
				send()
			}
		}
	}
	a.group(c, "todos-add", a.L.T("todos.add.title"), "", func() {
		// D345: GitHub is always offered while it isn't added; 连上 signs the
		// home in (putting gh there first when it isn't) in place, under it.
		if !hasGitHub {
			gh := v.Found.GitHub
			signedIn := gh != nil && gh.State == "ok"
			sub := a.L.T("todos.github.row")
			if signedIn {
				sub = a.L.T("todos.add.github", firstNonEmpty(gh.Computer, a.todoHome()), gh.Login)
			}
			var control func()
			if s.login == nil {
				control = func() {
					if s.adding["github"] {
						ui.Spinner(c).Size(14, 14)
					}
					if a.buttonFor(c, a.L.T("todos.connect"), "GitHub", btnSecondary, t.ControlSM, t.Surface) && !s.adding["github"] {
						if signedIn {
							s.adding["github"], s.addErr = true, ""
							a.send(protocol.SourceAddReq{T: "source_add", Kind: "github"})
						} else {
							a.startTodoLogin()
						}
					}
				}
			}
			a.tileRow(c, "add-github", a.brandTile(c, "github", false), "GitHub", sub, control)
			if s.login != nil {
				a.todoLoginBlock(c, "add-github-login")
			}
		}
		for _, vault := range v.Found.Vaults {
			if paths[strings.TrimRight(vault.Path, "/")] {
				continue
			}
			p := vault.Path
			a.tileRow(c, "add-vault:"+p, a.brandTile(c, "obsidian", false), vault.Name, a.L.T("todos.add.vault"),
				addButton(p, vault.Name, func() { a.send(protocol.SourceAddReq{T: "source_add", Kind: "obsidian", Path: p}) }))
		}
		if a.addRow(c, "add-path", a.L.T("todos.add.path"), "") {
			s.pathOpen, s.addErr = !s.pathOpen, ""
		}
		if s.pathOpen {
			a.textBlock(c, "add-path-form", func() {
				ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
					in := ui.TextInput(c.Key("todo-path"), &s.path).Placeholder(a.L.T("todos.add.path.hint")).Label(a.L.T("todos.add.path")).
						FontSize(t.MD).Height(t.ControlMD).Padding(0, t.S4).Radius(t.RadiusSM).Background(t.Surface).Grow(1).MinWidth(0)
					edge := t.Line2
					if in.Focused() {
						edge = t.InkSoft
					}
					in.Border(1, edge)
					path := strings.TrimSpace(s.path)
					if a.buttonFor(c, a.L.T("todos.add.path.go"), a.L.T("todos.add.path"), btnPrimary, t.ControlMD, t.Surface) && path != "" && !s.adding[path] {
						s.adding[path], s.addErr = true, ""
						a.send(protocol.SourceAddReq{T: "source_add", Kind: "obsidian", Path: path})
					}
				})
				if s.addErr != "" {
					ui.Text(c, s.addErr).FontSize(t.SM).FontWeight(600).TextColor(t.Failed.Ink).Role(ui.RoleStatus)
				}
			})
		} else if s.addErr != "" {
			a.textBlock(c, "add-err", func() {
				ui.Text(c, s.addErr).FontSize(t.SM).FontWeight(600).TextColor(t.Failed.Ink).Role(ui.RoleStatus)
			})
		}
		a.tileRow(c, "add-jira", a.brandTile(c, "jira", true), "Jira", a.L.T("todos.jira.sub"), func() { a.quietTag(c, a.L.T("todos.soon")) })
	})
}

// todoLoginBlock is 连上 GitHub's sign-in, in place: the same panel as New
// task's, on a sunken card under the row it belongs to (D345).
func (a *App) todoLoginBlock(c *ui.Context, key string) {
	t := a.T
	g := a.todos.login
	a.textBlock(c, key, func() {
		ui.Column(c.Key(key+"-card")).Radius(t.RadiusMD).Background(t.Bg).Border(1, t.LineSoft).Padding(t.S1, 0).Children(func() {
			a.loginPanel(c, g, "todo-gh")
		})
	})
}

// ---------- the chip ----------

// todoTip is what the chip's tooltip says: the repository and number for
// GitHub, the note's path for a vault line; then its title.
func todoTip(r protocol.SourceItemRef) string {
	head := r.Label
	if r.Kind == "github" && r.Where != "" {
		head = r.Where + r.Label
	} else if r.Where != "" {
		head = r.Where
	}
	if r.Title != "" {
		return head + "\n" + r.Title
	}
	return head
}

// todoChip is a to-do as one small chip (D341): its app's mark at 16 and
// its label; pressed, it opens the to-do in its own app.
func (a *App) todoChip(c *ui.Context, key string, r protocol.SourceItemRef) {
	t := a.T
	app := protocol.SourceKindName(r.Kind)
	chip := ui.Row(c.Key("todo-chip:"+key)).Height(t.Chip+2).Padding(0, t.S2, 0, t.S1+2).Gap(t.S1 + 2).Radius(t.RadiusXS).AlignItems(ui.Center).
		Background(t.SurfaceSunken).Shrink(1).MinWidth(0).Tooltip(todoTip(r))
	if r.URL != "" {
		chip.Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(spoken(a.L, r.Label, a.L.T("todos.chip.open", app))).Focusable()
		if chip.Hovered() {
			chip.Background(t.Line)
		}
	} else {
		chip.Label(r.Label)
	}
	chip.Children(func() {
		if src := theme.Brand(r.Kind); src != nil {
			ui.Image(c, src).Size(16, 16).Shrink(0).AccessHidden(true)
		}
		ui.Text(c, r.Label).FontSize(t.SM).FontWeight(600).TextColor(t.InkSoft).SingleLine().Shrink(1).MinWidth(0).AccessHidden(true)
	})
	if r.URL != "" && chip.Clicked() {
		c.OpenURL(r.URL)
	}
}

// todoStateWord is the bound to-do's one state word beside its chip: closed
// or gone in its app, else what Ducter last wrote there; "" while it is
// simply open.
func (a *App) todoStateWord(s *protocol.TaskSource) string {
	switch s.State {
	case "closed":
		return a.L.T("todos.chip.closed")
	case "gone":
		return a.L.T("todos.chip.gone")
	}
	for i := len(s.Wrote) - 1; i >= 0; i-- {
		switch s.Wrote[i] {
		case "close":
			return a.L.T("todos.chip.closed")
		case "tick":
			return a.L.T("todos.chip.ticked")
		case "untick":
			return ""
		case "comment":
			return a.L.T("todos.chip.commented")
		}
	}
	return ""
}

// taskTodo is the to-do a task is bound to, if any.
func taskTodo(task *store.Task) *protocol.TaskSource {
	if task == nil || task.Card == nil {
		return nil
	}
	return task.Card.Source
}

// todoHead is the opened task's chip and, as its own element, its state
// word (D291).
func (a *App) todoHead(c *ui.Context, task *store.Task) {
	s := taskTodo(task)
	if s == nil {
		return
	}
	t := a.T
	a.todoChip(c, "head:"+task.ID, s.SourceItemRef)
	if w := a.todoStateWord(s); w != "" {
		ink := t.InkMuted
		if s.State == "closed" || s.State == "gone" {
			ink = t.Waiting.Ink
		}
		ui.Text(c.Key("todo-state"), w).FontSize(t.SM).FontWeight(700).TextColor(ink).SingleLine().Shrink(0)
	}
}

// ---------- On hand's lens ----------

// srcLensPrefix starts a source's lens key (src:<id>), kept in the same
// per-device lens setting as a project's.
const srcLensPrefix = "src:"

// sourceLensName is what a source's row in the lens says: GitHub, or the
// vault's name (from the sources when known, else from the to-do's own
// link: obsidian://open?vault=…).
func (a *App) sourceLensName(r protocol.SourceItemRef) string {
	if v := a.S.Sources; v != nil {
		for _, s := range v.Sources {
			if s.ID == r.Source {
				return sourceName(s)
			}
		}
	}
	if r.Kind == "obsidian" && r.URL != "" {
		if u, err := url.Parse(r.URL); err == nil {
			if v := u.Query().Get("vault"); v != "" {
				return v
			}
		}
	}
	return protocol.SourceKindName(r.Kind)
}

// sourceLensGroups are the sources that have tasks on the board, in the
// order their first task comes.
func (a *App) sourceLensGroups(b store.Board) []lensGroup {
	var out []lensGroup
	at := map[string]int{}
	for _, lane := range b.Lanes {
		for _, x := range lane {
			s := taskTodo(x)
			if s == nil || s.Source == "" {
				continue
			}
			key := srcLensPrefix + s.Source
			i, ok := at[key]
			if !ok {
				i = len(out)
				at[key] = i
				out = append(out, lensGroup{key: key, name: a.sourceLensName(s.SourceItemRef), kind: s.Kind})
			}
			out[i].tasks = append(out[i].tasks, x)
		}
	}
	return out
}

// isSourceLens says whether a lens key is a source's.
func isSourceLens(key string) bool { return strings.HasPrefix(key, srcLensPrefix) }

// ---------- New task's pick ----------

// todoPickable says whether New task offers 从待办里选: a source is added,
// or GitHub is signed in on the home.
func (a *App) todoPickable() bool {
	v := a.S.Sources
	if v == nil {
		return false
	}
	return len(v.Sources) > 0 || (v.Found.GitHub != nil && v.Found.GitHub.State == "ok")
}

// askPick asks the home for open to-dos matching what is typed.
func (a *App) askPick() {
	s := &a.todos
	a.nextClient++
	s.pickSeq++
	s.pickID = fmt.Sprintf("pick%d-%d", s.pickSeq, a.nextClient)
	s.pickSent = s.pickQuery
	a.send(protocol.SourceItemsReq{T: "source_items", Query: strings.TrimSpace(s.pickQuery), ClientID: s.pickID})
}

// todoPick is New task's 从待办里选 / Pick from your to-dos: a quiet text
// button that opens a small list (a field to find one, then the open
// to-dos, newest first); the one picked shows as its chip with 不用这件,
// and the words become its title.
func (a *App) todoPick(c *ui.Context) {
	nt := &a.nt
	s := &a.todos
	t := a.T
	if p := nt.item; p != nil {
		ui.Row(c.Key("nt-item")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			a.todoChip(c, "nt", p.SourceItemRef)
			// Its title, unless the words already say it.
			if strings.TrimSpace(nt.words) != strings.TrimSpace(p.Title) {
				ui.Text(c, keepWords(autospace(p.Title))).FontSize(t.SM).TextColor(t.InkSoft).SingleLine().Shrink(1).MinWidth(0)
			}
			if a.quietButton(c, "nt-unpick", a.L.T("todos.pick.unpick"), p.Label, false, 0) {
				if strings.TrimSpace(nt.words) == strings.TrimSpace(p.Title) {
					nt.words = ""
				}
				nt.item = nil
				nt.focus = true
			}
		})
		return
	}
	if !a.todoPickable() {
		return
	}
	ui.Column(c.Key("nt-pick")).Gap(t.S2).Children(func() {
		ui.Row(c).Children(func() {
			chev := 1
			if s.pickOpen {
				chev = 2
			}
			if a.quietButton(c, "nt-pick", a.L.T("todos.pick"), "", false, chev) {
				s.pickOpen = !s.pickOpen
				if s.pickOpen {
					s.pickQuery = ""
					a.askPick()
				}
			}
		})
		if !s.pickOpen {
			return
		}
		ui.Column(c.Key("nt-pick-list")).Gap(t.S1).Padding(t.S2).Radius(t.RadiusMD).Background(t.SurfaceSunken).Children(func() {
			in := ui.TextInput(c.Key("nt-pick-find"), &s.pickQuery).Placeholder(a.L.T("todos.pick.find")).Label(a.L.T("todos.pick")).
				FontSize(t.MD).Height(t.ControlSM+4).Padding(0, t.S3).Radius(t.RadiusSM).Background(t.Surface).Border(1, t.LineSoft)
			if in.Changed() && s.pickQuery != s.pickSent {
				a.askPick()
			}
			r := a.S.SourceItems[s.pickID]
			ui.Scroll(c.Key("nt-pick-scroll")).MaxHeight(260).Children(func() {
				ui.Column(c).Gap(2).Role(ui.RoleList).Label(a.L.T("todos.pick")).Children(func() {
					switch {
					case r == nil:
						ui.Text(c, a.L.T("todos.pick.loading")).FontSize(t.SM).TextColor(t.InkMuted).Padding(t.S2, t.S3)
					case len(r.Items) == 0:
						ui.Text(c, a.L.T("todos.pick.none")).FontSize(t.SM).TextColor(t.InkMuted).Padding(t.S2, t.S3)
					default:
						for i := range r.Items {
							if a.todoPickRow(c, &r.Items[i]) {
								a.pickTodo(r.Items[i])
							}
						}
					}
				})
			})
		})
	})
}

// todoPickRow is one open to-do in the pick: its mark, its label, its
// title, then when it is due and that a task is on it, each its own
// element (D291).
func (a *App) todoPickRow(c *ui.Context, it *protocol.SourceItem) bool {
	t := a.T
	row := ui.Row(c.Key("pick:"+it.Source+"/"+it.Ref)).MinHeight(t.ControlSM+4).Padding(t.S1+2, t.S3).Gap(t.S2 + 2).Radius(t.RadiusSM).AlignItems(ui.Center).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(spoken(a.L, it.Title, it.Label)).Focusable()
	switch {
	case row.Pressed():
		row.Background(t.Line)
	case row.Hovered():
		row.Background(t.Surface)
	}
	row.Children(func() {
		if src := theme.Brand(it.Kind); src != nil {
			ui.Image(c, src).Size(16, 16).Shrink(0).AccessHidden(true)
		}
		ui.Text(c, it.Label).FontSize(t.SM).FontWeight(600).TextColor(t.InkMuted).SingleLine().Shrink(0).MaxWidth(160).AccessHidden(true)
		ui.Text(c, keepWords(autospace(it.Title))).FontSize(t.MD).TextColor(t.Ink).SingleLine().Grow(1).Shrink(1).MinWidth(0).AccessHidden(true).Tooltip(it.Title)
		if it.Due != "" {
			ui.Text(c.Key("due"), a.L.T("todos.pick.due", it.Due)).FontSize(t.XS).FontWeight(600).TextColor(t.InkSoft).SingleLine().Shrink(0)
		}
		if it.TaskID != "" {
			ui.Text(c.Key("doing"), a.L.T("todos.pick.doing")).FontSize(t.XS).FontWeight(700).TextColor(t.Working.Ink).SingleLine().Shrink(0)
		}
	})
	return row.Clicked()
}

// pickTodo binds New task to a to-do: its words become the title (unless
// the person already wrote their own), and the list closes.
func (a *App) pickTodo(it protocol.SourceItem) {
	nt := &a.nt
	words := strings.TrimSpace(nt.words)
	if words == "" || (nt.item != nil && words == strings.TrimSpace(nt.item.Title)) {
		nt.words = it.Title
	}
	pick := it
	nt.item = &pick
	nt.err, nt.errEmpty = "", false
	a.todos.pickOpen = false
	nt.focus = true
}

// ---------- the write-back card ----------

// todoAskBody is what a card about a bound to-do shows under its question
// (D341): for a write, 会留下这段话 and the comment whole, as it goes out
// (selectable), and 然后关掉它 when it closes it too; for closed and trust,
// the to-do's chip.
func (a *App) todoAskBody(c *ui.Context, d *store.DecisionState) {
	src := d.Src
	if src == nil {
		return
	}
	t := a.T
	if src.Kind != "write" {
		ui.Row(c.Key("todo-ask-chip")).Children(func() { a.todoChip(c, "ask:"+d.DecisionID, src.Item) })
		return
	}
	ui.Column(c.Key("todo-says")).Gap(t.S2).Children(func() {
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
			ui.Text(c, a.L.T("todos.card.says")).FontSize(t.SM).FontWeight(700).TextColor(t.NeedsYou.Ink).SingleLine()
			a.todoChip(c, "ask:"+d.DecisionID, src.Item)
		})
		if src.Text != "" {
			ui.Row(c.Key("quote")).Gap(t.S3).Padding(t.S3, t.S4).Radius(t.RadiusMD).Background(t.Surface.Alpha(0.75)).Children(func() {
				ui.Box(c).Width(3).Radius(2).AlignSelf(ui.Stretch).Background(t.NeedsYou.Ink.Alpha(0.35)).Shrink(0).AccessHidden(true)
				ui.Text(c, src.Text).FontSize(t.MD).LineHeight(a.leading(1.55)).TextColor(t.Ink).Grow(1).MinWidth(0).Selectable()
			})
		}
		if src.Close {
			ui.Text(c, a.L.T("todos.card.and.close")).FontSize(t.SM).FontWeight(600).TextColor(t.NeedsYou.Ink)
		}
	})
}
