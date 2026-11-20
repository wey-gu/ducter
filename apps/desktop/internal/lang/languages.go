package lang

// Language is one language Ducter names (packages/protocol/src/languages.json;
// a test keeps this copy equal to it).
type Language struct {
	Tag    string // BCP 47
	Name   string // in its own words: 한국어 (what the reply-language list shows)
	En     string // in English: Korean (what the partner and a task are told)
	Common bool   // first in the reply-language list; the rest are under Other language
	HasUI  bool   // the interface has a complete table
}

// Languages are the languages Ducter names, common ones first.
var Languages = []Language{
	{Tag: "zh", Name: "简体中文", En: "Chinese", Common: true, HasUI: true},
	{Tag: "zh-Hant", Name: "繁體中文", En: "Traditional Chinese", Common: true, HasUI: false},
	{Tag: "en", Name: "English", En: "English", Common: true, HasUI: true},
	{Tag: "ja", Name: "日本語", En: "Japanese", Common: true, HasUI: false},
	{Tag: "ko", Name: "한국어", En: "Korean", Common: true, HasUI: false},
	{Tag: "es", Name: "Español", En: "Spanish", Common: true, HasUI: false},
	{Tag: "fr", Name: "Français", En: "French", Common: true, HasUI: false},
	{Tag: "de", Name: "Deutsch", En: "German", Common: true, HasUI: false},
	{Tag: "pt", Name: "Português", En: "Portuguese", Common: true, HasUI: false},
	{Tag: "it", Name: "Italiano", En: "Italian", Common: true, HasUI: false},
	{Tag: "ru", Name: "Русский", En: "Russian", Common: true, HasUI: false},
	{Tag: "ar", Name: "العربية", En: "Arabic", Common: true, HasUI: false},
	{Tag: "nl", Name: "Nederlands", En: "Dutch", Common: false, HasUI: false},
	{Tag: "sv", Name: "Svenska", En: "Swedish", Common: false, HasUI: false},
	{Tag: "da", Name: "Dansk", En: "Danish", Common: false, HasUI: false},
	{Tag: "nb", Name: "Norsk", En: "Norwegian", Common: false, HasUI: false},
	{Tag: "fi", Name: "Suomi", En: "Finnish", Common: false, HasUI: false},
	{Tag: "pl", Name: "Polski", En: "Polish", Common: false, HasUI: false},
	{Tag: "cs", Name: "Čeština", En: "Czech", Common: false, HasUI: false},
	{Tag: "ro", Name: "Română", En: "Romanian", Common: false, HasUI: false},
	{Tag: "hu", Name: "Magyar", En: "Hungarian", Common: false, HasUI: false},
	{Tag: "tr", Name: "Türkçe", En: "Turkish", Common: false, HasUI: false},
	{Tag: "el", Name: "Ελληνικά", En: "Greek", Common: false, HasUI: false},
	{Tag: "uk", Name: "Українська", En: "Ukrainian", Common: false, HasUI: false},
	{Tag: "bg", Name: "Български", En: "Bulgarian", Common: false, HasUI: false},
	{Tag: "sr", Name: "Српски", En: "Serbian", Common: false, HasUI: false},
	{Tag: "he", Name: "עברית", En: "Hebrew", Common: false, HasUI: false},
	{Tag: "fa", Name: "فارسی", En: "Persian", Common: false, HasUI: false},
	{Tag: "ur", Name: "اردو", En: "Urdu", Common: false, HasUI: false},
	{Tag: "hi", Name: "हिन्दी", En: "Hindi", Common: false, HasUI: false},
	{Tag: "bn", Name: "বাংলা", En: "Bengali", Common: false, HasUI: false},
	{Tag: "ta", Name: "தமிழ்", En: "Tamil", Common: false, HasUI: false},
	{Tag: "th", Name: "ไทย", En: "Thai", Common: false, HasUI: false},
	{Tag: "vi", Name: "Tiếng Việt", En: "Vietnamese", Common: false, HasUI: false},
	{Tag: "id", Name: "Bahasa Indonesia", En: "Indonesian", Common: false, HasUI: false},
	{Tag: "ms", Name: "Bahasa Melayu", En: "Malay", Common: false, HasUI: false},
	{Tag: "fil", Name: "Filipino", En: "Filipino", Common: false, HasUI: false},
	{Tag: "sw", Name: "Kiswahili", En: "Swahili", Common: false, HasUI: false},
}

var byTag = func() map[string]Language {
	m := map[string]Language{}
	for _, l := range Languages {
		m[l.Tag] = l
	}
	return m
}()

// UILangs are the interface languages with complete tables; the rest fall
// back (FallbackChain).
var UILangs = func() []string {
	var out []string
	for _, l := range Languages {
		if l.HasUI {
			out = append(out, l.Tag)
		}
	}
	return out
}()

// Samples is the partner's one-line reply in each common language (Look and
// sound's preview answer), shown under Replies in so the person sees the
// voice they pick (D445; packages/protocol/src/languages.json's samples).
var Samples = map[string]string{
	"zh":      "好，明天 9:00 叫你。",
	"zh-Hant": "好，明天 9:00 叫你。",
	"en":      "Sure, I'll ping you at 9:00 tomorrow.",
	"ja":      "はい、明日の 9:00 にお知らせします。",
	"ko":      "네, 내일 9:00에 알려 드릴게요.",
	"es":      "Vale, te aviso mañana a las 9:00.",
	"fr":      "D'accord, je te préviens demain à 9:00.",
	"de":      "Gut, ich melde mich morgen um 9:00.",
	"pt":      "Certo, te aviso amanhã às 9:00.",
	"it":      "Va bene, ti avviso domani alle 9:00.",
	"ru":      "Хорошо, напомню завтра в 9:00.",
	"ar":      "حسنًا، سأذكّرك غدًا الساعة 9:00.",
}

// Known says whether Ducter names this tag's language in its table.
func Known(tag string) bool {
	_, ok := info(tag)
	return ok
}
