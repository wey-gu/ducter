package update

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// Checker asks macOS who signed an app and whether it may run. The real one
// runs codesign, spctl and hdiutil; tests use a fake.
type Checker interface {
	// Team is the team identifier an app is signed with ("" when it is
	// signed ad hoc or not at all).
	Team(app string) (string, error)
	// Signature verifies the app and everything in it (codesign --verify
	// --deep --strict), and that the app and its helper are signed with a
	// Developer ID Application certificate of team, issued by Apple.
	Signature(app, team string) error
	// Gatekeeper is spctl's verdict: notarized, so it opens without asking.
	Gatekeeper(app string) error
	// Mount attaches a disk image read-only, out of sight, and returns where
	// it is and how to detach it.
	Mount(dmg string) (dir string, detach func(), err error)
	// Copy copies an app bundle, keeping its signature intact (ditto).
	Copy(src, dst string) error
}

// Codesign is the Checker of macOS.
type Codesign struct {
	// SkipGatekeeper accepts a build that is signed but not notarized (a
	// local test of two builds of make-app.sh without notary credentials).
	// The signature and the team are still checked.
	SkipGatekeeper bool
}

func run(timeout time.Duration, name string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	out, err := exec.CommandContext(ctx, name, args...).CombinedOutput()
	if err != nil {
		return string(out), fmt.Errorf("%s: %v: %s", filepath.Base(name), err, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

var teamRE = regexp.MustCompile(`(?m)^TeamIdentifier=(.+)$`)

func (Codesign) Team(app string) (string, error) {
	out, err := run(30*time.Second, "/usr/bin/codesign", "-dv", "--verbose=2", app)
	if err != nil {
		return "", err
	}
	m := teamRE.FindStringSubmatch(out)
	if m == nil || strings.TrimSpace(m[1]) == "not set" {
		return "", nil
	}
	return strings.TrimSpace(m[1]), nil
}

// DeveloperID is the code requirement for Ducter's own signature: a chain to
// Apple's root, the Developer ID intermediate (6.2.6), a Developer ID
// Application leaf (6.1.13), of the given team.
func DeveloperID(team string) string {
	return `anchor apple generic and certificate 1[field.1.2.840.113635.100.6.2.6] exists and ` +
		`certificate leaf[field.1.2.840.113635.100.6.1.13] exists and certificate leaf[subject.OU] = "` + team + `"`
}

func (Codesign) Signature(app, team string) error {
	if team == "" {
		return fmt.Errorf("no team to check against")
	}
	if _, err := run(2*time.Minute, "/usr/bin/codesign", "--verify", "--deep", "--strict", app); err != nil {
		return err
	}
	req := "-R=" + DeveloperID(team)
	if _, err := run(time.Minute, "/usr/bin/codesign", "--verify", "--strict", req, app); err != nil {
		return err
	}
	if helper := filepath.Join(app, "Contents", "Helpers", "ducter"); exists(helper) {
		if _, err := run(time.Minute, "/usr/bin/codesign", "--verify", "--strict", req, helper); err != nil {
			return err
		}
	}
	return nil
}

func (c Codesign) Gatekeeper(app string) error {
	if c.SkipGatekeeper {
		return nil
	}
	_, err := run(2*time.Minute, "/usr/sbin/spctl", "--assess", "--type", "execute", "-v", app)
	return err
}

func (Codesign) Mount(dmg string) (string, func(), error) {
	dir, err := os.MkdirTemp("", "ducter-update-mnt-")
	if err != nil {
		return "", nil, err
	}
	if _, err := run(2*time.Minute, "/usr/bin/hdiutil", "attach", "-nobrowse", "-readonly", "-noautoopen", "-mountpoint", dir, dmg); err != nil {
		os.Remove(dir)
		return "", nil, err
	}
	return dir, func() {
		if _, err := run(time.Minute, "/usr/bin/hdiutil", "detach", dir); err != nil {
			_, _ = run(time.Minute, "/usr/bin/hdiutil", "detach", "-force", dir)
		}
		os.Remove(dir)
	}, nil
}

func (Codesign) Copy(src, dst string) error {
	_, err := run(10*time.Minute, "/usr/bin/ditto", src, dst)
	return err
}

func exists(p string) bool {
	_, err := os.Lstat(p)
	return err == nil
}

// Info is what an app's Info.plist says about it.
type Info struct{ ID, Version string }

var (
	idRE  = regexp.MustCompile(`<key>CFBundleIdentifier</key>\s*<string>([^<]+)</string>`)
	verRE = regexp.MustCompile(`<key>CFBundleShortVersionString</key>\s*<string>([^<]+)</string>`)
)

// ReadInfo reads an app's bundle id and version (an XML Info.plist, as
// make-app.sh writes).
func ReadInfo(app string) (Info, error) {
	b, err := os.ReadFile(filepath.Join(app, "Contents", "Info.plist"))
	if err != nil {
		return Info{}, err
	}
	var in Info
	if m := idRE.FindSubmatch(b); m != nil {
		in.ID = strings.TrimSpace(string(m[1]))
	}
	if m := verRE.FindSubmatch(b); m != nil {
		in.Version = strings.TrimSpace(string(m[1]))
	}
	if in.ID == "" || in.Version == "" {
		return in, fmt.Errorf("%s has no bundle id or version", app)
	}
	return in, nil
}
