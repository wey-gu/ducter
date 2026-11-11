package media

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
	"sync/atomic"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// HTTPBase is the home's http(s) base for its WebSocket address:
// ws://127.0.0.1:7777/ws → http://127.0.0.1:7777/.
func HTTPBase(ws string) string {
	u, err := url.Parse(ws)
	if err != nil {
		return ""
	}
	switch u.Scheme {
	case "wss":
		u.Scheme = "https"
	default:
		u.Scheme = "http"
	}
	u.Path = strings.TrimSuffix(u.Path, "ws")
	if !strings.HasSuffix(u.Path, "/") {
		u.Path += "/"
	}
	u.RawQuery, u.Fragment = "", ""
	return u.String()
}

// Home is where pictures go and come from: the home's http base and this
// device's token ("" on this Mac's own home).
type Home struct {
	Base  string
	Token string
	HTTP  *http.Client
}

func (h Home) client() *http.Client {
	if h.HTTP != nil {
		return h.HTTP
	}
	return &http.Client{Timeout: 2 * time.Minute}
}

// URL is a ref's path on this home.
func (h Home) URL(path string) string {
	return strings.TrimSuffix(h.Base, "/") + "/" + strings.TrimPrefix(path, "/")
}

// Upload sends a prepared picture to POST /api/media; progress gets the
// fraction sent (0..1) as it goes.
func (h Home) Upload(ctx context.Context, p *Prepared, name string, progress func(float64)) (protocol.MediaRef, error) {
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	ext := ".jpg"
	if bytes.HasPrefix(p.Full, []byte("GIF")) {
		ext = ".gif"
	}
	fw, err := mw.CreateFormFile("file", strings.TrimSuffix(name, ext)+ext)
	if err != nil {
		return protocol.MediaRef{}, err
	}
	fw.Write(p.Full)
	if len(p.Thumb) > 0 {
		tw, _ := mw.CreateFormFile("thumb", "thumb.jpg")
		tw.Write(p.Thumb)
	}
	if p.Preview != "" {
		mw.WriteField("preview", p.Preview)
	}
	if name != "" {
		mw.WriteField("name", name)
	}
	mw.Close()
	total := int64(body.Len())
	var sent atomic.Int64
	r := &countReader{r: &body, n: &sent, total: total, progress: progress}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.URL("api/media"), r)
	if err != nil {
		return protocol.MediaRef{}, err
	}
	req.ContentLength = total
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if h.Token != "" {
		req.Header.Set("Authorization", "Bearer "+h.Token)
	}
	res, err := h.client().Do(req)
	if err != nil {
		return protocol.MediaRef{}, err
	}
	defer res.Body.Close()
	switch res.StatusCode {
	case http.StatusOK:
	case http.StatusRequestEntityTooLarge:
		return protocol.MediaRef{}, ErrTooBig
	case http.StatusUnsupportedMediaType:
		return protocol.MediaRef{}, ErrNotImage
	default:
		return protocol.MediaRef{}, fmt.Errorf("media: upload: %s", res.Status)
	}
	var out struct {
		Media protocol.MediaRef `json:"media"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil || out.Media.ID == "" {
		return protocol.MediaRef{}, fmt.Errorf("media: upload: bad answer")
	}
	if progress != nil {
		progress(1)
	}
	return out.Media, nil
}

// Fetch gets a ref's bytes (GET media/<id>?k=, no header needed).
func (h Home) Fetch(ctx context.Context, path string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, h.URL(path), nil)
	if err != nil {
		return nil, err
	}
	res, err := h.client().Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("media: %s", res.Status)
	}
	return io.ReadAll(io.LimitReader(res.Body, protocol.MediaBytesMax+1))
}

type countReader struct {
	r        io.Reader
	n        *atomic.Int64
	total    int64
	progress func(float64)
}

func (c *countReader) Read(b []byte) (int, error) {
	k, err := c.r.Read(b)
	if k > 0 && c.progress != nil && c.total > 0 {
		// The last bytes wait for the answer: 1 is said when it lands.
		c.progress(min(0.98, float64(c.n.Add(int64(k)))/float64(c.total)))
	}
	return k, err
}
