package views

import (
	"strings"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// 上网 through an AI agent's own browser (D130): no cua-driver steps, and
// the tile and the detail say it runs in the person's own Chrome.
func TestWebInYourChrome(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		t.Run(string(lang), func(t *testing.T) {
			h := newHarness(t, lang)
			f := &fakeBackend{dir: t.TempDir()}
			h.app.Backend, h.app.Desktop = f, &fakeDesktop{}
			h.app.Now = h.tt.Now
			h.pump = func() { h.tt.Advance(16 * time.Millisecond) }
			h.hub.SetDevices(func(list []protocol.DeviceView, _ *protocol.Reach) []protocol.DeviceView {
				for i := range list {
					if list[i].Home {
						for k := range list[i].Abilities {
							if list[i].Abilities[k].ID == protocol.AbilityWeb {
								list[i].Abilities[k] = protocol.DeviceAbility{ID: protocol.AbilityWeb, State: protocol.AbilityOn, Detail: "codex", Where: protocol.WhereChrome}
							}
						}
					}
				}
				return list
			})
			T := h.app.L.T
			h.click(T("nav.devices.label"))
			h.until("devices", func() bool { return len(h.app.S.Devices) > 0 })
			h.settle(300 * time.Millisecond)
			if dv := h.app.S.Device("local"); dv == nil || h.app.webNeedsSetup(dv) {
				t.Fatal("a ready native browser still asks for cua-driver's setup")
			}
			// D161: which browser is said in 上网's ⓘ, one tap away.
			h.click(T("chip.info") + " · " + T("chip.web"))
			h.settle(200 * time.Millisecond)
			h.has(T("ability.web.about.chrome"))
			if strings.Contains(strings.Join(h.tt.Texts(), "\n"), T("web.tile")) {
				t.Error("the tile still offers the three setup steps")
			}
		})
	}
}
