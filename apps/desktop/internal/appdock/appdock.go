// Package appdock keeps a person's small apps in the Mac's Dock (D562, design/apps.md "Open like the
// rest of your apps"). Each app kept there is a tiny bundle in ~/Applications/Ducter Apps/<name>.app:
// its own icon (its mark pressed into its clay, drawn by the home), its name, and one line that opens
// ducter://app/<id> in this Ducter, which opens the app in its own window. So it is found in Spotlight
// and the Applications folder like any app, and stays in the Dock. Nothing of the app is in the bundle:
// it always opens the app as it is now, on the home.
//
// The lightest native thing that works: a shell script as the bundle's executable (no Mach-O, so no
// signature to make or break), LSUIElement so the launcher never shows a second Dock icon while it
// runs, and the Dock's own preference edited through `defaults` (export, PlistBuddy, import) the way
// the Dock reads it, then the Dock asked to read it again.
package appdock

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"html"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// Fetch gets a path from the home (the app's icon PNGs).
type Fetch func(path string) ([]byte, error)

// Dock edits the Dock's kept apps; nil keeps the bundles only (tests, shots).
type Dock interface {
	// Put adds path to the Dock, in place of old when old is in it (a rename).
	Put(path, old string) error
	// Take removes path from the Dock.
	Take(path string) error
}

// Stubs are the bundles in Dir.
type Stubs struct {
	// Dir is ~/Applications/Ducter Apps (DUCTER_APP_STUBS_DIR overrides it).
	Dir string
	// BundleID is this Ducter's, so a bundle opens this Ducter and no other build.
	BundleID string
	Fetch    Fetch
	Dock     Dock
	// Register tells LaunchServices a bundle changed (Register below); nil in tests.
	Register func(path string)
	mu       sync.Mutex
}

// Kept is one app kept in the Dock, as its bundle says.
type Kept struct {
	ID, Name, Look, Path string
}

// DefaultDir is where the bundles go: the person's own Applications folder, one folder for Ducter's.
func DefaultDir() string {
	if d := os.Getenv("DUCTER_APP_STUBS_DIR"); d != "" {
		return d
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Applications", "Ducter Apps")
}

var plistKey = regexp.MustCompile(`<key>(DucterApp[A-Za-z]+)</key>\s*<string>([^<]*)</string>`)

// List reads the bundles kept now, by app id.
func (s *Stubs) List() map[string]Kept {
	out := map[string]Kept{}
	ents, _ := os.ReadDir(s.Dir)
	for _, e := range ents {
		if !strings.HasSuffix(e.Name(), ".app") {
			continue
		}
		p := filepath.Join(s.Dir, e.Name())
		b, err := os.ReadFile(filepath.Join(p, "Contents", "Info.plist"))
		if err != nil {
			continue
		}
		k := Kept{Path: p}
		for _, m := range plistKey.FindAllSubmatch(b, -1) {
			v := html.UnescapeString(string(m[2]))
			switch string(m[1]) {
			case "DucterAppID":
				k.ID = v
			case "DucterAppName":
				k.Name = v
			case "DucterAppLook":
				k.Look = v
			}
		}
		if k.ID != "" {
			out[k.ID] = k
		}
	}
	return out
}

// look is what the bundle's icon was drawn from: a change redraws it.
func look(m protocol.AppMeta) string { return m.IconOf() + "/" + m.TintOf() }

var badName = regexp.MustCompile(`[/:\x00-\x1f]`)

// fileName is the app's name as a bundle's: what Finder, Spotlight and the Dock show.
func fileName(name string) string {
	n := strings.TrimSpace(badName.ReplaceAllString(name, "-"))
	n = strings.TrimLeft(n, ".")
	if n == "" {
		n = "App"
	}
	if r := []rune(n); len(r) > 60 {
		n = string(r[:60])
	}
	return n
}

// Keep makes (or remakes) the app's bundle and keeps it in the Dock. It gives the bundle's path.
func (s *Stubs) Keep(m protocol.AppMeta) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	old := s.List()[m.ID]
	p, err := s.write(m, old)
	if err != nil {
		return "", err
	}
	if s.Dock != nil {
		if err := s.Dock.Put(p, old.Path); err != nil {
			return p, err
		}
	}
	return p, nil
}

// Drop takes the app's bundle out of the Dock and away.
func (s *Stubs) Drop(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	k, ok := s.List()[id]
	if !ok {
		return nil
	}
	if s.Dock != nil {
		if err := s.Dock.Take(k.Path); err != nil {
			return err
		}
	}
	return os.RemoveAll(k.Path)
}

// Follow brings each kept bundle up to its app: a new name renames it (and its place in the Dock),
// a new mark or clay redraws its icon. Apps not in apps are left alone (another partner's list).
func (s *Stubs) Follow(apps []protocol.AppMeta) {
	kept := s.List()
	for _, m := range apps {
		k, ok := kept[m.ID]
		if !ok || m.Home == "" || (k.Name == m.Name && k.Look == look(m)) {
			continue
		}
		_, _ = s.Keep(m)
	}
}

// write lays out the bundle, its icon from the home first (nothing is moved until that came).
func (s *Stubs) write(m protocol.AppMeta, old Kept) (string, error) {
	if m.Home == "" || s.Fetch == nil {
		return "", errors.New("no icon from the home")
	}
	icns, err := s.icon(m.Home)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(s.Dir, 0o755); err != nil {
		return "", err
	}
	p := filepath.Join(s.Dir, fileName(m.Name)+".app")
	if p != old.Path {
		// Another app already has this name: number this one.
		for n := 2; ; n++ {
			if _, err := os.Stat(p); errors.Is(err, os.ErrNotExist) {
				break
			}
			p = filepath.Join(s.Dir, fmt.Sprintf("%s %d.app", fileName(m.Name), n))
		}
	}
	tmp := p + ".tmp"
	_ = os.RemoveAll(tmp)
	for _, d := range []string{"MacOS", "Resources"} {
		if err := os.MkdirAll(filepath.Join(tmp, "Contents", d), 0o755); err != nil {
			return "", err
		}
	}
	files := map[string][]byte{
		"Contents/Info.plist":           []byte(infoPlist(m, s.BundleID)),
		"Contents/PkgInfo":              []byte("APPL????"),
		"Contents/Resources/App.icns":   icns,
		"Contents/MacOS/open-in-ducter": []byte(script(m.ID, s.BundleID)),
	}
	for name, b := range files {
		mode := os.FileMode(0o644)
		if strings.HasPrefix(name, "Contents/MacOS/") {
			mode = 0o755
		}
		if err := os.WriteFile(filepath.Join(tmp, name), b, mode); err != nil {
			return "", err
		}
	}
	if old.Path != "" {
		_ = os.RemoveAll(old.Path)
	}
	_ = os.RemoveAll(p)
	if err := os.Rename(tmp, p); err != nil {
		return "", err
	}
	// LaunchServices and the Dock read the icon again.
	if s.Register != nil {
		s.Register(p)
	}
	return p, nil
}

// RegisterBundle has LaunchServices (and so the Dock and Spotlight) read a bundle again.
func RegisterBundle(path string) { _ = exec.Command(lsregister, "-f", path).Run() }

const lsregister = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

func xml(s string) string { return html.EscapeString(s) }

// infoPlist is the bundle's: its name, its icon, this Ducter's app id for the link, and the
// app's own id (what List reads back). LSUIElement: the launcher shows no Dock icon of its own.
func infoPlist(m protocol.AppMeta, bundleID string) string {
	id := "co.nowledge.ducter.app." + m.ID
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleName</key>
	<string>` + xml(m.Name) + `</string>
	<key>CFBundleDisplayName</key>
	<string>` + xml(m.Name) + `</string>
	<key>CFBundleIdentifier</key>
	<string>` + xml(id) + `</string>
	<key>CFBundleExecutable</key>
	<string>open-in-ducter</string>
	<key>CFBundleIconFile</key>
	<string>App</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleShortVersionString</key>
	<string>1</string>
	<key>LSUIElement</key>
	<true/>
	<key>LSApplicationCategoryType</key>
	<string>public.app-category.productivity</string>
	<key>DucterAppID</key>
	<string>` + xml(m.ID) + `</string>
	<key>DucterAppName</key>
	<string>` + xml(m.Name) + `</string>
	<key>DucterAppLook</key>
	<string>` + xml(look(m)) + `</string>
	<key>DucterBundleID</key>
	<string>` + xml(bundleID) + `</string>
</dict>
</plist>
`
}

var safeID = regexp.MustCompile(`^a[0-9a-f]{1,15}$`)

// script opens the app in this Ducter (its bundle id; Ducter opens it in its own window).
func script(id, bundleID string) string {
	if !safeID.MatchString(id) {
		id = "a0"
	}
	b := strconv.Quote(bundleID)
	return "#!/bin/sh\n# Ducter: opens this small app in Ducter (D562). Made by Ducter; removed from its 「⋯」.\nexec /usr/bin/open -b " + b + " \"ducter://app/" + id + "\"\n"
}

// The icon's sizes, as the home draws them, and each one's place in an .icns. The full square at
// each (macOS 27 masks it into its squircle at every size); no icp4/icp5, which macOS read as raw
// pixels from a PNG (research/229 §4), so 16 and 32 come from ic11 and ic12.
var icnsTypes = []struct {
	kind string
	size int
}{{"ic11", 32}, {"ic12", 64}, {"ic07", 128}, {"ic08", 256}, {"ic13", 256}, {"ic09", 512}, {"ic14", 512}, {"ic10", 1024}}

// icon gets the app's Dock icon from the home at every size and writes it as an .icns (PNG members).
func (s *Stubs) icon(home string) ([]byte, error) {
	pngs := map[int][]byte{}
	for _, t := range icnsTypes {
		if pngs[t.size] != nil {
			continue
		}
		b, err := s.Fetch(home + "icon-" + strconv.Itoa(t.size) + ".png")
		if err != nil {
			return nil, fmt.Errorf("the icon (%d): %w", t.size, err)
		}
		if !bytes.HasPrefix(b, []byte("\x89PNG")) {
			return nil, fmt.Errorf("the icon (%d) is not a picture", t.size)
		}
		pngs[t.size] = b
	}
	return ICNS(icnsTypes, pngs), nil
}

// ICNS writes an Apple icon file whose members are PNGs.
func ICNS(types []struct {
	kind string
	size int
}, pngs map[int][]byte) []byte {
	var body bytes.Buffer
	for _, t := range types {
		b := pngs[t.size]
		body.WriteString(t.kind)
		_ = binary.Write(&body, binary.BigEndian, uint32(8+len(b)))
		body.Write(b)
	}
	var out bytes.Buffer
	out.WriteString("icns")
	_ = binary.Write(&out, binary.BigEndian, uint32(8+body.Len()))
	out.Write(body.Bytes())
	return out.Bytes()
}

// FileURL is how the Dock names a kept app: a file URL ending in a slash.
func FileURL(path string) string {
	return (&url.URL{Scheme: "file", Path: strings.TrimSuffix(path, "/") + "/"}).String()
}
