package views

import (
	"encoding/json"
	"testing"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
)

// D266: the harness's own background work as a step, said alike in zh and en.
func TestBackgroundStepWords(t *testing.T) {
	zh := &App{L: i18n.New(i18n.ZH)}
	en := &App{L: i18n.New(i18n.EN)}
	cases := []struct {
		raw          string
		zh, en       string
		failed, isBg bool
	}{
		{`{"background":{"act":"started","type":"shell","what":"Run the WAL bench"}}`, "在后台跑着：Run the WAL bench", "Running in the background: Run the WAL bench", false, true},
		{`{"background":{"act":"started","type":"agent"}}`, "在后台跑着", "Running in the background", false, true},
		{`{"background":{"act":"ended","what":"bench"}}`, "后台的事做完了：bench", "Finished in the background: bench", false, true},
		{`{"background":{"act":"ended"}}`, "后台的事做完了", "Finished in the background", false, true},
		{`{"background":{"act":"stopped","what":"bun run dev"}}`, "后台的事停下了：bun run dev", "Stopped in the background: bun run dev", false, true},
		{`{"background":{"act":"failed"}}`, "后台的事做完了", "Finished in the background", true, true},
		{`{"backgroundCeiling":true}`, "", "", false, false},
		{`{"background":{"act":"other"}}`, "", "", false, false},
	}
	for _, c := range cases {
		st, failed, ok := backgroundStep(json.RawMessage(c.raw))
		if ok != c.isBg || failed != c.failed {
			t.Fatalf("%s: ok=%v failed=%v", c.raw, ok, failed)
		}
		if !ok {
			continue
		}
		if st.Kind != "background" {
			t.Fatalf("%s: kind %q", c.raw, st.Kind)
		}
		r := &StepRow{Step: &st, N: 1, Outcome: "ok"}
		if w, _ := zh.rowWords(r); w != c.zh {
			t.Errorf("%s zh: %q, want %q", c.raw, w, c.zh)
		}
		if w, _ := en.rowWords(r); w != c.en {
			t.Errorf("%s en: %q, want %q", c.raw, w, c.en)
		}
	}
}
