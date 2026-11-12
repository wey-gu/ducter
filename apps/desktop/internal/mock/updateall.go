package mock

import (
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D224: 全部更新 / Update all, as the home would run it: a server home
// "hel", a Mac mini and a build box doing tasks for it, a MacBook asleep.
// The update-all scenes set the card's three states for pictures;
// update_all plays the plan through, a beat each, the mini's Ducter
// failing (rolled back) so a finished card shows a failure.

func updateAllScene(name string) ([]protocol.DeviceView, []protocol.ReachClient) {
	home := worker("local", "hel", "server", protocol.DeviceAwake, "claude-code", "codex")
	home.Home = true
	home.Version = "0.0.30"
	home.Update = &protocol.DeviceUpdate{Current: "0.0.30", Latest: "0.0.31", Available: true, How: "self"}
	mini := worker("mini1", "Mac mini", "mini", protocol.DeviceAwake, "claude-code")
	mini.Version = "0.0.30"
	mini.Update = &protocol.DeviceUpdate{Current: "0.0.30", Latest: "0.0.31", Available: true, How: "app", FromHere: true}
	box := worker("box1", "build-box", "server", protocol.DeviceAwake, "codex")
	box.Version = "0.0.30"
	box.Update = &protocol.DeviceUpdate{Current: "0.0.30", Latest: "0.0.31", Available: true, How: "self"}
	air := worker("air1", "MacBook Air", "laptop", protocol.DeviceAsleep, "claude-code")
	return []protocol.DeviceView{home, mini, box, air}, nil
}

func updateAllOffer() []protocol.UpdateAllItem {
	at := time.Now().UTC().Format(time.RFC3339)
	it := func(kind, dev, name, h, from, to string) protocol.UpdateAllItem {
		key := "ducter:" + dev
		if kind == "agent" {
			key = "agent:" + dev + ":" + h
		}
		return protocol.UpdateAllItem{Key: key, Kind: kind, Device: dev, DeviceName: name, Harness: h, From: from, To: to, State: "queued", At: at}
	}
	return []protocol.UpdateAllItem{
		it("ducter", "local", "hel", "", "0.0.30", "0.0.31"),
		it("ducter", "mini1", "Mac mini", "", "0.0.30", "0.0.31"),
		it("ducter", "box1", "build-box", "", "0.0.30", "0.0.31"),
		it("agent", "local", "hel", "claude-code", "2.1.319", "2.1.322"),
		it("agent", "local", "hel", "codex", "0.160.0", "0.167.0"),
		it("agent", "box1", "build-box", "codex", "0.160.0", "0.167.0"),
	}
}

var updateAllNotNow = []protocol.UpdateAllNotNow{{Device: "air1", DeviceName: "MacBook Air", Why: "offline", Items: 2}}

func updateAllView(scene string) *protocol.UpdateAllView {
	items := updateAllOffer()
	now := time.Now().UTC().Format(time.RFC3339)
	switch scene {
	case "update-all":
		return &protocol.UpdateAllView{Offer: items, NotNow: updateAllNotNow}
	case "update-all-running":
		items[0].State = "done"
		items[1].State, items[1].Phase = "running", "waiting"
		items[2].State, items[2].Phase, items[2].Progress = "running", "downloading", 0.64
		items[3].State, items[3].Busy = "waiting", 2
		return &protocol.UpdateAllView{NotNow: updateAllNotNow, Plan: &protocol.UpdateAllPlan{ID: "ua-demo", By: "user", StartedAt: now, Items: items}}
	case "update-all-done":
		for i := range items {
			items[i].State = "done"
		}
		items[1].State, items[1].Reason, items[1].RolledBack, items[1].Detail = "failed", "health", true, "0.0.31 didn't answer within 180 s"
		return &protocol.UpdateAllView{NotNow: updateAllNotNow, Plan: &protocol.UpdateAllPlan{ID: "ua-demo", By: "user", StartedAt: now, FinishedAt: now, Items: items}}
	}
	return nil
}

func (h *hub) setUpdateAll(v *protocol.UpdateAllView) {
	d := h.devs()
	d.mu.Lock()
	d.ua = v
	d.mu.Unlock()
}

// handleUpdateAll answers update_all and plays the plan through.
func (h *hub) handleUpdateAll(c *conn, f protocol.ClientFrame) {
	d := h.devs()
	d.mu.Lock()
	ua := d.ua
	d.mu.Unlock()
	switch {
	case ua == nil:
		c.send(map[string]any{"t": "update_all_result", "ok": false, "reason": "nothing"})
		return
	case f.Dismiss:
		h.setUpdateAll(&protocol.UpdateAllView{Offer: []protocol.UpdateAllItem{}, NotNow: ua.NotNow})
		c.send(map[string]any{"t": "update_all_result", "ok": true})
		h.pushDevices()
		return
	case f.Stop:
		c.send(map[string]any{"t": "update_all_result", "ok": true})
		return
	}
	plan := &protocol.UpdateAllPlan{ID: "ua-mock", By: "user", StartedAt: time.Now().UTC().Format(time.RFC3339), Items: updateAllOffer()}
	c.send(map[string]any{"t": "update_all_result", "ok": true, "id": plan.ID})
	step := func(fn func(items []protocol.UpdateAllItem)) {
		fn(plan.Items)
		cp := *plan
		cp.Items = append([]protocol.UpdateAllItem(nil), plan.Items...)
		h.setUpdateAll(&protocol.UpdateAllView{Offer: []protocol.UpdateAllItem{}, NotNow: ua.NotNow, Plan: &cp})
		h.pushDevices()
		time.Sleep(900 * time.Millisecond)
	}
	go func() {
		step(func(it []protocol.UpdateAllItem) {
			it[0].State, it[0].Phase, it[0].Progress = "running", "downloading", 0.3
		})
		step(func(it []protocol.UpdateAllItem) { it[0].Phase, it[0].Progress = "restarting", 0 })
		step(func(it []protocol.UpdateAllItem) {
			it[0].State, it[0].Phase = "done", ""
			it[1].State, it[1].Phase, it[1].Progress = "running", "downloading", 0.5
			it[2].State, it[2].Phase, it[2].Progress = "running", "downloading", 0.2
			it[3].State, it[3].Busy = "waiting", 1
			it[4].State, it[4].Phase = "running", "updating"
		})
		step(func(it []protocol.UpdateAllItem) {
			it[1].State, it[1].Phase, it[1].Reason, it[1].RolledBack, it[1].Detail = "failed", "", "health", true, "0.0.31 didn't answer within 180 s"
			it[2].State, it[2].Phase = "done", ""
			it[4].State, it[4].Phase = "done", ""
			it[5].State, it[5].Phase = "running", "updating"
		})
		step(func(it []protocol.UpdateAllItem) {
			it[3].State, it[3].Busy, it[3].Phase = "running", 0, "updating"
			it[5].State, it[5].Phase = "done", ""
		})
		step(func(it []protocol.UpdateAllItem) {
			it[3].State, it[3].Phase = "done", ""
			plan.FinishedAt = time.Now().UTC().Format(time.RFC3339)
		})
	}()
}
