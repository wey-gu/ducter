package views

// D534: @ and / in the composers (design/mentions.md), as the web's
// composer.tsx draws them. Typing @ opens the @ list over the composer
// (tasks, files in the task's place, Keeps, partners, PRs and issues);
// typing / opens the / list (Ducter's actions and the person's skills, or
// the task agent's own commands and Ducter's task actions). ↑↓ (and ⌃N ⌃P)
// walk it, Return or Tab picks, Esc closes, typing filters, a click picks.
// A picked reference is written as @its name, marked in the words, and
// rides with the message; a sent message draws it as the chip (refChip).
// The text helpers mirror packages/protocol/src/mentions.ts and pass
// fixtures/mentions.json (mentions_test.go). This file defines the shared
// popover and chip (the D161 table).

import (
	"fmt"
	"sort"
	"strings"
	"unicode"

	"github.com/egoist/mygo/ui"

	"github.com/wey-gu/ducter/apps/desktop/internal/protocol"
)

// ---------- the words: triggers, tokens, spans (mentions.ts) ----------

const (
	refsMax     = 8
	mentionRows = 6
	labelMax    = 36
)

func emailCh(r rune) bool {
	return r < 128 && (unicode.IsLetter(r) || unicode.IsDigit(r) || strings.ContainsRune("._%+-", r))
}

// mentionAt is the @ being typed at caret (runes): where it starts and the
// words after it. An @ in an address is not one; the words stop at a line
// break and after three spaces.
func mentionAt(text string, caret int) (int, string, bool) {
	rs := []rune(text)
	if caret > len(rs) {
		caret = len(rs)
	}
	before := rs[:caret]
	for i := len(before) - 1; i >= 0 && len(before)-i <= labelMax+1; i-- {
		ch := before[i]
		if ch == '\n' {
			return 0, "", false
		}
		if ch != '@' {
			continue
		}
		if i > 0 && emailCh(before[i-1]) {
			return 0, "", false
		}
		q := string(before[i+1:])
		if strings.Count(q, " ") >= 3 {
			return 0, "", false
		}
		return i, q, true
	}
	return 0, "", false
}

// slashAt is the / being typed at caret: in a task only at the very start
// of the words; for the partner also after a space or a line break.
func slashAt(text string, caret int, task bool) (int, string, bool) {
	rs := []rune(text)
	if caret > len(rs) {
		caret = len(rs)
	}
	before := rs[:caret]
	i := len(before) - 1
	for i >= 0 && before[i] != '/' && !unicode.IsSpace(before[i]) {
		i--
	}
	if i < 0 || before[i] != '/' {
		return 0, "", false
	}
	if i > 0 && !unicode.IsSpace(before[i-1]) {
		return 0, "", false
	}
	if task && strings.TrimSpace(string(before[:i])) != "" {
		return 0, "", false
	}
	return i, string(before[i+1:]), true
}

// placeToken puts token and a space where start…caret was typed.
func placeToken(text string, start, caret int, token string) (string, int) {
	rs := []rune(text)
	if caret > len(rs) {
		caret = len(rs)
	}
	head := string(rs[:start]) + token + " "
	tail := strings.TrimPrefix(string(rs[caret:]), " ")
	return head + tail, len([]rune(head))
}

// labelOf is the name a reference is written with: one line, cut at a word
// end, an @ inside written full width.
func labelOf(name string) string {
	one := strings.TrimSpace(strings.ReplaceAll(strings.Join(strings.Fields(name), " "), "@", "＠"))
	rs := []rune(one)
	if len(rs) <= labelMax {
		return one
	}
	cut := string(rs[:labelMax])
	if sp := strings.LastIndex(cut, " "); sp >= 0 && len([]rune(cut[:sp])) > labelMax/2 {
		cut = cut[:sp]
	}
	return strings.TrimSpace(cut) + "…"
}

// tokenOf is how a reference is written in the words: @name, /name for one picked from /.
func tokenOf(r protocol.Ref) string {
	if r.Kind == "skill" || r.Kind == "action" {
		return "/" + r.Label
	}
	return "@" + r.Label
}

type refSpan struct {
	start, end int // runes
	ref        protocol.Ref
}

// refSpans are where each reference's token sits in the words (runes), in
// order, never overlapping, longer names first.
func refSpans(text string, refs []protocol.Ref) []refSpan {
	byLen := append([]protocol.Ref(nil), refs...)
	sort.SliceStable(byLen, func(i, j int) bool { return len([]rune(tokenOf(byLen[i]))) > len([]rune(tokenOf(byLen[j]))) })
	rs := []rune(text)
	var out []refSpan
	for _, r := range byLen {
		tok := []rune(tokenOf(r))
		for at := 0; at+len(tok) <= len(rs); at++ {
			if string(rs[at:at+len(tok)]) != string(tok) {
				continue
			}
			end := at + len(tok)
			over := false
			for _, s := range out {
				if at < s.end && end > s.start {
					over = true
				}
			}
			if !over {
				out = append(out, refSpan{at, end, r})
			}
			at = end - 1
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].start < out[j].start })
	return out
}

// liveRefs are the references whose token is still in the words, once each.
func liveRefs(text string, refs []protocol.Ref) []protocol.Ref {
	var out []protocol.Ref
	for _, r := range refs {
		if len(out) >= refsMax {
			break
		}
		if !strings.Contains(text, tokenOf(r)) {
			continue
		}
		dup := false
		for _, o := range out {
			dup = dup || (o.Kind == r.Kind && o.ID == r.ID)
		}
		if !dup {
			out = append(out, r)
		}
	}
	return out
}

// matchScore is how well q matches a name (and its quiet line); 0: not.
func matchScore(q, name, sub string) float64 {
	query := strings.ToLower(strings.TrimSpace(q))
	if query == "" {
		return 1
	}
	n := strings.ToLower(name)
	if strings.HasPrefix(n, query) {
		return 4
	}
	for _, w := range strings.FieldsFunc(n, func(r rune) bool { return unicode.IsSpace(r) || strings.ContainsRune("/._:-", r) }) {
		if strings.HasPrefix(w, query) {
			return 3
		}
	}
	if strings.Contains(n, query) {
		return 2.5
	}
	words := strings.Fields(query)
	hay := n + " " + strings.ToLower(sub)
	all := true
	for _, w := range words {
		all = all && strings.Contains(hay, w)
	}
	if all {
		return 2
	}
	for _, w := range words {
		if !looseMatch(w, hay, name) {
			return 0
		}
	}
	return 1
}

// refPieces splits words into text and references at their tokens.
type refPiece struct {
	text string
	ref  *protocol.Ref
}

func refPieces(text string, refs []protocol.Ref) []refPiece {
	rs := []rune(text)
	var out []refPiece
	at := 0
	for _, s := range refSpans(text, refs) {
		if s.start > at {
			out = append(out, refPiece{text: string(rs[at:s.start])})
		}
		r := s.ref
		out = append(out, refPiece{ref: &r})
		at = s.end
	}
	if at < len(rs) {
		out = append(out, refPiece{text: string(rs[at:])})
	}
	return out
}

// splitRefs is the person's own words to a task and what they referred to
// (withRefs' block, never shown).
func splitRefs(sent string) (string, []protocol.Ref) {
	at := strings.Index(sent, "\n\n<ducter-refs>\n")
	if at < 0 {
		return sent, nil
	}
	var refs []protocol.Ref
	for _, line := range strings.Split(sent[at:], "\n") {
		if !strings.HasPrefix(line, "- @") && !strings.HasPrefix(line, "- /") {
			continue
		}
		head := line[3:]
		open := strings.LastIndex(head, " [")
		close := strings.Index(head, "]: ")
		if open < 0 || close < open {
			continue
		}
		kindID := strings.SplitN(head[open+2:close], " ", 2)
		if len(kindID) != 2 {
			continue
		}
		refs = append(refs, protocol.Ref{Kind: kindID[0], ID: kindID[1], Label: head[:open]})
	}
	return sent[:at], refs
}

// ---------- the state ----------

type popState struct {
	kind     rune // '@' or '/'; 0: closed
	start    int
	q        string
	sel      int
	shut     string // the trigger Esc closed, until it changes
	setCaret int    // where the caret goes next frame (-1: nowhere)
	caret    int    // last frame's
}

type mentionsState struct {
	refs  map[string][]protocol.Ref // by place: "" the partner's, else a task's id
	pops  map[string]*popState      // by composer key
	n     int
	asked string // the newest @ ask
	q     string
	where string
	slash map[string]string // the / ask in flight, by place
}

func (a *App) mn() *mentionsState {
	if a.mnState == nil {
		a.mnState = &mentionsState{refs: map[string][]protocol.Ref{}, pops: map[string]*popState{}, slash: map[string]string{}}
	}
	return a.mnState
}

// takeRefs are the references still in the words sent from a place; the
// place lets go of them.
func (a *App) takeRefs(where, text string) []protocol.Ref {
	m := a.mn()
	out := liveRefs(text, m.refs[where])
	delete(m.refs, where)
	return out
}

func (a *App) askMentions(where, q string) {
	m := a.mn()
	if m.where == where && m.q == q && m.asked != "" {
		return
	}
	m.n++
	m.where, m.q, m.asked = where, q, fmt.Sprintf("m%d", m.n)
	a.send(protocol.MentionFind{T: "mention_find", ID: m.asked, Q: q, TaskID: where})
}

func (a *App) slashList(where string) *protocol.SlashList {
	m := a.mn()
	have := a.S.Mentions.Slash[where]
	if have == nil && m.slash[where] == "" {
		m.n++
		m.slash[where] = fmt.Sprintf("s%d", m.n)
		a.send(protocol.SlashFind{T: "slash_find", ID: m.slash[where], TaskID: where})
	}
	return have
}

// mentionPlace is where a composer's @ and / work: the partner's (where "")
// or a task's (its id, task true).
type mentionPlace struct {
	where string
	task  bool
}

type popRow struct {
	item  *protocol.MentionItem
	entry *protocol.SlashEntry
}

type popSection struct {
	key  string
	rows []popRow
}

var refGroups = []struct {
	key   string
	kinds []string
}{
	{"mention.group.tasks", []string{"task"}},
	{"mention.group.files", []string{"file"}},
	{"mention.group.keeps", []string{"keep"}},
	{"mention.group.partners", []string{"partner"}},
	{"mention.group.code", []string{"pr", "issue"}},
}

func (a *App) slashWord(e protocol.SlashEntry) string {
	if e.Group == "ducter" || e.Group == "task" {
		return a.L.T("slash." + e.Name)
	}
	return e.Name
}

func (a *App) slashAbout(e protocol.SlashEntry) string {
	switch {
	case e.Group == "ducter" || e.Group == "task":
		return a.L.T("slash." + e.Name + ".about")
	case e.About != "":
		return e.About
	case e.Name == "compact" || e.Name == "model" || e.Name == "effort":
		return a.L.T("slash.cmd." + e.Name)
	}
	return ""
}

// popSections are the open list's sections, and whether it still waits.
func (a *App) popSections(p *popState, mp *mentionPlace) ([]popSection, bool, string) {
	if p.kind == '@' {
		l := a.S.Mentions.List
		m := a.mn()
		if l == nil || l.ID != m.asked {
			return nil, true, ""
		}
		var out []popSection
		for _, g := range refGroups {
			var rows []popRow
			for i := range l.Items {
				it := &l.Items[i]
				for _, k := range g.kinds {
					if it.Kind == k {
						rows = append(rows, popRow{item: it})
					}
				}
			}
			if len(rows) > 0 {
				out = append(out, popSection{g.key, rows})
			}
		}
		return out, false, ""
	}
	l := a.slashList(mp.where)
	if l == nil {
		return nil, true, ""
	}
	var out []popSection
	for _, g := range []string{"task", "ducter", "native", "skills"} {
		type hit struct {
			e *protocol.SlashEntry
			s float64
			i int
		}
		var hits []hit
		for i := range l.Entries {
			e := &l.Entries[i]
			if e.Group != g {
				continue
			}
			name := e.Name
			if g == "ducter" || g == "task" {
				name = e.Name + " " + a.slashWord(*e)
			}
			if s := matchScore(p.q, name, e.About); s > 0 {
				hits = append(hits, hit{e, s, i})
			}
		}
		sort.SliceStable(hits, func(i, j int) bool { return hits[i].s > hits[j].s })
		max := mentionRows
		if g == "native" || g == "skills" {
			max = 60
		}
		var rows []popRow
		for i, h := range hits {
			if i >= max {
				break
			}
			rows = append(rows, popRow{entry: h.e})
		}
		if len(rows) > 0 {
			out = append(out, popSection{"slash.group." + g, rows})
		}
	}
	return out, false, l.Harness
}

func (a *App) sectionName(key, harness string) string {
	switch key {
	case "slash.group.native":
		if harness != "" {
			return a.L.T("slash.group.native", harnessName(harness))
		}
		return a.L.T("slash.group.native.bare")
	case "slash.group.skills":
		if harness != "" {
			return a.L.T("slash.group.agentSkills", harnessName(harness))
		}
	}
	return a.L.T(key)
}

// ---------- in the composer ----------

// mentionsDetect reads the trigger at the caret after the words were built.
func (a *App) mentionsDetect(key string, mp *mentionPlace, ta ui.Element, text string) *popState {
	m := a.mn()
	p := m.pops[key]
	if p == nil {
		p = &popState{setCaret: -1}
		m.pops[key] = p
	}
	if p.setCaret >= 0 {
		ta.SetTextSelection(p.setCaret, p.setCaret)
		p.caret, p.setCaret = p.setCaret, -1
	}
	s, e := ta.TextSelection()
	if !ta.Focused() || s != e {
		p.kind = 0
		return p
	}
	p.caret = e
	kind, start, q := rune(0), 0, ""
	if st, qq, ok := mentionAt(text, e); ok {
		kind, start, q = '@', st, qq
	} else if st, qq, ok := slashAt(text, e, mp.task); ok {
		kind, start, q = '/', st, qq
	}
	shutKey := fmt.Sprintf("%c%d", kind, start)
	if kind == 0 || p.shut == shutKey {
		if kind == 0 {
			p.shut = ""
		}
		p.kind = 0
		return p
	}
	if p.kind != kind || p.q != q || p.start != start {
		p.sel = 0
	}
	p.kind, p.start, p.q = kind, start, q
	if kind == '@' {
		a.askMentions(mp.where, q)
	}
	return p
}

// mentionMarks styles the picked references in the words.
func (a *App) mentionMarks(ta ui.Element, mp *mentionPlace, text string) {
	spans := refSpans(text, a.mn().refs[mp.where])
	if len(spans) == 0 {
		return
	}
	rs := make([]ui.TextRange, 0, len(spans))
	for _, s := range spans {
		rs = append(rs, ui.TextRange{Start: s.start, End: s.end, Color: a.T.HighlightInk, Weight: 700})
	}
	ta.TextRanges(rs...)
}

// mentionKeys handles the list's keys while it is open (true: taken).
func (a *App) mentionKeys(key string, mp *mentionPlace, k ui.TextKey) bool {
	p := a.mn().pops[key]
	if p == nil || p.kind == 0 {
		return false
	}
	secs, _, _ := a.popSections(p, mp)
	var rows []popRow
	for _, s := range secs {
		rows = append(rows, s.rows...)
	}
	down := k.Key == ui.KeyDown || (k.Mods == ui.Ctrl && k.Key == ui.KeyN)
	up := k.Key == ui.KeyUp || (k.Mods == ui.Ctrl && k.Key == ui.KeyP)
	switch {
	case (down || up) && len(rows) > 0:
		d := 1
		if up {
			d = -1
		}
		p.sel = (p.sel + d + len(rows)) % len(rows)
		return true
	case (k.Key == ui.KeyEnter && k.Mods == 0) || k.Key == ui.KeyTab:
		if len(rows) == 0 {
			return k.Key == ui.KeyTab
		}
		if p.sel >= len(rows) {
			p.sel = len(rows) - 1
		}
		text := k.Text()
		if out, ok := a.pickRow(p, mp, rows[p.sel], text); ok {
			k.SetText(out)
		}
		return true
	case k.Key == ui.KeyEscape:
		p.shut = fmt.Sprintf("%c%d", p.kind, p.start)
		p.kind = 0
		return true
	}
	return false
}

// pickRow does what a picked row does; it returns the new words when it wrote them.
func (a *App) pickRow(p *popState, mp *mentionPlace, r popRow, text string) (string, bool) {
	m := a.mn()
	caret := p.caret
	add := func(ref protocol.Ref) {
		for _, x := range m.refs[mp.where] {
			if x.Kind == ref.Kind && x.ID == ref.ID && x.Label == ref.Label {
				return
			}
		}
		m.refs[mp.where] = append(m.refs[mp.where], ref)
	}
	var token string
	switch {
	case r.item != nil:
		ref := r.item.Ref
		add(ref)
		token = tokenOf(ref)
	case r.entry.Run != "":
		rs := []rune(text)
		if caret > len(rs) {
			caret = len(rs)
		}
		out := string(rs[:p.start]) + strings.TrimPrefix(string(rs[caret:]), " ")
		p.kind, p.setCaret = 0, p.start
		a.runSlash(r.entry.Run, mp.where)
		return out, true
	case r.entry.Ref != nil:
		ref := *r.entry.Ref
		if ref.Kind == "action" {
			ref.Label = a.L.T("slash." + r.entry.Name + ".chip")
		}
		add(ref)
		token = tokenOf(ref)
	default:
		token = strings.TrimRight(r.entry.Insert, " ")
		if token == "" {
			token = "/" + r.entry.Name
		}
	}
	out, at := placeToken(text, p.start, caret, token)
	p.kind, p.setCaret = 0, at
	return out, true
}

// runSlash runs one of Ducter's own / entries: its sheet opens where it has one.
func (a *App) runSlash(run, where string) {
	switch run {
	case "new_task":
		a.OpenNewTask(nil)
	case "find":
		a.OpenSwitcher()
	case "handover":
		a.openHandDo()
	case "pause":
		if where != "" {
			a.TaskAction(where, "interrupt")
		}
	case "switch":
		if where != "" {
			a.openSwitch(where)
		}
	case "fork":
		it := a.pastItemFor(where)
		if it == nil {
			return
		}
		a.askSteps(where)
		st := protocol.PastStep{N: 1, Text: it.Title}
		if f := a.S.Past.Steps[where]; f != nil && len(f.Steps) > 0 {
			st = f.Steps[len(f.Steps)-1]
		}
		a.openRedo(it, st)
	}
}

// mentionPop is the list over the composer's card (box), above it, never
// clipped (it goes below where there is no room above).
func (a *App) mentionPop(c *ui.Context, key string, mp *mentionPlace, box ui.Element, draft *string) {
	t := a.T
	p := a.mn().pops[key]
	if p == nil || p.kind == 0 {
		return
	}
	secs, waiting, harness := a.popSections(p, mp)
	nRows := 0
	for _, s := range secs {
		nRows += len(s.rows)
	}
	if p.sel >= nRows {
		p.sel = 0
	}
	maxH := float32(340)
	if b := box.Bounds(); b.Y-16 < maxH && b.Y > 176 {
		maxH = b.Y - 16
	}
	w := float32(360)
	if b := box.Bounds(); b.W > 0 && b.W < w {
		w = b.W
	}
	label := a.L.T("mention.label")
	if p.kind == '/' {
		label = a.L.T("slash.label")
	}
	panel := ui.Scroll(c.Key(key+"-pop")).AttachTo(box, ui.AnchorTopStart, ui.AnchorBottomStart).AttachEdgeMargin(12).Margin(0, 0, t.S2, 0).
		Width(w).MaxHeight(maxH).Padding(6).Radius(t.RadiusMD).Background(t.Surface).Border(1, t.Line).
		Shadow(0, t.Floating.Y, t.Floating.Blur, 0, t.Floating.Color).ZIndex(50).Role(ui.RoleListBox).Label(label)
	panel.Children(func() {
		if nRows == 0 {
			ui.Row(c.Key("mp-state")).Gap(10).Padding(t.S3, 10).AlignItems(ui.Center).Children(func() {
				if waiting {
					word := a.L.T("mention.looking")
					if p.kind == '/' && mp.task {
						if h := a.S.Task(mp.where); h != nil && h.Harness() != "" {
							word = a.L.T("slash.reading", harnessName(h.Harness()))
						}
					}
					ui.Box(c.Key("breath")).Size(14, 14).Radius(4).Background(t.SurfaceSunken).Shrink(0)
					uiText(c, word).FontSize(t.SM).TextColor(t.InkMuted).Role(ui.RoleStatus)
					return
				}
				word := a.L.T("mention.hint")
				switch {
				case p.q != "" && p.kind == '@':
					word = a.L.T("mention.none", p.q)
				case p.q != "":
					word = a.L.T("slash.none", p.q)
				case p.kind == '/':
					word = a.L.T("slash.none.bare")
				}
				uiText(c, word).FontSize(t.SM).TextColor(t.InkMuted).Role(ui.RoleStatus)
			})
			return
		}
		n := -1
		for si, s := range secs {
			ui.Column(c.Key("mp-sec:"+s.key)).Children(func() {
				if si > 0 {
					ui.Box(c.Key("rule")).Height(1).Background(t.LineSoft).Margin(4, 0, 4, 0)
				}
				uiText(c.Key("mp-head"), a.sectionName(s.key, harness)).FontSize(t.XS).FontWeight(600).TextColor(t.InkMuted).Padding(6, 10, 3, 10).Role(ui.RoleHeading)
				for _, r := range s.rows {
					n++
					i := n
					if a.popRowView(c, fmt.Sprintf("mp-row:%d", i), r, i == p.sel, func() { p.sel = i }) {
						if out, ok := a.pickRow(p, mp, r, *draft); ok {
							*draft = out
						}
					}
				}
			})
		}
		ui.Box(c.Key("mp-keys-rule")).Height(1).Background(t.LineSoft).Margin(4, 0, 0, 0)
		ui.Row(c.Key("mp-keys")).Gap(t.S3).Padding(8, 10, 4, 10).AccessHidden(true).Children(func() {
			for _, kk := range [][2]string{{"↑ ↓", "mention.keys.walk"}, {"↩", "mention.keys.pick"}, {"esc", "mention.keys.close"}} {
				ui.Row(c.Key("k:"+kk[1])).Gap(4).AlignItems(ui.Center).Children(func() {
					uiText(c, kk[0]).Font(t.Mono).FontSize(11).TextColor(t.InkSoft).Padding(0, 4).Radius(5).Background(t.Sunken).SingleLine()
					uiText(c, a.L.T(kk[1])).FontSize(t.XS).TextColor(t.InkMuted).SingleLine()
				})
			}
		})
	})
}

// popRowView is one row of the list: its drawn glyph, its name, its quiet
// line. It reports a click; hovering moves the keys' row to it.
func (a *App) popRowView(c *ui.Context, key string, r popRow, on bool, hover func()) bool {
	t := a.T
	glyph, name, sub, ink, code := "", "", "", t.InkSoft, false
	if r.item != nil {
		glyph, name, sub = r.item.Kind, r.item.Label, r.item.Sub
		switch r.item.Attention {
		case "working", "queued":
			ink = t.Working.Ink
		case "needs_you", "blocked":
			ink = t.NeedsYou.Ink
		case "done", "merged":
			ink = t.Done.Ink
		case "failed", "closed":
			ink = t.Failed.Ink
		}
	} else {
		e := r.entry
		sub = a.slashAbout(*e)
		switch e.Group {
		case "native", "skills":
			glyph, code = e.Group, true
			name = strings.TrimSpace(e.Insert)
			if name == "" {
				name = "/" + e.Name
			}
		default:
			glyph, name = e.Name, a.slashWord(*e)
		}
	}
	row := ui.Row(c.Key(key)).Gap(10).MinHeight(36).Padding(6, 10).Radius(t.RadiusSM).AlignItems(ui.Center).Cursor(ui.CursorPointer).
		Role(ui.RoleOption).Selected(on).Label(spoken(a.L, name, sub))
	switch {
	case row.Pressed():
		row.Background(t.LineSoft)
	case on:
		row.Background(t.Sunken)
	}
	if on {
		row.ScrollIntoView()
	}
	row.Children(func() {
		a.glyph(c, 16, drawKind(glyph, ink))
		nm := uiText(c, name).FontSize(t.SM).FontWeight(650).TextColor(t.Ink).SingleLine().Shrink(0).MaxWidth(220)
		if code {
			nm.Font(t.Mono).FontSize(t.XS).FontWeight(600)
		}
		if sub != "" {
			uiText(c, sub).FontSize(t.XS).TextColor(t.InkMuted).SingleLine().Shrink(1).MinWidth(0)
		}
	})
	if row.Hovered() && !on && hover != nil {
		hover()
	}
	return row.Clicked()
}

// refChip is a reference in a sent message: its glyph and its name on the
// chip's tint, in the bubble's own ink. A task opens; a PR or issue its page.
func (a *App) refChip(c *ui.Context, key string, r protocol.Ref, ink ui.Color, size float32) {
	opens := (r.Kind == "task" && a.S.Task(r.ID) != nil) || ((r.Kind == "pr" || r.Kind == "issue") && strings.HasPrefix(r.ID, "https://"))
	chip := ui.Row(c.Key(key)).Gap(4).Padding(1, 7, 1, 5).Radius(999).AlignItems(ui.Center).Background(ink.Alpha(0.13)).Shrink(1).MinWidth(0)
	if opens {
		chip.Cursor(ui.CursorPointer).Role(ui.RoleButton).Label(r.Label)
		if chip.Hovered() {
			chip.Background(ink.Alpha(0.22))
		}
	}
	glyph := r.Kind
	if r.Kind == "action" {
		glyph = r.ID
	}
	chip.Children(func() {
		a.glyph(c, 13, drawKind(glyph, ink.Alpha(0.8)))
		uiText(c, r.Label).FontSize(size).FontWeight(650).TextColor(ink).SingleLine().Shrink(1).MinWidth(0)
	})
	if opens && chip.Clicked() {
		if r.Kind == "task" {
			a.OpenTask(r.ID)
		} else {
			a.openLink(r.ID)
		}
	}
}

// wordsWithRefs draws words with their references as chips, wrapping.
func (a *App) wordsWithRefs(c *ui.Context, key, text string, refs []protocol.Ref, ink ui.Color, size float32) bool {
	pieces := refPieces(text, refs)
	if len(refs) == 0 || len(pieces) == 0 {
		return false
	}
	ui.Row(c.Key(key)).Wrap().Gap(0).AlignItems(ui.Center).Shrink(1).MinWidth(0).Children(func() {
		for i, pc := range pieces {
			if pc.ref != nil {
				a.refChip(c, fmt.Sprintf("rc%d", i), *pc.ref, ink, size)
				continue
			}
			for j, w := range splitWords(pc.text) {
				uiText(c.Key(fmt.Sprintf("w%d-%d", i, j)), w).FontSize(size).TextColor(ink).LineHeight(1.5)
			}
		}
	})
	return true
}

// splitWords cuts text where a wrap may come (after spaces, between CJK
// characters), so the chips' row wraps like words.
func splitWords(s string) []string {
	var out []string
	var cur []rune
	for _, r := range s {
		cur = append(cur, r)
		if r == ' ' || r > 0x2e80 {
			// A space ending a piece is kept (a line's layout would drop it).
			if r == ' ' {
				cur[len(cur)-1] = ' '
			}
			out = append(out, string(cur))
			cur = nil
		}
	}
	if len(cur) > 0 {
		out = append(out, string(cur))
	}
	return out
}

// drawKind is a kind's drawn glyph (never an emoji), as the web's KindGlyph.
func drawKind(kind string, col ui.Color) func(p *ui.Painter, r ui.Rect) {
	return func(p *ui.Painter, r ui.Rect) {
		s := r.W / 16
		x := func(v float32) float32 { return r.X + v*s }
		y := func(v float32) float32 { return r.Y + v*s }
		w := 1.6 * s
		var path ui.Path
		line := func(pts ...float32) {
			path.MoveTo(x(pts[0]), y(pts[1]))
			for i := 2; i+1 < len(pts); i += 2 {
				path.LineTo(x(pts[i]), y(pts[i+1]))
			}
		}
		circle := func(cx, cy, rr float32) { p.Stroke(ui.Rect{X: x(cx - rr), Y: y(cy - rr), W: 2 * rr * s, H: 2 * rr * s}, col, rr*s, w) }
		rect := func(x0, y0, ww, hh, rad float32) {
			p.Stroke(ui.Rect{X: x(x0), Y: y(y0), W: ww * s, H: hh * s}, col, rad*s, w)
		}
		switch kind {
		case "task":
			rect(2.5, 3.5, 11, 9, 3)
			line(5.5, 8, 10.5, 8)
		case "keep":
			line(1.8, 8, 4.5, 4.8, 8, 3.8, 11.5, 4.8, 14.2, 8, 11.5, 11.2, 8, 12.2, 4.5, 11.2, 1.8, 8)
			circle(8, 8, 1.7)
		case "partner":
			circle(8, 8, 5.8)
			line(5.8, 9.4, 8, 10.6, 10.2, 9.4)
			line(6, 6.4, 6, 6.6)
			line(10, 6.4, 10, 6.6)
		case "file":
			line(4, 2.5, 9, 2.5, 12, 5.5, 12, 13.5, 4, 13.5, 4, 2.5)
			line(9, 2.5, 9, 5.5, 12, 5.5)
		case "pr", "fork":
			circle(4.5, 3.8, 1.5)
			circle(4.5, 12.2, 1.5)
			circle(11.5, 12.2, 1.5)
			line(4.5, 5.3, 4.5, 10.7)
			line(11.5, 10.7, 11.5, 7.5, 10.5, 5.8, 7.5, 5.3)
		case "issue":
			circle(8, 8, 5.8)
			p.Fill(ui.Rect{X: x(6.7), Y: y(6.7), W: 2.6 * s, H: 2.6 * s}, col, 1.3*s)
		case "skill", "skills":
			line(8, 2.2, 9.2, 6.8, 12.8, 8, 9.2, 9.2, 8, 13.8, 6.8, 9.2, 3.2, 8, 6.8, 6.8, 8, 2.2)
		case "native":
			rect(2.2, 2.2, 11.6, 11.6, 3)
			line(9.6, 5, 6.4, 11)
		case "new":
			rect(2.5, 2.5, 11, 11, 3.5)
			line(8, 5.5, 8, 10.5)
			line(5.5, 8, 10.5, 8)
		case "remind":
			line(4.2, 11, 4.2, 7.6, 5.3, 4.9, 8, 3.8, 10.7, 4.9, 11.8, 7.6, 11.8, 11, 12.8, 12.2, 3.2, 12.2, 4.2, 11)
			line(6.8, 13.6, 8, 14.2, 9.2, 13.6)
		case "handover":
			rect(2, 4, 8, 9, 2)
			line(8, 2.8, 12.2, 2.8, 14, 4.6, 14, 10)
		case "find":
			circle(7, 7, 4.3)
			line(10.2, 10.2, 13.6, 13.6)
		case "pause":
			rect(4.3, 3.5, 2.4, 9, 1)
			rect(9.3, 3.5, 2.4, 9, 1)
		case "switch":
			line(3, 5.5, 12.5, 5.5)
			line(10, 3, 12.5, 5.5, 10, 8)
			line(13, 10.5, 3.5, 10.5)
			line(6, 8, 3.5, 10.5, 6, 13)
		default:
			line(9, 2, 4, 9, 8, 9, 7, 14, 12, 7, 8, 7, 9, 2)
		}
		p.StrokePath(&path, w, col)
	}
}

// heldRefs are the references a message carries, as the app draws them.
func heldRefs(h []protocol.HeldRef) []protocol.Ref {
	out := make([]protocol.Ref, 0, len(h))
	for _, r := range h {
		out = append(out, r.Ref)
	}
	return out
}

// closePops closes an open @ or / list (Esc), keeping it shut until its
// trigger changes; true when one was open.
func (a *App) closePops() bool {
	if a.mnState == nil {
		return false
	}
	closed := false
	for _, p := range a.mnState.pops {
		if p.kind != 0 {
			p.shut = fmt.Sprintf("%c%d", p.kind, p.start)
			p.kind = 0
			closed = true
		}
	}
	return closed
}
