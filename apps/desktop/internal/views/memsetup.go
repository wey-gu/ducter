package views

// D664: one Nowledge Mem setup, the same group on Settings › 记忆 / Memory and › Agent 通信 / Agent
// messaging (never two copies). The steps to get Mem working on this home as a checklist, each with
// its live state from the facts core reads; the next step carries its one action and nothing after
// it pretends to be done. Done, it is one calm line with a way to reopen the steps. Live: looked at
// again when the pane opens, when the window comes back to the front, and after a 再看一次, with the
// shared spinner while it looks; no polling loop. The web's twin is apps/web/src/mem-setup-view.ts
// (the rules) and mem-setup.tsx (the group).

import (
	"strconv"
	"strings"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// memLookEvery is how often the setup is looked at again by itself (a pane opened, the window back);
// memLookWait is how long its spinner waits for the home's answer (the web's MEM_LOOK_MS, MEM_LOOK_WAIT_MS).
const (
	memLookEvery = 20 * time.Second
	memLookWait  = 15 * time.Second
)

// setupStepView is one step as the setup reads it: its id, how it stands (done, now, failed, busy,
// later), its title and line, its one action (install, copy, update, open_mem, sign_in, check_again,
// connect, none) with its label, the line to copy, the installer's words, why a sign-in failed,
// whether the sign-up link goes with it, and a refusal's fact behind 详情.
type setupStepView struct {
	ID, Look    string
	Title       memWord
	Line        *memWord
	Act, Label  string
	Cmd, Detail string
	Why, Fact   *memWord
	Also        *memWord // one more quiet line (a newer Mem out, D646)
	Account     bool
	// Checking: the next step while a look again is under way: its mark is the spinner; its words
	// and action stay.
	Checking bool
}

// memSetupView is the whole setup: its steps, whether all are done, the head's line and its tone.
type memSetupView struct {
	Steps []setupStepView
	Done  bool
	Head  memWord
	Tone  string // done, bad, muted
}

type memSetupOpts struct {
	Home, Partner, Why string
	Mailbox, Checking  bool
}

func mw(key string, args ...any) memWord { return memWord{Key: key, Args: args} }
func mwp(key string, args ...any) *memWord {
	w := mw(key, args...)
	return &w
}

var setupWhere = map[string]string{"cloud": "mem.app.kept.cloud", "local": "mem.app.kept.local", "server": "mem.app.kept.server"}

func memStepNmem(m *protocol.MemView, b *protocol.BridgeView, home, why string) setupStepView {
	s := setupStepView{ID: "nmem", Act: "none"}
	if b == nil {
		if m != nil && m.State == "connected" {
			s.Look, s.Title, s.Line = "done", mw("mem.step.done"), mwp("memsetup.nmem.on", home)
			return s
		}
		s.Look, s.Title, s.Line, s.Act, s.Label = "now", mw("mem.step.install"), mwp("memsetup.nmem.unseen", home), "check_again", "mem.health.again"
		return s
	}
	switch b.State {
	case "install_mem":
		s.Title = mw("mem.step.install")
		if b.Detail != "" {
			s.Look, s.Line, s.Detail = "failed", mwp("bridge.mem.install.failed"), b.Detail
			switch {
			case b.CanRun:
				s.Act, s.Label = "install", "bridge.retry"
			case b.Cmd != "":
				s.Act, s.Cmd = "copy", b.Cmd
			default:
				s.Act, s.Label = "check_again", "mem.health.again"
			}
			return s
		}
		s.Look = "now"
		switch {
		case b.CanRun:
			s.Line, s.Act, s.Label = mwp("bridge.mem.install", home), "install", "bridge.mem.install.go"
		case b.Cmd != "":
			s.Line, s.Act, s.Cmd = mwp("memsetup.nmem.run", home), "copy", b.Cmd
		default:
			s.Line, s.Act, s.Label = mwp("memsetup.nmem.how", home), "check_again", "mem.health.again"
		}
		return s
	case "installing":
		s.Look, s.Title, s.Line = "busy", mw("mem.step.install"), mwp("bridge.mem.installing", home)
		return s
	case "update_mem":
		s.Look, s.Title, s.Detail = "failed", mw("mem.update.needed"), b.Detail
		switch {
		case b.CanRun:
			s.Line = mwp("bridge.mem.update", home, b.Version, memMin)
		case b.Need == "app" || b.Version == "":
			s.Line = mwp("bridge.update", home)
		default:
			s.Line = mwp("bridge.mem.update.other", home, b.Version, memMin)
		}
		if b.CanRun {
			s.Act, s.Label = "update", "mem.health.old.go"
			if b.Detail != "" {
				s.Label = "bridge.retry"
			}
		} else {
			s.Act, s.Label = "check_again", "mem.health.again"
		}
		return s
	case "updating":
		s.Look, s.Title, s.Line = "busy", mw("mem.step.done"), mwp("bridge.mem.updating", home)
		if b.Upkeep != nil && b.Upkeep.Kind == "move" {
			s.Line = mwp("bridge.mem.moving", home)
		}
		return s
	case "mem_closed":
		s.Look, s.Title = "failed", mw("bridge.mem.closed")
		if b.CanOpen {
			s.Line, s.Act, s.Label = mwp("bridge.mem.closed.open", home), "open_mem", "bridge.mem.open"
		} else {
			s.Line, s.Act, s.Label = mwp("bridge.mem.closed.there", home), "check_again", "mem.health.again"
		}
		return s
	}
	if v := memStateOf(m, b, home, why); v != nil && (v.State == "old" || v.State == "old_elsewhere") {
		s.Look, s.Title, s.Line = "failed", v.Title, &v.Line
		if v.Action == "update" {
			s.Act, s.Label = "update", v.Act
		} else {
			s.Act, s.Label = "check_again", "mem.health.again"
		}
		return s
	}
	s.Look, s.Title = "done", mw("mem.step.done")
	if b.Version != "" {
		s.Line = mwp("memsetup.nmem.version", home, b.Version)
	} else {
		s.Line = mwp("memsetup.nmem.on", home)
	}
	return s
}

func memStepSignin(m *protocol.MemView, b *protocol.BridgeView, home, why string) setupStepView {
	s := setupStepView{ID: "signin", Act: "none"}
	if b == nil {
		if m != nil && m.State == "connected" {
			s.Look, s.Title = "done", mw("memsetup.signin.done")
		} else {
			s.Look, s.Title = "later", mw("mem.step.signin")
		}
		return s
	}
	switch b.State {
	case "sign_in":
		s.Title, s.Line, s.Act, s.Label = mw("mem.step.signin"), mwp("bridge.mem.signin", home), "sign_in", "bridge.mem.signin.go"
		switch b.SignIn {
		case "used":
			s.Why = mwp("bridge.mem.signin.used")
		case "bad":
			s.Why = mwp("bridge.mem.signin.bad")
		case "failed":
			s.Why = mwp("bridge.mem.signin.failed", b.Detail)
		}
		if s.Why != nil {
			s.Look = "failed"
		} else {
			s.Look, s.Account = "now", true
		}
		return s
	case "signing_in":
		s.Look, s.Title, s.Line = "busy", mw("mem.step.signin"), mwp("bridge.mem.signin.busy")
		return s
	}
	if v := memStateOf(m, b, home, why); v != nil {
		switch v.State {
		case "signed_out":
			// D375: a lapsed sign-in says where the new link comes from, under its line.
			s.Look, s.Title, s.Line, s.Act, s.Label, s.Also = "failed", v.Title, &v.Line, "sign_in", v.Act, mwp("mem.health.resign.how")
			return s
		case "unreachable":
			s.Look, s.Title, s.Line, s.Act, s.Label = "failed", mw(v.Title.Key, home), &v.Line, "check_again", v.Act
			return s
		}
	}
	s.Look, s.Title = "done", mw("memsetup.signin.done")
	where := setupWhere[b.Where]
	if where == "" && b.State == "local_mem" {
		where = setupWhere["local"]
	}
	switch where {
	case "":
	case setupWhere["local"]:
		s.Line = mwp(where, home)
	default:
		s.Line = mwp(where)
	}
	return s
}

// memStepSpace is a place in Mem only the person can see. It is a step Bridge needs (D269): on
// Agent messaging it can fail, with the table's one action; on Memory it shows only as a fact once
// Mem names the place (memory itself writes without it). ok false: no step.
func memStepSpace(m *protocol.MemView, b *protocol.BridgeView, mailbox bool) (setupStepView, bool) {
	s := setupStepView{ID: "space", Act: "none"}
	switch {
	case b == nil && !mailbox:
		return s, false
	case b == nil && m != nil && m.State == "connected":
		s.Look, s.Title = "done", mw("memsetup.space.done")
	case b == nil:
		s.Look, s.Title = "later", mw("memsetup.space")
	case b.Space != nil && b.Space.Label != "":
		s.Look, s.Title, s.Line = "done", mw("memsetup.space.done"), mwp("memsetup.space.line", b.Space.Label)
	case !mailbox:
		return s, false
	case b.State == "local_mem":
		s.Look, s.Title, s.Line, s.Act, s.Label = "failed", mw("bridge.mem.local.title"), mwp("bridge.mem.local", b.Home), "connect", "bridge.retry"
	case b.State == "no_space":
		s.Look, s.Title, s.Line, s.Act, s.Label = "failed", mw("bridge.no_space.title"), mwp("bridge.no_space"), "check_again", "mem.health.again"
	case pastSpace[b.State]:
		// Core only reaches these states once Mem named the place (bridge-link.ts: no place is no_space).
		s.Look, s.Title = "done", mw("memsetup.space.done")
	default:
		s.Look, s.Title, s.Line, s.Act, s.Label = "now", mw("memsetup.space"), mwp("memsetup.space.wait"), "check_again", "mem.health.again"
	}
	return s, true
}

func memStepName(m *protocol.MemView, partner string) setupStepView {
	if m != nil && m.KeptUnder != "" {
		return setupStepView{ID: "name", Look: "done", Title: mw("memsetup.name.done", m.KeptUnder), Line: mwp("memsetup.name.line"), Act: "none"}
	}
	return setupStepView{ID: "name", Look: "now", Title: mw("memsetup.name"), Line: mwp("memsetup.name.wait", partner), Act: "check_again", Label: "mem.health.again"}
}

func memStepMailbox(m *protocol.MemView, b *protocol.BridgeView, home, why, partner string) setupStepView {
	s := setupStepView{ID: "mailbox", Act: "none", Title: mw("memsetup.mailbox")}
	state := ""
	if b != nil {
		state = b.State
	}
	switch state {
	case "connected", "disconnecting", "elsewhere":
		s.Look, s.Title = "done", mw("memsetup.mailbox.done")
	case "connecting":
		s.Look, s.Line = "busy", mwp("peers.joining", partner)
	case "ready":
		if b.Asks {
			s.Look, s.Line, s.Act, s.Label = "now", mwp("memsetup.mailbox.asks"), "connect", "memsetup.mailbox.go"
		} else {
			s.Look, s.Line = "busy", mwp("peers.joining", partner)
		}
	case "refused", "failed", "unconfirmed":
		v := memStateOf(m, b, home, why)
		s.Look, s.Title, s.Line, s.Fact = "failed", v.Title, &v.Line, v.Fact
		if b.Newer != nil {
			s.Also = mwp("peers.mem.newer") // D646: one quiet line, never a second button
		}
		if v.Action != "none" {
			s.Act, s.Label = "connect", v.Act
		}
	default:
		s.Look, s.Line = "now", mwp("memsetup.mailbox.wait")
	}
	return s
}

var pastSpace = map[string]bool{"ready": true, "connecting": true, "connected": true, "disconnecting": true, "elsewhere": true, "refused": true, "failed": true, "unconfirmed": true}

var setupLater = map[string]string{"nmem": "mem.step.install", "signin": "mem.step.signin", "space": "memsetup.space", "name": "memsetup.name", "mailbox": "memsetup.mailbox"}

// memSetupOf is the setup from the settings frame alone (the web's memSetup). The first step not
// done is the next one: it carries its one action; every step after it is later and claims nothing.
// A look again under way turns the next step's mark into the spinner. All done: one calm line.
func memSetupOf(m *protocol.MemView, b *protocol.BridgeView, o memSetupOpts) memSetupView {
	// The name comes last: Ducter takes it by itself and nothing waits on it (D141).
	raw := []setupStepView{memStepNmem(m, b, o.Home, o.Why), memStepSignin(m, b, o.Home, o.Why)}
	if s, ok := memStepSpace(m, b, o.Mailbox); ok {
		raw = append(raw, s)
	}
	if o.Mailbox {
		raw = append(raw, memStepMailbox(m, b, o.Home, o.Why, o.Partner))
	}
	raw = append(raw, memStepName(m, o.Partner))
	v := memSetupView{}
	next := -1
	for _, s := range raw {
		if next >= 0 {
			later := setupStepView{ID: s.ID, Look: "later", Title: mw(setupLater[s.ID]), Act: "none"}
			if s.ID == "signin" {
				// D554: the sign-in says, even before its turn, that it needs a Nowledge Mem account.
				later.Line, later.Account = mwp("mem.step.account", o.Home), true
			}
			v.Steps = append(v.Steps, later)
			continue
		}
		if s.Look == "done" {
			v.Steps = append(v.Steps, s)
			continue
		}
		next = len(v.Steps)
		if o.Checking && s.Look != "busy" {
			s.Checking = true
		}
		v.Steps = append(v.Steps, s)
	}
	v.Done = next < 0
	switch {
	case v.Done:
		v.Head, v.Tone = mw("memsetup.done", o.Home), "done"
	case raw[next].Look == "failed":
		v.Head, v.Tone = mw("memsetup.head.failed"), "bad"
	case len(v.Steps)-next == 1:
		v.Head, v.Tone = mw("memsetup.head.one"), "muted"
	default:
		v.Head, v.Tone = mw("memsetup.head.left", strconv.Itoa(len(v.Steps)-next)), "muted"
	}
	return v
}

// memSetupNow is the setup as the panes read it now.
func (a *App) memSetupNow(mailbox bool) memSetupView {
	why := ""
	if b := a.S.Bridge; b != nil {
		why = a.failedWhy(b.Detail)
	}
	name := ""
	if a.S.Settings != nil {
		name = a.S.Settings.Name
	}
	return memSetupOf(a.S.Mem, a.S.Bridge, memSetupOpts{Home: a.memHome(), Partner: name, Why: why, Mailbox: mailbox, Checking: a.memChecking})
}

// lookAtMemSetup asks the home to look at Nowledge Mem's setup again (read-only): when Memory or
// Agent messaging opens, when the window comes back to the front, and on 再看一次 (tap). At most
// once in memLookEvery unless tapped; the settings frame that answers ends the spinner.
func (a *App) lookAtMemSetup(tap bool) {
	now := a.Now()
	if !tap && !a.memLookedAt.IsZero() && now.Sub(a.memLookedAt) < memLookEvery {
		return
	}
	a.memLookedAt, a.memChecking, a.memLookFrom = now, true, a.S.SettingsN
	a.send(protocol.MemHealthReq{T: "mem_health", Setup: true})
}

// memSetup is the Nowledge Mem group with its setup (the web's MemSetup). Its head is Nowledge Mem's
// own (its mark, faded until done), its line the setup's; the steps under it until all are done,
// then folded behind 每一步 / Steps. intro: rows before the steps; after: rows after them, told
// whether the steps show; foot: the group's last line.
func (a *App) memSetup(c *ui.Context, key string, mailbox bool, intro func(), after func(stepsShown bool), foot func()) {
	// Live: the window coming back to the front looks again; the home's answer ends the spinner.
	active := c.WindowActive()
	if active && !a.memSetupActive {
		a.lookAtMemSetup(false)
	}
	a.memSetupActive = active
	if a.memChecking {
		if a.S.SettingsN != a.memLookFrom || a.Now().Sub(a.memLookedAt) >= memLookWait {
			a.memChecking = false
		} else {
			c.After(memLookWait - a.Now().Sub(a.memLookedAt))
		}
	}
	v := a.memSetupNow(mailbox)
	shown := !v.Done || a.memSetupOpen
	tone := sideMuted
	switch v.Tone {
	case "done":
		tone = sideDone
	case "bad":
		tone = sideFailed
	}
	a.group(c, key, "", "", func() {
		var ctl func()
		if v.Done {
			ctl = func() {
				chev := 1
				if a.memSetupOpen {
					chev = 2
				}
				if a.quietButton(c, key+"-steps", a.L.T("memsetup.steps"), "Nowledge Mem", false, chev) {
					a.memSetupOpen = !a.memSetupOpen
				}
			}
		}
		a.headRow(c, key, a.memTile(c, !v.Done), "Nowledge Mem", a.memWord(v.Head), tone, ctl)
		if intro != nil {
			intro()
		}
		if shown {
			a.memSetupSteps(c, key, v)
		}
		if after != nil {
			after(shown)
		}
		if foot != nil {
			foot()
		}
	})
}

// memSetupSteps is the checklist: one setupStep per step, the next one's action under its words.
func (a *App) memSetupSteps(c *ui.Context, key string, v memSetupView) {
	a.chatBody(c, key+"-steps", func() {
		for i, s := range v.Steps {
			s := s
			line := ""
			if s.Line != nil {
				line = a.memWord(*s.Line)
			}
			look, state := s.Look, a.L.T("memsetup.look."+s.Look)
			if s.Checking {
				look, state = "busy", a.L.T("memsetup.checking")
			}
			a.setupStep(c, i+1, look, a.memWord(s.Title), line, state, func() {
				tried := a.memTriedStep == s.ID+":"+s.Look+":"+lineKey(s) && s.ID == "nmem" && s.Look != "busy"
				if tried {
					a.note(c, a.L.T("mem.retry.same")) // D404: the same missing tool says so
				}
				if s.Also != nil {
					a.note(c, a.memWord(*s.Also))
				}
				if s.Look != "later" && s.Look != "busy" && s.Look != "done" {
					a.memSetupAct(c, s)
				} else if s.Look == "later" && s.Account {
					if a.quietLink(c, "mem-account", a.L.T("mem.step.account.go"), a.L.T("mem.step.account.go")) {
						a.openLink(memSite)
					}
				}
				if s.Detail != "" {
					a.note(c, a.L.T("bridge.mem.detail", s.Detail)) // the Mac has no 细节 fold: the installer's words, quiet
				}
				if s.Fact != nil {
					if a.quietButton(c, key+"-fact", a.L.T("mem.details"), "Nowledge Mem", false, map[bool]int{false: 1, true: 2}[a.peersFact]) {
						a.peersFact = !a.peersFact
					}
					if a.peersFact {
						a.note(c, a.memWord(*s.Fact))
					}
				}
			})
		}
	})
}

func lineKey(s setupStepView) string {
	if s.Line == nil {
		return ""
	}
	return s.Line.Key
}

// memSetupAct is the next step's one action.
func (a *App) memSetupAct(c *ui.Context, s setupStepView) {
	t := a.T
	b := a.S.Bridge
	home := a.memHome()
	label := ""
	if s.Label != "" {
		label = a.L.T(s.Label)
	}
	row := func(f func()) { ui.Row(c).Gap(t.S2).AlignItems(ui.Center).Children(f) }
	switch s.Act {
	case "install", "update":
		row(func() {
			if a.buttonFor(c, label, home, btnPrimary, t.ControlSM, t.Surface) && b != nil {
				if b.State == "install_mem" {
					b.State = "installing"
				} else {
					b.State = "updating"
				}
				a.send(protocol.BridgeAction{T: "bridge_mem_install"})
			}
		})
	case "copy":
		a.lendCopy(c, "mem-cmd", s.Cmd, "line")
	case "open_mem":
		row(func() {
			if a.buttonFor(c, label, home, btnPrimary, t.ControlSM, t.Surface) {
				a.send(protocol.BridgeAction{T: "bridge_mem_open"})
			}
		})
	case "connect":
		row(func() {
			if a.buttonFor(c, label, a.personaName(), btnPrimary, t.ControlSM, t.Surface) && b != nil {
				b.State = "connecting"
				a.send(protocol.BridgeAction{T: "bridge_connect"})
			}
		})
	case "check_again":
		row(func() {
			if a.buttonFor(c, label, "Nowledge Mem", btnSecondary, t.ControlSM, t.Surface) {
				a.memTriedStep = s.ID + ":" + s.Look + ":" + lineKey(s)
				a.lookAtMemSetup(true)
			}
		})
	case "sign_in":
		if s.Why != nil {
			uiText(c, keepClauses(a.memWord(*s.Why))).FontSize(t.SM).LineHeight(a.leading(1.5)).TextColor(t.Failed.Ink)
		}
		ui.Row(c).Gap(t.S2).AlignItems(ui.End).Children(func() {
			ui.Column(c).Grow(1).MinWidth(0).Children(func() {
				a.field(c, "bridge-link", a.L.T("bridge.mem.signin.link"), &a.bridgeLink, a.L.T("bridge.mem.signin.ph"), "")
			})
			if a.buttonFor(c, label, home, btnPrimary, t.ControlMD, t.Surface) && strings.TrimSpace(a.bridgeLink) != "" && b != nil {
				b.State = "signing_in"
				a.send(protocol.BridgeMemSignIn{T: "bridge_mem_sign_in", Link: strings.TrimSpace(a.bridgeLink)})
				a.bridgeLink = ""
			}
		})
		if s.Account {
			// D554: a fresh user learns here that this needs a Nowledge Mem account.
			a.note(c, a.L.T("mem.step.account", home))
			if a.quietLink(c, "mem-account", a.L.T("mem.step.account.go"), a.L.T("mem.step.account.go")) {
				a.openLink(memSite)
			}
		}
	}
}
