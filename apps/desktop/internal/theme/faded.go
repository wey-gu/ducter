package theme

import (
	"bytes"
	"fmt"
	"image"
	"image/draw"
	_ "image/png" // the clay and the app icons
	"log"
	"regexp"
	"sync"

	"github.com/egoist/mygo/ui"
)

// D374: the contrast floor of a faded mark (a thing not set up yet, a
// source that is down). Faded takes the colour away, never the shape, and
// never by transparency: at half alpha a pale clay handset vanished into
// the white card and Jira's navy into the dark one (research/135).
//
//   - A drawn mark (a brand SVG) turns to the theme's InkMuted, its holes
//     (the white in Messages' bubble, Telegram's plane) the tile's ground:
//     InkMuted holds 4.5:1 on the card in both themes (contrast_test.go).
//   - A picture (clay, an app icon) turns grey, its tone times the theme's
//     Faded, so its middle keeps 3:1 on the card in both themes
//     (faded_test.go).
//
// The web's twin is --faded-ink and --faded-art (apps/web/static/app.css).

var (
	fadedMu    sync.Mutex
	fadedCache = map[string]ui.ImageSource{}
)

// FadedClay is Clay(name) faded for the theme t: grey, its tone times
// t.Faded. Nil if the art is missing.
func FadedClay(name string, t *Tokens) *ui.Bitmap {
	file := ""
	if artDark.Load() {
		file = clayFile(name + "_dark")
	}
	if file == "" {
		file = clayFile(name)
	}
	if file == "" {
		log.Printf("ducter: no clay art %q", name)
		return nil
	}
	b, _ := fadedPicture(artFS.ReadFile, file, t.Faded).(*ui.Bitmap)
	return b
}

// restTokens are the two appearances' resting tokens, made once.
var restTokens = sync.OnceValue(func() [2]*Tokens { return [2]*Tokens{Pebble(), PebbleDark()} })

// FadedClayNow is FadedClay for the window's appearance now (UseDarkArt),
// for a painter that has no tokens at hand.
func FadedClayNow(name string) *ui.Bitmap {
	t := restTokens()[0]
	if artDark.Load() {
		t = restTokens()[1]
	}
	return FadedClay(name, t)
}

// FadedBrand is Brand(name) faded for the theme t: a drawn mark in the
// muted ink with its holes the tile's ground (Surface), an app icon grey.
// The colours are the theme's resting ones (For(t.Dark)), so the appearance's
// cross-fade doesn't mint a mark per frame.
func FadedBrand(name string, t *Tokens) ui.ImageSource {
	rest := For(t.Dark)
	if data, err := brandFS.ReadFile("art/brand/" + name + ".svg"); err == nil {
		key := fmt.Sprintf("brand:%s:%v", name, t.Dark)
		fadedMu.Lock()
		defer fadedMu.Unlock()
		if s, ok := fadedCache[key]; ok {
			return s
		}
		var src ui.ImageSource
		if s, err := ui.ParseSVG(Silhouette(data, rest.InkMuted, rest.Surface)); err == nil {
			src = s
		} else {
			log.Printf("ducter: faded brand %s: %v", name, err)
		}
		fadedCache[key] = src
		return src
	}
	return fadedPicture(brandFS.ReadFile, "art/brand/"+name+".png", rest.Faded)
}

func clayFile(name string) string {
	for _, size := range []int{1280, 640, 256, 128} {
		f := fmt.Sprintf("art/clay/%s@%d.png", name, size)
		if _, err := artFS.Open(f); err == nil {
			return f
		}
	}
	return ""
}

// fadedPicture is the picture at file, grey and its tone times k, cached.
func fadedPicture(read func(string) ([]byte, error), file string, k float32) ui.ImageSource {
	key := fmt.Sprintf("pic:%s:%.3f", file, k)
	fadedMu.Lock()
	defer fadedMu.Unlock()
	if s, ok := fadedCache[key]; ok {
		return s
	}
	var src ui.ImageSource
	data, err := read(file)
	if err == nil {
		var img image.Image
		if img, _, err = image.Decode(bytes.NewReader(data)); err == nil {
			src = ui.NewBitmap(Grey(img, k))
		}
	}
	if err != nil {
		log.Printf("ducter: faded %s: %v", file, err)
	}
	fadedCache[key] = src
	return src
}

// Grey is img in grey (Rec. 709 weights on the sRGB values, as CSS's
// grayscale()), its tone times k (CSS's brightness()), alpha kept.
func Grey(img image.Image, k float32) *image.NRGBA {
	b := img.Bounds()
	src := image.NewNRGBA(b)
	draw.Draw(src, b, img, b.Min, draw.Src)
	out := image.NewNRGBA(b)
	for i := 0; i+3 < len(src.Pix); i += 4 {
		r, g, bl := float32(src.Pix[i]), float32(src.Pix[i+1]), float32(src.Pix[i+2])
		y := (0.2126*r + 0.7152*g + 0.0722*bl) * k
		if y > 255 {
			y = 255
		}
		v := uint8(y + 0.5)
		out.Pix[i], out.Pix[i+1], out.Pix[i+2], out.Pix[i+3] = v, v, v, src.Pix[i+3]
	}
	return out
}

var (
	fillRe = regexp.MustCompile(`fill="([^"]*)"`)
	white  = map[string]bool{"#fff": true, "#FFF": true, "#ffffff": true, "#FFFFFF": true}
)

// Silhouette is a brand SVG with every painted shape in ink and its white
// holes in ground ("none" stays none).
func Silhouette(svg []byte, ink, ground ui.Color) []byte {
	in, gr := hexOf(ink), hexOf(ground)
	return fillRe.ReplaceAllFunc(svg, func(m []byte) []byte {
		v := string(fillRe.FindSubmatch(m)[1])
		switch {
		case v == "none":
			return m
		case white[v]:
			return []byte(`fill="` + gr + `"`)
		}
		return []byte(`fill="` + in + `"`)
	})
}

func hexOf(c ui.Color) string { return fmt.Sprintf("#%02X%02X%02X", c.R, c.G, c.B) }
