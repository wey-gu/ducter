// Package media is the Mac app's side of pictures (D206, design/media.md):
// it makes what the home stores before a byte leaves the Mac (the picture
// scaled to 2048 px on its long edge as a JPEG, its 720 px tile rendition
// and a ~16 px preview), uploads them to the home, and fetches pictures by
// their key. The home never decodes a picture; the sender's own code does.
package media

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"image"
	"image/color"
	"image/draw"
	"image/gif"
	"image/jpeg"
	"image/png"

	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp" // decode WebP

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// Prepared is a picture ready to upload.
type Prepared struct {
	// Full is what the home keeps: a JPEG ≤ 2048 px on its long edge, or
	// a small GIF as it is (it may move).
	Full []byte
	// Thumb is the tile rendition (≤ 720 px), nil when Full is that small.
	Thumb []byte
	// Preview is a ~16 px JPEG as a data: URL, shown blurred while the
	// picture loads.
	Preview string
	// W, H are Full's pixel size, upright.
	W, H int
	// Image is the upright picture, for the composer's tray.
	Image image.Image
}

// ErrNotImage means the bytes aren't a picture the app reads (HEIC, PDF…).
var ErrNotImage = errors.New("media: not a picture")

// ErrTooBig means the picture is over the home's cap even when made small.
var ErrTooBig = errors.New("media: too big")

// Quality is the JPEG quality of the picture and its tile.
const (
	Quality      = 85
	ThumbQuality = 80
	PreviewEdge  = 16
)

// Prepare decodes a picture, stands it upright (a JPEG's EXIF
// orientation), scales it down and encodes it again: the JPEG it makes
// carries no EXIF, so no location leaves the Mac.
func Prepare(data []byte) (*Prepared, error) {
	img, format, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, ErrNotImage
	}
	if format == "jpeg" {
		img = orient(img, Orientation(data))
	}
	b := img.Bounds()
	// A small GIF stays as it is, so it keeps moving.
	if format == "gif" && len(data) <= 8*1024*1024 && max(b.Dx(), b.Dy()) <= protocol.MediaLongEdge {
		if g, err := gif.DecodeAll(bytes.NewReader(data)); err == nil && len(g.Image) > 1 {
			p := &Prepared{Full: data, W: b.Dx(), H: b.Dy(), Image: img}
			p.Thumb, _ = encodeJPEG(scale(img, protocol.MediaThumbEdge), ThumbQuality)
			p.Preview = preview(img)
			return p, nil
		}
	}
	full := scale(img, protocol.MediaLongEdge)
	out, err := encodeJPEG(full, Quality)
	if err != nil {
		return nil, err
	}
	if len(out) > protocol.MediaBytesMax {
		return nil, ErrTooBig
	}
	fb := full.Bounds()
	p := &Prepared{Full: out, W: fb.Dx(), H: fb.Dy(), Image: full}
	if max(fb.Dx(), fb.Dy()) > protocol.MediaThumbEdge {
		p.Thumb, _ = encodeJPEG(scale(full, protocol.MediaThumbEdge), ThumbQuality)
	}
	p.Preview = preview(full)
	return p, nil
}

// scale fits img in edge×edge (never up), on a white ground (a JPEG has
// no transparency; a screenshot's clear corners read as paper).
func scale(img image.Image, edge int) image.Image {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= 0 || h <= 0 {
		return img
	}
	if m := max(w, h); m > edge {
		w, h = max(1, w*edge/m), max(1, h*edge/m)
	}
	dst := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.Draw(dst, dst.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), img, b, draw.Over, nil)
	return dst
}

func encodeJPEG(img image.Image, q int) ([]byte, error) {
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: q}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// preview is a 16 px JPEG as a data: URL (a few hundred bytes).
func preview(img image.Image) string {
	b := img.Bounds()
	w, h := PreviewEdge, PreviewEdge
	if b.Dx() > b.Dy() {
		h = max(1, PreviewEdge*b.Dy()/b.Dx())
	} else if b.Dy() > 0 {
		w = max(1, PreviewEdge*b.Dx()/b.Dy())
	}
	small := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.Draw(small, small.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	xdraw.ApproxBiLinear.Scale(small, small.Bounds(), img, b, draw.Over, nil)
	out, err := encodeJPEG(small, 60)
	if err != nil {
		return ""
	}
	s := "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(out)
	if len(s) > protocol.MediaPreviewMax {
		return ""
	}
	return s
}

// Orientation is a JPEG's EXIF orientation (1 when none).
func Orientation(b []byte) int {
	if len(b) < 4 || b[0] != 0xff || b[1] != 0xd8 {
		return 1
	}
	i := 2
	for i+4 <= len(b) {
		if b[i] != 0xff {
			return 1
		}
		m := b[i+1]
		if m == 0xda || m == 0xd9 {
			return 1
		}
		n := int(binary.BigEndian.Uint16(b[i+2:]))
		if m == 0xe1 && i+4+n <= len(b) && n > 14 && string(b[i+4:i+8]) == "Exif" {
			t := b[i+10 : i+2+n]
			var bo binary.ByteOrder = binary.BigEndian
			if len(t) < 8 {
				return 1
			}
			if t[0] == 'I' {
				bo = binary.LittleEndian
			}
			ifd := int(bo.Uint32(t[4:]))
			if ifd+2 > len(t) {
				return 1
			}
			cnt := int(bo.Uint16(t[ifd:]))
			for k := 0; k < cnt; k++ {
				e := ifd + 2 + k*12
				if e+12 > len(t) {
					break
				}
				if bo.Uint16(t[e:]) == 0x0112 {
					if v := int(bo.Uint16(t[e+8:])); v >= 1 && v <= 8 {
						return v
					}
				}
			}
			return 1
		}
		i += 2 + n
	}
	return 1
}

// orient turns img upright for an EXIF orientation 1–8.
func orient(img image.Image, o int) image.Image {
	if o <= 1 || o > 8 {
		return img
	}
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	dw, dh := w, h
	if o >= 5 {
		dw, dh = h, w
	}
	dst := image.NewRGBA(image.Rect(0, 0, dw, dh))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			var dx, dy int
			switch o {
			case 2:
				dx, dy = w-1-x, y
			case 3:
				dx, dy = w-1-x, h-1-y
			case 4:
				dx, dy = x, h-1-y
			case 5:
				dx, dy = y, x
			case 6:
				dx, dy = h-1-y, x
			case 7:
				dx, dy = h-1-y, w-1-x
			case 8:
				dx, dy = y, w-1-x
			}
			dst.Set(dx, dy, img.At(b.Min.X+x, b.Min.Y+y))
		}
	}
	return dst
}

// Decode reads a picture the home sent (JPEG, PNG, GIF, WebP).
func Decode(data []byte) (image.Image, error) {
	img, _, err := image.Decode(bytes.NewReader(data))
	return img, err
}

// PNG encodes img as PNG (the pasteboard and drag-out take PNG).
func PNG(img image.Image) ([]byte, error) {
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
