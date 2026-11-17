package views

import (
	"encoding/json"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/local"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D298: the partner's first words in the conversation (the clay partner
// over them, what they offer, where they were read, 别再看了), and a key
// pasted in the first run and in the conversation.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=../../../../.shots/d298/mac go test ./internal/views -run FirstWords

func firstWordsEvent(lang i18n.Lang) protocol.LogEvent {
	if lang == i18n.ZH {
		return protocol.NewEvent(1, time.Now().UTC().Format(time.RFC3339Nano), "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{
			Text: "晚上好，我是小鸭。我看了看这台电脑上你的 Claude Code 和 Codex 最近在做的事，这几件要不要接着来？",
			First: &protocol.FirstWords{Looked: []string{"claude-code", "codex"}, Starts: []protocol.FirstStart{
				{ID: "local:codex:1", From: "codex", Words: "今天你在 website 里做「把博客换成新主题」，要我接着看看吗？", Draft: "接着 website 里「把博客换成新主题」这件事：先看看它停在哪儿，再跟我说下一步。（文件夹：~/dev/website）"},
				{ID: "local:claude-code:2", From: "claude-code", Words: "昨天你在 hawdb 里做「修 compaction 那个不稳定的测试」，要我接着看看吗？", Draft: "接着 hawdb 里「修 compaction 那个不稳定的测试」这件事：先看看它停在哪儿，再跟我说下一步。（文件夹：~/dev/hawdb）"},
				{ID: "everyday:2", From: "everyday", Words: "周五下午提醒我交水电费", Draft: "周五下午提醒我交水电费"},
			}},
		})
	}
	return protocol.NewEvent(1, time.Now().UTC().Format(time.RFC3339Nano), "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{
		Text: "Good evening, I'm Duckie. I had a look at what your Claude Code and Codex worked on lately on this computer. Want to pick one of these up?",
		First: &protocol.FirstWords{Looked: []string{"claude-code", "codex"}, Starts: []protocol.FirstStart{
			{ID: "local:codex:1", From: "codex", Words: "Today you were on “Move the blog to the new theme” in website. Want me to pick it up?", Draft: "Pick up “Move the blog to the new theme” in website: see where it stopped, then tell me the next step. (Folder: ~/dev/website)"},
			{ID: "local:claude-code:2", From: "claude-code", Words: "Yesterday you were on “Fix the flaky compaction test” in hawdb. Want me to pick it up?", Draft: "Pick up “Fix the flaky compaction test” in hawdb: see where it stopped, then tell me the next step. (Folder: ~/dev/hawdb)"},
			{ID: "everyday:2", From: "everyday", Words: "Remind me on Friday afternoon to pay the utility bill", Draft: "Remind me on Friday afternoon to pay the utility bill"},
		}},
	})
}

func shotTester(t *testing.T, tt *ui.Tester, name string) {
	t.Helper()
	if os.Getenv("DUCTER_SHOTS") == "" {
		return
	}
	f, err := os.Create(filepath.Join(shotsDir(t), name+".png"))
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err := png.Encode(f, tt.Image()); err != nil {
		t.Fatal(err)
	}
}

func TestFirstWordsInTheConversation(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent := iaApp(t, lang)
		app.Status = client.Connected
		name := map[i18n.Lang]string{i18n.ZH: "小鸭", i18n.EN: "Duckie"}[lang]
		app.Receive(protocol.ServerFrame{T: "welcome", Persona: "default", PersonaName: name, HeadSeq: 1})
		app.Receive(protocol.ServerFrame{T: "first_screen", First: &protocol.FirstScreen{Visit: "first"}})
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{firstWordsEvent(lang)}})
		tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{})
		tt.SetScale(2)
		tt.Frame()
		tt.Advance(3 * time.Second) // the wave is over
		tt.Frame()
		w := map[i18n.Lang][]string{
			i18n.ZH: {"我看了看这台电脑上你的", "hawdb", "周五下午提醒我交水电费", "别再看了", "只在这台电脑上读"},
			i18n.EN: {"Want to pick one of these up?", "hawdb", "Remind me on Friday", "Stop looking", "no one but you and the AI you use"},
		}[lang]
		all := strings.Join(tt.Texts(), "\n")
		for _, s := range w {
			if !strings.Contains(all, s) {
				t.Errorf("%s: lacks %q in %q", lang, s, tt.Texts())
			}
		}
		shotTester(t, tt, "first-words-"+string(lang))
		// A start fills the composer; it never sends.
		// Only a message counts as sending: other frames (a ping on a slow runner) may come and go.
		said := func() int {
			n := 0
			for _, f := range *sent {
				if _, ok := f.(protocol.Send); ok {
					n++
				}
			}
			return n
		}
		before := said()
		if err := tt.Click(autospace(map[i18n.Lang]string{i18n.ZH: "昨天你在 hawdb 里做「修 compaction 那个不稳定的测试」，要我接着看看吗？", i18n.EN: "Yesterday you were on “Fix the flaky compaction test” in hawdb. Want me to pick it up?"}[lang])); err == nil {
			tt.Frame()
		}
		if !strings.Contains(app.draft, "hawdb") || said() != before {
			t.Errorf("%s: draft %q, sent %d new messages", lang, app.draft, said()-before)
		}
		// 别再看了: said to the home, and what came from the records goes.
		stop := map[i18n.Lang]string{i18n.ZH: "别再看了", i18n.EN: "Stop looking"}[lang]
		if err := tt.Click(stop); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		if v, ok := lastSent[protocol.LocalAgents](*sent); !ok || v.On {
			t.Errorf("%s: sent %+v", lang, v)
		}
		if strings.Contains(strings.Join(tt.Texts(), "\n"), "hawdb") {
			t.Errorf("%s: the records' offers are still shown", lang)
		}
		shotTester(t, tt, "first-words-stopped-"+string(lang))
	}
}

func TestFirstWordsAskForAKeyWhenNothingCanThink(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		app, sent := iaApp(t, lang)
		app.Status = client.Connected
		app.Receive(protocol.ServerFrame{T: "first_screen", First: &protocol.FirstScreen{Visit: "first", NoBrain: true}})
		ev := protocol.NewEvent(1, time.Now().UTC().Format(time.RFC3339Nano), "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{
			Text:  map[i18n.Lang]string{i18n.ZH: "下午好，我是 Ducter。有什么想做的，跟我说一句就行。不过我现在还没有能用来思考的 AI：登录 Claude Code 或 Codex，或者在下面贴一个 API 密钥，我就能开始。", i18n.EN: "Good afternoon, I'm Ducter. Tell me anything you'd like done. One thing first: I have nothing to think with yet. Sign in to Claude Code or Codex, or paste an API key below, and I'm ready."}[lang],
			First: &protocol.FirstWords{Starts: []protocol.FirstStart{{ID: "everyday:0", From: "everyday", Words: "Plan me a few days in Kyoto next month", Draft: "Plan me a few days in Kyoto next month"}}},
		})
		app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{ev}})
		tt := ui.NewTesterWith(app.View, 1280, 900, ui.TesterOptions{Preferences: ui.Preferences{ReduceMotion: true}})
		tt.SetScale(2)
		tt.Frame()
		title := map[i18n.Lang]string{i18n.ZH: "贴一个 API 密钥，我就能开始", i18n.EN: "Paste an API key and I can start"}[lang]
		if !tt.HasText(title) {
			t.Fatalf("%s: no key card in %q", lang, tt.Texts())
		}
		app.kp.key = "sk-0123456789abcdef0123456789abcdef"
		check := map[i18n.Lang]string{i18n.ZH: "检查", i18n.EN: "Check"}[lang]
		if err := tt.Click(check); err != nil {
			t.Fatal(err)
		}
		tt.Frame()
		k, ok := lastSent[protocol.KeyAdd](*sent)
		if !ok || k.Key != app.kp.key || k.ClientID == "" {
			t.Fatalf("%s: sent %+v", lang, k)
		}
		shotTester(t, tt, "key-card-checking-"+string(lang))
		// The home's answer: no balance, in the partner's words.
		say := &protocol.Words{ZH: "密钥是对的，但 DeepSeek 的账户里没有余额了。充一点值，再检查一次。", EN: "The key is right, but your DeepSeek account has no balance left. Top it up, then check again."}
		app.Receive(protocol.ServerFrame{T: "key_add_result", ClientID: k.ClientID, KeyResult: &protocol.KeyResult{OK: false, Provider: "deepseek", Reason: "no_balance", Say: say}})
		tt.Frame()
		if !tt.HasText(autospace(app.words(*say))) {
			t.Errorf("%s: no result words in %q", lang, tt.Texts())
		}
		shotTester(t, tt, "key-card-no-balance-"+string(lang))
		// Topped up: it works; the card says so, then the home says it can think.
		app.sendKey(app.kp.key)
		tt.Frame()
		k, _ = lastSent[protocol.KeyAdd](*sent)
		good := &protocol.Words{ZH: "好了，这把 DeepSeek 的密钥能用。从现在起我用它来思考和做事。", EN: "That DeepSeek key works. From now on I think and work with it."}
		app.Receive(protocol.ServerFrame{T: "key_add_result", ClientID: k.ClientID, KeyResult: &protocol.KeyResult{OK: true, Provider: "deepseek", Harness: "pi", Say: good}})
		app.Receive(protocol.ServerFrame{T: "first_screen", First: &protocol.FirstScreen{Visit: "first"}})
		tt.Frame()
		if !tt.HasText(autospace(app.words(*good))) {
			t.Errorf("%s: no good words in %q", lang, tt.Texts())
		}
		if app.kp.key != "" {
			t.Errorf("%s: the key stays in the field", lang)
		}
		shotTester(t, tt, "key-card-works-"+string(lang))
	}
}

// keyBackend is a first-run backend that can add a key (`ducter key add`).
type keyBackend struct {
	*fakeBackend
	keys []string
	out  protocol.KeyResult
}

func (k *keyBackend) AddKey(key string) ([]byte, error) {
	k.keys = append(k.keys, key)
	return json.Marshal(k.out)
}

func TestFirstRunTakesAKeyInsteadOfASubscription(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		blocked := local.Report{Checks: []local.Check{
			{ID: "claude", Label: "Claude Code", Status: "missing", Required: true, Detail: map[i18n.Lang]string{i18n.ZH: "没装", i18n.EN: "Not installed"}[lang], Fix: "curl …", Action: "install"},
			{ID: "codex", Label: "Codex", Status: "missing", Detail: map[i18n.Lang]string{i18n.ZH: "没装", i18n.EN: "Not installed"}[lang], Fix: "curl …", Action: "install"},
		}}
		ready := local.Report{OK: true, HarnessReady: true, Checks: []local.Check{
			{ID: "claude", Label: "Claude Code", Status: "missing", Detail: "", Fix: "curl …", Action: "install"},
			{ID: "pi", Label: "pi", Status: "ok"},
		}}
		f := &keyBackend{fakeBackend: &fakeBackend{reports: []local.Report{blocked, ready}}, out: protocol.KeyResult{OK: true, Provider: "deepseek", Harness: "pi", Say: &protocol.Words{ZH: "好了，这把 DeepSeek 的密钥能用。从现在起我用它来思考和做事。", EN: "That DeepSeek key works. From now on I think and work with it."}}}
		h := newSetup(t, lang, f.fakeBackend)
		h.app.Backend = f
		h.app.StartLocal()
		instead := map[i18n.Lang]string{i18n.ZH: "或者，贴一个 API 密钥", i18n.EN: "Or paste an API key"}[lang]
		h.has(instead)
		h.shot("d298-setup-key-closed-" + string(lang))
		h.click(map[i18n.Lang]string{i18n.ZH: "贴密钥", i18n.EN: "Paste a key"}[lang])
		h.app.kp.key = "sk-0123456789abcdef0123456789abcdef"
		h.has(map[i18n.Lang]string{i18n.ZH: "贴一个 API 密钥，我就能开始", i18n.EN: "Paste an API key and I can start"}[lang])
		h.shot("d298-setup-key-open-" + string(lang))
		h.click(map[i18n.Lang]string{i18n.ZH: "检查", i18n.EN: "Check"}[lang])
		h.tt.Frame()
		if len(f.keys) != 1 || f.keys[0] != "sk-0123456789abcdef0123456789abcdef" {
			t.Fatalf("%s: keys %q", lang, f.keys)
		}
		// The key worked: checked again, all set, then the name.
		if f.doctored < 2 {
			t.Errorf("%s: not checked again (%d)", lang, f.doctored)
		}
		h.has(map[i18n.Lang]string{i18n.ZH: "想叫我什么？", i18n.EN: "What should I be called?"}[lang])
	}
}
