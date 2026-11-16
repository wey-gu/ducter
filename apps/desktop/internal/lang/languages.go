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

// Known says whether Ducter names this tag's language in its table.
func Known(tag string) bool {
	_, ok := info(tag)
	return ok
}
