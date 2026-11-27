package i18n

import "testing"

// D628: the waiting label is 等结果 in Chinese, never the standalone 在等; English says Waiting.
func TestWaitingWords(t *testing.T) {
	zhWant := map[string]string{
		"lane.waiting": "等结果", "state.blocked": "等结果", "count.waiting": "等结果",
		"isles.tag.waits": "等结果", "hand.handed.waiting": "等结果",
		"face.waiting": "%s 等结果", "partner.face.waiting": "等结果",
		"header.waiting": "%d 个等结果", "onhand.say.waiting": "%d 个等结果",
		"handoff.settled": "用不着了：%s", "handoff.settled.merged": "PR 已合并", "handoff.settled.closed": "PR 已关闭",
	}
	for k, want := range zhWant {
		if got, ok := zh[k]; !ok || got != want {
			t.Errorf("%q: %q, want %q", k, got, want)
		}
	}
	for _, k := range []string{"lane.waiting", "state.blocked", "count.waiting", "isles.tag.waits"} {
		if en[k] != "Waiting" {
			t.Errorf("%q: %q, want Waiting", k, en[k])
		}
	}
}
