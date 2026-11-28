package views

// D669 (#4): the before/after pictures of Mem's no reaching the person, from the real view in
// the test renderer: the Noted line after a spoken 别记这个 Mem refused, the policy_invalid line, the
// stuck mailbox with its code behind 详情, and 去 Nowledge Mem 看 on a server. Run in this tree for
// the after set and in a copy of the previous commit for the before set:
//
//	DUCTER_MEMNO_SHOTS=/path/.shots/memno/mac MEMNO_PHASE=after go test ./internal/views -run MemNoShots
//	DUCTER_MEMNO_SHOTS=/path/.shots/memno/mac-before MEMNO_PHASE=before go test ./internal/views -run MemNoShots

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

func memNoShot(t *testing.T, tt *ui.Tester, phase, name string, lang i18n.Lang, dark bool) {
	t.Helper()
	dir := os.Getenv("DUCTER_MEMNO_SHOTS")
	if dir == "" {
		return
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	theme := "light"
	if dark {
		theme = "dark"
	}
	f, err := os.Create(filepath.Join(dir, fmt.Sprintf("%s-mac-%s-%s-%s.png", phase, name, theme, lang)))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, tt.Image()); err != nil {
		t.Fatal(err)
	}
}

func TestMemNoShots(t *testing.T) {
	phase := os.Getenv("MEMNO_PHASE")
	if phase == "" {
		phase = "after"
	}
	dir := os.Getenv("DUCTER_MEMNO_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_MEMNO_SHOTS not set")
	}
	frames := func(tt *ui.Tester) {
		for i := 0; i < 5; i++ {
			tt.Advance(80 * time.Millisecond)
			tt.Frame()
		}
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			// 1. The Noted line: before, it reads noted with no word of the refusal; after, the
			// failed ink says it was not taken back.
			app, _ := d329Conversation(t, lang)
			tt := d329Tester(app, 1150, 760, dark)
			tt.SetScale(2)
			if phase == "after" {
				f := settingsFrame()
				f.Mem.Waiting = []int64{4}
				f.Undid = &protocol.Undid{Seq: 3, OK: false}
				app.Receive(f)
				tt.Frame()
			}
			memNoShot(t, tt, phase, "noted", lang, dark)

			// 2. A refusal Mem just opened a workspace to: before, the raw code was the line.
			app2, _ := memApp(t, lang, "on")
			if phase == "before" {
				app2.S.Bridge = &protocol.BridgeView{State: "failed", Identity: "ducter", Home: "hel", Detail: "Nowledge Mem: policy_invalid"}
			} else {
				app2.S.Bridge = &protocol.BridgeView{State: "refused", Reason: "policy_invalid", Identity: "ducter", Home: "hel"}
			}
			app2.openTab(TabPeers)
			tt2 := ui.NewTesterWith(app2.View, 1150, 2200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt2.SetDark(dark)
			tt2.SetScale(2)
			frames(tt2)
			memNoShot(t, tt2, phase, "refusal", lang, dark)

			// 3. The stuck mailbox: before, Mem's code was in the line; after, behind 详情.
			app3, _ := memApp(t, lang, "on")
			app3.S.Bridge = &protocol.BridgeView{State: "connected", Identity: "ducter", Home: "hel", Stuck: &protocol.BridgeStuck{Code: "cloud_mailbox_own_source_unreconciled"}}
			app3.openTab(TabPeers)
			tt3 := ui.NewTesterWith(app3.View, 1150, 2200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt3.SetDark(dark)
			tt3.SetScale(2)
			frames(tt3)
			memNoShot(t, tt3, phase, "stuck", lang, dark)
			if phase == "after" {
				if err := tt3.Click(i18n.New(lang).T("mem.details")); err != nil {
					t.Fatalf("%s: no 详情: %v", lang, err)
				}
				tt3.Frame()
				memNoShot(t, tt3, phase, "stuck-details", lang, dark)
			}

			// 4. 去 Nowledge Mem 看 on a server: before, it read 去 Nowledge Mem 看 and went to the site;
			// after, the label names the computer and the tap opens the app there.
			app4, _ := memApp(t, lang, "on")
			app4.S.Bridge = &protocol.BridgeView{State: "connected", Identity: "ducter", Home: "hel", Where: "server", Version: "0.10.125"}
			app4.openTab(TabMemory)
			tt4 := ui.NewTesterWith(app4.View, 1150, 2200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
			tt4.SetDark(dark)
			tt4.SetScale(2)
			frames(tt4)
			memNoShot(t, tt4, phase, "app-link", lang, dark)
		}
	}
}
