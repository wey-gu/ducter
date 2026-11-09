package mock

import (
	"strings"
	"sync"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// Your devices and abilities, as the real main reports them
// (packages/core/src/devices.ts): this Mac, where Ducter lives, and the
// Lima worker of the VPS work. Tests change them with SetDevices.

type devices struct {
	mu     sync.Mutex
	list   []protocol.DeviceView
	reach  protocol.Reach
	subs   map[*conn]bool
	codeN  int
	refuse map[string]string // ability -> reason the next add is refused with
}

func defaultDevices() []protocol.DeviceView {
	return []protocol.DeviceView{
		{
			ID: "local", Name: "MacBook-Pro", Kind: "laptop", Home: true, State: protocol.DeviceAwake,
			Harnesses: []protocol.DeviceHarness{
				{Harness: "claude-code", Installed: true, LoggedIn: true},
				{Harness: "codex", Installed: true, LoggedIn: true},
			},
			Abilities: []protocol.DeviceAbility{
				{ID: protocol.AbilityWeb, State: protocol.AbilityOff, Detail: "0.44.0"},
				{ID: protocol.AbilityComputer, State: protocol.AbilityLater},
				{ID: protocol.AbilityRemote, State: protocol.AbilityOff},
				{ID: protocol.AbilityPhone, State: protocol.AbilityLater},
				{ID: protocol.AbilityCall, State: protocol.AbilityLater},
			},
		},
		{
			ID: "a3f9c2d1e0", Name: "ducter-worker", Kind: "server", State: protocol.DeviceAwake, Version: "0.0.1",
			Harnesses: []protocol.DeviceHarness{{Harness: "claude-code", Installed: true, LoggedIn: true}},
			Abilities: []protocol.DeviceAbility{
				{ID: protocol.AbilityWeb, State: protocol.AbilityUnavailable, Reason: "home_only"},
				{ID: protocol.AbilityComputer, State: protocol.AbilityLater},
				{ID: protocol.AbilityPhone, State: protocol.AbilityLater},
				{ID: protocol.AbilityCall, State: protocol.AbilityLater},
			},
		},
	}
}

func (h *hub) devs() *devices {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.dev == nil {
		h.dev = &devices{list: defaultDevices(), reach: protocol.Reach{Clients: []protocol.ReachClient{}}, subs: map[*conn]bool{}, refuse: map[string]string{}}
	}
	return h.dev
}

// SetDevices replaces what the mock reports, and pushes it to subscribers.
func (h *hub) SetDevices(fn func(list []protocol.DeviceView, reach *protocol.Reach) []protocol.DeviceView) {
	d := h.devs()
	d.mu.Lock()
	d.list = fn(d.list, &d.reach)
	d.mu.Unlock()
	h.pushDevices()
}

// RefuseNext makes the next add of an ability fail with a reason.
func (h *hub) RefuseNext(ability, reason string) {
	d := h.devs()
	d.mu.Lock()
	d.refuse[ability] = reason
	d.mu.Unlock()
}

// Pair pretends a device redeemed the code.
func (h *hub) Pair(name, platform string) {
	h.SetDevices(func(list []protocol.DeviceView, reach *protocol.Reach) []protocol.DeviceView {
		reach.Clients = append(reach.Clients, protocol.ReachClient{ID: "c" + name, Name: name, Platform: platform, Connected: true})
		setAbility(list, "local", protocol.AbilityRemote, protocol.AbilityOn)
		return list
	})
}

func setAbility(list []protocol.DeviceView, device, id, state string) {
	for i := range list {
		if list[i].ID == device {
			if ab := list[i].Ability(id); ab != nil {
				ab.State = state
			}
		}
	}
}

func (h *hub) devicesFrame() map[string]any {
	d := h.devs()
	d.mu.Lock()
	defer d.mu.Unlock()
	list := append([]protocol.DeviceView(nil), d.list...)
	return map[string]any{"t": "devices", "devices": list, "reach": d.reach}
}

func (h *hub) pushDevices() {
	d := h.devs()
	d.mu.Lock()
	var subs []*conn
	for c := range d.subs {
		subs = append(subs, c)
	}
	d.mu.Unlock()
	f := h.devicesFrame()
	for _, c := range subs {
		c.send(f)
	}
}

// handleDevices answers devices, ability, pair_code and rename_device;
// false for others.
func (h *hub) handleDevices(c *conn, f protocol.ClientFrame) bool {
	d := h.devs()
	switch f.T {
	case "devices":
		d.mu.Lock()
		d.subs[c] = true
		d.mu.Unlock()
		c.send(h.devicesFrame())
	case "ability":
		d.mu.Lock()
		reason := d.refuse[f.Ability]
		delete(d.refuse, f.Ability)
		d.mu.Unlock()
		if reason != "" {
			c.send(map[string]any{"t": "ability_result", "device": f.Device, "ability": f.Ability, "on": f.On, "ok": false, "reason": reason})
			return true
		}
		state := protocol.AbilityOff
		if f.On {
			state = protocol.AbilityOn
		}
		d.mu.Lock()
		setAbility(d.list, f.Device, f.Ability, state)
		d.mu.Unlock()
		c.send(map[string]any{"t": "ability_result", "device": f.Device, "ability": f.Ability, "on": f.On, "ok": true})
		go func() {
			time.Sleep(50 * time.Millisecond)
			h.pushDevices()
		}()
	case "pair_code":
		d.mu.Lock()
		d.codeN++
		d.mu.Unlock()
		c.send(map[string]any{"t": "pair_code", "code": "K7QM-4XPA", "expiresAt": time.Now().Add(10 * time.Minute).UTC().Format(time.RFC3339)})
	case "rename_device":
		name := strings.TrimSpace(f.Name)
		d.mu.Lock()
		reason := ""
		hit := -1
		for i := range d.list {
			if d.list[i].ID == f.Device {
				hit = i
			} else if d.list[i].Name == name {
				reason = "name_taken"
			}
		}
		switch {
		case f.Device == "local":
			reason = "home"
		case hit < 0:
			reason = "unknown_device"
		case name == "":
			reason = "empty"
		}
		if reason == "" {
			d.list[hit].Name = name
		}
		d.mu.Unlock()
		if reason != "" {
			c.send(map[string]any{"t": "rename_result", "device": f.Device, "ok": false, "reason": reason})
			return true
		}
		c.send(map[string]any{"t": "rename_result", "device": f.Device, "ok": true, "name": name})
		go func() {
			time.Sleep(50 * time.Millisecond)
			h.pushDevices()
		}()
	default:
		return false
	}
	return true
}
