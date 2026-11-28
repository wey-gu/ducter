// research/248 phase 1 (D673): a theme is pure token data. OverlayTheme applies one paper's
// colours from a theme.json onto Pebble (light or dark). A theme covers every surface token — the
// paper, the card, the chrome (titlebar/sidebar), sheets, menus and tooltips — all derived from the
// theme's own bg/surface/ink/line/accent, so nothing keeps Pebble's warm brown beside a cool
// paper. What stays Pebble is what is a scene or art (the Devices stage, the clay figures, the
// partner stones, the file-family colours, the locator). The clay (button ledges, card bases,
// drops) is re-derived from the theme's paper (clayFollows), and the reply imprint from its ink.
package theme

import (
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

func stateColors(base StateColors, s protocol.ThemeStateColors, dark bool) StateColors {
	out := base
	if s.Dot != "" {
		out.Dot = hex(s.Dot)
	}
	if s.Surface != "" {
		out.Surface = hex(s.Surface)
	}
	if s.Ink != "" {
		out.Ink = hex(s.Ink)
	}
	// Strong (big numbers, a pebble's shadow) is the dot itself; Ledge is the surface pressed
	// a little toward ink, the clay base under a tinted card.
	out.Strong = out.Dot
	out.Ledge = out.Surface.Mix(out.Ink, 0.18)
	if dark {
		// On a dark paper the clay base sits below the card, toward black, never toward the
		// light ink (a pale ledge under a dark card reads as a glow).
		out.Ledge = out.Surface.Mix(black, 0.4)
	}
	return out
}

var black = hex("#000000")

// clayFollows re-derives the clay (D76) from the overlaid paper: the buttons' ledges and seams,
// the cards' bases, the drops and the dims. In the light the clay is the theme's line and ink
// pressed a little deeper (Pebble's tan ledge under a cool paper read as two themes at once); on
// a dark paper the ledges go toward black and the shadows stay black, as Pebble's own dark does.
func (out *Tokens) clayFollows() {
	pp, ps, pa := out.PressPrimary, out.PressSecondary, out.PressAccent
	if !out.Dark {
		pp.Color, pp.Seam, pp.Top = out.Ink.Mix(black, 0.5), out.Ink.Mix(out.Surface, 0.22), out.Ink.Mix(out.Surface, 0.1)
		pp.Drop = out.Ink.Alpha(0.38)
		ps.Color, ps.Seam, ps.Rim = out.Line.Mix(out.Ink, 0.2), out.Line.Mix(out.Surface, 0.3), out.Ink.Alpha(0.09)
		pa.Color, pa.Seam = out.Accent.Mix(out.Ink, 0.3), out.Accent.Mix(out.Surface, 0.25)
		out.Raised = Elevation{Y: out.Raised.Y, Blur: out.Raised.Blur, Color: out.Line}
		out.Floating = Elevation{Y: out.Floating.Y, Blur: out.Floating.Blur, Color: out.Ink.Alpha(0.14)}
		out.Drop = Elevation{Y: out.Drop.Y, Blur: out.Drop.Blur, Color: out.Ink.Alpha(0.28)}
		out.DropPressed = Elevation{Y: out.DropPressed.Y, Blur: out.DropPressed.Blur, Color: out.Ink.Alpha(0.22)}
		// Sheets' and the viewer's dims are the paper's ink, never Pebble's warm brown.
		out.Scrim = out.Ink.Alpha(0.14)
		out.Lightbox = out.Ink.Alpha(0.92)
		out.LightboxInk = out.Bg
	} else {
		deep := out.Bg.Mix(black, 0.45)
		pp.Color, pp.Seam, pp.Top = out.Ink.Mix(out.Bg, 0.45), out.Ink.Mix(out.Bg, 0.3), out.Ink
		ps.Color, ps.Seam = deep, deep
		pa.Color, pa.Seam = out.Accent.Mix(out.Bg, 0.3), out.Accent.Mix(out.Bg, 0.3)
		out.Raised = Elevation{Y: out.Raised.Y, Blur: out.Raised.Blur, Color: deep}
		out.Lightbox = out.Bg.Mix(black, 0.3).Alpha(0.96)
		// Floating, Drop, DropPressed and Scrim keep Pebble dark's black: a shadow is black.
	}
	out.PressPrimary, out.PressSecondary, out.PressAccent = pp, ps, pa
}

// col is a colour that keeps the base when the theme leaves it empty.
func col(base ui.Color, s string) ui.Color {
	if s == "" {
		return base
	}
	return hex(s)
}

// OverlayTheme returns base with the theme mode's colours applied. An empty colour keeps the base
// paper's own (the resolved theme always fills every token, but a partial input never breaks).
func OverlayTheme(base *Tokens, m protocol.ThemeModeTokens) *Tokens {
	out := *base
	out.Bg = col(out.Bg, m.Bg)
	out.Surface = col(out.Surface, m.Surface)
	out.SurfaceRaised = col(out.SurfaceRaised, m.SurfaceRaised)
	out.Ink = col(out.Ink, m.Ink)
	out.InkMuted = col(out.InkMuted, m.InkMuted)
	out.Accent = col(out.Accent, m.Accent)
	out.OnAccent = col(out.OnAccent, m.OnAccent)
	out.Line = col(out.Line, m.Line)
	out.UserBubble = col(out.UserBubble, m.UserBubble)
	out.OnUserBubble = col(out.OnUserBubble, m.OnUserBubble)
	out.PartnerBubble = col(out.PartnerBubble, m.PartnerBubble)
	out.OnPartnerBubble = col(out.OnPartnerBubble, m.OnPartnerBubble)
	out.NeedsYou = stateColors(out.NeedsYou, m.Decide, out.Dark)
	out.Working = stateColors(out.Working, m.Progress, out.Dark)
	out.Waiting = stateColors(out.Waiting, m.Wait, out.Dark)
	out.Done = stateColors(out.Done, m.Ok, out.Dark)
	out.Failed = stateColors(out.Failed, m.Fail, out.Dark)

	// Every surface token follows the paper. The chrome (titlebar, the sidebar/rail) is the paper
	// lifted a little toward the card, its divider the paper's line; the sunken surfaces and the
	// faint/secondary inks and hairlines all derive from the theme's own, so nothing keeps Pebble's
	// warm brown beside a cool paper.
	out.Chrome = out.Bg.Mix(out.Surface, 0.4)
	out.ChromeLine = out.Line
	out.Sunken = out.Bg.Mix(out.Ink, 0.04)
	out.SurfaceSunken = out.Surface.Mix(out.Ink, 0.04)
	out.Faint = out.InkMuted.Mix(out.Bg, 0.45)
	out.InkSoft = out.Ink.Mix(out.InkMuted, 0.4)
	out.LineSoft = out.Line.Mix(out.Bg, 0.4)
	out.Line2 = out.Line.Mix(out.Ink, 0.10)
	out.Highlight = out.Accent.Mix(out.Bg, 0.72)
	out.HighlightInk = out.Ink
	out.clayFollows()

	out.Reply = replyTokens(&out)
	return &out
}
