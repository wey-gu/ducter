package views

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D541's budget: a switch draws the other partner's conversation in the
// very next frame, with nothing from the link (a fake socket that answers
// nothing, a fake clock): for a partner shown before, as it was left (its
// place in the list, its draft), and for one never shown, from its peek. The
// hello asks only for what is newer than what is held; the bar and the
// composer never move.

// d541Talk is n exchanges in a partner's conversation from seq on.
func d541Talk(tag string, from int64, n int) []protocol.LogEvent {
	var out []protocol.LogEvent
	at := time.Date(2026, 11, 24, 8, 0, 0, 0, time.UTC)
	for i := 0; i < n; i++ {
		seq := from + int64(2*i)
		ts := at.Add(time.Duration(i) * time.Minute).Format(time.RFC3339)
		out = append(out,
			protocol.LogEvent{Seq: seq, TS: ts, Stream: "channel", Origin: "user", Kind: "user_msg", Body: mustRaw(map[string]any{"text": fmt.Sprintf("%s 问 %d", tag, i)})},
			protocol.LogEvent{Seq: seq + 1, TS: ts, Stream: "channel", Origin: "partner", Kind: "ai_msg", Body: mustRaw(map[string]any{"text": fmt.Sprintf("%s 答 %d", tag, i), "replyTo": seq})},
		)
	}
	return out
}

// d541App is the window with four partners, showing the default's long
// conversation, connected to a socket that records what it is sent.
func d541App(t *testing.T) (*App, *ui.Tester, *[]any) {
	t.Helper()
	app, sent := iaApp(t, i18n.ZH)
	app.LocaleFixed = true
	app.Status = client.Connected
	app.Receive(protocol.ServerFrame{T: "partners", Shown: "default", Partners: d513Partners(i18n.ZH)})
	app.Receive(protocol.ServerFrame{T: "events", Events: d541Talk("工作", 1000, 400)})
	tt := ui.NewTesterWith(app.View, 1150, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	d513Frames(tt)
	return app, tt, sent
}

func peeksSent(sent []any) map[string]bool {
	out := map[string]bool{}
	for _, f := range sent {
		if p, ok := f.(protocol.PartnerPeekReq); ok {
			out[p.Persona] = true
		}
	}
	return out
}

func lastHello(t *testing.T, sent []any) protocol.Hello {
	t.Helper()
	for i := len(sent) - 1; i >= 0; i-- {
		if h, ok := sent[i].(protocol.Hello); ok {
			return h
		}
	}
	t.Fatal("no hello sent")
	return protocol.Hello{}
}

func TestD541SwitchVisitedInOneFrame(t *testing.T) {
	app, tt, sent := d541App(t)
	if !hasText(tt, autospace("工作 答 399")) {
		t.Fatalf("the default's conversation is not at its end: %q", tt.Texts())
	}
	// The others' newest stretch is asked for once connected.
	if got := peeksSent(*sent); !got["p2"] || !got["p3"] || !got["p4"] || got["default"] {
		t.Fatalf("peeks asked: %v", got)
	}
	composer := func() ui.Rect {
		r, ok := tt.Find(app.L.T("composer.placeholder", app.S.PersonaName))
		if !ok {
			r, _ = tt.Find(app.draft)
		}
		return r
	}
	// Read up the default's conversation a little, and start a draft there.
	app.list.ScrollTo(300, ui.Start)
	d513Frames(tt)
	first, _ := app.list.Visible()
	if app.list.AtEnd() || first == 0 {
		t.Fatalf("the reader is not up the list: row %d", first)
	}
	app.draft = "明早的站会"
	d513Frames(tt)

	// To 小家, never shown and not peeked yet: its hello asks from the start.
	app.SwitchPartner("p2")
	if h := lastHello(t, *sent); h.Persona != "p2" || h.Cursor != nil {
		t.Fatalf("a first switch's hello: %+v", h)
	}
	if app.draft != "" {
		t.Errorf("the default's draft followed to 小家: %q", app.draft)
	}
	// A frame of the default's still on the way is not 小家's.
	app.Receive(protocol.ServerFrame{T: "events", Events: d541Talk("迟到", 2000, 1)})
	if len(app.S.Channel) != 0 {
		t.Fatalf("the left conversation's late frame landed in 小家's")
	}
	app.Receive(protocol.ServerFrame{T: "welcome", Persona: "p2", PersonaName: "小家", HeadSeq: 3000})
	app.Receive(protocol.ServerFrame{T: "events", Events: d541Talk("家里", 2500, 30)})
	d513Frames(tt)
	if !hasText(tt, autospace("家里 答 29")) {
		t.Fatalf("小家's conversation: %q", tt.Texts())
	}
	n := len(*sent)
	bar, _ := tt.Find(app.L.T("partners.here", "小家"))
	_ = bar

	// Back to the default: drawn in the very next frame, with no frame from the link.
	app.SwitchPartner("default")
	tt.Frame()
	if !hasText(tt, autospace("工作 问 150")) || hasText(tt, autospace("家里 答 29")) {
		t.Fatalf("the default's conversation was not drawn in one frame: %q", tt.Texts())
	}
	if f, _ := app.list.Visible(); f != first {
		t.Errorf("the default's place in its list: row %d, was %d", f, first)
	}
	if app.draft != "明早的站会" {
		t.Errorf("the default's draft: %q", app.draft)
	}
	h := lastHello(t, (*sent)[n:])
	if h.Persona != "" || h.Cursor == nil || *h.Cursor != 1799 {
		t.Errorf("the hello back asks from what is held: %+v", h)
	}
	// What came since lands quietly, at the end.
	app.Receive(protocol.ServerFrame{T: "welcome", Persona: "default", PersonaName: "Ducter", HeadSeq: 3100})
	app.Receive(protocol.ServerFrame{T: "events", Events: d541Talk("工作新", 3050, 1)})
	tt.Frame()
	if f, _ := app.list.Visible(); f != first {
		t.Errorf("the reader's place moved when what is newer landed: row %d, was %d", f, first)
	}
	_ = composer
}

func TestD541SwitchPeekedInOneFrame(t *testing.T) {
	app, tt, sent := d541App(t)
	// The home answers the peeks.
	for i, id := range []string{"p2", "p3", "p4"} {
		evs := d541Talk(fmt.Sprintf("伙伴%d", i+2), int64(5000+1000*i), 25)
		app.Receive(protocol.ServerFrame{T: "partner_peek", Persona: id, Events: evs, HeadSeq: 9000, More: true})
	}
	if len(app.S.Channel) == 0 || app.S.Persona != "default" {
		t.Fatalf("a peek changed the conversation shown")
	}
	n := len(*sent)
	before, _ := tt.Find(app.L.T("composer.placeholder.short"))
	_ = before
	app.SwitchPartner("p3")
	tt.Frame()
	if !hasText(tt, autospace("伙伴3 答 24")) {
		t.Fatalf("多比's peek was not drawn in one frame: %q", tt.Texts())
	}
	if hasText(tt, autospace("工作 答 399")) {
		t.Fatalf("the default's words are still shown")
	}
	h := lastHello(t, (*sent)[n:])
	if h.Persona != "p3" || h.Cursor == nil || *h.Cursor != 6049 {
		t.Fatalf("the hello asks from the peek's end: %+v", h)
	}
	if !h.Gzip {
		t.Errorf("the switch's hello reads big frames gzipped")
	}
	// The bar names 多比 in that same frame.
	if !hasText(tt, "多比") {
		t.Errorf("the bar doesn't name 多比")
	}
}

func mustRaw(v any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return b
}

// TestD541ChromeStill:the bar and the composer stay exactly where they are
// through a switch, frame by frame, with motion on.
func TestD541ChromeStill(t *testing.T) {
	app, _, _ := d541App(t)
	for i, id := range []string{"p2", "p3", "p4"} {
		app.Receive(protocol.ServerFrame{T: "partner_peek", Persona: id, Events: d541Talk(fmt.Sprintf("伙伴%d", i+2), int64(5000+1000*i), 25), HeadSeq: 9000, More: true})
	}
	tt := ui.NewTesterWith(app.View, 1150, 900, ui.TesterOptions{})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	d513Frames(tt)
	// The composer's send button and the bar's places, by their names.
	still := []string{"发送", "你的设备", "设置"}
	at := map[string]ui.Rect{}
	for _, s := range still {
		r, ok := tt.Find(s)
		if !ok {
			t.Fatalf("no %q to measure by: %q", s, tt.Texts())
		}
		at[s] = r
	}
	app.SwitchPartner("p4")
	for i := 0; i < 8; i++ {
		if i == 0 {
			tt.Frame()
		} else {
			tt.Advance(16 * time.Millisecond)
		}
		for _, s := range still {
			if r, _ := tt.Find(s); r != at[s] {
				t.Fatalf("frame %d: %q moved: %v, was %v", i, s, r, at[s])
			}
		}
		if !hasText(tt, autospace("伙伴4 答 24")) || !hasText(tt, "小新") {
			t.Fatalf("frame %d: 小新's conversation is not drawn: %q", i, tt.Texts())
		}
	}
}
