package views

import "testing"

// d480More is the shots after the first: the choice opened, and its other Spaces.
func d480More(t *testing.T, h *liveHarness, stage string, shoot func(string, int, int), settle func()) {
	if stage != "choose" {
		return
	}
	mac := ""
	for _, d := range h.app.S.Devices {
		if !d.Home {
			mac = d.ID
		}
	}
	if mac == "" {
		t.Fatal("no Mac in the demo")
	}
	h.app.chooseMailbox(mac, "claude-code")
	h.until("look", func() bool { return h.app.mailboxChoosing != nil && h.app.mailboxChoosing.Look != nil })
	settle()

	for _, w := range []int{1280, 760} {
		shoot("peers-choose", w, 1700)
	}
	h.app.mailboxChoosing.More = true
	for _, w := range []int{1280, 760} {
		shoot("peers-more", w, 2000)
	}
}
