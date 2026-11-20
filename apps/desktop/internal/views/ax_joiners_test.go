package views

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// invisibleJoiners are the characters line breaking puts into shown text
// (keepWords, keepTokens) and their kin: a screen reader given one in a
// word spells the word letter by letter (the Mac walk of 0.0.99: 对 U+2060 话).
const invisibleJoiners = "\u2060\u200b\u200c\u200d\ufeff\u00ad"

// axJoinerHits lists every string the last frame gives assistive
// technology that carries an invisible joiner.
func axJoinerHits(tt *ui.Tester, where string) []string {
	var hits []string
	for _, a := range tt.AccessAll() {
		fields := map[string]string{"name": a.Name, "value": a.Value, "description": a.Description, "placeholder": a.Placeholder,
			"role description": a.RoleDescription, "shortcuts": a.KeyShortcuts}
		for i, s := range append(append(append([]string{}, a.Controls...), a.DescribedBy...), a.ErrorMessage...) {
			fields["relation "+string(rune('0'+i%10))] = s
		}
		for f, s := range fields {
			if strings.ContainsAny(s, invisibleJoiners) {
				hits = append(hits, where+": "+f+" "+strings.NewReplacer("\u2060", "<WJ>", "\u200b", "<ZWSP>", "\u200c", "<ZWNJ>", "\u200d", "<ZWJ>", "\ufeff", "<BOM>", "\u00ad", "<SHY>").Replace(s))
			}
		}
	}
	return hits
}

// The whole view tree, zh and en, against the mock home: no accessible
// name, value or description holds the word joiners line breaking puts in
// (D408). The joiners stay in what is drawn.
func TestNoJoinersInAccessibleText(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		t.Run(string(lang), func(t *testing.T) {
			noRelayWait(t)
			h := newHarness(t, lang)
			s := h.app.S
			msg := "帮我看下 HawDB #1592 的 CI 为什么挂了"
			if lang == i18n.EN {
				msg = "Look at why HawDB #1592's CI failed"
			}
			h.tt.Type(msg)
			h.tt.Key(0, ui.KeyEnter)
			h.until("the decision", func() bool { return s.PendingDecision("t-ci-1") != nil })
			// A reply with short tokens keepTokens joins, and a done task
			// whose title keepWords joins.
			h.app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{
				ev("channel", protocol.KindAIMsg, protocol.AIMsg{Text: "修好了 hawdb-net 上的 ducter/fix-ci，在 `~/dev/ducter` 里。"}),
			}})
			finish(h, "t-joined", "修 compaction 测试")
			settle := func() {
				end := time.Now().Add(250 * time.Millisecond)
				h.until("settled", func() bool { return time.Now().After(end) })
			}
			var hits []string
			visit := func(where string, open func()) {
				open()
				settle()
				hits = append(hits, axJoinerHits(h.tt, where)...)
			}
			visit("conversation", func() { h.app.Route = RouteConversation })
			visit("on hand", func() { h.app.Route = RouteOnHand })
			// A title drawn with joiners (keepWords) is read whole.
			if _, ok := h.tt.Access("提醒你回 HawDB #1601 的评论"); !ok {
				t.Error("On hand's joined title isn't read as its words")
			}
			visit("task", func() { h.app.OpenTask("t-ci-1") })
			visit("done task", func() { h.app.OpenTask("t-joined") })
			visit("devices", h.app.OpenDevices)
			visit("past", func() { h.app.OpenPast("") })
			visit("did", h.app.OpenDid)
			for _, tab := range settingsTabs {
				visit("settings "+tab, func() { h.app.openTab(tab) })
			}
			sort.Strings(hits)
			hits = compactStrings(hits)
			for _, x := range hits {
				t.Error(x)
			}
		})
	}
}

func compactStrings(xs []string) []string {
	var out []string
	for i, x := range xs {
		if i == 0 || x != xs[i-1] {
			out = append(out, x)
		}
	}
	return out
}

// uiText keeps the joiners in what is drawn and leaves them out of what
// is read (D408).
func TestUITextReadsWithoutJoiners(t *testing.T) {
	shown := keepWords(autospace("修 hawdb-net 测试"))
	if !strings.ContainsRune(shown, wordJoiner) {
		t.Fatalf("the fixture has no joiner: %q", shown)
	}
	tt := ui.NewTester(func(c *ui.Context) { uiText(c, shown) }, 400, 100)
	tt.Frame()
	if _, ok := tt.Access("修 hawdb-net 测试"); !ok {
		t.Errorf("not read as its words: %q", axJoinerHits(tt, "text"))
	}
}

// Every text the views draw goes through uiText, so a joiner never
// reaches a screen reader (D408).
func TestViewsDrawTextThroughUIText(t *testing.T) {
	files, _ := filepath.Glob("*.go")
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") || f == "type.go" {
			continue
		}
		b, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(b), "ui.Text(") {
			t.Errorf("%s calls ui.Text: use uiText, which reads text without its line-breaking joiners", f)
		}
	}
}
