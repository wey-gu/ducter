package views

// D410: 你的小应用 / Your apps (design/apps.md). The place the person's apps
// live: a whole-window shelf, like Past tasks, one click from the bar's
// places (the app window mark beside On hand), ⌘5, the View menu and ⌘K.
// A tile per app, pinned first then the newest change: its clay tile in its
// tint, its name, the one line it says of itself (ducter.summary), who keeps
// it current or when it changed, and its 「⋯」: rename, ask the partner to
// change it, undo the last change, pin, stop a routine updating it, delete.
// Empty, it says what goes here and offers up to three things to say, from
// what the home knows. Facts are separate elements (D291), never joined.

import (
	"sort"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

const (
	// shelfTileW is a tile's width: three to a row at the place's measure.
	shelfTileW = 236
	// shelfUndoFor is how long 删掉了「…」 撤销 stays under the heading.
	shelfUndoFor = 12 * time.Second
)

type shelfState struct {
	// back is where Esc goes.
	back     Route
	backTask string
	// renaming is the app whose name is being changed in place, name its words.
	renaming, name string
	// asking is the app asked to be deleted (its confirm shows on its tile).
	asking string
	// deleted is the app just deleted, for 撤销 / Undo.
	deleted   *protocol.AppMeta
	deletedAt time.Time
}

// OpenApps shows 你的小应用 / Your apps. Esc comes back to where it was.
func (a *App) OpenApps() {
	sh := &a.shelf
	if a.Route != RouteApps {
		sh.back, sh.backTask = a.Route, a.TaskID
	}
	a.Route = RouteApps
	a.send(struct {
		T string `json:"t"`
	}{"apps"})
}

// appsBack goes back to where the shelf was opened from.
func (a *App) appsBack() {
	sh := &a.shelf
	switch sh.back {
	case RouteTask:
		if sh.backTask != "" && a.S.Task(sh.backTask) != nil {
			a.OpenTask(sh.backTask)
			return
		}
		a.Route = RouteConversation
	case RouteApps:
		a.Route = RouteConversation
	default:
		a.Route = sh.back
	}
}

// appsEsc: a rename or a delete being asked closes first, then the place.
func (a *App) appsEsc() {
	sh := &a.shelf
	switch {
	case sh.renaming != "":
		sh.renaming = ""
	case sh.asking != "":
		sh.asking = ""
	default:
		a.appsBack()
	}
}

// shelfApps are the person's apps in shelf order: pinned first, then the
// newest change.
func (a *App) shelfApps() []protocol.AppMeta {
	out := append([]protocol.AppMeta(nil), a.S.Apps...)
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Pinned != out[j].Pinned {
			return out[i].Pinned
		}
		return out[i].Updated > out[j].Updated
	})
	return out
}

func (a *App) appsPartner() string { return firstNonEmpty(a.S.PersonaName, "Ducter") }

func (a *App) appsView(c *ui.Context) {
	t := a.T
	sh := &a.shelf
	a.placeBar(c, "apps", RouteApps, func() {
		a.crumb(c, a.L.T("nav.conversation"), RouteConversation)
		a.chromeTitle(c, a.L.T("apps.title"))
	}, nil)
	if sh.deleted != nil {
		if left := shelfUndoFor - c.Now().Sub(sh.deletedAt); left > 0 {
			c.After(left)
		} else {
			sh.deleted = nil
		}
	}
	apps := a.shelfApps()
	ui.Scroll(c.Key("apps-scroll")).Grow(1).MinHeight(0).Children(func() {
		ui.Column(c).Padding(t.S5, t.S6, t.S7, t.S6).Children(func() {
			ui.Column(c.Key("apps-col")).Gap(t.S4).Width(pastMeasure).MaxWidthPercent(100).AlignSelf(ui.Center).Children(func() {
				ui.Column(c.Key("apps-head")).Gap(t.S1).Padding(0, t.S1).Children(func() {
					uiText(c.Key("apps-h"), autospace(a.L.T("apps.title"))).Font(t.Display).FontSize(t.XL).FontWeight(800).TextColor(t.Ink).Role(ui.RoleHeading)
					if len(apps) > 0 {
						uiText(c.Key("apps-sub"), keepWords(autospace(a.L.T("apps.sub", a.appsPartner())))).FontSize(t.MD).TextColor(t.InkMuted)
					}
				})
				if d := sh.deleted; d != nil {
					a.shelfUndo(c, d)
				}
				if len(apps) == 0 {
					a.shelfEmpty(c)
					return
				}
				tw := a.shelfTileWidth()
				ui.Row(c.Key("apps-grid")).Gap(t.S4).Wrap().AlignItems(ui.Stretch).Children(func() {
					for i := range apps {
						a.shelfTile(c, &apps[i], tw)
					}
				})
			})
		})
	})
}

// shelfUndo is the line a delete leaves: 删掉了「…」 and 撤销 / Undo.
func (a *App) shelfUndo(c *ui.Context, d *protocol.AppMeta) {
	t := a.T
	ui.Row(c.Key("apps-undo")).Gap(t.S3).Padding(t.S2, t.S2, t.S2, t.S4).AlignItems(ui.Center).Radius(t.RadiusMD).
		Background(t.Sunken).Role(ui.RoleStatus).Children(func() {
		uiText(c, keepWords(autospace(a.L.T("apps.deleted", d.Name)))).FontSize(t.MD).TextColor(t.InkSoft).Grow(1).Shrink(1).MinWidth(0)
		if a.buttonFor(c, a.L.T("apps.undo"), d.Name, btnSecondary, t.ControlSM, t.Sunken) {
			a.send(protocol.AppIDReq{T: "app_restore", ID: d.ID})
			a.shelf.deleted = nil
		}
	})
}

// shelfEmpty invites the first one: what goes here, and what to say.
func (a *App) shelfEmpty(c *ui.Context) {
	t := a.T
	ui.Column(c.Key("apps-empty")).Gap(t.S4).Padding(t.S6, t.S6).Radius(t.RadiusLG).Background(t.Surface).
		Shadow(0, t.Raised.Y, 0, 0, t.Raised.Color).Children(func() {
		ui.Row(c.Key("e-head")).Gap(t.S4).AlignItems(ui.Center).Children(func() {
			ui.Row(c.Key("e-tiles")).Gap(t.S1).Shrink(0).AccessHidden(true).Children(func() {
				for i, icon := range []string{"coins", "check", "list"} {
					m := protocol.AppMeta{ID: "e" + icon, Icon: icon, Tint: []string{"sand", "sage", "mist"}[i]}
					a.appClay(c, "e-tile:"+icon, 44, &m, false)
				}
			})
			ui.Column(c).Gap(2).Grow(1).Shrink(1).MinWidth(0).Children(func() {
				uiText(c, keepWords(autospace(a.L.T("apps.empty.h", a.appsPartner())))).Font(t.Display).FontSize(t.LG).FontWeight(800).TextColor(t.Ink)
				uiText(c, keepWords(autospace(a.L.T("apps.empty.body")))).FontSize(t.MD).TextColor(t.InkMuted).LineHeight(a.leading(1.5))
			})
		})
		ideas := a.S.AppIdeas
		if len(ideas) == 0 {
			return
		}
		uiText(c.Key("e-try"), a.L.T("apps.empty.try")).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted)
		ui.Column(c.Key("e-ideas")).Gap(t.S2).Children(func() {
			for i, idea := range ideas {
				if i >= 3 {
					break
				}
				a.shelfIdea(c, i, idea)
			}
		})
	})
}

// shelfIdea is one thing to say: its tile, the words, why this one; a click
// says it, as the person's own, in the conversation.
func (a *App) shelfIdea(c *ui.Context, i int, idea protocol.AppIdea) {
	t := a.T
	say := wordsIn(a.L, idea.Say)
	b := ui.Row(c.Key("idea:"+itoa(int64(i)))).Gap(t.S3).Padding(t.S3, t.S4, t.S3, t.S3).AlignItems(ui.Center).Radius(t.RadiusMD).
		Background(t.SurfaceSunken).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(say).Focusable()
	switch {
	case b.Pressed():
		b.Background(t.SurfaceSunken.Mix(t.Ink, 0.06))
	case b.Hovered():
		b.Background(t.SurfaceSunken.Mix(t.Surface, 0.4))
	}
	b.Children(func() {
		m := protocol.AppMeta{ID: "idea" + itoa(int64(i)) + idea.Icon, Icon: idea.Icon}
		a.appClay(c, "tile", 34, &m, false)
		ui.Column(c).Gap(2).Grow(1).Shrink(1).MinWidth(0).Children(func() {
			uiText(c, a.L.T("apps.idea.quote", say)).FontSize(t.MD).FontWeight(700).TextColor(t.Ink).MinWidth(0).AccessHidden(true)
			if idea.Why != nil {
				uiText(c.Key("why"), autospace(wordsIn(a.L, *idea.Why))).FontSize(t.SM).TextColor(t.InkMuted)
			}
		})
	})
	if b.Clicked() {
		a.Route = RouteConversation
		a.sendWords(say)
	}
}

// wordsIn is w in the UI's language (D292: through the table, never a branch).
func wordsIn(l *i18n.Strings, w protocol.Words) string {
	return firstNonEmpty(i18n.Pick(l, map[string]string{"zh": w.ZH, "en": w.EN}), w.EN, w.ZH)
}

// shelfTileWidth fits as many tiles of about shelfTileW as the place
// holds, the row filled edge to edge.
func (a *App) shelfTileWidth() float32 {
	t := a.T
	avail := float32(pastMeasure)
	if a.winW > 0 {
		avail = min(avail, a.winW-2*t.S6)
	}
	cols := max(1, int((avail+t.S4)/(shelfTileW-24+t.S4)))
	return (avail - t.S4*float32(cols-1)) / float32(cols)
}

// shelfTile is one app on the shelf: its tile, its name, its own line,
// who keeps it or when it changed; a click opens it; 「⋯」 the rest.
func (a *App) shelfTile(c *ui.Context, m *protocol.AppMeta, width float32) {
	t := a.T
	sh := &a.shelf
	id := m.ID
	card := ui.Column(c.Key("tile:"+id)).Width(width).Gap(t.S2).Padding(t.S4).Radius(t.RadiusLG).Background(t.Surface).
		Shadow(0, t.Raised.Y, 0, 0, t.Raised.Color).Role(ui.RoleGroup).Label(m.Name)
	card.Children(func() {
		ui.Row(c.Key("top")).Gap(t.S2).AlignItems(ui.Start).Children(func() {
			face := ui.Box(c.Key("open-face")).Cursor(ui.CursorPointer).Shrink(0).Children(func() {
				a.appClay(c, "tile", 52, m, false)
			})
			if face.Clicked() {
				a.openApp(id)
			}
			ui.Spacer(c)
			if m.Pinned {
				ui.Row(c.Key("pinned")).Gap(4).Padding(2, 8, 2, 6).Radius(t.Pill).Background(t.Highlight).AlignItems(ui.Center).Shrink(0).Children(func() {
					a.pinGlyph(c, 12, t.HighlightInk)
					uiText(c, a.L.T("apps.pinned")).FontSize(t.XS).FontWeight(700).TextColor(t.HighlightInk).SingleLine()
				})
			}
			a.appMore(c, m, false)
		})
		if sh.renaming == id {
			a.shelfRename(c, m)
		} else {
			// D418: the name over what the app says of itself, which leads.
			name := uiText(c.Key("name"), autospace(m.Name)).Font(t.Display).FontSize(t.MD).FontWeight(800).TextColor(t.InkSoft).
				MaxLines(2).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(spoken(a.L, a.L.T("app.open"), m.Name)).Focusable()
			if name.Clicked() {
				a.openApp(id)
			}
		}
		if m.Summary != "" {
			uiText(c.Key("sum"), autospace(m.Summary)).Font(t.Display).FontSize(t.LG).FontWeight(800).TextColor(t.Ink).FontFeatures("tnum").MaxLines(2)
		} else if m.Opened == "" {
			uiText(c.Key("never"), a.L.T("apps.never")).FontSize(t.XS).TextColor(t.InkMuted)
		}
		ui.Spacer(c)
		// D418: one state line (who keeps it current and when next, being
		// changed, broken, the old look; else when it changed), and when the
		// state asks for something, the one button that does it.
		a.appStateLine(c, "state", m)
		if label, run := a.appStateAction(m); label != "" {
			ui.Row(c.Key("act")).Children(func() {
				if a.buttonFor(c, label, m.Name, btnSecondary, t.ControlSM, t.Surface) {
					run()
				}
			})
		}
		if sh.asking == id {
			a.shelfConfirm(c, m)
		}
	})
}

// shelfRename is the name in a field, in place: Enter or 保存 keeps it.
func (a *App) shelfRename(c *ui.Context, m *protocol.AppMeta) {
	t := a.T
	sh := &a.shelf
	ui.Row(c.Key("rename")).Gap(t.S2).AlignItems(ui.Center).Children(func() {
		in := ui.TextInput(c.Key("rename-in"), &sh.name).Label(a.L.T("apps.m.rename")).AutoFocus().Grow(1).MinWidth(0).
			Height(t.ControlSM).Padding(0, t.S3).Radius(t.RadiusSM).Background(t.SurfaceSunken).FontSize(t.MD)
		save := a.buttonFor(c, a.L.T("apps.rename.save"), m.Name, btnPrimary, t.ControlSM, t.Surface)
		if save || in.Submitted() {
			name := strings.TrimSpace(sh.name)
			if name != "" && name != m.Name {
				a.send(protocol.AppSetReq{T: "app_set", ID: m.ID, Name: &name})
				m.Name = name
				for i := range a.S.Apps {
					if a.S.Apps[i].ID == m.ID {
						a.S.Apps[i].Name = name
					}
				}
			}
			sh.renaming = ""
		}
	})
}

// shelfConfirm asks before a delete, on the tile: what goes with it.
func (a *App) shelfConfirm(c *ui.Context, m *protocol.AppMeta) {
	t := a.T
	ui.Column(c.Key("confirm")).Gap(t.S2).Padding(t.S3).Radius(t.RadiusMD).Background(t.Failed.Surface).Role(ui.RoleAlert).Children(func() {
		uiText(c, keepWords(autospace(a.L.T("apps.del.q", m.Name)))).FontSize(t.MD).FontWeight(800).TextColor(t.Failed.Ink)
		uiText(c, keepWords(autospace(a.L.T("apps.del.body")))).FontSize(t.SM).TextColor(t.Failed.Ink)
		ui.Row(c.Key("acts")).Gap(t.S2).Justify(ui.End).Children(func() {
			if a.buttonFor(c, a.L.T("apps.del.no"), m.Name, btnSecondary, t.ControlSM, t.Failed.Surface) {
				a.shelf.asking = ""
			}
			if a.buttonFor(c, a.L.T("apps.del.go"), m.Name, btnPrimary, t.ControlSM, t.Failed.Surface) {
				a.deleteApp(m)
			}
		})
	})
}

// deleteApp sends the delete and leaves 撤销 under the heading.
func (a *App) deleteApp(m *protocol.AppMeta) {
	sh := &a.shelf
	gone := *m
	a.send(protocol.AppIDReq{T: "app_remove", ID: m.ID})
	keep := a.S.Apps[:0:0]
	for _, x := range a.S.Apps {
		if x.ID != m.ID {
			keep = append(keep, x)
		}
	}
	a.S.Apps = keep
	sh.asking, sh.deleted, sh.deletedAt = "", &gone, a.Now()
}

// appMore is an app's 「⋯」 (on its tile, and in its own window's head):
// rename, ask the partner to change it, undo the last change, pin, stop a
// routine updating it, delete.
func (a *App) appMore(c *ui.Context, m *protocol.AppMeta, inWindow bool) {
	t := a.T
	id, name := m.ID, m.Name
	b := ui.Box(c.Key("more:"+id)).Size(t.ControlSM, t.ControlSM).Radius(a.buttonRadius(t.ControlSM)).Label(a.L.T("apps.more", name)).
		Tooltip(a.L.T("apps.more", name)).Role(ui.RoleButton).Cursor(ui.CursorPointer).Focusable().Shrink(0)
	fg := a.buttonLook(c, b, btnText, t.ControlSM, t.Surface)
	b.Draw(drawMore(fg))
	b.Menu(func(mn *ui.Menu) {
		if mn.Item(a.L.T("apps.m.rename")).Chosen() {
			if inWindow {
				a.OpenApps()
				if a.ShowMain != nil {
					a.ShowMain()
				}
			}
			a.shelf.renaming, a.shelf.name = id, name
		}
		if mn.Item(a.L.T("apps.m.change", a.appsPartner())).Chosen() {
			a.openAppAsk(id)
		}
		if m.Back && mn.Item(a.L.T("app.back")).Chosen() {
			a.send(protocol.AppIDReq{T: "app_back", ID: id})
		}
		mn.Separator()
		pin, to := a.L.T("apps.m.pin"), true
		if m.Pinned {
			pin, to = a.L.T("apps.m.unpin"), false
		}
		if mn.Item(pin).Chosen() {
			a.send(protocol.AppSetReq{T: "app_set", ID: id, Pinned: &to})
			if x := a.appByID(id); x != nil {
				x.Pinned = to
			}
		}
		if m.Task != nil && mn.Item(a.L.T("apps.m.untask", m.Task.Title)).Chosen() {
			a.send(protocol.AppSetReq{T: "app_set", ID: id, Untask: true})
		}
		mn.Separator()
		if mn.Item(a.L.T("apps.m.delete")).Chosen() {
			if inWindow {
				a.OpenApps()
				if a.ShowMain != nil {
					a.ShowMain()
				}
			}
			a.shelf.asking = id
		}
	})
}

// openAppAsk opens the app with its edit box ready for words.
func (a *App) openAppAsk(id string) {
	if w := a.appWins[id]; w != nil {
		w.focusAsk = true
	} else {
		a.wantAsk = id
	}
	a.openApp(id)
}

// ---------- in the conversation ----------

// appPins are the pinned apps as small chips under the bar: one line, a
// click opens the app.
func (a *App) appPins(c *ui.Context) {
	var pins []protocol.AppMeta
	for _, m := range a.shelfApps() {
		if m.Pinned {
			pins = append(pins, m)
		}
	}
	if len(pins) == 0 {
		return
	}
	t := a.T
	ui.Row(c.Key("apppins-row")).Justify(ui.Center).Padding(t.S1, t.S5, t.S1, t.S5).Children(func() {
		ui.Row(c.Key("apppins")).Grow(1).MaxWidth(convWidth).Gap(t.S2).AlignItems(ui.Center).Clip().Children(func() {
			for i := range pins {
				m := &pins[i]
				chip := ui.Row(c.Key("apppin:"+m.ID)).Gap(t.S2).Padding(4, 12, 4, 4).Radius(t.Pill).Background(t.Surface).
					Shadow(0, 2, 0, 0, t.Line).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(a.L.T("board.open", m.Name)).Focusable().Shrink(0)
				if chip.Hovered() {
					chip.Background(t.Surface.Mix(t.SurfaceSunken, 0.5))
				}
				chip.Children(func() {
					a.appClay(c, "tile", 26, m, false)
					uiText(c, autospace(m.Name)).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine().AccessHidden(true)
				})
				if chip.Clicked() {
					a.openApp(m.ID)
				}
			}
		})
	})
}

// shelfCard is the card under the partner's words when the person asked
// where their apps are (ai_msg.shelf): up to three tiles, how many, and
// 打开「你的小应用」.
func (a *App) shelfCard(c *ui.Context, key string) {
	t := a.T
	apps := a.shelfApps()
	count := a.L.T("apps.card.none")
	switch n := len(apps); {
	case n == 1:
		count = a.L.T("apps.card.one")
	case n > 1:
		count = a.L.T("apps.card.n", n)
	}
	ui.Row(c.Key("shelfcard:"+key)).MaxWidth(420).MaxWidthPercent(84).Padding(t.S3).Gap(t.S3).AlignItems(ui.Center).Radius(t.RadiusMD).
		Background(t.Surface).Shadow(0, t.Raised.Y, 0, 0, t.Raised.Color).Role(ui.RoleGroup).Label(a.L.T("apps.title")).Children(func() {
		ui.Row(c.Key("tiles")).Gap(t.S1).Shrink(0).AccessHidden(true).Children(func() {
			if len(apps) == 0 {
				a.appClay(c, "t0", 40, nil, true)
			}
			for i := range apps {
				if i >= 3 {
					break
				}
				a.appClay(c, "t"+itoa(int64(i)), 40, &apps[i], false)
			}
		})
		ui.Column(c.Key("w")).Grow(1).Shrink(1).MinWidth(0).Gap(2).Children(func() {
			uiText(c, autospace(a.L.T("apps.title"))).FontSize(t.MD).FontWeight(800).TextColor(t.Ink).SingleLine()
			uiText(c, autospace(count)).FontSize(t.SM).TextColor(t.InkMuted).SingleLine()
		})
		if a.buttonFor(c, a.L.T("apps.card.open"), "", btnSecondary, t.ControlSM, t.Surface) {
			a.OpenApps()
		}
	})
}
