package remote

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// The same vector the home makes (packages/protocol reach-verify.ts, seed
// 32 × 0x07): a proof made in TypeScript checks here.
func TestProofFromTheHome(t *testing.T) {
	key := "6kpsY-KcUgq-9VB7Ey7F-ZVHdq6-vnuSQh7qaRRG0iw"
	fp := "_oEsEvOrTOasXbaaw1L5Bg"
	sig := "Q5yHDneRHmdLJAI-d8DwzJPTQQ3hv4Q5BDNQ93yqDSzHqM-UIRZ-RrSM_m1wvTSQYXSQfv_xpGli1R9ClF-0Bw"
	raw, _ := base64.RawURLEncoding.DecodeString(key)
	if Fingerprint(raw) != fp {
		t.Fatalf("fingerprint %s", Fingerprint(raw))
	}
	if !CheckProof(key, sig, "abcdefghijklmnopqrstuv", fp) {
		t.Fatal("the home's proof should check")
	}
	if CheckProof(key, sig, "another-nonce-1234567", fp) || CheckProof(key, sig, "abcdefghijklmnopqrstuv", "AAAAAAAAAAAAAAAAAAAAAA") {
		t.Fatal("another nonce or another pinned key must fail")
	}
}

// A fake home at a test server: it signs with its key, or with an
// impostor's.
func provingHome(t *testing.T, priv ed25519.PrivateKey) *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != ChallengePath {
			http.NotFound(w, r)
			return
		}
		n := r.URL.Query().Get("n")
		pub := priv.Public().(ed25519.PublicKey)
		_ = json.NewEncoder(w).Encode(map[string]any{"v": 1, "key": base64.RawURLEncoding.EncodeToString(pub), "fp": Fingerprint(pub), "sig": base64.RawURLEncoding.EncodeToString(ed25519.Sign(priv, []byte("ducter-home\n"+n)))})
	}))
}

func TestProverRaceAndImpostor(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(nil)
	_, other, _ := ed25519.GenerateKey(nil)
	home, impostor := provingHome(t, priv), provingHome(t, other)
	defer home.Close()
	defer impostor.Close()
	probe := Prover(Fingerprint(pub), nil)
	// The impostor is at the better-ranked way (tailnet): it fails the proof, so the domain wins.
	ways := []protocol.ReachWay{{Kind: "domain", URL: home.URL, Primary: true}, {Kind: "tailnet", URL: impostor.URL}}
	if got := Race(context.Background(), ways, probe); got != home.URL {
		t.Fatalf("race chose %q", got)
	}
	if got := Race(context.Background(), []protocol.ReachWay{{Kind: "tailnet", URL: impostor.URL}}, probe); got != "" {
		t.Fatalf("an impostor alone should never be chosen, got %q", got)
	}
}

func TestKeeperNeedsTwo(t *testing.T) {
	var mu sync.Mutex
	up := map[string]bool{"https://d": true, "https://t": false}
	k := &Keeper{Probe: func(_ context.Context, u string) bool { mu.Lock(); defer mu.Unlock(); return up[u] }}
	ways := []protocol.ReachWay{{Kind: "domain", URL: "https://d"}, {Kind: "tailnet", URL: "https://t"}}
	ctx := context.Background()
	if k.Tick(ctx, ways, "https://d") != "" {
		t.Fatal("nothing better answers yet")
	}
	mu.Lock()
	up["https://t"] = true
	mu.Unlock()
	if k.Tick(ctx, ways, "https://d") != "" {
		t.Fatal("one answer is not enough to move up")
	}
	if got := k.Tick(ctx, ways, "https://d"); got != "https://t" {
		t.Fatalf("two answers move up, got %q", got)
	}
	mu.Lock()
	up["https://t"] = false
	mu.Unlock()
	if k.Tick(ctx, ways, "https://t") != "" {
		t.Fatal("one miss never moves it")
	}
	if got := k.Tick(ctx, ways, "https://t"); got != "https://d" {
		t.Fatalf("two misses move it to the way that answers, got %q", got)
	}
}
