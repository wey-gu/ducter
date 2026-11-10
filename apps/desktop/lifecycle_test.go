package main

import (
	"errors"
	"reflect"
	"sync"
	"testing"
	"time"
)

// steps records Restart to update's calls in order.
type steps struct {
	mu   sync.Mutex
	list []string
	at   map[string]time.Time
}

func (s *steps) add(name string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.list = append(s.list, name)
	if s.at == nil {
		s.at = map[string]time.Time{}
	}
	s.at[name] = time.Now()
}

type fakeRestarter struct {
	s          *steps
	prepareErr error
	beginErr   error
	beginTook  time.Duration
}

func (f *fakeRestarter) PrepareRestart() error { f.s.add("password"); return f.prepareErr }
func (f *fakeRestarter) Begin(relaunch bool) (bool, error) {
	if !relaunch {
		f.s.add("begin without relaunch")
	}
	time.Sleep(f.beginTook)
	f.s.add("check and start the swap")
	return f.beginErr == nil, f.beginErr
}

type fakeScreen struct{ s *steps }

func (f fakeScreen) Putting(on bool) {
	if on {
		f.s.add("putting the new version in")
	} else {
		f.s.add("back")
	}
}
func (f fakeScreen) Failed() { f.s.add("settings says why") }
func (f fakeScreen) Leave()  { f.s.add("windows out, quit") }

func TestRestartToUpdateOrder(t *testing.T) {
	s := &steps{}
	if !runRestart(&fakeRestarter{s: s}, fakeScreen{s}, 0) {
		t.Fatal("it quits")
	}
	want := []string{"password", "putting the new version in", "check and start the swap", "windows out, quit"}
	if !reflect.DeepEqual(s.list, want) {
		t.Fatalf("order %q, want %q", s.list, want)
	}
}

// The calm screen stays long enough to read, but a slow check isn't padded.
func TestRestartToUpdateCalm(t *testing.T) {
	s := &steps{}
	runRestart(&fakeRestarter{s: s}, fakeScreen{s}, 150*time.Millisecond)
	if d := s.at["windows out, quit"].Sub(s.at["putting the new version in"]); d < 150*time.Millisecond {
		t.Fatalf("left after %v", d)
	}
	s = &steps{}
	runRestart(&fakeRestarter{s: s, beginTook: 200 * time.Millisecond}, fakeScreen{s}, 150*time.Millisecond)
	if d := s.at["windows out, quit"].Sub(s.at["check and start the swap"]); d > 50*time.Millisecond {
		t.Fatalf("waited %v more after a slow check", d)
	}
}

// The password cancelled: nothing changes on screen and the app stays.
func TestRestartToUpdateWithoutThePassword(t *testing.T) {
	s := &steps{}
	if runRestart(&fakeRestarter{s: s, prepareErr: errors.New("cancelled")}, fakeScreen{s}, 0) {
		t.Fatal("it stays open")
	}
	if want := []string{"password"}; !reflect.DeepEqual(s.list, want) {
		t.Fatalf("order %q", s.list)
	}
}

// A copy that fails its check: back to Settings, which says why; no quit.
func TestRestartToUpdateRefusedCopy(t *testing.T) {
	s := &steps{}
	if runRestart(&fakeRestarter{s: s, beginErr: errors.New("signature")}, fakeScreen{s}, time.Second) {
		t.Fatal("it stays open")
	}
	want := []string{"password", "putting the new version in", "check and start the swap", "back", "settings says why"}
	if !reflect.DeepEqual(s.list, want) {
		t.Fatalf("order %q, want %q", s.list, want)
	}
}
