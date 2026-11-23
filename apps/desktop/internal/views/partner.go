package views

import (
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/lang"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// Settings › 伙伴 / Partner (D150, after D71), and its two neighbours,
// 通知 / Notifications and 账号 / Accounts. One calm header (the clay
// partner, its name renamed in place, where it lives and what it thinks
// with in one line), then single-column groups: what it thinks with, who
// does the tasks, how it talks, what it does on its own or asks you first
// (what it remembers is Settings › 记忆, D257). Everything here is the partner's and lives on the
// server (the settings frame), so the phone shows the same.

type partnerState struct {
	editing   bool
	nameDraft string
	focused   bool
	// The reply-language list is open (D292), and its Other language
	// fold shows the rest.
	talkOpen, talkMore bool
	// The quiet hours being edited, and the server's value they came from.
	// D445: a quiet-hours end's list of half hours is open; qJust is its first
	// frame, when the chosen time is brought into sight.
	qOpenStart, qOpenEnd, qJust bool
	// D445: the model list under 想事情用 is open.
	modelOpen bool
	toast     string
	toastAt   time.Time
	toastTone noticeTone // set with every toast: an error never wears the done look (D158)
	// forgetting: the noted lines asked to be forgotten, seq -> title.
	forgetting map[int64]string
	// Adding a connection (D96): the form, where it runs, the address and
	// the token being typed (dropped once it is sent).
	acctAdding  bool
	acctHow     bool // "How to connect" is open: the setup steps behind the fold
	acctWhere   int  // 0 OOMOL Hosted, 1 self-hosted, 2 other MCP
	acctURL     string
	acctToken   string
	acctWaiting bool
	acctShow    bool   // the key shows as typed, not masked
	acctNoKey   bool   // OOMOL Hosted was checked with no key: said on the field, nothing sent
	acctErr     string // the last check's refusal (a ConnectionReason), shown in the form
	// acctRemoving: the connection whose Remove asks in its own row first (a
	// remove is never one tap: the accounts stop being read at once).
	acctRemoving string
	// cards: the accounts card's open tile, 看了哪些 and stop (D166).
	cards acctCards
}

// say sets the tab's one line and how it looks.
func (ps *partnerState) say(text string, tone noticeTone, at time.Time) {
	ps.toast, ps.toastAt, ps.toastTone = text, at, tone
}

// SetSettings sends a change to the partner's settings.
func (a *App) SetSettings(p protocol.SettingsPatch) {
	a.send(protocol.SettingsSet{T: "settings_set", Patch: p})
}

// loadingLine is what a partner's tab says until the settings frame came.
func (a *App) loadingLine(c *ui.Context) bool {
	if a.S.Settings != nil {
		return false
	}
	a.paneWait(c, "settings", a.L.T("partner.loading", a.S.PersonaName)) // D432
	return true
}

// partnerToast is the tab's one line after a forget or a connection.
func (a *App) partnerToast(c *ui.Context) {
	t := a.T
	ps := &a.partner
	if ps.toast == "" || a.Now().Sub(ps.toastAt) >= 6*time.Second {
		return
	}
	c.After(6*time.Second - a.Now().Sub(ps.toastAt))
	glyph := drawCheck(t.Done.Ink)
	switch ps.toastTone {
	case noticeAlert:
		glyph = drawBang(t.Failed.Ink)
	case noticeInfo:
		glyph = drawAsk(t.InkSoft)
	}
	a.notice(c, "partner-toast", ps.toastTone, func() { a.glyph(c, 22, glyph) }, func() {
		uiText(c, ps.toast).FontSize(t.SM).FontWeight(700).MaxLines(2)
	}, nil)
}

func (a *App) partnerPanel(c *ui.Context, w float32) {
	a.partnerHero(c)
	if a.loadingLine(c) {
		return
	}
	st := a.S.Settings
	a.partnerToast(c)
	a.partnersGroup(c, true) // D309: 伙伴们 / Your partners, first when there are several (D500)
	// D322: one story. What it thinks with, who does the tasks, one place
	// to add another AI, then when a limit runs out (D297, D307).
	a.thinksGroup(c)
	a.tasksGroup(c)
	a.addGroup(c)
	a.handoffGroup(c, st)
	a.talkCard(c, st)
	a.recordsGroup(c) // D307: their records (D298, D299)
	a.trustCard(c)
	a.saidLine(c, "trust")
	a.partnersGroup(c, false) // D500: with one partner, adding another comes last
	a.peersInvite(c)          // D332: one quiet line, for someone not seen running agents of their own
	// D257: what it remembers and 和你的其他 agent 通信 are tabs of their own (memory.go).
}

// partnerHero is the pane's header (D322: sized like every pane's, on the
// paper): the clay partner, its name (a click on Rename turns it into a
// field), and one line of where it lives and what it thinks with.
func (a *App) partnerHero(c *ui.Context) {
	t := a.T
	shown := a.presence(c)
	if a.Resting() {
		shown = theme.Napping
	}
	// D469: the partner says where it runs and what it thinks with, in its own voice.
	line := a.L.T("partner.say", a.homeName(), a.homeThinks())
	if a.noBrain() {
		line = a.L.T("partner.header.none", a.homeName())
	}
	// D435: its own agent held: who thinks meanwhile, or when it answers again.
	if h := a.brainHeld(); h != nil {
		switch {
		case !h.Waits:
			line = a.L.T("partner.header.held", a.homeName(), harnessName(a.brain().Harness))
		case a.heldAt(h) != "":
			line = a.L.T("partner.header.wait", a.homeName(), a.heldAt(h))
		default:
			line = a.L.T("partner.header.wait.soon", a.homeName())
		}
	}
	ui.Row(c.Key("partner-hero")).Gap(t.S4).AlignItems(ui.Center).Children(func() {
		a.avatar(c, shown, 64)
		ui.Column(c).Grow(1).MinWidth(0).Gap(t.S1).Children(func() {
			a.partnerName(c)
			uiText(c, line).FontSize(t.MD).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
		})
	})
}

func facekey(p theme.Presence) string {
	if p == theme.NeedsYou {
		return "needs_you"
	}
	return string(p)
}

// partnerName is the name, large; Rename turns it into a field in place.
func (a *App) partnerName(c *ui.Context) {
	t := a.T
	ps := &a.partner
	if !ps.editing {
		ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Wrap().Children(func() {
			a.heading(c, a.defaultName(), t.XXL).SingleLine().Shrink(1).MinWidth(0)
			if a.S.Settings != nil && a.button(c, a.L.T("partner.rename"), btnText, t.ControlSM, t.Bg) {
				ps.editing, ps.nameDraft, ps.focused = true, "", false
			}
		})
		a.saidLine(c, "rename") // D404: a new name gets one line in the partner's voice
		return
	}
	save := func() {
		name := strings.TrimSpace(ps.nameDraft)
		if name != "" && name != a.defaultName() {
			a.SetSettings(protocol.SettingsPatch{Name: &name})
			a.say("rename", a.L.T("said.rename", name))
			if a.shownPartnerID() == protocol.DefaultPartner {
				a.S.PersonaName = name // shown at once; the settings frame confirms it
			}
		}
		ps.editing = false
	}
	ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Wrap().Children(func() {
		in := ui.TextInput(c.Key("input:partner-name"), &ps.nameDraft).Placeholder(a.defaultName()).Label(a.L.T("partner.rename")).
			FontSize(t.XL).FontWeight(800).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.Surface).Border(1, t.Line).
			Width(260).OnSubmit(save)
		if !ps.focused {
			in.Focus()
			ps.focused = true
		}
		if a.button(c, a.L.T("partner.rename.cancel"), btnText, t.ControlMD, t.Bg) {
			ps.editing = false
		}
		if a.button(c, a.L.T("setup.name.ok"), btnPrimary, t.ControlMD, t.Bg) {
			save()
		}
	})
}

// ---------- the groups ----------

// sheetCard is a group whose card holds free content (the loadout's two
// groups): the title on the paper, the card padded, its parts spaced.
func (a *App) sheetCard(c *ui.Context, key, title string, body func()) {
	a.sheetCardNoted(c, key, title, "", body)
}

// sheetCardNoted is a sheetCard whose one note sits under its title on the
// paper, as every group's does (D289), not as the card's first line.
func (a *App) sheetCardNoted(c *ui.Context, key, title, note string, body func()) {
	t := a.T
	a.group(c, key, title, note, func() {
		ui.Column(c).Gap(t.S4).Padding(t.S5).Children(body)
	})
}

// note is a quiet explanation line.
func (a *App) note(c *ui.Context, text string) {
	t := a.T
	uiText(c, text).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
}

// choices is a segmented clay control (D76): a sunken track, the chosen
// one a white surface standing on a 2-point base, in ink 700, the others
// muted 500: a radio group. It returns the index clicked, or -1.
func (a *App) choices(c *ui.Context, key, name string, labels []string, sel int) int {
	t := a.T
	hit := -1
	// D468: when the options can't stand side by side even on a line of their
	// own (To-do sources' three at 760 wrapped into a ragged second line inside
	// the track), they stack, one per line, as the web's Seg does (D445).
	stack := false
	if avail := a.ctlAvail; avail > 0 {
		need := 2*t.S1 + float32(len(labels)-1)*t.S1
		for _, l := range labels {
			w, _ := c.MeasureText(0, ui.Span{Text: l, Size: t.MD, Weight: 700})
			need += w + 2*t.S4
		}
		stack = need > avail
		if stack && a.ctlRow != nil {
			a.ctlRow.WidthPercent(100)
		}
	}
	wrap := ui.Row(c).MaxWidthPercent(100)
	if stack {
		wrap.WidthPercent(100)
	}
	wrap.Children(func() {
		var track ui.Element
		if stack {
			track = ui.Column(c.Key("choices:" + key)).Grow(1).AlignItems(ui.Stretch)
		} else {
			track = ui.Row(c.Key("choices:" + key))
		}
		track.Gap(t.S1).Padding(t.S1).Radius(t.RadiusMD).Background(t.SurfaceSunken).
			Role(ui.RoleRadioGroup).Label(name).Shrink(1).MinWidth(0)
		if !stack {
			track.Wrap()
		}
		track.Children(func() {
			for i, l := range labels {
				on := i == sel
				b := ui.Row(c.Key("choice:"+l)).Height(t.ControlSM).Padding(0, t.S4).Radius(t.RadiusSM).AlignItems(ui.Center).
					Justify(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleRadio).Label(l).AccessSelected(on).Focusable().Shrink(0)
				if stack {
					b.Justify(ui.Start)
				}
				fg, weight := t.InkMuted, 500
				switch {
				case on:
					b.Background(t.Surface).Shadow(0, 2, 0, 0, t.Line2)
					fg, weight = t.Ink, 700
				case b.Pressed():
					b.Background(t.Ink.Alpha(0.08))
				case b.Hovered():
					b.Background(t.Ink.Alpha(0.04))
					fg = t.InkSoft
				}
				b.Children(func() {
					uiText(c, l).FontSize(t.MD).FontWeight(weight).TextColor(fg).SingleLine().AccessHidden(true)
				})
				if b.Clicked() && !on {
					hit = i
				}
			}
		})
	})
	return hit
}

// switchRow is a line with a switch at its end, inside free content: the
// words, a note under them, and the switch. It returns the new value when
// it was flipped.
func (a *App) switchRow(c *ui.Context, key, label, note string, on bool) (bool, bool) {
	t := a.T
	v := on
	changed := false
	ui.Row(c.Key("switch:" + key)).Gap(t.S4).AlignItems(ui.Center).Children(func() {
		ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
			uiText(c, label).FontSize(t.MD).FontWeight(700)
			if note != "" {
				a.note(c, note)
			}
		})
		changed = a.switchControl(c, key, label, &v)
	})
	return v, changed
}

func (a *App) talkCard(c *ui.Context, st *protocol.Settings) {
	// D292: 跟着我 / Follow me, else any language, each by its own name
	// (한국어, Español): the common ones in the list, the rest behind
	// 其他语言… / Other language…. A saved tag shows by its own name.
	t := a.T
	ps := &a.partner
	a.group(c, "talk", a.L.T("partner.talk.title"), "", func() {
		cur := lang.NormalizeTag(st.Language) // "" is auto
		name := a.L.T("partner.talk.auto")
		if cur != "" {
			name = lang.Autonym(cur)
		}
		// D424: the picker says which language; no line under the row repeats it.
		// D445: its voice does instead: the partner's reply in that language, a small bubble.
		a.rowUnder(c, "talk", a.L.T("settings.talk.row"), func() { a.talkSample(c, cur) }, func() {
			e, click := a.pill(c, "talk-lang", spoken(a.L, a.L.T("partner.talk.title"), name), ps.talkOpen, func() {
				uiText(c, name).FontSize(t.MD).TextColor(t.Ink).SingleLine().AccessHidden(true)
			})
			if click {
				ps.talkOpen, ps.talkMore = !ps.talkOpen, false
			}
			if !ps.talkOpen {
				return
			}
			pick := func(tag string) {
				ps.talkOpen, ps.talkMore = false, false
				if tag == "" {
					tag = "auto"
				}
				st.Language = tag
				a.SetSettings(protocol.SettingsPatch{Language: tag})
			}
			row := func(tag, label string) {
				if a.menuRow(c, "talk:"+tag, label, tag == cur, false, func() {
					uiText(c, label).FontSize(t.MD).TextColor(t.Ink).SingleLine().Grow(1).MinWidth(0)
				}) && tag != cur {
					pick(tag)
				}
			}
			a.listPanel(c, e, &ps.talkOpen, a.L.T("partner.talk.title"), 260, func() {
				row("", a.L.T("partner.talk.auto"))
				listed := false
				for _, l := range lang.Languages {
					if l.Common {
						row(l.Tag, l.Name)
						listed = listed || l.Tag == cur
					}
				}
				if cur != "" && !listed && !ps.talkMore {
					row(cur, name) // a saved language from the rest stays in sight
				}
				if !ps.talkMore {
					other := a.L.T("partner.talk.other")
					if a.menuRow(c, "talk:other", other, false, false, func() {
						uiText(c, other).FontSize(t.MD).TextColor(t.InkSoft).SingleLine().Grow(1).MinWidth(0)
					}) {
						ps.talkMore = true
					}
					return
				}
				uiText(c, a.L.T("partner.talk.more")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Padding(t.S2, t.S3, t.S1, t.S3)
				for _, l := range lang.Languages {
					if !l.Common {
						row(l.Tag, l.Name)
					}
				}
			})
		})
	})
}

// notifyPanel is Settings › Notifications: when it comes to you, quiet
// hours, and how long it waits before a default.
func (a *App) notifyPanel(c *ui.Context) {
	t := a.T
	ps := &a.partner
	a.panelHead(c, TabNotify, a.L.T("settings.lede.notify"))
	if a.loadingLine(c) {
		return
	}
	st := a.S.Settings
	// D445: the notification itself, live with every choice below (D43: shown, not explained).
	find := ""
	if (st.Proactive != "" && st.ProactiveBy != "default") || len(a.S.Connections) > 0 {
		find = st.Proactive
		if find == "" {
			find = "off" // never chosen: it doesn't look by itself (proactive.note.never)
		}
	}
	a.notifyPreview(c, st, a.defaultWaitLabel(st.DefaultAfterMin), find)
	a.group(c, "notify", a.L.T("partner.notify.title"), "", func() {
		note := a.L.T("partner.notify.on.note")
		if !st.Notify {
			note = a.L.T("partner.notify.off.note")
		}
		if v, ch := a.toggleRow(c, "notify", a.L.T("partner.notify.on"), note, st.Notify); ch {
			st.Notify = v
			a.SetSettings(protocol.SettingsPatch{Notify: &v})
			a.cheer()
			if v {
				a.notifyTurnedOn()
			}
		}
		if !st.Notify {
			return
		}
		if v, ch := a.toggleRow(c, "quiet", a.L.T("partner.quiet"), a.L.T("partner.quiet.note"), st.Quiet != nil); ch {
			if v {
				q := &protocol.QuietHours{Start: "23:00", End: "08:00", TZ: localZone()}
				st.Quiet = q
				a.SetSettings(protocol.SettingsPatch{Quiet: q})
				a.say("notify", a.L.T("said.quiet", q.Start, q.End))
			} else {
				st.Quiet = nil
				a.SetSettings(protocol.SettingsPatch{ClearQuiet: true})
				a.say("notify", a.L.T("said.quiet.off"))
			}
			a.cheer()
		}
		if q := st.Quiet; q != nil {
			// D445: each end a pill opening the half hours, 24-hour in every language (the
			// region's 12-hour field said 11:00 PM in Chinese; Ducter's own words say 23:00).
			a.row(c, "quiet-range", a.L.T("settings.quiet.hours"), "", func() {
				set := func(nq *protocol.QuietHours) {
					st.Quiet = nq
					a.SetSettings(protocol.SettingsPatch{Quiet: nq})
					a.say("notify", a.L.T("said.quiet", nq.Start, nq.End))
					a.cheer()
				}
				if v, ok := a.timePill(c, "quiet-start", a.L.T("partner.quiet"), q.Start, &ps.qOpenStart, &ps.qJust); ok {
					set(&protocol.QuietHours{Start: v, End: q.End, TZ: q.TZ})
				}
				uiText(c, a.L.T("partner.quiet.to")).FontSize(t.MD).TextColor(t.InkMuted)
				if v, ok := a.timePill(c, "quiet-end", spoken(a.L, a.L.T("partner.quiet"), a.L.T("partner.quiet.to")), q.End, &ps.qOpenEnd, &ps.qJust); ok {
					set(&protocol.QuietHours{Start: q.Start, End: v, TZ: q.TZ})
				}
			})
		}
	})
	a.saidLine(c, "notify") // D296
	// D165: the chips, once there is something to watch; said here only (D432).
	if (st.Proactive != "" && st.ProactiveBy != "default") || len(a.S.Connections) > 0 {
		a.proactiveSection(c, "notify", true) // D289: a section like the others, 今天看了什么 its second row
	}
	a.group(c, "default", a.L.T("partner.default.title"), "", func() {
		sel := 1
		labels := make([]string, len(protocol.DefaultAfterChoices))
		for i, m := range protocol.DefaultAfterChoices {
			if m == st.DefaultAfterMin {
				sel = i
			}
			if m >= 60 {
				labels[i] = a.L.T("partner.default.hour", m/60)
			} else {
				labels[i] = a.L.T("partner.default.min", m)
			}
		}
		a.row(c, "default", a.L.T("partner.default.line"), a.L.T("partner.default.note"), func() {
			if i := a.choices(c, "default", a.L.T("partner.default.line"), labels, sel); i >= 0 {
				st.DefaultAfterMin = protocol.DefaultAfterChoices[i]
				a.SetSettings(protocol.SettingsPatch{DefaultAfterMin: st.DefaultAfterMin})
				a.say("default", a.L.T("said.default", labels[i]))
				a.cheer()
			}
		})
	})
	a.saidLine(c, "default") // D296
	// D283: iMessage (D277) moved to 聊天软件 / Chat apps.
}

// notifyTurnedOn: on this Mac, turning notifications on is also the yes
// to macOS's question (the one-time ask after a result says the same).
func (a *App) notifyTurnedOn() {
	if a.Desktop == nil || a.Local == nil || a.Local.Asked(askNotify).Answer == "yes" {
		return
	}
	a.answer(askNotify, "yes")
	name := a.personaName()
	go func() { _ = a.Desktop.Notify(a.L.T("notify.test.title", name), a.L.T("notify.test.body")) }()
}

// drainForgot turns the server's word on a forget into one line.
func (a *App) drainForgot() {
	f := a.S.Forgot
	if f == nil {
		return
	}
	a.S.Forgot = nil
	title := a.partner.forgetting[f.Seq]
	delete(a.partner.forgetting, f.Seq)
	key := "partner.memory.hidden"
	if f.How == "mem" {
		key = "partner.memory.forgot"
	}
	a.partner.say(a.L.T(key, title), noticeDone, a.Now())
}

// trustCard is 要不要先问: the two lists side by side in one
// card, read-only, in everyday words (the rules core keeps: G-safety,
// D62, D130, D132).
func (a *App) trustCard(c *ui.Context) {
	t := a.T
	// D424: one clause on how a review stops asking, only until one does (the list then shows it).
	note := a.L.T("partner.trust.note")
	if len(a.S.Standing) > 0 {
		note = ""
	}
	a.group(c, "trust", a.L.T("partner.trust.title"), note, func() {
		list := func(head string, prefix string, sc theme.StateColors, glyph func(ui.Color) func(*ui.Painter, ui.Rect)) {
			ui.Column(c).Gap(t.S3).Grow(1).Basis(0).MinWidth(240).Children(func() {
				uiText(c, head).FontSize(t.MD).FontWeight(800).TextColor(sc.Ink)
				for i := 1; i <= 4; i++ {
					ui.Row(c).Gap(t.S3).AlignItems(ui.Start).Children(func() {
						ui.Box(c).Size(20, 20).Draw(glyph(sc.Ink)).Shrink(0).Margin(1, 0, 0, 0)
						uiText(c, a.L.T(prefix+itoa(int64(i)))).FontSize(t.MD).LineHeight(a.leading(1.45)).Grow(1).MinWidth(0)
					})
				}
			})
		}
		ui.Row(c).Gap(t.S6).Wrap().Padding(t.S5).AlignItems(ui.Start).Children(func() {
			list(a.L.T("partner.trust.own"), "partner.trust.own.", t.Done, drawCheck)
			list(a.L.T("partner.trust.asks"), "partner.trust.asks.", t.NeedsYou, drawAsk)
		})
		a.standingList(c)
	})
}

// standingList is 不用问我的 / Without asking (D413), the third list in
// 要不要先问's card, in the done ink: what the person said may go without
// asking, where, in their words, each with 收回 / Take back. Nothing at
// all until they say one.
func (a *App) standingList(c *ui.Context) {
	if len(a.S.Standing) == 0 {
		return
	}
	t := a.T
	sep := a.L.T("standing.sep")
	ui.Box(c).Height(1).Margin(0, t.S5).Background(t.LineSoft).Shrink(0)
	ui.Column(c.Key("standing")).Gap(t.S3).Padding(t.S4, t.S5, t.S5, t.S5).Children(func() {
		uiText(c, a.L.T("standing.title")).FontSize(t.MD).FontWeight(800).TextColor(t.Done.Ink)
		for _, x := range a.S.Standing {
			x := x
			where := "" // D424: "PRs that ask for your review" is what the title already means
			switch {
			case x.TaskID != "": // D499: kept for one task, by its name
				name := x.TaskTitle
				if name == "" {
					name = x.TaskID
				}
				where = a.L.T("standing.where.task", name)
			case len(x.Orgs) > 0 && x.Action == "pr_review":
				where = a.L.T("standing.where.orgs", strings.Join(x.Orgs, sep))
			case len(x.Orgs) > 0:
				where = a.L.T("standing.where.owners", strings.Join(x.Orgs, sep))
			}
			title := a.L.T("standing." + x.Action)
			ui.Row(c.Key("standing:" + x.ID)).Gap(t.S3).AlignItems(ui.Start).Children(func() {
				ui.Box(c).Size(20, 20).Draw(drawCheck(t.Done.Ink)).Shrink(0).Margin(1, 0, 0, 0)
				ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).Children(func() {
					uiText(c, title).FontSize(t.MD).LineHeight(a.leading(1.45))
					if where != "" {
						uiText(c, where).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
					}
					uiText(c, a.L.T("standing.said", x.Text)).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
				})
				if a.quietDanger(c, "standing:"+x.ID, a.L.T("standing.revoke"), title) {
					a.send(protocol.StandingRevoke{T: "standing_revoke", ID: x.ID})
					a.say("trust", a.L.T("standing.revoked"))
				}
			})
		}
	})
}

// ---------- 账号 / Accounts: it can read (D96) ----------

// OOMOL Hosted (research/44): the address the user meets (the server turns
// it into its MCP endpoint, /v1/mcp), where a key is made, and where
// accounts are connected to OOMOL.
const (
	hostedConnector = "https://connector.oomol.com"
	oomolKeyPage    = "https://console.oomol.com/api-key"
	oomolAccounts   = "https://console.oomol.com/app-connections"
)

// accountsPanel is Settings › Accounts: the user's OpenConnector (OOMOL
// Hosted or self-hosted) or another MCP server, each a small clay mailbox
// (design/connectors.md §9), with an honest line about where mail passes.
// The token is typed once and never shown again. The AI accounts live on
// Devices: one row goes there.
func (a *App) accountsPanel(c *ui.Context) {
	t := a.T
	ps := &a.partner
	a.drainConnResult()
	a.panelHead(c, TabAccounts, a.L.T("settings.lede.accounts", a.personaName()))
	a.partnerToast(c)
	a.phoneSignInRow(c) // D193: the device sign-in, on top while it waits
	list := a.S.Connections
	sources := false
	for _, cv := range list {
		sources = sources || cv.Phone == nil
	}
	// D432: 发现了就说 is said once, on Notifications (D289 had it here too).
	if sources {
		a.sourceCards(c, list)
	}
	a.saidLine(c, "acct-stop")  // D404: a source stopped is answered once, where it was
	a.saidLine(c, "acct-added") // D468: and a source added, in the same place
	title, lede := a.L.T("acct.title"), a.L.T("acct.lede")
	if sources {
		title, lede = "", ""
	}
	if sources && !ps.acctAdding && !(a.S.Oo != nil && a.S.Oo.Account && !usedOoOf(list)) {
		// Adding a second source is rare: the add row at the end of the sources.
		a.group(c, "acct-add", "", "", func() {
			if a.addRow(c, "acct-add", a.L.T("acct.add.title"), a.L.T("acct.add.line")) {
				ps.acctAdding, ps.acctWhere, ps.acctURL, ps.acctToken = true, 0, hostedConnector, ""
				ps.acctErr, ps.acctNoKey, ps.acctShow = "", false, false
			}
		})
	} else {
		a.group(c, "accounts", title, lede, func() {
			oo := a.S.Oo
			// research/118: nothing yet is said on the add row itself (as on the web), not
			// as a row of its own over a row holding only a button.
			none := a.S.ConnAsked && len(list) == 0 && (oo == nil || !oo.Account)
			usedOo := false
			for _, cv := range list {
				usedOo = usedOo || cv.Via == "oo"
			}
			// D122: oo signed in makes the one tap the default surface; the
			// address-and-key form steps back to a quiet link.
			ooOffer := oo != nil && oo.Account && !usedOo
			if ooOffer {
				a.rowBlock(c, "oo", func() { a.ooOffer(c, oo) })
			} else if oo != nil && oo.SelfHosted != nil && !usedOo {
				a.row(c, "oo-self", a.L.T("acct.oo"), a.L.T("acct.oo.note", oo.SelfHosted.URL), func() {
					if a.button(c, a.L.T("acct.oo"), btnSecondary, t.ControlMD, t.Surface) && !ps.acctWaiting {
						ps.acctWaiting = true
						a.send(protocol.ConnectionOo{T: "connection_oo"})
					}
				})
			}
			if !ps.acctAdding {
				open := false
				if ooOffer {
					a.actions(c, "acct", func() {
						open = a.button(c, a.L.T("acct.manual"), btnText, t.ControlMD, t.Surface)
					}, nil)
				} else {
					line := ""
					if none {
						line = a.L.T("acct.none")
					}
					open = a.addRow(c, "acct", a.L.T("acct.add"), line)
				}
				if open {
					ps.acctAdding, ps.acctWhere, ps.acctURL, ps.acctToken = true, 0, hostedConnector, ""
					ps.acctErr, ps.acctNoKey, ps.acctShow = "", false, false
				}
				return
			}
			wheres := []string{"oomol", "self", "mcp"}
			hosted := ps.acctWhere == 0
			if ps.acctNoKey && strings.TrimSpace(ps.acctToken) != "" {
				ps.acctNoKey = false
			}
			submit := func() {
				url := strings.TrimSpace(ps.acctURL)
				if hosted {
					url = hostedConnector
				}
				if ps.acctWaiting || url == "" {
					return
				}
				// A pasted key often brings a space or a line break along.
				key := strings.Join(strings.Fields(ps.acctToken), "")
				if hosted && key == "" {
					ps.acctNoKey, ps.acctErr = true, ""
					return
				}
				ps.acctWaiting, ps.acctNoKey, ps.acctErr = true, false, ""
				a.send(protocol.ConnectionAdd{T: "connection_add", URL: url, Token: key})
				ps.acctToken = "" // sent once; never kept in the app
			}
			a.rowBlock(c, "acct-form", func() {
				labels := []string{a.L.T("acct.where.oomol"), a.L.T("acct.where.self"), a.L.T("acct.where.mcp")}
				if i := a.choices(c, "acct-where", a.L.T("acct.where"), labels, ps.acctWhere); i >= 0 {
					ps.acctWhere, ps.acctErr, ps.acctNoKey = i, "", false
					switch i {
					case 0:
						ps.acctURL = hostedConnector
					case 1:
						ps.acctURL = "http://localhost:3000"
					default:
						ps.acctURL = ""
					}
				}
				a.note(c, a.L.T("acct.where."+wheres[ps.acctWhere]+".note"))
				if hosted {
					// D158: OOMOL Hosted has one address, so no address field;
					// the three steps are the way in, each with its own door.
					a.oomolSteps(c)
				} else {
					a.acctField(c, "acct-url", a.L.T("acct.address"), &ps.acctURL, false, false, submit)
				}
				a.acctKey(c, submit)
				if ps.acctErr != "" {
					a.acctRefusal(c, hosted)
				}
				if !hosted {
					// The technical steps (where the key is made) stay behind a fold:
					// the card says what it does for the person, not how it's wired.
					how := a.L.T("acct.how")
					if ps.acctHow {
						how = a.L.T("acct.how.hide")
					}
					if a.quietLink(c, "acct-how", how, a.L.T("acct.how")) {
						ps.acctHow = !ps.acctHow
					}
					if ps.acctHow {
						a.note(c, a.L.T("acct.how."+wheres[ps.acctWhere]))
					}
				}
			})
			a.actions(c, "acct-form", func() {
				if a.button(c, a.L.T("acct.cancel"), btnText, t.ControlMD, t.Surface) {
					ps.acctAdding, ps.acctToken, ps.acctErr, ps.acctNoKey = false, "", "", false
				}
			}, func() {
				label := a.L.T("acct.check")
				if ps.acctWaiting {
					label = a.L.T("acct.checking")
				}
				if a.button(c, label, btnPrimary, t.ControlMD, t.Surface) {
					submit()
				}
			})
		})
		a.paperNote(c, a.L.T("acct.honest"))
	}
	// D289: calls are their own section, every group in the same flow.
	ui.Column(c.Key("acct-calls")).Gap(t.S2).Children(func() {
		a.sectionHead(c, a.L.T("acct.sec.calls"), "")
		ui.Column(c).Gap(t.S5).Children(func() {
			for _, cv := range list {
				if cv.Phone != nil {
					a.phoneCard(c, cv) // D193
				}
			}
			a.phoneOfferRow(c) // D193: before any calling connection
			a.ownPhoneCard(c)  // D218, D278: calls from the owner's own number
		})
	})
	// D296: the AI accounts are a row like the others: their coins in the
	// tile column, a plain title, where they are signed in as its line.
	a.group(c, "ai-accounts", "", "", func() {
		if a.tileLinkRow(c, "ai-accounts", a.coinsTile(c, false), a.L.T("acct.ai.link"), a.L.T("acct.ai.link.help"), false) {
			a.OpenDevices()
		}
	})
}

// ooOffer is the one tap when the user's oo is signed in (D122): what
// Ducter will be able to read, listed literally (each service and its
// accounts, as oo knows them), where the mail passes, and one primary
// button. Nothing to type: oo's own sign-in stays in oo.
func (a *App) ooOffer(c *ui.Context, oo *protocol.OoDetect) {
	t := a.T
	ps := &a.partner
	ui.Column(c.Key("acct-oo")).Gap(t.S3).Children(func() {
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			ui.Box(c).Size(36, 58).Draw(a.drawMailbox("oo")).Shrink(0).AccessHidden(true)
			ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
				uiText(c, a.L.T("acct.oo.title")).FontSize(t.MD).FontWeight(700)
				a.note(c, a.L.T("acct.oo.lede"))
			})
		})
		switch {
		case oo.Apps == nil:
			a.note(c, a.L.T("acct.oo.loading"))
		case len(oo.Apps) == 0:
			a.note(c, a.L.T("acct.oo.empty"))
		default:
			ui.Column(c).Gap(t.S2).Children(func() {
				for _, app := range oo.Apps {
					app := app
					ui.Row(c.Key("ooapp:" + app.Service)).Gap(t.S3).AlignItems(ui.Baseline).Children(func() {
						uiText(c, app.Title).FontSize(t.MD).FontWeight(700).Width(112).Shrink(0).SingleLine()
						ui.Row(c).Grow(1).MinWidth(0).Children(func() { a.facts(c, t.SM, t.InkSoft, app.Accounts...) })
					})
				}
			})
		}
		a.note(c, a.L.T("acct.oo.where"))
		if len(oo.Apps) > 0 {
			ui.Row(c).Children(func() {
				label := a.L.T("acct.oo.use")
				if ps.acctWaiting {
					label = a.L.T("acct.oo.using")
				}
				if a.button(c, label, btnPrimary, t.ControlMD, t.Surface) && !ps.acctWaiting {
					ps.acctWaiting = true
					a.send(protocol.ConnectionOo{T: "connection_oo"})
				}
			})
		}
	})
}

// acctField is one labelled input on the accounts card; a secret is masked,
// and a wrong one has its border in the failed ink.
func (a *App) acctField(c *ui.Context, key, label string, value *string, secret, wrong bool, submit func()) {
	t := a.T
	ui.Column(c.Key("field:" + key)).Gap(t.S2).Children(func() {
		uiText(c, label).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		border := t.LineSoft
		if wrong {
			border = t.Failed.Strong
		}
		in := ui.TextInput(c.Key("input:"+key), value).Label(label).FontSize(t.MD).Padding(t.S3, t.S4).Radius(t.RadiusSM).
			Background(t.SurfaceSunken).Border(1, border).OnSubmit(submit)
		if secret {
			in.Password()
		}
	})
}

// acctKey is the key field (D158): masked, with Show beside it; Return
// checks; checked empty for OOMOL Hosted, it says so right under it.
func (a *App) acctKey(c *ui.Context, submit func()) {
	t := a.T
	ps := &a.partner
	ui.Column(c.Key("acct-key")).Gap(t.S2).Children(func() {
		ui.Row(c).AlignItems(ui.End).Gap(t.S2).Children(func() {
			ui.Column(c).Grow(1).MinWidth(0).Children(func() {
				a.acctField(c, "acct-token", a.L.T("acct.key"), &ps.acctToken, !ps.acctShow, ps.acctNoKey, submit)
			})
			show := a.L.T("acct.key.show")
			if ps.acctShow {
				show = a.L.T("acct.key.hide")
			}
			if a.buttonFor(c, show, a.L.T("acct.key"), btnText, t.ControlMD, t.Surface) {
				ps.acctShow = !ps.acctShow
			}
		})
		if ps.acctNoKey {
			ui.Row(c.Key("acct-nokey")).Gap(t.S1).AlignItems(ui.Center).Role(ui.RoleAlert).Children(func() {
				a.glyph(c, 18, drawBang(t.Failed.Ink))
				uiText(c, a.L.T("acct.err.no_key")).FontSize(t.SM).FontWeight(700).TextColor(t.Failed.Ink)
			})
		}
	})
}

// oomolSteps is OOMOL Hosted's way in, in three plain steps, each with
// the page it needs one click away (D158).
func (a *App) oomolSteps(c *ui.Context) {
	t := a.T
	step := func(n int, text string, link func()) {
		ui.Row(c.Key("oomol-step:" + itoa(int64(n)))).Gap(t.S3).AlignItems(ui.Baseline).Children(func() {
			uiText(c, itoa(int64(n))+".").FontSize(t.MD).FontWeight(700).TextColor(t.InkSoft).Width(18).Shrink(0)
			ui.Column(c).Grow(1).MinWidth(0).Gap(t.S1).Children(func() {
				uiText(c, text).FontSize(t.MD).LineHeight(a.leading(1.45))
				if link != nil {
					link()
				}
			})
		})
	}
	ui.Column(c.Key("oomol-steps")).Gap(t.S3).Padding(t.S3, t.S4).Radius(t.RadiusSM).Background(t.SurfaceSunken.Mix(t.Bg, 0.45)).Children(func() {
		step(1, a.L.T("acct.step.oomol.1"), func() {
			if a.quietLink(c, "oomol-accounts", a.L.T("acct.connect.oomol"), a.L.T("acct.connect.oomol")) {
				a.openLink(oomolAccounts)
			}
		})
		step(2, a.L.T("acct.step.oomol.2"), func() {
			// The one page everyone needs: a button, not a quiet link.
			ui.Row(c).Children(func() {
				if a.button(c, a.L.T("acct.key.get"), btnSecondary, t.ControlSM, t.SurfaceSunken.Mix(t.Bg, 0.45)) {
					a.openLink(oomolKeyPage)
				}
			})
		})
		step(3, a.L.T("acct.step.oomol.3"), nil)
	})
}

// acctRefusal is the last check's refusal, in the form, in the failed
// look: never the done look (D158). A refused OOMOL key offers a new one.
func (a *App) acctRefusal(c *ui.Context, hosted bool) {
	t := a.T
	ps := &a.partner
	reason := ps.acctErr
	var actions func()
	if hosted && reason == "unauthorized" {
		actions = func() {
			if a.button(c, a.L.T("acct.key.get"), btnSecondary, t.ControlSM, t.Failed.Surface) {
				a.openLink(oomolKeyPage)
			}
		}
	}
	a.notice(c, "acct-refusal", noticeAlert, func() { a.glyph(c, 22, drawBang(t.Failed.Ink)) }, func() {
		uiText(c, a.L.T("acct.err."+reason)).FontSize(t.SM).FontWeight(700).TextColor(t.Failed.Ink).MaxLines(3)
	}, actions)
}

// appsList is "Gmail、Discord" / "Gmail, Discord".
// connName is what a connection is called on screen: the oo kind is "Accounts
// in oo", never its internal record name "oo".
func usedOoOf(list []protocol.ConnectionView) bool {
	for _, cv := range list {
		if cv.Via == "oo" {
			return true
		}
	}
	return false
}

func connName(a *App, cv protocol.ConnectionView) string {
	if cv.Source == "oo" {
		return a.L.T("acct.oo.name")
	}
	return cv.Name
}

func (a *App) appsList(apps []protocol.OoApp) string {
	names := make([]string, 0, len(apps))
	for _, ap := range apps {
		names = append(names, ap.Title)
	}
	return strings.Join(names, a.L.T("acct.sep"))
}

// drainConnResult turns the server's answer to an add or a remove into one
// line on the page: a refusal in the open form (or, with no form, a
// failed-look line), an add in the done look with what it can now read.
func (a *App) drainConnResult() {
	r := a.S.ConnResult
	if r == nil {
		return
	}
	a.S.ConnResult = nil
	ps := &a.partner
	ps.acctWaiting = false
	if !r.OK {
		switch {
		case r.Reason == "", r.Reason == "signing_in": // D193: the sign-in panel says it
		case ps.acctAdding && r.Reason == "no_key":
			ps.acctNoKey = true
		case ps.acctAdding:
			ps.acctErr = r.Reason
		default:
			ps.say(a.L.T("acct.err."+r.Reason), noticeAlert, a.Now())
		}
		return
	}
	for _, cv := range a.S.Connections {
		if cv.ID == r.ID {
			ps.acctAdding, ps.acctErr, ps.acctNoKey = false, "", false
			// D468 (D459's leftover): a source added is the partner's one word under
			// the sources, D296's said line, as a source stopped is; never a boxed
			// notice at the top of the page. A refusal keeps the failed look above.
			switch {
			case r.Readable != nil && len(r.Readable) == 0:
				a.say("acct-added", a.L.T("acct.added.empty", connName(a, cv)))
			case len(r.Readable) > 0:
				a.say("acct-added", a.L.T("acct.added.apps", connName(a, cv), a.appsList(r.Readable)))
			default:
				a.say("acct-added", a.L.T("acct.added", connName(a, cv)))
			}
		}
	}
}

// drawMailbox is the small clay mailbox for one connection: a post, a
// rounded box, an envelope on the lid; its colour says where it runs.
func (a *App) drawMailbox(source string) func(p *ui.Painter, r ui.Rect) {
	t := a.T
	body := t.InkMuted
	switch source {
	case "oomol", "oo":
		body = t.Accent
	case "self":
		body = t.Working.Dot
	}
	return func(p *ui.Painter, r ui.Rect) {
		sx, sy := r.W/52, r.H/84
		x := func(v float32) float32 { return r.X + v*sx }
		y := func(v float32) float32 { return r.Y + v*sy }
		p.Fill(ui.Rect{X: x(22), Y: y(44), W: 8 * sx, H: 37 * sy}, t.Line2, 3*sx)
		var box ui.Path
		box.MoveTo(x(6), y(46)).LineTo(x(6), y(26)).CubeTo(x(6), y(4), x(46), y(4), x(46), y(26)).LineTo(x(46), y(46)).Close()
		p.FillPath(&box, body)
		var lid ui.Path
		lid.MoveTo(x(10), y(44)).LineTo(x(10), y(28)).CubeTo(x(10), y(10), x(42), y(10), x(42), y(28)).LineTo(x(42), y(44)).Close()
		p.FillPath(&lid, t.Surface)
		p.Fill(ui.Rect{X: x(15), Y: y(27), W: 22 * sx, H: 15 * sy}, body, 2.5*sx)
		var env ui.Path
		env.MoveTo(x(15.5), y(28)).LineTo(x(26), y(36)).LineTo(x(36.5), y(28))
		p.StrokePath(&env, 1.6, t.Surface)
	}
}

// HomeMailboxes is for the devices stage (Isles, being rebuilt on the isles
// branch): the mailboxes that stand on the island of the computer Ducter
// lives on. Connections always live there (D96).
func (a *App) HomeMailboxes() []protocol.ConnectionView {
	return a.S.Connections
}

// ---------- helpers ----------

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		b[i] = '-'
	}
	return string(b[i:])
}

// localZone is this Mac's IANA zone ("Asia/Shanghai"), for quiet hours.
func localZone() string {
	if z := os.Getenv("TZ"); z != "" {
		return strings.TrimPrefix(z, ":")
	}
	if p, err := os.Readlink("/etc/localtime"); err == nil {
		if i := strings.Index(p, "zoneinfo/"); i >= 0 {
			return p[i+len("zoneinfo/"):]
		}
		return filepath.Base(p)
	}
	return "UTC"
}
