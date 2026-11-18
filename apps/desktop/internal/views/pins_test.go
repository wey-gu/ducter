package views

import (
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/hints"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D381: 置顶 / Pinned on the Mac: the card's corner pins, the strip names
// the newest, a pinned list's ticks go to the home, the sheet unpins.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=<repo>/.shots/gap-1 go test ./internal/views -run PinsShots

func pinWords(lang i18n.Lang, zh, en string) string {
	if lang == i18n.ZH {
		return zh
	}
	return en
}

func pinsList(lang i18n.Lang) protocol.RichUI {
	items := []string{"护照", "日元现金", "充电器和转换插头", "ICOCA 卡", "折叠伞", "酒店确认单"}
	title := "大阪行李清单"
	if lang == i18n.EN {
		items = []string{"Passport", "Yen in cash", "Charger and plug adapter", "ICOCA card", "Folding umbrella", "Hotel confirmation"}
		title = "Osaka packing list"
	}
	plain := title
	for _, x := range items {
		plain += "\n- " + x
	}
	return protocol.RichUI{Type: "checklist", Title: title, Items: items, Plain: plain}
}

func pinsTable(lang i18n.Lang) protocol.RichUI {
	if lang == i18n.ZH {
		return protocol.RichUI{Type: "table", Title: "两台 Mac 做家", Columns: []string{"", "Mac mini M4", "MacBook Air M4"}, Rows: [][]string{{"价格", "$599", "$999"}, {"内存", "16 GB", "16 GB"}, {"供电", "一直插电", "电池"}}, Plain: "两台 Mac 做家\n- 价格：Mac mini M4 $599，MacBook Air M4 $999\n- 内存：Mac mini M4 16 GB，MacBook Air M4 16 GB\n- 供电：Mac mini M4 一直插电，MacBook Air M4 电池"}
	}
	return protocol.RichUI{Type: "table", Title: "Two Macs as a home", Columns: []string{"", "Mac mini M4", "MacBook Air M4"}, Rows: [][]string{{"Price", "$599", "$999"}, {"Memory", "16 GB", "16 GB"}, {"Power", "Always plugged in", "Battery"}}, Plain: "Two Macs as a home\n- Price: Mac mini M4 $599, MacBook Air M4 $999\n- Memory: Mac mini M4 16 GB, MacBook Air M4 16 GB\n- Power: Mac mini M4 Always plugged in, MacBook Air M4 Battery"}
}

func pinsApp(t *testing.T, lang i18n.Lang) (*App, *[]any) {
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	app.Local = hints.Open(t.TempDir())
	ts := time.Now().UTC().Format(time.RFC3339Nano)
	table, list := pinsTable(lang), pinsList(lang)
	evs := []protocol.LogEvent{
		protocol.NewEvent(1, ts, "default", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: pinWords(lang, "两台 Mac 比一下", "Compare the two Macs")}),
		protocol.NewEvent(2, ts, "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: pinWords(lang, "做家选 Mac mini。", "The Mac mini.") + "\n\n" + table.Plain, UI: []protocol.RichUI{table}, ReplyTo: 1}),
		protocol.NewEvent(3, ts, "default", "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: pinWords(lang, "列个大阪的行李清单", "A packing list for Osaka")}),
		protocol.NewEvent(4, ts, "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: pinWords(lang, "给你。", "Here you go.") + "\n\n" + list.Plain, UI: []protocol.RichUI{list}, ReplyTo: 3}),
	}
	app.Receive(protocol.ServerFrame{T: "welcome", Persona: "default", PersonaName: "Ducter", HeadSeq: 4})
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	app.Receive(protocol.ServerFrame{T: "pins", Pins: []protocol.PinView{}})
	return app, sent
}

func pinned(lang i18n.Lang, ticks ...string) []protocol.PinView {
	at := time.Now().Add(-20 * time.Minute).UTC().Format(time.RFC3339)
	return []protocol.PinView{
		{ID: "pa1b2c3d4", UI: pinsList(lang), Title: pinsList(lang).Title, Seq: 4, Index: 0, Ticks: ticks, At: at, Version: 1},
		{ID: "pe5f6a7b8", UI: pinsTable(lang), Title: pinsTable(lang).Title, Seq: 2, Index: 0, At: at, Version: 1},
	}
}

func TestPinsCornerStripTicksAndUnpin(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent := pinsApp(t, lang)
		tt := ui.NewTesterWith(app.View, 1280, 1400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		tt.Frame()
		// Nothing pinned: each pinnable card offers 置顶 by its title; no strip.
		if err := tt.Click(app.L.T("pin.pin.about", pinsList(lang).Title)); err != nil {
			t.Fatalf("%s: %v", lang, err)
		}
		tt.Frame()
		if p, ok := (*sent)[len(*sent)-1].(protocol.Pin); !ok || p.Seq != 4 || p.Index != 0 {
			t.Fatalf("%s: sent %#v", lang, (*sent)[len(*sent)-1])
		}
		// The home's answer: the strip names the newest with its progress and how many more.
		app.Receive(protocol.ServerFrame{T: "pins", Pins: pinned(lang, pinsList(lang).Items[0])})
		tt.Frame()
		tt.Frame()
		all := strings.Join(tt.Texts(), "\n")
		for _, s := range []string{app.L.T("pin.pinned"), "1/6", app.L.T("pin.more", 1)} {
			if !strings.Contains(all, s) {
				t.Errorf("%s: lacks %q in %q", lang, s, all)
			}
		}
		// A tick on the pinned list goes to the home, not this Mac's own ticks.
		item := pinsList(lang).Items[2]
		if err := tt.Click(autospace(item)); err != nil {
			t.Fatalf("%s: %v", lang, err)
		}
		tt.Frame()
		if p, ok := (*sent)[len(*sent)-1].(protocol.PinTick); !ok || p.ID != "pa1b2c3d4" || p.Item != item || !p.On {
			t.Fatalf("%s: sent %#v", lang, (*sent)[len(*sent)-1])
		}
		if got := app.Local.Ticks("4.0"); len(got) != 0 {
			t.Errorf("%s: a pinned tick kept on the Mac %v", lang, got)
		}
		// The sheet: Unpin.
		if err := tt.Click(app.L.T("pin.open", pinsList(lang).Title)); err != nil {
			t.Fatalf("%s: %v", lang, err)
		}
		tt.Frame()
		if !app.pins.open {
			t.Fatalf("%s: the sheet didn't open", lang)
		}
		if err := tt.Click(app.L.T("pin.unpin")); err != nil {
			t.Fatalf("%s: %v", lang, err)
		}
		tt.Frame()
		if u, ok := (*sent)[len(*sent)-1].(protocol.Unpin); !ok || u.ID == "" {
			t.Fatalf("%s: sent %#v", lang, (*sent)[len(*sent)-1])
		}
		// A refusal is said once.
		app.Receive(protocol.ServerFrame{T: "pins", Pins: pinned(lang), Refused: "full"})
		tt.Frame()
		if app.S.PinRefused != "" {
			t.Errorf("%s: the refusal wasn't said", lang)
		}
	}
}

func TestPinsShots(t *testing.T) {
	if os.Getenv("DUCTER_SHOTS") == "" {
		t.Skip("DUCTER_SHOTS not set")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, size := range [][2]int{{1280, 900}, {720, 1300}} {
			for _, mode := range []string{"light", "dark"} {
				app, _ := pinsApp(t, lang)
				app.Receive(protocol.ServerFrame{T: "pins", Pins: pinned(lang, pinsList(lang).Items[0], pinsList(lang).Items[3])})
				tt := ui.NewTesterWith(app.View, size[0], size[1], ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetScale(2)
				app.Local.SetAppearance(mode)
				w := "wide"
				if size[0] < 1000 {
					w = "narrow"
				}
				settle := func() {
					for i := 0; i < 4; i++ {
						tt.Frame()
						tt.Advance(400 * time.Millisecond)
					}
				}
				settle()
				shotTester(t, tt, fmt.Sprintf("mac-pins-strip-%s-%s-%s", w, lang, mode))
				app.openPins("pa1b2c3d4")
				settle()
				shotTester(t, tt, fmt.Sprintf("mac-pins-sheet-%s-%s-%s", w, lang, mode))
			}
		}
	}
}
