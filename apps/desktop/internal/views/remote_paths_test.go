package views

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
	"github.com/wey-gu/ducter/apps/desktop/internal/store"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// A remote Ducter's paths are the server's: the desktop never runs git on
// them here (a model could name any repo on this Mac).
func TestRemotePathsStayOnTheServer(t *testing.T) {
	repo := t.TempDir()
	if out, err := exec.Command("git", "init", "-q", repo).CombinedOutput(); err != nil {
		t.Skipf("git: %v %s", err, out)
	}
	if err := os.WriteFile(filepath.Join(repo, "secret.txt"), []byte("x\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	old := thisMachine
	thisMachine = func() string { return "here" }
	defer func() { thisMachine = old }()
	for _, c := range []struct {
		url     string
		machine string // what the welcome said
		local   bool
	}{
		{"", "", true},
		{"ws://127.0.0.1:7777/ws", "", true}, // an older Ducter: by address
		{"ws://127.0.0.1:7777/ws", "here", true},
		{"ws://127.0.0.1:7777/ws", "elsewhere", false}, // an SSH tunnel to a server
		{"wss://d.example.com/ws", "", false},
		{"wss://d.example.com/ws", "here", true}, // this Mac's Ducter, reached by its domain
	} {
		app := New(store.New(), theme.Pebble(), i18n.New(i18n.EN))
		app.URL = c.url
		app.S.Apply(protocol.ServerFrame{T: "welcome", Persona: "p", Machine: c.machine})
		card := protocol.TaskCard{TaskID: "t1", Title: "x", Place: protocol.Place{Kind: "repo", Worktree: repo}}
		app.S.Apply(protocol.ServerFrame{T: "on_hand", OnHand: &protocol.OnHand{Tasks: []protocol.TaskCard{card}}})
		if app.S.Task("t1") == nil {
			t.Fatal("no task from on_hand")
		}
		if got := app.onThisMachine(); got != c.local {
			t.Errorf("%q %q: onThisMachine %v", c.url, c.machine, got)
		}
		app.refreshDiff("t1")
		pane := app.diffs["t1"]
		if c.local && (pane == nil || len(pane.files) == 0) {
			t.Errorf("%q: local diff missing: %+v", c.url, pane)
		}
		if !c.local && pane != nil {
			t.Errorf("%q: ran git on a server path here: %+v", c.url, pane)
		}
	}
}
