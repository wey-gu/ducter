package remote

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strings"
	"sync"
)

// MachineHash is how core names the machine it runs on in its welcome
// (packages/core/src/machine.ts): sha256("ducter-machine:" + id), first 32
// hex. "" when there is no id.
func MachineHash(raw string) string {
	if raw == "" {
		return ""
	}
	sum := sha256.Sum256([]byte("ducter-machine:" + raw))
	return hex.EncodeToString(sum[:])[:32]
}

var platformUUID = regexp.MustCompile(`"IOPlatformUUID"\s*=\s*"([^"]+)"`)

func rawMachineID() string {
	switch runtime.GOOS {
	case "darwin":
		out, err := exec.Command("/usr/sbin/ioreg", "-rd1", "-c", "IOPlatformExpertDevice").Output()
		if err != nil {
			return ""
		}
		if m := platformUUID.FindSubmatch(out); m != nil {
			return string(m[1])
		}
	case "linux":
		for _, f := range []string{"/etc/machine-id", "/var/lib/dbus/machine-id"} {
			if b, err := os.ReadFile(f); err == nil && strings.TrimSpace(string(b)) != "" {
				return strings.TrimSpace(string(b))
			}
		}
	}
	return ""
}

var (
	machineOnce sync.Once
	machine     string
)

// ThisMachine is this computer's hash, computed once ("" if unknown).
func ThisMachine() string {
	machineOnce.Do(func() { machine = MachineHash(rawMachineID()) })
	return machine
}

// SameMachine says whether a Ducter whose welcome named `server` runs on
// this computer. Without a machine in the welcome (an older Ducter), or
// when this computer has no id, it falls back to the address: loopback
// counts as here. That fallback is wrong for an SSH tunnel, which is why
// core sends the machine.
func SameMachine(server, here, url string) bool {
	if server != "" && here != "" {
		return server == here
	}
	return IsLoopback(url)
}
