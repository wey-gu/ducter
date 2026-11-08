// Command appicon draws Ducter's macOS app icon: the clay character
// (design/art/assets/alpha/ducter_idle.png) standing on a warm squircle, on
// the 1024 px macOS icon grid (an 824 px body, centred, with its drop
// shadow). Standard library and golang.org/x/image only; scripts/make-app.sh
// turns the PNG into AppIcon.icns with sips and iconutil.
//
//	go run ./cmd/appicon -in ../../design/art/assets/alpha/ducter_idle.png -out icon-1024.png
package main

import (
	"flag"
	"image"
	"image/color"
	"image/png"
	"log"
	"math"
	"os"

	xdraw "golang.org/x/image/draw"
)

const (
	size = 1024
	// squircle exponent: 5 is close to Apple's continuous-corner shape.
	squircleN = 5.0
)

// The icon body on the macOS grid (824 px, centred). With -ios the body is the whole square,
// opaque and without a drop shadow: iOS masks app icons itself and refuses alpha.
var (
	body  = 824
	inset = (size - body) / 2
)

// Pebble's warm paper, a shade deeper at the bottom so the body reads as
// an object, and the character's own orange for the ground shadow.
var (
	top    = rgb(0xFF, 0xF6, 0xEA) // theme Bg
	bottom = rgb(0xFF, 0xE2, 0xC2)
	ground = rgb(0xE8, 0xA8, 0x72)
)

type rgbf struct{ r, g, b float64 }

func rgb(r, g, b uint8) rgbf { return rgbf{float64(r) / 255, float64(g) / 255, float64(b) / 255} }

func main() {
	in := flag.String("in", "", "the character, a square PNG with true alpha")
	out := flag.String("out", "icon-1024.png", "where to write the 1024 px icon")
	scale := flag.Float64("scale", 0.70, "the character's height as a share of the body")
	ios := flag.Bool("ios", false, "a full-bleed, opaque square for iOS (no squircle, no shadow)")
	flag.Parse()
	if *ios {
		body, inset = size, 0
	}
	if *in == "" {
		log.Fatal("appicon: -in is required")
	}
	f, err := os.Open(*in)
	if err != nil {
		log.Fatal(err)
	}
	src, err := png.Decode(f)
	f.Close()
	if err != nil {
		log.Fatal(err)
	}

	dst := image.NewNRGBA(image.Rect(0, 0, size, size))
	mask := squircleMask()
	if *ios {
		for i := range mask {
			mask[i] = 1
		}
	} else {
		// 1. The drop shadow of the body: the macOS grid's soft shadow below.
		shadow := shift(mask, 0, 12)
		shadow = blur(shadow, 14, 3)
		paint(dst, shadow, rgbf{0, 0, 0}, 0.30, nil)
	}

	// 2. The body: warm paper, light from above.
	paint(dst, mask, rgbf{}, 1, func(x, y int) rgbf {
		t := float64(y-inset) / float64(body)
		t = math.Max(0, math.Min(1, t))
		return mix(top, bottom, t*t*0.9+t*0.1)
	})

	// 3. The character, cropped to what is drawn and scaled to the body.
	ch := crop(src)
	h := int(float64(body) * *scale)
	w := ch.Bounds().Dx() * h / ch.Bounds().Dy()
	if w > body*86/100 {
		w = body * 86 / 100
		h = ch.Bounds().Dy() * w / ch.Bounds().Dx()
	}
	x0 := (size - w) / 2
	y0 := inset + (body-h)/2 + body*3/100 // a little low: it stands on the body
	scaled := image.NewNRGBA(image.Rect(0, 0, w, h))
	xdraw.CatmullRom.Scale(scaled, scaled.Bounds(), ch, ch.Bounds(), xdraw.Src, nil)

	// 4. Its ground shadow: a soft oval under the feet, inside the body.
	feet := y0 + h - h/40
	oval := make([]float64, size*size)
	rx, ry := float64(w)*0.36, float64(h)*0.05
	cx := float64(size) / 2
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			dx, dy := (float64(x)-cx)/rx, (float64(y)-float64(feet))/ry
			if d := dx*dx + dy*dy; d < 1 {
				oval[y*size+x] = (1 - d) * mask[y*size+x]
			}
		}
	}
	oval = blur(oval, 10, 3)
	paint(dst, oval, ground, 0.6, nil)

	over(dst, scaled, x0, y0)

	o, err := os.Create(*out)
	if err != nil {
		log.Fatal(err)
	}
	defer o.Close()
	if err := png.Encode(o, dst); err != nil {
		log.Fatal(err)
	}
}

// squircleMask is the body's coverage per pixel, antialiased 4x4.
func squircleMask() []float64 {
	m := make([]float64, size*size)
	half := float64(body) / 2
	c := float64(size) / 2
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			var in int
			for sy := 0; sy < 4; sy++ {
				for sx := 0; sx < 4; sx++ {
					px := (float64(x) + (float64(sx)+0.5)/4 - c) / half
					py := (float64(y) + (float64(sy)+0.5)/4 - c) / half
					if math.Pow(math.Abs(px), squircleN)+math.Pow(math.Abs(py), squircleN) <= 1 {
						in++
					}
				}
			}
			m[y*size+x] = float64(in) / 16
		}
	}
	return m
}

func shift(m []float64, dx, dy int) []float64 {
	o := make([]float64, len(m))
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			sx, sy := x-dx, y-dy
			if sx >= 0 && sy >= 0 && sx < size && sy < size {
				o[y*size+x] = m[sy*size+sx]
			}
		}
	}
	return o
}

// blur is a box blur of radius r, repeated (three passes look Gaussian).
func blur(m []float64, r, passes int) []float64 {
	cur := append([]float64(nil), m...)
	tmp := make([]float64, len(m))
	for p := 0; p < passes; p++ {
		for y := 0; y < size; y++ {
			var acc float64
			for x := -r; x < size+r; x++ {
				if x+r < size && x+r >= 0 {
					acc += cur[y*size+x+r]
				}
				if x-r-1 >= 0 && x-r-1 < size {
					acc -= cur[y*size+x-r-1]
				}
				if x >= 0 && x < size {
					tmp[y*size+x] = acc / float64(2*r+1)
				}
			}
		}
		for x := 0; x < size; x++ {
			var acc float64
			for y := -r; y < size+r; y++ {
				if y+r < size && y+r >= 0 {
					acc += tmp[(y+r)*size+x]
				}
				if y-r-1 >= 0 && y-r-1 < size {
					acc -= tmp[(y-r-1)*size+x]
				}
				if y >= 0 && y < size {
					cur[y*size+x] = acc / float64(2*r+1)
				}
			}
		}
	}
	return cur
}

// paint composites a color (or a color per pixel) through a coverage mask.
func paint(dst *image.NRGBA, m []float64, col rgbf, opacity float64, at func(x, y int) rgbf) {
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			a := m[y*size+x] * opacity
			if a <= 0 {
				continue
			}
			c := col
			if at != nil {
				c = at(x, y)
			}
			blend(dst, x, y, c, a)
		}
	}
}

// blend draws c with alpha a over the pixel (straight alpha).
func blend(dst *image.NRGBA, x, y int, c rgbf, a float64) {
	i := dst.PixOffset(x, y)
	p := dst.Pix[i : i+4]
	da := float64(p[3]) / 255
	oa := a + da*(1-a)
	if oa <= 0 {
		return
	}
	ch := func(s float64, d uint8) uint8 {
		v := (s*a + float64(d)/255*da*(1-a)) / oa
		return uint8(math.Round(math.Max(0, math.Min(1, v)) * 255))
	}
	p[0], p[1], p[2], p[3] = ch(c.r, p[0]), ch(c.g, p[1]), ch(c.b, p[2]), uint8(math.Round(oa*255))
}

func over(dst *image.NRGBA, src *image.NRGBA, x0, y0 int) {
	b := src.Bounds()
	for y := 0; y < b.Dy(); y++ {
		for x := 0; x < b.Dx(); x++ {
			c := src.NRGBAAt(x, y)
			if c.A == 0 {
				continue
			}
			blend(dst, x0+x, y0+y, rgbf{float64(c.R) / 255, float64(c.G) / 255, float64(c.B) / 255}, float64(c.A)/255)
		}
	}
}

func mix(a, b rgbf, t float64) rgbf {
	return rgbf{a.r + (b.r-a.r)*t, a.g + (b.g-a.g)*t, a.b + (b.b-a.b)*t}
}

// crop cuts the image to the pixels that are drawn (alpha above a hair).
func crop(img image.Image) *image.NRGBA {
	b := img.Bounds()
	minX, minY, maxX, maxY := b.Max.X, b.Max.Y, b.Min.X, b.Min.Y
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			if _, _, _, a := img.At(x, y).RGBA(); a > 0x0800 {
				minX, minY = min(minX, x), min(minY, y)
				maxX, maxY = max(maxX, x+1), max(maxY, y+1)
			}
		}
	}
	out := image.NewNRGBA(image.Rect(0, 0, maxX-minX, maxY-minY))
	for y := minY; y < maxY; y++ {
		for x := minX; x < maxX; x++ {
			out.Set(x-minX, y-minY, color.NRGBAModel.Convert(img.At(x, y)))
		}
	}
	return out
}
