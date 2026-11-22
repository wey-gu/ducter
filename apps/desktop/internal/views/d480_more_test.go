package views

import "testing"

// d480More is the shots after the first: the choice opened (and its other Spaces), or the same-Mem fix.
func d480More(t *testing.T, h *liveHarness, stage string, shoot func(string, int, int), settle func()) {
	if stage != "choose" && stage != "apart" {
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
	name := "peers-choose"
	if stage == "apart" {
		name = "peers-same"
	}
	for _, w := range []int{1280, 760} {
		shoot(name, w, 1700)
	}
	if stage != "choose" {
		return
	}
	h.app.mailboxChoosing.More = true
	for _, w := range []int{1280, 760} {
		shoot("peers-more", w, 2000)
	}
}
