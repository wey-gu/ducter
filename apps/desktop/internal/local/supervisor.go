package local

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// Check is one row of `ducter doctor --json` (packages/cli/src/doctor.ts).
// Label and Detail are already in the person's language.
type Check struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Status   string `json:"status"` // ok | missing | warn
	Required bool   `json:"required"`
	Detail   string `json:"detail"`
	Fix      string `json:"fix,omitempty"` // a shell command, or a URL
	Quiet    bool   `json:"quiet,omitempty"`
}

// Report is the whole check.
type Report struct {
	Checks       []Check `json:"checks"`
	OK           bool    `json:"ok"`
	HarnessReady bool    `json:"harnessReady"`
}

// Blocking are the required checks that failed: what stops Ducter.
func (r Report) Blocking() []Check {
	var out []Check
	for _, k := range r.Checks {
		if k.Required && k.Status != "ok" {
			out = append(out, k)
		}
	}
	return out
}

// Later are the optional things missing, for one quiet line.
func (r Report) Later() []Check {
	var out []Check
	for _, k := range r.Checks {
		if !k.Required && k.Status != "ok" && k.ID != "port" && !k.Quiet {
			out = append(out, k)
		}
	}
	return out
}

// Has reports whether the check id passed.
func (r Report) Has(id string) bool {
	for _, k := range r.Checks {
		if k.ID == id {
			return k.Status == "ok"
		}
	}
	return false
}

// Supervisor runs the Ducter of this Mac for the app.
type Supervisor struct {
	CLI     string // the ducter binary
	DataDir string
	Port    int
	// Locale is the app's language, passed to the CLI (DUCTER_LOCALE)
	// so doctor's words match the window's.
	Locale string
	// Agent, when set, runs Ducter as a LaunchAgent that outlives the app
	// (the keep-running decision). Without it (the app still on its disk image, or a translocated
	// copy) Ducter is the app's child and stops with it.
	Agent *Agent

	// bgBlocked: macOS doesn't let the agent run (Login Items › Allow in
	// the Background is off), so Ducter is the app's child for now.
	bgBlocked bool

	mu     sync.Mutex
	cmd    *exec.Cmd
	exited chan struct{}
	err    error
	stop   bool
}

// Background reports whether Ducter keeps running after the app quits.
func (s *Supervisor) Background() bool { return s.Agent != nil && !s.BackgroundBlocked() }

// BackgroundBlocked reports whether macOS refused the LaunchAgent (the
// person turned Ducter off in Login Items), so this run is the app's child.
func (s *Supervisor) BackgroundBlocked() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.bgBlocked
}

// BackgroundFirst reports whether the LaunchAgent isn't there yet: the
// next Start is the one macOS answers with "Background Items Added".
func (s *Supervisor) BackgroundFirst() bool { return s.Agent != nil && !s.Agent.Installed() }

// BackgroundAllowed asks macOS again whether the agent may run.
func (s *Supervisor) BackgroundAllowed() bool {
	if s.Agent == nil {
		return false
	}
	st := s.Agent.AgentBackground()
	return st == BackgroundAllowed || st == BackgroundNotRegistered || st == BackgroundUnknown
}

// Rest stops Ducter for good, until the app starts it again: the
// LaunchAgent is unloaded and removed, or the child is stopped.
func (s *Supervisor) Rest() error {
	if s.Agent != nil {
		return s.Agent.Remove()
	}
	s.Stop(8 * time.Second)
	return nil
}

// LogPath is where the child's own output goes.
func (s *Supervisor) LogPath() string { return filepath.Join(s.DataDir, "app.log") }

func (s *Supervisor) env() []string {
	env := os.Environ()
	env = append(env,
		"DUCTER_PORT="+strconv.Itoa(s.Port),
		"DUCTER_DATA_DIR="+s.DataDir,
		"NO_COLOR=1",
	)
	if s.Locale != "" && os.Getenv("DUCTER_LOCALE") == "" {
		env = append(env, "DUCTER_LOCALE="+s.Locale)
	}
	return env
}

// Healthy reports whether a Ducter answers /health on the port.
func (s *Supervisor) Healthy() bool {
	return Healthy(s.Port, time.Second)
}

// Healthy reports whether a Ducter answers /health on 127.0.0.1:port.
func Healthy(port int, timeout time.Duration) bool {
	cl := http.Client{Timeout: timeout}
	r, err := cl.Get(fmt.Sprintf("http://127.0.0.1:%d/health", port))
	if err != nil {
		return false
	}
	defer r.Body.Close()
	var j struct {
		OK      bool   `json:"ok"`
		HeadSeq *int64 `json:"headSeq"`
	}
	return json.NewDecoder(r.Body).Decode(&j) == nil && j.OK && j.HeadSeq != nil
}

// Doctor runs `ducter doctor --json`: what this Mac has, and what's missing.
func (s *Supervisor) Doctor() (Report, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, s.CLI, "doctor", "--json")
	cmd.Env = s.env()
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	runErr := cmd.Run() // exit 1 just means something is missing
	var r Report
	if err := json.Unmarshal(out.Bytes(), &r); err != nil {
		if runErr != nil {
			return Report{}, fmt.Errorf("ducter doctor: %v %s", runErr, strings.TrimSpace(errb.String()))
		}
		return Report{}, fmt.Errorf("ducter doctor: %v", err)
	}
	return r, nil
}

// Start runs `ducter up --no-desktop` as this app's child. It stops when
// the app does: Stop on quit, and the CLI watches DUCTER_PARENT_PID in
// case the app dies without saying so.
func (s *Supervisor) Start() error {
	if s.Agent != nil {
		// The keep-running decision: Ducter outlives the window; launchd runs it.
		if err := os.MkdirAll(s.DataDir, 0o755); err == nil {
			if f, err := os.OpenFile(s.LogPath(), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644); err == nil {
				fmt.Fprintf(f, "\n--- %s Ducter.app starts Ducter in the background (%s)\n", time.Now().Format(time.RFC3339), s.Agent.Label)
				f.Close()
			}
		}
		// Turned off in Login Items: macOS won't load it. Run as the
		// app's child instead, and say so (the window explains, with the
		// way back); never a dead end.
		blocked := s.Agent.AgentBackground() == BackgroundNeedsApproval
		if !blocked {
			err := s.Agent.Install(AgentEnv(s.Port, s.DataDir, s.Locale))
			if err == nil {
				s.mu.Lock()
				s.bgBlocked = false
				s.mu.Unlock()
				return nil
			}
			blocked = true
			if f, ferr := os.OpenFile(s.LogPath(), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644); ferr == nil {
				fmt.Fprintf(f, "--- background agent didn't load (%v); running as the app's child\n", err)
				f.Close()
			}
		}
		s.mu.Lock()
		s.bgBlocked = blocked
		s.mu.Unlock()
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cmd != nil && s.exited != nil {
		select {
		case <-s.exited:
		default:
			return nil // already running
		}
	}
	if err := os.MkdirAll(s.DataDir, 0o755); err != nil {
		return err
	}
	log, err := os.OpenFile(s.LogPath(), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return err
	}
	fmt.Fprintf(log, "\n--- %s Ducter.app starts ducter up\n", time.Now().Format(time.RFC3339))
	cmd := exec.Command(s.CLI, "up", "--no-desktop")
	cmd.Env = append(s.env(), "DUCTER_PARENT_PID="+strconv.Itoa(os.Getpid()))
	cmd.Stdout, cmd.Stderr = log, log
	cmd.Dir = s.DataDir
	if err := cmd.Start(); err != nil {
		log.Close()
		return err
	}
	s.cmd, s.exited, s.err, s.stop = cmd, make(chan struct{}), nil, false
	done := s.exited
	go func() {
		err := cmd.Wait()
		log.Close()
		s.mu.Lock()
		s.err = err
		s.mu.Unlock()
		close(done)
	}()
	return nil
}

// Exited is closed when the child started last exits (nil before Start).
func (s *Supervisor) Exited() <-chan struct{} {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.exited
}

// Owned reports whether this app started the Ducter that runs.
func (s *Supervisor) Owned() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.exited == nil {
		return false
	}
	select {
	case <-s.exited:
		return false
	default:
		return true
	}
}

// Stopping reports whether Stop asked the child to go (so its exit isn't
// a failure).
func (s *Supervisor) Stopping() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.stop
}

// ExitReason says why the child stopped, from its exit and the log's tail.
func (s *Supervisor) ExitReason() string {
	s.mu.Lock()
	err := s.err
	s.mu.Unlock()
	tail := LogTail(s.LogPath(), 6)
	switch {
	case err != nil && tail != "":
		return err.Error() + "\n" + tail
	case err != nil:
		return err.Error()
	}
	return tail
}

// Stop asks the child to stop (SIGTERM, as Ctrl-C would), and kills it if
// it is still there after wait. Ducter that this app didn't start is
// left alone.
func (s *Supervisor) Stop(wait time.Duration) {
	s.mu.Lock()
	cmd, done := s.cmd, s.exited
	s.stop = true
	s.mu.Unlock()
	if cmd == nil || cmd.Process == nil || done == nil {
		return
	}
	select {
	case <-done:
		return
	default:
	}
	_ = cmd.Process.Signal(syscall.SIGTERM)
	select {
	case <-done:
	case <-time.After(wait):
		_ = cmd.Process.Kill()
		<-done
	}
}

// LogTail is the last n non-empty lines of a file.
func LogTail(path string, n int) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	lines := strings.Split(strings.TrimRight(string(b), "\n"), "\n")
	var out []string
	for i := len(lines) - 1; i >= 0 && len(out) < n; i-- {
		if l := strings.TrimSpace(lines[i]); l != "" && !strings.HasPrefix(l, "---") {
			out = append([]string{l}, out...)
		}
	}
	return strings.Join(out, "\n")
}

// ErrNotLinked is returned by LinkCLI when ~/.local/bin/ducter is
// something else (a file a person put there), which it never replaces.
var ErrNotLinked = errors.New("~/.local/bin/ducter already exists")
