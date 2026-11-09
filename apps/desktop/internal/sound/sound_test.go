package sound

import (
	"testing"
	"time"

	"github.com/egoist/mygo/audio"

	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// The shipped title sound decodes and is as long as the moment needs.
func TestTitleSoundDecodes(t *testing.T) {
	s, err := audio.DecodeSound(theme.TitleSound)
	if err != nil {
		t.Fatal(err)
	}
	if d := s.Duration(); d < 8*time.Second || d > 10*time.Second {
		t.Fatalf("title sound is %v, want 8–10 s", d)
	}
}
