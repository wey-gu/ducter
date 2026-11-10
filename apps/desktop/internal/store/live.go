package store

import (
	"encoding/base64"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// LiveView is the live view of Ducter's browser (D151): the newest frame
// (JPEG bytes, shown then dropped) and the page's size in CSS pixels.
type LiveView struct {
	ID, DecisionID, Site string
	Open                 bool // the server opened it (frames come)
	URL, Title           string
	Width, Height        int
	Seq                  int64
	Frame                []byte
	// Browser is which browser it is (D154), from the open frame.
	Browser *protocol.BrowserAbout
	// D190, 看它上网 / Watch it browse: the task whose tab it is, whose turn
	// it is (agent | you), whether this window holds the user's, and the
	// task's last step (DoingAt: when it came; the line goes quiet after).
	TaskID  string
	Task    *protocol.LiveTask
	Turn    string
	Here    bool
	Doing   *protocol.LiveDoing
	DoingAt time.Time
	// Device: whose browser Try it opened ("" = the home's).
	Device string
}

// Try says this is 试一下 / Try it (D154): no card behind it.
func (lv *LiveView) Try() bool { return lv != nil && lv.DecisionID == protocol.TryLive }

// Watch says this is 看它上网 / Watch it browse (D190): a task's tab.
func (lv *LiveView) Watch() bool { return lv != nil && lv.DecisionID == protocol.WatchLive }

// Mine says the user drives the page from this window: a sign-in and Try it
// from the start, a watch after 换我来 / My turn here.
func (lv *LiveView) Mine() bool {
	if lv == nil {
		return false
	}
	if !lv.Watch() {
		return true
	}
	return lv.Turn == "you" && lv.Here
}

// OpenLive starts a live view for a sign-in card (the view sends live_open).
func (s *Store) OpenLive(decisionID, site string) {
	s.Live = &LiveView{DecisionID: decisionID, Site: site}
	s.LiveClosed = nil
}

// OpenWatch starts a watch of a task's tab (D190; the view sends live_open).
func (s *Store) OpenWatch(taskID string) {
	lv := &LiveView{DecisionID: protocol.WatchLive, TaskID: taskID, Turn: "agent"}
	if c := s.card(taskID); c != nil {
		lv.Task = &protocol.LiveTask{Title: c.Title, Harness: c.Harness}
	}
	s.Live = lv
	s.LiveClosed = nil
}

// card is a task's On hand card, if On hand has it.
func (s *Store) card(taskID string) *protocol.TaskCard {
	if s.OnHand == nil {
		return nil
	}
	for i := range s.OnHand.Tasks {
		if s.OnHand.Tasks[i].TaskID == taskID {
			return &s.OnHand.Tasks[i]
		}
	}
	return nil
}

// Browsing says where a task holds Ducter's own browser ("" = it doesn't),
// so it can be watched (D190).
func (s *Store) Browsing(taskID string) string {
	if c := s.card(taskID); c != nil && c.Browsing != nil {
		return c.Browsing.Device
	}
	return ""
}

func (s *Store) applyLive(f protocol.ServerFrame) {
	lv := s.Live
	switch f.T {
	case "live":
		if lv == nil || lv.DecisionID != f.DecisionID {
			return
		}
		if f.State == "open" {
			lv.ID, lv.Open, lv.URL, lv.Title, lv.Width, lv.Height, lv.Browser = f.ID, true, f.URL, f.Title, f.Width, f.Height, f.Browser
			if f.Turn != "" {
				lv.Turn, lv.Here = f.Turn, f.Here
			}
			if f.Task != nil {
				lv.Task = f.Task
			}
			return
		}
		s.Live = nil
		fc := f
		s.LiveClosed = &fc
		return
	case "live_turn":
		if lv != nil && lv.ID == f.ID {
			lv.Turn, lv.Here = f.Turn, f.Here
			if f.Turn == "you" {
				lv.Doing = nil
			}
		}
		return
	case "live_doing":
		if lv != nil && lv.ID == f.ID {
			lv.Doing, lv.DoingAt = f.Doing, time.Now()
		}
		return
	}
	if lv == nil || lv.ID != f.ID {
		return
	}
	b, err := base64.StdEncoding.DecodeString(f.Data)
	if err != nil {
		return
	}
	lv.Frame, lv.Seq, lv.Width, lv.Height = b, f.Seq, f.Width, f.Height
	if f.URL != "" {
		lv.URL = f.URL
	}
}
