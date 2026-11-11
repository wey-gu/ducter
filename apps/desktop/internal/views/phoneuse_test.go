package views

import (
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D214, Ducter's phone, against a real Ducter whose home has the phone
// installed (a scratch home: never ~/.ducter or :7777):
//
//	DUCTER_LIVE_URL=ws://127.0.0.1:8917/ws DUCTER_LOCALE=zh DUCTER_SHOTS=1 \
//	  go test ./internal/views -run PhoneUseLive -v
//
// It shows the home's card with 用手机 on, the install sheet (asked for, never
// sent), and the live view of the real phone in the user's turn.
func TestPhoneUseLive(t *testing.T) {
	url := os.Getenv("DUCTER_LIVE_URL")
	if url == "" {
		t.Skip("DUCTER_LIVE_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_LOCALE") == "en" {
		lang = i18n.EN
	}
	h := newLive(t, url, lang).harness
	L := h.app.L
	h.click(L.T("nav.devices.label"))
	h.until("devices", func() bool { return len(h.app.S.Devices) > 0 })
	home := h.app.S.Device("local")
	if home == nil || home.Ability(protocol.AbilityPhone) == nil {
		t.Fatalf("no phone ability: %+v", home)
	}
	h.settle(2 * time.Second)
	h.shotAs(fmt.Sprintf("phone-%s-card", lang))
	h.app.openPhoneInstall("local")
	h.until("terms", func() bool { return h.app.S.Phone.Terms != nil })
	h.settle(500 * time.Millisecond)
	h.shotAs(fmt.Sprintf("phone-%s-install-sheet", lang))
	h.app.pu.installFor = ""
	h.app.OpenPhone("local", "", "", "takeover")
	// The phone may be off: it starts (a few seconds from its snapshot) before the first frame.
	for end := time.Now().Add(2 * time.Minute); time.Now().Before(end); {
		if pv := h.app.S.Phone.View; pv != nil && pv.Seq > 0 {
			break
		}
		h.until("a moment", func() bool { return true })
		time.Sleep(200 * time.Millisecond)
	}
	h.settle(1500 * time.Millisecond)
	h.shotAs(fmt.Sprintf("phone-%s-live", lang))
	h.app.ClosePhone(false)
}
