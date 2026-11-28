package i18n

// D669 (#4): no Mem code is a line, in either language. The web has the twin test
// (apps/web/test/mem-no.test.ts); these are the same words (D488).

import (
	"strings"
	"testing"
)

func TestMemNoCodeInALine(t *testing.T) {
	for lang, table := range Tables() {
		for key, text := range table {
			if !strings.HasPrefix(key, "bridge.") && !strings.HasPrefix(key, "mem.") && !strings.HasPrefix(key, "peers.") {
				continue
			}
			for _, bad := range []string{"cloud_bridge_setup_", "policy_invalid", "(%s)", "（%s）"} {
				if strings.Contains(text, bad) {
					t.Errorf("%s %s holds %q: %q", lang, key, bad, text)
				}
			}
		}
	}
}

func TestPolicyInvalidIsOneLine(t *testing.T) {
	for _, lang := range []Lang{ZH, EN} {
		line := New(lang).T("bridge.refused.policy_invalid.line")
		if line == "bridge.refused.policy_invalid.line" || line == "" {
			t.Fatalf("%s: no policy_invalid line", lang)
		}
		if New(lang).T("bridge.refused.policy_invalid.title") == "bridge.refused.policy_invalid.title" {
			t.Fatalf("%s: no policy_invalid title", lang)
		}
	}
	if got := New(ZH).T("bridge.refused.policy_invalid.line"); !strings.Contains(got, "这个 Nowledge Mem 工作区还没让这台电脑收发消息") {
		t.Errorf("zh line: %q", got)
	}
	if got := New(ZH).T("peers.stuck.line", "小鸭"); strings.Contains(got, "%!") || strings.Contains(got, "%s") {
		t.Errorf("zh stuck line: %q", got)
	}
}
