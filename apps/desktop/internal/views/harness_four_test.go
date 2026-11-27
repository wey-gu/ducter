package views

// D600: Cursor, Devin CLI, Kimi Code and OpenCode where the Mac lists agents: their names, marks,
// the terminal-only sign-in lines, the terms before a sign-in, and the sign-outs Ducter can run.
// D630: Cursor signs in through OAR's link, not a terminal, and keeps the Node floor words.

import (
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

func TestHarnessFourNamesAndLogin(t *testing.T) {
	names := map[string]string{
		"cursor":   "Cursor",
		"devin":    "Devin CLI",
		"kimi":     "Kimi Code CLI",
		"opencode": "OpenCode",
		"dim":      "Dim",
	}
	badges := map[string]string{"cursor": "cu", "devin": "dv", "kimi": "km", "opencode": "oc", "dim": "dm"}
	for h, want := range names {
		if got := harnessName(h); got != want {
			t.Errorf("harnessName(%q) = %q, want %q", h, got, want)
		}
	}
	for h, want := range badges {
		if got := harnessBadge(h); got != want {
			t.Errorf("harnessBadge(%q) = %q, want %q", h, got, want)
		}
	}
	if open, code := loginSteps("kimi"); open != "ag.login.kimi.1" || code != "ag.login.kimi.2" {
		t.Errorf("Kimi's steps: %s, %s", open, code)
	}
	if open, code := loginSteps("cursor"); open != "ag.login.cursor.1" || code != "ag.login.cursor.2" {
		t.Errorf("Cursor's steps: %s, %s", open, code)
	}
	for h, want := range map[string]string{"devin": "ag.login.devin", "opencode": "ag.login.opencode", "cursor": "ag.login.pi", "dim": "ag.login.dim", "pi": "ag.login.pi"} {
		if got := terminalKey(h); got != want {
			t.Errorf("terminalKey(%q) = %q, want %q", h, got, want)
		}
	}
	for h, want := range map[string]string{"devin": "ag.devin.where", "kimi": "ag.kimi.where", "cursor": "ag.cursor.where", "dim": "ag.dim.where", "opencode": ""} {
		if got := manualWhereKey(h); got != want {
			t.Errorf("manualWhereKey(%q) = %q, want %q", h, got, want)
		}
	}
	for h, want := range map[string]string{"kimi": "ag.kimi.terms", "opencode": "ag.opencode.terms", "devin": "ag.devin.terms", "cursor": "ag.cursor.terms"} {
		if got := termsKey(h); got != want {
			t.Errorf("termsKey(%q) = %q, want %q", h, got, want)
		}
	}
	for _, h := range []string{"antigravity", "cursor", "kimi"} {
		if !agentCanSignOut(h) {
			t.Errorf("%s should have a sign-out", h)
		}
	}
	for _, h := range []string{"devin", "opencode"} {
		if agentCanSignOut(h) {
			t.Errorf("%s should not have a sign-out", h)
		}
	}
	// The words are in both languages, and the offerable order lists all four after the old agents.
	for _, l := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, k := range []string{"ag.login.devin", "ag.login.opencode", "ag.login.dim"} {
			if got := i18n.New(l).T(k, "nas"); got == k || got == "" {
				t.Errorf("%s: missing %q", l, k)
			}
		}
		for _, k := range []string{"ag.login.kimi.1", "ag.login.kimi.2", "ag.login.cursor.1", "ag.login.cursor.2", "ag.login.wait.cursor", "ag.kimi.where", "ag.kimi.terms", "ag.devin.where", "ag.devin.terms", "ag.opencode.where", "ag.opencode.terms", "ag.cursor.where", "ag.cursor.terms", "ag.node.update", "ag.node.install", "ag.dim.where", "ag.dim.coming", "ag.coming"} {
			if got := i18n.New(l).T(k); got == k || got == "" {
				t.Errorf("%s: missing %q", l, k)
			}
		}
	}
	for _, l := range []i18n.Lang{i18n.ZH, i18n.EN} {
		if got := i18n.New(l).T("ag.trouble.node_old"); got == "ag.trouble.node_old" || got == "" {
			t.Errorf("%s: missing ag.trouble.node_old", l)
		}
		if got := i18n.New(l).T("ag.node_old.why.ducter", "20.11.0", "22.13.0"); got == "ag.node_old.why.ducter" || got == "" {
			t.Errorf("%s: missing ag.node_old.why.ducter", l)
		}
		if got := i18n.New(l).T("ag.node_old.why.system", "22.13.0", "20.11.0"); got == "ag.node_old.why.system" || got == "" {
			t.Errorf("%s: missing ag.node_old.why.system", l)
		}
	}
	wantOrder := []string{"codex", "claude-code", "deepseek-harness", "pi", "antigravity", "opencode", "devin", "kimi", "cursor", "dim"}
	if len(installOrder) != len(wantOrder) {
		t.Fatalf("installOrder = %v", installOrder)
	}
	for i := range wantOrder {
		if installOrder[i] != wantOrder[i] {
			t.Fatalf("installOrder = %v, want %v", installOrder, wantOrder)
		}
	}
}

// D600: each of the four has its own coin now (D183's pipeline), so the picker draws the agent's
// mark instead of the generic token.
func TestHarnessFourCoins(t *testing.T) {
	want := map[string]string{
		"cursor":   "coin_cursor",
		"devin":    "coin_devin",
		"kimi":     "coin_kimi",
		"opencode": "coin_opencode",
	}
	for h, art := range want {
		if !coinKnown(h) {
			t.Errorf("%s should have its own coin", h)
		}
		if got := coinArt(h, false); got != art {
			t.Errorf("coinArt(%q) = %q, want %q", h, got, art)
		}
		if got := coinArt(h, true); got != art+"_off" {
			t.Errorf("coinArt(%q, off) = %q, want %q", h, got, art+"_off")
		}
	}
}

// D625: Dim has no coin of its own yet, so the picker draws the generic token.
func TestDimCoinIsGeneric(t *testing.T) {
	if coinKnown("dim") {
		t.Errorf("dim has a coin art that doesn't exist")
	}
	if got := coinArt("dim", false); got != "token_ink" {
		t.Errorf("coinArt(dim) = %q", got)
	}
}
