package imessage

import (
	"fmt"
	"regexp"
	"strings"
)

// What the bridge itself says in iMessage, in the language of the app
// (design/imessage.md; the glossary row "iMessage").
var words = map[string][2]string{ // zh, en
	"linked":    {"连上了。以后在这里给我发消息就行。", "We're connected. Message me here any time."},
	"ask.reply": {"回「好」就%s，回「先等等」就先放着（点赞、点踩也行）。", "Reply “ok” to %s, or “wait” to hold it (a Like or Dislike works too)."},
	"ask.app":   {"这件得在 Ducter 里定：打开 Ducter 看看。", "This one is decided in Ducter: open Ducter to see it."},
	"ask.safe":  {"有件事要你在 Ducter 里亲自定，这里不方便说。", "Something needs you in Ducter. It isn't something to say here."},
	"morning":   {"夜里有 %d 件事等你定，这是最新的一件：", "%d things waited overnight. Here's the newest:"},
	"more":      {"……后面还有，在 Ducter 里看全文。", "…there's more. Open Ducter for all of it."},
	"hidden":    {"（这里不方便发，在 Ducter 里看）", "(not for here; see it in Ducter)"},
	"self":      {"%s：", "%s: "},
	"did.go":    {"好，这就%s。", "OK, I'll %s."},
	"did.hold":  {"好，先放着。", "OK, holding it."},
}

func say(lang, key string, args ...any) string {
	w := words[key]
	s := w[0]
	if lang == "en" {
		s = w[1]
	}
	if len(args) > 0 {
		return fmt.Sprintf(s, args...)
	}
	return s
}

// The words that answer the newest open card (research/88 §7.2).
var (
	goWords   = []string{"好", "好的", "好啊", "行", "可以", "照做", "做吧", "ok", "okay", "go", "yes", "y", "sure", "\U0001F44D"}
	holdWords = []string{"先等等", "等等", "等一下", "先别", "先放着", "不", "不要", "别", "hold", "wait", "no", "not now", "n", "\U0001F44E"}
)

// answerOf is "go", "hold" or "" for a short reply.
func answerOf(text string) string {
	t := strings.ToLower(strings.TrimSpace(text))
	t = strings.TrimRight(t, "。！!.~～ ，,")
	for _, w := range goWords {
		if t == w {
			return "go"
		}
	}
	for _, w := range holdWords {
		if t == w {
			return "hold"
		}
	}
	return ""
}

// What never goes into a chat app: things shaped like a key or a token.
var secretish = regexp.MustCompile(`\b(sk-[A-Za-z0-9_\-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9\-]{10,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}|[A-Fa-f0-9]{40,}|[A-Za-z0-9+/]{48,}={0,2})\b`)

var (
	mdFence  = regexp.MustCompile("(?s)```[a-zA-Z0-9]*\n?(.*?)```")
	mdBold   = regexp.MustCompile(`\*\*(.+?)\*\*|__(.+?)__`)
	mdCode   = regexp.MustCompile("`([^`]+)`")
	mdHead   = regexp.MustCompile(`(?m)^#{1,6}\s+`)
	mdLink   = regexp.MustCompile(`\[([^\]]+)\]\(([^)]+)\)`)
	mdBullet = regexp.MustCompile(`(?m)^\s*[-*]\s+`)
)

// MaxText is how long one iMessage from the partner gets.
const MaxText = 1800

// plain turns the partner's Markdown into what reads well in Messages, takes
// out anything shaped like a secret, and keeps it short.
func plain(lang, s string) string {
	s = mdFence.ReplaceAllString(s, "$1")
	s = mdBold.ReplaceAllString(s, "$1$2")
	s = mdCode.ReplaceAllString(s, "$1")
	s = mdHead.ReplaceAllString(s, "")
	s = mdLink.ReplaceAllString(s, "$1 $2")
	s = mdBullet.ReplaceAllString(s, "· ")
	s = secretish.ReplaceAllString(s, say(lang, "hidden"))
	s = strings.TrimSpace(s)
	if r := []rune(s); len(r) > MaxText {
		s = strings.TrimSpace(string(r[:MaxText])) + "\n" + say(lang, "more")
	}
	return s
}
