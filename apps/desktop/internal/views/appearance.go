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
	// from is the token set the move started from, at; nil when still.
	from *theme.Tokens
	at   time.Time
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
	defer func() { theme.UseDarkArt(a.T.Dark) }()
	if !ap.known || dark != ap.dark {
		first := !ap.known
		ap.known, ap.dark = true, dark
		if first || c.Preferences().ReduceMotion || a.T.AppearDur <= 0 {
			ap.from = nil
			if a.T.Dark == dark {
				return first
			}
			*a.T = *theme.For(dark)
			return true
		}
		from := *a.T // mid-move: from where it is now
		ap.from, ap.at = &from, c.Now()
	}
	if ap.from == nil {
		return false
	}
	to := theme.For(ap.dark)
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
func (a *App) SetAppearance(v string) {
	a.Local.SetAppearance(v)
	if a.ApplyAppearance != nil {
		a.ApplyAppearance(a.Local.Appearance())
	}
}
