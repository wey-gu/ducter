// Package computer says how a computer's name reads to a person and when
// two names are one computer (D310). It is the Go twin of
// packages/protocol/src/computer-name.ts; both read
// packages/protocol/fixtures/computer-name.json in their tests.
package computer

import (
	"context"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// dns is a bare host name with at least one dot and a last label that is
// not all digits (so an IPv4 address, "v1.2" or a sentence stays whole).
var dns = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z0-9-]*[A-Za-z][A-Za-z0-9-]*\.?$`)

// Name is a computer's name as a person reads it: a host name loses its
// DNS domain ("Mac.lan" → "Mac", "hel.example.com" → "hel"); anything else
// (a name the person chose, an IP address) is kept, trimmed.
func Name(name string) string {
	s := strings.TrimSpace(name)
	if !dns.MatchString(s) {
		return s
	}
	return s[:strings.IndexByte(s, '.')]
}

// Key is what two names of one computer share: its name as read, with
// case and punctuation folded away ("Wey’s MacBook Pro" and
// "Weys-MacBook-Pro.local" agree).
func Key(name string) string {
	var b strings.Builder
	for _, r := range norm.NFKD.String(Name(name)) {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			b.WriteRune(unicode.ToLower(r))
		}
	}
	return b.String()
}

// Same reports whether two names are the same computer (never for an
// empty name).
func Same(a, b string) bool {
	k := Key(a)
	return k != "" && k == Key(b)
}

// Undomained is a device's paired name without a DNS domain: a computer
// paired before D310 by its host name ("Mac.lan" → "Mac", "CLI on
// Mac.lan" → "CLI on Mac"). Any other name is kept.
func Undomained(name string) string {
	if rest, ok := strings.CutPrefix(name, "CLI on "); ok && rest != "" {
		return "CLI on " + Name(rest)
	}
	return Name(name)
}

var (
	thisOnce sync.Once
	this     string
)

// This is this computer's name as a person reads it: the Computer Name
// the person set on a Mac (System Settings › General › About), else the
// host name without its domain.
func This() string {
	thisOnce.Do(func() { this = pick(macName(), hostname()) })
	return this
}

// Host is this computer's host name without its domain: what pairings
// from before D310 called it.
func Host() string { return Name(hostname()) }

func pick(mac, host string) string {
	if s := clean(mac); s != "" {
		return s
	}
	if s := Name(host); s != "" {
		return s
	}
	return runtime.GOOS
}

func hostname() string {
	h, _ := os.Hostname()
	return h
}

func macName() string {
	if runtime.GOOS != "darwin" {
		return ""
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "scutil", "--get", "ComputerName").Output()
	if err != nil {
		return ""
	}
	return string(out)
}

// clean takes control and format characters out, collapses whitespace
// and keeps at most 64 characters.
func clean(s string) string {
	s = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || unicode.Is(unicode.Cf, r) {
			return ' '
		}
		return r
	}, s)
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > 64 {
		s = string(r[:64])
	}
	return s
}
