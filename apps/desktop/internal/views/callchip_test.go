package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D199: 打电话 is a chip on the home's character sheet again, and real: +
// starts Accounts' own Tuwa sign-in, on opens the phone card there, a gone
// sign-in says so. 用电脑 and 用手机 show as ghosts (以后会有) that only
// explain themselves. Another computer has neither.
func TestHomeCallChip(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		home := func(app *App, call protocol.DeviceAbility) {
			h := app.S.Device("local")
			h.Abilities = []protocol.DeviceAbility{{ID: "web", State: "on", Where: "ducter"}, {ID: "computer", State: "later"}, {ID: "remote", State: "on"}, {ID: "phone", State: "later"}, call}
			app.devState().sel = "local"
		}
		setup := func(call protocol.DeviceAbility) (*App, *[]any, func(label string)) {
			app := sheetApp(t, lang, "awake")
			home(app, call)
			var sent []any
			app.Send = func(f any) error { sent = append(sent, f); return nil }
			tt := sheetTester(app, 1280, 860, true)
			click := func(label string) {
				t.Helper()
				if err := tt.Click(label); err != nil {
					t.Fatalf("%s: click %q: %v in %q", lang, label, err, tt.Texts())
				}
				tt.Advance(300 * time.Millisecond)
				tt.Frame()
			}
			// The ghosts: their clay, their words, 以后会有; a tap explains and adds nothing.
			for _, id := range []string{"computer", "phone"} {
				if !tt.HasText(L.T("chip." + id)) {
					t.Fatalf("%s: no ghost %s in %q", lang, id, tt.Texts())
				}
			}
			if _, ok := tt.Find(L.T("chip.phone") + " · " + L.T("chip.state.later")); !ok || !tt.HasText(L.T("chip.state.later")) {
				t.Fatalf("%s: the ghosts don't say %q: %q", lang, L.T("chip.state.later"), tt.Texts())
			}
			// Evidence, not source (D75): DUCTER_CARD_SHOTS=… go test ./internal/views -run HomeCallChip
			if dir := os.Getenv("DUCTER_CARD_SHOTS"); dir != "" {
				_ = os.MkdirAll(dir, 0o755)
				if f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-home-call-%s-%s.png", call.State+call.Reason, lang))); err == nil {
					_ = png.Encode(f, tt.Image())
					f.Close()
				}
			}
			return app, &sent, click
		}

		// Off: + 打电话 goes to Accounts and starts the offer's own Tuwa sign-in.
		app, sent, click := setup(protocol.DeviceAbility{ID: "call", State: "off"})
		click(L.T("chip.phone") + " · " + L.T("chip.state.later"))
		if len(*sent) != 0 {
			t.Fatalf("%s: a ghost sent %#v", lang, *sent)
		}
		click(L.T("chip.computer") + " · " + L.T("chip.state.later"))
		if len(*sent) != 0 || app.devState().card.sheet.info == "" {
			t.Fatalf("%s: a ghost should only explain; sent %#v", lang, *sent)
		}
		click("+ " + L.T("chip.call"))
		if r, ok := lastSent[protocol.ConnectionAdd](*sent); !ok || r.URL != protocol.TuwaMCP {
			t.Fatalf("%s: + Calls sent %#v", lang, *sent)
		}
		if _, ok := lastSent[protocol.AbilityReq](*sent); ok {
			t.Fatalf("%s: + Calls asked the core for an ability", lang)
		}
		if app.Route != RouteSettings || app.settings.tab != TabAccounts {
			t.Fatalf("%s: + Calls opened %v/%q, not Accounts", lang, app.Route, app.settings.tab)
		}

		// On: a tap opens the phone card in Accounts; nothing is added again.
		app, sent, click = setup(protocol.DeviceAbility{ID: "call", State: "on"})
		click(L.T("chip.call") + " · " + L.T("chip.state.on"))
		if _, ok := lastSent[protocol.ConnectionAdd](*sent); ok || app.Route != RouteSettings || app.settings.tab != TabAccounts {
			t.Fatalf("%s: Calls on: route %v/%q, sent %#v", lang, app.Route, app.settings.tab, *sent)
		}

		// Its sign-in gone: the chip says sign in again, and goes to the card that does it.
		app, sent, click = setup(protocol.DeviceAbility{ID: "call", State: "on", Reason: "signed_out"})
		click(L.T("chip.call") + " · " + L.T("chip.call.signed_out"))
		if _, ok := lastSent[protocol.ConnectionAdd](*sent); ok || app.settings.tab != TabAccounts {
			t.Fatalf("%s: Calls signed out: tab %q, sent %#v", lang, app.settings.tab, *sent)
		}

		// Another computer: no calls, no ghosts.
		app = sheetApp(t, lang, "awake")
		mac := app.S.Device("dev_mac")
		mac.Abilities = append(mac.Abilities, protocol.DeviceAbility{ID: "phone", State: "later"})
		tt := sheetTester(app, 1280, 860, true)
		for _, label := range []string{L.T("chip.phone") + " · " + L.T("chip.state.later"), "+ " + L.T("chip.call")} {
			if _, ok := tt.Find(label); ok {
				t.Fatalf("%s: %q on a computer that isn't the home", lang, label)
			}
		}
	}
}
