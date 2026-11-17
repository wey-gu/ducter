package imessage

import (
	"context"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

// Host is what the setup checks need to know about this Mac and this
// macOS user (D323). Tests use a fake; MacHost is the real one.
type Host interface {
	// Front: this macOS user is the one in front (it owns the console).
	// Messages can't be driven from a user switched to the background,
	// so sending fails there (research/114 §2).
	Front() bool
	// User is this macOS user's short name.
	User() string
	// ICloud is the Apple ID this macOS user is signed in to in System
	// Settings (iCloud), "" when none or unknown. Messages may be signed in
	// to another one (research/114 §1).
	ICloud(ctx context.Context) string
}

// MacHost reads the real Mac: the console's owner, and the iCloud account
// from the user's MobileMeAccounts preferences (read only, through plutil).
type MacHost struct{}

// Front implements Host.
func (MacHost) Front() bool {
	fi, err := os.Stat("/dev/console")
	if err != nil {
		return true // can't tell: don't warn
	}
	st, ok := fi.Sys().(*syscall.Stat_t)
	if !ok {
		return true
	}
	return int(st.Uid) == os.Getuid()
}

// User implements Host.
func (MacHost) User() string {
	if u, err := user.Current(); err == nil {
		return u.Username
	}
	return ""
}

// ICloud implements Host.
func (MacHost) ICloud(ctx context.Context) string {
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "/usr/bin/plutil", "-extract", "Accounts.0.AccountID", "raw", "-o", "-",
		filepath.Join(home, "Library", "Preferences", "MobileMeAccounts.plist")).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
