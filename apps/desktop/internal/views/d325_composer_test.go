package views

import (
	"fmt"
	"os"
	"slices"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D325: the opened task's composer while it works, from frames (no core):
// a steer waiting to be read and one read, two messages held for after this
// turn as chips, the placeholder and hints saying what Return does.
func d325Task(t *testing.T, lang i18n.Lang, harness string, held bool) (*App, *ui.Tester, *[]any) {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.Status = 2 // client.Connected
	zh := lang == i18n.ZH
	pick := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	at := func(ago time.Duration) string { return time.Now().Add(-ago).UTC().Format(time.RFC3339Nano) }
	var seq int64
	var evs []protocol.LogEvent
	add := func(ago time.Duration, origin protocol.Origin, kind string, body any) int64 {
		seq++
		evs = append(evs, protocol.NewEvent(seq, at(ago), "default", "task:k1", origin, kind, body))
		return seq
	}
	add(9*time.Minute, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "k1", Title: pick("把购物车的结算改成分步", "Split the cart checkout into steps"), Harness: harness,
		Brief: pick("把 src/cart.ts 的结算拆成地址、付款、确认三步，测试要过。", "Split checkout in src/cart.ts into address, payment and confirm; keep the tests green.")})
	add(9*time.Minute, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: "k1", Attention: protocol.Working, Residency: "hot"})
	add(8*time.Minute, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "k1", Role: "assistant", Text: pick("先看一下现在的结算流程和测试。", "Looking at the current checkout flow and its tests first.")})
	add(7*time.Minute, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "k1", Role: "tool", Tool: &protocol.ToolCall{Name: "Read", Input: []byte(`{"file_path":"src/cart.ts"}`), OK: ptrTrue()}})
	s1 := add(6*time.Minute, protocol.OriginUser, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "k1", Role: "user", From: "user", Text: pick("地址那一步先用测试环境的接口", "Use the staging API for the address step"), ClientID: "c1", Raw: []byte(`{"delivered":"steer"}`)})
	add(5*time.Minute, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "k1", Role: "system", From: "runner", Raw: []byte(fmt.Sprintf(`{"read":[%d]}`, s1))})
	add(4*time.Minute, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "k1", Role: "assistant", Text: pick("好，地址那一步改用测试环境的接口。", "OK, the address step uses the staging API now.")})
	add(3*time.Minute, protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "k1", Role: "tool", Tool: &protocol.ToolCall{Name: "Bash", Input: []byte(`{"command":"bun test src/cart.test.ts"}`)}})
	add(time.Minute, protocol.OriginUser, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "k1", Role: "user", From: "user", Text: pick("确认页别显示完整卡号", "Don't show the full card number on the confirm page"), ClientID: "c2", Raw: []byte(`{"delivered":"steer"}`)})
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	card := protocol.TaskCard{TaskID: "k1", Persona: "default", Title: pick("把购物车的结算改成分步", "Split the cart checkout into steps"), Harness: harness, Attention: protocol.Working, Residency: "hot", OpenedAt: at(9 * time.Minute), UpdatedAt: at(time.Minute)}
	if held {
		card.Held = []protocol.HeldMsg{
			{ID: "h1", Text: pick("做完以后把 CHANGELOG 也更新一下", "When it's done, update the CHANGELOG too"), At: at(40 * time.Second)},
			{ID: "h2", Text: pick("然后开一个草稿 PR，标题用中文", "Then open a draft PR"), At: at(20 * time.Second)},
		}
	}
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{card}}})
	tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	app.OpenTask("k1")
	app.Receive(protocol.ServerFrame{T: "task_history", TaskID: "k1", Events: evs})
	tt.Frame()
	tt.Frame()
	return app, tt, sent
}

func ptrTrue() *bool { b := true; return &b }

func TestD325Composer(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		app, tt, sent := d325Task(t, lang, "claude-code", true)
		for _, w := range []string{L.T("held.head"), L.T("held.now"), L.T("delivery.steer.read"), L.T("delivery.steer.wait")} {
			if !hasText(tt, w) {
				t.Errorf("%s: no %q in %q", lang, w, tt.Texts())
			}
		}
		// D530: the two keys under the box only while the words have the focus; 做完再说 is no
		// pill beside Send any more (the send's own menu holds it).
		if slices.Contains(tt.Texts(), L.T("send.steer")) {
			t.Errorf("%s: the keys or a 做完再说 pill without the focus: %q", lang, tt.Texts())
		}
		app.focusComposer = true
		tt.Frame()
		tt.Frame()
		// D542: nor with the focus: a row that came with it moved the box under the pointer; the
		// two ways are in the words' place and the send's own menu.
		for _, w := range []string{L.T("send.steer")} { // send.after's words are also the held head's in English
			if slices.Contains(tt.Texts(), w) {
				t.Errorf("%s: focused, a row of keys under the box: %q", lang, tt.Texts())
			}
		}
		task := app.S.Task("k1")
		// Taken back: gone at once and asked of the home.
		app.HeldOp("k1", "h1", "drop", "")
		if len(task.Card.Held) != 1 || task.Card.Held[0].ID != "h2" {
			t.Errorf("%s: after drop %+v", lang, task.Card.Held)
		}
		app.HeldOp("k1", "h2", "edit", "  open a draft PR, title in English ")
		if task.Card.Held[0].Text != "open a draft PR, title in English" {
			t.Errorf("%s: after edit %+v", lang, task.Card.Held)
		}
		app.HeldOp("k1", "h2", "now", "")
		if len(task.Card.Held) != 0 || task.Sends[len(task.Sends)-1].ClientID != "h2" {
			t.Errorf("%s: after now %+v %+v", lang, task.Card.Held, task.Sends)
		}
		var ops []string
		for _, f := range *sent {
			if h, ok := f.(protocol.TaskHeld); ok {
				ops = append(ops, h.Op+":"+h.ID+":"+h.Text)
			}
		}
		if fmt.Sprint(ops) != "[drop:h1: edit:h2:open a draft PR, title in English now:h2:]" {
			t.Errorf("%s: sent %v", lang, ops)
		}
		tt.Frame()
		if hasText(tt, L.T("held.now")) {
			t.Errorf("%s: the chips stay after the queue emptied", lang)
		}
	}
}

// An agent that can't steer says so where Return is; 做完再说 goes (Return
// already holds) and 现在就说 is not offered while it works.
func TestD325NoSteer(t *testing.T) {
	protocol.NoSteer["pi"] = true
	defer delete(protocol.NoSteer, "pi")
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		_, tt, _ := d325Task(t, lang, "pi", true)
		// D542: said over its held words and in the words' place, never in a row under the box.
		for _, w := range []string{L.T("held.head.nosteer", "pi")} {
			if !hasText(tt, w) {
				t.Errorf("%s: no %q in %q", lang, w, tt.Texts())
			}
		}
		for _, w := range []string{L.T("send.steer"), L.T("held.now")} {
			if hasText(tt, w) {
				t.Errorf("%s: %q shows for an agent that can't steer", lang, w)
			}
		}
	}
}

// The store: a held send leaves the transcript (its chip takes over); a read
// marks its steer.
func TestD325Store(t *testing.T) {
	s := store.New()
	s.Apply(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(1, "2026-11-17T10:00:00Z", "p", "task:t1", protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: "t1", Title: "a"}),
	}})
	tk := s.Task("t1")
	tk.Sends = append(tk.Sends, &store.Send{Text: "a", ClientID: "c1"}, &store.Send{Text: "b", ClientID: "c2"})
	s.Apply(protocol.ServerFrame{T: "sent", TaskID: "t1", Delivered: protocol.DeliverySteered, ClientID: "c2"})
	s.Apply(protocol.ServerFrame{T: "sent", TaskID: "t1", Delivered: protocol.DeliveryQueued, ClientID: "c1"})
	if len(tk.Sends) != 1 || tk.Sends[0].ClientID != "c2" || tk.Sends[0].Delivered != protocol.DeliverySteered {
		t.Errorf("sends %+v", tk.Sends)
	}
	s.Apply(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
		protocol.NewEvent(5, "2026-11-17T10:00:00Z", "p", "task:t1", protocol.OriginTask, protocol.KindTaskEvent, protocol.TaskEvent{TaskID: "t1", Role: "system", From: "runner", Raw: []byte(`{"read":[3,4]}`)}),
	}})
	if !tk.Reads[3] || !tk.Reads[4] || tk.ReadLast != 4 {
		t.Errorf("reads %v %d", tk.Reads, tk.ReadLast)
	}
}

// DUCTER_D325_SHOTS=<dir> go test ./internal/views -run TestD325ComposerShots
func TestD325ComposerShots(t *testing.T) {
	dir := os.Getenv("DUCTER_D325_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_D325_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("DUCTER_SHOTS_DIR", dir)
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, k := range []struct {
			name string
			held bool
		}{{"working", false}, {"held", true}} {
			app, tt, _ := d325Task(t, lang, "claude-code", k.held)
			settle := func() {
				for i := 0; i < 4; i++ {
					tt.Frame()
					tt.Advance(300 * time.Millisecond)
				}
			}
			d302Both(t, app, tt, settle, "composer-"+k.name, lang)
			if k.held {
				app.heldEditing = &heldEdit{taskID: "k1", id: "h2", text: app.S.Task("k1").Card.Held[1].Text}
				app.heldFocus = true
				d302Both(t, app, tt, settle, "composer-editing", lang)
			}
		}
	}
}
