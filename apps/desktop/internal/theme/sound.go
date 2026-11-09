package theme

import (
	_ "embed"

	"github.com/egoist/mygo/ui"
)

// TitleSound is the title moment's sound (D87): a warm chord that opens and
// one clear tone as Ducter opens its eyes, 9.6 s, Ogg Vorbis, peak -14
// dBFS. Synthesized by tools/sound/title.py; re-render with
// tools/sound/build.sh, never edit by hand.
//
//go:embed sound/title.ogg
var TitleSound []byte

// Hero is the idle character cut to its outline at 512 px wide, for the
// title moment's large Ducter (FaceLids map onto it as onto Face(Idle)).
func Hero() *ui.Bitmap { return load("art/crop/ducter_idle@512.png") }
