package protocol

import "testing"

// research/244 rule 5: the partner's words keep every point, else the card keeps its question.
func TestKeepsPoints(t *testing.T) {
	cases := []struct {
		q, s string
		want bool
	}{
		{"1. 去掉开关\n2. 改文案", "1. 去掉开关\n2. 改文案", true},
		{"1. 去掉开关\n2. 改文案", "我建议去掉开关。", false},
		{"1. 去掉开关\n2. 改文案\n3. 补测试\n4. 加提示", "按同事说的，去掉开关吗？", false},
		{"PR #11230 里的开关去掉吗？", "这个开关去掉吗？", false},
		{"PR #11230 里的开关去掉吗？", "PR #11230 里的开关去掉吗？", true},
		{"要不要 rebase？", "要不要 rebase？", true},
	}
	for _, c := range cases {
		if got := KeepsPoints(c.q, c.s); got != c.want {
			t.Errorf("KeepsPoints(%q, %q) = %v, want %v", c.q, c.s, got, c.want)
		}
	}
}
