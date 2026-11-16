package lang

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// The TypeScript (packages/protocol/test/lang.test.ts) passes the same cases.
func TestLangFixture(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/protocol/fixtures/lang.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Detect []struct {
			Text string  `json:"text"`
			Lang *string `json:"lang"`
			Sure bool    `json:"sure"`
		} `json:"detect"`
		Conversation []struct {
			Name  string    `json:"_"`
			Texts []string  `json:"texts"`
			Want  []*string `json:"want"`
		} `json:"conversation"`
		InLanguage []struct {
			Text string `json:"text"`
			Lang string `json:"lang"`
			Want bool   `json:"want"`
		} `json:"inLanguage"`
		Normalize [][2]*string         `json:"normalize"`
		Chain     [][2]json.RawMessage `json:"chain"`
		Negotiate [][2]json.RawMessage `json:"negotiate"`
	}
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatal(err)
	}
	if len(f.Detect) == 0 || len(f.Conversation) == 0 || len(f.InLanguage) == 0 || len(f.Normalize) == 0 || len(f.Chain) == 0 || len(f.Negotiate) == 0 {
		t.Fatal("no cases")
	}
	str := func(p *string) string {
		if p == nil {
			return ""
		}
		return *p
	}
	for _, c := range f.Detect {
		d := Detect(c.Text)
		if d.Lang != str(c.Lang) || (c.Lang != nil && d.Sure != c.Sure) {
			t.Errorf("Detect(%q) = %+v, want %q sure=%v", c.Text, d, str(c.Lang), c.Sure)
		}
	}
	for _, c := range f.Conversation {
		prev := ""
		for i, text := range c.Texts {
			prev = Resolve(text, prev)
			if prev != str(c.Want[i]) {
				t.Errorf("%s: after %q got %q, want %q", c.Name, text, prev, str(c.Want[i]))
			}
		}
		if got := OfTexts(c.Texts, ""); got != str(c.Want[len(c.Want)-1]) {
			t.Errorf("%s: OfTexts = %q", c.Name, got)
		}
	}
	for _, c := range f.InLanguage {
		if got := InLanguage(c.Text, c.Lang); got != c.Want {
			t.Errorf("InLanguage(%q, %s) = %v, want %v", c.Text, c.Lang, got, c.Want)
		}
	}
	for _, c := range f.Normalize {
		if got := NormalizeTag(str(c[0])); got != str(c[1]) {
			t.Errorf("NormalizeTag(%q) = %q, want %q", str(c[0]), got, str(c[1]))
		}
	}
	for _, c := range f.Chain {
		var tag string
		var want []string
		_ = json.Unmarshal(c[0], &tag)
		_ = json.Unmarshal(c[1], &want)
		if got := FallbackChain(tag); !reflect.DeepEqual(got, want) {
			t.Errorf("FallbackChain(%q) = %v, want %v", tag, got, want)
		}
	}
	for _, c := range f.Negotiate {
		var pref []string
		var want string
		_ = json.Unmarshal(c[0], &pref)
		_ = json.Unmarshal(c[1], &want)
		if got := Negotiate(pref, UILangs); got != want {
			t.Errorf("Negotiate(%v) = %q, want %q", pref, got, want)
		}
	}
}

// The Go table is a copy of packages/protocol/src/languages.json.
func TestLanguagesMatchJSON(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/protocol/src/languages.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Languages []struct {
			Tag    string `json:"tag"`
			Name   string `json:"name"`
			En     string `json:"en"`
			Common bool   `json:"common"`
			HasUI  bool   `json:"hasUI"`
		} `json:"languages"`
	}
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatal(err)
	}
	var want []Language
	for _, l := range f.Languages {
		want = append(want, Language{l.Tag, l.Name, l.En, l.Common, l.HasUI})
	}
	if !reflect.DeepEqual(Languages, want) {
		t.Errorf("Languages differs from languages.json:\n got %v\nwant %v", Languages, want)
	}
	if !reflect.DeepEqual(UILangs, []string{"zh", "en"}) {
		t.Errorf("UILangs = %v", UILangs)
	}
}

func TestNamesWordsPlurals(t *testing.T) {
	eq := func(got, want string) {
		t.Helper()
		if got != want {
			t.Errorf("got %q, want %q", got, want)
		}
	}
	eq(LangName("ko"), "Korean (한국어)")
	eq(LangName("en"), "English")
	eq(LangName("zh"), "Chinese (简体中文)")
	eq(LangName("pt-BR"), "Portuguese (Português)")
	eq(Autonym("ja"), "日本語")
	eq(Autonym("zh-TW"), "繁體中文")
	tables := map[string]string{"zh": "好", "en": "OK"}
	eq(Words(tables, "zh-TW"), "好")
	eq(Words(tables, "ko"), "OK")
	eq(Fill("接了：「{title}」，{n} 件", map[string]string{"title": "周报", "n": "2"}), "接了：「周报」，2 件")
	eq(Fill("{missing}", nil), "{missing}")
	eq(Plural("en", 1), "one")
	eq(Plural("en", 2), "other")
	eq(Plural("ru", 3), "few")
	eq(Plural("ru", 5), "many")
	eq(Plural("ru", 21), "one")
	eq(Plural("zh", 1), "other")
	eq(Plural("fr", 0), "one")
	eq(Plural("pl", 12), "many")
	eq(Plural("ar", 2), "two")
	eq(Plural("cs", 3), "few")
	eq(PickTag("zh-Hant", UILangs), "zh")
	eq(PickTag("ko", UILangs), "en")
	if !IsRtl("ar") || !IsRtl("he-IL") || IsRtl("ko") {
		t.Error("IsRtl")
	}
	eq(ScriptOfLang("sr-Latn"), "Latn")
	eq(ScriptOfLang("ko"), "Hang")
	eq(ScriptOfLang("es"), "Latn")
}
