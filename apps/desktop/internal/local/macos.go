package local

import (
	"os/exec"
	"strings"
)

// System Settings panes, by their x-apple.systempreferences links. Each
// was opened on macOS 15.7 and landed on the pane named beside it
// (docs/design/onboarding.md, "macOS asks").
const (
	// Privacy & Security › Accessibility (辅助功能).
	SettingsAccessibility = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
	// Privacy & Security › Screen & System Audio Recording (录屏与系统录音).
	SettingsScreenRecording = "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
	// General › Login Items & Extensions (登录项与扩展): Allow in the Background.
	SettingsLoginItems = "x-apple.systempreferences:com.apple.LoginItems-Settings.extension"
	// Notifications (通知), at the app's own row when id is given.
	SettingsNotifications = "x-apple.systempreferences:com.apple.Notifications-Settings.extension"
)

// NotificationsFor is the Notifications pane at one app's row.
func NotificationsFor(bundleID string) string {
	if bundleID == "" {
		return SettingsNotifications
	}
	return SettingsNotifications + "?id=" + bundleID
}

// OpenSettings opens a System Settings pane.
func OpenSettings(link string) error {
	if !strings.HasPrefix(link, "x-apple.systempreferences:") {
		return exec.ErrNotFound
	}
	return exec.Command("/usr/bin/open", link).Run()
}

// BackgroundStatus is whether macOS lets the LaunchAgent run.
type BackgroundStatus int

const (
	BackgroundUnknown       BackgroundStatus = iota // couldn't ask (older macOS)
	BackgroundNotRegistered                         // macOS hasn't seen it yet
	BackgroundAllowed                               // Allow in the Background: on
	BackgroundNeedsApproval                         // the person turned it off in Login Items
	BackgroundNotFound                              // no such plist
)

// AgentBackground is what macOS says about the Agent's plist.
func (a *Agent) AgentBackground() BackgroundStatus {
	if a == nil {
		return BackgroundUnknown
	}
	return backgroundStatus(a.PlistPath())
}
