package theme

import (
	"embed"
	"encoding/json"
	"log"
	"sync"

	"github.com/egoist/mygo/ui"
)

// TitleSound is the title moment's sound (D87). Made by tools/sound
// (see tools/sound/SOURCES.md); never edit by hand.
//
//go:embed sound/title.ogg
var TitleSound []byte

//go:embed art/title/*.webp art/title/layers.json
var titleFS embed.FS

// TitleArt is the title moment's key art, cut into layers for parallax by
// tools/art/title_layers.py: the dawn sky, the island, Ducter awake and
// asleep (its eyes painted over with its own skin), and the clay
// logotype, plain and lit.
type TitleArt struct {
	Sky, Island, Ducter, Closed, Logo, LogoLit *ui.Bitmap
	Layout                                     TitleLayout
}

// TitleLayout is where the layers sit, as fractions of the frame
// (layers.json).
type TitleLayout struct {
	Frame  [2]float32 `json:"frame"`
	Island TitleBox   `json:"island"`
	Ducter TitleBox   `json:"ducter"`
	// Lids are Ducter's eyes, as fractions of the Ducter layer.
	Lids []TitleBox `json:"lids"`
}

// TitleBox is a box as fractions of what holds it.
type TitleBox struct {
	X float32 `json:"x"`
	Y float32 `json:"y"`
	W float32 `json:"w"`
	H float32 `json:"h"`
}

var (
	titleOnce sync.Once
	titleArt  *TitleArt
)

// Title returns the title moment's art, decoded once; nil if it is missing.
func Title() *TitleArt {
	titleOnce.Do(func() {
		var t TitleArt
		data, err := titleFS.ReadFile("art/title/layers.json")
		if err == nil {
			err = json.Unmarshal(data, &t.Layout)
		}
		if err != nil {
			log.Printf("ducter: title layout: %v", err)
			return
		}
		for name, dst := range map[string]**ui.Bitmap{
			"sky": &t.Sky, "island": &t.Island, "ducter": &t.Ducter, "ducter_closed": &t.Closed,
			"logo": &t.Logo, "logo_lit": &t.LogoLit,
		} {
			b, err := titleFS.ReadFile("art/title/" + name + ".webp")
			if err == nil {
				*dst, err = ui.DecodeBitmap(b)
			}
			if err != nil {
				log.Printf("ducter: title art %s: %v", name, err)
				return
			}
		}
		titleArt = &t
	})
	return titleArt
}
