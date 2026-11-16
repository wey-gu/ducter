package imessage

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// Sender sends through Messages. Tests use a fake.
type Sender interface {
	// Send sends text as an iMessage to one handle (a phone number or an
	// Apple ID's address).
	Send(ctx context.Context, to, text string) error
	// Probe asks Messages whether an iMessage account is signed in. The
	// first time, macOS asks the person to let Ducter control Messages.
	Probe(ctx context.Context) error
}

// OsaSender drives Messages with AppleScript through /usr/bin/osascript,
// the way the mature open-source gateways send. The handle and the words go
// in as arguments, never into the script's text, so nothing in a message
// can become a command.
type OsaSender struct {
	Bin string // "" = /usr/bin/osascript
}

const sendScript = `on run argv
	set theTo to item 1 of argv
	set theText to item 2 of argv
	tell application "Messages"
		set theAccount to 1st account whose service type = iMessage
		set theBuddy to buddy theTo of theAccount
		send theText to theBuddy
	end tell
	return "ok"
end run`

const probeScript = `on run argv
	tell application "Messages"
		set theAccount to 1st account whose service type = iMessage
		if enabled of theAccount is false then error number -1728
	end tell
	return "ok"
end run`

func (s OsaSender) run(ctx context.Context, script string, args ...string) error {
	bin := s.Bin
	if bin == "" {
		bin = "/usr/bin/osascript"
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin, append([]string{"-"}, args...)...)
	cmd.Stdin = strings.NewReader(script)
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	err := cmd.Run()
	if err == nil && strings.TrimSpace(out.String()) == "ok" {
		return nil
	}
	return osaError(errb.String(), err)
}

// osaError reads AppleScript's error number: -1743 (and -10004) is
// macOS refusing the Automation permission; -1728 is "can't get" the
// iMessage account (none signed in).
func osaError(stderr string, err error) error {
	switch {
	case strings.Contains(stderr, "-1743"), strings.Contains(stderr, "-10004"), strings.Contains(stderr, "Not authorized"):
		return ErrNoAutomation
	case strings.Contains(stderr, "-1728"), strings.Contains(stderr, "-1719"):
		return ErrNotSignedIn
	}
	if err == nil {
		err = fmt.Errorf("no answer")
	}
	return fmt.Errorf("imessage: Messages didn't send: %v: %s", err, strings.TrimSpace(stderr))
}

// Send implements Sender.
func (s OsaSender) Send(ctx context.Context, to, text string) error {
	return s.run(ctx, sendScript, to, text)
}

// Probe implements Sender.
func (s OsaSender) Probe(ctx context.Context) error {
	return s.run(ctx, probeScript)
}
