package views

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/egoist/mygo/transfer"
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/media"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// Pictures in the conversation and in a task (D206, design/media.md). A
// picture is added to a composer (the picker, ⌘V, a drop), scaled and
// uploaded at once, and sent with the words by its id; the words are never
// lost: a picture that didn't go keeps the message, with Retry. In a
// message, one picture keeps its own shape; 2–4 sit in a tidy grid; more
// show "+n" on the last tile. A tap opens the viewer: ←/→ through every
// picture of this conversation (or task), Space or Esc closes, ⌘C copies,
// Save, 来自 {task}, and the picture drags out to Finder.

// MediaHands is the app's hands for pictures on macOS (main.go); nil in
// tests that don't need them (no picker, no pasteboard).
type MediaHands interface {
	// Home is where pictures go and come from (the home's http base and
	// this device's token).
	Home() media.Home
	// PickImages asks macOS for pictures (an open panel, several at once).
	PickImages(title string) ([]string, error)
	// PastedImage is a picture on the pasteboard: PNG bytes, or a picture
	// file copied in Finder (its path); ok false when there is none.
	PastedImage() (data []byte, name string, ok bool)
	// CopyImage puts a picture on the pasteboard (PNG).
	CopyImage(png []byte) error
	// Save keeps a picture in the user's Downloads; returns where.
	Save(name string, data []byte) (string, error)
	// OpenURL opens a link (a file a task showed) in the default app.
	OpenURL(u string)
}

// attach is one picture in a composer's tray, or of a message on its way.
type attach struct {
	key      string
	name     string
	prep     *media.Prepared
	bmp      *ui.Bitmap
	progress float64
	ref      *protocol.MediaRef
	err      error
}

func (x *attach) ready() bool  { return x.ref != nil }
func (x *attach) failed() bool { return x.err != nil }

// pic is a picture fetched from the home, by its path.
type pic struct {
	bmp     *ui.Bitmap
	data    []byte
	loading bool
	failed  bool
	at      time.Time // when it arrived (the fade)
}

// mediaState is the pictures' own state on App.
type mediaState struct {
	pics     map[string]*pic
	previews map[string]*ui.Bitmap
	// trays are the composers' pictures: "conv", "task:<id>", "nt".
	trays map[string][]*attach
	// note is the tray's one line (Up to 10, too big…), per tray.
	note map[string]string
	// taskWait are messages to a task whose pictures are still going up.
	taskWait []*taskWait
	viewer   *viewerState
	n        int
}

type taskWait struct {
	taskID, text, clientID string
	atts                   []*attach
	at                     time.Time
}

func (a *App) med() *mediaState {
	m := &a.media
	if m.pics == nil {
		m.pics, m.previews, m.trays, m.note = map[string]*pic{}, map[string]*ui.Bitmap{}, map[string][]*attach{}, map[string]string{}
	}
	return m
}

// onUI runs fn on the UI thread (inline in tests).
func (a *App) onUI(fn func()) {
	if a.Win == nil {
		fn()
		return
	}
	a.Win.Update(fn)
}

// later runs work off the UI thread, then done on it (both inline in tests).
func (a *App) later(work func(), done func()) {
	if a.Win == nil {
		work()
		done()
		return
	}
	go func() {
		work()
		a.Win.Update(done)
	}()
}

// ---------- adding pictures ----------

// AddPictureFiles adds picture files to a composer's tray (a pick or a drop).
func (a *App) AddPictureFiles(tray string, paths []string) {
	for _, p := range paths {
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		a.AddPicture(tray, data, filepath.Base(p))
	}
}

// AddPicture adds one picture's bytes to a tray: it is made small and
// starts going up at once.
func (a *App) AddPicture(tray string, data []byte, name string) {
	m := a.med()
	if len(m.trays[tray]) >= protocol.MediaPerMessage {
		m.note[tray] = a.L.T("media.tooMany")
		return
	}
	m.n++
	x := &attach{key: fmt.Sprintf("a%d", m.n), name: name}
	m.trays[tray] = append(m.trays[tray], x)
	delete(m.note, tray)
	var prep *media.Prepared
	var err error
	a.later(func() { prep, err = media.Prepare(data) }, func() {
		if err != nil {
			a.dropAttach(tray, x)
			if err == media.ErrTooBig {
				m.note[tray] = a.L.T("media.tooBig")
			} else {
				m.note[tray] = a.L.T("media.notImage")
			}
			return
		}
		x.prep = prep
		x.bmp = ui.NewBitmap(prep.Image)
		a.upload(x)
	})
}

func (a *App) dropAttach(tray string, x *attach) {
	m := a.med()
	list := m.trays[tray]
	for i, y := range list {
		if y == x {
			m.trays[tray] = append(list[:i:i], list[i+1:]...)
			return
		}
	}
}

// upload sends one picture up; what waits for it goes when it lands.
func (a *App) upload(x *attach) {
	if a.Media == nil || x.prep == nil {
		x.err = fmt.Errorf("pictures can't be sent here")
		return
	}
	x.err, x.progress = nil, 0
	home := a.Media.Home()
	var ref protocol.MediaRef
	var err error
	a.later(func() {
		ref, err = home.Upload(context.Background(), x.prep, x.name, func(f float64) {
			if a.Win != nil {
				a.Win.Update(func() { x.progress = f })
			}
		})
	}, func() {
		if err != nil {
			x.err = err
			return
		}
		x.ref, x.progress = &ref, 1
		a.flushMediaSends()
	})
}

// retryPictures sends again what didn't go up.
func (a *App) retryPictures(atts []*attach) {
	for _, x := range atts {
		if x.failed() {
			a.upload(x)
		}
	}
}

func allReady(atts []*attach) bool {
	for _, x := range atts {
		if !x.ready() {
			return false
		}
	}
	return true
}

func anyFailed(atts []*attach) bool {
	for _, x := range atts {
		if x.failed() {
			return true
		}
	}
	return false
}

func idsOf(atts []*attach) []string {
	var ids []string
	for _, x := range atts {
		if x.ref != nil {
			ids = append(ids, x.ref.ID)
		}
	}
	return ids
}

func refsOf(atts []*attach) []protocol.MediaRef {
	var out []protocol.MediaRef
	for _, x := range atts {
		if x.ref != nil {
			out = append(out, *x.ref)
		}
	}
	return out
}

// takeTray empties a tray, handing its pictures to a message.
func (a *App) takeTray(tray string) []*attach {
	m := a.med()
	atts := m.trays[tray]
	delete(m.trays, tray)
	delete(m.note, tray)
	return atts
}

// flushMediaSends sends every message whose pictures are all up now.
func (a *App) flushMediaSends() {
	for i := range a.pending {
		p := &a.pending[i]
		if len(p.atts) > 0 && !p.sent && allReady(p.atts) {
			p.sent = true
			a.send(protocol.Send{T: "send", Text: p.text, ClientID: p.clientID, Media: idsOf(p.atts)})
		}
	}
	m := a.med()
	keep := m.taskWait[:0]
	for _, w := range m.taskWait {
		if allReady(w.atts) {
			a.sendToTaskWith(w.taskID, w.text, w.clientID, w.atts)
			continue
		}
		keep = append(keep, w)
	}
	m.taskWait = keep
}

// pasteInto takes a picture from the pasteboard into a tray; false when
// there is none (the text field pastes its text as always).
func (a *App) pasteInto(tray string) bool {
	if a.Media == nil {
		return false
	}
	data, name, ok := a.Media.PastedImage()
	if !ok {
		return false
	}
	a.AddPicture(tray, data, name)
	return true
}

// pickInto asks macOS for pictures and adds them to a tray.
func (a *App) pickInto(tray string) {
	if a.Media == nil {
		return
	}
	var paths []string
	a.later(func() { paths, _ = a.Media.PickImages(a.L.T("media.add")) }, func() { a.AddPictureFiles(tray, paths) })
}

// pictureKeys is ⌘V in a composer: a picture on the pasteboard goes to the
// tray instead of its name into the words.
func (a *App) pictureKeys(tray string, k ui.TextKey) bool {
	return k.Key == ui.KeyV && k.Mods == ui.Cmd && a.pasteInto(tray)
}

// takeDrops adds the picture files dropped on e to a tray, and says
// whether files are over it now.
func (a *App) takeDrops(e ui.Element, tray string) bool {
	if paths := e.DroppedFiles(); len(paths) > 0 {
		a.AddPictureFiles(tray, paths)
	}
	return e.FileDragOver()
}

// ---------- fetching ----------

// picture is a picture from the home by its path, fetched once.
func (a *App) picture(path string) *pic {
	m := a.med()
	p := m.pics[path]
	if p != nil {
		return p
	}
	p = &pic{loading: true}
	m.pics[path] = p
	if a.Media == nil {
		p.loading, p.failed = false, true
		return p
	}
	home := a.Media.Home()
	var data []byte
	var bmp *ui.Bitmap
	var err error
	a.later(func() {
		data, err = home.Fetch(context.Background(), path)
		if err == nil {
			img, derr := media.Decode(data)
			if derr != nil {
				err = derr
				return
			}
			bmp = ui.NewBitmap(img)
		}
	}, func() {
		p.loading = false
		if err != nil {
			p.failed = true
			return
		}
		p.bmp, p.data, p.at = bmp, data, a.Now()
	})
	return p
}

// preview is a ref's ~16 px preview as a bitmap (drawn blurred, big).
func (a *App) preview(ref *protocol.MediaRef) *ui.Bitmap {
	if ref == nil || ref.Preview == "" {
		return nil
	}
	m := a.med()
	if b, ok := m.previews[ref.ID]; ok {
		return b
	}
	var b *ui.Bitmap
	if i := strings.IndexByte(ref.Preview, ','); i > 0 {
		if raw, err := base64.StdEncoding.DecodeString(ref.Preview[i+1:]); err == nil {
			if img, err := media.Decode(raw); err == nil {
				b = ui.NewBitmap(img)
			}
		}
	}
	m.previews[ref.ID] = b
	return b
}

// ---------- the grid ----------

// mediaItem is one picture of a message: from the Log (ref) or still on
// its way from this Mac (att).
type mediaItem struct {
	ref *protocol.MediaRef
	att *attach
}

func (it mediaItem) size() protocol.Size {
	if it.ref != nil && it.ref.W > 0 {
		return protocol.Size{W: it.ref.W, H: it.ref.H}
	}
	if it.att != nil && it.att.prep != nil {
		return protocol.Size{W: it.att.prep.W, H: it.att.prep.H}
	}
	return protocol.Size{}
}

// mediaMaxH is how tall a single picture may stand in a message.
const mediaMaxH = 360

// gridSize is the grid's size in points for a column colW wide: at most
// 70% of it (and 440); a single picture also fits under mediaMaxH.
func gridSize(g protocol.GridLayout, colW float32) (float32, float32) {
	w := min(colW*0.7, 440)
	h := w * float32(g.Aspect)
	if g.Single && h > mediaMaxH {
		h = mediaMaxH
		w = h / float32(g.Aspect)
	}
	return w, h
}

// split sorts a message's media into pictures and files.
func split(refs []protocol.MediaRef) (pics, files []protocol.MediaRef) {
	for _, r := range refs {
		if r.IsImage() {
			pics = append(pics, r)
		} else {
			files = append(files, r)
		}
	}
	return
}

// colWidth is the conversation column's width now.
func (a *App) colWidth() float32 {
	w := float32(convWidth)
	if a.winW > 0 {
		w = min(w, a.winW-2*a.T.S5)
	}
	return max(w, 240)
}

// messageMedia is a message's pictures (the grid) and files (one line each),
// on the user's side (end) or the partner's. scope is the viewer's list:
// "conv" or "task:<id>".
func (a *App) messageMedia(c *ui.Context, key string, refs []protocol.MediaRef, atts []*attach, end bool, scope string) {
	t := a.T
	pics, files := split(refs)
	var items []mediaItem
	for i := range pics {
		items = append(items, mediaItem{ref: &pics[i]})
	}
	for _, x := range atts {
		items = append(items, mediaItem{att: x})
	}
	if len(items) == 0 && len(files) == 0 {
		return
	}
	ui.Column(c.Key("media:" + key)).Gap(t.S1).AlignItems(alignOf(end)).Children(func() {
		if len(items) > 0 {
			a.mediaGrid(c, key, items, end, scope)
		}
		for i := range files {
			a.fileCard(c, &files[i])
		}
	})
}

func alignOf(end bool) ui.Align {
	if end {
		return ui.End
	}
	return ui.Start
}

func (a *App) mediaGrid(c *ui.Context, key string, items []mediaItem, end bool, scope string) {
	t := a.T
	sizes := make([]protocol.Size, len(items))
	for i, it := range items {
		sizes[i] = it.size()
	}
	g := protocol.Grid(sizes)
	w, h := gridSize(g, a.colWidth())
	gap := t.MediaGap
	r := t.BubbleRadius
	box := ui.Box(c.Key("grid:"+key)).Size(w, h).Shrink(0).Clip()
	if end {
		box.Radius(r[0], r[1], r[2]*0.6, r[3])
	} else {
		box.Radius(r[0], r[1], r[2], r[3]*0.6)
	}
	box.Children(func() {
		for _, tl := range g.Tiles {
			it := items[tl.I]
			x0, y0 := float32(tl.X)*w, float32(tl.Y)*w
			tw, th := float32(tl.W)*w, float32(tl.H)*w
			// The hairline between tiles: each tile gives up half of it on its inner sides.
			if tl.X > 0 {
				x0 += gap / 2
				tw -= gap / 2
			}
			if tl.X+tl.W < 0.999 {
				tw -= gap / 2
			}
			if tl.Y > 0 {
				y0 += gap / 2
				th -= gap / 2
			}
			if g.Single {
				tw, th = w, h
			} else if tl.Y+tl.H < float64(g.Aspect)-0.001 {
				th -= gap / 2
			}
			a.mediaTile(c, fmt.Sprintf("%s:%d", key, tl.I), it, x0, y0, tw, th, tl.More, func() {
				if it.ref != nil {
					a.OpenViewer(scope, it.ref.ID)
				}
			})
		}
	})
}

// mediaTile is one tile: the preview (or the sunken paper) under the
// picture, which fades in; "+n" over the last; the ring while it goes up.
func (a *App) mediaTile(c *ui.Context, key string, it mediaItem, x, y, w, h float32, more int, open func()) {
	t := a.T
	label := a.L.T("media.image")
	tile := ui.Box(c.Key("tile:"+key)).Absolute().Left(x).Top(y).Size(w, h).Background(t.SurfaceSunken).Clip().Label(label)
	if it.ref != nil {
		tile.Role(ui.RoleButton).Cursor(ui.CursorPointer).Focusable()
	}
	tile.Children(func() {
		var bmp *ui.Bitmap
		arrived := time.Time{}
		switch {
		case it.att != nil:
			bmp = it.att.bmp
		case it.ref != nil:
			if pv := a.preview(it.ref); pv != nil {
				ui.Image(c, pv).Size(w, h).Fit(ui.Cover).Absolute().Left(0).Top(0).AccessHidden(true)
			}
			p := a.picture(it.ref.ThumbPath())
			bmp, arrived = p.bmp, p.at
		}
		if bmp != nil {
			img := ui.Image(c.Key("img"), bmp).Size(w, h).Fit(ui.Cover).Absolute().Left(0).Top(0).AccessHidden(true)
			if !arrived.IsZero() && !c.Preferences().ReduceMotion {
				img.Opacity(img.Animate("fade", 1, t.EnterDur))
			}
		}
		if more > 0 {
			ui.Box(c).Absolute().Left(0).Top(0).Size(w, h).Background(t.Lightbox.Alpha(0.5)).Children(func() {
				ui.Row(c).Fill().Justify(ui.Center).AlignItems(ui.Center).Children(func() {
					ui.Text(c, fmt.Sprintf("+%d", more)).FontSize(t.XL).FontWeight(700).TextColor(t.LightboxInk)
				})
			})
		}
		if x := it.att; x != nil && (!x.ready() || x.failed()) {
			ui.Box(c).Absolute().Left(w/2-16).Top(h/2-16).Size(32, 32).Draw(drawUploadRing(x.progress, x.failed(), t.LightboxInk, t.Lightbox, t.Failed.Ink))
			if !x.failed() && a.Win != nil {
				c.After(120 * time.Millisecond)
			}
		}
	})
	if tile.Clicked() && open != nil {
		open()
	}
}

// drawUploadRing is the thin ring on a picture going up: a track, the part sent,
// and a cross when it didn't go.
func drawUploadRing(frac float64, failed bool, ink, ground, bad ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy, rad := r.X+r.W/2, r.Y+r.H/2, r.W/2-2
		var bg ui.Path
		bg.Circle(cx, cy, rad+2)
		p.FillPath(&bg, ground.Alpha(0.62))
		var track ui.Path
		track.Circle(cx, cy, rad-2)
		p.StrokePath(&track, 2.5, ink.Alpha(0.28))
		if failed {
			var x ui.Path
			x.MoveTo(cx-4, cy-4).LineTo(cx+4, cy+4).MoveTo(cx+4, cy-4).LineTo(cx-4, cy+4)
			p.StrokePath(&x, 2, ink)
			return
		}
		if frac > 0 {
			arc := ringFromTop(cx, cy, rad-2)
			arc.Trim(0, float32(min(1, frac)))
			p.StrokePath(&arc, 2.5, ink)
		}
	}
}

// ringFromTop is a circle drawn clockwise from 12 o'clock (a progress arc's start).
func ringFromTop(cx, cy, r float32) ui.Path {
	const k = 0.5522847498
	var p ui.Path
	p.MoveTo(cx, cy-r)
	p.CubeTo(cx+r*k, cy-r, cx+r, cy-r*k, cx+r, cy)
	p.CubeTo(cx+r, cy+r*k, cx+r*k, cy+r, cx, cy+r)
	p.CubeTo(cx-r*k, cy+r, cx-r, cy+r*k, cx-r, cy)
	p.CubeTo(cx-r, cy-r*k, cx-r*k, cy-r, cx, cy-r)
	return p
}

// fileCard is a file a task showed: one line with its kind, name, size and Open.
func (a *App) fileCard(c *ui.Context, ref *protocol.MediaRef) {
	t := a.T
	name := firstNonEmpty(ref.Name, a.L.T("media.image"))
	ui.Row(c.Key("file:"+ref.ID)).Gap(t.S3).AlignItems(ui.Center).Padding(t.S2, t.S2, t.S2, t.S3).MinWidth(280).MaxWidth(420).
		Radius(t.RadiusMD).Background(t.Surface).Shadow(0, t.Raised.Y-1, 0, 0, t.Raised.Color).Children(func() {
		a.glyph(c, 22, drawFile(t.InkSoft))
		ui.Column(c).Grow(1).MinWidth(0).Gap(1).Children(func() {
			ui.Text(c, name).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine().MinWidth(0).Shrink(1).Tooltip(name)
			ui.Text(c, protocol.SizeWords(ref.Bytes)).FontSize(t.XS).TextColor(t.InkMuted)
		})
		if a.buttonFor(c, a.L.T("media.open"), name, btnSecondary, t.ControlSM, t.Surface) && a.Media != nil {
			a.Media.OpenURL(a.Media.Home().URL(ref.Path() + "&dl=1"))
		}
	})
}

// drawFile is a sheet with a folded corner.
func drawFile(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		x, y, w, h := r.X+r.W*0.2, r.Y+r.H*0.1, r.W*0.6, r.H*0.8
		f := w * 0.35
		var s ui.Path
		s.MoveTo(x, y).LineTo(x+w-f, y).LineTo(x+w, y+f).LineTo(x+w, y+h).LineTo(x, y+h).Close()
		s.MoveTo(x+w-f, y).LineTo(x+w-f, y+f).LineTo(x+w, y+f)
		p.StrokePath(&s, 1.8, col)
	}
}

// ---------- the composer's tray ----------

// tray is the pictures waiting in a composer, above its words: each with
// Remove, the ring while it goes up, Retry when it didn't; then one line
// when something couldn't be added.
func (a *App) picTray(c *ui.Context, tray string) {
	t := a.T
	m := a.med()
	list := m.trays[tray]
	note := m.note[tray]
	if len(list) == 0 && note == "" {
		return
	}
	ui.Column(c.Key("tray:"+tray)).Gap(t.S1).Padding(t.S2, 0, 0, 0).Children(func() {
		if len(list) > 0 {
			ui.Row(c).Gap(t.S2).Wrap().Children(func() {
				for _, x := range list {
					a.trayTile(c, tray, x)
				}
			})
		}
		if anyFailed(list) {
			ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(func() {
				ui.Text(c, a.L.T("media.failed")).FontSize(t.XS).FontWeight(700).TextColor(t.Failed.Ink)
				if a.button(c, a.L.T("media.retry"), btnText, t.ControlSM, t.Surface) {
					a.retryPictures(list)
				}
			})
		}
		if note != "" {
			ui.Text(c, note).FontSize(t.XS).TextColor(t.InkMuted).Role(ui.RoleStatus)
		}
	})
}

// trayTileSize is a tray tile's edge.
const trayTileSize = 64

func (a *App) trayTile(c *ui.Context, tray string, x *attach) {
	t := a.T
	s := float32(trayTileSize)
	ui.Box(c.Key("tt:"+x.key)).Size(s, s).Shrink(0).Children(func() {
		ui.Box(c).Size(s, s).Radius(t.RadiusSM).Background(t.SurfaceSunken).Clip().Children(func() {
			if x.bmp != nil {
				ui.Image(c, x.bmp).Size(s, s).Fit(ui.Cover).AccessHidden(true)
			}
			if !x.ready() || x.failed() {
				ui.Box(c).Absolute().Left(s/2-13).Top(s/2-13).Size(26, 26).Draw(drawUploadRing(x.progress, x.failed(), t.LightboxInk, t.Lightbox, t.Failed.Ink))
				if !x.failed() && a.Win != nil {
					c.After(120 * time.Millisecond)
				}
			}
		})
		rm := ui.Box(c.Key("rm")).Absolute().Left(s-18).Top(-4).Size(22, 22).Radius(11).Background(t.Ink).
			Role(ui.RoleButton).Label(a.L.T("media.remove")).Cursor(ui.CursorPointer).Focusable().Draw(drawCross(t.Surface))
		if rm.Clicked() {
			a.dropAttach(tray, x)
		}
	})
}

// addButton is the composer's 加图片 / Add images: a picture mark.
func (a *App) addPicturesButton(c *ui.Context, tray string) {
	t := a.T
	if a.Media == nil {
		return
	}
	if a.iconButton(c, a.L.T("media.add"), t.ControlMD, btnText, drawPicture) {
		a.pickInto(tray)
	}
}

// drawPicture is a framed picture: a sun over a hill.
func drawPicture(col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		var f ui.Path
		f.MoveTo(cx-8, cy-6).LineTo(cx+8, cy-6).LineTo(cx+8, cy+6).LineTo(cx-8, cy+6).Close()
		p.StrokePath(&f, 1.8, col)
		var hill ui.Path
		hill.MoveTo(cx-8, cy+4).LineTo(cx-3, cy-1).LineTo(cx+1, cy+3).LineTo(cx+4, cy).LineTo(cx+8, cy+4)
		p.StrokePath(&hill, 1.6, col)
		var sun ui.Path
		sun.Circle(cx+3.5, cy-2.5, 1.6)
		p.FillPath(&sun, col)
	}
}

// dropHint is the one line over a composer while files are dragged over.
func (a *App) dropHint(c *ui.Context) {
	t := a.T
	ui.Text(c, a.L.T("media.drop")).FontSize(t.SM).FontWeight(700).TextColor(t.InkSoft).Padding(t.S2, 0, 0, 0)
}

// ---------- sending to a task ----------

// sendToTaskWith sends words and pictures straight into a task.
func (a *App) sendToTaskWith(id, text, cid string, atts []*attach) {
	if cid == "" {
		a.nextClient++
		cid = fmt.Sprintf("t%d-%d", a.Now().UnixMilli(), a.nextClient)
	}
	sd := a.S.AddSend(id, text, cid)
	sd.At, sd.Media = a.Now(), refsOf(atts)
	a.send(protocol.TaskSend{T: "task_send", TaskID: id, Text: text, ClientID: cid, Media: idsOf(atts)})
}

// waitingTaskSends are a task's messages whose pictures are still going up.
func (a *App) waitingTaskSends(taskID string) []*taskWait {
	var out []*taskWait
	for _, w := range a.med().taskWait {
		if w.taskID == taskID {
			out = append(out, w)
		}
	}
	return out
}

// ---------- the viewer ----------

// viewerState is the picture viewer while open.
type viewerState struct {
	open  bool
	items []protocol.MediaRef
	i     int
	zoom  bool
}

// mediaOf is every picture of a scope, in order: "conv" or "task:<id>".
func (a *App) mediaOf(scope string) []protocol.MediaRef {
	var out []protocol.MediaRef
	add := func(refs []protocol.MediaRef) {
		for _, r := range refs {
			if r.IsImage() {
				out = append(out, r)
			}
		}
	}
	if id, ok := strings.CutPrefix(scope, "task:"); ok {
		task := a.S.Task(id)
		if task == nil {
			return nil
		}
		for _, ev := range task.Events {
			body, _ := ev.Typed()
			switch b := body.(type) {
			case *protocol.TaskEvent:
				add(b.Media)
			case *protocol.Report:
				add(b.Media)
			}
		}
		return out
	}
	for _, e := range a.S.Channel {
		switch {
		case e.User != nil:
			add(e.User.Media)
		case e.AI != nil:
			add(e.AI.Media)
		}
	}
	return out
}

// OpenViewer opens the viewer on one picture of a scope.
func (a *App) OpenViewer(scope, id string) {
	items := a.mediaOf(scope)
	i := 0
	for k, r := range items {
		if r.ID == id {
			i = k
		}
	}
	if len(items) == 0 {
		return
	}
	a.med().viewer = &viewerState{open: true, items: items, i: i}
}

// viewerStep moves through the pictures (no wrap).
func (v *viewerState) step(d int) {
	v.i = max(0, min(len(v.items)-1, v.i+d))
	v.zoom = false
}

// viewer is the picture over the dimmed page, fitted; its bar: where it
// came from, Copy, Save, the count, Close.
func (a *App) viewer(c *ui.Context) {
	m := a.med()
	v := m.viewer
	if v == nil {
		return
	}
	if !v.open {
		m.viewer = nil
		return
	}
	t := a.T
	w, h := c.Size()
	if w <= 0 {
		w, h = 1100, 800
	}
	ref := v.items[v.i]
	ui.DialogBase(c, &v.open, func(back, panel ui.Element) {
		back.Background(t.Lightbox)
		panel.Width(w).Height(h).Label(a.L.T("media.image"))
		if !c.Preferences().ReduceMotion {
			shown := ui.Local(panel, "shown", func() bool { return false })
			p := ui.Pose{}
			if !*shown {
				p, *shown = ui.Pose{Scale: 0.96, Fade: 1}, true
				c.Invalidate()
			}
			panel.AnimatePose(p, t.Snappy)
		}
		switch {
		case c.Shortcut(0, ui.KeyLeft):
			v.step(-1)
		case c.Shortcut(0, ui.KeyRight):
			v.step(1)
		case c.Shortcut(0, ui.KeySpace):
			v.open = false
		case c.Shortcut(ui.Cmd, ui.KeyC):
			a.copyPicture(c, ref)
		}
		ui.Column(c.Key("viewer")).Fill().Children(func() {
			// Top: the count, then Close.
			ui.Row(c).Padding(t.S4, t.S5, t.S2, t.S5).AlignItems(ui.Center).Gap(t.S3).Children(func() {
				if len(v.items) > 1 {
					ui.Text(c, a.L.T("media.count", v.i+1, len(v.items))).FontSize(t.SM).TextColor(t.LightboxInk.Alpha(0.7))
				}
				ui.Spacer(c)
				cl := ui.Box(c.Key("v-close")).Size(t.ControlMD, t.ControlMD).Radius(t.ControlMD / 2).Role(ui.RoleButton).
					Label(a.L.T("media.close")).Cursor(ui.CursorPointer).Focusable().Draw(drawCross(t.LightboxInk))
				if cl.Clicked() {
					v.open = false
				}
			})
			// The picture, fitted (a double-click shows it at its own size).
			ui.Row(c.Key("v-stage")).Grow(1).MinHeight(0).Padding(t.S2, t.S5).AlignItems(ui.Center).Gap(t.S3).Children(func() {
				a.viewerArrow(c, v, -1)
				ui.Box(c.Key("v-pic")).Grow(1).MinWidth(0).Fill().Children(func() { a.viewerPicture(c, v, ref) })
				a.viewerArrow(c, v, 1)
			})
			// Bottom: where it came from, Copy, Save.
			ui.Row(c).Padding(t.S3, t.S5, t.S5, t.S5).Gap(t.S3).AlignItems(ui.Center).Justify(ui.Center).Children(func() {
				if ref.From != nil {
					title := a.S.Task(ref.From.TaskID).Title()
					if title != "" {
						l := ui.Text(c.Key("v-from"), a.L.T("media.from", title)).FontSize(t.SM).FontWeight(700).TextColor(t.LightboxInk).
							Cursor(ui.CursorPointer).Role(ui.RoleLink).Focusable().Label(a.L.T("media.from", title))
						if l.Clicked() {
							v.open = false
							a.OpenTask(ref.From.TaskID)
						}
						ui.Box(c).Width(t.S3)
					}
				}
				if a.viewerButton(c, a.L.T("media.copy")) {
					a.copyPicture(c, ref)
				}
				if a.viewerButton(c, a.L.T("media.save")) {
					a.savePicture(c, ref)
				}
			})
		})
	})
	if !v.open {
		m.viewer = nil
	}
}

func (a *App) viewerButton(c *ui.Context, label string) bool {
	t := a.T
	b := ui.Text(c.Key("vb:"+label), label).FontSize(t.SM).FontWeight(700).TextColor(t.LightboxInk).Padding(t.S2, t.S3).
		Radius(t.RadiusSM).Role(ui.RoleButton).Cursor(ui.CursorPointer).Focusable().Label(label)
	if b.Hovered() {
		b.Background(t.LightboxInk.Alpha(0.12))
	}
	return b.Clicked()
}

func (a *App) viewerArrow(c *ui.Context, v *viewerState, d int) {
	t := a.T
	k := "v-prev"
	if d > 0 {
		k = "v-next"
	}
	box := ui.Box(c.Key(k)).Size(t.ControlLG, t.ControlLG).Shrink(0)
	if (d < 0 && v.i == 0) || (d > 0 && v.i == len(v.items)-1) || len(v.items) < 2 {
		return
	}
	box.Radius(t.ControlLG / 2).Role(ui.RoleButton).Cursor(ui.CursorPointer).Focusable().Label(fmt.Sprintf("%d", v.i+1+d)).
		Draw(drawPicChevron(t.LightboxInk, d))
	if box.Hovered() {
		box.Background(t.LightboxInk.Alpha(0.12))
	}
	if box.Clicked() {
		v.step(d)
	}
}

// drawPicChevron points left (d < 0) or right.
func drawPicChevron(col ui.Color, d int) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		cx, cy := r.X+r.W/2, r.Y+r.H/2
		s := float32(5)
		if d < 0 {
			s = -s
		}
		var ch ui.Path
		ch.MoveTo(cx-s/2, cy-2*abs32(s)).LineTo(cx+s, cy).LineTo(cx-s/2, cy+2*abs32(s))
		p.StrokePath(&ch, 2.2, col)
	}
}

// viewerPicture is the picture itself: the full one when it is here, the
// tile (then the preview) while it comes; it drags out to Finder.
func (a *App) viewerPicture(c *ui.Context, v *viewerState, ref protocol.MediaRef) {
	full := a.picture(ref.Path())
	bmp := full.bmp
	if bmp == nil {
		if th := a.med().pics[ref.ThumbPath()]; th != nil && th.bmp != nil {
			bmp = th.bmp
		} else {
			bmp = a.preview(&ref)
		}
	}
	if bmp == nil {
		return
	}
	fit := ui.Contain
	if v.zoom {
		fit = ui.ScaleDown
	}
	img := ui.Image(c.Key("v-img:"+ref.ID), bmp).Fill().Fit(fit).Label(a.L.T("media.image"))
	if full.data != nil {
		data, name := full.data, fileName(ref)
		img.DragDataFrom(func() transfer.Data {
			dir := filepath.Join(os.TempDir(), "ducter-media")
			os.MkdirAll(dir, 0o700)
			p := filepath.Join(dir, name)
			if err := os.WriteFile(p, data, 0o600); err != nil {
				return transfer.Data{}
			}
			d, _ := transfer.FileData(p)
			return d
		})
	}
	if img.DoubleClicked() {
		v.zoom = !v.zoom
	}
}

// fileName is what a picture is called when saved or dragged out.
func fileName(ref protocol.MediaRef) string {
	if ref.Name != "" {
		return filepath.Base(ref.Name)
	}
	ext := map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp"}[ref.Type]
	return "Ducter-" + ref.ID[:min(12, len(ref.ID))] + ext
}

// copyPicture puts the picture on the pasteboard (⌘C, Copy).
func (a *App) copyPicture(c *ui.Context, ref protocol.MediaRef) {
	p := a.picture(ref.Path())
	if a.Media == nil || p.data == nil {
		return
	}
	img, err := media.Decode(p.data)
	if err != nil {
		return
	}
	png, err := media.PNG(img)
	if err != nil {
		return
	}
	if a.Media.CopyImage(png) == nil {
		c.Toast(a.L.T("media.copied"))
	}
}

// savePicture keeps the picture in Downloads, as it came.
func (a *App) savePicture(c *ui.Context, ref protocol.MediaRef) {
	p := a.picture(ref.Path())
	if a.Media == nil || p.data == nil {
		return
	}
	if _, err := a.Media.Save(fileName(ref), p.data); err == nil {
		c.Toast(a.L.T("media.saved"))
	}
}
