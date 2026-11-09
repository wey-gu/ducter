package theme

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"sync"
)

var (
	trayOnce sync.Once
	trayPNG  []byte
)

// TrayIcon is the menu bar extra's icon: the clay partner as a template
// image (black on transparent, which macOS tints to match the menu bar):
// a rounded pebble, a little wider than tall, with its two eyes cut out.
// 36 pixels square, for 18 points at 2x.
func TrayIcon() []byte {
	trayOnce.Do(func() {
		const n, ss = 36, 4 // pixels, supersamples per side
		img := image.NewNRGBA(image.Rect(0, 0, n, n))
		inEllipse := func(x, y, cx, cy, rx, ry float64) bool {
			dx, dy := (x-cx)/rx, (y-cy)/ry
			return dx*dx+dy*dy <= 1
		}
		for py := 0; py < n; py++ {
			for px := 0; px < n; px++ {
				hit := 0
				for sy := 0; sy < ss; sy++ {
					for sx := 0; sx < ss; sx++ {
						x := float64(px) + (float64(sx)+0.5)/ss
						y := float64(py) + (float64(sy)+0.5)/ss
						// The pebble: a soft super-ellipse, flatter at the bottom.
						body := inEllipse(x, y, 18, 19.5, 15.5, 13)
						eye := inEllipse(x, y, 13, 18, 2.2, 3.1) || inEllipse(x, y, 23, 18, 2.2, 3.1)
						if body && !eye {
							hit++
						}
					}
				}
				img.SetNRGBA(px, py, color.NRGBA{0, 0, 0, uint8(255 * hit / (ss * ss))})
			}
		}
		var b bytes.Buffer
		_ = png.Encode(&b, img)
		trayPNG = b.Bytes()
	})
	return trayPNG
}
