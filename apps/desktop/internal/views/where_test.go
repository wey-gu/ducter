package views

import (
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
)

// D157: the author's setup. hel is the home (a server that never sleeps,
// Codex, Ducter's own browser); the MacBook does tasks for it (Claude Code
// and Codex, the user's Chrome, sleeps when its lid closes).
func whereDevices(macState string) protocol.ServerFrame {
	ag := func(ids ...string) []protocol.DeviceHarness {
		var out []protocol.DeviceHarness
		for _, id := range ids {
			out = append(out, protocol.DeviceHarness{Harness: id, Installed: true, LoggedIn: true})
		}
		return out
	}
	return protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{
		{ID: "local", Name: "hel", Kind: "server", Home: true, State: "awake", AlwaysOn: true, Platform: "linux-x64", Harnesses: ag("codex"),
			Abilities: []protocol.DeviceAbility{{ID: "web", State: "on", Where: "ducter"}}},
		{ID: "dev_mac", Name: "MacBook", Kind: "laptop", State: macState, Platform: "darwin-arm64", Harnesses: ag("claude-code", "codex"),
			Abilities: []protocol.DeviceAbility{{ID: "web", State: "on", Where: "chrome"}}},
	}, Reach: &protocol.Reach{}}
}

// whereTasks opens the author's evening: a public look-up on hel, an order
// in the user's Chrome on the MacBook, Keynote waiting for the MacBook.
func whereTasks(app *App, zh bool) {
	w := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	now := time.Now()
	n := int64(100)
	at := func(ago time.Duration, stream string, origin protocol.Origin, kind string, body any) protocol.LogEvent {
		n++
		return protocol.NewEvent(n, now.Add(-ago).UTC().Format(time.RFC3339Nano), "default", stream, origin, kind, body)
	}
	open := func(id, title string, place protocol.Place, harness string, why protocol.BodyWhy, state protocol.Attention, ago time.Duration) []protocol.LogEvent {
		ts := protocol.TaskStream(id)
		return []protocol.LogEvent{
			at(ago, ts, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: title, Harness: harness, Place: place, Brief: title}),
			at(ago, ts, protocol.OriginSystem, protocol.KindBodySelected, protocol.BodySelected{TaskID: id, Harness: harness, Why: why}),
			at(ago, ts, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: state}),
		}
	}
	var evs []protocol.LogEvent
	evs = append(evs, open("t_hn", w("查一下 HN 今天关于 OAR 的讨论", "What HN says about OAR today"), protocol.Place{Kind: "browser", Device: "local", Profile: "default"}, "codex",
		protocol.BodyWhy{Kind: "default", Where: &protocol.WhereWhy{Device: "hel", Kind: "no_signin", Uses: "ducter"}}, protocol.Working, 4*time.Minute)...)
	evs = append(evs, open("t_order", w("看看淘宝那单到哪了", "Where my Taobao order is"), protocol.Place{Kind: "browser", Device: "MacBook", Profile: "default"}, "claude-code",
		protocol.BodyWhy{Kind: "default", Where: &protocol.WhereWhy{Device: "MacBook", Kind: "signed_in", Site: "taobao.com", Uses: "chrome"}}, protocol.Working, 2*time.Minute)...)
	evs = append(evs, open("t_keynote", w("把周报做成 Keynote", "Turn the weekly report into Keynote"), protocol.Place{Kind: "none", Device: "MacBook"}, "codex",
		protocol.BodyWhy{Kind: "default", Where: &protocol.WhereWhy{Device: "MacBook", Kind: "only_here", Thing: "app", App: "Keynote", Uses: "app"}}, protocol.Queued, time.Minute)...)
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
}

func TestWhereLineOnEveryTaskWithTwoComputers(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	whereTasks(app, true)
	// One computer: nothing about where (the home isn't named).
	if on, _ := app.taskWhere(app.S.Tasks["t_hn"]); on != "" {
		t.Fatalf("one computer still says where: %q", on)
	}
	app.Receive(whereDevices("awake"))
	cases := map[string][2]string{
		"t_hn":      {"在 hel 上 · 用 Ducter 自己的浏览器", "为什么在 hel 上：用不着你的登录，hel 自己的浏览器就够了"},
		"t_order":   {"在 MacBook 上 · 用你的 Chrome", "为什么在 MacBook 上：要用你登录着的 taobao.com"},
		"t_keynote": {"在 MacBook 上 · 用 Keynote", "为什么在 MacBook 上：只有 MacBook 有 Keynote"},
	}
	for id, want := range cases {
		on, why := app.taskWhere(app.S.Tasks[id])
		if on != want[0] || why != want[1] {
			t.Errorf("%s: %q / %q, want %q / %q", id, on, why, want[0], want[1])
		}
	}
	// On hand names the computer on every row, the home by its own name.
	if got := app.whereWhy(app.S.Tasks["t_hn"]); got != "Codex · hel" {
		t.Errorf("On hand row: %q", got)
	}
	en, _ := iaApp(t, i18n.EN)
	whereTasks(en, false)
	en.Receive(whereDevices("awake"))
	if on, why := en.taskWhere(en.S.Tasks["t_order"]); on != "on MacBook · in your Chrome" || why != "Why MacBook: Needs your signed-in taobao.com" {
		t.Errorf("en: %q / %q", on, why)
	}
}

// New task with two computers (where.md §6.3): No folder carries the
// suggested computer; Claude Code lives only on the MacBook, so picking it
// brings the MacBook along; Start sends both.
func TestNewTaskComputerPart(t *testing.T) {
	app, sent := iaApp(t, i18n.ZH)
	app.Status = client.Connected
	app.Receive(whereDevices("awake"))
	app.OpenNewTask(nil)
	app.Receive(protocol.ServerFrame{T: "task_new_options", Places: []protocol.PlaceChoice{{Place: protocol.Place{Kind: "none"}}}, Candidates: []protocol.Candidate{
		{Harness: "codex", Device: "local", DeviceName: "hel", Reason: protocol.CandidateReason{Kind: "fit"}},
		{Harness: "claude-code", Model: "opus", Device: "dev_mac", DeviceName: "MacBook", Reason: protocol.CandidateReason{Kind: "fit"}},
		{Harness: "codex", Device: "dev_mac", DeviceName: "MacBook", Reason: protocol.CandidateReason{Kind: "fit"}},
	}})
	o := app.S.NewTaskOptions
	if got := app.ntComputer(o.Candidates); got != "local" {
		t.Fatalf("suggested computer %q", got)
	}
	rows, elsewhere := app.ntCands(o.Candidates)
	if len(rows) != 2 || rows[1].Harness != "claude-code" || !elsewhere[ntKey(rows[1])] {
		t.Fatalf("who on hel, then Claude Code tagged on MacBook: %+v %v", rows, elsewhere)
	}
	// Picking Claude Code (on MacBook) moves the computer part with it.
	app.nt.pick, app.nt.computer = ntKey(rows[1]), rows[1].Device
	app.nt.words = "用 Claude Code 重构这个"
	*sent = nil
	if !app.StartNewTask() {
		t.Fatalf("not started: %q", app.nt.err)
	}
	f := (*sent)[len(*sent)-1].(protocol.TaskNew)
	if f.Place == nil || f.Place.Kind != "none" || f.Place.Device != "MacBook" || f.Harness != "claude-code" {
		t.Errorf("sent %+v place %+v", f, f.Place)
	}
}

// The sleeping-Mac ask (where.md W2b): wait by default, now on hel with a
// sign-in there; the user's own pick that waits; a waiting task's line.
func TestWhereAskWords(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	d := &store.DecisionState{Decision: protocol.Decision{DecisionID: "d1", Question: "raw", GoLabel: "x", DefaultOption: "hold",
		Where: &protocol.WhereAsk{Kind: "asleep", Device: "MacBook", State: "asleep", Other: "hel", Site: "taobao.com", Here: "chrome", Uses: "ducter", SignIn: true}}}
	if q := app.questionOf(d); q != "MacBook 睡着了。等它醒了用你的 Chrome 做，还是现在在 hel 上做？" {
		t.Errorf("question %q", q)
	}
	if g, h := app.goLabel(d), app.whereAskHold(d.Where); g != "现在在 hel 上做" || h != "等它醒" {
		t.Errorf("go %q hold %q", g, h)
	}
	pin := &store.DecisionState{Decision: protocol.Decision{Where: &protocol.WhereAsk{Kind: "pin", Device: "MacBook", State: "unreachable", Other: "hel", Agent: "claude-code", OtherAgent: "codex"}}}
	if q, g := app.questionOf(pin), app.goLabel(pin); q != "Claude Code 只在 MacBook 上，它现在连不上。等它，还是换个来做？" || g != "换 Codex 来做" {
		t.Errorf("pin: %q / %q", q, g)
	}
}
