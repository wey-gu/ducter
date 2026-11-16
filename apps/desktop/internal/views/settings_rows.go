package views

import (
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"

	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D289: D273's settings grid on the Mac, one set of pieces every pane
// uses. Two edges only: the card's edge and the text edge (24 in, where
// every row's 40 tile column and words start and where section headers
// and notes on the paper sit). One row anatomy: an optional 40 tile, a
// title, one muted line, the control at the right edge. A group's last
// line holds its quiet note and its quiet actions; a destructive action is
// quiet until hovered and asks in place before it acts.

// sectionHead is a section's header on the paper: 13/700 in the soft ink,
// its note under it in 13 muted, both on the text edge, never a second
// title under the tab's own.
func (a *App) sectionHead(c *ui.Context, title, note string) {
	t := a.T
	if title == "" && note == "" {
		return
	}
	ui.Column(c).Gap(2).Padding(0, t.S5).Children(func() {
		if title != "" {
			ui.Text(c, title).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).LineHeight(a.leading(1.4)).Role(ui.RoleHeading)
		}
		if note != "" {
			ui.Text(c, note).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
		}
	})
}

// paperNote is a note on the paper after a section's group, on the text edge.
func (a *App) paperNote(c *ui.Context, text string) {
	t := a.T
	ui.Text(c, text).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted).Padding(0, t.S5)
}

// tileCol is a row's 40 tile column: the tile, or nothing, so the words
// keep the text edge.
func (a *App) tileCol(c *ui.Context, tile func()) {
	ui.Row(c).Width(40).Shrink(0).Justify(ui.Center).AlignItems(ui.Center).Children(func() {
		if tile != nil {
			tile()
		}
	})
}

// headRow is a group's first row when the group is one thing (a
// connection, a chat app): its tile, its name 18/800, one line of how it
// stands in that state's ink, and an optional control at the right edge.
func (a *App) headRow(c *ui.Context, key string, tile func(), name, line string, tone sideTone, control func()) {
	t := a.T
	a.sep(c)
	ui.Row(c.Key("head:"+key)).Gap(t.S3).Padding(t.S4, t.S5).MinHeight(72).AlignItems(ui.Center).Children(func() {
		a.tileCol(c, tile)
		ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).Children(func() {
			ui.Text(c, name).Font(t.Display).FontSize(t.LG).FontWeight(800).LineHeight(1.3)
			if line != "" {
				w := 600
				if tone == sideMuted {
					w = 500
				}
				ui.Text(c, line).FontSize(t.SM).FontWeight(w).LineHeight(a.leading(1.5)).TextColor(a.sideInk(tone))
			}
		})
		if control != nil {
			ui.Row(c).Shrink(0).Gap(t.S2).AlignItems(ui.Center).Children(control)
		}
	})
}

// tileRow is one row on the text column: the tile column (tile may be
// nil), a title 15/700, one muted line, its control at the right edge.
func (a *App) tileRow(c *ui.Context, key string, tile func(), title, line string, control func()) {
	t := a.T
	a.sep(c)
	ui.Row(c.Key("trow:"+key)).Gap(t.S3).Padding(t.S4, t.S5).MinHeight(64).AlignItems(ui.Center).Children(func() {
		a.tileCol(c, tile)
		ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).Children(func() {
			if title != "" {
				ui.Text(c, title).FontSize(t.MD).FontWeight(700).LineHeight(a.leading(1.4))
			}
			if line != "" {
				ui.Text(c, line).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
			}
		})
		if control != nil {
			ui.Row(c).Shrink(0).Gap(t.S2).AlignItems(ui.Center).Children(control)
		}
	})
}

// textBlock is a block of a group on the text column (past the tile
// column), the hairline above: a list, a form, what a row opened.
func (a *App) textBlock(c *ui.Context, key string, body func()) {
	t := a.T
	a.sep(c)
	ui.Row(c.Key("tblock:"+key)).Gap(t.S3).Padding(t.S4, t.S5).Children(func() {
		ui.Box(c).Width(40).Shrink(0)
		ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(t.S3).Children(body)
	})
}

// footRow is a group's last line (D283): its one quiet note on the text
// column, its quiet actions at the right edge.
func (a *App) footRow(c *ui.Context, key, note string, actions func()) {
	t := a.T
	a.sep(c)
	ui.Row(c.Key("foot:"+key)).Gap(t.S3).Padding(t.S3, t.S5, t.S4, t.S5).MinHeight(56).AlignItems(ui.Center).Children(func() {
		ui.Box(c).Width(40).Shrink(0)
		ui.Text(c, note).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted).Grow(1).Basis(0).MinWidth(0)
		if actions != nil {
			ui.Row(c).Shrink(0).Gap(t.S1).AlignItems(ui.Center).Children(actions)
		}
	})
}

// confirmRow is a destructive action asking in place, as the group's last
// line: the question on the text column, the quiet Keep and the action in
// the failed ink at the right edge. It reports keep and go.
func (a *App) confirmRow(c *ui.Context, key, ask, keep, goLabel, about string) (bool, bool) {
	t := a.T
	var k, g bool
	a.sep(c)
	ui.Row(c.Key("confirm:"+key)).Gap(t.S3).Padding(t.S3, t.S5, t.S4, t.S5).MinHeight(56).AlignItems(ui.Center).Children(func() {
		ui.Box(c).Width(40).Shrink(0)
		ui.Text(c, ask).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.Ink).Grow(1).Basis(0).MinWidth(0)
		ui.Row(c).Shrink(0).Gap(t.S1).AlignItems(ui.Center).Children(func() {
			k = a.quietButton(c, "confirm-keep:"+key, keep, about, false, 0)
			g = a.dangerText(c, "confirm-go:"+key, goLabel, about)
		})
	})
	return k, g
}

// clayTile is clay art fitted in the 40 tile column; faded, a thing not
// there yet.
func (a *App) clayTile(c *ui.Context, art string, faded bool) func() {
	return func() {
		bmp := theme.Clay(art)
		if bmp == nil {
			return
		}
		iw, ih := ui.ImageSize(bmp)
		w, h := float32(40), float32(40)
		if iw > 0 && ih > 0 {
			if iw > ih {
				h = 40 * ih / iw
			} else {
				w = 40 * iw / ih
			}
		}
		img := ui.Image(c, bmp).Size(w, h).AccessHidden(true)
		if faded {
			img.Opacity(0.5)
		}
	}
}

// markTile is a drawn mark on a small white clay tile in the tile column
// (an app's mark, a mailbox).
func (a *App) markTile(c *ui.Context, key string, draw func(p *ui.Painter, r ui.Rect)) func() {
	t := a.T
	return func() {
		ui.Box(c.Key("mtile:"+key)).Size(40, 40).Radius(t.RadiusSM).Background(t.Surface).Border(1, t.LineSoft).
			Shadow(0, 2, 0, 0, t.Line).Draw(draw).AccessHidden(true)
	}
}

// glyphTile is a drawn glyph alone in the tile column (a check, a ＋).
func (a *App) glyphTile(c *ui.Context, size float32, draw func(p *ui.Painter, r ui.Rect)) func() {
	return func() { a.glyph(c, size, draw) }
}

// addRow is a group's add row (D273): a drawn ＋ in the tile column with
// no tile under it, the title, one line; the whole row is the button.
func (a *App) addRow(c *ui.Context, key, title, line string) bool {
	t := a.T
	a.sep(c)
	b := ui.Row(c.Key("add:"+key)).Gap(t.S3).Padding(t.S4, t.S5).MinHeight(60).AlignItems(ui.Center).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(title).Focusable()
	switch {
	case b.Pressed():
		b.Background(t.Ink.Alpha(0.06))
	case b.Hovered():
		b.Background(t.Ink.Alpha(0.03))
	}
	b.Children(func() {
		a.tileCol(c, func() { a.glyph(c, 18, drawPlus(t.InkSoft)) })
		ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).AccessHidden(true).Children(func() {
			ui.Text(c, title).FontSize(t.MD).FontWeight(700).LineHeight(a.leading(1.4))
			if line != "" {
				ui.Text(c, line).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
			}
		})
	})
	return b.Clicked()
}

// openRow is a tile row that opens more under it (a service of a
// connection, a step of a setup): its tile, words and chevron are the
// button; a control (a switch) may stand at the right edge apart from it.
// It reports a click on the button.
func (a *App) openRow(c *ui.Context, key string, tile func(), title, line string, lineInk ui.Color, open bool, control func()) bool {
	t := a.T
	a.sep(c)
	clicked := false
	ui.Row(c.Key("orow:"+key)).Gap(t.S3).Padding(t.S2, t.S5, t.S2, t.S4).MinHeight(64).AlignItems(ui.Center).Children(func() {
		b := ui.Row(c.Key("orow-b:"+key)).Grow(1).Basis(0).MinWidth(0).Gap(t.S3).Padding(t.S2, t.S2).Radius(t.RadiusMD).AlignItems(ui.Center).
			Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(title + " · " + line).Expanded(open).Focusable()
		switch {
		case b.Pressed():
			b.Background(t.Ink.Alpha(0.06))
		case b.Hovered():
			b.Background(t.Ink.Alpha(0.03))
		}
		b.Children(func() {
			a.tileCol(c, tile)
			ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).AccessHidden(true).Children(func() {
				ui.Row(c).Gap(t.S1).AlignItems(ui.Center).Children(func() {
					ui.Text(c, title).FontSize(t.MD).FontWeight(700).LineHeight(a.leading(1.4)).SingleLine().Shrink(1).MinWidth(0)
					a.glyph(c, 12, drawChevron(t.InkMuted, open))
				})
				if line != "" {
					ui.Text(c, line).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(lineInk).SingleLine()
				}
			})
		})
		clicked = b.Clicked()
		if control != nil {
			ui.Row(c).Shrink(0).Gap(t.S2).AlignItems(ui.Center).Children(control)
		}
	})
	return clicked
}

// quietTag is a short state word at a row's right edge (即将推出 / Coming
// soon): a sunken chip, never pressable.
func (a *App) quietTag(c *ui.Context, text string) {
	t := a.T
	ui.Text(c, text).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).Padding(t.S1, t.S2).Radius(t.RadiusXS).Background(t.SurfaceSunken).SingleLine()
}

// quietDanger is a destructive action before it is confirmed (断开 Tuwa,
// 停用 OOMOL): quiet text in the soft ink, the failed ink and its tint
// only under the pointer. Its confirmation is dangerText, in confirmRow.
func (a *App) quietDanger(c *ui.Context, key, label, about string) bool {
	t := a.T
	acc := label
	if about != "" {
		acc += " · " + about
	}
	b := ui.Row(c.Key(key)).Height(t.ControlSM-4).Padding(0, t.S2).Radius(t.RadiusSM).AlignItems(ui.Center).Cursor(ui.CursorPointer).
		Role(ui.RoleButton).Label(acc).Focusable().Shrink(0)
	ink := t.InkSoft
	if b.Hovered() || b.Pressed() {
		b.Background(t.Failed.Surface)
		ink = t.Failed.Ink
	}
	b.Children(func() {
		ui.Text(c, label).FontSize(t.SM).FontWeight(700).TextColor(ink).SingleLine().AccessHidden(true)
	})
	return b.Clicked()
}

// ---------- D296: pieces every pane shares ----------

// tileLinkRow is a row that goes somewhere else in the app (or, out, to a
// page outside it), with its tile in the tile column: the whole row is the
// button, a chevron (or an arrow out) at its end. The row a pane points
// elsewhere with (AI accounts to Devices, your details to their sheet) is
// this one, never a bare link or a title with its list in brackets.
func (a *App) tileLinkRow(c *ui.Context, key string, tile func(), title, line string, out bool) bool {
	t := a.T
	a.sep(c)
	b := ui.Row(c.Key("tlink:"+key)).Gap(t.S3).Padding(t.S4, t.S5).MinHeight(64).AlignItems(ui.Center).
		Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(title).Focusable()
	switch {
	case b.Pressed():
		b.Background(t.Ink.Alpha(0.06))
	case b.Hovered():
		b.Background(t.Ink.Alpha(0.03))
	}
	b.Children(func() {
		a.tileCol(c, tile)
		ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).AccessHidden(true).Children(func() {
			ui.Text(c, title).FontSize(t.MD).FontWeight(700).LineHeight(a.leading(1.4))
			if line != "" {
				ui.Text(c, line).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
			}
		})
		mark := drawChevron(t.InkMuted, false)
		if out {
			mark = drawOut(t.InkMuted)
		}
		a.glyph(c, 16, mark)
	})
	return b.Clicked()
}

// coinsTile is the AI agents' own coins, two overlapped in the tile
// column: the literal things an AI accounts row is about.
func (a *App) coinsTile(c *ui.Context, key string) func() {
	return func() {
		const s = float32(27) // as the Connected AI agents tab's two coins (D257)
		ui.Box(c.Key("coins:"+key)).Size(40, 40).AccessHidden(true).Children(func() {
			for i, h := range []string{"coin_claude_code", "coin_codex"} {
				if bmp := theme.Clay(h); bmp != nil {
					ui.Image(c, bmp).Size(s, s).Absolute().Left(float32(i) * (40 - s)).Top(float32(i) * (40 - s))
				}
			}
		})
	}
}

// listWords is a list of names of one kind in the reader's language
// (Gmail、Slack / Gmail, Slack): a list, never facts joined with " · ".
func (a *App) listWords(items []string) string {
	if a.L != nil && a.L.Lang == i18n.EN {
		return strings.Join(items, ", ")
	}
	return strings.Join(items, "、")
}

// saidFor is how long the partner's word after a change stays.
const saidFor = 4 * time.Second

// saidWord is one word the partner answers a change with: what, and when.
type saidWord struct {
	text string
	at   time.Time
}

// say keeps the partner's word for a change, for saidLine to show.
func (a *App) say(key, text string) {
	if a.settings.said == nil {
		a.settings.said = map[string]saidWord{}
	}
	a.settings.said[key] = saidWord{text, a.Now()}
}

// saidLine is the partner's one word after a change you made (D296): a
// small clay pebble pops in on the done ink, then the line in its voice
// in the soft ink, on the text edge; it settles away by itself after a
// few seconds. Never a toast, never what a switch already shows: only
// where the change has a consequence worth hearing.
func (a *App) saidLine(c *ui.Context, key string) {
	t := a.T
	w, ok := a.settings.said[key]
	text := w.text
	if !ok || text == "" {
		return
	}
	left := saidFor - a.Now().Sub(w.at)
	if left <= 0 {
		delete(a.settings.said, key)
		return
	}
	c.After(left)
	an := t.Nav.Across
	row := ui.Row(c.Key("said:"+key)).Gap(t.S2).Padding(0, t.S5).AlignItems(ui.Center).
		Transition(ui.ElementTransition{Animation: &an, ExitDuration: t.Nav.Leave, Enter: &ui.Motion{Y: 4}, Exit: &ui.Motion{}}).
		Role(ui.RoleStatus).Label(text)
	row.Children(func() {
		dot := ui.Box(c.Key("said-dot:"+key)).Size(12, 12).Shrink(0).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
			clayDot(p, r.X+r.W/2, r.Y+r.H/2, 4.5, t.Done.Ink, t.Done.Ink.Mix(t.Ink, 0.35), t.Done.Surface)
		})
		if !c.Preferences().ReduceMotion {
			pop := t.Bouncy
			dot.Transition(ui.ElementTransition{Animation: &pop, Enter: &ui.Motion{Scale: 0.2}})
		}
		ui.Text(c, text).FontSize(t.SM).FontWeight(600).TextColor(t.InkSoft).LineHeight(a.leading(1.5)).AccessHidden(true)
	})
}

// drawCardMark is a payment card: a rounded card with its stripe.
func drawCardMark(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		l, rt, top, bot, k := cx-7, cx+7, cy-5, cy+5, float32(2)
		m.MoveTo(l+k, top)
		m.LineTo(rt-k, top)
		m.QuadTo(rt, top, rt, top+k)
		m.LineTo(rt, bot-k)
		m.QuadTo(rt, bot, rt-k, bot)
		m.LineTo(l+k, bot)
		m.QuadTo(l, bot, l, bot-k)
		m.LineTo(l, top+k)
		m.QuadTo(l, top, l+k, top)
		m.Close()
		m.MoveTo(cx-7, cy-1.6)
		m.LineTo(cx+7, cy-1.6)
		m.MoveTo(cx-4, cy+2.4)
		m.LineTo(cx-1, cy+2.4)
		p.StrokePath(&m, glyphStroke, col)
	}
}

// drawPersonMark is a person: a head and shoulders.
func drawPersonMark(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var m ui.Path
		m.Circle(cx, cy-2.6, 3)
		m.MoveTo(cx-6, cy+6.5)
		m.QuadTo(cx-6, cy+1.6, cx, cy+1.6)
		m.QuadTo(cx+6, cy+1.6, cx+6, cy+6.5)
		p.StrokePath(&m, glyphStroke, col)
	}
}
