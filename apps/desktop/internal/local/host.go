package local

import (
	"os"
	"path/filepath"
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

// CLIState is what ~/.local/bin/ducter is.
func (h *Host) CLIState() CLIState { return CLIStatus(LinkDir(), h.CLI) }

// LinkCLI links ~/.local/bin/ducter to this app's CLI.
func (h *Host) LinkCLI() error { return LinkCLI(LinkDir(), h.CLI) }

// CLIOnPath reports whether ~/.local/bin is on a new Terminal's PATH.
func (h *Host) CLIOnPath() bool { return OnPath(LinkDir(), h.LoginPath) }
