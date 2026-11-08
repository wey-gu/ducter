// Package remote connects the desktop to a Ducter on another machine (a
// VPS, a home server): it trades a one-time pairing code for a device
// token at POST <address>/pair, and keeps that token in a 0600 file in the
// user's config folder (D54; docs/design/system.md "Remote access").
// Tokens are never logged.
package remote

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

// Saved is the connection the app reopens on launch.
type Saved struct {
	URL      string `json:"url"` // ws:// or wss:// …/ws
	Token    string `json:"token,omitempty"`
	DeviceID string `json:"deviceId,omitempty"`
	Persona  string `json:"persona,omitempty"`
}

// Errors the connect screen turns into words.
var (
	ErrBadCode     = errors.New("pairing code is wrong or expired")
	ErrLocked      = errors.New("too many wrong codes; wait and try again")
	ErrUnreachable = errors.New("can't reach that address")
	ErrNotDucter   = errors.New("that address isn't a Ducter")
	ErrNoCode      = errors.New("a pairing code is needed for this address")
	ErrBadAddress  = errors.New("that doesn't look like an address")
)

// Path is where the connection is kept: <config>/Ducter/connection.json.
func Path() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "Ducter", "connection.json"), nil
}

// Load reads the saved connection; nil when there is none.
func Load(path string) (*Saved, error) {
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var s Saved
	if err := json.Unmarshal(b, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

// Save writes the connection with owner-only permissions.
func Save(path string, s Saved) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	b, _ := json.MarshalIndent(s, "", "  ")
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	if err := os.Chmod(tmp, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// Clear forgets the saved connection.
func Clear(path string) error {
	err := os.Remove(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

var codeInLink = regexp.MustCompile(`(?i)[#&?]c=([A-Z0-9-]+)`)

// Parse reads what the user typed: an address ("d.example.com",
// "http://127.0.0.1:7777", "wss://…/ws") or the whole link `ducter pair`
// prints (…/pair#c=K7QM-4XPA). It returns the http(s) base and the code,
// from the link if the code field was left empty.
func Parse(address, code string) (base, outCode string, err error) {
	a := strings.TrimSpace(address)
	if m := codeInLink.FindStringSubmatch(a); m != nil {
		if strings.TrimSpace(code) == "" {
			code = m[1]
		}
		a = a[:strings.IndexAny(a, "#?")]
	}
	if a == "" {
		return "", "", ErrBadAddress
	}
	if !strings.Contains(a, "://") {
		host := a
		if i := strings.IndexByte(host, '/'); i >= 0 {
			host = host[:i]
		}
		if isLoopbackHost(hostOnly(host)) {
			a = "http://" + a
		} else {
			a = "https://" + a
		}
	}
	u, err := url.Parse(a)
	if err != nil || u.Host == "" {
		return "", "", ErrBadAddress
	}
	switch u.Scheme {
	case "ws":
		u.Scheme = "http"
	case "wss":
		u.Scheme = "https"
	case "http", "https":
	default:
		return "", "", ErrBadAddress
	}
	p := strings.TrimSuffix(u.Path, "/")
	p = strings.TrimSuffix(p, "/pair")
	p = strings.TrimSuffix(p, "/ws")
	u.Path, u.RawQuery, u.Fragment = p, "", ""
	return u.String(), NormalizeCode(code), nil
}

// NormalizeCode uppercases and drops spaces; it keeps one dash after four.
func NormalizeCode(code string) string {
	var b strings.Builder
	for _, r := range strings.ToUpper(code) {
		if (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	s := b.String()
	if len(s) == 8 {
		return s[:4] + "-" + s[4:]
	}
	return s
}

// WSURL is the client socket for an http(s) base.
func WSURL(base string) string {
	u, _ := url.Parse(base)
	if u.Scheme == "https" {
		u.Scheme = "wss"
	} else {
		u.Scheme = "ws"
	}
	u.Path = strings.TrimSuffix(u.Path, "/") + "/ws"
	return u.String()
}

func hostOnly(hostport string) string {
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		return h
	}
	return strings.Trim(hostport, "[]")
}

func isLoopbackHost(h string) bool {
	if h == "localhost" {
		return true
	}
	ip := net.ParseIP(h)
	return ip != nil && ip.IsLoopback()
}

// IsLoopback says whether a base or ws URL points at this machine (an SSH
// tunnel ends here too): Ducter lets those in without a code.
func IsLoopback(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && isLoopbackHost(u.Hostname())
}

// DeviceName is how this Mac shows up in `ducter devices`.
func DeviceName() string {
	if h, err := os.Hostname(); err == nil && h != "" {
		return strings.TrimSuffix(h, ".local")
	}
	return runtime.GOOS
}

// Pair trades a code for a device token. With a loopback base and no code
// it only checks that a Ducter answers there (no token needed).
func Pair(ctx context.Context, base, code, name string) (Saved, error) {
	hc := &http.Client{Timeout: 10 * time.Second}
	if code == "" {
		if !IsLoopback(base) {
			return Saved{}, ErrNoCode
		}
		req, _ := http.NewRequestWithContext(ctx, "GET", base+"/health", nil)
		res, err := hc.Do(req)
		if err != nil {
			return Saved{}, fmt.Errorf("%w: %v", ErrUnreachable, err)
		}
		defer res.Body.Close()
		var h struct {
			OK bool `json:"ok"`
		}
		if json.NewDecoder(res.Body).Decode(&h) != nil || !h.OK {
			return Saved{}, ErrNotDucter
		}
		return Saved{URL: WSURL(base)}, nil
	}
	body, _ := json.Marshal(map[string]string{"code": code, "name": name, "platform": runtime.GOOS})
	req, _ := http.NewRequestWithContext(ctx, "POST", base+"/pair", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	res, err := hc.Do(req)
	if err != nil {
		return Saved{}, fmt.Errorf("%w: %v", ErrUnreachable, err)
	}
	defer res.Body.Close()
	switch res.StatusCode {
	case http.StatusOK:
	case http.StatusUnauthorized:
		return Saved{}, ErrBadCode
	case http.StatusTooManyRequests:
		return Saved{}, ErrLocked
	default:
		return Saved{}, ErrNotDucter
	}
	var r struct {
		Token       string `json:"token"`
		DeviceID    string `json:"deviceId"`
		PersonaName string `json:"personaName"`
	}
	if err := json.NewDecoder(res.Body).Decode(&r); err != nil || r.Token == "" {
		return Saved{}, ErrNotDucter
	}
	return Saved{URL: WSURL(base), Token: r.Token, DeviceID: r.DeviceID, Persona: r.PersonaName}, nil
}
