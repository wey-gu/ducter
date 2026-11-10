package views

import (
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/local"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// The terminal-free first run against a fake Mac: the AI tool installed
// and signed in from the window, 上网's three steps, and the macOS asks.
//
//	DUCTER_SHOTS=1 go test ./internal/views -run Onboard   # writes .shots/desktop/onboard-*.png

func act(id, label, detail string, ok, required bool, fix, action string) local.Check {
	k := check(id, label, detail, ok, required, fix)
	if !ok {
		k.Action = action
	}
	return k
}

// A fresh Mac: no AI tool at all.
func freshReport(L func(string, ...any) string) local.Report {
	return local.Report{Checks: []local.Check{
		check("git", "git", "2.50", true, true, ""),
		act("claude", "Claude Code", L("x.notinstalled"), false, true, "curl -fsSL https://claude.ai/install.sh | bash", "install"),
		act("codex", "Codex", L("x.notinstalled"), false, false, "curl -fsSL https://chatgpt.com/codex/install.sh | sh", "install"),
		check("nmem", "Nowledge Mem", L("x.notinstalled"), false, false, "https://mem.nowledge.co"),
		check("port", "port", "7777", true, true, ""),
	}}
}

func signedOut(r local.Report, L func(string, ...any) string) local.Report {
	r.Checks = append([]local.Check(nil), r.Checks...)
	r.Checks[1] = act("claude", "Claude Code", L("x.signedout"), false, true, "claude auth login", "signin")
	return r
}

func signedIn(r local.Report) local.Report {
	r.Checks = append([]local.Check(nil), r.Checks...)
	r.Checks[1] = check("claude", "Claude Code", "2.1.319", true, true, "")
	r.OK, r.HarnessReady = true, true
	return r
}

var doctorWords = map[i18n.Lang]map[string]string{
	i18n.ZH: {"x.notinstalled": "未安装", "x.signedout": "已安装，未登录"},
	i18n.EN: {"x.notinstalled": "not installed", "x.signedout": "installed, not signed in"},
}

func TestOnboardInstallAndSignInFromTheWindow(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		t.Run(string(lang), func(t *testing.T) {
			w := doctorWords[lang]
			L := func(k string, _ ...any) string { return w[k] }
			fresh := freshReport(L)
			f := &fakeBackend{reports: []local.Report{fresh}}
			h := newSetup(t, lang, f)
			T := h.app.L.T
			h.app.StartLocal()
			install := T("fix.install.short")
			h.has(T("setup.pick.body"), "Claude Code", "Codex", install, T("setup.auto.app"))
			if h.tt.HasText(T("setup.recheck")) || h.tt.HasText("Nowledge Mem") {
				t.Error("Check again or the optional line on an automatic screen")
			}
			if h.tt.HasText("curl -fsSL") {
				t.Error("the installer's command shows as a step to type")
			}
			h.shot("onboard-ai-fresh-" + string(lang))

			// One click: the official installer runs in the background, with
			// its last line and how long so far.
			h.click(install + " · Claude Code")
			j := f.jobs["claude.install"]
			if j == nil || j.Cmd != "curl -fsSL https://claude.ai/install.sh | bash" {
				t.Fatalf("runs %q", f.runs)
			}
			j.Line("Setting up Claude Code...")
			h.app.Now = func() time.Time { return j.Started.Add(23 * time.Second) }
			h.has(T("fix.installing.now", 23), T("fix.cancel"))
			h.shot("onboard-ai-installing-" + string(lang))
			h.app.Now = time.Now

			// Offline: say so, and the one thing to do.
			j.Line("curl: (6) Could not resolve host: downloads.claude.ai")
			j.Finish(errors.New("exit status 6"))
			h.tt.Frame()
			h.has(T("fix.offline", "Claude Code"), T("fix.retry"))
			h.shot("onboard-ai-offline-" + string(lang))

			// Try again: it installs; the Mac is checked at once, and the row
			// moves on to signing in.
			f.reports = []local.Report{signedOut(fresh, L)}
			f.doctored = 0
			h.click(T("fix.retry") + " · Claude Code")
			j2 := f.jobs["claude.install"]
			if j2 == j || !j2.Running() {
				t.Fatal("try again didn't start a new install")
			}
			j2.Line("✅ Installation complete!")
			j2.Finish(nil)
			h.tt.Frame()
			h.tt.Frame()
			signin := T("fix.signin.short")
			h.has(signin, w["x.signedout"])

			// Sign in: the browser does it; the window waits and offers the
			// page again and a place for a code.
			h.click(signin + " · Claude Code")
			s := f.jobs["claude.signin"]
			if s == nil || s.Cmd != "claude auth login" {
				t.Fatalf("runs %q", f.runs)
			}
			s.Line("Opening browser to sign in…")
			s.Line("If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true")
			h.has(T("fix.signing"), T("fix.signing.open"), T("fix.signing.code"))
			if !h.app.signingIn() {
				t.Error("not counted as signing in (the quick recheck)")
			}
			h.click(T("fix.signing.code"))
			h.shot("onboard-ai-signin-" + string(lang))

			// The browser finished: All set, then Ducter wakes by itself.
			f.reports = []local.Report{signedIn(fresh)}
			f.doctored = 0
			s.Finish(nil)
			h.tt.Frame()
			h.tt.Frame()
			// No Mem here, so the one question comes next (with Mem: it wakes).
			if h.app.setup.phase != setupName {
				t.Fatalf("didn't go on by itself; phase %d, texts %q", h.app.setup.phase, h.tt.Texts())
			}
		})
	}
}

func TestOnboardAllSetShowsTheDoneCharacter(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		w := doctorWords[lang]
		L := func(k string, _ ...any) string { return w[k] }
		f := &fakeBackend{reports: []local.Report{signedIn(freshReport(L))}}
		h := newSetup(t, lang, f)
		h.app.setup.report = f.reports[0]
		h.app.setup.phase, h.app.setup.readyAt = setupReady, time.Now()
		h.has(h.app.L.T("setup.ready"), h.app.L.T("setup.ready.body", "Claude Code", "Ducter"))
		h.shot("onboard-ready-" + string(lang))
	}
}

func TestOnboardBackgroundNoteOnFirstStart(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		w := doctorWords[lang]
		L := func(k string, _ ...any) string { return w[k] }
		r := signedIn(freshReport(L))
		r.Checks[3] = check("nmem", "Nowledge Mem", "local", true, false, "")
		f := &fakeBackend{reports: []local.Report{r}, background: true, bgFirst: true}
		h := newSetup(t, lang, f)
		h.app.StartLocal()
		h.has(h.app.L.T("bg.note"))
		h.shot("onboard-background-note-" + string(lang))
	}
}

// 上网 on this Mac, the first time it's picked: the driver, then the two
// switches, each green by itself; then the window comes back and 上网
// snaps in.
func TestOnboardWebSetup(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		t.Run(string(lang), func(t *testing.T) {
			h := newHarness(t, lang)
			f := &fakeBackend{dir: t.TempDir()}
			d := &fakeDesktop{}
			h.app.Backend, h.app.Desktop = f, d
			h.app.Now = h.tt.Now
			h.pump = func() { h.tt.Advance(16 * time.Millisecond) }
			h.hub.SetDevices(func(list []protocol.DeviceView, _ *protocol.Reach) []protocol.DeviceView {
				for i := range list {
					if list[i].Home {
						for k := range list[i].Abilities {
							if list[i].Abilities[k].ID == protocol.AbilityWeb {
								list[i].Abilities[k] = protocol.DeviceAbility{ID: protocol.AbilityWeb, State: protocol.AbilityUnavailable, Reason: "cua_missing"}
							}
						}
					}
				}
				return list
			})
			T := h.app.L.T
			h.click(T("nav.devices.label"))
			h.until("devices", func() bool { return len(h.app.S.Devices) > 0 })
			h.settle(300 * time.Millisecond)
			h.click("+ " + T("chip.web"))
			h.settle(2 * time.Second)
			h.has(T("web.driver"), T("web.driver.body"), T("web.ax"), T("web.screen"))
			h.shotAs("onboard-web-driver-" + string(lang))

			h.click(T("web.driver.install") + " · " + T("ability.web"))
			j := f.jobs[jobCuaInstall]
			if j == nil || !strings.Contains(j.Cmd, "https://cua.ai/driver/install.sh") || !strings.Contains(j.Cmd, "--no-connect") {
				t.Fatalf("runs %q", f.runs)
			}
			j.Line("note: installing cua-driver via the Rust implementation.")
			h.settle(500 * time.Millisecond)
			h.has(T("fix.cancel"))
			h.shotAs("onboard-web-installing-" + string(lang))

			f.cua = local.CuaState{Bin: local.CuaAppBin, Version: "0.44.0", Checked: true}
			j.Finish(nil)
			h.settle(2 * time.Second)
			h.has(T("web.ax.body"), T("web.grant.open"), T("web.art.where", T("web.ax.pane")))
			h.shotAs("onboard-web-accessibility-" + string(lang))
			h.click(T("web.grant.open") + " · " + T("web.ax.pane"))
			g := f.jobs[jobCuaGrant]
			if g == nil || !strings.HasSuffix(g.Cmd, "permissions grant") {
				t.Fatalf("runs %q", f.runs)
			}
			h.settle(500 * time.Millisecond)
			h.has(T("web.grant.waiting"))

			f.cua.Accessibility = true // the person flipped the first switch
			h.settle(2 * time.Second)
			h.has(T("web.art.where", T("web.screen.pane")))
			h.shotAs("onboard-web-screen-" + string(lang))

			f.cua.ScreenRecording = true
			h.settle(2 * time.Second)
			if d.focused == 0 {
				t.Error("Ducter's window didn't come back to the front")
			}
			if g.Running() {
				t.Error("the guide was left waiting")
			}
			h.until("web on", func() bool {
				dv := h.app.S.Device("local")
				return dv.Ability(protocol.AbilityWeb).State == protocol.AbilityOn && h.app.dev.fx == nil
			})
			h.settle(300 * time.Millisecond)
			h.shotAs("onboard-web-ready-" + string(lang))
		})
	}
}

type fakeDesktop struct {
	focused int
	notes   []string
	err     error
}

func (d *fakeDesktop) Focus() { d.focused++ }
func (d *fakeDesktop) Notify(title, body string) error {
	d.notes = append(d.notes, title+" / "+body)
	return d.err
}

// After the first result, one ask at a time: notifications first, the
// phone on a later result; Later keeps it away; never at launch.
func TestOnboardAsksAfterResults(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		t.Run(string(lang), func(t *testing.T) {
			dir := hintsDir(t, hintsJSON)
			h := newWelcome(t, lang, dir, true)
			f := &fakeBackend{dir: dir}
			d := &fakeDesktop{err: ErrNotificationsDenied}
			h.app.Backend, h.app.Desktop = f, d
			T := h.app.L.T
			h.tt.Frame()
			if h.tt.HasText(T("notify.ask")) {
				t.Fatal("asked at launch")
			}
			finish(h, "t1", "修好 ducter 里没过的测试")
			if h.tt.HasText(T("notify.ask")) {
				t.Fatal("asked over the first-result line")
			}
			h.app.firstDone.at = time.Time{} // Got it
			h.tt.Frame()
			h.has(T("notify.ask"), T("notify.yes"), T("ask.later"))
			h.shot("onboard-ask-notify-" + string(lang))
			h.click(T("notify.yes"))
			h.tt.Frame()
			if len(d.notes) != 1 {
				t.Fatalf("notes %q", d.notes)
			}
			h.has(T("notify.denied"), T("notify.open"))
			h.shot("onboard-ask-notify-denied-" + string(lang))
			h.click(T("notify.open"))
			if len(f.settings) != 1 || f.settings[0] != local.NotificationsFor("co.nowledge.ducter") {
				t.Fatalf("settings %q", f.settings)
			}
			if h.tt.HasText(T("phone.ask")) {
				t.Fatal("the next ask came at once, without a new result")
			}
			finish(h, "t2", "说说这周改了什么")
			h.has(T("phone.ask"), T("phone.show"))
			h.shot("onboard-ask-phone-" + string(lang))
			h.click(T("phone.show"))
			h.app.Receive(protocol.ServerFrame{T: "pair_code", Code: "K7QM-4XPA", ExpiresAt: time.Now().Add(10 * time.Minute).UTC().Format(time.RFC3339)})
			h.has(T("phone.noaddress"), T("phone.noaddress.body"))
			h.shot("onboard-ask-phone-noaddress-" + string(lang))
			qr := make([]string, 25)
			for i := range qr {
				qr[i] = strings.Repeat(fmt.Sprint(i%2), 25)
			}
			h.app.Receive(protocol.ServerFrame{T: "pair_code", Code: "K7QM-4XPA", Address: "https://ducter.example.com", QR: qr, ExpiresAt: time.Now().Add(10 * time.Minute).UTC().Format(time.RFC3339)})
			h.has(T("phone.scan"), "K7QM-4XPA")
			h.shot("onboard-ask-phone-qr-" + string(lang))
			h.click(T("cli.ok"))
			if a := h.app.Local.Asked(askPhone); a.Answer != "yes" {
				t.Fatalf("phone answer %+v", a)
			}
			// Later: away for days, once more at most.
			if !h.app.Local.MayAsk("x", time.Now(), AskAgainAfter) {
				t.Fatal("never asked: may ask")
			}
			h.app.Local.Answer("x", "later", time.Now())
			if h.app.Local.MayAsk("x", time.Now().Add(time.Hour), AskAgainAfter) || !h.app.Local.MayAsk("x", time.Now().Add(AskAgainAfter+time.Hour), AskAgainAfter) {
				t.Fatal("later should wait, then ask once more")
			}
			h.app.Local.Answer("x", "later", time.Now())
			if h.app.Local.MayAsk("x", time.Now().Add(30*AskAgainAfter), AskAgainAfter) {
				t.Fatal("asked a third time")
			}
		})
	}
}

// D169: Ducter is whole without Nowledge Mem. The conversation never brings it up by itself; the
// one mention is in Settings › 记得什么.
func TestOnboardNoMemLineInTheEmptyConversation(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		dir := hintsDir(t, hintsJSON)
		h := newWelcome(t, lang, dir, true)
		h.app.Backend = &fakeBackend{dir: dir}
		h.app.setup.report = freshReport(func(k string, _ ...any) string { return doctorWords[lang][k] })
		h.tt.Frame()
		for _, s := range h.tt.Texts() {
			if strings.Contains(s, "Nowledge Mem") {
				t.Fatalf("the empty conversation mentions Mem: %q", s)
			}
		}
	}
}

func TestOnboardBackgroundTurnedOff(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		dir := hintsDir(t, hintsJSON)
		h := newWelcome(t, lang, dir, true)
		f := &fakeBackend{dir: dir, bgBlocked: true}
		h.app.Backend = f
		T := h.app.L.T
		h.tt.Frame()
		h.has(T("bg.off"), T("bg.off.body"), T("bg.open"))
		h.shot("onboard-background-off-" + string(lang))
		h.click(T("bg.open"))
		if len(f.settings) != 1 || f.settings[0] != local.SettingsLoginItems {
			t.Fatalf("settings %q", f.settings)
		}
		// Switched back on in System Settings: noticed by itself; with nothing
		// running, Ducter moves to the background.
		f.bgAllowed = true
		h.app.setup.bg.checkedAt = time.Time{}
		h.tt.Frame()
		h.tt.Frame()
		if f.stopped != 1 || f.started != 1 {
			t.Fatalf("stopped %d started %d", f.stopped, f.started)
		}
	}
}
