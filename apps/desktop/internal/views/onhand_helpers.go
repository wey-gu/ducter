package views

import (
	"strings"
	"unicode/utf8"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// helperIndent is how far a helper's work is set in under its head: the
// mark's width and the gap after it, so the rows' marks stand under the
// head's words (D507).
const helperIndent = float32(46)

// helperWaits is how many of a helper's pieces of work wait for the person:
// a question, a failure, or a task that stopped (D507).
func (a *App) helperWaits(h protocol.HelperWork) int {
	n := 0
	for _, x := range h.Items {
		task := a.S.Task(x.TaskID)
		if x.At == "you" || x.At == "ready" || (task != nil && a.stoppedWait(task)) { // D508: a PR ready to merge waits for the person
			n++
		}
	}
	return n
}

// helperSheet is one helper on On hand (D507): a standing teammate that
// takes one kind of work, as its own clay sheet. Its head (its first letter
// on the sunken pebble, as in Settings: research/220 kept the literal mark;
// its name; how it reads at a glance: nothing handed over yet, n on hand,
// n waiting for you; what it takes; this week's count on the time edge)
// opens its row in Settings › Agent 通信. Under it, set in by the mark's
// width, the work it keeps: each task's own row, and a finished one while
// its PR is still open, until the merge. The sheet takes the needs-you
// ledge when something on it waits for the person. Read from the home's
// one model (OnHand.Helpers), as the web's HelperSheet.
func (a *App) helperSheet(c *ui.Context, h protocol.HelperWork) {
	t := a.T
	w := a.oh.listW
	if w <= 0 {
		w = onHandMeasure
	}
	you := a.helperWaits(h)
	ledge := t.Line
	if you > 0 {
		ledge = t.NeedsYou.Ledge
	}
	ui.Column(c.Key("helper:"+h.ID)).Width(w).Radius(16).Background(t.Surface).Clip().
		Shadow(0, 2, 0, 0, ledge).Shadow(0, 6, 14, -10, t.Ink.Alpha(0.16)).Margin(2, 0, 6, 0).Children(func() {
		prev, prevIn, prevActs, prevNeeds := a.oh.rowFirst, a.oh.inHelper, a.oh.actsCol, a.oh.needsSheet
		a.oh.needsSheet = you > 0 // D524: its rows' hover warms within the sheet's ledge
		defer func() { a.oh.needsSheet = prevNeeds }()
		a.helperHead(c, h, you, w)
		a.oh.inHelper = true
		// D508: a PR ready to merge offers its merge: the sheet keeps the column for it.
		a.oh.actsCol = false
		for _, x := range h.Items {
			if x.At == "ready" {
				a.oh.actsCol = true
			}
		}
		defer func() { a.oh.actsCol = prevActs }()
		defer func() { a.oh.rowFirst, a.oh.inHelper = prev, prevIn }()
		for _, x := range h.Items {
			task := a.S.Task(x.TaskID)
			if task == nil {
				continue // not held by this window yet: the home's model still counts it
			}
			a.oh.rowFirst = false
			ui.Box(c.Key("in:"+x.TaskID)).Width(w).Padding(0, 0, 0, helperIndent).Children(func() {
				a.taskCard(c.Key(x.TaskID), task, w-helperIndent)
			})
		}
	})
}

// helperHead is the helper's own row at the head of its sheet (D507).
func (a *App) helperHead(c *ui.Context, h protocol.HelperWork, you int, w float32) {
	t := a.T
	padY := float32(14)
	if a.compact() {
		padY = 10
	}
	glance := a.L.T("helper.idle")
	ink := t.InkSoft
	switch {
	case h.Mem != "ready" && len(h.Items) == 0:
		glance = a.L.T("peers.helper." + h.Mem)
	case you > 0:
		glance, ink = a.L.T("helper.you", you), t.NeedsYou.Ink
	case len(h.Items) > 0:
		glance = a.L.T("peers.helper.open", len(h.Items))
	}
	row := ui.Row(c.Key("head")).Width(w).Gap(14).Padding(padY, 12, padY, 16).MinHeight(64).AlignItems(ui.Center).
		Cursor(ui.CursorPointer).Role(ui.RoleLink).Label(h.Name).Focusable().Tooltip(a.L.T("helper.see", h.Name))
	ground := groundNeutral()
	if a.oh.needsSheet {
		ground = groundLedge(&t.NeedsYou)
	}
	a.rowHover(c, row, ground, false) // D524
	row.Children(func() {
		size := float32(32)
		if a.compact() {
			size = 28
		}
		r, _ := utf8.DecodeRuneInString(h.Name)
		ui.Row(c.Key("mark")).Size(size, size).Radius(size / 2).Shrink(0).Background(t.SurfaceSunken).
			Justify(ui.Center).AlignItems(ui.Center).AccessHidden(true).Children(func() {
			uiText(c, strings.ToUpper(string(r))).FontSize(t.XS).FontWeight(800).TextColor(t.InkSoft).LineHeight(1)
		})
		ui.Column(c.Key("tx")).Gap(3).Grow(1).Shrink(1).MinWidth(0).Children(func() {
			uiText(c.Key("name"), h.Name).FontSize(t.MD).FontWeight(700).TextColor(t.Ink).MaxLines(2)
			ui.Row(c.Key("glance")).Gap(t.S3).Wrap().Children(func() {
				uiText(c.Key("g"), glance).FontSize(t.SM).LineHeight(1.45).TextColor(ink)
				if you > 0 && len(h.Items) > you {
					uiText(c.Key("n"), a.L.T("peers.helper.open", len(h.Items))).FontSize(t.SM).LineHeight(1.45).TextColor(t.InkMuted)
				}
			})
			if h.Mem == "ready" && len(h.Items) == 0 {
				uiText(c.Key("how"), a.L.T("peers.helper.ready")).FontSize(t.SM).LineHeight(1.45).TextColor(t.InkMuted)
			}
			if h.About != "" {
				uiText(c.Key("about"), keepWords(autospace(a.L.T("peers.helper.takes", h.About)))).FontSize(t.SM).LineHeight(1.45).TextColor(t.InkMuted).MaxLines(2)
			}
		})
		whenW := float32(112)
		if w < 700 {
			whenW = 92
		}
		ui.Column(c.Key("when")).Width(whenW).AlignItems(ui.End).Shrink(0).Children(func() {
			if h.Week > 0 {
				uiText(c.Key("week"), a.L.T("peers.helper.week", h.Week)).FontSize(t.SM).TextColor(t.InkMuted).SingleLine()
			}
		})
	})
	if row.Clicked() {
		a.Route = RouteSettings
		a.openTab(TabPeers)
	}
}
