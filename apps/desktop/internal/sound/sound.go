// Package sound plays the app's few sounds through MyGo's audio (no cgo:
// an Audio Queue on the default output, so it follows the Mac's output
// device and volume).
package sound

import (
	"log"
	"sync"
	"time"

	"github.com/egoist/mygo/audio"

	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

var (
	once  sync.Once
	title *audio.Sound
)

// Playing is a sound that plays; Stop fades it out over fade (0: at once).
type Playing interface{ Stop(fade time.Duration) }

type player struct{ p *audio.Player }

// Preload decodes the title moment's sound, so Title starts it at once.
func Preload() { once.Do(decode) }

// Title starts the title moment's sound (decoded once) and returns it, or
// nil when it can't be decoded.
func Title() Playing {
	once.Do(decode)
	if title == nil {
		return nil
	}
	p := title.Play()
	if err := audio.Err(); err != nil {
		log.Printf("ducter: no audio output, the title plays silent: %v", err)
	}
	return player{p}
}

func decode() {
	s, err := audio.DecodeSound(theme.TitleSound)
	if err != nil {
		log.Printf("ducter: title sound: %v", err)
		return
	}
	title = s
}

// Stop fades the sound out in small steps (each volume change ramps over
// 5 ms in the mixer, so none clicks), then stops it.
func (p player) Stop(fade time.Duration) {
	if fade <= 0 {
		p.p.Stop()
		return
	}
	go func() {
		const steps = 24
		for i := steps - 1; i >= 0; i-- {
			p.p.SetVolume(float64(i) / steps)
			time.Sleep(fade / steps)
		}
		p.p.Stop()
	}()
}
