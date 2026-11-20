package views

// D293: Devices says how each device is connected and whether anyone in
// between can read it, and the home lists every address that reaches it with
// whether it answers. Each fact is its own element (D291); the rows follow
// the card's row anatomy (D273): a title, one muted line, the state at the
// right edge, in one inset group under a small header.

import (
	"strings"

	"github.com/egoist/mygo/ui"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// viaLineKey is the muted line under how a device is connected.
func viaLineKey(v *protocol.DeviceVia) string {
	switch {
	case v.Kind == "local":
		return "reach.private.local"
	case v.Sealed:
		return "reach.private"
	case v.Kind == "lan":
		return "reach.open.plain"
	}
	return "reach.open.cloudflare"
}

// reachHeader is a group's small header, on the group's text edge.
func (a *App) reachHeader(c *ui.Context, text string) {
	t := a.T
	uiText(c, text).FontSize(t.XS).FontWeight(700).TextColor(t.InkSoft).Margin(t.S4, 0, 6, t.S3)
}

// reachRow is one row: a title, one muted line under it, and a word at the
// right edge (empty: none).
func (a *App) reachRow(c *ui.Context, key, title, line, word string, ink ui.Color, lineInk ui.Color) {
	t := a.T
	ui.Row(c.Key(key)).Gap(t.S3).AlignItems(ui.Center).Padding(t.S2, t.S3).MinHeight(52).Children(func() {
		ui.Column(c).Gap(2).Grow(1).MinWidth(0).Children(func() {
			uiText(c, title).FontSize(t.SM).FontWeight(700).TextColor(t.Ink)
			uiText(c, line).FontSize(t.XS).TextColor(lineInk).LineHeight(1.45)
		})
		if word != "" {
			uiText(c, word).FontSize(t.SM).FontWeight(700).TextColor(ink).SingleLine()
		}
	})
}

// howConnected is how a connected device reaches the home now (nothing for
// a home too old to say).
func (a *App) howConnected(c *ui.Context, key string, v *protocol.DeviceVia) {
	if v == nil {
		return
	}
	t := a.T
	lineInk := t.InkMuted
	if !v.Sealed {
		lineInk = t.InkSoft
	}
	ui.Column(c.Key("how:" + key)).Children(func() {
		a.reachHeader(c, a.L.T("reach.how"))
		ui.Column(c).Radius(t.RadiusSM).Background(t.Bg).Clip().Children(func() {
			a.reachRow(c, "how-row:"+key, a.L.T("reach.via."+v.Kind), a.L.T(viaLineKey(v)), "", t.InkMuted, lineInk)
		})
	})
}

// homeWays is the home's addresses, each with whether it answers.
func (a *App) homeWays(c *ui.Context, dv *protocol.DeviceView) {
	r := a.S.Reach
	if r == nil || len(r.Ways) == 0 {
		return
	}
	t := a.T
	here := ""
	if a.URL != "" {
		here = strings.TrimSuffix(strings.TrimSuffix(strings.Replace(strings.Replace(a.URL, "wss://", "https://", 1), "ws://", "http://", 1), "/ws"), "/")
	}
	tunnel := false
	// D398: folded at the card's foot; the summary is the way in use (or
	// the first one).
	summary := a.L.T("reach.kind." + r.Ways[0].Kind)
	for _, w := range r.Ways {
		if here != "" && strings.EqualFold(here, strings.TrimSuffix(w.URL, "/")) {
			summary = a.L.T("reach.kind." + w.Kind)
		}
	}
	a.sheetFold(c, "ways:"+dv.ID, a.L.T("reach.ways.short"), summary, false, func() {
		ui.Column(c).Radius(t.RadiusSM).Background(t.Bg).Clip().Children(func() {
			for i, w := range r.Ways {
				if i > 0 {
					ui.Box(c).Height(1).Background(t.LineSoft)
				}
				tunnel = tunnel || w.Kind == "tunnel"
				state := w.State
				if state == "" {
					state = "unknown"
				}
				word, ink := a.L.T("reach.state."+state), t.InkMuted
				switch {
				case here != "" && strings.EqualFold(here, strings.TrimSuffix(w.URL, "/")):
					word, ink = a.L.T("reach.state.here"), t.Done.Ink
				case state == "up":
					ink = t.Done.Ink
				case state == "down":
					ink = t.Failed.Ink
				}
				a.reachRow(c, "way:"+w.URL, a.L.T("reach.kind."+w.Kind), strings.TrimPrefix(strings.TrimPrefix(w.URL, "https://"), "http://"), word, ink, t.InkMuted)
			}
		})
		if tunnel {
			uiText(c, a.L.T("reach.note.tunnel")).FontSize(t.XS).TextColor(t.InkMuted).LineHeight(1.5).Margin(6, t.S3, 0, t.S3)
		}
	})
}
