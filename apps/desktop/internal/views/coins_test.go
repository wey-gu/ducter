package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

func TestCoinArt(t *testing.T) {
	cases := []struct {
		h    string
		off  bool
		want string
	}{
		{"claude-code", false, "coin_claude_code"},
		{"codex", false, "coin_codex"},
		{"pi", true, "coin_pi_off"},
		{"deepseek-harness", true, "coin_deepseek_harness_off"},
		{"deepseek-harness", false, "coin_deepseek_harness"},
		{"cursor", false, "coin_cursor"},
		{"devin", true, "coin_devin_off"},
		{"kimi", false, "coin_kimi"},
		{"opencode", false, "coin_opencode"},
		{"opencode", true, "coin_opencode_off"},
		{"dim", false, "coin_dim"},
		{"dim", true, "coin_dim_off"},
		{"someone-new", false, "token_ink"},
	}
	for _, c := range cases {
		if got := coinArt(c.h, c.off); got != c.want {
			t.Errorf("coinArt(%q, %v) = %q, want %q", c.h, c.off, got, c.want)
		}
	}
	// Every coin's art is there, in both looks.
	for h := range coinIDs {
		for _, art := range []string{coinArt(h, false), coinArt(h, true)} {
			if theme.Clay(art) == nil {
				t.Errorf("no clay art %q", art)
			}
		}
	}
	// The dark casts whose clay would vanish on the dark ground (D213).
	for _, id := range []string{"codex", "cursor", "kimi", "opencode"} {
		if theme.Clay("coin_"+id+"_dark") == nil {
			t.Errorf("no dark clay art for coin_%s", id)
		}
	}
	if coinMotionOf(protocol.Working) != coinWorking || coinMotionOf(protocol.NeedsYou) != coinWaiting || coinMotionOf(protocol.Done) != coinStill {
		t.Error("coinMotionOf")
	}
}
