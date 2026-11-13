package views

import (
	"strconv"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// The shared controls (design/ui.md "Shared controls"): every button,
// switch, choice, row and chip in a card or a settings page is one of
// these, or of the button family in components.go (button, buttonFor,
// iconButton, navButton), quiet.go (quietButton, quietLink) and the rows
// in settings.go and partner.go. TestSharedControlsOnly fails when a view
// draws a control any other way.

// switchControl is the one switch.
func (a *App) switchControl(c *ui.Context, key, label string, v *bool) bool {
	return ui.Switch(c.Key("sw:"+key), v).Label(label).Changed()
}

// dangerText is the destructive text button: failed ink, flat, a soft tint
// on hover (断开这台 MacBook, a connection's 断开).
func (a *App) dangerText(c *ui.Context, key, label, about string) bool {
	t := a.T
	acc := label
	if about != "" {
		acc += " · " + about
	}
	b := ui.Row(c.Key(key)).Height(t.ControlSM-4).Padding(0, t.S2).Radius(t.RadiusSM).AlignItems(ui.Center).Cursor(ui.CursorPointer).
		Role(ui.RoleButton).Label(acc).Focusable().Shrink(0)
	if b.Hovered() || b.Pressed() {
		b.Background(t.Failed.Surface)
	}
	b.Children(func() {
		ui.Text(c, label).FontSize(t.SM).FontWeight(700).TextColor(t.Failed.Ink).SingleLine().AccessHidden(true)
	})
	return b.Clicked()
}

// moreButton is the one ⋯: it opens more in place (never a floating menu
// inside a card); open shows it pressed.
func (a *App) moreButton(c *ui.Context, key, label string, open bool) bool {
	t := a.T
	b := ui.Row(c.Key(key)).Padding(0, 6).Height(24).Radius(8).AlignItems(ui.Center).Cursor(ui.CursorPointer).
		Role(ui.RoleButton).Label(label).Focusable().Expanded(open).Shrink(0)
	fg := t.InkMuted
	if b.Hovered() || open {
		b.Background(t.Sunken)
		fg = t.Ink
	}
	b.Children(func() {
		ui.Text(c, "⋯").FontSize(t.MD).FontWeight(800).TextColor(fg).AccessHidden(true)
	})
	return b.Clicked()
}

// selectRow is one choice among a few, as a row: in a settings group
// (flat, a soft tint on hover, a check when chosen) or framed (a card of
// its own, its border ink when chosen). It reports a click.
func (a *App) selectRow(c *ui.Context, key, label string, on, framed bool, body func()) bool {
	t := a.T
	b := ui.Row(c.Key(key)).Gap(t.S4).AlignItems(ui.Center).Cursor(ui.CursorPointer).Role(ui.RoleRadio).Label(label).AccessSelected(on).Focusable()
	if framed {
		b.Padding(t.S3).Radius(t.RadiusMD)
		if on {
			b.Border(2, t.Ink)
		} else {
			b.Border(1, t.Line)
		}
	} else {
		b.Padding(t.S4, t.S5)
		if b.Hovered() {
			b.Background(t.Ink.Alpha(0.03))
		}
	}
	b.Children(func() {
		ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(body)
		if on && !framed {
			a.glyph(c, 20, drawCheck(t.Ink))
		}
	})
	return b.Clicked()
}

// disclosureRow is a settings row that opens more under it, a chevron at
// its end. It reports a click.
func (a *App) disclosureRow(c *ui.Context, key, label, help string, open bool) bool {
	t := a.T
	b := ui.Row(c.Key(key)).Gap(t.S4).Padding(t.S4, t.S5).MinHeight(60).AlignItems(ui.Center).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(label).Expanded(open).Focusable()
	if b.Hovered() || b.Pressed() {
		b.Background(t.Ink.Alpha(0.03))
	}
	b.Children(func() {
		ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).Children(func() {
			ui.Text(c, label).FontSize(t.MD).FontWeight(700)
			if help != "" {
				ui.Text(c, help).FontSize(t.SM).TextColor(t.InkMuted)
			}
		})
		a.glyph(c, 16, drawChevron(t.InkMuted, open))
	})
	return b.Clicked()
}

// candRow is one row of 换谁来做's list: the agent's coin, its name and one
// reason; greyed when it can't, 现在 on the current one, an ink ring when
// picked. It reports a pick.
func (a *App) candRow(c *ui.Context, key, harness, name, reason string, off, current, on bool) bool {
	t := a.T
	row := ui.Row(c.Key("cand:"+key)).Gap(t.S3).Padding(t.S2, t.S3).Radius(t.RadiusMD).Background(t.Bg).
		Shadow(0, 3, 0, 0, t.Line).AlignItems(ui.Center).Role(ui.RoleRadio).Label(name + " · " + reason).AccessSelected(on)
	if off || current {
		row.Opacity(map[bool]float32{true: 0.55, false: 1}[off])
	} else {
		row.Cursor(ui.CursorPointer).Focusable()
		a.lift(c, row, 1)
	}
	if on {
		row.InsetShadow(0, 0, 0, 2, t.Ink)
	}
	row.Children(func() {
		if bmp := theme.Clay(coinArt(harness, off)); bmp != nil {
			img := ui.Image(c, bmp).Size(40, 40).Shrink(0).AccessHidden(true)
			if off && !coinKnown(harness) {
				img.Grayscale()
			}
		}
		ui.Column(c).Grow(1).MinWidth(0).Gap(2).AccessHidden(true).Children(func() {
			ui.Text(c, name).FontSize(t.MD).FontWeight(800).SingleLine()
			if reason != "" {
				ui.Text(c, reason).FontSize(t.SM).TextColor(t.InkMuted).MaxLines(2)
			}
		})
		if current {
			ui.Text(c, a.L.T("who.now")).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Shrink(0).AccessHidden(true)
		}
	})
	return !off && !current && row.Clicked()
}

// appTile is one app a source can read (D166): a literal rounded square
// with the app's mark, its label under it (the app, then the account).
// sel: its detail is open under the tray (a white lift); off: not watched
// (faded); grey: unreachable or excluded; add: the dashed tile at the
// tray's end (在 oo 里再连一个). about is the whole name (Slack · Nowledge
// Labs, Inc): what it is called aloud, and on hover when a line is cut
// short (D192). It reports a tap.
func (a *App) appTile(c *ui.Context, key, label, sub, about string, mark func(p *ui.Painter, r ui.Rect), sel, off, grey, add bool) bool {
	t := a.T
	acc := label
	if sub != "" {
		acc += " · " + sub
	}
	if about != "" {
		acc = about
	}
	tile := ui.Column(c.Key("tile:"+key)).Width(appTileW).AlignItems(ui.Center).Gap(4).Padding(t.S2, 2, t.S2, 2).Radius(14).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(acc).Tooltip(acc).Focusable().AccessSelected(sel).Shrink(0)
	switch {
	case sel:
		tile.Background(t.Surface).Shadow(0, 2, 0, 0, t.Line2)
	case tile.Hovered():
		tile.Background(t.Surface.Alpha(0.55))
	}
	tile.Children(func() {
		sq := ui.Box(c.Key("tile-art:"+key)).Size(appTileArt, appTileArt).Radius(12).AccessHidden(true).Shrink(0)
		if add {
			sq.Draw(func(p *ui.Painter, r ui.Rect) {
				p.StrokeDashed(r, t.InkMuted.Alpha(0.6), 12, 1.5)
				cx, cy := r.X+r.W/2, r.Y+r.H/2
				p.Fill(ui.Rect{X: cx - 7, Y: cy - 1, W: 14, H: 2}, t.InkMuted, 1)
				p.Fill(ui.Rect{X: cx - 1, Y: cy - 7, W: 2, H: 14}, t.InkMuted, 1)
			})
		} else {
			sq.Background(t.Surface).Shadow(0, 3, 0, 0, t.Line)
			if tile.Pressed() && !c.Preferences().ReduceMotion {
				sq.Translate(0, 2)
			}
			if off || grey {
				sq.Opacity(0.5)
			}
			sq.Draw(mark)
		}
		lc := t.Ink
		if grey {
			lc = t.InkMuted
		}
		ui.Text(c, label).FontSize(t.XS).FontWeight(700).TextColor(lc).SingleLine().MaxWidth(appTileW - 8).AccessHidden(true)
		if sub != "" {
			ui.Text(c, sub).FontSize(t.XS).TextColor(t.InkMuted).MaxLines(2).TextAlign(ui.Center).MaxWidth(appTileW - 8).AccessHidden(true)
		}
	})
	return tile.Clicked()
}

const (
	appTileW   = 96
	appTileArt = 48
)

// pill is one property of a card that opens a short list under it (New
// task's place, branch, computer, who and when; D185): one height, flat on
// the sunken tint, a caret at its end; open, it stands white with an ink
// hairline, like a chosen choice. body draws what it holds. It returns
// the pill (the list's anchor) and whether it was clicked.
func (a *App) pill(c *ui.Context, key, about string, open bool, body func()) (ui.Element, bool) {
	t := a.T
	e := ui.Row(c.Key(key)).Height(t.ControlSM).Padding(0, t.S3, 0, t.S3).Gap(t.S2).Radius(t.RadiusSM).AlignItems(ui.Center).Shrink(1).MinWidth(0).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(about).Expanded(open).Focusable()
	switch {
	case open:
		e.Background(t.Surface).InsetShadow(0, 0, 0, 1.5, t.Ink)
	case e.Pressed():
		e.Background(t.Line)
	case e.Hovered():
		e.Background(t.SurfaceSunken.Mix(t.Line, 0.5))
	default:
		e.Background(t.SurfaceSunken)
	}
	e.Children(func() {
		body()
		ui.Box(c).Size(10, 10).Shrink(0).Draw(drawCaret(t.InkMuted)).AccessHidden(true)
	})
	return e, e.Clicked()
}

// menuRow is one choice in a list a pill opens: a compact row, a soft tint
// on hover, the chosen one sunken with a check at its end; off is greyed
// and can't be picked. body draws its words. It reports a pick.
func (a *App) menuRow(c *ui.Context, key, label string, on, off bool, body func()) bool {
	t := a.T
	row := ui.Row(c.Key(key)).MinHeight(t.ControlSM).Padding(t.S1+2, t.S3).Gap(t.S3).Radius(t.RadiusSM).AlignItems(ui.Center).
		Role(ui.RoleRadio).Label(label).AccessSelected(on)
	switch {
	case off:
		row.Opacity(0.5)
	case on:
		row.Background(t.SurfaceSunken).Cursor(ui.CursorPointer).Focusable()
	case row.Hovered():
		row.Background(t.SurfaceSunken.Mix(t.Surface, 0.5)).Cursor(ui.CursorPointer).Focusable()
	default:
		row.Cursor(ui.CursorPointer).Focusable()
	}
	row.Children(func() {
		ui.Row(c).Grow(1).MinWidth(0).Gap(t.S3).AlignItems(ui.Center).AccessHidden(true).Children(body)
		if on {
			a.glyph(c, 14, drawCheck(t.Ink))
		}
	})
	return !off && row.Clicked()
}

// choice is one short choice in a row of them (New task's model and
// effort under the chosen agent, D202): the chosen one raised on the
// surface, the others sunken; tag "suggested" (推荐) or "default" (默认)
// beside its words. The web's `Choice`.
func (a *App) choice(c *ui.Context, key, label string, on bool, tag string) bool {
	t := a.T
	row := ui.Row(c.Key(key)).Height(28).Padding(0, t.S2+2).Gap(t.S1 + 1).Radius(t.RadiusSM).AlignItems(ui.Center).
		Role(ui.RoleRadio).Label(label).AccessSelected(on).Cursor(ui.CursorPointer).Focusable()
	if on {
		row.Background(t.Surface).Border(1, t.Line2)
	} else if row.Hovered() {
		row.Background(t.SurfaceSunken.Mix(t.Surface, 0.4))
	} else {
		row.Background(t.SurfaceSunken)
	}
	row.Children(func() {
		w := ui.Text(c, label).FontSize(t.SM).SingleLine().AccessHidden(true)
		if on {
			w.FontWeight(700).TextColor(t.Ink)
		} else {
			w.TextColor(t.InkSoft)
		}
		switch tag {
		case "suggested":
			a.suggestedTag(c)
		case "default":
			ui.Text(c, a.L.T("newtask.effort.default")).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().AccessHidden(true)
		}
	})
	return !on && row.Clicked()
}

// listPanel is the floating list a pill opens: the card's surface, a
// hairline, the floating shadow, its title small above the rows.
func (a *App) listPanel(c *ui.Context, anchor ui.Element, open *bool, title string, width float32, body func()) {
	t := a.T
	ui.PopoverBase(c, anchor, open, func(panel ui.Element) {
		panel.Margin(t.S2, 0, 0, 0).Width(width).Padding(t.S2).Radius(t.RadiusMD).Background(t.Surface).
			Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).Border(1, t.LineSoft).Label(title)
		ui.Text(c, title).FontSize(t.XS).FontWeight(700).TextColor(t.InkMuted).Padding(t.S2, t.S3, t.S1, t.S3)
		ui.Scroll(c.Key("list")).MaxHeight(360).Children(func() {
			ui.Column(c).Gap(2).Role(ui.RoleRadioGroup).Label(title).Children(body)
		})
	})
}

// foldHead is a group's name that folds the group (D244): the drawn
// chevron, the name and its count; it says whether it was pressed. With
// nothing in the group it is the name alone.
func (a *App) foldHead(c *ui.Context, name string, n int, folded bool) bool {
	t := a.T
	fold := ui.Row(c.Key("fold")).Gap(t.S2).AlignItems(ui.Center).Shrink(1).MinWidth(0).Padding(t.S1, t.S2, t.S1, 0).Radius(t.RadiusSM)
	if n > 0 {
		label := a.L.T("onhand.fold.close")
		if folded {
			label = a.L.T("onhand.fold.open")
		}
		fold.Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(label + " " + name).Focusable()
	}
	fold.Children(func() {
		if n > 0 {
			ink := t.InkMuted
			if fold.Hovered() {
				ink = t.Ink
			}
			a.glyph(c, 14, drawChevron(ink, !folded))
		}
		a.heading(c, name, t.XL).SingleLine().Shrink(1).MinWidth(0)
		if n > 0 {
			a.heading(c, strconv.Itoa(n), t.XL).TextColor(t.InkMuted).FontFeatures("tnum")
		}
	})
	return n > 0 && fold.Clicked()
}
