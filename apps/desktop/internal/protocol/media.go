package protocol

import (
	"fmt"
	"math"
)

// D206: pictures and files (packages/protocol/src/media.ts). Media is
// content-addressed on the home and fetched by its key, with no header:
// GET <home>/media/<id>?k=<k>.

// MediaRef is one picture or file as a message, a report or a task line carries it.
type MediaRef struct {
	ID      string     `json:"id"`
	Type    string     `json:"type"`
	Bytes   int64      `json:"bytes"`
	W       int        `json:"w,omitempty"`
	H       int        `json:"h,omitempty"`
	Name    string     `json:"name,omitempty"`
	K       string     `json:"k"`
	Thumb   *MediaKey  `json:"thumb,omitempty"`
	Preview string     `json:"preview,omitempty"`
	From    *MediaFrom `json:"from,omitempty"`
}

// MediaKey names a rendition: its id and key.
type MediaKey struct {
	ID string `json:"id"`
	K  string `json:"k"`
}

// MediaFrom is the task that made it.
type MediaFrom struct {
	TaskID string `json:"taskId"`
}

// Media limits (MEDIA_LIMITS in media.ts).
const (
	MediaPerMessage = 10
	MediaBytesMax   = 25 * 1024 * 1024
	MediaPreviewMax = 4096
	MediaLongEdge   = 2048
	MediaThumbEdge  = 720
)

// IsImage says whether the ref is a picture every client shows.
func (m MediaRef) IsImage() bool { return IsImageType(m.Type) }

// IsImageType: jpeg, png, gif, webp.
func IsImageType(t string) bool {
	switch t {
	case "image/jpeg", "image/png", "image/gif", "image/webp":
		return true
	}
	return false
}

// MediaPath is the path a ref is served at, relative to the home's origin.
func MediaPath(id, k string) string { return "media/" + id + "?k=" + k }

// Path is the picture's own path.
func (m MediaRef) Path() string { return MediaPath(m.ID, m.K) }

// ThumbPath is the tile rendition when there is one, else the picture.
func (m MediaRef) ThumbPath() string {
	if m.Thumb != nil {
		return MediaPath(m.Thumb.ID, m.Thumb.K)
	}
	return m.Path()
}

// Tile is one tile of a message's pictures, in a 0..1 box over the grid's
// width (y in widths too).
type Tile struct {
	I          int
	X, Y, W, H float64
	More       int // "+n" on the last tile
}

// GridLayout is the tiles of n pictures.
type GridLayout struct {
	Tiles  []Tile
	Aspect float64 // height over width
	Single bool
}

// A single picture's aspect bounds (h/w).
const (
	SingleMaxAspect = 3.0
	SingleMinAspect = 9.0 / 21.0
)

// Size is a picture's pixel size (0 when unknown).
type Size struct{ W, H int }

// Grid lays out n pictures (gridLayout in media.ts, the same rules): one
// at its own aspect ratio (clamped to 21:9…1:3); two side by side; three
// as one tall and two stacked; four as 2×2; more than four shows the first
// four with "+n" on the last.
func Grid(sizes []Size) GridLayout {
	n := len(sizes)
	switch {
	case n == 0:
		return GridLayout{}
	case n == 1:
		a := 3.0 / 4.0
		if s := sizes[0]; s.W > 0 && s.H > 0 {
			a = float64(s.H) / float64(s.W)
		}
		a = math.Min(SingleMaxAspect, math.Max(SingleMinAspect, a))
		return GridLayout{Tiles: []Tile{{I: 0, W: 1, H: a}}, Aspect: a, Single: true}
	case n == 2:
		return GridLayout{Tiles: []Tile{{I: 0, W: 0.5, H: 0.5}, {I: 1, X: 0.5, W: 0.5, H: 0.5}}, Aspect: 0.5}
	case n == 3:
		a := 2.0 / 3.0
		return GridLayout{Tiles: []Tile{
			{I: 0, W: 2.0 / 3.0, H: a},
			{I: 1, X: 2.0 / 3.0, W: 1.0 / 3.0, H: a / 2},
			{I: 2, X: 2.0 / 3.0, Y: a / 2, W: 1.0 / 3.0, H: a / 2},
		}, Aspect: a}
	}
	tiles := make([]Tile, 4)
	for i := range tiles {
		tiles[i] = Tile{I: i, X: float64(i%2) / 2, Y: float64(i/2) / 2, W: 0.5, H: 0.5}
	}
	if n > 4 {
		tiles[3].More = n - 4
	}
	return GridLayout{Tiles: tiles, Aspect: 1}
}

// SizeWords is a file's size as a person reads it: 820 KB, 3.4 MB.
func SizeWords(bytes int64) string {
	switch {
	case bytes < 1024:
		return fmt.Sprintf("%d B", bytes)
	case bytes < 1024*1024:
		return fmt.Sprintf("%d KB", max(1, int64(math.Round(float64(bytes)/1024))))
	case bytes < 10*1024*1024:
		return fmt.Sprintf("%.1f MB", float64(bytes)/(1024*1024))
	}
	return fmt.Sprintf("%.0f MB", float64(bytes)/(1024*1024))
}
