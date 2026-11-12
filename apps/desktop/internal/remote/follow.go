package remote

// D228: the app follows a home whose address changes (在哪儿都能用's free
// Cloudflare tunnel gets a new address when the home's computer restarts).
// The home seals its address with a key it gave its paired devices and
// leaves the note at the address relay; this opens it the way
// packages/protocol/src/follow.ts seals it (AES-256-GCM, nonce ‖ ciphertext
// ‖ tag, base64url, the id bound in as "ducter-addr-v1:<id>").

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Follow is the relay, the note's id and the key that opens it.
type Follow struct {
	Relay string `json:"relay"`
	ID    string `json:"id"`
	Key   string `json:"key"`
}

// Note is where the home is now, and since when (ms).
type Note struct {
	URL string `json:"url"`
	At  int64  `json:"at"`
}

var b64 = base64.RawURLEncoding

// OpenNote opens a sealed note; false if it doesn't open under this key and
// id, or isn't an https address (or this computer's).
func OpenNote(key, id, sealed string) (Note, bool) {
	k, err := b64.DecodeString(key)
	raw, err2 := b64.DecodeString(strings.TrimRight(sealed, "="))
	if err != nil || err2 != nil || len(k) != 32 || len(raw) < 12+16 {
		return Note{}, false
	}
	block, err := aes.NewCipher(k)
	if err != nil {
		return Note{}, false
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return Note{}, false
	}
	pt, err := gcm.Open(nil, raw[:12], raw[12:], []byte("ducter-addr-v1:"+id))
	if err != nil {
		return Note{}, false
	}
	var n Note
	if json.Unmarshal(pt, &n) != nil || n.URL == "" {
		return Note{}, false
	}
	u, err := url.Parse(n.URL)
	if err != nil || (u.Scheme != "https" && u.Hostname() != "127.0.0.1" && u.Hostname() != "localhost") {
		return Note{}, false
	}
	n.URL = strings.TrimRight(n.URL, "/")
	return n, true
}

var followHTTP = &http.Client{Timeout: 10 * time.Second}

// Lookup asks the relay where the home is now.
func Lookup(ctx context.Context, f Follow) (Note, bool) {
	req, err := http.NewRequestWithContext(ctx, "GET", strings.TrimRight(f.Relay, "/")+"/get?id="+url.QueryEscape(f.ID), nil)
	if err != nil {
		return Note{}, false
	}
	res, err := followHTTP.Do(req)
	if err != nil {
		return Note{}, false
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return Note{}, false
	}
	var b struct {
		D string `json:"d"`
	}
	if json.NewDecoder(io.LimitReader(res.Body, 8192)).Decode(&b) != nil {
		return Note{}, false
	}
	return OpenNote(f.Key, f.ID, b.D)
}

// Answers: a Ducter answers at this base (its tunnel's self-check).
func Answers(ctx context.Context, base string) bool {
	req, err := http.NewRequestWithContext(ctx, "GET", strings.TrimRight(base, "/")+"/.well-known/ducter-anywhere", nil)
	if err != nil {
		return false
	}
	res, err := followHTTP.Do(req)
	if err != nil {
		return false
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 256))
	return res.StatusCode == 200 && strings.TrimSpace(string(b)) != ""
}

// MoveTo is where s should go now: the relay's note, when it is newer than
// what s knows, somewhere else, and a Ducter answers there. ok false: stay.
func MoveTo(ctx context.Context, s Saved) (Saved, bool) {
	if s.Follow == nil {
		return s, false
	}
	n, ok := Lookup(ctx, *s.Follow)
	if !ok || n.At <= s.FollowAt || strings.EqualFold(n.URL, strings.TrimRight(BaseOf(s.URL), "/")) || !Answers(ctx, n.URL) {
		return s, false
	}
	s.URL, s.FollowAt = WSURL(n.URL), n.At
	return s, true
}

// FetchFollow asks the home (over its API, with this device's token) how
// to follow it; nil when its address doesn't move.
func FetchFollow(ctx context.Context, s Saved) (*Follow, error) {
	base := BaseOf(s.URL)
	if base == "" || s.Token == "" {
		return nil, errors.New("no remote home")
	}
	req, err := http.NewRequestWithContext(ctx, "GET", base+"/api/me", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+s.Token)
	res, err := followHTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return nil, errors.New(res.Status)
	}
	var me struct {
		Follow *Follow `json:"follow"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<16)).Decode(&me); err != nil {
		return nil, err
	}
	return me.Follow, nil
}
