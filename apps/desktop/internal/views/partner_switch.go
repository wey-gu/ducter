package views

import (
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D541: a partner switch is instant, as switching chats in a messaging
// app. Each partner's conversation this window has shown stays held, with
// its place in the list, its draft and its unsent messages; the others'
// newest stretch is asked for once the window is connected (a peek, about
// 50 events). A switch swaps the held conversation in at once (the next
// frame draws it, no wait on the link), and its hello carries the cursor
// it holds, so the home sends only what is newer, which then lands quietly.

// peekSize is how many of another partner's newest events a peek asks for.
const peekSize = 50

// convKept is one partner's conversation as this window last showed it.
type convKept struct {
	conv       *store.Conv
	draft      string
	pending    []pendingMsg
	list       ui.ListState
	fl         follow
	rp         replyState
	headRows   map[int64]bool
	livingAway map[int64]bool
	readSent   int64
	unreadAt   time.Time
}

// partnerSwitch is the switch's state.
type partnerSwitch struct {
	// kept are the conversations held aside, by partner.
	kept map[string]*convKept
	// to is the partner a switch's hello was sent for, until its welcome:
	// the shown conversation's frames still on the way are the other's.
	to string
	// sameSock: the switch went on a socket that stayed up (what it asked
	// for, devices and settings, it still hears).
	sameSock bool
	// peeked are the partners whose peek this socket asked for.
	peeked map[string]bool
}

// keepShown puts the shown conversation aside and brings id's in: held,
// peeked, or empty until its hello is answered. It reports whether the
// conversation brought in has something to draw.
func (a *App) keepShown(from, id string) bool {
	if a.sw.kept == nil {
		a.sw.kept = map[string]*convKept{}
	}
	next := a.sw.kept[id]
	delete(a.sw.kept, id)
	var conv *store.Conv
	if next != nil {
		conv = next.conv
	}
	out := &convKept{conv: a.S.SwapConv(conv), draft: a.draft, pending: a.pending, list: a.list, fl: a.fl, rp: a.rp,
		headRows: a.headRows, livingAway: a.livingAway, readSent: a.readSent, unreadAt: a.unreadAt}
	if a.list.AtEnd() {
		// Read to its end: it comes back at its end, with what came since
		// (a list kept following stays where it was drawn).
		out.list = ui.ListState{}
		out.fl.mark = 0
	}
	a.sw.kept[from] = out
	if next == nil {
		next = &convKept{}
	}
	a.draft, a.pending, a.list, a.fl, a.rp = next.draft, next.pending, next.list, next.fl, next.rp
	a.headRows, a.livingAway, a.readSent, a.unreadAt = next.headRows, next.livingAway, next.readSent, next.unreadAt
	if a.livingAway == nil {
		a.livingAway = map[int64]bool{}
	}
	a.S.Persona = id
	return len(a.S.Channel) > 0
}

// forgetKept drops every conversation held aside (a Log that started over,
// another home).
func (a *App) forgetKept() {
	a.sw = partnerSwitch{}
}

// switchFrame reports whether a frame that came while a switch waits for
// its welcome belongs to the conversation it left, and is dropped. Task
// events and everything else of the person's still apply.
func (a *App) switchFrame(f *protocol.ServerFrame) bool {
	if a.sw.to == "" {
		return false
	}
	switch f.T {
	case "welcome":
		a.sw.to = ""
		return false
	case "activity", "first_screen", "channel_history", "pins", "apps":
		return true
	case "events":
		keep := f.Events[:0:0]
		for _, ev := range f.Events {
			if ev.Stream != "channel" {
				keep = append(keep, ev)
			}
		}
		if len(keep) == 0 {
			return true
		}
		f.Events = keep
	}
	return false
}

// peekOthers asks, once per socket, for the newest stretch of each other
// partner this window holds nothing of.
func (a *App) peekOthers() {
	if !a.manyPartners() || !a.S.Welcomed || a.sw.to != "" {
		return
	}
	shown := a.shownPartnerID()
	for _, p := range a.S.Partners {
		if p.ID == shown || a.sw.kept[p.ID] != nil || a.sw.peeked[p.ID] {
			continue
		}
		if a.sw.peeked == nil {
			a.sw.peeked = map[string]bool{}
		}
		a.sw.peeked[p.ID] = true
		a.send(protocol.PartnerPeekReq{T: "partner_peek", Persona: p.ID, Limit: peekSize})
	}
}

// switchWelcomed is a switch's welcome on a socket that stayed up: the
// partner's unsent messages go (the home drops a repeat); what the socket
// asked for before (devices, settings) it still hears, so nothing is asked again.
func (a *App) switchWelcomed() {
	a.Failed = false
	a.resendUnechoed()
	a.flushOutbox()
}

// tookPeek holds a peek's conversation, unless it is shown or held already.
func (a *App) tookPeek(f protocol.ServerFrame) {
	if f.Persona == "" || f.Persona == a.shownPartnerID() || a.sw.kept[f.Persona] != nil {
		return
	}
	if a.sw.kept == nil {
		a.sw.kept = map[string]*convKept{}
	}
	a.sw.kept[f.Persona] = &convKept{conv: store.PeekConv(f)}
}
