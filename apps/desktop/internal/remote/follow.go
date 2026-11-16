package remote

// D293: the Mac app follows its home to the best way that proves it is the
// home. Each way is asked to sign a fresh nonce (GET <base>/.well-known/ducter-home?n=…);
// the answer counts only when the key's fingerprint is the one pinned at
// pairing. The same rules as packages/protocol/src/reach.ts (race,
// createKeeper): nearest first (same network, tailnet, domain, tunnel),
// staggered by 250 ms, a better one still pending gets 300 ms more; while
// connected, leave a way only after two misses in a row and move up only
// after a better way answered twice in a row.

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// ChallengePath is where a home proves it is itself.
const ChallengePath = "/.well-known/ducter-home"

var rank = map[string]int{"lan": 0, "tailnet": 1, "domain": 2, "tunnel": 3}

// Fingerprint is a raw Ed25519 public key's fingerprint: SHA-256, the first
// 16 bytes, base64url without padding (packages/protocol reach-verify.ts).
func Fingerprint(raw []byte) string {
	h := sha256.Sum256(raw)
	return base64.RawURLEncoding.EncodeToString(h[:16])
}

// CheckProof says whether a challenge's answer is the pinned home's
// signature of nonce.
func CheckProof(key, sig, nonce, pinned string) bool {
	raw, err := base64.RawURLEncoding.DecodeString(key)
	if err != nil || len(raw) != ed25519.PublicKeySize || Fingerprint(raw) != pinned {
		return false
	}
	s, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil {
		return false
	}
	return ed25519.Verify(ed25519.PublicKey(raw), []byte("ducter-home\n"+nonce), s)
}

// Prover asks a base to prove it is the home with this fingerprint.
func Prover(pinned string, hc *http.Client) func(ctx context.Context, base string) bool {
	if hc == nil {
		hc = &http.Client{Timeout: 4 * time.Second}
	}
	return func(ctx context.Context, base string) bool {
		b := make([]byte, 18)
		_, _ = rand.Read(b)
		nonce := base64.RawURLEncoding.EncodeToString(b)
		req, err := http.NewRequestWithContext(ctx, "GET", strings.TrimSuffix(base, "/")+ChallengePath+"?n="+nonce, nil)
		if err != nil {
			return false
		}
		res, err := hc.Do(req)
		if err != nil {
			return false
		}
		defer res.Body.Close()
		if res.StatusCode != http.StatusOK {
			return false
		}
		var p struct {
			Key string `json:"key"`
			Sig string `json:"sig"`
		}
		if json.NewDecoder(res.Body).Decode(&p) != nil {
			return false
		}
		return CheckProof(p.Key, p.Sig, nonce, pinned)
	}
}

// Ranked is the ways best first: the rank, then the primary, then the order.
func Ranked(ways []protocol.ReachWay) []protocol.ReachWay {
	out := append([]protocol.ReachWay(nil), ways...)
	sort.SliceStable(out, func(i, j int) bool {
		if rank[out[i].Kind] != rank[out[j].Kind] {
			return rank[out[i].Kind] < rank[out[j].Kind]
		}
		return out[i].Primary && !out[j].Primary
	})
	return out
}

// Race tries every way, best first, each 250 ms after the one before, and
// returns the best that proves it is the home ("" when none does).
func Race(ctx context.Context, ways []protocol.ReachWay, probe func(context.Context, string) bool) string {
	list := Ranked(ways)
	if len(list) == 0 {
		return ""
	}
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	type res struct {
		i  int
		ok bool
	}
	ch := make(chan res, len(list))
	for i, w := range list {
		go func(i int, url string) {
			select {
			case <-time.After(time.Duration(i) * 250 * time.Millisecond):
			case <-ctx.Done():
				ch <- res{i, false}
				return
			}
			ch <- res{i, probe(ctx, url)}
		}(i, w.URL)
	}
	got := make([]*bool, len(list))
	var grace <-chan time.Time
	graceOver, n := false, 0
	for {
		// The best answer so far, unless a better way is still pending
		// within the grace.
	scan:
		for i := range list {
			switch {
			case got[i] != nil && *got[i]:
				return list[i].URL
			case got[i] == nil && !graceOver:
				break scan
			}
		}
		if n == len(list) {
			return ""
		}
		select {
		case r := <-ch:
			n++
			ok := r.ok
			got[r.i] = &ok
			if ok && grace == nil && !graceOver {
				grace = time.After(300 * time.Millisecond)
			}
		case <-grace:
			grace, graceOver = nil, true
		case <-ctx.Done():
			return ""
		}
	}
}

// Keeper is the 30-second look while connected: it says when to move.
type Keeper struct {
	mu     sync.Mutex
	streak map[string]int // >0 answers in a row, <0 misses in a row
	Probe  func(context.Context, string) bool
	Need   int
}

func same(a, b string) bool {
	return strings.EqualFold(strings.TrimSuffix(a, "/"), strings.TrimSuffix(b, "/"))
}

// Tick probes the way in use and every better one; it returns the base to
// move to, or "" to stay.
func (k *Keeper) Tick(ctx context.Context, ways []protocol.ReachWay, current string) string {
	need := k.Need
	if need == 0 {
		need = 2
	}
	k.mu.Lock()
	if k.streak == nil {
		k.streak = map[string]int{}
	}
	k.mu.Unlock()
	list := Ranked(ways)
	at := -1
	for i, w := range list {
		if same(w.URL, current) {
			at = i
		}
	}
	look := list
	if at >= 0 {
		look = list[:at+1]
	} else {
		look = append(append([]protocol.ReachWay(nil), list...), protocol.ReachWay{URL: current})
	}
	answers := make([]bool, len(look))
	var wg sync.WaitGroup
	for i, w := range look {
		wg.Add(1)
		go func(i int, u string) {
			defer wg.Done()
			answers[i] = k.Probe(ctx, u)
		}(i, w.URL)
	}
	wg.Wait()
	k.mu.Lock()
	defer k.mu.Unlock()
	for i, w := range look {
		s := k.streak[w.URL]
		if answers[i] {
			k.streak[w.URL] = max(s, 0) + 1
		} else {
			k.streak[w.URL] = min(s, 0) - 1
		}
	}
	for i := 0; i < at; i++ {
		if k.streak[list[i].URL] >= need {
			return list[i].URL
		}
	}
	if k.streak[current] <= -need || (at >= 0 && k.streak[list[at].URL] <= -need) {
		for i, w := range look {
			if answers[i] && !same(w.URL, current) {
				return w.URL
			}
		}
		if at >= 0 {
			for _, w := range list[at+1:] {
				if k.Probe(ctx, w.URL) {
					return w.URL
				}
			}
		}
	}
	return ""
}

// Learn keeps the home's ways (and, for a Mac paired before D293, its
// fingerprint, said over the connection this Mac's token already opened) in
// the saved connection. No saved connection: nothing (this Mac's own home).
func Learn(path string, ways []protocol.ReachWay, fp string) (*Saved, error) {
	s, err := Load(path)
	if err != nil || s == nil || s.Token == "" {
		return s, err
	}
	s.Ways = ways
	if s.FP == "" {
		s.FP = fp
	}
	return s, Save(path, *s)
}

// Follow is the app's half of D293 while it runs: at launch, the best way
// that proves it is the home; then every 30 s the keeper's look. moveTo is
// called with the new ws URL when the app should dial another way.
func Follow(ctx context.Context, path string, current func() string, moveTo func(wsURL string)) {
	k := &Keeper{}
	look := func(launch bool) {
		s, _ := Load(path)
		if s == nil || s.FP == "" || len(s.Ways) < 2 {
			return
		}
		if k.Probe == nil {
			k.Probe = Prover(s.FP, nil)
		}
		base := BaseOf(current())
		next := ""
		if launch {
			next = Race(ctx, append(append([]protocol.ReachWay(nil), s.Ways...), protocol.ReachWay{Kind: "domain", URL: base}), k.Probe)
		} else {
			next = k.Tick(ctx, s.Ways, base)
		}
		if next == "" || same(next, base) {
			return
		}
		s.URL = WSURL(next)
		_ = Save(path, *s)
		moveTo(s.URL)
	}
	look(true)
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			look(false)
		}
	}
}
