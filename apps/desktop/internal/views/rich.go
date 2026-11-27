package views

import (
	"fmt"
	"slices"
	"strings"

	"github.com/egoist/mygo/ui"
	"github.com/egoist/mygo/ui/markdown"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D303: rich answers in the conversation. A block the partner put in its
// words, drawn from the shared model (protocol.ModelOf, the web's
// richModel): a table is a real table (Role table, rows, cells); a chart is
// a picture whose words are its summary and its values; a checklist's
// ticks stay on this Mac; a choice's tap sends its words as the person's
// reply. The web draws the same blocks (apps/web/src/rich.tsx).

// richAt is where a block stands in the conversation.
type richAt struct {
	key   string
	seq   int64
	index int
	// live: nothing from the person came after the message, so its choices
	// can still be tapped.
	live bool
	// picked is the person's reply right after it.
	picked string
	// block is the block itself; sheet the pin it is drawn as in the
	// pinned sheet (no corner there: Unpin is under it). D381.
	block *protocol.RichUI
	sheet *protocol.PinView
}

// richWords draws a message with blocks: its words in bubbles, each block
// where its plain text stood. The first bubble takes the stacking, the
// reply's imprint and the right-click menu.
func (a *App) richWords(c *ui.Context, e *store.Entry, rt *replyTo) {
	parts := protocol.SplitRich(e.AI.Text, e.AI.UI)
	at := richAt{seq: e.FirstSeq, live: true}
	if next := a.userAfter(e); next != nil {
		at.live, at.picked = false, strings.TrimSpace(next.Text)
	}
	first := true
	for i, p := range parts {
		if p.Block != nil {
			b := at
			b.index, b.key = p.Index, fmt.Sprintf("rich:%d:%d", e.FirstSeq, p.Index)
			a.richBlock(c, p.Block, b)
			continue
		}
		words := p.Words
		join := false
		if first {
			join = a.takeJoin()
		} else {
			a.rp.tab = nil
		}
		menu := rt
		if !first {
			menu = nil
		}
		ui.Box(c.Key(fmt.Sprintf("richw:%d:%d", e.FirstSeq, i))).Children(func() {
			a.partnerBubble(c, join, func() {
				box := ui.Column(c).Selectable().CopyData(autospaceCopy).SelectionColor(a.T.Highlight).MinWidth(0)
				a.replyMenu(c, box, menu, e.AI.Text)
				box.Children(func() { markdown.View(c, mdSpace(words), &a.md) })
			})
		})
		first = false
	}
}

// userAfter is the person's first message after e, if any.
func (a *App) userAfter(e *store.Entry) *protocol.UserMsg {
	seen := false
	for _, x := range a.S.Channel {
		if x == nil {
			continue
		}
		if x == e {
			seen = true
			continue
		}
		if seen && x.User != nil {
			return x.User
		}
	}
	return nil
}

// richCard is the clay card a block sits on: the day card's white on its base.
func (a *App) richCard(c *ui.Context, key, label string) ui.Element {
	t := a.T
	card := ui.Column(c.Key(key)).MaxWidth(560).MaxWidthPercent(84).MinWidth(0).Padding(t.S4).Gap(t.S3).Radius(t.RadiusMD).
		Background(t.Surface).Shadow(0, t.Raised.Y, 0, 0, t.Raised.Color).Role(ui.RoleGroup).Label(label)
	a.enter(c, card)
	return card
}

func (a *App) richTitle(c *ui.Context, s string) {
	if s != "" {
		uiText(c, s).Font(a.T.Display).FontSize(a.T.MD).FontWeight(800).TextColor(a.T.Ink)
	}
}

// richBlock draws one block.
func (a *App) richBlock(c *ui.Context, b *protocol.RichUI, at richAt) {
	m := protocol.ModelOf(b)
	at.block = b
	switch m.Type {
	case "table":
		a.richTable(c, m, at)
	case "chart":
		a.richChart(c, m, at)
	case "checklist":
		a.richChecklist(c, m, at)
	case "choices":
		a.richChoices(c, m, at)
	case "lend":
		a.lendCard(c, at) // D347
	}
}

func (a *App) richTable(c *ui.Context, m protocol.RichModel, at richAt) {
	t := a.T
	label := m.Title
	if label == "" {
		label = a.L.T("rich.table")
	}
	a.richCard(c, at.key, label).Children(func() {
		a.richHead(c, m.Title, at)
		grow := func(j int) float32 {
			if j == 0 {
				return 1.1
			}
			return 1
		}
		cell := func(j int, s string, head bool) {
			al := ui.Start
			if m.Numeric[j] {
				al = ui.End
			}
			role := ui.RoleCell
			if head {
				role = ui.RoleColumnHeader
			} else if j == 0 {
				role = ui.RoleRowHeader
			}
			ui.Column(c).Grow(grow(j)).Basis(0).MinWidth(0).AlignItems(al).Role(role).Label(s).Children(func() {
				w := uiText(c, s).TextAlign(al).AccessHidden(true)
				switch {
				case head:
					w.FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted)
				case j == 0:
					w.FontSize(t.MD).FontWeight(700).TextColor(t.InkSoft)
				default:
					w.FontSize(t.MD).TextColor(t.Ink)
				}
				if m.Numeric[j] {
					w.FontFeatures("tnum")
				}
			})
		}
		ui.Column(c).Role(ui.RoleTable).Label(label).Children(func() {
			ui.Row(c).Gap(t.S3).Padding(0, 0, t.S2, 0).AlignItems(ui.End).Role(ui.RoleRow).Children(func() {
				for j, h := range m.Columns {
					cell(j, h, true)
				}
			})
			ui.Box(c).Height(1).Background(t.Line)
			for i, r := range m.Rows {
				if i > 0 {
					ui.Box(c).Height(1).Background(t.LineSoft)
				}
				ui.Row(c.Key(fmt.Sprint("r", i))).Gap(t.S3).Padding(t.S2, 0).Role(ui.RoleRow).Children(func() {
					for j, v := range r {
						cell(j, v, false)
					}
				})
			}
		})
	})
}

// richChartWords is what a screen reader hears of a chart: its summary,
// then each point.
func richChartWords(m protocol.RichModel, join string) string {
	pts := make([]string, len(m.Points))
	for i, p := range m.Points {
		pts[i] = p.Label + " " + p.Text
	}
	return strings.Join(append([]string{m.Summary}, strings.Join(pts, join)), " ")
}

const richPlotH, richTickW, richLabelH = 148, 34, 18

func (a *App) richChart(c *ui.Context, m protocol.RichModel, at richAt) {
	t := a.T
	label := m.Title
	if label == "" {
		label = m.Summary
	}
	n := len(m.Points)
	H := float32(richPlotH)
	span := m.Hi - m.Lo
	zero := float32((0 - m.Lo) / span)
	a.richCard(c, at.key, label).Children(func() {
		ui.Column(c).Gap(2).Children(func() {
			a.richHead(c, m.Title, at)
			uiText(c, m.Summary).FontSize(t.SM).TextColor(t.InkSoft).LineHeight(1.45)
		})
		chart := ui.Column(c).Gap(6).Padding(richLabelH, 0, 0, 0).Role(ui.RoleImage).Label(richChartWords(m, a.L.T("rich.join")))
		chart.Children(func() {
			ui.Row(c).Gap(6).AccessHidden(true).Children(func() {
				// The lines' numbers, each on its line.
				ui.Box(c).Width(richTickW).Height(H).Shrink(0).Children(func() {
					for _, k := range m.Ticks {
						f := float32((k.Value - m.Lo) / span)
						uiText(c, k.Label).Absolute().Right(0).Top((1-f)*H - 8).FontSize(t.XS).TextColor(t.InkMuted).FontFeatures("tnum").SingleLine()
					}
				})
				plot := ui.Row(c).Grow(1).Basis(0).MinWidth(0).Height(H)
				plot.Draw(func(p *ui.Painter, r ui.Rect) {
					for _, k := range m.Ticks {
						f := float32((k.Value - m.Lo) / span)
						y := r.Y + (1-f)*r.H
						col := t.Line
						if k.Value == 0 {
							col = t.Line2
						}
						var l ui.Path
						l.MoveTo(r.X, y).LineTo(r.X+r.W, y)
						p.StrokePath(&l, 1, col)
					}
					if m.Kind != "line" || n == 0 {
						return
					}
					x := func(i int) float32 { return r.X + (float32(i)+0.5)/float32(n)*r.W }
					y := func(f float64) float32 { return r.Y + (1-float32(f))*r.H }
					var line ui.Path
					for i, q := range m.Points {
						if i == 0 {
							line.MoveTo(x(i), y(q.Frac))
						} else {
							line.LineTo(x(i), y(q.Frac))
						}
					}
					p.StrokePath(&line, 3, t.Accent)
					for i, q := range m.Points {
						p.FillPath(oval(x(i), y(q.Frac), 5, 5), t.Accent)
						p.FillPath(oval(x(i), y(q.Frac), 2.6, 2.6), t.Surface)
					}
				})
				plot.Children(func() {
					for i, q := range m.Points {
						f := float32(q.Frac)
						ui.Column(c.Key(fmt.Sprint("pt", i))).Grow(1).Basis(0).MinWidth(0).Height(H).AlignItems(ui.Center).Children(func() {
							value := func() {
								if m.Values {
									uiText(c, q.Text).Height(richLabelH).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).FontFeatures("tnum").SingleLine()
								}
							}
							lab := float32(0)
							if m.Values {
								lab = richLabelH
							}
							if m.Kind == "line" {
								ui.Box(c).Height(max(0, (1-f)*H-lab-6)).Shrink(0)
								value()
								return
							}
							top, bottom := max(f, zero), min(f, zero)
							if q.Value < 0 {
								ui.Box(c).Height((1 - top) * H).Shrink(0)
								a.richBar(c, (top-bottom)*H, true)
								value()
								return
							}
							ui.Box(c).Height(max(0, (1-top)*H-lab)).Shrink(0)
							value()
							a.richBar(c, (top-bottom)*H, false)
						})
					}
				})
			})
			ui.Row(c).Padding(0, 0, 0, richTickW+6).AccessHidden(true).Children(func() {
				for i, q := range m.Points {
					ui.Row(c.Key(fmt.Sprint("x", i))).Grow(1).Basis(0).MinWidth(0).Justify(ui.Center).Children(func() {
						uiText(c, q.Label).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
					})
				}
			})
		})
	})
}

// richBar is one bar in the accent clay: a lighter top, a darker ledge.
func (a *App) richBar(c *ui.Context, h float32, neg bool) {
	t := a.T
	r := [4]float32{8, 8, 3, 3}
	if neg {
		r = [4]float32{3, 3, 8, 8}
	}
	ui.Box(c).Height(max(2, h)).WidthPercent(64).Shrink(0).Radius(r[0], r[1], r[2], r[3]).
		Gradient(t.Accent.Mix(t.Surface, 0.22), t.Accent, 180).Shadow(0, 2, 0, 0, t.Accent.Mix(t.Ink, 0.25))
}

func (a *App) richChecklist(c *ui.Context, m protocol.RichModel, at richAt) {
	t := a.T
	key := fmt.Sprintf("%d.%d", at.seq, at.index)
	on := a.Local.Ticks(key)
	// D381: a pinned list's ticks are the home's, the same on every device.
	pin := a.pinOf(at)
	if pin != nil {
		on = pinTicks(pin, m.Items)
	}
	label := m.Title
	if label == "" {
		label = strings.Join(m.Items, a.L.T("rich.join"))
	}
	a.richCard(c, at.key, label).Children(func() {
		a.richHead(c, m.Title, at)
		ui.Column(c).Role(ui.RoleList).Children(func() {
			for i, x := range m.Items {
				ticked := slices.Contains(on, i)
				if i > 0 {
					ui.Box(c).Height(1).Background(t.LineSoft)
				}
				row := ui.Row(c.Key(fmt.Sprint("ck", i))).Gap(t.S3).Padding(t.S2+1, 0).AlignItems(ui.Start).Cursor(ui.CursorPointer).
					Role(ui.RoleCheckBox).Checked(ticked).Label(x).Focusable()
				if clicked := row.Clicked(); clicked && pin != nil {
					a.tickPin(pin, x, !ticked)
					c.Invalidate()
				} else if clicked {
					next := slices.DeleteFunc(slices.Clone(on), func(v int) bool { return v == i })
					if !ticked {
						next = append(next, i)
					}
					slices.Sort(next)
					a.Local.SetTicks(key, next)
					c.Invalidate()
				}
				row.Children(func() {
					box := ui.Box(c).Size(22, 22).Shrink(0).Radius(7).Justify(ui.Center).AlignItems(ui.Center).AccessHidden(true)
					if ticked {
						box.Background(t.Done.Surface).Border(1.5, t.Done.Dot).Shadow(0, 2, 0, 0, t.Done.Dot)
						box.Draw(func(p *ui.Painter, r ui.Rect) {
							var m ui.Path
							m.MoveTo(r.X+r.W*0.27, r.Y+r.H*0.53).LineTo(r.X+r.W*0.45, r.Y+r.H*0.72).LineTo(r.X+r.W*0.76, r.Y+r.H*0.32)
							p.StrokePath(&m, 2.2, t.Done.Ink)
						})
					} else {
						box.Background(t.Bg).Border(1.5, t.Line2).Shadow(0, 2, 0, 0, t.Line)
					}
					w := uiText(c, x).FontSize(t.MD).LineHeight(1.45).AccessHidden(true)
					if ticked {
						w.TextColor(t.InkMuted).Strikethrough()
					} else {
						w.TextColor(t.Ink)
					}
				})
			}
		})
		// Ticks stay on this Mac; only when the partner asked to hear back is there a way to tell it,
		// at any time (a list is ticked over days, while the conversation goes on).
		if m.Tell {
			ui.Row(c).Children(func() {
				ui.Spacer(c)
				if a.button(c, a.L.T("rich.tell"), btnSecondary, t.ControlSM, t.Surface) {
					a.sendWords(a.toldWords(m.Items, on))
				}
			})
		}
	})
}

// toldWords are what Send progress says: what's ticked, what isn't yet.
func (a *App) toldWords(items []string, on []int) string {
	var done, left []string
	for i, x := range items {
		if slices.Contains(on, i) {
			done = append(done, x)
		} else {
			left = append(left, x)
		}
	}
	switch {
	case len(left) == 0:
		return a.L.T("rich.told.all")
	case len(done) == 0:
		return a.L.T("rich.told.none")
	}
	j := a.L.T("rich.join")
	return a.L.T("rich.told.both", strings.Join(done, j), strings.Join(left, j))
}

func (a *App) richChoices(c *ui.Context, m protocol.RichModel, at richAt) {
	t := a.T
	ui.Row(c.Key(at.key)).Wrap().Gap(t.S2).Padding(t.S1, 0, t.S1+2, 0).Role(ui.RoleGroup).Label(a.L.T("rich.choices")).Children(func() {
		for _, o := range m.Options {
			ui.Box(c.Key("ch:" + o)).Children(func() {
				if at.live {
					if a.button(c, o, btnSecondary, t.ControlMD, t.Bg) {
						a.sendWords(o)
					}
					return
				}
				// The conversation moved on: the choices stay as a record, the one picked in the accent.
				picked := o == at.picked
				chip := ui.Row(c).Height(t.ControlMD).Padding(0, t.S4).Radius(t.Pill).AlignItems(ui.Center).Role(ui.RoleButton).Label(o).Disabled(true)
				fg := t.InkMuted
				if picked {
					chip.Background(t.Accent).Shadow(0, 3, 0, 0, t.Accent.Mix(t.Ink, 0.25))
					fg = t.OnAccent
				} else {
					chip.Background(t.SurfaceSunken)
				}
				chip.Children(func() {
					uiText(c, o).FontSize(t.MD).FontWeight(700).TextColor(fg).SingleLine().AccessHidden(true)
				})
			})
		}
	})
}

// sendWords sends words a tap says for the person (a choice, a checklist's
// progress) as their reply, without the composer's pictures or reply-to.
func (a *App) sendWords(text string, corrects ...string) {
	text = strings.TrimSpace(text)
	if text == "" {
		return
	}
	a.nextClient++
	id := fmt.Sprintf("c%d-%d", a.Now().UnixMilli(), a.nextClient)
	a.pending = append(a.pending, pendingMsg{clientID: id, text: text, sent: true})
	a.thinkingSince = a.Now()
	a.markRead()
	c := ""
	if len(corrects) > 0 {
		c = corrects[0]
	}
	a.send(protocol.Send{T: "send", Text: text, ClientID: id, Corrects: c})
	a.list.ScrollToEnd()
}
