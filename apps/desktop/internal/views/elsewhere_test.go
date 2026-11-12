package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D237: the home (hel, a Linux server) has 用手机 and 用电脑 through the
// MacBook that has them on: its chips point there (用手机 · 在 MacBook 上),
// never 以后会有, and a tap opens the MacBook's card. Being installed
// there counts; with several, the first and +N. With no computer that has
// it, 用手机 keeps its ghost and 用电脑 shows nothing on a server.
func TestHomeAbilitiesElsewhere(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		world := func(phone protocol.DeviceAbility, more ...protocol.DeviceView) *App {
			app := sheetApp(t, lang, "awake")
			h := app.S.Device("local")
			h.Abilities = []protocol.DeviceAbility{{ID: "web", State: "on", Where: "ducter"}, {ID: "computer", State: "later"}, {ID: "remote", State: "on"}, {ID: "phone", State: "later"}, {ID: "call", State: "off"}}
			app.S.Device("dev_mac").Abilities = []protocol.DeviceAbility{{ID: "web", State: "on", Where: "chrome"}, {ID: "computer", State: "unavailable", Reason: "computer_permissions"}, phone}
			app.S.Devices = append(app.S.Devices, more...)
			app.devState().sel = "local"
			return app
		}
		chip := func(id, where string) string { return L.T("chip."+id) + " · " + where }

		app := world(protocol.DeviceAbility{ID: "phone", State: "on"})
		tt := sheetTester(app, 1280, 860, true)
		for _, id := range []string{"phone", "computer"} {
			if _, ok := tt.Find(chip(id, L.T("chip.elsewhere", "MacBook"))); !ok {
				t.Fatalf("%s: no %s pointing at the MacBook in %q", lang, id, tt.Texts())
			}
			if _, ok := tt.Find(chip(id, L.T("chip.state.later"))); ok {
				t.Fatalf("%s: %s is still 以后会有 on the home", lang, id)
			}
		}
		if !tt.HasText(L.T("chip.elsewhere", "MacBook")) {
			t.Fatalf("%s: the chip doesn't say where: %q", lang, tt.Texts())
		}
		// Evidence, not source (D75): DUCTER_CARD_SHOTS=… go test ./internal/views -run HomeAbilitiesElsewhere
		if dir := os.Getenv("DUCTER_CARD_SHOTS"); dir != "" {
			_ = os.MkdirAll(dir, 0o755)
			if f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-home-elsewhere-%s.png", lang))); err == nil {
				_ = png.Encode(f, tt.Image())
				f.Close()
			}
		}
		// Its ⓘ says the work goes there.
		if err := tt.Click(L.T("chip.info") + " · " + L.T("chip.phone")); err != nil {
			t.Fatalf("%s: ⓘ: %v", lang, err)
		}
		tt.Frame()
		if !tt.HasText(L.T("ability.phone.elsewhere", "MacBook")) {
			t.Fatalf("%s: the ⓘ doesn't say where: %q", lang, tt.Texts())
		}
		// A tap opens the MacBook's card; nothing is asked of the core.
		var sent []any
		app.Send = func(f any) error { sent = append(sent, f); return nil }
		click(t, tt, chip("phone", L.T("chip.elsewhere", "MacBook")))
		if app.devState().sel != "dev_mac" || len(sent) != 0 {
			t.Fatalf("%s: the chip opened %q and sent %#v", lang, app.devState().sel, sent)
		}

		// Being installed there already points there; two computers: the awake one first, +1.
		mini := protocol.DeviceView{ID: "dev_mini", Name: "Mac mini", Kind: "mini", State: "asleep", Platform: "darwin-arm64", Abilities: []protocol.DeviceAbility{{ID: "phone", State: "on"}}}
		app = world(protocol.DeviceAbility{ID: "phone", State: "off", Setup: "installing"}, mini)
		tt = sheetTester(app, 1280, 860, true)
		if _, ok := tt.Find(chip("phone", L.T("chip.elsewhere.more", "MacBook", 1))); !ok {
			t.Fatalf("%s: no 用手机 · MacBook +1 in %q", lang, tt.Texts())
		}

		// No computer has 用手机: its ghost stays on a Linux home.
		app = world(protocol.DeviceAbility{ID: "phone", State: "off"})
		tt = sheetTester(app, 1280, 860, true)
		if _, ok := tt.Find(chip("phone", L.T("chip.state.later"))); !ok {
			t.Fatalf("%s: no 用手机 ghost when no computer has it: %q", lang, tt.Texts())
		}
	}
}
