package appdock

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
)

// Run runs a command and gives its output (exec, or a test's).
type Run func(name string, args ...string) (string, error)

func run(name string, args ...string) (string, error) {
	out, err := exec.Command(name, args...).CombinedOutput()
	return string(out), err
}

// MacDock keeps apps in the Dock the way the Dock itself does: its preference (com.apple.dock's
// persistent-apps) is exported through `defaults`, edited with PlistBuddy, imported back through
// `defaults` (so the preferences daemon has it, never a stale file), and the Dock asked to read it.
type MacDock struct {
	Run Run
	// Plist, when set, is a plist file edited in place of the person's Dock (tests): no export,
	// import or Dock restart.
	Plist string
}

const buddy = "/usr/libexec/PlistBuddy"

func (d *MacDock) run(name string, args ...string) (string, error) {
	if d.Run != nil {
		return d.Run(name, args...)
	}
	return run(name, args...)
}

// edit runs fn on the Dock's preference as a file, then puts it back and restarts the Dock.
func (d *MacDock) edit(fn func(file string) (changed bool, err error)) error {
	if d.Plist != "" {
		_, err := fn(d.Plist)
		return err
	}
	dir, err := os.MkdirTemp("", "ducter-dock-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(dir)
	file := filepath.Join(dir, "dock.plist")
	if out, err := d.run("/usr/bin/defaults", "export", "com.apple.dock", file); err != nil {
		return fmt.Errorf("reading the Dock: %v %s", err, strings.TrimSpace(out))
	}
	changed, err := fn(file)
	if err != nil || !changed {
		return err
	}
	if out, err := d.run("/usr/bin/defaults", "import", "com.apple.dock", file); err != nil {
		return fmt.Errorf("writing the Dock: %v %s", err, strings.TrimSpace(out))
	}
	_, _ = d.run("/usr/bin/killall", "Dock")
	return nil
}

// urls lists persistent-apps' file URLs, in order.
func (d *MacDock) urls(file string) []string {
	var out []string
	for i := 0; i < 500; i++ {
		v, err := d.run(buddy, "-c", "Print :persistent-apps:"+strconv.Itoa(i)+":tile-data:file-data:_CFURLString", file)
		if err != nil {
			if _, e := d.run(buddy, "-c", "Print :persistent-apps:"+strconv.Itoa(i), file); e != nil {
				break
			}
		}
		out = append(out, strings.TrimSpace(v))
	}
	return out
}

func (d *MacDock) index(file, path string) int {
	want := FileURL(path)
	for i, u := range d.urls(file) {
		if u == want {
			return i
		}
	}
	return -1
}

// Put keeps path in the Dock (after its apps), or in old's place when old is there.
func (d *MacDock) Put(path, old string) error {
	return d.edit(func(file string) (bool, error) {
		if d.index(file, path) >= 0 && (old == "" || old == path) {
			return false, nil
		}
		at := -1
		if old != "" && old != path {
			at = d.index(file, old)
		}
		if at >= 0 {
			// The renamed app takes its old place.
			if out, err := d.run(buddy, "-c", fmt.Sprintf("Set :persistent-apps:%d:tile-data:file-data:_CFURLString %s", at, plistWord(FileURL(path))), "-c", fmt.Sprintf("Set :persistent-apps:%d:tile-data:file-label %s", at, plistWord(label(path))), file); err != nil {
				return false, fmt.Errorf("%v %s", err, strings.TrimSpace(out))
			}
			return true, nil
		}
		if _, err := d.run(buddy, "-c", "Print :persistent-apps", file); err != nil {
			if out, err := d.run(buddy, "-c", "Add :persistent-apps array", file); err != nil {
				return false, fmt.Errorf("%v %s", err, strings.TrimSpace(out))
			}
		}
		n := len(d.urls(file))
		k := fmt.Sprintf(":persistent-apps:%d", n)
		out, err := d.run(buddy,
			"-c", "Add "+k+" dict",
			"-c", "Add "+k+":tile-type string file-tile",
			"-c", "Add "+k+":tile-data dict",
			"-c", "Add "+k+":tile-data:file-label string "+plistWord(label(path)),
			"-c", "Add "+k+":tile-data:file-type integer 41",
			"-c", "Add "+k+":tile-data:file-data dict",
			"-c", "Add "+k+":tile-data:file-data:_CFURLString string "+plistWord(FileURL(path)),
			"-c", "Add "+k+":tile-data:file-data:_CFURLStringType integer 15",
			file)
		if err != nil {
			return false, fmt.Errorf("%v %s", err, strings.TrimSpace(out))
		}
		return true, nil
	})
}

// Take removes path from the Dock.
func (d *MacDock) Take(path string) error {
	return d.edit(func(file string) (bool, error) {
		i := d.index(file, path)
		if i < 0 {
			return false, nil
		}
		out, err := d.run(buddy, "-c", fmt.Sprintf("Delete :persistent-apps:%d", i), file)
		if err != nil {
			return false, fmt.Errorf("%v %s", err, strings.TrimSpace(out))
		}
		return true, nil
	})
}

func label(path string) string { return strings.TrimSuffix(filepath.Base(path), ".app") }

// plistWord quotes a value for a PlistBuddy command (its own quoting: double quotes, backslashes).
func plistWord(s string) string {
	return `"` + strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(s) + `"`
}
