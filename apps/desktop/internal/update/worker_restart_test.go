package update

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// D167: after a swap, the app's background LaunchAgent and this Mac's worker
// LaunchAgent (D155) are both restarted on the new helper; a worker that
// isn't set up (no plist) is left alone. launchctl is a fake that records
// its arguments.
func TestSwapRestartsTheWorkerToo(t *testing.T) {
	root := t.TempDir()
	target := writeApp(t, filepath.Join(root, "apps"), "x", "1.0.0", "T")
	prev := filepath.Join(root, "prev", "Ducter.app")
	os.MkdirAll(filepath.Dir(prev), 0o755)
	agents := filepath.Join(root, "LaunchAgents")
	os.MkdirAll(agents, 0o755)
	plist := filepath.Join(agents, "co.x.agent.plist")
	wplist := filepath.Join(agents, "co.x.worker.plist")
	os.WriteFile(plist, nil, 0o644)
	os.WriteFile(wplist, nil, 0o644)
	calls := filepath.Join(root, "calls")
	fake := filepath.Join(root, "launchctl")
	os.WriteFile(fake, []byte("#!/bin/sh\necho \"$@\" >>'"+calls+"'\n"), 0o755)
	swap := func(next string) []string {
		os.Remove(calls)
		result := filepath.Join(root, "result")
		os.Remove(result)
		os.RemoveAll(prev)
		cmd := exec.Command("/bin/sh", "-c", swapScript, "t", "999999", target, next, prev, "co.x.agent", plist, "0", result, "update", "co.x.worker", wplist)
		cmd.Env = append(os.Environ(), "DUCTER_LAUNCHCTL="+fake)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("%v %s", err, out)
		}
		if r := waitFor(t, result); r != "update: installed" {
			t.Fatalf("result %q", r)
		}
		b, _ := os.ReadFile(calls)
		return strings.Split(strings.TrimSpace(string(b)), "\n")
	}
	uid := fmt.Sprint(os.Getuid())
	got := swap(writeApp(t, filepath.Join(root, "stage1"), "x", "1.1.0", "T"))
	want := []string{"kickstart -k gui/" + uid + "/co.x.agent", "kickstart -k gui/" + uid + "/co.x.worker"}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("launchctl calls %q, want %q", got, want)
	}
	if version(t, target) != "1.1.0" {
		t.Fatal("the new version is in place")
	}
	// This Mac isn't a worker (no plist): only the app's own agent.
	os.Remove(wplist)
	if got := swap(writeApp(t, filepath.Join(root, "stage2"), "x", "1.2.0", "T")); len(got) != 1 || !strings.HasSuffix(got[0], "/co.x.agent") {
		t.Fatalf("launchctl calls %q", got)
	}
}
