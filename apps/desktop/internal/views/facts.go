package views

import (
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// facts lays out a group of separate facts (D291): each its own small
// text, spaced by S3 and free to wrap, never one string joined by "·".
// Empty facts drop out; nothing is drawn when none is left. A fact with a
// role of its own (a state word with its dot, a time) is drawn by the
// caller beside it, not passed here.
func (a *App) facts(c *ui.Context, size float32, col ui.Color, parts ...string) {
	t := a.T
	n := 0
	for _, p := range parts {
		if strings.TrimSpace(p) != "" {
			n++
		}
	}
	if n == 0 {
		return
	}
	ui.Row(c).Gap(t.S3).Wrap().AlignItems(ui.Center).MinWidth(0).Children(func() {
		for _, p := range parts {
			if strings.TrimSpace(p) != "" {
				ui.Text(c, p).FontSize(size).TextColor(col).MinWidth(0)
			}
		}
	})
}

// shownDeviceName is a device's name as the person sees it (D291):
// "iPad · Ducter" from before shows as "iPad" (store.ShownDeviceName).
func shownDeviceName(name string) string { return store.ShownDeviceName(name) }

// spoken is an accessible name made of several facts, said the way a
// person reads a list aloud (D291): "，" in Chinese, ", " in English.
// Only for a control's Label; on screen each fact is its own element.
func spoken(l *i18n.Strings, parts ...string) string {
	keep := parts[:0:0]
	for _, p := range parts {
		if strings.TrimSpace(p) != "" {
			keep = append(keep, p)
		}
	}
	if l == nil {
		return strings.Join(keep, ", ")
	}
	return strings.Join(keep, l.T("spoken.sep"))
}
