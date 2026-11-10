package main

import (
	"io"
	"log"
	"os"
	"path/filepath"
)

// appLogMax is how large the app's log grows before it starts over (the
// one before is kept as app.1.log).
const appLogMax = 1 << 20

// openAppLog sends the app's own log lines (an update that didn't go in, a
// restart that didn't quit) to ~/Library/Logs/<bundle id>/app.log as well as
// stderr: an app opened from the Dock has nowhere else for them, so a
// failure the person saw left no trace (2026-11-11: 现在重启 did nothing on
// 0.0.12 and nothing said why). Per bundle id, so a scratch build never
// writes the real app's log. The lines carry no secrets: names, versions,
// paths and errors only.
func openAppLog(bid string) {
	home, err := os.UserHomeDir()
	if err != nil || bid == "" {
		return
	}
	dir := filepath.Join(home, "Library", "Logs", bid)
	if os.MkdirAll(dir, 0o700) != nil {
		return
	}
	path := filepath.Join(dir, "app.log")
	if st, err := os.Stat(path); err == nil && st.Size() > appLogMax {
		_ = os.Rename(path, filepath.Join(dir, "app.1.log"))
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return
	}
	log.SetOutput(io.MultiWriter(os.Stderr, f))
}
