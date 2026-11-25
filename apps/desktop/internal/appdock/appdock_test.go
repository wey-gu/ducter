package appdock

import (
	"bytes"
	"encoding/binary"
	"errors"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// A PNG's first bytes, at a size: enough for the .icns writer.
func fakePNG(size string) []byte { return append([]byte("\x89PNG\r\n\x1a\n"), size...) }

func stubs(t *testing.T, dock Dock) (*Stubs, *[]string) {
	var asked []string
	return &Stubs{
		Dir:      filepath.Join(t.TempDir(), "Ducter Apps"),
		BundleID: "co.nowledge.ducter",
		Dock:     dock,
		Fetch: func(p string) ([]byte, error) {
			asked = append(asked, p)
			if strings.Contains(p, "/gone/") {
				return nil, errors.New("404")
			}
			return fakePNG(filepath.Base(p)), nil
		},
	}, &asked
}

var trip = protocol.AppMeta{ID: "a1b2c3", Name: "北京出差 11/20–21", Icon: "suitcase", Home: "/app-icon/a1b2c3/k/"}

// D562: an app kept in the Dock is a bundle named for it, with its icon from the home at every
// size, opening ducter://app/<id> in this Ducter; List reads it back by id.
func TestKeepWritesABundleThatOpensTheApp(t *testing.T) {
	s, asked := stubs(t, nil)
	p, err := s.Keep(trip)
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(p) != "北京出差 11-20–21.app" {
		t.Errorf("named %q", filepath.Base(p))
	}
	sh, _ := os.ReadFile(filepath.Join(p, "Contents", "MacOS", "open-in-ducter"))
	if !strings.Contains(string(sh), `/usr/bin/open -b "co.nowledge.ducter" "ducter://app/a1b2c3"`) {
		t.Errorf("script %q", sh)
	}
	if fi, _ := os.Stat(filepath.Join(p, "Contents", "MacOS", "open-in-ducter")); fi == nil || fi.Mode()&0o111 == 0 {
		t.Error("the script can't run")
	}
	info, _ := os.ReadFile(filepath.Join(p, "Contents", "Info.plist"))
	for _, want := range []string{"<key>LSUIElement</key>", "<string>open-in-ducter</string>", "<string>北京出差 11/20–21</string>"} {
		if !bytes.Contains(info, []byte(want)) {
			t.Errorf("Info.plist has no %s", want)
		}
	}
	icns, _ := os.ReadFile(filepath.Join(p, "Contents", "Resources", "App.icns"))
	if string(icns[:4]) != "icns" || int(binary.BigEndian.Uint32(icns[4:8])) != len(icns) || !bytes.Contains(icns, []byte("ic10")) {
		t.Errorf("icns %q", icns[:16])
	}
	if len(*asked) != 7 || (*asked)[0] != "/app-icon/a1b2c3/k/mac-16.png" {
		t.Errorf("fetched %v", *asked)
	}
	got := s.List()["a1b2c3"]
	if got.Name != trip.Name || got.Path != p || got.Look != "suitcase/"+trip.TintOf() {
		t.Errorf("listed %+v", got)
	}
	if runtime.GOOS == "darwin" {
		if out, err := exec.Command("/usr/bin/plutil", "-lint", filepath.Join(p, "Contents", "Info.plist")).CombinedOutput(); err != nil {
			t.Errorf("plutil: %s", out)
		}
	}
}

// A rename moves the bundle (and its Dock place); a new mark redraws it; Drop removes it; nothing
// moves when the home's icon can't be had.
func TestFollowRenamesAndDropRemoves(t *testing.T) {
	s, _ := stubs(t, nil)
	p, _ := s.Keep(trip)
	m := trip
	m.Name = "北京出差"
	s.Follow([]protocol.AppMeta{m, {ID: "aother", Name: "x", Home: "/h/"}})
	k := s.List()["a1b2c3"]
	if filepath.Base(k.Path) != "北京出差.app" || k.Name != "北京出差" {
		t.Errorf("after rename %+v", k)
	}
	if _, err := os.Stat(p); !errors.Is(err, os.ErrNotExist) {
		t.Error("the old bundle stayed")
	}
	if _, ok := s.List()["aother"]; ok {
		t.Error("an app never kept was kept")
	}
	gone := m
	gone.Home = "/gone/"
	gone.Name = "别的名字"
	if _, err := s.Keep(gone); err == nil {
		t.Error("kept with no icon")
	}
	if s.List()["a1b2c3"].Name != "北京出差" {
		t.Error("a failed keep moved the bundle")
	}
	if err := s.Drop("a1b2c3"); err != nil || len(s.List()) != 0 {
		t.Errorf("drop: %v %v", err, s.List())
	}
}

// The Dock's own preference, edited on a copy with the real PlistBuddy: added after the apps there,
// a rename takes the old place, Take removes it; the person's own apps stay.
func TestMacDockEditsPersistentApps(t *testing.T) {
	if _, err := os.Stat(buddy); err != nil {
		t.Skip("no PlistBuddy here")
	}
	file := filepath.Join(t.TempDir(), "dock.plist")
	if err := os.WriteFile(file, []byte(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>persistent-apps</key><array>
<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>file:///System/Applications/Mail.app/</string><key>_CFURLStringType</key><integer>15</integer></dict></dict><key>tile-type</key><string>file-tile</string></dict>
</array></dict></plist>`), 0o644); err != nil {
		t.Fatal(err)
	}
	d := &MacDock{Plist: file}
	dir := t.TempDir()
	a, b := filepath.Join(dir, "Ducter Apps", "北京出差.app"), filepath.Join(dir, "Ducter Apps", "北京出差 11-20.app")
	if err := d.Put(a, ""); err != nil {
		t.Fatal(err)
	}
	if err := d.Put(a, ""); err != nil {
		t.Fatal(err)
	}
	if u := d.urls(file); len(u) != 2 || u[0] != "file:///System/Applications/Mail.app/" || u[1] != FileURL(a) {
		t.Fatalf("after put %v", u)
	}
	if err := d.Put(b, a); err != nil {
		t.Fatal(err)
	}
	if u := d.urls(file); len(u) != 2 || u[1] != FileURL(b) {
		t.Fatalf("after rename %v", u)
	}
	if !strings.Contains(FileURL(b), "Ducter%20Apps") {
		t.Errorf("url %s", FileURL(b))
	}
	if err := d.Take(b); err != nil {
		t.Fatal(err)
	}
	if u := d.urls(file); len(u) != 1 {
		t.Fatalf("after take %v", u)
	}
}

// The bundles as a real home draws them, for the shots (D562); never the person's Dock:
//
//	DUCTER_DOCK_SHOT_HOME=http://127.0.0.1:<port> DUCTER_DOCK_SHOT_APPS='<id>=/app-icon/<id>/<key>/=<name>;…' \
//	DUCTER_DOCK_SHOT_DIR=<dir> go test ./internal/appdock -run DockShots
func TestDockShots(t *testing.T) {
	home := os.Getenv("DUCTER_DOCK_SHOT_HOME")
	if home == "" {
		t.Skip("DUCTER_DOCK_SHOT_HOME to write the bundles")
	}
	s := &Stubs{Dir: os.Getenv("DUCTER_DOCK_SHOT_DIR"), BundleID: "co.nowledge.ducter.shots", Fetch: func(p string) ([]byte, error) {
		res, err := http.Get(home + p)
		if err != nil {
			return nil, err
		}
		defer res.Body.Close()
		return io.ReadAll(res.Body)
	}}
	for _, one := range strings.Split(os.Getenv("DUCTER_DOCK_SHOT_APPS"), ";") {
		f := strings.SplitN(one, "=", 3)
		if len(f) != 3 {
			continue
		}
		if _, err := s.Keep(protocol.AppMeta{ID: f[0], Home: f[1], Name: f[2]}); err != nil {
			t.Fatal(err)
		}
	}
}
