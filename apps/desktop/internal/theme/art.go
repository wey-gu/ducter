package theme

import (
	"embed"
	"fmt"
	"log"
	"sync"

	"github.com/egoist/mygo/ui"
)

// The clay Ducter (design/art/assets/alpha, D53), cut square around the
// character and downscaled: @160 for avatars up to 80 DIPs, @400 for the
// hero. Regenerate from the 1024px masters, never upscale these.
//
//go:embed art/*.png art/clay/*.png art/crop/*.png
var artFS embed.FS

// Presence is what the partner's character shows.
type Presence string

const (
	Idle     Presence = "idle"
	Working  Presence = "working"
	NeedsYou Presence = "needsyou"
	Done     Presence = "done"
	Napping  Presence = "napping"
	// Waiting: on its little bench, looking out (D112).
	Waiting Presence = "waiting"
)

// Presences are all of them, in a fixed order.
var Presences = []Presence{Idle, Working, NeedsYou, Done, Napping, Waiting}

var (
	artMu    sync.Mutex
	artCache = map[string]*ui.Bitmap{}
)

// Art returns the character in a presence, at the smallest size of at
// least px pixels (160 or 400), or nil if it is missing.
func Art(p Presence, px float32) *ui.Bitmap {
	size := 160
	if px > 160 {
		size = 400
	}
	return load(fmt.Sprintf("art/ducter_%s@%d.png", p, size))
}

// Face is the character in a presence cut to its own outline (no square
// around it; design/art/assets/alpha cropped to the alpha's bounds), at
// 128 or 256 px on its long side: the conversation bar's 52-point face
// and an opened task's state face (D76). The eyelids of FaceLids sit on
// the idle one.
func Face(p Presence, px float32) *ui.Bitmap {
	size := 128
	if px > 128 {
		size = 256
	}
	return load(fmt.Sprintf("art/crop/ducter_%s@%d.png", p, size))
}

// Lid is an eyelid over the idle face's eye, as fractions of the cropped
// idle art (Face(Idle, …)): its box, and its colors left to right.
type Lid struct {
	X, Y, W, H float32
	From, To   ui.Color
}

// FaceLids are the idle face's two eyelids, for the blink (D77; the
// prototype's .lid.l / .lid.r).
var FaceLids = [2]Lid{
	{X: 0.346, Y: 0.248, W: 0.108, H: 0.262, From: ui.Hex("#F4A065"), To: ui.Hex("#F19562")},
	{X: 0.621, Y: 0.243, W: 0.106, H: 0.264, From: ui.Hex("#E17938"), To: ui.Hex("#CB6026")},
}

// IdleSquareContent is where the cropped idle art sits in the square
// Art(Idle, …), as fractions: its eyelids map through it.
var IdleSquareContent = struct{ X, Y, W, H float32 }{X: 66.0 / 400, Y: 88.0 / 400, W: 256.0 / 400, H: 230.0 / 400}

// Clay is a clay asset of Your devices and abilities (D53), cut to its
// content: devices and the pedestal at 640 px on the long side, abilities,
// the empty slot and the AI-account tokens at 256. Nil if it is missing.
func Clay(name string) *ui.Bitmap {
	for _, size := range []int{1280, 640, 256} {
		if _, err := artFS.Open(fmt.Sprintf("art/clay/%s@%d.png", name, size)); err == nil {
			return load(fmt.Sprintf("art/clay/%s@%d.png", name, size))
		}
	}
	log.Printf("ducter: no clay art %q", name)
	return nil
}

func load(name string) *ui.Bitmap {
	artMu.Lock()
	defer artMu.Unlock()
	if b, ok := artCache[name]; ok {
		return b
	}
	data, err := artFS.ReadFile(name)
	var b *ui.Bitmap
	if err == nil {
		b, err = ui.DecodeBitmap(data)
	}
	if err != nil {
		log.Printf("ducter: art %s: %v", name, err)
	}
	artCache[name] = b
	return b
}
