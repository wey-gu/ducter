package views

import (
	"context"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/media"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D286: a file in the conversation, drawn as the thing it is (filecard.tsx
// on the web). A card is a clay sheet: its badge (a little page whose band
// is the family's colour and says the extension: PDF, TS, DOCX), its name,
// its size and its pages once known, and Open; above that, where the file
// has one, a glimpse of it: a PDF's first page on white paper, or code's
// and text's first lines. A glimpse is made once, off the UI thread, and
// kept by the file's id.

// glimpse is what a card shows of its file, once made.
type glimpse struct {
	loading, done bool
	lines         []string
	page          *ui.Bitmap
	pages         int
}

// glimpseLines is how many first lines a code card shows.
const glimpseLines = 7

// cardWidth is a file card's width in points.
const cardWidth = 352

// glimpseKindOf is what a card shows above its line: "pdf", "code" or "".
func glimpseKindOf(ref protocol.MediaRef) string {
	switch ref.Family() {
	case protocol.FamPDF:
		return "pdf"
	case protocol.FamCode, protocol.FamText, protocol.FamSheet:
		if k := ref.FileView(); k == protocol.FileText || k == protocol.FileMarkdown || k == protocol.FileTable {
			return "code"
		}
	}
	return ""
}

// glimpseOf makes a card's glimpse once (off the UI thread) and keeps it.
func (a *App) glimpseOf(ref protocol.MediaRef) *glimpse {
	m := a.med()
	if m.glimpses == nil {
		m.glimpses = map[string]*glimpse{}
	}
	if g := m.glimpses[ref.ID]; g != nil {
		return g
	}
	g := &glimpse{loading: true}
	m.glimpses[ref.ID] = g
	kind := glimpseKindOf(ref)
	if a.Media == nil || kind == "" {
		g.loading, g.done = false, true
		return g
	}
	home := a.Media.Home()
	var lines []string
	var page *ui.Bitmap
	pages := 0
	a.later(func() {
		switch kind {
		case "code":
			data, err := home.FetchHead(context.Background(), ref.Path(), 4096)
			if err != nil {
				return
			}
			text, _ := protocol.ViewText(data, ref.Bytes)
			for i, l := range strings.Split(text, "\n") {
				if i >= glimpseLines {
					break
				}
				lines = append(lines, strings.ReplaceAll(l, "\t", "  "))
			}
		case "pdf":
			data, err := home.Fetch(context.Background(), ref.Path())
			if err != nil {
				return
			}
			doc, err := media.OpenPDF(data)
			if err != nil {
				return
			}
			defer doc.Close()
			pages = doc.Pages()
			if img, err := doc.Render(1, 2*(cardWidth-36)); err == nil {
				page = ui.NewBitmap(img)
			}
		}
	}, func() {
		g.loading, g.done = false, true
		g.lines, g.page, g.pages = lines, page, pages
	})
	return g
}

// drawBadge is a file's badge (FileBadge on the web, a 32 × 40 box): a
// small page with a folded corner, the family's mark on it and its band
// at the foot; the extension is written over the band by fileBadge.
func drawBadge(fam string, col, paper, edge ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := min(r.W/32, r.H/40)
		ox, oy := r.X+(r.W-32*s)/2, r.Y+(r.H-40*s)/2
		pt := func(x, y float32) (float32, float32) { return ox + x*s, oy + y*s }
		var pg ui.Path
		pg.MoveTo(pt(7, 2.5)).LineTo(pt(20.5, 2.5)).LineTo(pt(28, 10)).LineTo(pt(28, 35.5)).
			QuadTo(ox+28*s, oy+37.5*s, ox+26*s, oy+37.5*s).LineTo(pt(7, 37.5)).
			QuadTo(ox+5*s, oy+37.5*s, ox+5*s, oy+35.5*s).LineTo(pt(5, 4.5)).
			QuadTo(ox+5*s, oy+2.5*s, ox+7*s, oy+2.5*s).Close()
		p.FillPath(&pg, paper)
		p.StrokePath(&pg, 1.4*s, edge)
		var fold ui.Path
		fold.MoveTo(pt(20.5, 2.5)).LineTo(pt(20.5, 8)).QuadTo(ox+20.5*s, oy+10*s, ox+22.5*s, oy+10*s).LineTo(pt(28, 10))
		p.StrokePath(&fold, 1.4*s, edge)
		var band ui.Path
		band.MoveTo(pt(5, 26.5)).LineTo(pt(28, 26.5)).LineTo(pt(28, 35.5)).
			QuadTo(ox+28*s, oy+37.5*s, ox+26*s, oy+37.5*s).LineTo(pt(7, 37.5)).
			QuadTo(ox+5*s, oy+37.5*s, ox+5*s, oy+35.5*s).Close()
		p.FillPath(&band, col)
		var mk ui.Path
		switch fam {
		case protocol.FamPDF:
			mk.MoveTo(pt(10, 11)).LineTo(pt(22, 11)).LineTo(pt(22, 17)).LineTo(pt(10, 17)).Close()
			mk.MoveTo(pt(10, 21)).LineTo(pt(22, 21))
		case protocol.FamCode:
			mk.MoveTo(pt(13, 11.5)).LineTo(pt(9.5, 15.5)).LineTo(pt(13, 19.5))
			mk.MoveTo(pt(19, 11.5)).LineTo(pt(22.5, 15.5)).LineTo(pt(19, 19.5))
		case protocol.FamDoc, protocol.FamText:
			mk.MoveTo(pt(10, 11)).LineTo(pt(22, 11)).MoveTo(pt(10, 15.5)).LineTo(pt(22, 15.5)).MoveTo(pt(10, 20)).LineTo(pt(18, 20))
		case protocol.FamSheet:
			mk.MoveTo(pt(10, 10.5)).LineTo(pt(22, 10.5)).LineTo(pt(22, 21.5)).LineTo(pt(10, 21.5)).Close()
			mk.MoveTo(pt(10, 14.2)).LineTo(pt(22, 14.2)).MoveTo(pt(10, 17.8)).LineTo(pt(22, 17.8)).MoveTo(pt(15, 10.5)).LineTo(pt(15, 21.5))
		case protocol.FamSlides:
			mk.MoveTo(pt(9.5, 11)).LineTo(pt(22.5, 11)).LineTo(pt(22.5, 19)).LineTo(pt(9.5, 19)).Close()
			mk.MoveTo(pt(16, 19)).LineTo(pt(16, 22.2)).MoveTo(pt(13.5, 22.2)).LineTo(pt(18.5, 22.2))
		case protocol.FamArchive:
			for _, y := range []float32{7.5, 11.5, 15.5} {
				mk.MoveTo(pt(16, y)).LineTo(pt(16, y+2))
			}
			mk.MoveTo(pt(14.5, 19.5)).LineTo(pt(17.5, 19.5)).LineTo(pt(17.5, 22.5)).LineTo(pt(14.5, 22.5)).Close()
		case protocol.FamAudio:
			for _, b := range [][3]float32{{10.5, 14.5, 17.5}, {13.5, 11.5, 20.5}, {16.5, 13, 19}, {19.5, 10.5, 21.5}, {22.5, 14, 18}} {
				mk.MoveTo(pt(b[0], b[1])).LineTo(pt(b[0], b[2]))
			}
		case protocol.FamVideo:
			mk.MoveTo(pt(13.5, 11.2)).LineTo(pt(13.5, 20.8)).LineTo(pt(21.5, 16)).Close()
		case protocol.FamPicture:
			mk.MoveTo(pt(9.5, 21)).LineTo(pt(14, 16)).LineTo(pt(17, 19)).LineTo(pt(19.2, 16.8)).LineTo(pt(22.5, 21))
		default:
			mk.Circle(ox+16*s, oy+15.5*s, 1.2*s)
		}
		p.StrokePath(&mk, 1.6*s, col)
	}
}

// fileBadge is a file's badge, w points wide (and 1.25 w tall).
func (a *App) fileBadge(c *ui.Context, ref protocol.MediaRef, w float32) {
	t := a.T
	fam := ref.Family()
	col := t.Family[fam]
	if col == (ui.Color{}) {
		col = t.Family[protocol.FamOther]
	}
	h := w * 1.25
	ext := ref.Badge()
	ui.Box(c).Size(w, h).Shrink(0).AccessHidden(true).Draw(drawBadge(fam, col, t.Surface, t.Line2)).Children(func() {
		if ext == "" {
			return
		}
		fs := w * 0.24
		if len(ext) > 3 {
			fs = w * 0.2
		}
		uiText(c, ext).Absolute().Left(0).Top(h * 0.66).Width(w * 1.03).Height(h * 0.28).FontSize(fs).FontWeight(800).
			TextColor(t.FamilyOn).TextAlign(ui.Center).SingleLine()
	})
}

// fileCard is a file in a message or a report (D239, D286): its glimpse
// over its line (badge, name, size and pages, Open). The whole card is a
// clay button; it opens the file inside Ducter, the viewer growing out of
// it (never the home's address).
func (a *App) fileCard(c *ui.Context, ref *protocol.MediaRef) {
	t := a.T
	name := firstNonEmpty(ref.Name, a.L.T("media.file"))
	g := a.glimpseOf(*ref)
	kind := glimpseKindOf(*ref)
	if g.done && g.page == nil && len(g.lines) == 0 {
		kind = "" // a glimpse that couldn't be made leaves the card plain
	}
	card := ui.Column(c.Key("file:" + ref.ID)).Width(cardWidth).MaxWidth(cardWidth).Shrink(1).
		Radius(t.RadiusMD).Background(t.Surface).Clip().Role(ui.RoleButton).Label(a.L.T("media.fileOpen", name)).Cursor(ui.CursorPointer).Focusable()
	lift, sink := t.Raised.Y-1, float32(0)
	if card.Pressed() {
		lift, sink = 1, t.Raised.Y-2
	} else if card.Hovered() {
		card.Background(t.SurfaceRaised)
	}
	card.Shadow(0, lift, 0, 0, t.Raised.Color).AnimatePose(ui.Pose{Y: sink}, t.Snappy)
	open := card.Clicked()
	card.Children(func() {
		switch kind {
		case "pdf":
			ui.Box(c.Key("pv")).Height(144).Background(t.Sunken).Padding(12, 18, 0, 18).Clip().Children(func() {
				paper := ui.Box(c).Fill().Background(t.PDFPage).Radius(4, 4, 0, 0).Shadow(0, 0, 0, 1, t.LineSoft).Clip()
				if g.page != nil {
					paper.Children(func() {
						img := ui.Image(c.Key("pg"), g.page).Width(cardWidth-36).Fill().Fit(ui.Cover).ObjectPosition(0.5, 0).AccessHidden(true)
						if !c.Preferences().ReduceMotion {
							img.Opacity(img.Animate("fade", 1, t.EnterDur))
						}
					})
				}
			})
		case "code":
			ui.Column(c.Key("pv")).Height(112).Background(t.Sunken).Padding(10, 14, 0, 14).Gap(2).Clip().Children(func() {
				if len(g.lines) == 0 {
					for _, w := range []float32{0.72, 0.54, 0.86, 0.4, 0.64} {
						ui.Box(c).Height(9).Width((cardWidth-28)*w).Radius(4).Background(t.LineSoft).Margin(4, 0, 3, 0)
					}
					return
				}
				for i, l := range g.lines {
					col := t.InkSoft
					if i >= glimpseLines-2 {
						col = t.InkSoft.Alpha(0.55 - 0.2*float32(i-(glimpseLines-2)))
					}
					uiText(c, l+" ").Font(t.Mono).FontSize(11.5).TextColor(col).SingleLine().MinWidth(0)
				}
			})
		}
		ui.Row(c).Gap(t.S3).AlignItems(ui.Center).Padding(t.S2+2, t.S3+2, t.S2+2, t.S3).Children(func() {
			a.fileBadge(c, *ref, 30)
			ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
				uiText(c, name).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine().MinWidth(0).Shrink(1).Tooltip(name)
				pages := ""
				if g.pages > 0 {
					pages = a.L.T("file.pages", g.pages)
				}
				a.facts(c, t.XS, t.InkMuted, protocol.SizeWords(ref.Bytes), pages) // D291
			})
			uiText(c, a.L.T("media.open")).FontSize(t.SM).FontWeight(800).TextColor(t.InkSoft).Shrink(0)
		})
	})
	if g.loading && a.Win != nil {
		c.After(120 * time.Millisecond)
	}
	if open {
		a.OpenFile(*ref, card.Bounds())
	}
}

// sendingFileCard is a file of the person's own message on its way (D259):
// the same card, a calm bar where Open will be; once it lands, the card
// itself.
func (a *App) sendingFileCard(c *ui.Context, x *attach) {
	if x.ref != nil {
		a.fileCard(c, x.ref)
		return
	}
	t := a.T
	ref := attRef(x)
	ui.Row(c.Key("sending:"+x.key)).Gap(t.S3).AlignItems(ui.Center).Padding(t.S2+2, t.S3+2, t.S2+2, t.S3).Width(cardWidth).MaxWidth(cardWidth).Shrink(1).
		Radius(t.RadiusMD).Background(t.Surface).Shadow(0, t.Raised.Y-1, 0, 0, t.Raised.Color).Label(x.name).Children(func() {
		a.fileBadge(c, ref, 30)
		ui.Column(c).Grow(1).MinWidth(0).Gap(2).Children(func() {
			uiText(c, x.name).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine().MinWidth(0).Shrink(1).Tooltip(x.name)
			if x.failed() {
				uiText(c, a.L.T("media.failed")).FontSize(t.XS).FontWeight(700).TextColor(t.Failed.Ink)
			} else {
				uiText(c, protocol.SizeWords(int64(len(x.file)))).FontSize(t.XS).TextColor(t.InkMuted)
			}
		})
		if !x.failed() {
			a.calmBar(c, 44, x.progress, t.Family[ref.Family()])
			if a.Win != nil {
				c.After(120 * time.Millisecond)
			}
		}
	})
}

// calmBar is the calm bar a file goes up under (D286): a track, the part sent.
func (a *App) calmBar(c *ui.Context, w float32, frac float64, col ui.Color) {
	t := a.T
	if col == (ui.Color{}) {
		col = t.Ink
	}
	f := float32(max(0.04, min(1, frac)))
	ui.Box(c).Size(w, 4).Radius(2).Background(t.Line).Clip().Shrink(0).Children(func() {
		ui.Box(c).Size(w*f, 4).Radius(2).Background(col)
	})
}
