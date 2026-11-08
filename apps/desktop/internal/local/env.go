// Package local is Ducter.app looking after the Ducter on this Mac: it
// finds the `ducter` binary inside the app, gives it a usable PATH (an app
// opened from Finder gets only the system folders), asks it to check the
// Mac (`ducter doctor --json`), and runs `ducter up --no-desktop` as a
// child for as long as the app is open.
package local

import (
	"bufio"
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Bundle is where the app's own files are, when it runs as Ducter.app.
type Bundle struct {
	// App is the .app folder; CLI is Contents/Helpers/ducter inside it.
	App, CLI string
}

// FindBundle reports the bundle around exe (os.Executable), if it runs
// from Something.app/Contents/MacOS and the app carries the ducter CLI.
func FindBundle(exe string) (Bundle, bool) {
	if real, err := filepath.EvalSymlinks(exe); err == nil {
		exe = real
	}
	macos := filepath.Dir(exe)
	contents := filepath.Dir(macos)
	app := filepath.Dir(contents)
	if filepath.Base(macos) != "MacOS" || filepath.Base(contents) != "Contents" || !strings.HasSuffix(app, ".app") {
		return Bundle{}, false
	}
	cli := filepath.Join(contents, "Helpers", "ducter")
	if st, err := os.Stat(cli); err != nil || st.IsDir() {
		return Bundle{}, false
	}
	return Bundle{App: app, CLI: cli}, true
}

// DevEnvPath is a developer's override for the app's environment:
// ~/Library/Application Support/Ducter/dev.env, KEY=VALUE per line. It
// lets a test run the real app against a scratch data folder and port.
func DevEnvPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, "Library", "Application Support", "Ducter", "dev.env")
}

// LoadDevEnv sets the DUCTER_* variables the file names (others are
// ignored, so the file can't change PATH or HOME). A missing file is fine.
// It returns the keys it set.
func LoadDevEnv(path string) []string {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	var set []string
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		k, v, ok := strings.Cut(line, "=")
		k = strings.TrimSpace(k)
		if !ok || !strings.HasPrefix(k, "DUCTER_") {
			continue
		}
		v = strings.Trim(strings.TrimSpace(v), `"'`)
		if strings.HasPrefix(v, "~/") {
			if home, err := os.UserHomeDir(); err == nil {
				v = filepath.Join(home, v[2:])
			}
		}
		os.Setenv(k, v)
		set = append(set, k)
	}
	return set
}

// usualBins are where the CLIs Ducter uses get installed: Claude Code's
// installer (~/.local/bin), Homebrew, Bun, npm's global folder.
func usualBins(home string) []string {
	return []string{
		filepath.Join(home, ".local", "bin"),
		filepath.Join(home, ".claude", "local"),
		"/opt/homebrew/bin",
		"/opt/homebrew/sbin",
		"/usr/local/bin",
		filepath.Join(home, ".bun", "bin"),
		filepath.Join(home, ".npm-global", "bin"),
		filepath.Join(home, ".cargo", "bin"),
		filepath.Join(home, "go", "bin"),
	}
}

// LoginPath asks the login shell for its PATH, as Terminal would have it.
// Slow or broken shell profiles get two seconds, then "".
func LoginPath(shell string) string {
	if shell == "" || !filepath.IsAbs(shell) {
		shell = "/bin/zsh"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	const mark = "__DUCTER_PATH__"
	cmd := exec.CommandContext(ctx, shell, "-l", "-c", "printf '"+mark+"%s"+mark+"' \"$PATH\"")
	cmd.Stdin = nil
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	s := string(out)
	i := strings.Index(s, mark)
	j := strings.LastIndex(s, mark)
	if i < 0 || j <= i {
		return ""
	}
	return s[i+len(mark) : j]
}

// MergePath joins PATH lists in order, keeping the first of each folder.
func MergePath(lists ...string) string {
	seen := map[string]bool{}
	var out []string
	for _, l := range lists {
		for _, d := range filepath.SplitList(l) {
			if d == "" || seen[d] {
				continue
			}
			seen[d] = true
			out = append(out, d)
		}
	}
	return strings.Join(out, string(filepath.ListSeparator))
}

// FixPath gives this process the PATH a terminal would have: the login
// shell's, the current one, and the usual install folders. It returns the
// login shell's own PATH ("" if the shell didn't answer).
func FixPath() (login string) {
	home, _ := os.UserHomeDir()
	login = LoginPath(os.Getenv("SHELL"))
	os.Setenv("PATH", MergePath(login, os.Getenv("PATH"), strings.Join(usualBins(home), string(filepath.ListSeparator))))
	return login
}

// Port is the port Ducter listens on: $DUCTER_PORT, else 7777.
func Port() int {
	if p, err := strconv.Atoi(os.Getenv("DUCTER_PORT")); err == nil && p > 0 && p < 65536 {
		return p
	}
	return 7777
}
