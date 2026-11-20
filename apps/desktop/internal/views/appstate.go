package views

import (
	"fmt"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D418: what an app is doing, said the same on its tile and in its window
// as the web says it (apps.tsx StateLine, stateAction): being changed now,
// its page broke, the task that keeps it current failed, is paused, is
// running or will update it next, the old look; else when it last changed.
// When the state asks for something, one button does it.

// appStateWords is the state in the partner's words, and whether it is a
// trouble (said in the failed ink).
func (a *App) appStateWords(m *protocol.AppMeta) (string, bool) {
	var k *protocol.AppKept
	if m.Live != nil {
		k = m.Live.Kept
	}
	switch m.StateOf() {
	case "changing":
		return a.L.T("app.live.changing", a.appsPartner()), false
	case "broke":
		return a.L.T("app.live.broke"), true
	case "kept_failed":
		return a.L.T("app.kept.failed", k.Title), true
	case "kept_paused":
		return a.L.T("app.kept.paused", k.Title), false
	case "kept_running":
		return a.L.T("app.kept.running", k.Title), false
	case "old":
		return a.L.T("app.live.old"), false
	case "kept_next":
		if at, err := time.Parse(time.RFC3339Nano, k.Next); err == nil && k.Next != "" {
			return a.L.T("app.kept.next", k.Title, a.when(at)), false
		}
		return a.L.T("app.kept", k.Title), false
	}
	// A home from before D418 sends no state: a task still keeps it.
	if m.Task != nil {
		return a.L.T("app.kept", m.Task.Title), false
	}
	return "", false
}

// appStateAction is the one thing to do about the state (its label and
// what it sends), or "".
func (a *App) appStateAction(m *protocol.AppMeta) (string, func()) {
	say := func(text string) func() {
		return func() {
			a.nextClient++
			a.send(protocol.Send{T: "send", Text: text, ClientID: fmt.Sprintf("c%d-%dapp", a.Now().UnixMilli(), a.nextClient), App: m.ID})
		}
	}
	act := func(action string) func() {
		k := m.Live.Kept
		return func() { a.send(protocol.OngoingAct{T: "ongoing_action", Kind: k.Of.Kind, ID: k.Of.ID, Action: action}) }
	}
	switch m.StateOf() {
	case "broke":
		return a.L.T("app.live.fix", a.appsPartner()), say(a.L.T("app.live.fix.say", m.Name, m.Live.Broke.Text))
	case "old":
		return a.L.T("app.live.renew"), say(a.L.T("app.live.renew.say", m.Name))
	case "kept_failed":
		return a.L.T("app.kept.retry"), act("run_now")
	case "kept_paused":
		return a.L.T("app.kept.resume"), act("resume")
	}
	return "", nil
}

// appStateLine draws the state: a calm moving track while it is being
// changed, the words, and when it last changed where that helps. Each fact
// its own element (D291).
func (a *App) appStateLine(c *ui.Context, key string, m *protocol.AppMeta) {
	t := a.T
	s := m.StateOf()
	words, bad := a.appStateWords(m)
	ui.Row(c.Key(key)).Gap(t.S2).Wrap().AlignItems(ui.Center).Children(func() {
		if s == "changing" {
			a.appTrack(c)
		}
		if words != "" {
			col := t.InkSoft
			if bad {
				col = t.Failed.Ink
			}
			uiText(c.Key("words"), keepWords(autospace(words))).FontSize(t.XS).FontWeight(700).TextColor(col).MaxLines(3)
		}
		if s == "plain" || s == "kept_next" || s == "old" {
			at := m.Updated
			if m.Live != nil && m.Live.Kept != nil && m.Live.Kept.Last != "" {
				at = m.Live.Kept.Last
			}
			if when := a.agoLong(at); when != "" {
				uiText(c.Key("when"), keepWords(autospace(a.L.T("app.updated", when)))).FontSize(t.XS).TextColor(t.InkMuted)
			}
		}
	})
}

// appTrack is a short track with the accent sliding along it (never a blink).
func (a *App) appTrack(c *ui.Context) {
	t := a.T
	ui.Box(c.Key("track")).Size(28, 6).Radius(3).Shrink(0).Background(t.SurfaceSunken).AccessHidden(true).Draw(func(p *ui.Painter, r ui.Rect) {
		ph := float32(time.Now().UnixMilli()%1800) / 1800
		w := r.W * 0.4
		x := r.X - w + ph*(r.W+w)
		lo, hi := max(x, r.X), min(x+w, r.X+r.W)
		if hi > lo {
			p.Fill(ui.Rect{X: lo, Y: r.Y, W: hi - lo, H: r.H}, t.Accent, 3)
		}
	})
	c.Invalidate()
}
