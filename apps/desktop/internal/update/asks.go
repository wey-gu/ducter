package update

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Asks is the app's side of an update asked from elsewhere (D187): the
// phone's 更新 on this Mac's card reaches the Ducter on this Mac (the home,
// or the worker it runs for a home elsewhere), which shares the app's data
// folder. That Ducter writes <dataDir>/updates/app-ask.json ("get v", then
// "restart"); the app answers in app.json with its updater's state, rewritten
// on every change and every 15 s while it runs, so "the app is closed" is
// simply an app.json that has gone quiet. packages/core/src/app-update.ts
// is the other side.
type Asks struct {
	Dir string // <dataDir>/updates
	U   *Updater
	// Restart restarts into the ready update without asking anything of
	// the person at the Mac (lifecycle.go's Restart to update).
	Restart func()
	// RestartHelper restarts this Mac's Ducter (worker, else home) on the
	// helper this app already carries: the app is on v, its Ducter isn't.
	RestartHelper func() error
	Logf          func(format string, args ...any)
	Now           func() time.Time

	wmu   sync.Mutex // one writer of app.json at a time (the updater's changes, the beat)
	mu    sync.Mutex
	taken string // the ask whose answer app.json carries
	seen  string // the last ask read (taken or under way)
}

// AppSide is app.json.
type AppSide struct {
	Pid        int     `json:"pid"`
	Current    string  `json:"current"`
	State      string  `json:"state"`
	Version    string  `json:"version,omitempty"`
	Progress   float64 `json:"progress,omitempty"`
	Reason     string  `json:"reason,omitempty"`
	Detail     string  `json:"detail,omitempty"`
	CanRestart bool    `json:"canRestart"`
	Asked      string  `json:"asked,omitempty"`
	At         string  `json:"at"`
}

// Ask is app-ask.json.
type Ask struct {
	ID   string `json:"id"`
	To   string `json:"to"`
	Step string `json:"step"` // "get" | "restart"
	At   string `json:"at"`
}

// askEvery is how often the ask is looked for; beatEvery how often app.json
// is rewritten when nothing changes (the other side calls it closed after 45 s).
const (
	askEvery  = 2 * time.Second
	beatEvery = 15 * time.Second
)

func (a *Asks) now() time.Time {
	if a.Now != nil {
		return a.Now()
	}
	return time.Now()
}

func (a *Asks) logf(f string, args ...any) {
	if a.Logf != nil {
		a.Logf(f, args...)
	}
}

// Run writes app.json and answers asks until ctx ends; app.json is removed
// then, so a quit app reads as closed at once.
func (a *Asks) Run(ctx context.Context) {
	_ = os.MkdirAll(a.Dir, 0o755)
	tick := time.NewTicker(askEvery)
	defer tick.Stop()
	last := time.Time{}
	for {
		a.Step(ctx)
		if a.now().Sub(last) >= beatEvery {
			a.Beat()
			last = a.now()
		}
		select {
		case <-ctx.Done():
			os.Remove(filepath.Join(a.Dir, "app.json"))
			return
		case <-tick.C:
		}
	}
}

// Gone removes app.json as the app quits.
func (a *Asks) Gone() { os.Remove(filepath.Join(a.Dir, "app.json")) }

// Beat writes app.json from the updater's state now (also called on every
// change of it).
func (a *Asks) Beat() {
	st := a.U.Status()
	a.mu.Lock()
	taken := a.taken
	a.mu.Unlock()
	s := AppSide{Pid: os.Getpid(), Current: st.Current, State: string(st.State), Version: st.Version, Progress: st.Progress, Reason: string(st.Reason), Detail: st.Detail, CanRestart: a.U.Unattended(), Asked: taken, At: a.now().UTC().Format(time.RFC3339Nano)}
	if a.U.begunNow() {
		s.State = "restarting"
	}
	b, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return
	}
	p := filepath.Join(a.Dir, "app.json")
	a.wmu.Lock()
	defer a.wmu.Unlock()
	if os.WriteFile(p+".tmp", b, 0o644) == nil {
		_ = os.Rename(p+".tmp", p)
	}
}

// Step reads app-ask.json once and starts what it asks, once per ask.
func (a *Asks) Step(ctx context.Context) {
	p := filepath.Join(a.Dir, "app-ask.json")
	b, err := os.ReadFile(p)
	if err != nil {
		return
	}
	var k Ask
	if json.Unmarshal(b, &k) != nil || k.ID == "" {
		return
	}
	a.mu.Lock()
	if k.ID+k.Step == a.seen {
		a.mu.Unlock()
		return
	}
	a.seen = k.ID + k.Step
	a.mu.Unlock()
	switch k.Step {
	case "get":
		a.logf("ducter: update %s asked from elsewhere", k.To)
		go func() {
			a.U.Get(ctx, k.To)
			a.mu.Lock()
			a.taken = k.ID
			a.mu.Unlock()
			a.Beat()
		}()
	case "restart":
		// Taken once: the app that opens after the swap must not restart again.
		os.Remove(p)
		a.mu.Lock()
		a.taken = k.ID
		a.mu.Unlock()
		st := a.U.Status()
		switch {
		case Compare(k.To, st.Current) <= 0:
			if a.RestartHelper != nil {
				if err := a.RestartHelper(); err != nil {
					a.logf("ducter: restarting this Mac's Ducter: %v", err)
				}
			}
		case st.State == Ready && a.Restart != nil:
			a.logf("ducter: restarting into %s, asked from elsewhere", st.Version)
			a.Restart()
		default:
			a.logf("ducter: a restart into %s was asked, but nothing is ready (%s)", k.To, st.State)
		}
		a.Beat()
	}
}

func (u *Updater) begunNow() bool {
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.begun
}
