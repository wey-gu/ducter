package views

import (
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D433: 能找到{name}的 / Who can reach {name}, and the other home Mem hasn't
// seen for a day. The web's: reachRows and awayFor (apps/web/src/mem-view.ts).

// bridgeTools are the tools whose Nowledge Mem plugin carries Bridge today
// (research/66 §10, research/183; D555, research/226: Antigravity's since its
// plugin 0.1.4, which Mem's plugin check doesn't list, so its row says yes only
// from Mem's contact list or an exchange); noBridgeTools share the memory but
// can't pass a message yet (pi: its plugin 0.8.19 only reminds a session set up
// by hand to check an approved mailbox at start).
var (
	bridgeTools   = []string{"claude-code", "codex", "antigravity"}
	noBridgeTools = []string{"pi"}
	toolNames     = map[string]string{"claude-code": "Claude Code", "codex": "Codex", "pi": "pi", "antigravity": "Antigravity"}
)

// reachRow is one tool: Can is yes (its plugin carries Bridge and is in),
// install (it carries Bridge but isn't in on Device), unknown (Mem's check
// hasn't said), none (its plugin can't pass messages yet) or relay (D448: it
// can't, but the tasks Ducter runs on it pass messages through Ducter). Last is the
// newest exchange with it.
// Box (D444) is what Mem's grouped contact list says of its mailbox: "open",
// "closed", or "" when Mem didn't list it.
type reachRow struct {
	Harness, Tool, Can, Device, DeviceName, Last, Box string
}

func reachRows(devices []protocol.DeviceView, own []string, recent []handoff, boxes ...protocol.BridgeMailbox) []reachRow {
	ds := append([]protocol.DeviceView(nil), devices...)
	sort.SliceStable(ds, func(i, j int) bool { return ds[i].Home && !ds[j].Home })
	var out []reachRow
	for _, h := range append(append([]string(nil), bridgeTools...), noBridgeTools...) {
		found, runs, on, off, offName := false, false, false, "", ""
		onID, onName := "", "" // D470: where it is signed in with the plugin (home first): where its mailbox opens
		for _, d := range ds {
			for _, x := range d.Harnesses {
				if x.Harness != h || !x.Installed || !x.LoggedIn {
					continue
				}
				found, runs = true, true
				if x.Mem != nil && (x.Mem.State == "installed" || x.Mem.State == "update") {
					on = true
					if onID == "" {
						onID, onName = d.ID, d.Name
					}
				}
				if x.Mem != nil && x.Mem.State == "absent" && off == "" {
					off, offName = d.ID, d.Name
				}
			}
		}
		for _, o := range own {
			found = found || o == h
		}
		box := ""
		for _, m := range boxes {
			if m.Harness == h {
				box = "closed"
				if m.Open {
					box = "open"
				}
			}
		}
		if !found && box == "" {
			continue
		}
		tool := toolNames[h]
		re := regexp.MustCompile(`(?i)\b` + strings.ReplaceAll(regexp.QuoteMeta(tool), " ", `\s*`) + `\b`)
		last := ""
		for _, r := range recent {
			if r.Host == tool || re.MatchString(r.Agent) {
				last = r.At
				break
			}
		}
		row := reachRow{Harness: h, Tool: tool, Last: last, Box: box}
		switch {
		case noBridge(h) && runs:
			// D448: signed in on a computer of Ducter's: the tasks Ducter runs on it pass
			// messages through Ducter; the person's own sessions of it still can't.
			row.Can, row.Box = "relay", ""
		case noBridge(h):
			row.Can, row.Box = "none", ""
		case on || last != "" || box == "open":
			row.Can, row.Device, row.DeviceName = "yes", onID, onName
		case off != "":
			row.Can, row.Device, row.DeviceName = "install", off, offName
		default:
			row.Can = "unknown"
		}
		out = append(out, row)
	}
	return out
}

// noBridge: the tool's own Mem plugin can't pass a message yet.
func noBridge(h string) bool {
	for _, x := range noBridgeTools {
		if x == h {
			return true
		}
	}
	return false
}

// awayFor: Mem last saw that computer over a day ago (0: Mem didn't say).
func awayFor(seenAt int64, now time.Time) bool {
	return seenAt > 0 && now.Sub(time.UnixMilli(seenAt)) > 24*time.Hour
}
