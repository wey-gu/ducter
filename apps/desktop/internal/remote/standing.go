package remote

// D520: whether the home still knows this Mac's credential. Asked only when
// the socket was refused: a refused upgrade alone proves nothing (Caddy or
// Cloudflare answer 502 while the home restarts), so the app leaves its
// pairing only on this answer, signed by the key pinned at pairing over a
// nonce of its own (packages/protocol reach.ts STANDING_PATH, standingText).

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// StandingPath is where a home says whether a device's credential stands.
const StandingPath = "/.well-known/ducter-device"

// Standing is the home's signed word on a credential.
type Standing string

const (
	// StandingUnsure: no signed answer (the home is down, a proxy answered,
	// another key signed, nothing pinned): the pairing stays.
	StandingUnsure Standing = ""
	StandingLive   Standing = "live"
	// StandingRevoked: the home disconnected this device (`ducter devices`).
	StandingRevoked Standing = "revoked"
	// StandingUnknown: the home has no such credential (its devices were
	// reset, or this is another home's).
	StandingUnknown Standing = "unknown"
)

// Gone says the home itself said this device is no longer connected.
func (s Standing) Gone() bool { return s == StandingRevoked || s == StandingUnknown }

// CheckStandingProof is the standing a proof says when the pinned home
// signed it over nonce; StandingUnsure otherwise.
func CheckStandingProof(standing, device, key, sig, nonce, pinned string) Standing {
	st := Standing(standing)
	if st != StandingLive && st != StandingRevoked && st != StandingUnknown {
		return StandingUnsure
	}
	raw, err := base64.RawURLEncoding.DecodeString(key)
	if err != nil || len(raw) != ed25519.PublicKeySize || pinned == "" || Fingerprint(raw) != pinned {
		return StandingUnsure
	}
	s, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil || !ed25519.Verify(ed25519.PublicKey(raw), []byte("ducter-device\n"+standing+"\n"+device+"\n"+nonce), s) {
		return StandingUnsure
	}
	return st
}

// AskStanding asks the home at wsURL whether token still stands there, and
// believes only an answer signed with the pinned key.
func AskStanding(ctx context.Context, hc *http.Client, wsURL, token, pinned string) Standing {
	if token == "" || pinned == "" {
		return StandingUnsure
	}
	if hc == nil {
		hc = &http.Client{Timeout: 6 * time.Second}
	}
	b := make([]byte, 18)
	_, _ = rand.Read(b)
	nonce := base64.RawURLEncoding.EncodeToString(b)
	req, err := http.NewRequestWithContext(ctx, "GET", strings.TrimSuffix(BaseOf(wsURL), "/")+StandingPath+"?n="+nonce, nil)
	if err != nil {
		return StandingUnsure
	}
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := hc.Do(req)
	if err != nil {
		return StandingUnsure
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return StandingUnsure
	}
	var p struct {
		Standing string `json:"standing"`
		Device   string `json:"device"`
		Key      string `json:"key"`
		Sig      string `json:"sig"`
	}
	if json.NewDecoder(http.MaxBytesReader(nil, res.Body, 8<<10)).Decode(&p) != nil {
		return StandingUnsure
	}
	return CheckStandingProof(p.Standing, p.Device, p.Key, p.Sig, nonce, pinned)
}
