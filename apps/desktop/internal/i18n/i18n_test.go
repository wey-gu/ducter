package i18n

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"
)

// Every key has both languages, and the same verbs in each.
func TestTablesMatch(t *testing.T) {
	verbs := regexp.MustCompile(`%(\[\d\])?[a-z]`)
	count := func(s string) int { return len(verbs.FindAllString(s, -1)) }
	for k, v := range zh {
		e, ok := en[k]
		if !ok {
			t.Errorf("%q: no English", k)
			continue
		}
		if count(v) != count(e) {
			t.Errorf("%q: %d verbs in zh, %d in en", k, count(v), count(e))
		}
	}
	for k := range en {
		if _, ok := zh[k]; !ok {
			t.Errorf("%q: no Chinese", k)
		}
	}
}

// Every key the views use is in the tables.
func TestViewsKeysCovered(t *testing.T) {
	dir := filepath.Join("..", "views")
	files, _ := filepath.Glob(filepath.Join(dir, "*.go"))
	fs := token.NewFileSet()
	var missing []string
	seen := 0
	for _, f := range files {
		if strings.HasSuffix(f, "_test.go") {
			continue
		}
		src, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		file, err := parser.ParseFile(fs, f, src, 0)
		if err != nil {
			t.Fatal(err)
		}
		ast.Inspect(file, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok || len(call.Args) == 0 {
				return true
			}
			sel, ok := call.Fun.(*ast.SelectorExpr)
			if !ok || sel.Sel.Name != "T" {
				return true
			}
			lit, ok := call.Args[0].(*ast.BasicLit)
			if !ok || lit.Kind != token.STRING {
				return true
			}
			key, _ := strconv.Unquote(lit.Value)
			seen++
			if _, ok := zh[key]; !ok {
				missing = append(missing, key)
			}
			return true
		})
	}
	if seen < 40 {
		t.Errorf("found only %d keys in the views", seen)
	}
	sort.Strings(missing)
	if len(missing) > 0 {
		t.Errorf("keys missing from the tables: %v", missing)
	}
	// Keys built from states.
	for _, s := range []string{"queued", "working", "needs_you", "blocked", "done_claimed", "done", "failed", "dropped", "superseded"} {
		if _, ok := zh["state."+s]; !ok {
			t.Errorf("state.%s missing", s)
		}
	}
	for _, s := range []string{"go", "hold", "reply", "default"} {
		if _, ok := zh["decision.resolved."+s]; !ok {
			t.Errorf("decision.resolved.%s missing", s)
		}
	}
}

func TestNoCourtVocabulary(t *testing.T) {
	banned := []string{"准", "驳", "奏", "批", "陛下", "approve", "reject", "seal", "throne"}
	for _, table := range []Table{zh, en} {
		for k, v := range table {
			for _, b := range banned {
				if strings.Contains(strings.ToLower(v), b) {
					t.Errorf("%q = %q uses %q", k, v, b)
				}
			}
		}
	}
}

func TestDetect(t *testing.T) {
	t.Setenv("DUCTER_LOCALE", "")
	t.Setenv("LANG", "")
	if l := Detect([]string{"zh-Hans-CN", "en"}); l != ZH {
		t.Errorf("zh-Hans: %v", l)
	}
	if l := Detect([]string{"ja", "en-US"}); l != EN {
		t.Errorf("ja, en: %v", l)
	}
	t.Setenv("DUCTER_LOCALE", "en")
	if l := Detect([]string{"zh-CN"}); l != EN {
		t.Errorf("override: %v", l)
	}
	if got := New(EN).T("decision.default.go", "5 min", "rebase"); got != "If you don't answer, I'll rebase in 5 min. It can be undone." {
		t.Errorf("en order: %q", got)
	}
}

// D292: any tag reads the first table on its chain; Locale keeps the tag.
func TestLocaleChain(t *testing.T) {
	for tag, want := range map[Lang]Lang{"ko": EN, "zh-TW": ZH, "zh-Hant": ZH, "en-GB": EN, "": EN, "xx-bogus!": EN} {
		if s := New(tag); s.Lang != want {
			t.Errorf("New(%q).Lang = %q, want %q", tag, s.Lang, want)
		}
	}
	if s := New("ko_KR"); s.Locale != "ko-KR" {
		t.Errorf("Locale = %q", s.Locale)
	}
	t.Setenv("DUCTER_LOCALE", "")
	t.Setenv("LANG", "C")
	if l := Detect([]string{"ko-KR", "zh-CN"}); l != ZH {
		t.Errorf("ko, zh: %v", l)
	}
	if l := Detect([]string{"ko-KR"}); l != EN {
		t.Errorf("ko: %v", l)
	}
	t.Setenv("LANG", "zh_CN.UTF-8")
	if l := Detect(nil); l != ZH {
		t.Errorf("LANG: %v", l)
	}
	if got := FromText("안녕하세요, 도와줄 수 있나요?"); got != "ko" {
		t.Errorf("FromText ko: %q", got)
	}
}

func TestCalDates(t *testing.T) {
	at := time.Date(2026, 11, 18, 9, 0, 0, 0, time.Local)
	now := time.Date(2026, 11, 16, 9, 0, 0, 0, time.Local)
	next := now.AddDate(1, 0, 0)
	for _, c := range []struct{ got, want string }{
		{CalDate(ZH, at, now), "11 月 18 日" + calNBSP + "周三"},
		{CalDate(ZH, at, next), "2026 年 11 月 18 日" + calNBSP + "周三"},
		{CalDate(EN, at, now), "Wed, Nov 18"},
		{CalDate("ko", at, next), "Wed, Nov 18, 2026"},
		{CalMD(ZH, at), "11 月 18 日"},
		{CalMD(EN, at), "Nov 18"},
		{CalRange(ZH, now, at), "11 月 16 日–18 日"},
		{CalRange(EN, now, at), "Nov 16–18"},
		{CalRange(EN, now, at.AddDate(0, 1, 0)), "Nov 16–Dec 18"},
	} {
		if c.got != c.want {
			t.Errorf("got %q, want %q", c.got, c.want)
		}
	}
}

func TestPluralKeys(t *testing.T) {
	en := New(EN)
	if got := en.N("conv.new", 1); got != en.T("conv.new.one") {
		t.Errorf("N one: %q", got)
	}
	if got := en.N("no.such.key", 2); got != "no.such.key" {
		t.Errorf("N missing: %q", got)
	}
}

func TestFromText(t *testing.T) {
	for text, want := range map[string]Lang{"帮我修 CI": ZH, "fix the flaky test": EN, "ok": "", "123 !": ""} {
		if got := FromText(text); got != want {
			t.Errorf("%q: %q, want %q", text, got, want)
		}
	}
}

func TestChineseNameSitsFlush(t *testing.T) {
	zh := New(ZH)
	if got := zh.T("empty.conversation.title", "小鸭"); got != "你好，我是小鸭。" {
		t.Errorf("got %q", got)
	}
	if got := zh.T("face.done", "小鸭"); got != "小鸭刚做完一件事" {
		t.Errorf("got %q", got)
	}
	if got := zh.T("face.done", "Ducter"); got != "Ducter 刚做完一件事" {
		t.Errorf("got %q", got)
	}
}
