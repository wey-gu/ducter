package views

// D600: Cursor, Devin CLI, Kimi Code and OpenCode where the Mac lists agents: their names, marks,
// the terminal-only sign-in lines, the terms before a sign-in, and the sign-outs Ducter can run.

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
	}
	badges := map[string]string{"cursor": "cu", "devin": "dv", "kimi": "km", "opencode": "oc"}
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
	for h, want := range map[string]string{"devin": "ag.login.devin", "opencode": "ag.login.opencode", "cursor": "ag.login.cursor", "pi": "ag.login.pi"} {
		if got := terminalKey(h); got != want {
			t.Errorf("terminalKey(%q) = %q, want %q", h, got, want)
		}
	}
	for h, want := range map[string]string{"devin": "ag.devin.where", "kimi": "ag.kimi.where", "cursor": "ag.cursor.where", "opencode": ""} {
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
		for _, k := range []string{"ag.login.devin", "ag.login.opencode", "ag.login.cursor"} {
			if got := i18n.New(l).T(k, "nas"); got == k || got == "" {
				t.Errorf("%s: missing %q", l, k)
			}
		}
		for _, k := range []string{"ag.login.kimi.1", "ag.login.kimi.2", "ag.kimi.where", "ag.kimi.terms", "ag.devin.where", "ag.devin.terms", "ag.opencode.where", "ag.opencode.terms", "ag.cursor.where", "ag.cursor.terms"} {
			if got := i18n.New(l).T(k); got == k || got == "" {
				t.Errorf("%s: missing %q", l, k)
			}
		}
	}
	wantOrder := []string{"codex", "claude-code", "deepseek-harness", "pi", "antigravity", "opencode", "devin", "kimi", "cursor"}
	if len(installOrder) != len(wantOrder) {
		t.Fatalf("installOrder = %v", installOrder)
	}
	for i := range wantOrder {
		if installOrder[i] != wantOrder[i] {
			t.Fatalf("installOrder = %v, want %v", installOrder, wantOrder)
		}
	}
}

// D600: an unknown agent still gets the generic coin (no art was made for these four yet), so the
// picker can list them without a missing image.
func TestHarnessFourCoinsAreGeneric(t *testing.T) {
	for _, h := range []string{"cursor", "devin", "kimi", "opencode"} {
		if coinKnown(h) {
			t.Errorf("%s has a coin art that doesn't exist", h)
		}
		if got := coinArt(h, false); got != "token_ink" {
			t.Errorf("coinArt(%q) = %q", h, got)
		}
	}
}
