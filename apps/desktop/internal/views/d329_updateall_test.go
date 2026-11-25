package views

import (
	"fmt"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D329: the home's Nowledge Mem is never hidden under 还有 n 项, and the
// order note names it.
func TestD329UpdateAllMemShownAndNamed(t *testing.T) {
	offer := []protocol.UpdateAllItem{{Kind: "ducter"}, {Kind: "agent"}, {Kind: "agent"}, {Kind: "agent"}, {Kind: "agent"}, {Kind: "mem"}}
	if got := fmt.Sprint(updAllOfferShown(offer, 4)); got != "[0 1 2 5]" {
		t.Fatalf("shown %s", got)
	}
	if got := fmt.Sprint(updAllOfferShown(offer[:3], 4)); got != "[0 1 2]" {
		t.Fatalf("a short offer is all shown: %s", got)
	}
	L := i18n.New(i18n.ZH)
	at := time.Now().UTC().Format(time.RFC3339)
	items := append(uaItems(), protocol.UpdateAllItem{Key: "mem:local", Kind: "mem", Device: "local", DeviceName: "hel", From: "0.10.118", To: "0.10.121", State: "queued", At: at})
	app, _, _ := uaApp(t, i18n.ZH, &protocol.UpdateAllView{Offer: items}, false)
	tt := d329Tester(app, 1280, 1800, false)
	if !hasText(tt, L.T("upall.item.mem", "hel")) {
		t.Fatalf("Mem hidden in a long offer: %q", tt.Texts())
	}
	if s := app.updAllOrder(); s != L.T("upall.order.mem", "hel") && s != L.T("upall.order.solo.mem") {
		t.Fatalf("order note without Mem: %q", s)
	}
}
