package views

import (
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// The Mac walk of 0.0.98: "Tried again just now" belongs to the page it
// was tried on; it followed the person to Agent messaging minutes later.
func TestMemTriedStaysOnItsPage(t *testing.T) {
	app, _ := iaApp(t, i18n.EN)
	app.openTab(TabMemory)
	app.settings.memTried = true
	app.openTab(TabMemory)
	if !app.settings.memTried {
		t.Fatal("the same page forgot it was tried")
	}
	app.openTab(TabPeers)
	if app.settings.memTried {
		t.Fatal("another page says it was tried just now")
	}
}

// The Mac walk of 0.0.98: 改由这台收 put the bridge in connecting, which
// hid Agent messaging from the rail, and the window jumped to Partner
// with the failure it was about to say. An open page stays.
func TestPeersPageStaysWhileOpen(t *testing.T) {
	app, _ := iaApp(t, i18n.ZH)
	app.Receive(settingsFrame())
	app.S.Bridge = &protocol.BridgeView{State: "elsewhere", Identity: "ducter", Home: "hel"}
	app.openTab(TabPeers)
	if app.settingsTab() != TabPeers {
		t.Fatalf("not on the page: %q", app.settingsTab())
	}
	app.S.Bridge = &protocol.BridgeView{State: "connecting", Identity: "ducter", Home: "hel"}
	if app.settingsTab() != TabPeers {
		t.Fatalf("the page went away under the person: %q", app.settingsTab())
	}
}

// D257: where the memory stands, the one update worth saying, the rail's
// line, when 和你的其他 agent 通信 shows, and the noted lines by when. The same cases
// as the web's (apps/web/test/memory.test.ts).
func TestMemRules(t *testing.T) {
	conn := &protocol.MemView{State: "connected"}
	for _, c := range []struct {
		on   bool
		mem  *protocol.MemView
		b    *protocol.BridgeView
		want string
	}{
		{false, conn, nil, "off"},
		{true, nil, nil, "missing"},
		{true, conn, nil, "on"},
		{true, &protocol.MemView{State: "missing"}, &protocol.BridgeView{State: "install_mem"}, "install"},
		{true, nil, &protocol.BridgeView{State: "signing_in"}, "signing_in"},
		{true, nil, &protocol.BridgeView{State: "update_mem"}, "on"},
		{true, nil, &protocol.BridgeView{State: "local_mem"}, "on"},
	} {
		if got := memPhase(c.on, c.mem, c.b); got != c.want {
			t.Errorf("memPhase(%v, %v, %v) = %q, want %q", c.on, c.mem, c.b, got, c.want)
		}
	}
	for _, c := range []struct {
		b     *protocol.BridgeView
		kind  string
		badge string
	}{
		{nil, "", ""},
		{&protocol.BridgeView{State: "connected"}, "", ""},
		{&protocol.BridgeView{State: "update_mem", Version: "0.10.116", CanRun: true}, "needed", "mem.badge.needed"},
		{&protocol.BridgeView{State: "connected", Version: "0.10.118", Newer: ptr("0.10.121"), Upkeep: &protocol.BridgeUpkeep{Kind: "update"}}, "newer", "mem.badge.newer"},
		{&protocol.BridgeView{State: "connected", Newer: ptr("")}, "app", "mem.badge.newer"},
		{&protocol.BridgeView{State: "ready", Upkeep: &protocol.BridgeUpkeep{Kind: "move"}}, "move", ""},
		{&protocol.BridgeView{State: "updating"}, "updating", ""},
		{&protocol.BridgeView{State: "ready", Done: "updated"}, "done", ""},
	} {
		u := memUpdate(c.b)
		kind := ""
		if u != nil {
			kind = u.Kind
		}
		if kind != c.kind || memBadge(u) != c.badge {
			t.Errorf("memUpdate(%+v) = %q/%q, want %q/%q", c.b, kind, memBadge(u), c.kind, c.badge)
		}
	}
	// D332: 和你的其他 agent 通信 shows by who (TestPeersRules has the cases).
	if peersShown(&protocol.Peers{Reach: "own"}, &protocol.BridgeView{State: "ready"}, false, false) {
		t.Errorf("和你的其他 agent 通信 shows to someone without agents of their own")
	}
	now := time.Date(2026, 11, 14, 15, 0, 0, 0, time.Local)
	at := func(d time.Duration) string { return now.Add(-d).UTC().Format(time.RFC3339) }
	gs := groupNoted([]protocol.Noted{{Seq: 6, At: at(time.Hour)}, {Seq: 5, At: at(10 * time.Hour)}, {Seq: 4, At: at(26 * time.Hour)}, {Seq: 3, At: at(6 * 24 * time.Hour)}, {Seq: 2, At: at(9 * 24 * time.Hour)}, {Seq: 1, At: "?"}}, now)
	got := ""
	for _, g := range gs {
		got += fmt.Sprintf("%s:%d ", g.When, len(g.Items))
	}
	if got != "today:2 week:2 earlier:2 " {
		t.Errorf("groupNoted = %q", got)
	}
}

// The Memory tab: the partner and its sentence, Mem's newer version as one
// highlighted card with its one tap, the noted lines by when (Forget sends
// its frame), Nowledge Mem's own card, and the rail's line.
func TestMemoryTab(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent := memApp(t, lang, "newer")
		app.openTab(TabMemory)
		tt := ui.NewTesterWith(app.View, 1280, 2400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.Frame()
		tt.Frame()
		L := app.L
		for _, w := range []string{L.T("mem.hero.on", app.personaName()), L.T("mem.update.newer", "0.10.121"), L.T("mem.update.newer.body", "hel", "0.10.118"), L.T("mem.badge.newer"),
			L.T("mem.about.title"), L.T("mem.kind.preference"), L.T("mem.kind.decision"), L.T("mem.by.tool", "Codex"), L.T("mem.tools.title"), L.T("mem.tools.count", "53"),
			L.T("mem.all.count", "10,980"), L.T("mem.all.open"), L.T("mem.app.on"), L.T("mem.app.where", "hel"), L.T("mem.week.count", "5"), L.T("mem.head.check")} {
			if !hasText(tt, w) {
				t.Fatalf("%s: no %q in %q", lang, w, tt.Texts())
			}
		}
		n := len(*sent)
		if err := tt.Click(L.T("bridge.mem.update.go")); err != nil {
			t.Fatal(err)
		}
		if len(*sent) != n+1 || (*sent)[n].(protocol.BridgeAction).T != "bridge_mem_install" {
			t.Fatalf("更新 sent %v", (*sent)[n:])
		}
		tt.Frame()
		if !hasText(tt, L.T("bridge.mem.updating", "hel")) {
			t.Fatalf("no updating line after the tap: %q", tt.Texts())
		}
		n = len(*sent)
		// D321: a row opens in place; 忘掉 is quiet and asks; only the answer forgets, by Mem's id.
		first := memAbout(lang)[0]
		// D459: a row the person told it says no source line (said once in the note).
		if err := tt.Click(first.Title); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		if !hasText(tt, L.T("mem.item.wrong")) {
			t.Fatalf("the row didn't open: %q", tt.Texts())
		}
		if err := tt.Click(spoken(L, L.T("partner.memory.forget"), first.Title)); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		if len(*sent) != n || !hasText(tt, L.T("mem.item.forget.ask", first.Title)) {
			t.Fatalf("忘掉 didn't ask first: %v %q", (*sent)[n:], tt.Texts())
		}
		if err := tt.Click(spoken(L, L.T("partner.memory.forget"), first.Title)); err != nil {
			t.Fatal(err)
		}
		if len(*sent) != n+1 || (*sent)[n].(protocol.MemForget).ID != first.ID {
			t.Fatalf("忘掉 sent %v", (*sent)[n:])
		}
		tt.Frame()
		// D652: the row waits for Mem; nothing is said and nothing leaves before it answers.
		if !hasText(tt, L.T("mem.done.wait")) || hasText(tt, L.T("said.mem.forget", first.Title)) {
			t.Fatalf("after the tap: %q", tt.Texts())
		}
		if !hasText(tt, autospace(first.Title)) {
			t.Fatalf("the row left before Mem answered: %q", tt.Texts())
		}
		// Mem took it: the row leaves (as the fresh settings frame would show) and the word comes.
		app.Receive(protocol.ServerFrame{T: "mem_done", MemDone: &protocol.MemDone{ID: first.ID, Op: "forget", OK: true, Title: first.Title}})
		for i, x := range app.S.Mem.Glance.About {
			if x.ID == first.ID {
				app.S.Mem.Glance.About = append(app.S.Mem.Glance.About[:i], app.S.Mem.Glance.About[i+1:]...)
				break
			}
		}
		tt.Frame()
		for _, x := range tt.Texts() {
			if x == first.Title || x == autospace(first.Title) {
				t.Fatalf("a forgotten memory is still shown")
			}
		}
		// D459: the forget is answered in the partner's one word.
		if !hasText(tt, L.T("said.mem.forget", first.Title)) {
			t.Fatalf("no word after the forget: %q", tt.Texts())
		}
		// 改 writes the words back by id.
		second := memAbout(lang)[1]
		if err := tt.Click(second.Title + ", " + L.T("mem.by.tool", "Codex")); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		if err := tt.Click(spoken(L, L.T("learned.fix"), second.Title)); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		app.memPage.fixText = "Chat in Chinese"
		if err := tt.Click(spoken(L, L.T("learned.save"), second.Title)); err != nil {
			t.Fatal(err)
		}
		if fx, ok := (*sent)[len(*sent)-1].(protocol.MemFix); !ok || fx.ID != second.ID || fx.Title != "Chat in Chinese" || fx.Kind != second.Kind {
			t.Fatalf("改 sent %v", (*sent)[n:])
		}
		app.Receive(protocol.ServerFrame{T: "mem_done", MemDone: &protocol.MemDone{ID: second.ID, Op: "fix", OK: true, Title: "Chat in Chinese"}})
		tt.Frame()
		if !hasText(tt, L.T("said.mem.fix", "Chat in Chinese")) {
			t.Fatalf("no word after the fix: %q", tt.Texts())
		}
		// Search: the words go to Mem; only the answer to them is shown.
		app.memFind("Weizhen")
		if fd, ok := (*sent)[len(*sent)-1].(protocol.MemFind); !ok || fd.Q != "Weizhen" {
			t.Fatalf("search sent %v", (*sent)[len(*sent)-1])
		}
		app.Receive(protocol.ServerFrame{T: "mem_found", MemFound: &protocol.MemFound{Q: "old", OK: true}})
		if app.S.MemFound != nil {
			t.Fatalf("an answer to an older search was taken")
		}
	}
}

// memAbout is what the pretend Mem knows about the person (D321): never anyone's real memories.
func memAbout(lang i18n.Lang) []protocol.MemItem {
	zh := lang == i18n.ZH
	pick := func(z, e string) string {
		if zh {
			return z
		}
		return e
	}
	now := time.Now()
	at := func(d time.Duration) string { return now.Add(-d).UTC().Format(time.RFC3339) }
	return []protocol.MemItem{
		{ID: "m_p1", Title: pick("喜欢先看结论，细节放后面", "Likes the conclusion first, details after"), Kind: "preference", By: "said", At: at(26 * time.Hour)},
		{ID: "m_p2", Title: pick("聊天用中文，仓库里的文档和代码用英文", "Chat in Chinese; docs and code in the repo in English"), Kind: "preference", By: "tool", From: "Codex", At: at(36 * time.Hour)},
		{ID: "m_p3", Title: pick("英文邮件回得短、口语，不用敬语", "English mail: short and plain, no formalities"), Kind: "preference", By: "mem", At: at(72 * time.Hour)},
		{ID: "m_d1", Title: pick("周报每周五下午发，发给 Nowledge 全组", "The weekly report goes out Friday afternoon, to the whole Nowledge team"), Kind: "decision", By: "said", At: at(48 * time.Hour)},
		{ID: "m_d2", Title: pick("Ducter 先只做 macOS 和网页，Windows 往后放", "Ducter ships macOS and the web first; Windows later"), Kind: "decision", By: "you", At: at(6 * 24 * time.Hour)},
		{ID: "m_f1", Title: pick("Weizhen 负责 HawDB 的代码评审", "Weizhen reviews HawDB's code"), Kind: "fact", By: "said", At: at(84 * time.Hour)},
	}
}

func memNotes(lang i18n.Lang) []string {
	if lang == i18n.ZH {
		return []string{"开会别排在中午 12 点到 1 点", "周报每周五下午发，发给整个组", "测试统一用假时钟，不用真的 sleep", "Weizhen 负责 HawDB 的代码审查", "HawDB 的发布说明用英文写", "家里的网是电信，路由器在书房"}
	}
	return []string{"No meetings between 12 and 1", "The weekly report goes out Friday afternoon, to the whole team", "Tests use the fake clock, never a real sleep", "Weizhen reviews HawDB's code", "HawDB release notes are written in English", "Home internet is on China Telecom; the router is in the study"}
}

// memApp is the app with a settings frame in one of the demo's states
// (apps/web/demo-memory.ts): newer, on, empty, off, fresh, sign_in, old.
func memApp(t *testing.T, lang i18n.Lang, state string) (*App, *[]any) {
	t.Helper()
	app, sent := iaApp(t, lang)
	app.Status = 2
	f := settingsFrame()
	f.Settings.Peers = &protocol.Peers{Reach: "own", Trusted: []string{}, Muted: []string{}}
	now := time.Now()
	backs := []time.Duration{40 * time.Minute, 3 * time.Hour, 26 * time.Hour, 50 * time.Hour, 4 * 24 * time.Hour, 9 * 24 * time.Hour}
	f.Mem.Noted = nil
	for i, title := range memNotes(lang) {
		at := now.Add(-backs[i])
		// The first two are "today" whatever the hour (CI runs past midnight: 00:34 minus 40 minutes is yesterday).
		if midnight := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()); i < 2 && at.Before(midnight) {
			at = midnight.Add(time.Duration(2-i) * time.Second)
		}
		f.Mem.Noted = append(f.Mem.Noted, protocol.Noted{Seq: int64(10 - i), Title: title, At: at.UTC().Format(time.RFC3339), MemoryID: fmt.Sprint("m", i)})
	}
	f.Mem.KeptUnder = "小鸭"
	if lang == i18n.EN {
		f.Mem.KeptUnder = "Duckie"
	}
	// D321: what Mem knows about the person, and the other tools as counts.
	f.Mem.Glance = &protocol.MemGlance{Total: 10980, About: memAbout(lang), Tools: []protocol.MemTool{{From: "Codex", Count: 53}, {From: "Claude Code", Count: 12}}}
	space := &protocol.BridgeSpace{ID: "6f1c0d2e-8b4a-4d1e-9c3f-2a7b5e0d9c11", Label: "Only me"}
	switch state {
	case "newer":
		f.Bridge = &protocol.BridgeView{State: "connected", Identity: "ducter", Space: space, Home: "hel", Version: "0.10.118", Newer: ptr("0.10.121"), Upkeep: &protocol.BridgeUpkeep{Kind: "update"}}
	case "on":
		f.Bridge = &protocol.BridgeView{State: "connected", Identity: "ducter", Space: space, Home: "hel", Version: "0.10.121"}
	case "empty":
		f.Mem.Noted, f.Mem.Glance = nil, &protocol.MemGlance{Total: 3}
		f.Bridge = &protocol.BridgeView{State: "connected", Identity: "ducter", Space: space, Home: "hel", Version: "0.10.121"}
	case "off":
		f.Settings.Memory = false
		f.Mem.State = "off"
	case "fresh":
		f.Mem.Noted, f.Mem.KeptUnder, f.Mem.State = nil, "", "missing"
		f.Bridge = &protocol.BridgeView{State: "install_mem", Identity: "ducter", Home: "hel", CanRun: true}
	case "sign_in":
		f.Mem.Noted, f.Mem.KeptUnder, f.Mem.State = nil, "", "missing"
		f.Bridge = &protocol.BridgeView{State: "sign_in", Identity: "ducter", Home: "hel", Version: "0.10.121"}
	case "old":
		f.Bridge = &protocol.BridgeView{State: "update_mem", Identity: "ducter", Home: "hel", Version: "0.10.116", CanRun: true}
	}
	if lang == i18n.EN {
		f.Settings.Name = "Duckie"
	}
	app.Receive(f)
	return app, sent
}

// Pictures of Memory and Connected AI agents in each state, zh and en:
//
//	DUCTER_MEM_SHOTS=/path/to/.shots/mem-settings go test ./internal/views -run MemShots
func TestMemShots(t *testing.T) {
	dir := os.Getenv("DUCTER_MEM_SHOTS")
	if dir == "" {
		t.Skip("DUCTER_MEM_SHOTS not set")
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, st := range []string{"newer", "on", "empty", "off", "fresh", "sign_in", "old"} {
			for _, tab := range []string{TabMemory, TabPeers, TabPartner} {
				if tab != TabMemory && st != "newer" && !(tab == TabPeers && st == "old") {
					continue
				}
				app, _ := memApp(t, lang, st)
				app.openTab(tab)
				tt := ui.NewTesterWith(app.View, 1280, 1640, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
				tt.Frame()
				tt.Frame()
				tt.Frame()
				f, err := os.Create(filepath.Join(dir, fmt.Sprintf("after-mac-%s-%s-%s.png", tab, st, lang)))
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

// D364: the update that names senders shows on the connected pane only for
// an nmem before 0.10.120 with a newer one out. The web's cases
// (apps/web/test/memory.test.ts).
func TestPeersNamesUpdate(t *testing.T) {
	newer := func(v string) *string { return &v }
	up := &protocol.BridgeUpkeep{Kind: "update"}
	for _, c := range []struct {
		b    *protocol.BridgeView
		want string
	}{
		{&protocol.BridgeView{State: "connected", Version: "0.10.119", Newer: newer("0.10.120"), Upkeep: up}, "newer"},
		{&protocol.BridgeView{State: "connected", Version: "0.10.119", Newer: newer("0.10.120")}, "app"},
		{&protocol.BridgeView{State: "connected", Version: "0.10.119"}, ""},
		{&protocol.BridgeView{State: "connected", Version: "0.10.120", Newer: newer("0.10.121"), Upkeep: up}, ""},
		{&protocol.BridgeView{State: "ready", Version: "0.10.119", Newer: newer("0.10.120"), Upkeep: up}, ""},
		{&protocol.BridgeView{State: "connected", Version: "weird", Newer: newer("0.10.120")}, ""},
		{nil, ""},
	} {
		got := ""
		if u := peersNamesUpdate(c.b); u != nil {
			got = u.Kind
		}
		if got != c.want {
			t.Errorf("peersNamesUpdate(%+v) = %q, want %q", c.b, got, c.want)
		}
	}
	for _, c := range []struct {
		v, min string
		want   bool
	}{{"0.10.119", "0.10.120", true}, {"0.10.120", "0.10.120", false}, {"0.11.0", "0.10.120", false}, {"0.9.200", "0.10.120", true}, {"", "0.10.120", false}, {"0.10.120-rc1", "0.10.120", false}} {
		if got := nmemOlder(c.v, c.min); got != c.want {
			t.Errorf("nmemOlder(%q, %q) = %v, want %v", c.v, c.min, got, c.want)
		}
	}
}
