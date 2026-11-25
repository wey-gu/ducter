package views

import (
	"strings"
	"testing"
)

// D78: a short Chinese word stays whole in a wrapped title; a long run keeps its breaks.
func TestKeepWords(t *testing.T) {
	got := keepWords("修 compaction 测试")
	if !strings.Contains(got, "测⁠试") {
		t.Fatalf("测试 not joined: %q", got)
	}
	if strings.Contains(got, "修⁠") {
		t.Fatalf("a one-character run gained a joiner: %q", got)
	}
	long := keepWords("把上个月的账单和收据整理成一张表")
	if strings.Contains(long, "⁠") {
		t.Fatalf("a long run lost its breaks: %q", long)
	}
	if strings.ReplaceAll(got, "⁠", "") != "修 compaction 测试" {
		t.Fatalf("text changed: %q", got)
	}
	// D493: a question's last characters stay together, never 「吗？」 alone.
	q := "信箱的登录页一直转圈，像是 Mem 那边还没起来。要我过一会儿再试吗？"
	if got := keepTail(q); !strings.HasSuffix(got, "再⁠试⁠吗⁠？") || unjoin(got) != q {
		t.Fatalf("tail not kept: %q", got)
	}
	if got := keepTail("Shall I try again in a while?"); got != "Shall I try again in a while?" {
		t.Fatalf("latin tail: %q", got)
	}
}

// D556: a sentence keeps its clauses' last words whole (Notifications' preview at 1150 broke 到 / 期).
func TestKeepClauses(t *testing.T) {
	s := "早上好。值得说的三条，第一条：ducter.ai 的域名后天到期，还没续费。"
	got := keepClauses(s)
	if unjoin(got) != s {
		t.Fatalf("text changed: %q", got)
	}
	j := string(wordJoiner)
	for _, want := range []string{"到" + j + "期，", "还" + j + "没" + j + "续" + j + "费。", "早" + j + "上" + j + "好。"} {
		if !strings.Contains(got, want) {
			t.Fatalf("%q not kept in %q", want, got)
		}
	}
	if strings.Contains(got, "后"+j+"天") {
		t.Fatalf("a long run lost a break it should keep: %q", got)
	}
	if got := keepClauses("Two ways to fix CI."); got != "Two ways to fix CI." {
		t.Fatalf("latin changed: %q", got)
	}
}
