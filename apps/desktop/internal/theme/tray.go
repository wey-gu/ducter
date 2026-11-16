package theme

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"sync"
)

// TrayState is how the whole stands, as the menu bar extra shows it (D306):
// three states and no number. Only NeedsYou draws the eye.
type TrayState int

const (
	// TrayQuiet: nothing works and nothing needs you (resting waits count as
	// quiet: they are not the person's to mind).
	TrayQuiet TrayState = iota
	// TrayWorking: something is at work. The eyes look down at the work;
	// still a template image, as quiet as the bar.
	TrayWorking
	// TrayNeedsYou: something needs you. A soft clay dot at the pebble's
	// shoulder, the accent's clay, never red.
	TrayNeedsYou
)

var (
	trayMu    sync.Mutex
	trayCache = map[[2]int][]byte{}
)

// TrayIcon is the menu bar extra's quiet icon: the clay partner as a
// template image (black on transparent, which macOS tints to match the
// menu bar): a rounded pebble, a little wider than tall, with its two eyes
// cut out. 36 pixels square, for 18 points at 2x.
func TrayIcon() []byte {
	b, _ := TrayIconFor(TrayQuiet, false)
	return b
}

// TrayIconFor is the icon for a state on a light or dark menu bar, and
// whether it is a template image. Quiet and working are templates (macOS
// tints them, so they sit in the bar like any other item); needs you is
// drawn in colour, its pebble in the bar's own ink (dark tells which) and
// its dot in the accent.
func TrayIconFor(s TrayState, dark bool) ([]byte, bool) {
	template := s != TrayNeedsYou
	key := [2]int{int(s), 0}
	if !template && dark {
		key[1] = 1
	}
	trayMu.Lock()
	defer trayMu.Unlock()
	if b, ok := trayCache[key]; ok {
		return b, template
	}
	b := drawTray(s, dark)
	trayCache[key] = b
	return b, template
}

// TrayDot is the needs-you dot's colour: Pebble's accent (the same on both
// papers).
func TrayDot() color.NRGBA {
	a := Pebble().Accent
	return color.NRGBA{a.R, a.G, a.B, 255}
}

func drawTray(s TrayState, dark bool) []byte {
	const n, ss = 36, 4 // pixels, supersamples per side
	img := image.NewNRGBA(image.Rect(0, 0, n, n))
	inEllipse := func(x, y, cx, cy, rx, ry float64) bool {
		dx, dy := (x-cx)/rx, (y-cy)/ry
		return dx*dx+dy*dy <= 1
	}
	ink := color.NRGBA{0, 0, 0, 255}
	if s == TrayNeedsYou {
		// The bar's own ink, as a template would be tinted: near black on a
		// light bar, near white on a dark one.
		ink = color.NRGBA{0x1d, 0x1d, 0x1f, 230}
		if dark {
			ink = color.NRGBA{0xff, 0xff, 0xff, 235}
		}
	}
	dot := TrayDot()
	for py := 0; py < n; py++ {
		for px := 0; px < n; px++ {
			body, spot := 0, 0
			for sy := 0; sy < ss; sy++ {
				for sx := 0; sx < ss; sx++ {
					x := float64(px) + (float64(sx)+0.5)/ss
					y := float64(py) + (float64(sy)+0.5)/ss
					// The pebble: a soft super-ellipse, flatter at the bottom.
					in := inEllipse(x, y, 18, 19.5, 15.5, 13)
					var eye bool
					switch s {
					case TrayWorking:
						// Looking down at the work: two low, narrow slits.
						eye = inEllipse(x, y, 13, 19.5, 2.6, 1.15) || inEllipse(x, y, 23, 19.5, 2.6, 1.15)
					default:
						eye = inEllipse(x, y, 13, 18, 2.2, 3.1) || inEllipse(x, y, 23, 18, 2.2, 3.1)
					}
					if s == TrayNeedsYou {
						// The dot at the shoulder, with a clear gap around it so it
						// reads as its own mark.
						if inEllipse(x, y, 29.5, 7, 5, 5) {
							spot++
							continue
						}
						if inEllipse(x, y, 29.5, 7, 7, 7) {
							continue
						}
					}
					if in && !eye {
						body++
					}
				}
			}
			all := ss * ss
			switch {
			case spot > 0:
				// The dot's edge blends into the gap (transparent), never into ink.
				img.SetNRGBA(px, py, color.NRGBA{dot.R, dot.G, dot.B, uint8(255 * spot / all)})
			case body > 0:
				img.SetNRGBA(px, py, color.NRGBA{ink.R, ink.G, ink.B, uint8(int(ink.A) * body / all)})
			}
		}
	}
	var b bytes.Buffer
	_ = png.Encode(&b, img)
	return b.Bytes()
}
