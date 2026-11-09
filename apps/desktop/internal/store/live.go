package store

import (
	"encoding/base64"

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
}

// Try says this is 试一下 / Try it (D154): no card behind it.
func (lv *LiveView) Try() bool { return lv != nil && lv.DecisionID == protocol.TryLive }

// OpenLive starts a live view for a sign-in card (the view sends live_open).
func (s *Store) OpenLive(decisionID, site string) {
	s.Live = &LiveView{DecisionID: decisionID, Site: site}
	s.LiveClosed = nil
}

func (s *Store) applyLive(f protocol.ServerFrame) {
	lv := s.Live
	if f.T == "live" {
		if lv == nil || lv.DecisionID != f.DecisionID {
			return
		}
		if f.State == "open" {
			lv.ID, lv.Open, lv.URL, lv.Title, lv.Width, lv.Height, lv.Browser = f.ID, true, f.URL, f.Title, f.Width, f.Height, f.Browser
			return
		}
		s.Live = nil
		fc := f
		s.LiveClosed = &fc
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
