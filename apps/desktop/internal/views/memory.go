package views

import (
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// Settings › 记忆 / Memory and › 连上的 AI agent / Connected AI agents (D257),
// each its own tab. Memory is what the partner remembers about the person,
// first, in their words: the partner hugging its notebook and one sentence,
// then what it noted grouped by when (each one forgettable), then Nowledge
// Mem itself (where it is, its version, a newer one, putting it in, signing
// in). The rules are the web's (apps/web/src/mem-view.ts).

// memMin is the first nmem with `bridge connections` (D225).
const memMin = "0.10.118"

const memSite = "https://mem.nowledge.co"

// memPhase is where the partner's memory stands: off, missing, install,
// installing, sign_in, signing_in, or on (Mem answers).
func memPhase(memoryOn bool, mem *protocol.MemView, b *protocol.BridgeView) string {
	if !memoryOn {
		return "off"
	}
	if b == nil {
		if mem != nil && mem.State == "connected" {
			return "on"
		}
		return "missing"
	}
	switch b.State {
	case "install_mem":
		return "install"
	case "installing", "sign_in", "signing_in":
		return b.State
	}
	// Every other state has a signed-in nmem on the home (an older one still remembers).
	return "on"
}

// memUpd is the one thing about Mem's own version worth saying: updating,
// done, needed (Bridge needs it), move, newer (Ducter can run it), app (only
// the Nowledge Mem app can).
type memUpd struct {
	Kind              string
	Move, CanRun, App bool
	Version, Newer    string
	Done              string
	Detail            string
	Kept              bool
}

func memUpdate(b *protocol.BridgeView) *memUpd {
	if b == nil {
		return nil
	}
	newer := ""
	if b.Newer != nil {
		newer = *b.Newer
	}
	switch {
	case b.State == "updating":
		return &memUpd{Kind: "updating", Move: b.Upkeep != nil && b.Upkeep.Kind == "move"}
	case b.Done != "" && b.Done != "installed":
		return &memUpd{Kind: "done", Done: b.Done}
	case b.State == "update_mem":
		return &memUpd{Kind: "needed", CanRun: b.CanRun, Move: b.Upkeep != nil && b.Upkeep.Kind == "move", App: b.Need == "app" || b.Version == "", Version: b.Version, Detail: b.Detail, Kept: b.Kept}
	case b.Upkeep != nil && b.Upkeep.Kind == "move":
		return &memUpd{Kind: "move", Detail: b.Upkeep.Detail, Kept: b.Upkeep.Kept}
	case b.Upkeep != nil && b.Upkeep.Kind == "update":
		return &memUpd{Kind: "newer", Newer: newer, Version: b.Version, Detail: b.Upkeep.Detail, Kept: b.Upkeep.Kept}
	case b.Newer != nil:
		return &memUpd{Kind: "app", Newer: newer, Version: b.Version}
	}
	return nil
}

// memBadge is the Memory tab's line in the rail: a key, or "".
func memBadge(u *memUpd) string {
	switch {
	case u == nil:
		return ""
	case u.Kind == "needed":
		return "mem.badge.needed"
	case u.Kind == "newer" || u.Kind == "app":
		return "mem.badge.newer"
	}
	return ""
}

// peersShown: 连上的 AI agent shows once it means something (J6): another agent
// wrote, the person trusted or muted one, or Mem is on the home and signed in.
func peersShown(p *protocol.Peers, b *protocol.BridgeView, seen bool) bool {
	if p == nil {
		return false
	}
	if seen || len(p.Trusted) > 0 || len(p.Muted) > 0 {
		return true
	}
	if b == nil {
		return false
	}
	switch b.State {
	case "install_mem", "installing", "sign_in", "signing_in":
		return false
	}
	return true
}

// notedGroup is the noted lines of one "when": today, week (the last 7
// days), earlier.
type notedGroup struct {
	When  string
	Items []protocol.Noted
}

func groupNoted(noted []protocol.Noted, now time.Time) []notedGroup {
	y, m, d := now.Date()
	day0 := time.Date(y, m, d, 0, 0, 0, 0, now.Location())
	week0 := day0.AddDate(0, 0, -6)
	var out []notedGroup
	for _, n := range noted {
		when := "earlier"
		if at, err := time.Parse(time.RFC3339, n.At); err == nil {
			switch {
			case !at.Before(day0):
				when = "today"
			case !at.Before(week0):
				when = "week"
			}
		}
		if len(out) > 0 && out[len(out)-1].When == when {
			out[len(out)-1].Items = append(out[len(out)-1].Items, n)
		} else {
			out = append(out, notedGroup{When: when, Items: []protocol.Noted{n}})
		}
	}
	return out
}

// peersSeen: another agent has written to the partner (J6).
func (a *App) peersSeen() bool {
	for _, e := range a.S.Channel {
		if e.Peer != nil {
			return true
		}
	}
	return false
}

// visibleTabs is the rail: 连上的 AI agent only once it means something.
func (a *App) visibleTabs() []string {
	var p *protocol.Peers
	if a.S.Settings != nil {
		p = a.S.Settings.Peers
	}
	if peersShown(p, a.S.Bridge, a.peersSeen()) {
		return settingsTabs
	}
	out := make([]string, 0, len(settingsTabs))
	for _, t := range settingsTabs {
		if t != TabPeers {
			out = append(out, t)
		}
	}
	return out
}

// memHome is the computer Mem is about: the home.
func (a *App) memHome() string {
	if b := a.S.Bridge; b != nil && b.Home != "" {
		return b.Home
	}
	return a.homeName()
}

// drawNotebook is Memory's mark: the partner's own blue notebook, the one
// it always carries, in the same clay (D257): the cover on a darker ledge,
// the pages' edge, a highlight along the top, the strap and its clasp.
func (a *App) drawNotebook() func(p *ui.Painter, r ui.Rect) {
	nb := a.T.Notebook
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 40
		x := func(v float32) float32 { return r.X + v*s }
		y := func(v float32) float32 { return r.Y + v*s }
		p.Fill(ui.Rect{X: x(8.5), Y: y(7.5), W: 23 * s, H: 28 * s}, nb.Ledge, 5.5*s)
		p.Fill(ui.Rect{X: x(8.5), Y: y(5), W: 23 * s, H: 28 * s}, nb.Cover, 5.5*s)
		p.Fill(ui.Rect{X: x(27), Y: y(7.5), W: 3.2 * s, H: 23 * s}, nb.Pages, 1.6*s)
		var h ui.Path
		h.MoveTo(x(12), y(8.6))
		h.QuadTo(x(18), y(7.4), x(24.4), y(8.1))
		p.StrokePath(&h, 1.7*s, nb.Shine)
		p.Fill(ui.Rect{X: x(21.5), Y: y(16.2), W: 11 * s, H: 6.2 * s}, nb.Strap, 3.1*s)
		var k ui.Path
		k.Circle(x(24.6), y(19.3), 1.75*s)
		p.FillPath(&k, nb.Clasp)
	}
}

// ---------- 连上的 AI agent / Connected AI agents ----------

// peersPanel is the persona's connection with the person's other agents
// (D205) and who may reach it (D170). Mem's own steps live in Memory.
func (a *App) peersPanel(c *ui.Context) {
	a.panelHead(c, TabPeers, a.L.T("settings.lede.peers", a.personaName()))
	if a.loadingLine(c) {
		return
	}
	a.peersCard(c, a.S.Settings)
}
