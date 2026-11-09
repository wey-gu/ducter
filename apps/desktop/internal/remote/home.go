package remote

// The command line follows the app (D147): when the app connects to a
// Ducter elsewhere, it pairs a separate device for `ducter` on this Mac
// ("CLI on <Mac>", revocable on its own) and writes <dataDir>/home.json
// (0600), which every home command (status, say, task, …) reads. Back on
// this Mac's own Ducter, the file goes and the CLI follows back.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/net/websocket"
)

// Home is <dataDir>/home.json, the Ducter the command line follows. The
// CLI reads it (packages/cli/src/home.ts); keep the fields in step.
type Home struct {
	Address  string `json:"address"` // the http(s) base
	Token    string `json:"token,omitempty"`
	Name     string `json:"name"` // what `ducter` prints as its target: the host
	Since    string `json:"since"`
	DeviceID string `json:"deviceId,omitempty"`
	By       string `json:"by,omitempty"` // "app"
}

// HomeFile is where the command line looks.
func HomeFile(dataDir string) string { return filepath.Join(dataDir, "home.json") }

// LoadHome reads home.json; nil when there is none (or it can't be read).
func LoadHome(dataDir string) *Home {
	b, err := os.ReadFile(HomeFile(dataDir))
	if err != nil {
		return nil
	}
	var h Home
	if json.Unmarshal(b, &h) != nil || h.Address == "" {
		return nil
	}
	return &h
}

// SaveHome writes home.json whole, owner-only.
func SaveHome(dataDir string, h Home) error {
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return err
	}
	b, _ := json.MarshalIndent(h, "", "  ")
	p := HomeFile(dataDir)
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, append(b, '\n'), 0o600); err != nil {
		return err
	}
	if err := os.Chmod(tmp, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}

// ClearHome removes home.json: the command line uses this Mac's Ducter.
func ClearHome(dataDir string) error {
	err := os.Remove(HomeFile(dataDir))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

// CLIDeviceName is how the command line shows up in `ducter devices`.
func CLIDeviceName(mac string) string { return "CLI on " + mac }

func hostOf(base string) string {
	if u, err := url.Parse(base); err == nil && u.Host != "" {
		return u.Host
	}
	return base
}

// dialFunc opens the client socket as the app (with its token).
func dial(ctx context.Context, base, token string) (*websocket.Conn, error) {
	u, err := url.Parse(base)
	if err != nil {
		return nil, err
	}
	origin := "http://" + u.Host
	if u.Scheme == "https" {
		origin = "https://" + u.Host
	}
	cfg, err := websocket.NewConfig(WSURL(base), origin)
	if err != nil {
		return nil, err
	}
	if token != "" {
		cfg.Header.Set("Authorization", "Bearer "+token)
	}
	return cfg.DialContext(ctx)
}

// IssueCode asks the Ducter at base for a fresh one-time code over the
// client socket, as the paired app (the pair_code frame; D54, D83).
func IssueCode(ctx context.Context, base, token string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	conn, err := dial(ctx, base, token)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrUnreachable, err)
	}
	defer conn.Close()
	stop := context.AfterFunc(ctx, func() { conn.Close() })
	defer stop()
	if err := websocket.JSON.Send(conn, map[string]string{"t": "hello", "client": "cli"}); err != nil {
		return "", err
	}
	if err := websocket.JSON.Send(conn, map[string]string{"t": "pair_code"}); err != nil {
		return "", err
	}
	for {
		var msg string
		if err := websocket.Message.Receive(conn, &msg); err != nil {
			return "", fmt.Errorf("no code from %s: %v", hostOf(base), err)
		}
		var f struct {
			T       string `json:"t"`
			Code    string `json:"code"`
			Message string `json:"message"`
		}
		if json.Unmarshal([]byte(msg), &f) != nil {
			continue
		}
		switch f.T {
		case "pair_code":
			if f.Code == "" {
				return "", ErrNotDucter
			}
			return f.Code, nil
		case "error": // an older Ducter, or one without devices
			return "", fmt.Errorf("%w: %s", ErrNotDucter, f.Message)
		}
	}
}

// BaseOf is the http(s) base of a client socket URL (wss://h/ws → https://h).
func BaseOf(wsURL string) string {
	u, err := url.Parse(wsURL)
	if err != nil {
		return wsURL
	}
	switch u.Scheme {
	case "wss":
		u.Scheme = "https"
	case "ws":
		u.Scheme = "http"
	}
	u.Path = strings.TrimSuffix(strings.TrimSuffix(u.Path, "/"), "/ws")
	u.RawQuery, u.Fragment = "", ""
	return u.String()
}

// AppConnected is the app's hook after it connects somewhere (a pairing,
// or a launch on a saved connection): this Mac's own Ducter (localURL)
// clears home.json; a loopback tunnel needs no token, so home.json only
// names it; a Ducter elsewhere gets the CLI's own device (FollowHome).
// At launch (relaunch: true) a home.json the user wrote with `ducter
// connect` stays: only connecting in the app moves the command line.
func AppConnected(ctx context.Context, dataDir string, s Saved, localURL, mac string, now time.Time, relaunch bool) error {
	if h := LoadHome(dataDir); relaunch && h != nil && h.By != "app" {
		return nil
	}
	if s.URL == "" || s.URL == localURL {
		return ClearHome(dataDir)
	}
	base := BaseOf(s.URL)
	if s.Token == "" {
		if IsLoopback(base) {
			return SaveHome(dataDir, Home{Address: base, Name: hostOf(base), Since: now.UTC().Format(time.RFC3339), By: "app"})
		}
		return nil // nothing to pair with; the CLI keeps what it had
	}
	return FollowHome(ctx, dataDir, base, s.Token, mac, now)
}

// works says whether a token still opens the client socket there.
func works(ctx context.Context, base, token string) bool {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	conn, err := dial(ctx, base, token)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// FollowHome makes the command line on this Mac follow the Ducter the app
// just connected to: a code from it (over the app's own authenticated
// socket), redeemed as its own device "CLI on <mac>", saved in home.json.
// A home.json for the same address whose token still works is kept (no
// second device on every launch). When the CLI can't be paired, home.json
// still names the address without a token, so `ducter` says how to connect
// instead of quietly showing this Mac's Ducter.
func FollowHome(ctx context.Context, dataDir, base, appToken, mac string, now time.Time) error {
	if h := LoadHome(dataDir); h != nil && strings.EqualFold(h.Address, base) && h.Token != "" && works(ctx, base, h.Token) {
		return nil
	}
	home := Home{Address: base, Name: hostOf(base), Since: now.UTC().Format(time.RFC3339), By: "app"}
	code, err := IssueCode(ctx, base, appToken)
	if err == nil {
		var s Saved
		s, err = Pair(ctx, base, code, CLIDeviceName(mac))
		if err == nil {
			home.Token, home.DeviceID = s.Token, s.DeviceID
		}
	}
	if serr := SaveHome(dataDir, home); serr != nil {
		return serr
	}
	return err
}
