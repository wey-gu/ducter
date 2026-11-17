package views

import (
	"os"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// d314Done is a finished Update all: everything updated, or one that didn't.
func d314Done(failed bool) *protocol.UpdateAllView {
	items := uaItems()
	for i := range items {
		items[i].State = "done"
	}
	if failed {
		items[0].State, items[0].Reason, items[0].RolledBack = "failed", "health", true
	}
	return &protocol.UpdateAllView{Plan: &protocol.UpdateAllPlan{ID: "ua-d314", By: "user", FinishedAt: time.Now().UTC().Format(time.RFC3339), Items: items}}
}

// D314: 已全部更新's 完成 is the card's one decision, a small secondary
// clay button at the right edge; with a failure, 再试一次 is that button
// (last, at the right) and 完成 steps back to quiet text before it.
func TestD314UpdateAllDoneButton(t *testing.T) {
	_, tt, _ := uaApp(t, i18n.ZH, d314Done(false), true)
	done, ok := tt.Find("完成")
	if !ok {
		t.Fatalf("no 完成: %q", tt.Texts())
	}
	_, tt, _ = uaApp(t, i18n.ZH, d314Done(true), true)
	done, _ = tt.Find("完成")
	retry, ok := tt.Find("再试一次")
	if !ok {
		t.Fatalf("no 再试一次: %q", tt.Texts())
	}
	if done.X >= retry.X {
		t.Errorf("完成 (%v) should stand before 再试一次 (%v)", done.X, retry.X)
	}
}

// D314's Mac pictures of the finished Update all, light and dark:
//
//	DUCTER_D314_SHOTS=1 DUCTER_SHOTS_DIR=<repo>/.shots/d314a/after go test ./internal/views -run D314Shots
func TestD314Shots(t *testing.T) {
	if os.Getenv("DUCTER_D314_SHOTS") == "" {
		t.Skip("DUCTER_D314_SHOTS not set")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, failed := range []bool{false, true} {
			app, tt, _ := uaApp(t, lang, d314Done(failed), false)
			tt.SetSize(1280, 1300)
			name := "about-updated"
			if failed {
				name = "about-updated-failed"
			}
			d302Both(t, app, tt, func() { tt.Frame() }, name, lang)
		}
	}
}

// D314's Mac pictures against a demo core: Memory whole (Nowledge Mem's
// group at its foot) and Connected AI agents, light and dark:
//
//	DUCTER_D314_URL=ws://127.0.0.1:7920/ws DUCTER_D314_NAME=cloud DUCTER_SHELL_LANG=zh \
//	  DUCTER_SHOTS_DIR=<repo>/.shots/d314a/after go test ./internal/views -run D314Live
func TestD314LiveShots(t *testing.T) {
	url := os.Getenv("DUCTER_D314_URL")
	if url == "" {
		t.Skip("DUCTER_D314_URL not set")
	}
	lang := i18n.ZH
	if os.Getenv("DUCTER_SHELL_LANG") == "en" {
		lang = i18n.EN
	}
	h := newLive(t, url, lang)
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	settle := func() {
		for i := 0; i < 8; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	h.until("settings", func() bool { return true })
	for _, tab := range []string{TabMemory, TabPeers} {
		h.app.openTab(tab)
		h.until("settings", func() bool { return h.app.S.Settings != nil })
		h.tt.SetSize(1280, 2600)
		d302Both(t, h.app, h.tt, settle, "d314-"+os.Getenv("DUCTER_D314_NAME")+"-"+tab, lang)
	}
}
