package local

import (
	"strings"
	"testing"
	"time"
)

func waitJob(t *testing.T, j *Job) {
	t.Helper()
	select {
	case <-j.Done():
	case <-time.After(10 * time.Second):
		t.Fatal("job didn't end")
	}
	time.Sleep(20 * time.Millisecond) // the reader drains
}

// A sign-in prints its page and waits for a code on stdin; progress bars
// redraw with \r; escape codes are stripped.
func TestJobLinesURLAndStdin(t *testing.T) {
	var s Jobs
	s.Dir = t.TempDir()
	j, err := s.Run("claude.signin", `printf '\033[1mOpening browser to sign in…\033[0m\n'; echo "If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true&x=1"; printf 'Paste code here if prompted > '; read code; printf '10%%\r50%%\r100%%\n'; echo "got $code"`)
	if err != nil {
		t.Fatal(err)
	}
	again, _ := s.Run("claude.signin", "echo second")
	if again != j {
		t.Fatal("a second Run while one runs must return the same job")
	}
	deadline := time.Now().Add(5 * time.Second)
	for j.URL() == "" && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if j.URL() != "https://claude.com/cai/oauth/authorize?code=true&x=1" {
		t.Fatalf("url = %q", j.URL())
	}
	if err := j.Send("abc123"); err != nil {
		t.Fatal(err)
	}
	waitJob(t, j)
	if !j.OK() || j.Last() != "got abc123" {
		t.Fatalf("ok=%v last=%q tail=%q", j.OK(), j.Last(), j.Tail(10))
	}
	all := strings.Join(j.Tail(20), "|")
	if strings.Contains(all, "\x1b") || !strings.Contains(all, "|50%|") {
		t.Fatalf("tail = %q", all)
	}
}

func TestJobTroubleAndCancel(t *testing.T) {
	var s Jobs
	j, _ := s.Run("x", `echo "curl: (6) Could not resolve host: claude.ai" >&2; exit 6`)
	waitJob(t, j)
	if j.OK() || j.Trouble() != "offline" {
		t.Fatalf("trouble = %q", j.Trouble())
	}
	k, _ := s.Run("y", `sleep 30 | cat`)
	time.Sleep(100 * time.Millisecond)
	start := time.Now()
	k.Cancel()
	waitJob(t, k)
	if time.Since(start) > 4*time.Second || k.OK() || k.Trouble() != "canceled" {
		t.Fatal("cancel didn't stop the pipeline")
	}
	if j.URL() != "" {
		t.Fatal("an installer's error isn't a sign-in page")
	}
}
