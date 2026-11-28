package theme

import (
	"testing"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// A theme's tokens reach the drawn window: OverlayTheme sets every surface token onto Pebble — the
// paper, the chrome (sidebar, titlebar), the clay's ledges — and leaves the scene and art Pebble's.
func TestOverlayThemeAppliesTokens(t *testing.T) {
	m := protocol.ThemeModeTokens{
		Bg: "#101010", Surface: "#202020", SurfaceRaised: "#2A2A2A", Ink: "#F0F0F0", InkMuted: "#B0B0B0",
		Accent: "#FF0000", OnAccent: "#FFFFFF", Line: "#333333",
		UserBubble: "#FF0000", OnUserBubble: "#FFFFFF", PartnerBubble: "#202020", OnPartnerBubble: "#F0F0F0",
		Decide:   protocol.ThemeStateColors{Dot: "#FF0000", Surface: "#3A1111", Ink: "#FFCCCC"},
		Progress: protocol.ThemeStateColors{Dot: "#00FF00", Surface: "#113A11", Ink: "#CCFFCC"},
		Wait:     protocol.ThemeStateColors{Dot: "#FFFF00", Surface: "#3A3A11", Ink: "#FFFFCC"},
		Ok:       protocol.ThemeStateColors{Dot: "#00FF00", Surface: "#113A11", Ink: "#CCFFCC"},
		Fail:     protocol.ThemeStateColors{Dot: "#FF0000", Surface: "#3A1111", Ink: "#FFCCCC"},
	}
	out := OverlayTheme(Pebble(), m)
	if out.Bg != hex("#101010") || out.Surface != hex("#202020") || out.Ink != hex("#F0F0F0") {
		t.Fatalf("theme colours not applied: bg=%v surface=%v ink=%v", out.Bg, out.Surface, out.Ink)
	}
	if out.NeedsYou.Surface != hex("#3A1111") || out.Done.Ink != hex("#CCFFCC") {
		t.Fatalf("state colours not applied: %+v", out.NeedsYou)
	}
	// The chrome (the sidebar and titlebar) is the theme's paper, never Pebble's warm one.
	if out.Chrome == Pebble().Chrome || out.Chrome != out.Bg.Mix(out.Surface, 0.4) {
		t.Fatalf("the chrome must follow the theme's paper: %v", out.Chrome)
	}
	// The quiet button's ledge and the accent button's ledge are the theme's clay, not Pebble's tan
	// and orange.
	if out.PressSecondary.Color == Pebble().PressSecondary.Color || out.PressAccent.Color == Pebble().PressAccent.Color {
		t.Fatalf("the button ledges kept Pebble's clay: %v %v", out.PressSecondary.Color, out.PressAccent.Color)
	}
	if out.Isles.Sea != Pebble().Isles.Sea {
		t.Fatalf("a theme must not touch the Devices scene")
	}
	// The sunken surface tracks the paper, not Pebble's cream.
	if out.Sunken == Pebble().Sunken {
		t.Fatalf("the sunken surface should follow the theme's paper")
	}
}

func TestOverlayThemeDark(t *testing.T) {
	// The resolved theme always fills every token; here the dark paper is a distinct one.
	base := PebbleDark()
	m := protocol.ThemeModeTokens{
		Bg: "#101010", Surface: "#202020", SurfaceRaised: "#2A2A2A", Ink: "#F0F0F0", InkMuted: "#B0B0B0",
		Accent: "#FF0000", OnAccent: "#FFFFFF", Line: "#333333",
		UserBubble: "#FF0000", OnUserBubble: "#FFFFFF", PartnerBubble: "#202020", OnPartnerBubble: "#F0F0F0",
		Decide:   protocol.ThemeStateColors{Dot: "#FF8A3D", Surface: "#3D2414", Ink: "#FFC39B"},
		Progress: protocol.ThemeStateColors{Dot: "#4BA8F0", Surface: "#15283A", Ink: "#A9D6FB"},
		Wait:     protocol.ThemeStateColors{Dot: "#FFC94D", Surface: "#362B0E", Ink: "#FFE08A"},
		Ok:       protocol.ThemeStateColors{Dot: "#7FD99A", Surface: "#163222", Ink: "#A6ECBB"},
		Fail:     protocol.ThemeStateColors{Dot: "#E5577A", Surface: "#3A1621", Ink: "#F8A9BC"},
	}
	out := OverlayTheme(base, m)
	if out.Bg != hex("#101010") {
		t.Fatalf("the dark paper was not overlaid: %v", out.Bg)
	}
	if out.NeedsYou.Surface != hex("#3D2414") {
		t.Fatalf("the decide surface was not overlaid")
	}
	if !out.Dark {
		t.Fatalf("a dark overlay stays dark")
	}
	// On a dark paper the clay goes toward black: a ledge darker than its card, a black drop, and
	// the chrome the theme's own.
	lum := func(c ui.Color) int { return int(c.R) + int(c.G) + int(c.B) }
	if lum(out.NeedsYou.Ledge) >= lum(out.NeedsYou.Surface) || lum(out.PressSecondary.Color) >= lum(out.Surface) {
		t.Fatalf("a dark ledge must sit below its card: ledge=%v surface=%v", out.NeedsYou.Ledge, out.NeedsYou.Surface)
	}
	if out.Drop.Color != base.Drop.Color {
		t.Fatalf("a dark drop stays black: %v", out.Drop.Color)
	}
	if out.Chrome == base.Chrome {
		t.Fatalf("the dark chrome kept Pebble's brown")
	}
}
