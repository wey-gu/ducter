package local

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Host is everything Ducter.app does on this Mac for the window
// (views.Backend): the supervisor, Terminal for fixes, and the link that
// puts `ducter` on PATH.
type Host struct {
	*Supervisor
	// LoginPath is the PATH a new Terminal window gets.
	LoginPath string
	// Scratch is where fix scripts for Terminal are written.
	Scratch string
	// After is what Terminal says once a fix ran.
	After string
}

// DataDir is Ducter's data folder.
func (h *Host) DataDir() string { return h.Supervisor.DataDir }

// RunInTerminal opens Terminal on one fix.
func (h *Host) RunInTerminal(id, cmd string) error {
	dir := h.Scratch
	if dir == "" {
		dir = filepath.Join(os.TempDir(), "ducter-fix")
	}
	return RunInTerminal(dir, "ducter-"+id, cmd, h.After)
}

// OpenURL opens a page in the browser.
func (h *Host) OpenURL(u string) error { return OpenURL(u) }

// CLIState is what ~/.local/bin/ducter is. An app still on the disk
// image, or run from a read-only copy macOS made (App Translocation, for
// an app opened where it was downloaded), would leave a link that breaks:
// those count as "other", so nothing is offered until it's in Applications.
func (h *Host) CLIState() CLIState {
	if !Settled(h.CLI) {
		return CLIOther
	}
	return CLIStatus(LinkDir(), h.CLI)
}

// Settled reports whether the app runs from where it will stay: not a
// mounted disk image, not a translocated copy.
func Settled(p string) bool {
	return !strings.HasPrefix(p, "/Volumes/") && !strings.Contains(p, "/AppTranslocation/")
}

// ClearQuarantine takes the download flag off the app's own helper, as
// install.sh does, so running it never stops at a Gatekeeper dialog of its
// own. Best effort: a read-only copy keeps it.
func ClearQuarantine(path string) {
	_ = exec.Command("/usr/bin/xattr", "-d", "com.apple.quarantine", path).Run()
}

// LinkCLI links ~/.local/bin/ducter to this app's CLI.
func (h *Host) LinkCLI() error { return LinkCLI(LinkDir(), h.CLI) }

// CLIOnPath reports whether ~/.local/bin is on a new Terminal's PATH.
func (h *Host) CLIOnPath() bool { return OnPath(LinkDir(), h.LoginPath) }
