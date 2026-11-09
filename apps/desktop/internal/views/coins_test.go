package views

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

func TestCoinArt(t *testing.T) {
	cases := []struct {
		h    string
		size float32
		off  bool
		want string
	}{
		{"claude-code", 84, false, "coin_claude_code"},
		{"claude-code", 62, false, "coin_claude_code_plain"},
		{"codex", 20, false, "coin_codex_plain"},
		{"pi", 40, true, "coin_pi_off"},
		{"pi", 26, false, "coin_pi"},
		{"deepseek-harness", 26, true, "coin_off_plain"},
		{"deepseek-harness", 84, false, "coin_deepseek_harness"},
		{"someone-new", 40, false, "token_ink"},
	}
	for _, c := range cases {
		if got := coinArt(c.h, c.size, c.off); got != c.want {
			t.Errorf("coinArt(%q, %v, %v) = %q, want %q", c.h, c.size, c.off, got, c.want)
		}
	}
	// Every coin's art is there, and the sheen.
	for h := range coinIDs {
		for _, art := range []string{coinArt(h, 62, false), coinArt(h, 20, false), coinArt(h, 62, true)} {
			if theme.Clay(art) == nil {
				t.Errorf("no clay art %q", art)
			}
		}
	}
	if theme.Clay("coin_sheen") == nil {
		t.Error("no coin_sheen")
	}
	if coinMotionOf(protocol.Working) != coinWorking || coinMotionOf(protocol.NeedsYou) != coinWaiting || coinMotionOf(protocol.Done) != coinStill {
		t.Error("coinMotionOf")
	}
}
