package views

import (
	"fmt"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D83: one code, both ways to use it, on the card 连上手机或另一台电脑
// opens; a computer that joins with it closes the card and is shown.
func TestPairCardBothWays(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		t.Run(string(lang), func(t *testing.T) {
			h := openDevices(t, lang, false)
			L := h.app.L
			h.click(L.T("devices.connect"))
			h.until("code", func() bool { return h.app.S.PairCode != nil })
			h.app.Receive(protocol.ServerFrame{T: "pair_code", Code: "K7QM-4XPA", Address: "https://ducter.example.com", QR: []string{"1"}, ExpiresAt: time.Now().Add(10 * time.Minute).UTC().Format(time.RFC3339)})
			h.settle(200 * time.Millisecond)
			for _, want := range []string{L.T("pair.scan"), L.T("pair.computer", h.app.S.PersonaName), "ducter worker https://ducter.example.com --code K7QM-4XPA", L.T("pair.waiting")} {
				if !h.tt.HasText(want) {
					t.Fatalf("missing %q in %q", want, h.tt.Texts())
				}
			}
			h.shotAs(fmt.Sprintf("one-code-%s-pair", lang))
			h.hub.SetDevices(func(list []protocol.DeviceView, _ *protocol.Reach) []protocol.DeviceView {
				return append(list, protocol.DeviceView{ID: "d00d00d00d", Name: "ip-172-31-4-9", Kind: "server", State: protocol.DeviceAwake,
					Abilities: []protocol.DeviceAbility{{ID: "web", State: "unavailable", Reason: "home_only"}}})
			})
			h.until("joined", func() bool { return !h.app.dev.pair.open })
			if h.app.dev.sel != "d00d00d00d" {
				t.Fatalf("the new computer isn't shown: sel %q", h.app.dev.sel)
			}
		})
	}
}

// D84: another computer's card says what it is and what it does, the
// second half its state when something is wrong; 改名字 renames it.
func TestOtherComputerCard(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		t.Run(string(lang), func(t *testing.T) {
			h := openDevices(t, lang, false)
			L := h.app.L
			does := L.T("device.other.does", h.app.S.PersonaName)
			if !h.tt.HasText(L.T("device.other") + " · " + does) {
				t.Fatalf("subtitle: %q", h.tt.Texts())
			}
			h.click("ducter-worker · " + L.T("device.state.awake"))
			h.settle(200 * time.Millisecond)
			h.click(L.T("device.rename"))
			h.settle(100 * time.Millisecond)
			h.app.dev.rename.draft = "MacBook-Pro"
			h.click(L.T("device.rename.ok"))
			h.until("refused", func() bool { return h.app.dev.rename.failed == "name_taken" })
			h.settle(100 * time.Millisecond)
			if !h.tt.HasText(L.T("device.rename.name_taken", "MacBook-Pro")) {
				t.Fatalf("taken: %q", h.tt.Texts())
			}
			h.app.dev.rename.draft = "Build box"
			h.click(L.T("device.rename.ok"))
			h.until("renamed", func() bool { d := h.app.S.Device("a3f9c2d1e0"); return d != nil && d.Name == "Build box" })
			h.settle(200 * time.Millisecond)
			if h.app.dev.rename.device != "" || !h.tt.HasText("Build box") {
				t.Fatalf("after rename: %+v %q", h.app.dev.rename, h.tt.Texts())
			}
			h.shotAs(fmt.Sprintf("one-code-%s-card", lang))
			// Asleep: the state replaces the second half.
			h.hub.SetDevices(func(list []protocol.DeviceView, _ *protocol.Reach) []protocol.DeviceView {
				for i := range list {
					if list[i].ID == "a3f9c2d1e0" {
						list[i].State = protocol.DeviceAsleep
					}
				}
				return list
			})
			h.until("asleep", func() bool { return h.app.S.Device("a3f9c2d1e0").State == protocol.DeviceAsleep })
			h.settle(200 * time.Millisecond)
			if !h.tt.HasText(L.T("device.state.asleep")) || h.tt.HasText(does) {
				t.Fatalf("asleep subtitle: %q", h.tt.Texts())
			}
			h.shotAs(fmt.Sprintf("one-code-%s-card-asleep", lang))
		})
	}
}
