package imessage

import (
	"bytes"
	"context"
	"os/exec"
	"strings"
	"time"
)

// Accounter is a Sender that can say which address this Messages is
// signed in to iMessage with (D323). OsaSender is one; a fake may be.
type Accounter interface {
	Account(ctx context.Context) (string, error)
}

// The scripting dictionary's account has a description, "the name of this
// account as defined in Account preferences" (sdef, macOS 15.7.9). For an
// iMessage account it is taken to be its address; research/113 §1 marks
// that unverified, so anything that isn't shaped like an address is
// dropped (Address), and the code's own message is what settles it.
const accountScript = `on run argv
	tell application "Messages"
		set theAccount to 1st account whose service type = iMessage
		return "ok" & tab & (description of theAccount)
	end tell
end run`

// Account implements Accounter.
func (s OsaSender) Account(ctx context.Context) (string, error) {
	bin := s.Bin
	if bin == "" {
		bin = "/usr/bin/osascript"
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin, "-")
	cmd.Stdin = strings.NewReader(accountScript)
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	err := cmd.Run()
	got := strings.TrimSpace(out.String())
	if err == nil && strings.HasPrefix(got, "ok") {
		return Address(strings.TrimSpace(strings.TrimPrefix(got, "ok"))), nil
	}
	return "", osaError(errb.String(), err)
}

// Address is a as an iMessage address (someone@icloud.com, +8613…), or ""
// when it doesn't look like one.
func Address(a string) string {
	a = plainAddress(a)
	if a == "" {
		return ""
	}
	if strings.Contains(a, "@") {
		if strings.ContainsAny(a, " \t") {
			return ""
		}
		return a
	}
	digits := 0
	for _, r := range a {
		switch {
		case r >= '0' && r <= '9':
			digits++
		case r == '+' || r == ' ' || r == '-' || r == '(' || r == ')':
		default:
			return ""
		}
	}
	if digits >= 6 {
		return a
	}
	return ""
}
