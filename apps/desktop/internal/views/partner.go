package views

import (
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// 伙伴 / Partner (D71): a character sheet. The clay partner large, its
// name editable in place, the faces it makes; then four cards in plain
// words: how it talks, when it comes to you, what it remembers, and what
// it does on its own or asks you first. Everything here is the partner's
// and lives on the server (the settings frame), so the phone shows the
// same.

type partnerState struct {
	editing   bool
	nameDraft string
	focused   bool
	// face is the face the person is looking at (the strip under the
	// clay); "" follows what the partner is up to.
	face theme.Presence
	// The quiet hours being edited, and the server's value they came from.
	qStart, qEnd time.Time
	qFrom        string
	toast        string
	toastAt      time.Time
	// forgetting: the noted lines asked to be forgotten, seq -> title.
	forgetting map[int64]string
	// Adding a connection (D96): the form, where it runs, the address and
	// the token being typed (dropped once it is sent).
	acctAdding  bool
	acctWhere   int // 0 OOMOL Hosted, 1 self-hosted, 2 other MCP
	acctURL     string
	acctToken   string
	acctWaiting bool
}

// OpenPartner shows the Partner page, asking for the settings (and to be
// told of every change while this socket lives).
func (a *App) OpenPartner() {
	a.Route = RoutePartner
	a.send(protocol.SettingsReq{T: "settings"})
	a.send(protocol.RulesReq{T: "rules"}) // Your rules (D89)
	a.send(protocol.ConnectionsReq{T: "connections"})
	if a.S.DevicesAt.IsZero() {
		a.send(protocol.DevicesReq{T: "devices"}) // where it lives
	}
}

// SetSettings sends a change to the partner's settings.
func (a *App) SetSettings(p protocol.SettingsPatch) {
	a.send(protocol.SettingsSet{T: "settings_set", Patch: p})
}

func (a *App) partnerView(c *ui.Context) {
	t := a.T
	ps := &a.partner
	a.drainForgot()
	a.chrome(c, "partner", func() {
		a.crumb(c, a.L.T("nav.conversation"), RouteConversation)
		a.chromeTitle(c, a.L.T("nav.partner"))
	}, nil)
	w, _ := c.Size()
	wide := w == 0 || w >= 980
	ui.Scroll(c.Key("partner-scroll")).Grow(1).Children(func() {
		ui.Row(c).Justify(ui.Center).Padding(t.S6, t.S6, t.S7, t.S6).Children(func() {
			ui.Column(c).Grow(1).MaxWidth(1040).Gap(t.S5).Children(func() {
				a.partnerHero(c, wide)
				st := a.S.Settings
				if st == nil {
					ui.Text(c, a.L.T("partner.loading", a.S.PersonaName)).FontSize(t.MD).TextColor(t.InkMuted)
					return
				}
				if ps.toast != "" && a.Now().Sub(ps.toastAt) < 6*time.Second {
					c.After(6*time.Second - a.Now().Sub(ps.toastAt))
					a.notice(c, "partner-toast", noticeDone, func() { a.glyph(c, 22, drawCheck(t.Done.Ink)) }, func() {
						ui.Text(c, ps.toast).FontSize(t.SM).FontWeight(700).MaxLines(2)
					}, nil)
				}
				// What it thinks with and who does the tasks (D89): the tray
				// of this Mac's AI agents, then the two cards.
				a.tray(c)
				loadout := []func(){func() { a.brainCard(c) }, func() { a.tasksCard(c) }}
				if wide {
					ui.Row(c).Gap(t.S5).AlignItems(ui.Start).Children(func() {
						ui.Column(c).Grow(1).Basis(0).MinWidth(0).Children(loadout[0])
						ui.Column(c).Grow(1).Basis(0).MinWidth(0).Children(loadout[1])
					})
				} else {
					loadout[0]()
					loadout[1]()
				}
				cards := []func(){
					func() { a.talkCard(c, st) },
					func() { a.notifyCard(c, st) },
					func() { a.memoryCard(c, st) },
					func() { a.trustCard(c) },
					func() { a.accountsCard(c) },
				}
				if !wide {
					for _, card := range cards {
						card()
					}
					return
				}
				ui.Row(c).Gap(t.S5).AlignItems(ui.Start).Children(func() {
					ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(t.S5).Children(func() { cards[0](); cards[1](); cards[4]() })
					ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(t.S5).Children(func() { cards[2](); cards[3]() })
				})
			})
		})
	})
	a.loadoutToast(c, w)
	a.brainFlyer(c)
}

// partnerHero: a character sheet across the whole card. The clay partner
// large with its name (a click turns it into a field) and where it lives on
// the left; the five faces it makes as a row filling the right, each one
// shown large on hover or click.
func (a *App) partnerHero(c *ui.Context, wide bool) {
	t := a.T
	ps := &a.partner
	shown := ps.face
	if shown == "" {
		shown = a.presence(c)
		if a.Resting() {
			shown = theme.Napping
		}
	}
	ui.Row(c.Key("partner-hero")).Gap(t.S6).Wrap().AlignItems(ui.Center).Padding(t.S5, t.S6).Radius(t.RadiusXL).Background(t.Clay).
		Shadow(0, t.Raised.Y, 0, 0, t.Raised.Color).Children(func() {
		// With the socket beside it (what it thinks with, D89) the partner's
		// half is wider and the partner a little smaller.
		withSocket := a.S.Settings != nil
		basis, size := float32(400), float32(200)
		if withSocket {
			basis, size = 600, 176
		}
		ui.Row(c).Gap(t.S5).AlignItems(ui.Center).Grow(1).Basis(basis).MinWidth(0).Children(func() {
			a.avatar(c, shown, size)
			if withSocket {
				a.socket(c)
			}
			ui.Column(c).Grow(1).MinWidth(0).Gap(t.S2).Children(func() {
				a.partnerName(c)
				if home := a.homeDevice(); home != nil {
					ui.Text(c, a.L.T("partner.lives", a.deviceNameIn(home))).FontSize(t.LG).TextColor(t.InkSoft)
				}
			})
		})
		ui.Row(c.Key("faces")).Gap(t.S2).Grow(1).Basis(340).MinWidth(0).Justify(ui.SpaceBetween).Role(ui.RoleGroup).Children(func() {
			for _, p := range theme.Presences {
				a.faceThumb(c, p, shown == p)
			}
		})
	})
}

// faceThumb is one face in the strip: hover or click shows it large.
func (a *App) faceThumb(c *ui.Context, p theme.Presence, on bool) {
	t := a.T
	label := a.L.T("partner.face." + facekey(p))
	b := ui.Column(c.Key("face:"+string(p))).Gap(t.S1).Grow(1).Basis(0).MinWidth(0).AlignItems(ui.Center).Padding(t.S2, t.S1).Radius(t.RadiusMD).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(label).AccessSelected(on).Focusable()
	if on {
		b.Background(t.Surface.Alpha(0.7))
	} else if b.Hovered() {
		b.Background(t.Surface.Alpha(0.4))
	}
	b.Children(func() {
		if bmp := theme.Art(p, 144); bmp != nil {
			ui.Image(c, bmp).Size(72, 72).AccessHidden(true)
		}
		// Six faces share the strip: a long label ("Needs you") takes a second line, never "Need…".
		ui.Text(c, label).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).TextAlign(ui.Center).MaxLines(2).AccessHidden(true)
	})
	if b.Hovered() {
		a.partner.face = p
	} else if a.partner.face == p && !b.Hovered() && !b.Focused() {
		a.partner.face = ""
	}
	if b.Clicked() {
		a.partner.face = p
	}
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
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Wrap().Children(func() {
			a.heading(c, a.S.PersonaName, t.Title).SingleLine().Shrink(1).MinWidth(0)
			if a.S.Settings != nil && a.button(c, a.L.T("partner.rename"), btnText, t.ControlSM, t.Clay) {
				ps.editing, ps.nameDraft, ps.focused = true, "", false
			}
		})
		return
	}
	save := func() {
		name := strings.TrimSpace(ps.nameDraft)
		if name != "" && name != a.S.PersonaName {
			a.SetSettings(protocol.SettingsPatch{Name: &name})
			a.S.PersonaName = name // shown at once; the settings frame confirms it
		}
		ps.editing = false
	}
	ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Wrap().Children(func() {
		in := ui.TextInput(c.Key("input:partner-name"), &ps.nameDraft).Placeholder(a.S.PersonaName).Label(a.L.T("partner.rename")).
			FontSize(t.XL).FontWeight(800).Padding(t.S2, t.S3).Radius(t.RadiusSM).Background(t.Surface).Border(1, t.Line).
			Width(280).OnSubmit(save)
		if !ps.focused {
			in.Focus()
			ps.focused = true
		}
		if a.button(c, a.L.T("partner.rename.cancel"), btnText, t.ControlMD, t.Clay) {
			ps.editing = false
		}
		if a.button(c, a.L.T("setup.name.ok"), btnPrimary, t.ControlMD, t.Clay) {
			save()
		}
	})
}

// ---------- the cards ----------

// sheetCard is one of the page's cards: a container on Raised, its title,
// then what it holds.
func (a *App) sheetCard(c *ui.Context, key, title string, body func()) {
	t := a.T
	ui.Column(c.Key("card:"+key)).Gap(t.S4).Padding(t.S5).Radius(t.RadiusLG).Background(t.Surface).
		Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).Role(ui.RoleGroup).Label(title).Children(func() {
		a.heading(c, title, t.XL)
		body()
	})
}

// note is a card's quiet explanation line.
func (a *App) note(c *ui.Context, text string) {
	t := a.T
	ui.Text(c, text).FontSize(t.SM).LineHeight(1.5).TextColor(t.InkMuted)
}

// choices is a segmented clay control (D76): a sunken track, the chosen
// one a white surface standing on a 2-point base, in ink 700, the others
// muted 500: a radio group. It returns the index clicked, or -1.
func (a *App) choices(c *ui.Context, key, name string, labels []string, sel int) int {
	t := a.T
	hit := -1
	ui.Row(c).Children(func() {
		ui.Row(c.Key("choices:" + key)).Gap(t.S1).Padding(t.S1).Radius(t.RadiusMD).Background(t.SurfaceSunken).
			Role(ui.RoleRadioGroup).Label(name).Shrink(1).MinWidth(0).Wrap().Children(func() {
			for i, l := range labels {
				on := i == sel
				b := ui.Row(c.Key("choice:"+l)).Height(t.ControlSM).Padding(0, t.S4).Radius(t.RadiusSM).AlignItems(ui.Center).
					Justify(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleRadio).Label(l).AccessSelected(on).Focusable().Shrink(0)
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
					ui.Text(c, l).FontSize(t.MD).FontWeight(weight).TextColor(fg).SingleLine().AccessHidden(true)
				})
				if b.Clicked() && !on {
					hit = i
				}
			}
		})
	})
	return hit
}

// switchRow is a line with a switch at its end: the words, a note under
// them, and the switch. It returns the new value when it was flipped.
func (a *App) switchRow(c *ui.Context, key, label, note string, on bool) (bool, bool) {
	t := a.T
	v := on
	changed := false
	ui.Row(c.Key("switch:" + key)).Gap(t.S4).AlignItems(ui.Center).Children(func() {
		ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
			ui.Text(c, label).FontSize(t.MD).FontWeight(800)
			if note != "" {
				a.note(c, note)
			}
		})
		sw := ui.Switch(c.Key("sw:"+key), &v).Label(label)
		changed = sw.Changed()
	})
	return v, changed
}

func (a *App) talkCard(c *ui.Context, st *protocol.Settings) {
	a.sheetCard(c, "talk", a.L.T("partner.talk.title"), func() {
		opts := []string{"auto", "zh", "en"}
		sel := 0
		for i, o := range opts {
			if o == st.Language {
				sel = i
			}
		}
		labels := []string{a.L.T("partner.talk.auto"), a.L.T("partner.talk.zh"), a.L.T("partner.talk.en")}
		if i := a.choices(c, "talk", a.L.T("partner.talk.title"), labels, sel); i >= 0 {
			st.Language = opts[i]
			a.SetSettings(protocol.SettingsPatch{Language: opts[i]})
		}
		if st.Language == "zh" || st.Language == "en" {
			a.note(c, a.L.T("partner.talk.fixed.note", a.L.T("partner.talk."+st.Language)))
		} else {
			a.note(c, a.L.T("partner.talk.auto.note"))
		}
	})
}

func (a *App) notifyCard(c *ui.Context, st *protocol.Settings) {
	t := a.T
	ps := &a.partner
	a.sheetCard(c, "notify", a.L.T("partner.notify.title"), func() {
		note := a.L.T("partner.notify.on.note")
		if !st.Notify {
			note = a.L.T("partner.notify.off.note")
		}
		if v, ch := a.switchRow(c, "notify", a.L.T("partner.notify.on"), note, st.Notify); ch {
			st.Notify = v
			a.SetSettings(protocol.SettingsPatch{Notify: &v})
			if v {
				a.notifyTurnedOn()
			}
		}
		if st.Notify {
			ui.Box(c).Height(1).Background(t.LineSoft)
			if v, ch := a.switchRow(c, "quiet", a.L.T("partner.quiet"), a.L.T("partner.quiet.note"), st.Quiet != nil); ch {
				if v {
					q := &protocol.QuietHours{Start: "23:00", End: "08:00", TZ: localZone()}
					st.Quiet = q
					a.SetSettings(protocol.SettingsPatch{Quiet: q})
				} else {
					st.Quiet = nil
					a.SetSettings(protocol.SettingsPatch{ClearQuiet: true})
				}
			}
			if q := st.Quiet; q != nil {
				if from := q.Start + "-" + q.End; ps.qFrom != from {
					ps.qStart, ps.qEnd, ps.qFrom = clockTime(q.Start), clockTime(q.End), from
				}
				ui.Row(c.Key("quiet-range")).Gap(t.S3).AlignItems(ui.Center).Children(func() {
					s := ui.TimeInput(c.Key("quiet-start"), &ps.qStart).Label(a.L.T("partner.quiet"))
					ui.Text(c, a.L.T("partner.quiet.to")).FontSize(t.MD).TextColor(t.InkMuted)
					e := ui.TimeInput(c.Key("quiet-end"), &ps.qEnd).Label(a.L.T("partner.quiet") + " · " + a.L.T("partner.quiet.to"))
					if s.Changed() || e.Changed() {
						nq := &protocol.QuietHours{Start: ps.qStart.Format("15:04"), End: ps.qEnd.Format("15:04"), TZ: q.TZ}
						ps.qFrom = nq.Start + "-" + nq.End
						st.Quiet = nq
						a.SetSettings(protocol.SettingsPatch{Quiet: nq})
					}
				})
			}
		}
		ui.Box(c).Height(1).Background(t.LineSoft)
		ui.Column(c).Gap(t.S2).Children(func() {
			ui.Text(c, a.L.T("partner.default.title")).FontSize(t.MD).FontWeight(800)
			a.note(c, a.L.T("partner.default.line"))
		})
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
		if i := a.choices(c, "default", a.L.T("partner.default.line"), labels, sel); i >= 0 {
			st.DefaultAfterMin = protocol.DefaultAfterChoices[i]
			a.SetSettings(protocol.SettingsPatch{DefaultAfterMin: st.DefaultAfterMin})
		}
		a.note(c, a.L.T("partner.default.note"))
	})
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

func (a *App) memoryCard(c *ui.Context, st *protocol.Settings) {
	t := a.T
	a.sheetCard(c, "memory", a.L.T("partner.memory.title"), func() {
		mem := a.S.Mem
		state := "missing"
		if mem != nil {
			state = mem.State
		}
		if !st.Memory {
			state = "off"
		}
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Children(func() {
			ui.Text(c, a.L.T("partner.memory."+state)).FontSize(t.MD).LineHeight(1.5).Grow(1).MinWidth(0)
		})
		if state == "missing" {
			ui.Row(c).Children(func() {
				if a.button(c, a.L.T("partner.memory.connect"), btnSecondary, t.ControlMD, t.Surface) {
					a.openLink("https://mem.nowledge.co")
				}
			})
		}
		if v, ch := a.switchRow(c, "memory", a.L.T("partner.memory.switch"), "", st.Memory); ch {
			st.Memory = v
			a.SetSettings(protocol.SettingsPatch{Memory: &v})
		}
		// The noted lines, newest first; none: no heading, no empty row.
		if mem == nil || len(mem.Noted) == 0 {
			return
		}
		ui.Box(c).Height(1).Background(t.LineSoft)
		ui.Text(c, a.L.T("partner.memory.recent")).FontSize(t.XS).FontWeight(800).LetterSpacing(0.6).TextColor(t.InkMuted)
		ui.Column(c).Gap(t.S1).Children(func() {
			for _, n := range mem.Noted {
				ui.Row(c.Key("noted:" + itoa(n.Seq))).Gap(t.S3).AlignItems(ui.Center).MinHeight(t.ControlSM).Children(func() {
					ui.Text(c, n.Title).FontSize(t.MD).Grow(1).MinWidth(0).MaxLines(2)
					if ago := a.agoLong(n.At); ago != "" {
						ui.Text(c, ago).FontSize(t.XS).TextColor(t.InkMuted).Shrink(0)
					}
					if a.buttonFor(c, a.L.T("partner.memory.forget"), n.Title, btnText, t.ControlSM, t.Surface) {
						if a.partner.forgetting == nil {
							a.partner.forgetting = map[int64]string{}
						}
						a.partner.forgetting[n.Seq] = n.Title
						a.send(protocol.MemoryForget{T: "memory_forget", Seq: n.Seq})
					}
				})
			}
		})
	})
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
	a.partner.toast, a.partner.toastAt = a.L.T(key, title), a.Now()
}

func (a *App) trustCard(c *ui.Context) {
	t := a.T
	a.sheetCard(c, "trust", a.L.T("partner.trust.title"), func() {
		list := func(head string, prefix string, sc theme.StateColors, glyph func(ui.Color) func(*ui.Painter, ui.Rect)) {
			ui.Column(c).Gap(t.S2).Children(func() {
				ui.Text(c, head).FontSize(t.SM).FontWeight(800).TextColor(sc.Ink)
				for i := 1; i <= 4; i++ {
					ui.Row(c).Gap(t.S3).AlignItems(ui.Start).Children(func() {
						ui.Box(c).Size(20, 20).Draw(glyph(sc.Ink)).Shrink(0).Margin(1, 0, 0, 0)
						ui.Text(c, a.L.T(prefix+itoa(int64(i)))).FontSize(t.MD).LineHeight(1.45).Grow(1).MinWidth(0)
					})
				}
			})
		}
		list(a.L.T("partner.trust.own"), "partner.trust.own.", t.Done, drawCheck)
		list(a.L.T("partner.trust.asks"), "partner.trust.asks.", t.NeedsYou, drawAsk)
	})
}

// ---------- 它能看的账号 / Accounts it can read (D96) ----------

const hostedConnector = "https://connector.oomol.com"

// accountsCard: the user's OpenConnector (OOMOL Hosted or self-hosted) or
// another MCP server, each a small clay mailbox (the prototype's look,
// design/connectors.md §9), with an honest line about where mail passes.
// The token is typed once and never shown again.
func (a *App) accountsCard(c *ui.Context) {
	t := a.T
	ps := &a.partner
	a.drainConnResult()
	a.sheetCard(c, "accounts", a.L.T("acct.title"), func() {
		a.note(c, a.L.T("acct.lede"))
		list := a.S.Connections
		if a.S.ConnAsked && len(list) == 0 {
			ui.Text(c, a.L.T("acct.none")).FontSize(t.MD).LineHeight(1.5).TextColor(t.InkSoft)
		}
		for _, cv := range list {
			cv := cv
			ui.Row(c.Key("acct:"+cv.ID)).Gap(t.S3).AlignItems(ui.Center).Padding(t.S2, t.S3).Radius(t.RadiusMD).Background(t.SurfaceSunken).Children(func() {
				ui.Box(c).Size(30, 46).Draw(a.drawMailbox(cv.Source)).Shrink(0).AccessHidden(true)
				ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
					ui.Text(c, cv.Name).FontSize(t.MD).FontWeight(700).SingleLine()
					a.note(c, a.L.T("acct.src."+cv.Source))
					if cv.State == "unreachable" || cv.State == "unauthorized" {
						ui.Text(c, a.L.T("acct.state."+cv.State)).FontSize(t.SM).FontWeight(700).TextColor(t.Failed.Ink)
					}
				})
				if a.buttonFor(c, a.L.T("acct.remove"), cv.Name, btnText, t.ControlSM, t.SurfaceSunken) {
					a.send(protocol.ConnectionRemove{T: "connection_remove", ID: cv.ID})
				}
			})
		}
		oo := a.S.Oo
		usedOo := false
		for _, cv := range list {
			usedOo = usedOo || cv.Via == "oo"
		}
		if oo != nil && oo.SelfHosted != nil && !usedOo {
			ui.Column(c).Gap(t.S2).Children(func() {
				ui.Row(c).Children(func() {
					if a.button(c, a.L.T("acct.oo"), btnSecondary, t.ControlMD, t.Surface) && !ps.acctWaiting {
						ps.acctWaiting = true
						a.send(protocol.ConnectionOo{T: "connection_oo"})
					}
				})
				a.note(c, a.L.T("acct.oo.note", oo.SelfHosted.URL))
			})
		} else if oo != nil && oo.Account && oo.SelfHosted == nil {
			a.note(c, a.L.T("acct.oo.account"))
		}
		if !ps.acctAdding {
			ui.Row(c).Children(func() {
				if a.button(c, a.L.T("acct.add"), btnSecondary, t.ControlMD, t.Surface) {
					ps.acctAdding, ps.acctWhere, ps.acctURL, ps.acctToken = true, 0, hostedConnector, ""
				}
			})
		} else {
			ui.Box(c).Height(1).Background(t.LineSoft)
			wheres := []string{"oomol", "self", "mcp"}
			labels := []string{a.L.T("acct.where.oomol"), a.L.T("acct.where.self"), a.L.T("acct.where.mcp")}
			if i := a.choices(c, "acct-where", a.L.T("acct.where"), labels, ps.acctWhere); i >= 0 {
				ps.acctWhere = i
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
			submit := func() {
				if ps.acctWaiting || strings.TrimSpace(ps.acctURL) == "" {
					return
				}
				ps.acctWaiting = true
				a.send(protocol.ConnectionAdd{T: "connection_add", URL: strings.TrimSpace(ps.acctURL), Token: strings.TrimSpace(ps.acctToken)})
				ps.acctToken = "" // sent once; never kept in the app
			}
			a.acctField(c, "acct-url", a.L.T("acct.address"), &ps.acctURL, false, submit)
			a.acctField(c, "acct-token", a.L.T("acct.key"), &ps.acctToken, true, submit)
			ui.Row(c).Gap(t.S2).Justify(ui.End).Children(func() {
				if a.button(c, a.L.T("acct.cancel"), btnText, t.ControlMD, t.Surface) {
					ps.acctAdding, ps.acctToken = false, ""
				}
				label := a.L.T("acct.check")
				if ps.acctWaiting {
					label = a.L.T("acct.checking")
				}
				if a.button(c, label, btnPrimary, t.ControlMD, t.Surface) {
					submit()
				}
			})
		}
		a.note(c, a.L.T("acct.honest"))
	})
}

// acctField is one labelled input on the accounts card; the token is masked.
func (a *App) acctField(c *ui.Context, key, label string, value *string, secret bool, submit func()) {
	t := a.T
	ui.Column(c.Key("field:" + key)).Gap(t.S2).Children(func() {
		ui.Text(c, label).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft)
		in := ui.TextInput(c.Key("input:"+key), value).Label(label).FontSize(t.MD).Padding(t.S3, t.S4).Radius(t.RadiusSM).
			Background(t.SurfaceSunken).Border(1, t.LineSoft).OnSubmit(submit)
		if secret {
			in.Password()
		}
	})
}

// drainConnResult turns the server's answer to an add or a remove into one
// line on the page.
func (a *App) drainConnResult() {
	r := a.S.ConnResult
	if r == nil {
		return
	}
	a.S.ConnResult = nil
	ps := &a.partner
	ps.acctWaiting = false
	if !r.OK {
		if r.Reason != "" {
			ps.toast, ps.toastAt = a.L.T("acct.err."+r.Reason), a.Now()
		}
		return
	}
	for _, cv := range a.S.Connections {
		if cv.ID == r.ID {
			ps.acctAdding = false
			ps.toast, ps.toastAt = a.L.T("acct.added", cv.Name), a.Now()
		}
	}
}

// drawMailbox is the small clay mailbox for one connection: a post, a
// rounded box, an envelope on the lid; its colour says where it runs.
func (a *App) drawMailbox(source string) func(p *ui.Painter, r ui.Rect) {
	t := a.T
	body := t.InkMuted
	switch source {
	case "oomol":
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

// clockTime is "23:00" as a time today, for TimeInput.
func clockTime(hhmm string) time.Time {
	tm, err := time.ParseInLocation("15:04", hhmm, time.Local)
	if err != nil {
		return time.Date(2000, 1, 1, 23, 0, 0, 0, time.Local)
	}
	return tm
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
