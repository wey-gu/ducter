package views

import (
	"regexp"
	"strconv"
	"strings"

	"github.com/egoist/mygo/ui"
)

var (
	cpHeading = regexp.MustCompile(`^#{1,6}\s+`)
	cpBullet  = regexp.MustCompile(`^(\s*)[*•]\s+`)
	cpLink    = regexp.MustCompile(`\[([^\]\n]+)\]\((https?://[^\s)]+)\)`)
	cpBold    = regexp.MustCompile(`\*\*([^*\n]+)\*\*`)
	cpItalic  = regexp.MustCompile(`(^|[^*\w])\*([^*\n]+)\*([^*\w]|$)`)
	cpFence   = regexp.MustCompile("^\\s*```")
	cpBlanks  = regexp.MustCompile(`\n{3,}`)
)

// copyText is a message as it goes to the clipboard (D254): the words as
// written, without the marks that only style them (bold, italic,
// headings), a link as "words (address)", code and its fences kept. The
// web's is the same (apps/web/src/markdown.ts copyText).
func copyText(src string) string {
	lines := strings.Split(strings.ReplaceAll(src, "\r\n", "\n"), "\n")
	fenced := false
	for i, l := range lines {
		if cpFence.MatchString(l) {
			fenced = !fenced
			continue
		}
		if fenced {
			continue
		}
		l = cpHeading.ReplaceAllString(l, "")
		l = cpBullet.ReplaceAllString(l, "$1- ")
		l = cpLink.ReplaceAllStringFunc(l, func(m string) string {
			p := cpLink.FindStringSubmatch(m)
			if p[1] == p[2] {
				return p[2]
			}
			return p[1] + " (" + p[2] + ")"
		})
		l = cpBold.ReplaceAllString(l, "$1")
		l = cpItalic.ReplaceAllString(cpItalic.ReplaceAllString(l, "$1$2$3"), "$1$2$3")
		lines[i] = l
	}
	return strings.TrimSpace(cpBlanks.ReplaceAllString(strings.Join(lines, "\n"), "\n\n"))
}

// D254: the conversation keeps your place (design/conversation.md
// "Keeping your place"). MyGo's List follows its end while it shows it
// (FollowEnd: new rows glide up, growth holds the end); scrolled up, it
// stays, and a clay pebble over the composer says 3 条新消息 / 3 new
// messages, or is the round Jump to latest more than a screen up. A
// click lands on the first new message (the end when they fit); ⌘↓ goes
// to the newest. Opening lands on 新消息 / New messages, a quiet line
// before the first of the partner's messages not yet read, and what
// came is read only once it is seen (the end shown). The web keeps the
// same rules (apps/web/src/follow.ts).

// followRow is a row as these rules see it: its first seq, and whether the
// person wrote it.
type followRow struct {
	seq  int64
	mine bool
}

// newSince counts the partner's rows after mark (the last row the reader
// had at the end), and names the first.
func newSince(rows []followRow, mark int64) (count int, first int64) {
	for _, r := range rows {
		if r.mine || r.seq <= mark {
			continue
		}
		count++
		if first == 0 {
			first = r.seq
		}
	}
	return count, first
}

// dividerAt is the row the New messages line stands before when the
// conversation opens: the first of the partner's rows not read, none when
// the person wrote after it (they were there).
func dividerAt(rows []followRow, readUpTo int64) int64 {
	var at int64
	for _, r := range rows {
		switch {
		case r.mine:
			at = 0
		case r.seq > readUpTo && at == 0:
			at = r.seq
		}
	}
	return at
}

// countWords is the count as the pebble says it: 1 … 99, then 99+.
func countWords(n int) string {
	if n > 99 {
		return "99+"
	}
	return strconv.Itoa(n)
}

// follow is the conversation's place, kept on App.
type follow struct {
	opened  bool
	divider int64 // the row New messages stands before; 0 for none
	land    bool  // the opening landing is still to do
	mark    int64
	mine    int
	fresh   int
	first   int64
	last    int64
}

func (a *App) followRows(rows []row) []followRow {
	out := make([]followRow, 0, len(rows))
	for _, r := range rows {
		if r.entry == nil {
			continue
		}
		out = append(out, followRow{seq: r.entry.FirstSeq, mine: r.entry.User != nil})
	}
	return out
}

// followBefore reads the place before the list is built: the divider once
// the replay is in, a send going to the end, what is new since the
// reader left the end.
func (a *App) followBefore(rows []row) {
	f := &a.fl
	fr := a.followRows(rows)
	mine := len(a.pending)
	for _, r := range fr {
		if r.mine {
			mine++
		}
	}
	if !f.opened && a.S.Welcomed && len(fr) > 0 {
		f.opened = true
		f.divider = dividerAt(fr, a.S.ReadUpTo)
		f.land = f.divider != 0
		f.mine = mine
	}
	if f.opened && mine > f.mine {
		f.divider = 0 // sent: the line has done its work, and the list goes to its end (Send)
	}
	f.mine = mine
	if len(fr) > 0 {
		f.last = fr[len(fr)-1].seq
	}
	if a.list.AtEnd() || f.mark == 0 {
		f.mark = f.last
	}
	f.fresh, f.first = 0, 0
	if !a.list.AtEnd() {
		f.fresh, f.first = newSince(fr, f.mark)
	}
	if f.divider != 0 && a.livingAway[f.divider] {
		f.divider = 0 // "While you were away" already says it
	}
}

// rowOf is the index of the row whose entry starts at seq, or -1.
func rowOf(rows []row, seq int64) int {
	for i, r := range rows {
		if r.entry != nil && r.entry.FirstSeq == seq {
			return i
		}
	}
	return -1
}

// landOpening scrolls to the New messages line once, when the conversation
// opens with one (the list clamps to its end when what is new fits).
func (a *App) landOpening(rows []row) {
	f := &a.fl
	if !f.land {
		return
	}
	f.land = false
	if i := rowOf(rows, f.divider); i >= 0 {
		a.list.ScrollTo(i, ui.Start)
	}
}

// ToLatest goes to the newest message (⌘↓, and the pebble without news).
func (a *App) ToLatest() {
	a.fl.mark = a.fl.last
	a.list.ScrollToEnd()
}

// newDivider is 新消息 / New messages: a quiet centred line in the accent,
// a hairline either side.
func (a *App) newDivider(c *ui.Context) {
	t := a.T
	label := a.L.T("conv.divider")
	ui.Row(c.Key("newdivider")).AlignItems(ui.Center).Gap(t.S2+2).Padding(t.S3, 0, t.S2, 0).Role(ui.RoleSeparator).Label(label).Children(func() {
		ui.Box(c).Grow(1).Height(1).Background(t.Accent.Alpha(0.35))
		ui.Text(c, label).FontSize(t.XS).FontWeight(700).TextColor(t.Accent).SingleLine().Unselectable()
		ui.Box(c).Grow(1).Height(1).Background(t.Accent.Alpha(0.35))
	})
}

// wayBack is the pebble over the composer: round with the drawn arrow when
// the newest is out of view, grown sideways to say how many when news came
// while the reader was up. It settles in with the bouncy spring (still
// where the Mac asks for less motion).
func (a *App) wayBack(c *ui.Context, rows []row) {
	t := a.T
	f := &a.fl
	if len(rows) == 0 || a.list.AtEnd() {
		return
	}
	_, last := a.list.Visible()
	if f.fresh == 0 && last >= len(rows)-1 {
		return
	}
	label := a.L.T("jump.latest")
	words := ""
	if f.fresh > 0 {
		label = a.L.T("conv.new.label", countWords(f.fresh))
		words = a.L.T("conv.new.n", countWords(f.fresh))
		if f.fresh == 1 {
			words = a.L.T("conv.new.one")
		}
	}
	ui.Row(c.Key("wayback")).Absolute().Left(0).Right(0).Bottom(t.S3).Justify(ui.Center).Children(func() {
		key := "wayback:plain"
		if f.fresh > 0 {
			key = "wayback:fresh"
		}
		b := ui.Row(c.Key(key)).Height(t.ControlMD).MinWidth(t.ControlMD).AlignItems(ui.Center).Justify(ui.Center).Gap(t.S1+2).
			Radius(t.ControlMD/2).Background(t.Surface).
			Shadow(0, 3, 0, 0, t.Line).Shadow(0, t.Raised.Y, t.Raised.Blur, 0, t.Raised.Color).
			Cursor(ui.CursorPointer).Role(ui.RoleButton).Focusable().Label(label).Tooltip(label)
		if words != "" {
			b.Padding(0, t.S3+2, 0, t.S3)
		}
		if !c.Preferences().ReduceMotion {
			in := ui.Local(b, "in", func() bool { return false })
			p := ui.Pose{}
			if !*in {
				p, *in = ui.Pose{Y: 12, Scale: 0.86, Fade: 1}, true
				c.Invalidate()
			}
			b.AnimatePose(p, t.Bouncy)
		}
		b.Children(func() {
			ui.Box(c).Size(16, 16).Draw(drawDown(t.Accent))
			if words != "" {
				ui.Text(c.Key("n:"+words), words).FontSize(t.SM).FontWeight(700).TextColor(t.Ink).SingleLine().Unselectable()
			}
		})
		if b.Clicked() {
			if f.fresh > 0 {
				if i := rowOf(rows, f.first); i >= 0 {
					f.mark = f.last
					a.list.ScrollTo(i, ui.Start)
					return
				}
			}
			a.ToLatest()
		}
	})
}
