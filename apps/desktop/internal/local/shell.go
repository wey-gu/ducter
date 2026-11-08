package local

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// LinkDir is where the `ducter` link goes: the person's own bin folder,
// never a system one, so no administrator password is ever asked.
func LinkDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".local", "bin")
}

// CLIState is what `ducter` in a terminal would run today.
type CLIState int

const (
	// CLINone: no ducter in ~/.local/bin; it can be linked.
	CLINone CLIState = iota
	// CLILinked: ~/.local/bin/ducter is this app's.
	CLILinked
	// CLIOther: ~/.local/bin/ducter is something else (an install.sh
	// copy, or another app's); left alone.
	CLIOther
)

// CLIStatus looks at dir/ducter.
func CLIStatus(dir, cli string) CLIState {
	p := filepath.Join(dir, "ducter")
	fi, err := os.Lstat(p)
	if err != nil {
		return CLINone
	}
	if fi.Mode()&os.ModeSymlink != 0 {
		if to, err := os.Readlink(p); err == nil && to == cli {
			return CLILinked
		}
	}
	return CLIOther
}

// LinkCLI makes dir/ducter a link to the app's CLI. A link to an older
// copy of the app is replaced; any other file is left alone.
func LinkCLI(dir, cli string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	p := filepath.Join(dir, "ducter")
	if fi, err := os.Lstat(p); err == nil {
		if fi.Mode()&os.ModeSymlink == 0 {
			return ErrNotLinked
		}
		if to, _ := os.Readlink(p); to == cli {
			return nil
		}
		if err := os.Remove(p); err != nil {
			return err
		}
	}
	return os.Symlink(cli, p)
}

// OnPath reports whether dir is on the login shell's PATH (the one a new
// Terminal window gets).
func OnPath(dir, loginPath string) bool {
	for _, d := range filepath.SplitList(loginPath) {
		if filepath.Clean(d) == filepath.Clean(dir) {
			return true
		}
	}
	return false
}

// PathLine is the line that puts dir on PATH in zsh, for the person to
// run; the app never edits their shell profile.
func PathLine(dir string) string {
	home, _ := os.UserHomeDir()
	shown := dir
	if home != "" && strings.HasPrefix(dir, home+"/") {
		shown = "$HOME" + dir[len(home):]
	}
	return fmt.Sprintf(`echo 'export PATH="%s:$PATH"' >> ~/.zshrc`, shown)
}

// CommandFile writes a .command file that runs cmd in Terminal, then
// says what to do next. Terminal runs .command files on open, so no
// permission to control Terminal is needed.
func CommandFile(dir, name, cmd, after string) (string, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	p := filepath.Join(dir, name+".command")
	body := "#!/bin/zsh -l\n" +
		"clear\n" +
		"echo " + shellQuote("$ "+cmd) + "\n" +
		cmd + "\n" +
		"echo\n" +
		"echo " + shellQuote(after) + "\n"
	if err := os.WriteFile(p, []byte(body), 0o700); err != nil {
		return "", err
	}
	return p, nil
}

// RunInTerminal opens Terminal on a command.
func RunInTerminal(dir, name, cmd, after string) error {
	p, err := CommandFile(dir, name, cmd, after)
	if err != nil {
		return err
	}
	return exec.Command("/usr/bin/open", "-a", "Terminal", p).Run()
}

// OpenURL opens a link in the default browser.
func OpenURL(u string) error {
	return exec.Command("/usr/bin/open", u).Run()
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}
