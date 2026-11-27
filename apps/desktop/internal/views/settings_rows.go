package views

import (
	"math"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
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
			uiText(c, keepClauses(title)).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).LineHeight(a.leading(1.4)).Role(ui.RoleHeading)
		}
		if note != "" {
			uiText(c, keepClauses(note)).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
		}
	})
}

// paperNote is a note on the paper after a section's group, on the text edge.
func (a *App) paperNote(c *ui.Context, text string) {
	t := a.T
	uiText(c, keepClauses(text)).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted).Padding(0, t.S5)
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
		// D501: with nothing to draw (Partner's 还没有能想事情的 AI agent) the words sit on the
		// text edge, as on the web, never beside an empty tile column.
		if tile != nil {
			a.tileCol(c, tile)
		}
		a.wordsThenControl(c, func() {
			uiText(c, keepClauses(name)).Font(t.Display).FontSize(t.LG).FontWeight(800).LineHeight(1.3)
			if line != "" {
				w := 600
				if tone == sideMuted {
					w = 500
				}
				uiText(c, keepClauses(line)).FontSize(t.SM).FontWeight(w).LineHeight(a.leading(1.5)).TextColor(a.sideInk(tone))
			}
		}, control)
	})
}

// tileRow is one row on the text column: the tile column (tile may be
// nil), a title 15/700, one muted line, its control at the right edge.
func (a *App) tileRow(c *ui.Context, key string, tile func(), title, line string, control func()) {
	t := a.T
	a.sep(c)
	ui.Row(c.Key("trow:"+key)).Gap(t.S3).Padding(t.S4, t.S5).MinHeight(64).AlignItems(ui.Center).Children(func() {
		a.tileCol(c, tile)
		a.wordsThenControl(c, func() {
			if title != "" {
				uiText(c, keepClauses(title)).FontSize(t.MD).FontWeight(700).LineHeight(a.leading(1.4))
			}
			if line != "" {
				uiText(c, keepClauses(line)).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
			}
		}, control)
	})
}

// pickCol is the tile column of a group whose only tile is what the person picked (D556): New
// tasks start shows the chosen agent's coin, and while both are 自动 nothing, so the group has
// no column at all and its words sit on the text edge (never beside an empty column, as
// headRow, D501). A pick opens the column in every row of the group with the Across spring,
// the coin coming in with it: the words move over together, the pick arriving. Reduced
// motion: at once.
func (a *App) pickCol(c *ui.Context, key string, col bool, tile func()) {
	t := a.T
	// The coin waits for the words to clear its place, then comes in.
	an := t.Nav.Across
	an.Delay = 120 * time.Millisecond
	in := ui.ElementTransition{Animation: &an, Enter: &ui.Motion{Y: 6, Scale: 0.8}}
	if c.Preferences().ReduceMotion {
		in = ui.ElementTransition{Duration: -1}
	}
	w := float32(0)
	if col {
		w = 40 + t.S3
	}
	ui.Row(c.Key("pcol:" + key)).Width(w).Shrink(0).AlignItems(ui.Center).Children(func() {
		if tile != nil {
			ui.Row(c.Key("ptile:" + key)).Width(40).Shrink(0).Justify(ui.Center).AlignItems(ui.Center).Transition(in).Children(tile)
		}
	})
}

// pickMove is how what follows pickCol moves when the column opens or closes: its left edge
// slides and its right edge stays, so the words travel and the control at the right edge stands.
func (a *App) pickMove(c *ui.Context) ui.ElementTransition {
	if c.Preferences().ReduceMotion {
		return ui.ElementTransition{Duration: -1}
	}
	return ui.ElementTransition{Animation: &a.T.Nav.Across, Position: true, Width: true}
}

// choiceRow is tileRow with pickCol's column: there only while col (some row of the group has
// its picked tile).
func (a *App) choiceRow(c *ui.Context, key string, col bool, tile func(), title, line string, control func()) {
	t := a.T
	a.sep(c)
	ui.Row(c.Key("prow:"+key)).Padding(t.S4, t.S5).MinHeight(64).AlignItems(ui.Center).Children(func() {
		a.pickCol(c, key, col, tile)
		ui.Row(c.Key("pwords:" + key)).Grow(1).Basis(0).MinWidth(0).AlignItems(ui.Center).Transition(a.pickMove(c)).Children(func() {
			a.wordsThenControl(c, func() {
				uiText(c, keepClauses(title)).FontSize(t.MD).FontWeight(700).LineHeight(a.leading(1.4))
				if line != "" {
					uiText(c, keepClauses(line)).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
				}
			}, control)
		})
	})
}

// pickFoot is footRow (no actions) with pickCol's column.
func (a *App) pickFoot(c *ui.Context, key, note string, col bool) {
	t := a.T
	a.sep(c)
	ui.Row(c.Key("foot:"+key)).Padding(t.S3, t.S5, t.S4, t.S5).MinHeight(56).AlignItems(ui.Center).Children(func() {
		a.pickCol(c, key+":foot", col, nil)
		uiText(c.Key("pwords:"+key+":foot"), keepClauses(note)).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted).Grow(1).Basis(0).MinWidth(0).Transition(a.pickMove(c))
	})
}

// rowWordsMin is the least width a row's words keep beside its control
// (D445): narrower, the control drops under the words on the text column,
// as a phone's row does (D273), never squeezing the words to a letter a line
// (To-do sources' three-way choices did at the window's narrowest, 760).
const rowWordsMin = 160

// wordsThenControl is a row's words and its control after the tile column:
// side by side, the control at the right edge, while the words keep
// rowWordsMin; else the control wraps under them on the same text edge.
func (a *App) wordsThenControl(c *ui.Context, words func(), control func()) {
	t := a.T
	if control == nil {
		ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).Children(words)
		return
	}
	outer := ui.Row(c).Grow(1).Basis(0).MinWidth(0).Wrap().Gap(t.S3).AlignItems(ui.Center)
	// D468: the width a dropped control may take (last frame's), so a choice
	// of a few can stack its options when even that is too narrow.
	prev, prevRow := a.ctlAvail, a.ctlRow
	a.ctlAvail = outer.LayoutBounds().W
	outer.Children(func() {
		ui.Column(c).Grow(1).Basis(rowWordsMin).MinWidth(0).Gap(2).Children(words)
		ctl := ui.Row(c).Shrink(0).MaxWidthPercent(100).Gap(t.S2).AlignItems(ui.Center)
		a.ctlRow = &ctl
		ctl.Children(control)
	})
	a.ctlAvail, a.ctlRow = prev, prevRow
}

// paneWait is a pane still being read (D432): the shape of its first group,
// a soft sunken square in the tile column and the word on the text column,
// so the page never jumps from a bare line on the paper to its cards. The
// web's `Waiting` (set-grid.tsx). D445: the square breathes as the web's
// does (its tint toward the card's surface and back, every 1.6 s), so a
// pane that is reading looks alive, not stuck; still under reduced motion.
func (a *App) paneWait(c *ui.Context, key, text string) {
	t := a.T
	tint := t.SurfaceSunken
	if !c.Preferences().ReduceMotion {
		tint = t.SurfaceSunken.Mix(t.Surface, waitBreath(c.Now()))
		c.After(50 * time.Millisecond)
	}
	a.group(c, "wait:"+key, "", "", func() {
		a.tileRow(c, "wait:"+key, func() {
			ui.Box(c.Key("wait-tile")).Width(40).Height(40).Radius(t.RadiusSM).Background(tint).AccessHidden(true)
		}, "", text, nil)
	})
}

// waitBreathPeriod is one breath of a waiting pane's square: the web's
// own-pulse (1.6 s), out of the reading rhythm.
const waitBreathPeriod = 1600 * time.Millisecond

// waitBreath is how far the square has faded toward the surface at now:
// 0 at the start of a breath, 0.65 at its middle (the web's 0.35 opacity).
func waitBreath(now time.Time) float32 {
	ph := float64(now.UnixMilli()%waitBreathPeriod.Milliseconds()) / float64(waitBreathPeriod.Milliseconds())
	return 0.65 * 0.5 * float32(1-math.Cos(2*math.Pi*ph))
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
// column, its quiet actions at the right edge. D468: as every row (D445),
// the actions go under the note once it would keep less than rowWordsMin
// beside them; at 760 OOMOL's and Tuwa's two actions had squeezed their
// note to a word a line.
func (a *App) footRow(c *ui.Context, key, note string, actions func()) {
	t := a.T
	a.sep(c)
	ui.Row(c.Key("foot:"+key)).Gap(t.S3).Padding(t.S3, t.S5, t.S4, t.S5).MinHeight(56).AlignItems(ui.Center).Children(func() {
		ui.Box(c).Width(40).Shrink(0)
		if actions == nil {
			uiText(c, keepClauses(note)).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted).Grow(1).Basis(0).MinWidth(0)
			return
		}
		a.wordsThenControl(c, func() {
			uiText(c, keepClauses(note)).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
		}, func() {
			prev := a.settings.trailAlign
			a.settings.trailAlign = true
			actions()
			a.settings.trailAlign = prev
		})
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
		uiText(c, ask).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.Ink).Grow(1).Basis(0).MinWidth(0)
		ui.Row(c).Shrink(0).Gap(t.S1).AlignItems(ui.Center).Children(func() {
			k = a.quietButton(c, "confirm-keep:"+key, keep, about, false, 0)
			prev := a.settings.trailAlign
			a.settings.trailAlign = true
			g = a.dangerText(c, "confirm-go:"+key, goLabel, about)
			a.settings.trailAlign = prev
		})
	})
	return k, g
}

// confirmLine is confirmRow outside a settings group (D602: 结束任务 under a
// task's head): the question, then the quiet Keep and the action in the
// failed ink, on one line with no rule and no tile column.
func (a *App) confirmLine(c *ui.Context, key, ask, keep, goLabel, about string) (bool, bool) {
	t := a.T
	var k, g bool
	ui.Row(c.Key("confirmline:" + key)).Gap(t.S3).MinHeight(t.ControlSM).AlignItems(ui.Center).MinWidth(0).Children(func() {
		uiText(c, ask).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.Ink).Grow(1).Basis(0).MinWidth(0)
		ui.Row(c).Shrink(0).Gap(t.S1).AlignItems(ui.Center).Children(func() {
			k = a.quietButton(c, "confirm-keep:"+key, keep, about, false, 0)
			prev := a.settings.trailAlign
			a.settings.trailAlign = true
			g = a.dangerText(c, "confirm-go:"+key, goLabel, about)
			a.settings.trailAlign = prev
		})
	})
	return k, g
}

// clayTile is clay art fitted in the 40 tile column; faded, a thing not
// there yet: grey, never see-through (D374, theme.FadedClay).
func (a *App) clayTile(c *ui.Context, art string, faded bool) func() {
	return func() {
		bmp := theme.Clay(art)
		if faded {
			bmp = theme.FadedClay(art, a.T)
		}
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
		ui.Image(c, bmp).Size(w, h).AccessHidden(true)
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

// brandTile is a third-party product's own mark (D314), drawn faithfully at
// 24 on the small white clay tile; an app whose mark is its app icon
// (Nowledge Mem) shows that icon as the tile itself, at 40. Faded: the
// product not set up yet: the mark's shape in the muted ink on the same
// tile, an app icon grey (D374, theme.FadedBrand), never see-through.
func (a *App) brandTile(c *ui.Context, name string, faded bool) func() {
	t := a.T
	return func() {
		src := theme.Brand(name)
		if src != nil && faded {
			src = theme.FadedBrand(name, t)
		}
		if src == nil {
			// D622: a product with no faithful mark yet (Feishu / Lark keeps its F) keeps a
			// letter on the same white clay tile, never a blank one (todo.md's owed marks).
			letter := "?"
			if runes := []rune(strings.TrimSpace(name)); len(runes) > 0 {
				letter = strings.ToUpper(string(runes[0]))
			}
			ink := t.Ink
			if faded {
				ink = t.InkMuted
			}
			ui.Row(c.Key("ltile:"+name)).Size(40, 40).Radius(t.RadiusSM).Background(t.Surface).Border(1, t.LineSoft).
				Shadow(0, 2, 0, 0, t.Line).Justify(ui.Center).AlignItems(ui.Center).AccessHidden(true).Children(func() {
				uiText(c, letter).FontSize(t.LG).FontWeight(800).TextColor(ink).LineHeight(1)
			})
			return
		}
		if _, ok := src.(*ui.Bitmap); ok {
			ui.Image(c.Key("brand:"+name), src).Size(40, 40).Radius(t.RadiusSM).AccessHidden(true)
			return
		}
		ui.Row(c.Key("btile:"+name)).Size(40, 40).Radius(t.RadiusSM).Background(t.Surface).Border(1, t.LineSoft).
			Shadow(0, 2, 0, 0, t.Line).Justify(ui.Center).AlignItems(ui.Center).AccessHidden(true).Children(func() {
			ui.Image(c, src).Size(24, 24)
		})
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
	a.rowHover(c, b, groundNeutral(), false) // D529
	b.Children(func() {
		a.tileCol(c, func() { a.glyph(c, 18, drawPlus(t.InkSoft)) })
		ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).AccessHidden(true).Children(func() {
			uiText(c, keepClauses(title)).FontSize(t.MD).FontWeight(700).LineHeight(a.leading(1.4))
			if line != "" {
				uiText(c, keepClauses(line)).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
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
	return a.openRowOn(c, key, tile, false, title, line, lineInk, open, control)
}

// openRowOn is openRow; bare (D582) draws no tile column, so a list with no
// mark to draw (Memory's 你喜欢的做法) keeps its titles on the text edge, as
// a headRow with no tile does (D501).
func (a *App) openRowOn(c *ui.Context, key string, tile func(), bare bool, title, line string, lineInk ui.Color, open bool, control func()) bool {
	t := a.T
	a.sep(c)
	clicked := false
	ui.Row(c.Key("orow:"+key)).Gap(t.S3).Padding(t.S2, t.S5, t.S2, t.S4).MinHeight(64).AlignItems(ui.Center).Children(func() {
		b := ui.Row(c.Key("orow-b:"+key)).Grow(1).Basis(0).MinWidth(0).Gap(t.S3).Padding(t.S2, t.S2).Radius(t.RadiusMD).AlignItems(ui.Center).
			Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(title + ", " + line).Expanded(open).Focusable()
		a.rowHover(c, b, groundNeutral(), false) // D529
		b.Children(func() {
			if !bare || tile != nil {
				a.tileCol(c, tile)
			}
			ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).AccessHidden(true).Children(func() {
				ui.Row(c).Gap(t.S1).AlignItems(ui.Center).Children(func() {
					uiText(c, keepClauses(title)).FontSize(t.MD).FontWeight(700).LineHeight(a.leading(1.4)).SingleLine().Shrink(1).MinWidth(0)
					a.glyph(c, 12, drawChevron(t.InkMuted, open))
				})
				if line != "" {
					uiText(c, line).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(lineInk).SingleLine()
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
	uiText(c, text).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).Padding(t.S1, t.S2).Radius(t.RadiusXS).Background(t.SurfaceSunken).SingleLine()
}

// quietDanger is a destructive action before it is confirmed (断开 Tuwa,
// 停用 OOMOL): quiet text in the soft ink, the failed ink and its tint
// only under the pointer. Its confirmation is dangerText, in confirmRow.
func (a *App) quietDanger(c *ui.Context, key, label, about string) bool {
	t := a.T
	acc := spoken(a.L, label, about) // D291, as dangerText
	b := ui.Row(c.Key(key)).Height(t.ControlSM-4).Padding(0, t.S2).Radius(t.RadiusSM).AlignItems(ui.Center).Cursor(ui.CursorPointer).
		Role(ui.RoleButton).Label(acc).Focusable().Shrink(0)
	if a.settings.trailAlign {
		// D618: in a card's foot, the words—not the tap padding—end on the switches' edge
		// (D582: the padding stays; the row's padding takes it).
		b.Margin(0, -t.S2, 0, t.S2)
	}
	ink := t.InkSoft
	if b.Hovered() || b.Pressed() {
		b.Background(t.Failed.Surface)
		ink = t.Failed.Ink
	}
	b.Children(func() {
		uiText(c, label).FontSize(t.SM).FontWeight(700).TextColor(ink).SingleLine().AccessHidden(true)
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
	a.rowHover(c, b, groundNeutral(), false) // D529
	b.Children(func() {
		a.tileCol(c, tile)
		ui.Column(c).Grow(1).Basis(0).MinWidth(0).Gap(2).AccessHidden(true).Children(func() {
			uiText(c, keepClauses(title)).FontSize(t.MD).FontWeight(700).LineHeight(a.leading(1.4))
			if line != "" {
				uiText(c, keepClauses(line)).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.InkMuted)
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

// listWords is a list of names of one kind in the reader's language
// (Gmail、Slack / Gmail, Slack): a list, never facts joined with " · ".
func (a *App) listWords(items []string) string {
	return strings.Join(items, a.L.T("acct.sep"))
}

// saidFor is how long the partner's word after a change stays.
const saidFor = 4 * time.Second

// saidWord is one word the partner answers a change with: what, and when.
type saidWord struct {
	text string
	at   time.Time
	// wear: the partner itself speaking after a change to it (D565): its
	// figure in its clay stands where the pebble pops in.
	wear string
}

// say keeps the partner's word for a change, for saidLine to show.
func (a *App) say(key, text string) {
	if a.settings.said == nil {
		a.settings.said = map[string]saidWord{}
	}
	a.settings.said[key] = saidWord{text: text, at: a.Now()}
}

// sayAs is say, said by a partner in its own figure (D565).
func (a *App) sayAs(key, text, wear string) {
	a.say(key, text)
	w := a.settings.said[key]
	w.wear = wear
	a.settings.said[key] = w
}

// sayAfter keeps the partner's word until the home's next settings frame proves the change landed
// (D296): a trust change is never confirmed on the tap alone. want reads the state the home just sent.
func (a *App) sayAfter(key, text string, want func(*protocol.Settings) bool) {
	a.settings.saidPending = append(a.settings.saidPending, saidPendingWord{key: key, text: text, want: want, at: a.Now()})
}

// flushSaidAfter says the owed words once, and drops words whose answer never came: a silent change
// over something else is worse than saying nothing (D296).
func (a *App) flushSaidAfter() {
	if len(a.settings.saidPending) == 0 {
		return
	}
	st := a.S.Settings
	rest := a.settings.saidPending[:0]
	for _, p := range a.settings.saidPending {
		if a.Now().Sub(p.at) > 15*time.Second {
			continue
		}
		if p.want != nil && (st == nil || !p.want(st)) {
			rest = append(rest, p)
			continue
		}
		a.say(p.key, p.text)
	}
	a.settings.saidPending = rest
}

// flushRuleRemove says a removed rule's word once the home's rules frame no longer has it (D296).
func (a *App) flushRuleRemove() {
	q := a.settings.ruleAsked
	if q == nil {
		return
	}
	for _, r := range a.S.Rules {
		if r.ID == q.id {
			return // the home still has it: the removal didn't land, so nothing is said
		}
	}
	a.settings.ruleAsked = nil
	a.say("tasks-rule", a.L.T("loadout.rule.removed", q.words))
}

// saidLine is the partner's one word after a change you made (D296): a
// small clay pebble pops in on the done ink, then the line in its voice
// in the soft ink, on the text edge; it settles away by itself after a
// few seconds. Never a toast, never what a switch already shows: only
// where the change has a consequence worth hearing.
func (a *App) saidLine(c *ui.Context, key string) {
	a.saidLineAt(c, key, a.T.S5)
}

// saidLineIn is the partner's word inside a group, under the row it is
// about, on the group's text column: where the person's eyes are when a
// row's switch moved, not under a long group's last line, past the window's
// edge (the Mac walk of 0.0.98).
func (a *App) saidLineIn(c *ui.Context, key string) {
	t := a.T
	if w, ok := a.settings.said[key]; !ok || w.text == "" || a.Now().Sub(w.at) >= saidFor {
		a.saidLine(c, key) // forgets it once it has settled
		return
	}
	ui.Row(c.Key("said-in:"+key)).Gap(t.S3).Padding(0, t.S5, t.S3, t.S5).Children(func() {
		ui.Box(c).Width(40).Shrink(0)
		a.saidLineAt(c, key, 0)
	})
}

func (a *App) saidLineAt(c *ui.Context, key string, pad float32) {
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
	row := ui.Row(c.Key("said:"+key)).Gap(t.S2).Padding(0, pad).AlignItems(ui.Center).
		Transition(ui.ElementTransition{Animation: &an, ExitDuration: t.Nav.Leave, Enter: &ui.Motion{Y: 4}, Exit: &ui.Motion{}}).
		Role(ui.RoleStatus).Label(text)
	row.Children(func() {
		dot := ui.Box(c.Key("said-dot:"+key)).Size(12, 12).Shrink(0).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
			clayDot(p, r.X+r.W/2, r.Y+r.H/2, 4.5, t.Done.Ink, t.Done.Ink.Mix(t.Ink, 0.35), t.Done.Surface)
		})
		if w.wear != "" {
			dot = ui.Box(c.Key("said-face:" + key)).Shrink(0).AccessHidden(true).Children(func() { a.stone(c, "said-"+key, w.wear, 18) })
		}
		if !c.Preferences().ReduceMotion {
			pop := t.Bouncy
			dot.Transition(ui.ElementTransition{Animation: &pop, Enter: &ui.Motion{Scale: 0.2}})
		}
		uiText(c, text).FontSize(t.SM).FontWeight(600).TextColor(t.InkSoft).LineHeight(a.leading(1.5)).AccessHidden(true)
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
