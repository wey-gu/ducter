package theme

import (
	"embed"
	"fmt"
	"log"
	"sync"

	"github.com/egoist/mygo/ui"
)

// The clay Ducter (docs/art/assets/alpha, D53), cut square around the
// character and downscaled: @160 for avatars up to 80 DIPs, @400 for the
// hero. Regenerate from the 1024px masters, never upscale these.
//
//go:embed art/*.png
var artFS embed.FS

// Presence is what the partner's character shows.
type Presence string

const (
	Idle     Presence = "idle"
	Working  Presence = "working"
	NeedsYou Presence = "needsyou"
	Done     Presence = "done"
	Napping  Presence = "napping"
)

// Presences are all of them, in a fixed order.
var Presences = []Presence{Idle, Working, NeedsYou, Done, Napping}

var (
	artMu    sync.Mutex
	artCache = map[string]*ui.Bitmap{}
)

// Art returns the character in a presence, at the smallest size of at
// least px pixels (160 or 400), or nil if it is missing.
func Art(p Presence, px float32) *ui.Bitmap {
	size := 160
	if px > 160 && (p == Idle || p == Napping) {
		size = 400
	}
	name := fmt.Sprintf("art/ducter_%s@%d.png", p, size)
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
