package theme

import "github.com/egoist/mygo/ui"

// Tint is one clay tint of a task's picture (D285): the pebble's ground,
// the glyph's ink on it, and the clay ledge under it. The tints are the
// person's own grouping and never a state's colour, so each is muted and
// earthy, greyer than the state surfaces (NeedsYou, Working, Waiting, Done).
type Tint struct {
	Ground, Ink, Ledge ui.Color
}

// Tints are the six, by name: clay sand sage mist lilac stone.
type Tints map[string]Tint

// Tint is the named tint, ok false for none (Ducter's guess: muted ink on
// the sunken ground).
func (t *Tokens) Tint(name string) (Tint, bool) {
	v, ok := t.Tints[name]
	return v, ok
}

// pebbleTints are Pebble's (light).
func pebbleTints() Tints {
	return Tints{
		"clay":  {Ground: hex("#EFD2C4"), Ink: hex("#83442D"), Ledge: hex("#DDB6A3")},
		"sand":  {Ground: hex("#ECE0C6"), Ink: hex("#6E5826"), Ledge: hex("#D8C8A4")},
		"sage":  {Ground: hex("#DAE3D0"), Ink: hex("#3E5734"), Ledge: hex("#BFCDB1")},
		"mist":  {Ground: hex("#D9E2E7"), Ink: hex("#344E5C"), Ledge: hex("#BCCAD3")},
		"lilac": {Ground: hex("#E4DBE9"), Ink: hex("#56406A"), Ledge: hex("#CDBFD8")},
		"stone": {Ground: hex("#E3DED7"), Ink: hex("#4E463D"), Ledge: hex("#CAC2B7")},
	}
}

// MidnightTints are the same six for the dark theme (design/ui.md:
// Midnight is planned; the web's dark tokens use these).
func MidnightTints() Tints {
	return Tints{
		"clay":  {Ground: hex("#5A3B30"), Ink: hex("#F0CBB9"), Ledge: hex("#3E281F")},
		"sand":  {Ground: hex("#544A31"), Ink: hex("#EADDB7"), Ledge: hex("#3A3220")},
		"sage":  {Ground: hex("#3A4A36"), Ink: hex("#CFE0C5"), Ledge: hex("#283325")},
		"mist":  {Ground: hex("#35444D"), Ink: hex("#CCDCE6"), Ledge: hex("#242F36")},
		"lilac": {Ground: hex("#473B51"), Ink: hex("#DDCEE9"), Ledge: hex("#312838")},
		"stone": {Ground: hex("#47423C"), Ink: hex("#DED7CD"), Ledge: hex("#312D29")},
	}
}
