package views

import (
	"context"
	"errors"
	"strings"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/local"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D155: one computer, one card. A computer can reach a home three ways: as
// a worker (it does tasks), through the Ducter app, and through the command
// line. Each is its own device there (revoked on its own), but people see
// one computer: the command line, and the app window on a computer that
// does tasks, fold into that computer's card as one quiet line each, with
// their own 断开 in that line's menu. A command line alone stands as a
// computer named after its host, never as "CLI on …".

// MacWorker is "Let this Mac do tasks for <home>" (main wires it to
// local.MacWorker with the app's own connection).
type MacWorker interface {
	// On: this Mac does tasks for the Ducter this window talks to, and its
	// worker's device id there.
	On() (bool, string)
	// Start pairs this Mac as a worker (a code over the app's socket) and
	// starts `ducter worker` under a LaunchAgent. It may take seconds.
	Start(ctx context.Context) error
	// Stop removes the LaunchAgent and the saved worker; the device id is
	// for the view to revoke.
	Stop() (string, error)
	// Log is where the worker writes.
	Log() string
}

type workState struct {
	busy    string // "on" | "off" while it works
	failed  string // why turning it on didn't work
	checked bool   // On was asked since the window opened (a cheap file read)
	on      bool
	device  string
}

// isCLI: a client that is the command line on a computer (D155; a CLI
// paired before then says so only by its name).
func isCLI(cl *protocol.ReachClient) bool {
	return cl.Form == "cli" || (cl.Form == "" && strings.HasPrefix(cl.Name, "CLI on "))
}

// clientComputer is the computer a client runs on: what it said, else (a
// CLI from before D155) its name's host, else its own name for an app
// window on a computer; a phone has none.
func clientComputer(cl *protocol.ReachClient) string {
	if cl.Computer != "" {
		return cl.Computer
	}
	if isCLI(cl) {
		return strings.TrimSpace(strings.TrimPrefix(cl.Name, "CLI on "))
	}
	p := strings.ToLower(cl.Platform)
	if strings.HasPrefix(p, "darwin") || strings.HasPrefix(p, "linux") || strings.HasPrefix(p, "win") {
		return cl.Name
	}
	return ""
}

func deviceComputer(dv *protocol.DeviceView) string {
	if dv.Computer != "" {
		return dv.Computer
	}
	return dv.Name
}

// folding is who stands for whom: hidden clients get no island or card of
// their own; members are the quiet lines in a card, by its key ("dev:id"
// or "cl:id").
type folding struct {
	hidden  map[string]bool
	members map[string][]*protocol.ReachClient
}

func (a *App) fold() folding {
	f := folding{hidden: map[string]bool{}, members: map[string][]*protocol.ReachClient{}}
	if a.S.Reach == nil {
		return f
	}
	key := func(s string) string { return strings.ToLower(strings.TrimSpace(s)) }
	workers := map[string]string{}
	for i := range a.S.Devices {
		dv := &a.S.Devices[i]
		if !dv.Home {
			if k := key(deviceComputer(dv)); k != "" {
				workers[k] = "dev:" + dv.ID
			}
		}
	}
	apps := map[string]string{}
	for i := range a.S.Reach.Clients {
		cl := &a.S.Reach.Clients[i]
		if k := key(clientComputer(cl)); k != "" && !isCLI(cl) {
			if _, ok := apps[k]; !ok {
				apps[k] = "cl:" + cl.ID
			}
		}
	}
	for i := range a.S.Reach.Clients {
		cl := &a.S.Reach.Clients[i]
		k := key(clientComputer(cl))
		if k == "" {
			continue
		}
		owner := workers[k]
		if owner == "" && isCLI(cl) {
			owner = apps[k]
		}
		if owner == "" {
			continue
		}
		f.hidden[cl.ID] = true
		f.members[owner] = append(f.members[owner], cl)
	}
	return f
}

// lastReach names the newest phone or window that reaches Ducter (a
// command line only when there's nothing else).
func (a *App) lastReach() string {
	cls := a.S.Reach.Clients
	for i := len(cls) - 1; i >= 0; i-- {
		if !isCLI(&cls[i]) {
			return a.clientName(&cls[i])
		}
	}
	return a.clientName(&cls[len(cls)-1])
}

// clientName is a client's name for people: a command line standing alone
// is its computer.
func (a *App) clientName(cl *protocol.ReachClient) string {
	if isCLI(cl) && strings.HasPrefix(cl.Name, "CLI on ") {
		if c := clientComputer(cl); c != "" {
			return c
		}
	}
	return cl.Name
}

// clientKind says what a phone or a window is, in plain words.
func (a *App) clientKind(cl *protocol.ReachClient) string {
	p := strings.ToLower(cl.Platform)
	switch {
	case isCLI(cl):
		return a.L.T("device.kind.cli")
	case strings.Contains(p, "ios") || strings.Contains(p, "iphone"):
		// An iPad pairs as "iPad · Ducter" or "iPad · Safari" (the phone client's deviceName).
		kind := "iphone"
		if strings.HasPrefix(cl.Name, "iPad") {
			kind = "ipad"
		}
		if strings.Contains(p, "safari") || strings.Contains(p, "web") {
			return a.L.T("device.kind." + kind + ".safari")
		}
		return a.L.T("device.kind." + kind + ".app")
	case strings.Contains(p, "android"):
		return a.L.T("device.kind.android")
	case strings.HasPrefix(p, "darwin") || strings.Contains(p, "mac"):
		return a.L.T("device.kind.mac.app")
	case p != "":
		return a.L.T("device.kind.browser")
	}
	return a.L.T("device.kind.other")
}

// clientDoes is what a phone or a window does for the person.
func (a *App) clientDoes(cl *protocol.ReachClient) string {
	who := a.S.PersonaName
	p := strings.ToLower(cl.Platform)
	switch {
	case isCLI(cl):
		return a.L.T("device.does.cli")
	case strings.Contains(p, "ios") || strings.Contains(p, "iphone") || strings.Contains(p, "android"):
		return a.L.T("device.does.phone", who)
	case strings.HasPrefix(p, "darwin") || strings.Contains(p, "mac"):
		return a.L.T("device.does.app", who)
	}
	return a.L.T("device.does.browser", who)
}

// clientState is a client's state line and its ink.
func (a *App) clientState(cl *protocol.ReachClient) (string, ui.Color) {
	t := a.T
	if cl.Connected {
		return a.L.T("device.client.now"), t.Awake.Ink
	}
	if ago := a.agoLong(cl.LastSeen); ago != "" {
		return a.L.T("device.last_seen", ago), t.InkMuted
	}
	return a.L.T("device.client.never"), t.InkMuted
}

// ---------- Let this Mac do tasks (D155) ----------

// workHome is the home's name for the words ("hel").
func (a *App) workHome() string {
	if h := a.homeDevice(); h != nil {
		return h.Name
	}
	return hostOf(a.URL)
}

// canWork: this window runs in Ducter.app on a Mac and talks to a Ducter
// on another computer, so this Mac can do tasks for it.
func (a *App) canWork() bool {
	return a.MacWorker != nil && !a.onThisMac()
}

func (a *App) workOn() (bool, string) {
	w := &a.work
	if !w.checked {
		w.on, w.device = a.MacWorker.On()
		w.checked = true
	}
	return w.on, w.device
}

// isThisMac: the card's computer is the Mac this app runs on.
func (a *App) isThisMac(computer string) bool {
	return a.ThisComputer != "" && strings.EqualFold(strings.TrimSpace(computer), a.ThisComputer)
}

// setWork turns "this Mac does tasks" on or off. Off revokes the worker
// there too (the same 断开 as its card's).
func (a *App) setWork(on bool) {
	w := &a.work
	if w.busy != "" {
		return
	}
	run := func(job func() error, done func(error)) {
		if a.Win == nil { // tests: inline
			done(job())
			return
		}
		go func() {
			err := job()
			a.Win.Update(func() { done(err) })
		}()
	}
	w.failed = ""
	if on {
		w.busy = "on"
		run(func() error { return a.MacWorker.Start(context.Background()) }, func(err error) {
			w.busy, w.checked = "", false
			if err != nil {
				w.failed = a.workError(err)
			}
			a.send(protocol.DevicesReq{T: "devices", Refresh: true})
		})
		return
	}
	w.busy = "off"
	var id string
	run(func() error {
		var err error
		id, err = a.MacWorker.Stop()
		return err
	}, func(err error) {
		w.busy, w.checked = "", false
		if id != "" {
			a.send(protocol.DisconnectDeviceReq{T: "disconnect_device", Device: id})
		}
		if err != nil {
			w.failed = err.Error()
		}
	})
}

func (a *App) workError(err error) string {
	if errors.Is(err, local.ErrNoToken) {
		return a.L.T("work.mac.err.notoken")
	}
	return a.L.T("work.mac.err", a.connectError(err, a.URL))
}

// workBlock is the switch on this Mac's card and in Settings › Where it
// runs: what it means in plain words, then its state.
func (a *App) workBlock(c *ui.Context, key string) {
	t := a.T
	w := &a.work
	on, _ := a.workOn()
	home := a.workHome()
	note := a.L.T("work.mac.note.off", home)
	if on {
		// D157: from now on every task says which computer it runs on.
		note = a.L.T("work.mac.note.on", a.MacWorker.Log()) + " " + a.L.T("where.first_line")
	}
	switch w.busy {
	case "on":
		note, on = a.L.T("work.mac.starting"), true
	case "off":
		note, on = a.L.T("work.mac.stopping"), false
	}
	if key == "settings" { // a Settings row, as the others there
		if v, ch := a.toggleRow(c, "work-"+key, a.L.T("work.mac.title", home), note, on); ch && w.busy == "" {
			a.setWork(v)
		}
		if w.failed != "" {
			a.rowBlock(c, "work-failed", func() { a.reasonLine(c, w.failed) })
		}
		return
	}
	ui.Column(c.Key("work:"+key)).Gap(t.S2).Margin(t.S2, 0, 0, 0).Children(func() {
		if v, ch := a.switchRow(c, "work-"+key, a.L.T("work.mac.title", home), note, on); ch && w.busy == "" {
			a.setWork(v)
		}
		if w.failed != "" {
			a.reasonLine(c, w.failed)
		}
	})
}
