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
}
