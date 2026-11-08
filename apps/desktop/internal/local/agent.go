package local

import (
	"bytes"
	"encoding/xml"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Agent is Ducter running as a per-user LaunchAgent (the keep-running decision): it keeps
// working when the window closes or the app quits, comes back at login,
// and is restarted if it crashes. The app writes the plist and loads it on
// first run; "Stop Ducter" in the app menu unloads it and removes the
// plist, so it stays off until the app is opened again.
type Agent struct {
	Label    string // e.g. co.nowledge.ducter.agent
	BundleID string // the app's, so Login Items shows "Ducter" with its icon
	CLI      string
	DataDir  string
	// Dir is ~/Library/LaunchAgents (a test sets its own).
	Dir string
	// Launchctl runs launchctl; nil runs /bin/launchctl.
	Launchctl func(args ...string) (string, error)
}

// AgentLabel is the LaunchAgent's label for an app's bundle id.
func AgentLabel(bundleID string) string { return bundleID + ".agent" }

// LaunchAgentsDir is ~/Library/LaunchAgents.
func LaunchAgentsDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Library", "LaunchAgents")
}

// PlistPath is where the agent's plist lives.
func (a *Agent) PlistPath() string { return filepath.Join(a.Dir, a.Label+".plist") }

func (a *Agent) launchctl(args ...string) (string, error) {
	if a.Launchctl != nil {
		return a.Launchctl(args...)
	}
	out, err := exec.Command("/bin/launchctl", args...).CombinedOutput()
	return string(out), err
}

func (a *Agent) domain() string  { return "gui/" + strconv.Itoa(os.Getuid()) }
func (a *Agent) service() string { return a.domain() + "/" + a.Label }

// Plist is the agent's launchd property list: `ducter up --no-desktop`
// with the app's environment, logs in the data folder, restarted only
// when it didn't exit cleanly.
func (a *Agent) Plist(env map[string]string) []byte {
	var b bytes.Buffer
	esc := func(s string) string {
		var e bytes.Buffer
		_ = xml.EscapeText(&e, []byte(s))
		return e.String()
	}
	str := func(k, v string) { fmt.Fprintf(&b, "\t<key>%s</key>\n\t<string>%s</string>\n", esc(k), esc(v)) }
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
`)
	str("Label", a.Label)
	if a.BundleID != "" {
		fmt.Fprintf(&b, "\t<key>AssociatedBundleIdentifiers</key>\n\t<array>\n\t\t<string>%s</string>\n\t</array>\n", esc(a.BundleID))
	}
	fmt.Fprintf(&b, "\t<key>ProgramArguments</key>\n\t<array>\n\t\t<string>%s</string>\n\t\t<string>up</string>\n\t\t<string>--no-desktop</string>\n\t</array>\n", esc(a.CLI))
	str("WorkingDirectory", a.DataDir)
	log := filepath.Join(a.DataDir, "app.log")
	str("StandardOutPath", log)
	str("StandardErrorPath", log)
	b.WriteString("\t<key>RunAtLoad</key>\n\t<true/>\n")
	b.WriteString("\t<key>KeepAlive</key>\n\t<dict>\n\t\t<key>SuccessfulExit</key>\n\t\t<false/>\n\t</dict>\n")
	b.WriteString("\t<key>ThrottleInterval</key>\n\t<integer>10</integer>\n")
	b.WriteString("\t<key>ProcessType</key>\n\t<string>Interactive</string>\n")
	keys := make([]string, 0, len(env))
	for k := range env {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	b.WriteString("\t<key>EnvironmentVariables</key>\n\t<dict>\n")
	for _, k := range keys {
		fmt.Fprintf(&b, "\t\t<key>%s</key>\n\t\t<string>%s</string>\n", esc(k), esc(env[k]))
	}
	b.WriteString("\t</dict>\n</dict>\n</plist>\n")
	return b.Bytes()
}

// Installed reports whether the plist is there (Ducter is meant to run).
func (a *Agent) Installed() bool {
	_, err := os.Stat(a.PlistPath())
	return err == nil
}

// Loaded reports whether launchd knows the agent.
func (a *Agent) Loaded() bool {
	_, err := a.launchctl("print", a.service())
	return err == nil
}

// Install writes the plist and makes sure launchd runs it: loaded fresh,
// reloaded when the plist changed (the app moved, the env changed), or
// just started when it was loaded and idle.
func (a *Agent) Install(env map[string]string) error {
	if err := os.MkdirAll(a.Dir, 0o755); err != nil {
		return err
	}
	if err := os.MkdirAll(a.DataDir, 0o755); err != nil {
		return err
	}
	want := a.Plist(env)
	have, _ := os.ReadFile(a.PlistPath())
	changed := !bytes.Equal(have, want)
	if changed {
		tmp := a.PlistPath() + ".tmp"
		if err := os.WriteFile(tmp, want, 0o644); err != nil {
			return err
		}
		if err := os.Rename(tmp, a.PlistPath()); err != nil {
			return err
		}
	}
	if a.Loaded() {
		if !changed {
			_, err := a.launchctl("kickstart", a.service())
			return err
		}
		_, _ = a.launchctl("bootout", a.service())
	}
	if out, err := a.launchctl("bootstrap", a.domain(), a.PlistPath()); err != nil {
		return fmt.Errorf("launchctl bootstrap: %v %s", err, strings.TrimSpace(out))
	}
	return nil
}

// Remove stops Ducter and takes the plist away: it stays off, at login
// too, until the app installs it again.
func (a *Agent) Remove() error {
	var first error
	if a.Loaded() {
		if out, err := a.launchctl("bootout", a.service()); err != nil {
			first = fmt.Errorf("launchctl bootout: %v %s", err, strings.TrimSpace(out))
		}
	}
	if err := os.Remove(a.PlistPath()); err != nil && !os.IsNotExist(err) && first == nil {
		first = err
	}
	return first
}

var bundleIDRE = regexp.MustCompile(`<key>CFBundleIdentifier</key>\s*<string>([^<]+)</string>`)

// BundleID reads CFBundleIdentifier from an app's Info.plist ("" if none).
func BundleID(app string) string {
	b, err := os.ReadFile(filepath.Join(app, "Contents", "Info.plist"))
	if err != nil {
		return ""
	}
	if m := bundleIDRE.FindSubmatch(b); m != nil {
		return strings.TrimSpace(string(m[1]))
	}
	return ""
}

// AgentEnv is the environment the agent runs with: the PATH a Terminal
// has (launchd gives agents the system folders only), HOME, and every
// DUCTER_* the app has (port, data folder, models, a dev.env).
func AgentEnv(port int, dataDir, locale string) map[string]string {
	env := map[string]string{
		"PATH":            os.Getenv("PATH"),
		"DUCTER_PORT":     strconv.Itoa(port),
		"DUCTER_DATA_DIR": dataDir,
		"NO_COLOR":        "1",
	}
	if h, err := os.UserHomeDir(); err == nil {
		env["HOME"] = h
	}
	for _, kv := range os.Environ() {
		k, v, _ := strings.Cut(kv, "=")
		if strings.HasPrefix(k, "DUCTER_") && k != "DUCTER_PARENT_PID" && k != "DUCTER_URL" && k != "DUCTER_TOKEN" {
			env[k] = v
		}
	}
	env["DUCTER_PORT"], env["DUCTER_DATA_DIR"] = strconv.Itoa(port), dataDir
	if _, ok := env["DUCTER_LOCALE"]; !ok && locale != "" {
		env["DUCTER_LOCALE"] = locale
	}
	return env
}
