package views

import (
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D543's review: eight representative button rows on the Mac at 1150, zh
// light, each a full window and a 2x crop of its row, against a demo core:
//
//	DUCTER_PORT=7951 DUCTER_DATA_DIR=<scratch> DEMO_LANG=zh DEMO_KEYCOPY=1 bun apps/web/demo.ts
//	DUCTER_D543_URL=ws://127.0.0.1:7951/ws \
//	  DUCTER_SHOTS_DIR=<repo>/.shots/offline/buttons go test ./internal/views -run D543ButtonShots
//
// Each row's primary must stand first, left of every other button in it.
func TestD543ButtonShots(t *testing.T) {
	url := os.Getenv("DUCTER_D543_URL")
	if url == "" {
		t.Skip("DUCTER_D543_URL not set")
	}
	lang := i18n.ZH
	h := newLive(t, url, lang)
	h.app.LocaleFixed, h.app.L = true, i18n.New(lang)
	h.app.Local.SetAppearance("light")
	h.tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	h.tt.SetSize(1150, 900)
	T := h.app.L.T
	settle := func() {
		for i := 0; i < 10; i++ {
			h.until("frames", func() bool { return true })
			h.tt.Advance(200 * time.Millisecond)
		}
	}
	// The first text on screen that starts with these words, and its box.
	find := func(prefix string) (ui.Rect, string, bool) {
		// Exact words first (复制, not 复制到), then the first that starts with them.
		for _, s := range h.tt.Texts() {
			if s == prefix {
				if r, ok := h.tt.Find(s); ok && r.W > 0 {
					return r, s, true
				}
			}
		}
		for _, s := range h.tt.Texts() {
			if strings.HasPrefix(s, prefix) {
				if r, ok := h.tt.Find(s); ok && r.W > 0 {
					return r, s, true
				}
			}
		}
		return ui.Rect{}, "", false
	}
	write := func(name string, img image.Image) {
		f, err := os.Create(filepath.Join(shotsDir(t), name+".png"))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, img); err != nil {
			t.Fatal(err)
		}
	}
	// shoot writes the window, then the row of the button with primary's words at 2x, and checks
	// that nothing else in the row stands left of it (other is a quiet one in the same row).
	shoot := func(name, primary, other string) {
		t.Helper()
		settle()
		write(fmt.Sprintf("mac-1150-zh-light-%s", name), h.tt.Image())
		pr, pw, ok := find(primary)
		if !ok {
			t.Errorf("%s: no %q on screen", name, primary)
			return
		}
		if or, ow, ok := find(other); ok && other != "" && or.Y < pr.Y+pr.H && or.Y+or.H > pr.Y && or.X < pr.X {
			t.Errorf("%s: %q stands left of the primary %q", name, ow, pw)
		}
		h.tt.SetScale(2)
		h.tt.Frame()
		d539Crop(t, h.tt, 1150, image.Rect(int(pr.X-48), int(pr.Y-28), int(pr.X+560), int(pr.Y+pr.H+28)), fmt.Sprintf("mac-1150-zh-light-%s-row@2x", name))
		h.tt.SetScale(1)
		h.tt.Frame()
	}

	h.until("the asks", func() bool { return len(h.app.S.OpenDecisions()) >= 3 && h.app.S.Decisions["d_copy_both"] != nil })
	// 1: the push offer: the Mac's own 要我通知你吗 after a result came back.
	d := &fakeDesktop{}
	h.app.Desktop = d
	if h.app.Backend == nil {
		h.app.Backend = &fakeBackend{dir: t.TempDir()}
	}
	h.app.Local.MarkFirstResultSeen(time.Now())
	h.app.firstDone = nil
	h.app.doneAt = time.Now()
	shoot("1-push-offer", T("notify.yes"), T("ask.later"))
	h.app.Desktop, h.app.Backend, h.app.asks.shown = nil, nil, ""
	// 2, 6: a decision card and the key-copy card in the conversation.
	shoot("2-decision", "好，rebase", "先不用")
	shoot("6-key-copy", T("copykey.go"), T("copykey.hold"))
	// 3: a needs-you card in On hand.
	h.app.Route = RouteOnHand
	shoot("3-onhand-needs-you", T("copykey.go"), T("copykey.hold"))
	// 7: a sheet's foot: New task.
	h.app.OpenNewTask(nil)
	shoot("7-sheet-foot-newtask", T("newtask.start"), T("newtask.cancel"))
	h.app.Route = RouteOnHand
	h.app.nt.open = false
	// 8: an error card: the task that didn't work, opened.
	h.app.OpenTask("t_tokio")
	shoot("8-error-task", T("task.action.tell"), T("task.action.retry"))
	// 4: a settings card's end line: Settings › Accounts › Add.
	h.app.openTab(TabAccounts)
	h.app.partner.acctAdding = true
	shoot("4-settings-foot", T("acct.check"), T("acct.cancel"))
	h.app.partner.acctAdding = false
	// 5: a confirm: stopping this computer's tasks from its card.
	h.app.OpenDevices()
	h.until("the devices", func() bool { return h.app.S.Devices != nil })
	h.app.devState().sel = "local"
	h.app.devState().card.sheet.stopAsk = "local"
	shoot("5-confirm-stop", T("chip.stop.after"), T("chip.stop.now"))
}
