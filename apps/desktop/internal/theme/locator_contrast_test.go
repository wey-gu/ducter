package theme

// D526: the locator's marks are graphics, so each keeps 3:1 (WCAG 1.4.11)
// on every ground it is drawn on, in both themes and in every partner's clay;
// and the web's --mark-* are the same values (app.css).

import (
	"os"
	"regexp"
	"strings"
	"testing"

	"github.com/egoist/mygo/ui"
)

func TestLocatorMarksContrast(t *testing.T) {
	for _, th := range []*Tokens{Pebble(), PebbleDark()} {
		l := th.Locator
		grounds := map[string]ui.Color{
			"Bg (the rail at rest)": th.Bg, "Surface (the card)": th.Surface,
			"SurfaceSunken (the track, a chosen row)": th.SurfaceSunken, "SurfaceRaised (the knob)": th.SurfaceRaised,
		}
		marks := map[string]ui.Color{"You": l.You, "Ask": l.Ask, "Done": l.Done, "Failed": l.Failed, "Progress": l.Progress, "Quiet": l.Quiet}
		for look := range LookClay {
			marks["partner in "+look] = LookTone(th.ClayMark, look)
		}
		for gn, g := range grounds {
			for mn, m := range marks {
				if c := contrast(m, g); c < 3 {
					t.Errorf("%s: %s on %s is %.2f:1, under 3:1", th.Name, mn, gn, c)
				}
			}
			if gn != "SurfaceRaised (the knob)" {
				if c := contrast(l.KnobRim, g); c < 3 {
					t.Errorf("%s: the knob's hairline on %s is %.2f:1, under 3:1", th.Name, gn, c)
				}
				if c := contrast(l.Chosen, g); c < 3 {
					t.Errorf("%s: the chosen ring on %s is %.2f:1, under 3:1", th.Name, gn, c)
				}
			}
		}
	}
}

// TestLocatorMarksOnTheWeb: app.css carries the same --mark-* values, light
// and dark.
func TestLocatorMarksOnTheWeb(t *testing.T) {
	b, err := os.ReadFile("../../../web/static/app.css")
	if err != nil {
		t.Skip("no app.css")
	}
	css := string(b)
	start := strings.Index(css, "/* D271, D526: the locator")
	if start < 0 {
		t.Fatal("no locator block in app.css")
	}
	block := css[start:]
	block = block[:strings.Index(block, ".locator {")]
	re := regexp.MustCompile(`--mark-([a-z-]+):\s*(#[0-9a-fA-F]{6})`)
	// The block holds :root, then the dark media query, then [data-theme="dark"].
	parts := strings.SplitN(block, "@media (prefers-color-scheme: dark)", 2)
	if len(parts) != 2 {
		t.Fatal("no dark block")
	}
	want := func(th *Tokens) map[string]string {
		l := th.Locator
		return map[string]string{"you": hexOf(l.You), "ask": hexOf(l.Ask), "done": hexOf(l.Done), "failed": hexOf(l.Failed),
			"progress": hexOf(l.Progress), "quiet": hexOf(l.Quiet), "knob-rim": hexOf(l.KnobRim), "chosen": hexOf(l.Chosen), "clay": hexOf(th.ClayMark)}
	}
	for i, th := range []*Tokens{Pebble(), PebbleDark()} {
		got := map[string]string{}
		src := parts[i]
		if i == 1 {
			src = src[:strings.Index(src, "}\n}")]
		}
		for _, m := range re.FindAllStringSubmatch(src, -1) {
			got[m[1]] = strings.ToUpper(m[2])
		}
		for k, v := range want(th) {
			if got[k] != v {
				t.Errorf("%s: --mark-%s is %q, want %s", th.Name, k, got[k], v)
			}
		}
	}
}
