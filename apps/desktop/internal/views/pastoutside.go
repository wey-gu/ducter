package views

// D299: 也在这台电脑上 / Also on this computer. Under Past tasks' own cards,
// a quiet section of the sessions the person ran by hand in their own AI
// agents on the home (Claude Code, Codex, pi): the same card as a task's,
// its picture guessed from its words. 接着做 / Continue carries the very
// session on in a Ducter task (the same agent resumes it in its own folder);
// the ⋯ menu hands it to another agent, or stops showing that agent's
// sessions for good (shown again from the section's last line).

import (
	"fmt"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// outsideKey is an outside card's key (its focus and its pending Continue).
func outsideKey(it *protocol.OutsideItem) string { return "out:" + it.Agent + ":" + it.ID }

// pastOutside is the section: its title and count, one quiet line, the
// cards, and which agents are not shown, each with 再显示 / Show again.
func (a *App) pastOutside(c *ui.Context, res *protocol.PastFrame, terms []string) {
	t := a.T
	var hidden []string
	for _, s := range res.Sources {
		if s.Hidden {
			hidden = append(hidden, s.Agent)
		}
	}
	if len(res.Outside) == 0 && len(hidden) == 0 && a.past.outMsg == "" {
		return
	}
	ui.Column(c.Key("outside")).Gap(t.S2).Padding(t.S5, 0, 0, 0).Children(func() {
		ui.Box(c.Key("rule")).Height(1).Background(t.Line).Margin(0, t.S2, t.S2, t.S2)
		ui.Row(c.Key("head")).Gap(t.S2).AlignItems(ui.Center).MinHeight(24).Padding(t.S2, t.S2, 0, t.S2).Children(func() {
			uiText(c, a.L.T("past.out.title")).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted)
			if n := len(res.Outside); n > 0 {
				uiText(c, fmt.Sprint(n)).FontSize(t.XS).FontWeight(500).TextColor(t.Faint).FontFeatures("tnum")
			}
		})
		if len(res.Outside) > 0 {
			uiText(c.Key("sub"), a.L.T("past.out.sub", a.homeComputer())).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.55).MaxWidth(560).Padding(0, t.S2, t.S2, t.S2)
		}
		if a.past.outMsg != "" {
			uiText(c.Key("msg"), a.past.outMsg).FontSize(t.SM).TextColor(t.Failed.Ink).Padding(0, t.S2, t.S2, t.S2)
		}
		ui.Column(c.Key("cards")).Gap(t.S2 + 2).Children(func() {
			for i := range res.Outside {
				it := &res.Outside[i]
				a.outsideCard(c.Key(outsideKey(it)), it, terms)
			}
		})
		if len(hidden) > 0 {
			names := make([]string, len(hidden))
			for i, h := range hidden {
				names[i] = harnessName(h)
			}
			sep := a.L.T("past.out.sep")
			ui.Row(c.Key("hidden")).Gap(t.S3).AlignItems(ui.Center).Wrap().Padding(t.S2, t.S2, 0, t.S2).Children(func() {
				uiText(c, a.L.T("past.out.hidden", strings.Join(names, sep))).FontSize(t.SM).TextColor(t.InkMuted)
				for _, h := range hidden {
					label := a.L.T("past.out.show")
					if len(hidden) > 1 {
						label = a.L.T("past.out.show.one", harnessName(h))
					}
					if a.buttonFor(c.Key("show:"+h), label, "", btnText, t.ControlSM, t.Surface) {
						a.send(protocol.OutsideHide{T: "outside_hide", Agent: h, Hidden: false})
						a.askPast()
					}
				}
			})
		}
	})
}

// outsideCard is one session: its picture (guessed from its words), its
// name, the person's first words (or where the words matched), and one
// small line of folder, agent, branch and when, each its own word.
func (a *App) outsideCard(c *ui.Context, it *protocol.OutsideItem, terms []string) {
	t := a.T
	ps := &a.past
	key := outsideKey(it)
	focus := ps.focus == key
	busy := ps.adopting == it.Agent+":"+it.ID
	card := ui.Row(c).Gap(t.S3+2).Padding(t.S3+2, t.S4, t.S3+2, t.S3+2).Radius(t.RadiusLG - 4).AlignItems(ui.Center).
		Background(t.Surface).Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(it.Title).Focusable()
	hover := card.Hovered() || focus
	lift := float32(0)
	if hover {
		lift = 1
	}
	k := lift
	if !c.Preferences().ReduceMotion {
		k = card.AnimateTo("lift", lift, t.Snappy)
		card.Translate(0, -2*k)
	}
	card.Shadow(0, 2+5*k, 6+12*k, -2, t.Ink.Alpha(0.04+0.06*k)).Shadow(0, 2+2*k, 0, 0, t.Line)
	card.Children(func() {
		a.pastPebble(c, "art", it.Kind, "", pastPebble)
		ui.Column(c.Key("main")).Grow(1).Shrink(1).MinWidth(0).Gap(4).Children(func() {
			ink := t.Ink
			if it.Gone {
				ink = t.InkSoft
			}
			uiText(c.Key("l1"), keepWords(autospace(it.Title))).FontSize(t.MD).FontWeight(600).TextColor(ink).SingleLine().MinWidth(0).Tooltip(it.Title)
			if h := it.Hit; h != nil && a.pastSearching() && strings.TrimSpace(h.Text) != "" {
				ui.Row(c.Key("l2")).Gap(t.S2).AlignItems(ui.Center).MinWidth(0).Children(func() {
					uiText(c, a.L.T("past.hit."+pastHitKey(h.Field))).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).SingleLine().Shrink(0)
					text := strings.Join(strings.Fields(h.Text), " ")
					ui.RichText(c, a.pastMarked(text, terms, h.Field == "branch")...).SingleLine().Shrink(1).MinWidth(0).Tooltip(text)
				})
			} else if it.Ask != "" {
				uiText(c.Key("l2"), keepWords(autospace(it.Ask))).FontSize(t.SM).TextColor(t.InkSoft).SingleLine().MinWidth(0).Tooltip(it.Ask)
			}
			ui.Row(c.Key("l3")).Gap(t.S3).AlignItems(ui.Center).MinWidth(0).Children(func() {
				uiText(c.Key("proj"), it.Project).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(1).MinWidth(0).Tooltip(it.Cwd)
				uiText(c.Key("agent"), harnessName(it.Agent)).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(0)
				if it.Branch != "" {
					uiText(c.Key("branch"), it.Branch).Font(t.Mono).FontSize(t.XS - 1).TextColor(t.InkSoft).SingleLine().Shrink(1).MinWidth(0)
				}
				uiText(c.Key("when"), a.pastDate(store.ParseTime(it.UpdatedAt))).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(0)
				if it.Gone {
					uiText(c.Key("gone"), a.L.T("past.out.gone")).FontSize(t.XS).FontWeight(600).TextColor(t.InkSoft).SingleLine().Shrink(0)
				}
			})
		})
		if hover || busy {
			ui.Row(c.Key("acts")).Gap(t.S1).AlignItems(ui.Center).Shrink(0).Children(func() {
				label := a.L.T("past.continue")
				if busy {
					label = a.L.T("past.out.opening")
				}
				if !it.Gone && a.buttonFor(c, label, it.Title, btnSecondary, t.ControlSM, t.Surface) && !busy {
					a.outsideContinue(it, "")
				}
				a.outsideMore(c, it)
			})
		}
	})
	if card.Clicked() && !busy {
		ps.focus = key
		a.outsideContinue(it, "")
	}
}

// outsideMore is the card's ⋯: another agent, then stop showing this agent's sessions.
func (a *App) outsideMore(c *ui.Context, it *protocol.OutsideItem) {
	t := a.T
	b := ui.Box(c.Key("more")).Size(t.ControlSM, t.ControlSM).Radius(a.buttonRadius(t.ControlSM)).Label(a.L.T("past.out.more")).
		Tooltip(a.L.T("past.out.more")).Role(ui.RoleButton).Cursor(ui.CursorPointer).Focusable().Shrink(0)
	fg := a.buttonLook(c, b, btnText, t.ControlSM, t.Surface)
	b.Draw(drawMore(fg))
	b.Menu(func(m *ui.Menu) {
		if !it.Gone {
			m.Submenu(a.L.T("past.other.agent"), func(m *ui.Menu) {
				for _, h := range pastHarnesses {
					if h == it.Agent {
						continue
					}
					if m.Item(a.L.T("past.with", harnessName(h))).Chosen() {
						a.outsideContinue(it, h)
					}
				}
			})
			m.Separator()
		}
		if m.Item(a.L.T("past.out.hide", harnessName(it.Agent))).Chosen() {
			a.send(protocol.OutsideHide{T: "outside_hide", Agent: it.Agent, Hidden: true})
		}
		// D327: 这个文件夹别看了: its sessions go from here and from the offers, for good.
		if m.Item(a.L.T("past.out.leave")).Chosen() {
			a.send(protocol.OutsideFolder{T: "outside_folder", Path: it.Cwd, Hidden: true})
			if a.S.First != nil {
				a.S.First.OutsideFolders = append(a.S.First.OutsideFolders, it.Cwd)
			}
			a.past.outMsg = ""
			a.askPast()
		}
	})
}

// outsideContinue is 接着做 / Continue on an outside session: the home makes
// it a task (the same agent resumes it; harness set: another takes over),
// and the task opens when its answer comes (outsideAdopted).
func (a *App) outsideContinue(it *protocol.OutsideItem, harness string) {
	if it.Gone {
		a.past.outMsg = a.L.T("past.out.gone.why", it.Cwd)
		return
	}
	a.past.outMsg = ""
	a.past.adopting = it.Agent + ":" + it.ID
	a.send(protocol.OutsideContinue{T: "outside_continue", Agent: it.Agent, ID: it.ID, Harness: harness})
}

// outsideAdopted opens the task an outside session became, or says why not.
func (a *App) outsideAdopted(f *protocol.PastFrame) {
	if f == nil || a.past.adopting != f.Agent+":"+f.ID {
		return
	}
	a.past.adopting = ""
	if !f.OK || f.TaskID == "" {
		a.past.outMsg = firstNonEmpty(f.Message, a.L.T("past.out.failed"))
		return
	}
	a.OpenTask(f.TaskID)
	a.back = &returnTo{task: f.TaskID, route: RoutePast}
	a.askPast()
}
