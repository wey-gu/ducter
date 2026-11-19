package views

// D381: 置顶 / Pinned. A table, chart or list from a reply, kept at the top
// of the conversation and kept current: the card's corner pins it (or says
// 已置顶 and opens the sheet); the strip under the bar names the newest one,
// a list's progress beside it; the sheet draws each pin whole, its ticks the
// home's, 取消置顶 under it. The web draws the same (apps/web/src/pins.tsx).
// Facts are separate elements (D291), never joined.

import (
	"fmt"
	"slices"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

type pinsState struct {
	open bool
	// focus is the pin the sheet opened on.
	focus string
}

// pinsShown is what is pinned in the conversation shown (the default
// partner's only).
func (a *App) pinsShown() []protocol.PinView {
	if a.shownPartnerID() != protocol.DefaultPartner {
		return nil
	}
	return a.S.Pins
}

// pinOf is the pin a block stands for now: the sheet's own, or the current
// one whose newest message this block is in.
func (a *App) pinOf(at richAt) *protocol.PinView {
	if at.sheet != nil {
		return at.sheet
	}
	if at.seq <= 0 {
		return nil
	}
	return protocol.PinAt(a.pinsShown(), at.seq, at.index)
}

// pinTicks is a pinned list's ticked items, as indexes into items.
func pinTicks(p *protocol.PinView, items []string) []int {
	var on []int
	for i, x := range items {
		if slices.Contains(p.Ticks, x) {
			on = append(on, i)
		}
	}
	return on
}

// tickPin ticks or unticks a pinned list's item: shown at once, the home's
// answer follows to every device.
func (a *App) tickPin(p *protocol.PinView, item string, on bool) {
	ticks := slices.DeleteFunc(slices.Clone(p.Ticks), func(x string) bool { return x == item })
	if on {
		ticks = append(ticks, item)
	}
	var next []string
	for _, x := range p.UI.Items {
		if slices.Contains(ticks, x) {
			next = append(next, x)
		}
	}
	p.Ticks = next
	a.send(protocol.PinTick{T: "pin_tick", ID: p.ID, Item: item, On: on})
}

// openPins shows the pinned sheet, on pin id.
func (a *App) openPins(id string) {
	a.pins.open, a.pins.focus = true, id
}

// pinGlyph is the pushpin, drawn (never an emoji): a head, its collar and
// the needle, in a 16-unit box.
func (a *App) pinGlyph(c *ui.Context, size float32, col ui.Color) {
	ui.Box(c).Size(size, size).Shrink(0).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
		s := r.W / 16
		at := func(x, y float32) (float32, float32) { return r.X + x*s, r.Y + y*s }
		var m ui.Path
		m.MoveTo(at(5.2, 2)).LineTo(at(10.8, 2))
		m.MoveTo(at(6.3, 2)).LineTo(at(6.3, 5.8)).LineTo(at(4.2, 8.9)).LineTo(at(11.8, 8.9)).LineTo(at(9.7, 5.8)).LineTo(at(9.7, 2))
		m.MoveTo(at(8, 8.9)).LineTo(at(8, 14))
		p.StrokePath(&m, 1.7*s, col)
	})
}

// richHead is a block's title with its corner (D381): 置顶 / Pin, or
// 已置顶 / Pinned when it is a pin now.
func (a *App) richHead(c *ui.Context, title string, at richAt) {
	b := at.block
	if b == nil || at.sheet != nil || !protocol.Pinnable(b.Type) || a.shownPartnerID() != protocol.DefaultPartner {
		a.richTitle(c, title)
		return
	}
	pin := a.pinOf(at)
	if pin == nil && protocol.PinWas(a.pinsShown(), at.seq, at.index) {
		a.richTitle(c, title) // an older version of a pin: no corner of its own
		return
	}
	t := a.T
	ui.Row(c.Key("head")).Gap(t.S2).AlignItems(ui.Start).Children(func() {
		ui.Column(c).Grow(1).MinWidth(0).Children(func() { a.richTitle(c, title) })
		label, fg := a.L.T("pin.pin"), t.InkMuted
		about := a.L.T("pin.pin")
		if pin != nil {
			label, fg, about = a.L.T("pin.pinned"), t.HighlightInk, a.L.T("pin.open", pin.Title)
		} else if title != "" {
			about = a.L.T("pin.pin.about", title)
		}
		btn := ui.Row(c.Key("pin")).Height(28).Padding(0, 9, 0, 7).Gap(4).AlignItems(ui.Center).Radius(t.Pill).Shrink(0).
			Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(about).Focusable()
		if pin != nil {
			btn.Background(t.Highlight).Shadow(0, 2, 0, 0, t.Line2)
		} else if btn.Hovered() {
			btn.Background(t.Sunken)
			fg = t.InkSoft
		}
		btn.Children(func() {
			a.pinGlyph(c, 16, fg)
			ui.Text(c, label).FontSize(t.SM).FontWeight(700).TextColor(fg).SingleLine().AccessHidden(true)
		})
		if btn.Clicked() {
			if pin != nil {
				a.openPins(pin.ID)
			} else {
				a.send(protocol.Pin{T: "pin", Seq: at.seq, Index: at.index})
			}
		}
	})
}

// pinStrip is the strip under the bar: the newest pin's name, a list's
// progress, how many more. A tap opens the sheet.
func (a *App) pinStrip(c *ui.Context) {
	if a.S.PinRefused != "" {
		a.toast(a.L.T("pin.refused."+a.S.PinRefused, protocol.PinsMax))
		a.S.PinRefused = ""
	}
	pins := a.pinsShown()
	if len(pins) == 0 {
		return
	}
	t := a.T
	top := pins[0]
	ui.Row(c.Key("pinstrip-row")).Justify(ui.Center).Padding(t.S1+2, t.S5, t.S1, t.S5).Children(func() {
		// Keyed by the pin and its version: it settles in again when the partner changes it.
		strip := ui.Row(c.Key(fmt.Sprintf("pinstrip:%s:%d", top.ID, top.Version))).Grow(1).MaxWidth(convWidth).MinHeight(44).
			Padding(6, 14, 6, 8).Gap(t.S2).AlignItems(ui.Center).Radius(t.RadiusMD).Background(t.Surface).
			Shadow(0, t.Raised.Y, 0, 0, t.Raised.Color).Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(a.L.T("pin.open", top.Title)).Focusable()
		a.enter(c, strip)
		strip.Children(func() {
			ui.Box(c).Size(30, 30).Shrink(0).Radius(10).Background(t.Highlight).Shadow(0, 2, 0, 0, t.Line2).Justify(ui.Center).AlignItems(ui.Center).Children(func() {
				a.pinGlyph(c, 16, t.HighlightInk)
			})
			ui.Text(c, top.Title).Font(t.Display).FontSize(t.MD).FontWeight(800).TextColor(t.Ink).SingleLine().Grow(1).MinWidth(0).AccessHidden(true)
			if done, total, ok := protocol.PinProgress(top); ok {
				col := t.InkMuted
				if done == total {
					col = t.Done.Ink
				}
				ui.Text(c.Key("prog"), a.L.T("pin.progress", done, total)).FontSize(t.SM).FontWeight(700).TextColor(col).FontFeatures("tnum").Shrink(0).AccessHidden(true)
			}
			if more := len(pins) - 1; more > 0 {
				ui.Row(c.Key("more")).Padding(2, 8).Radius(t.Pill).Background(t.Sunken).Shrink(0).Children(func() {
					ui.Text(c, a.L.T("pin.more", more)).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).SingleLine().AccessHidden(true)
				})
			}
		})
		if strip.Clicked() {
			a.openPins(top.ID)
		}
	})
}

// pinsSheet is 置顶 / Pinned over the window: every pin whole, newest
// first; 取消置顶 under each; the one line on how to change one.
func (a *App) pinsSheet(c *ui.Context) {
	p := &a.pins
	pins := a.pinsShown()
	if !p.open || len(pins) == 0 {
		p.open = false
		return
	}
	t := a.T
	w, h := c.Size()
	if w <= 0 {
		w, h = 1040, 760
	}
	title := a.L.T("pin.title")
	open := true
	ui.DialogBase(c, &open, func(back, panel ui.Element) {
		back.Background(t.Scrim)
		panel.Width(min(w-2*t.S6, 640)).MaxHeight(sheetBack(c, back, h)).Radius(t.RadiusXL).Background(t.Bg).Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Label(title)
		a.enter(c, panel)
		ui.Row(c.Key("pins-head")).Gap(t.S3).AlignItems(ui.Center).Padding(t.S5, t.S6, t.S2, t.S6).Children(func() {
			ui.Box(c).Size(32, 32).Shrink(0).Radius(10).Background(t.Highlight).Shadow(0, 2, 0, 0, t.Line2).Justify(ui.Center).AlignItems(ui.Center).Children(func() {
				a.pinGlyph(c, 16, t.HighlightInk)
			})
			a.heading(c, title, t.XL).Shrink(1).MinWidth(0)
			ui.Spacer(c)
			if a.button(c, a.L.T("pile.close.x"), btnText, t.ControlMD, t.Bg) {
				p.open = false
			}
		})
		ui.Scroll(c.Key("pins-scroll")).Grow(1).MinHeight(0).Children(func() {
			ui.Column(c).Padding(t.S1, t.S6, t.S5, t.S6).Gap(t.S4).Children(func() {
				for i := range pins {
					pin := &pins[i]
					ui.Column(c.Key("pin:" + pin.ID)).Gap(6).Role(ui.RoleGroup).Label(pin.Title).Children(func() {
						b := pin.UI
						a.richBlock(c, &b, richAt{key: "pinb:" + pin.ID, seq: pin.Seq, index: pin.Index, sheet: pin})
						ui.Row(c.Key("foot")).Gap(t.S2).AlignItems(ui.Center).Padding(0, 4).Children(func() {
							when := a.L.T("pin.at", a.whenOf(pin.At))
							if pin.Updated != "" {
								when = a.L.T("pin.updated", a.whenOf(pin.Updated))
							}
							ui.Text(c.Key("when"), when).FontSize(t.SM).TextColor(t.InkMuted).Grow(1).MinWidth(0)
							if a.button(c, a.L.T("pin.unpin"), btnText, t.ControlSM, t.Bg) {
								a.send(protocol.Unpin{T: "unpin", ID: pin.ID})
								a.toast(a.L.T("pin.unpinned", pin.Title))
								a.S.Pins = slices.DeleteFunc(slices.Clone(a.S.Pins), func(x protocol.PinView) bool { return x.ID == pin.ID })
							}
						})
					})
				}
				ui.Text(c.Key("hint"), a.L.T("pin.hint", a.personaName())).FontSize(t.SM).TextColor(t.InkMuted).LineHeight(1.45)
			})
		})
	})
	if !open {
		p.open = false
	}
}
