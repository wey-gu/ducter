package views

import (
	"context"
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
)

// D161 as built: every device card is a character sheet. The author's
// setup: hel is the home (a server; Claude Code, Codex signed out, pi), the
// MacBook is this Mac and does tasks for hel (Claude Code on a version
// Ducter hasn't checked, Codex shared with hel, pi one version behind),
// and an iPhone. Each coin's detail opens in place; the chips act on one
// tap and ask only when tasks would stop; the connections open in place;
// one 断开这台 MacBook at the foot. Evidence, not source (D75):
//
//	DUCTER_CARD_SHOTS=$PWD/../../../../.shots/device-card-built go test ./internal/views -run CharacterSheet

type macWorkOn struct{ on bool }

func (m *macWorkOn) On() (bool, string)          { return m.on, "dev_mac" }
func (m *macWorkOn) Start(context.Context) error { m.on = true; return nil }
func (m *macWorkOn) Stop() (string, error)       { m.on = false; return "dev_mac", nil }
func (m *macWorkOn) Log() string                 { return "~/Library/Application Support/Ducter/worker.log" }
func sheetAgo(d time.Duration) string            { return time.Now().Add(-d).UTC().Format(time.RFC3339) }
func sheetHarness(h, v, how string) protocol.DeviceHarness {
	return protocol.DeviceHarness{Harness: h, Installed: true, LoggedIn: true, Version: v, How: how}
}

func sheetWorld(macState string) protocol.ServerFrame {
	no := false
	claude := sheetHarness("claude-code", "2.1.322", "installer")
	claude.Standing = "newer"
	pi := sheetHarness("pi", "1.4.0", "installer")
	pi.Latest, pi.Available, pi.LatestVerified = "1.4.2", true, &no
	codexOff := sheetHarness("codex", "0.167.0", "npm")
	codexOff.LoggedIn = false
	return protocol.ServerFrame{T: "devices", Devices: []protocol.DeviceView{
		{ID: "local", Name: "hel", Kind: "server", Home: true, State: "awake", AlwaysOn: true, Platform: "linux-x64", Version: "0.0.7",
			Harnesses: []protocol.DeviceHarness{sheetHarness("claude-code", "2.1.319", "installer"), codexOff, sheetHarness("pi", "1.4.0", "ducter")},
			Abilities: []protocol.DeviceAbility{{ID: "web", State: "on", Where: "ducter"}, {ID: "computer", State: "later"}, {ID: "remote", State: "on"}},
			Update:    &protocol.DeviceUpdate{Current: "0.0.7", Latest: "0.0.7", How: "self"}},
		{ID: "dev_mac", Name: "MacBook", Computer: "MacBook", Kind: "laptop", State: macState, LastSeen: sheetAgo(2 * time.Hour), Platform: "darwin-arm64", Version: "0.0.7",
			Harnesses: []protocol.DeviceHarness{claude, sheetHarness("codex", "0.167.0", "brew"), pi},
			Abilities: []protocol.DeviceAbility{{ID: "web", State: "off", Where: "chrome"}, {ID: "computer", State: "on"}},
			Update:    &protocol.DeviceUpdate{Current: "0.0.7", Latest: "0.0.7", How: "app"}},
	}, Reach: &protocol.Reach{Clients: []protocol.ReachClient{
		{ID: "app1", Name: "MacBook", Platform: "darwin", Connected: true, Form: "app", Computer: "MacBook"},
		{ID: "cli1", Name: "CLI on MacBook", Platform: "darwin", Form: "cli", Computer: "MacBook", LastSeen: sheetAgo(3 * time.Minute)},
		{ID: "ph1", Name: "iPhone", Platform: "ios-safari", Connected: true},
	}}}
}

func sheetApp(t *testing.T, lang i18n.Lang, macState string) *App {
	app, _ := iaApp(t, lang)
	app.Status = client.Connected
	app.LocaleFixed = true
	app.MacWorker, app.ThisComputer, app.URL = &macWorkOn{on: true}, "MacBook", "wss://hel.example/ws"
	app.Receive(sheetWorld(macState))
	app.Receive(protocol.ServerFrame{T: "settings", Settings: &protocol.Settings{Name: "Ducter", Language: "auto"}})
	cards := []protocol.TaskCard{}
	if macState == "awake" {
		for _, id := range []string{"t1", "t2"} {
			cards = append(cards, protocol.TaskCard{TaskID: id, Title: id, Place: protocol.Place{Kind: "none", Device: "dev_mac"}, Harness: "claude-code", Attention: protocol.Working})
		}
	}
	app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: cards}})
	app.OpenDevices()
	app.devState().sel = "dev_mac"
	return app
}

func sheetTester(app *App, w, h int, still bool) *ui.Tester {
	tt := ui.NewTesterWith(app.View, w, h, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: still}})
	tt.SetTitleBar(ui.TitleBar{Height: ChromeH, Left: 78})
	tt.Frame()
	tt.Frame()
	return tt
}

func TestCharacterSheet(t *testing.T) {
	dir := os.Getenv("DUCTER_CARD_SHOTS")
	if dir != "" {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		shot := func(tt *ui.Tester, name string) {
			if dir == "" {
				return
			}
			tt.Move(4, 4)
			tt.Advance(600 * time.Millisecond)
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
		click := func(tt *ui.Tester, label string) {
			t.Helper()
			if err := tt.Click(label); err != nil {
				t.Fatalf("%s: click %q: %v in %q", lang, label, err, tt.Texts())
			}
			tt.Advance(300 * time.Millisecond)
			tt.Frame()
		}
		has := func(tt *ui.Tester, want ...string) {
			t.Helper()
			for _, w := range want {
				if !tt.HasText(w) {
					t.Fatalf("%s: missing %q in %q", lang, w, tt.Texts())
				}
			}
		}
		hasNot := func(tt *ui.Tester, not ...string) {
			t.Helper()
			for _, w := range not {
				if tt.HasText(w) {
					t.Fatalf("%s: %q should not show by default", lang, w)
				}
			}
		}

		for _, sz := range [][2]int{{1100, 720}, {1280, 860}} {
			app := sheetApp(t, lang, "awake")
			tt := sheetTester(app, sz[0], sz[1], false)
			// The default card: who, how it is, what it carries, what it can do; nothing else.
			has(tt, L.T("card.status.working", "hel", 2), L.T("chip.worker", "hel"), L.T("chip.computer"), "+ "+L.T("chip.web"),
				L.T("card.via", L.T("card.via.app")+L.T("card.via.and")+L.T("card.via.cli")), L.T("card.disconnect.device", "MacBook"))
			hasNot(tt, L.T("agentv.unverified"), L.T("work.mac.note.on", app.MacWorker.Log()), app.MacWorker.Log(), L.T("device.does"), L.T("token.shared", 2))
			if r, ok := tt.Find("· " + L.T("list.state.tasks", 2)); !ok || r.H > 24 {
				t.Fatalf("%s: the list's word wraps or is missing: %v %v", lang, r, ok)
			}
			shot(tt, fmt.Sprintf("page-%d", sz[0]))
			// pi has an update: its detail in place, the channel in words, D156's helper.
			click(tt, "pi · MacBook · "+L.T("agentv.available", "1.4.2"))
			has(tt, L.T("coin.version", "1.4.0", L.T("coin.how.installer")), L.T("agentv.available", "1.4.2"), L.T("agentv.latest.unverified", "1.4.2"), L.T("loadout.acct.tasks"))
			shot(tt, fmt.Sprintf("page-%d-pi", sz[0]))
		}

		app := sheetApp(t, lang, "awake")
		tt := sheetTester(app, 1280, 860, false)
		// Claude Code: "not checked" said once, only here.
		click(tt, "Claude Code · MacBook")
		has(tt, L.T("agentv.unverified"), L.T("coin.version", "2.1.322", L.T("coin.how.installer")))
		// Codex: the account's limit shared with hel? Codex is signed out on hel, so no.
		click(tt, "Codex · MacBook")
		has(tt, L.T("coin.version", "0.167.0", L.T("coin.how.brew")))
		hasNot(tt, L.T("coin.shared", "hel"))
		click(tt, "Codex · MacBook") // closes
		hasNot(tt, L.T("coin.version", "0.167.0", L.T("coin.how.brew")))

		// The update lands: the coin pops once (the motion is time-boxed).
		click(tt, "pi · MacBook · "+L.T("agentv.available", "1.4.2"))
		click(tt, L.T("agentv.button")+" · pi")
		mac := app.S.Device("dev_mac")
		mac.Harnesses[2].Update = &protocol.AgentUpdate{Phase: "updating", From: "1.4.0", To: "1.4.2"}
		tt.Advance(100 * time.Millisecond)
		tt.Frame()
		mac.Harnesses[2].Update = &protocol.AgentUpdate{Phase: "done", From: "1.4.0", To: "1.4.2"}
		mac.Harnesses[2].Version, mac.Harnesses[2].Available = "1.4.2", false
		tt.Frame()
		if _, ok := app.devState().card.sheet.pop["dev_mac|pi"]; !ok {
			t.Fatalf("%s: no pop when pi's update landed", lang)
		}
		has(tt, L.T("agentv.phase.done", "1.4.2"))
		tt.Advance(180 * time.Millisecond)
		tt.Frame()
		shot(tt, "pi-pop")

		// ⓘ holds the old helper; the chip asks before stopping running tasks, default 做完再停.
		app = sheetApp(t, lang, "awake")
		tt = sheetTester(app, 1280, 860, true)
		click(tt, L.T("chip.info")+" · "+L.T("chip.worker", "hel"))
		has(tt, L.T("work.mac.note.off", "hel")+" "+L.T("where.first_line"))
		click(tt, L.T("chip.info")+" · "+L.T("chip.worker", "hel"))
		click(tt, L.T("chip.worker", "hel")+" · "+L.T("chip.state.on"))
		has(tt, L.T("chip.stop.ask", "MacBook", 2), L.T("chip.stop.after"), L.T("chip.stop.now"))
		shot(tt, "stop-ask")
		click(tt, L.T("chip.stop.after"))
		has(tt, L.T("chip.stop.pending"))
		if !app.MacWorker.(*macWorkOn).on {
			t.Fatalf("%s: 做完再停 stopped at once", lang)
		}
		app.Receive(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{}})
		tt.Frame()
		if app.MacWorker.(*macWorkOn).on {
			t.Fatalf("%s: still doing tasks after they finished", lang)
		}

		// Turning on an ability is one tap: Use apps off is one tap too (nothing at stake).
		app = sheetApp(t, lang, "awake")
		tt = sheetTester(app, 1280, 860, true)
		var sent []any
		app.Send = func(f any) error { sent = append(sent, f); return nil }
		click(tt, L.T("chip.computer")+" · "+L.T("chip.state.on"))
		if r, ok := lastSent[protocol.AbilityReq](sent); !ok || r.On || r.Ability != "computer" || r.Device != "dev_mac" {
			t.Fatalf("%s: Use apps off sent %#v", lang, sent)
		}

		// The connections open in place, each with its own 断开 and an inline confirm.
		click(tt, L.T("card.via.more"))
		has(tt, L.T("card.conn.app"), L.T("card.conn.cli"))
		click(tt, L.T("device.disconnect")+" · "+L.T("device.cli.name", "MacBook"))
		has(tt, L.T("device.disconnect.ask", L.T("device.cli.name", "MacBook")))
		shot(tt, "connections")
		// The foot: one 断开这台 MacBook, confirmed in place.
		app.devState().card.cutting, app.devState().card.sheet.via = "", ""
		tt.Frame()
		click(tt, L.T("card.disconnect.device", "MacBook"))
		has(tt, L.T("device.disconnect.ask", "MacBook"))

		// hel from this Mac: Codex is grey; its detail only says sign in there.
		app = sheetApp(t, lang, "awake")
		app.devState().sel = "local"
		tt = sheetTester(app, 1280, 860, true)
		has(tt, L.T("card.status.home", "Ducter"), L.T("chip.web"), L.T("chip.remote"))
		hasNot(tt, L.T("card.disconnect.device", "hel"))
		click(tt, "Codex · hel · "+L.T("coin.signed_out"))
		has(tt, L.T("coin.signin.why", "hel"), L.T("coin.there", "hel"))
		shot(tt, "hel-codex")
		// Ducter's own version line only with an update.
		hasNot(tt, L.T("devup.current"))
		app.S.Device("local").Update = &protocol.DeviceUpdate{Current: "0.0.7", Latest: "0.0.8", Available: true, How: "self"}
		tt.Frame()
		has(tt, L.T("card.ducter.update", "0.0.8"))
		shot(tt, "hel-update")

		// Asleep and unreachable: the line in its state's ink, the clay under its blanket / in mist.
		for _, st := range []string{"asleep", "unreachable"} {
			app = sheetApp(t, lang, st)
			tt = sheetTester(app, 1280, 860, true)
			want := L.T("device.state.asleep")
			if st == "unreachable" {
				want = L.T("card.status.unreachable", L.T("time.ago.hour", 2))
			}
			has(tt, want)
			shot(tt, st)
		}

		// The iPhone: no coins; how it is connected in one line.
		app = sheetApp(t, lang, "awake")
		app.devState().sel, app.devState().selClient = "", "ph1"
		tt = sheetTester(app, 1280, 860, true)
		has(tt, L.T("device.client.now"), L.T("card.via", L.T("card.via.safari")), L.T("card.disconnect.device", "iPhone"))
		shot(tt, "iphone")
	}
}
