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
	"strings"
	"time"
	"unicode"
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
	// CLIOffer is the answer to "use ducter in Terminal too?": "linked"
	// or "declined"; empty until asked.
	CLIOffer string `json:"cliOffer,omitempty"`
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

// Reload reads firstrun.json again (the client may open before `ducter
// up` wrote it), keeping the client's own state.
func (l *Local) Reload() {
	if l == nil || l.Dir == "" {
		return
	}
	l.Hints = Open(l.Dir).Hints
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
	l.save()
}

// CLIOffer is the answer to the one-time "use ducter in Terminal too?".
func (l *Local) CLIOffer() string {
	if l == nil {
		return ""
	}
	return l.st.CLIOffer
}

// SetCLIOffer remembers that answer.
func (l *Local) SetCLIOffer(answer string) {
	if l == nil {
		return
	}
	l.st.CLIOffer = answer
	l.save()
}

func (l *Local) save() {
	if l.Dir == "" {
		return
	}
	b, err := json.MarshalIndent(l.st, "", "  ")
	if err != nil {
		return
	}
	writeAtomic(filepath.Join(l.Dir, StateFile), append(b, '\n'))
}

func writeAtomic(path string, b []byte) {
	tmp := path + ".tmp"
	if os.WriteFile(tmp, b, 0o644) == nil {
		_ = os.Rename(tmp, path)
	}
}

// PersonaFile is the partner's chosen name, shared with the CLI
// (packages/cli/src/firstrun.ts): every `ducter up` reads it.
const PersonaFile = "persona.json"

// Persona is persona.json. Name is absent when the person kept the default.
type Persona struct {
	Name    string `json:"name,omitempty"`
	AskedAt string `json:"askedAt,omitempty"`
}

// ReadPersona reads persona.json; ok is false when there is none (the
// name was never asked).
func ReadPersona(dir string) (p Persona, ok bool) {
	b, err := os.ReadFile(filepath.Join(dir, PersonaFile))
	if err != nil {
		return Persona{}, false
	}
	if json.Unmarshal(b, &p) != nil {
		return Persona{}, false
	}
	return p, true
}

// WritePersona saves the answer to the name question.
func WritePersona(dir string, p Persona) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}
	writeAtomic(filepath.Join(dir, PersonaFile), append(b, '\n'))
	return nil
}

// CleanName makes a typed name safe to show: one line, no control
// characters, at most 24 characters (as cleanName in firstrun.ts).
func CleanName(raw string) string {
	var b strings.Builder
	for _, r := range raw {
		switch {
		case r < 0x20 || r == 0x7f:
		case unicode.IsSpace(r):
			b.WriteRune(' ')
		default:
			b.WriteRune(r)
		}
	}
	s := strings.Join(strings.Fields(b.String()), " ")
	if rs := []rune(s); len(rs) > 24 {
		s = string(rs[:24])
	}
	return s
}
