package local

// "让这台 Mac 也替 hel 做事 / Let this Mac do tasks for hel" (D155): when
// the app is connected to a Ducter elsewhere, one tap makes this Mac one of
// its workers. The app asks that Ducter for a one-time code over its own
// authenticated socket (as it does for the command line, D147), pairs a
// worker device with it, saves <dataDir>/worker.json (the file `ducter
// worker` reads), and runs the bundled helper's `ducter worker` under a
// LaunchAgent: it starts at login, restarts if it stops, logs to
// <dataDir>/worker.log. A worker only does tasks: its token opens /worker
// and /mcp, never the conversation (D54, D83). Off: the LaunchAgent is
// unloaded and removed, worker.json goes, and the view revokes the device.

import (
	"bytes"
	"context"
	"encoding/json"
	"encoding/xml"
	"errors"
	"os"
	"path/filepath"
	"strings"

	"github.com/wey-gu/ducter/apps/desktop/internal/remote"
	"github.com/wey-gu/ducter/apps/desktop/internal/update"
)

// WorkerLabel is the worker LaunchAgent's label for an app's bundle id
// (co.nowledge.ducter.worker: the same one `ducter service install
// --worker` writes, packages/cli/src/remote.ts WORKER_LABEL).
func WorkerLabel(bundleID string) string { return bundleID + ".worker" }

// WorkerSaved is <dataDir>/worker.json; the CLI reads it
// (packages/cli/src/worker.ts WorkerSaved). Keep the fields in step.
type WorkerSaved struct {
	URL      string `json:"url"` // the http(s) base of the home
	Token    string `json:"token"`
	DeviceID string `json:"deviceId"`
	Persona  string `json:"persona"`
	Name     string `json:"name"`
}

// MacWorker runs this Mac as a worker of a Ducter elsewhere.
type MacWorker struct {
	Agent    *Agent // Label WorkerLabel(bid), Args [worker], LogName worker.log
	DataDir  string
	Env      map[string]string // the LaunchAgent's environment
	Computer string            // this Mac's name (remote.DeviceName)
	// Seams (tests): the code over the app's socket, and the pairing.
	IssueCode func(ctx context.Context, base, token string) (string, error)
	Pair      func(ctx context.Context, base, code string, info remote.PairInfo) (remote.Saved, error)
}

// NewMacWorker is the worker for an app: the bundled helper, the app's data
// folder, ~/Library/LaunchAgents.
func NewMacWorker(bundleID, cli, dataDir, locale string) *MacWorker {
	env := AgentEnv(0, dataDir, locale)
	delete(env, "DUCTER_PORT")
	env["DUCTER_SUPERVISOR"] = "launchd" // refused by the home: exit 0, not again every 10 s
	return &MacWorker{
		Agent:    &Agent{Label: WorkerLabel(bundleID), BundleID: bundleID, CLI: cli, DataDir: dataDir, Dir: LaunchAgentsDir(), Args: []string{"worker"}, LogName: "worker.log"},
		DataDir:  dataDir,
		Env:      env,
		Computer: remote.DeviceName(),
	}
}

func (w *MacWorker) file() string { return filepath.Join(w.DataDir, "worker.json") }

// Saved reads worker.json; nil when there is none.
func (w *MacWorker) Saved() *WorkerSaved {
	b, err := os.ReadFile(w.file())
	if err != nil {
		return nil
	}
	var s WorkerSaved
	if json.Unmarshal(b, &s) != nil || s.URL == "" || s.Token == "" {
		return nil
	}
	return &s
}

// On says whether this Mac does tasks for the Ducter at base (an http(s)
// base or its ws URL): worker.json names it and the LaunchAgent is there.
// It also gives the worker's device id there.
func (w *MacWorker) On(base string) (bool, string) {
	s := w.Saved()
	if s == nil || !sameBase(s.URL, base) || !w.Agent.Installed() {
		return false, ""
	}
	return true, s.DeviceID
}

func sameBase(a, b string) bool {
	return strings.EqualFold(strings.TrimRight(remote.BaseOf(a), "/"), strings.TrimRight(remote.BaseOf(b), "/"))
}

// ErrNoToken: the app has no token for that Ducter (a loopback tunnel).
var ErrNoToken = errors.New("no device token for that Ducter")

// Start makes this Mac a worker of the Ducter at base: a worker.json for it
// that still has a token is reused; else a fresh code over the app's
// socket is redeemed as a worker named after this Mac. Then the
// LaunchAgent is written and loaded.
func (w *MacWorker) Start(ctx context.Context, base, appToken string) (*WorkerSaved, error) {
	base = remote.BaseOf(base)
	s := w.Saved()
	if s == nil || !sameBase(s.URL, base) {
		if appToken == "" {
			return nil, ErrNoToken
		}
		issue, pair := w.IssueCode, w.Pair
		if issue == nil {
			issue = remote.IssueCode
		}
		if pair == nil {
			pair = remote.PairWith
		}
		code, err := issue(ctx, base, appToken)
		if err != nil {
			return nil, err
		}
		got, err := pair(ctx, base, code, remote.PairInfo{Name: w.Computer, Role: "worker", Computer: w.Computer})
		if err != nil {
			return nil, err
		}
		name := got.Name
		if name == "" {
			name = w.Computer
		}
		s = &WorkerSaved{URL: base, Token: got.Token, DeviceID: got.DeviceID, Persona: got.Persona, Name: name}
		if err := w.save(*s); err != nil {
			return nil, err
		}
	}
	if err := w.Agent.Install(w.Env); err != nil {
		return s, err
	}
	return s, nil
}

func (w *MacWorker) save(s WorkerSaved) error {
	if err := os.MkdirAll(w.DataDir, 0o700); err != nil {
		return err
	}
	b, _ := json.MarshalIndent(s, "", "  ")
	tmp := w.file() + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	if err := os.Chmod(tmp, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, w.file())
}

// Stop unloads and removes the LaunchAgent and forgets worker.json. It
// returns the worker's device id there, for the view to revoke.
func (w *MacWorker) Stop() (string, error) {
	id := ""
	if s := w.Saved(); s != nil {
		id = s.DeviceID
	}
	err := w.Agent.Remove()
	if rerr := os.Remove(w.file()); rerr != nil && !os.IsNotExist(rerr) && err == nil {
		err = rerr
	}
	return id, err
}

// workerAlive is <dataDir>/updates/alive.json, which `ducter worker` writes
// each time it reaches its home (packages/core/src/update.ts writeAlive).
type workerAlive struct {
	Version string `json:"version"`
}

// Refresh keeps this Mac's worker on the app's own helper (D167), soon after
// the app starts: a plist that names another helper (a bundle moved aside
// by an update) is written again and reloaded; a worker that last said an
// older version than appVersion (the bundled helper's) still runs an old
// helper from memory, so it is restarted, once per version (a worker that
// can't reach its home never says a newer one). It reports what it did:
// "" nothing, "reloaded" or "restarted".
func (w *MacWorker) Refresh(appVersion string) (string, error) {
	if !w.Agent.Installed() || w.Saved() == nil {
		return "", nil
	}
	have, _ := os.ReadFile(w.Agent.PlistPath())
	var esc bytes.Buffer
	_ = xml.EscapeText(&esc, []byte(w.Agent.CLI))
	if !bytes.Contains(have, []byte("<string>"+esc.String()+"</string>")) {
		return "reloaded", w.Agent.Install(w.Env)
	}
	if appVersion == "" {
		return "", nil
	}
	var a workerAlive
	b, err := os.ReadFile(filepath.Join(w.DataDir, "updates", "alive.json"))
	if err != nil || json.Unmarshal(b, &a) != nil || update.Compare(a.Version, "0.0.0") < 0 || update.Compare(a.Version, appVersion) >= 0 {
		return "", nil
	}
	mark := filepath.Join(w.DataDir, "updates", "worker-restarted")
	if last, _ := os.ReadFile(mark); strings.TrimSpace(string(last)) == appVersion {
		return "", nil
	}
	_ = os.MkdirAll(filepath.Dir(mark), 0o700)
	_ = os.WriteFile(mark, []byte(appVersion+"\n"), 0o600)
	return "restarted", w.Agent.Restart()
}
