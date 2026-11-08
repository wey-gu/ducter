package local

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

// 上网 / browsing runs on cua-driver (research/23): CuaDriver.app in
// /Applications, which macOS has to allow two things, Accessibility (use
// the mouse and keyboard) and Screen Recording (see the screen). The app
// checks both by asking cua-driver itself (`permissions status --json`,
// which never prompts), so the answer is CuaDriver's own grant, not the
// app's or a terminal's.

// CuaAppBin is where cua-driver's installer puts the driver.
const CuaAppBin = "/Applications/CuaDriver.app/Contents/MacOS/cua-driver"

// CuaInstall is cua-driver's canonical installer (the one `cua-driver
// update --apply` runs), told not to wire itself into the person's other
// agents, not to run its self-test, and not to edit the shell profile.
// The same line is doctor's fix (packages/cli/src/doctor.ts).
const CuaInstall = `/bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)" -- --no-connect --no-test --no-modify-path`

// CuaUpdate updates an old driver in place (keeps its grants: same team ID).
const CuaUpdate = "cua-driver update --apply"

// CuaGrant opens cua-driver's own guide through the two switches.
const CuaGrant = "permissions grant"

// cuaTools are the typed browser tools (cua-driver-rs 2026-07 and later).
var cuaTools = []string{"browser_prepare", "get_browser_state", "browser_navigate"}

// CuaState is what 上网 needs on this Mac, and what it has.
type CuaState struct {
	Bin     string // "" = not installed
	Version string
	// Old: installed, but without the browser tools.
	Old bool
	// The two macOS switches, as CuaDriver itself sees them. Checked is
	// false when the status couldn't be read (an older driver).
	Accessibility, ScreenRecording, Checked bool
}

// Installed reports whether a driver is there.
func (s CuaState) Installed() bool { return s.Bin != "" }

// Ready reports whether 上网 has everything it needs.
func (s CuaState) Ready() bool {
	return s.Installed() && !s.Old && s.Accessibility && s.ScreenRecording
}

// CuaBin finds cua-driver: $DUCTER_CUA_DRIVER (as core and the runner
// honor it), PATH, then /Applications.
func CuaBin() string {
	if b := os.Getenv("DUCTER_CUA_DRIVER"); b != "" {
		if _, err := os.Stat(b); err == nil {
			return b
		}
		return ""
	}
	if b, err := exec.LookPath("cua-driver"); err == nil {
		return b
	}
	if _, err := os.Stat(CuaAppBin); err == nil {
		return CuaAppBin
	}
	return ""
}

var versionRE = regexp.MustCompile(`\d+\.\d+(\.\d+)?`)

// ProbeCua looks at the driver: is it there, new enough, and allowed.
func ProbeCua(withTools bool) CuaState {
	s := CuaState{Bin: CuaBin()}
	if s.Bin == "" {
		return s
	}
	run := func(args ...string) (string, bool) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		out, err := exec.CommandContext(ctx, s.Bin, args...).Output()
		return string(out), err == nil
	}
	if v, ok := run("--version"); ok {
		s.Version = versionRE.FindString(v)
	} else {
		s.Old = true
		return s
	}
	if withTools {
		tools, _ := run("list-tools")
		have := map[string]bool{}
		for _, l := range strings.Split(tools, "\n") {
			name, _, _ := strings.Cut(l, ":")
			have[strings.TrimSpace(name)] = true
		}
		for _, t := range cuaTools {
			if !have[t] {
				s.Old = true
			}
		}
	}
	if out, ok := run("permissions", "status", "--json"); ok {
		var p struct {
			Accessibility   *bool `json:"accessibility"`
			ScreenRecording *bool `json:"screen_recording"`
		}
		if json.Unmarshal([]byte(out), &p) == nil && p.Accessibility != nil && p.ScreenRecording != nil {
			s.Accessibility, s.ScreenRecording, s.Checked = *p.Accessibility, *p.ScreenRecording, true
		}
	}
	return s
}
