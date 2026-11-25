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
	for _, want := range []string{"后" + j + "天" + j + "到" + j + "期，", "还" + j + "没" + j + "续" + j + "费。", "早" + j + "上" + j + "好。"} {
		if !strings.Contains(got, want) {
			t.Fatalf("%q not kept in %q", want, got)
		}
	}
	// D564: a clause up to keepAllRun is whole, as keep-all on the web: 的域名后天到期 never breaks.
	if !strings.Contains(got, "的"+j+"域"+j+"名"+j+"后"+j+"天"+j+"到"+j+"期，") {
		t.Fatalf("a short clause not kept whole: %q", got)
	}
	// A longer run keeps its breaks but for its last four.
	long := keepClauses("我会把上个月的账单和收据都整理成一张表。")
	if strings.Contains(long, "我"+j+"会") || !strings.Contains(long, "一"+j+"张"+j+"表。") {
		t.Fatalf("a long run: %q", long)
	}
	// D561: a short Latin token keeps its hyphens; D564: a text kept twice is kept once.
	if got := keepClauses("用 GPT-6.2-Sol 来做"); !strings.Contains(got, "GPT"+j+"-"+j+"6.2"+j+"-"+j+"Sol") {
		t.Fatalf("token not kept: %q", got)
	}
	for _, s := range []string{s, "Two ways to fix CI.", "在 ~/dev/ducter 里，用 hawdb-net 跑"} {
		if once := keepClauses(s); keepClauses(once) != once {
			t.Fatalf("not idempotent: %q then %q", once, keepClauses(once))
		}
	}
	// D564: a title (no stop) keeps its Latin breaks: never "When I / notice something".
	if got := keepClauses("When I notice something"); got != "When I notice something" {
		t.Fatalf("a title was joined: %q", got)
	}
	// D564: hasText and the accessible name read a kept text as said.
	if asSaid(keepClauses("Start it again to use it.")) != "Start it again to use it." {
		t.Fatal("asSaid kept a no-break space")
	}
	if got := keepClauses("Two ways to fix CI."); got != "Two ways to fix\u00a0CI." {
		t.Fatalf("latin changed: %q", got)
	}
}
