package views

import (
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D458: offers from past the accounts (a finished task, Mem, the
// conversation) sit in the morning note like any offer, each with its kind's
// name, one quiet line saying where it came from, and its one Go; none of
// them needs the person.

type widerRow struct{ kind, zh, en, originZh, originEn, goZh, goEn, src string }

var widerRows = []widerRow{
	{"next_step", "WAL group commit 合进去了，副本的 fsync 批量（#10562）还开着，要接着做吗？", "WAL group commit is merged; batching fsync for replicas (#10562) is still open. Pick it up?", "从 11 月 20 日做完的「WAL group commit」想到的", "From “WAL group commit”, done Nov 20", "接着做", "Pick it up", "task"},
	{"remembered", "周五 NH 920 还没选座。你说过出差要靠窗，要我看看还有哪些靠窗的位置吗？", "Friday's NH 920 has no seat yet. You like a window seat on trips; want me to see which are left?", "从你 10 月 2 日记下的想到的", "From what you noted on Oct 2", "看看座位", "See the seats", "mem"},
	{"loose_end", "你前天说回头看看 Weizhen 在 PR #10559 上的 review 意见，要我先理一下吗？", "Two days ago you said you'd look at Weizhen's review on PR #10559. Want me to sort the comments first?", "从你 11 月 19 日说的话想到的", "From what you said on Nov 19", "理一下", "Sort them", "you"},
	{"remembered", "join order 的代价模型和 Codex 聊到一半，cardinality 估计还没改，要接着做吗？", "You and Codex left the join-order cost model halfway; cardinality estimates aren't done. Pick it up?", "从你和 Codex 11 月 12 日的对话想到的", "From your conversation with Codex on Nov 12", "接着做", "Pick it up", "mem"},
}

var widerWhat = []string{"WAL group commit", "出差订座偏好", "回头看看 Weizhen 那个 PR #10559 的 review 意见", "HawDB planner join order cost model"}

func widerEvents(en bool) []protocol.LogEvent {
	open := "早。"
	if en {
		open = "Morning."
	}
	note := protocol.Finds{NoteID: "nw", Rung: "morning", Opening: open}
	evs := []protocol.LogEvent{}
	for i, r := range widerRows {
		text, label, origin := r.zh, r.goZh, r.originZh
		if en {
			text, label, origin = r.en, r.goEn, r.originEn
		}
		id := "fw" + itoa(int64(i))
		note.Finds = append(note.Finds, protocol.FindView{FindID: id, Kind: r.kind, Text: text, DecisionID: "dw" + itoa(int64(i)), GoLabel: label, Offer: true, Origin: origin,
			How: []protocol.FindHow{{Src: r.src, What: widerWhat[i], At: "2026-11-20T06:00:00Z"}}})
		evs = append(evs, ev("channel", protocol.KindDecision, protocol.Decision{DecisionID: "dw" + itoa(int64(i)), Question: text, GoLabel: label, DefaultOption: "hold", FindID: id, Offer: true}))
	}
	return append(evs, ev("channel", protocol.KindFinds, note))
}

func TestWiderOffersInTheNote(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	app.Receive(protocol.ServerFrame{T: "events", Events: widerEvents(false)})
	tt := ui.NewTesterWith(app.View, 1100, 1300, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.Frame()
	tt.Frame()
	// D482: where it came from stands under the words in place of a kind label over them.
	for _, gone := range []string{"接着可以做的", "记得的", "你提过的"} {
		if hasText(tt, gone) {
			t.Errorf("a kind label over an offer with its origin: %q", gone)
		}
	}
	for _, want := range []string{widerRows[0].originZh, widerRows[1].originZh} {
		if !hasText(tt, want) {
			t.Errorf("missing %q in %q", want, tt.Texts())
		}
	}
	if hasText(tt, "先等等") || len(app.S.OpenDecisions()) != 0 {
		t.Errorf("a wider offer needs the person: %q", tt.Texts())
	}
	*sent = nil
	if err := tt.Click("好，" + widerRows[0].goZh); err != nil {
		t.Fatal(err)
	}
	tt.Frame()
	if got := lastSentFrame(*sent); got != (protocol.Decide{T: "decide", DecisionID: "dw0", Option: "go"}) {
		t.Fatalf("Go sent %#v", *sent)
	}
}

// Shots for review (D75: outside git):
//
//	DUCTER_SHOTS_DIR=$PWD/../../../../.shots/offers-458/mac go test ./internal/views -run WiderShots
func TestWiderShots(t *testing.T) {
	dir := os.Getenv("DUCTER_SHOTS_DIR")
	if dir == "" {
		t.Skip("DUCTER_SHOTS_DIR not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			for _, stage := range []string{"folded", "open"} {
				app, _ := iaApp(t, lang)
				app.Status = client.Connected
				app.Receive(protocol.ServerFrame{T: "events", Events: widerEvents(lang == i18n.EN)})
				if stage == "open" {
					app.open["more:note:"+itoa(app.S.Channel[len(app.S.Channel)-1].FirstSeq)] = true
					app.open["how:fw1"] = true
				}
				tt := ui.NewTesterWith(app.View, 1400, 1200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetDark(dark)
				tt.SetScale(2)
				tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
				tt.Frame()
				tt.Advance(time.Second)
				tt.Frame()
				theme := "light"
				if dark {
					theme = "dark"
				}
				f, err := os.Create(filepath.Join(dir, "mac-"+stage+"-"+string(lang)+"-"+theme+".png"))
				if err != nil {
					t.Fatal(err)
				}
				if err := png.Encode(f, tt.Image()); err != nil {
					t.Fatal(err)
				}
				f.Close()
			}
		}
	}
}
