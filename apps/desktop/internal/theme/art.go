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

// Lid is an eyelid's box over the idle face's eye (the eye and its
// sculpted rim), as fractions of the cropped idle art (Face(Idle, …)).
type Lid struct {
	X, Y, W, H float32
}

// FaceLids are the idle face's two eyelids, for the blink (D77). Printed
// by tools/art/eyes.py, which also makes the closed faces below.
var FaceLids = [2]Lid{
	{X: 0.3207, Y: 0.2352, W: 0.1633, H: 0.3078},
	{X: 0.5941, Y: 0.2222, W: 0.1633, H: 0.3209},
}

// FaceClosed is the cut-out idle face with its eyes closed: the same
// render, each eye filled from the clay round it (tools/art/eyes.py), the
// size Face(Idle, px) picks.
func FaceClosed(px float32) *ui.Bitmap {
	size := 128
	if px > 128 {
		size = 256
	}
	return load(fmt.Sprintf("art/crop/ducter_idle_closed@%d.png", size))
}

// ArtClosed is the square idle art with its eyes closed, the size
// Art(Idle, px) picks.
func ArtClosed(px float32) *ui.Bitmap {
	size := 160
	if px > 160 {
		size = 400
	}
	return load(fmt.Sprintf("art/ducter_idle_closed@%d.png", size))
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
