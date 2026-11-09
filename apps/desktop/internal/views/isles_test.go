package views

import (
	"fmt"
	"sort"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/mock"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// The Isles stage (D81) in every scene of the scripted demo, at 1280 and
// 900 wide, zh and en: the words in the scene never overlap.
//
//	DUCTER_SHOTS=1 go test ./internal/views -run Isles   # writes isles-*.png
func TestIslesScenes(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, size := range [][2]int{{1280, 800}, {900, 800}} {
			t.Run(fmt.Sprintf("%s-%d", lang, size[0]), func(t *testing.T) {
				h := openDevices(t, lang, false)
				h.tt.SetSize(size[0], size[1])
				for _, scene := range mock.Scenes {
					if !h.hub.Scene(scene) {
						t.Fatalf("no scene %s", scene)
					}
					h.settle(400 * time.Millisecond)
					h.until(scene, func() bool { return len(h.app.devState().labels) > 0 })
					checkLabels(t, scene, h.app.devState().labels)
					h.shotAs(fmt.Sprintf("isles-%s-%d-%s", lang, size[0], scene))
				}
			})
		}
	}
}

// checkLabels fails when two words in the scene overlap.
func checkLabels(t *testing.T, scene string, labels map[string]ui.Rect) {
	t.Helper()
	keys := make([]string, 0, len(labels))
	for k := range labels {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for i, a := range keys {
		for _, b := range keys[i+1:] {
			ra, rb := labels[a], labels[b]
			if ra.W == 0 || rb.W == 0 {
				continue
			}
			if ra.X < rb.X+rb.W-1 && rb.X < ra.X+ra.W-1 && ra.Y < rb.Y+rb.H-1 && rb.Y < ra.Y+ra.H-1 {
				t.Errorf("%s: %s %v overlaps %s %v", scene, a, ra, b, rb)
			}
		}
	}
}

// Working: parcels cross cloud-1's bridge and its line says so; the
// account lifts every island it's signed in on, with the shared line.
func TestIslesWorkingAndAccount(t *testing.T) {
	h := openDevices(t, i18n.ZH, false)
	L := h.app.L
	h.hub.Scene("cloud-working")
	h.until("cloud", func() bool { return h.app.S.Device("cloud1") != nil && h.app.runningOn(h.app.S.Device("cloud1")) == 1 })
	h.settle(200 * time.Millisecond)
	if !h.tt.HasText(L.T("device.other")+" · "+L.T("device.other.working.one")) || !h.tt.HasText(L.T("isles.working.one")) {
		t.Fatalf("no working line: %q", h.tt.Texts())
	}
	h.click("Claude Code · " + L.T("token.signed_in") + " · " + L.T("token.shared", 2))
	h.settle(400 * time.Millisecond)
	if h.app.devState().lit != "claude-code" {
		t.Fatal("not lit")
	}
	lift := h.app.liftOf(h.app.isles(), h.tt.Now(), true, nil)
	if lift["dev:local"] == 0 || lift["dev:cloud1"] == 0 {
		t.Fatalf("not lifted: %v", lift)
	}
	h.shotAs("isles-zh-account-lit")
}

// Pairing happens in the scene: the code is on a sign, and a device that
// joins rises on its own island.
func TestIslesPairingInScene(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		t.Run(string(lang), func(t *testing.T) {
			h := openDevices(t, lang, true)
			L := h.app.L
			h.hub.Scene("phone")
			h.until("phone", func() bool { return h.app.S.Reach != nil && len(h.app.S.Reach.Clients) == 1 })
			h.settle(300 * time.Millisecond)
			h.click(L.T("devices.connect"))
			h.until("code", func() bool { return h.app.S.PairCode != nil })
			h.settle(700 * time.Millisecond)
			if !h.tt.HasText("K7QM-4XPA") || !h.tt.HasText(L.T("pair.waiting")) {
				t.Fatalf("no sign: %q", h.tt.Texts())
			}
			h.shotAs(fmt.Sprintf("isles-%s-pairing", lang))
			h.hub.Scene("joined")
			h.until("joined", func() bool { return h.app.devState().pair.joined == "dev:mini1" })
			h.settle(500 * time.Millisecond)
			h.shotAs(fmt.Sprintf("isles-%s-joining", lang))
			h.settle(1500 * time.Millisecond)
			if h.app.devState().pair.open || h.app.shownDevice().ID != "mini1" {
				t.Fatalf("joined device not chosen: %+v", h.app.devState().pair)
			}
			h.shotAs(fmt.Sprintf("isles-%s-joined", lang))
		})
	}
}

// A phone is an island too; choosing it says what it is for.
func TestIslesPhone(t *testing.T) {
	h := openDevices(t, i18n.EN, false)
	L := h.app.L
	h.hub.Scene("phone")
	h.until("phone", func() bool { return h.app.S.Reach != nil && len(h.app.S.Reach.Clients) == 1 })
	h.settle(200 * time.Millisecond)
	line := L.T("device.client.line", h.app.S.PersonaName)
	h.click("iPhone · " + line)
	h.settle(200 * time.Millisecond)
	if h.app.devState().selClient != "c-iphone" || h.tt.HasText(L.T("devices.grid")) {
		t.Fatalf("phone card: %q", h.tt.Texts())
	}
	_ = protocol.AbilityWeb
}
