// Package hints is what the client keeps about the Mac it runs on, in
// Ducter's data folder: the partner's chosen name (persona.json, which
// `ducter up` also writes) and the client's own first-run memory (whether
// the first result was celebrated, its settings). Everything here is
// optional: a missing or unreadable file means defaults and an in-memory
// flag. D204: no first-run repo hints any more (firstrun.json, a scan of
// ~/dev, ~/code, …): a computer's projects are its Ducter folder's.
package hints

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"

	"github.com/wey-gu/ducter/apps/desktop/internal/lang"
)

// StateFile is the client's own.
const StateFile = "desktop.json"

type state struct {
	FirstResultSeenAt string `json:"firstResultSeenAt,omitempty"`
	// CLIOffer is the answer to "use ducter in Terminal too?": "linked"
	// or "declined"; empty until asked.
	CLIOffer string `json:"cliOffer,omitempty"`
	// Asks are the gentle one-time offers (notifications, the phone,
	// Nowledge Mem): the answer and when, by name.
	Asks map[string]Ask `json:"asks,omitempty"`
	// Lang is the window's language from Settings: "zh", "en", or empty
	// (follow macOS).
	Lang string `json:"lang,omitempty"`
	// Details is 对话里的细节 / Details in the conversation (D104): "shown",
	// or empty (folded, the default).
	Details string `json:"details,omitempty"`
	// TitleSeenAt is when the title moment (D87) last played to its end
	// or was skipped: it plays on the first launch only.
	TitleSeenAt string `json:"titleSeenAt,omitempty"`
	// SoundOff turns the app's sounds off (Settings); on by default.
	SoundOff bool `json:"soundOff,omitempty"`
	// Ticks are a checklist's ticks in the conversation (D303), by
	// "<seq>.<block>": they stay on this Mac.
	Ticks map[string][]int `json:"ticks,omitempty"`
	// Appearance is 外观 / Look's light or dark (D302): "light", "dark", or
	// empty (follow macOS).
	Appearance string `json:"appearance,omitempty"`
	// MenuBarOff takes the menu bar extra away on this Mac (D306); shown
	// by default.
	MenuBarOff bool `json:"menuBarOff,omitempty"`
	// Density is an opened task's: "compact", or "" for comfortable (the
	// default, D457).
	Density string `json:"density,omitempty"`
	// OnHandLens is the project On hand is narrowed to (D261): a name,
	// "~" for Other (no folder), "" for all. D128's by-state/by-project
	// toggle (onHandBy) is retired: the lens replaced it.
	OnHandLens string `json:"onHandLens,omitempty"`
	// NewTaskWho is the agent last picked on the New task card (D185), a
	// candidate key; empty: the suggested one.
	NewTaskWho string `json:"newTaskWho,omitempty"`
	// NewTaskTune is the model and effort last picked for each AI agent
	// (D202), by harness.
	NewTaskTune map[string]Tune `json:"newTaskTune,omitempty"`
	// D244: new results. SeenSince is when this Mac started keeping
	// track (a finish before it is never new); Seen is each task's card
	// time when it was last open here.
	SeenSince string            `json:"seenSince,omitempty"`
	Seen      map[string]string `json:"seen,omitempty"`
	// Folded are the By project groups folded on this Mac (D244).
	Folded []string `json:"folded,omitempty"`
	// BenchWidth is the workbench's width, dragged (D244); 0: 520.
	BenchWidth float32 `json:"benchWidth,omitempty"`
	// BgTray is "shut" when the opened task's background tray is folded on
	// this Mac (D521); open by default.
	BgTray string `json:"bgTray,omitempty"`
	// Screens is "both" when the Phone page shows its screens side by
	// side (D244).
	Screens string `json:"screens,omitempty"`
	// D262: the first frame is the settled one. SpokeLang is the language
	// the window last followed from the person's words (any BCP 47 tag,
	// "zh", "ko", D292), and PersonaName the partner's name as last said,
	// so the next launch starts in them instead of switching once the home
	// answers.
	SpokeLang   string `json:"spokeLang,omitempty"`
	PersonaName string `json:"personaName,omitempty"`
	// D309: the partner whose conversation this Mac shows (empty: the default).
	Partner string `json:"partner,omitempty"`
	// D545: the list of partners beside the conversation: "" as the window's
	// width has it, "thin" (the faces and their numbers) or "hidden".
	RailMode string `json:"railMode,omitempty"`
	// D305: voice. VoiceKey is the key held to talk ("fn", "none", or empty
	// for right Option); VoiceAsked is set once the first hold's card was
	// answered; ReadBack reads the reply to a message sent by voice aloud.
	VoiceKey   string `json:"voiceKey,omitempty"`
	VoiceAsked bool   `json:"voiceAsked,omitempty"`
	ReadBack   bool   `json:"readBack,omitempty"`
	// D442: TalkAsked is set once 放手说 / Talk hands-free's first card was answered.
	TalkAsked bool `json:"talkAsked,omitempty"`
	// D567: FileFill holds the kinds of file (markdown, table, text, pdf)
	// the person last chose to read filling the window.
	FileFill map[string]bool `json:"fileFill,omitempty"`
	// D438: the mini window. FloatOpen brings it back at the next launch;
	// FloatOffered is set once it came by itself (it never does again).
	FloatOpen    bool `json:"floatOpen,omitempty"`
	FloatOffered bool `json:"floatOffered,omitempty"`
	// D573: View › Zoom In / Zoom Out (⌘+ ⌘−), the window content's zoom on
	// this Mac; 0 is actual size.
	Zoom float32 `json:"zoom,omitempty"`
	// D578: where a file Ducter showed is on this Mac (a copy saved to
	// Downloads, or the file the person sent from here), by its id (the
	// sha256 of its bytes), so Show in Finder can find it again.
	FilesOnMac map[string]string `json:"filesOnMac,omitempty"`
}

// filesOnMacMax is how many of those places are kept (past it, one is let go
// for each new one; a forgotten one only loses its Show in Finder).
const filesOnMacMax = 200

// StartLang is the window's language at launch (a BCP 47 tag the strings
// resolve through their fallback chain): the one chosen in Settings
// (chosen), else the one last followed from the person's words, else
// system. fixed (DUCTER_LOCALE) keeps system. "auto" is no tag.
func (l *Local) StartLang(system string, fixed bool) (tag string, chosen bool) {
	if fixed {
		return system, false
	}
	if v := lang.NormalizeTag(l.Lang()); v != "" {
		return v, true
	}
	if v := lang.NormalizeTag(l.SpokeLang()); v != "" {
		return v, false
	}
	return system, false
}

// SpokeLang is the language last followed from the person's words; empty
// when none was.
func (l *Local) SpokeLang() string {
	if l == nil {
		return ""
	}
	return l.st.SpokeLang
}

// SetSpokeLang remembers the language followed from the person's words.
func (l *Local) SetSpokeLang(lang string) {
	if l == nil || l.st.SpokeLang == lang {
		return
	}
	l.st.SpokeLang = lang
	l.save()
}

// PersonaName is the partner's name as last shown here.
func (l *Local) PersonaName() string {
	if l == nil {
		return ""
	}
	return l.st.PersonaName
}

// SetPersonaName remembers the partner's name for the next launch.
func (l *Local) SetPersonaName(name string) {
	if l == nil || name == "" || l.st.PersonaName == name {
		return
	}
	l.st.PersonaName = name
	l.save()
}

// Partner is the partner this Mac shows (D309): "" or "default" for the default.
func (l *Local) Partner() string {
	if l == nil {
		return ""
	}
	return l.st.Partner
}

// SetPartner remembers which partner this Mac shows.
func (l *Local) SetPartner(id string) {
	if id == "default" {
		id = ""
	}
	if l == nil || l.st.Partner == id {
		return
	}
	l.st.Partner = id
	l.save()
}

// RailMode is how this Mac shows the list of partners (D545).
func (l *Local) RailMode() string {
	if l == nil {
		return ""
	}
	return l.st.RailMode
}

// SetRailMode remembers it.
func (l *Local) SetRailMode(m string) {
	if m != "thin" && m != "hidden" {
		m = ""
	}
	if l == nil || l.st.RailMode == m {
		return
	}
	l.st.RailMode = m
	l.save()
}

// Ask is one answer to a gentle offer: "yes", "no", or "later" (asked
// again once, days later; never more).
type Ask struct {
	Answer string `json:"answer"`
	At     string `json:"at"`
	Times  int    `json:"times"`
}

// Local is the data folder as the client sees it. Its zero value (no
// folder) works in memory only.
type Local struct {
	Dir string
	st  state
}

// DataDir is where Ducter keeps its data: $DUCTER_DATA_DIR, else ~/.ducter
// (the CLI's default).
func DataDir() string {
	if d := os.Getenv("DUCTER_DATA_DIR"); d != "" {
		return d
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	return filepath.Join(home, ".ducter")
}

// Open reads what there is in dir. It never fails: missing files are
// simply absent hints.
func Open(dir string) *Local {
	l := &Local{Dir: dir}
	if dir == "" {
		return l
	}
	if b, err := os.ReadFile(filepath.Join(dir, StateFile)); err == nil {
		_ = json.Unmarshal(b, &l.st)
	}
	return l
}

// FirstResultSeen reports whether the first finished task was already
// celebrated on this Mac.
func (l *Local) FirstResultSeen() bool {
	return l != nil && l.st.FirstResultSeenAt != ""
}

// MarkFirstResultSeen remembers that the first result was celebrated, so
// it happens once, not on every launch.
func (l *Local) MarkFirstResultSeen(at time.Time) {
	if l == nil {
		return
	}
	l.st.FirstResultSeenAt = at.UTC().Format(time.RFC3339)
	l.save()
}

// TitleSeen reports whether the title moment already played on this Mac.
func (l *Local) TitleSeen() bool {
	return l != nil && l.st.TitleSeenAt != ""
}

// MarkTitleSeen remembers that the title moment played (or was skipped).
func (l *Local) MarkTitleSeen(at time.Time) {
	if l == nil {
		return
	}
	l.st.TitleSeenAt = at.UTC().Format(time.RFC3339)
	l.save()
}

// Sound reports whether the app may play its sounds (Settings).
func (l *Local) Sound() bool { return l == nil || !l.st.SoundOff }

// SetSound turns the app's sounds on or off.
func (l *Local) SetSound(on bool) {
	if l == nil {
		return
	}
	l.st.SoundOff = !on
	l.save()
}

// Appearance is the window's light or dark chosen in Settings (D302):
// "light", "dark" or "system" (follow macOS, the default).
func (l *Local) Appearance() string {
	if l == nil || (l.st.Appearance != "light" && l.st.Appearance != "dark") {
		return "system"
	}
	return l.st.Appearance
}

// SetAppearance remembers it ("system" forgets it).
func (l *Local) SetAppearance(v string) {
	if l == nil {
		return
	}
	if v != "light" && v != "dark" {
		v = ""
	}
	l.st.Appearance = v
	l.save()
}

// Density is how an opened task is laid out on this Mac (D457):
// "compact" or "comfortable" (the default).
func (l *Local) Density() string {
	if l == nil || l.st.Density != "compact" {
		return "comfortable"
	}
	return "compact"
}

// SetDensity remembers it ("comfortable" forgets it).
func (l *Local) SetDensity(v string) {
	if l == nil {
		return
	}
	if v != "compact" {
		v = ""
	}
	l.st.Density = v
	l.save()
}

// Zoom is the window content's zoom on this Mac (D573), 1 for actual size.
func (l *Local) Zoom() float32 {
	if l == nil || l.st.Zoom == 0 {
		return 1
	}
	return l.st.Zoom
}

// SetZoom remembers it (1 forgets it).
func (l *Local) SetZoom(z float32) {
	if l == nil {
		return
	}
	if z == 1 {
		z = 0
	}
	l.st.Zoom = z
	l.save()
}

// MenuBar reports whether the menu bar extra shows (D306): on unless
// turned off on this Mac.
func (l *Local) MenuBar() bool { return l == nil || !l.st.MenuBarOff }

// SetMenuBar shows or takes away the menu bar extra.
func (l *Local) SetMenuBar(on bool) {
	if l == nil {
		return
	}
	l.st.MenuBarOff = !on
	l.save()
}

// FloatOpen reports whether the mini window was on screen (D438): it comes
// back at the next launch.
func (l *Local) FloatOpen() bool { return l != nil && l.st.FloatOpen }

// SetFloatOpen remembers whether the mini window is on screen.
func (l *Local) SetFloatOpen(on bool) {
	if l == nil || l.st.FloatOpen == on {
		return
	}
	l.st.FloatOpen = on
	l.save()
}

// FloatOffered reports whether the mini window already came by itself.
func (l *Local) FloatOffered() bool { return l != nil && l.st.FloatOffered }

// MarkFloatOffered remembers that it did.
func (l *Local) MarkFloatOffered() {
	if l == nil {
		return
	}
	l.st.FloatOffered = true
	l.save()
}

// CLIOffer is the answer to the one-time "use ducter in Terminal too?".
func (l *Local) CLIOffer() string {
	if l == nil {
		return ""
	}
	return l.st.CLIOffer
}

// Lang is the window's language chosen in Settings: "zh", "en" or
// "auto" (follow macOS).
func (l *Local) Lang() string {
	if l == nil || l.st.Lang == "" {
		return "auto"
	}
	return l.st.Lang
}

// SetLang remembers the window's language ("auto" forgets it).
func (l *Local) SetLang(lang string) {
	if l == nil {
		return
	}
	if lang == "auto" {
		lang = ""
	}
	l.st.Lang = lang
	l.save()
}

// DetailsShown says whether the conversation shows each message's Details
// open by default (D104); folded unless chosen in Settings.
func (l *Local) DetailsShown() bool {
	return l != nil && l.st.Details == "shown"
}

// SetDetailsShown remembers that choice.
func (l *Local) SetDetailsShown(on bool) {
	if l == nil {
		return
	}
	l.st.Details = ""
	if on {
		l.st.Details = "shown"
	}
	l.save()
}

// Lens is the project On hand is narrowed to on this Mac (D261): a
// project's name, "~" for Other, "" for all.
func (l *Local) Lens() string {
	if l == nil {
		return ""
	}
	return l.st.OnHandLens
}

// SetLens remembers the project On hand is narrowed to.
func (l *Local) SetLens(name string) {
	if l == nil || l.st.OnHandLens == name {
		return
	}
	l.st.OnHandLens = name
	l.save()
}

// NewTaskWho is the agent the user last picked on the New task card
// (D185); "" for the suggested one.
func (l *Local) NewTaskWho() string {
	if l == nil {
		return ""
	}
	return l.st.NewTaskWho
}

// SetNewTaskWho remembers who the user picked, for the next card.
func (l *Local) SetNewTaskWho(key string) {
	if l == nil || l.st.NewTaskWho == key {
		return
	}
	l.st.NewTaskWho = key
	l.save()
}

// Tune is a model and an effort picked on the New task card (D202);
// "" for the suggestion and the model's own default.
type Tune struct {
	Model  string `json:"model,omitempty"`
	Effort string `json:"effort,omitempty"`
}

// NewTaskTune is the model and effort last picked for this agent.
func (l *Local) NewTaskTune(harness string) Tune {
	if l == nil {
		return Tune{}
	}
	return l.st.NewTaskTune[harness]
}

// SetNewTaskTune remembers the model and effort picked for this agent.
func (l *Local) SetNewTaskTune(harness string, t Tune) {
	if l == nil || l.st.NewTaskTune[harness] == t {
		return
	}
	if l.st.NewTaskTune == nil {
		l.st.NewTaskTune = map[string]Tune{}
	}
	l.st.NewTaskTune[harness] = t
	l.save()
}

// SetCLIOffer remembers that answer.
func (l *Local) SetCLIOffer(answer string) {
	if l == nil {
		return
	}
	l.st.CLIOffer = answer
	l.save()
}

// Asked is the answer to an offer (zero if never asked).
func (l *Local) Asked(name string) Ask {
	if l == nil {
		return Ask{}
	}
	return l.st.Asks[name]
}

// Answer remembers an answer to an offer.
func (l *Local) Answer(name, answer string, at time.Time) {
	if l == nil {
		return
	}
	if l.st.Asks == nil {
		l.st.Asks = map[string]Ask{}
	}
	a := l.st.Asks[name]
	a.Answer, a.At, a.Times = answer, at.UTC().Format(time.RFC3339), a.Times+1
	l.st.Asks[name] = a
	l.save()
}

// MayAsk reports whether an offer may show now: never asked; or "later"
// once, at least after days. "yes" and "no" are final.
func (l *Local) MayAsk(name string, now time.Time, after time.Duration) bool {
	a := l.Asked(name)
	switch a.Answer {
	case "":
		return true
	case "later":
		at, err := time.Parse(time.RFC3339, a.At)
		return a.Times < 2 && err == nil && now.Sub(at) >= after
	}
	return false
}

func (l *Local) save() {
	if l.Dir == "" {
		return
	}
	b, err := json.MarshalIndent(l.st, "", "  ")
	if err != nil {
		return
	}
	writeAtomic(filepath.Join(l.Dir, StateFile), append(b, '\n'))
}

func writeAtomic(path string, b []byte) {
	tmp := path + ".tmp"
	if os.WriteFile(tmp, b, 0o644) == nil {
		_ = os.Rename(tmp, path)
	}
}

// PersonaFile is the partner's chosen name, shared with the CLI
// (packages/cli/src/firstrun.ts): every `ducter up` reads it.
const PersonaFile = "persona.json"

// Persona is persona.json. Name is absent when the person kept the default.
type Persona struct {
	Name    string `json:"name,omitempty"`
	AskedAt string `json:"askedAt,omitempty"`
}

// ReadPersona reads persona.json; ok is false when there is none (the
// name was never asked).
func ReadPersona(dir string) (p Persona, ok bool) {
	b, err := os.ReadFile(filepath.Join(dir, PersonaFile))
	if err != nil {
		return Persona{}, false
	}
	if json.Unmarshal(b, &p) != nil {
		return Persona{}, false
	}
	return p, true
}

// WritePersona saves the answer to the name question.
func WritePersona(dir string, p Persona) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}
	writeAtomic(filepath.Join(dir, PersonaFile), append(b, '\n'))
	return nil
}

// CleanName makes a typed name safe to show: one line, no control
// characters, at most 24 characters (as cleanName in firstrun.ts).
func CleanName(raw string) string {
	var b strings.Builder
	for _, r := range raw {
		switch {
		case r < 0x20 || r == 0x7f:
		case unicode.IsSpace(r):
			b.WriteRune(' ')
		default:
			b.WriteRune(r)
		}
	}
	s := strings.Join(strings.Fields(b.String()), " ")
	if rs := []rune(s); len(rs) > 24 {
		s = string(rs[:24])
	}
	return s
}

// VoiceKey is the key held to talk (D305): "ropt" (right Option, the
// default), "fn" or "none".
func (l *Local) VoiceKey() string {
	if l == nil || (l.st.VoiceKey != "fn" && l.st.VoiceKey != "none") {
		return "ropt"
	}
	return l.st.VoiceKey
}

// SetVoiceKey remembers it.
func (l *Local) SetVoiceKey(k string) {
	if l == nil {
		return
	}
	if k != "fn" && k != "none" {
		k = ""
	}
	l.st.VoiceKey = k
	l.save()
}

// VoiceAsked reports whether the first hold's card was answered.
func (l *Local) VoiceAsked() bool { return l != nil && l.st.VoiceAsked }

// SetVoiceAsked remembers that it was.
func (l *Local) SetVoiceAsked() {
	if l == nil {
		return
	}
	l.st.VoiceAsked = true
	l.save()
}

// TalkAsked reports whether the first tap's card (D442) was answered.
func (l *Local) TalkAsked() bool { return l != nil && l.st.TalkAsked }

// SetTalkAsked remembers that it was.
func (l *Local) SetTalkAsked() {
	if l == nil {
		return
	}
	l.st.TalkAsked = true
	l.save()
}

// ReadBack reports whether a reply to a message sent by voice is read aloud.
func (l *Local) ReadBack() bool { return l != nil && l.st.ReadBack }

// SetReadBack turns it on or off.
func (l *Local) SetReadBack(on bool) {
	if l == nil {
		return
	}
	l.st.ReadBack = on
	l.save()
}

// FileFill reports whether this kind of file opens filling the window (D567).
func (l *Local) FileFill(kind string) bool { return l != nil && l.st.FileFill[kind] }

// FileOnMac is where the file with this id was last known on this Mac
// (D578), or "".
func (l *Local) FileOnMac(id string) string {
	if l == nil {
		return ""
	}
	return l.st.FilesOnMac[id]
}

// SetFileOnMac remembers where the file with this id is on this Mac; at
// most filesOnMacMax are kept.
func (l *Local) SetFileOnMac(id, path string) {
	if l == nil || id == "" || l.st.FilesOnMac[id] == path {
		return
	}
	if l.st.FilesOnMac == nil {
		l.st.FilesOnMac = map[string]string{}
	}
	for k := range l.st.FilesOnMac {
		if len(l.st.FilesOnMac) < filesOnMacMax {
			break
		}
		delete(l.st.FilesOnMac, k)
	}
	l.st.FilesOnMac[id] = path
	l.save()
}

// SetFileFill remembers the person's last choice for this kind.
func (l *Local) SetFileFill(kind string, on bool) {
	if l == nil || l.st.FileFill[kind] == on {
		return
	}
	if l.st.FileFill == nil {
		l.st.FileFill = map[string]bool{}
	}
	l.st.FileFill[kind] = on
	l.save()
}
