package store

import (
	"encoding/base64"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// PhoneView is the live view of Ducter's phone (D217): the newest frame
// (JPEG bytes, shown then dropped), whose turn it is, and the task's last
// step. Mode: watch | takeover | signin.
type PhoneView struct {
	ID, Mode, State string // State: opening | starting | open
	Device          string // the computer's name, from the server
	DeviceID        string // whose phone ("local" or a device id)
	TaskID          string
	DecisionID      string
	Task            *protocol.LiveTask
	Turn            string
	Here            bool
	Width, Height   int
	Seq             int64
	Frame           []byte
	App             string
	Doing           *protocol.LiveDoing
	DoingAt         time.Time
	// D248: Taking: My turn waits for the task's step in flight; Did:
	// what it did (newest last); Waking: 叫醒 / Wake was pressed.
	Taking bool
	Did    []protocol.PhoneDid
	Waking bool
}

// Mine says the user drives the phone from this window.
func (pv *PhoneView) Mine() bool { return pv != nil && pv.Turn == "you" && pv.Here }

// PhoneState is everything of Ducter's phone the Mac keeps between frames.
type PhoneState struct {
	View *PhoneView
	// Closed is the last close (a reason to say, once).
	Closed *protocol.ServerFrame
	// Terms is the install sheet's answer; Install the last install result.
	Terms   *protocol.ServerFrame
	Install *protocol.ServerFrame
}

// OpenPhone starts a live view (the view sends phone_open).
func (s *Store) OpenPhone(device, taskID, decisionID, mode string) {
	turn, here := "agent", false
	if mode != "watch" {
		turn, here = "you", true
	}
	pv := &PhoneView{Mode: mode, State: "opening", DeviceID: device, TaskID: taskID, DecisionID: decisionID, Turn: turn, Here: here}
	if c := s.card(taskID); c != nil {
		pv.Task = &protocol.LiveTask{Title: c.Title, Harness: c.Harness}
	}
	s.Phone.View = pv
	s.Phone.Closed = nil
}

// Phoning says where a task is using Ducter's phone ("" = it isn't).
func (s *Store) Phoning(taskID string) string {
	if c := s.card(taskID); c != nil && c.Phoning != nil {
		return c.Phoning.Device
	}
	return ""
}

func (s *Store) applyPhone(f protocol.ServerFrame) {
	pv := s.Phone.View
	switch f.T {
	case "phone_terms":
		fc := f
		s.Phone.Terms = &fc
	case "phone_install_result", "phone_erase_result":
		fc := f
		s.Phone.Install = &fc
	case "phone_view":
		if f.State == "closed" {
			if pv != nil && (pv.ID == f.ID || f.ID == "" || pv.State == "opening") {
				s.Phone.View = nil
				fc := f
				s.Phone.Closed = &fc
			}
			return
		}
		if pv == nil || (pv.ID != "" && pv.ID != f.ID) {
			return
		}
		pv.ID, pv.State, pv.Mode, pv.Turn, pv.Here, pv.Device = f.ID, f.State, f.Mode, f.Turn, f.Here, f.Device
		pv.Taking = f.Taking
		if f.State != "asleep" {
			pv.Waking = false
		}
		if f.Task != nil {
			pv.Task = f.Task
		}
		if f.TaskID != "" {
			pv.TaskID = f.TaskID
		}
		if f.Turn == "you" {
			pv.Doing = nil
		}
	case "phone_did":
		if pv != nil && pv.ID == f.ID {
			pv.Did = f.Did
		}
	case "phone_doing":
		if pv != nil && pv.ID == f.ID {
			pv.Doing, pv.DoingAt = f.Doing, time.Now()
		}
	case "phone_frame":
		if pv == nil || pv.ID != f.ID {
			return
		}
		b, err := base64.StdEncoding.DecodeString(f.Data)
		if err != nil {
			return
		}
		pv.Frame, pv.Seq, pv.Width, pv.Height = b, f.Seq, f.Width, f.Height
		if f.App != "" {
			pv.App = f.App
		}
	}
}

// Handset says which of the person's own phones a task is using (D238);
// nil = none.
func (s *Store) Handset(taskID string) *protocol.Computing {
	if c := s.card(taskID); c != nil {
		return c.Handset
	}
	return nil
}

// Computing says where (and in which app) a task is using the person's
// apps (D235); nil = it isn't.
func (s *Store) Computing(taskID string) *protocol.Computing {
	if c := s.card(taskID); c != nil {
		return c.Computing
	}
	return nil
}
