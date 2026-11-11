package media

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

func pic(w, h int) image.Image {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{uint8(x * 255 / w), uint8(y * 255 / h), 120, 255})
		}
	}
	return img
}

func pngOf(t *testing.T, img image.Image) []byte {
	var b bytes.Buffer
	if err := png.Encode(&b, img); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

// A phone-sized screenshot is scaled to 2048 on its long edge, with a 720
// tile and a tiny preview; small ones keep their size and get no tile.
func TestPrepareScales(t *testing.T) {
	p, err := Prepare(pngOf(t, pic(1290, 2796)))
	if err != nil {
		t.Fatal(err)
	}
	if p.H != 2048 || p.W != 1290*2048/2796 {
		t.Errorf("full is %d×%d, want the long edge 2048", p.W, p.H)
	}
	if _, err := jpeg.Decode(bytes.NewReader(p.Full)); err != nil {
		t.Errorf("full is not a JPEG: %v", err)
	}
	th, err := jpeg.Decode(bytes.NewReader(p.Thumb))
	if err != nil || max(th.Bounds().Dx(), th.Bounds().Dy()) != 720 {
		t.Errorf("thumb: %v %v", err, th)
	}
	if !strings.HasPrefix(p.Preview, "data:image/jpeg;base64,") || len(p.Preview) > protocol.MediaPreviewMax {
		t.Errorf("preview: %d bytes %q", len(p.Preview), p.Preview[:min(40, len(p.Preview))])
	}
	small, _ := Prepare(pngOf(t, pic(400, 300)))
	if small.W != 400 || small.H != 300 || small.Thumb != nil {
		t.Errorf("small: %d×%d thumb %d", small.W, small.H, len(small.Thumb))
	}
	if _, err := Prepare([]byte("%PDF-1.7")); err != ErrNotImage {
		t.Errorf("a PDF: %v", err)
	}
}

// An EXIF orientation 6 (a phone held upright) is stood up, and the JPEG
// sent carries no EXIF at all.
func TestPrepareOrientsAndStripsExif(t *testing.T) {
	var b bytes.Buffer
	jpeg.Encode(&b, pic(300, 200), nil)
	raw := b.Bytes()
	// APP1 Exif, big-endian TIFF, one IFD entry: Orientation = 6.
	tiff := []byte{'M', 'M', 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0}
	app1 := append([]byte("Exif\x00\x00"), tiff...)
	seg := append([]byte{0xff, 0xe1, byte((len(app1) + 2) >> 8), byte(len(app1) + 2)}, app1...)
	withExif := append(append([]byte{0xff, 0xd8}, seg...), raw[2:]...)
	if o := Orientation(withExif); o != 6 {
		t.Fatalf("orientation %d, want 6", o)
	}
	p, err := Prepare(withExif)
	if err != nil {
		t.Fatal(err)
	}
	if p.W != 200 || p.H != 300 {
		t.Errorf("not stood up: %d×%d", p.W, p.H)
	}
	if bytes.Contains(p.Full, []byte("Exif")) {
		t.Errorf("the JPEG sent still carries EXIF")
	}
}

// The upload is a multipart POST to api/media with the file, its tile, its
// preview and the device token; 413 and 415 are their own errors.
func TestUploadShape(t *testing.T) {
	var got struct {
		path, auth, name, preview string
		file, thumb               int
	}
	status := http.StatusOK
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got.path, got.auth = r.URL.Path, r.Header.Get("Authorization")
		if r.Header.Get("Origin") != "" {
			t.Errorf("an Origin header was sent")
		}
		if err := r.ParseMultipartForm(32 << 20); err != nil {
			t.Fatal(err)
		}
		f, _, _ := r.FormFile("file")
		b, _ := io.ReadAll(f)
		got.file = len(b)
		if th, _, err := r.FormFile("thumb"); err == nil {
			b, _ := io.ReadAll(th)
			got.thumb = len(b)
		}
		got.name, got.preview = r.FormValue("name"), r.FormValue("preview")
		if status != http.StatusOK {
			w.WriteHeader(status)
			return
		}
		json.NewEncoder(w).Encode(map[string]any{"media": protocol.MediaRef{ID: strings.Repeat("a", 64), Type: "image/jpeg", Bytes: int64(got.file), W: 10, H: 20, K: "key"}})
	}))
	defer srv.Close()
	p, _ := Prepare(pngOf(t, pic(1600, 1000)))
	h := Home{Base: HTTPBase(strings.Replace(srv.URL, "http", "ws", 1) + "/ws"), Token: "dvc.x"}
	var last float64
	ref, err := h.Upload(context.Background(), p, "Screenshot.png", func(f float64) { last = f })
	if err != nil {
		t.Fatal(err)
	}
	if got.path != "/api/media" || got.auth != "Bearer dvc.x" || got.file != len(p.Full) || got.thumb != len(p.Thumb) || got.name != "Screenshot.png" || got.preview != p.Preview {
		t.Errorf("request: %+v", got)
	}
	if ref.K != "key" || last != 1 {
		t.Errorf("ref %+v progress %v", ref, last)
	}
	status = http.StatusRequestEntityTooLarge
	if _, err := h.Upload(context.Background(), p, "", nil); err != ErrTooBig {
		t.Errorf("413: %v", err)
	}
	status = http.StatusUnsupportedMediaType
	if _, err := h.Upload(context.Background(), p, "", nil); err != ErrNotImage {
		t.Errorf("415: %v", err)
	}
}

func TestHTTPBase(t *testing.T) {
	for in, want := range map[string]string{
		"ws://127.0.0.1:7777/ws":          "http://127.0.0.1:7777/",
		"wss://ducter.example.com/ws":     "https://ducter.example.com/",
		"wss://example.com/ducter/ws?x=1": "https://example.com/ducter/",
	} {
		if got := HTTPBase(in); got != want {
			t.Errorf("%s → %s, want %s", in, got, want)
		}
	}
	if u := (Home{Base: "http://h:1/"}).URL(protocol.MediaPath("abc", "k")); u != "http://h:1/media/abc?k=k" {
		t.Errorf("url %s", u)
	}
}
