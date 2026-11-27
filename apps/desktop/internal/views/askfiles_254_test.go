package views

import (
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// #254: a task's question carries what it showed (an image and files) on the
// question's own card, before the person answers: the conversation, On hand
// and the opened task, drawn with the media pieces a message uses (D206).
func askFilesRefs(t *testing.T, h *fakeHome) []protocol.MediaRef {
	t.Helper()
	img := h.ref(t, generated(), "t_ask")
	file := func(name, typ, body string) protocol.MediaRef {
		r := h.put([]byte(body), "", name)
		r.Type = typ
		return r
	}
	return []protocol.MediaRef{
		img,
		file("季度报告.pdf", "application/pdf", "%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n"),
		file("README.md", "text/markdown", "# 调研报告\n\n结论：先补齐两处。\n"),
		file("数据.csv", "text/csv", "项目,数量\nA,12\nB,7\n"),
		file("交付.zip", "application/zip", "PK\x03\x04ask-files"),
	}
}

func askFilesEvents(refs []protocol.MediaRef) []protocol.LogEvent {
	ts := protocol.TaskStream("t_ask")
	return []protocol.LogEvent{
		mev(1, 9*time.Minute, ts, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t_ask", Title: "看这份报告", Harness: "codex", Place: protocol.Place{Kind: "none"}, Brief: "看一下截图和报告，结论站得住吗？"}),
		mev(2, 8*time.Minute, ts, protocol.OriginTask, protocol.KindReport, protocol.Report{TaskID: "t_ask", State: "needs_input", Summary: "看一下截图和报告，结论站得住吗？", Media: refs, Questions: []protocol.Question{{ID: "q", Text: "按这个结论发出去吗？", Blocking: true}}}),
		mev(3, 8*time.Minute, "channel", protocol.OriginSystem, protocol.KindDecision, protocol.Decision{DecisionID: "d_ask", TaskID: "t_ask", Question: "按这个结论发出去吗？", GoLabel: "发出去", DefaultOption: "hold", Reversible: false, Media: refs}),
		mev(4, 8*time.Minute, ts, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: "t_ask", Attention: protocol.NeedsYou, Residency: protocol.Hot}),
	}
}

func TestAskFilesOnCard254(t *testing.T) {
	app, _, h := mediaApp(t, i18n.ZH)
	app.LocaleFixed = true
	refs := askFilesRefs(t, h)
	app.Receive(protocol.ServerFrame{T: "events", Events: askFilesEvents(refs)})
	// The conversation: the question's card carries the image tile and every file row.
	tt := mediaTester(app, 1150, 1000)
	for _, want := range []string{"季度报告.pdf", "README.md", "数据.csv", "交付.zip"} {
		if !hasText(tt, want) {
			t.Errorf("conversation card: no %q in %q", want, tt.Texts())
		}
	}
	if _, ok := tt.Find(app.L.T("media.image")); !ok {
		t.Errorf("conversation card: the picture is not drawn: %q", tt.Texts())
	}
	if items := app.mediaOf("conv"); len(items) != 1 || items[0].ID != refs[0].ID {
		t.Errorf("the viewer does not hold the question's picture: %+v", items)
	}

	// On hand: the task's Needs you card draws the same files.
	app.Route = RouteOnHand
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{{
		TaskID: "t_ask", Persona: "default", Title: "看这份报告", Attention: protocol.NeedsYou, Residency: protocol.Hot,
		PendingDecisionID: "d_ask", UpdatedAt: time.Now().UTC().Format(time.RFC3339),
	}}, Counts: protocol.Counts{NeedsYou: 1}}})
	ot := mediaTester(app, 1150, 1000)
	for _, want := range []string{"季度报告.pdf", "README.md", "数据.csv", "交付.zip"} {
		if !hasText(ot, want) {
			t.Errorf("On hand card: no %q in %q", want, ot.Texts())
		}
	}

	// The opened task: its question card too.
	app.OpenTask("t_ask")
	tt = mediaTester(app, 1150, 1000)
	if !hasText(tt, "季度报告.pdf") || !hasText(tt, "交付.zip") {
		t.Errorf("task card: the files are not drawn: %q", tt.Texts())
	}
}

// Shots: DUCTER_ASKFILES_SHOTS=../../../../.shots/ask-files go test ./internal/views -run AskFilesShots
func TestAskFilesShots(t *testing.T) {
	dir := os.Getenv("DUCTER_ASKFILES_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_ASKFILES_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	shot := func(app *App, w, h int, dark bool, name string) {
		tt := ui.NewTesterWith(app.View, w, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetScale(2)
		tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
		tt.SetDark(dark)
		tt.Advance(time.Second) // the appearance, settled
		// A file's glimpse and the pictures arrive over the fake home: let them land and the
		// list follow to its end before the frame is taken.
		for i := 0; i < 12; i++ {
			tt.Frame()
			time.Sleep(20 * time.Millisecond)
		}
		f, err := os.Create(filepath.Join(dir, name+".png"))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, tt.Image()); err != nil {
			t.Fatal(err)
		}
	}
	for _, dark := range []bool{false, true} {
		app, _, h := mediaApp(t, i18n.ZH)
		app.LocaleFixed = true
		app.Receive(protocol.ServerFrame{T: "events", Events: askFilesEvents(askFilesRefs(t, h))})
		// Read to the end, so the shot opens on the newest row (the question) rather than
		// on the 新消息 landing, which would cut a tall card at its middle.
		app.S.ReadUpTo = 1000
		theme := "light"
		if dark {
			theme = "dark"
		}
		shot(app, 1150, 1500, dark, "mac-conversation-1150-"+theme+"-zh")
		app.Route = RouteOnHand
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{{
			TaskID: "t_ask", Persona: "default", Title: "看这份报告", Attention: protocol.NeedsYou, Residency: protocol.Hot,
			PendingDecisionID: "d_ask", UpdatedAt: time.Now().UTC().Format(time.RFC3339),
		}}, Counts: protocol.Counts{NeedsYou: 1}}})
		shot(app, 1150, 1500, dark, "mac-onhand-1150-"+theme+"-zh")
	}
}
