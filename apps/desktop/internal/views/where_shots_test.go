package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D157 as built, on the Mac, zh and en: the where line on an opened task,
// On hand naming each computer, the sleeping-Mac ask, Switch who does it
// with the islands strip and a move that widens access, New task's
// computer list, the closing card, and the parcel landing / waiting on
// the Devices stage. Evidence, not source (D75): DUCTER_WHERE_SHOTS=<dir>
//
//	DUCTER_WHERE_SHOTS=../../../../.shots/where-built go test ./internal/views -run WhereShots
func TestWhereShots(t *testing.T) {
	dir := os.Getenv("DUCTER_WHERE_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_WHERE_SHOTS not set")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		zh := lang == i18n.ZH
		w := func(z, e string) string {
			if zh {
				return z
			}
			return e
		}
		shot := func(tt *ui.Tester, name string) {
			tt.Move(4, 4)
			tt.Advance(900 * time.Millisecond)
			tt.Frame()
			f, err := os.Create(filepath.Join(dir, fmt.Sprintf("mac-%s-%s.png", name, lang)))
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			if err := png.Encode(f, tt.Image()); err != nil {
				t.Fatal(err)
			}
		}
		setup := func(macState string) *App {
			app, _ := iaApp(t, lang)
			app.Status = client.Connected
			app.LocaleFixed = true
			whereTasks(app, zh)
			app.Receive(whereDevices(macState))
			cards := []protocol.TaskCard{}
			for _, id := range []string{"t_hn", "t_order", "t_keynote"} {
				task := app.S.Tasks[id]
				att, reason := protocol.Working, ""
				if id == "t_keynote" && macState == "asleep" {
					att, reason = protocol.Blocked, "device:asleep:MacBook"
				}
				cards = append(cards, protocol.TaskCard{TaskID: id, Title: task.Title(), Place: task.Place(), Harness: task.Harness(), Attention: att, Residency: "hot", Reason: reason, OpenedAt: task.OpenedAt, UpdatedAt: task.OpenedAt})
			}
			app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: cards}})
			if macState == "asleep" {
				app.S.Tasks["t_keynote"].State = &protocol.TaskState{TaskID: "t_keynote", Attention: protocol.Blocked, Residency: "offline", Reason: "device:asleep:MacBook"}
			}
			return app
		}
		tester := func(app *App, h int, still bool) *ui.Tester {
			tt := ui.NewTesterWith(app.View, 1280, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: still}})
			tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
			tt.Frame()
			tt.Frame()
			return tt
		}

		// 1. The opened task: 在 MacBook 上 · 用你的 Chrome.
		app := setup("awake")
		app.OpenTask("t_order")
		shot(tester(app, 720, true), "task-where")

		// 2. On hand: every row names its computer; Keynote waits for the MacBook.
		app = setup("asleep")
		app.Route = RouteOnHand
		shot(tester(app, 820, true), "onhand")

		// 3. The sleeping-Mac ask (W2b): wait by default; hel would need a sign-in.
		app = setup("asleep")
		ts := protocol.TaskStream("t_order")
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			protocol.NewEvent(500, time.Now().UTC().Format(time.RFC3339Nano), "default", "channel", protocol.OriginSystem, protocol.KindDecision, protocol.Decision{
				DecisionID: "d_where", TaskID: "t_order", Question: "raw", GoLabel: "now", DefaultOption: "hold",
				Where: &protocol.WhereAsk{Kind: "asleep", Device: "MacBook", State: "asleep", Other: "hel", Site: "taobao.com", Here: "chrome", Uses: "ducter", SignIn: true}}),
			protocol.NewEvent(501, time.Now().UTC().Format(time.RFC3339Nano), "default", ts, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: "t_order", Attention: protocol.NeedsYou}),
		}})
		cards := app.S.OnHand.Tasks
		for i := range cards {
			if cards[i].TaskID == "t_order" {
				cards[i].Attention, cards[i].PendingDecisionID = protocol.NeedsYou, "d_where"
			}
		}
		app.Route = RouteOnHand
		shot(tester(app, 820, true), "ask-asleep")

		// 4. Switch who does it: the islands strip, grouped by computer, a MacBook row picked (widens).
		app = setup("awake")
		app.OpenTask("t_hn")
		cands := []protocol.Candidate{
			{Harness: "codex", Current: true, Device: "local", DeviceName: "hel", Uses: "ducter", Reason: protocol.CandidateReason{Kind: "current"}},
			{Harness: "claude-code", Model: "opus", Device: "dev_mac", DeviceName: "MacBook", Uses: "chrome", Widens: true, Reason: protocol.CandidateReason{Kind: "fit"}},
			{Harness: "codex", Device: "dev_mac", DeviceName: "MacBook", Uses: "chrome", Widens: true, Reason: protocol.CandidateReason{Kind: "fit"}},
			{Harness: "claude-code", Device: "local", DeviceName: "hel", Blocked: "not_installed", Reason: protocol.CandidateReason{Kind: "fit"}},
		}
		app.Receive(protocol.ServerFrame{T: "candidates", TaskID: "t_hn", Candidates: cands})
		app.lo.switchFor = "t_hn"
		app.lo.pick = candKeyOn(cands[1])
		shot(tester(app, 1180, true), "switch")

		// 5. New task: No folder · hel ▾, the computer list open; Claude Code tagged on MacBook.
		app = setup("asleep")
		app.OpenNewTask(nil)
		app.Receive(protocol.ServerFrame{T: "task_new_options", Places: []protocol.PlaceChoice{
			{Place: protocol.Place{Kind: "repo", Device: "local", RepoPath: "~/dev/ducter"}, Name: "ducter", DefaultBranch: "main"},
			{Place: protocol.Place{Kind: "none"}}}, Candidates: []protocol.Candidate{
			{Harness: "codex", Device: "local", DeviceName: "hel", Reason: protocol.CandidateReason{Kind: "fit"}},
			{Harness: "claude-code", Model: "opus", Device: "dev_mac", DeviceName: "MacBook", Waits: "asleep", Reason: protocol.CandidateReason{Kind: "fit"}},
		}})
		app.nt.placeKey, app.nt.computerOpen = noneKey, true
		app.nt.words = w("把这份周报做成 Keynote", "Turn this weekly report into Keynote")
		shot(tester(app, 860, true), "newtask-computer")

		// 6. 我要合电脑了: one card for the MacBook.
		app = setup("awake")
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
			protocol.NewEvent(600, time.Now().UTC().Format(time.RFC3339Nano), "default", "channel", protocol.OriginSystem, protocol.KindDecision, protocol.Decision{
				DecisionID: "d_close", Question: "raw", GoLabel: "x", DefaultOption: "go", Reversible: true, DefaultAt: time.Now().Add(80 * time.Second).UTC().Format(time.RFC3339),
				Closing: &protocol.ClosingPlan{Device: "dev_mac", Name: "MacBook",
					Moves: []protocol.ClosingMove{{TaskID: "t_hn", Title: w("修 CI", "Fix CI"), To: "local", ToName: "hel", Harness: "codex"}, {TaskID: "t_tr", Title: w("英译周报", "Translate the report"), To: "local", ToName: "hel", Harness: "codex"}},
					Stays: []protocol.ClosingStay{{TaskID: "t_keynote", Title: w("做 Keynote", "Make the Keynote"), Why: "only_here"}}}}),
		}})
		app.Route = RouteConversation
		shot(tester(app, 820, true), "closing")

		// 7. The Devices stage: a parcel landing on the MacBook (mid-flight), its title on a tag.
		app = setup("awake")
		app.OpenDevices()
		land := store.ParseTime(app.S.Tasks["t_order"].PlacedAt).Add(450 * time.Millisecond)
		app.Now = func() time.Time { return land }
		shot(tester(app, 860, false), "isles-lands")
		// … and waiting at the home end of the bridge while the MacBook sleeps.
		app = setup("asleep")
		app.OpenDevices()
		shot(tester(app, 860, true), "isles-waits")
		// … and moving: the parcel crossing out to the MacBook after its rest beside Ducter.
		app = setup("awake")
		app.OpenDevices()
		task := app.S.Tasks["t_hn"]
		task.MovedFrom, task.PlacedAt = "local", time.Now().UTC().Format(time.RFC3339Nano)
		task.Open.Place.Device = "MacBook"
		moved := store.ParseTime(task.PlacedAt).Add(legFor + restFor + 350*time.Millisecond)
		app.Now = func() time.Time { return moved }
		shot(tester(app, 860, false), "isles-moves")
	}
}

// The parcel's moments, by the clock: lands over 0.9 s, squashes, then
// rides with its tag; waits at the home end; moves home and out.
func TestParcelMoments(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	whereTasks(app, true)
	app.Receive(whereDevices("awake"))
	mac := app.S.Device("dev_mac")
	at := store.ParseTime(app.S.Tasks["t_order"].PlacedAt)
	mid := app.parcelMoments(mac, at.Add(450*time.Millisecond), false)
	var m *parcelMoment
	for i := range mid {
		if mid[i].taskID == "t_order" {
			m = &mid[i]
		}
	}
	if m == nil || m.at <= 0.5 || m.at >= 1 || m.tag == "" {
		t.Fatalf("mid-flight: %+v", mid)
	}
	if after := app.parcelMoments(mac, at.Add(5*time.Second), false); len(after) != 0 {
		// t_keynote is queued (not blocked by a device): nothing lingers after the moment.
		t.Errorf("after the moment: %+v", after)
	}
	app.S.Tasks["t_keynote"].State = &protocol.TaskState{TaskID: "t_keynote", Attention: protocol.Blocked, Reason: "device:asleep:MacBook"}
	waits := app.parcelMoments(mac, at.Add(time.Minute), true)
	if len(waits) != 1 || waits[0].at != 0 || waits[0].tag != "在等" {
		t.Errorf("waits: %+v", waits)
	}
}
