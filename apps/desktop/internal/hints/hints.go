// Package hints is what the client knows about the Mac it runs on, from
// files in Ducter's data folder: the first-run hints `ducter up` writes
// (packages/cli/src/firstrun.ts: recent repo names, never their contents)
// and the client's own first-run memory (whether the first result was
// celebrated). Everything here is optional: a missing or unreadable file
// means generic starters and an in-memory flag.
package hints

import (
	"encoding/json"
	"os"
	"path/filepath"
	"time"
)

const (
	// HintsFile is written by `ducter up`.
	HintsFile = "firstrun.json"
	// StateFile is the client's own.
	StateFile = "desktop.json"
)

// Repo is one recently touched git checkout.
type Repo struct {
	Name      string `json:"name"`
	Path      string `json:"path"` // "~/dev/hawdb"
	TouchedAt string `json:"touchedAt"`
}

// Hints is firstrun.json.
type Hints struct {
	Version     int    `json:"version"`
	GeneratedAt string `json:"generatedAt"`
	RepoCount   int    `json:"repoCount"`
	Repos       []Repo `json:"repos"`
}

type state struct {
	FirstResultSeenAt string `json:"firstResultSeenAt,omitempty"`
}

// Local is the data folder as the client sees it. Its zero value (no
// folder) works in memory only.
type Local struct {
	Dir   string
	Hints *Hints
	st    state
}

// DataDir is where Ducter keeps its data: $DUCTER_DATA_DIR, else ~/.ducter
// (the CLI's default).
func DataDir() string {
	if d := os.Getenv("DUCTER_DATA_DIR"); d != "" {
		return d
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".ducter")
}

// Open reads what there is in dir. It never fails: missing files are
// simply absent hints.
func Open(dir string) *Local {
	l := &Local{Dir: dir}
	if dir == "" {
		return l
	}
	if b, err := os.ReadFile(filepath.Join(dir, HintsFile)); err == nil {
		var h Hints
		if json.Unmarshal(b, &h) == nil && h.Version == 1 {
			l.Hints = &h
		}
	}
	if b, err := os.ReadFile(filepath.Join(dir, StateFile)); err == nil {
		_ = json.Unmarshal(b, &l.st)
	}
	return l
}

// Repos are the recent repos, newest first (nil without hints).
func (l *Local) Repos() []Repo {
	if l == nil || l.Hints == nil {
		return nil
	}
	return l.Hints.Repos
}

// RepoCount is how many repos were found.
func (l *Local) RepoCount() int {
	if l == nil || l.Hints == nil {
		return 0
	}
	return l.Hints.RepoCount
}

// FirstResultSeen reports whether the first finished task was already
// celebrated on this Mac.
func (l *Local) FirstResultSeen() bool {
	return l != nil && l.st.FirstResultSeenAt != ""
}

// MarkFirstResultSeen remembers that the first result was celebrated, so
// it happens once, not on every launch.
func (l *Local) MarkFirstResultSeen(at time.Time) {
	if l == nil {
		return
	}
	l.st.FirstResultSeenAt = at.UTC().Format(time.RFC3339)
	if l.Dir == "" {
		return
	}
	b, err := json.MarshalIndent(l.st, "", "  ")
	if err != nil {
		return
	}
	tmp := filepath.Join(l.Dir, StateFile+".tmp")
	if os.WriteFile(tmp, append(b, '\n'), 0o644) == nil {
		_ = os.Rename(tmp, filepath.Join(l.Dir, StateFile))
	}
}
