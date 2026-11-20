package protocol

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"sync"
	"time"
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
	// Pages (D439): the same document as pages, the PDF of this Office
	// file the task showed with it: the card's glimpse and the viewer draw
	// these; Save keeps the file itself.
	Pages *MediaPages `json:"pages,omitempty"`
}

// MediaPages (D439) is an Office file's PDF: its id, key and size, and its
// page count when Ducter read it.
type MediaPages struct {
	ID    string `json:"id"`
	K     string `json:"k"`
	Bytes int64  `json:"bytes"`
	N     int    `json:"n,omitempty"`
}

// PagesRef (D439) is the ref of an Office file's pages (its PDF), named as
// the file with .pdf; ok is false for a file with none.
func (m MediaRef) PagesRef() (MediaRef, bool) {
	if m.Pages == nil {
		return MediaRef{}, false
	}
	name := m.Name
	if i := strings.LastIndexByte(name, '.'); i > 0 {
		name = name[:i]
	}
	if name == "" {
		name = "document"
	}
	return MediaRef{ID: m.Pages.ID, Type: "application/pdf", Bytes: m.Pages.Bytes, Name: name + ".pdf", K: m.Pages.K, From: m.From}, true
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
	// MediaFileMax is one file a person sends that isn't a picture (D259).
	MediaFileMax    = 50 * 1024 * 1024
	MediaPreviewMax = 4096
	MediaLongEdge   = 2048
	MediaThumbEdge  = 720
)

// AnyFile is what a file a person sent is kept as when it is no kind Ducter
// knows: inert bytes, never opened, never run (D259; ANY_FILE in media.ts).
const AnyFile = "application/octet-stream"

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

// D242: media keys expire (MEDIA_KEY in media.ts). The home signs every
// ref afresh as it sends it; an app left open past its keys asks for new
// ones (MediaKeysReq) and keeps them here, newest first for each id.
var freshKeys sync.Map // id → k

// MediaKeysReq asks the home for fresh keys (answered with media_keys).
type MediaKeysReq struct {
	T   string   `json:"t"` // "media_keys"
	IDs []string `json:"ids"`
}

// SetFreshKeys keeps the keys a media_keys frame brought.
func SetFreshKeys(keys map[string]string) {
	for id, k := range keys {
		freshKeys.Store(id, k)
	}
}

// KeyFor is the newest key this app has for id (k, from its ref, when none came since).
func KeyFor(id, k string) string {
	if v, ok := freshKeys.Load(id); ok {
		return v.(string)
	}
	return k
}

// KeyExpires is when a key stops opening; false for a pre-D242 key.
func KeyExpires(k string) (time.Time, bool) {
	i := strings.IndexByte(k, '.')
	if i <= 0 {
		return time.Time{}, false
	}
	s, err := strconv.ParseInt(k[:i], 36, 64)
	if err != nil {
		return time.Time{}, false
	}
	return time.Unix(s, 0), true
}

// KeyStale says a key is past its time, or will be within a minute.
func KeyStale(k string, now time.Time) bool {
	end, ok := KeyExpires(k)
	return ok && !end.After(now.Add(time.Minute))
}

// MediaPath is the path a ref is served at, relative to the home's origin,
// with the newest key this app has for it.
func MediaPath(id, k string) string { return "media/" + id + "?k=" + KeyFor(id, k) }

// MediaID is the id in a media path ("media/<id>?k=…").
func MediaID(path string) string {
	path = strings.TrimPrefix(path, "media/")
	if i := strings.IndexByte(path, '?'); i >= 0 {
		return path[:i]
	}
	return path
}

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

// GridRows is the rows of 5 to 9 pictures (D286, GRID_ROWS in media.ts):
// how many sit side by side in each row, top to bottom.
var GridRows = map[int][]int{5: {2, 3}, 6: {3, 3}, 7: {1, 3, 3}, 8: {2, 3, 3}, 9: {3, 3, 3}}

// GridMax is the most tiles a message shows; more shows "+n" on the last.
const GridMax = 9

// Grid lays out n pictures (gridLayout in media.ts, the same rules): one
// at its own aspect ratio (clamped to 21:9…1:3); two side by side; three
// as one tall and two stacked; four as 2×2; five to nine in rows
// (GridRows: a row of one is a 2:1 banner, else squares); more than nine
// shows nine with "+n" on the last (D286).
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
	case n == 4:
		tiles := make([]Tile, 4)
		for i := range tiles {
			tiles[i] = Tile{I: i, X: float64(i%2) / 2, Y: float64(i/2) / 2, W: 0.5, H: 0.5}
		}
		return GridLayout{Tiles: tiles, Aspect: 1}
	}
	var tiles []Tile
	y := 0.0
	for _, k := range GridRows[min(n, GridMax)] {
		h := 1 / float64(k)
		if k == 1 {
			h = 0.5
		}
		for j := range k {
			tiles = append(tiles, Tile{I: len(tiles), X: float64(j) / float64(k), Y: y, W: 1 / float64(k), H: h})
		}
		y += h
	}
	if n > GridMax {
		tiles[len(tiles)-1].More = n - GridMax
	}
	return GridLayout{Tiles: tiles, Aspect: y}
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
