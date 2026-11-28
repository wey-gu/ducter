package views

import (
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D664: one Nowledge Mem setup on Memory and Agent messaging, its steps live (memsetup.go; the
// web's mem-setup-view.ts and mem-setup.tsx). The steps read the settings frame's facts; the next
// undone step carries its one action and every step after it is later; all done, one calm line.
// A look again runs when the pane opens and when the window comes back, once in memLookEvery unless
// tapped, and the home's settings frame ends the spinner.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=$PWD/../../../../.shots/memsetup/mac go test ./internal/views -run MemSetup

func setupLooks(v memSetupView) string {
	var out []string
	for _, s := range v.Steps {
		out = append(out, s.ID+":"+s.Look)
	}
	return strings.Join(out, " ")
}

func setupNext(v memSetupView) setupStepView {
	for _, s := range v.Steps {
		if s.Look != "done" {
			return s
		}
	}
	return setupStepView{}
}

func TestMemSetupOf(t *testing.T) {
	space := &protocol.BridgeSpace{ID: "p", Label: "Only me"}
	bv := func(state string) *protocol.BridgeView {
		return &protocol.BridgeView{State: state, Identity: "ducter", Home: "hel", Version: "0.10.125", Where: "cloud", Space: space}
	}
	on := &protocol.MemView{State: "connected", KeptUnder: "小鸭", Health: &protocol.MemHealth{}}
	o := memSetupOpts{Home: "hel", Partner: "小鸭"}
	peers := memSetupOpts{Home: "hel", Partner: "小鸭", Mailbox: true}
	with := func(b *protocol.BridgeView, f func(*protocol.BridgeView)) *protocol.BridgeView { f(b); return b }
	cases := []struct {
		name        string
		m           *protocol.MemView
		b           *protocol.BridgeView
		o           memSetupOpts
		looks, act  string
		done        bool
		head, label string
	}{
		{"missing nmem", nil, with(bv("install_mem"), func(b *protocol.BridgeView) { b.CanRun, b.Space, b.Version = true, nil, "" }), o, "nmem:now signin:later name:later", "install", false, "memsetup.head.left", "bridge.mem.install.go"},
		{"missing tool", nil, with(bv("install_mem"), func(b *protocol.BridgeView) { b.Cmd, b.Space = "brew install pipx", nil }), o, "nmem:now signin:later name:later", "copy", false, "memsetup.head.left", ""},
		{"old nmem", nil, with(bv("update_mem"), func(b *protocol.BridgeView) { b.Version, b.CanRun = "0.10.116", true }), o, "nmem:failed signin:later space:later name:later", "update", false, "memsetup.head.failed", "mem.health.old.go"},
		{"closed", nil, with(bv("mem_closed"), func(b *protocol.BridgeView) { b.CanOpen = true }), o, "nmem:failed signin:later space:later name:later", "open_mem", false, "memsetup.head.failed", "bridge.mem.open"},
		{"signed out, first", nil, with(bv("sign_in"), func(b *protocol.BridgeView) { b.Space = nil }), o, "nmem:done signin:now name:later", "sign_in", false, "memsetup.head.left", "bridge.mem.signin.go"},
		{"signed out, lapsed", &protocol.MemView{State: "connected", KeptUnder: "小鸭", Health: &protocol.MemHealth{Issue: "signed_out"}}, bv("connected"), o, "nmem:done signin:failed space:later name:later", "sign_in", false, "memsetup.head.failed", "mem.health.signin"},
		{"no space, peers", on, with(bv("no_space"), func(b *protocol.BridgeView) { b.Space = nil }), peers, "nmem:done signin:done space:failed mailbox:later name:later", "check_again", false, "memsetup.head.failed", "mem.health.again"},
		{"no space, memory", on, with(bv("no_space"), func(b *protocol.BridgeView) { b.Space = nil }), o, "nmem:done signin:done name:done", "", true, "memsetup.done", ""},
		{"ready, memory", on, bv("ready"), o, "nmem:done signin:done space:done name:done", "", true, "memsetup.done", ""},
		{"ready, peers: joins by itself", on, bv("ready"), peers, "nmem:done signin:done space:done mailbox:busy name:later", "none", false, "memsetup.head.left", ""},
		{"bridge refused", on, with(bv("refused"), func(b *protocol.BridgeView) { b.Reason = "authority_missing" }), peers, "nmem:done signin:done space:done mailbox:failed name:later", "connect", false, "memsetup.head.failed", "bridge.retry"},
		{"connected", on, bv("connected"), peers, "nmem:done signin:done space:done mailbox:done name:done", "", true, "memsetup.done", ""},
	}
	for _, c := range cases {
		v := memSetupOf(c.m, c.b, c.o)
		if got := setupLooks(v); got != c.looks {
			t.Errorf("%s: %s, want %s", c.name, got, c.looks)
		}
		if v.Done != c.done || v.Head.Key != c.head {
			t.Errorf("%s: done %v head %s", c.name, v.Done, v.Head.Key)
		}
		if n := setupNext(v); n.Act != c.act && !(c.act == "" && v.Done) || n.Label != c.label {
			t.Errorf("%s: next %+v", c.name, n)
		}
		// Nothing after the next step pretends to be done: later steps carry no action.
		for _, s := range v.Steps {
			if s.Look == "later" && (s.Act != "none" || (s.Line != nil && s.ID != "signin")) {
				t.Errorf("%s: a later step claims something: %+v", c.name, s)
			}
		}
		for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
			L := i18n.New(lang)
			for _, s := range v.Steps {
				for _, w := range []*memWord{&s.Title, s.Line, s.Why, s.Also, s.Fact} {
					if w == nil {
						continue
					}
					if txt := L.T(w.Key, w.Args...); txt == w.Key || strings.Contains(txt, "%!") || strings.Contains(txt, " · ") {
						t.Errorf("%s %s: %s says %q", c.name, lang, w.Key, txt)
					}
				}
			}
		}
	}
	// The head counts what is left in words, never a format slip.
	v := memSetupOf(nil, &protocol.BridgeView{State: "install_mem", Home: "hel", CanRun: true}, o)
	if got := i18n.New(i18n.ZH).T(v.Head.Key, v.Head.Args...); got != "还差 3 步" {
		t.Errorf("head %q", got)
	}
	// A look again: the next step's mark spins, its action stays; a done setup shows no spinner.
	v = memSetupOf(nil, bv("sign_in"), memSetupOpts{Home: "hel", Checking: true})
	if n := setupNext(v); !n.Checking || n.Act != "sign_in" {
		t.Errorf("checking: %+v", n)
	}
	for _, s := range memSetupOf(on, bv("ready"), memSetupOpts{Home: "hel", Checking: true}).Steps {
		if s.Checking {
			t.Errorf("a done setup spins: %+v", s)
		}
	}
}

// memSetupShot writes a shot of the Settings pane, and a 2x crop of the setup group.
func memSetupShot(t *testing.T, tt *ui.Tester, name string) {
	t.Helper()
	if os.Getenv("DUCTER_SHOTS") == "" {
		return
	}
	save := func(n string, img image.Image) {
		f, err := os.Create(filepath.Join(shotsDir(t), n+".png"))
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if err := png.Encode(f, img); err != nil {
			t.Fatal(err)
		}
	}
	tt.Frame()
	save(name, tt.Image())
	if r, ok := tt.Find("Nowledge Mem"); ok {
		tt.SetScale(2)
		tt.Frame()
		img := tt.Image()
		y0 := max(0, int(r.Y-40)*2)
		save(name+"-2x", img.SubImage(image.Rect(max(0, int(r.X-90)*2), y0, img.Bounds().Dx(), min(img.Bounds().Dy(), y0+1300))))
		tt.SetScale(1)
	}
}

func TestMemSetupPanes(t *testing.T) {
	space := &protocol.BridgeSpace{ID: "p", Label: "Only me"}
	states := []struct {
		name string
		tab  string
		b    protocol.BridgeView
		h    *protocol.MemHealth
	}{
		{"fresh", TabMemory, protocol.BridgeView{State: "install_mem", Identity: "ducter", Home: "hel", CanRun: true}, nil},
		{"half", TabMemory, protocol.BridgeView{State: "sign_in", Identity: "ducter", Home: "hel", Version: "0.10.125"}, nil},
		{"failed", TabMemory, protocol.BridgeView{State: "update_mem", Identity: "ducter", Home: "hel", Version: "0.10.116", CanRun: true}, nil},
		{"done", TabMemory, protocol.BridgeView{State: "connected", Identity: "ducter", Home: "hel", Version: "0.10.125", Where: "cloud", Space: space}, &protocol.MemHealth{}},
		{"peers-half", TabPeers, protocol.BridgeView{State: "sign_in", Identity: "ducter", Home: "hel", Version: "0.10.125"}, nil},
		{"peers-failed", TabPeers, protocol.BridgeView{State: "refused", Reason: "authority_missing", Identity: "ducter", Home: "hel", Version: "0.10.125", Where: "cloud", Space: space}, &protocol.MemHealth{}},
		{"peers-done", TabPeers, protocol.BridgeView{State: "connected", Identity: "ducter", Home: "hel", Version: "0.10.125", Where: "cloud", Space: space}, &protocol.MemHealth{}},
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, dark := range []bool{false, true} {
			for _, s := range states {
				t.Run(fmt.Sprintf("%s-%s-%v", lang, s.name, dark), func(t *testing.T) {
					L := i18n.New(lang)
					app, sent := memApp(t, lang, "on")
					app.S.Settings.Peers = &protocol.Peers{Reach: "own", Trusted: []string{}, Muted: []string{}}
					app.S.OwnAgents = []string{"claude-code", "codex"}
					b := s.b
					app.S.Bridge = &b
					app.S.Mem.Health = s.h
					app.openTab(s.tab)
					// Opening the pane looks at the setup again (read-only), once.
					looks := 0
					for _, f := range *sent {
						if r, ok := f.(protocol.MemHealthReq); ok && r.Setup {
							looks++
						}
					}
					if looks != 1 {
						t.Fatalf("opening %s sent %d looks", s.tab, looks)
					}
					// The home answers: its settings frame ends the spinner.
					app.S.SettingsN++
					tt := d329Tester(app, 1150, 2400, dark)
					tt.SetWindowActive(true)
					tt.Frame()
					if app.memChecking {
						t.Fatal("the home's frame didn't end the spinner")
					}
					v := app.memSetupNow(s.tab == TabPeers)
					head := L.T(v.Head.Key, v.Head.Args...)
					if !hasText(tt, head) {
						t.Fatalf("no head %q in %q", head, tt.Texts())
					}
					if v.Done {
						// One calm line: the steps folded behind 每一步, which reopens them.
						if hasText(tt, L.T("memsetup.signin.done")) {
							t.Fatalf("a done setup shows its steps: %q", tt.Texts())
						}
						memSetupShot(t, tt, fmt.Sprintf("mac-%s-%s-%s", s.name, lang, map[bool]string{false: "light", true: "dark"}[dark]))
						if err := tt.Click(L.T("memsetup.steps")); err != nil {
							t.Fatal(err)
						}
						tt.Frame()
						if !hasText(tt, L.T("memsetup.signin.done")) {
							t.Fatalf("每一步 didn't reopen the steps: %q", tt.Texts())
						}
						memSetupShot(t, tt, fmt.Sprintf("mac-%s-open-%s-%s", s.name, lang, map[bool]string{false: "light", true: "dark"}[dark]))
						return
					}
					n := setupNext(v)
					if !hasText(tt, L.T(n.Title.Key, n.Title.Args...)) {
						t.Fatalf("no next step %q in %q", n.Title.Key, tt.Texts())
					}
					if n.Label != "" && !hasText(tt, L.T(n.Label)) {
						t.Fatalf("no action %q in %q", n.Label, tt.Texts())
					}
					memSetupShot(t, tt, fmt.Sprintf("mac-%s-%s-%s", s.name, lang, map[bool]string{false: "light", true: "dark"}[dark]))
				})
			}
		}
	}
}

func TestMemSetupLive(t *testing.T) {
	L := i18n.New(i18n.ZH)
	app, sent := memApp(t, i18n.ZH, "on")
	app.S.Bridge = &protocol.BridgeView{State: "no_space", Identity: "ducter", Home: "hel", Version: "0.10.125"}
	app.S.Settings.Peers = &protocol.Peers{Reach: "own", Trusted: []string{}, Muted: []string{}}
	app.S.OwnAgents = []string{"claude-code"}
	count := func() int {
		n := 0
		for _, f := range *sent {
			if r, ok := f.(protocol.MemHealthReq); ok && r.Setup {
				n++
			}
		}
		return n
	}
	app.openTab(TabPeers)
	tt := ui.NewTesterWith(app.View, 1150, 2400, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
	tt.SetWindowActive(true)
	tt.Frame()
	if count() != 1 {
		t.Fatalf("open: %d looks", count())
	}
	// While it looks, the next step's mark is the spinner and its 再看一次 stays.
	if !app.memChecking || !hasText(tt, L.T("mem.health.again")) {
		t.Fatalf("checking %v: %q", app.memChecking, tt.Texts())
	}
	// The window goes to the back and comes again within memLookEvery: no second look.
	tt.SetWindowActive(false)
	tt.Frame()
	tt.SetWindowActive(true)
	tt.Frame()
	if count() != 1 {
		t.Fatalf("back too soon: %d looks", count())
	}
	// 再看一次 always looks.
	app.S.SettingsN++
	tt.Frame()
	if err := tt.Click(L.T("mem.health.again")); err != nil {
		t.Fatal(err)
	}
	if count() != 2 {
		t.Fatalf("tap: %d looks", count())
	}
	// Later, the window back looks again by itself.
	app.memLookedAt = app.memLookedAt.Add(-memLookEvery - time.Second)
	tt.SetWindowActive(false)
	tt.Frame()
	tt.SetWindowActive(true)
	tt.Frame()
	if count() != 3 {
		t.Fatalf("back later: %d looks", count())
	}
	// A home that never answers lets the spinner go after memLookWait.
	app.memLookedAt = app.memLookedAt.Add(-memLookWait - time.Second)
	tt.Frame()
	if app.memChecking {
		t.Fatal("the spinner never let go")
	}
}

// Both panes draw the one setup group; no other Mem steps are left on the Mac.
func TestMemSetupOneComponent(t *testing.T) {
	read := func(f string) string {
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		return string(b)
	}
	mem, peers := read("memory_pane.go"), read("peers_pane.go")
	for _, w := range []string{`a.memSetup(c, "mem-app", false,`, `a.memSetup(c, "mem-setup", false,`} {
		if !strings.Contains(mem, w) {
			t.Errorf("memory_pane.go lacks %s", w)
		}
	}
	for _, w := range []string{`a.memSetup(c, "peers-mem", true,`, `a.memSetup(c, "peers-setup", true, nil, nil, nil)`} {
		if !strings.Contains(peers, w) {
			t.Errorf("peers_pane.go lacks %s", w)
		}
	}
	for _, gone := range []string{"func (a *App) memSteps(", "func (a *App) memClosed(", "func (a *App) memHealthHead("} {
		if strings.Contains(mem, gone) {
			t.Errorf("memory_pane.go still has %s", gone)
		}
	}
	if !strings.Contains(read("memsetup.go"), "a.setupStep(c, i+1,") {
		t.Error("the steps are not drawn by the shared setupStep")
	}
}
