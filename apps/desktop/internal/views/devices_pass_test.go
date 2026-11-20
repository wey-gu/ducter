package views

import (
	"fmt"
	"strings"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D398: at every width the Mac app takes, in both languages, nothing in
// the scene overlaps (names, coins, the pier's abilities, another island's
// clay) and nothing is cut by the stage's edge.
func TestDevicesPassMapFits(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, w := range []float32{1000, 1400, 1700} {
			app, tt := passApp(t, lang, w, 1100, false)
			lendFrame(tt)
			lendFrame(tt)
			labels := app.devState().labels
			checkLabels(t, fmt.Sprintf("%s-%v", lang, w), labels)
			stage := app.devState().stageR
			if stage.W == 0 {
				t.Fatalf("%s %v: no stage", lang, w)
			}
			for k, r := range labels {
				if r.W == 0 || strings.HasPrefix(k, "art:") {
					continue
				}
				if r.X < stage.X-1 || r.Y < stage.Y-1 || r.X+r.W > stage.X+stage.W+1 || r.Y+r.H > stage.Y+stage.H+1 {
					t.Errorf("%s %v: %s %v is cut by the stage %v", lang, w, k, r, stage)
				}
			}
			// One row of coins per island, never a tag per agent.
			if _, ok := labels["tok:dev:mac:claude-code"]; ok {
				t.Errorf("%s %v: an agent's coin still has a tag of its own", lang, w)
			}
			if _, ok := labels["coins:dev:mac"]; !ok {
				t.Errorf("%s %v: the MacBook's coins aren't on its island", lang, w)
			}
			// No mailboxes on home's rim, no ability glyphs on a worker's.
			for k := range labels {
				if strings.HasPrefix(k, "mail:") {
					t.Errorf("%s %v: %s is back on the stage", lang, w, k)
				}
			}
		}
	}
}

// D398: the Pixel Fold's card in the pass's order: what it is now, its
// chip, three marked promises, the lock step as a row, and the rest folded
// with exactly one destructive action in it.
func TestDevicesPassPhoneCard(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		app, tt := passApp(t, lang, 1400, 1100, false)
		var sent []any
		app.Send = func(f any) error { sent = append(sent, f); return nil }
		// The list: the one thing worth knowing per device; no header line repeating its first row.
		for _, want := range []string{L.T("list.state.ready"), L.T("list.state.lendable")} {
			if !tt.HasText(want) {
				t.Fatalf("%s: the list misses %q: %q", lang, want, tt.Texts())
			}
		}
		if tt.HasText(L.T("devices.subtitle", "Ducter", "Hetzner Server")) {
			t.Errorf("%s: the header still repeats where Ducter runs", lang)
		}
		sheet := &app.devState().card.sheet
		app.devState().selClient = "pix"
		lendFrame(tt)
		for _, want := range []string{L.T("handset.status.ready"), L.T("chip.handset"), L.T("handset.g"), L.T("handset.lock.row"), L.T("reach.how")} {
			if !tt.HasText(want) {
				t.Fatalf("%s: the card misses %q: %q", lang, want, tt.Texts())
			}
		}
		// Nothing that can wait shows by default: the steps, the connection, the destructive action.
		for _, not := range []string{L.T("handset.lock.s1"), L.T("reach.private"), L.T("card.disconnect.device", "Pixel Fold")} {
			if tt.HasText(not) {
				t.Errorf("%s: %q shows before it is asked for", lang, not)
			}
		}
		// The lock step opens in place: three steps and the never line.
		sheet.lockSteps = "pix"
		lendFrame(tt)
		for _, want := range []string{L.T("handset.lock.s1"), L.T("handset.lock.s2"), L.T("handset.lock.s3"), L.T("handset.lock.never")} {
			if !tt.HasText(want) {
				t.Fatalf("%s: the lock steps miss %q", lang, want)
			}
		}
		sheet.lockSteps = ""
		// The fold: how it's connected, then the one 断开.
		sheet.fold = "cl:pix"
		lendFrame(tt)
		danger := map[string]bool{}
		for _, s := range tt.Texts() {
			if s == L.T("card.disconnect.device", "Pixel Fold") || s == L.T("device.disconnect") || s == L.T("handset.remove") {
				danger[s] = true
			}
		}
		if len(danger) != 1 || !tt.HasText(L.T("reach.private")) || tt.HasText(L.T("card.via.more")) {
			t.Errorf("%s: the fold has %d kinds of destructive action: %q", lang, len(danger), tt.Texts())
		}
		// Turning the chip off asks first; yes sends handset_set off.
		sheet.fold = ""
		sheet.handOff = "pix"
		lendFrame(tt)
		if !tt.HasText(L.T("handset.off.ask")) {
			t.Fatalf("%s: no ask before turning it off: %q", lang, tt.Texts())
		}
		if err := tt.Click(spoken(L, L.T("handset.off.go"), "Pixel Fold")); err != nil {
			t.Fatal(err)
		}
		lendFrame(tt)
		if r, ok := lastSent[protocol.HandsetSetReq](sent); !ok || r.On || r.Device != "pix" {
			t.Errorf("%s: turning it off sent %#v", lang, sent)
		}
	}
}
