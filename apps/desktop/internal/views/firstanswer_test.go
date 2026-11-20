package views

import (
	"strings"
	"testing"
	"time"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/client"
	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/local"
	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// D440: a first answer with no plan. Under the key card, 还没有密钥？/ No
// key yet?: the way to a key for where the home is (its own page, three
// steps, one honest note), the other way as a link; a key pasted whole
// checks by itself; a key whose pi isn't there yet says it works, then
// "setting up", then ready.
//
//	DUCTER_SHOTS=1 DUCTER_SHOTS_DIR=../../../../.shots/first-answer go test ./internal/views -run FirstAnswer

// The ways as the home sends them (packages/protocol/src/key-routes.ts).
var routesChina = []protocol.KeyRoute{
	{ID: "kimi-voucher", Provider: "moonshot-cn", Name: protocol.Words{ZH: "Kimi", EN: "Kimi"}, URL: "https://platform.moonshot.cn/console/api-keys", Free: true,
		Line: protocol.Words{ZH: "用中国大陆手机号注册，送 15 元体验额度，够聊很久。", EN: "Sign up with a mainland China mobile number and get ¥15 of trial credit."},
		Steps: []protocol.Words{
			{ZH: "用手机号登录 Kimi 开放平台。", EN: "Sign in to the Kimi platform with your phone number."},
			{ZH: "在「API Key 管理」里新建一个，复制。", EN: "Under API keys, make a new one and copy it."},
			{ZH: "回到这里，贴进上面的框，我自己会检查。", EN: "Come back and paste it in the field above. I check it by myself."},
		}},
	{ID: "deepseek-topup", Provider: "deepseek", Name: protocol.Words{ZH: "DeepSeek", EN: "DeepSeek"}, URL: "https://platform.deepseek.com/api_keys",
		Line: protocol.Words{ZH: "手机号注册，要先实名、充一点钱；几块钱能用很久。", EN: "Sign up with a phone number; it needs ID verification and a small top-up. A few yuan lasts a long time."},
		Steps: []protocol.Words{
			{ZH: "用手机号登录 DeepSeek 开放平台，实名后充一点值。", EN: "Sign in to the DeepSeek platform with your phone, verify, and top up a little."},
			{ZH: "在「API keys」里创建一个，复制。", EN: "Under API keys, create one and copy it."},
			{ZH: "回到这里，贴进上面的框，我自己会检查。", EN: "Come back and paste it in the field above. I check it by myself."},
		}},
}

var routesElsewhere = []protocol.KeyRoute{
	{ID: "gemini", Provider: "google", Name: protocol.Words{ZH: "Google Gemini", EN: "Google Gemini"}, URL: "https://aistudio.google.com/apikey", Free: true,
		Line: protocol.Words{ZH: "免费，用你的 Google 账号，不用信用卡，大约一分钟。", EN: "Free with your Google account, no card, about a minute."},
		Steps: []protocol.Words{
			{ZH: "用 Google 账号登录 AI Studio。", EN: "Sign in to AI Studio with your Google account."},
			{ZH: "点「Create API key」，再点复制。", EN: "Click “Create API key”, then copy it."},
			{ZH: "回到这里，贴进上面的框，我自己会检查。", EN: "Come back and paste it in the field above. I check it by myself."},
		},
		Note: &protocol.Words{ZH: "免费用的时候，Google 可能会用你发的内容改进它的模型。别发敏感的东西；在意的话，以后换成付费的就不会。", EN: "On the free tier Google may use what you send to improve its models. Don't send anything sensitive; a paid key later stops that."}},
	{ID: "openrouter-free", Provider: "openrouter", Name: protocol.Words{ZH: "OpenRouter", EN: "OpenRouter"}, URL: "https://openrouter.ai/settings/keys", Free: true,
		Line: protocol.Words{ZH: "免费，用 Google 或 GitHub 账号登录，每天能问五十次左右。", EN: "Free with a Google or GitHub sign-in, about fifty questions a day."},
		Steps: []protocol.Words{
			{ZH: "登录 OpenRouter。", EN: "Sign in to OpenRouter."},
			{ZH: "点「Create」建一个密钥，再复制。", EN: "Click “Create” to make a key, then copy it."},
			{ZH: "回到这里，贴进上面的框，我自己会检查。", EN: "Come back and paste it in the field above. I check it by myself."},
		}},
}

func firstAnswerApp(t *testing.T, lang i18n.Lang, routes []protocol.KeyRoute) (*App, *[]any, *[]string) {
	app, sent := iaApp(t, lang)
	app.Status = client.Connected
	var opened []string
	app.OpenExternal = func(u string) error { opened = append(opened, u); return nil }
	app.Receive(protocol.ServerFrame{T: "first_screen", First: &protocol.FirstScreen{Visit: "first", NoBrain: true, KeyRoutes: routes}})
	ev := protocol.NewEvent(1, time.Now().UTC().Format(time.RFC3339Nano), "default", "channel", protocol.OriginPartner, protocol.KindAIMsg, protocol.AIMsg{
		Text:  map[i18n.Lang]string{i18n.ZH: "下午好，我是 Ducter。有什么想做的，跟我说一句就行。不过我现在还没有能用来思考的 AI：登录 Claude Code 或 Codex，或者在下面贴一个 API 密钥，我就能开始。", i18n.EN: "Good afternoon, I'm Ducter. Tell me anything you'd like done. One thing first: I have nothing to think with yet. Sign in to Claude Code or Codex, or paste an API key below, and I'm ready."}[lang],
		First: &protocol.FirstWords{Starts: []protocol.FirstStart{{ID: "everyday:0", From: "everyday", Words: map[i18n.Lang]string{i18n.ZH: "周末带爸妈去哪儿吃饭好？", i18n.EN: "Where should I take my parents for dinner this weekend?"}[lang]}}},
	})
	app.Receive(protocol.ServerFrame{T: "events", Events: []protocol.LogEvent{ev}})
	return app, sent, &opened
}

func TestFirstAnswerWaysToAKey(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		for _, region := range []string{"china", "elsewhere"} {
			routes := map[string][]protocol.KeyRoute{"china": routesChina, "elsewhere": routesElsewhere}[region]
			for _, dark := range []bool{false, true} {
				app, sent, opened := firstAnswerApp(t, lang, routes)
				tt := ui.NewTesterWith(app.View, 1400, 1200, ui.TesterOptions{Dark: dark, Preferences: ui.Preferences{ReduceMotion: true}})
				tt.SetScale(2)
				tt.Frame()
				paper := map[bool]string{false: "light", true: "dark"}[dark]
				name := "mac-" + region + "-" + string(lang) + "-" + paper
				first := routes[0]
				for _, want := range []string{app.L.T("key.route.none"), autospace(app.words(first.Line)), autospace(app.words(first.Steps[1]))} {
					if !tt.HasText(want) {
						t.Fatalf("%s: no %q in %q", name, want, tt.Texts())
					}
				}
				shotTester(t, tt, name+"-ways")
				// Its own page, in the browser; Ducter makes no account and no key.
				if err := tt.Click(app.L.T("key.route.go", app.words(first.Name))); err != nil {
					t.Fatal(err)
				}
				if len(*opened) != 1 || (*opened)[0] != first.URL {
					t.Fatalf("%s: opened %q", name, *opened)
				}
				// The other way, one tap.
				if err := tt.Click(app.L.T("key.route.other", app.words(routes[1].Name))); err != nil {
					t.Fatal(err)
				}
				tt.Frame()
				if !tt.HasText(autospace(app.words(routes[1].Steps[0]))) {
					t.Errorf("%s: the other way isn't shown: %q", name, tt.Texts())
				}
				app.kp.route = 0
				// A key pasted whole checks by itself.
				app.kp.key = "sk-" + strings.Repeat("0", 32)
				tt.Frame()
				k, ok := lastSent[protocol.KeyAdd](*sent)
				if !ok || k.Key != app.kp.key {
					t.Fatalf("%s: a pasted key wasn't checked by itself (%+v)", name, k)
				}
				// Works; pi is being put in place: said, and still waiting for the final word.
				prep := &protocol.Words{ZH: "这把 Kimi 的密钥能用。我在这台电脑上装好用它要的东西，一两分钟就好；想问什么，现在就可以发给我。", EN: "That Kimi key works. I'm setting up what I need to use it on this computer, a minute or two. You can send me your question now."}
				app.Receive(protocol.ServerFrame{T: "key_add_result", ClientID: k.ClientID, KeyResult: &protocol.KeyResult{OK: true, Provider: "moonshot-cn", Harness: "pi", Preparing: true, Say: prep}})
				tt.Frame()
				if !tt.HasText(autospace(app.words(*prep))) || !tt.HasText(app.L.T("key.paste.preparing")) {
					t.Fatalf("%s: preparing not shown: %q", name, tt.Texts())
				}
				if app.kp.pending == "" {
					t.Fatalf("%s: stopped waiting after the first answer", name)
				}
				shotTester(t, tt, name+"-preparing")
				good := &protocol.Words{ZH: "好了，这把 Kimi 的密钥能用。从现在起我用它来思考和做事。", EN: "That Kimi key works. From now on I think and work with it."}
				app.Receive(protocol.ServerFrame{T: "key_add_result", ClientID: k.ClientID, KeyResult: &protocol.KeyResult{OK: true, Provider: "moonshot-cn", Harness: "pi", Say: good}})
				app.Receive(protocol.ServerFrame{T: "first_screen", First: &protocol.FirstScreen{Visit: "first"}})
				tt.Frame()
				if !tt.HasText(autospace(app.words(*good))) {
					t.Errorf("%s: no good words: %q", name, tt.Texts())
				}
				if tt.HasText(app.L.T("key.route.none")) {
					t.Errorf("%s: the ways stay after it can think", name)
				}
				shotTester(t, tt, name+"-works")
			}
		}
	}
}

func TestFirstAnswerFirstRunOffersTheWays(t *testing.T) {
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		blocked := local.Report{KeyRoutes: routesElsewhere, Checks: []local.Check{
			{ID: "claude", Label: "Claude Code", Status: "missing", Required: true, Detail: map[i18n.Lang]string{i18n.ZH: "没装", i18n.EN: "Not installed"}[lang], Fix: "curl …", Action: "install"},
			{ID: "codex", Label: "Codex", Status: "missing", Detail: map[i18n.Lang]string{i18n.ZH: "没装", i18n.EN: "Not installed"}[lang], Fix: "curl …", Action: "install"},
		}}
		f := &keyBackend{fakeBackend: &fakeBackend{reports: []local.Report{blocked, blocked}}, out: protocol.KeyResult{OK: true, Provider: "google", Harness: "pi"}}
		h := newSetup(t, lang, f.fakeBackend)
		h.app.Backend = f
		h.app.StartLocal()
		h.has(map[i18n.Lang]string{i18n.ZH: "或者，贴一个 API 密钥", i18n.EN: "Or paste an API key"}[lang])
		h.click(map[i18n.Lang]string{i18n.ZH: "贴密钥", i18n.EN: "Paste a key"}[lang])
		h.has(h.app.L.T("key.route.none"))
		h.has(autospace(h.app.words(routesElsewhere[0].Line)))
		h.shot("mac-setup-ways-" + string(lang))
	}
}
