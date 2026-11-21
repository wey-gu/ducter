package views

import (
	"slices"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D451: 第一次 / The first time. One line under a thing the person meets for
// the first time and can't read from the thing itself, in the partner's own
// words, led by its small clay face. Never a tour, a sheet, a pill or a
// button. The first such thing drawn claims the line for this run of the
// app (it never vanishes under the reader's eyes, never shows twice); the
// moment it is drawn it is met on the home (Settings' Met), so no other
// device shows it. A home too old to keep Met (nil) shows none. The web's
// first-meet.tsx is the same.

// firstMeets is which thing carries each line, and the lines sent as met.
type firstMeets struct {
	owner map[string]string
	sent  map[string]bool
}

// firstMeetHere says whether the thing at carries the line name: the first
// one drawn while the moment isn't met.
func (a *App) firstMeetHere(name, at string) bool {
	m := &a.meets
	if o, ok := m.owner[name]; ok {
		return o == at
	}
	if m.sent[name] || a.S.Settings == nil || a.S.Settings.Met == nil || slices.Contains(a.S.Settings.Met, name) {
		return false
	}
	if m.owner == nil {
		m.owner = map[string]string{}
	}
	m.owner[name] = at
	return true
}

// meet marks the line met on the home, once per run.
func (a *App) meet(name string) {
	m := &a.meets
	if m.sent[name] {
		return
	}
	if m.sent == nil {
		m.sent = map[string]bool{}
	}
	m.sent[name] = true
	a.send(protocol.SettingsSet{T: "settings_set", Patch: protocol.SettingsPatch{Met: []string{name}}})
}

// firstMeetLine draws the line under the thing at, when it carries it: the
// partner's face at 18 and its words in the soft ink, on the thing's text
// edge (D441: a line, never a box).
func (a *App) firstMeetLine(c *ui.Context, name, at string) {
	if !a.firstMeetHere(name, at) {
		return
	}
	a.meet(name)
	t := a.T
	ui.Row(c.Key("first:"+name)).Gap(t.S2).AlignItems(ui.Start).Margin(6, 0, 6, 0).MinWidth(0).Role(ui.RoleStatus).Children(func() {
		ui.Box(c.Key("face")).Shrink(0).AccessHidden(true).Children(func() { a.partnerFace(c, "first:"+name, theme.Idle, 18) })
		uiText(c, autospace(a.L.T("first."+name))).FontSize(t.SM).FontWeight(500).TextColor(t.InkSoft).LineHeight(a.leading(1.45)).Grow(1).Shrink(1).MinWidth(0)
	})
}
