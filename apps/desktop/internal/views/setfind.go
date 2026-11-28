package views

import (
	"strings"
	"time"
	"unicode"

	"github.com/egoist/mygo/ui"
	"golang.org/x/text/unicode/norm"

	"github.com/wey-gu/ducter/apps/desktop/internal/i18n"
	"github.com/wey-gu/ducter/apps/desktop/internal/theme"
)

// D663: 找设置 / Find a setting. The field at the top of Settings' rail (⌘F in Settings); typing
// shows the settings it finds, never panes, in place of the pane: each a row with the pane's clay,
// the setting's own words, the pane it lives in apart, and its value at the right edge. Choosing
// one opens the pane landed on that row: scrolled to it, its tint rising and settling (the
// conversation's find), the keyboard on its control. Nothing found is one calm line in the
// partner's voice and the way to say it in the conversation. The web's twin is setfind.ts.
//
// The index is the panes' own words: an entry names its tab and the i18n key that pane draws as
// the setting's title (or a brand the pane draws as itself), never a copy of the words.
// setfind_test.go fails when a tab has no entry, when a key is no longer in its pane's source, or
// when a drawn pane misses an entry's words.

// setEntry is one setting a person may come looking for.
type setEntry struct {
	id   string
	tab  string
	key  string   // the pane's own title key; its words are the row's
	alt  []string // other title keys the pane may draw for it
	near string   // the group heading landed on when the row itself isn't drawn
	// brand: a name the pane draws as itself in every language (GitHub).
	brand string
	// home: the brand comes from the home's own list (an import source), not the pane's source.
	home  bool
	args  func(a *App) []any
	value func(a *App) string
}

func sfOnOff(a *App, on bool) string {
	if on {
		return a.L.T("setfind.on")
	}
	return a.L.T("setfind.off")
}

func sfSet(f func(a *App) string) func(a *App) string {
	return func(a *App) string {
		if a.S.Settings == nil {
			return ""
		}
		return f(a)
	}
}

// setIndex is every findable setting, tab by tab in the rail's order.
var setIndex = []setEntry{
	// 伙伴 / Partner
	{id: "name", tab: TabPartner, key: "partner.rename", value: func(a *App) string { return a.personaName() }},
	{id: "thinks", tab: TabPartner, key: "loadout.brain.title", alt: []string{"loadout.brain.title.default"}, value: sfSet(func(a *App) string { return a.homeThinks() })},
	{id: "model", tab: TabPartner, key: "loadout.brain.model", near: "loadout.brain.title"},
	{id: "effort", tab: TabPartner, key: "newtask.effort", near: "loadout.brain.title"},
	{id: "tasks", tab: TabPartner, key: "loadout.tasks.title"},
	{id: "newtasks", tab: TabPartner, key: "newtasks.title"},
	{id: "add", tab: TabPartner, key: "loadout.add.title", alt: []string{"loadout.add.title.first"}},
	{id: "key", tab: TabPartner, key: "key.settings.row", near: "loadout.add.title"},
	{id: "handoff", tab: TabPartner, key: "handoff.row", near: "handoff.title", value: sfSet(func(a *App) string { return sfOnOff(a, a.S.Settings.LimitHandoff) })},
	{id: "talk", tab: TabPartner, key: "settings.talk.row", near: "partner.talk.title"},
	{id: "records", tab: TabPartner, key: "records.look", near: "records.title"},
	{id: "trust", tab: TabPartner, key: "partner.trust.title"},
	{id: "partners", tab: TabPartner, key: "partners.add", alt: []string{"partners.title"}},
	// 记忆 / Memory
	{id: "memory", tab: TabMemory, key: "partner.memory.switch", value: sfSet(func(a *App) string { return sfOnOff(a, a.S.Settings.Memory) })},
	{id: "about", tab: TabMemory, key: "mem.about.title"},
	{id: "rules", tab: TabMemory, key: "mem.rules.title"},
	// Agent 通信 / Agent messaging
	{id: "peers", tab: TabPeers, key: "peers.switch.title", args: func(a *App) []any { return []any{a.personaName()} }},
	{id: "peerrules", tab: TabPeers, key: "peers.rules.title"},
	// 通知 / Notifications
	{id: "notify", tab: TabNotify, key: "partner.notify.on", value: sfSet(func(a *App) string { return sfOnOff(a, a.S.Settings.Notify) })},
	{id: "quiet", tab: TabNotify, key: "partner.quiet", near: "partner.notify.title", value: sfSet(func(a *App) string {
		s := a.S.Settings
		if s.Notify && s.Quiet != nil {
			return a.L.T("setfind.range", s.Quiet.Start, s.Quiet.End)
		}
		return sfOnOff(a, false)
	})},
	{id: "proactive", tab: TabNotify, key: "proactive.title", near: "proactive.group", value: sfSet(func(a *App) string {
		if p := a.S.Settings.Proactive; p != "" {
			return a.L.T("proactive." + p)
		}
		return ""
	})},
	{id: "wait", tab: TabNotify, key: "partner.default.line", near: "partner.default.title", value: sfSet(func(a *App) string { return a.defaultWaitLabel(a.S.Settings.DefaultAfterMin) })},
	// 账号 / Accounts
	{id: "read", tab: TabAccounts, key: "acct.sec.read"},
	{id: "calls", tab: TabAccounts, key: "acct.sec.calls"},
	{id: "own", tab: TabAccounts, key: "own.title", near: "acct.sec.calls"},
	// 待办来源 / To-do sources
	{id: "github", tab: TabTodos, brand: "GitHub"},
	{id: "obsidian", tab: TabTodos, brand: "Obsidian"},
	// 导入 / Import
	{id: "lody", tab: TabImport, brand: "Lody", home: true},
	// 聊天软件 / Chat apps
	{id: "telegram", tab: TabChats, brand: "Telegram"},
	{id: "slack", tab: TabChats, brand: "Slack"},
	{id: "feishu", tab: TabChats, key: "chats.feishu"},
	{id: "wechat", tab: TabChats, key: "chats.wechat"},
	{id: "imessage", tab: TabChats, brand: "iMessage"},
	// 密码和银行卡 / Passwords & cards
	{id: "signins", tab: TabAutofill, key: "af.signins"},
	{id: "cards", tab: TabAutofill, key: "af.cards"},
	{id: "details", tab: TabAutofill, key: "af.details"},
	{id: "keys", tab: TabAutofill, key: "af.keys.ask", near: "af.keys"},
	{id: "uses", tab: TabAutofill, key: "af.uses"},
	// 外观和声音 / Look and sound
	{id: "look", tab: TabLook, key: "settings.look.group"},
	{id: "theme", tab: TabLook, key: "settings.look.mode", value: func(a *App) string {
		if a.Local == nil {
			return ""
		}
		return a.L.T("settings.look.mode." + a.Local.Appearance())
	}},
	{id: "density", tab: TabLook, key: "density.title", value: func(a *App) string {
		if a.Local == nil {
			return ""
		}
		if a.compact() {
			return a.L.T("density.compact")
		}
		return a.L.T("density.comfortable")
	}},
	{id: "menubar", tab: TabLook, key: "settings.menubar"},
	{id: "uilang", tab: TabLook, key: "settings.lang.title", value: func(a *App) string {
		if a.Local == nil {
			return ""
		}
		return a.L.T("settings.lang." + a.Local.Lang())
	}},
	{id: "details2", tab: TabLook, key: "settings.details.title"},
	{id: "sound", tab: TabLook, key: "settings.sound.row"},
	{id: "voicekey", tab: TabLook, key: "voice.settings.key"},
	{id: "readback", tab: TabLook, key: "voice.settings.readback"},
	// 在哪儿运行 / Where it runs
	{id: "devices", tab: TabRun, key: "settings.devices.link"},
	{id: "lend", tab: TabRun, key: "lend.entry"},
	{id: "folder", tab: TabRun, key: "settings.folder.row"},
	{id: "logs", tab: TabRun, key: "settings.data.logs.row", near: "settings.data.title"},
	{id: "remove", tab: TabRun, key: "remove.title"},
	// 更新和关于 / Updates and about
	{id: "versions", tab: TabAbout, key: "settings.versions.title"},
	{id: "autoupdate", tab: TabAbout, key: "settings.versions.night", near: "settings.versions.title", value: sfSet(func(a *App) string { return sfOnOff(a, a.S.Settings.AutoUpdate) })},
	{id: "docs", tab: TabAbout, key: "settings.about.docs"},
	{id: "report", tab: TabAbout, key: "settings.about.report"},
}

// ---------- matching (the web's setFind, word for word) ----------

var sfZW = strings.NewReplacer("​", "", "⁠", "", "­", "")

// sfNorm is words as compared: NFKC, lower case, no zero-width joins, a printf verb as a gap.
func sfNorm(s string) string {
	s = strings.ToLower(sfZW.Replace(norm.NFKC.String(s)))
	for _, v := range []string{"%s", "%d", "%[1]s", "%[2]s", "%[1]d", "%[2]d"} {
		s = strings.ReplaceAll(s, v, " ")
	}
	return strings.TrimSpace(s)
}

func sfHan(s string) bool {
	for _, r := range s {
		if unicode.In(r, unicode.Han, unicode.Hiragana, unicode.Katakana, unicode.Hangul) {
			return true
		}
	}
	return false
}

func sfCompact(s string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsSpace(r) || unicode.IsPunct(r) || unicode.IsSymbol(r) {
			return -1
		}
		return r
	}, s)
}

func sfWords(s string) []string {
	return strings.FieldsFunc(s, func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsNumber(r) })
}

// sfTermIn is how well one typed term matches a field: 2 a word starts with it (in Chinese: it is
// in it), 1 a loose match (D456: a Latin word of five letters or more, one slip off), 0 none.
func sfTermIn(term, field string) int {
	if field == "" {
		return 0
	}
	if sfHan(term) {
		if strings.Contains(sfCompact(field), sfCompact(term)) {
			return 2
		}
		return 0
	}
	ws := sfWords(field)
	for _, w := range ws {
		if strings.HasPrefix(w, term) {
			return 2
		}
	}
	if len([]rune(term)) >= 3 && strings.Contains(sfCompact(field), sfCompact(term)) {
		return 2
	}
	if len([]rune(term)) >= 5 {
		for _, w := range ws {
			if looseMatch(term, w, field) {
				return 1
			}
		}
	}
	return 0
}

type sfField struct {
	text string
	w    int
}

// sfPaneKey is the key of a tab's name as the rail says it.
func sfPaneKey(tab string) string {
	if tab == TabPeers {
		return "settings.short.peers"
	}
	return "settings.tab." + tab
}

// sfFields are the words an entry is found by, in both languages: its titles (weight 3), its
// synonyms (2), its pane's name (1).
func sfFields(e setEntry) []sfField {
	var out []sfField
	if e.brand != "" {
		out = append(out, sfField{sfNorm(e.brand), 3})
	}
	for _, k := range append([]string{e.key}, e.alt...) {
		if k == "" {
			continue
		}
		for _, v := range i18n.SetFindBoth(k) {
			out = append(out, sfField{sfNorm(v), 3})
		}
	}
	for _, v := range i18n.SetFindBoth("setfind.syn." + e.id) {
		for _, s := range strings.FieldsFunc(v, func(r rune) bool { return r == '、' || r == ',' || r == '，' }) {
			if s = strings.TrimSpace(s); s != "" {
				out = append(out, sfField{sfNorm(s), 2})
			}
		}
	}
	for _, k := range []string{sfPaneKey(e.tab), "settings.tab." + e.tab} {
		for _, v := range i18n.SetFindBoth(k) {
			out = append(out, sfField{sfNorm(v), 1})
		}
	}
	return out
}

// sfHit is a found setting: its score, and whether every word named it (not only its pane).
type sfHit struct {
	e     setEntry
	score int
	named bool
}

// setTitle is the words a setting goes by on screen now.
func (a *App) setTitle(e setEntry) string {
	if e.brand != "" {
		return e.brand
	}
	var args []any
	if e.args != nil {
		args = e.args(a)
	}
	return a.L.T(e.key, args...)
}

// setPane is the setting's pane, by its name in the rail.
func (a *App) setPane(e setEntry) string {
	if e.tab == TabPeers {
		return a.L.T("settings.short.peers")
	}
	return a.tabName(e.tab)
}

// setFind is what the words find, best first: every term somewhere, a title before a synonym
// before a pane's name, then the rail's order. Deterministic and instant (D391: never a model).
func (a *App) setFind(q string) []sfHit {
	terms := strings.Fields(sfNorm(q))
	if len(terms) == 0 {
		return nil
	}
	shown := map[string]bool{}
	for _, t := range a.visibleTabs() {
		shown[t] = true
	}
	var out []sfHit
	for i, e := range setIndex {
		if !shown[e.tab] {
			continue
		}
		fields := sfFields(e)
		score, named, ok := 0, true, true
		for _, term := range terms {
			best, byName := 0, false
			for _, f := range fields {
				s := sfTermIn(term, f.text) * f.w
				if s > best {
					best = s
				}
				if s > 0 && f.w > 1 {
					byName = true
				}
			}
			if best == 0 {
				ok = false
				break
			}
			score += best
			named = named && byName
		}
		if !ok {
			continue
		}
		if strings.HasPrefix(sfNorm(a.setTitle(e)), sfNorm(q)) {
			score += 2
		}
		out = append(out, sfHit{e: e, score: score*1000 - i, named: named})
	}
	for i := 1; i < len(out); i++ { // insertion sort: stable, best first
		for j := i; j > 0 && out[j].score > out[j-1].score; j-- {
			out[j], out[j-1] = out[j-1], out[j]
		}
	}
	return out
}

// ---------- the field, the rows, the landing ----------

// sfState is the field's words, the row the keys are on, whether the found rows stand in place
// of the pane, and a landing under way.
type sfState struct {
	q, last  string
	at       int
	showing  bool
	focus    bool
	focusCtl bool
	land     *sfLand
}

// sfLand is a jump landing on its row: the pane, the words its row draws, its group's heading,
// when it was asked, and once found which words it landed on and when.
type sfLand struct {
	tab   string
	own   []string
	near  string
	asked time.Time
	hit   string
	at    time.Time
	moved bool
	keyed bool
}

// sfDur is how long a landed row's tint rises, holds and settles.
const sfDur = 2200 * time.Millisecond

// setJump opens a found setting's pane, landing on its row.
func (a *App) setJump(e setEntry) {
	var args []any
	if e.args != nil {
		args = e.args(a)
	}
	l := &sfLand{tab: e.tab} // asked: on the first frame that draws it, on the window's clock
	if e.brand != "" {
		l.own = append(l.own, sfNorm(e.brand))
	}
	for _, k := range append([]string{e.key}, e.alt...) {
		if k != "" {
			l.own = append(l.own, sfNorm(a.L.T(k, args...)))
		}
	}
	if e.near != "" {
		l.near = sfNorm(a.L.T(e.near))
	}
	a.sf.showing = false
	a.openTab(e.tab)
	a.sf.land = l
}

// sfMark is every Settings row's and heading's part in a landing: the row whose words are the
// setting's is scrolled to once, tinted on the find's curve, and its control takes the keyboard
// (focus reports that the row's control should, once). A heading is the landing only when the
// row itself hasn't come after 0.9 s (quiet hours while notifications are off).
func (a *App) sfMark(c *ui.Context, el ui.Element, title string) (focus bool) {
	l := a.sf.land
	if l == nil || l.tab != a.settingsTab() || title == "" {
		return false
	}
	w := sfNorm(title)
	if l.hit == "" {
		own := false
		for _, o := range l.own {
			if o == w {
				own = true
			}
		}
		if !own && !(l.near != "" && w == l.near && !l.asked.IsZero() && c.Now().Sub(l.asked) > 900*time.Millisecond) {
			return false
		}
		l.hit, l.at, l.keyed = w, c.Now(), !own
	}
	if l.hit != w {
		return false
	}
	k, on := findCurve(c.Now().Sub(l.at), sfDur)
	if !on {
		a.sf.land = nil
		return false
	}
	if !l.moved {
		l.moved = true
		an := ui.Smooth
		opts := ui.ScrollIntoViewOptions{Block: ui.ScrollCenter, Animation: &an}
		if c.Preferences().ReduceMotion {
			opts.Animation = nil
		}
		el.ScrollIntoView(opts)
	}
	el.Background(a.T.Reply.FoundPartner.Alpha(k))
	c.After(16 * time.Millisecond)
	if !l.keyed {
		l.keyed = true
		return true
	}
	return false
}

// sfControl draws a row's control with the keyboard handed to it when the row was landed on.
func (a *App) sfControl(focus bool, control func()) func() {
	if !focus || control == nil {
		return control
	}
	return func() {
		a.sf.focusCtl = true
		control()
		a.sf.focusCtl = false
	}
}

// sfTakeFocus gives the keyboard to the control being drawn when a landing asked for it.
func (a *App) sfTakeFocus(el ui.Element) {
	if a.sf.focusCtl {
		a.sf.focusCtl = false
		el.Focus()
	}
}

// setFindField is the rail's field: the words change the found rows; ↑↓ walk them, Return opens
// one, Esc lets go of the words.
func (a *App) setFindField(c *ui.Context) {
	sf := &a.sf
	in := a.findBox(c, "set-find", a.L.T("setfind.field"), &sf.q, func() {
		if hits := a.setFind(sf.q); len(hits) > 0 {
			a.setJump(hits[min(sf.at, len(hits)-1)].e)
		}
	})
	if sf.focus {
		sf.focus = false
		in.Focus()
		if sf.q != "" {
			sf.showing = true
		}
	}
	if sf.q != sf.last {
		sf.last, sf.at = sf.q, 0
		sf.showing = strings.TrimSpace(sf.q) != ""
	}
	if !in.Focused() {
		return
	}
	n := len(a.setFind(sf.q))
	switch {
	case c.Shortcut(0, ui.KeyEscape) && sf.q != "":
		sf.q, sf.last, sf.showing = "", "", false
	case n > 0 && c.Shortcut(0, ui.KeyDown):
		sf.at = (sf.at + 1) % n
	case n > 0 && c.Shortcut(0, ui.KeyUp):
		sf.at = (sf.at + n - 1) % n
	}
}

// setFindPanel is what the words find, in place of the pane.
func (a *App) setFindPanel(c *ui.Context) {
	t := a.T
	q := strings.TrimSpace(a.sf.q)
	hits := a.setFind(q)
	if len(hits) == 0 {
		a.setNone(c, q)
		return
	}
	count := a.L.T("setfind.found", len(hits))
	if len(hits) == 1 {
		count = a.L.T("setfind.found.one")
	}
	uiText(c.Key("sf-count"), count).FontSize(t.SM).TextColor(t.InkMuted).Padding(0, t.S5)
	at := min(a.sf.at, len(hits)-1)
	a.group(c, "sf-hits", "", "", func() {
		for i, h := range hits {
			e := h.e
			title, pane := a.setTitle(e), a.setPane(e)
			if pane == title {
				pane = "" // never said twice (通知 in 通知)
			}
			value := ""
			if e.value != nil {
				value = e.value(a)
			}
			if a.findHitRow(c, "sf:"+e.id, func() { a.tabIcon(c, e.tab, 32) }, title, pane, value, i == at) {
				a.setJump(e)
			}
		}
	})
}

// setNone is nothing found: the partner says so calmly, and where it can be said instead.
func (a *App) setNone(c *ui.Context, q string) {
	t := a.T
	name := a.personaName()
	ui.Row(c.Key("sf-none")).Gap(t.S3).Padding(t.S2, t.S5).AlignItems(ui.Start).Children(func() {
		a.avatar(c, theme.Idle, 40)
		ui.Column(c).Grow(1).MinWidth(0).Gap(t.S1).Padding(6, 0, 0, 0).Children(func() {
			uiText(c, a.L.T("setfind.none", q)).FontSize(t.MD).FontWeight(600).LineHeight(a.leading(1.5)).TextColor(t.Ink)
			uiText(c, a.L.T("setfind.none.ask")).FontSize(t.MD).LineHeight(a.leading(1.5)).TextColor(t.InkSoft)
			ui.Row(c).Padding(t.S2, 0, 0, 0).Children(func() {
				if a.button(c, a.L.T("setfind.none.go", name), btnSecondary, t.ControlSM, t.Surface) {
					a.sf.q, a.sf.last, a.sf.showing = "", "", false
					a.Route = RouteConversation
					a.draft = q
					a.focusComposer = true
				}
			})
		})
	})
}
