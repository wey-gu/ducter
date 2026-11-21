package views

import "testing"

// The same cases as packages/protocol/test/fuzzy.test.ts: the Mac and the
// web find the same tasks for the same words (D456).
func TestLooseFind(t *testing.T) {
	cases := []struct {
		word, hay, title string
		want             bool
	}{
		{"compactoin", "compaction 调度器改成按层限流", "compaction 调度器改成按层限流", true},
		{"compcation", "l0 compaction 卡住不动", "L0 compaction 卡住不动", true},
		{"wgc", "wal 的 group commit", "WAL 的 group commit", true},
		{"lruk", "block cache 换成 lru-k", "block cache 换成 LRU-K", true},
		{"bcl", "block cache 换成 lru-k", "block cache 换成 LRU-K", true},
		{"blom", "bloom filter 误判率太高", "bloom filter 误判率太高", false}, // four letters: too short to forgive
		{"wal", "hawdb 重启后丢数据", "hawdb 重启后丢数据", false},
		{"cmpctn", "compaction", "compaction", false}, // more than one slip
		{"xyz", "range scan 基准", "range scan 基准", false},
	}
	for _, c := range cases {
		if got := looseMatch(c.word, c.hay, c.title); got != c.want {
			t.Errorf("looseMatch(%q, %q) = %v, want %v", c.word, c.title, got, c.want)
		}
	}
}
