package views

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"strings"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D248 on the Mac: asleep with Wake (looking never wakes the phone), the
// turn that waits for the step in flight, what it did, and the last frame
// held under a view that opens again.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../../../.shots/computer-use-presence \
//	  go test ./internal/views -run ScreenPresence

// fakeFrame is a phone-shaped JPEG: a cream screen with a mint band.
func fakeFrame(t *testing.T) string {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 360, 800))
	for y := 0; y < 800; y++ {
		for x := 0; x < 360; x++ {
			c := color.RGBA{0xfb, 0xf4, 0xe8, 0xff}
			if y < 120 {
				c = color.RGBA{0x6f, 0xcf, 0x9f, 0xff}
			} else if y > 680 && y < 740 && x > 30 && x < 330 {
				c = color.RGBA{0xff, 0x8a, 0x3d, 0xff}
			} else if (y/40)%3 == 1 && x > 30 && x < 300 && y > 160 && y < 640 {
				c = color.RGBA{0xe8, 0xdc, 0xc8, 0xff}
			}
			img.Set(x, y, c)
		}
	}
	var b bytes.Buffer
	if err := jpeg.Encode(&b, img, &jpeg.Options{Quality: 80}); err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(b.Bytes())
}

func TestScreenPresence(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		t.Run(string(lang), func(t *testing.T) {
			h := newHarness(t, lang)
			L := h.app.L
			view := func(state string, extra func(f *protocol.ServerFrame)) {
				f := protocol.ServerFrame{T: "phone_view", ID: "ph_1", State: state, Mode: "watch", Turn: "agent", Device: "MacBook", TaskID: "t1", Task: &protocol.LiveTask{Title: "看看小红书上的周末去处", Harness: "claude-code"}}
				if extra != nil {
					extra(&f)
				}
				h.receive(f)
				h.tt.Frame()
			}

			// Asleep: the drawn phone, why, and Wake; no My turn.
			h.app.OpenPhone("local", "t1", "", "watch")
			view("asleep", nil)
			texts := strings.Join(h.tt.Texts(), "|")
			for _, k := range []string{"phoneuse.asleep.title", "phoneuse.asleep.task", "phoneuse.wake"} {
				if !strings.Contains(texts, L.T(k)) {
					t.Fatalf("asleep: no %q in %q", L.T(k), texts)
				}
			}
			if strings.Contains(texts, L.T("live.myturn")) {
				t.Fatalf("asleep shows My turn: %q", texts)
			}
			h.shotAs(fmt.Sprintf("mac-%s-asleep", lang))
			h.clickFound(L.T("phoneuse.wake"))
			if pv := h.app.S.Phone.View; pv == nil || !pv.Waking {
				t.Fatalf("Wake didn't wake: %+v", pv)
			}

			// Open, with a frame, and what it did.
			view("open", nil)
			h.receive(protocol.ServerFrame{T: "phone_frame", ID: "ph_1", Seq: 1, Data: fakeFrame(t), Width: 720, Height: 1600})
			h.receive(protocol.ServerFrame{T: "phone_did", ID: "ph_1", Did: []protocol.PhoneDid{{Kind: "open", App: "小红书", At: 1}, {Kind: "type", Label: "搜索", At: 2}, {Kind: "tap", Label: "周末去哪儿", At: 3}}})
			h.settle(500 * 1e6)
			texts = strings.Join(h.tt.Texts(), "|")
			for _, s := range []string{L.T("phoneuse.did.title"), L.T("phoneuse.did.tap", "周末去哪儿"), L.T("phoneuse.did.open", "小红书")} {
				if !strings.Contains(texts, s) {
					t.Fatalf("did: no %q in %q", s, texts)
				}
			}
			h.shotAs(fmt.Sprintf("mac-%s-did", lang))

			// My turn mid-step: it waits for the step.
			view("open", func(f *protocol.ServerFrame) { f.Taking = true })
			texts = strings.Join(h.tt.Texts(), "|")
			if !strings.Contains(texts, L.T("phoneuse.taking")) || strings.Contains(texts, L.T("live.myturn")) {
				t.Fatalf("taking: %q", texts)
			}
			h.shotAs(fmt.Sprintf("mac-%s-taking", lang))

			// Closed and opened again: the last frame stays, quiet, under one line.
			h.app.ClosePhone(false)
			h.tt.Frame()
			h.app.OpenPhone("local", "t1", "", "watch")
			h.receive(protocol.ServerFrame{T: "phone_view", ID: "ph_2", State: "open", Mode: "watch", Turn: "agent", Device: "MacBook", TaskID: "t1"})
			h.tt.Frame()
			if h.app.pu.bmp == nil {
				t.Fatal("the held frame was dropped")
			}
			texts = strings.Join(h.tt.Texts(), "|")
			if !strings.Contains(texts, L.T("phoneuse.again")) {
				t.Fatalf("held: no %q in %q", L.T("phoneuse.again"), texts)
			}
			h.shotAs(fmt.Sprintf("mac-%s-held", lang))
			h.app.ClosePhone(false)
		})
	}
}
