package views

import (
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D302: the window follows macOS's light or dark appearance, live, unless
// Settings › 外观和声音 / Look and sound pins one. The tokens are one
// pointer every view reads each frame (a.T); a change of appearance moves
// them from one paper to the other over Tokens.AppearDur, every colour at
// once (theme.Blend), and at once under Reduce Motion.

// appearanceState is the window's light or dark and the move between them.
type appearanceState struct {
	known bool
	dark  bool
	// themeID is the active theme ("pebble" or an installed theme's id): a change rebuilds the
	// tokens, so picking a theme re-skins the window the same way the paper's move does.
	themeID string
	// from is the token set the move started from, at; nil when still.
	from *theme.Tokens
	at   time.Time
}

// activeThemeID is the theme the window should be in: the one chosen in Look and sound, else
// Pebble.
func (a *App) activeThemeID() string {
	if a.S != nil && a.S.Themes != nil && a.S.Themes.Active != "" {
		return a.S.Themes.Active
	}
	return "pebble"
}

// activeThemeFor is Pebble (light or dark) with the active theme's paper overlaid.
func (a *App) activeThemeFor(dark bool) *theme.Tokens {
	base := theme.For(dark)
	if a.S == nil || a.S.Themes == nil || a.S.Themes.Active == "" || a.S.Themes.Active == "pebble" {
		return base
	}
	for _, r := range a.S.Themes.Themes {
		if r.ID == a.S.Themes.Active && r.Theme != nil {
			if dark {
				return theme.OverlayTheme(base, r.Theme.Tokens.Dark)
			}
			return theme.OverlayTheme(base, r.Theme.Tokens.Light)
		}
	}
	return base
}

// wantDark is the appearance the window should be in: the one chosen in
// Settings, else macOS's (base, MyGo's theme for this frame).
func (a *App) wantDark(base *ui.Theme) bool {
	switch a.Local.Appearance() {
	case "dark":
		return true
	case "light":
		return false
	}
	return base != nil && base.Dark
}

// followAppearance runs at the top of each frame. It reports whether the
// tokens changed this frame (their derived themes need building again).
func (a *App) followAppearance(c *ui.Context) bool {
	ap := &a.appear
	dark := a.wantDark(c.Theme())
	tid := a.activeThemeID()
	defer func() { theme.UseDarkArt(a.T.Dark) }()
	theme.UseLook(a.shownLook()) // D497: the figure is in the shown partner's own clay
	if !ap.known || dark != ap.dark || tid != ap.themeID {
		first := !ap.known
		ap.known, ap.dark, ap.themeID = true, dark, tid
		if first || c.Preferences().ReduceMotion || a.T.AppearDur <= 0 {
			ap.from = nil
			// A theme change (or the first frame) must apply even when the paper didn't move:
			// `dark` staying put is no reason to skip the overlay (the light-mode bug).
			*a.T = *a.activeThemeFor(dark)
			return true
		}
		from := *a.T // mid-move: from where it is now
		ap.from, ap.at = &from, c.Now()
	}
	if ap.from == nil {
		return false
	}
	to := a.activeThemeFor(ap.dark)
	k := float32(c.Now().Sub(ap.at)) / float32(to.AppearDur)
	if k >= 1 {
		*a.T = *to
		ap.from = nil
		return true
	}
	// Ease in and out: the light changes the way a room's does.
	e := k * k * (3 - 2*k)
	*a.T = *theme.Blend(ap.from, to, e)
	c.After(16 * time.Millisecond)
	return true
}

// SetAppearance is Settings' choice: "system", "light" or "dark". It also
// tells macOS (ApplyAppearance), so the menus, the title bar and the
// window's own background agree with the page.
// compact is whether an opened task is laid out compact on this Mac
// (D457): the face at 40 beside the title, closer rows.
func (a *App) compact() bool { return a.Local.Density() == "compact" }

// ToggleDensity switches an opened task between comfortable and compact
// (⌘⇧D, D457), and says which it is now.
func (a *App) ToggleDensity(c *ui.Context) {
	next := "compact"
	if a.compact() {
		next = "comfortable"
	}
	a.Local.SetDensity(next)
	c.AddToast(ui.Toast{ID: "density", Title: a.L.T("density.said." + next), Timeout: 2400 * time.Millisecond})
}

func (a *App) SetAppearance(v string) {
	a.Local.SetAppearance(v)
	if a.ApplyAppearance != nil {
		a.ApplyAppearance(a.Local.Appearance())
	}
}
