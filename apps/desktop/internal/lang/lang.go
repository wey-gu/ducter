// Package lang tells languages apart (D292, research/99). Three different
// things, kept apart:
//  1. the conversation language: what the person writes in and wants
//     replies in. Any language, a BCP 47 tag ("ko", "zh-Hant", "es").
//     Detect reads it from a message; Resolve keeps the last known one
//     through a message with no language of its own ("OK", a number, an
//     emoji, a command, a code block); OfTexts derives it from the Log
//     after a restart, so nothing extra is stored.
//  2. the task/report language: the conversation language, carried as a
//     tag on the task; a report is checked against it (InLanguage).
//  3. the interface locale: the app's own words. A tag too; it resolves to
//     a table through a fallback chain (FallbackChain: "zh-TW" → zh-Hant →
//     zh → en; "ko" → en), so a language without a table shows English.
//
// Detection is Unicode scripts first, then, inside the Latin script, a
// small stopword and diacritic score. The port of
// packages/protocol/src/lang.ts: both pass fixtures/lang.json.
package lang

import (
	"regexp"
	"sort"
	"strings"
	"unicode"
)

// ---------- Tags ----------

var (
	reHead    = regexp.MustCompile(`^[a-z]{2,3}$`)
	reScript  = regexp.MustCompile(`^[A-Za-z]{4}$`)
	reRegion  = regexp.MustCompile(`^(?:[A-Za-z]{2}|\d{3})$`)
	reVariant = regexp.MustCompile(`^[A-Za-z0-9]{5,8}$`)
	reUpper2  = regexp.MustCompile(`^[A-Z]{2}$`)
	reScriptT = regexp.MustCompile(`^[A-Z][a-z]{3}$`)
)

// NormalizeTag is a tag in its canonical case ("ZH_tw" → "zh-Hant",
// "ko_KR.UTF-8" → "ko-KR"), or "" when it isn't one. Chinese by region
// becomes its script: zh-TW / zh-HK / zh-MO → zh-Hant, zh-CN / zh-SG /
// zh-Hans → zh; "no" becomes "nb".
func NormalizeTag(raw string) string {
	s := strings.TrimSpace(raw)
	if i := strings.IndexByte(s, '.'); i >= 0 {
		s = s[:i]
	}
	if i := strings.IndexByte(s, '@'); i >= 0 {
		s = s[:i]
	}
	if s == "" {
		return ""
	}
	parts := strings.FieldsFunc(s, func(r rune) bool { return r == '-' || r == '_' })
	if len(parts) == 0 {
		return ""
	}
	head := strings.ToLower(parts[0])
	if !reHead.MatchString(head) {
		return ""
	}
	out := []string{head}
	for _, p := range parts[1:] {
		switch {
		case reScript.MatchString(p):
			out = append(out, strings.ToUpper(p[:1])+strings.ToLower(p[1:]))
		case reRegion.MatchString(p):
			out = append(out, strings.ToUpper(p))
		case reVariant.MatchString(p):
			out = append(out, strings.ToLower(p))
		default:
			return ""
		}
	}
	switch head {
	case "zh":
		script, region := "", ""
		for _, p := range out {
			if script == "" && (p == "Hant" || p == "Hans") {
				script = p
			}
			if region == "" && reUpper2.MatchString(p) {
				region = p
			}
		}
		if script == "Hant" || (script == "" && (region == "TW" || region == "HK" || region == "MO")) {
			return "zh-Hant"
		}
		return "zh"
	case "no":
		out[0] = "nb"
	}
	return strings.Join(out, "-")
}

func orTag(tag string) string {
	if t := NormalizeTag(tag); t != "" {
		return t
	}
	return tag
}

func head(tag string) string {
	h, _, _ := strings.Cut(tag, "-")
	return h
}

// BaseTag is the language without region or variant: "pt-BR" → "pt",
// "zh-Hant-TW" → "zh-Hant".
func BaseTag(tag string) string {
	t := orTag(tag)
	parts := strings.Split(t, "-")
	if len(parts) > 1 && reScriptT.MatchString(parts[1]) {
		return parts[0] + "-" + parts[1]
	}
	return parts[0]
}

// FallbackChain is where a tag looks for words: itself, then shorter, then
// English. "zh-Hant" → zh-Hant, zh, en; "ko" → ko, en.
func FallbackChain(tag string) []string {
	t := NormalizeTag(tag)
	var chain []string
	if t != "" {
		parts := strings.Split(t, "-")
		for n := len(parts); n > 0; n-- {
			chain = append(chain, strings.Join(parts[:n], "-"))
		}
		if strings.HasPrefix(t, "zh-Hant") && !contains(chain, "zh") {
			chain = append(chain, "zh")
		}
	}
	if !contains(chain, "en") {
		chain = append(chain, "en")
	}
	out := chain[:0:0]
	for _, c := range chain {
		if !contains(out, c) {
			out = append(out, c)
		}
	}
	return out
}

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

// PickTag is the first of available on the tag's fallback chain.
func PickTag(tag string, available []string) string {
	for _, c := range FallbackChain(tag) {
		if contains(available, c) {
			return c
		}
	}
	if contains(available, "en") || len(available) == 0 {
		return "en"
	}
	return available[0]
}

// Negotiate is the interface language for a list of preferred ones (the
// Mac's): the first that has a table on its own chain, before falling back
// to English. ["ko", "zh-CN"] → zh; ["ko"] → en.
func Negotiate(preferred []string, available []string) string {
	for _, p := range preferred {
		chain := FallbackChain(p)
		// The trailing English is the last resort, not a match, unless the
		// preference is English itself.
		if !strings.HasPrefix(NormalizeTag(p)+"-", "en-") {
			chain = chain[:len(chain)-1]
		}
		for _, c := range chain {
			if contains(available, c) {
				return c
			}
		}
	}
	return PickTag("", available)
}

// Words is one table per language, picked by the fallback chain:
// Words({zh, en}, "zh-Hant") → zh. tables must hold "en".
func Words[T any](tables map[string]T, tag string) T {
	for _, c := range FallbackChain(tag) {
		if w, ok := tables[c]; ok {
			return w
		}
	}
	return tables["en"]
}

var reFill = regexp.MustCompile(`\{(\w+)\}`)

// Fill puts vars into ICU-like placeholders: Fill("接了：「{title}」", …).
// A missing one stays visible.
func Fill(template string, vars map[string]string) string {
	return reFill.ReplaceAllStringFunc(template, func(m string) string {
		if v, ok := vars[m[1:len(m)-1]]; ok {
			return v
		}
		return m
	})
}

// Plural is the CLDR plural category of a whole number n in a language:
// "zero", "one", "two", "few", "many" or "other". A small table for the
// languages Ducter names (Go has no Intl); else n == 1 is "one".
func Plural(tag string, n int) string {
	if n < 0 {
		n = -n
	}
	t := NormalizeTag(tag)
	if t == "" {
		t = "en"
	}
	m10, m100 := n%10, n%100
	million := n != 0 && n%1000000 == 0
	switch head(t) {
	case "zh", "ja", "ko", "th", "vi", "id", "ms", "my", "km", "lo":
		return "other"
	case "fr":
		if n == 0 || n == 1 {
			return "one"
		}
		if million {
			return "many"
		}
		return "other"
	case "pt":
		if t == "pt-PT" {
			if n == 1 {
				return "one"
			}
		} else if n == 0 || n == 1 {
			return "one"
		}
		if million {
			return "many"
		}
		return "other"
	case "es", "it", "ca":
		if n == 1 {
			return "one"
		}
		if million {
			return "many"
		}
		return "other"
	case "hi", "bn", "fa", "gu", "kn", "am":
		if n == 0 || n == 1 {
			return "one"
		}
		return "other"
	case "ru", "uk", "be":
		switch {
		case m10 == 1 && m100 != 11:
			return "one"
		case m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14):
			return "few"
		}
		return "many"
	case "sr", "hr", "bs":
		switch {
		case m10 == 1 && m100 != 11:
			return "one"
		case m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14):
			return "few"
		}
		return "other"
	case "pl":
		switch {
		case n == 1:
			return "one"
		case m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14):
			return "few"
		}
		return "many"
	case "cs", "sk":
		switch {
		case n == 1:
			return "one"
		case n >= 2 && n <= 4:
			return "few"
		}
		return "other"
	case "ro":
		switch {
		case n == 1:
			return "one"
		case n == 0 || (m100 >= 2 && m100 <= 19):
			return "few"
		}
		return "other"
	case "ar":
		switch {
		case n == 0:
			return "zero"
		case n == 1:
			return "one"
		case n == 2:
			return "two"
		case m100 >= 3 && m100 <= 10:
			return "few"
		case m100 >= 11 && m100 <= 99:
			return "many"
		}
		return "other"
	case "he":
		switch n {
		case 1:
			return "one"
		case 2:
			return "two"
		}
		return "other"
	case "fil":
		if n == 1 || n == 2 || n == 3 || (m10 != 4 && m10 != 6 && m10 != 9) {
			return "one"
		}
		return "other"
	}
	if n == 1 {
		return "one"
	}
	return "other"
}

func info(tag string) (Language, bool) {
	t := orTag(tag)
	for _, k := range []string{t, BaseTag(tag), head(tag)} {
		if l, ok := byTag[k]; ok {
			return l, true
		}
	}
	return Language{}, false
}

// Autonym is the language's own name (한국어), else the tag.
func Autonym(tag string) string {
	if l, ok := info(tag); ok {
		return l.Name
	}
	return tag
}

// LangName is how a model is told the language: "Korean (한국어)",
// "English".
func LangName(tag string) string {
	t := orTag(tag)
	l, ok := info(t)
	own := Autonym(t)
	if !ok || l.En == "" || l.En == t {
		return own
	}
	if l.En == own {
		return l.En
	}
	return l.En + " (" + own + ")"
}

var rtl = map[string]bool{"ar": true, "he": true, "fa": true, "ur": true, "yi": true, "ps": true, "sd": true, "ug": true, "dv": true, "ckb": true}

// IsRtl says whether a language writes right to left.
func IsRtl(tag string) bool {
	return tag != "" && rtl[head(orTag(tag))]
}

// ---------- Scripts ----------

// The scripts counted in words (alphabets) and the language each means
// when nothing else says.
var alphabets = []struct {
	script string
	table  *unicode.RangeTable
	lang   string
}{
	{"Cyrl", unicode.Cyrillic, "ru"},
	{"Arab", unicode.Arabic, "ar"},
	{"Hebr", unicode.Hebrew, "he"},
	{"Grek", unicode.Greek, "el"},
	{"Thai", unicode.Thai, "th"},
	{"Deva", unicode.Devanagari, "hi"},
	{"Beng", unicode.Bengali, "bn"},
	{"Taml", unicode.Tamil, "ta"},
	{"Telu", unicode.Telugu, "te"},
	{"Geor", unicode.Georgian, "ka"},
	{"Armn", unicode.Armenian, "hy"},
	{"Ethi", unicode.Ethiopic, "am"},
	{"Khmr", unicode.Khmer, "km"},
	{"Laoo", unicode.Lao, "lo"},
	{"Mymr", unicode.Myanmar, "my"},
	{"Gujr", unicode.Gujarati, "gu"},
	{"Guru", unicode.Gurmukhi, "pa"},
	{"Knda", unicode.Kannada, "kn"},
	{"Mlym", unicode.Malayalam, "ml"},
	{"Sinh", unicode.Sinhala, "si"},
}

var scriptOfLang = map[string]string{
	"zh": "Hani", "ja": "Kana", "ko": "Hang", "ru": "Cyrl", "uk": "Cyrl", "bg": "Cyrl", "sr": "Cyrl", "be": "Cyrl", "mk": "Cyrl", "kk": "Cyrl", "ky": "Cyrl", "mn": "Cyrl", "tg": "Cyrl",
	"ar": "Arab", "fa": "Arab", "ur": "Arab", "ps": "Arab", "sd": "Arab", "ug": "Arab", "ckb": "Arab", "he": "Hebr", "yi": "Hebr", "el": "Grek", "th": "Thai", "hi": "Deva", "mr": "Deva", "ne": "Deva",
	"bn": "Beng", "ta": "Taml", "te": "Telu", "ka": "Geor", "hy": "Armn", "am": "Ethi", "ti": "Ethi", "km": "Khmr", "lo": "Laoo", "my": "Mymr", "gu": "Gujr", "pa": "Guru", "kn": "Knda", "ml": "Mlym", "si": "Sinh",
}

// ScriptOfLang is the script a language is written in ("ko" → Hang,
// "sr-Latn" → Latn, "es" → Latn), as an ISO 15924 code.
func ScriptOfLang(tag string) string {
	parts := strings.Split(orTag(tag), "-")
	if contains(parts, "Latn") {
		return "Latn"
	}
	if contains(parts, "Cyrl") {
		return "Cyrl"
	}
	if s, ok := scriptOfLang[parts[0]]; ok {
		return s
	}
	return "Latn"
}

// jsSpace is JavaScript's \s (Go's is ASCII only).
const jsSpace = `\t\n\v\f\r \x{00a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}`

// What isn't language: code blocks, inline code, links, paths,
// identifiers, numbers. ASCII only, so a Chinese or Korean word beside a
// path is kept.
var notWords = []*regexp.Regexp{
	regexp.MustCompile("```[\\s\\S]*?(?:```|$)"),
	regexp.MustCompile("`[^`\\n]*`"),
	regexp.MustCompile(`[A-Za-z][A-Za-z0-9+.-]*://[^` + jsSpace + `<>"'）)\]]*`),
	regexp.MustCompile(`[\w.@+-]+@[\w-]+\.[\w.-]+`),
	regexp.MustCompile(`[A-Za-z0-9_.~+-]*[/\\][A-Za-z0-9_.~/\\+-]*`),
	regexp.MustCompile(`[A-Za-z0-9]*_[A-Za-z0-9_]*`),
	regexp.MustCompile(`[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+`),
	regexp.MustCompile(`[a-z]+[A-Z][A-Za-z0-9]*`),
	regexp.MustCompile(`[A-Za-z]*\d[A-Za-z0-9]*`),
	regexp.MustCompile(`(?:^|[` + jsSpace + `])--?[a-z][a-z-]*`),
}

// ProseOf is the text without code, links, paths and numbers (what a
// language detector should read).
func ProseOf(text string) string {
	s := text
	for _, re := range notWords {
		s = re.ReplaceAllString(s, " ")
	}
	return s
}

func runeSet(s string) map[rune]bool {
	m := map[rune]bool{}
	for _, r := range s {
		m[r] = true
	}
	return m
}

// Han that only Simplified or only Traditional Chinese write, and not
// Japanese either; Chinese function words (in a Han-only message they say
// it is Chinese, not Japanese kanji).
var (
	simp   = runeSet("们这说对还过么为吗让给发识话语读应样实带务热边个时问题车长见认门间现书买卖电场动东开")
	trad   = runeSet("們這說對還過麼為嗎讓給發識話語讀寫應樣實點帶務熱邊會來學國與裡")
	zhFunc = runeSet("的了吗嗎呢吧啊你我他她们們这這是在有和不没沒就都也要会會说說给給把被让讓帮幫么麼什")
)

type counts struct {
	han, hangul, kana, simp, trad, zhFunc int
	latin                                 []string // Latin words, lower case
	alpha                                 map[string][]string
	alphaOrder                            []string // scripts in the order first seen
}

func count(text string) counts {
	c := counts{alpha: map[string][]string{}}
	var word strings.Builder
	script := ""
	end := func() {
		if word.Len() > 0 && script == "Latn" {
			c.latin = append(c.latin, strings.ToLower(word.String()))
		} else if word.Len() > 0 && script != "" {
			if _, ok := c.alpha[script]; !ok {
				c.alphaOrder = append(c.alphaOrder, script)
			}
			c.alpha[script] = append(c.alpha[script], strings.ToLower(word.String()))
		}
		word.Reset()
		script = ""
	}
	for _, ch := range ProseOf(text) {
		switch {
		case unicode.Is(unicode.Han, ch):
			end()
			c.han++
			if simp[ch] {
				c.simp++
			}
			if trad[ch] {
				c.trad++
			}
			if zhFunc[ch] {
				c.zhFunc++
			}
			continue
		case unicode.Is(unicode.Hangul, ch):
			end()
			c.hangul++
			continue
		case unicode.In(ch, unicode.Hiragana, unicode.Katakana):
			end()
			c.kana++
			continue
		}
		s := ""
		if unicode.Is(unicode.Latin, ch) {
			s = "Latn"
		} else {
			for _, a := range alphabets {
				if unicode.Is(a.table, ch) {
					s = a.script
				}
			}
		}
		if s != "" {
			if script != "" && script != s {
				end()
			}
			script = s
			word.WriteRune(ch)
		} else if word.Len() > 0 && (unicode.Is(unicode.M, ch) || ((ch == '\'' || ch == '’') && script == "Latn")) {
			word.WriteRune(ch)
		} else {
			end()
		}
	}
	end()
	return c
}

func (c counts) otherAlpha(s string) int {
	n := 0
	for k, ws := range c.alpha {
		if k != s {
			n += len(ws)
		}
	}
	return n
}

// Inside the Latin script: words that say which language, and letters only
// one of them writes.
var stopOrder = []string{"en", "es", "pt", "fr", "de", "it", "nl", "sv", "pl", "tr", "id", "vi"}

var stop = map[string]string{
	"en": "the and is are you this that what with for please can how it of my have hello thanks thank hi will would could should was be from does did why when where there just about need want help make check fix today i'm it's don't can't let's",
	"es": "el los las que por para con una es está esto este esta cómo qué cuándo dónde cuál hola gracias puedes puedo quiero necesito debo tengo hacer hay vez dos ahora hoy pero muy también del al y yo tú usted",
	"pt": "não você isso isto obrigado obrigada olá também uma um os ao pelo pela hoje quero preciso fazer então mas eu",
	"fr": "le les des est une et pour avec vous je ce cette pas bonjour merci qui dans sur il elle nous c'est j'ai aujourd'hui peux veux tu",
	"de": "der die das und ist nicht ich du mit für ein eine auf zu bitte danke hallo heute kannst wie mir mich sie es auch noch",
	"it": "il lo gli che è per con non sono una ciao grazie questo questa oggi puoi voglio della perché anche",
	"nl": "het een niet ik je dat van voor met bedankt dank vandaag kun wil ook maar zijn wat hoe mijn",
	"sv": "och är det att inte jag du för med hej tack idag kan vill också",
	"pl": "nie się jest na że co jak proszę dziękuję cześć dzisiaj czy",
	"tr": "ve bir bu için ne mi değil ben sen merhaba teşekkür lütfen bugün",
	"id": "dan yang ini itu untuk dengan saya tidak bisa apa ada terima kasih tolong hari",
	"vi": "và của là không tôi bạn có được này cho với xin chào cảm ơn",
}

var stopSets = func() map[string]map[string]bool {
	out := map[string]map[string]bool{}
	for k, v := range stop {
		set := map[string]bool{}
		for _, w := range strings.Split(v, " ") {
			set[w] = true
		}
		out[k] = set
	}
	return out
}()

var marks = []struct {
	lang string
	re   *regexp.Regexp
}{
	{"es", regexp.MustCompile(`[ñ¿¡]`)},
	{"pt", regexp.MustCompile(`[ãõ]`)},
	{"fr", regexp.MustCompile(`[œèëîû]`)},
	{"de", regexp.MustCompile(`ß`)},
	{"pl", regexp.MustCompile(`[ąęłńśźż]`)},
	{"tr", regexp.MustCompile(`[ğış]`)},
	{"vi", regexp.MustCompile(`[ơưđăạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]`)},
	{"sv", regexp.MustCompile(`å`)},
}

// LatinKnown are the Latin languages the score can tell apart; another
// Latin language is never rejected.
var LatinKnown = stopOrder

func latinScore(words []string) (string, bool) {
	score := map[string]int{}
	var order []string
	add := func(l string, n int) {
		if _, ok := score[l]; !ok {
			order = append(order, l)
		}
		score[l] += n
	}
	for _, w := range words {
		w = strings.ReplaceAll(w, "’", "'")
		for _, l := range stopOrder {
			if stopSets[l][w] {
				add(l, 1)
			}
		}
	}
	joined := strings.Join(words, " ")
	for _, m := range marks {
		if m.re.MatchString(joined) {
			add(m.lang, 2)
		}
	}
	if len(order) == 0 {
		return "en", false
	}
	sort.SliceStable(order, func(i, j int) bool { return score[order[i]] > score[order[j]] })
	top := score[order[0]]
	second, hasSecond := 0, len(order) > 1
	if hasSecond {
		second = score[order[1]]
	}
	lead := top - second
	sure := lead > 0 && (top >= 2 || len(words) <= 3) && (!hasSecond || lead >= 1)
	return order[0], sure
}

// Detected is the language a message is in.
type Detected struct {
	Lang   string // a BCP 47 tag; "" when the text has no language of its own
	Script string // ISO 15924: Latn, Hani, Hang, Kana, Cyrl, …
	Sure   bool   // the language itself is clear, not only its script
}

var (
	reUk     = regexp.MustCompile(`[ієїґ]`)
	reSr     = regexp.MustCompile(`[ђјљњћџ]`)
	reRu     = regexp.MustCompile(`[ыэё]`)
	reUr     = regexp.MustCompile(`[ٹڈڑںے]`)
	reFa     = regexp.MustCompile(`[پچژگ]`)
	reAr     = regexp.MustCompile(`[ةى]`)
	reApostr = strings.NewReplacer("'", "", "’", "")
)

// Detect is the language a message is written in; its Lang is "" when the
// text has none of its own (OK, 123, an emoji, a command or a code block).
// Mixed text goes to the larger part, counting each Han, Hangul or kana
// character as one word, so a Korean sentence with an English term is
// Korean and an English sentence quoting one Chinese word is English.
func Detect(text string) Detected {
	c := count(text)
	type cand struct {
		Detected
		units int
	}
	var cs []cand
	if c.hangul > 0 {
		cs = append(cs, cand{Detected{"ko", "Hang", true}, c.hangul + c.han})
	}
	if c.kana > 0 {
		cs = append(cs, cand{Detected{"ja", "Kana", true}, c.kana + c.han})
	}
	if c.han > 0 && c.hangul == 0 && c.kana == 0 {
		l := "zh"
		if c.trad > c.simp {
			l = "zh-Hant"
		}
		sure := c.simp+c.trad > 0 || c.zhFunc >= 2 || (c.zhFunc >= 1 && c.han >= 4)
		cs = append(cs, cand{Detected{l, "Hani", sure}, c.han})
	}
	for _, script := range c.alphaOrder {
		ws := c.alpha[script]
		l := ""
		for _, a := range alphabets {
			if a.script == script {
				l = a.lang
			}
		}
		joined := strings.Join(ws, " ")
		sure := script != "Cyrl" && script != "Arab"
		switch script {
		case "Cyrl":
			switch {
			case reUk.MatchString(joined):
				l, sure = "uk", true
			case reSr.MatchString(joined):
				l, sure = "sr", true
			case reRu.MatchString(joined):
				sure = true
			}
		case "Arab":
			switch {
			case reUr.MatchString(joined):
				l, sure = "ur", true
			case reFa.MatchString(joined):
				l, sure = "fa", true
			case reAr.MatchString(joined):
				sure = true
			default:
				for _, w := range ws {
					if strings.HasPrefix(w, "ال") {
						sure = true
					}
				}
			}
		}
		cs = append(cs, cand{Detected{l, script, sure}, len(ws)})
	}
	letters := len([]rune(reApostr.Replace(strings.Join(c.latin, ""))))
	if len(c.latin) > 0 && letters >= 3 {
		l, sure := latinScore(c.latin)
		cs = append(cs, cand{Detected{l, "Latn", sure}, len(c.latin)})
	}
	if len(cs) == 0 {
		return Detected{}
	}
	// The larger part wins; on a tie, not the Latin one (people put English
	// terms in their own language far more often than the other way round).
	sort.SliceStable(cs, func(i, j int) bool {
		if cs[i].units != cs[j].units {
			return cs[i].units > cs[j].units
		}
		return cs[i].Script != "Latn" && cs[j].Script == "Latn"
	})
	return cs[0].Detected
}

// Resolve is the conversation's language after this message, given the one
// before it ("" for none). A message with no language keeps it; one that
// only shows its script (a short Han line, Cyrillic without a telling
// letter) keeps it when it is the same script; Latin with no telling word
// (a command, "okay", a name) never moves it off another script.
func Resolve(text, prev string) string {
	d := Detect(text)
	if d.Lang == "" {
		return prev
	}
	if d.Sure || prev == "" {
		return d.Lang
	}
	ps := ScriptOfLang(prev)
	if ps == d.Script || (ps == "Kana" && d.Script == "Hani") {
		return prev
	}
	if d.Script == "Latn" {
		return prev
	}
	return d.Lang
}

// OfTexts is the language of a conversation from its messages, oldest
// first, starting from start ("" for none).
func OfTexts(texts []string, start string) string {
	l := start
	for _, t := range texts {
		l = Resolve(t, l)
	}
	return l
}

// InLanguage says whether text is in that language, for showing it as is
// (a task's report, a card's question). By script, where scripts tell:
// Chinese has Han and no Hangul or kana; Korean has Hangul; Japanese has
// kana, or Han without Hangul; other alphabets have words of their own. A
// Latin language is turned down only when its words say clearly that it is
// another Latin language the detector knows. Text with no language (a
// number, a name) is in every Latin-script language.
func InLanguage(text, tag string) bool {
	c := count(text)
	script := ScriptOfLang(tag)
	cjk := c.han + c.hangul + c.kana
	if cjk+len(c.latin)+c.otherAlpha("Latn") == 0 {
		return script == "Latn"
	}
	switch script {
	case "Hani":
		return c.han > 0 && c.hangul == 0 && c.kana == 0
	case "Hang":
		return c.hangul > 0
	case "Kana":
		return (c.kana > 0 || c.han > 0) && c.hangul == 0
	case "Latn":
		n := len(c.latin)
		if n < 1 {
			n = 1
		}
		if cjk > 0 || c.otherAlpha("Latn") >= n {
			return false
		}
		base := head(BaseTag(tag))
		if !contains(LatinKnown, base) || len(c.latin) < 4 {
			return true
		}
		l, sure := latinScore(c.latin)
		return !sure || l == base
	}
	own := len(c.alpha[script])
	return own > 0 && 2*own >= len(c.latin) && cjk == 0
}
