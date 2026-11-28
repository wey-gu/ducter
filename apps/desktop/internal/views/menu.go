package views

import (
	"sync"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/ui"
)

// The one menu of the Mac app (D421): every ⋯, every pop-up choice and
// every right-click menu goes through menuButton or contextMenu, which
// MyGo draws in the window (PopoverMenuButton, PopoverMenu) in Pebble's
// clay: the card's surface, a hairline, the floating shadow, rows of the
// small type that warm on hover, destructive items in the failed ink. The
// system's grey NSMenu stays for the menu bar and the menu bar extra only
// (main.go), where macOS expects it. A raw Menu( or ContextMenu( anywhere
// else in the views fails TestMenusGoThroughTheClayMenu.
//
// The drawn menu brings the keys (Up and Down, Home and End, typing the
// first letters, Right and Left for a submenu, Enter, Space, Escape), the
// roles assistive technology reads (menu button, menu, menu item), and the
// placement that flips to the other side where the window has no room.
// Labels size the menu to its content: no MaxWidth, so a short label is
// never cut. Mark a destructive item with Danger(), give one a drawn glyph
// with Icon(menuGlyph(...)).

// menuText is the shared text button that opens the one clay menu under it (D421): the tab row's
// 更多 / More and any other "one more menu" a view needs, drawn by the set, never by the view.
func (a *App) menuText(c *ui.Context, key, label string, build func(m *ui.Menu)) ui.Element {
	t := a.T
	b := ui.Row(c.Key("mt:"+key)).Gap(t.S1+2).Height(34).Padding(0, t.S3).Radius(t.RadiusMD).AlignItems(ui.Center).
		Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(label).Focusable().Shrink(0)
	a.rowHover(c, b, groundPage(), false)
	b.Children(func() {
		uiText(c, label).FontSize(t.SM).FontWeight(700).TextColor(t.InkMuted).SingleLine().AccessHidden(true)
		a.glyph(c, 12, drawChevron(t.InkMuted, true))
	})
	a.menuButton(c, b, build)
	return b
}

// menuMark is the one ⋯ that opens the clay menu (D421) for a row or a tile that has more than the
// menu's own opener (a project's rename/merge/hide/pin). It is drawn by the set, never by a view.
func (a *App) menuMark(c *ui.Context, key, label string, size float32, build func(m *ui.Menu)) ui.Element {
	t := a.T
	b := ui.Box(c.Key("mm:"+key)).Size(size, size).Radius(a.buttonRadius(size)).Label(label).Tooltip(label).
		Role(ui.RoleButton).Cursor(ui.CursorPointer).Focusable().Shrink(0)
	fg := a.buttonLook(c, b, btnText, size, t.Surface)
	b.Draw(drawMore(fg))
	a.menuButton(c, b, build)
	return b
}

// menuButton makes b, a ⋯ or a pop-up button the caller drew, open the clay
// menu build fills, below it and lined up with its end (the ⋯ sits at a
// card's or a header's end), or with its start when start is set.
func (a *App) menuButton(c *ui.Context, b ui.Element, build func(m *ui.Menu), start ...bool) {
	o := ui.PopoverMenuButtonOptions{At: ui.AnchorBottomEnd, Self: ui.AnchorTopEnd, Panel: a.menuPanel, Item: a.menuItemRow}
	if len(start) > 0 && start[0] {
		o.At, o.Self = ui.AnchorBottomStart, ui.AnchorTopStart
	}
	a.inMenuTheme(c, func() { b.PopoverMenuButton(build, o) })
}

// menuAbove is menuButton opening above b (D536): for a pop-up choice low
// in its card, the list goes up over its own group, never down over the next
// group's heading; it flips below where the window has no room above.
func (a *App) menuAbove(c *ui.Context, b ui.Element, build func(m *ui.Menu), start bool) {
	o := ui.PopoverMenuButtonOptions{At: ui.AnchorTopEnd, Self: ui.AnchorBottomEnd, Panel: a.menuPanel, Item: a.menuItemRow}
	if start {
		o.At, o.Self = ui.AnchorTopStart, ui.AnchorBottomStart
	}
	a.inMenuTheme(c, func() { b.PopoverMenuButton(build, o) })
}

// contextMenu gives e the clay menu build fills, where it is right-clicked
// (or Control-clicked, or the menu key pressed while it has the focus).
func (a *App) contextMenu(c *ui.Context, e ui.Element, build func(m *ui.Menu)) {
	a.inMenuTheme(c, func() { e.PopoverMenu(build, ui.PopoverMenuOptions{Panel: a.menuPanel, Item: a.menuItemRow}) })
}

// menuPanel is the menu's card: the same surface, hairline, corners and
// floating shadow as the clay popovers (listPanel, ogPanel).
func (a *App) menuPanel(panel ui.Element) {
	t := a.T
	panel.Padding(t.S1+2).Radius(t.RadiusMD).Background(t.Surface).Border(1, t.LineSoft).
		NoShadow().Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).MinWidth(180).MaxWidth(420)
}

// menuItemRow is one item's row: the small type, roomy, the soft corners of a
// chip.
func (a *App) menuItemRow(item ui.Element) {
	t := a.T
	item.Padding(t.S2, t.S3).Radius(t.RadiusXS).FontSize(t.SM).Gap(t.S2)
}

// inMenuTheme builds fn with the menu's theme, the window's with the
// highlight a menu row takes (the sunken clay, the ink on it, never the
// accent's fill) and the failed ink for Danger, then puts the window's back.
func (a *App) inMenuTheme(c *ui.Context, fn func()) {
	base := c.Theme()
	if a.menuTheme == nil || a.menuThemeOf != base {
		th := *base
		t := a.T
		th.Background, th.Border = t.Surface, t.LineSoft
		th.Accent, th.AccentHover, th.AccentPressed, th.AccentText = t.SurfaceSunken, t.SurfaceSunken, t.Line, t.Ink
		th.SurfaceHover = t.SurfaceSunken
		th.Danger = t.Failed.Ink
		th.Text, th.TextMuted = t.Ink, t.InkMuted
		th.FontSize = t.SM
		a.menuTheme, a.menuThemeOf = &th, base
	}
	c.SetTheme(a.menuTheme)
	defer c.SetTheme(base)
	fn()
}

// menuGlyphs are the drawn glyphs a menu row may lead with: strokes in the
// row's ink (template icons), never an emoji. Made once.
var (
	menuGlyphsOnce sync.Once
	menuGlyphs     map[string]ui.MenuIcon
)

// menuGlyphPaths are the glyphs, 24×24 strokes.
var menuGlyphPaths = map[string]string{
	"reply":  `<path d="M10 7 4 12l6 5"/><path d="M4 12h10a6 6 0 0 1 6 6v1"/>`,
	"copy":   `<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>`,
	"read":   `<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 9a4 4 0 0 1 0 6"/><path d="M19 6.5a7.5 7.5 0 0 1 0 11"/>`,
	"rename": `<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>`,
	"pin":    `<path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 13v7"/>`,
	"delete": `<path d="M5 7h14"/><path d="M10 7V5h4v2"/><path d="M7 7l1 12a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2l1-12"/>`,
}

// menuGlyph is the drawn glyph name for a menu row (Icon), or nil.
func menuGlyph(name string) ui.MenuIcon {
	menuGlyphsOnce.Do(func() {
		menuGlyphs = map[string]ui.MenuIcon{}
		for k, p := range menuGlyphPaths {
			svg, err := ui.ParseSVG([]byte(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` + p + `</svg>`))
			if err != nil {
				continue
			}
			if ic, err := mygo.NewMenuIconSVG(svg, true); err == nil {
				menuGlyphs[k] = ic
			}
		}
	})
	if ic, ok := menuGlyphs[name]; ok {
		return ic
	}
	return nil
}

// menuDots is a row's ⋯ that opens the one clay menu (D421): the shared opener for a card or a
// row whose more stands at its end (Import's source row). The ⋯ is drawn, never a font glyph.
func (a *App) menuDots(c *ui.Context, key, label string, build func(m *ui.Menu)) {
	t := a.T
	b := ui.Box(c.Key(key)).Size(t.ControlSM, t.ControlSM).Radius(a.buttonRadius(t.ControlSM)).Label(label).
		Tooltip(label).Role(ui.RoleButton).Cursor(ui.CursorPointer).Focusable().Shrink(0)
	fg := a.buttonLook(c, b, btnText, t.ControlSM, t.Surface)
	b.Draw(drawMore(fg))
	a.menuButton(c, b, build)
}
