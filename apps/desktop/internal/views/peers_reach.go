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
// Box (D560) is "open" when Mem has an active connection labelled with this tool
// (core reads `bridge connections list`), else ""; an older home's "closed" is not
// a fact and is dropped. Back (agentBack) is whether the partner's replies reach it:
// yes, next (its next session will), old (its plugin's update is the fix) or
// unknown. Update: Mem offers a newer plugin there; Busy: that update is running.
type reachRow struct {
	Harness, Tool, Can, Device, DeviceName, Last, Box, Back string
	Update, Busy                                            bool
}

// memAutoSession is the first version of each agent's Mem plugin that gets every new
// session ready to receive by itself (D560; packages/protocol/src/mem-health.ts
// MEM_AUTO_SESSION, research/226 2.6).
var memAutoSession = map[string]string{"claude-code": "0.7.35", "codex": "0.1.50"}

// memSessions is "auto" when this plugin version readies its sessions by itself, "old"
// when it is older, "" when not known (the web's memSessions).
func memSessions(harness, version string) string {
	min := memAutoSession[harness]
	v := semverCore(version)
	m := semverCore(min)
	if v == nil || m == nil {
		return ""
	}
	for i := 0; i < 3; i++ {
		if v[i] != m[i] {
			if v[i] > m[i] {
				return "auto"
			}
			return "old"
		}
	}
	return "auto"
}

var semverRe = regexp.MustCompile(`^v?(\d+)\.(\d+)\.(\d+)`)

func semverCore(v string) []int {
	m := semverRe.FindStringSubmatch(strings.TrimSpace(v))
	if m == nil {
		return nil
	}
	out := make([]int, 3)
	for i := 0; i < 3; i++ {
		n := 0
		for _, ch := range m[i+1] {
			n = n*10 + int(ch-'0')
		}
		out[i] = n
	}
	return out
}

// agentBack is whether the partner's replies reach one agent, from Mem's facts only
// (D560; the web's and core's agentBack): yes, next, old or unknown.
func agentBack(harness string, open, heard bool, versions []string) string {
	if open || heard {
		return "yes"
	}
	old := false
	for _, v := range versions {
		switch memSessions(harness, v) {
		case "auto":
			return "next"
		case "old":
			old = true
		}
	}
	if old {
		return "old"
	}
	return "unknown"
}

func reachRows(devices []protocol.DeviceView, own []string, recent []handoff, boxes ...protocol.BridgeMailbox) []reachRow {
	ds := append([]protocol.DeviceView(nil), devices...)
	sort.SliceStable(ds, func(i, j int) bool { return ds[i].Home && !ds[j].Home })
	var out []reachRow
	for _, h := range append(append([]string(nil), bridgeTools...), noBridgeTools...) {
		found, runs, on, off, offName := false, false, false, "", ""
		onID, onName := "", "" // D470: where it is signed in with the plugin (home first)
		var versions []string
		update, busy, onUpdate := false, false, false
		for _, d := range ds {
			for _, x := range d.Harnesses {
				if x.Harness != h || !x.Installed || !x.LoggedIn {
					continue
				}
				found, runs = true, true
				if x.Mem != nil && (x.Mem.State == "installed" || x.Mem.State == "update") {
					on = true
					versions = append(versions, x.Mem.Version)
					busy = busy || x.Mem.TaskID != "" || x.Mem.Busy
					// D560: the computer whose plugin Mem offers an update for comes first: the one button's.
					if onID == "" || (x.Mem.State == "update" && !onUpdate) {
						onID, onName = d.ID, d.Name
						onUpdate = x.Mem.State == "update"
					}
					update = update || x.Mem.State == "update"
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
			if m.Harness == h && m.Open {
				box = "open"
			}
		}
		if !found && box == "" {
			continue
		}
		tool := toolNames[h]
		re := regexp.MustCompile(`(?i)\b` + strings.ReplaceAll(regexp.QuoteMeta(tool), " ", `\s*`) + `\b`)
		last, heard := "", false
		for _, r := range recent {
			if r.Host == tool || re.MatchString(r.Agent) {
				if last == "" {
					last = r.At
				}
				// D560: a message from one of its sessions (Mem's sender.host): a reply goes back to that session.
				heard = heard || r.Host == tool
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
			row.Back = agentBack(h, box == "open", heard, versions)
			row.Update, row.Busy = update, busy
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
