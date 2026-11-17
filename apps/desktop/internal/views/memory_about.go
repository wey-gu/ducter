package views

import (
	"sort"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D321: the rules of Settings › 记忆 as "what it knows about you" and of
// 和你的其他 agent 通信's 试试看, the web's (apps/web/src/mem-view.ts).

// aboutKinds are Mem's own kinds, in the Memory page's order.
var aboutKinds = []string{"preference", "decision", "fact", "other"}

// aboutGroup is one kind's memories on the page.
type aboutGroup struct {
	Kind  string
	Items []protocol.MemItem
}

// aboutGroups is what it knows about the person, as the page's groups in a
// fixed order; empty kinds are left out (web: aboutGroups).
func aboutGroups(items []protocol.MemItem) []aboutGroup {
	var out []aboutGroup
	for _, k := range aboutKinds {
		var g []protocol.MemItem
		for _, x := range items {
			if x.Kind == k || (k == "other" && !knownKind(x.Kind)) {
				g = append(g, x)
			}
		}
		if len(g) > 0 {
			out = append(out, aboutGroup{Kind: k, Items: g})
		}
	}
	return out
}

func knownKind(k string) bool {
	for _, x := range aboutKinds {
		if x == k {
			return true
		}
	}
	return false
}

// bySource is who a memory is from, as the page's key and argument (web: bySource).
func bySource(x protocol.MemItem) (string, []any) {
	if x.By == "tool" && x.From != "" {
		return "mem.by.tool", []any{x.From}
	}
	switch x.By {
	case "said", "mem":
		return "mem.by." + x.By, nil
	}
	return "mem.by.you", nil
}

// tryAgent is one agent 试试看 names: its harness, whether Mem's plugin is in
// it somewhere ("on"), missing where it's signed in ("off", Device: the id
// to put it, the home first), or unknown ("").
type tryAgent struct {
	Harness, Plugin, Device, DeviceName string
}

// tryAgents is Claude Code and Codex where they're signed in (web: tryAgents).
func tryAgents(devices []protocol.DeviceView) []tryAgent {
	ds := append([]protocol.DeviceView(nil), devices...)
	sort.SliceStable(ds, func(i, j int) bool { return ds[i].Home && !ds[j].Home })
	var out []tryAgent
	for _, h := range []string{"claude-code", "codex"} {
		found, on, off, offName := false, false, "", ""
		for _, d := range ds {
			for _, x := range d.Harnesses {
				if x.Harness != h || !x.Installed || !x.LoggedIn {
					continue
				}
				found = true
				if x.Mem != nil && (x.Mem.State == "installed" || x.Mem.State == "update") {
					on = true
				}
				if x.Mem != nil && x.Mem.State == "absent" && off == "" {
					off, offName = d.ID, d.Name
				}
			}
		}
		switch {
		case !found:
		case on:
			out = append(out, tryAgent{Harness: h, Plugin: "on"})
		case off != "":
			out = append(out, tryAgent{Harness: h, Plugin: "off", Device: off, DeviceName: offName})
		default:
			out = append(out, tryAgent{Harness: h})
		}
	}
	return out
}
