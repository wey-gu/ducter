package views

// D456 (design/sessions.md "Keys"): every key in one place, and the opened
// task's place among what is on hand. 键盘 / Keyboard (⌘/) lists the keys by
// where they work, the same rows as the web's apps/web/src/keymap.tsx; the
// task's bar carries ‹ 3 / 9 › with the steps to the task before and after
// (⌘⇧[ ⌘⇧]); ⌃1–⌃9 open the first to ninth task of On hand.

import (
	"fmt"
	"strings"

	"github.com/egoist/mygo/ui"
)

// keymapRow is one key: its words' key and the keys ("\r" is Return, drawn).
type keymapRow struct{ words, keys string }

// keymap is the list by where the keys work (the web's KEYMAP, row for row).
var keymap = []struct {
	group string
	rows  []keymapRow
}{
	{"keys.g.any", []keymapRow{
		{"keys.find", "⌘K"}, {"keys.new", "⌘N"}, {"keys.conv", "⌘1"}, {"keys.onhand", "⌘2"}, {"keys.devices", "⌘3"},
		{"keys.past", "⌘Y"}, {"keys.settings", "⌘,"}, {"keys.nth", "⌃1–⌃9"}, {"keys.partner", "⌥⌘1–⌥⌘4"}, {"keys.up", "esc"}, {"keys.this", "⌘/"}, {"keys.density", "⌘⇧D"},
	}},
	{"keys.g.task", []keymapRow{{"keys.walk", "⌘⇧[ ⌘⇧]"}, {"keys.bench", "⌥⌘B"}}},
	{"keys.g.find", []keymapRow{
		{"keys.rows", "⌃N ⌃P"}, {"keys.open", "\r"}, {"keys.continue", "⌘\r"}, {"keys.redo", "⌥\r"}, {"keys.seed", "⇧⌘\r"},
	}},
}

// taskKeys: ⌃1–⌃9 open the nth task on hand; ⌘/ shows or hides the keys.
func (a *App) taskKeys(c *ui.Context) {
	if c.Shortcut(ui.Cmd, ui.KeySlash) {
		a.keysOpen = !a.keysOpen
		return
	}
	nums := []ui.Key{ui.Key1, ui.Key2, ui.Key3, ui.Key4, ui.Key5, ui.Key6, ui.Key7, ui.Key8, ui.Key9}
	for i, k := range nums {
		if c.Shortcut(ui.Ctrl, k) {
			if o := a.railOrder(); i < len(o) && (a.Route != RouteTask || a.TaskID != o[i]) {
				a.oh.focus = o[i]
				a.oh.walked = o[i]
				a.OpenTask(o[i])
			}
			return
		}
	}
}

// taskNav is ‹ 3 / 9 › in the task's bar: where it sits among what is on
// hand, the steps to the one before and after. Nothing when it is alone.
func (a *App) taskNav(c *ui.Context, id string) {
	t := a.T
	o := a.railOrder()
	i := -1
	for n, x := range o {
		if x == id {
			i = n
		}
	}
	if i < 0 || len(o) < 2 {
		return
	}
	ui.Row(c.Key("tv-nav")).Height(t.ControlSM).Padding(0, 2).Gap(2).Radius(t.ControlSM / 2).Background(t.SurfaceSunken).AlignItems(ui.Center).Shrink(0).
		Role(ui.RoleGroup).Label(a.L.T("tv.pos", i+1, len(o))).Children(func() {
		step := func(key string, by int, can bool, label, keys string) {
			b := ui.Box(c.Key(key)).Size(28, 28).Radius(14).Shrink(0).Role(ui.RoleButton).Label(label).Tooltip(label + " (" + keys + ")")
			ink := t.InkSoft
			if !can {
				ink = t.InkMuted.Alpha(0.4)
			} else {
				b.Cursor(ui.CursorPointer).Focusable()
				if b.Hovered() {
					b.Background(t.Surface)
					ink = t.Ink
				}
			}
			b.Draw(func(p *ui.Painter, r ui.Rect) {
				cx, cy := r.X+r.W/2, r.Y+r.H/2
				var m ui.Path
				d := float32(by)
				m.MoveTo(cx-1.5*d, cy-3.5)
				m.LineTo(cx+2*d, cy)
				m.LineTo(cx-1.5*d, cy+3.5)
				p.StrokePath(&m, 1.8, ink)
			})
			if can && b.Clicked() {
				a.WalkTask(by)
			}
		}
		step("prev", -1, i > 0, a.L.T("tv.prev"), "⌘⇧[")
		ui.Row(c.Key("pos")).Gap(3).Padding(0, 2).AccessHidden(true).Children(func() {
			uiText(c.Key("n"), fmt.Sprint(i+1)).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).SingleLine()
			uiText(c.Key("s"), "/").FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
			uiText(c.Key("m"), fmt.Sprint(len(o))).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
		})
		step("next", 1, i < len(o)-1, a.L.T("tv.next"), "⌘⇧]")
	})
}

// keysSheet is 键盘 / Keyboard while it shows: every key, by where it works.
func (a *App) keysSheet(c *ui.Context) {
	if !a.keysOpen {
		return
	}
	t := a.T
	w, h := c.Size()
	ui.DialogBase(c, &a.keysOpen, func(back, panel ui.Element) {
		back.Background(t.Scrim)
		if c.Shortcut(0, ui.KeyEscape) || c.Shortcut(ui.Cmd, ui.KeySlash) {
			a.keysOpen = false
			return
		}
		panel.Width(min(w-2*t.S6, 520)).MaxHeight(sheetBack(c, back, h)).Radius(t.RadiusXL).Background(t.Surface).
			Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Label(a.L.T("keys.title"))
		ui.Scroll(c.Key("keys-scroll")).MaxHeight(max(200, h-160)).Children(func() {
			ui.Column(c.Key("keys")).Padding(t.S5, t.S6).Gap(t.S1).Children(func() {
				uiText(c.Key("title"), a.L.T("keys.title")).Font(t.Display).FontSize(t.XL).FontWeight(700).TextColor(t.Ink)
				for _, g := range keymap {
					uiText(c.Key("g:"+g.group), a.L.T(g.group)).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Padding(t.S4, 0, t.S1, 0)
					for _, r := range g.rows {
						ui.Row(c.Key("r:" + r.words)).Height(36).Gap(t.S4).AlignItems(ui.Center).Children(func() {
							uiText(c.Key("w"), a.L.T(r.words)).FontSize(t.SM).TextColor(t.Ink).Grow(1).Shrink(1).MinWidth(0).SingleLine()
							ui.Row(c.Key("k")).Gap(4).Shrink(0).Children(func() {
								for i, k := range strings.Split(r.keys, " ") {
									a.keycap(c, fmt.Sprint(i), k)
								}
							})
						})
					}
				}
				uiText(c.Key("loose"), a.L.T("keys.loose")).FontSize(t.SM).TextColor(t.InkMuted).Padding(t.S4, 0, 0, 0)
			})
		})
	})
}
