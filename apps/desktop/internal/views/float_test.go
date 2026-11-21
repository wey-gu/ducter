package views

import (
	"math"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/hints"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D438: the mini window. Fixtures from the author's own week: the
// principles' English pass at work, a bun upgrade waiting on its lockfile,
// a CI question asked from beside the editor.

type floatHandsRec struct {
	shown            bool
	shows, hides     int
	heights          []int
	redraws, mainers int
}

func floatApp(t *testing.T, lang i18n.Lang, scene string) (*App, *floatHandsRec, *[]any) {
	t.Helper()
	theme.LoadFonts()
	app := New(store.New(), theme.Pebble(), i18n.New(lang))
	app.Local = hints.Open(t.TempDir())
	app.Status = 2 // client.Connected
	var sent []any
	app.Send = func(f any) error { sent = append(sent, f); return nil }
	rec := &floatHandsRec{}
	app.Float = FloatHands{
		Shown:  func() bool { return rec.shown },
		Show:   func() { rec.shown = true; rec.shows++ },
		Hide:   func() { rec.shown = false; rec.hides++ },
		Resize: func(h int) { rec.heights = append(rec.heights, h) },
		Redraw: func() { rec.redraws++ },
	}
	app.ShowMain = func() { rec.mainers++ }
	app.Receive(protocol.ServerFrame{T: "welcome", Persona: "default", PersonaName: "Ducter", HeadSeq: 0})
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{}})
	zh := lang == i18n.ZH
	l := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	var seqN int64
	at := func(ago time.Duration) string { return time.Now().Add(-ago).UTC().Format(time.RFC3339Nano) }
	evo := func(ago time.Duration, stream string, o protocol.Origin, kind string, body any) protocol.LogEvent {
		seqN++
		return protocol.NewEvent(seqN, at(ago), "default", stream, o, kind, body)
	}
	task := func(ago time.Duration, id, title string, att protocol.Attention, place protocol.Place) []protocol.LogEvent {
		return []protocol.LogEvent{
			evo(ago, protocol.TaskStream(id), protocol.OriginSystem, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: title, Project: "Ducter", Harness: "claude-code", Model: "opus", Place: place}),
			evo(ago, protocol.TaskStream(id), protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: att, Residency: protocol.Hot}),
		}
	}
	var evs []protocol.LogEvent
	evs = append(evs, evo(3*time.Hour, "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: l("早。昨晚的两件事都在转，有事我叫你。", "Morning. Both of last night's jobs are going; I'll call you if anything needs you.")}))
	if scene != "quiet" && scene != "first" {
		evs = append(evs, task(50*time.Minute, "t-trans", l("原则英译", "Principles in English"), protocol.Working, protocol.Place{Kind: "folder", Device: "MacBook", Path: "~/dev/ducter/docs"})...)
		evs = append(evs, task(35*time.Minute, "t-deps", l("升级 bun 到 1.4.4", "Upgrade bun to 1.4.4"), protocol.NeedsYou, protocol.Place{Kind: "repo", Device: "MacBook", RepoPath: "~/dev/ducter", Branch: "ducter/bun-1.4.4"})...)
		evs = append(evs, evo(12*time.Minute, "channel", protocol.OriginPartner, protocol.KindDecision, protocol.Decision{DecisionID: "d-deps", TaskID: "t-deps",
			Question: l("lockfile 一起提交吗？", "Commit the lockfile with it?"), GoLabel: l("提交", "Commit"), DefaultOption: "go", Reversible: true}))
	}
	switch scene {
	case "wait", "reply":
		evs = append(evs, evo(40*time.Second, "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: l("CI 为什么又挂了？", "Why did CI fail again?")}))
	}
	if scene == "reply" {
		evs = append(evs, evo(5*time.Second, "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{
			Text: l("是 **apps/web** 的一个快照测试：新的小窗文案没更新快照。我让「升级 bun」那个任务顺手修了，十分钟内告诉你。",
				"It's a snapshot test in **apps/web**: the new mini window words weren't in the snapshot. I've asked the bun upgrade task to fix it on the way; I'll tell you within ten minutes.")}))
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	if scene == "wait" {
		now := time.Now().Add(-4 * time.Second).UTC().Format(time.RFC3339Nano)
		app.Receive(protocol.ServerFrame{T: "activity", Activity: &protocol.PartnerActivity{Step: "checking_task", Since: now, StepSince: now, About: l("升级 bun 到 1.4.4", "Upgrade bun to 1.4.4")}})
	}
	if scene == "first" {
		app.float.first = true
	}
	return app, rec, &sent
}

func floatTester(app *App, dark bool) *ui.Tester {
	tt := ui.NewTesterWith(app.FloatView, FloatW, 200, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}, Dark: dark})
	for i := 0; i < 4; i++ {
		tt.Frame()
		tt.Advance(500 * time.Millisecond)
	}
	return tt
}

func TestFloatSaysOneLine(t *testing.T) {
	cases := []struct {
		scene string
		want  map[i18n.Lang][]string
		not   []string
	}{
		{"quiet", map[i18n.Lang][]string{i18n.ZH: {"现在没有要你定的。"}, i18n.EN: {"Nothing needs you."}}, []string{"个等你", "need you"}},
		{"working", map[i18n.Lang][]string{i18n.ZH: {"1 个等你", "lockfile 一起提交吗？"}, i18n.EN: {"1 need you", "Commit the lockfile with it?"}}, nil},
		{"wait", map[i18n.Lang][]string{i18n.ZH: {"在看「升级 bun 到 1.4.4」做到哪了…"}, i18n.EN: {"Checking how “Upgrade bun to 1.4.4” is going…"}}, nil},
		{"reply", map[i18n.Lang][]string{i18n.ZH: {"是 apps/web 的一个快照测试"}, i18n.EN: {"It's a snapshot test in apps/web"}}, []string{"**"}},
		{"first", map[i18n.Lang][]string{i18n.ZH: {"⌃⌥⌘空格"}, i18n.EN: {"⌃⌥⌘Space"}}, nil},
	}
	for _, k := range cases {
		for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
			app, _, _ := floatApp(t, lang, k.scene)
			tt := floatTester(app, false)
			texts := strings.Join(tt.Texts(), "\n")
			for _, w := range k.want[lang] {
				if !strings.Contains(texts, w) {
					t.Errorf("%s %s: no %q in %q", k.scene, lang, w, tt.Texts())
				}
			}
			for _, n := range k.not {
				if strings.Contains(texts, n) {
					t.Errorf("%s %s: %q said in %q", k.scene, lang, n, tt.Texts())
				}
			}
		}
	}
}

func TestFloatCountOpensOnHand(t *testing.T) {
	app, rec, _ := floatApp(t, i18n.ZH, "working")
	app.Route = RouteConversation
	tt := floatTester(app, false)
	if err := tt.Click("1 个等你"); err != nil {
		t.Fatalf("no count to tap: %v; %q", err, tt.Texts())
	}
	tt.Frame()
	if app.Route != RouteOnHand || app.oh.filter != 1 || rec.mainers != 1 {
		t.Errorf("the count opened route %v filter %d (main shown %d)", app.Route, app.oh.filter, rec.mainers)
	}
}

func TestFloatLineOpensConversation(t *testing.T) {
	app, rec, _ := floatApp(t, i18n.EN, "reply")
	app.Route = RouteOnHand
	tt := floatTester(app, false)
	if err := tt.Click("Ducter, Open the conversation"); err != nil {
		t.Fatalf("%v; %q", err, tt.Texts())
	}
	tt.Frame()
	if app.Route != RouteConversation || rec.mainers != 1 {
		t.Errorf("the line opened route %v (main shown %d)", app.Route, rec.mainers)
	}
}

// Said here, it is the conversation's own message: the same draft as the
// main window's, sent as a user message; the line turns into the waiting one.
func TestFloatSendsInTheConversation(t *testing.T) {
	app, rec, sent := floatApp(t, i18n.ZH, "quiet")
	tt := floatTester(app, false)
	if err := tt.Click("跟 Ducter 说"); err != nil {
		t.Fatal(err)
	}
	tt.Type("CI 为什么又挂了？")
	tt.Frame()
	// The main window's composer holds the same words.
	if app.draft != "CI 为什么又挂了？" || rec.redraws == 0 {
		t.Errorf("the draft is %q (main redrawn %d)", app.draft, rec.redraws)
	}
	tt.Key(0, ui.KeyEnter)
	tt.Frame()
	tt.Frame()
	found := false
	for _, f := range *sent {
		if m, ok := f.(protocol.Send); ok && m.Text == "CI 为什么又挂了？" {
			found = true
		}
	}
	if !found {
		t.Fatalf("nothing sent: %#v", *sent)
	}
	if app.draft != "" {
		t.Errorf("the draft stayed: %q", app.draft)
	}
	if !strings.Contains(strings.Join(tt.Texts(), "\n"), "在想…") {
		t.Errorf("no waiting line after sending: %q", tt.Texts())
	}
}

func TestFloatEscPutsItAway(t *testing.T) {
	app, rec, _ := floatApp(t, i18n.EN, "quiet")
	app.ShowFloat()
	tt := floatTester(app, false)
	if err := tt.Click("Talk to Ducter"); err != nil {
		t.Fatal(err)
	}
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if rec.hides != 1 || app.Local.FloatOpen() {
		t.Errorf("Esc with nothing written: hides %d, remembered open %v", rec.hides, app.Local.FloatOpen())
	}
	// With words written it keeps them and stays.
	app.ShowFloat()
	tt.Type("half")
	tt.Key(0, ui.KeyEscape)
	tt.Frame()
	if rec.hides != 1 || app.draft != "half" {
		t.Errorf("Esc with words: hides %d, draft %q", rec.hides, app.draft)
	}
	if !app.Local.FloatOpen() {
		t.Errorf("shown, not remembered")
	}
}

// It comes by itself once: the first task opened in an editor or a terminal.
// Finder is not leaving to work beside it; a second time it stays away.
func TestFloatComesOnceWithTheEditor(t *testing.T) {
	app, rec, _ := floatApp(t, i18n.ZH, "working")
	app.OpenFolder = func(with, path string) error { return nil }
	app.openFolder("finder", "/tmp")
	if rec.shows != 0 {
		t.Fatalf("Finder brought it")
	}
	app.openFolder("/Applications/Zed.app", "/tmp")
	if rec.shows != 1 || !app.float.first {
		t.Fatalf("the editor: shows %d, first %v", rec.shows, app.float.first)
	}
	tt := floatTester(app, false)
	if !tt.HasText("我在这儿陪着你。按 ⌃⌥⌘空格可以收起我，再按一次我就回来。") {
		t.Errorf("the first line: %q", tt.Texts())
	}
	app.HideFloat()
	app.openFolder("/Applications/Zed.app", "/tmp")
	if rec.shows != 1 {
		t.Errorf("it came again: %d", rec.shows)
	}
	app.ToggleFloat()
	tt.Frame()
	if app.float.first || tt.HasText("⌃⌥⌘空格") {
		t.Errorf("shown again by hand, it still teaches the key")
	}
}

// D446: another app holds ⌃⌥⌘Space. The menu items say so in place of the
// key (and are the way in); the first line points at the menu, not the key.
func TestFloatKeyTakenSaysSo(t *testing.T) {
	app, _, _ := floatApp(t, i18n.ZH, "working")
	if accel, sub := app.FloatMenu(); accel != FloatKey || sub != "" {
		t.Fatalf("free key: %q %q", accel, sub)
	}
	app.FloatKeyTaken = true
	if accel, sub := app.FloatMenu(); accel != "" || sub != "快捷键被别的应用占用了" {
		t.Fatalf("taken key: %q %q", accel, sub)
	}
	app.OpenFolder = func(with, path string) error { return nil }
	app.openFolder("/Applications/Zed.app", "/tmp")
	tt := floatTester(app, false)
	if tt.HasText("⌃⌥⌘空格") || !tt.HasText("我在这儿陪着你。快捷键被别的应用占用了，在菜单栏点「小窗」可以收起我，再点一次我就回来。") {
		t.Errorf("the first line with the key taken: %q", tt.Texts())
	}
	en, _, _ := floatApp(t, i18n.EN, "working")
	en.FloatKeyTaken = true
	if _, sub := en.FloatMenu(); sub != "Its shortcut is taken by another app" {
		t.Errorf("en: %q", sub)
	}
}

// Its height follows what it shows, top edge kept; hold to talk's first
// card makes it taller and it comes back.
func TestFloatFitsWhatItShows(t *testing.T) {
	app, rec, _ := floatApp(t, i18n.ZH, "working")
	tt := floatTester(app, false)
	if len(rec.heights) == 0 {
		t.Fatal("never sized")
	}
	base := rec.heights[len(rec.heights)-1]
	if base < FloatMinH || base > 200 {
		t.Errorf("the quiet height %d", base)
	}
	app.vox.phase = "ask"
	tt.SetSize(FloatW, FloatMaxH)
	for i := 0; i < 4; i++ {
		tt.Frame()
	}
	tall := rec.heights[len(rec.heights)-1]
	if tall <= base+40 {
		t.Errorf("the voice card: %d over %d", tall, base)
	}
	app.vox.phase = ""
	for i := 0; i < 4; i++ {
		tt.Frame()
	}
	if back := rec.heights[len(rec.heights)-1]; back != base {
		t.Errorf("back to %d, not %d", back, base)
	}
}

// The hold-to-talk key listens in the mini window with the keyboard, even
// while the main window shows On hand.
func TestFloatKeyListens(t *testing.T) {
	app, _, _ := floatApp(t, i18n.ZH, "quiet")
	app.Route = RouteOnHand
	app.voiceKey("ropt", true)
	if app.vox.phase != "" {
		t.Fatalf("listened with no window for it: %q", app.vox.phase)
	}
	app.float.keys = true
	app.voiceKey("ropt", true)
	if app.vox.phase == "" {
		t.Errorf("the mini window with the keyboard didn't listen")
	}
}

// D446: the mini window's partner is never cut at its box's edge. A part
// painted again alone (the figure, while it sways and breathes) is cut at its
// box, and a face that fills its box's width went past it. Every loop's keys
// with the breath at its widest, about the feet as alivePose and idlePose
// turn it: the art's sides and top (the round body's extremes) stay inside
// the box floatRoom gives; with no room they don't.
func TestFloatPartnerHasRoomToMove(t *testing.T) {
	theme.LoadFonts()
	const w = 44
	reach := func(face theme.Presence, room float64) (over float64) {
		bmp, idle := theme.Face(face, w*2), theme.Face(theme.Idle, w*2)
		iw, ih := idle.Size()
		h := w * float64(ih) / float64(iw)
		box := ui.Rect{W: float32(w + 2*room), H: float32(h + room)}
		at := fitIn(bmp, artRect(box, float32(room)))
		at.Y = box.H - at.H
		px, py := float64(at.X+at.W/2), float64(at.Y+at.H) // the feet
		// The sides' and the top's middles, from the feet, breathing at their widest.
		pts := [][2]float64{{-float64(at.W) / 2 * 1.012, -float64(at.H) / 2 * 1.03}, {float64(at.W) / 2 * 1.012, -float64(at.H) / 2 * 1.03}, {0, -float64(at.H) * 1.03}}
		for _, loop := range aliveLoops {
			for _, k := range loop.keys {
				rad := k.deg * math.Pi / 180
				for _, p := range pts {
					x, y := p[0], p[1]*k.sy
					x, y = x*math.Cos(rad)-y*math.Sin(rad), x*math.Sin(rad)+y*math.Cos(rad)
					x, y = px+x+k.x, py+y+k.y
					over = max(over, -x, x-float64(box.W), -y)
				}
			}
		}
		return over
	}
	for _, face := range []theme.Presence{theme.Idle, theme.Working, theme.NeedsYou, theme.Waiting, theme.Done, theme.Napping} {
		if o := reach(face, floatRoom); o > 0 {
			t.Errorf("%s reaches %.1fpt past its box", face, o)
		}
	}
	if reach(theme.Idle, 0) <= 0 {
		t.Errorf("the check sees nothing without room")
	}
}

// D450: the mini window never hides what the big one shows: another AI's
// point still left in a Go or a result is its one line in the needs-you
// ink, and a tap on it opens the conversation.
func floatLookApp(t *testing.T, lang i18n.Lang, scene string) *App {
	t.Helper()
	app, _, _ := floatApp(t, lang, "quiet")
	zh := lang == i18n.ZH
	l := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	var n int64 = 100
	at := func(ago time.Duration, stream string, o protocol.Origin, kind string, body any) protocol.LogEvent {
		n++
		return protocol.NewEvent(n, time.Now().Add(-ago).UTC().Format(time.RFC3339Nano), "default", stream, o, kind, body)
	}
	id, ts := "t_bin", protocol.TaskStream("t_bin")
	files, adds, dels := 2, 14, 3
	left := l("Windows 的 install.ps1 还是写死的路径", "Windows install.ps1 still has the fixed path")
	var evs []protocol.LogEvent
	switch scene {
	case "ask":
		evs = append(evs,
			at(3*time.Minute, ts, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: l("安装目录可配置", "Install folder configurable"), Harness: "codex", Place: protocol.Place{Kind: "repo", Device: "local", RepoPath: "~/dev/ducter"}}),
			at(3*time.Minute, ts, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: protocol.NeedsYou, Residency: protocol.Hot}),
			at(time.Minute, "channel", protocol.OriginSystem, protocol.KindDecision, protocol.Decision{DecisionID: "d_pr", TaskID: id, Question: l("开一个 draft PR 吗？", "Open a draft PR?"), GoLabel: l("开 PR", "Open PR"), DefaultOption: "hold",
				Look: &protocol.DecisionLook{By: "claude-code", Left: []string{left}}}))
	case "reply":
		evs = append(evs,
			at(9*time.Minute, "channel", protocol.OriginUser, protocol.KindUserMsg, protocol.UserMsg{Text: l("安装目录让它能用环境变量改，三个平台都要。", "Make the install folder configurable by an env var, on all three platforms.")}),
			at(9*time.Minute, "channel", protocol.OriginPartner, protocol.KindAck, protocol.Ack{JobID: "j1", Text: l("好，我让一个任务去改。", "OK, a task is on it."), ReplyTo: n}),
			at(9*time.Minute, ts, protocol.OriginPartner, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: l("安装目录可配置", "Install folder configurable"), Harness: "codex", Place: protocol.Place{Kind: "repo", Device: "local", RepoPath: "~/dev/ducter"}}),
			at(9*time.Minute, "channel", protocol.OriginPartner, protocol.KindJobStatus, protocol.JobStatus{JobID: "j1", Text: "x", State: "running", TaskID: id}),
			at(3*time.Minute, ts, protocol.OriginTask, protocol.KindReport, protocol.Report{TaskID: id, State: "done", Summary: "done",
				Branch: &protocol.BranchChanges{Commits: 2, Files: &files, Adds: &adds, Dels: &dels},
				Look:   &protocol.FreshLook{By: "claude-code", Found: []string{left}, Left: []string{left}}}),
			at(3*time.Minute, ts, protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: protocol.Done, Residency: protocol.Hot}),
		)
		evs = append(evs, at(2*time.Minute, "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{Text: l("改好了：macOS 和 Linux 都能用 DUCTER_BIN 改。", "Done: macOS and Linux both read DUCTER_BIN now."), ReplyTo: evs[0].Seq}))
	}
	app.Receive(protocol.ServerFrame{T: "events", Events: evs})
	return app
}

func TestFloatSaysWhatAnotherAILeft(t *testing.T) {
	for _, scene := range []string{"ask", "reply"} {
		for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
			app := floatLookApp(t, lang, scene)
			tt := floatTester(app, false)
			want := map[i18n.Lang]string{i18n.ZH: "另一个 AI 看过：Windows 的 install.ps1 还是写死的路径", i18n.EN: "Another AI looked it over: Windows install.ps1 still has the fixed path"}[lang]
			if _, ok := tt.Find(want); !ok {
				t.Errorf("%s %s: no %q in %q", scene, lang, want, tt.Texts())
			}
		}
	}
	// The line, the point with it, opens the conversation.
	app := floatLookApp(t, i18n.EN, "reply")
	app.Route = RouteOnHand
	tt := floatTester(app, false)
	if err := tt.Click("Another AI looked it over: Windows install.ps1 still has the fixed path"); err != nil {
		t.Fatalf("%v; %q", err, tt.Texts())
	}
	tt.Frame()
	if app.Route != RouteConversation {
		t.Errorf("the point opened route %v", app.Route)
	}
	// A clean result says nothing more.
	clean, _, _ := floatApp(t, i18n.ZH, "reply")
	if texts := strings.Join(floatTester(clean, false).Texts(), "\n"); strings.Contains(texts, "另一个 AI 看过") {
		t.Errorf("a clean reply said a look: %q", texts)
	}
}

// D450: the partner held on its own agent (D435) is said where the line
// sits: when it answers again while nobody can, who thinks for it while
// another does.
func TestFloatSaysThePartnerHeld(t *testing.T) {
	for _, waits := range []bool{false, true} {
		for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
			k := heldCase(waits)
			app, _, _ := floatApp(t, lang, "working")
			app.Receive(protocol.ServerFrame{T: "settings", Settings: &protocol.Settings{Name: "Ducter", Language: "auto", Brain: k.setting}, BrainNow: k.brain})
			tt := floatTester(app, false)
			at := heldClock(k)
			want := map[bool]map[i18n.Lang]string{
				false: {i18n.ZH: "这会儿先用 Codex 想事情", i18n.EN: "Thinks with Codex for now"},
				true:  {i18n.ZH: at + " 接着回你", i18n.EN: "Answers at " + at},
			}[waits][lang]
			if _, ok := tt.Find(want); !ok {
				t.Errorf("waits=%v %s: no %q in %q", waits, lang, want, tt.Texts())
			}
			// Another answering: the line is still the oldest question.
			if !waits {
				q := map[i18n.Lang]string{i18n.ZH: "lockfile 一起提交吗？", i18n.EN: "Commit the lockfile with it?"}[lang]
				if _, ok := tt.Find(q); !ok {
					t.Errorf("%s: the question gave way to the note: %q", lang, tt.Texts())
				}
			}
		}
	}
}
