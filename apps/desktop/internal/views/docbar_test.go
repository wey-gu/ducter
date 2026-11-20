package views

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D439: a document to send. The deck a task made comes back as one card
// that reads as its pages (the PDF it showed with it rides on the deck);
// what the page check still found is said under the result and in the
// opened task's outcome, in the person's language; clean pages say nothing.
var docWords = map[i18n.Lang]struct{ ask, ack, title, said, left, file string }{
	i18n.ZH: {"做个 5 页的融资 deck", "我去做，好了给你看。", "Ducter 融资 deck", "融资 deck 做好了：问题、做法、进展、要多少钱，再加一页团队。", "要的是 5 张，做出来 6 张", "Ducter 融资.pptx"},
	i18n.EN: {"Make a 5-slide pitch deck", "On it; I'll show you when it's ready.", "Ducter pitch deck", "The pitch deck is ready: the problem, what we do, where it stands, the ask, and a team slide.", "You asked for 5; it has 6 slides", "Ducter pitch.pptx"},
}

func docApp(t *testing.T, lang i18n.Lang) (*App, *ui.Tester) {
	t.Helper()
	w := docWords[lang]
	app, _ := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	now := time.Now()
	n := int64(0)
	at := func(ago time.Duration, stream string, origin protocol.Origin, kind string, body any) protocol.LogEvent {
		n++
		return protocol.NewEvent(n, now.Add(-ago).UTC().Format(time.RFC3339Nano), "default", stream, origin, kind, body)
	}
	id, ts := "t_deck", protocol.TaskStream("t_deck")
	deck := protocol.MediaRef{ID: strings.Repeat("a", 64), Type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", Bytes: 48_200, Name: w.file, K: "k1",
		From: &protocol.MediaFrom{TaskID: id}, Pages: &protocol.MediaPages{ID: strings.Repeat("b", 64), K: "k2", Bytes: 91_400, N: 6}}
	evs := []protocol.LogEvent{
		at(9*time.Minute, "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: w.ask}),
		at(9*time.Minute, "channel", protocol.OriginPartner, protocol.KindAck, protocol.Ack{JobID: "j1", Text: w.ack, ReplyTo: 1}),
		at(9*time.Minute, ts, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: w.title, Harness: "claude-code", Place: protocol.Place{Kind: "none"}, Brief: w.ask}),
		at(9*time.Minute, "channel", protocol.OriginPartner, protocol.KindJobStatus, protocol.JobStatus{JobID: "j1", Text: w.title, State: "running", TaskID: id}),
		at(3*time.Minute, ts, protocol.OriginTask, protocol.KindReport, protocol.Report{TaskID: id, State: "done", Summary: w.said, Media: []protocol.MediaRef{deck},
			Doc: &protocol.DocCheck{Pages: 6, Left: []string{w.left}}}),
		at(3*time.Minute, ts, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: protocol.Done}),
		at(3*time.Minute, "channel", protocol.OriginPartner, protocol.KindJobStatus, protocol.JobStatus{JobID: "j1", Text: w.title, State: "done", TaskID: id}),
		at(2*time.Minute, "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: w.said, ReplyTo: 1, Media: []protocol.MediaRef{deck}}),
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	tt := ui.NewTesterWith(app.View, 1100, 1180, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	tt.Frame()
	return app, tt
}

func TestDocCheckSaidUnderTheResult(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		w := docWords[lang]
		app, tt := docApp(t, lang)
		all := texts(tt)
		if !strings.Contains(all, app.L.T("doc.lead")) || !strings.Contains(all, w.left) {
			t.Errorf("%s: the page check's lead and what is left should show under the result: %q", lang, all)
		}
		app.OpenTask("t_deck")
		tt.Frame()
		tt.Frame()
		if all := texts(tt); !strings.Contains(all, w.left) {
			t.Errorf("%s: what is left should show in the opened task's outcome: %q", lang, all)
		}
	}
}

func TestDocCheckOfficeFileReadsAsItsPages(t *testing.T) {
	deck := protocol.MediaRef{ID: strings.Repeat("a", 64), Type: "application/vnd.openxmlformats-officedocument.presentationml.presentation", Name: "Ducter 融资.pptx", K: "k1",
		Pages: &protocol.MediaPages{ID: strings.Repeat("b", 64), K: "k2", Bytes: 9}}
	p, ok := deck.PagesRef()
	if !ok || p.Name != "Ducter 融资.pdf" || p.Type != "application/pdf" || p.ID != deck.Pages.ID {
		t.Fatalf("PagesRef: %+v %v", p, ok)
	}
	if glimpseKindOf(deck) != "pdf" {
		t.Fatalf("an Office file with its PDF should glimpse its first page")
	}
	app, _ := iaApp(t, i18n.ZH)
	app.OpenFile(deck, ui.Rect{})
	if app.fileView == nil || app.fileView.ref.ID != deck.Pages.ID || app.fileView.office == nil || app.fileView.office.ID != deck.ID {
		t.Fatalf("the viewer should read the deck as its pages and keep the deck to save: %+v", app.fileView)
	}
	if _, ok := (protocol.MediaRef{Name: "a.pptx"}).PagesRef(); ok {
		t.Fatalf("a file with no pages has none")
	}
}

// DUCTER_D439_SHOTS=<dir> go test ./internal/views -run TestD439DocShots
func TestD439DocShots(t *testing.T) {
	dir := os.Getenv("DUCTER_D439_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_D439_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DUCTER_SHOTS_DIR", dir)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, tt := docApp(t, lang)
		settle := func() {
			for i := 0; i < 4; i++ {
				tt.Frame()
				tt.Advance(300 * time.Millisecond)
			}
		}
		app.Route = RouteConversation
		d302Both(t, app, tt, settle, "d439-conv", lang)
		app.OpenTask("t_deck")
		d302Both(t, app, tt, settle, "d439-task", lang)
	}
}
