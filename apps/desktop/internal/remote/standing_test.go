package remote

import "testing"

// D520: a standing the home (packages/core home-key.ts attest) signed, as a
// fixture: the Go check agrees with the home's text, and believes it only
// for its own nonce, its own pinned key and its own words.
func TestCheckStandingProof(t *testing.T) {
	const (
		fp    = "k3rdBrL4zTiGol7Y_5rCIA"
		key   = "f1bJ2jmu3euQhdvBymhG1dK4JefxBU4EqAugb8JDJzI"
		sig   = "2J5pIFDC766SeSJGWGIbB27etiGWwrFGYarhKE6Gw-ulZuAQuwdCt3WERTsSYkQatvl258QkhDJQC40i4fqPAw"
		nonce = "n0nce-n0nce-n0nce-n0nce"
	)
	if got := CheckStandingProof("revoked", "0123456789", key, sig, nonce, fp); got != StandingRevoked || !got.Gone() {
		t.Fatalf("the home's own revoke: %q", got)
	}
	for name, got := range map[string]Standing{
		"another nonce":       CheckStandingProof("revoked", "0123456789", key, sig, "another-nonce-another", fp),
		"another pinned key":  CheckStandingProof("revoked", "0123456789", key, sig, nonce, "AAAAAAAAAAAAAAAAAAAAAA"),
		"nothing pinned":      CheckStandingProof("revoked", "0123456789", key, sig, nonce, ""),
		"words changed":       CheckStandingProof("unknown", "0123456789", key, sig, nonce, fp),
		"another device":      CheckStandingProof("revoked", "9876543210", key, sig, nonce, fp),
		"a standing it lacks": CheckStandingProof("gone", "0123456789", key, sig, nonce, fp),
	} {
		if got != StandingUnsure || got.Gone() {
			t.Errorf("%s: %q, want unsure", name, got)
		}
	}
	if AskStanding(t.Context(), nil, "wss://hel.example.com/ws", "", fp) != StandingUnsure {
		t.Error("no credential: nothing to ask")
	}
}
