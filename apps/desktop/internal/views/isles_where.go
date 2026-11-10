package views

import (
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D157 (design/where.md §9): where adds three moments to D81's parcel. No
// new thing is drawn.
//   - Lands: a task starts on a computer: its parcel crosses that bridge
//     (0.9 s, ease-out) and lands with the equip's squash; its short title
//     rides on a tag for 1.2 s.
//   - Waits: its computer sleeps: the parcel stays at the home end of that
//     bridge, still, tagged 在等. It hasn't gone there yet.
//   - Moves: back across the old bridge to home (0.7 s), a rest beside
//     Ducter (150 ms), out across the new one (0.7 s): never island to
//     island (there are no bridges between islands; the work goes home and
//     out again).
// Reduced motion: the parcel appears where it is, the tag says it.

const (
	landFor  = 900 * time.Millisecond
	squashOf = 120 * time.Millisecond
	tagFor   = 1200 * time.Millisecond
	legFor   = 700 * time.Millisecond
	restFor  = 150 * time.Millisecond
)

// parcelMoment is one task's parcel on a bridge now: at 0 (home's end) to
// 1 (the island's), squashed on landing (sx, sy), with its tag.
type parcelMoment struct {
	taskID string
	at     float32
	sx, sy float32
	tag    string
}

// onDevice: a place's device names this computer.
func onDevice(d string, dv *protocol.DeviceView) bool {
	if d == "" || d == "local" {
		return dv.Home
	}
	return d == dv.ID || strings.EqualFold(d, dv.Name)
}

// parcelMoments are the parcels landing on, waiting at, or moving across
// the bridge to one computer, now.
func (a *App) parcelMoments(dv *protocol.DeviceView, now time.Time, still bool) []parcelMoment {
	var out []parcelMoment
	for _, task := range a.S.Tasks {
		p := task.Place()
		at := store.ParseTime(task.PlacedAt)
		e := now.Sub(at)
		// Waits: its computer is asleep or out of reach, and it hasn't started there.
		if r := task.Reason(); strings.HasPrefix(r, "device:asleep:") || strings.HasPrefix(r, "device:unreachable:") {
			name := r[strings.LastIndex(r, ":")+1:]
			if strings.EqualFold(name, dv.Name) && task.Attention() == protocol.Blocked {
				out = append(out, parcelMoment{taskID: task.ID, at: 0, sx: 1, sy: 1, tag: a.L.T("isles.tag.waits")})
			}
			continue
		}
		if at.IsZero() || e < 0 {
			continue
		}
		short := shortTitle(task.Title())
		switch {
		case task.MovedFrom != "" && onDevice(task.MovedFrom, dv) && !dv.Home:
			// Moves, leg one: back across this bridge to home.
			if !still && e < legFor {
				out = append(out, parcelMoment{taskID: task.ID, at: 1 - ui.EaseOut(float32(e)/float32(legFor)), sx: 1, sy: 1})
			}
		case task.MovedFrom != "" && onDevice(p.Device, dv) && !dv.Home:
			// Moves, leg two: out across this bridge, after the rest beside Ducter.
			tag := a.L.T("isles.tag.moved", dv.Name)
			start := legFor + restFor
			switch {
			case still && e < tagFor:
				out = append(out, parcelMoment{taskID: task.ID, at: 1, sx: 1, sy: 1, tag: tag})
			case !still && e >= start && e < start+legFor:
				out = append(out, parcelMoment{taskID: task.ID, at: ui.EaseOut(float32(e-start) / float32(legFor)), sx: 1, sy: 1, tag: tag})
			case !still && e >= start+legFor && e < start+legFor+tagFor:
				out = append(out, landed(task.ID, e-start-legFor, tag))
			}
		case task.MovedFrom == "" && onDevice(p.Device, dv) && !dv.Home:
			// Lands.
			switch {
			case still && e < tagFor:
				out = append(out, parcelMoment{taskID: task.ID, at: 1, sx: 1, sy: 1, tag: short})
			case !still && e < landFor:
				out = append(out, parcelMoment{taskID: task.ID, at: ui.EaseOut(float32(e) / float32(landFor)), sx: 1, sy: 1, tag: short})
			case !still && e < landFor+tagFor:
				out = append(out, landed(task.ID, e-landFor, short))
			}
		}
	}
	return out
}

// landed is the parcel on the island's end, with the equip's squash
// (1.08 × 0.94, 120 ms) just after it lands.
func landed(id string, since time.Duration, tag string) parcelMoment {
	m := parcelMoment{taskID: id, at: 1, sx: 1, sy: 1, tag: tag}
	if since < squashOf {
		f := 1 - float32(since)/float32(squashOf)
		m.sx, m.sy = 1+0.08*f, 1-0.06*f
	}
	return m
}

// momentsLive: some parcel is still moving (the stage keeps painting).
func (a *App) momentsLive(now time.Time) bool {
	for _, task := range a.S.Tasks {
		if at := store.ParseTime(task.PlacedAt); !at.IsZero() && now.Sub(at) < legFor*2+restFor+tagFor {
			return true
		}
	}
	return false
}

// parcelTags are the words riding on the parcels of one island's bridge
// (the task's short title, 在等, 搬到 hel 上了), set over the island.
func (a *App) parcelTags(c *ui.Context, dv *protocol.DeviceView, dr ui.Rect, dy float32, now time.Time, still bool) {
	t := a.T
	var tags []string
	for _, m := range a.parcelMoments(dv, now, still) {
		if m.tag != "" {
			tags = append(tags, m.tag)
		}
	}
	if len(tags) == 0 {
		return
	}
	if len(tags) > 2 {
		tags = append(tags[:2], "…")
	}
	// Over the computer itself, so nothing on the island covers the words.
	ui.Row(c.Key("parcel-tags:" + dv.ID)).Absolute().Left(dr.X - 60).Top(max(dr.Y+dy-30, 8)).Width(dr.W + 120).Justify(ui.Center).Gap(t.S1).AccessHidden(true).Children(func() {
		for i, tag := range tags {
			ui.Row(c.Key(i)).Padding(2, t.S2).Radius(8).Background(t.Isles.Parcel).Shadow(0, 2, 0, 0, t.Isles.ParcelEdge.Alpha(0.6)).Children(func() {
				ui.Text(c, tag).FontSize(t.XS).FontWeight(800).TextColor(t.InkSoft).SingleLine().MaxWidth(160)
			})
		}
	})
}
