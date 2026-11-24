package views

// Older messages (D509). The window opens on the conversation's newest
// stretch; as the reader nears its top, the page before the oldest event
// held is asked for, one at a time, again while they stay near it, until
// the home says none remain. The list is keyed by each row's FirstSeq, so
// rows landing above keep the reader on the line they were reading. While
// a page is on its way, one quiet line floats over the top of the pane; it
// takes no room, so nothing moves when it comes or goes.

import (
	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// olderNear is how many rows from the top the next older page is asked, so
// it lands before the reader gets there.
const olderNear = 12

// moreOlder asks for the page before the oldest event held when the rows
// in view are near the top (a short conversation is near it from the start).
func (a *App) moreOlder(n int) {
	if !a.S.MoreOlder() || a.Status != client.Connected {
		return
	}
	first, last := a.list.Visible()
	if last < first {
		return // not laid out yet (or nothing shown): where the reader is isn't known
	}
	if n > 0 && first > olderNear {
		return
	}
	before := a.S.Older.From
	a.S.OlderAsked(before)
	a.send(protocol.ChannelHistoryReq{T: "channel_history", BeforeSeq: before, Limit: store.OlderPage})
}

// olderWait is the quiet line over the top while a page is on its way.
func (a *App) olderWait(c *ui.Context) {
	if !a.S.LoadingOlder() {
		return
	}
	t := a.T
	ui.Row(c.Key("olderwait")).Absolute().Left(0).Right(0).Top(t.S2).Justify(ui.Center).Children(func() {
		p := ui.Row(c.Key("olderwait:pill")).Height(t.ChipSM).AlignItems(ui.Center).Padding(0, t.S3, 0, t.S3).
			Radius(t.ChipSM/2).Background(t.Surface).Shadow(0, 1, 3, 0, t.Line).Role(ui.RoleStatus).Label(a.L.T("conv.older"))
		if !c.Preferences().ReduceMotion {
			in := ui.Local(p, "in", func() bool { return false })
			pose := ui.Pose{}
			if !*in {
				pose, *in = ui.Pose{Fade: 1}, true
				c.Invalidate()
			}
			p.AnimatePose(pose, ui.Smooth)
		}
		p.Children(func() {
			uiText(c, a.L.T("conv.older")).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
		})
	})
}

// olderHead reports whether row i, entry e, is a head row: the first row
// while older messages can still come, or one that was. It keeps its time
// line and a gap above it after a page lands over it, as it had at the top,
// so the line the reader is on never moves.
func (a *App) olderHead(i int, e *store.Entry) bool {
	if a.headRows[e.FirstSeq] {
		return true
	}
	if i != 0 || a.S.Older.Done || a.S.Older.From <= 1 {
		return false
	}
	if a.headRows == nil {
		a.headRows = map[int64]bool{}
	}
	a.headRows[e.FirstSeq] = true
	return true
}
