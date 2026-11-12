package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// Your devices and abilities against the mock main:
//
//	DUCTER_SHOTS=1 go test ./internal/views -run Abilities   # writes .shots/desktop/abilities-*.png

func (h *harness) shotAs(name string) {
	h.t.Helper()
	if os.Getenv("DUCTER_SHOTS") == "" {
		return
	}
	f, err := os.Create(filepath.Join(shotsDir(h.t), name+".png"))
	if err != nil {
		h.t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, h.tt.Image()); err != nil {
		h.t.Fatal(err)
	}
}

// clickFound clicks the middle of what shows s.
func (h *harness) clickFound(s string) {
	h.t.Helper()
	r, ok := h.tt.Find(s)
	if !ok {
		h.t.Fatalf("no %q in %q", s, h.tt.Texts())
	}
	h.tt.ClickAt(r.X+r.W/2, r.Y+r.H/2)
	h.tt.Frame()
}

func (h *harness) settle(d time.Duration) {
	for end := h.tt.Now().Add(d); h.tt.Now().Before(end); {
		h.tt.Advance(16 * time.Millisecond)
		h.until("frame", func() bool { return true })
	}
}

func openDevices(t *testing.T, lang i18n.Lang, motion bool) *harness {
	h := newHarness(t, lang)
	if motion {
		h.tt.SetPreferences(ui.Preferences{})
	}
	h.app.Now = h.tt.Now
	h.pump = func() { h.tt.Advance(16 * time.Millisecond) }
	h.click(h.app.L.T("nav.devices.label"))
	h.until("devices", func() bool { return len(h.app.S.Devices) > 0 })
	h.settle(300 * time.Millisecond)
	return h
}

func TestAbilitiesScreen(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		t.Run(string(lang), func(t *testing.T) {
			h := openDevices(t, lang, false)
			L := h.app.L
			for _, want := range []string{L.T("devices.title"), L.T("device.local"), "ducter-worker", "+ " + L.T("chip.web"), "+ " + L.T("chip.remote"), "Claude Code", "Codex", L.T("card.status.home", h.app.S.PersonaName)} {
				if !h.tt.HasText(want) {
					t.Fatalf("missing %q in %q", want, h.tt.Texts())
				}
			}
			// No invented numbers: no allowance was reported.
			for _, s := range h.tt.Texts() {
				if strings.Contains(s, "%") {
					t.Fatalf("a number nobody reported: %q", s)
				}
			}
			h.shotAs(fmt.Sprintf("abilities-%s-home", lang))

			// Tap 上网: it flies into its slot and the line says what the Mac can do now.
			h.click("+ " + L.T("chip.web"))
			h.until("web on", func() bool {
				d := h.app.S.Device("local")
				return d != nil && d.Ability(protocol.AbilityWeb).State == protocol.AbilityOn && h.app.dev.fx == nil
			})
			h.settle(200 * time.Millisecond)
			done := L.T("ability.web.done", L.T("device.local"))
			if !h.tt.HasText(done) {
				t.Fatalf("no %q in %q", done, h.tt.Texts())
			}
			h.shotAs(fmt.Sprintf("abilities-%s-added", lang))

			// D161: the chip turns it off in one tap (nothing at stake).
			h.click(L.T("chip.web") + " · " + L.T("chip.state.on"))
			h.until("web off", func() bool {
				return h.app.S.Device("local").Ability(protocol.AbilityWeb).State == protocol.AbilityOff
			})
		})
	}
}

func TestAbilitiesEquipMotion(t *testing.T) {
	h := openDevices(t, i18n.ZH, true)
	L := h.app.L
	h.click("+ " + L.T("chip.web"))
	// Mid-flight: peeled and arcing over.
	h.settle(300 * time.Millisecond)
	if h.app.dev.fx == nil {
		t.Fatal("no flight")
	}
	h.shotAs("abilities-zh-flight")
	h.settle(260 * time.Millisecond)
	h.shotAs("abilities-zh-snap")
	h.settle(time.Second)
	if h.app.dev.fx != nil || !h.tt.HasText(L.T("ability.web.done", L.T("device.local"))) {
		t.Fatalf("not landed: %q", h.tt.Texts())
	}
}

func TestAbilitiesRefusedGoesBack(t *testing.T) {
	h := openDevices(t, i18n.ZH, false)
	L := h.app.L
	h.hub.RefuseNext(protocol.AbilityWeb, "cua_old")
	h.click("+ " + L.T("chip.web"))
	h.until("back", func() bool { return h.app.dev.fx == nil && len(h.app.dev.refused) > 0 })
	h.settle(300 * time.Millisecond)
	if h.tt.HasText(L.T("ability.web.done", L.T("device.local"))) {
		t.Fatal("said it can browse when the server said no")
	}
	if !h.tt.HasText(L.T("ability.reason.cua_old")) {
		t.Fatalf("no reason: %q", h.tt.Texts())
	}
}

func TestAbilitiesStates(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		t.Run(string(lang), func(t *testing.T) {
			h := openDevices(t, lang, false)
			L := h.app.L
			seen := time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339)
			h.hub.SetDevices(func(list []protocol.DeviceView, _ *protocol.Reach) []protocol.DeviceView {
				return append(list,
					protocol.DeviceView{ID: "b71e04aa90", Name: "Mac mini", Kind: "mini", State: protocol.DeviceAsleep, LastSeen: seen,
						Harnesses: []protocol.DeviceHarness{{Harness: "claude-code", Installed: true, LoggedIn: true}},
						Abilities: []protocol.DeviceAbility{{ID: "web", State: "unavailable", Reason: "home_only"}, {ID: "computer", State: "later"}, {ID: "phone", State: "later"}, {ID: "call", State: "later"}}},
					protocol.DeviceView{ID: "c0ffee1234", Name: "ducter-vps", Kind: "server", State: protocol.DeviceUnreachable, LastSeen: seen,
						Harnesses: []protocol.DeviceHarness{{Harness: "claude-code", Installed: true, LoggedIn: false}},
						Abilities: []protocol.DeviceAbility{{ID: "web", State: "unavailable", Reason: "home_only"}, {ID: "computer", State: "later"}, {ID: "phone", State: "later"}, {ID: "call", State: "later"}}},
				)
			})
			h.until("four devices", func() bool { return len(h.app.S.Devices) == 4 })
			h.settle(100 * time.Millisecond)
			h.click("Mac mini · " + L.T("list.state.asleep"))
			h.settle(300 * time.Millisecond)
			if !h.tt.HasText(L.T("device.state.asleep")) {
				t.Fatalf("asleep line: %q", h.tt.Texts())
			}
			h.shotAs(fmt.Sprintf("abilities-%s-asleep", lang))
			h.click("ducter-vps · " + L.T("list.state.away"))
			h.settle(300 * time.Millisecond)
			if !h.tt.HasText(L.T("card.status.unreachable", L.T("time.ago.hour", 2))) {
				t.Fatalf("unreachable line: %q", h.tt.Texts())
			}
			h.shotAs(fmt.Sprintf("abilities-%s-unreachable", lang))
		})
	}
}

func TestAbilitiesReachFromAnywhere(t *testing.T) {
	h := openDevices(t, i18n.ZH, false)
	L := h.app.L
	h.click("+ " + L.T("chip.remote"))
	h.until("code", func() bool { return h.app.S.PairCode != nil })
	h.settle(200 * time.Millisecond)
	if !h.tt.HasText("K7QM-4XPA") || !h.tt.HasText(L.T("pair.noaddress")) {
		t.Fatalf("pair sheet: %q", h.tt.Texts())
	}
	h.shotAs("abilities-zh-pair")
	h.hub.Pair("iPhone", "ios")
	h.until("remote on", func() bool {
		return h.app.S.Device("local").Ability(protocol.AbilityRemote).State == protocol.AbilityOn && h.app.dev.fx == nil
	})
	h.settle(200 * time.Millisecond)
	if !h.tt.HasText(L.T("ability.remote.done", L.T("device.local"))) {
		t.Fatalf("no remote line: %q", h.tt.Texts())
	}
}

func TestAbilitiesNarrow(t *testing.T) {
	h := openDevices(t, i18n.EN, false)
	h.tt.SetSize(900, 860)
	h.settle(300 * time.Millisecond)
	h.shotAs("abilities-en-900")
}

// The screen against a real Ducter (port 7800 in the report):
//
//	DUCTER_LIVE_URL=ws://127.0.0.1:7800/ws DUCTER_LOCALE=zh DUCTER_SHOTS=1 \
//	  go test ./internal/views -run AbilitiesLive -v
//
// It removes 上网 if it is on, adds it back by tapping, and shows the
// pairing code of 远程打开; screenshots go to .shots/desktop/abilities-live-*.png.
func TestAbilitiesLive(t *testing.T) {
	url := os.Getenv("DUCTER_LIVE_URL")
	if url == "" {
		t.Skip("DUCTER_LIVE_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_LOCALE") == "en" {
		lang = i18n.EN
	}
	h := newLive(t, url, lang).harness
	h.app.Now = h.tt.Now
	pump := h.pump
	h.pump = func() { pump(); h.tt.Advance(16 * time.Millisecond) }
	L := h.app.L
	h.click(L.T("nav.devices.label"))
	h.until("devices", func() bool { return len(h.app.S.Devices) > 0 })
	home := h.app.S.Device("local")
	if home == nil || !home.Home {
		t.Fatalf("no home device: %+v", h.app.S.Devices)
	}
	if web := home.Ability(protocol.AbilityWeb); web != nil && web.State == protocol.AbilityOn {
		h.app.removeAbility(home, protocol.AbilityWeb)
		h.until("web off", func() bool {
			return h.app.S.Device("local").Ability(protocol.AbilityWeb).State == protocol.AbilityOff
		})
	}
	h.settle(9 * time.Second) // the removed line fades
	h.shotAs(fmt.Sprintf("abilities-live-%s-home", lang))
	h.click("+ " + L.T("chip.web"))
	h.until("web on", func() bool {
		d := h.app.S.Device("local")
		return d.Ability(protocol.AbilityWeb).State == protocol.AbilityOn && h.app.dev.fx == nil
	})
	h.settle(200 * time.Millisecond)
	if !h.tt.HasText(L.T("ability.web.done", L.T("device.local"))) {
		t.Fatalf("no line: %q", h.tt.Texts())
	}
	h.shotAs(fmt.Sprintf("abilities-live-%s-added", lang))
	h.click("+ " + L.T("chip.remote"))
	h.until("code", func() bool { return h.app.S.PairCode != nil })
	h.settle(300 * time.Millisecond)
	h.shotAs(fmt.Sprintf("abilities-live-%s-pair", lang))
}

// One paired device as the real main reports it (a worker awake, or gone):
//
//	DUCTER_LIVE_URL=... DUCTER_LIVE_DEVICE=build-box DUCTER_LIVE_SHOT=worker DUCTER_SHOTS=1 \
//	  go test ./internal/views -run AbilitiesLiveDevice -v
func TestAbilitiesLiveDevice(t *testing.T) {
	url, name := os.Getenv("DUCTER_LIVE_URL"), os.Getenv("DUCTER_LIVE_DEVICE")
	if url == "" || name == "" {
		t.Skip("DUCTER_LIVE_URL or DUCTER_LIVE_DEVICE not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_LOCALE") == "en" {
		lang = i18n.EN
	}
	h := newLive(t, url, lang).harness
	h.app.Now = time.Now
	h.click(h.app.L.T("nav.devices.label"))
	var dv *protocol.DeviceView
	h.until("device", func() bool {
		for i := range h.app.S.Devices {
			if h.app.S.Devices[i].Name == name {
				dv = &h.app.S.Devices[i]
			}
		}
		return dv != nil
	})
	chip, _ := h.app.listWord(dv)
	h.click(name + " · " + chip)
	h.until("shown", func() bool { return h.app.shownDevice().Name == name })
	h.tt.Advance(time.Second)
	h.tt.Frame()
	t.Logf("%s: %s · %q", name, dv.State, chip)
	h.shotAs(fmt.Sprintf("abilities-live-%s-%s", lang, os.Getenv("DUCTER_LIVE_SHOT")))
}
