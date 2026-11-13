package views

import (
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// The device list's 有更新 / Update available sits inside its row, under the
// name, in a wide window and a narrow one; the name never collapses to "…"
// for it (it did: the hint took the row and spilled past its edge).
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../.shots/header-update go test ./internal/views -run DeviceListUpdate
func TestDeviceListUpdate(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		t.Run(string(lang), func(t *testing.T) {
			h := openDevices(t, lang, false)
			h.tt.SetScale(2)
			cardWorld(h)
			L := h.app.L
			for _, size := range []struct {
				name string
				w, h int
			}{{"wide", 1280, 860}, {"narrow", 900, 760}} {
				h.tt.SetSize(size.w, size.h)
				h.settle(300 * time.Millisecond)
				h.shotAs("devices-list-" + string(lang) + "-" + size.name)
				// The first of each is the home's row in the list.
				row, ok := h.tt.Find("vps-1 · " + L.T("list.state.home") + " · " + L.T("devices.update_word"))
				name, okName := h.tt.Find("vps-1")
				up, okUp := h.tt.Find(L.T("devices.update_word"))
				if !ok || !okName || !okUp {
					t.Fatalf("%s: the home's row, name or 有更新 missing in %q", size.name, h.tt.Texts())
				}
				for what, r := range map[string]struct{ X, Y, W, H float32 }{"name": {name.X, name.Y, name.W, name.H}, "update": {up.X, up.Y, up.W, up.H}} {
					if r.X < row.X-0.5 || r.X+r.W > row.X+row.W+0.5 || r.Y < row.Y-0.5 || r.Y+r.H > row.Y+row.H+0.5 {
						t.Errorf("%s: the %s %+v runs out of its row %+v", size.name, what, r, row)
					}
				}
				// The name keeps its room: never "…" for the words after it.
				if name.W < 30 {
					t.Errorf("%s: the name squeezed to %.0f points", size.name, name.W)
				}
			}
		})
	}
}
