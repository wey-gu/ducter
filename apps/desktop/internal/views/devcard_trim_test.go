package views

import (
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D420: the author on 0.1.0 with "Macbook Pro M3" chosen, a worker of the
// home on Hetzner Server with Nowledge Mem carried: Mem is its title and
// one line; the role is said once (the chip); what the computer uses and
// never sees is one plain sentence; the home says where the conversation
// is kept.
func TestDevcardTrim(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		app, _ := iaApp(t, lang)
		app.Status = client.Connected
		app.LocaleFixed = true
		app.Now = func() time.Time { return passNow }
		app.ThisComputer = "Weys-MacBook-Pro"
		app.MacWorker = &macWorkOn{on: true}
		app.Route = RouteDevices
		app.Receive(trimFrame(&protocol.DeviceMemView{State: "ready", Version: "0.10.120", Agents: []string{"claude-code", "codex"}, Carried: true}, nil))
		app.devState().sel = "dev_mac"
		tt := ui.NewTesterWith(app.View, 1400, 1300, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		lendFrame(tt)
		lendFrame(tt)
		persona := app.personaName()
		for _, want := range []string{L.T("wmem.carried", "Hetzner Server"), L.T("worker.g", persona), L.T("chip.worker", persona)} {
			if !tt.HasText(want) {
				t.Fatalf("%s: the card misses %q: %q", lang, want, tt.Texts())
			}
		}
		// The paragraph on which agents use it went with the old one on where it comes from.
		if tt.HasText(app.memReadyWords(app.S.Device("dev_mac"))) {
			t.Errorf("%s: the carried card still lists the agents", lang)
		}
		// The role once: the chip says 帮 Ducter 做事, the line under the name only that it is free.
		n := 0
		for _, s := range tt.Texts() {
			if s == L.T("card.status.does", persona) {
				n++
			}
		}
		if n > 1 { // the chip itself is one
			t.Errorf("%s: 帮…做事 said as a line beside its chip", lang)
		}
		if !tt.HasText(L.T("list.state.ready")) {
			t.Errorf("%s: no 待命 under the name: %q", lang, tt.Texts())
		}
		// haswell has no chip, so its line keeps the role.
		app.devState().sel = "haswell"
		lendFrame(tt)
		if !tt.HasText(L.T("card.status.does", persona)) || !tt.HasText(L.T("worker.g", persona)) {
			t.Errorf("%s: haswell's card: %q", lang, tt.Texts())
		}
		app.devState().sel = "local"
		lendFrame(tt)
		if !tt.HasText(L.T("home.g", persona)) {
			t.Errorf("%s: the home doesn't say where the conversation is kept: %q", lang, tt.Texts())
		}
		app.devState().sel, app.devState().selClient = "", "pix"
		lendFrame(tt)
		if !tt.HasText(L.T("handset.g")) {
			t.Errorf("%s: the lent phone's sentence: %q", lang, tt.Texts())
		}
	}
}
