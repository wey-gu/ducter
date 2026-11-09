package mock

import (
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// Scenes of the Devices stage (D81), for the scripted demo: the states the
// Isles scene must show, set at once (mockserver: MOCK_SCENE, or
// GET /demo/scene?name=…). Each replaces the devices and the paired
// phones; "cloud-working" also starts a task on cloud-1.
//
//	one            this Mac only
//	cloud-working  this Mac and cloud-1, a task running on cloud-1
//	cloud-asleep   cloud-1 asleep
//	cloud-away     cloud-1 can't be reached since two hours ago
//	phone          this Mac, cloud-1 and an iPhone that reaches Ducter
//	joined         as phone, and a Mac mini that just joined
//	six            six devices round home, three AI accounts on the Mac
var Scenes = []string{"one", "cloud-working", "cloud-asleep", "cloud-away", "phone", "joined", "six"}

func macHome(accounts ...string) protocol.DeviceView {
	var hs []protocol.DeviceHarness
	for _, a := range accounts {
		hs = append(hs, protocol.DeviceHarness{Harness: a, Installed: true, LoggedIn: true})
	}
	return protocol.DeviceView{
		ID: "local", Name: "MacBook-Pro", Kind: "laptop", Home: true, State: protocol.DeviceAwake,
		Harnesses: hs,
		Abilities: []protocol.DeviceAbility{
			{ID: protocol.AbilityWeb, State: protocol.AbilityOn, Detail: "0.44.0"},
			{ID: protocol.AbilityComputer, State: protocol.AbilityLater},
			{ID: protocol.AbilityRemote, State: protocol.AbilityOff},
			{ID: protocol.AbilityPhone, State: protocol.AbilityLater},
			{ID: protocol.AbilityCall, State: protocol.AbilityLater},
		},
	}
}

func worker(id, name, kind, state string, accounts ...string) protocol.DeviceView {
	var hs []protocol.DeviceHarness
	for _, a := range accounts {
		hs = append(hs, protocol.DeviceHarness{Harness: a, Installed: true, LoggedIn: true})
	}
	d := protocol.DeviceView{ID: id, Name: name, Kind: kind, State: state, Version: "0.1.0", Harnesses: hs,
		Abilities: []protocol.DeviceAbility{
			{ID: protocol.AbilityWeb, State: protocol.AbilityUnavailable, Reason: "home_only"},
			{ID: protocol.AbilityComputer, State: protocol.AbilityLater},
			{ID: protocol.AbilityPhone, State: protocol.AbilityLater},
			{ID: protocol.AbilityCall, State: protocol.AbilityLater},
		}}
	if state != protocol.DeviceAwake {
		d.LastSeen = time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339)
	}
	return d
}

// Scene sets one of Scenes; false if there is no such scene.
func (h *hub) Scene(name string) bool {
	cloud := func(state string) protocol.DeviceView {
		return worker("cloud1", "cloud-1", "server", state, "claude-code")
	}
	iphone := protocol.ReachClient{ID: "c-iphone", Name: "iPhone", Platform: "ios", Connected: true}
	var list []protocol.DeviceView
	var clients []protocol.ReachClient
	working := false
	switch name {
	case "one":
		list = []protocol.DeviceView{macHome("claude-code", "codex")}
	case "cloud-working":
		list = []protocol.DeviceView{macHome("claude-code", "codex"), cloud(protocol.DeviceAwake)}
		working = true
	case "cloud-asleep":
		list = []protocol.DeviceView{macHome("claude-code", "codex"), cloud(protocol.DeviceAsleep)}
	case "cloud-away":
		list = []protocol.DeviceView{macHome("claude-code", "codex"), cloud(protocol.DeviceUnreachable)}
	case "phone":
		list = []protocol.DeviceView{macHome("claude-code", "codex"), cloud(protocol.DeviceAwake)}
		clients = []protocol.ReachClient{iphone}
	case "joined":
		list = []protocol.DeviceView{macHome("claude-code", "codex"), cloud(protocol.DeviceAwake),
			worker("mini1", "Mac mini", "mini", protocol.DeviceAwake, "claude-code", "codex")}
		clients = []protocol.ReachClient{iphone}
	case "six":
		list = []protocol.DeviceView{macHome("claude-code", "codex", "pi"), cloud(protocol.DeviceAwake),
			worker("mini1", "Mac mini", "mini", protocol.DeviceAwake, "claude-code", "codex"),
			worker("vps2", "build-box", "server", protocol.DeviceAsleep, "codex"),
			worker("air1", "MacBook Air", "laptop", protocol.DeviceUnreachable, "claude-code")}
		clients = []protocol.ReachClient{iphone, {ID: "c-ipad", Name: "iPad", Platform: "ios", Connected: false, LastSeen: time.Now().Add(-26 * time.Hour).UTC().Format(time.RFC3339)}}
		working = true
	default:
		return false
	}
	if len(clients) > 0 {
		setAbility(list, "local", protocol.AbilityRemote, protocol.AbilityOn)
	}
	h.SetDevices(func(_ []protocol.DeviceView, reach *protocol.Reach) []protocol.DeviceView {
		reach.Clients = append([]protocol.ReachClient{}, clients...)
		return list
	})
	h.cloudTask(working)
	return true
}

// cloudTask starts (or finishes) a task placed on cloud-1.
func (h *hub) cloudTask(on bool) {
	const id = "t-cloud"
	h.mu.Lock()
	_, open := h.cards[id]
	h.mu.Unlock()
	switch {
	case on && !open:
		h.emit(protocol.TaskStream(id), protocol.OriginSystem, protocol.KindTaskOpen, protocol.TaskOpen{TaskID: id, Title: h.l("跑一遍集成测试", "Run the integration tests"),
			Project: "Ducter", Place: protocol.Place{Kind: "repo", Device: "cloud1", RepoPath: "~/dev/ducter", Branch: "ducter/integration", BaseBranch: "main"},
			Harness: "claude-code", Model: "sonnet", Brief: h.l("跑一遍集成测试", "Run the integration tests")}, 0)
		h.emit(protocol.TaskStream(id), protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: protocol.Working, Residency: protocol.Hot}, 0)
	case on:
		h.emit(protocol.TaskStream(id), protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: protocol.Working, Residency: protocol.Hot}, 0)
	case open:
		h.emit(protocol.TaskStream(id), protocol.OriginSystem, protocol.KindTaskState, protocol.TaskState{TaskID: id, Attention: protocol.Done, Residency: protocol.Parked}, 0)
	default:
		return
	}
	h.broadcastOnHand()
}
