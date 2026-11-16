package theme

import (
	"math"
	"testing"

	"github.com/egoist/mygo/ui"
)

// luminance is WCAG 2.x relative luminance.
func luminance(c ui.Color) float64 {
	ch := func(v uint8) float64 {
		s := float64(v) / 255
		if s <= 0.03928 {
			return s / 12.92
		}
		return math.Pow((s+0.055)/1.055, 2.4)
	}
	return 0.2126*ch(c.R) + 0.7152*ch(c.G) + 0.0722*ch(c.B)
}

// contrast is the WCAG ratio of fg on an opaque bg (fg's alpha laid over bg).
func contrast(fg, bg ui.Color) float64 {
	if fg.A < 255 {
		fg = bg.Mix(ui.RGB(fg.R, fg.G, fg.B), float32(fg.A)/255)
	}
	a, b := luminance(fg), luminance(bg)
	if a < b {
		a, b = b, a
	}
	return (a + 0.05) / (b + 0.05)
}

type pair struct {
	name   string
	fg, bg ui.Color
	min    float64
}

// textPairs are every text token on the grounds it is set on.
func textPairs(t *Tokens) []pair {
	ps := []pair{
		{"Ink / Bg", t.Ink, t.Bg, 4.5},
		{"Ink / Surface", t.Ink, t.Surface, 4.5},
		{"InkSoft / Bg", t.InkSoft, t.Bg, 4.5},
		{"InkSoft / Surface", t.InkSoft, t.Surface, 4.5},
		{"InkMuted / Bg", t.InkMuted, t.Bg, 4.5},
		{"InkMuted / Surface", t.InkMuted, t.Surface, 4.5},
		{"InkMuted / SurfaceSunken", t.InkMuted, t.SurfaceSunken, 4.5},
		{"Ink / Chrome", t.Ink, t.Chrome, 4.5},
		{"OnUserBubble / UserBubble", t.OnUserBubble, t.UserBubble, 4.5},
		{"OnPartnerBubble / PartnerBubble", t.OnPartnerBubble, t.PartnerBubble, 4.5},
		{"OnAccent / Accent", t.OnAccent, t.Accent, 4.5},
		{"Bg / Ink (primary button)", t.Bg, t.Ink, 4.5},
		{"HighlightInk / Highlight", t.HighlightInk, t.Highlight, 4.5},
		{"AddedInk / Added", t.AddedInk, t.Added, 4.5},
		{"DeletedInk / Deleted", t.DeletedInk, t.Deleted, 4.5},
		{"Reply.Ink / Reply.OnPartner", t.Reply.Ink, t.Reply.OnPartner, 4.5},
		{"Reply.InkOnUser / Reply.OnUser", t.Reply.InkOnUser, t.Reply.OnUser, 4.5},
		{"LightboxInk / Lightbox", t.LightboxInk, t.Lightbox.Alpha(1), 4.5},
	}
	for _, s := range []struct {
		n string
		c StateColors
	}{{"NeedsYou", t.NeedsYou}, {"Working", t.Working}, {"Waiting", t.Waiting}, {"Done", t.Done}, {"Failed", t.Failed}, {"Awake", t.Awake}, {"Asleep", t.Asleep}, {"Away", t.Away}} {
		ps = append(ps, pair{s.n + ".Ink / Surface", s.c.Ink, s.c.Surface, 4.5})
		ps = append(ps, pair{s.n + ".Ink / Bg", s.c.Ink, t.Bg, 4.5})
	}
	for _, n := range []string{"clay", "sand", "sage", "mist", "lilac", "stone"} {
		ps = append(ps, pair{"Tint " + n + " ink / ground", t.Tints[n].Ink, t.Tints[n].Ground, 4.5})
	}
	// Large or bold marks (3:1): a state's dot as a mark on the paper, big
	// numbers in Strong, a file badge's extension.
	for _, s := range []struct {
		n string
		c StateColors
	}{{"NeedsYou", t.NeedsYou}, {"Working", t.Working}, {"Done", t.Done}, {"Failed", t.Failed}} {
		ps = append(ps, pair{s.n + ".Strong / Bg (big numbers)", s.c.Strong, t.Bg, 3})
	}
	ps = append(ps, pair{"Accent / Bg (marks)", t.Accent, t.Bg, 3})
	return ps
}

// TestContrast holds every text token to WCAG AA (4.5:1; 3:1 for big
// numbers and marks) in light and dark (D302). go test -v prints the table.
func TestContrast(t *testing.T) {
	light, dark := textPairs(Pebble()), textPairs(PebbleDark())
	t.Logf("| pair | light | dark |")
	t.Logf("|---|---|---|")
	for i := range light {
		l, d := contrast(light[i].fg, light[i].bg), contrast(dark[i].fg, dark[i].bg)
		t.Logf("| %s | %.1f | %.1f |", light[i].name, l, d)
		if d < dark[i].min {
			t.Errorf("dark %s: %.2f < %.1f", dark[i].name, d, dark[i].min)
		}
	}
}

func TestBlend(t *testing.T) {
	a, b := Pebble(), PebbleDark()
	if got := Blend(a, b, 0); got.Bg != a.Bg || got.Tints["sage"] != a.Tints["sage"] || got.Family["pdf"] != a.Family["pdf"] {
		t.Fatalf("Blend 0 is not the start: %v", got.Bg)
	}
	if got := Blend(a, b, 1); got.Bg != b.Bg || got.NeedsYou.Ink != b.NeedsYou.Ink || got.Isles.Sea != b.Isles.Sea {
		t.Fatalf("Blend 1 is not the end")
	}
	mid := Blend(a, b, 0.5)
	if mid.Bg == a.Bg || mid.Bg == b.Bg || !mid.Dark {
		t.Fatalf("Blend 0.5: %v", mid.Bg)
	}
	if a.Bg != hex("#FFF6EA") {
		t.Fatal("Blend changed its input")
	}
}
