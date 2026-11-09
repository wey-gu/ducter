package views

import (
	"fmt"
	"os"
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

// The desktop button path against a real Ducter (D83): tap 连上手机或另一台
// 电脑, write the code it shows to DUCTER_LIVE_CODE_OUT, then wait (up to
// 5 min) for another computer to join with it via `ducter worker`, and
// rename it from its card to DUCTER_LIVE_RENAME:
//
//	DUCTER_LIVE_URL=ws://127.0.0.1:7791/ws DUCTER_LIVE_CODE_OUT=/tmp/code \
//	  DUCTER_LIVE_RENAME="Lima box" DUCTER_SHOTS=1 go test ./internal/views -run OneCodeLive -v
func TestOneCodeLive(t *testing.T) {
	url, out := os.Getenv("DUCTER_LIVE_URL"), os.Getenv("DUCTER_LIVE_CODE_OUT")
	if url == "" || out == "" {
		t.Skip("DUCTER_LIVE_URL or DUCTER_LIVE_CODE_OUT not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_LOCALE") == "en" {
		lang = i18n.EN
	}
	h := newLive(t, url, lang).harness
	h.app.Now = time.Now
	L := h.app.L
	h.click(L.T("nav.devices.label"))
	h.until("devices", func() bool { return len(h.app.S.Devices) > 0 })
	before := len(h.app.S.Devices)
	h.click(L.T("devices.connect"))
	h.until("code", func() bool { return h.app.S.PairCode != nil })
	pc := h.app.S.PairCode
	h.tt.Advance(time.Second)
	h.tt.Frame()
	t.Logf("code %s at %q; card says %q", pc.Code, pc.Address, workerCommand(pc.Address, pc.Code))
	h.shotAs(fmt.Sprintf("live-%s-pair", lang))
	if err := os.WriteFile(out, []byte(pc.Code+"\n"+pc.Address+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	h.wait = 5 * time.Minute
	h.until("a computer joins", func() bool { return len(h.app.S.Devices) > before && !h.app.dev.pair.open })
	dv := h.app.shownDevice()
	h.until("awake", func() bool { dv = h.app.shownDevice(); return dv.State == protocol.DeviceAwake })
	h.wait = 0
	h.tt.Advance(time.Second)
	h.tt.Frame()
	if !h.tt.HasText(L.T("device.other") + " · " + L.T("device.other.does", h.app.S.PersonaName)) {
		t.Fatalf("card: %q", h.tt.Texts())
	}
	t.Logf("joined: %s (%s, %s)", dv.Name, dv.ID, dv.State)
	h.shotAs(fmt.Sprintf("live-%s-joined", lang))
	if name := os.Getenv("DUCTER_LIVE_RENAME"); name != "" {
		id := dv.ID
		h.click(L.T("device.rename") + " · " + dv.Name)
		h.app.dev.rename.draft = name
		h.click(L.T("device.rename.ok"))
		h.until("renamed", func() bool { d := h.app.S.Device(id); return d != nil && d.Name == name })
		h.tt.Advance(time.Second)
		h.tt.Frame()
		h.shotAs(fmt.Sprintf("live-%s-renamed", lang))
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
			h.click(L.T("device.rename") + " · ducter-worker")
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
			if !h.tt.HasText(L.T("device.state.asleep")) || h.tt.HasText(L.T("device.other")+" · "+does) {
				t.Fatalf("asleep subtitle: %q", h.tt.Texts())
			}
			h.shotAs(fmt.Sprintf("one-code-%s-card-asleep", lang))
		})
	}
}
