package local

import (
	"bufio"
	"errors"
	"io"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"time"
)

// A Job is one fix the app runs by itself, in the background: an official
// installer, a sign-in that opens the browser, cua-driver's permission
// guide. The window shows its last line as progress, the sign-in page it
// printed (if the browser didn't open), and how it ended.
type Job struct {
	ID      string
	Cmd     string
	Started time.Time

	mu    sync.Mutex
	lines []string
	url   string
	done  chan struct{}
	err   error
	code  int
	stdin io.WriteCloser
	proc  *os.Process
	ended time.Time
	// canceled: the person stopped it.
	canceled bool
}

// NewJob is a job that runs nothing: tests (and fakes) feed it lines and
// finish it themselves.
func NewJob(id, cmd string) *Job {
	return &Job{ID: id, Cmd: cmd, Started: time.Now(), done: make(chan struct{})}
}

// StartJob runs cmd with /bin/bash in its own process group (a cancel
// stops `curl | bash` and everything under it), stdin kept open for a
// sign-in code, output collected line by line.
func StartJob(id, cmd string, env []string, dir string) (*Job, error) {
	j := NewJob(id, cmd)
	c := exec.Command("/bin/bash", "-c", cmd)
	c.Env = env
	c.Dir = dir
	c.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	in, err := c.StdinPipe()
	if err != nil {
		return nil, err
	}
	pr, pw := io.Pipe()
	c.Stdout, c.Stderr = pw, pw
	if err := c.Start(); err != nil {
		return nil, err
	}
	j.stdin, j.proc = in, c.Process
	go func() {
		sc := bufio.NewScanner(pr)
		sc.Buffer(make([]byte, 64*1024), 1024*1024)
		sc.Split(scanLinesOrCR)
		for sc.Scan() {
			j.Line(sc.Text())
		}
		_, _ = io.Copy(io.Discard, pr)
	}()
	go func() {
		err := c.Wait()
		_ = pw.Close()
		j.Finish(err)
	}()
	return j, nil
}

var (
	ansiRE = regexp.MustCompile(`\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[()][A-Z0-9]`)
	urlRE  = regexp.MustCompile(`https://[^\s"'<>\x1b]+`)
)

// Line adds one line of output (escape codes stripped; blank lines
// dropped). The first sign-in page it names is kept.
func (j *Job) Line(s string) {
	s = strings.TrimSpace(ansiRE.ReplaceAllString(s, ""))
	if s == "" {
		return
	}
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.url == "" {
		if u := urlRE.FindString(s); u != "" && signinURL(u) {
			j.url = strings.TrimRight(u, ".,)")
		}
	}
	j.lines = append(j.lines, s)
	if len(j.lines) > 400 {
		j.lines = append([]string(nil), j.lines[len(j.lines)-200:]...)
	}
}

// signinURL: a page a sign-in asks the person to open (not an installer's
// docs link).
func signinURL(u string) bool {
	for _, h := range []string{"oauth", "authorize", "/device", "login", "auth."} {
		if strings.Contains(u, h) {
			return true
		}
	}
	return false
}

// Finish ends the job (nil: it worked).
func (j *Job) Finish(err error) {
	j.mu.Lock()
	defer j.mu.Unlock()
	select {
	case <-j.done:
		return
	default:
	}
	j.err, j.ended = err, time.Now()
	var ee *exec.ExitError
	switch {
	case err == nil:
		j.code = 0
	case errors.As(err, &ee):
		j.code = ee.ExitCode()
	default:
		j.code = -1
	}
	close(j.done)
}

// Done is closed when the job ends.
func (j *Job) Done() <-chan struct{} { return j.done }

// Running reports whether it hasn't ended.
func (j *Job) Running() bool {
	select {
	case <-j.done:
		return false
	default:
		return true
	}
}

// OK reports whether it ended well.
func (j *Job) OK() bool { return !j.Running() && j.Err() == nil }

// Err is how it ended (nil while running, or when it worked).
func (j *Job) Err() error {
	j.mu.Lock()
	defer j.mu.Unlock()
	return j.err
}

// Tail is the last n lines.
func (j *Job) Tail(n int) []string {
	j.mu.Lock()
	defer j.mu.Unlock()
	if len(j.lines) <= n {
		return append([]string(nil), j.lines...)
	}
	return append([]string(nil), j.lines[len(j.lines)-n:]...)
}

// Last is the last line ("" before any).
func (j *Job) Last() string {
	if t := j.Tail(1); len(t) == 1 {
		return t[0]
	}
	return ""
}

// URL is the sign-in page the job printed, if any.
func (j *Job) URL() string {
	j.mu.Lock()
	defer j.mu.Unlock()
	return j.url
}

// Send writes one line to the job's stdin (a code a sign-in page showed).
func (j *Job) Send(line string) error {
	j.mu.Lock()
	in := j.stdin
	j.mu.Unlock()
	if in == nil {
		return errors.New("not running")
	}
	_, err := io.WriteString(in, strings.TrimSpace(line)+"\n")
	return err
}

// Cancel stops the job and everything it started.
func (j *Job) Cancel() {
	j.mu.Lock()
	p := j.proc
	j.canceled = true
	j.mu.Unlock()
	if p == nil {
		j.Finish(ErrCanceled)
		return
	}
	_ = syscall.Kill(-p.Pid, syscall.SIGTERM)
	go func() {
		select {
		case <-j.done:
		case <-time.After(3 * time.Second):
			_ = syscall.Kill(-p.Pid, syscall.SIGKILL)
		}
	}()
}

// ErrCanceled ends a job the person stopped.
var ErrCanceled = errors.New("canceled")

// Trouble is what went wrong, in one word the window can explain: "offline"
// (no network), "denied" (a folder it may not write), "canceled", or ""
// (something else; the last lines say what).
func (j *Job) Trouble() string {
	if j.Running() || j.Err() == nil {
		return ""
	}
	j.mu.Lock()
	canceled := j.canceled
	j.mu.Unlock()
	if canceled || errors.Is(j.Err(), ErrCanceled) {
		return "canceled"
	}
	text := strings.ToLower(strings.Join(j.Tail(30), "\n"))
	for _, s := range []string{"could not resolve host", "failed to connect", "network is unreachable", "timed out", "connection refused", "no route to host", "temporary failure in name resolution", "unable to access"} {
		if strings.Contains(text, s) {
			return "offline"
		}
	}
	for _, s := range []string{"permission denied", "not writable", "operation not permitted"} {
		if strings.Contains(text, s) {
			return "denied"
		}
	}
	return ""
}

// scanLinesOrCR splits on \n and on a lone \r (progress bars redraw a line).
func scanLinesOrCR(data []byte, atEOF bool) (int, []byte, error) {
	for i, b := range data {
		if b == '\n' || b == '\r' {
			return i + 1, data[:i], nil
		}
	}
	if atEOF && len(data) > 0 {
		return len(data), data, nil
	}
	return 0, nil, nil
}

// Jobs keeps one job per fix: asking again while one runs returns it.
type Jobs struct {
	mu   sync.Mutex
	byID map[string]*Job
	// Env is what jobs run with (nil: this process's, plus the job vars).
	Env func() []string
	Dir string
}

// JobEnv is this process's environment for a background installer: no
// colors, no questions (Codex's installer asks "Start Codex now?").
func JobEnv() []string {
	return append(os.Environ(), "NO_COLOR=1", "TERM=dumb", "CODEX_NON_INTERACTIVE=1", "CUA_DRIVER_NO_CONNECT=1", "HOMEBREW_NO_AUTO_UPDATE=1")
}

// Run starts cmd under id, or returns the one already running.
func (s *Jobs) Run(id, cmd string) (*Job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.byID == nil {
		s.byID = map[string]*Job{}
	}
	if j := s.byID[id]; j != nil && j.Running() {
		return j, nil
	}
	env := JobEnv()
	if s.Env != nil {
		env = s.Env()
	}
	dir := s.Dir
	if dir == "" {
		dir, _ = os.UserHomeDir()
	}
	j, err := StartJob(id, cmd, env, dir)
	if err != nil {
		return nil, err
	}
	s.byID[id] = j
	return j, nil
}

// Job is the latest job under id (nil if none).
func (s *Jobs) Job(id string) *Job {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.byID[id]
}

// StopAll cancels every running job (the app quits).
func (s *Jobs) StopAll() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, j := range s.byID {
		if j.Running() {
			j.Cancel()
		}
	}
}
