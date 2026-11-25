package views

import (
	"strconv"
	"strings"

	"github.com/egoist/mygo/ui"
	"github.com/egoist/mygo/ui/markdown"
	"github.com/egoist/mygo/ui/markdown/parser"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D567: wide content in the file viewer, read whole (design/media.md
// "Wide content"; the web's .md-table and .fv-table). A report's table is
// as wide as its words need, each column up to a reading measure, out past
// the report's measure to the sheet's whole width; wider still, it scrolls
// sideways on its own (the system's scroller), never the page. Its edges
// fade where more of it is out of view. A first column that names the rows
// (words, not numbers) stays while the rest scroll, a ledge at its edge
// once something is under it. A table file is the same table filling the
// sheet: its header row stays as the rows scroll, only the rows in view
// are built.

// wideTableState is a table's place as it scrolls.
type wideTableState struct{ scroll ui.ScrollState }

// keyColumn: the first column names the rows (more than two columns, its
// body cells all words), so it stays while the rest scroll.
func keyColumn(first []string, cols int) bool {
	if cols <= 2 || len(first) < 2 {
		return false
	}
	for _, s := range first {
		s = strings.TrimSpace(protocol.DocPlain(s))
		if s == "" || numberish(s) {
			return false
		}
	}
	return true
}

// numberish: a number, an amount or a share (0.98, $19, 12%, 1,200).
func numberish(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if !strings.ContainsRune("0123456789.,%$€¥£+-/ ", r) {
			return false
		}
	}
	return true
}

// wideFade fades a scroller's edges where more of it is out of view; with
// a key column the start shows the column's ledge instead.
func wideFade(e ui.Element, st *ui.ScrollState, key bool) {
	w := e.Bounds().W
	if w <= 0 {
		return
	}
	f := min(0.3, 28/w)
	black := ui.RGB(0, 0, 0)
	start := !key && st.X > 1
	end := st.MaxX > 1 && st.X < st.MaxX-1
	if !start && !end {
		return
	}
	var stops []ui.GradientStop
	if start {
		stops = append(stops, ui.GradientStop{Color: ui.Transparent, At: 0}, ui.GradientStop{Color: black, At: f})
	} else {
		stops = append(stops, ui.GradientStop{Color: black, At: 0})
	}
	if end {
		stops = append(stops, ui.GradientStop{Color: black, At: 1 - f}, ui.GradientStop{Color: ui.Transparent, At: 1})
	} else {
		stops = append(stops, ui.GradientStop{Color: black, At: 1})
	}
	e.MaskLinearGradient(ui.LinearGradient{Angle: 90, Stops: stops})
}

// tableCellSize is a table's words: the secondary size, as the web's.
func (a *App) tableCellSize() float32 { return a.T.SM }

// measureCell is a cell's words' width on one line.
func (a *App) measureCell(c *ui.Context, s string, bold bool) float32 {
	weight := 400
	if bold {
		weight = 800
	}
	w, _ := c.MeasureText(0, ui.Span{Text: s, Font: a.T.Body, Size: a.tableCellSize(), Weight: weight})
	return w
}

// mdTableBlock draws a report's table (Options.Block for the file viewer).
func (a *App) mdTableBlock(c *ui.Context, fv *fileViewState, d *parser.Document, i int) bool {
	b := d.Block(i)
	if b.Kind != parser.Table {
		return false
	}
	t := a.T
	src := d.Source()
	var rows [][]string
	header := map[int]bool{}
	for r := i + 1; r < b.Next; r = d.Block(r).Next {
		var row []string
		for cell := r + 1; cell < d.Block(r).Next; cell = d.Block(cell).Next {
			cb := d.Block(cell)
			row = append(row, strings.TrimSpace(src[cb.Start:cb.End]))
		}
		if d.Block(r).Header {
			header[len(rows)] = true
		}
		rows = append(rows, row)
	}
	cols := len(b.Align)
	fs := a.tableCellSize()
	padX, padY := t.S3, float32(7)
	var first []string
	for k, r := range rows {
		if !header[k] && len(r) > 0 {
			first = append(first, r[0])
		}
	}
	key := keyColumn(first, cols)
	widths := make([]float32, cols)
	for k := range widths {
		most := 22 * fs
		if k == 0 && key {
			most = 13 * fs
		}
		w := 4 * fs
		for n, r := range rows {
			if k < len(r) {
				w = max(w, min(most, a.measureCell(c, protocol.DocPlain(r[k]), header[n])+2))
			}
		}
		widths[k] = w + 2*padX
	}
	total := float32(1)
	for _, w := range widths {
		total += w
	}
	// As wide as it needs, out past the report's measure to the sheet's
	// whole width, centred on the words.
	side := float32(0)
	if fv.docMeasure > 0 && fv.docFull > fv.docMeasure {
		side = max(0, min(total, fv.docFull)-fv.docMeasure) / 2
	}
	if fv.tables == nil {
		fv.tables = map[int]*wideTableState{}
	}
	st := fv.tables[b.Start]
	if st == nil {
		st = &wideTableState{}
		fv.tables[b.Start] = st
	}
	scroll := ui.ScrollHorizontal(c.Key("mdt:"+strconv.Itoa(b.Start))).TrackScroll(&st.scroll).AlignSelf(ui.Stretch).
		Margin(0, -side, 0, -side).Radius(t.RadiusSM).Border(1, t.Line).Clip().Role(ui.RoleTable)
	wideFade(scroll, &st.scroll, key)
	ledge := key && st.scroll.X > 1
	cellOpts := fv.mdCell
	scroll.Children(func() {
		ui.Column(c).Shrink(0).Width(total - 1).Children(func() {
			for n, r := range rows {
				head := header[n]
				bg := t.Bg
				if head {
					bg = t.Sunken
				}
				row := ui.Row(c).AlignItems(ui.Stretch).Role(ui.RoleRow).Background(bg)
				if n > 0 {
					row.BorderWidth(1, 0, 0, 0).BorderColor(t.LineSoft)
				}
				row.Children(func() {
					for k := 0; k < cols; k++ {
						s := ""
						if k < len(r) {
							s = r[k]
						}
						role := ui.RoleCell
						if head {
							role = ui.RoleColumnHeader
						}
						box := ui.Column(c).Width(widths[k]).Shrink(0).Padding(padY, padX).Role(role)
						switch {
						case k < len(b.Align) && b.Align[k] == parser.AlignRight:
							box.AlignItems(ui.End)
						case k < len(b.Align) && b.Align[k] == parser.AlignCenter:
							box.AlignItems(ui.Center)
						}
						if k == 0 && key {
							box.Sticky().Left(0).Background(bg)
							if ledge {
								box.BorderWidth(0, 2, 0, 0).BorderColor(t.Line)
							}
						}
						box.Children(func() {
							plain := protocol.DocPlain(s)
							if head || plain == s || cellOpts == nil {
								w := 400
								if head {
									w = 800
								}
								txt := uiText(c, plain).FontSize(fs).FontWeight(w).TextColor(t.Ink).LineHeight(1.45)
								if k < len(b.Align) && b.Align[k] == parser.AlignRight {
									txt.TextAlign(ui.End)
								}
								return
							}
							markdown.View(c, s, cellOpts)
						})
					}
				})
			}
		})
	})
	return true
}

// csvRowH is a table file's row: one line of words.
const csvRowH = 32

// csvTable is a table file filling the sheet: the header row stays as the
// rows scroll, the first column as the columns do when it names the rows;
// numbers line up on the right; only the rows in view are built.
func (a *App) csvTable(c *ui.Context, fv *fileViewState) {
	t := a.T
	rows := fv.rows
	if len(rows) == 0 {
		return
	}
	cols := 0
	for _, r := range rows {
		cols = max(cols, len(r))
	}
	cell := func(r []string, k int) string {
		if k < len(r) {
			return strings.ReplaceAll(r[k], "\n", " ")
		}
		return ""
	}
	if len(fv.csvW) != cols {
		// Each column as wide as what it holds (its first 200 rows), within
		// 4 and 32 characters' room.
		fs := a.tableCellSize()
		fv.csvW, fv.csvNum = make([]float32, cols), make([]bool, cols)
		for k := 0; k < cols; k++ {
			w := 4 * fs
			num, seen := true, false
			for n, r := range rows[:min(len(rows), 200)] {
				s := cell(r, k)
				w = max(w, min(16*fs, a.measureCell(c, s, n == 0)+2))
				if n > 0 && strings.TrimSpace(s) != "" {
					seen = true
					num = num && numberish(strings.TrimSpace(s))
				}
			}
			fv.csvW[k], fv.csvNum[k] = w+2*t.S3, num && seen
		}
		var first []string
		for _, r := range rows[1:] {
			first = append(first, cell(r, 0))
		}
		fv.csvKey = keyColumn(first, cols) || (cols > 2 && !fv.csvNum[0])
	}
	total := float32(0)
	for _, w := range fv.csvW {
		total += w
	}
	fs := a.tableCellSize()
	st := &fv.csvScroll
	sc := ui.ScrollBoth(c.Key("fv-csv")).Fill().TrackScroll(st).Background(t.SurfaceRaised).Role(ui.RoleTable)
	wideFade(sc, st, fv.csvKey)
	viewH := sc.Bounds().H
	if viewH <= 0 {
		viewH = 900
	}
	body := len(rows) - 1
	from := max(0, int(st.Y/csvRowH)-4)
	to := min(body, int((st.Y+viewH)/csvRowH)+4)
	ledge := fv.csvKey && st.X > 1
	line := func(r []string, n int, head bool) {
		bg := t.SurfaceRaised
		if head {
			bg = t.Sunken
		} else if n%2 == 1 {
			bg = t.Sunken.Mix(t.SurfaceRaised, 0.55)
		}
		row := ui.Row(c.Key("r" + strconv.Itoa(n))).Height(csvRowH).Width(total).AlignItems(ui.Center).Background(bg).Role(ui.RoleRow)
		if head {
			row.Sticky().Top(0).BorderWidth(0, 0, 2, 0).BorderColor(t.Line)
		} else {
			row.BorderWidth(0, 0, 1, 0).BorderColor(t.LineSoft)
		}
		row.Children(func() {
			for k := 0; k < cols; k++ {
				box := ui.Row(c).Width(fv.csvW[k]).Height(csvRowH).Shrink(0).AlignItems(ui.Center).Padding(0, t.S3).Clip()
				if fv.csvNum[k] {
					box.Justify(ui.End)
				}
				if k == 0 && fv.csvKey {
					box.Sticky().Left(0).Background(bg)
					if ledge {
						box.BorderWidth(0, 2, 0, 0).BorderColor(t.Line)
					}
				}
				box.Children(func() {
					w, col := 400, t.InkSoft
					if head {
						w, col = 800, t.Ink
					} else if k == 0 && fv.csvKey {
						col = t.Ink
					}
					uiText(c, cell(r, k)).FontSize(fs).FontWeight(w).TextColor(col).SingleLine().MinWidth(0).Shrink(1)
				})
			}
		})
	}
	sc.Children(func() {
		ui.Column(c).Width(total).Height(float32(body+1)*csvRowH + csvRowH).Shrink(0).Children(func() {
			line(rows[0], 0, true)
			ui.Box(c).Height(float32(from) * csvRowH).Shrink(0)
			for n := from; n < to; n++ {
				line(rows[n+1], n+1, false)
			}
		})
	})
	if fv.more {
		ui.Box(c.Key("fv-csv-cut")).Absolute().Left(0).Right(0).Bottom(t.S3).Children(func() {
			ui.Row(c).Justify(ui.Center).Children(func() {
				uiText(c, a.L.T("file.rowsCut", protocol.FileViewRows)).FontSize(t.SM).TextColor(t.InkSoft).Padding(t.S2+2, t.S4).Radius(t.RadiusSM).Background(t.Sunken)
			})
		})
	}
}
