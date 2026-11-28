package views

// D646: Mem's state is never a dead end. Every state is a title and one line with at most
// one action, said the same on Memory, Agent messaging and Overview. This checks the drawn rows at
// the two laptop widths (1150 and 1400), in zh and en: the title and line are both there, the
// action is there only when the state offers one, nothing runs past the window, and a refusal's
// identity and Mem's "administrator" stay behind 详情.

import (
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

func TestMemStateRowsAt1150And1400(t *testing.T) {
	reasons := []string{"authority_missing", "custody_birth_missing", "lifetime_inactive", "attachment_mismatch", "control_denied", "revoked", "conflict", "unavailable", "unknown", "policy_invalid"}
	frames := func(tt *ui.Tester) {
		for i := 0; i < 3; i++ {
			tt.Advance(120 * time.Millisecond)
			tt.Frame()
		}
	}
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		L := i18n.New(lang)
		type c struct {
			name, tab, state string
			health           *protocol.MemHealth
			bridge           *protocol.BridgeView
			title, line, act string
			fact, head       bool
		}
		var cases []c
		memCase := func(name, state string, h *protocol.MemHealth, canRun bool, title, line, act string) {
			cases = append(cases, c{name: name, tab: TabMemory, state: state, health: h, bridge: &protocol.BridgeView{State: "connected", Identity: "ducter", Home: "hel", Version: "0.10.121", CanRun: canRun}, title: title, line: line, act: act, head: true})
		}
		memCase("signed-out", "signed_out", &protocol.MemHealth{Issue: "signed_out"}, false, L.T("mem.health.signed_out"), L.T("mem.health.signed_out.line"), L.T("mem.health.signin"))
		memCase("unreachable", "unreachable", &protocol.MemHealth{Issue: "unreachable"}, false, L.T("mem.health.unreachable", "hel"), L.T("mem.health.unreachable.line", "hel"), L.T("mem.health.again"))
		memCase("old-update", "old", &protocol.MemHealth{Issue: "old"}, true, L.T("mem.health.old"), L.T("mem.health.old.line"), L.T("mem.health.old.go"))
		memCase("old-elsewhere", "old_elsewhere", &protocol.MemHealth{Issue: "old"}, false, L.T("mem.health.old"), L.T("mem.health.old.elsewhere", "hel"), "")
		cases = append(cases, c{name: "closed", tab: TabMemory, state: "closed", bridge: &protocol.BridgeView{State: "mem_closed", Identity: "ducter", Home: "hel", CanOpen: true}, title: L.T("bridge.mem.closed"), line: L.T("bridge.mem.closed.open", "hel"), act: L.T("bridge.mem.open")})
		peer := func(name, state, title, line, act string, b *protocol.BridgeView) {
			cases = append(cases, c{name: name, tab: TabPeers, state: state, bridge: b, title: title, line: line, act: act})
		}
		peer("local-mem", "local_mem", L.T("bridge.mem.local.title"), L.T("bridge.mem.local", "hel"), L.T("bridge.retry"), &protocol.BridgeView{State: "local_mem", Identity: "ducter", Home: "hel"})
		peer("no-space", "no_space", L.T("bridge.no_space.title"), L.T("bridge.no_space"), L.T("mem.health.again"), &protocol.BridgeView{State: "no_space", Identity: "ducter", Home: "hel"})
		peer("failed", "failed", L.T("bridge.failed.title"), L.T("bridge.failed.why", "timed out"), L.T("bridge.retry"), &protocol.BridgeView{State: "failed", Identity: "ducter", Home: "hel", Detail: "timed out"})
		peer("unconfirmed", "unconfirmed", L.T("bridge.unconfirmed.title"), L.T("bridge.unconfirmed"), L.T("bridge.retry"), &protocol.BridgeView{State: "unconfirmed", Identity: "ducter", Home: "hel"})
		for _, r := range reasons {
			act := L.T("bridge.retry")
			if r == "lifetime_inactive" || r == "conflict" || r == "policy_invalid" {
				act = ""
			}
			peer("refused-"+r, "refused", L.T("bridge.refused."+r+".title"), L.T("bridge.refused."+r+".line"), act, &protocol.BridgeView{State: "refused", Reason: r, Identity: "ducter", Home: "hel"})
			cases[len(cases)-1].fact = true
		}
		for _, tc := range cases {
			tc := tc
			t.Run(string(lang)+"-"+tc.name, func(t *testing.T) {
				app, _ := memApp(t, lang, "on")
				if tc.health != nil {
					app.S.Mem.Health = tc.health
				}
				app.S.Bridge = tc.bridge
				app.openTab(tc.tab)
				for _, w := range []int{1150, 1400} {
					app.peersFact = false
					tt := ui.NewTesterWith(app.View, w, 2600, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
					frames(tt)
					// Memory's head carries Mem's name and the line; Agent messaging's row carries the state's own title.
					title, ok := tt.Find(tc.title)
					if !ok && !tc.head {
						t.Fatalf("%d: no title %q in %q", w, tc.title, tt.Texts())
					}
					line, ok := tt.Find(tc.line)
					if !ok {
						t.Fatalf("%d: no line %q in %q", w, tc.line, tt.Texts())
					}
					for _, r := range []ui.Rect{title, line} {
						if (r.W > 0 || !tc.head) && (r.X < 0 || r.X+r.W > float32(w)+0.5) {
							t.Errorf("%d: %q runs past the window: %+v", w, tc.name, r)
						}
					}
					if tc.act != "" {
						if p, ok := tt.Find(tc.act); !ok {
							t.Fatalf("%d: no action %q in %q", w, tc.act, tt.Texts())
						} else if p.X < 0 || p.X+p.W > float32(w)+0.5 {
							t.Errorf("%d: the action runs past the window: %+v", w, p)
						}
					}
					// The identity and Mem's administrator never show until 详情 is opened.
					if tc.fact {
						for _, got := range tt.Texts() {
							if got == "Ducter dev" {
								continue // the window's own title, not the persona's Mem name
							}
							if strings.Contains(strings.ToLower(got), "ducter") || strings.Contains(got, "管理员") || strings.Contains(strings.ToLower(got), "administrator") {
								t.Fatalf("%d: a refusal shows %q before 详情", w, got)
							}
						}
						if err := tt.Click(L.T("mem.details")); err != nil {
							t.Fatalf("%d: no 详情: %v", w, err)
						}
						frames(tt)
						if _, ok := tt.Find(L.T("bridge.refused.detail", "ducter")); !ok {
							t.Fatalf("%d: 详情 does not carry the name: %q", w, tt.Texts())
						}
					}
				}
			})
		}
	}
}
