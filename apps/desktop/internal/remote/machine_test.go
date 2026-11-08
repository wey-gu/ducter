package remote

import (
	"os/exec"
	"runtime"
	"strings"
	"testing"
)

// The same string core computes (packages/core/test/machine.test.ts pins it too).
func TestMachineHashMatchesCore(t *testing.T) {
	if got := MachineHash("abc"); got != "e9b710b3ae0609667ede5b3d95376ba1" {
		t.Fatalf("MachineHash(abc) = %s", got)
	}
	if MachineHash("") != "" {
		t.Fatal("no id must give no hash")
	}
}

// On a Mac with bun, the real core and this client agree on this machine.
func TestThisMachineAgreesWithCore(t *testing.T) {
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		t.Skip("no machine id here")
	}
	bun, err := exec.LookPath("bun")
	if err != nil {
		t.Skip("bun not installed")
	}
	cmd := exec.Command(bun, "-e", `import {machineId} from "../../../../packages/core/src/machine.ts"; console.log(machineId() ?? "")`)
	out, err := cmd.Output()
	if err != nil {
		t.Skipf("bun: %v", err)
	}
	if core, here := strings.TrimSpace(string(out)), ThisMachine(); core == "" || core != here {
		t.Fatalf("core %q, desktop %q", core, here)
	}
}

func TestSameMachine(t *testing.T) {
	for _, c := range []struct {
		server, here, url string
		want              bool
	}{
		{"a", "a", "wss://d.example.com/ws", true},
		{"a", "b", "ws://127.0.0.1:7777/ws", false},
		{"", "a", "ws://127.0.0.1:7777/ws", true},
		{"a", "", "wss://d.example.com/ws", false},
	} {
		if got := SameMachine(c.server, c.here, c.url); got != c.want {
			t.Errorf("%+v: %v", c, got)
		}
	}
}
